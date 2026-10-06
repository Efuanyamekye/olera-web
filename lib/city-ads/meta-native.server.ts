import type { SupabaseClient } from "@supabase/supabase-js";
import { getCityConfig, RECIPIENT_LABEL } from "./config";
import { pingCareTeam } from "./care-team-ping.server";
import { ensureCareSeekerForCityLead } from "./care-seeker.server";
import { normalizeMetaLead, parseNativeForms, type NativeReceipt, type MetaLead } from "./meta-native";
import { cityQualifyingQuestion } from "./qualify";
import { resolvePrimaryCampaign } from "./primary.server";

/**
 * How many times a receipt is retried before it is left alone. Exported because
 * the admin panel has to agree with the drain loop about what "still waiting"
 * means: a receipt that has burned every attempt is not waiting, it is dead, and
 * counting it as waiting made the panel's staleness alarm cry wolf forever on a
 * dummy test lead from 15 September.
 */
export const MAX_RECEIPT_ATTEMPTS = 12;

/** Existing city clock drains a durable inbox. Leases recover interrupted runs. */
export async function runMetaNativeIntake(db: SupabaseClient) {
  const forms = parseNativeForms(process.env.META_LEADS_FORMS_JSON);
  if (!forms.length) return { processed: 0, failed: 0, configured: false };
  const token = process.env.META_LEADS_PAGE_ACCESS_TOKEN;
  const version = process.env.META_LEADS_GRAPH_VERSION;
  if (!token || !version || !/^v\d+\.0$/.test(version)) throw new Error("Meta lead retrieval is not configured");
  const stale = new Date(Date.now() - 10 * 60000).toISOString();
  // Recover the final attempt too: it must become retryable, not stay processing forever.
  const { error: recoveryError } = await db.from("meta_lead_receipts")
    .update({ status: "failed", last_error: "Import interrupted. Retry delivery after checking configuration." })
    .eq("status", "processing").lt("last_attempt_at", stale);
  if (recoveryError) throw new Error("Could not recover Meta receipts");
  const { data: pending, error } = await db.from("meta_lead_receipts").select("*")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_RECEIPT_ATTEMPTS).order("received_at").limit(10);
  if (error) throw new Error("Could not read Meta inbox");
  let processed = 0, failed = 0;
  const deadline = Date.now() + 25_000;
  for (const receipt of pending ?? []) {
    if (Date.now() >= deadline) break;
    const { data: claim, error: claimError } = await db.from("meta_lead_receipts")
      .update({ status: "processing", attempts: receipt.attempts + 1, last_attempt_at: new Date().toISOString() })
      .eq("leadgen_id", receipt.leadgen_id).eq("attempts", receipt.attempts).eq("status", receipt.status)
      .select("leadgen_id").maybeSingle();
    if (claimError) throw new Error("Could not claim Meta receipt");
    if (!claim) continue;
    try {
      const enabled = forms.some(f => f.formId === receipt.form_id && f.pageId === receipt.page_id);
      const form = parseNativeForms(JSON.stringify([receipt.form_config]))[0];
      const cfg = form && getCityConfig(form.slug);
      // The published form promises a conversation before any introduction.
      if (!enabled || !form || !cfg || cfg.routingMode !== "concierge") throw new Error("Form needs concierge configuration");
      const url = new URL(`https://graph.facebook.com/${version}/${receipt.leadgen_id}`);
      url.searchParams.set("fields", "id,created_time,form_id,campaign_id,adset_id,ad_id,field_data");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        // Meta's own error text names the cause (expired token, missing lead
        // access, unknown lead). It never echoes the token.
        const body = await response.json().catch(() => null) as { error?: { message?: string; code?: number } } | null;
        throw new Error(`Meta retrieval failed (${response.status}${body?.error?.code ? `, code ${body.error.code}` : ""}): ${body?.error?.message ?? "no error body"}`);
      }
      const lead = await response.json() as MetaLead;
      const normalized = normalizeMetaLead(lead, receipt as NativeReceipt, form);
      const name = normalized.first_name.split(/\s+/)[0];
      // One question, and it is "who" rather than "when". The form gives us a
      // name, a phone and a ZIP and nothing about the care, so anything we ask
      // adds something — but a now-or-later question returns one word, where
      // "who is this for" returns a sentence that usually carries the timing
      // anyway ("my mom, she had a fall last week"). Timing is asked second,
      // by hand, and only of someone who has already replied.
      // "Olera:" as a label, not "this is Olera" as an introduction. A company
      // saying "this is X" reads as a person who is not one, and every other
      // family message in this system already uses the prefix — cityFamilyCheckSms
      // is "Olera: Hi {name}, did …". This one was written separately and drifted.
      // Deliberately not signed with a person's name either: the benefits
      // navigator already forbids switching a family text thread to an
      // individual, and that holds here for the same reason.
      // The question clause comes from the shared builder so the two front
      // doors cannot drift apart. A native lead has no care_recipient by
      // construction, so this is the "who is this for" branch, unchanged.
      // A form that already asked who the care is for gets the next question
      // instead (see qualify.ts). A form that belongs to a provider's own ad
      // names her: that form told the family she would be in touch, and a
      // text promising to "point you to the right provider" contradicts it.
      // A job seeker filed by the form is never texted (the import skips it).
      const primary = await resolvePrimaryCampaign(db, {
        id: receipt.leadgen_id, slug: normalized.slug, meta_campaign_id: normalized.meta_campaign_id });
      const question = cityQualifyingQuestion(normalized.care_recipient);
      const care = cfg.careNoun ?? "home care";
      const confirmation = primary?.providerName
        ? `Olera: Hi ${name}, we have your request for ${care} in ${cfg.city} and have passed it to ${primary.providerName}, who will be in touch. So they know how to help, ${question} Reply in a few words. Reply STOP to opt out.`
        : `Olera: Hi ${name}, we have your request for ${care} in ${cfg.city}. So we can point you to the right provider, ${question} Reply in a few words and we'll take it from there. Reply STOP to opt out.`;
      const { data: leadId, error: insertError } = await db.rpc("import_meta_city_lead", {
        receipt_id: receipt.leadgen_id, lead_data: normalized, confirmation,
      });
      if (insertError) throw new Error(`Could not save Meta lead: ${insertError.message}`);
      processed++;
      // Only a lead THIS receipt created, still open, and real. The import also
      // returns an existing id for a duplicate, and files job seekers and
      // opt-outs as archived; none of those is a family to ring.
      if (typeof leadId === "string") {
        const { data: row } = await db.from("city_leads")
          .select("meta_lead_id, archived_at, is_test, created_at, care_recipient").eq("id", leadId).maybeSingle();
        if (row && row.meta_lead_id === receipt.leadgen_id && !row.archived_at && !row.is_test) {
          const seeker = await ensureCareSeekerForCityLead(db, { firstName: normalized.first_name, phone: normalized.phone,
            email: normalized.email, city: cfg.city, state: cfg.state, careType: "unsure",
            careRecipient: row.care_recipient, urgency: null, note: null });
          if (seeker) await db.from("city_leads").update({ care_seeker_id: seeker }).eq("id", leadId).is("care_seeker_id", null);
          await pingCareTeam({
            city: cfg.city, timeZone: cfg.timeZone, firstName: name, phone: normalized.phone,
            need: row.care_recipient ? `${care} for ${RECIPIENT_LABEL[row.care_recipient as keyof typeof RECIPIENT_LABEL] ?? "a family member"}` : null,
            providerName: primary?.providerName ?? null,
            submittedAt: new Date(row.created_at), seekerId: seeker, source: "Meta form",
          });
        }
      }
    } catch (err) {
      failed++;
      // Record the real cause. The generic message this replaced hid which of
      // four steps failed, and on 25 Sep a test lead sat failed with nothing to
      // say whether it was config, Meta access, the lead's shape or the insert.
      // Every thrown message here is ours or Meta's; none carries contact data.
      const reason = err instanceof Error ? err.message : String(err);
      const { error: updateError } = await db.from("meta_lead_receipts").update({ status: "failed",
        last_error: `Import failed: ${reason}`.slice(0, 500) })
        .eq("leadgen_id", receipt.leadgen_id).eq("status", "processing");
      if (updateError) throw new Error("Could not record Meta import failure");
    }
  }
  // Profile linking is independently recoverable after the transactional import.
  const { data: unlinked, error: linkError } = await db.from("city_leads").select("*")
    .eq("capture_method", "meta_instant_form").eq("is_test", false).is("care_seeker_id", null)
    .is("archived_at", null).limit(20);
  if (linkError) throw new Error("Could not read unlinked Meta leads");
  for (const lead of unlinked ?? []) {
    if (Date.now() >= deadline) break;
    const cfg = getCityConfig(lead.slug);
    if (!cfg) continue;
    const seeker = await ensureCareSeekerForCityLead(db, { firstName: lead.first_name, phone: lead.phone,
      email: lead.email, city: cfg.city, state: cfg.state, careType: lead.care_type,
      careRecipient: lead.care_recipient, urgency: lead.urgency, note: lead.note });
    if (seeker) {
      const { error: e } = await db.from("city_leads").update({ care_seeker_id: seeker }).eq("id", lead.id).is("care_seeker_id", null);
      if (e) throw new Error("Could not link Meta care seeker");
    }
  }
  return { processed, failed, configured: true };
}

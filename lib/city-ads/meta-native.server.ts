import type { SupabaseClient } from "@supabase/supabase-js";
import { getCityConfig } from "./config";
import { ensureCareSeekerForCityLead } from "./care-seeker.server";
import { normalizeMetaLead, parseNativeForms, type NativeReceipt, type MetaLead } from "./meta-native";

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
    .lt("attempts", 12).order("received_at").limit(10);
  if (error) throw new Error("Could not read Meta inbox");
  let processed = 0, failed = 0;
  for (const receipt of pending ?? []) {
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
      if (!response.ok) throw new Error("Meta retrieval failed");
      const lead = await response.json() as MetaLead;
      const normalized = normalizeMetaLead(lead, receipt as NativeReceipt, form);
      const name = normalized.first_name.split(/\s+/)[0];
      const confirmation = `Hi ${name}, this is Olera. We received your request on Facebook or Instagram about home care in ${cfg.city}. Our team will contact you to learn what you need and discuss local options. No need to fill out another form. Reply STOP to opt out.`;
      const { error: insertError } = await db.rpc("import_meta_city_lead", {
        receipt_id: receipt.leadgen_id, lead_data: normalized, confirmation,
      });
      if (insertError) throw new Error("Could not save Meta lead");
      processed++;
    } catch {
      failed++;
      const { error: updateError } = await db.from("meta_lead_receipts").update({ status: "failed",
        last_error: "Import failed. Check form configuration, Meta access and database; retry from the admin panel." })
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

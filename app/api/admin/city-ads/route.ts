import { NextRequest, NextResponse } from "next/server";
import { buildChannelRollup, type RollupCampaign, type RollupLead } from "@/lib/city-ads/channel-rollup";
import { buildArmRollup, type ArmEvent, type ArmLead } from "@/lib/city-ads/arm-rollup";

/**
 * When the three landing arms went live. Everything before it saw a different
 * page and is excluded from the arm rollup.
 *
 * Set this to the deploy timestamp the moment the arms reach production. Null
 * means "count everything", which is correct only while nothing has shipped —
 * the arm metadata does not exist on earlier events, so they contribute nothing
 * either way.
 */
const ARM_WINDOW_START: string | null = null;
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { acceptOffer, declineOffer, startOrAdvance, type CityOfferRow } from "@/lib/city-ads/offers.server";
import { resolvePrimaryCampaign, handToPrimary } from "@/lib/city-ads/primary.server";
import { moveToProvider } from "@/lib/city-ads/move.server";
import { getThreadLead, notifyProviderOfHandover } from "@/lib/city-ads/thread.server";
import { suppressPhone } from "@/lib/sms/inbound-store.server";
import { cityLeadBlocked, citySendWindow, deliverCityMessage } from "@/lib/city-ads/messages.server";

/**
 * /api/admin/city-ads — the tracker behind /admin/city-ads.
 *
 * GET  everything the page needs in one call: campaigns (one row per city x
 *      channel x flight), the pools with provider names and phones, and the
 *      last 200 leads with their offers.
 * POST one action per call:
 *      update_campaign, pool_toggle, pool_update, pool_add,
 *      offer_next, offer_to, accept, decline, set_status, note, text_family
 *
 * Auth: admin only. GET works from a browser (feedback_admin_endpoints_get).
 */

const LEAD_STATUSES = new Set(["new", "offered", "accepted", "contacted", "client", "no_fit", "unreachable", "unfilled", "redirected", "stopped"]);
const DECLINE_REASONS = new Set(["capacity", "area", "payment", "medical", "other"]);

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = await getAdminUser(user.id);
  if (!admin) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const db = getServiceClient();

  const [{ data: campaigns }, { data: pool }, { data: leads }, { data: lastRun }] = await Promise.all([
    db.from("city_campaigns").select("*").order("slug").order("channel"),
    db.from("city_pool").select("*").order("slug").order("position"),
    db.from("city_leads").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("cron_runs").select("started_at, status").eq("job_id", "city-lead-offers").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const leadIds = (leads ?? []).map((l) => l.id as string);
  const { data: offers } = leadIds.length
    ? await db.from("city_lead_offers").select("*").in("lead_id", leadIds).order("position")
    : { data: [] as Record<string, unknown>[] };

  const { data: messages, error: messagesError } = leadIds.length
    ? await db.from("city_lead_messages").select("*").in("lead_id", leadIds).order("created_at", {ascending:false})
    : {data: [], error: null};
  if (messagesError) return NextResponse.json({error: messagesError.message}, {status:500});

  // Every text this family has had from us, automated or hand-sent. Without it
  // the concierge caller is composing blind: the chain sends confirmations and
  // status texts on its own, so "what have they already been told" is not
  // something the admin can infer from the lead row.
  const leadPhones = Array.from(new Set((leads ?? []).map((l) => l.phone as string).filter(Boolean)));
  const { data: texts } = leadPhones.length
    ? await db
        .from("email_log")
        .select("id, created_at, recipient, email_type, status, html_body")
        .eq("channel", "sms")
        .in("recipient", leadPhones)
        .order("created_at")
    : { data: [] as Record<string, unknown>[] };

  // THEIR SIDE OF THE CONVERSATION. Until now this page queried only what we
  // SENT: `texts` above reads email_log, which is outbound. The one place a
  // family's own words appeared was city_leads.qualification_reply, and that
  // column keeps only the FIRST reply by design.
  //
  // Bessie Brooks texted three times in ninety seconds and the second message
  // named her area. The offer relay shows providers all of it, because
  // getLeadExchange reads this table. The support team, looking at the same
  // lead, saw one line. The people deciding what to do next had less of the
  // conversation than the provider being asked to take it.
  const { data: inbound } = leadPhones.length
    ? await db
        .from("sms_inbound")
        .select("id, created_at, body, phone_last10")
        .in("phone_last10", leadPhones.map((p) => p.replace(/\D/g, "").slice(-10)))
        .order("created_at")
    : { data: [] as Record<string, unknown>[] };

  // Counted separately from the 200-row lead list above. The rollup is the
  // number that decides which platform we keep, so it must count every lead
  // ever, not the most recent page of them — a truncated denominator would
  // quietly understate whichever channel ran earliest.
  const { data: rollupLeads } = await db
    .from("city_leads")
    .select("slug, utm_source, utm_medium, gclid, fbclid, is_test, created_at, landing_arm, capture_method");

  const providerIds = Array.from(
    new Set([...(pool ?? []).map((p) => p.provider_id as string), ...(offers ?? []).map((o) => o.provider_id as string)]),
  );
  const { data: providers } = providerIds.length
    ? await db.from("business_profiles").select("id, display_name, city, state, phone, email, category, verification_state").in("id", providerIds)
    : { data: [] as Record<string, unknown>[] };
  const byId = new Map((providers ?? []).map((p) => [p.id as string, p]));

  // The arm funnel. Read from growth events rather than from the lead table
  // because two of its three numbers — landings and engagement — exist only as
  // events; the third comes from city_leads.landing_arm, which is why that
  // column exists.
  //
  // BOUNDED BY THE WINDOW, NOT JUST BY A ROW CAP. Ordered ascending with a cap,
  // the rows dropped on overflow would be the NEWEST ones — the table would
  // quietly stop moving while looking fine. Filtering on the window keeps the
  // set small enough that the cap never binds, and descending order means that
  // if it ever did, it sheds the oldest instead.
  let armQuery = db
    .from("growth_attribution_events")
    .select("event_type, anonymous_id, visit_id, occurred_at, metadata")
    .eq("page_category", "city_landing")
    .in("event_type", ["page_landed", "cta_engaged", "provider_expanded"]);
  if (ARM_WINDOW_START) armQuery = armQuery.gte("occurred_at", ARM_WINDOW_START);
  const { data: armEvents } = await armQuery
    .order("occurred_at", { ascending: false })
    .limit(20000);

  return NextResponse.json({
    lastClockRun: lastRun?.started_at ?? null,
    campaigns: campaigns ?? [],
    armRollup: buildArmRollup(
      (armEvents ?? []) as unknown as ArmEvent[],
      (rollupLeads ?? []) as unknown as ArmLead[],
      ARM_WINDOW_START,
    ),
    channelRollup: buildChannelRollup(
      (campaigns ?? []) as unknown as RollupCampaign[],
      (rollupLeads ?? []) as unknown as RollupLead[],
    ),
    pool: (pool ?? []).map((p) => ({ ...p, provider: byId.get(p.provider_id as string) ?? null })),
    leads: (leads ?? []).map((l) => ({
      ...l,
      messages: (messages ?? []).filter(m => m.lead_id === l.id),
      offers: (offers ?? [])
        .filter((o) => o.lead_id === l.id)
        .map((o) => ({ ...o, provider: byId.get(o.provider_id as string) ?? null })),
      texts: (texts ?? []).filter((t) => t.recipient === l.phone),
      // Matched on the last ten digits, the same key sms_inbound is indexed on,
      // because the stored formats differ between the two tables.
      inbound: (inbound ?? []).filter((m) => m.phone_last10 === String(l.phone ?? "").replace(/\D/g, "").slice(-10)),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const db = getServiceClient();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const now = new Date().toISOString();

  try {
    switch (action) {
      case "archive_lead": {
        const reason = String(body.reason ?? "");
        if (!["opted_out", "no_longer_needed", "looking_for_work", "recruiter", "media", "solicitation", "competitor", "wrong_number", "spam", "duplicate", "other"].includes(reason)) return NextResponse.json({error:"Choose an archive reason"},{status:400});
        if(reason === "opted_out") {
          const {data:lead,error} = await db.from("city_leads").select("phone").eq("id",String(body.leadId ?? "")).single();
          if(error) throw error;
          if(!await suppressPhone(lead.phone, `City lead opt-out recorded by ${auth.user.email ?? auth.user.id}`)) throw new Error("Could not record opt-out; try again");
        }
        const {data, error} = await db.from("city_leads").update({archived_at:now,archive_reason:reason,archived_by:auth.user.email ?? auth.user.id,updated_at:now}).eq("id",String(body.leadId ?? "")).select("id").single();
        if(error) throw error;
        return NextResponse.json({ok:true,id:data.id,message:"Lead archived. Pending messages and offers canceled."});
      }
      case "cancel_message": {
        const {data,error} = await db.from("city_lead_messages").update({status:"canceled",completed_at:now,last_error:"Canceled by admin"}).eq("id",String(body.messageId ?? "")).eq("lead_id",String(body.leadId ?? "")).eq("status","pending").select("id").maybeSingle();
        if(error) throw error;
        if(!data) return NextResponse.json({error:"Message is no longer pending. Refresh to check its status."},{status:409});
        return NextResponse.json({ok:true,message:"Scheduled message canceled"});
      }
      case "update_campaign": {
        const id = String(body.id ?? "");
        const f = (body.fields ?? {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = { updated_at: now };
        for (const k of ["status", "platform_campaign_id", "admin_note", "flight_start", "flight_end"]) {
          if (k in f) patch[k] = f[k] === "" ? null : f[k];
        }
        for (const k of ["budget_cents", "max_cpc_cents", "ad_spend_cents", "ad_clicks", "ad_impressions"]) {
          if (k in f) {
            const n = f[k] === "" || f[k] === null ? null : Number(f[k]);
            if (n !== null && (!Number.isFinite(n) || n < 0)) return NextResponse.json({ error: `${k} must be a non-negative number` }, { status: 400 });
            patch[k] = n;
          }
        }
        if (["ad_spend_cents", "ad_clicks", "ad_impressions"].some((k) => k in f)) patch.metrics_updated_at = now;
        if ("status" in patch && !["draft", "scheduled", "live", "ended"].includes(String(patch.status))) {
          return NextResponse.json({ error: "Bad status" }, { status: 400 });
        }
        const { error } = await db.from("city_campaigns").update(patch).eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "pool_toggle": {
        const { error } = await db.from("city_pool").update({ enabled: Boolean(body.enabled) }).eq("id", String(body.poolId ?? ""));
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "pool_update": {
        const f = (body.fields ?? {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if ("position" in f) patch.position = Number(f.position) || 100;
        if ("phone_override" in f) {
          const raw = f.phone_override ? String(f.phone_override) : "";
          const digits = raw.replace(/\D/g, "").slice(-10);
          const ours = (process.env.TWILIO_FROM_NUMBER ?? "").replace(/\D/g, "").slice(-10);
          if (digits && ours && digits === ours) {
            return NextResponse.json({ error: "That is Olera's own texting number. Offers sent to it would go nowhere. Use a mobile you hold." }, { status: 400 });
          }
          patch.phone_override = raw || null;
        }
        if ("notes" in f) patch.notes = f.notes ? String(f.notes) : null;
        if (Array.isArray(f.care_types)) patch.care_types = (f.care_types as unknown[]).map(String).filter((c) => ["home_care", "assisted_living"].includes(c));
        const { error } = await db.from("city_pool").update(patch).eq("id", String(body.poolId ?? ""));
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "pool_add": {
        const slug = String(body.slug ?? "");
        const providerId = String(body.providerId ?? "");
        const careTypes = Array.isArray(body.careTypes) ? (body.careTypes as unknown[]).map(String) : ["home_care"];
        if (!slug || !providerId) return NextResponse.json({ error: "slug and providerId required" }, { status: 400 });
        const { error } = await db.from("city_pool").insert({ slug, provider_id: providerId, care_types: careTypes, position: Number(body.position) || 100 });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      /**
       * What a caller learned on the phone. This is the way back into the
       * relay for a lead the qualifying text never reached: it fills the same
       * field the family's own reply would have filled, so the chain starts on
       * the next call rather than on the next cron tick.
       *
       * Deliberately overwrites an existing answer. A person who has just
       * spoken to the family knows more than a two-word text did.
       */
      case "qualify": {
        const leadId = String(body.leadId ?? "");
        const reply = String(body.reply ?? "").trim();
        if (!reply) return NextResponse.json({ error: "Type what they told you" }, { status: 400 });
        if (await cityLeadBlocked(db, leadId)) return NextResponse.json({ error: "Lead is archived or opted out" }, { status: 409 });
        // A PERSON WHO SPOKE TO THE FAMILY OUTRANKS THE CLASSIFIER.
        //
        // This box is "what they told you on the phone", so reaching it means
        // someone has already done, better, the job the model does from a text.
        // Without a verdict written here the relay's gate would see an answered
        // lead with no judgement and hold it, the admin would read "Saved." and
        // reasonably assume it had gone out, and the lead would then wait for a
        // model to second-guess a human who had them on the line.
        //
        // If what they learned was that this is NOT a family, the Archive
        // button is the control for that, not this one.
        const { error } = await db
          .from("city_leads")
          .update({
            qualification_reply: reply.slice(0, 2000),
            qualification_reply_at: now,
            qualification_verdict: "care_seeker",
            qualification_verdict_category: "care_seeker",
            qualification_verdict_reason: `Recorded by ${auth.user.email ?? auth.user.id} from a conversation with the family.`,
            qualification_verdict_at: now,
            updated_at: now,
          })
          .eq("id", leadId);
        if (error) throw error;
        const r = await startOrAdvance(db, leadId);
        return NextResponse.json({
          ok: true,
          result: r,
          message:
            r.action === "offered"
              ? `Saved. Offered to ${r.providerName ?? "the next provider"}.`
              : r.action === "parked"
                ? "Saved. It will be offered when their morning opens."
                : r.action === "unfilled"
                  ? "Saved, but nobody is on call for this city yet."
                  : r.action === "held"
                    ? "Saved. Nothing has gone to a provider; open the lead to see why."
                    : "Saved.",
        });
      }
      case "unarchive_lead": {
        // The classifier files wrong-audience leads on its own now, and the
        // whole justification for letting it do that is that a mistake is
        // cheap to undo. Until this existed it was not: archived leads render
        // with every action stripped, so a family filed by accident was filed
        // for good, and the Slack alert telling someone to undo it pointed at
        // a page with no way to.
        //
        // Clearing the verdict alone would be a loop: the classify pass would
        // pick the lead straight back up and file it again on the next tick.
        // So un-archiving is recorded as a person overruling the model, which
        // is what it is.
        const leadId = String(body.leadId ?? "");
        // TWO STEPS, ARCHIVE FIRST. Until migration 255 the archive guard
        // trigger copied archived_at back on every update, so no lead could
        // reopen and this "succeeded" having changed nothing. It now allows an
        // explicit reopen (status goes back to new) and refuses one for an
        // opt-out. Clearing the archive on its own first, and recording the
        // overrule only once it actually cleared, means a refused reopen
        // writes nothing at all.
        const { data, error } = await db
          .from("city_leads")
          .update({ archived_at: null, archive_reason: null, archived_by: null, updated_at: now })
          .eq("id", leadId)
          .not("archived_at", "is", null)
          .select("id, first_name, archived_at")
          .maybeSingle();
        if (error) {
          // The trigger's refusal for an opt-out, said as a sentence rather
          // than a 500.
          if (/opted out/i.test(error.message)) {
            return NextResponse.json({ error: "They asked us to stop contacting them, so this lead cannot be reopened." }, { status: 409 });
          }
          throw error;
        }
        if (!data) return NextResponse.json({ error: "That lead is not archived" }, { status: 409 });
        // This route used to answer "back in the queue" here regardless.
        if (data.archived_at) {
          return NextResponse.json(
            { error: `${data.first_name} is still archived. The database does not allow reopening an archived lead yet, so nothing changed.` },
            { status: 409 },
          );
        }
        const { error: verdictError } = await db
          .from("city_leads")
          .update({
            qualification_verdict: "care_seeker",
            qualification_verdict_category: "care_seeker",
            qualification_verdict_reason: `Un-archived by ${auth.user.email ?? auth.user.id}, overruling an automatic filing.`,
            qualification_verdict_at: now,
            updated_at: now,
          })
          .eq("id", leadId);
        if (verdictError) throw verdictError;
        return NextResponse.json({ ok: true, id: data.id, message: `${data.first_name} is back in the queue and will be offered to a provider.` });
      }
      case "offer_next": {
        const r = await startOrAdvance(db, String(body.leadId ?? ""), { force: true });
        return NextResponse.json({ ok: true, result: r });
      }
      case "hand_to_primary": {
        // Put a lead on the campaign page of the provider whose ad it came
        // from, now, without waiting for the reply or the hour.
        const { data: lead } = await db
          .from("city_leads")
          .select("id, slug, first_name, capture_method, meta_campaign_id, archived_at, handed_at")
          .eq("id", String(body.leadId ?? ""))
          .maybeSingle();
        if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        if (lead.archived_at) return NextResponse.json({ error: `${lead.first_name} is archived. Put them back first.` }, { status: 409 });
        if (lead.handed_at) return NextResponse.json({ error: `${lead.first_name} is already on the provider's campaign page.` }, { status: 409 });
        if (await cityLeadBlocked(db, lead.id)) {
          return NextResponse.json({ error: `${lead.first_name} asked us to stop contacting them, so they can't be handed to a provider.` }, { status: 409 });
        }
        const primary = await resolvePrimaryCampaign(db, lead);
        if (!primary) {
          return NextResponse.json(
            { error: "This lead's ad isn't linked to a provider campaign, so there is nobody to hand it to. Use Offer to… instead." },
            { status: 409 },
          );
        }
        const handed = await handToPrimary(db, lead, primary, "admin");
        if (!handed) return NextResponse.json({ error: "Nothing changed. It may have been handed over a moment ago." }, { status: 409 });
        try {
          const tl = await getThreadLead(db, lead.id);
          if (tl) await notifyProviderOfHandover(db, tl);
        } catch (e) {
          console.error("[admin/city-ads] handover notice failed", e);
        }
        return NextResponse.json({ ok: true, message: `${lead.first_name} is now on ${primary.providerName ?? "the provider"}'s campaign page.` });
      }
      case "move_to": {
        const r = await moveToProvider(db, String(body.leadId ?? ""), String(body.providerId ?? ""), auth.user.email ?? auth.user.id);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        return NextResponse.json({ ok: true, offered: r.offered, message: r.message });
      }
      case "offer_to": {
        const r = await startOrAdvance(db, String(body.leadId ?? ""), { force: true, providerId: String(body.providerId ?? "") });
        return NextResponse.json({ ok: true, result: r });
      }
      case "accept":
      case "decline": {
        const { data: offer } = await db.from("city_lead_offers").select("*").eq("id", String(body.offerId ?? "")).maybeSingle();
        if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
        if (action === "accept") {
          const r = await acceptOffer(db, offer as CityOfferRow, "admin");
          return NextResponse.json({ ok: true, won: r.won });
        }
        const reason = body.reason && DECLINE_REASONS.has(String(body.reason)) ? String(body.reason) : null;
        await declineOffer(db, offer as CityOfferRow, reason);
        return NextResponse.json({ ok: true });
      }
      case "set_status": {
        const leadId = String(body.leadId ?? "");
        const status = String(body.status ?? "");
        if (!LEAD_STATUSES.has(status)) return NextResponse.json({ error: "Bad status" }, { status: 400 });
        if (await cityLeadBlocked(db, leadId)) return NextResponse.json({error:"Lead is archived or opted out"},{status:409});
        const patch: Record<string, unknown> = { status, updated_at: now };
        if(status === "stopped") Object.assign(patch,{archived_at:now,archive_reason:"no_longer_needed",archived_by:auth.user.email ?? auth.user.id});
        if (status === "contacted") patch.reached_at = now;
        if (status === "client" || status === "no_fit") {
          patch.outcome = status === "client" ? "client" : "no";
          patch.outcome_at = now;
          patch.outcome_source = "admin";
        }
        const { error } = await db.from("city_leads").update(patch).eq("id", leadId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "note": {
        const { error } = await db
          .from("city_leads")
          .update({ admin_note: body.note ? String(body.note).slice(0, 2000) : null, updated_at: now })
          .eq("id", String(body.leadId ?? ""));
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      // Both channels use the durable queue, including immediate sends.
      case "text_family":
      case "message_family": {
        const leadId = String(body.leadId ?? "");
        const message = String(body.message ?? "").trim();
        const channel = action === "text_family" ? "sms" : String(body.channel ?? "sms");
        const subject = String(body.subject ?? "").trim();
        if (!["sms","email"].includes(channel) || !message || message.length > (channel === "sms" ? 480 : 10000) || (channel === "email" && (!subject || subject.length > 200))) return NextResponse.json({error:"Check the message, channel, and email subject"},{status:400});
        const {data:lead,error} = await db.from("city_leads").select("id,slug,phone,email").eq("id",leadId).single();
        if(error) throw error;
        if(!lead[channel === "sms" ? "phone" : "email"]) return NextResponse.json({error:"No destination for this channel"},{status:400});
        if(await cityLeadBlocked(db,leadId)) return NextResponse.json({error:"Lead is archived or opted out"},{status:409});
        const scheduled = body.schedule === true;
        // Quiet hours are for texts, which buzz a phone. An email waits in
        // their inbox, so it goes now at any hour; it used to be refused
        // outside 8am-8pm, and threw for a lead with no city time zone.
        const window = channel === "sms" || scheduled ? citySendWindow(lead.slug) : { allowed: true, nextStart: now };
        if(!scheduled && !window.allowed) return NextResponse.json({error:"Outside their local sending hours. Schedule for the morning."},{status:409});
        const {data:queued,error:queueError} = await db.from("city_lead_messages").insert({lead_id:leadId,channel,subject:channel === "email" ? subject : null,body:message,send_after:scheduled ? window.nextStart : now,created_by:auth.user.email ?? auth.user.id}).select("id").single();
        if(queueError) return NextResponse.json({error:queueError.code === "23505" ? "A message is already queued or sending on this channel" : queueError.message},{status:409});
        if(!scheduled) await deliverCityMessage(db,queued.id);
        const {data:result,error:resultError} = await db.from("city_lead_messages").select("status,last_error").eq("id",queued.id).single();
        if(resultError) throw resultError;
        if(["failed","canceled"].includes(result.status)) return NextResponse.json({error:result.last_error ?? "Not sent"},{status:409});
        return NextResponse.json({ok:true,message:result.status === "sent" ? "Message sent" : result.status === "sending" ? "Delivery is being checked. Do not resend." : "Message scheduled"});
      }
      default:
        return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[admin/city-ads]", action, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

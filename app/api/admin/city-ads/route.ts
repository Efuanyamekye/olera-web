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
        if (!["opted_out", "no_longer_needed", "duplicate", "other"].includes(reason)) return NextResponse.json({error:"Choose an archive reason"},{status:400});
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
      case "offer_next": {
        const r = await startOrAdvance(db, String(body.leadId ?? ""), { force: true });
        return NextResponse.json({ ok: true, result: r });
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
        const window = citySendWindow(lead.slug);
        const scheduled = body.schedule === true;
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

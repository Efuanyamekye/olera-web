import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { acceptOffer, declineOffer, startOrAdvance, type CityOfferRow } from "@/lib/city-ads/offers.server";

/**
 * /api/admin/city-ads — the tracker behind /admin/city-ads.
 *
 * GET  everything the page needs in one call: campaigns (one row per city x
 *      channel x flight), the pools with provider names and phones, and the
 *      last 200 leads with their offers.
 * POST one action per call:
 *      update_campaign, pool_toggle, pool_update, pool_add,
 *      offer_next, offer_to, accept, decline, set_status, note
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

  const providerIds = Array.from(
    new Set([...(pool ?? []).map((p) => p.provider_id as string), ...(offers ?? []).map((o) => o.provider_id as string)]),
  );
  const { data: providers } = providerIds.length
    ? await db.from("business_profiles").select("id, display_name, city, state, phone, email, category, verification_state").in("id", providerIds)
    : { data: [] as Record<string, unknown>[] };
  const byId = new Map((providers ?? []).map((p) => [p.id as string, p]));

  return NextResponse.json({
    lastClockRun: lastRun?.started_at ?? null,
    campaigns: campaigns ?? [],
    pool: (pool ?? []).map((p) => ({ ...p, provider: byId.get(p.provider_id as string) ?? null })),
    leads: (leads ?? []).map((l) => ({
      ...l,
      offers: (offers ?? [])
        .filter((o) => o.lead_id === l.id)
        .map((o) => ({ ...o, provider: byId.get(o.provider_id as string) ?? null })),
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
        const patch: Record<string, unknown> = { status, updated_at: now };
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
      default:
        return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[admin/city-ads]", action, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

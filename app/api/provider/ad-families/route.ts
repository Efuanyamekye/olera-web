import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { postProviderMessage } from "@/lib/city-ads/thread.server";
import { acceptOffer, declineOffer, type CityOfferRow } from "@/lib/city-ads/offers.server";
import { adFamilyForWrite, getAdFamily, listAdFamilies } from "@/lib/city-ads/provider-inbox.server";

/**
 * Families from ads, in the provider's inbox (lib/city-ads/provider-inbox.server.ts).
 *
 * GET                  the list
 * GET  ?leadId=…       one family: conversation, what they need, how to reach them
 * POST { leadId, action: "message", body }
 *      { leadId, action: "take" | "pass" }            an open offer
 *      { leadId, action: "outcome", value }           talking | client | no
 *
 * Signed in, and only for families one of the caller's provider profiles can see.
 */

const OUTCOMES = ["talking", "client", "no"] as const;
type Outcome = (typeof OUTCOMES)[number];
const OUTCOME_STATUS: Record<Outcome, string> = { talking: "contacted", client: "client", no: "no_fit" };

type Caller = { ok: true; profileIds: string[]; names: Map<string, string> } | { ok: false; res: NextResponse };

async function caller(): Promise<Caller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const db = getServiceClient();
  const { data: account } = await db.from("accounts").select("id").eq("user_id", user.id).maybeSingle();
  if (!account) return { ok: true, profileIds: [], names: new Map() };
  const { data: profiles } = await db
    .from("business_profiles")
    .select("id, display_name")
    .eq("account_id", account.id)
    .in("type", ["organization", "caregiver"]);
  const names = new Map((profiles ?? []).map((p) => [String(p.id), (p.display_name as string | null) ?? "Your care provider"]));
  return { ok: true, profileIds: [...names.keys()], names };
}

export async function GET(request: NextRequest) {
  const c = await caller();
  if (!c.ok) return c.res;
  const db = getServiceClient();
  const name = c.names.values().next().value ?? "Your care provider";
  const leadId = request.nextUrl.searchParams.get("leadId");
  if (leadId) {
    const family = await getAdFamily(db, leadId, c.profileIds, name);
    if (!family) return NextResponse.json({ error: "That family isn't in your inbox." }, { status: 404 });
    return NextResponse.json({ family });
  }
  return NextResponse.json({ families: await listAdFamilies(db, c.profileIds, name) });
}

export async function POST(request: NextRequest) {
  const c = await caller();
  if (!c.ok) return c.res;
  let body: { leadId?: string; action?: string; body?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nothing was sent." }, { status: 400 });
  }
  const db = getServiceClient();
  const owned = body.leadId ? await adFamilyForWrite(db, body.leadId, c.profileIds) : null;
  if (!owned) return NextResponse.json({ error: "That family isn't in your inbox." }, { status: 404 });

  if (body.action === "take" || body.action === "pass") {
    if (owned.access !== "offered" || !owned.offerId) {
      return NextResponse.json({ error: "This request is no longer open." }, { status: 409 });
    }
    const { data: offer } = await db.from("city_lead_offers").select("*").eq("id", owned.offerId).maybeSingle();
    const o = offer as CityOfferRow | null;
    if (!o || o.accepted_at || o.declined_at || o.expired_at) {
      return NextResponse.json({ error: "This request is no longer open." }, { status: 409 });
    }
    if (body.action === "take") {
      const r = await acceptOffer(db, o, "provider_page");
      if (!r.won) return NextResponse.json({ error: "Another agency already took this family." }, { status: 409 });
    } else {
      await declineOffer(db, o, null);
    }
    return NextResponse.json({ success: true });
  }

  if (owned.access === "offered") {
    return NextResponse.json({ error: "Take the request first." }, { status: 409 });
  }

  if (body.action === "message") {
    const r = await postProviderMessage(db, owned.lead, { id: owned.providerId, name: c.names.get(owned.providerId) ?? "Your care provider" }, String(body.body ?? ""));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true });
  }

  if (body.action === "outcome") {
    const value = body.value as Outcome | undefined;
    if (!value || !OUTCOMES.includes(value)) return NextResponse.json({ error: "Pick how it went." }, { status: 400 });
    const now = new Date().toISOString();
    const { error } = await db
      .from("city_leads")
      .update({
        outcome: value,
        outcome_at: now,
        outcome_source: "provider_app",
        status: OUTCOME_STATUS[value],
        ...(value !== "no" ? { reached_at: now } : {}),
        updated_at: now,
      })
      .eq("id", owned.lead.id);
    if (error) {
      console.error("[provider/ad-families] outcome write failed", error);
      return NextResponse.json({ error: "Couldn't save that. Try again in a moment." }, { status: 500 });
    }
    return NextResponse.json({ success: true, value });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

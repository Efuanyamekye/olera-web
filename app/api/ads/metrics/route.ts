import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Ingest for Google Ads campaign metrics, posted by a Google Ads Script.
 *
 * WHY THIS EXISTS. ad_spend_cents, ad_clicks and ad_impressions have never been
 * synced. A human reads the Google Ads UI and types them in. Edmonds Villa's
 * August flight was typed as $0.00 / 4 impressions; the real figures are
 * $43.52 / 391. Those numbers are about to be shown to the providers whose money
 * is being described, so "usually about right" stops being good enough.
 *
 * WHY A SCRIPT AND NOT THE GOOGLE ADS API. The API needs a developer token, and
 * a developer token is only issued through the API Center, which only exists on
 * a manager account. Olera's account (419-933-1442) is a flat standard account
 * with no manager above it, so the API Center is not merely locked, it is
 * absent. Getting there means creating a manager account and then waiting in
 * Google's review queue for Basic Access. Google Ads Scripts needs none of that
 * and was already switched on. Verified end to end on 2026-09-11: 19 campaigns
 * read, correct spend returned.
 *
 * THE FIREWALL. Vercel's WAF 429s Google's script servers -- the same firewall
 * that once blocked Google's own AdsBot sitewide. The custom rule
 * `ads-metrics-ingest` bypasses it for THIS PATH ONLY. That rule is what makes
 * this route reachable, and it is also why the bearer check below is the only
 * thing protecting it: the WAF is no longer in front of this path, deliberately,
 * because the WAF exists to block bots and our ingester is one.
 */

export const dynamic = "force-dynamic";

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

interface IncomingCampaign {
  id: string;
  name?: string;
  impressions: number;
  clicks: number;
  /** Account currency, as a float. Google returns e.g. 53.454411. */
  cost: number;
}

/** Google returns fractional cents because costs are micros underneath. */
function toCents(cost: unknown): number | null {
  const n = typeof cost === "number" ? cost : Number(cost);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function toCount(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export async function POST(req: NextRequest) {
  // Same bearer convention as every cron route, but a DIFFERENT secret.
  //
  // This secret lives in plain text inside a Google Ads script, editable by
  // anyone with access to the ad account. CRON_SECRET opens the cron routes and
  // the city-leads verification path that can write leads; those two blast
  // radii must not be shared. ADS_INGEST_SECRET can do exactly one thing:
  // overwrite three metric columns.
  const secret = process.env.ADS_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { campaigns?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.campaigns) ? body.campaigns : null;
  if (!raw) {
    return NextResponse.json({ error: "Expected { campaigns: [...] }" }, { status: 400 });
  }
  if (raw.length > 500) {
    return NextResponse.json({ error: "Too many campaigns in one post" }, { status: 400 });
  }

  const db = getServiceDb();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const measuredAt = new Date().toISOString();
  const updatedProvider: string[] = [];
  const updatedCity: string[] = [];
  const unmatched: { id: string; name?: string }[] = [];
  const rejected: { id?: string; reason: string }[] = [];
  /** Mapped, but held back because a human verified those figures. Not an
   *  error and not a gap -- reported so the run log can say so out loud. */
  const skippedVerified: string[] = [];

  for (const item of raw as IncomingCampaign[]) {
    const id = item && typeof item.id === "string" ? item.id.trim() : "";
    if (!id) {
      rejected.push({ reason: "missing campaign id" });
      continue;
    }

    const impressions = toCount(item.impressions);
    const clicks = toCount(item.clicks);
    const spendCents = toCents(item.cost);
    if (impressions === null || clicks === null || spendCents === null) {
      // A partially-parseable campaign is skipped rather than written with
      // nulls. Overwriting a good number with a null is the one outcome worse
      // than leaving it stale, because staleness is visible via measured_at and
      // a null just looks like "no data yet".
      rejected.push({ id, reason: "non-numeric impressions/clicks/cost" });
      continue;
    }

    const patch = {
      ad_impressions: impressions,
      ad_clicks: clicks,
      ad_spend_cents: spendCents,
      metrics_updated_at: measuredAt,
      metrics_source: "script",
    };

    // Provider flights first, then the Olera-owned city campaigns. They live in
    // the same Google account and arrive in the same payload, but in different
    // tables; a campaign belongs to exactly one of them.
    //
    // A `verified` row is never overwritten. Those figures were read off the ad
    // platform by a human for a specific flight window, which is the one thing
    // this sync cannot do: it reports LAST_30_DAYS for the whole campaign, so
    // where one Google campaign backs two Olera flights, or a flight has aged
    // past the window, the script's number is wrong and the human's is right.
    // Without this guard the hourly run silently reverts the correction inside
    // the hour and re-stamps it `script`, which the provider-facing gate then
    // trusts. Deliberately written as `is.null OR neq`: a bare `.neq()` drops
    // NULL rows too, because SQL `NULL <> 'verified'` is NULL, not true -- and
    // a brand-new flight has NULL here, so that form would stop syncing exactly
    // the campaigns that need it most.
    const notVerified = "metrics_source.is.null,metrics_source.neq.verified";

    const { data: prov, error: provErr } = await db
      .from("ad_campaign_requests")
      .update(patch)
      .eq("platform_campaign_id", id)
      .or(notVerified)
      .select("id");

    if (provErr) {
      rejected.push({ id, reason: `provider update failed: ${provErr.message}` });
      continue;
    }
    if (prov && prov.length > 0) {
      updatedProvider.push(id);
      continue;
    }

    // A zero-row update above is ambiguous: either no row carries this
    // platform_campaign_id, or one does and it is verified. Those need
    // different responses from whoever reads the run log -- one is "backfill
    // the mapping", the other is "working as intended" -- so tell them apart
    // before falling through to the city table. Without this, every verified
    // campaign would be reported as UNMATCHED every hour, and the log line that
    // exists to surface real gaps would fill up with noise.
    const { data: heldProv } = await db
      .from("ad_campaign_requests")
      .select("id")
      .eq("platform_campaign_id", id)
      .eq("metrics_source", "verified")
      .limit(1);
    if (heldProv && heldProv.length > 0) {
      skippedVerified.push(id);
      continue;
    }

    const { data: city, error: cityErr } = await db
      .from("city_campaigns")
      .update(patch)
      .eq("platform_campaign_id", id)
      .or(notVerified)
      .select("id");

    if (cityErr) {
      rejected.push({ id, reason: `city update failed: ${cityErr.message}` });
      continue;
    }
    if (city && city.length > 0) {
      updatedCity.push(id);
      continue;
    }

    const { data: heldCity } = await db
      .from("city_campaigns")
      .select("id")
      .eq("platform_campaign_id", id)
      .eq("metrics_source", "verified")
      .limit(1);
    if (heldCity && heldCity.length > 0) {
      skippedVerified.push(id);
      continue;
    }

    // NOT GUESSED AT. A campaign we cannot join is reported back, never matched
    // on its name. Attaching one provider's spend to another provider's row is
    // the single worst thing this endpoint could do, and fuzzy name matching is
    // how that happens. Backfill platform_campaign_id deliberately instead.
    unmatched.push({ id, name: typeof item.name === "string" ? item.name : undefined });
  }

  return NextResponse.json({
    ok: true,
    measuredAt,
    received: raw.length,
    updatedProvider: updatedProvider.length,
    updatedCity: updatedCity.length,
    skippedVerified,
    unmatched,
    rejected,
  });
}

/**
 * GET is a health check, not a data route. It reports whether the secret is
 * configured and reachable so a firewall or env problem can be diagnosed without
 * posting anything -- and so /ad-boost-audit can confirm the pipe is alive.
 * It deliberately returns nothing about campaigns.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.ADS_INGEST_SECRET;
  const authed = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  return NextResponse.json({
    ok: true,
    configured: !!secret,
    authenticated: authed,
  });
}

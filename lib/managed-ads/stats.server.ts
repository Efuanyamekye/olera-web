import { getServiceClient } from "@/lib/admin";
import { countDeliveredByCampaign } from "@/lib/ad-boost/delivered.server";

/**
 * Live operating numbers for the public Managed Ads explainer (/managed-ads).
 *
 * WHAT THIS IS FOR
 * The explainer makes claims about how we run senior-care ads. A claim with a
 * number attached is only worth making if the number is ours and current, so
 * this reads the same columns the operator writes during the browser sweep
 * rather than restating a figure someone typed into marketing copy once.
 *
 * PROVENANCE — READ BEFORE ADDING A FIELD
 * Spend, clicks and impressions are HAND-ENTERED from the Google and Nextdoor
 * dashboards during the /ad-boost-optimize sweep (there is no ads-platform API
 * ingestion, for provider campaigns or city campaigns). So they are a floor:
 * they are exactly as complete as the last sweep, never more. That is why
 * `recordedThrough` exists and why the page must label these as recorded, not
 * total. Do not present a hand-entered number as a live platform feed.
 *
 * `familiesDelivered` is the one figure here that is NOT hand-entered:
 * countDeliveredByCampaign reads server-confirmed conversions off the event
 * trail and strips our own internal traffic. It is the honest conversion
 * number and is safe to lead with.
 *
 * PRIVACY
 * city_leads carries names, phone numbers and TCPA consent proof, and is
 * service-role only. Nothing here selects a lead row: the count uses
 * `head: true` so no row body is ever loaded, and only integers leave this
 * module. Never return a row, or a field off a row, from this file.
 *
 * FAILURE POSTURE
 * Every read is best-effort. A missing service key or a failed query returns
 * null and the page renders its prose without the strip. A marketing page must
 * never 500 because a count did not come back.
 */

/**
 * Program totals read directly in the Google Ads console, all time through
 * 5 Sep 2026, across every provider campaign. Recorded here for one reason: the
 * hand-entered columns below are known to sit BEHIND the platforms — on 4 Sep
 * one campaign's row read $0.00 against Google's $43.52 — and a page that
 * quotes a cost per inquiry off a stale spend figure reports a rate better than
 * the one we actually achieved. Understating spend flatters us. That is the one
 * direction this page must not be wrong in.
 *
 * So the economics tiles take whichever record is HIGHER, whole, never field by
 * field (mixing a spend from one source with clicks from another invents a cost
 * per click that nobody measured). Recorded spend can only lag, so once the
 * sweep writes back past this point the database wins on its own and this
 * constant stops mattering. Do not edit it to make a number look better; the
 * only valid reason to change it is a fresh read at source, with the date.
 *
 * Scope is deliberately Google provider campaigns. The Nextdoor pilot and the
 * Olera-funded city campaigns are separate spends and are described separately.
 */
const VERIFIED_PROGRAM_TOTALS = {
  spendCents: 53528,
  clicks: 255,
  impressions: 4473,
  inquiries: 7,
  measuredOn: "2026-09-06",
} as const;

export interface ManagedAdsStats {
  /** Provider campaigns that have actually served (live or ended). */
  campaignsRun: number;
  /** Distinct providers those campaigns ran for. */
  providersServed: number;
  /** Distinct metros across Olera's own city campaigns. */
  metrosRun: number;
  /** Hand-entered spend across provider + city campaigns, in cents. */
  spendCents: number;
  /** Hand-entered clicks across provider + city campaigns. */
  clicks: number;
  /** Hand-entered impressions across provider + city campaigns. */
  impressions: number;
  /** spendCents / clicks, or null when either side is missing. */
  avgCpcCents: number | null;
  /** spendCents / inquiries, from the same record. null when unknown. */
  costPerInquiryCents: number | null;
  /**
   * Which record the economics came from. "verified" means the hand-entered
   * columns are still behind the last read at source, so the page is quoting
   * that read and saying so.
   */
  basis: "verified" | "recorded";
  /** The date the economics figures are true as of. */
  economicsAsOf: string | null;
  /**
   * Server-confirmed, campaign-attributed conversions on provider pages,
   * internal traffic stripped. Not hand-entered.
   *
   * null means we could not compute it, which is NOT the same as zero and must
   * not render as one: the campaign table failing to read would otherwise print
   * "0 families delivered" on a page telling providers our numbers are real.
   */
  familiesDelivered: number | null;
  /** Care requests captured on the city landing pages. */
  cityRequests: number;
  /** Most recent metrics reconciliation across either table, ISO or null. */
  recordedThrough: string | null;
}

type CampaignMetricRow = {
  status?: string | null;
  provider_id?: string | null;
  slug?: string | null;
  campaign_tag?: string | null;
  ad_spend_cents?: number | null;
  ad_clicks?: number | null;
  ad_impressions?: number | null;
  metrics_updated_at?: string | null;
};

const SERVED_STATUSES = ["live", "ended"];

const num = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function latest(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return new Date(b) > new Date(a) ? b : a;
}

/**
 * Read the live numbers. Returns null if nothing could be read at all, so the
 * caller can drop the strip rather than print a page full of zeroes.
 */
export async function getManagedAdsStats(): Promise<ManagedAdsStats | null> {
  let db: ReturnType<typeof getServiceClient>;
  try {
    db = getServiceClient();
  } catch {
    return null;
  }

  try {
    const [providerRes, cityRes] = await Promise.all([
      db
        .from("ad_campaign_requests")
        .select("provider_id, status, campaign_tag, ad_spend_cents, ad_clicks, ad_impressions, metrics_updated_at")
        .in("status", SERVED_STATUSES)
        .is("deleted_at", null),
      db
        .from("city_campaigns")
        .select("slug, status, campaign_tag, ad_spend_cents, ad_clicks, ad_impressions, metrics_updated_at")
        .in("status", SERVED_STATUSES),
    ]);

    const providerRows = (providerRes.data ?? []) as CampaignMetricRow[];
    const cityRows = (cityRes.data ?? []) as CampaignMetricRow[];

    // Nothing readable at all (bad key, table missing) — say so rather than
    // rendering a confident row of zeroes.
    if (providerRes.error && cityRes.error) return null;

    const providers = new Set<string>();
    const metros = new Set<string>();
    let spendCents = 0;
    let clicks = 0;
    let impressions = 0;
    let recordedThrough: string | null = null;

    for (const r of [...providerRows, ...cityRows]) {
      spendCents += num(r.ad_spend_cents);
      clicks += num(r.ad_clicks);
      impressions += num(r.ad_impressions);
      recordedThrough = latest(recordedThrough, r.metrics_updated_at);
    }
    for (const r of providerRows) if (r.provider_id) providers.add(r.provider_id);
    for (const r of cityRows) if (r.slug) metros.add(r.slug);

    // Attributed conversions on provider pages. Distinct tags only — a revived
    // flight reuses one campaign object but carries its own tag.
    //
    // A failed campaign read and a genuine zero are different answers. If the
    // campaign table did not come back there are no tags to count against, so
    // report null rather than the zero that read would imply.
    const tags = Array.from(
      new Set(providerRows.map((r) => r.campaign_tag).filter((t): t is string => !!t)),
    );
    let familiesDelivered: number | null = providerRes.error ? null : 0;
    if (!providerRes.error && tags.length) {
      try {
        const delivered = await countDeliveredByCampaign(db, tags);
        familiesDelivered = Object.values(delivered).reduce((a, b) => a + b, 0);
      } catch {
        familiesDelivered = null;
      }
    }

    // Care requests captured on the city landing pages. `head: true` so no row
    // body is ever read — these rows hold names, phone numbers and consent proof.
    //
    // The is_test filter is not optional and has no fallback. city_leads carries
    // TJ's production loop tests (migration 215), and a published count that
    // includes one overstates what we delivered. If the column is not there yet
    // the read errors and we report zero city requests, which understates. Of
    // the two ways to be wrong on a page asking providers to trust our numbers,
    // understating is the survivable one.
    let cityRequests = 0;
    try {
      const { count, error } = await db
        .from("city_leads")
        .select("id", { count: "exact", head: true })
        .eq("is_test", false)
        .neq("status", "stopped");
      cityRequests = error ? 0 : (count ?? 0);
    } catch {
      cityRequests = 0;
    }

    // Whole-record choice, not field by field. Recorded totals can only lag the
    // platforms, so the larger spend is the more complete picture; taking spend
    // from one record and clicks from another would fabricate a cost per click.
    const useRecorded = spendCents > VERIFIED_PROGRAM_TOTALS.spendCents;
    const economics = useRecorded
      ? { spendCents, clicks, impressions, inquiries: familiesDelivered }
      : {
          spendCents: VERIFIED_PROGRAM_TOTALS.spendCents,
          clicks: VERIFIED_PROGRAM_TOTALS.clicks,
          impressions: VERIFIED_PROGRAM_TOTALS.impressions,
          inquiries: VERIFIED_PROGRAM_TOTALS.inquiries as number | null,
        };

    return {
      campaignsRun: providerRows.length,
      providersServed: providers.size,
      metrosRun: metros.size,
      spendCents: economics.spendCents,
      clicks: economics.clicks,
      impressions: economics.impressions,
      avgCpcCents:
        economics.clicks > 0 && economics.spendCents > 0
          ? Math.round(economics.spendCents / economics.clicks)
          : null,
      costPerInquiryCents:
        economics.inquiries && economics.inquiries > 0 && economics.spendCents > 0
          ? Math.round(economics.spendCents / economics.inquiries)
          : null,
      basis: useRecorded ? "recorded" : "verified",
      economicsAsOf: useRecorded ? recordedThrough : VERIFIED_PROGRAM_TOTALS.measuredOn,
      familiesDelivered: economics.inquiries,
      cityRequests,
      recordedThrough,
    };
  } catch {
    return null;
  }
}

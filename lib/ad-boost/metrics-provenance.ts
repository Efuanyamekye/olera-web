/**
 * Where a campaign's ad figures came from, and whether a provider may see them.
 *
 * `ad_impressions` / `ad_clicks` / `ad_spend_cents` were hand-entered for this
 * product's whole life and went stale silently: Edmonds Villa's August flight
 * sat at $0.00 / 4 impressions on the provider's own receipt against a real
 * $43.52 / 391. The gate exists because a wrong number costs the credibility of
 * every other number on the page, while a missing one costs a row.
 *
 *   script    the hourly Google Ads Script wrote them. Machine-fresh.
 *   verified  an admin read them off the ad platform and entered them
 *             deliberately (POST /api/admin/ad-boost). This is the manual
 *             backfill path: it is how a campaign the script cannot reach --
 *             Meta, Nextdoor, or a Google flight with no platform_campaign_id
 *             -- gets real figures in front of the provider who paid for them.
 *   typed     the historical rows, entered before anyone was tracking
 *             provenance and never re-checked. Withheld until someone does.
 *   null      no figures, or none we can account for. Withheld.
 *
 * Both provider-facing surfaces gate on this: the receipt
 * (`lib/ad-boost/receipts.server.ts`) and the dashboard hero's campaign banner
 * (`app/api/provider/dashboard/route.ts`). They must agree -- a number good
 * enough for the hero is good enough for the page it links to -- so the rule
 * lives here rather than as a string compared in two places.
 */
export const TRUSTED_METRICS_SOURCES = ["script", "verified"] as const;

export function isTrustedMetricsSource(source: string | null | undefined): boolean {
  return !!source && (TRUSTED_METRICS_SOURCES as readonly string[]).includes(source);
}

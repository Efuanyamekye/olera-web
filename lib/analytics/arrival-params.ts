/**
 * The acquisition signals a landing URL carries, read from the current page.
 *
 * Both page trackers stamp exactly these onto the page view, because
 * `lib/analytics/channel.ts` needs all of them to tell paid from organic and
 * owned from direct. Recording a subset is how paid traffic ends up counted
 * as organic search: an auto-tagged Google Ads click has a Google referrer
 * and nothing else to distinguish it but the `gclid`.
 *
 * Client-only — reads `window.location.search`. Returns a plain object safe
 * to spread into a tracker's metadata; absent params are simply omitted so
 * the stored JSON stays small.
 */
export interface ArrivalParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** Google Ads auto-tagging. Stored as a boolean — the id itself is noise. */
  gclid?: true;
  /** Our own link tag: `ref=email` on every link we mail. */
  ref?: string;
}

export function readArrivalParams(): ArrivalParams {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);

  const take = (key: string, max = 120): string | undefined => {
    const v = sp.get(key);
    return v ? v.slice(0, max) : undefined;
  };

  const out: ArrivalParams = {};
  const source = take("utm_source");
  const medium = take("utm_medium");
  const campaign = take("utm_campaign", 300);
  const ref = take("ref", 40);
  if (source) out.utm_source = source;
  if (medium) out.utm_medium = medium;
  if (campaign) out.utm_campaign = campaign;
  if (ref) out.ref = ref;
  // Presence is the whole signal; the click id is high-cardinality noise and
  // is deliberately not stored.
  if (sp.has("gclid")) out.gclid = true;
  return out;
}

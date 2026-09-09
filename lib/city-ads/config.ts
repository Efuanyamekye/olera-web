/**
 * City ad campaign pages: /care/{slug}.
 *
 * One config per landing page. The ad's city name is repeated verbatim in the
 * H1 (message match), the ZIP is prefilled, and the time zone drives staffed
 * hours for the offer chain (8am to 8pm local; outside that the chain parks
 * until morning and the family is told so).
 *
 * Adding a city = one entry here + campaign/pool rows (see migration 207).
 */

export type CityCareType = "home_care" | "assisted_living" | "unsure" | "medical";
export type CityRecipient = "parent" | "spouse" | "self" | "other";
export type CityUrgency = "this_week" | "this_month" | "planning";

/**
 * How a request is routed once captured.
 *
 * "concierge" — no provider chain. The request is captured, Slack pages a human,
 *   and the family is told a person from Olera will call them. Used before a city
 *   has providers who have agreed to take texted leads, because the alternative is
 *   promising a family a provider call that nobody is on the hook for. It is also
 *   the honest way to run ads first and recruit providers second, with a live
 *   request in hand: a far stronger ask than "we might send you leads".
 *
 * "auto" — the sequential offer chain in offers.server.ts. Switch a city over once
 *   at least one provider is enabled in its pool.
 */
export type CityRoutingMode = "concierge" | "auto";

export interface CityConfig {
  slug: string;
  city: string;
  state: string;
  routingMode: CityRoutingMode;
  /** How the area is described to the family, e.g. "Concord and nearby". */
  areaLabel: string;
  zipPrefill: string;
  timeZone: string;
  /** Campaign tag shared across channels for this city (= utm_campaign). */
  campaignTag: string;
}

export const CITY_CONFIGS: Record<string, CityConfig> = {
  // Metro, not city. Measured 2026-09-07: Concord city carried ~330 core-term
  // searches a month and Garland ~450, against a ~1,500 gate. Neither could
  // supply the planned $300 in two weeks at the ~$2.25 CPC Google forecasts.
  // Concierge routing makes the wider net safe: a human calls every family, so
  // a lead outside one agency's radius costs nothing. Narrow back to the rings
  // when providers are on call. Every pooled provider sits inside these metros.
  "charlotte-nc": {
    slug: "charlotte-nc",
    city: "Charlotte",
    state: "NC",
    routingMode: "concierge",
    areaLabel: "Charlotte, Concord, Huntersville and nearby",
    zipPrefill: "28202",
    timeZone: "America/New_York",
    campaignTag: "olera-charlotte-sep26",
  },
  "dallas-tx": {
    slug: "dallas-tx",
    city: "Dallas",
    state: "TX",
    routingMode: "concierge",
    areaLabel: "Dallas, Garland, Plano and nearby",
    zipPrefill: "75201",
    timeZone: "America/Chicago",
    campaignTag: "olera-dallas-sep26",
  },
};

export function getCityConfig(slug: string): CityConfig | null {
  return CITY_CONFIGS[slug] ?? null;
}

export const CITY_FORM_VERSION = "v1-2026-09-06";

/**
 * The window, in the CITY's timezone, where we will tell a family we are
 * calling them today. Outside it they are told "in the morning" instead.
 *
 * 8am to noon local is deliberately narrow. Concierge routing means a human
 * makes every one of these calls, and that human is on UTC+7. Noon Eastern is
 * 11pm for them and noon Central is midnight, so this is the last hour we can
 * promise a same-day call and still keep it. The old 8am-8pm window promised a
 * call at 4pm Eastern, which is 3am for the person who has to make it.
 *
 * Widen this the day someone covers US afternoons. It is the only thing
 * standing between the promise and the person keeping it.
 */
export const STAFFED_HOURS = { start: 8, end: 12 } as const;
export const OFFER_WINDOW_MINUTES = 30;
export const MAX_OFFERS_PER_LEAD = 3;

export const RECIPIENT_LABEL: Record<CityRecipient, string> = {
  parent: "a parent",
  spouse: "a spouse or partner",
  self: "themselves",
  other: "a family member",
};

export const CARE_LABEL: Record<CityCareType, string> = {
  home_care: "help at home",
  assisted_living: "assisted living or a care home",
  unsure: "care, type not decided yet",
  medical: "nursing or medical care",
};

export const URGENCY_LABEL: Record<CityUrgency, string> = {
  this_week: "starting this week",
  this_month: "starting this month",
  planning: "planning ahead",
};

export const PAYMENT_LABEL: Record<string, string> = {
  private_pay: "private pay",
  medicaid: "Medicaid",
  va: "VA benefits",
  ltc_insurance: "long-term care insurance",
  unsure: "payment not decided",
};

/** Hour of day (0-23) in the given IANA zone. */
/**
 * Was this visit produced by an ad, and by which channel?
 *
 * Shared by the lead route and the quiz-start ping so the two can never
 * disagree about whether a family came from paid. A gclid is proof of a Google
 * click; our own utm_source covers Nextdoor and anything else we tag.
 */
/**
 * Per-platform utm_medium. Each paid channel gets its own so a lead can be
 * attributed without guessing: Google and Nextdoor were already live under
 * `paid_search` and `paid_social` when Meta was added, so Meta took a third
 * value rather than sharing `paid_social` with Nextdoor and making every
 * Charlotte social lead ambiguous. `paid_` prefix = paid, for the `paid` flag.
 */
export const CITY_MEDIUM_GOOGLE = "paid_search";
export const CITY_MEDIUM_NEXTDOOR = "paid_social";
export const CITY_MEDIUM_META = "paid_meta";

export function classifyCityTraffic(utm: {
  source?: string | null;
  medium?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
}): { paid: boolean; channel: string | null } {
  const medium = utm.medium ?? null;
  // Matched case-insensitively because utm_medium is typed by hand into an ad
  // URL. A stray "Paid_Meta" would otherwise read as neither paid nor Meta, and
  // surface in the rollup as its own phantom channel next to the real one.
  // The fallback below still returns the medium as written, for display.
  const m = (medium ?? "").toLowerCase();
  const paid =
    Boolean(utm.gclid) ||
    Boolean(utm.fbclid) ||
    String(utm.source ?? "").toLowerCase() === "olera_city" ||
    m.startsWith("paid_");
  // A click id is stronger evidence than a medium we typed into an ad URL by
  // hand, so it wins. Meta is checked before the medium fallbacks because a
  // Meta ad can arrive with fbclid and a mistyped medium, and mislabelling it
  // Nextdoor would corrupt the one comparison the Charlotte arm exists to make.
  const channel = utm.fbclid || m === CITY_MEDIUM_META
    ? "Meta"
    : utm.gclid || m === CITY_MEDIUM_GOOGLE
      ? "Google"
      : m === CITY_MEDIUM_NEXTDOOR
        ? "Nextdoor"
        : medium;
  return { paid, channel };
}

export function hourIn(timeZone: string, at: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(at);
  const h = parseInt(s, 10);
  return Number.isFinite(h) ? h % 24 : at.getUTCHours();
}

export function isStaffedNow(timeZone: string, at: Date = new Date()): boolean {
  const h = hourIn(timeZone, at);
  return h >= STAFFED_HOURS.start && h < STAFFED_HOURS.end;
}

/**
 * Next 8:00 local as a Date. Walks forward in 15-minute steps rather than doing
 * zone arithmetic by hand; at most ~48 iterations, fine for a cron.
 */
export function nextStaffedStart(timeZone: string, from: Date = new Date()): Date {
  const t = new Date(from.getTime());
  t.setUTCSeconds(0, 0);
  for (let i = 0; i < 24 * 4 + 4; i++) {
    t.setUTCMinutes(t.getUTCMinutes() + 15);
    const h = hourIn(timeZone, t);
    const m = parseInt(new Intl.DateTimeFormat("en-US", { timeZone, minute: "numeric" }).format(t), 10);
    if (h === STAFFED_HOURS.start && m < 15) return new Date(t.getTime());
  }
  return new Date(from.getTime() + 12 * 60 * 60 * 1000);
}

export function formatUSPhone(e164OrDigits: string | null | undefined): string {
  if (!e164OrDigits) return "";
  const d = e164OrDigits.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164OrDigits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

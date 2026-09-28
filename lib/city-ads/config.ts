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
  /**
   * What the family asked for, as the confirmation text names it ("your request
   * for {careNoun} in {city}"). Defaults to "home care". An assisted living
   * provider's form must not tell the family they asked for home care.
   */
  careNoun?: string;
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
  // Not an Olera city arm. This is Hoop Cares' Managed Ads subscription run as
  // an instant form, because Google cannot spend money in this market: its own
  // budget simulator reads 4 clicks/30d at $3.50/day and 9 at $20.89, with a
  // min bid limit above the live cap on every row. Meta is interruption rather
  // than intent, so a ~375k-person tri-county can absorb real budget.
  //
  // `concierge`, not `auto`, and this is load-bearing twice over. The native
  // importer REQUIRES it (meta-native.server.ts:48 throws
  // "Form needs concierge configuration" otherwise, and a 2026-09-20 test lead
  // failed exactly there), because the published form promises a conversation
  // before any introduction — which this form's own copy does say: "someone
  // from Olera will call you, then introduce you to Hoop Cares."
  //
  // Routing no longer depends on it. Since 24 Sep the form is registered as
  // an ad on Hoop's own campaign, so primary.server.ts hands each lead to her
  // campaign page once it answers or after an hour. She leads the calls and
  // our team can still follow up on the shared thread.
  // THE FORM COPY ABOVE IS NOW STALE: it promises an Olera call first. Change
  // it in Ads Manager to say Hoop Cares will be in touch.
  //
  // The area is her own, confirmed by her on the 16 Sep orientation call:
  // Jackson, Harrison and George County, not a radius around Pascagoula.
  "pascagoula-ms": {
    slug: "pascagoula-ms",
    city: "Pascagoula",
    state: "MS",
    routingMode: "concierge",
    areaLabel: "Jackson, Harrison and George County",
    zipPrefill: "39563",
    timeZone: "America/Chicago",
    campaignTag: "olera-pascagoula-native-sep26",
    // Whose leads these are is data, not config: the form's city_campaigns row
    // names Hoop's campaign in request_id (migration 256, primary.server.ts).
  },
  // Not an Olera city arm. Colorado CareAssist's Ad Boost run as an instant
  // form beside its Google campaign, $50 each, 28 Sep to 11 Oct. Built the
  // Pascagoula way: `concierge` because the native importer requires it, and
  // the form's city_campaigns row names their request in request_id so each
  // lead is handed to their campaign page rather than pooled.
  //
  // Area is the Boulder office's market (1911 11th St), not the Denver,
  // Springs and Fort Collins locations they also list: $50 cannot cover them.
  "boulder-co": {
    slug: "boulder-co",
    city: "Boulder",
    state: "CO",
    routingMode: "concierge",
    areaLabel: "Boulder, Longmont, Louisville and nearby",
    zipPrefill: "80302",
    timeZone: "America/Denver",
    campaignTag: "colorado-careassist-boulder-native-sep26",
  },
  // Four more provider instant forms, same pattern as boulder-co: `concierge`
  // because the importer requires it, and each form's city_campaigns row names
  // the provider's Ad Boost request so its leads go to that provider. These
  // replace traffic ads to the provider page, which optimise for page views and
  // hand nothing over (TJ, 25 Sep: provider Meta arms are always forms).
  // Wescastle Healthcare, 20 mi around their Peachtree St office.
  "atlanta-ga": {
    slug: "atlanta-ga",
    city: "Atlanta",
    state: "GA",
    routingMode: "concierge",
    areaLabel: "Atlanta, Decatur, Sandy Springs and nearby",
    zipPrefill: "30309",
    timeZone: "America/New_York",
    campaignTag: "wescastle-atlanta-native-sep26",
  },
  // Rosemonte Assisted Living, a residential home in North Phoenix (85024).
  "phoenix-az": {
    slug: "phoenix-az",
    city: "Phoenix",
    state: "AZ",
    routingMode: "concierge",
    areaLabel: "North Phoenix, Scottsdale, Glendale and nearby",
    zipPrefill: "85024",
    timeZone: "America/Phoenix",
    campaignTag: "rosemonte-phoenix-native-sep26",
    careNoun: "assisted living",
  },
  // HomeWell Care Services of East Tennessee (Anderson, Roane, Knox counties).
  "oak-ridge-tn": {
    slug: "oak-ridge-tn",
    city: "Oak Ridge",
    state: "TN",
    routingMode: "concierge",
    areaLabel: "Oak Ridge, Clinton, Knoxville and nearby",
    zipPrefill: "37830",
    timeZone: "America/New_York",
    campaignTag: "homewell-oak-ridge-native-sep26",
  },
  // LumiWell Home Care, Fresno.
  "fresno-ca": {
    slug: "fresno-ca",
    city: "Fresno",
    state: "CA",
    routingMode: "concierge",
    areaLabel: "Fresno, Clovis and nearby",
    zipPrefill: "93727",
    timeZone: "America/Los_Angeles",
    campaignTag: "lumiwell-fresno-native-sep26",
  },
  // Seniors Helping Seniors Scottsdale & Northeast Phoenix (Andy), free $50
  // trial as $25 Google + $25 Meta. Not `phoenix-az`: that slug is Rosemonte's
  // assisted living form. Area is his franchise territory, 85254 + 15 mi,
  // narrower than the usual 20 mi so it stays out of neighbouring SHS
  // territories. Rosemonte's form overlaps this area; TJ kept both on 26 Sep.
  "scottsdale-az": {
    slug: "scottsdale-az",
    city: "Scottsdale",
    state: "AZ",
    routingMode: "concierge",
    areaLabel: "Scottsdale, Paradise Valley, Northeast Phoenix and nearby",
    zipPrefill: "85254",
    timeZone: "America/Phoenix",
    campaignTag: "shs-scottsdale-native-sep26",
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
/**
 * How long an offer stays one provider's, in their business hours.
 *
 * It was 30 wall-clock minutes. Of the first 12 real offers, 1 was taken, none
 * were passed, and 11 simply ran out: every offer text failed (Dallas agencies
 * are on landlines), 4 of 11 emails were opened, and an email read an hour
 * later found the family already gone. Decided 27 Sep: one clock for every
 * lead, 4 business hours, a reminder at 1, and never a full window against an
 * agency the offer never reached.
 */
export const PROVIDER_HOURS = { start: 8, end: 18 } as const;
export const OFFER_WINDOW_BUSINESS_MINUTES = 240;
export const OFFER_NUDGE_AFTER_BUSINESS_MINUTES = 60;
/** An offer that reached nobody gets an hour for the team to call, then moves on. */
export const OFFER_UNREACHED_BUSINESS_MINUTES = 60;
/** Kept for the plan's projections; an offer's real window is business hours. */
export const OFFER_WINDOW_MINUTES = OFFER_WINDOW_BUSINESS_MINUTES;
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
 * zone arithmetic by hand; includes a 25-hour day across fall-back.
 */
export function nextStaffedStart(timeZone: string, from: Date = new Date()): Date {
  const t = new Date(from.getTime());
  t.setUTCMinutes(Math.floor(t.getUTCMinutes() / 15) * 15, 0, 0);
  for (let i = 0; i < 24 * 4 + 4; i++) {
    t.setUTCMinutes(t.getUTCMinutes() + 15);
    const h = hourIn(timeZone, t);
    const m = parseInt(new Intl.DateTimeFormat("en-US", { timeZone, minute: "numeric" }).format(t), 10);
    if (h === STAFFED_HOURS.start && m === 0) return new Date(t.getTime());
  }
  return new Date(from.getTime() + 12 * 60 * 60 * 1000);
}

function inProviderHours(timeZone: string, at: Date): boolean {
  const h = hourIn(timeZone, at);
  return h >= PROVIDER_HOURS.start && h < PROVIDER_HOURS.end;
}

/**
 * `minutes` of provider business hours after `from`, in the city's time zone.
 * Outside 8am to 6pm the clock stops. Walks in 5-minute steps, which is exact
 * to the step and cheap: a 4-hour window across a night is under 300 steps.
 */
export function addBusinessMinutes(timeZone: string, from: Date, minutes: number): Date {
  const STEP = 5;
  const t = new Date(from.getTime());
  let left = minutes;
  for (let i = 0; left > 0 && i < 20000; i++) {
    const open = inProviderHours(timeZone, t);
    t.setTime(t.getTime() + STEP * 60 * 1000);
    if (open) left -= STEP;
  }
  return t;
}

/** Provider business minutes between two moments, in the city's time zone. */
export function businessMinutesBetween(timeZone: string, from: Date, to: Date): number {
  const STEP = 5;
  let n = 0;
  for (let t = from.getTime(), i = 0; t < to.getTime() && i < 20000; t += STEP * 60 * 1000, i++) {
    if (inProviderHours(timeZone, new Date(t))) n += STEP;
  }
  return n;
}

export function isProviderHours(timeZone: string, at: Date = new Date()): boolean {
  return inProviderHours(timeZone, at);
}

/** "3:15 PM", or "Tue 9:00 AM" when it isn't today, in the city's time zone. */
export function formatUntil(timeZone: string, at: Date, now: Date = new Date()): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  if (day(at) === day(now)) return time;
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at);
  return `${wd} ${time}`;
}

export function formatUSPhone(e164OrDigits: string | null | undefined): string {
  if (!e164OrDigits) return "";
  const d = e164OrDigits.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164OrDigits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

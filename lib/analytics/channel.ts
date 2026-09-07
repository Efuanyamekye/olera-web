import { classifyReferrer } from "./referrer";

/**
 * The ten acquisition channels CR1 breaks into.
 *
 * One function, one definition. The operating map, the growth funnel and any
 * later report all classify an arrival here rather than each re-deriving the
 * rules — two surfaces disagreeing about what "paid" means is the failure
 * this file exists to prevent.
 *
 * The channels are mutually exclusive and collectively exhaustive: every page
 * view lands in exactly one, so the ten always sum to the total. That is the
 * property CR1's tooltip depends on.
 *
 * ORDER MATTERS. The tests run in a fixed sequence because the signals
 * overlap — a Google Ads click has a Google referrer and would classify as
 * organic search if the paid test did not come first.
 *
 *   1. internal      our own QA traffic, before anything else can claim it
 *   2. paid          gclid or a paid medium, before the referrer is read
 *   3. owned         email / sms / qr, before the referrer is read
 *   4. referrer      search, ai chat, social, referral, direct
 *
 * Steps 2 and 3 must precede step 4. An emailed link opened in a webview has
 * no referrer and would otherwise read as direct; an ad click reads as search.
 */

export type Channel =
  | "organic_search"
  | "ai_chat"
  | "organic_social"
  | "referral"
  | "paid_search"
  | "paid_social"
  | "email"
  | "sms"
  | "qr_family"
  | "unattributed"
  /** Our own QA and admin traffic. Never shown; excluded from CR1 entirely. */
  | "internal";

/** Display order in the tooltip — biggest-first is decided at render time. */
export const CHANNELS: readonly Channel[] = [
  "organic_search",
  "ai_chat",
  "organic_social",
  "referral",
  "paid_search",
  "paid_social",
  "email",
  "sms",
  "qr_family",
  "unattributed",
] as const;

export const CHANNEL_LABELS: Record<Channel, string> = {
  organic_search: "Organic search",
  ai_chat: "AI chat",
  organic_social: "Organic social",
  referral: "Referral",
  paid_search: "Paid search",
  paid_social: "Paid social",
  email: "Email",
  sms: "SMS",
  qr_family: "QR — family",
  unattributed: "Unattributed",
  internal: "Internal",
};

/**
 * The source value family collateral must carry.
 *
 * QR is not one channel. Provider outreach mail already ships
 * `utm_source=fax` and `utm_source=direct_mail`, and MedJobs codes send care
 * workers to the application — neither is care recipient demand, and counting
 * them in CR1 would pull two other lanes' supply-side traffic into it. Only
 * this exact source counts.
 */
export const QR_FAMILY_SOURCE = "qr_family";

/** Mediums that mean somebody paid for the click. */
const PAID_SEARCH_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_search", "paidsearch"]);
const PAID_SOCIAL_MEDIUMS = new Set([
  "paid_social",
  "paid-social",
  "social_paid",
  "cpm",
  "display",
]);

/** Ad Boost tags its own links with this, sometimes without any medium. */
const MANAGED_SOURCE = "olera_managed";

/** What a page view carries, as the trackers record it. */
export interface ArrivalSignals {
  referrer_class?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  /** True when the landing URL carried a Google Ads click id. */
  gclid?: boolean | null;
  /** Our own link tag: `ref=email` on every link we mail. */
  ref?: string | null;
}

const lower = (v: unknown): string =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

/**
 * Which channel an arrival belongs to.
 *
 * Reads only what the row already carries. A row recorded before a signal
 * existed simply cannot match on it and falls through — which is why callers
 * have to surface `CHANNEL_SIGNALS_START` on any range reaching back further.
 */
export function classifyChannel(signals: ArrivalSignals): Channel {
  const source = lower(signals.utm_source);
  const medium = lower(signals.utm_medium);
  const ref = lower(signals.ref);

  const referrerClass = signals.referrer_class
    ? lower(signals.referrer_class)
    : classifyReferrer(null);

  // 1. Ours. Checked first so a staff click on a campaign link is never paid.
  if (referrerClass === "olera_internal") return "internal";

  // 2. Paid, before the referrer can claim it as search or social.
  if (signals.gclid === true) return "paid_search";
  if (PAID_SOCIAL_MEDIUMS.has(medium)) return "paid_social";
  if (PAID_SEARCH_MEDIUMS.has(medium)) return "paid_search";
  if (source === MANAGED_SOURCE) {
    return medium.includes("social") ? "paid_social" : "paid_search";
  }

  // 3. Owned, before the referrer can claim it as direct. An emailed link
  //    opened from a mail client sends no referrer at all.
  if (ref === "email" || medium === "email" || source === "olera_email") return "email";
  if (ref === "sms" || medium === "sms") return "sms";
  if (source === QR_FAMILY_SOURCE) return "qr_family";

  // 4. Whatever the referrer says.
  if (referrerClass === "search") return "organic_search";
  if (referrerClass === "ai_chat") return "ai_chat";
  if (referrerClass === "social") return "organic_social";
  if (referrerClass === "other") return "referral";
  // `direct` and anything unrecognised: we do not know how they arrived.
  return "unattributed";
}

/**
 * The date the signals this classifier needs started being recorded on page
 * views. Before it, rows carry only `utm_source`, `utm_campaign` and
 * `referrer_class` — so paid search, email and SMS cannot match and their
 * traffic falls into organic search or unattributed instead.
 *
 * A range reaching back past this is not wrong, it is incomplete, and the
 * caller must say so rather than present the split as fact.
 */
export const CHANNEL_SIGNALS_START = "2026-09-07";

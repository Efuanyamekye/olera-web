/**
 * Provider activity taxonomy — the hierarchy the Activity Center "Providers"
 * tab was missing. Every genuine provider-session event maps to exactly one of
 * six lifecycle categories (plus a "flags" overlay for trust signals). The admin
 * page uses this to render the orientation summary + category navigation, and
 * the API uses it to translate a category into the set of event_types to query.
 *
 * Source of truth — keep PROVIDER_CATEGORIES[*].eventTypes in sync with
 * PROVIDER_ACTION_EVENT_TYPES in app/api/admin/activity/route.ts. Every event
 * type surfaced on the Providers tab should appear in exactly one category here,
 * or it will silently fall into "Other".
 */

export type ProviderCategoryKey =
  | "setup"
  | "leads"
  | "questions"
  | "reviews"
  | "outbound"
  | "growth"
  | "insights"
  | "flags";

export interface ProviderCategoryMeta {
  key: ProviderCategoryKey;
  /** Short label for tiles / chips. */
  label: string;
  emoji: string;
  /** One-line plain-English description (tooltip / empty-state copy). */
  blurb: string;
  /** Event types that roll up into this category. */
  eventTypes: string[];
  /** Tailwind classes — selected tile state (accent border + bg). */
  tileActive: string;
  /** Tailwind classes — small row/people badge. */
  badge: string;
  /** Tailwind dot color for the summary tile accent. */
  dot: string;
}

// Ordered most-meaningful-first. "flags" is a trust overlay, surfaced last.
export const PROVIDER_CATEGORIES: ProviderCategoryMeta[] = [
  {
    key: "leads",
    label: "Working leads",
    emoji: "🔵",
    blurb: "Opened and acted on families who reached out",
    eventTypes: [
      "lead_opened",
      "contact_revealed",
      "phone_clicked",
      "email_link_clicked",
      "continue_in_inbox",
      "one_click_access",
      "email_click",
    ],
    tileActive: "border-sky-300 bg-sky-50",
    badge: "bg-sky-50 text-sky-700",
    dot: "bg-sky-400",
  },
  {
    key: "questions",
    label: "Answering questions",
    emoji: "💬",
    blurb: "Responded to a family's question",
    eventTypes: ["question_responded"],
    tileActive: "border-teal-300 bg-teal-50",
    badge: "bg-teal-50 text-teal-700",
    dot: "bg-teal-400",
  },
  {
    key: "setup",
    label: "Getting set up",
    emoji: "🟢",
    blurb: "Claimed, arrived on the dashboard, edited their profile",
    eventTypes: [
      "claim_completed",
      "dashboard_arrival",
      "provider_picker_impression",
      "provider_picker_clicked",
      "provider_profile_edited",
      "notification_settings_viewed",
      "notification_preference_saved",
      "provider_saved",
    ],
    tileActive: "border-emerald-300 bg-emerald-50",
    badge: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-400",
  },
  {
    key: "reviews",
    label: "Reviews",
    emoji: "⭐",
    blurb: "Viewed or acted on their reviews",
    eventTypes: ["review_viewed", "reviews_cta_clicked"],
    tileActive: "border-violet-300 bg-violet-50",
    badge: "bg-violet-50 text-violet-700",
    dot: "bg-violet-400",
  },
  {
    key: "outbound",
    label: "Finding families",
    emoji: "📣",
    blurb: "Browsed and reached out to families in Find Families",
    eventTypes: [
      "matches_page_viewed",
      "matches_card_clicked",
      "matches_message_generated",
      "matches_outreach_sent",
    ],
    tileActive: "border-indigo-300 bg-indigo-50",
    badge: "bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-400",
  },
  {
    key: "growth",
    label: "Growing their business",
    emoji: "📈",
    blurb: "Saw the managed-ads pitch, viewed their market, worked the playbook",
    eventTypes: [
      "market_diagnostic_viewed_no_leads",
      "market_outreach_status_updated",
      "referral_source_viewed",
      "referral_call_clicked",
      "managed_ads_pitch_viewed",
      "managed_ads_cta_clicked",
      "managed_ads_boost_viewed",
      "managed_ads_requested",
      "your_market_viewed",
      "your_market_playbook_clicked",
    ],
    tileActive: "border-fuchsia-300 bg-fuchsia-50",
    badge: "bg-fuchsia-50 text-fuchsia-700",
    dot: "bg-fuchsia-400",
  },
  {
    key: "insights",
    label: "Checking insights",
    emoji: "📊",
    blurb: "Looked at their analytics",
    eventTypes: ["analytics_teaser_impression", "analytics_teaser_cta_clicked"],
    tileActive: "border-amber-300 bg-amber-50",
    badge: "bg-amber-50 text-amber-700",
    dot: "bg-amber-400",
  },
  {
    key: "flags",
    label: "Trust flags",
    emoji: "🚩",
    blurb: "Suspicious claims, low-trust sign-ins, and broken magic links",
    // NOTE: the API also folds low-trust one_click_access into this bucket via a
    // metadata check (see categorySummaryFilter / handleFeedView). Listing only
    // suspicious_claim + one_click_failed here keeps the event→category map
    // unambiguous.
    eventTypes: ["suspicious_claim", "one_click_failed"],
    tileActive: "border-red-300 bg-red-50",
    badge: "bg-red-50 text-red-700",
    dot: "bg-red-400",
  },
];

export const PROVIDER_CATEGORY_MAP: Record<ProviderCategoryKey, ProviderCategoryMeta> =
  PROVIDER_CATEGORIES.reduce(
    (acc, c) => {
      acc[c.key] = c;
      return acc;
    },
    {} as Record<ProviderCategoryKey, ProviderCategoryMeta>
  );

const EVENT_TO_CATEGORY: Record<string, ProviderCategoryKey> = {};
for (const cat of PROVIDER_CATEGORIES) {
  for (const ev of cat.eventTypes) EVENT_TO_CATEGORY[ev] = cat.key;
}

export function categoryForEvent(eventType: string): ProviderCategoryKey | null {
  return EVENT_TO_CATEGORY[eventType] ?? null;
}

export function isProviderCategory(value: string | null | undefined): value is ProviderCategoryKey {
  return !!value && value in PROVIDER_CATEGORY_MAP;
}

export function eventTypesForCategory(key: ProviderCategoryKey): string[] {
  return PROVIDER_CATEGORY_MAP[key]?.eventTypes ?? [];
}

/**
 * Humanized, past-tense descriptions for the feed. Never show a raw snake_case
 * event name to an operator — that opacity is half of why the tab felt lost.
 */
export const PROVIDER_EVENT_LABELS: Record<string, string> = {
  // Working leads
  lead_opened: "Opened a lead",
  contact_revealed: "Copied a family's contact",
  phone_clicked: "Called a family",
  email_link_clicked: "Emailed a family",
  continue_in_inbox: "Continued in their inbox",
  one_click_access: "Signed in via email link",
  email_click: "Clicked an email link",
  // Answering questions
  question_responded: "Answered a question",
  // Getting set up
  claim_completed: "Claimed their profile",
  dashboard_arrival: "Arrived at the dashboard",
  provider_picker_impression: "Saw a dashboard prompt",
  provider_picker_clicked: "Tapped a dashboard prompt",
  notification_settings_viewed: "Opened notification settings",
  notification_preference_saved: "Saved notification preferences",
  provider_profile_edited: "Edited their profile",
  provider_saved: "Saved profile changes",
  // Reviews
  review_viewed: "Viewed a review",
  reviews_cta_clicked: "Tapped the reviews prompt",
  // Finding families
  matches_page_viewed: "Opened Find Families",
  matches_card_clicked: "Viewed a family match",
  matches_message_generated: "Generated an outreach message",
  matches_outreach_sent: "Sent outreach to a family",
  // Growing their business
  market_diagnostic_viewed_no_leads: "Saw the managed-ads pitch",
  market_outreach_status_updated: "Updated a market referral",
  referral_source_viewed: "Reviewed a referral source",
  referral_call_clicked: "Tapped a referral call link",
  managed_ads_pitch_viewed: "Saw a managed-ads pitch",
  managed_ads_cta_clicked: "Tapped a managed-ads CTA",
  managed_ads_boost_viewed: "Viewed the managed-ads page",
  managed_ads_requested: "Requested a managed-ads campaign",
  your_market_viewed: "Viewed Growth",
  your_market_playbook_clicked: "Tapped a Growth playbook step",
  // Trust flags
  suspicious_claim: "Flagged claim attempt",
  one_click_failed: "Magic link sign-in failed",
};

/** Friendly phrase for a feed row; falls back to a de-snaked label. */
export function providerEventLabel(eventType: string): string {
  if (PROVIDER_EVENT_LABELS[eventType]) return PROVIDER_EVENT_LABELS[eventType];
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Badge classes for an event, colored by its category. */
export function providerEventBadge(eventType: string): string {
  const key = categoryForEvent(eventType);
  return key ? PROVIDER_CATEGORY_MAP[key].badge : "bg-gray-100 text-gray-600";
}

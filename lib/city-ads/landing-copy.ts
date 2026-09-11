import type { CityLandingArm } from "./landing-variant";

/**
 * Every user-facing string on the /care/{city} landing page, per A/B arm.
 *
 * WHY THIS IS A DATA FILE AND NOT JSX.
 * When copy lives inline in the component, changing a headline means editing
 * React, which means whoever edits it is also touching logic, which means copy
 * drifts while a reviewer is reading the mechanics. Pulling it out gives the
 * words their own review surface: someone who writes can rewrite this file
 * without reading a line of TSX, and someone fixing a bug in the component
 * cannot silently reword the page on the way past.
 *
 * It also makes the arms comparable. Three arms whose differences are spread
 * across three branches of JSX are hard to diff; three entries in one table
 * are not. If two arms differ only in a button label, that is now obvious at a
 * glance, and an arm that differs only in wording is not worth a third of the
 * traffic.
 *
 * HOW TO FILL THIS IN.
 * Every field is required, so a new arm cannot ship half-written. Keep to the
 * house rules for family-facing copy: plain sentences, no em dashes, never
 * promise a timescale the staffed window cannot keep, and never describe the
 * family's situation back to them as a crisis.
 *
 * `staffed` / `unstaffed` exist because STAFFED_HOURS is 8am to noon in the
 * city's own timezone and 68% of the first flight's visitors arrived outside
 * it. Both strings have to be true on their own.
 */

export interface CityLandingCopy {
  /** H1. `{city}` is substituted. */
  headline: string;
  /** The line under the headline, inside the staffed callback window. */
  staffed: string;
  /** The same line outside it. Must not promise same-day contact. */
  unstaffed: string;
  /** The primary button. */
  cta: string;
  /** The reassurance line under the button, inside the window. */
  footnoteStaffed: string;
  /** The same, outside it. */
  footnoteUnstaffed: string;
  /** First row of "How it works", as [title, aside]. */
  firstStep: [string, string];
  /**
   * Commitment reassurance, shown next to the action.
   *
   * The three frictions a visitor feels are relevance ("is there care for me
   * here"), effort ("how much work is this") and COMMITMENT ("what happens if I
   * give you my number"). Proof and short forms attack the first two. Nothing
   * on the page attacked the third until this line existed. Empty on control,
   * which is reference only.
   */
  reassure: string;
}

/**
 * `{city}` and `{count}` are the only tokens. Anything else is literal.
 */
export const CITY_LANDING_COPY: Record<CityLandingArm, CityLandingCopy> = {
  /** Reference only. Not assigned to traffic. Do not improve it. */
  control: {
    headline: "Looking for senior care in {city}?",
    staffed: "Tell us what you need. We call you back today. Free.",
    unstaffed: "Tell us what you need. We call you back in the morning. Free.",
    cta: "Get started",
    footnoteStaffed: "Four questions · We call you back · Never sold",
    footnoteUnstaffed: "Four questions · We call you back · Never sold",
    firstStep: ["Answer four questions", "About two minutes"],
    reassure: "",
  },

  /** PROOF, THEN ASK. */
  providers_first: {
    headline: "Senior care in {city}, from people who work here.",
    staffed: "{count} near {city} on Olera. Tap any of them to see what they do.",
    unstaffed: "{count} near {city} on Olera. Tap any of them to see what they do.",
    cta: "Request a call",
    footnoteStaffed: "Free for families · Never sold",
    footnoteUnstaffed: "Free for families · Never sold",
    firstStep: ["Tell us what you need", "About a minute"],
    // The single best line either review produced. It removes a fear neither
    // analysis had named: not effort, not relevance, but being committed to
    // something. Airbnb puts "Free cancellation" under the price for the same
    // reason.
    reassure: "Requesting a call does not book care. You do not have to choose a provider yet.",
  },

  /** ASK, THEN PROOF. */
  one_screen: {
    headline: "Find senior care in {city}.",
    staffed: "Answer three things and a real person from Olera calls to talk it through. Free for families.",
    unstaffed: "Answer three things and a real person from Olera calls to talk it through. Free for families.",
    cta: "Request a call",
    footnoteStaffed: "Takes about thirty seconds · Never sold",
    footnoteUnstaffed: "Takes about thirty seconds · Never sold",
    firstStep: ["Answer three things", "About thirty seconds"],
    reassure: "Requesting a call does not book care. You do not have to choose a provider yet.",
  },

  /** DIAGNOSE, THEN ASK. */
  guidance: {
    headline: "Not sure where to start in {city}?",
    staffed: "Two questions and we will point you at a sensible first step. Then we can talk it through if you want.",
    unstaffed: "Two questions and we will point you at a sensible first step. Then we can talk it through if you want.",
    cta: "Show me where to start",
    footnoteStaffed: "Two questions · No contact details needed yet",
    footnoteUnstaffed: "Two questions · No contact details needed yet",
    firstStep: ["Answer two questions", "About twenty seconds"],
    reassure: "Requesting a call does not book care. You do not have to choose a provider yet.",
  },
};

/** Substitute the tokens. Unknown tokens are left alone rather than blanked. */
export function fillCopy(
  template: string,
  vars: { city: string; count?: string },
): string {
  return template
    .replace(/\{city\}/g, vars.city)
    .replace(/\{count\}/g, vars.count ?? "");
}

/**
 * "3 providers" / "One provider". Spelled out at one because a bare "1
 * provider" next to a list of one card reads like a database row.
 */
export function providerCountLabel(n: number): string {
  if (n === 1) return "One provider";
  return `${n} providers`;
}

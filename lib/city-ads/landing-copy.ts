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
}

/**
 * `{city}` and `{count}` are the only tokens. Anything else is literal.
 */
export const CITY_LANDING_COPY: Record<CityLandingArm, CityLandingCopy> = {
  /**
   * The page exactly as it ran through the first flight. Do not improve this
   * one. It is the baseline every other arm is measured against, and a control
   * that quietly gets better measures nothing.
   */
  control: {
    headline: "Looking for senior care in {city}?",
    staffed: "Tell us what you need. We call you back today. Free.",
    unstaffed: "Tell us what you need. We call you back in the morning. Free.",
    cta: "Get started",
    footnoteStaffed: "Four questions · We call you back · Never sold",
    footnoteUnstaffed: "Four questions · We call you back · Never sold",
    firstStep: ["Answer four questions", "About two minutes"],
  },

  /**
   * Proof before the ask. The provider cards render above the button and open
   * in place, so a visitor can take the proof without taking the ask.
   */
  providers_first: {
    headline: "Home care in {city}, from people who work here.",
    staffed: "{count} on Olera near {city}. Tap any of them to see what they do.",
    unstaffed: "{count} on Olera near {city}. Tap any of them to see what they do.",
    cta: "Find care near me",
    footnoteStaffed: "Four questions · We call you back today · Never sold",
    footnoteUnstaffed: "Four questions · We call you back in the morning · Never sold",
    firstStep: ["Answer four questions", "About two minutes"],
  },

  /**
   * A smaller ask. One question instead of four before the contact step.
   */
  fewer_questions: {
    headline: "Looking for senior care in {city}?",
    staffed: "One question, then your number. We call you back today. Free.",
    unstaffed: "One question, then your number. We call you back in the morning. Free.",
    cta: "Get started",
    footnoteStaffed: "One question · We call you back today · Never sold",
    footnoteUnstaffed: "One question · We call you back in the morning · Never sold",
    firstStep: ["Answer one question", "About twenty seconds"],
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

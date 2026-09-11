import type { CityLandingArm } from "./landing-variant";

/**
 * Every user-facing string on the /care/{city} landing page, per A/B arm.
 *
 * WHY THIS IS A DATA FILE AND NOT JSX. When copy lives inline in the component,
 * changing a headline means editing React, so whoever edits words is also
 * touching logic and a reviewer reading the mechanics never sees the wording go
 * past. Here the words have their own review surface.
 *
 * THE SHAPE ENFORCES THE DISCIPLINE. There is ONE sub line and ONE micro line,
 * not two of each. The first build stacked a footnote and a reassurance under
 * every button — two lines of small grey text, 21 words between them, directly
 * under the one element that should be unmissable. The type system now makes
 * that impossible rather than relying on anyone's restraint.
 *
 * THE WORD BUDGET, and it is a real constraint:
 *   headline   6 words
 *   sub        8 words
 *   cta        4 words
 *   micro      6 words
 *
 * Airbnb carries an entire listing's value and its risk reversal in six words:
 * "From $65 / guest" above "Free cancellation". If a line here needs more than
 * its budget, the line is doing a job the page should be doing instead.
 *
 * The city is already in the header, so a headline does not need to repeat it.
 *
 * HOUSE RULES. Plain sentences. No em dashes. Never promise a timescale the
 * staffed window cannot keep. Never describe the family's situation back to
 * them as a crisis.
 */

export interface CityLandingCopy {
  /** H1. `{city}` is substituted. Six words. */
  headline: string;
  /** The one line under it. Eight words. `{count}` is substituted. */
  sub: string;
  /** Control only: the out-of-hours variant of `sub`. No other arm makes a
   *  timing claim, so no other arm needs two versions. */
  subUnstaffed?: string;
  /** The button. Four words. */
  cta: string;
  /**
   * The single small line under the action. Six words.
   *
   * It carries BOTH the price and the risk reversal, the way Airbnb puts "Free
   * cancellation" directly under the price. Three frictions stop a visitor —
   * relevance, effort and commitment — and this line is the only thing on the
   * page attacking commitment.
   */
  micro: string;
  /** First row of "How it works", as [title, aside]. */
  firstStep: [string, string];
}

export const CITY_LANDING_COPY: Record<CityLandingArm, CityLandingCopy> = {
  /** Reference only, never assigned. Do not improve it. */
  control: {
    headline: "Looking for senior care in {city}?",
    sub: "Tell us what you need. We call you back today. Free.",
    subUnstaffed: "Tell us what you need. We call you back in the morning. Free.",
    cta: "Get started",
    micro: "Four questions · We call you back · Never sold",
    firstStep: ["Answer four questions", "About two minutes"],
  },

  /** PROOF, THEN ASK. The cards are the sub line; they do not need narrating. */
  providers_first: {
    headline: "Care from people who work here.",
    sub: "{count} near you on Olera.",
    cta: "Request a call",
    micro: "Free · Does not book care",
    firstStep: ["Tell us what you need", "About a minute"],
  },

  /** ASK, THEN PROOF. */
  one_screen: {
    headline: "Find senior care in {city}.",
    sub: "Three questions. A real person calls you.",
    cta: "Request a call",
    micro: "Free · Does not book care",
    firstStep: ["Answer three questions", "About thirty seconds"],
  },

  /** DIAGNOSE, THEN ASK. */
  guidance: {
    headline: "Not sure where to start?",
    sub: "Two questions, then a real first step.",
    // Used on the guide screen. Guidance has no intro button: its first
    // question is the page.
    cta: "Request a call",
    micro: "Free · No details needed yet",
    firstStep: ["Answer two questions", "About twenty seconds"],
  },
};

/** Substitute the tokens. Unknown tokens are left alone rather than blanked. */
export function fillCopy(template: string, vars: { city: string; count?: string }): string {
  return template.replace(/\{city\}/g, vars.city).replace(/\{count\}/g, vars.count ?? "");
}

/**
 * "3 providers" / "One provider". Spelled out at one because a bare "1 provider"
 * next to a single card reads like a database row.
 */
export function providerCountLabel(n: number): string {
  return n === 1 ? "One provider" : `${n} providers`;
}

/**
 * A/B arms for the /care/{city} paid landing page.
 *
 * WHY THIS EXISTS. Between 10 Sep 07:22 UTC and 11 Sep 02:08 UTC, 30 paid
 * visitors across Google, Meta and Nextdoor reached this page and not one
 * pressed "Get started". Three channels, three audiences, one shared page,
 * zero first clicks. That is the only thing the first flight measured that it
 * did not set out to measure, and it is the thing worth testing.
 *
 * THE ARMS TEST TWO DIFFERENT THEORIES OF WHY A STRANGER LEAVES:
 *
 *   control          The page as it ran. Headline, one line of promise, a
 *                    button, then providers and How it works below.
 *
 *   providers_first  Proof before ask. The three real local providers move
 *                    ABOVE the button, so the first thing on screen is
 *                    something the visitor came for rather than a form.
 *                    Theory: they will not commit before seeing anything real.
 *                    Note this arm only became possible on 10 Sep — the cards
 *                    never rendered for anyone during the whole first flight,
 *                    because the page gated them on the ON CALL texting flag.
 *
 *   one_screen       The whole request on a single screen: care type as chips,
 *                    first name, mobile, consent, submit. No intro screen, no
 *                    quiz, nothing to advance through. A sticky action bar
 *                    keeps Submit reachable while the fields scroll under it.
 *                    Theory: the thing we are optimising is COMPLETED
 *                    SUBMISSIONS per paid landing, and every other concept on
 *                    the table changes what happens BEFORE the form while
 *                    leaving the form itself untouched. The form is where a
 *                    submission is actually won or lost and nobody is testing
 *                    it.
 *
 *                    It replaced an earlier `fewer_questions` arm, which cut
 *                    the quiz from four questions to one and was the weakest
 *                    thing on the table: on the first screen it was identical
 *                    to control, so a third of the traffic would have bought a
 *                    copy change. The evidence also went against it —
 *                    multi-step forms outperform single-page ones, and "how
 *                    many questions" and "how they are distributed" are
 *                    separate variables that it conflated.
 *
 * WHAT IS DELIBERATELY NOT AN ARM: RESPONSE TIME. 84% of paid landings arrive
 * outside the 8am-noon callback window, so any same-day promise is a walk-back
 * for most visitors. The resolution is not to align the page to the ad, it is
 * to carry NO timing claim on the first screen at all — it is the one thing we
 * cannot guarantee, and whether we call at 8am or 2pm has no bearing on whether
 * someone submits. Those are decoupled. Control keeps its existing wording
 * because a baseline that quietly improves measures nothing.
 *
 * SAME URL, ALWAYS. Every arm serves from the existing Final URL. Changing an
 * ad's Final URL in this Google account triggers a "Confirm it's you" re-auth
 * that has twice wiped every headline, description and keyword on the campaign
 * (10 Aug, and again during the LumiWell build). A landing-page test must never
 * be worth that risk. Content changes here; Google is not touched.
 */

export const CITY_LANDING_ARMS = ["control", "providers_first", "one_screen"] as const;

export type CityLandingArm = (typeof CITY_LANDING_ARMS)[number];

/**
 * Cookie the client writes after first paint so a reload keeps the same arm.
 * The server reads it when present and assigns fresh when it is not.
 *
 * A Server Component cannot set cookies, so the server cannot both assign and
 * persist in one pass. That is fine here: these are one-shot paid landings, so
 * the common case is a visitor who arrives once and never reloads. The cookie
 * exists to stop the rarer reload from re-rolling the arm mid-session.
 */
export const CITY_ARM_COOKIE = "olera_city_arm";

/** 30 days, matching the olera_session cookie in lib/analytics/session.ts. */
export const CITY_ARM_TTL_SECONDS = 60 * 60 * 24 * 30;

export function isCityLandingArm(v: unknown): v is CityLandingArm {
  return typeof v === "string" && (CITY_LANDING_ARMS as readonly string[]).includes(v);
}

/**
 * Weighted split: the control is a sanity check, not a measurement.
 *
 * THE OUTCOME IS COMPLETED SUBMISSIONS PER PAID LANDING. CTA presses and form
 * starts diagnose friction; callbacks and conversations are separate downstream
 * outcomes and do not decide which page wins.
 *
 * Control takes 10% because we already have 30 observations on it and none of
 * them converted; spending a third of the remaining money re-measuring that
 * buys nothing. Each challenger takes 30%, which over the ~450 landings the
 * remaining budget supports is ~135 apiece.
 *
 * WHAT THAT SAMPLE CAN AND CANNOT DO. At 135 visitors a true 3% arm shows zero
 * only about 1.6% of the time, so this reliably separates "produces
 * submissions" from "produces none". It CANNOT rank two arms that both work:
 * separating 5% from 10% needs several hundred each. A one-submission gap is
 * noise. And the 10% control at ~45 visitors cannot estimate lift against
 * baseline at all, which is accepted rather than overlooked.
 */
export function pickCityLandingArm(): CityLandingArm {
  const r = Math.random();
  if (r < 0.1) return "control";
  return r < 0.4 ? "providers_first" : "one_screen";
}

/**
 * Resolve the arm for one request.
 *
 * Order: an explicit ?v= override (for review — never assigned to real
 * traffic), then the persisted cookie, then a fresh random pick.
 */
export function resolveCityLandingArm(input: {
  override?: string | null;
  cookie?: string | null;
}): { arm: CityLandingArm; assigned: boolean } {
  if (isCityLandingArm(input.override)) return { arm: input.override, assigned: false };
  if (isCityLandingArm(input.cookie)) return { arm: input.cookie, assigned: false };
  return { arm: pickCityLandingArm(), assigned: true };
}

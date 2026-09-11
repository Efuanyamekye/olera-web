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
 *   fewer_questions  Smaller ask. One question instead of four before the
 *                    contact step, and the intro says so. Theory: the barrier
 *                    is the size of the commitment, not the proof on offer.
 *
 * WHAT IS DELIBERATELY NOT AN ARM. The ads promise "We Call You Back Today"
 * while the page says "in the morning" to anyone arriving outside 8am-noon
 * local, which was 68% of the first flight. That is a defect, not a variable,
 * and the honest fix is on the Google ad copy. Putting it in an arm would be
 * testing a lie against the truth. Control keeps the current behaviour so the
 * comparison stays clean.
 *
 * SAME URL, ALWAYS. Every arm serves from the existing Final URL. Changing an
 * ad's Final URL in this Google account triggers a "Confirm it's you" re-auth
 * that has twice wiped every headline, description and keyword on the campaign
 * (10 Aug, and again during the LumiWell build). A landing-page test must never
 * be worth that risk. Content changes here; Google is not touched.
 */

export const CITY_LANDING_ARMS = ["control", "providers_first", "fewer_questions"] as const;

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
 * Even split across the three arms.
 *
 * Equal weights on purpose. The live flight runs ~38 clean paid landings a
 * day, so three arms get ~13 each and reach ~38 apiece in three days. At a 10%
 * engagement rate the chance of seeing zero in 38 is under 2%, which makes the
 * test decisive on the only question this sample size can answer: DOES ANY
 * VERSION GET A STRANGER TO START AT ALL. It cannot rank two arms that both
 * work — separating 5% from 10% needs several hundred per arm and is not
 * available before the flight ends. Do not read a 2-point gap as a winner.
 */
export function pickCityLandingArm(): CityLandingArm {
  return CITY_LANDING_ARMS[Math.floor(Math.random() * CITY_LANDING_ARMS.length)];
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

/**
 * The finder vs conversation split (7 Oct 2026).
 *
 * Half of the new families who open /benefits/finder are sent to the
 * conversation (/benefits/conversation) instead. The arm is drawn once and
 * kept in this browser, so a family who comes back sees the same thing, and
 * every event from a randomized browser carries it as metadata.split_arm.
 * The daily brief compares the two arms on those events only: the Phase 3
 * test is "caregivers complete the conversation at least as often as the
 * form".
 *
 * Some visits always see the form:
 *  - a browser with a saved form draft or plan (this includes the
 *    conversation's own "Text me this", which hands its plan to the form;
 *    a randomized family keeps its tag there);
 *  - crawlers, so search engines keep seeing the indexed form.
 * Study families (a ?cohort= link, or a browser that once opened one) always
 * get the conversation, the product the CARE-NAV study evaluates, unless
 * they have a saved form to come back to (8 Oct 2026; before that they got
 * the form, because the conversation dropped the tag).
 * A browser that was never randomized (a saved draft from before the split,
 * a study family, a crawler) gets no arm and stays out of the comparison.
 *
 * ?arm=form or ?arm=conversation pins the page for testing; pinned browsers
 * stay out of the comparison too.
 */

export type FinderArm = "form" | "conversation";

const ARM_KEY = "olera-benefits-arm";
const PINNED = "pinned-";
/** Share of new families sent to the conversation. 0 turns the split off. */
export const CONVERSATION_SHARE = 0.5;
const BOT_RE = /bot|crawl|spider|slurp|google|bing|lighthouse|headless|preview/i;

/** Accepted values of metadata.split_arm on finder and conversation events. */
export function isSplitArm(value: unknown): value is FinderArm {
  return value === "form" || value === "conversation";
}

function read(): string | null {
  try {
    return localStorage.getItem(ARM_KEY);
  } catch {
    return null;
  }
}

function write(value: string) {
  try {
    localStorage.setItem(ARM_KEY, value);
  } catch {
    // Private window: the family gets an arm for this visit only.
  }
}

/** The arm this browser was randomized into; null if never drawn or pinned. */
export function splitArm(): FinderArm | null {
  if (CONVERSATION_SHARE <= 0) return null;
  const v = read();
  return isSplitArm(v) ? v : null;
}

/**
 * What a visit to /benefits/finder shows, and the arm its events carry
 * (null: not in the comparison). `hasSavedForm` is true when the form found
 * a draft or plan to restore.
 */
export function finderVisit(params: URLSearchParams, hasSavedForm: boolean, studyCohort: string | null = null): { show: FinderArm; arm: FinderArm | null } {
  const pin = params.get("arm");
  if (isSplitArm(pin)) {
    write(PINNED + pin);
    return { show: hasSavedForm ? "form" : pin, arm: null };
  }
  const v = read();
  if (v?.startsWith(PINNED)) {
    return { show: !hasSavedForm && v === `${PINNED}conversation` ? "conversation" : "form", arm: null };
  }
  if (studyCohort || params.get("cohort")) return { show: hasSavedForm ? "form" : "conversation", arm: null };
  // Off means off, including browsers already given the conversation.
  if (CONVERSATION_SHARE <= 0) return { show: "form", arm: null };

  let arm = splitArm();
  if (!arm) {
    if (hasSavedForm || (typeof navigator !== "undefined" && BOT_RE.test(navigator.userAgent))) return { show: "form", arm: null };
    arm = Math.random() < CONVERSATION_SHARE ? "conversation" : "form";
    write(arm);
  }
  return { show: hasSavedForm ? "form" : arm, arm };
}

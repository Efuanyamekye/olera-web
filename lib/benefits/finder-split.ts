/**
 * The finder vs conversation split (7 Oct 2026).
 *
 * Half of the families who open /benefits/finder are sent to the
 * conversation (/benefits/conversation) instead. Both log the same funnel
 * events under different variants (finder_v2 / conversation_v1), so one
 * query compares them: the Phase 3 test is "caregivers complete the
 * conversation at least as often as the form".
 *
 * The arm is kept in this browser, so a family who comes back sees the same
 * thing. Some visits always stay on the form:
 *  - a family with a saved form draft or plan (this includes the
 *    conversation's own "Text me this", which hands its plan to the form);
 *  - a study link (?cohort=), because the conversation doesn't carry the tag;
 *  - crawlers, so search engines keep seeing the indexed form.
 *
 * ?arm=form or ?arm=conversation pins the arm, for testing.
 */

export type FinderArm = "form" | "conversation";

const ARM_KEY = "olera-benefits-arm";
/** Share of new families sent to the conversation. 0 turns the split off. */
export const CONVERSATION_SHARE = 0.5;
const BOT_RE = /bot|crawl|spider|slurp|google|bing|lighthouse|headless|preview/i;

function stored(): FinderArm | null {
  try {
    const v = localStorage.getItem(ARM_KEY);
    return v === "form" || v === "conversation" ? v : null;
  } catch {
    return null;
  }
}

function store(arm: FinderArm) {
  try {
    localStorage.setItem(ARM_KEY, arm);
  } catch {
    // Private window: the family gets an arm for this visit only.
  }
}

/**
 * Whether this visit to the finder should go to the conversation.
 * `hasSavedForm` is true when the form found a draft or plan to restore.
 */
export function sendToConversation(params: URLSearchParams, hasSavedForm: boolean): boolean {
  const pinned = params.get("arm");
  if (pinned === "form" || pinned === "conversation") {
    store(pinned);
    return pinned === "conversation";
  }
  if (hasSavedForm || params.get("cohort")) return false;
  if (typeof navigator !== "undefined" && BOT_RE.test(navigator.userAgent)) return false;

  let arm = stored();
  if (!arm) {
    arm = Math.random() < CONVERSATION_SHARE ? "conversation" : "form";
    store(arm);
  }
  return arm === "conversation";
}

/** Marks a conversation visit that came through the split. */
export const SPLIT_PARAM = "from";
export const SPLIT_VALUE = "finder";

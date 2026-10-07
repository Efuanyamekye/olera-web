/**
 * The study tag, kept in the browser (8 Oct 2026).
 *
 * A study link carries ?cohort=v1. The first visit through it stores the tag
 * here, and it stays: a participant who later types olera.care, or opens a
 * letter, is still counted as a participant. Every finder, interview and
 * apply event carries it (lib/analytics/track-step.ts), and the plan they
 * save puts it on their record.
 */

const KEY = "olera-study-cohort";
/** This page's tag when storage is blocked (a private window). */
let unstored: string | null = null;

/** Short, safe cohort ids only ("v1", "iib-c1"). Anything else is ignored. */
export const COHORT_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/i;

export function isCohortId(value: unknown): value is string {
  return typeof value === "string" && COHORT_RE.test(value);
}

/** The tag this browser carries, or null. */
export function studyCohort(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return unstored;
    const id = (JSON.parse(raw) as { id?: unknown })?.id;
    return isCohortId(id) ? id : unstored;
  } catch {
    return unstored;
  }
}

/**
 * Store a study link's ?cohort= if there is one, and return the tag this
 * browser now carries. A new link replaces an older tag.
 */
export function captureStudyCohort(params: URLSearchParams): string | null {
  const fromLink = params.get("cohort");
  if (isCohortId(fromLink)) {
    const id = fromLink.toLowerCase();
    try {
      localStorage.setItem(KEY, JSON.stringify({ id, at: new Date().toISOString() }));
    } catch {
      // Private window: the tag still rides this page's events and save.
      unstored = id;
    }
    return id;
  }
  return studyCohort();
}

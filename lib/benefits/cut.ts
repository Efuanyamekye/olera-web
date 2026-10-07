/**
 * Follow-up answers on a money range: "under:1796" ($1,796 or less),
 * "over:1796", or "skip:1796" (asked, not sure), comma-joined when a second
 * follow-up narrowed the same range ("over:1816,under:2455"). Client-safe,
 * so the conversation page can build one without pulling the question engine
 * (and its server imports) into the browser.
 */
export interface Cut { at: number; under: boolean | null }

/** At most this many follow-ups on one range. */
export const MAX_CUTS = 2;

export function parseCuts(v: string | null | undefined): Cut[] | null {
  if (!v) return null;
  const out: Cut[] = [];
  for (const part of v.split(",")) {
    const m = /^(under|over|skip):(\d{1,7})$/.exec(part);
    if (!m) return null;
    out.push({ at: parseInt(m[2], 10), under: m[1] === "skip" ? null : m[1] === "under" });
  }
  return out.length && out.length <= MAX_CUTS ? out : null;
}

/** The first follow-up as one value, for a caller that needs only that. */
export function parseCut(v: string | null | undefined): { at: number; under: boolean } | null {
  const c = parseCuts(v)?.[0];
  return c && c.under != null ? { at: c.at, under: c.under } : null;
}

/** Add an answer (true: or less, false: more, null: not sure) to what's held. */
export function addCut(prev: string | null | undefined, at: number, under: boolean | null): string {
  const part = `${under == null ? "skip" : under ? "under" : "over"}:${Math.round(at)}`;
  return prev ? `${prev},${part}` : part;
}

export function cutAnswer(at: number, under: boolean): string {
  return addCut(null, at, under);
}

/**
 * A range narrowed by its follow-ups: "or less" caps it at the figure, "more"
 * starts just above. A figure outside what's left of the range was asked about
 * another range (the family changed their answer afterwards) and is ignored.
 */
export function narrowRange(range: [number, number], cut: string | null | undefined): [number, number] {
  let [lo, hi] = range;
  for (const c of parseCuts(cut) || []) {
    if (c.under == null || c.at <= lo || c.at >= hi) continue;
    [lo, hi] = c.under ? [lo, Math.min(hi, c.at)] : [Math.max(lo, c.at + 1), hi];
  }
  return [lo, hi];
}

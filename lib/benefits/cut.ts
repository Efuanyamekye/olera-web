/**
 * A follow-up answer on a money range: "under:1796" ($1,796 or less) or
 * "over:1796". Client-safe, so the conversation page can build one without
 * pulling the question engine (and its server imports) into the browser.
 */
export function parseCut(v: string | null | undefined): { at: number; under: boolean } | null {
  const m = /^(under|over):(\d{1,7})$/.exec(v || "");
  return m ? { at: parseInt(m[2], 10), under: m[1] === "under" } : null;
}

export function cutAnswer(at: number, under: boolean): string {
  return `${under ? "under" : "over"}:${Math.round(at)}`;
}

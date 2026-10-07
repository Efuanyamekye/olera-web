import { createHash } from "node:crypto";

/**
 * Press, the pure part: what a journalist query looks like once extracted
 * from a digest, which ones are worth a pitch, and the words around them.
 * The database and model side is press.server.ts; scripts/check-press.ts
 * checks this file. docs/cortex/PRESS.md is the policy and the facts.
 */

export const PRESS_ALIAS = () => (process.env.PRESS_INBOX_ALIAS || "press@olera.care").toLowerCase();

/** A query is worth a pitch at this fit or above (0..1, judged by the model against the angles). */
export const PRESS_FIT_FLOOR = 0.6;
/** Pitches proposed per inbox pass, so the founder reads three good ones, not twelve. */
export const PRESS_PITCHES_PER_PASS = 3;

export type PressQuery = {
  outlet: string;
  reporter: string | null;
  email: string | null;
  query: string;
  deadline: string | null;
  /** 0..1 against the angles in PRESS.md. */
  fit: number;
  /** Which angle it matches, in a few words. */
  angle: string | null;
};

/** Is this message addressed to the press alias (To or Cc)? */
export function isToPressAlias(toEmails: string[], ccEmails: string[]): boolean {
  const alias = PRESS_ALIAS();
  return [...toEmails, ...ccEmails].some((e) => e.trim().toLowerCase() === alias);
}

/** One query, one row: the same query in two digests (or re-synced) is one pitch. */
export function queryHash(threadId: string, q: Pick<PressQuery, "email" | "query">): string {
  return createHash("sha1").update(`${threadId}\n${(q.email ?? "").toLowerCase()}\n${q.query.slice(0, 120).toLowerCase()}`).digest("hex").slice(0, 20);
}

/**
 * Read the model's extraction. Anything not a JSON array of objects with a
 * query is dropped; fit is clamped; emails are trimmed and lower-cased.
 */
export function parsePressQueries(raw: string): PressQuery[] {
  const text = raw.trim();
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  let arr: unknown;
  try { arr = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: PressQuery[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const query = typeof o.query === "string" ? o.query.trim() : "";
    if (query.length < 15) continue;
    const fitRaw = typeof o.fit === "number" ? o.fit : Number(o.fit);
    const email = typeof o.email === "string" && /\S+@\S+\.\S+/.test(o.email) ? o.email.trim().toLowerCase() : null;
    out.push({
      outlet: typeof o.outlet === "string" && o.outlet.trim() ? o.outlet.trim().slice(0, 120) : "an outlet",
      reporter: typeof o.reporter === "string" && o.reporter.trim() ? o.reporter.trim().slice(0, 120) : null,
      email,
      query: query.slice(0, 1_000),
      deadline: typeof o.deadline === "string" && o.deadline.trim() ? o.deadline.trim().slice(0, 80) : null,
      fit: Number.isFinite(fitRaw) ? Math.max(0, Math.min(1, fitRaw)) : 0,
      angle: typeof o.angle === "string" && o.angle.trim() ? o.angle.trim().slice(0, 120) : null,
    });
  }
  return out;
}

/** Worth a pitch: a reply address and a fit at or above the floor, best first. */
export function worthPitching(queries: PressQuery[], floor = PRESS_FIT_FLOOR, limit = PRESS_PITCHES_PER_PASS): PressQuery[] {
  return queries.filter((q) => q.email && q.fit >= floor).sort((a, b) => b.fit - a.fit).slice(0, limit);
}

/** The subject line: the outlet's query, never a family's name. */
export function pitchSubject(q: PressQuery): string {
  const gist = q.query.replace(/\s+/g, " ").slice(0, 70).replace(/[.,;:]+$/, "");
  return `Re: ${gist}${q.query.length > 70 ? "…" : ""} (source: Olera)`;
}

/** The inbox-pass line for a pitch. */
export function pitchSummary(q: PressQuery): string {
  const who = q.reporter ? `${q.reporter}, ${q.outlet}` : q.outlet;
  const gist = q.query.replace(/\s+/g, " ").slice(0, 140);
  return `Pitch ${who}: "${gist}${q.query.length > 140 ? "…" : ""}"${q.deadline ? ` (due ${q.deadline})` : ""}${q.angle ? ` · ${q.angle}` : ""}`;
}

/**
 * The facts section of PRESS.md, so the drafter quotes only dated,
 * sourced numbers. Returns the "## Facts" and "## Angles" sections, or the
 * fallback when the file cannot be read.
 */
export function pressFactsFrom(markdown: string): string {
  const facts = markdown.match(/## Facts Cortex may use[\s\S]*?(?=\n## )/)?.[0] ?? "";
  const angles = markdown.match(/## Angles Cortex can pitch[\s\S]*?(?=\n## )/)?.[0] ?? "";
  return [facts.trim(), angles.trim()].filter(Boolean).join("\n\n");
}

export const PRESS_FACTS_FALLBACK = `## Facts Cortex may use
- Olera is a senior-care marketplace and benefits guide, NIH-funded (SBIR). Founders: TJ Falohun (CEO, biomedical engineer) and Logan DuBose, MD.
- Senior Housing News, 23 Jan 2026: Olera's angle is open connections between families and providers versus paid gatekeeping by lead aggregators.
Not to be quoted: dollar figures of benefits identified, any provider as a customer without written consent, family stories.

## Angles Cortex can pitch
- Open connections vs paid gatekeeping in senior-care referrals.
- Benefits are findable: a free finder families use.`;

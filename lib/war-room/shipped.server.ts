import { priorityFor, type PriorityKey } from "@/lib/war-room/priorities";

/**
 * What shipped since the last brief, per priority, from merged pull requests.
 *
 * The brief's opening lines were built from measured readings only, and no
 * reading measures the Benefits Finder, so that line read "No change since
 * Oct 3" through a week that shipped the knowledge base, the DC fact-check and
 * the judge fix. TJ, 2026-10-05: "This is wrong." A merged PR is a fact the
 * system can see, so a quiet priority now says what shipped instead.
 *
 * Reads GitHub with the token the archive sync already uses. Fails soft: on
 * any error the brief says nothing shipped rather than failing to send.
 */
export type ShippedItem = { number: number; title: string; mergedAt: string };
export type ShippedByPriority = Partial<Record<PriorityKey, ShippedItem[]>>;

type PullRow = { number: number; title: string; body: string | null; merged_at: string | null; base: { ref: string }; head: { ref: string } };

export async function loadShippedSince(since: string | null, now = new Date()): Promise<ShippedByPriority> {
  const repository = process.env.WAR_ROOM_GITHUB_REPOSITORY ?? "";
  const token = process.env.WAR_ROOM_GITHUB_TOKEN;
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return {};
  // No last brief: the past day, so the first run after a gap is not the whole history.
  const floor = Date.parse(since ?? "") || now.getTime() - 24 * 3_600_000;
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=60`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return {};
    const rows = (await response.json()) as PullRow[];
    return groupShipped(rows.map((r) => ({ number: r.number, title: r.title, body: r.body, mergedAt: r.merged_at, base: r.base?.ref, head: r.head?.ref })), floor);
  } catch {
    return {};
  }
}

/** Pure: merged since the floor, promotions and scratchpad logs left out, grouped by the priority the title names. */
export function groupShipped(
  pulls: Array<{ number: number; title: string; body?: string | null; mergedAt: string | null; base?: string; head?: string }>,
  floorMs: number,
): ShippedByPriority {
  const out: ShippedByPriority = {};
  for (const p of pulls) {
    if (!p.mergedAt || Date.parse(p.mergedAt) <= floorMs) continue;
    // A promotion repeats PRs already counted; a scratchpad entry is a log, not a ship.
    if (p.head === "staging" || /^promote staging/i.test(p.title) || /^scratchpad:/i.test(p.title)) continue;
    // The title first; a title that names no priority ("Move both phone
    // fields when the judge applies a phone") is read by its branch, then
    // its description, which did say benefits-apply-factcheck.
    const key = priorityFor(p.title) ?? priorityFor((p.head ?? "").replace(/[-_/]/g, " ")) ?? priorityFor((p.body ?? "").slice(0, 600));
    if (!key) continue;
    (out[key] ??= []).push({ number: p.number, title: p.title, mergedAt: p.mergedAt });
  }
  return out;
}

/** "Shipped since Oct 3: Benefits knowledge base, Phase 1 (#2330), Benefits fact-check: DC (#2336) and 2 more." */
export function shippedLine(items: ShippedItem[] | undefined, since: string | null): string | null {
  if (!items?.length) return null;
  const shown = items.slice(0, 2).map((i) => `${i.title.replace(/\.$/, "")} (#${i.number})`);
  const more = items.length - shown.length;
  return `Shipped${since ? ` since ${since}` : ""}: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`;
}

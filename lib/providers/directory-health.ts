/**
 * Directory health: what to do with one Google observation about a provider.
 *
 * Pure. The server module applies the decision and writes the ledger
 * (provider_health_actions, migration 272). The rule is reversibility, not
 * confidence: an archive is a soft delete with a 301 and one column to clear,
 * so Google's "permanently closed" is acted on at once rather than queued for
 * a human to confirm a hundred obvious ones (TJ, 6 Oct 2026: "waiting a month
 * seems kind of insane"). What is not reversible by a click, a substantive
 * rename or a temporary closure, is flagged and waits.
 */

export type GoogleBusinessStatus = "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

export type StatusObservation = {
  status: GoogleBusinessStatus | null;
  googleName: string | null;
};

export type ProviderForHealth = {
  provider_id: string;
  provider_name: string | null;
  deleted: boolean;
  google_status: string | null;
};

export type HealthDecision =
  | { kind: "closed_archived"; undo: { deleted: false; deleted_at: null; deletion_reason: null } }
  | { kind: "closed_temporarily" }
  | { kind: "rename_applied"; newName: string; undo: { provider_name: string | null } }
  | { kind: "rename_flagged" };

/**
 * "Sunrise Senior Living of Dallas" and "SUNRISE SENIOR LIVING - DALLAS" are
 * the same business. Case, punctuation, whitespace and the legal suffixes
 * Google tends to add or drop are not a rename.
 */
export function normalizeProviderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|inc|incorporated|corp|corporation|ltd|co|pllc|pc|lp|llp)\b/g, " ")
    // "Sunrise Senior Living of Dallas" and "Sunrise Senior Living - Dallas"
    // are one business; connectives are not a rename.
    .replace(/\b(of|the|at|in|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the two names differ only cosmetically. */
export function isCosmeticRename(stored: string | null, observed: string): boolean {
  if (!stored) return false;
  return stored.trim() !== observed.trim() && normalizeProviderName(stored) === normalizeProviderName(observed);
}

/**
 * Decisions for one observation, in the order they apply. A closed business
 * gets no rename decision: the page is going away. An observation that
 * repeats the last one (still OPERATIONAL, same name) decides nothing, so a
 * monthly pass over the same provider writes no ledger rows.
 */
export function decideHealthActions(provider: ProviderForHealth, observed: StatusObservation): HealthDecision[] {
  const out: HealthDecision[] = [];
  if (observed.status === "CLOSED_PERMANENTLY") {
    if (!provider.deleted) out.push({ kind: "closed_archived", undo: { deleted: false, deleted_at: null, deletion_reason: null } });
    return out;
  }
  if (observed.status === "CLOSED_TEMPORARILY" && provider.google_status !== "CLOSED_TEMPORARILY") {
    out.push({ kind: "closed_temporarily" });
  }
  const name = observed.googleName?.trim();
  if (name && provider.provider_name && name !== provider.provider_name.trim()) {
    if (isCosmeticRename(provider.provider_name, name)) {
      out.push({ kind: "rename_applied", newName: name, undo: { provider_name: provider.provider_name } });
    } else {
      out.push({ kind: "rename_flagged" });
    }
  }
  return out;
}

/** The free Places SKU that carries status and name: Pro, 5,000 requests a month at $0. */
export const STATUS_FREE_MONTHLY_REQUESTS = 5_000;

export type StatusCandidate = {
  provider_id: string;
  place_id: string;
  slug: string | null;
  last_viewed_at: string | null;
  google_status_checked_at: string | null;
};

/**
 * Who the monthly free status pass checks, in order, cut at the free tier:
 * claimed providers (someone notices), then pages with real search clicks in
 * the last quarter (families land there), then by last view, never-checked
 * first. `last_viewed_at` alone is crawler-inflated (68,317 of 76,555 "viewed"
 * in 30 days on 6 Oct 2026), which is why clicks rank above it.
 */
export function planStatusPass(
  candidates: StatusCandidate[],
  claimedIds: Set<string>,
  clickedSlugs: Set<string>,
  cap: number = STATUS_FREE_MONTHLY_REQUESTS,
): StatusCandidate[] {
  const rank = (c: StatusCandidate) => (claimedIds.has(c.provider_id) ? 0 : c.slug && clickedSlugs.has(c.slug) ? 1 : 2);
  const viewed = (c: StatusCandidate) => (c.last_viewed_at ? Date.parse(c.last_viewed_at) : 0);
  const checked = (c: StatusCandidate) => (c.google_status_checked_at ? Date.parse(c.google_status_checked_at) : -1);
  return [...candidates]
    .sort((a, b) => rank(a) - rank(b) || checked(a) - checked(b) || viewed(b) - viewed(a))
    .slice(0, Math.max(0, cap));
}

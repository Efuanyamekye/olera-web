/**
 * Who runs which admin page.
 *
 * The unit is one sidebar page and one person, and a page can have several.
 * That is the difference from MedJobs assignments, where a campus section has
 * exactly one owner enforced by a unique index: here the unique index is on
 * the pair, so a page holds as many leaders as it needs and adding somebody
 * twice is a no-op rather than an error.
 *
 * None of this gates anything. Every admin can still open every page they
 * could open before. It answers "who is in charge of this?" from the sidebar,
 * without opening the page to find out.
 */

/**
 * The leadership list, with the name to print.
 *
 * Two reasons this carries names rather than deriving them, where the MedJobs
 * roster gets away with a bare list of addresses:
 *
 * 1. Not everybody is on olera.care. Esther and Ces sign in with personal
 *    Google accounts, so `firstName()` — which takes the local part of the
 *    address — would print "Uiuxesther" and "Cchavez".
 * 2. Even on olera.care it does not always hold. tj@olera.care is "TJ", not
 *    "Tj", and there is already a one-off fix for exactly that in the
 *    staffing-outreach queue route.
 *
 * The comment on `firstName` in lib/medjobs/assignments.ts anticipated this:
 * "the day an address stops matching a name, this is replaced". That day is
 * here for this list, so this list does not use it. MedJobs keeps its own
 * four-person roster, which is still all olera.care and still correct.
 */
export const LEADERSHIP: readonly { email: string; name: string }[] = [
  { email: "logan@olera.care", name: "Logan" },
  { email: "tj@olera.care", name: "TJ" },
  { email: "chantel@olera.care", name: "Chantel" },
  { email: "graize@olera.care", name: "Graize" },
  { email: "sara@olera.care", name: "Sara" },
  { email: "uiuxesther@gmail.com", name: "Esther" },
  { email: "cchavez.olera@gmail.com", name: "Ces" },
];

const NAME_BY_EMAIL = new Map(LEADERSHIP.map((p) => [p.email, p.name]));

/** One person who can lead a page. */
export interface Owner {
  /** admin_users.id — what an assignment row stores. */
  id: string;
  email: string;
  /** From LEADERSHIP, never derived from the address. */
  name: string;
}

/**
 * The name to print for an address, or null when they are not on the list.
 *
 * Lowercased on both sides: an address gets typed into admin_users however
 * the person typed it, and a case-sensitive lookup here would silently drop
 * somebody out of the dropdown with nothing on screen to say why.
 */
export function leadershipName(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  return NAME_BY_EMAIL.get(email.trim().toLowerCase()) ?? null;
}

/** Whether this address can lead a page. */
export const onLeadership = (email: string | null | undefined): boolean =>
  leadershipName(email) !== null;

/** Alphabetical, so the dropdown is the same order every time. */
export const byName = (a: Owner, b: Owner): number => a.name.localeCompare(b.name);

/** Who leads each page, keyed by the sidebar href. Absent key means nobody. */
export type PageOwners = Record<string, Owner[]>;

/** The longest page key the table will take, matching the favorites route. */
export const MAX_PAGE_KEY = 200;

/**
 * Whether this is a plausible sidebar page key.
 *
 * Deliberately a shape check and not a lookup against the nav registry. That
 * registry is TypeScript inside a client component and gains a page most
 * months; validating against it would mean either a database CHECK constraint
 * that needs a migration every time somebody adds an admin page, or importing
 * a React module into a route handler.
 *
 * The cost of being loose is an orphan row that never renders, written by an
 * authenticated admin. The sidebar resolves labels from its own nav config,
 * so a key it cannot resolve is skipped in silence — exactly what a pinned
 * href pointing at a retired route already does.
 */
export function isPageKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/admin") &&
    value.length <= MAX_PAGE_KEY
  );
}

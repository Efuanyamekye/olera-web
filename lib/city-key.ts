/**
 * One canonical key for a US city, shared by everything that has to line
 * cities up across sources: the provider directory, visitor geo captured at
 * the edge, and the operating map's city filter.
 *
 * Without a single key these drift immediately — "Fort Worth" from a provider
 * row and "fort worth" from a Vercel header would be two different cities.
 */

/** Collapse a city name to its comparison form. */
export function normalizeCityName(city: string): string {
  return city.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Stable key for a city, e.g. `cityKey("Fort Worth", "tx")` -> "fort-worth-tx".
 * Returns null when either half is missing, so callers never build a
 * half-formed key that silently matches nothing.
 */
export function cityKey(
  city: string | null | undefined,
  state: string | null | undefined,
): string | null {
  const c = normalizeCityName(city ?? "");
  const s = (state ?? "").trim().toLowerCase();
  if (!c || !s) return null;
  const slug = c.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `${slug}-${s}` : null;
}

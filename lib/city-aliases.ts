/**
 * City alias map for ZIP code search.
 *
 * Some cities in the zip-index resolve to a name that doesn't match how
 * providers are stored in Supabase. This map expands search terms so
 * queries hit all relevant rows.
 *
 * Example: ZIP 10001 → "New York" but providers are stored under
 * "Manhattan", "Brooklyn", "Bronx", "Queens", "Staten Island".
 */

// Keys are the search term (what zip-index / city search resolves to).
// Values are the city names as they appear in the database.
const CITY_ALIAS_MAP: Record<string, string[]> = {
  // NYC: zip-index says "New York" but DB uses borough names
  "New York": ["Manhattan", "Brooklyn", "Bronx", "Queens", "Staten Island"],

  // Consolidated city-county: zip-index says "Butte" but DB uses official name
  Butte: ["Butte-Silver Bow"],
};

/**
 * Expand a city name into all its database aliases.
 * Returns the alias list if one exists, otherwise wraps the original
 * city in an array so callers can always use the same `.in()` query.
 */
export function expandCityAliases(city: string): string[] {
  // Case-insensitive lookup: normalize to title case for the map key
  const normalized = city
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return CITY_ALIAS_MAP[normalized] ?? [city];
}

/**
 * Every city that has aliases, as the search term it rolls up to.
 *
 * Exported so consumers that need the reverse mapping — collapsing the
 * stored names back into one city, as the operating map does when counting
 * distinct cities — can derive it here instead of restating the list.
 */
export function citiesWithAliases(): string[] {
  return Object.keys(CITY_ALIAS_MAP);
}

/**
 * Check whether a city name has aliases (i.e. the search term differs
 * from what's stored in the database).
 */
export function hasCityAliases(city: string): boolean {
  const normalized = city
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return normalized in CITY_ALIAS_MAP;
}

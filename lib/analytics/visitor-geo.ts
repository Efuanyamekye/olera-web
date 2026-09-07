import { cityKey } from "@/lib/city-key";

/**
 * Where the visitor was, from Vercel's edge headers.
 *
 * These arrive on every request in production; `app/api/geo/route.ts` already
 * reads them to personalize benefits content. Recording the city on page
 * events is what lets the operating map answer "how many people in Houston
 * came to us from search".
 *
 * This is the visitor's location, not the market a page is about. Someone in
 * Chicago reading about Houston providers is a Chicago visitor.
 *
 * No IP address is stored — only the city and state Vercel resolved, which is
 * the same granularity `/api/geo` already returns to the browser.
 */
export interface VisitorGeo {
  /** Canonical city key, e.g. "houston-tx". Null when unresolved. */
  geo_city: string | null;
  /** Two-letter state, upper case. Null outside the US or unresolved. */
  geo_state: string | null;
}

/** Read visitor geo off a request. Locally the headers are absent — null. */
export function readVisitorGeo(headers: Headers): VisitorGeo {
  const country = headers.get("x-vercel-ip-country");
  // Treat a missing country as US for parity with /api/geo, which does the
  // same so local development still resolves a state.
  const isUS = !country || country === "US";
  if (!isUS) return { geo_city: null, geo_state: null };

  const region = headers.get("x-vercel-ip-country-region");
  const rawCity = headers.get("x-vercel-ip-city");

  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity);
    } catch {
      // A malformed header must never cost us the event itself.
      city = rawCity;
    }
  }

  const state = region ? region.trim().toUpperCase() : null;
  return {
    geo_city: cityKey(city, state),
    geo_state: state && state.length === 2 ? state : null,
  };
}

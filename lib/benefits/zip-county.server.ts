import zipCounty from "@/data/geo/zip-county-5.json";
import { zipToCounty } from "@/lib/benefits/zip-lookup";

/**
 * The county for a five-digit ZIP, server side.
 *
 * The browser's lookup (zipToCounty) reads only the first three digits and
 * picks the most common county for them, which is the wrong county for over
 * half of ZIP codes; 5,232 of 33,044 got another county's Area Agency on
 * Aging (Hialeah, Miami-Dade, routed to Broward; 6 Oct 2026). This reads the
 * full ZIP: data/geo/zip-county-5.json, Census ZCTA-to-county (2000 census,
 * via the Missouri Census Data Center, github.com/scpike/us-state-county-zip),
 * "County|ST". A ZIP made since then falls back to the three-digit guess.
 */
const TABLE = zipCounty as Record<string, string>;

export function exactCountyForZip(zip: string | null | undefined): string | null {
  const z = (zip || "").trim();
  if (!/^\d{5}$/.test(z)) return null;
  return TABLE[z]?.split("|")[0] || null;
}

/** The full-ZIP county first; then what the caller already holds; then the three-digit guess. */
export async function countyForZip(zip: string | null | undefined, held?: string | null): Promise<string | null> {
  return exactCountyForZip(zip) || held || (zip && /^\d{5}$/.test(zip) ? await zipToCounty(zip) : null);
}

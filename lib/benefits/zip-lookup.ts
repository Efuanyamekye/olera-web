// ZIP code → state/county lookup — ported from iOS BenefitsFinderViewModel.swift

/**
 * Derives a US state code from the first 3 digits of a ZIP code.
 * Uses the same prefix-range mapping as the iOS app.
 */
export function zipToState(zip: string): string | null {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;

  const prefix = parseInt(trimmed.substring(0, 3), 10);

  if (prefix >= 10 && prefix <= 27) return "MA";
  if (prefix >= 28 && prefix <= 29) return "RI";
  if (prefix >= 30 && prefix <= 38) return "NH";
  if (prefix >= 39 && prefix <= 49) return "ME";
  if (prefix >= 50 && prefix <= 59) return "VT";
  if (prefix >= 60 && prefix <= 69) return "CT";
  if (prefix >= 70 && prefix <= 89) return "NJ";
  if (prefix >= 100 && prefix <= 149) return "NY";
  if (prefix >= 150 && prefix <= 196) return "PA";
  if (prefix >= 200 && prefix <= 205) return "DC";
  if (prefix >= 206 && prefix <= 219) return "MD";
  if (prefix >= 220 && prefix <= 246) return "VA";
  if (prefix >= 247 && prefix <= 268) return "WV";
  if (prefix >= 270 && prefix <= 289) return "NC";
  if (prefix >= 290 && prefix <= 299) return "SC";
  if (prefix >= 300 && prefix <= 319) return "GA";
  if (prefix >= 320 && prefix <= 339) return "FL";
  if (prefix >= 350 && prefix <= 369) return "AL";
  if (prefix >= 370 && prefix <= 385) return "TN";
  if (prefix >= 386 && prefix <= 397) return "MS";
  if (prefix >= 400 && prefix <= 427) return "KY";
  if (prefix >= 430 && prefix <= 458) return "OH";
  if (prefix >= 460 && prefix <= 479) return "IN";
  if (prefix >= 480 && prefix <= 499) return "MI";
  if (prefix >= 500 && prefix <= 528) return "IA";
  if (prefix >= 530 && prefix <= 549) return "WI";
  if (prefix >= 550 && prefix <= 567) return "MN";
  if (prefix >= 570 && prefix <= 577) return "SD";
  if (prefix >= 580 && prefix <= 588) return "ND";
  if (prefix >= 590 && prefix <= 599) return "MT";
  if (prefix >= 600 && prefix <= 629) return "IL";
  if (prefix >= 630 && prefix <= 658) return "MO";
  if (prefix >= 660 && prefix <= 679) return "KS";
  if (prefix >= 680 && prefix <= 693) return "NE";
  if (prefix >= 700 && prefix <= 714) return "LA";
  if (prefix >= 716 && prefix <= 729) return "AR";
  if (prefix >= 730 && prefix <= 749) return "OK";
  if (prefix >= 750 && prefix <= 799) return "TX";
  if (prefix >= 800 && prefix <= 816) return "CO";
  if (prefix >= 820 && prefix <= 831) return "WY";
  if (prefix >= 832 && prefix <= 838) return "ID";
  if (prefix >= 840 && prefix <= 847) return "UT";
  if (prefix >= 850 && prefix <= 865) return "AZ";
  if (prefix >= 870 && prefix <= 884) return "NM";
  if (prefix >= 889 && prefix <= 898) return "NV";
  if (prefix >= 900 && prefix <= 961) return "CA";
  if (prefix >= 967 && prefix <= 968) return "HI";
  if (prefix >= 970 && prefix <= 979) return "OR";
  if (prefix >= 980 && prefix <= 994) return "WA";
  if (prefix >= 995 && prefix <= 999) return "AK";

  return null;
}

/**
 * Derives a US county name from the first 3 digits of a ZIP code.
 * Uses a pre-built mapping of ZIP prefixes to their most common county.
 * Returns null if no match found.
 */
let countyCache: Record<string, { county: string; state: string }> | null = null;

export async function zipToCounty(zip: string): Promise<string | null> {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;

  // Bundled with the code rather than fetched from the site. The server used
  // to fetch its own public URL, which the firewall can refuse; the old
  // fallback only ran when fetch threw, not on a refused response, so the
  // county came back null and the local agency lookup picked the wrong
  // office (San Antonio got Alamo AAA instead of Bexar County, found in QA
  // 2026-09-30). A dynamic import keeps it out of the main browser bundle.
  if (!countyCache) {
    try {
      const mod = await import("@/public/data/zip-county.json");
      countyCache = (mod.default ?? mod) as Record<string, { county: string; state: string }>;
    } catch (err) {
      console.error("[zip-lookup] county table failed to load:", err);
      return null;
    }
  }

  const prefix = trimmed.substring(0, 3);
  return countyCache[prefix]?.county ?? null;
}

/** Validates a 5-digit US ZIP code format. */
export function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim());
}

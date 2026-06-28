// ── Hero dismiss (Robinhood-style, daily reset) ─────────────────────────────
// Shared between DashboardHero (which renders + hides the resolved banner) and
// DashboardHeroSkeleton (which must hide too, or it flashes the dark placeholder
// card during the v2Data fetch before the dismissed hero resolves to null).
//
// Providers can dismiss the *non-essential* banners (managed ads, market intel,
// completion nudges) via an X. The action banners — a lead/question/family is
// waiting, or a positive view spike — are the signals the hero exists to
// surface, so they're never dismissible. Dismissal is NOT permanent: it lasts
// only the provider's current calendar day, then the hero returns fresh (the
// rotation counter has advanced, so it's usually a different card). A new
// action signal still breaks through same-day, since those aren't dismissible.

export const HERO_DISMISS_KEY = "olera_hero_dismissed_date";

/** A banner that carries an X. Promotional / housekeeping nags only. */
const DISMISSIBLE_BANNER_IDS = new Set(["managed_ads", "find_families_intel", "reviews"]);
export function isDismissibleBanner(bannerId: string): boolean {
  return DISMISSIBLE_BANNER_IDS.has(bannerId) || bannerId.startsWith("completion:");
}

/** Local (not UTC) date stamp — dismissal resets on the provider's own day. */
export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** True if the provider already dismissed the hero today. SSR-safe + failure-safe. */
export function readDismissedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HERO_DISMISS_KEY) === todayStamp();
  } catch {
    return false;
  }
}

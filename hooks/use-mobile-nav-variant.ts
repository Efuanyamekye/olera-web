"use client";

/**
 * Shared client-side hook that resolves which Mobile Nav A/B arm a session
 * belongs to. Used by Navbar.tsx to decide whether to render the current
 * hamburger-only nav or the bottom_tabs variant.
 *
 * Resolution sequence:
 *   1. Render. Reads cached variant from localStorage (instant, no flash).
 *   2. Effect runs. Fetches /api/variant-weights/mobile-nav (CDN-cached ~30s).
 *   3. Compares version — if changed, re-resolves variant and updates cache.
 *   4. On first visit (no cache), resolves and caches variant.
 *
 * This eliminates the flash on return visits since localStorage is
 * synchronous and read during initial render.
 */

import { useEffect, useState } from "react";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import {
  assignMobileNavVariantWeighted,
  MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS,
  MOBILE_NAV_VARIANTS,
  type MobileNavVariant,
  type MobileNavWeightMap,
} from "@/lib/analytics/mobile-nav-variant";

// Preview mode support for mobile nav variants
const MOBILE_NAV_PREVIEW_PARAM = "preview_mobile_nav";

// localStorage keys for cached variant
// Cache is keyed by session ID to ensure variant matches current session
const MOBILE_NAV_CACHE_KEY = "olera_mobile_nav_variant";
const MOBILE_NAV_VERSION_KEY = "olera_mobile_nav_version";
const MOBILE_NAV_SESSION_KEY = "olera_mobile_nav_session";

function getMobileNavPreviewArm(): MobileNavVariant | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(MOBILE_NAV_PREVIEW_PARAM);
  if (!raw) return null;
  return (MOBILE_NAV_VARIANTS as readonly string[]).includes(raw)
    ? (raw as MobileNavVariant)
    : null;
}

export function isMobileNavPreviewMode(): boolean {
  return getMobileNavPreviewArm() !== null;
}

// Module-level cache so a single page render with multiple consumers
// only fetches weights once. Persists across client-side navigations —
// weights don't change per route, and a stale 30s-old value across a nav
// is harmless. Reset on hard reload.
let weightsPromise: Promise<{ weights: MobileNavWeightMap; version: number }> | null = null;

function fetchWeights(): Promise<{ weights: MobileNavWeightMap; version: number }> {
  if (weightsPromise) return weightsPromise;
  // Default fetch cache mode — we want the CDN's s-maxage=30 to actually
  // serve cached responses. `no-store` would bypass the CDN cache and
  // hammer the origin on every provider page hit.
  weightsPromise = fetch("/api/variant-weights/mobile-nav")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || typeof data !== "object") {
        return { weights: MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS, version: 0 };
      }
      return {
        weights: (data.weights as MobileNavWeightMap) ?? MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS,
        version: typeof data.version === "number" ? data.version : 0,
      };
    })
    .catch(() => ({
      weights: MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS,
      version: 0,
    }));
  return weightsPromise;
}

/**
 * Read cached variant from localStorage.
 * Returns null if no cache, invalid, or session mismatch.
 */
function getCachedVariant(sessionId: string): MobileNavVariant | null {
  if (typeof window === "undefined") return null;
  try {
    // Check session matches - if user cleared cookies, session changed
    const cachedSession = localStorage.getItem(MOBILE_NAV_SESSION_KEY);
    if (cachedSession !== sessionId) return null;

    const cached = localStorage.getItem(MOBILE_NAV_CACHE_KEY);
    if (cached && (MOBILE_NAV_VARIANTS as readonly string[]).includes(cached)) {
      return cached as MobileNavVariant;
    }
  } catch {
    // localStorage blocked or unavailable
  }
  return null;
}

/**
 * Get initial variant synchronously for useState initializer.
 * This prevents the flash where variant is null on first render.
 */
function getInitialVariant(): MobileNavVariant | null {
  if (typeof window === "undefined") return null;
  // Check preview mode first
  const previewArm = getMobileNavPreviewArm();
  if (previewArm) return previewArm;
  // Read from localStorage cache
  const sessionId = getOrCreateSessionId();
  return getCachedVariant(sessionId);
}

/**
 * Get cached version number for invalidation check.
 */
function getCachedVersion(): number {
  if (typeof window === "undefined") return -1;
  try {
    const v = localStorage.getItem(MOBILE_NAV_VERSION_KEY);
    return v ? parseInt(v, 10) : -1;
  } catch {
    return -1;
  }
}

/**
 * Cache the resolved variant, version, and session ID.
 */
function setCachedVariant(variant: MobileNavVariant, version: number, sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MOBILE_NAV_CACHE_KEY, variant);
    localStorage.setItem(MOBILE_NAV_VERSION_KEY, String(version));
    localStorage.setItem(MOBILE_NAV_SESSION_KEY, sessionId);
  } catch {
    // localStorage blocked or full
  }
}

/**
 * Returns the mobile nav variant assigned to the current session.
 *
 * On first visit: Returns null briefly while fetching, then caches result.
 * On return visits: Reads cached variant synchronously on first render,
 * then validates in background and updates if version changed.
 */
export function useMobileNavVariant(): MobileNavVariant | null {
  // Read from localStorage synchronously during initial render to prevent flash.
  // On SSR this returns null; on client it returns cached variant if available.
  // The conditional renders (bottom tabs, FAB positioning) are mobile-only,
  // so hydration mismatch is not an issue in practice.
  const [variant, setVariant] = useState<MobileNavVariant | null>(getInitialVariant);

  // Fetch weights and validate/update cache
  useEffect(() => {
    if (isMobileNavPreviewMode()) return;

    let cancelled = false;
    const sessionId = getOrCreateSessionId();

    fetchWeights().then(({ weights, version }) => {
      if (cancelled) return;

      const cachedVersion = getCachedVersion();
      const cachedVariant = getCachedVariant(sessionId);

      // If version changed or no cache, resolve and cache new variant
      if (version !== cachedVersion || !cachedVariant) {
        const newVariant = assignMobileNavVariantWeighted(sessionId, weights, version);
        setCachedVariant(newVariant, version, sessionId);
        setVariant(newVariant);
      }
      // If version matches and we have cache, variant is already set from initial render
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return variant;
}

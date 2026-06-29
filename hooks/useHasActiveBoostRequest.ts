"use client";

import { useState, useEffect } from "react";
import { getCachedBoostState, type BoostStateResponse } from "@/lib/ad-boost/boost-state";

/**
 * Lightweight hook to check if the provider has an active ad boost request.
 *
 * First checks the module-level cache (populated by dashboard/matches pages).
 * If cache miss, fetches from API. Returns `null` while loading, then boolean.
 *
 * Active states: pending_profile, requested, scheduled, live
 */
export function useHasActiveBoostRequest(): boolean | null {
  const [hasActive, setHasActive] = useState<boolean | null>(() => {
    // Check cache synchronously on mount
    const cached = getCachedBoostState();
    if (cached) {
      const status = cached.request?.status;
      return !!status && ["pending_profile", "requested", "scheduled", "live"].includes(status);
    }
    return null; // Unknown, need to fetch
  });

  useEffect(() => {
    // If we got a cached result, no need to fetch
    if (hasActive !== null) return;

    let cancelled = false;

    async function checkBoostState() {
      try {
        const res = await fetch("/api/provider/ad-boost/request", { credentials: "include" });
        if (!res.ok) {
          // No boost request or error - treat as no active campaign
          if (!cancelled) setHasActive(false);
          return;
        }
        const data: BoostStateResponse = await res.json();
        const status = data.request?.status;
        const isActive = !!status && ["pending_profile", "requested", "scheduled", "live"].includes(status);
        if (!cancelled) setHasActive(isActive);
      } catch {
        // On error, default to false (show nudge)
        if (!cancelled) setHasActive(false);
      }
    }

    checkBoostState();
    return () => { cancelled = true; };
  }, [hasActive]);

  return hasActive;
}

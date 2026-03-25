"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Lightweight hook that counts unread reviews for a provider.
 * Fetches published reviews for the given provider ID,
 * checks against profile-scoped localStorage, and returns the count.
 *
 * Features:
 * - Listens for "olera:reviews-read" custom events for immediate updates
 * - Listens for "storage" events for cross-tab synchronization
 * - Auto-marks all reviews as read when the Reviews page dispatches sync event
 */
export function useUnreadReviewsCount(providerId: string | null): number {
  const [count, setCount] = useState(0);
  const fetchingRef = useRef(false);

  const recount = useCallback(() => {
    if (!providerId || fetchingRef.current) return;

    if (!isSupabaseConfigured()) {
      setCount(0);
      return;
    }

    fetchingRef.current = true;

    const readKey = `olera_reviews_read_${providerId}`;

    // Get read review IDs from localStorage
    let readIds = new Set<string>();
    try {
      const stored = localStorage.getItem(readKey);
      if (stored) {
        const parsed: string[] = JSON.parse(stored);
        parsed.forEach((id) => readIds.add(id));
      }
    } catch {
      // localStorage unavailable
    }

    (async () => {
      try {
        const supabase = createClient();

        const { data: reviews } = await supabase
          .from("reviews")
          .select("id")
          .eq("provider_id", providerId)
          .eq("status", "published");

        if (!reviews || reviews.length === 0) {
          setCount(0);
          return;
        }

        const unreadCount = reviews.filter((r) => !readIds.has(r.id)).length;
        setCount(unreadCount);
      } catch (err) {
        console.error("[useUnreadReviewsCount] Error:", err);
        setCount(0);
      } finally {
        fetchingRef.current = false;
      }
    })();
  }, [providerId]);

  // Initial count - always recount when providerId changes
  useEffect(() => {
    recount();
  }, [recount]);

  // Re-count when a review is marked as read
  useEffect(() => {
    const handler = () => recount();
    window.addEventListener("olera:reviews-read", handler);
    return () => window.removeEventListener("olera:reviews-read", handler);
  }, [recount]);

  // Listen for sync events from Reviews page (authoritative source)
  useEffect(() => {
    const syncHandler = (e: Event) => {
      const { count: syncedCount, providerId: syncProviderId } = (e as CustomEvent).detail;
      if (syncProviderId === providerId && typeof syncedCount === "number") {
        setCount(syncedCount);
        // Cache the count for future page loads
        try {
          localStorage.setItem(`olera_reviews_count_${providerId}`, String(syncedCount));
        } catch {
          // localStorage unavailable
        }
      }
    };
    window.addEventListener("olera:reviews-sync", syncHandler);
    return () => window.removeEventListener("olera:reviews-sync", syncHandler);
  }, [providerId]);

  // Cross-tab synchronization: re-count when localStorage changes in another tab
  useEffect(() => {
    if (!providerId) return;
    const readKey = `olera_reviews_read_${providerId}`;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === readKey) {
        recount();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [providerId, recount]);

  return count;
}

/**
 * Mark a review as read in localStorage and dispatch event.
 * Call this when a provider views a review.
 */
export function markReviewAsRead(reviewId: string, providerId: string): void {
  const readKey = `olera_reviews_read_${providerId}`;
  try {
    const stored = localStorage.getItem(readKey);
    const readIds: string[] = stored ? JSON.parse(stored) : [];
    if (!readIds.includes(reviewId)) {
      readIds.push(reviewId);
      localStorage.setItem(readKey, JSON.stringify(readIds));
      window.dispatchEvent(new CustomEvent("olera:reviews-read"));
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Mark all reviews as read for a provider.
 * Call this when a provider visits the Reviews page.
 */
export function markAllReviewsAsRead(reviewIds: string[], providerId: string): void {
  const readKey = `olera_reviews_read_${providerId}`;
  try {
    const stored = localStorage.getItem(readKey);
    const existingIds: string[] = stored ? JSON.parse(stored) : [];
    const merged = [...new Set([...existingIds, ...reviewIds])];
    localStorage.setItem(readKey, JSON.stringify(merged));
    // Dispatch sync event with count 0
    window.dispatchEvent(new CustomEvent("olera:reviews-sync", {
      detail: { count: 0, providerId }
    }));
  } catch {
    // localStorage unavailable
  }
}

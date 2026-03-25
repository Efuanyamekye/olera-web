"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Hook that counts unread leads (connection inquiries) for a provider profile.
 * Fetches pending inquiries from the database where the provider is the recipient,
 * and checks against database metadata.read_by for read tracking.
 *
 * Features:
 * - Fetches from database on mount
 * - Uses metadata.read_by for persistent read tracking (same as inbox)
 * - Falls back to localStorage for backwards compatibility
 * - Listens for custom events for immediate updates
 * - Cross-tab synchronization
 */
export function useUnreadLeadsCount(profileId: string | null): number {
  const [count, setCount] = useState(0);
  const fetchingRef = useRef(false);

  const recount = useCallback(() => {
    if (!profileId || fetchingRef.current) return;

    if (!isSupabaseConfigured()) {
      setCount(0);
      return;
    }

    fetchingRef.current = true;

    (async () => {
      try {
        const supabase = createClient();

        // Fetch pending inquiries where this profile is the recipient (to_profile_id)
        // These are "leads" - families reaching out to providers
        const { data: connections } = await supabase
          .from("connections")
          .select("id, metadata")
          .eq("to_profile_id", profileId)
          .eq("type", "inquiry")
          .eq("status", "pending");

        if (!connections || connections.length === 0) {
          setCount(0);
          // Update localStorage cache
          try {
            localStorage.setItem(`olera_leads_new_count_${profileId}`, "0");
          } catch { /* localStorage unavailable */ }
          return;
        }

        // Get localStorage read IDs as fallback
        let localStorageReadIds = new Set<string>();
        try {
          const stored = localStorage.getItem(`olera_leads_read_${profileId}`);
          if (stored) {
            const parsed: string[] = JSON.parse(stored);
            parsed.forEach((id) => localStorageReadIds.add(id));
          }
        } catch { /* localStorage unavailable */ }

        // Count unread: check both database metadata.read_by and localStorage
        let unreadCount = 0;
        for (const conn of connections) {
          const meta = conn.metadata as Record<string, unknown> | null;
          const readBy = (meta?.read_by as Record<string, string>) || {};

          // Check if read in database (primary) or localStorage (fallback)
          const isReadInDb = !!readBy[profileId];
          const isReadInLocalStorage = localStorageReadIds.has(conn.id);

          if (!isReadInDb && !isReadInLocalStorage) {
            unreadCount++;
          }
        }

        setCount(unreadCount);

        // Update localStorage cache
        try {
          localStorage.setItem(`olera_leads_new_count_${profileId}`, String(unreadCount));
        } catch { /* localStorage unavailable */ }
      } catch (err) {
        console.error("[useUnreadLeadsCount] Error:", err);
        setCount(0);
      } finally {
        fetchingRef.current = false;
      }
    })();
  }, [profileId]);

  // Initial count from database
  useEffect(() => {
    recount();
  }, [recount]);

  // Re-count when a lead is marked as read or new connection created
  useEffect(() => {
    const handler = () => {
      setTimeout(recount, 100);
    };
    window.addEventListener("olera:leads-read", handler);
    window.addEventListener("olera:connection-created", handler);
    return () => {
      window.removeEventListener("olera:leads-read", handler);
      window.removeEventListener("olera:connection-created", handler);
    };
  }, [recount]);

  // Listen for leads count sync events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "number") {
        setCount(detail);
      } else if (detail?.profileId === profileId && typeof detail.count === "number") {
        setCount(detail.count);
      }
    };
    window.addEventListener("olera:leads-count", handler);
    return () => window.removeEventListener("olera:leads-count", handler);
  }, [profileId]);

  // Cross-tab synchronization
  useEffect(() => {
    if (!profileId) return;
    const cacheKey = `olera_leads_new_count_${profileId}`;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === cacheKey && e.newValue !== null) {
        setCount(parseInt(e.newValue, 10) || 0);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [profileId]);

  return count;
}

/**
 * Mark a lead as read. Updates both localStorage and dispatches event.
 * Note: The actual database update should happen via /api/connections/mark-read
 */
export function markLeadAsRead(connectionId: string, profileId: string): void {
  // Update localStorage for backwards compatibility
  const readKey = `olera_leads_read_${profileId}`;
  try {
    const stored = localStorage.getItem(readKey);
    const readIds: string[] = stored ? JSON.parse(stored) : [];
    if (!readIds.includes(connectionId)) {
      readIds.push(connectionId);
      localStorage.setItem(readKey, JSON.stringify(readIds));
    }
  } catch { /* localStorage unavailable */ }

  // Persist to database (fire-and-forget)
  fetch("/api/connections/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, profileId }),
  }).catch((err) => {
    console.error("[markLeadAsRead] Failed to persist:", err);
  });

  // Notify badge hook to re-count
  window.dispatchEvent(new CustomEvent("olera:leads-read"));
}

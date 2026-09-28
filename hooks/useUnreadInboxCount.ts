"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Lightweight hook that counts unread inbox conversations.
 *
 * Uses database-backed read tracking via metadata.read_by[profileId].
 * A conversation is considered "read" if metadata.read_by contains an entry
 * for the user's profile ID.
 *
 * Features:
 * - Checks metadata.read_by in the database for persistent read state
 * - Falls back to localStorage for backwards compatibility during migration
 * - Listens for "olera:inbox-read" custom events for immediate updates
 * - Listens for "olera:connection-created" for new connections
 * - With `adOffers`, adds the families Olera has offered her and she has not
 *   answered yet (/api/provider/ad-families?count=open), so a waiting offer
 *   shows on the Inbox badge like an unread message
 */
export function useUnreadInboxCount(profileIds: string[], opts: { adOffers?: boolean } = {}): number {
  const [count, setCount] = useState(0);
  const [adCount, setAdCount] = useState(0);
  const withAdOffers = !!opts.adOffers;
  const fetchingRef = useRef(false);

  // Stable key for deps — avoids re-running on every render when array ref changes
  const profileKey = profileIds.join(",");

  const recount = useCallback(() => {
    if (!profileKey || fetchingRef.current) return;

    const profileIdList = profileKey.split(",").filter(Boolean);
    if (profileIdList.length === 0) {
      setCount(0);
      return;
    }

    if (!isSupabaseConfigured()) {
      setCount(0);
      return;
    }

    fetchingRef.current = true;

    (async () => {
      try {
        const supabase = createClient();

        // Fetch connections with their metadata (includes read_by)
        // Match inbox query: fetch both outbound and inbound, active statuses only
        const [outbound, inbound, matchesOutbound, matchesInbound, invitesOutbound, invitesInbound] = await Promise.all([
          supabase
            .from("connections")
            .select("id, metadata, from_profile_id, to_profile_id")
            .in("from_profile_id", profileIdList)
            .eq("type", "inquiry")
            .in("status", ["pending", "accepted"]),
          supabase
            .from("connections")
            .select("id, metadata, from_profile_id, to_profile_id")
            .in("to_profile_id", profileIdList)
            .eq("type", "inquiry")
            .in("status", ["pending", "accepted"]),
          // Accepted provider-initiated matches
          supabase
            .from("connections")
            .select("id, metadata, from_profile_id, to_profile_id")
            .in("from_profile_id", profileIdList)
            .eq("type", "request")
            .eq("status", "accepted"),
          supabase
            .from("connections")
            .select("id, metadata, from_profile_id, to_profile_id")
            .in("to_profile_id", profileIdList)
            .eq("type", "request")
            .eq("status", "accepted"),
          // MedJobs invitations (provider↔student)
          supabase
            .from("connections")
            .select("id, metadata, from_profile_id, to_profile_id")
            .in("from_profile_id", profileIdList)
            .eq("type", "invitation")
            .in("status", ["pending", "accepted"]),
          supabase
            .from("connections")
            .select("id, metadata, from_profile_id, to_profile_id")
            .in("to_profile_id", profileIdList)
            .eq("type", "invitation")
            .in("status", ["pending", "accepted"]),
        ]);

        // Merge, deduplicate, and filter out hidden and archived connections
        const seen = new Set<string>();
        const connections: Array<{
          id: string;
          metadata: Record<string, unknown> | null;
          from_profile_id: string;
          to_profile_id: string;
        }> = [];

        const allConns = [
          ...(outbound.data || []),
          ...(inbound.data || []),
          ...(matchesOutbound.data || []),
          ...(matchesInbound.data || []),
          ...(invitesOutbound.data || []),
          ...(invitesInbound.data || []),
        ];

        for (const conn of allConns) {
          if (seen.has(conn.id)) continue;
          seen.add(conn.id);
          const meta = conn.metadata as Record<string, unknown> | undefined;
          if (meta?.hidden || meta?.archived) continue;
          connections.push(conn);
        }

        if (connections.length === 0) {
          setCount(0);
          return;
        }

        // Get localStorage read IDs as fallback for older connections without metadata.read_by
        let localStorageReadIds = new Set<string>();
        try {
          for (const profileId of profileIdList) {
            const stored = localStorage.getItem(`olera_inbox_read_${profileId}`);
            if (stored) {
              const parsed: string[] = JSON.parse(stored);
              parsed.forEach((readId) => localStorageReadIds.add(readId));
            }
          }
        } catch {
          // localStorage may be unavailable
        }

        // Count unread: connection is unread if neither database nor localStorage shows it as read
        let unreadCount = 0;
        for (const conn of connections) {
          const meta = conn.metadata as Record<string, unknown> | null;
          const readBy = (meta?.read_by as Record<string, string>) || {};

          // Determine which profile ID the user is using for this connection
          const userProfileId = profileIdList.find(
            (pid) => pid === conn.from_profile_id || pid === conn.to_profile_id
          );

          if (!userProfileId) continue;

          // Check if read in database (primary) or localStorage (fallback)
          const isReadInDb = !!readBy[userProfileId];
          const isReadInLocalStorage = localStorageReadIds.has(conn.id);

          if (!isReadInDb && !isReadInLocalStorage) {
            unreadCount++;
          }
        }

        setCount(unreadCount);
      } catch (err) {
        console.error("[useUnreadInboxCount] Error:", err);
        setCount(0);
      } finally {
        fetchingRef.current = false;
      }
    })();
  }, [profileKey]);

  // Initial count
  useEffect(() => {
    recount();
  }, [recount]);

  // Re-count when a conversation is marked as read, or a new connection is created
  useEffect(() => {
    const handler = () => {
      // Small delay to allow database write to complete
      setTimeout(recount, 100);
    };
    window.addEventListener("olera:inbox-read", handler);
    window.addEventListener("olera:connection-created", handler);
    return () => {
      window.removeEventListener("olera:inbox-read", handler);
      window.removeEventListener("olera:connection-created", handler);
    };
  }, [recount]);

  // Listen for authoritative sync events from inbox page
  // This is the source of truth — inbox page has loaded all connections and computed exact unread count
  useEffect(() => {
    const syncHandler = (e: Event) => {
      const { count: syncedCount, profileIds: syncProfileIds } = (e as CustomEvent).detail || {};
      // Verify the sync is for our profile(s)
      const syncKey = Array.isArray(syncProfileIds) ? syncProfileIds.join(",") : syncProfileIds;
      if (syncKey === profileKey && typeof syncedCount === "number") {
        setCount(syncedCount);
      }
    };
    window.addEventListener("olera:inbox-sync", syncHandler);
    return () => window.removeEventListener("olera:inbox-sync", syncHandler);
  }, [profileKey]);

  // Cross-tab synchronization: re-count when localStorage changes in another tab
  // This provides immediate updates for legacy localStorage tracking
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("olera_inbox_read_")) {
        recount();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [recount]);

  // Offers waiting on her. Kept apart from `count`, which the inbox page
  // overwrites with its own tally of conversations (olera:inbox-sync).
  useEffect(() => {
    if (!withAdOffers || !profileKey) {
      setAdCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/provider/ad-families?count=open", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { open?: number };
        if (!cancelled) setAdCount(typeof json.open === "number" ? json.open : 0);
      } catch {
        // The badge is a convenience; a failed count leaves it as it was.
      }
    };
    void load();
    window.addEventListener("olera:ad-families-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("olera:ad-families-changed", load);
    };
  }, [withAdOffers, profileKey]);

  return count + adCount;
}

"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Connection, ConnectionStatus, Profile } from "@/lib/types";
import ConversationList from "@/components/messaging/ConversationList";
import type { ConnectionWithProfile, FamilyTab } from "@/components/messaging/ConversationList";
import ConversationPanel from "@/components/messaging/ConversationPanel";
import RequestDetailPanel from "@/components/messaging/RequestDetailPanel";
import ProviderDetailPanel from "@/components/messaging/ProviderDetailPanel";
import ReportConnectionModal from "@/components/messaging/ReportConnectionModal";

type RoleFilter = "all" | "family" | "provider";

interface ThreadMessage {
  from_profile_id: string;
  text: string;
  created_at: string;
  type?: string;
}

/** Sort by last activity — last thread message, then updated_at, then created_at */
function getLastActivityTime(conn: ConnectionWithProfile): number {
  const meta = conn.metadata as Record<string, unknown> | undefined;
  const thread = (meta?.thread as ThreadMessage[]) || [];
  if (thread.length > 0) {
    return new Date(thread[thread.length - 1].created_at).getTime();
  }
  return new Date(conn.updated_at || conn.created_at).getTime();
}

const CLAIM_TOKEN_KEY = "olera_claim_token";

function InboxContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeProfile, profiles, user } = useAuth();

  // Extract URL params explicitly so changes trigger re-renders on client-side navigation
  const urlConnectionId = searchParams.get("id");
  const urlToken = searchParams.get("token");
  const urlRole = searchParams.get("role") as RoleFilter | null;

  // Track email click-back if arriving from a family email link
  const emailTrackingDone = useRef(false);
  useEffect(() => {
    if (emailTrackingDone.current) return;
    const ref = searchParams.get("ref");
    const eid = searchParams.get("eid");
    if (ref === "email" && eid && activeProfile?.id) {
      emailTrackingDone.current = true;
      fetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_type: "family",
          profile_id: activeProfile.id,
          event_type: "email_click",
          email_log_id: eid,
          metadata: { source: "direct_link", destination: "/portal/inbox" },
        }),
      }).catch(() => {});
      // Clean tracking params from URL
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      url.searchParams.delete("eid");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, [searchParams, activeProfile]);

  // Compute provider profile IDs and whether user has both account types
  const { providerProfileIds, hasProviderProfile, hasFamilyProfile, familyProfileId } = useMemo(() => {
    const providerIds = new Set<string>();
    let hasProvider = false;
    let hasFamily = false;
    let familyId: string | null = null;

    for (const p of profiles) {
      if (p.type === "organization" || p.type === "caregiver") {
        providerIds.add(p.id);
        hasProvider = true;
      } else {
        hasFamily = true;
        familyId = p.id;
      }
    }

    return {
      providerProfileIds: providerIds,
      hasProviderProfile: hasProvider,
      hasFamilyProfile: hasFamily,
      familyProfileId: familyId,
    };
  }, [profiles]);

  // Check if family profile's care post is live
  const [isProfileLive, setIsProfileLive] = useState(false);

  useEffect(() => {
    if (!familyProfileId || !isSupabaseConfigured()) return;

    const checkCarePostStatus = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("care_posts")
          .select("status")
          .eq("profile_id", familyProfileId)
          .single();

        setIsProfileLive(data?.status === "active");
      } catch {
        // No care post or error — treat as not live
        setIsProfileLive(false);
      }
    };

    checkCarePostStatus();
  }, [familyProfileId]);

  // Only show role filters for users with both family AND provider profiles
  const showRoleFilters = hasProviderProfile && hasFamilyProfile;

  // Role filter state — default from URL param, or will be set by effect below
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(() => {
    if (urlRole === "family" || urlRole === "provider") return urlRole;
    return "family"; // Temporary default, will be corrected by effect
  });

  // Set smart default once profiles are loaded: provider-only users should see provider mode
  const initialRoleSet = useRef(false);
  useEffect(() => {
    if (initialRoleSet.current || urlRole) return; // Don't override URL param or re-run
    if (profiles.length === 0) return; // Wait for profiles to load

    // If user only has provider profile(s), default to provider mode
    if (hasProviderProfile && !hasFamilyProfile) {
      setRoleFilter("provider");
    }
    initialRoleSet.current = true;
  }, [profiles.length, hasProviderProfile, hasFamilyProfile, urlRole]);

  // Update URL when role filter changes (without full navigation)
  const handleRoleFilterChange = useCallback((filter: RoleFilter) => {
    setRoleFilter(filter);
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") {
      params.delete("role");
    } else {
      params.set("role", filter);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [router, searchParams]);

  const [connections, setConnections] = useState<ConnectionWithProfile[]>([]);
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportingConnectionId, setReportingConnectionId] = useState<string | null>(null);
  const [archivedCount, setArchivedCount] = useState(0);
  const [familyTab, setFamilyTab] = useState<FamilyTab>("messages");

  // Guest claim token support — used when not authenticated
  const [guestProfileId, setGuestProfileId] = useState<string | null>(null);

  // Track managed connections. Protection is cleared ONLY when DB data confirms the change,
  // not on a timer or in finally blocks. This eliminates all race conditions.
  // "expect_absent" = archived/deleted, should NOT appear in active query
  // "expect_present" = unarchived, SHOULD appear in active query
  const managedOpsRef = useRef(new Map<string, "expect_absent" | "expect_present">());

  // Cache business profiles within the session to avoid re-fetching on every fetchConnections call
  const profileCacheRef = useRef(new Map<string, Profile>());

  // Auto-select from URL param and reset loading on navigation
  useEffect(() => {
    if (urlConnectionId) setSelectedId(urlConnectionId);
    // Reset loading to trigger fresh fetch on client-side navigation
    setLoading(true);
  }, [urlConnectionId, urlToken]);

  // Fetch guest profile from claim token (for unauthenticated users)
  useEffect(() => {
    if (user || activeProfile) return; // Already authenticated
    if (!isSupabaseConfigured()) return;

    // Check URL param first, then localStorage
    const claimToken = urlToken || localStorage.getItem(CLAIM_TOKEN_KEY);
    if (!claimToken) return;

    // If token came from URL, also save to localStorage for future visits
    if (urlToken) {
      try {
        localStorage.setItem(CLAIM_TOKEN_KEY, urlToken);
      } catch {
        // localStorage unavailable
      }
    }

    const fetchGuestProfile = async () => {
      try {
        const res = await fetch("/api/connections/guest-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimToken }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profileId) {
            setGuestProfileId(data.profileId);
          }
        }
      } catch (err) {
        console.error("[inbox] Failed to fetch guest profile:", err);
      }
    };

    fetchGuestProfile();
  }, [user, activeProfile, urlToken]);

  // Fetch connections
  const fetchConnections = useCallback(async () => {
    // For authenticated users, require activeProfile
    // For guests, use API endpoint (bypasses RLS)
    const hasAuthProfile = activeProfile && profiles.length > 0;

    // Guest flow: use API endpoint since RLS blocks direct queries
    if (!user && !hasAuthProfile) {
      const claimToken = urlToken || localStorage.getItem(CLAIM_TOKEN_KEY);
      if (!claimToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/connections/guest-inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimToken }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.connections?.length) {
            // Transform API response to match ConnectionWithProfile shape
            const conns: ConnectionWithProfile[] = data.connections.map((c: Record<string, unknown>) => {
              const toProfile = c.to_profile as Record<string, unknown> | null;
              return {
                id: c.id as string,
                type: c.type as string,
                status: c.status as ConnectionStatus,
                from_profile_id: data.profileId,
                to_profile_id: toProfile?.id as string,
                message: c.message as string | null,
                metadata: c.metadata as Record<string, unknown>,
                created_at: c.created_at as string,
                updated_at: c.updated_at as string,
                fromProfile: null, // Guest profile not needed for display
                toProfile: toProfile as Profile | null,
              };
            });
            setConnections(conns);
            setGuestProfileId(data.profileId);
          }
        }
      } catch (err) {
        console.error("[inbox] Failed to fetch guest connections:", err);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!hasAuthProfile) {
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      // Use only the active profile ID for data isolation
      // Each profile (organization/caregiver) should have its own isolated inbox
      const activeProfileId = activeProfile.id;

      // Fire archived count in the background — JSONB filter queries are slower and
      // don't need to block the active conversations render.
      // All HTTP requests start simultaneously since JS is single-threaded here.
      ;(async () => {
        try {
          const [archivedOut, archivedIn] = await Promise.all([
            supabase
              .from("connections")
              .select("id, metadata")
              .eq("from_profile_id", activeProfileId)
              .in("type", ["inquiry", "request"])
              .filter("metadata->>archived", "eq", "true"),
            supabase
              .from("connections")
              .select("id, metadata")
              .eq("to_profile_id", activeProfileId)
              .in("type", ["inquiry", "request"])
              .filter("metadata->>archived", "eq", "true"),
          ]);
          const archivedIds = new Set<string>();
          for (const c of [...(archivedOut.data || []), ...(archivedIn.data || [])]) {
            const meta = c.metadata as Record<string, unknown> | undefined;
            if (meta?.hidden) continue;
            archivedIds.add(c.id);
          }
          setArchivedCount(archivedIds.size);
        } catch (err) {
          console.error("[inbox] archived count error:", err);
        }
      })();

      // Only wait for active connections (pending/accepted) before proceeding to render
      // Query both inquiry connections AND accepted provider-initiated matches (type=request)
      const [outbound, inbound, matchesOutbound, matchesInbound] = await Promise.all([
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("from_profile_id", activeProfileId)
          .eq("type", "inquiry")
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("to_profile_id", activeProfileId)
          .eq("type", "inquiry")
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
        // Provider-sent requests: only show accepted (pending reach-outs stay in /provider/matches)
        // This prevents providers from seeing "conversations" before family accepts
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("from_profile_id", activeProfileId)
          .eq("type", "request")
          .eq("status", "accepted")
          .order("updated_at", { ascending: false }),
        // Family-received requests: show both pending (for accept/decline) and accepted
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("to_profile_id", activeProfileId)
          .eq("type", "request")
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
      ]);

      // Merge and deduplicate — skip hidden and metadata-archived connections
      // (archive state lives in metadata.archived, not the status column)
      // Includes: inquiries, accepted provider-sent requests, pending/accepted family-received requests
      const allConns = [
        ...(outbound.data || []),
        ...(inbound.data || []),
        ...(matchesOutbound.data || []),
        ...(matchesInbound.data || []),
      ] as Connection[];
      const deduped = new Map<string, Connection>();
      for (const conn of allConns) {
        const meta = conn.metadata as Record<string, unknown> | undefined;
        if (meta?.hidden || meta?.archived) continue;
        deduped.set(conn.id, conn);
      }
      const uniqueConns = Array.from(deduped.values());

      if (uniqueConns.length === 0) {
        // No active connections — all "expect_absent" ops are confirmed
        for (const [id, expected] of [...managedOpsRef.current.entries()]) {
          if (expected === "expect_absent") managedOpsRef.current.delete(id);
        }
        const managedSnapshot = new Set(managedOpsRef.current.keys());
        setConnections((prev) =>
          prev.filter((c) => c.status === "archived" || managedSnapshot.has(c.id))
        );
        setLoading(false);
        return;
      }

      // Collect all profile IDs for enrichment
      const allProfileIds = new Set<string>();
      for (const conn of uniqueConns) {
        allProfileIds.add(conn.from_profile_id);
        allProfileIds.add(conn.to_profile_id);
      }

      // Only fetch profiles not already in the session cache — avoids re-querying
      // on subsequent fetchConnections calls (e.g. triggered by events)
      const profileCache = profileCacheRef.current;
      const uncachedIds = Array.from(allProfileIds).filter((id) => !profileCache.has(id));

      if (uncachedIds.length > 0) {
        const { data: profileData } = await supabase
          .from("business_profiles")
          .select(
            "id, display_name, description, image_url, city, state, type, email, phone, website, slug, care_types, category, source_provider_id, metadata"
          )
          .in("id", uncachedIds);

        const newProfiles = (profileData as Profile[]) || [];

        // Resolve missing images from iOS provider table — only for newly fetched profiles
        const missingImageIds = newProfiles
          .filter((p) => !p.image_url && p.source_provider_id)
          .map((p) => p.source_provider_id as string);

        if (missingImageIds.length > 0) {
          const { data: iosProviders } = await supabase
            .from("olera-providers")
            .select("provider_id, provider_logo, provider_images")
            .in("provider_id", missingImageIds);

          if (iosProviders?.length) {
            const iosMap = new Map(
              iosProviders.map((p: { provider_id: string; provider_logo: string | null; provider_images: string | null }) => [
                p.provider_id,
                p.provider_logo || (p.provider_images?.split(" | ")[0]) || null,
              ])
            );
            for (const p of newProfiles) {
              if (!p.image_url && p.source_provider_id && iosMap.has(p.source_provider_id)) {
                p.image_url = iosMap.get(p.source_provider_id) || null;
              }
            }
          }
        }

        // Add newly fetched profiles to the session cache
        for (const p of newProfiles) {
          profileCache.set(p.id, p);
        }
      }

      const profileMap = profileCache;

      // Enrich connections with profiles
      const enriched: ConnectionWithProfile[] = uniqueConns.map((conn) => ({
        ...conn,
        fromProfile: profileMap.get(conn.from_profile_id) || null,
        toProfile: profileMap.get(conn.to_profile_id) || null,
      }));

      // Sort by last activity
      enriched.sort((a, b) => getLastActivityTime(b) - getLastActivityTime(a));

      // Clear managed ops that the DB has confirmed
      const enrichedIds = new Set(enriched.map((c) => c.id));
      for (const [id, expected] of [...managedOpsRef.current.entries()]) {
        if (expected === "expect_absent" && !enrichedIds.has(id)) {
          managedOpsRef.current.delete(id);
        } else if (expected === "expect_present" && enrichedIds.has(id)) {
          managedOpsRef.current.delete(id);
        }
      }

      // Snapshot managed keys BEFORE setConnections — immune to concurrent
      // handler mutations that could clear the ref between queuing and execution
      const managedSnapshot = new Set(managedOpsRef.current.keys());

      setConnections((prev) => {
        const prevById = new Map(prev.map((c) => [c.id, c]));

        // For managed connections still awaiting DB confirmation, keep local state
        const merged = enriched.map((c) =>
          managedSnapshot.has(c.id) && prevById.has(c.id) ? prevById.get(c.id)! : c
        );

        // Preserve connections not in enriched that should be kept
        const mergedIds = new Set(merged.map((c) => c.id));
        const keptFromPrev = prev.filter(
          (c) => !mergedIds.has(c.id) && (managedSnapshot.has(c.id) || c.status === "archived")
        );

        return [...merged, ...keptFromPrev];
      });

      // Sync navbar badge with actual unread count from loaded connections
      // This is the authoritative source — we have the connections and can check read state
      if (activeProfile) {
        const activeProfileId = activeProfile.id;
        // Get localStorage read IDs for this profile
        let localStorageReadIds = new Set<string>();
        try {
          const stored = localStorage.getItem(`olera_inbox_read_${activeProfileId}`);
          if (stored) {
            localStorageReadIds = new Set(JSON.parse(stored));
          }
        } catch { /* localStorage unavailable */ }

        // Count unread connections
        let unreadCount = 0;
        for (const conn of enriched) {
          const meta = conn.metadata as Record<string, unknown> | null;
          const readBy = (meta?.read_by as Record<string, string>) || {};
          const isReadInDb = !!readBy[activeProfileId];
          const isReadInLocalStorage = localStorageReadIds.has(conn.id);
          if (!isReadInDb && !isReadInLocalStorage) {
            unreadCount++;
          }
        }

        // Dispatch sync event to update navbar badge
        window.dispatchEvent(new CustomEvent("olera:inbox-sync", {
          detail: { count: unreadCount, profileIds: [activeProfileId] }
        }));
      }

      // Auto-select first conversation if none selected and on desktop
      if (!selectedIdRef.current && enriched.length > 0 && window.innerWidth >= 1024) {
        setSelectedId(enriched[0].id);
      }
    } catch (err) {
      console.error("[inbox] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, profiles, user, guestProfileId, urlToken, urlConnectionId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Poll for updates every 15 seconds (catches accepted connections, new messages)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConnections();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchConnections]);

  // Track if a manual refresh is in progress
  const [refreshing, setRefreshing] = useState(false);
  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConnections();
    setRefreshing(false);
  }, [fetchConnections]);

  // Auto-switch to Requests tab when URL points to a pending provider-initiated request
  // This handles old email links redirected via next.config.ts (/portal/matches/:id → /portal/inbox?id=:id)
  useEffect(() => {
    if (!urlConnectionId || !familyProfileId || loading) return;

    const conn = connections.find((c) => c.id === urlConnectionId);
    if (!conn) return;

    // Check if this is a pending provider-initiated request
    const isProviderInitiated = conn.to_profile_id === familyProfileId;
    const isPending = conn.status === "pending";

    if (isProviderInitiated && isPending && familyTab !== "requests") {
      setFamilyTab("requests");
    }
  }, [urlConnectionId, familyProfileId, connections, loading, familyTab]);

  // Re-fetch when a new connection is created (e.g. user connected from browse/suggested)
  useEffect(() => {
    const handler = () => fetchConnections();
    window.addEventListener("olera:connection-created", handler);
    return () => window.removeEventListener("olera:connection-created", handler);
  }, [fetchConnections]);

  // Lazy-load archived connections when the user opens the archive section
  const archivedLoadedRef = useRef(false);
  // Reset archived cache when active profile changes (profile switching)
  useEffect(() => {
    archivedLoadedRef.current = false;
  }, [activeProfile?.id]);

  const fetchArchived = useCallback(async () => {
    if (archivedLoadedRef.current || !activeProfile || !isSupabaseConfigured()) return;
    archivedLoadedRef.current = true;

    try {
      const supabase = createClient();
      // Use only the active profile ID for data isolation (same as fetchConnections)
      const activeProfileId = activeProfile.id;

      // Archive state is in metadata.archived = true (not status column)
      // Include both inquiry and request types
      const [outbound, inbound] = await Promise.all([
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("from_profile_id", activeProfileId)
          .in("type", ["inquiry", "request"])
          .filter("metadata->>archived", "eq", "true")
          .order("updated_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("to_profile_id", activeProfileId)
          .in("type", ["inquiry", "request"])
          .filter("metadata->>archived", "eq", "true")
          .order("updated_at", { ascending: false }),
      ]);

      const allConns = [...(outbound.data || []), ...(inbound.data || [])] as Connection[];
      const deduped = new Map<string, Connection>();
      for (const conn of allConns) {
        const meta = conn.metadata as Record<string, unknown> | undefined;
        if (meta?.hidden) continue;
        deduped.set(conn.id, conn);
      }
      const archivedConns = Array.from(deduped.values());
      if (archivedConns.length === 0) return;

      // Fetch profiles for enrichment
      const archiveProfileIds = new Set<string>();
      for (const conn of archivedConns) {
        archiveProfileIds.add(conn.from_profile_id);
        archiveProfileIds.add(conn.to_profile_id);
      }

      const { data: profileData } = await supabase
        .from("business_profiles")
        .select("id, display_name, description, image_url, city, state, type, email, phone, website, slug, care_types, category, source_provider_id, metadata")
        .in("id", Array.from(archiveProfileIds));

      const profileMap = new Map(((profileData as Profile[]) || []).map((p) => [p.id, p]));

      const enriched: ConnectionWithProfile[] = archivedConns.map((conn) => ({
        ...conn,
        // Override status for UI — real status is still pending/accepted in DB,
        // but metadata.archived = true means it should be treated as archived
        status: "archived" as ConnectionStatus,
        fromProfile: profileMap.get(conn.from_profile_id) || null,
        toProfile: profileMap.get(conn.to_profile_id) || null,
      }));

      // Append to existing connections (avoid duplicates from optimistic updates)
      setConnections((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newOnes = enriched.filter((c) => !existingIds.has(c.id));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
    } catch (err) {
      console.error("[inbox] fetch archived error:", err);
      archivedLoadedRef.current = false; // Allow retry
    }
  }, [activeProfile]);

  // Handle message sent — update thread in local state
  const handleMessageSent = useCallback((connectionId: string, thread: ThreadMessage[]) => {
    setConnections((prev) =>
      prev.map((conn) =>
        conn.id === connectionId
          ? {
              ...conn,
              metadata: {
                ...((conn.metadata as Record<string, unknown>) || {}),
                thread,
              },
            }
          : conn
      )
    );
  }, []);

  const selectedConnection = connections.find((c) => c.id === selectedId) || null;

  // Determine the "other" profile for the detail panel
  const isInbound = selectedConnection?.to_profile_id === activeProfile?.id;
  const otherProfile = selectedConnection
    ? isInbound ? selectedConnection.fromProfile : selectedConnection.toProfile
    : null;

  // Determine if we're viewing a pending request (provider-initiated, family is recipient)
  // This determines whether to show RequestDetailPanel or ConversationPanel
  const isViewingPendingRequest = useMemo(() => {
    if (!selectedConnection || !familyProfileId) return false;
    // Provider-initiated means family is the to_profile_id
    const isProviderInitiated = selectedConnection.to_profile_id === familyProfileId;
    // Check if it's a pending request (not yet accepted)
    const isPending = selectedConnection.status === "pending";
    // Only show request panel when on Requests tab
    const isOnRequestsTab = familyTab === "requests";
    return isProviderInitiated && isPending && isOnRequestsTab;
  }, [selectedConnection, familyProfileId, familyTab]);

  // Close detail panel when switching conversations
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  // Open report modal
  const handleReportClick = useCallback((connectionId: string) => {
    setReportingConnectionId(connectionId);
  }, []);

  // Helper: call the server-side manage API (bypasses RLS)
  const manageConnection = useCallback(
    async (payload: { connectionId: string; action: string; reportReason?: string; reportDetails?: string }) => {
      const res = await fetch("/api/connections/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update connection");
      }
      return res.json();
    },
    []
  );

  // Handle connecting with a provider (accepting their request)
  const handleConnectRequest = useCallback(async (connectionId: string) => {
    try {
      await manageConnection({ connectionId, action: "accept" });

      // Update local state to reflect acceptance
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId ? { ...c, status: "accepted" as ConnectionStatus } : c
        )
      );

      // Switch to Messages tab and keep the conversation selected
      setFamilyTab("messages");
    } catch (err) {
      console.error("[inbox] connect request failed:", err);
    }
  }, [manageConnection]);

  // Handle declining a provider's request
  const handleDeclineRequest = useCallback(async (connectionId: string) => {
    try {
      await manageConnection({ connectionId, action: "decline" });

      // Remove from local state
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      setSelectedId(null);
    } catch (err) {
      console.error("[inbox] decline request failed:", err);
    }
  }, [manageConnection]);

  // Submit report — pessimistic: wait for API confirmation before updating state.
  // No optimistic update = no revert = no bounce.
  const handleReportSubmit = useCallback(async (connectionId: string, reason: string, details: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    // Close modal and deselect immediately (UI feedback)
    if (selectedIdRef.current === connectionId) setSelectedId(null);
    setReportingConnectionId(null);

    try {
      await manageConnection({ connectionId, action: "report", reportReason: reason, reportDetails: details });

      // API confirmed — now update local state
      const existingMeta = (conn.metadata as Record<string, unknown>) || {};
      const updatedMeta = {
        ...existingMeta,
        archived: true,
        reported: true,
        reported_at: new Date().toISOString(),
        reported_by: activeProfile?.id,
        report_reason: reason,
        report_details: details || null,
        archived_from_status: conn.status,
      };

      managedOpsRef.current.set(connectionId, "expect_absent");
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId
            ? { ...c, status: "archived" as ConnectionStatus, metadata: updatedMeta }
            : c
        )
      );
      setArchivedCount((prev) => prev + 1);
    } catch (err) {
      console.error("[inbox] report failed:", err);
    }
  }, [activeProfile?.id, manageConnection]);

  // Archive a connection — pessimistic: wait for API confirmation
  const handleArchive = useCallback(async (connectionId: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    // Deselect immediately (UI feedback)
    if (selectedIdRef.current === connectionId) setSelectedId(null);

    try {
      await manageConnection({ connectionId, action: "archive" });

      // API confirmed — now update local state
      const existingMeta = (conn.metadata as Record<string, unknown>) || {};
      const archiveMeta = { ...existingMeta, archived: true, archived_from_status: conn.status };

      managedOpsRef.current.set(connectionId, "expect_absent");
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId
            ? { ...c, status: "archived" as ConnectionStatus, metadata: archiveMeta }
            : c
        )
      );
      setArchivedCount((prev) => prev + 1);
    } catch (err) {
      console.error("[inbox] archive failed:", err);
    }
  }, [manageConnection]);

  // Unarchive a connection — pessimistic: wait for API confirmation
  const handleUnarchive = useCallback(async (connectionId: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    try {
      await manageConnection({ connectionId, action: "unarchive" });

      // API confirmed — now update local state
      const meta = (conn.metadata as Record<string, unknown>) || {};
      const restoreStatus = (meta.archived_from_status as ConnectionStatus) || "accepted";

      managedOpsRef.current.set(connectionId, "expect_present");
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId ? { ...c, status: restoreStatus } : c
        )
      );
      setArchivedCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[inbox] unarchive failed:", err);
    }
  }, [manageConnection]);

  // Delete a connection — pessimistic: wait for API confirmation
  const handleDelete = useCallback(async (connectionId: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    if (selectedIdRef.current === connectionId) setSelectedId(null);

    try {
      await manageConnection({ connectionId, action: "delete" });

      // API confirmed — now remove from state
      const wasArchived = conn.status === "archived" ||
        !!((conn.metadata as Record<string, unknown>)?.archived);
      managedOpsRef.current.set(connectionId, "expect_absent");
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      if (wasArchived) {
        setArchivedCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("[inbox] delete failed:", err);
    }
  }, [manageConnection]);

  return (
    <div className="h-[calc(100dvh-64px)] bg-white">
    <div className="h-full flex">
      {/* Left panel — conversation list */}
      <ConversationList
        connections={connections}
        selectedId={selectedId}
        onSelect={handleSelect}
        loading={loading}
        activeProfileId={activeProfile?.id || ""}
        onReportConnection={handleReportClick}
        onArchiveConnection={handleArchive}
        onUnarchiveConnection={handleUnarchive}
        onDeleteConnection={handleDelete}
        onLoadArchived={fetchArchived}
        archivedCount={archivedCount}
        className={`w-full lg:w-[360px] lg:shrink-0 ${selectedId ? "hidden lg:flex" : "flex"}`}
        variant={roleFilter === "provider" ? "provider" : "family"}
        roleFilter={roleFilter}
        onRoleFilterChange={handleRoleFilterChange}
        providerProfileIds={providerProfileIds}
        showRoleFilters={showRoleFilters}
        isProfileLive={isProfileLive}
        familyProfileId={familyProfileId || undefined}
        familyTab={familyTab}
        onFamilyTabChange={setFamilyTab}
        onRefresh={handleManualRefresh}
        refreshing={refreshing}
      />

      {/* Middle panel — request detail OR conversation */}
      {isViewingPendingRequest && selectedConnection ? (
        <RequestDetailPanel
          connection={selectedConnection}
          onConnect={handleConnectRequest}
          onDecline={handleDeclineRequest}
          onBack={() => setSelectedId(null)}
          className={`w-full lg:flex-1 ${selectedId ? "flex" : "hidden lg:flex"}`}
        />
      ) : (
        <ConversationPanel
          connection={selectedConnection}
          activeProfile={activeProfile ?? null}
          onMessageSent={handleMessageSent}
          onBack={() => setSelectedId(null)}
          detailOpen={detailOpen}
          onToggleDetail={() => setDetailOpen((p) => !p)}
          className={`w-full lg:flex-1 ${selectedId ? "flex" : "hidden lg:flex"}`}
          claimToken={!user && !activeProfile ? (urlToken || localStorage.getItem(CLAIM_TOKEN_KEY)) : null}
          guestProfileId={guestProfileId}
        />
      )}

      {/* Right panel — provider details (animated width) */}
      {otherProfile && (
        <div
          className={`hidden lg:flex shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
            detailOpen ? "w-[360px]" : "w-0"
          }`}
        >
          <ProviderDetailPanel
            profile={otherProfile}
            onClose={() => setDetailOpen(false)}
            className="flex w-[360px] h-full"
          />
        </div>
      )}
    </div>

    {/* Report modal */}
    {reportingConnectionId && (
      <ReportConnectionModal
        connectionId={reportingConnectionId}
        onClose={() => setReportingConnectionId(null)}
        onSubmit={handleReportSubmit}
      />
    )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100dvh-64px)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <InboxContent />
    </Suspense>
  );
}

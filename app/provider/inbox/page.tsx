"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Connection, ConnectionStatus, Profile } from "@/lib/types";
import ConversationList from "@/components/messaging/ConversationList";
import type { ConnectionWithProfile } from "@/components/messaging/ConversationList";
import ConversationPanel from "@/components/messaging/ConversationPanel";
import ProviderDetailPanel from "@/components/messaging/ProviderDetailPanel";
import ReportConnectionModal from "@/components/messaging/ReportConnectionModal";

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

/**
 * Provider Inbox - renders inbox with provider hub navbar visible.
 * This is a copy of the portal inbox but hardcoded to provider role
 * so the navbar stays in provider mode.
 */
function ProviderInboxContent() {
  const searchParams = useSearchParams();
  const { activeProfile, profiles, user } = useAuth();

  // Extract URL params
  const urlConnectionId = searchParams.get("id");

  // Compute provider profile IDs
  const providerProfileIds = useMemo(() => {
    const providerIds = new Set<string>();
    for (const p of profiles) {
      if (p.type === "organization" || p.type === "caregiver") {
        providerIds.add(p.id);
      }
    }
    return providerIds;
  }, [profiles]);

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

  // Track managed connections
  const managedOpsRef = useRef(new Map<string, "expect_absent" | "expect_present">());

  // Cache business profiles within the session
  const profileCacheRef = useRef(new Map<string, Profile>());

  // Auto-select from URL param
  useEffect(() => {
    if (urlConnectionId) setSelectedId(urlConnectionId);
    setLoading(true);
  }, [urlConnectionId]);

  // Fetch connections
  const fetchConnections = useCallback(async () => {
    const hasAuthProfile = activeProfile && profiles.length > 0;

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
      const activeProfileId = activeProfile.id;

      // Fire archived count in the background
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

      // Fetch active connections
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
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("from_profile_id", activeProfileId)
          .eq("type", "request")
          .eq("status", "accepted")
          .order("updated_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("to_profile_id", activeProfileId)
          .eq("type", "request")
          .eq("status", "accepted")
          .order("updated_at", { ascending: false }),
      ]);

      // Merge and deduplicate
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

      // Collect profile IDs
      const allProfileIds = new Set<string>();
      for (const conn of uniqueConns) {
        allProfileIds.add(conn.from_profile_id);
        allProfileIds.add(conn.to_profile_id);
      }

      // Fetch uncached profiles
      const profileCache = profileCacheRef.current;
      const uncachedIds = Array.from(allProfileIds).filter((id) => !profileCache.has(id));

      if (uncachedIds.length > 0) {
        const { data: profileData } = await supabase
          .from("business_profiles")
          .select(
            "id, display_name, description, image_url, city, state, type, email, phone, website, slug, care_types, category, source_provider_id"
          )
          .in("id", uncachedIds);

        const newProfiles = (profileData as Profile[]) || [];

        // Resolve missing images from iOS provider table
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

        for (const p of newProfiles) {
          profileCache.set(p.id, p);
        }
      }

      const profileMap = profileCache;

      // Enrich connections
      const enriched: ConnectionWithProfile[] = uniqueConns.map((conn) => ({
        ...conn,
        fromProfile: profileMap.get(conn.from_profile_id) || null,
        toProfile: profileMap.get(conn.to_profile_id) || null,
      }));

      // Sort by last activity
      enriched.sort((a, b) => getLastActivityTime(b) - getLastActivityTime(a));

      // Clear confirmed managed ops
      const enrichedIds = new Set(enriched.map((c) => c.id));
      for (const [id, expected] of [...managedOpsRef.current.entries()]) {
        if (expected === "expect_absent" && !enrichedIds.has(id)) {
          managedOpsRef.current.delete(id);
        } else if (expected === "expect_present" && enrichedIds.has(id)) {
          managedOpsRef.current.delete(id);
        }
      }

      const managedSnapshot = new Set(managedOpsRef.current.keys());

      setConnections((prev) => {
        const prevById = new Map(prev.map((c) => [c.id, c]));
        const merged = enriched.map((c) =>
          managedSnapshot.has(c.id) && prevById.has(c.id) ? prevById.get(c.id)! : c
        );
        const mergedIds = new Set(merged.map((c) => c.id));
        const keptFromPrev = prev.filter(
          (c) => !mergedIds.has(c.id) && (managedSnapshot.has(c.id) || c.status === "archived")
        );
        return [...merged, ...keptFromPrev];
      });

      // Auto-select first conversation on desktop
      if (!selectedIdRef.current && enriched.length > 0 && window.innerWidth >= 1024) {
        setSelectedId(enriched[0].id);
      }
    } catch (err) {
      console.error("[inbox] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, profiles]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Re-fetch when a new connection is created
  useEffect(() => {
    const handler = () => fetchConnections();
    window.addEventListener("olera:connection-created", handler);
    return () => window.removeEventListener("olera:connection-created", handler);
  }, [fetchConnections]);

  // Lazy-load archived connections
  const archivedLoadedRef = useRef(false);
  useEffect(() => {
    archivedLoadedRef.current = false;
  }, [activeProfile?.id]);

  const fetchArchived = useCallback(async () => {
    if (archivedLoadedRef.current || !activeProfile || !isSupabaseConfigured()) return;
    archivedLoadedRef.current = true;

    try {
      const supabase = createClient();
      const activeProfileId = activeProfile.id;

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

      const archiveProfileIds = new Set<string>();
      for (const conn of archivedConns) {
        archiveProfileIds.add(conn.from_profile_id);
        archiveProfileIds.add(conn.to_profile_id);
      }

      const { data: profileData } = await supabase
        .from("business_profiles")
        .select("id, display_name, description, image_url, city, state, type, email, phone, website, slug, care_types, category, source_provider_id")
        .in("id", Array.from(archiveProfileIds));

      const profileMap = new Map(((profileData as Profile[]) || []).map((p) => [p.id, p]));

      const enriched: ConnectionWithProfile[] = archivedConns.map((conn) => ({
        ...conn,
        status: "archived" as ConnectionStatus,
        fromProfile: profileMap.get(conn.from_profile_id) || null,
        toProfile: profileMap.get(conn.to_profile_id) || null,
      }));

      setConnections((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newOnes = enriched.filter((c) => !existingIds.has(c.id));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
    } catch (err) {
      console.error("[inbox] fetch archived error:", err);
      archivedLoadedRef.current = false;
    }
  }, [activeProfile]);

  // Handle message sent
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

  const isInbound = selectedConnection?.to_profile_id === activeProfile?.id;
  const otherProfile = selectedConnection
    ? isInbound ? selectedConnection.fromProfile : selectedConnection.toProfile
    : null;

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleReportClick = useCallback((connectionId: string) => {
    setReportingConnectionId(connectionId);
  }, []);

  // Connection management
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

  const handleReportSubmit = useCallback(async (connectionId: string, reason: string, details: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    if (selectedIdRef.current === connectionId) setSelectedId(null);
    setReportingConnectionId(null);

    try {
      await manageConnection({ connectionId, action: "report", reportReason: reason, reportDetails: details });

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

  const handleArchive = useCallback(async (connectionId: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    if (selectedIdRef.current === connectionId) setSelectedId(null);

    try {
      await manageConnection({ connectionId, action: "archive" });

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

  const handleUnarchive = useCallback(async (connectionId: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    try {
      await manageConnection({ connectionId, action: "unarchive" });

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

  const handleDelete = useCallback(async (connectionId: string) => {
    const conn = connectionsRef.current.find((c) => c.id === connectionId);
    if (!conn) return;

    if (selectedIdRef.current === connectionId) setSelectedId(null);

    try {
      await manageConnection({ connectionId, action: "delete" });

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
          variant="provider"
          roleFilter="provider"
          providerProfileIds={providerProfileIds}
          showRoleFilters={false}
        />

        {/* Middle panel — conversation detail */}
        <ConversationPanel
          connection={selectedConnection}
          activeProfile={activeProfile ?? null}
          onMessageSent={handleMessageSent}
          onBack={() => setSelectedId(null)}
          detailOpen={detailOpen}
          onToggleDetail={() => setDetailOpen((p) => !p)}
          className={`w-full lg:flex-1 ${selectedId ? "flex" : "hidden lg:flex"}`}
        />

        {/* Right panel — provider details */}
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

export default function ProviderInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100dvh-64px)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ProviderInboxContent />
    </Suspense>
  );
}

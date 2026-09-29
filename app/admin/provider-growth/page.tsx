"use client";

/**
 * Provider Growth Page
 *
 * Tracks claimed providers through their lifecycle from initial claim
 * through verification, pitch meetings, and conversion to paying customers.
 *
 * Pipeline: New Claims → Meeting Scheduled → Pitched → Not Interested
 * Conversion: Ads (free_intro → subscribed) | MedJobs (in_pilot → subscribed)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ProviderGrowthWithProfile, GrowthStats, AdminCounts, WorkQueueResult } from "@/lib/provider-growth/queries";
import type { PipelineStage } from "@/lib/provider-growth/stages";
import DateRangePopover, {
  resolveRange,
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import { AdminFilterChips } from "@/components/admin/provider-outreach/AdminFilterChips";
import {
  CallbackBanner,
  GrowthTabs,
  StatsHeader,
  ProviderRow,
  ProviderDrawer,
  ProviderFilters,
  WorkQueueTab,
  type ActiveTab,
  type ProviderFiltersValue,
} from "./components";

const PAGE_SIZE = 50;
const DEFAULT_DATE_RANGE: DateRangeValue = { preset: "all", customFrom: "", customTo: "" };

/**
 * Generate a unique key for localStorage persistence of admin filter per-tab.
 */
function getTabKey(tab: ActiveTab): string {
  if (tab.type === "work_queue") {
    return "provider-growth-work-queue";
  }
  if (tab.type === "pipeline") {
    if (tab.subTab) {
      return `provider-growth-${tab.stage}-${tab.subTab}`;
    }
    return `provider-growth-${tab.stage}`;
  }
  return `provider-growth-${tab.tab}-${tab.subTab}`;
}

export default function ProviderGrowthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const tab = searchParams.get("tab");
    const sub = searchParams.get("sub") as "ads_only" | "medjobs_only" | "both" | "churned" | "not_contacted" | "in_progress" | "live" | "ended" | "active" | "no_show" | "not_interested" | "converted" | null;

    // Work Queue tab with subtabs
    if (tab === "work_queue") {
      const validSubTabs = ["returned_calls", "overdue", "due_today", "needs_retry", "stale"];
      const subTab = sub && validSubTabs.includes(sub) ? (sub as "returned_calls" | "overdue" | "due_today" | "needs_retry" | "stale") : "returned_calls";
      return { type: "work_queue", subTab };
    }

    // Check for new_claim with subtab (Claimed tab)
    if (tab === "new_claim") {
      // Backwards compatibility: old ?tab=new_claim&sub=converted → Converted tab
      if (sub === "converted") {
        return { type: "conversion", tab: "converted", subTab: "not_contacted" };
      }
      const validSubTabs = ["not_contacted", "in_progress"];
      const subTab = sub && validSubTabs.includes(sub) ? (sub as "not_contacted" | "in_progress") : "not_contacted";
      return { type: "pipeline", stage: "new_claim", subTab };
    }

    // Backwards compatibility: old ?tab=in_progress URLs → Claimed → In Progress
    if (tab === "in_progress") {
      return { type: "pipeline", stage: "new_claim", subTab: "in_progress" };
    }

    // Converted tab (conversion type with subtabs)
    if (tab === "converted") {
      const validSubTabs = ["not_contacted", "in_progress", "live", "ended"];
      const subTab = sub && validSubTabs.includes(sub) ? (sub as "not_contacted" | "in_progress" | "live" | "ended") : "not_contacted";
      return { type: "conversion", tab: "converted", subTab };
    }

    // Meeting Scheduled has no subtabs - show all meetings, focus shown as badge
    if (tab === "meeting_scheduled") {
      return { type: "pipeline", stage: "meeting_scheduled" };
    }

    // Check for pitched (Follow-up) with subtab
    if (tab === "pitched") {
      const validSubTabs = ["active", "no_show", "not_interested"];
      const subTab = sub && validSubTabs.includes(sub) ? (sub as "active" | "no_show" | "not_interested") : "active";
      return { type: "pipeline", stage: "pitched", subTab };
    }

    // Check for paying tab
    if (tab === "paying" && sub && ["ads_only", "medjobs_only", "both", "churned"].includes(sub)) {
      return { type: "conversion", tab: "paying", subTab: sub as "ads_only" | "medjobs_only" | "both" | "churned" };
    }

    // Default to new_claim with not_contacted subtab
    return { type: "pipeline", stage: "new_claim", subTab: "not_contacted" };
  });

  // Data state
  const [providers, setProviders] = useState<ProviderGrowthWithProfile[]>([]);
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [claimedSubtabCounts, setClaimedSubtabCounts] = useState<{
    notContacted: number;
    inProgress: number;
  } | null>(null);
  const [convertedSubtabCounts, setConvertedSubtabCounts] = useState<{
    notContacted: number;
    inProgress: number;
    live: number;
    ended: number;
  } | null>(null);
  const [workQueueCount, setWorkQueueCount] = useState<number>(0);
  const [workQueueData, setWorkQueueData] = useState<WorkQueueResult | null>(null);
  const [workQueueError, setWorkQueueError] = useState<string | null>(null);
  const [workQueueSubtabCounts, setWorkQueueSubtabCounts] = useState<{
    returnedCalls: number;
    overdue: number;
    dueToday: number;
    needsRetry: number;
    stale: number;
  } | null>(null);
  const [adminCounts, setAdminCounts] = useState<AdminCounts>({});
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [total, setTotal] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [providerFilters, setProviderFilters] = useState<ProviderFiltersValue>({
    completenessMin: undefined,
    completenessMax: undefined,
    careTypes: [],
  });

  // Pagination state
  const [page, setPage] = useState(0);

  // Selection state
  const [selectedProvider, setSelectedProvider] = useState<ProviderGrowthWithProfile | null>(null);
  const selectedProviderIdRef = useRef<string | null>(null);

  // Delete state
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Assignment state
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [adminNameLookup, setAdminNameLookup] = useState<Map<string, string>>(new Map());

  // Callback banner refresh key - increment to trigger refetch
  const [callbackRefreshKey, setCallbackRefreshKey] = useState(0);

  // Keep ref in sync with selected provider
  useEffect(() => {
    selectedProviderIdRef.current = selectedProvider?.id ?? null;
  }, [selectedProvider]);

  // Fetch admin list for name lookup on mount
  useEffect(() => {
    async function fetchAdmins() {
      try {
        const res = await fetch("/api/admin/provider-outreach/admins");
        if (res.ok) {
          const data = await res.json();
          const lookup = new Map<string, string>();
          for (const admin of data.admins || []) {
            lookup.set(admin.id, admin.display_name || admin.email.split("@")[0]);
          }
          setAdminNameLookup(lookup);
        }
      } catch (err) {
        console.error("Failed to fetch admin list:", err);
      }
    }
    fetchAdmins();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when date range changes
  useEffect(() => {
    setPage(0);
  }, [dateRange]);

  // Reset page when admin filter changes
  useEffect(() => {
    setPage(0);
  }, [selectedAdminFilter]);

  // Reset page when provider filters change
  useEffect(() => {
    setPage(0);
  }, [providerFilters]);

  // Fetch stats (including subtab counts and work queue count)
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [statsRes, subtabRes, workQueueRes] = await Promise.all([
        fetch("/api/admin/provider-growth/stats"),
        fetch("/api/admin/provider-growth/subtab-counts"),
        fetch("/api/admin/provider-growth/work-queue"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      if (subtabRes.ok) {
        const data = await subtabRes.json();
        // Set claimed subtab counts (not_contacted, in_progress) - non-converted providers
        setClaimedSubtabCounts({
          notContacted: data.claimed.notContacted,
          inProgress: data.claimed.inProgress,
        });
        // Set converted subtab counts - providers on free trial, organized by campaign status
        setConvertedSubtabCounts({
          notContacted: data.converted.notContacted,
          inProgress: data.converted.inProgress,
          live: data.converted.live,
          ended: data.converted.ended,
        });
      }

      if (workQueueRes.ok) {
        const data = await workQueueRes.json() as WorkQueueResult;
        setWorkQueueData(data);
        setWorkQueueError(null);
        setWorkQueueCount(data.totalCount || 0);
        setWorkQueueSubtabCounts({
          returnedCalls: data.returnedCalls?.length || 0,
          overdue: data.overdueCallbacks?.length || 0,
          dueToday: data.dueToday?.length || 0,
          needsRetry: data.needsRetry?.length || 0,
          stale: data.stale?.length || 0,
        });
      } else {
        setWorkQueueError("Failed to load work queue");
      }
    } catch (e) {
      console.error("Failed to fetch stats:", e);
      setWorkQueueError("Failed to load work queue");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Fetch providers
  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // Set filters based on active tab
      // Skip fetching providers for work_queue tab - it uses WorkQueueTab component
      if (activeTab.type === "work_queue") {
        setLoading(false);
        return;
      }

      if (activeTab.type === "pipeline") {
        // For Follow-up tab (pitched), filter based on subtab
        if (activeTab.stage === "pitched") {
          // Each subtab maps to a different pipeline stage
          if (activeTab.subTab === "no_show") {
            params.set("pipelineStage", "no_show");
          } else if (activeTab.subTab === "not_interested") {
            params.set("pipelineStage", "not_interested");
          } else {
            // "active" subtab (or no subtab) shows pitched stage
            params.set("pipelineStage", "pitched");
          }
        } else if (activeTab.stage === "meeting_scheduled") {
          // Meeting Scheduled shows all meetings (both meeting_scheduled and upgrade_meeting)
          // No subtabs - meeting focus is displayed as a badge on each row
          params.set("pipelineStage", "meeting_scheduled,upgrade_meeting");
        } else {
          params.set("pipelineStage", activeTab.stage);
        }

        // For new_claim (Claimed tab), apply filters based on subtab
        if (activeTab.stage === "new_claim" && activeTab.subTab) {
          if (activeTab.subTab === "not_contacted") {
            // Not contacted: no calls AND not converted (never started free trial)
            params.set("hasCallAttempts", "false");
            params.set("notConverted", "true");
          } else if (activeTab.subTab === "in_progress") {
            // In progress: has call attempts AND not converted
            params.set("hasCallAttempts", "true");
            params.set("notConverted", "true");
          }
        }
      } else if (activeTab.type === "conversion") {
        // Conversion tabs (Converted and Paying)
        if (activeTab.tab === "converted") {
          // Converted tab: providers on free trial (not yet paying)
          params.set("pipelineStage", "new_claim");
          params.set("converted", "true");
          if (activeTab.subTab === "not_contacted") {
            // No calls yet, campaign not live/ended
            params.set("hasCallAttempts", "false");
            params.set("campaignStatusNot", "live,ended");
          } else if (activeTab.subTab === "in_progress") {
            // Has calls, campaign not live/ended
            params.set("hasCallAttempts", "true");
            params.set("campaignStatusNot", "live,ended");
          } else if (activeTab.subTab === "live") {
            // Campaign is currently live
            params.set("campaignStatus", "live");
          } else if (activeTab.subTab === "ended") {
            // Campaign has ended
            params.set("campaignStatus", "ended");
          }
        } else if (activeTab.tab === "paying") {
          if (activeTab.subTab === "ads_only") {
            params.set("adsOnly", "true");
          } else if (activeTab.subTab === "medjobs_only") {
            params.set("medjobsOnly", "true");
          } else if (activeTab.subTab === "both") {
            params.set("adsStatus", "subscribed");
            params.set("medjobsStatus", "subscribed");
          } else if (activeTab.subTab === "churned") {
            params.set("churned", "true");
          }
        }
      }

      // Admin filter
      if (selectedAdminFilter) {
        params.set("assignedTo", selectedAdminFilter);
      }

      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      // Date range filtering
      const resolved = resolveRange(dateRange);
      if (resolved.from) {
        params.set("claimedFrom", resolved.from);
      }
      if (resolved.to) {
        params.set("claimedTo", resolved.to);
      }

      // Pagination
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      // Provider filters (completeness and care types)
      if (providerFilters.completenessMin !== undefined) {
        params.set("completenessMin", String(providerFilters.completenessMin));
      }
      if (providerFilters.completenessMax !== undefined) {
        params.set("completenessMax", String(providerFilters.completenessMax));
      }
      if (providerFilters.careTypes.length > 0) {
        params.set("careTypes", providerFilters.careTypes.join(","));
      }

      const res = await fetch(`/api/admin/provider-growth?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers);
        setTotal(data.total);
        // Update admin counts from response
        if (data.admin_counts) {
          setAdminCounts(data.admin_counts);
        }
      }
    } catch (e) {
      console.error("Failed to fetch providers:", e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, dateRange, page, selectedAdminFilter, providerFilters]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Handle tab change
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSelectedProvider(null);
    setPage(0); // Reset to first page
    // Don't reset admin filter - it persists per-tab via localStorage in AdminFilterChips

    // Update URL
    if (tab.type === "work_queue") {
      router.push(`/admin/provider-growth?tab=work_queue&sub=${tab.subTab}`, { scroll: false });
    } else if (tab.type === "pipeline") {
      // Include subtab for tabs that have them (new_claim and pitched have subtabs)
      // meeting_scheduled has no subtabs
      if ((tab.stage === "new_claim" || tab.stage === "pitched") && tab.subTab) {
        router.push(`/admin/provider-growth?tab=${tab.stage}&sub=${tab.subTab}`, { scroll: false });
      } else {
        router.push(`/admin/provider-growth?tab=${tab.stage}`, { scroll: false });
      }
    } else {
      // Conversion tabs (converted and paying)
      router.push(`/admin/provider-growth?tab=${tab.tab}&sub=${tab.subTab}`, { scroll: false });
    }
  };

  // Handle provider update (after drawer action)
  const handleProviderUpdate = async () => {
    await fetchProviders();
    fetchStats();
  };

  // Handle delete from tracking
  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/admin/provider-growth?tracking_id=${encodeURIComponent(pendingDelete.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setPendingDelete(null);
        // If we deleted the selected provider, clear selection
        if (selectedProvider?.id === pendingDelete.id) {
          setSelectedProvider(null);
        }
        await fetchProviders();
        fetchStats();
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Failed to remove");
      }
    } catch (e) {
      console.error("Failed to delete:", e);
      setDeleteError("Network error");
    } finally {
      setDeleting(false);
    }
  };

  // Update selected provider when providers list changes
  useEffect(() => {
    const currentId = selectedProviderIdRef.current;
    if (currentId) {
      const updated = providers.find((p) => p.id === currentId);
      if (updated) {
        setSelectedProvider(updated);
      }
    }
  }, [providers]);

  // Handle assignment update
  const handleAssignmentUpdate = async (
    trackingId: string,
    adminId: string | null,
    adminName: string | null
  ) => {
    try {
      const res = await fetch("/api/admin/provider-growth/update-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_id: trackingId,
          assigned_to: adminId,
        }),
      });

      if (res.ok) {
        // Close picker and update local state on success
        setEditingAssignmentId(null);

        setProviders((prev) =>
          prev.map((p) =>
            p.id === trackingId
              ? { ...p, assigned_to: adminId }
              : p
          )
        );

        // Update the admin name lookup if we got a new name
        if (adminId && adminName) {
          setAdminNameLookup((prev) => {
            const next = new Map(prev);
            next.set(adminId, adminName);
            return next;
          });
        }
      } else {
        // On failure, keep picker open so user knows something went wrong
        console.error("Failed to update assignment");
      }
    } catch (err) {
      // On network error, keep picker open
      console.error("Failed to update assignment:", err);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Fetch a single provider by tracking ID
  const fetchAndSelectProvider = useCallback(async (trackingId: string) => {
    // First check if it's already in the providers list
    const cached = providers.find((p) => p.id === trackingId);
    if (cached) {
      setSelectedProvider(cached);
      return;
    }

    // Fetch from API - use the main listing API with a filter
    try {
      const res = await fetch(`/api/admin/provider-growth?trackingId=${trackingId}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.providers?.length > 0) {
          setSelectedProvider(data.providers[0]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch provider:", e);
    }
  }, [providers]);

  // Handle clicking a provider from the callback banner
  const handleCallbackProviderClick = (trackingId: string) => {
    fetchAndSelectProvider(trackingId);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Provider Growth</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track claimed providers from claim to conversion
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Date range filter */}
            <DateRangePopover
              value={dateRange}
              onChange={setDateRange}
              ariaLabel="Filter by claim date"
            />

            {/* Lead scoring filters */}
            <ProviderFilters
              value={providerFilters}
              onChange={setProviderFilters}
            />

            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search providers..."
                className="w-64 pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatsHeader stats={stats} loading={loadingStats} />

      {/* Tabs */}
      <GrowthTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        stats={stats}
        claimedSubtabCounts={claimedSubtabCounts ?? undefined}
        convertedSubtabCounts={convertedSubtabCounts ?? undefined}
        followUpSubtabCounts={stats ? { active: stats.pitched, noShow: stats.no_show ?? 0, notInterested: stats.not_interested } : undefined}
        workQueueCount={workQueueCount}
        workQueueSubtabCounts={workQueueSubtabCounts ?? undefined}
      />

      {/* Work Queue Tab - separate view */}
      {activeTab.type === "work_queue" ? (
        <WorkQueueTab
          data={workQueueData}
          loading={loadingStats}
          error={workQueueError}
          subTab={activeTab.subTab}
          onProviderClick={(trackingId) => {
            fetchAndSelectProvider(trackingId);
          }}
        />
      ) : (
        <>
          {/* Admin filter row */}
          <AdminFilterChips
            adminCounts={adminCounts}
            totalCount={total}
            selectedAdminId={selectedAdminFilter}
            onSelect={setSelectedAdminFilter}
            tabKey={getTabKey(activeTab)}
          />

          {/* Callback banner - shown on In Progress subtabs (Claimed or Converted) */}
          {((activeTab.type === "pipeline" && activeTab.stage === "new_claim" && activeTab.subTab === "in_progress") ||
            (activeTab.type === "conversion" && activeTab.tab === "converted" && activeTab.subTab === "in_progress")) && (
            <CallbackBanner
              onProviderClick={handleCallbackProviderClick}
              refreshKey={callbackRefreshKey}
            />
          )}

          {/* Provider list */}
          <div className="bg-white rounded-xl border border-gray-200">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                Loading providers...
              </div>
            ) : providers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {debouncedSearch
                  ? `No providers found matching "${debouncedSearch}"`
                  : "No providers in this stage"}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {providers.map((provider) => (
                  <li key={provider.id}>
                    <ProviderRow
                      provider={provider}
                      onClick={() => setSelectedProvider(provider)}
                      onDelete={() => setPendingDelete({
                        id: provider.id,
                        name: provider.display_name || "Unnamed Provider",
                      })}
                      selected={selectedProvider?.id === provider.id}
                      assignedToName={provider.assigned_to ? adminNameLookup.get(provider.assigned_to) || null : null}
                      onAssignClick={() => setEditingAssignmentId(provider.id)}
                      isEditingAssignment={editingAssignmentId === provider.id}
                      onAssignmentSelect={(adminId, adminName) =>
                        handleAssignmentUpdate(provider.id, adminId, adminName)
                      }
                      onAssignmentCancel={() => setEditingAssignmentId(null)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="flex items-center justify-between mt-6 px-2">
              <p className="text-sm text-gray-500">
                {total <= PAGE_SIZE
                  ? `${total} total`
                  : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
              </p>
              {totalPages > 1 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Drawer */}
      {selectedProvider && (
        <ProviderDrawer
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
          onUpdate={handleProviderUpdate}
          onCallLogged={() => {
            // Refresh stats, providers, and callback banner when a call is logged
            fetchStats();
            fetchProviders();
            setCallbackRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Remove from tracking</h3>
            <p className="mt-2 text-sm text-gray-600">
              Remove <strong>{pendingDelete.name}</strong> from growth tracking? This does not delete the provider from the directory.
            </p>
            {deleteError && (
              <p className="mt-3 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

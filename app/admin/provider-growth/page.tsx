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
import type { ProviderGrowthWithProfile, GrowthStats } from "@/lib/provider-growth/queries";
import type { PipelineStage } from "@/lib/provider-growth/stages";
import DateRangePopover, {
  resolveRange,
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import {
  GrowthTabs,
  StatsHeader,
  ProviderRow,
  ProviderDrawer,
  type ActiveTab,
} from "./components";

const PAGE_SIZE = 50;
const DEFAULT_DATE_RANGE: DateRangeValue = { preset: "all", customFrom: "", customTo: "" };

export default function ProviderGrowthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const tab = searchParams.get("tab");
    const sub = searchParams.get("sub") as "ads" | "medjobs" | "both" | "not_contacted" | "converted" | "in_progress" | "active" | "no_show" | "not_interested" | null;

    // Check for new_claim with subtab (now includes "converted")
    if (tab === "new_claim") {
      const validSubTabs = ["not_contacted", "converted", "in_progress"];
      const subTab = sub && validSubTabs.includes(sub) ? (sub as "not_contacted" | "converted" | "in_progress") : "not_contacted";
      return { type: "pipeline", stage: "new_claim", subTab };
    }

    // Check for meeting_scheduled with subtab (Ads/MedJobs/Both)
    if (tab === "meeting_scheduled") {
      const validSubTabs = ["ads", "medjobs", "both"];
      const subTab = sub && validSubTabs.includes(sub) ? (sub as "ads" | "medjobs" | "both") : "ads";
      return { type: "pipeline", stage: "meeting_scheduled", subTab };
    }

    // Check for pitched (Follow-up) with subtab
    if (tab === "pitched") {
      const validSubTabs = ["active", "no_show", "not_interested"];
      const subTab = sub && validSubTabs.includes(sub) ? (sub as "active" | "no_show" | "not_interested") : "active";
      return { type: "pipeline", stage: "pitched", subTab };
    }

    // Check for paying tab
    if (tab === "paying" && sub && ["ads", "medjobs", "both"].includes(sub)) {
      return { type: "conversion", tab: "paying", subTab: sub as "ads" | "medjobs" | "both" };
    }

    // Default to new_claim with not_contacted subtab
    return { type: "pipeline", stage: "new_claim", subTab: "not_contacted" };
  });

  // Data state
  const [providers, setProviders] = useState<ProviderGrowthWithProfile[]>([]);
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [newClaimSubtabCounts, setNewClaimSubtabCounts] = useState<{
    notContacted: number;
    converted: number;
    inProgress: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [total, setTotal] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);

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

  // Keep ref in sync with selected provider
  useEffect(() => {
    selectedProviderIdRef.current = selectedProvider?.id ?? null;
  }, [selectedProvider]);

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

  // Fetch stats (including subtab counts)
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [statsRes, newClaimSubtabRes] = await Promise.all([
        fetch("/api/admin/provider-growth/stats"),
        fetch("/api/admin/provider-growth/new-claim-subtabs"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      if (newClaimSubtabRes.ok) {
        const data = await newClaimSubtabRes.json();
        setNewClaimSubtabCounts(data);
      }
    } catch (e) {
      console.error("Failed to fetch stats:", e);
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
          // Meeting Scheduled now includes both meeting_scheduled and upgrade_meeting stages
          // The API will filter by meetingFocus if provided
          params.set("pipelineStage", "meeting_scheduled,upgrade_meeting");
          if (activeTab.subTab) {
            params.set("meetingFocus", activeTab.subTab);
          }
        } else {
          params.set("pipelineStage", activeTab.stage);
        }

        // For new_claim, apply filters based on subtab
        if (activeTab.stage === "new_claim" && activeTab.subTab) {
          if (activeTab.subTab === "not_contacted") {
            // Not contacted: no calls AND not converted
            params.set("hasCallAttempts", "false");
            params.set("notConverted", "true");
          } else if (activeTab.subTab === "converted") {
            // Converted: has free trial (any call status)
            params.set("converted", "true");
          } else if (activeTab.subTab === "in_progress") {
            // In progress: has calls AND not converted
            params.set("hasCallAttempts", "true");
            params.set("notConverted", "true");
          }
        }
      } else {
        // Conversion tabs (only Paying now)
        if (activeTab.tab === "paying") {
          if (activeTab.subTab === "ads") {
            params.set("adsStatus", "subscribed");
          } else if (activeTab.subTab === "medjobs") {
            params.set("medjobsStatus", "subscribed");
          } else if (activeTab.subTab === "both") {
            params.set("adsStatus", "subscribed");
            params.set("medjobsStatus", "subscribed");
          }
        }
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

      const res = await fetch(`/api/admin/provider-growth?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers);
        setTotal(data.total);
      }
    } catch (e) {
      console.error("Failed to fetch providers:", e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, dateRange, page]);

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

    // Update URL
    if (tab.type === "pipeline") {
      // Include subtab for tabs that have them
      if ((tab.stage === "new_claim" || tab.stage === "meeting_scheduled" || tab.stage === "pitched") && tab.subTab) {
        router.push(`/admin/provider-growth?tab=${tab.stage}&sub=${tab.subTab}`, { scroll: false });
      } else {
        router.push(`/admin/provider-growth?tab=${tab.stage}`, { scroll: false });
      }
    } else {
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
        newClaimSubtabCounts={newClaimSubtabCounts ?? undefined}
        followUpSubtabCounts={stats ? { active: stats.pitched, noShow: stats.no_show ?? 0, notInterested: stats.not_interested } : undefined}
      />

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

      {/* Drawer */}
      {selectedProvider && (
        <ProviderDrawer
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
          onUpdate={handleProviderUpdate}
          onCallLogged={() => {
            // Refresh stats and providers when a call is logged
            fetchStats();
            fetchProviders();
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

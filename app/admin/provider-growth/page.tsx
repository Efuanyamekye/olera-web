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
    const sub = searchParams.get("sub") as "ads" | "medjobs" | "both" | null;

    // Check for pipeline stage tabs
    if (tab && ["new_claim", "meeting_scheduled", "pitched", "not_interested"].includes(tab)) {
      return { type: "pipeline", stage: tab as PipelineStage };
    }

    // Check for conversion tabs (converted/paying with subtab)
    if (tab === "converted" && sub && ["ads", "medjobs", "both"].includes(sub)) {
      return { type: "conversion", tab: "converted", subTab: sub };
    }
    if (tab === "paying" && sub && ["ads", "medjobs", "both"].includes(sub)) {
      return { type: "conversion", tab: "paying", subTab: sub };
    }

    return { type: "pipeline", stage: "new_claim" };
  });

  // Data state
  const [providers, setProviders] = useState<ProviderGrowthWithProfile[]>([]);
  const [stats, setStats] = useState<GrowthStats | null>(null);
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

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/provider-growth/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
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
        params.set("pipelineStage", activeTab.stage);
      } else {
        // Conversion tabs
        if (activeTab.tab === "converted") {
          if (activeTab.subTab === "ads") {
            params.set("adsStatus", "free_intro");
          } else if (activeTab.subTab === "medjobs") {
            params.set("medjobsStatus", "in_pilot");
          } else if (activeTab.subTab === "both") {
            params.set("adsStatus", "free_intro");
            params.set("medjobsStatus", "in_pilot");
          }
        } else if (activeTab.tab === "paying") {
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
      router.push(`/admin/provider-growth?tab=${tab.stage}`, { scroll: false });
    } else {
      router.push(`/admin/provider-growth?tab=${tab.tab}&sub=${tab.subTab}`, { scroll: false });
    }
  };

  // Handle provider update (after drawer action)
  const handleProviderUpdate = async () => {
    await fetchProviders();
    fetchStats();
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
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
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search providers..."
                  className="w-64 pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <StatsHeader stats={stats} loading={loadingStats} />

        {/* Tabs */}
        <GrowthTabs activeTab={activeTab} onTabChange={handleTabChange} stats={stats} />

        {/* Provider list */}
        {loading ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            Loading providers...
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            {debouncedSearch
              ? `No providers found matching "${debouncedSearch}"`
              : "No providers in this stage"}
          </div>
        ) : (
          <ul className="space-y-2">
            {providers.map((provider) => (
              <li key={provider.id}>
                <ProviderRow
                  provider={provider}
                  onClick={() => setSelectedProvider(provider)}
                  selected={selectedProvider?.id === provider.id}
                />
              </li>
            ))}
          </ul>
        )}

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
      </div>

      {/* Drawer */}
      {selectedProvider && (
        <ProviderDrawer
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
          onUpdate={handleProviderUpdate}
        />
      )}
    </div>
  );
}

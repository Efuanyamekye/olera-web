"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PulseHeader from "@/components/admin/PulseHeader";
import { resolveRange, type DateRangeValue } from "@/components/admin/DateRangePopover";
import ConnectionRow, { type ConnectionRowData } from "@/components/admin/ConnectionRow";

// Per-provider engagement data (does NOT include "messaged", "markedReplied", "alreadyConnected" since those are per-connection)
type Engagement = { email_clicked: boolean; lead_opened: boolean; contact_revealed: boolean; phone_copied: boolean; email_copied: boolean; phone_clicked: boolean; email_link_clicked: boolean; continue_in_inbox: boolean };

interface WorkflowCounts {
  all: number;
  needs_attention: number;
  awaiting_provider: number;
  awaiting_family: number;
  connected: number;
  stuck: number;
}

interface EngagementCounts {
  all: number;
  new: number;
  viewed: number;
  engaged: number;
  connected: number;
  stuck: number;
  needs_call: number;
}

interface FunnelStats {
  total: number;
  providerViewed: number;
  providerViewedRate: number;
  providerEngaged: number;
  providerEngagedRate: number;
  responded: number;
  respondedRate: number;
  connected: number;
  connectedRate: number;
}

interface ProviderActions {
  viewed: number;
  copiedPhone: number;
  copiedEmail: number;
  clickedPhone: number;
  clickedEmail: number;
  continuedToInbox: number;
  copiedPhoneRate: number;
  copiedEmailRate: number;
  clickedPhoneRate: number;
  clickedEmailRate: number;
  continuedToInboxRate: number;
}

interface ListResponse {
  connections: (ConnectionRowData & { provider: { activityKey: string | null }; engagementLevel: EngagementLevel; lastMessageAt: string | null })[];
  total: number;
  workflowCounts: WorkflowCounts;
  engagementCounts: EngagementCounts;
  funnelStats: FunnelStats;
  providerActions: ProviderActions;
  engagement: Record<string, Engagement>;
  truncated: boolean;
}

// Engagement level type
type EngagementLevel = "new" | "viewed" | "engaged" | "connected" | "stuck" | "needs_call";

// Engagement-based tabs
type FilterKey = "all" | EngagementLevel;

interface TabConfig {
  key: FilterKey;
  label: string;
  description: string;
  emptyMessage: string;
}

const TABS: TabConfig[] = [
  { key: "new", label: "New", description: "Lead sent, provider hasn't viewed", emptyMessage: "No new leads waiting to be viewed." },
  { key: "viewed", label: "Viewed", description: "Provider opened the lead", emptyMessage: "No leads have been viewed yet." },
  { key: "engaged", label: "Engaged", description: "Provider revealed contact info", emptyMessage: "No engaged leads yet." },
  { key: "connected", label: "Connected", description: "Provider reached out to family", emptyMessage: "No connected leads yet." },
  { key: "stuck", label: "Stuck", description: "No activity for 14+ days", emptyMessage: "No stuck connections." },
  { key: "needs_call", label: "Needs Call", description: "24+ days, requires manual intervention", emptyMessage: "No providers need calling." },
  { key: "all", label: "All", description: "Everything", emptyMessage: "No connections yet." },
];

const PAGE_SIZE = 50;

// Funnel stat component - matches Care Seekers style
function FunnelStat({
  label,
  value,
  format,
  highlight,
  subtitle,
}: {
  label: string;
  value: number;
  format?: "number" | "percent";
  highlight?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        highlight ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className={`text-xl font-semibold tabular-nums ${highlight ? "text-emerald-600" : "text-gray-900"}`}>
        {format === "percent" ? `${value}%` : value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
      {subtitle && (
        <div className="mt-0.5 text-[10px] text-gray-400">{subtitle}</div>
      )}
    </div>
  );
}

export default function ConnectionsTrackerPage() {
  const [range, setRange] = useState<DateRangeValue>({
    preset: "30d",
    customFrom: "",
    customTo: "",
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("new"); // Default to New leads
  const [page, setPage] = useState(0);

  // Stats row state (collapsible)
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);

  // Delete state
  const [pendingDelete, setPendingDelete] = useState<ConnectionRowData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Re-engagement blast state
  interface BlastPreviewData {
    providers: Array<{ email: string; name: string; leadCount: number; subject: string }>;
    sampleEmailHtml: string | null;
    totalProviders: number;
  }
  interface BlastResultData {
    providers_emailed?: number;
    leads_included?: number;
    skipped?: number;
    message?: string;
    preview?: BlastPreviewData;
  }
  const [blastLoading, setBlastLoading] = useState(false);
  const [blastResult, setBlastResult] = useState<{ type: "preview" | "sent"; data: BlastResultData } | null>(null);
  const [blastError, setBlastError] = useState<string | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const runReengagementBlast = useCallback(async (dryRun: boolean) => {
    setBlastLoading(true);
    setBlastError(null);
    setBlastResult(null);
    try {
      const res = await fetch(`/api/admin/reengagement-blast${dryRun ? "?dry_run=true" : ""}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setBlastError(data.error || "Failed to run re-engagement blast");
      } else {
        setBlastResult({ type: dryRun ? "preview" : "sent", data });
      }
    } catch (err) {
      setBlastError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBlastLoading(false);
    }
  }, []);

  // Debounce search input by 300ms
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0); // Reset to first page on search
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [activeFilter, range]);

  const [list, setList] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const buildDateParams = useCallback(() => {
    const { from, to } = resolveRange(range);
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    return params;
  }, [range]);

  const fetchConnections = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = buildDateParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    params.set("filter", activeFilter);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));

    fetch(`/api/admin/connections?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((data: ListResponse) => {
        setList(data);
      })
      .catch(() => {
        setError(true);
        setList(null);
      })
      .finally(() => setLoading(false));
  }, [buildDateParams, debouncedSearch, activeFilter, page]);

  // Fetch connections when dependencies change
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const activeTabConfig = TABS.find((t) => t.key === activeFilter);

  // Get count for tab (using engagement counts)
  const getTabCount = (key: FilterKey): number => {
    if (!list?.engagementCounts) return 0;
    return list.engagementCounts[key] ?? 0;
  };

  // Delete handlers
  const requestDelete = (id: string) => {
    const connection = list?.connections.find(c => c.id === id);
    if (connection) {
      setPendingDelete(connection);
      setDeleteError(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    setDeleteError(null);

    // Optimistic removal - update both connections list and engagement counts
    const connectionToDelete = pendingDelete;
    setList(prev => {
      if (!prev) return null;

      // Decrement the appropriate engagement count
      const engagementLevel = connectionToDelete.engagementLevel;
      const updatedCounts = { ...prev.engagementCounts };
      if (engagementLevel && updatedCounts[engagementLevel] > 0) {
        updatedCounts[engagementLevel]--;
        updatedCounts.all--;
      }

      return {
        ...prev,
        connections: prev.connections.filter(c => c.id !== connectionToDelete.id),
        total: prev.total - 1,
        engagementCounts: updatedCounts,
      };
    });

    try {
      const res = await fetch(`/api/admin/connections/${connectionToDelete.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setPendingDelete(null);
        // Refetch to get accurate funnel stats (optimistic update handles immediate UI)
        fetchConnections();
      } else {
        // Rollback on error
        fetchConnections();
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Failed to delete connection");
      }
    } catch {
      fetchConnections();
      setDeleteError("Network error");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = list ? Math.ceil(list.total / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Header with KPI + trend chart */}
      <PulseHeader
        title="Connections"
        kpiSuffix="successful"
        statsPath="/api/admin/connections/pulse"
        range={range}
        onRangeChange={setRange}
      />

      {/* Collapsible Funnel Stats */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setStatsExpanded(!statsExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${statsExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6.5 3.5l7 6.5-7 6.5V3.5z" />
          </svg>
          Connection Funnel
          <span className="text-xs text-gray-400 font-normal">
            {range.preset === "all" ? "all time" : range.preset === "30d" ? "last 30 days" : range.preset === "7d" ? "last 7 days" : "custom range"}
          </span>
        </button>

        {statsExpanded && list?.funnelStats && (
          <div className="mt-4 grid grid-cols-5 gap-3">
            <FunnelStat label="Total Leads" value={list.funnelStats.total} />
            <FunnelStat
              label="Provider Viewed"
              value={list.funnelStats.providerViewedRate}
              format="percent"
              subtitle={`${list.funnelStats.providerViewed} ${list.funnelStats.providerViewed === 1 ? "lead" : "leads"}`}
            />
            <FunnelStat
              label="Provider Engaged"
              value={list.funnelStats.providerEngagedRate}
              format="percent"
              subtitle={`${list.funnelStats.providerEngaged} ${list.funnelStats.providerEngaged === 1 ? "lead" : "leads"}`}
            />
            <FunnelStat
              label="Responded"
              value={list.funnelStats.respondedRate}
              format="percent"
              subtitle={`${list.funnelStats.responded} ${list.funnelStats.responded === 1 ? "lead" : "leads"}`}
            />
            <FunnelStat label="Connected" value={list.funnelStats.connected} highlight />
          </div>
        )}
      </div>

      {/* Collapsible Provider Actions */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setActionsExpanded(!actionsExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${actionsExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6.5 3.5l7 6.5-7 6.5V3.5z" />
          </svg>
          Provider Actions
          <span className="text-xs text-gray-400 font-normal">
            {range.preset === "all" ? "all time" : range.preset === "30d" ? "last 30 days" : range.preset === "7d" ? "last 7 days" : "custom range"}
          </span>
        </button>

        {actionsExpanded && list?.providerActions && (
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
            <FunnelStat label="Viewed Lead" value={list.providerActions.viewed} />
            <FunnelStat
              label="Copied Phone"
              value={list.providerActions.copiedPhoneRate}
              format="percent"
              subtitle={`${list.providerActions.copiedPhone} copied`}
            />
            <FunnelStat
              label="Copied Email"
              value={list.providerActions.copiedEmailRate}
              format="percent"
              subtitle={`${list.providerActions.copiedEmail} copied`}
            />
            <FunnelStat
              label="Clicked to Call"
              value={list.providerActions.clickedPhoneRate}
              format="percent"
              subtitle={`${list.providerActions.clickedPhone} called`}
            />
            <FunnelStat
              label="Clicked to Email"
              value={list.providerActions.clickedEmailRate}
              format="percent"
              subtitle={`${list.providerActions.clickedEmail} emailed`}
            />
            <FunnelStat
              label="Continued to Inbox"
              value={list.providerActions.continuedToInboxRate}
              format="percent"
              subtitle={`${list.providerActions.continuedToInbox} clicked`}
            />
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by family or provider name..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setDebouncedSearch(""); setPage(0); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs - underline style */}
      <div className="flex gap-1 mb-6 border-b border-gray-100 overflow-x-auto">
        {TABS.map((tab) => {
          const count = getTabCount(tab.key);
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              title={tab.description}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 ${isActive ? "text-gray-500" : "text-gray-300"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Re-engagement Blast Controls - show on Stuck or Needs Call tab */}
      {(activeFilter === "stuck" || activeFilter === "needs_call") && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Re-engagement Blast (Final Email)</h3>
              <p className="text-xs text-amber-700 mt-1">
                Send the &quot;One more try&quot; email to all stuck/needs-call providers who haven&apos;t engaged.
                <br />
                <span className="text-amber-600 font-medium">✓ Only sends to providers who have NOT viewed the lead.</span>
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => runReengagementBlast(true)}
                disabled={blastLoading}
                className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 disabled:opacity-50"
              >
                {blastLoading ? "Running..." : "Preview"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Send re-engagement emails to all stuck providers? This cannot be undone.")) {
                    runReengagementBlast(false);
                  }
                }}
                disabled={blastLoading}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                Send Emails
              </button>
            </div>
          </div>
          {blastError && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              Error: {blastError}
            </div>
          )}
          {blastResult && (
            <div className={`mt-3 p-3 rounded text-xs ${blastResult.type === "preview" ? "bg-white border border-amber-200" : "bg-emerald-50 border border-emerald-200"}`}>
              <div className="font-medium mb-1">
                {blastResult.type === "preview" ? "📋 Preview Results" : "✅ Emails Sent"}
              </div>
              <div className="text-gray-600 space-y-0.5">
                {blastResult.data.providers_emailed !== undefined && (
                  <div>Providers: <span className="font-medium text-gray-900">{String(blastResult.data.providers_emailed)}</span></div>
                )}
                {blastResult.data.leads_included !== undefined && (
                  <div>Leads included: <span className="font-medium text-gray-900">{String(blastResult.data.leads_included)}</span></div>
                )}
                {blastResult.data.skipped !== undefined && Number(blastResult.data.skipped) > 0 && (
                  <div>Skipped: <span className="text-gray-500">{String(blastResult.data.skipped)}</span></div>
                )}
                {typeof blastResult.data.message === "string" && (
                  <div className="text-gray-500 mt-1">{blastResult.data.message}</div>
                )}
              </div>

              {/* Preview details - show provider list and email preview button */}
              {blastResult.type === "preview" && blastResult.data.preview != null && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">Recipients (first 10):</span>
                    {blastResult.data.preview.sampleEmailHtml && (
                      <button
                        onClick={() => setShowEmailPreview(true)}
                        className="text-amber-700 hover:text-amber-900 underline"
                      >
                        View Sample Email
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {blastResult.data.preview.providers.map((p, i) => (
                      <div key={i} className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium text-gray-900">{p.name}</span>
                          <span className="text-gray-500 ml-2">{p.email}</span>
                        </div>
                        <span className="text-gray-500">{p.leadCount} lead{p.leadCount > 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Email Preview Modal */}
          {showEmailPreview && blastResult?.data.preview != null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEmailPreview(false)}>
              <div className="bg-white rounded-xl shadow-xl max-w-2xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-900">Sample Email Preview</h3>
                  <button onClick={() => setShowEmailPreview(false)} className="text-gray-500 hover:text-gray-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: blastResult.data.preview.sampleEmailHtml || "<p>No preview available</p>",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-4 py-16 text-center text-sm text-gray-400">Loading...</div>
        ) : error ? (
          <div className="px-4 py-16 text-center text-sm text-rose-600">
            Could not load connections. Try again.
          </div>
        ) : !list || list.connections.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-gray-400">
            {activeTabConfig?.emptyMessage ?? "No connections found."}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {list.connections.map((c) => (
              <ConnectionRow
                key={c.id}
                c={c}
                engagement={
                  c.provider.activityKey ? list.engagement[c.provider.activityKey] : undefined
                }
                onDelete={requestDelete}
                onNudgeSuccess={fetchConnections}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && list && list.connections.length > 0 && (
        <div className="flex items-center justify-between mt-6 px-2">
          <p className="text-sm text-gray-500">
            {list.total <= PAGE_SIZE
              ? `${list.total} total`
              : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, list.total)} of ${list.total}`
            }
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

      {list?.truncated && (
        <p className="mt-2 text-xs text-amber-600">
          Showing a capped slice — narrow the date range for complete counts.
        </p>
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-connection-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 id="delete-connection-title" className="text-base font-semibold text-gray-900 mb-3">
              Delete this connection?
            </h3>
            <dl className="text-sm text-gray-700 space-y-1.5 mb-4">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Family</dt>
                <dd className="text-gray-900">{pendingDelete.family.display_name || "Unknown"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Provider</dt>
                <dd className="text-gray-900">{pendingDelete.provider.display_name || "Unknown"}</dd>
              </div>
            </dl>
            <p className="text-[12px] text-gray-500 leading-relaxed mb-5">
              This will permanently delete this connection and all associated messages. This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-[12px] text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

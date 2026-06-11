"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PulseHeader from "@/components/admin/PulseHeader";
import { resolveRange, type DateRangeValue } from "@/components/admin/DateRangePopover";
import ConnectionRow, { type ConnectionRowData } from "@/components/admin/ConnectionRow";

// Per-provider engagement data (messaged/providerResponded is per-connection via c.responded)
type Engagement = { email_clicked: boolean; lead_opened: boolean; contact_revealed: boolean; phone_copied: boolean; email_copied: boolean; phone_clicked: boolean; email_link_clicked: boolean; continue_in_inbox: boolean };

// Direction type for inbound/outbound toggle
type Direction = "inbound" | "outbound";

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
  connected: number;
  needs_follow_up: number;
  declined: number;
}

interface FamilyEngagementCounts {
  all: number;
  new: number;
  awaiting: number;
  connected: number;
  needs_follow_up: number;
}

interface FunnelStats {
  total: number;
  providerViewed: number;
  providerViewedRate: number;
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
  connections: (ConnectionRowData & { provider: { activityKey: string | null }; engagementLevel: EngagementLevel; familyEngagementLevel: FamilyEngagementLevel; lastMessageAt: string | null })[];
  total: number;
  perspective: Perspective;
  workflowCounts: WorkflowCounts;
  engagementCounts: EngagementCounts;
  familyEngagementCounts: FamilyEngagementCounts;
  funnelStats: FunnelStats;
  providerActions: ProviderActions;
  engagement: Record<string, Engagement>;
  truncated: boolean;
}

// Engagement level type
type EngagementLevel = "new" | "viewed" | "connected" | "needs_follow_up";
type FamilyEngagementLevel = "new" | "awaiting" | "connected" | "needs_follow_up";

// Perspective type
type Perspective = "provider" | "family";

// Engagement-based tabs
type ProviderFilterKey = "all" | EngagementLevel | "no_email" | "declined";
type FamilyFilterKey = "all" | FamilyEngagementLevel;
type FilterKey = ProviderFilterKey | FamilyFilterKey;

interface TabConfig {
  key: FilterKey;
  label: string;
  description: string;
  emptyMessage: string;
}

// Provider perspective tabs
const PROVIDER_TABS: TabConfig[] = [
  { key: "new", label: "New", description: "Lead sent, provider hasn't viewed", emptyMessage: "No new leads waiting to be viewed." },
  { key: "viewed", label: "Viewed", description: "Provider opened the lead drawer", emptyMessage: "No leads have been viewed yet." },
  { key: "connected", label: "Connected", description: "Provider reached out to family", emptyMessage: "No connected leads yet." },
  { key: "needs_follow_up", label: "Needs Follow-up", description: "No activity for 10+ days, requires manual intervention", emptyMessage: "No providers need follow-up." },
  { key: "declined", label: "Declined", description: "Provider declined lead (not a fit, not accepting clients, etc.)", emptyMessage: "No declined leads." },
  { key: "no_email", label: "No Email", description: "Providers without email addresses", emptyMessage: "All providers have emails." },
  { key: "all", label: "All", description: "Everything", emptyMessage: "No connections yet." },
];

// Family perspective tabs
const FAMILY_TABS: TabConfig[] = [
  { key: "new", label: "New", description: "Provider hasn't responded yet", emptyMessage: "No connections awaiting provider response." },
  { key: "awaiting", label: "Awaiting", description: "Provider responded, awaiting family reply", emptyMessage: "No families awaiting response." },
  { key: "connected", label: "Connected", description: "Family replied to provider", emptyMessage: "No families have replied yet." },
  { key: "needs_follow_up", label: "Needs Follow-up", description: "No family activity for 10+ days, requires manual intervention", emptyMessage: "No families need follow-up." },
  { key: "all", label: "All", description: "Everything", emptyMessage: "No connections yet." },
];

// Outbound tabs (provider-initiated outreach to families)
type OutboundFilterKey = "all" | "accepted" | "pending" | "declined";
interface OutboundTabConfig {
  key: OutboundFilterKey;
  label: string;
  description: string;
  emptyMessage: string;
}

const OUTBOUND_TABS: OutboundTabConfig[] = [
  { key: "all", label: "All", description: "All outreach", emptyMessage: "No outreach sent yet." },
  { key: "accepted", label: "Accepted", description: "Family accepted the request", emptyMessage: "No accepted requests yet." },
  { key: "pending", label: "Pending", description: "Awaiting family response", emptyMessage: "No pending requests." },
  { key: "declined", label: "Declined", description: "Family declined the request", emptyMessage: "No declined requests." },
];

// Outbound connection type from API
interface OutboundConnection {
  id: string;
  type: string;
  status: "accepted" | "pending" | "declined";
  created_at: string;
  family: {
    id: string | null;
    display_name: string | null;
    email: string | null;
    phone: string | null;
    image_url: string | null;
    city: string | null;
  };
  provider: {
    id: string | null;
    display_name: string | null;
    slug: string | null;
    email: string | null;
    phone: string | null;
    image_url: string | null;
    is_active: boolean;
    city: string | null;
    state: string | null;
  };
  messagePreview: string;
  replyMessage: string | null;
  repliedAt: string | null;
  threadLength: number;
}

interface OutboundCounts {
  all: number;
  accepted: number;
  pending: number;
  declined: number;
}

interface OutboundStats {
  total: number;
  accepted: number;
  pending: number;
  declined: number;
  acceptRate: number;
}

interface OutboundListResponse {
  connections: OutboundConnection[];
  total: number;
  direction: "outbound";
  outboundCounts: OutboundCounts;
  outboundStats: OutboundStats;
  truncated: boolean;
}

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

// Status badge for outbound connections
function OutboundStatusBadge({ status }: { status: "accepted" | "pending" | "declined" }) {
  const config = {
    accepted: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Accepted" },
    pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pending" },
    declined: { bg: "bg-gray-100", text: "text-gray-600", label: "Declined" },
  };
  const { bg, text, label } = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
}

// Detail type for outbound connections (from detail API)
interface OutboundDetail {
  id: string;
  type: string;
  status: string;
  isOutbound: boolean;
  family: {
    id: string | null;
    display_name: string | null;
    email: string | null;
    phone: string | null;
  };
  provider: {
    id: string | null;
    display_name: string | null;
    email: string | null;
    phone: string | null;
    slug: string | null;
  };
  thread: Array<{
    text: string;
    created_at: string | null;
    is_auto_reply: boolean;
    role: "provider" | "family" | "system";
  }>;
  emails: Array<{
    id: string;
    email_type: string | null;
    recipient_type: string | null;
    status: string | null;
    created_at: string | null;
  }>;
}

// Row for outbound connections with expand/collapse
function OutboundConnectionRow({ connection, onDelete }: { connection: OutboundConnection; onDelete?: (id: string) => void }) {
  const c = connection;
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<OutboundDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showEmails, setShowEmails] = useState(false);

  const providerName = c.provider.display_name || "Provider";
  const familyName = c.family.display_name || "Family";
  const providerLocation = [c.provider.city, c.provider.state].filter(Boolean).join(", ");

  // Time ago helper
  const timeAgo = (isoDate: string | null): string => {
    if (!isoDate) return "";
    const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "1d ago";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const fmtDate = (iso: string | null): string => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const age = timeAgo(c.created_at);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(`/api/admin/connections/${c.id}`);
        if (!res.ok) throw new Error("failed");
        setDetail(await res.json());
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="group">
      {/* Collapsed row - matches ConnectionRow styling */}
      <div className="flex w-full items-center gap-3 px-4 py-4 hover:bg-stone-50/60 transition-colors">
        <button
          onClick={toggle}
          className="flex-1 min-w-0 text-left"
          aria-expanded={open}
        >
          {/* Primary line: names */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{providerName}</span>
            <span className="text-gray-400">→</span>
            <span className="font-medium text-gray-900 truncate">{familyName}</span>
          </div>
          {/* Secondary line: location + status */}
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            {providerLocation && (
              <>
                <span className="truncate">{providerLocation}</span>
                <span className="text-gray-300">|</span>
              </>
            )}
            <OutboundStatusBadge status={c.status} />
            {c.threadLength > 1 && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-400">{c.threadLength} messages</span>
              </>
            )}
          </div>
        </button>

        {/* Timestamp */}
        <span className="text-sm text-gray-400 shrink-0">{age}</span>

        {/* Delete button - hover reveal */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(c.id);
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all"
            title="Delete connection"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}

        {/* Expand chevron */}
        <button
          onClick={toggle}
          className="p-1"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <svg
            className={`h-5 w-5 text-gray-300 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 bg-stone-50/40 px-4 py-4">
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : loadError ? (
            <p className="text-sm text-rose-600">Could not load details. Try again.</p>
          ) : detail ? (
            <div className="space-y-4">
              {/* Contact cards */}
              <div className="flex gap-4 flex-wrap">
                {/* Provider contact */}
                <div className="flex-1 min-w-[200px] bg-white rounded-lg border border-gray-200 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Provider</span>
                  <p className="font-medium text-gray-900 text-sm truncate mt-1">{detail.provider.display_name || "Unknown"}</p>
                  <div className="mt-1 space-y-0.5 text-sm">
                    {detail.provider.email && (
                      <a href={`mailto:${detail.provider.email}`} className="block text-blue-600 hover:underline truncate">{detail.provider.email}</a>
                    )}
                    {detail.provider.phone && (
                      <a href={`tel:${detail.provider.phone}`} className="block text-blue-600 hover:underline">{detail.provider.phone}</a>
                    )}
                  </div>
                </div>

                {/* Family contact */}
                <div className="flex-1 min-w-[200px] bg-white rounded-lg border border-gray-200 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Family</span>
                  <p className="font-medium text-gray-900 text-sm truncate mt-1">{detail.family.display_name || "Unknown"}</p>
                  <div className="mt-1 space-y-0.5 text-sm">
                    {detail.family.email && (
                      <a href={`mailto:${detail.family.email}`} className="block text-blue-600 hover:underline truncate">{detail.family.email}</a>
                    )}
                    {detail.family.phone && (
                      <a href={`tel:${detail.family.phone}`} className="block text-blue-600 hover:underline">{detail.family.phone}</a>
                    )}
                  </div>
                </div>
              </div>

              {/* Conversation thread */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Conversation</h3>
                {detail.thread.length === 0 ? (
                  <p className="text-sm text-gray-400">No messages yet.</p>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {detail.thread.map((m, i) => (
                      <div key={i} className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {m.role === "family" ? "Family" : m.role === "provider" ? "Provider" : "System"}
                          </span>
                          {m.is_auto_reply && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">auto</span>
                          )}
                          {m.created_at && (
                            <span className="text-xs text-gray-400">{fmtDate(m.created_at)}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{m.text || <span className="text-gray-300">-</span>}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Email trail */}
              {detail.emails.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowEmails(!showEmails)}
                    className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showEmails ? "rotate-90" : ""}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M6.5 3.5l7 6.5-7 6.5V3.5z" />
                    </svg>
                    Show {detail.emails.length} email{detail.emails.length !== 1 ? "s" : ""} sent
                  </button>

                  {showEmails && (
                    <div className="mt-2 bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                      {detail.emails.map((e) => (
                        <div key={e.id} className="p-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-700">{e.email_type?.replace(/_/g, " ") || "Email"}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              e.recipient_type === "family"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-purple-50 text-purple-600"
                            }`}>
                              {e.recipient_type === "family" ? "To Family" : "To Provider"}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{fmtDate(e.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function ConnectionsTrackerPage() {
  const searchParams = useSearchParams();

  // Read initial direction from URL (supports /admin/outreach redirect)
  const initialDirection = searchParams.get("direction") === "outbound" ? "outbound" : "inbound";

  const [range, setRange] = useState<DateRangeValue>({
    preset: "30d",
    customFrom: "",
    customTo: "",
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [perspective, setPerspective] = useState<Perspective>("provider");
  // Default filter: "new" for inbound, "all" for outbound
  const [activeFilter, setActiveFilter] = useState<FilterKey | OutboundFilterKey>(
    initialDirection === "outbound" ? "all" : "new"
  );
  const [page, setPage] = useState(0);

  // Stats row state (collapsible)
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);

  // Delete state
  const [pendingDelete, setPendingDelete] = useState<ConnectionRowData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // Reset filter when perspective changes (since filter keys differ between perspectives)
  useEffect(() => {
    setActiveFilter("new");
    setPage(0);
  }, [perspective]);

  // Reset filter and perspective when direction changes
  useEffect(() => {
    if (direction === "outbound") {
      setActiveFilter("all"); // Outbound default tab
    } else {
      setActiveFilter("new"); // Inbound default tab
    }
    setPage(0);
  }, [direction]);

  const [list, setList] = useState<ListResponse | null>(null);
  const [outboundList, setOutboundList] = useState<OutboundListResponse | null>(null);
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

    // Validate filter matches direction to prevent race condition on direction switch
    const validOutboundFilters = ["all", "accepted", "pending", "declined"];
    const validFilter = direction === "outbound"
      ? (validOutboundFilters.includes(activeFilter) ? activeFilter : "all")
      : activeFilter;
    params.set("filter", validFilter);
    params.set("direction", direction);
    if (direction === "inbound") {
      params.set("perspective", perspective);
    }
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));

    fetch(`/api/admin/connections?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((data) => {
        if (direction === "outbound") {
          setOutboundList(data as OutboundListResponse);
          setList(null);
        } else {
          setList(data as ListResponse);
          setOutboundList(null);
        }
      })
      .catch(() => {
        setError(true);
        setList(null);
        setOutboundList(null);
      })
      .finally(() => setLoading(false));
  }, [buildDateParams, debouncedSearch, activeFilter, direction, perspective, page]);

  // Fetch connections when dependencies change
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Use direction-aware and perspective-aware tabs
  const INBOUND_TABS = perspective === "family" ? FAMILY_TABS : PROVIDER_TABS;
  const activeInboundTabConfig = INBOUND_TABS.find((t) => t.key === activeFilter);
  const activeOutboundTabConfig = OUTBOUND_TABS.find((t) => t.key === activeFilter);

  // Get count for inbound tab (using perspective-aware engagement counts)
  const getInboundTabCount = (key: FilterKey): number => {
    if (perspective === "family") {
      if (!list?.familyEngagementCounts) return 0;
      const counts = list.familyEngagementCounts;
      if (key in counts) {
        return counts[key as keyof FamilyEngagementCounts] ?? 0;
      }
      return 0;
    } else {
      // Provider perspective
      if (!list?.engagementCounts) return 0;
      const counts = list.engagementCounts;
      if (key in counts) {
        return counts[key as keyof EngagementCounts] ?? 0;
      }
      return 0;
    }
  };

  // Get count for outbound tab
  const getOutboundTabCount = (key: OutboundFilterKey): number => {
    if (!outboundList?.outboundCounts) return 0;
    return outboundList.outboundCounts[key] ?? 0;
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

  const totalPages = direction === "outbound"
    ? (outboundList ? Math.ceil(outboundList.total / PAGE_SIZE) : 0)
    : (list ? Math.ceil(list.total / PAGE_SIZE) : 0);

  const currentTotal = direction === "outbound" ? outboundList?.total ?? 0 : list?.total ?? 0;

  return (
    <div>
      {/* Header with KPI + trend chart */}
      <PulseHeader
        title="Connections"
        kpiSuffix="successful"
        statsPath="/api/admin/connections/pulse"
        range={range}
        onRangeChange={setRange}
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                type="button"
                onClick={() => setDirection("inbound")}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  direction === "inbound"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Inbound
              </button>
              <button
                type="button"
                onClick={() => setDirection("outbound")}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  direction === "outbound"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Outbound
              </button>
            </div>
          </div>
        }
      />

      {/* Outbound Stats */}
      {direction === "outbound" && outboundList?.outboundStats && (
        <div className="mb-6 grid grid-cols-5 gap-3">
          <FunnelStat label="Total Sent" value={outboundList.outboundStats.total} />
          <FunnelStat label="Accepted" value={outboundList.outboundStats.accepted} highlight />
          <FunnelStat label="Pending" value={outboundList.outboundStats.pending} />
          <FunnelStat label="Declined" value={outboundList.outboundStats.declined} />
          <FunnelStat label="Accept Rate" value={outboundList.outboundStats.acceptRate} format="percent" />
        </div>
      )}

      {/* Collapsible Funnel Stats - Inbound + Provider perspective only */}
      {direction === "inbound" && perspective === "provider" && (
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
            <div className="mt-4 grid grid-cols-4 gap-3">
              <FunnelStat label="Total Leads" value={list.funnelStats.total} />
              <FunnelStat
                label="Provider Viewed"
                value={list.funnelStats.providerViewedRate}
                format="percent"
                subtitle={`${list.funnelStats.providerViewed} ${list.funnelStats.providerViewed === 1 ? "lead" : "leads"}`}
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
      )}

      {/* Collapsible Provider Actions - Inbound + Provider perspective only */}
      {direction === "inbound" && perspective === "provider" && (
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
      )}

      {/* Perspective toggle + Search bar (same row) */}
      <div className="mb-6 flex items-center gap-4">
        {/* Perspective toggle - left side, inbound only */}
        {direction === "inbound" && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium text-gray-500">Perspective:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                type="button"
                onClick={() => setPerspective("provider")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  perspective === "provider"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Provider
              </button>
              <button
                type="button"
                onClick={() => setPerspective("family")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  perspective === "family"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Family
              </button>
            </div>
          </div>
        )}

        {/* Search input - takes remaining space */}
        <div className="relative flex-1">
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
        {direction === "outbound" ? (
          // Outbound tabs
          OUTBOUND_TABS.map((tab) => {
            const count = getOutboundTabCount(tab.key);
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
          })
        ) : (
          // Inbound tabs (existing)
          INBOUND_TABS.map((tab) => {
            const count = getInboundTabCount(tab.key);
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
          })
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-4 py-16 text-center text-sm text-gray-400">Loading...</div>
        ) : error ? (
          <div className="px-4 py-16 text-center text-sm text-rose-600">
            Could not load connections. Try again.
          </div>
        ) : direction === "outbound" ? (
          // Outbound connections rendering
          !outboundList || outboundList.connections.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-gray-400">
              {activeOutboundTabConfig?.emptyMessage ?? "No outreach found."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {outboundList.connections.map((c) => (
                <OutboundConnectionRow key={c.id} connection={c} />
              ))}
            </div>
          )
        ) : (
          // Inbound connections rendering (existing)
          !list || list.connections.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-gray-400">
              {activeInboundTabConfig?.emptyMessage ?? "No connections found."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {list.connections.map((c) => (
                <ConnectionRow
                  key={c.id}
                  c={c}
                  perspective={perspective}
                  engagement={
                    c.provider.activityKey ? list.engagement[c.provider.activityKey] : undefined
                  }
                  onDelete={requestDelete}
                  onNudgeSuccess={fetchConnections}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Pagination */}
      {!loading && currentTotal > 0 && (
        <div className="flex items-center justify-between mt-6 px-2">
          <p className="text-sm text-gray-500">
            {currentTotal <= PAGE_SIZE
              ? `${currentTotal} total`
              : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, currentTotal)} of ${currentTotal}`
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

      {(list?.truncated || outboundList?.truncated) && (
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

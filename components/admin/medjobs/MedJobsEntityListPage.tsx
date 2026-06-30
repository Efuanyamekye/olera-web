"use client";

/**
 * v9.0 Phase 7 Commit K: shared dedicated-entity-page layout.
 *
 * Each MedJobs sidebar item beyond In Basket gets a full
 * operational repository view: stats + previous-period comparison
 * (PulseHeader), search/filter, a running list of cards, and
 * closed/completed history visible alongside active work.
 *
 * The In Basket emphasizes *active* work (smart-hidden tabs hide
 * empty queues); the dedicated pages here show full inventory so
 * admins can also work outside the In Basket if preferred.
 *
 * This component is generic over a TabKey — Replies / Meetings /
 * Calls / Prospects / Partners all mount it with their own key, the
 * same query endpoint (/api/admin/student-outreach/queue), and the
 * same row-card chrome. The page asks the queue for both active and
 * closed rows in one call (`show_closed=true`); closed rows render
 * without a primary CTA and the ellipsis offers Reopen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/admin/Toast";
import { useRecentMoves } from "@/components/admin/RecentMoves";
import { logActionSuccessMessage } from "@/lib/student-outreach/log-success-messages";
import { Drawer } from "@/app/admin/student-outreach/Drawer";
import { BulkResearchModal } from "@/app/admin/student-outreach/BulkResearchModal";
import PulseHeader from "@/components/admin/PulseHeader";
import type { DateRangeValue } from "@/components/admin/DateRangePopover";
import {
  STOP_OUTREACH_ACTIONS,
  STOP_OUTREACH_LABELS,
  TAB_STATS,
  type ProviderProspectRow,
  type TabKey,
} from "@/lib/student-outreach/tab-config";
import type {
  DistributionEvidence,
  DrawerContext,
  ResearchCampusCard,
  TabRow,
} from "@/lib/student-outreach/types";
import { RowCard } from "@/components/admin/medjobs/cards/StakeholderCard";
import { ResearchTabContent } from "@/components/admin/medjobs/lists/ResearchTabContent";
import { useMedJobsRefresh, refreshMedJobs } from "@/hooks/useMedJobsRefresh";

const CLOSED_STATUSES = new Set([
  "no_response_closed",
  "not_interested",
  "do_not_contact",
  "wrong_contact",
  "archived",
]);

interface Props {
  /** Tab key the queue endpoint understands (replies, meetings, calls, prospects, partners). */
  tab: TabKey;
  title: string;
  subtitle: string;
}

export function MedJobsEntityListPage({ tab, title, subtitle }: Props) {
  const [rows, setRows] = useState<TabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [range, setRange] = useState<DateRangeValue>({
    preset: "30d",
    customFrom: "",
    customTo: "",
  });
  const [openOutreachId, setOpenOutreachId] = useState<string | null>(null);
  // Prospects-tab-only state. Other tabs (replies / meetings / calls /
  // partners) render a flat row list; Prospects mirrors the In Basket
  // organization with Provider / Partner dropdowns, virtual provider
  // catchment rows, and the queued research card per campus.
  const [providerProspects, setProviderProspects] = useState<ProviderProspectRow[]>([]);
  const [researchCampuses, setResearchCampuses] = useState<ResearchCampusCard[]>([]);
  const [bulkResearchCampus, setBulkResearchCampus] = useState<ResearchCampusCard | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      // v9.0 Phase 7 Commit K: dedicated entity pages always include
      // closed history alongside active rows. The In Basket version
      // of the same tab hides closed; this page shows them inline
      // (without a primary CTA — Reopen lives in the ellipsis).
      params.set("show_closed", "true");
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/admin/student-outreach/queue?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data = await res.json();
      setRows((data.rows ?? []) as TabRow[]);
      setResearchCampuses((data.research_campuses ?? []) as ResearchCampusCard[]);

      // Prospects view also pulls the virtual provider catchment rows
      // so Provider Prospects dropdown renders alongside Partner
      // Prospects, mirroring the In Basket tab.
      if (tab === "prospects") {
        const r = await fetch("/api/admin/medjobs/provider-prospects");
        if (r.ok) {
          const d = await r.json();
          setProviderProspects((d.rows ?? []) as ProviderProspectRow[]);
        } else {
          setProviderProspects([]);
        }
      } else {
        setProviderProspects([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch]);

  useEffect(() => {
    void refetch();
  }, [refetch]);
  useMedJobsRefresh(refetch);

  const toast = useToast();
  const { markMoved, isRecent } = useRecentMoves();
  const callAction = useCallback(
    async (
      outreachId: string,
      action: string,
      payload: Record<string, unknown> = {},
    ) => {
      const res = await fetch(`/api/admin/student-outreach/${outreachId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: "Action failed" }));
        throw new Error(e || "Action failed");
      }
      // E1: surface a progression toast for meaningful Log actions.
      const message = logActionSuccessMessage(action, payload);
      if (message) {
        toast(message);
        // E2: same gate marks the row as recently moved so the
        // destination tab can highlight it. Actions that don't have a
        // success message (read-only edits like update_research) are
        // not considered moves.
        markMoved(outreachId);
      }
      await refetch();
      refreshMedJobs();
    },
    [refetch, refreshMedJobs, toast, markMoved],
  );

  const handleDrawerAction = useCallback(
    async (_refreshed: DrawerContext | null) => {
      await refetch();
    },
    [refetch],
  );

  const tabStats = TAB_STATS[tab];
  const statsPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("metric", tabStats.metric);
    return `/api/admin/student-outreach/stats?${params.toString()}`;
  }, [tabStats.metric]);

  const renderRow = useCallback(
    (row: TabRow) => {
      const isClosed = CLOSED_STATUSES.has(row.status);
      return (
        <RowCard
          tab={tab}
          row={row}
          recentlyMoved={isRecent(row.id)}
          // v9.0 Phase 7 Commit K: closed rows suppress the primary
          // CTA — they're history, not action surfaces. The ellipsis
          // still offers Reopen + contextual options.
          ctaSuppressed={isClosed}
          onOpenDrawer={() => setOpenOutreachId(row.id)}
          onStopOutreach={async (reason) => {
            const action = STOP_OUTREACH_ACTIONS[reason];
            const label = STOP_OUTREACH_LABELS[reason];
            if (!window.confirm(`Stop outreach: ${label}?`)) return;
            try {
              await callAction(row.id, action);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Action failed");
            }
          }}
          onMarkUnread={async () => {
            try {
              await callAction(row.id, "mark_unread");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Action failed");
            }
          }}
          onArchive={
            row.status === "archived"
              ? undefined
              : async () => {
                  if (
                    !window.confirm(
                      "Archive this prospect? This halts outreach and parks it. You can reopen it later.",
                    )
                  )
                    return;
                  try {
                    await callAction(row.id, "archive");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Action failed");
                  }
                }
          }
          onReopen={
            isClosed
              ? async () => {
                  try {
                    await callAction(row.id, "reopen");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Action failed");
                  }
                }
              : undefined
          }
        />
      );
    },
    [tab, callAction],
  );

  return (
    <div>
      <PulseHeader
        title={title}
        kpiSuffix={tabStats.label}
        statsPath={statsPath}
        range={range}
        onRangeChange={setRange}
      />
      <p className="-mt-6 mb-4 text-sm text-gray-500">{subtitle}</p>

      <div className="mb-4">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by organization name…"
          size="sm"
        />
      </div>

      {/* v9.0 Phase 7 Commit M: keep rows rendered during background
          refetches so the page doesn't flash. "Loading…" only shows on
          the first load (rows.length === 0). */}
      {loading && rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="py-12 text-center text-sm text-red-600">{error}</p>
      ) : tab === "prospects" ? (
        // Prospects mirrors the In Basket tab structure: Provider
        // Prospects + Partner Prospects dropdowns with the research
        // card as the partner-side entry point. Materialized provider
        // rows (kind='provider') stay in Provider Prospects; everything
        // else goes under Partner Prospects.
        <ResearchTabContent
          rows={rows}
          providerProspects={providerProspects}
          researchCampuses={researchCampuses}
          renderRow={renderRow}
          onStartProviderOutreach={async (p) => {
            try {
              const res = await fetch("/api/admin/medjobs/provider-prospects/materialize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider_id: p.provider_id, campus_id: p.campus_id }),
              });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || "Failed to materialize");
              await refetch();
              setOpenOutreachId(body.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to start outreach");
            }
          }}
          onOpenCampusResearch={(campus) => setBulkResearchCampus(campus)}
          onMarkResearchComplete={async (campus) => {
            try {
              const res = await fetch(
                `/api/admin/student-outreach/campuses/${campus.slug}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ research_complete: true }),
                },
              );
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to mark research complete");
              }
              await refetch();
              refreshMedJobs();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to mark research complete");
            }
          }}
          tabCountsAll={rows.length + providerProspects.length + researchCampuses.length}
        />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-12 text-center text-sm text-gray-400">
          No rows in this view.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.row_key ?? row.id}>{renderRow(row)}</li>
          ))}
        </ul>
      )}

      {openOutreachId && (
        <Drawer
          outreachId={openOutreachId}
          onClose={() => {
            setOpenOutreachId(null);
            void refetch();
          }}
          onAction={handleDrawerAction}
        />
      )}

      {bulkResearchCampus && (
        <BulkResearchModal
          campus={bulkResearchCampus}
          onClose={() => setBulkResearchCampus(null)}
          onSaved={async () => {
            setBulkResearchCampus(null);
            await refetch();
            refreshMedJobs();
          }}
        />
      )}
    </div>
  );
}

"use client";

/**
 * MedJobsTabPage — the In Basket workflow surface. v9.0 Phase 7:
 * entity-keyed tabs (Clients · Candidates · Prospects · Partners ·
 * Meetings · Replies · Calls · Sites) with smart-hide so empty
 * categories drop out of the bar. Cards in the feed are heterogeneous
 * — stakeholder rows, virtual provider prospects, and site banners
 * all flow through one list — but each card carries its own
 * kind-aware chrome.
 *
 * Inventory + relationship surfaces (Sites / Clients / Candidates /
 * Partners) live on dedicated /admin/medjobs/{name} pages outside In
 * Basket. The In Basket tab for each entity surfaces only items with
 * pending action.
 *
 * Smart-hide: a tab is visible when (count > 0) OR it's the active
 * tab. URL-driven via ?tab= so deep links land correctly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { useRecentMoves } from "@/components/admin/RecentMoves";
import { logActionSuccessMessage } from "@/lib/student-outreach/log-success-messages";
import { Drawer } from "@/app/admin/student-outreach/Drawer";
import type {
  Campus,
  DrawerContext,
  ResearchCampusCard,
  StakeholderType,
  TabCounts,
  TabUnreadCounts,
  TabRow,
} from "@/lib/student-outreach/types";
import { CLOSED_STATUSES } from "@/lib/student-outreach/types";
import {
  STOP_OUTREACH_ACTIONS,
  MENU_TABS,
  STOP_OUTREACH_LABELS,
  TABS,
  TYPE_FILTERS,
  type CampusRow,
  type CandidateRow,
  type ClientRow,
  type ProviderProspectRow,
  type TabKey,
} from "@/lib/student-outreach/tab-config";
import { RowCard } from "@/components/admin/medjobs/cards/StakeholderCard";
import { SiteCard } from "@/components/admin/medjobs/cards/SiteCard";
import { ClientCard } from "@/components/admin/medjobs/cards/ClientCard";
import { CandidateCard } from "@/components/admin/medjobs/cards/SpecialtyCards";
import { CardOverflowMenu } from "@/components/admin/medjobs/cards/CardOverflowMenu";
import { ResearchTabContent } from "@/components/admin/medjobs/lists/ResearchTabContent";
import { RepliesGroupedList } from "@/components/admin/medjobs/lists/RepliesGroupedList";
import { InBasketHero } from "@/components/admin/medjobs/InBasketHero";
import { BulkResearchModal } from "@/app/admin/student-outreach/BulkResearchModal";
import { useMedJobsRefresh, refreshMedJobs } from "@/hooks/useMedJobsRefresh";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";

interface MedJobsTabPageProps {
  initialTab: TabKey;
  title?: string;
}

// v10 (Phase 1 Bullet 4, 2026-06-04): valid keys span BOTH the primary
// horizontal row and the ⋯ overflow menu so deep links to any tab — including
// clients/partners/candidates which moved to MENU_TABS — still resolve.
const VALID_TAB_KEYS: ReadonlySet<TabKey> = new Set([
  ...TABS.map((t) => t.key),
  ...MENU_TABS.map((t) => t.key),
]);

export function MedJobsTabPage({
  initialTab,
  title = "MedJobs · In Basket",
}: MedJobsTabPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams?.get("tab");
  const tabFromUrl =
    tabParam && VALID_TAB_KEYS.has(tabParam as TabKey)
      ? (tabParam as TabKey)
      : null;

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusSlug, setCampusSlug] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<StakeholderType | "all">("all");
  const [tab, setTab] = useState<TabKey>(tabFromUrl ?? initialTab);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<TabRow[]>([]);
  const [tabCounts, setTabCounts] = useState<TabCounts | null>(null);
  const [tabUnreadCounts, setTabUnreadCounts] = useState<TabUnreadCounts | null>(null);
  const [providerProspects, setProviderProspects] = useState<ProviderProspectRow[]>([]);
  // Active partners (TabRows) for the Partners audience tab's active section.
  const [partnerRows, setPartnerRows] = useState<TabRow[]>([]);
  const [researchCampuses, setResearchCampuses] = useState<ResearchCampusCard[]>([]);
  const [campusBanners, setCampusBanners] = useState<CampusRow[]>([]);
  // v9.0 Phase 7 Commit N: entity rows for the In Basket tabs that key
  // off business_profile_tasks / site_tasks rather than student_outreach.
  // The queue endpoint can't hydrate these (the tabs are entity-driven,
  // not stakeholder-driven), so each tab side-fetches its own list
  // narrowed to entities with pending operational work.
  const [clientRows, setClientRows] = useState<ClientRow[]>([]);
  const [candidateRows, setCandidateRows] = useState<CandidateRow[]>([]);
  // viewLoading drives the list SKELETON — set only on a genuine view change
  // (first mount / tab switch). Silent refreshes (drawer close, row actions,
  // the global refresh signal, filter/search) update data in place and never
  // toggle it, so the list doesn't flash.
  const [viewLoading, setViewLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openOutreachId, setOpenOutreachId] = useState<string | null>(null);
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  // Instant-render seeds: the list row's display data, passed so a drawer opens
  // with its title (and, for candidates, full content) immediately instead of a
  // blank spinner while the detail hydrates.
  const [openOutreachName, setOpenOutreachName] = useState<string | undefined>(undefined);
  const [openProviderName, setOpenProviderName] = useState<string | undefined>(undefined);
  const [openCandidateSeed, setOpenCandidateSeed] = useState<CandidateRow | undefined>(undefined);
  // Per-recipient focus (Model 2): when a fanned-out card opens the shared
  // drawer, remember which recipient it was so the drawer header reads the
  // right subject (general → org name; specific → that person's name).
  const [openFocusKind, setOpenFocusKind] = useState<"general" | "specific" | null>(null);
  const [openFocusName, setOpenFocusName] = useState<string | null>(null);
  const [openFocusRole, setOpenFocusRole] = useState<string | null>(null);
  const [bulkResearchCampus, setBulkResearchCampus] = useState<ResearchCampusCard | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Stale-response guard: overlapping fetches happen (a drawer's mark_read
  // fires the global refresh while it's open, then close fires another; tab
  // switches mid-flight). Each fetch tags itself with a sequence number and
  // only commits if it's still the latest — so a slower earlier response can't
  // overwrite a newer one and visually reorder/flicker the list.
  const requestSeqRef = useRef(0);

  // Core fetch. `skeleton` true → show the list skeleton (view changes only);
  // false → silent in-place refresh (data swaps when ready, no flash). All the
  // tab's sources are fetched in PARALLEL and committed in one atomic state
  // update (React batches post-await setState), so no waterfall and no
  // intermediate empty/stale render. The queue is critical (failure → error
  // state); side-fetches are best-effort (failure → that section degrades to
  // empty, never rejects the batch).
  const fetchData = useCallback(
    async (skeleton: boolean) => {
      const seq = ++requestSeqRef.current;
      if (skeleton) setViewLoading(true);
      setError(null);

      const queueTab: TabKey =
        tab === "providers" || tab === "partner_book" ? "prospects" : tab;
      const queueParams = new URLSearchParams();
      if (campusSlug) queueParams.set("campus", campusSlug);
      if (typeFilter !== "all") queueParams.set("type", typeFilter);
      queueParams.set("tab", queueTab);
      if (debouncedSearch) queueParams.set("search", debouncedSearch);

      // Best-effort JSON fetch — swallows its own errors so one failing
      // side-fetch can't reject the Promise.all and blank the whole list.
      const sideJson = async (url: string): Promise<{ rows?: unknown[] } | null> => {
        try {
          const r = await fetch(url);
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      };

      const wantProviderProspects = tab === "prospects" || tab === "providers";
      const wantPartners = tab === "partner_book";
      const wantSites = tab === "sites";
      const wantClients = tab === "clients" || tab === "providers";
      const wantCandidates = tab === "candidates";

      const ppParams = new URLSearchParams();
      if (campusSlug) ppParams.set("campus", campusSlug);

      const partnerParams = new URLSearchParams();
      if (campusSlug) partnerParams.set("campus", campusSlug);
      if (typeFilter !== "all") partnerParams.set("type", typeFilter);
      partnerParams.set("tab", "partners");
      if (debouncedSearch) partnerParams.set("search", debouncedSearch);

      try {
        const [queueRes, pp, partners, sites, clients, candidates] = await Promise.all([
          fetch(`/api/admin/student-outreach/queue?${queueParams}`),
          wantProviderProspects ? sideJson(`/api/admin/medjobs/provider-prospects?${ppParams}`) : Promise.resolve(null),
          wantPartners ? sideJson(`/api/admin/student-outreach/queue?${partnerParams}`) : Promise.resolve(null),
          wantSites ? sideJson(`/api/admin/medjobs/campuses`) : Promise.resolve(null),
          wantClients ? sideJson(`/api/admin/medjobs/clients?with_pending_task=true`) : Promise.resolve(null),
          wantCandidates ? sideJson(`/api/admin/student-outreach/candidates?with_pending_task=true`) : Promise.resolve(null),
        ]);

        // Superseded by a newer fetch while we were awaiting → drop this one.
        if (seq !== requestSeqRef.current) return;

        // Queue is the critical source — failure surfaces the error state.
        if (!queueRes.ok) {
          throw new Error(
            ((await queueRes.json().catch(() => ({}))) as { error?: string }).error ||
              "Failed to load",
          );
        }
        const data = await queueRes.json();
        if (seq !== requestSeqRef.current) return; // re-check after the json await

        // Non-ordered state: always replace.
        setCampuses(data.campuses ?? []);
        setTabCounts(data.tab_counts ?? null);
        setTabUnreadCounts(data.tab_unread_counts ?? null);

        // Ordered lists. A view change (skeleton) takes the fresh server order;
        // a SILENT refresh merges in place — existing rows keep their position
        // with refreshed data, new rows append, removed rows drop. This makes
        // card order independent of read/unread state (a read just updates the
        // row in place; it never re-sorts the list).
        const rowKey = (r: TabRow) => r.row_key ?? r.id;
        const nextRows = (data.rows ?? []) as TabRow[];
        const nextResearch = (data.research_campuses ?? []) as ResearchCampusCard[];
        const nextPP = wantProviderProspects ? ((pp?.rows ?? []) as ProviderProspectRow[]) : [];
        const nextPartners = wantPartners ? ((partners?.rows ?? []) as TabRow[]) : [];
        const nextSites = wantSites
          ? ((sites?.rows ?? []) as CampusRow[]).filter((c) => c.has_pending_task === true)
          : [];
        const nextClients = wantClients ? ((clients?.rows ?? []) as ClientRow[]) : [];
        const nextCandidates = wantCandidates ? ((candidates?.rows ?? []) as CandidateRow[]) : [];

        if (skeleton) {
          setRows(nextRows);
          setResearchCampuses(nextResearch);
          setProviderProspects(nextPP);
          setPartnerRows(nextPartners);
          setCampusBanners(nextSites);
          setClientRows(nextClients);
          setCandidateRows(nextCandidates);
        } else {
          setRows((prev) => mergeByKey(prev, nextRows, rowKey));
          setResearchCampuses((prev) => mergeByKey(prev, nextResearch, (c) => c.id));
          setProviderProspects((prev) => mergeByKey(prev, nextPP, (p) => p.id));
          setPartnerRows((prev) => mergeByKey(prev, nextPartners, rowKey));
          setCampusBanners((prev) => mergeByKey(prev, nextSites, (c) => c.id));
          setClientRows((prev) => mergeByKey(prev, nextClients, (r) => r.id));
          setCandidateRows((prev) => mergeByKey(prev, nextCandidates, (r) => r.id));
        }
      } catch (e) {
        if (seq !== requestSeqRef.current) return; // stale failure — ignore
        // Only a view-load surfaces the error (it owns the screen). A silent
        // refresh that blips keeps the current list on screen rather than
        // blanking it to an error message.
        if (skeleton) {
          setError(e instanceof Error ? e.message : "Failed to load");
        } else if (process.env.NODE_ENV !== "production") {
          console.warn("[MedJobsTabPage] silent refresh failed:", e);
        }
      } finally {
        // Only the latest request owns viewLoading — a superseded one must not
        // clear the skeleton out from under the newer load.
        if (seq === requestSeqRef.current) setViewLoading(false);
      }
    },
    [campusSlug, typeFilter, tab, debouncedSearch],
  );

  // Silent refresh — data updates in place with no skeleton. Used by row
  // actions, drawer close, modal saves, and the global refresh signal.
  const silentRefresh = useCallback(() => fetchData(false), [fetchData]);

  // View-change driver: skeleton ONLY on first mount or a tab switch. A
  // filter/campus/search change keeps the current list and updates in place
  // (no skeleton flicker while typing or filtering).
  const prevTabRef = useRef<TabKey | null>(null);
  useEffect(() => {
    const isViewChange = prevTabRef.current === null || prevTabRef.current !== tab;
    prevTabRef.current = tab;
    void fetchData(isViewChange);
  }, [fetchData, tab]);

  useMedJobsRefresh(silentRefresh);

  const handleDrawerAction = useCallback(
    async (_refreshed: DrawerContext | null) => { await silentRefresh(); },
    [silentRefresh],
  );

  // Optimistic read/unread for ENTITY rows (clients / candidates —
  // business_profiles.metadata.admin_viewed_at, surfaced as row.unread).
  // Flips the local unread flag + adjusts the tab count with no refetch
  // and no refreshMedJobs. persist=false on drawer-open (the drawer
  // persists on mount); persist=true for the card overflow (no drawer).
  // Twin of setStakeholderRead below — same model for every card type.
  const setEntityRead = useCallback(
    (
      kind: "client" | "candidate",
      row: ClientRow | CandidateRow,
      read: boolean,
      persist: boolean,
    ) => {
      const wasUnread = row.unread === true;
      if (read === !wasUnread) return; // already in the target state
      const id = row.id;
      if (kind === "client") {
        setClientRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: !read } : r)));
      } else {
        setCandidateRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: !read } : r)));
      }
      setTabUnreadCounts((prev) =>
        prev ? { ...prev, [tab]: Math.max(0, (prev[tab] ?? 0) + (read ? -1 : 1)) } : prev,
      );
      if (persist) {
        void fetch("/api/admin/medjobs/mark-entity-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id, action: read ? "read" : "unread" }),
        }).catch(() => {});
      }
    },
    [tab],
  );

  const toast = useToast();
  const { markMoved, isRecent } = useRecentMoves();
  const callAction = useCallback(
    async (outreachId: string, action: string, payload: Record<string, unknown> = {}) => {
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
        // E2: also mark the row as recently moved so the destination
        // tab can highlight it.
        markMoved(outreachId);
      }
      // Single refresh path: refreshMedJobs() fans out to every registered
      // listener — including THIS page's silentRefresh — so the list updates
      // in place once (no skeleton) alongside the hero + sidebar. (Previously
      // this also called refetch() directly, double-refetching the list.)
      refreshMedJobs();
    },
    // refreshMedJobs is a stable module-level import — not a reactive dep.
    [toast, markMoved],
  );

  // Optimistic read/unread for STAKEHOLDER rows (student_outreach
  // .viewed_at). Flips the bold border IN PLACE and adjusts the tab's
  // unread count with no network round-trip, no refetch, no reorder —
  // identically in both directions. NEVER calls refreshMedJobs: a local
  // read/unread change must not reload or reorder the In Basket.
  // persist=false on drawer-open (the drawer persists mark_read on mount);
  // persist=true for the card overflow Mark-as-unread (no drawer). Entity
  // rows use setEntityRead above.
  const setStakeholderRead = useCallback(
    (row: TabRow, read: boolean, persist: boolean) => {
      const wasUnread = row.viewed_at == null;
      if (read === !wasUnread) return; // already in the target state
      const id = row.id;
      const viewed_at = read ? new Date().toISOString() : null;
      const patch = (list: TabRow[]) =>
        list.map((r) => (r.id === id ? { ...r, viewed_at } : r));
      setRows((prev) => patch(prev));
      setPartnerRows((prev) => patch(prev));
      setTabUnreadCounts((prev) =>
        prev ? { ...prev, [tab]: Math.max(0, (prev[tab] ?? 0) + (read ? -1 : 1)) } : prev,
      );
      if (persist) {
        void fetch(`/api/admin/student-outreach/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: read ? "mark_read" : "mark_unread" }),
        }).catch(() => {});
      }
    },
    [tab],
  );

  const renderRow = useCallback(
    // slotTab selects the card's action-slots (buildRowSlots). Audience tabs
    // pass an explicit underlying key per section ("prospects" for the
    // prospecting rows, "partners" for the active-partner rows) so each row
    // gets the right buttons even though the active tab is providers/partner_book.
    (row: TabRow, slotTab: TabKey = tab) => (
      <RowCard
        tab={slotTab}
        row={row}
        recentlyMoved={isRecent(row.id)}
        onOpenDrawer={() => {
          // Seed the instant-render headline with the same subject the drawer
          // will settle on: a Specific card seeds the person's name, everything
          // else seeds the org name — so there's no flash on open.
          setOpenOutreachName(
            (row.recipient_kind === "specific"
              ? row.primary_contact_name || row.organization_name
              : row.organization_name) || undefined,
          );
          // Mirror the clicked card's recipient into the drawer header. Only
          // fanned-out cards (Calls/Replies) carry recipient_kind; org-level
          // cards leave focus null so the kind-aware default applies.
          setOpenFocusKind(row.recipient_kind ?? null);
          setOpenFocusName(row.recipient_kind ? row.primary_contact_name ?? null : null);
          setOpenFocusRole(row.recipient_kind ? row.primary_contact_role ?? null : null);
          setOpenOutreachId(row.id);
          setStakeholderRead(row, true, false); // drawer persists mark_read
        }}
        onStopOutreach={async (reason) => {
          const action = STOP_OUTREACH_ACTIONS[reason];
          const label = STOP_OUTREACH_LABELS[reason];
          if (!window.confirm(`Stop outreach: ${label}?`)) return;
          try { await callAction(row.id, action); }
          catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
        }}
        onMarkUnread={async () => setStakeholderRead(row, false, true)}
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
                try { await callAction(row.id, "archive"); }
                catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
              }
        }
        onReopen={
          CLOSED_STATUSES.includes(row.status)
            ? async () => {
                try { await callAction(row.id, "reopen"); }
                catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
              }
            : undefined
        }
        onOpenDirectory={
          row.kind === "provider" && row.provider_slug
            ? () => {
                window.open(`/provider/${row.provider_slug}`, "_blank", "noopener,noreferrer");
              }
            : undefined
        }
        onSeeLogHistory={() => {
          window.location.href = `/admin/medjobs/logs?outreach_id=${row.id}`;
        }}
      />
    ),
    [tab, callAction, isRecent, setStakeholderRead],
  );

  // Stable wrapper for the audience tabs' prospect rows (providers /
  // partner_book pass slotTab="prospects"). Inlining `(row) => renderRow(
  // row, "prospects")` created a new function every render, defeating the
  // per-card element cache in ResearchTabContent.
  const renderProspectRow = useCallback(
    (row: TabRow) => renderRow(row, "prospects"),
    [renderRow],
  );

  // Shared prospect-research handlers — used by the Prospects tab and the
  // Providers / Partners audience tabs (which reuse ResearchTabContent for
  // their prospecting sections).
  const startProviderOutreach = useCallback(
    async (p: ProviderProspectRow) => {
      try {
        const res = await fetch("/api/admin/medjobs/provider-prospects/materialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider_id: p.provider_id, campus_id: p.campus_id }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to materialize");
        // Open the drawer IMMEDIATELY — do not await a full refetch first
        // (that 6-endpoint refresh, incl. the catchment scan, is what made
        // clicking a prospect slow to open). Refresh the list in the
        // background; the materialized row inherits the prospect's created_at
        // so it lands in the same spot the virtual card occupied (no jump).
        // Once it arrives, mark it read so its bold border clears.
        setOpenOutreachName(p.provider_name || undefined);
        setOpenOutreachId(body.id);
        void silentRefresh().then(() => {
          setRows((prev) =>
            prev.map((r) =>
              r.id === body.id && r.viewed_at == null
                ? { ...r, viewed_at: new Date().toISOString() }
                : r,
            ),
          );
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start outreach");
      }
    },
    [silentRefresh],
  );

  // Client list renderer — shared by the Clients tab and the Providers
  // audience tab's active section.
  const renderClientList = useCallback(
    (list: ClientRow[]) => (
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id}>
            <ClientCard
              row={r}
              onManage={() => {
                setEntityRead("client", r, true, false); // drawer persists read
                setOpenProviderName(r.display_name || undefined);
                setOpenProviderId(r.id);
              }}
              overflowMenu={
                <CardOverflowMenu
                  items={[
                    {
                      label: "Mark as unread",
                      onClick: () => setEntityRead("client", r, false, true),
                    },
                  ]}
                />
              }
            />
          </li>
        ))}
      </ul>
    ),
    [setEntityRead],
  );

  // Always show the four core operational tabs (Prospects · Calls · Emails ·
  // Meetings), even when empty. Each has its own empty state, so a quiet
  // "No calls due" reads better than a tab that vanishes — the admin always
  // knows where calls/meetings will land. (Smart-hide removed for these.)
  const visibleTabs = TABS;

  const isInboxEmpty = useMemo(() => {
    if (!tabCounts) return false;
    return TABS.every((t) => (tabCounts[t.key] ?? 0) === 0);
  }, [tabCounts]);

  const setTabAndUrl = useCallback(
    (next: TabKey) => {
      setTab(next);
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      sp.set("tab", next);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== tab) setTab(tabFromUrl);
  }, [tabFromUrl, tab]);

  // Auto-pivot: when counts arrive and the active tab has 0 work,
  // switch to the first tab that does have work. Without this, the
  // initialTab="clients" default on the In Basket page would anchor
  // Clients into the bar even when the only operational work is in
  // Prospects (or any other tab). Lets smart-hide actually hide
  // Clients on fresh load.
  //
  // Skipped when the URL has an explicit ?tab=... so a deep-link to an
  // empty tab still works. Once auto-pivot fires, setTabAndUrl writes
  // ?tab=<picked> to the URL — subsequent count changes won't pivot
  // again because the URL is now explicit.
  useEffect(() => {
    if (!tabCounts) return;
    if (tabFromUrl != null) return;
    if ((tabCounts[tab] ?? 0) > 0) return;
    const firstWithWork = TABS.find((t) => (tabCounts[t.key] ?? 0) > 0);
    if (firstWithWork && firstWithWork.key !== tab) {
      setTabAndUrl(firstWithWork.key);
    }
  }, [tabCounts, tab, tabFromUrl, setTabAndUrl]);

  return (
    <div>
      {/* v9.0 Phase 7 Commit J: In Basket is queue-focused — title +
          hero, no top-page action buttons. Open Gmail + Add
          Stakeholder were noise on a calm operational surface; they
          live on more contextual surfaces (the Sites page hosts
          stakeholder additions per-site). */}
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </header>

      <InBasketHero tabCounts={tabCounts} tabUnreadCounts={tabUnreadCounts} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by organization name…"
            size="sm"
          />
        </div>
        <div className="shrink-0 min-w-[140px]">
          <Select
            value={campusSlug}
            onChange={(val) => setCampusSlug(val)}
            size="sm"
            options={[
              { value: "", label: "All sites" },
              ...campuses.map((c) => ({ value: c.slug, label: c.name })),
            ]}
          />
        </div>
        <div className="shrink-0 min-w-[120px]">
          <Select
            value={typeFilter}
            onChange={(val) => setTypeFilter(val as StakeholderType | "all")}
            size="sm"
            options={TYPE_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
          />
        </div>
      </div>

      {/* v9.0 Phase 6.5: entity-keyed tab bar with smart-hide. Tab is
          visible when (count > 0) OR it's the active tab. Bolded +
          fraction `unread/total` when unread > 0; muted + plain count
          otherwise. Completed rows leave the tab on status transition,
          so counts only reflect active work.
          Entirely hidden when isInboxEmpty — a fully-clean inbox has
          no tabs, just the "Everything caught up" empty state. Tabs
          surface only when actual operational work exists. */}
      {!isInboxEmpty && (
        <div className="mb-8 flex items-center border-b border-gray-100">
          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {visibleTabs.map((t) => {
              const count = tabCounts?.[t.key] ?? 0;
              const unread = tabUnreadCounts?.[t.key] ?? 0;
              const active = t.key === tab;
              const isUnreadTab = unread > 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTabAndUrl(t.key)}
                  title={t.tooltip}
                  className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${
                    // v9.0 Phase 7 Commit E: bold the tab label AND the
                    // fraction together when unread > 0. Inactive unread
                    // tabs also darken so the bold actually pops against
                    // the muted gray-400 default — bold alone on light
                    // text barely renders. Read tabs stay font-medium +
                    // gray-400 to keep the inactive zone calm.
                    isUnreadTab
                      ? active
                        ? "border-gray-900 font-semibold text-gray-900"
                        : "border-transparent font-semibold text-gray-900 hover:text-gray-700"
                      : active
                        ? "border-gray-900 font-medium text-gray-900"
                        : "border-transparent font-medium text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span
                      className={`ml-1.5 text-xs tabular-nums ${
                        isUnreadTab
                          ? "font-semibold text-gray-900"
                          : "text-gray-400"
                      }`}
                    >
                      {isUnreadTab ? `${unread}/${count}` : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-tab list rendering. The skeleton shows ONLY on a view change
          (first mount / tab switch); silent refreshes (drawer close, row
          actions, filter/search, the global signal) keep the current list
          on screen and swap data in place, so the page never flashes. */}
      {viewLoading ? (
        <ListSkeleton />
      ) : error ? (
        <p className="py-8 text-center text-sm text-red-600">{error}</p>
      ) : isInboxEmpty ? (
        <div className="py-16 text-center">
          <p className="text-base font-semibold text-primary-700">
            ✓ Everything caught up.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            The In Basket is clear. Head to{" "}
            <Link
              href="/admin/medjobs/logs"
              className="font-medium text-primary-700 underline hover:no-underline"
            >
              Logs
            </Link>
            {" "}to review what you and the team finished.
          </p>
        </div>
      ) : tab === "providers" ? (
        // Provider audience queue: prospecting (catchment agency prospects)
        // folded with active clients. Provider-kind materialized rows + virtual
        // catchment cards render via ResearchTabContent (provider side only).
        <div>
          {/* Prospecting: agencies in catchment */}
          <section>
            <ResearchTabContent
              rows={rows.filter((r) => r.kind === "provider")}
              providerProspects={providerProspects}
              researchCampuses={[]}
              renderRow={renderProspectRow}
              onStartProviderOutreach={startProviderOutreach}
              tabCountsAll={tabCounts?.all ?? 0}
            />
          </section>
          {/* Active clients with pending steps — hairline divider, no title */}
          <section className="mt-6 border-t border-gray-100 pt-6">
            {clientRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                No clients with pending steps right now.
              </p>
            ) : (
              renderClientList(clientRows)
            )}
          </section>
        </div>
      ) : tab === "partner_book" ? (
        // Partner audience queue: prospecting (campus stakeholders + research
        // cards) folded with active partners. Partner-kind prospect rows render
        // via ResearchTabContent (partner side only); active partners below.
        <div>
          {/* Prospecting: campus stakeholders + research cards */}
          <section>
            <ResearchTabContent
              rows={rows.filter((r) => r.kind !== "provider")}
              providerProspects={[]}
              researchCampuses={researchCampuses}
              renderRow={renderProspectRow}
              onStartProviderOutreach={startProviderOutreach}
              tabCountsAll={tabCounts?.all ?? 0}
            />
          </section>
          {/* Active partners with pending steps — hairline divider, no title */}
          <section className="mt-6 border-t border-gray-100 pt-6">
            {partnerRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                No partners have open tasks right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {partnerRows.map((row) => (
                  <li key={row.row_key ?? row.id}>{renderRow(row, "partners")}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : tab === "prospects" ? (
        <ResearchTabContent
          rows={rows}
          providerProspects={providerProspects}
          researchCampuses={researchCampuses}
          renderRow={renderRow}
          onStartProviderOutreach={startProviderOutreach}
          onOpenCampusResearch={(campus) => setBulkResearchCampus(campus)}
          tabCountsAll={tabCounts?.all ?? 0}
        />
      ) : tab === "replies" ? (
        rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">No inbox triage right now.</p>
        ) : (
          <RepliesGroupedList rows={rows} renderRow={(row) => renderRow(row)} />
        )
      ) : tab === "sites" ? (
        // v9.0 Phase 7 Commit N: In Basket Sites tab surfaces sites
        // with active operational work — research-needed prompts OR
        // sites with a pending site_task. Click opens the SiteDrawer
        // for the Step Board.
        campusBanners.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            No sites need attention right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {campusBanners.map((c) => (
              <li key={c.id}>
                <SiteCard
                  row={c}
                  onView={() => {
                    window.location.href = `/admin/student-outreach/campus/${c.slug}`;
                  }}
                />
              </li>
            ))}
          </ul>
        )
      ) : tab === "clients" ? (
        // v9.0 Phase 7 Commit N: In Basket Clients tab renders provider
        // clients with at least one pending business_profile_task
        // (kind=client). Click opens the ProviderDrawer (Step Board).
        // Commit O: cards inherit row.unread; overflow includes
        // Mark as unread parity with stakeholder cards.
        clientRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            No clients with pending steps right now.
          </p>
        ) : (
          renderClientList(clientRows)
        )
      ) : tab === "candidates" ? (
        candidateRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            No candidates with pending steps right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidateRows.map((r) => (
              <li key={r.id}>
                <CandidateCard
                  row={r}
                  onOpen={() => {
                    setEntityRead("candidate", r, true, false); // drawer persists read
                    setOpenCandidateSeed(r);
                    setOpenCandidateId(r.id);
                  }}
                  overflowMenu={
                    <CardOverflowMenu
                      items={[
                        {
                          label: "Mark as unread",
                          onClick: () => setEntityRead("candidate", r, false, true),
                        },
                        {
                          label: "Open profile editor",
                          onClick: () => {
                            window.location.href = `/admin/medjobs/${r.id}`;
                          },
                        },
                      ]}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        )
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">
          {tab === "calls"
            ? "No phone calls due. 🎉"
            : tab === "meetings"
            ? "No meetings in flight or booked."
            : tab === "partners"
            ? "No partners have open tasks. Add a custom step from the Partner drawer to bring one back."
            : "Nothing here right now."}
        </p>
      ) : tab === "calls" ? (
        <CallsSectioned rows={rows} renderRow={renderRow} />
      ) : tab === "meetings" ? (
        <MeetingsSectioned rows={rows} renderRow={renderRow} />
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
          seedName={openOutreachName}
          activeTab={tab}
          focusRecipientKind={openFocusKind}
          focusRecipientName={openFocusName}
          focusRecipientRole={openFocusRole}
          onClose={() => {
            // No refetch on close. Read state was already applied
            // optimistically on open (markRowReadLocally), and any real
            // action inside the drawer refreshed via onAction. Closing a
            // drawer you only viewed must not reload + re-sort the list.
            setOpenOutreachId(null);
            setOpenFocusKind(null);
            setOpenFocusName(null);
            setOpenFocusRole(null);
          }}
          onAction={handleDrawerAction}
        />
      )}

      {/* v9.0 Phase 7 Commit N: entity drawers for the In Basket
          Clients / Candidates / Sites tabs. Each closes back to a silent
          refresh so the EntityStepBoard's task completions reflect
          immediately in the In Basket without a skeleton flash. */}
      {openProviderId && (
        <Drawer
          providerId={openProviderId}
          seedName={openProviderName}
          onClose={() => {
            setOpenProviderId(null);
            void silentRefresh();
          }}
        />
      )}
      {openCandidateId && (
        <Drawer
          candidateId={openCandidateId}
          candidateSeed={openCandidateSeed}
          onClose={() => {
            setOpenCandidateId(null);
            void silentRefresh();
          }}
        />
      )}

      {bulkResearchCampus && (
        <BulkResearchModal
          campus={bulkResearchCampus}
          onClose={() => setBulkResearchCampus(null)}
          onSaved={async () => {
            setBulkResearchCampus(null);
            await silentRefresh();
          }}
        />
      )}
    </div>
  );
}


// Merge `next` into `prev` preserving prev's order: existing items keep their
// position with refreshed data, removed items drop, new items append. Lets a
// silent refresh update rows in place without reordering — so a card's
// read/unread change never moves it.
function mergeByKey<T>(prev: T[], next: T[], key: (t: T) => string): T[] {
  const nextByKey = new Map(next.map((t) => [key(t), t] as const));
  const result: T[] = [];
  const seen = new Set<string>();
  for (const p of prev) {
    const k = key(p);
    const updated = nextByKey.get(k);
    if (updated !== undefined) {
      result.push(updated);
      seen.add(k);
    }
  }
  for (const n of next) {
    if (!seen.has(key(n))) result.push(n);
  }
  return result;
}

// List skeleton — shown on a view change (first mount / tab switch). Reserves
// row-height layout so the real content swaps in without a shift, and avoids
// the "blank → spinner → content" flash.
function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="h-[72px] animate-pulse rounded-xl border border-gray-100 bg-gray-50"
        />
      ))}
    </ul>
  );
}


// ── v10 Bullet 7 (2026-06-04): Calls tab sectioned rendering ──────────────
// Splits the rows into Today + Upcoming sections. "Today" = due_at by
// end-of-day local; everything past that is Upcoming, grouped by day.
// Sort priority: within Today, clicked-not-activated rows surface FIRST
// (engagement-driven priority bump from Pass A strategy depth).

function CallsSectioned({
  rows,
  renderRow,
}: {
  rows: TabRow[];
  renderRow: (row: TabRow) => React.ReactNode;
}) {
  const endOfToday = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();

  // Partition by due_at; rows without due_call_task fall into Today as
  // safety (overdue or anomalous — admin still sees them).
  const todayRows: TabRow[] = [];
  const upcomingRows: TabRow[] = [];
  for (const r of rows) {
    const dueIso = r.due_call_task?.due_at;
    const due = dueIso ? new Date(dueIso).getTime() : 0;
    if (!dueIso || due <= endOfToday) todayRows.push(r);
    else upcomingRows.push(r);
  }

  // Today: clicked-not-activated first, then by due_at ASC.
  todayRows.sort((a, b) => {
    const ac = a.engagement_substate === "clicked_not_activated" ? 0 : 1;
    const bc = b.engagement_substate === "clicked_not_activated" ? 0 : 1;
    if (ac !== bc) return ac - bc;
    const ad = a.due_call_task?.due_at ?? "";
    const bd = b.due_call_task?.due_at ?? "";
    return ad.localeCompare(bd);
  });

  // Upcoming: by due_at ASC. Group by day label for visual scanning.
  upcomingRows.sort((a, b) =>
    (a.due_call_task?.due_at ?? "").localeCompare(b.due_call_task?.due_at ?? ""),
  );
  const upcomingByDay = new Map<string, TabRow[]>();
  for (const r of upcomingRows) {
    const dueIso = r.due_call_task?.due_at;
    if (!dueIso) continue;
    const label = formatUpcomingDayLabel(dueIso);
    const list = upcomingByDay.get(label) ?? [];
    list.push(r);
    upcomingByDay.set(label, list);
  }

  return (
    <div className="space-y-6">
      {todayRows.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Today’s Calls ({todayRows.length})
          </h3>
          <ul className="space-y-2">
            {todayRows.map((row) => (
              <li key={row.row_key ?? row.id}>{renderRow(row)}</li>
            ))}
          </ul>
        </section>
      )}
      {upcomingByDay.size > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Upcoming ({upcomingRows.length})
          </h3>
          <div className="space-y-4">
            {[...upcomingByDay.entries()].map(([dayLabel, dayRows]) => (
              <div key={dayLabel}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {dayLabel} · {dayRows.length}
                </p>
                <ul className="space-y-2">
                  {dayRows.map((row) => (
                    <li key={row.row_key ?? row.id}>{renderRow(row)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatUpcomingDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 86_400_000;
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayStart - startOfToday) / oneDay);
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}


// ── v10 Bullet 10 (2026-06-04): Meetings tab sectioned rendering ──────────
// Splits Meetings rows into three sections so admin sees what needs action
// vs what's in flight:
//   Upcoming    — meeting_state="scheduled" AND meeting_at > now()
//   In-flight   — meeting_state="in_flight" (coordinating; needs admin
//                 attention to book a time or handle a reschedule)
//   Past        — meeting_state="scheduled" AND meeting_at <= now()
//                 (meeting happened — admin needs to log the outcome)
//
// Calendly self-bookings ingested via the calendly-webhook flow into
// meeting_scheduled touchpoints surface here as Upcoming automatically.

function MeetingsSectioned({
  rows,
  renderRow,
}: {
  rows: TabRow[];
  renderRow: (row: TabRow) => React.ReactNode;
}) {
  const now = Date.now();
  const upcomingRows: TabRow[] = [];
  const inFlightRows: TabRow[] = [];
  const pastRows: TabRow[] = [];

  for (const r of rows) {
    if (r.meeting_state === "scheduled") {
      const t = r.meeting_at ? new Date(r.meeting_at).getTime() : 0;
      if (t && t > now) upcomingRows.push(r);
      else pastRows.push(r);
    } else if (r.meeting_state === "in_flight") {
      inFlightRows.push(r);
    } else {
      // Defensive — meetings tab data shouldn't surface other states,
      // but if it does, treat as in-flight to keep them visible.
      inFlightRows.push(r);
    }
  }

  // Upcoming sorts by meeting_at ASC (soonest first). In-flight by
  // last_activity_at DESC (most recent first). Past by meeting_at DESC
  // (most recent meeting first — that's what needs logging).
  upcomingRows.sort((a, b) =>
    (a.meeting_at ?? "").localeCompare(b.meeting_at ?? ""),
  );
  inFlightRows.sort((a, b) =>
    (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""),
  );
  pastRows.sort((a, b) =>
    (b.meeting_at ?? "").localeCompare(a.meeting_at ?? ""),
  );

  return (
    <div className="space-y-6">
      {upcomingRows.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Upcoming ({upcomingRows.length})
          </h3>
          <ul className="space-y-2">
            {upcomingRows.map((row) => (
              <li key={row.row_key ?? row.id}>{renderRow(row)}</li>
            ))}
          </ul>
        </section>
      )}
      {pastRows.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Needs logging ({pastRows.length})
          </h3>
          <p className="mb-2 text-[11px] text-gray-500">
            Meeting time has passed — log the outcome to move the row forward.
          </p>
          <ul className="space-y-2">
            {pastRows.map((row) => (
              <li key={row.row_key ?? row.id}>{renderRow(row)}</li>
            ))}
          </ul>
        </section>
      )}
      {inFlightRows.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Finding a time ({inFlightRows.length})
          </h3>
          <ul className="space-y-2">
            {inFlightRows.map((row) => (
              <li key={row.row_key ?? row.id}>{renderRow(row)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

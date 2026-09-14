"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AD_BOOST_QUEUE_SETTLED, fetchAdBoost, useAdBoostQueueCache } from "@/components/admin/AdBoostQueueCache";
import Link from "next/link";
import {
  type CampaignRequest,
  STATUS_LABELS,
  PHOTO_READINESS_LABELS,
  adBudgetLabel,
  fmtDateOnly,
  fmtTimestamp,
  fmtMetricsAge,
} from "@/components/admin/AdBoostShared";
import {
  type AdBoostPlatform,
  type AdBoostQueueSort,
  type ProviderCampaignGroup,
  buildProviderCampaignGroups,
  platformsForChannel,
} from "@/components/admin/ad-boost-queue";
import {
  type AdBoostNextAction,
  getAdBoostNextAction,
} from "@/lib/ad-boost/admin-communications";
import styles from "./ad-boost-queue.module.css";

export default function AdminAdBoostPage() {
  const cache = useAdBoostQueueCache();
  const initial = cache.rows.get(cache.preferences.view);
  const recent = initial && Date.now() - initial.at < 60_000 ? initial : undefined;
  const initialFilter = cache.preferences.filter[cache.preferences.view];
  const controllerRef = useRef<AbortController | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(recent?.at ?? null);
  const [requests, setRequests] = useState<CampaignRequest[] | null>(recent?.requests ?? null);
  const [counts, setCounts] = useState(recent?.counts ?? { active: 0, archived: 0 });
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "archived">(cache.preferences.view);
  // Defaults to Live: the campaigns actually spending money are what this page
  // is opened for. Initialize once per view — Archived never defaults to
  // Live (archived rows are ended/cancelled), and an active queue with nothing
  // live falls back to All so the page never opens on an empty list.
  const [statusFilter, setStatusFilter] = useState<string | null>(
    initialFilter === undefined ? (cache.preferences.view === "active" ? "live" : null) : initialFilter,
  );
  const [sort, setSort] = useState<AdBoostQueueSort>(cache.preferences.sort);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    () => cache.preferences.expanded,
  );
  // Tweaks whose review date has passed that nobody has come back to. The point of the
  // case log is that the system asks rather than the operator remembering, so an overdue
  // review has to appear on the page you land on, not only on the campaign you open.
  const [overdueByRequest, setOverdueByRequest] = useState<Map<string, number>>(
    () => new Map(),
  );

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setError(null);
    setRefreshing(true);
    try {
      const res = await fetchAdBoost(
        view === "archived" ? "/api/admin/ad-boost?archived=1" : "/api/admin/ad-boost",
        { signal: controller.signal, cache: "no-store" },
      );
      if (controller.signal.aborted) return;
      if (res.status === 401 || res.status === 403) {
        cache.rows.clear();
        setRequests(null);
        setUpdatedAt(null);
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to load");
      }
      const json = await res.json();
      if (controller.signal.aborted) return;
      const rows = json.requests as CampaignRequest[];
      const at = Date.now();
      cache.rows.set(view, { requests: rows, counts: json.counts, at });
      setRequests(rows);
      setCounts(json.counts);
      setUpdatedAt(at);
      if (cache.preferences.filter[view] === undefined) {
        cache.preferences.filter[view] = view === "active" && rows.some(row => row.status === "live") ? "live" : null;
      }
      const selected = cache.preferences.filter[view];
      if (selected && selected !== "attention" && !rows.some(row => row.status === selected)) {
        // The last campaign in a remembered lifecycle may have moved on.
        // Don't leave an invisible selected chip hiding the entire queue.
        cache.preferences.filter[view] = null;
      }
      setStatusFilter(cache.preferences.filter[view] ?? null);
    } catch (e) {
      if (controllerRef.current === controller) {
        setError(controller.signal.aborted ? "Loading took too long. Please retry." : e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      window.clearTimeout(timeout);
      if (controllerRef.current === controller) {
        setRefreshing(false);
        window.dispatchEvent(new Event(AD_BOOST_QUEUE_SETTLED));
      }
    }
  }, [cache, view]);

  useEffect(() => {
    const snapshot = cache.rows.get(view);
    const recent = snapshot && Date.now() - snapshot.at < 60_000 ? snapshot : undefined;
    setRequests(recent?.requests ?? null);
    setUpdatedAt(recent?.at ?? null);
    if (recent) setCounts(recent.counts);
    const savedFilter = cache.preferences.filter[view];
    setStatusFilter(savedFilter === undefined ? (view === "active" ? "live" : null) : savedFilter);
    void load();
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [cache, view, load]);

  useEffect(() => {
    // Review badges are optional and never gate the queue response.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetchAdBoost("/api/admin/ad-boost/case?overdue=1&counts_only=1", { signal: controller.signal })
      .then(async res => {
        if (!res.ok) return;
        const json = await res.json();
        if (controller.signal.aborted) return;
        const tally = new Map<string, number>();
        for (const row of json.overdue ?? []) {
          if (row.request_id) tally.set(row.request_id, (tally.get(row.request_id) ?? 0) + 1);
        }
        setOverdueByRequest(tally);
      }).catch(() => {}).finally(() => window.clearTimeout(timeout));
    return () => controller.abort();
  }, [view]);

  const chooseFilter = (filter: string | null) => {
    cache.preferences.filter[view] = filter;
    setStatusFilter(filter);
  };

  const tabs = [
    { value: "active" as const, label: "Queue", count: counts.active },
    { value: "archived" as const, label: "Archived", count: counts.archived },
  ];

  // Status chips are built from the loaded rows (only statuses that exist),
  // so the row stays as small as the data allows. Client-side filter — the
  // list API already returns everything.
  const statusCounts = new Map<string, number>();
  for (const r of requests ?? []) {
    statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
  }
  const statusChips = Object.keys(STATUS_LABELS).filter((st) => statusCounts.has(st));
  // Chip order is priority, not lifecycle. `.filterRail` scrolls horizontally
  // once the toolbar is narrower than its chips, so leftmost is the only
  // position guaranteed to stay visible — which is where the two lenses this
  // page is opened for belong: Live (the default, and the campaigns actually
  // spending money) then Needs attention. All follows as the escape hatch out
  // of whatever filter you're in. The remaining lifecycle stages are browsed,
  // not worked, so they sit past the divider in funnel order.
  const showLiveChip = statusChips.includes("live");
  const lifecycleChips = statusChips.filter((st) => st !== "live");
  const nextActionById = useMemo(
    () => new Map((requests ?? []).map((request) => [request.id, getAdBoostNextAction(request)])),
    [requests],
  );
  const attentionCount = (requests ?? []).filter(
    (request) => nextActionById.get(request.id)?.level === "attention",
  ).length;
  const providerGroups = useMemo(
    () =>
      requests
        ? buildProviderCampaignGroups({
            requests,
            statusFilter,
            nextActionById,
            sort,
          })
        : null,
    [nextActionById, requests, sort, statusFilter],
  );
  const visibleCampaignCount =
    providerGroups?.reduce((count, group) => count + group.requests.length, 0) ?? 0;

  /** One lifecycle-status chip. Shared so Live can be hoisted out of the
   *  lifecycle group without the markup drifting between the two call sites. */
  const renderStatusChip = (status: string) => (
    <button
      key={status}
      type="button"
      onClick={() => chooseFilter(statusFilter === status ? null : status)}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        statusFilter === status ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
      <span className={statusFilter === status ? "ml-1 text-white/60" : "ml-1 text-gray-400"}>
        {statusCounts.get(status)}
      </span>
    </button>
  );

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      cache.preferences.expanded = next;
      return next;
    });
  };

  return (
    <div className={`${styles.page} mx-auto max-w-7xl px-4 py-6 sm:px-6`}>
      <header className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900">Ad Boost — provider queue</h1>
            <RevenueChip requests={requests} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/admin/city-ads"
              className="rounded-lg border border-primary-200 bg-primary-25 px-3 py-1.5 text-sm font-medium text-primary-800 hover:bg-primary-50"
            >
              Olera city campaigns →
            </Link>
            <Link
              href="/admin/ad-boost/preview"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              See what providers see ↗
            </Link>
          </div>
        </div>
        <p className="text-gray-500 mt-1 text-sm">
          One provider, one continuous campaign history.
          <span className={styles.introDetail}>{" "}Expand a provider to work individual campaigns, advance their status, and copy the UTM landing URL.</span>{" "}
          <Link
            href="/admin/automations/ad-boost"
            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary-700 transition-colors hover:text-primary-800"
            title="Open the Ad Boost messaging cascade in Automations"
          >
            View messaging journey
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <span className="mx-1.5 text-gray-300" aria-hidden="true">·</span>
          <Link
            href="/admin/analytics?ad_boost_funnel=1#ad-boost-purchase-funnel"
            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary-700 transition-colors hover:text-primary-800"
            title="Open the expanded Ad Boost purchase funnel in Analytics"
          >
            View purchase analytics
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                cache.preferences.view = tab.value;
                setView(tab.value);
                cache.preferences.expanded = new Set();
                setExpandedProviders(new Set());
              }}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                view === tab.value
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
              <span className={`text-xs ${view === tab.value ? "text-white/70" : "text-gray-400"}`}>
                ({requests ? tab.count : "—"})
              </span>
            </button>
          ))}
        </div>
        {providerGroups && (
          <p className="text-xs text-gray-400" aria-live="polite">
            {providerGroups.length} provider{providerGroups.length === 1 ? "" : "s"}
            {" · "}
            {visibleCampaignCount} campaign{visibleCampaignCount === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className={`${styles.filterToolbar} mb-3 flex items-center justify-between gap-3`}>
        <div className={styles.filterRail}>
          <div className={`${styles.filterList} flex items-center gap-1.5`}>
            {showLiveChip && renderStatusChip("live")}
            {(attentionCount > 0 || statusFilter === "attention") && (
              <button
                type="button"
                onClick={() => chooseFilter(statusFilter === "attention" ? null : "attention")}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === "attention"
                    ? "bg-amber-600 text-white"
                    : "text-amber-700 hover:bg-gray-100"
                }`}
              >
                Needs attention
                <span className={statusFilter === "attention" ? "ml-1 text-white/70" : "ml-1 text-amber-500"}>
                  {attentionCount}
                </span>
              </button>
            )}
            {(statusChips.length > 1 || attentionCount > 0 || statusFilter !== null) && (
              <button
                type="button"
                onClick={() => chooseFilter(null)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === null
                    ? "bg-gray-800 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                All
              </button>
            )}
            {lifecycleChips.length > 0 && (
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-gray-200" />
            )}
            {lifecycleChips.map((status) => renderStatusChip(status))}
          </div>
        </div>

        <label className={`${styles.sortControl} flex items-center gap-2 text-xs font-medium text-gray-500`}>
          Sort
          <select
            value={sort}
            onChange={(event) => {
              const sort = event.target.value as AdBoostQueueSort;
              cache.preferences.sort = sort;
              setSort(sort);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700"
          >
            <option value="priority">Operational priority</option>
            <option value="newest">Newest submitted</option>
            <option value="oldest">Oldest submitted</option>
          </select>
        </label>
      </div>

      <div className="mb-3 text-xs text-gray-500" role="status">
        {refreshing ? "Updating campaigns…" : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : null}
        {error && <span className="text-amber-800"> {requests ? "Showing previously loaded campaigns. " : ""}{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></span>}
      </div>

      <div className="rounded-xl border border-gray-200">
        <div className={`${styles.queueHeader} items-center rounded-t-[11px] border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400`}>
          <span>Provider</span>
          <span>Platforms</span>
          <span>Status</span>
          <span>Next move</span>
          <span className="text-right">Landed</span>
          <span className="text-right">Questions</span>
          <span className="text-right">Leads</span>
          <span>Submitted</span>
          <span className="text-right">Actions</span>
        </div>

        {!requests && !error && <div role="status" aria-label="Loading campaigns" className="divide-y divide-gray-100">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex h-24 items-center gap-8 px-4 motion-safe:animate-pulse" aria-hidden="true">
            <div className="h-4 w-1/3 rounded bg-gray-100" /><div className="h-3 w-1/4 rounded bg-gray-100" /><div className="ml-auto h-4 w-16 rounded bg-gray-100" />
          </div>)}
        </div>}
        {providerGroups && providerGroups.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400">
            {statusFilter
              ? statusFilter === "attention"
                ? "No campaigns currently need attention."
                : `No ${(STATUS_LABELS[statusFilter] ?? statusFilter).toLowerCase()} requests.`
              : view === "archived"
                ? "No archived requests."
                : "No campaign requests yet."}
          </p>
        )}

        {providerGroups?.map((group) => (
          <ProviderGroupRow
            key={group.providerId}
            group={group}
            expanded={expandedProviders.has(group.providerId)}
            statusFilter={statusFilter}
            nextActionById={nextActionById}
            overdueByRequest={overdueByRequest}
            onToggle={() => toggleProvider(group.providerId)}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderGroupRow({
  group,
  expanded,
  statusFilter,
  nextActionById,
  overdueByRequest,
  onToggle,
  onChanged,
}: {
  group: ProviderCampaignGroup;
  expanded: boolean;
  statusFilter: string | null;
  nextActionById: Map<string, AdBoostNextAction>;
  overdueByRequest: Map<string, number>;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const request = group.primaryRequest;
  const nextAction = nextActionById.get(request.id) ?? getAdBoostNextAction(request);
  const name =
    group.latestRequest.display_name ||
    group.latestRequest.provider_slug ||
    group.providerId;
  const hasHistory = group.totalRequestCount > 1;
  const campaignCountLabel =
    statusFilter && group.requests.length !== group.totalRequestCount
      ? `${group.requests.length} of ${group.totalRequestCount} campaigns`
      : `${group.totalRequestCount} campaigns`;
  const allPreLaunch = group.requests.every((campaign) =>
    PRE_LAUNCH_STATUSES.has(campaign.status),
  );
  // Summed across the provider's flights: the row represents the provider, and a review
  // left open on an earlier flight is still open.
  const overdueCount = group.requests.reduce(
    (total, campaign) => total + (overdueByRequest.get(campaign.id) ?? 0),
    0,
  );
  const commsPaused = group.requests.some((campaign) => !!campaign.provider_comms_paused_at);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className={`${styles.queueRow} hover:bg-gray-50/60`}>
        <div className={styles.identityCell}>
          <Link
            href={`/admin/ad-boost/${request.id}`}
            className="inline-block max-w-full truncate align-bottom font-medium text-gray-900 hover:text-primary-700 hover:underline"
          >
            {name}
          </Link>
          {overdueCount > 0 && (
            <span
              className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
              title={`${overdueCount} change${overdueCount === 1 ? "" : "s"} past its review date`}
            >
              {overdueCount} review{overdueCount === 1 ? "" : "s"} due
            </span>
          )}
          {commsPaused && (
            <span
              className="ml-2 whitespace-nowrap rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-700"
              title={request.provider_comms_paused_reason ?? "Automated provider email is paused for this campaign"}
            >
              Provider email paused
            </span>
          )}
          <p className={`${styles.wideMeta} mt-0.5 flex-wrap items-center gap-1.5 text-xs text-gray-400`}>
            <span>{group.latestRequest.completeness_at_submit ?? "—"}% complete</span>
            {hasHistory && (
              <span className="text-[11px] text-gray-400">
                · {campaignCountLabel}
              </span>
            )}
            <span className="text-[11px] text-gray-400">·</span>
            <Link
              href={`/admin/relationships/${group.providerId}`}
              className="text-[11px] text-teal-700 hover:underline"
              title="Every email, text, and call with this provider, in order"
            >
              comms →
            </Link>
          </p>
          <CompactProviderMeta
            completeness={group.latestRequest.completeness_at_submit}
            platforms={group.platforms}
            submittedAt={group.latestRequest.created_at}
            campaignLabel={hasHistory ? campaignCountLabel : undefined}
          />
        </div>

        <div className={styles.widePlatform}>
          <PlatformBadges platforms={group.platforms} />
        </div>

        <div className={`${styles.wideStatus} flex-wrap items-center gap-1.5`}>
          <QueueStatusLabel status={request.status} />
          {!["live", "ended", "cancelled"].includes(request.status) && (
            <QueuePhotoReadinessLabel status={request.photo_readiness_status} />
          )}
          <PlanBadge request={request} />
          {!!request.deleted_at && (
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              archived
            </span>
          )}
          {hasHistory && <StatusSummary requests={group.requests} />}
        </div>

        <div className={styles.wideNext}>
          <NextMoveCell action={nextAction} />
        </div>
        <div className={styles.compactWork}>
          <CompactWorkCell request={request} action={nextAction} />
        </div>
        <div className={styles.wideMetric}>
          <SummaryMetricCell value={group.totals.landed} label="Landed" dash={allPreLaunch} />
        </div>
        <div className={styles.wideMetric}>
          <SummaryMetricCell value={group.totals.questions} label="Questions" dash={allPreLaunch} />
        </div>
        <div className={styles.wideMetric}>
          <SummaryMetricCell value={group.totals.leads} label="Leads" dash={allPreLaunch} emphasize />
        </div>
        <div className={styles.compactMetrics}>
          <CompactMetricGroup
            landed={group.totals.landed}
            questions={group.totals.questions}
            leads={group.totals.leads}
            dash={allPreLaunch}
          />
        </div>

        <div className={`${styles.wideSubmitted} text-sm text-gray-600`}>
          <span className={styles.inlineLabel}>Submitted: </span>
          {fmtTimestamp(group.latestRequest.created_at)}
          {hasHistory && (
            <span className="block text-[11px] leading-tight text-gray-400">
              {statusFilter ? "latest matching campaign" : "latest campaign"}
            </span>
          )}
        </div>

        {hasHistory ? (
          <div className={styles.actionCell}>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} campaign history for ${name}`}
              title={`${expanded ? "Collapse" : "Expand"} campaign history`}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={expanded ? "m4.5 15.75 7.5-7.5 7.5 7.5" : "m19.5 8.25-7.5 7.5-7.5-7.5"} />
              </svg>
            </button>
          </div>
        ) : (
          <div className={styles.actionCell}>
            <CampaignActions request={request} name={name} onChanged={onChanged} />
          </div>
        )}
      </div>

      {hasHistory && expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60">
          {group.requests.map((campaign) => (
            <CampaignRow
              key={`${campaign.id}-${campaign.updated_at}`}
              request={campaign}
              nextAction={nextActionById.get(campaign.id) ?? getAdBoostNextAction(campaign)}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignRow({
  request,
  nextAction,
  onChanged,
}: {
  request: CampaignRequest;
  nextAction: AdBoostNextAction;
  onChanged: () => void;
}) {
  const name = request.display_name || request.provider_slug || request.provider_id;
  const metricsAge = fmtMetricsAge(request.metrics_updated_at);
  const configuredBudget = adBudgetLabel(request.ad_budget_cents, request.ad_budget_type);
  const preLaunch = PRE_LAUNCH_STATUSES.has(request.status);

  return (
    <div className={`${styles.queueRow} ${styles.campaignRow} border-b border-gray-100 last:border-b-0`}>
      <div className={styles.identityCell}>
        <Link
          href={`/admin/ad-boost/${request.id}`}
          className="text-sm font-medium text-gray-800 hover:text-primary-700 hover:underline"
        >
          Campaign submitted {fmtTimestamp(request.created_at)}
        </Link>
        <p className={`${styles.wideMeta} mt-0.5 text-[11px] leading-tight text-gray-400`}>
          Flight {fmtDateOnly(request.flight_start_date ?? request.requested_setup_week)}
          {request.flight_end_date ? `–${fmtDateOnly(request.flight_end_date)}` : ""}
          {configuredBudget ? ` · ${configuredBudget}` : ""}
        </p>
        <div className={styles.compactMeta}>
          <PlatformBadges
            platforms={platformsForChannel(request.channel)}
            className={styles.compactPlatforms}
          />
          <span aria-hidden="true">·</span>
          <span>
            Flight {fmtDateOnly(request.flight_start_date ?? request.requested_setup_week)}
            {configuredBudget ? ` · ${configuredBudget}` : ""}
          </span>
        </div>
      </div>

      <div className={styles.widePlatform}>
        <PlatformBadges platforms={platformsForChannel(request.channel)} />
      </div>

      <div className={`${styles.wideStatus} flex-wrap items-center gap-1.5`}>
        <QueueStatusLabel status={request.status} />
        {!["live", "ended", "cancelled"].includes(request.status) && (
          <QueuePhotoReadinessLabel status={request.photo_readiness_status} />
        )}
        <PlanBadge request={request} />
        {!!request.deleted_at && (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            archived
          </span>
        )}
      </div>

      <div className={styles.wideNext}>
        <NextMoveCell action={nextAction} />
      </div>
      <div className={styles.compactWork}>
        <CompactWorkCell request={request} action={nextAction} />
      </div>

      <div className={styles.wideMetric}>
        <MetricCell
          request={request}
          value={request.ad_landings ?? 0}
          label="Landed"
          detail={request.ad_clicks != null ? `${request.ad_clicks} platform` : undefined}
          title={
            request.ad_clicks != null
              ? `${request.ad_landings ?? 0} managed-UTM landings measured on the page (internal traffic excluded) · ${request.ad_clicks} clicks reported by the ad platform, entered by hand ${
                  metricsAge ? `on ${metricsAge.label}` : "(no entry date recorded)"
                }`
              : "Managed-UTM landings measured on the page (internal traffic excluded). No ad-platform metrics entered yet."
          }
        />
      </div>
      <div className={styles.wideMetric}>
        <MetricCell
          request={request}
          value={request.questions_received ?? 0}
          label="Questions"
          detail={
            (request.question_topics ?? 0) < (request.questions_received ?? 0)
              ? `${request.question_topics ?? 0} topics`
              : undefined
          }
        />
      </div>
      <div className={styles.wideMetric}>
        <MetricCell request={request} value={request.delivered ?? 0} label="Leads" emphasize />
      </div>
      <div className={styles.compactMetrics}>
        <CompactMetricGroup
          landed={request.ad_landings ?? 0}
          questions={request.questions_received ?? 0}
          leads={request.delivered ?? 0}
          dash={preLaunch}
        />
      </div>

      <div className={`${styles.wideSubmitted} text-sm text-gray-600`}>
        <span className={styles.inlineLabel}>Submitted: </span>
        {fmtTimestamp(request.created_at)}
      </div>

      <div className={styles.actionCell}>
        <CampaignActions request={request} name={name} onChanged={onChanged} />
      </div>
    </div>
  );
}

function CampaignActions({
  request,
  name,
  onChanged,
}: {
  request: CampaignRequest;
  name: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isArchived = !!request.deleted_at;

  const setArchived = async (archived: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAdBoost("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, archived }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || (archived ? "Archive failed" : "Restore failed"));
      }
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Permanently delete the Ad Boost request for ${name}? This removes the record for good and can't be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAdBoost(`/api/admin/ad-boost?id=${encodeURIComponent(request.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Delete failed");
      }
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Delete failed");
      setBusy(false);
    }
  };

  return (
    <div className={styles.campaignActions}>
      <div className={`${styles.wideActionIcons} items-center gap-0.5`}>
        {isArchived ? (
          <IconAction label="Restore from archive" onClick={() => setArchived(false)} busy={busy}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </IconAction>
        ) : (
          <IconAction label="Archive (hide from queue, reversible)" onClick={() => setArchived(true)} busy={busy}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
          </IconAction>
        )}
        <IconAction label="Delete permanently" onClick={remove} busy={busy} danger>
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </IconAction>
      </div>
      <details className={styles.compactActionMenu}>
        <summary
          className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label={`More actions for ${name}`}
          title={`More actions for ${name}`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
        </summary>
        <div className="absolute right-0 top-11 z-20 w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            disabled={busy}
            onClick={() => setArchived(!isArchived)}
            className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {isArchived ? "Restore from archive" : "Archive campaign"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            Delete permanently
          </button>
          {error && (
            <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-snug text-red-600" aria-live="polite">
              {error}
            </p>
          )}
        </div>
      </details>
      {error && (
        <p className={styles.wideActionError} title={error} aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}

function PlatformBadges({
  platforms,
  className,
}: {
  platforms: AdBoostPlatform[];
  className?: string;
}) {
  return (
    <div className={`${className ?? "flex flex-wrap"} items-center gap-1.5`}>
      {platforms.map((platform) => {
        const dot =
          platform === "google"
            ? "bg-blue-500"
            : platform === "meta"
              ? "bg-indigo-500"
              : platform === "nextdoor"
                ? "bg-emerald-500"
                : "bg-gray-300";
        const label =
          platform === "google"
            ? "Google"
            : platform === "meta"
              ? "Meta"
              : platform === "nextdoor"
                ? "Nextdoor"
                : "Unassigned";
        return (
          <span key={platform} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
            {label}
          </span>
        );
      })}
    </div>
  );
}

function CompactProviderMeta({
  completeness,
  platforms,
  submittedAt,
  campaignLabel,
}: {
  completeness: CampaignRequest["completeness_at_submit"];
  platforms: AdBoostPlatform[];
  submittedAt: string;
  campaignLabel?: string;
}) {
  return (
    <div className={styles.compactMeta}>
      <span>{completeness ?? "—"}%</span>
      <span aria-hidden="true">·</span>
      <PlatformBadges platforms={platforms} className={styles.compactPlatforms} />
      <span aria-hidden="true">·</span>
      <span>{fmtTimestamp(submittedAt)}</span>
      {campaignLabel && (
        <>
          <span aria-hidden="true">·</span>
          <span>{campaignLabel}</span>
        </>
      )}
    </div>
  );
}

function CompactWorkCell({
  request,
  action,
}: {
  request: CampaignRequest;
  action: AdBoostNextAction;
}) {
  return (
    <div>
      <div className={styles.compactWorkLine}>
        <QueueStatusLabel status={request.status} />
        <span className={`${styles.compactNextMove} ${nextMoveLabelTone(action)}`}>
          {action.label}
        </span>
        <PlanBadge request={request} />
      </div>
      <span className={styles.compactWorkDetail} title={action.detail}>
        {action.detail}
      </span>
    </div>
  );
}

function CompactMetricGroup({
  landed,
  questions,
  leads,
  dash,
}: {
  landed: number;
  questions: number;
  leads: number;
  dash: boolean;
}) {
  return (
    <>
      <CompactMetric value={landed} label="Landed" dash={dash} />
      <CompactMetric value={questions} label="Questions" dash={dash} />
      <CompactMetric value={leads} label="Leads" dash={dash} emphasize />
    </>
  );
}

function CompactMetric({
  value,
  label,
  dash,
  emphasize,
}: {
  value: number;
  label: string;
  dash: boolean;
  emphasize?: boolean;
}) {
  const tone =
    dash || value === 0
      ? styles.compactMetricMuted
      : emphasize
        ? styles.compactMetricEmphasized
        : "";
  return (
    <div className={`${styles.compactMetric} ${tone}`}>
      <span className={styles.compactMetricValue}>
        {dash ? "—" : value.toLocaleString()}
      </span>
      <span className={styles.compactMetricLabel}>{label}</span>
    </div>
  );
}

function QueueStatusLabel({ status }: { status: string }) {
  const tone =
    status === "live"
      ? "text-emerald-700"
      : status === "cancelled"
        ? "text-gray-400"
        : "text-gray-600";
  return (
    <span className={`text-xs font-medium ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function QueuePhotoReadinessLabel({
  status,
}: {
  status: CampaignRequest["photo_readiness_status"];
}) {
  return (
    <span className="basis-full text-[11px] leading-tight text-gray-400">
      {PHOTO_READINESS_LABELS[status]}
    </span>
  );
}

function StatusSummary({ requests }: { requests: CampaignRequest[] }) {
  const counts = new Map<string, number>();
  for (const request of requests) {
    counts.set(request.status, (counts.get(request.status) ?? 0) + 1);
  }
  return (
    <span className="basis-full text-[11px] leading-tight text-gray-400">
      {[...counts.entries()]
        .map(([status, count]) => `${count} ${(STATUS_LABELS[status] ?? status).toLowerCase()}`)
        .join(" · ")}
    </span>
  );
}

function SummaryMetricCell({
  value,
  label,
  dash,
  emphasize,
}: {
  value: number;
  label: string;
  dash: boolean;
  emphasize?: boolean;
}) {
  const tone = dash || value === 0
    ? "text-gray-300"
    : emphasize
      ? "font-semibold text-primary-700"
      : "text-gray-700";
  return (
    <div className={`text-sm tabular-nums ${tone}`}>
      <span className={`${styles.inlineLabel} font-normal`}>{label}: </span>
      {dash ? "—" : value.toLocaleString()}
    </div>
  );
}

/** Statuses with no campaign behind them yet. Their `delivered` is a structural
 *  zero, not a result, so we show an em dash instead of a 0 that would read as
 *  "the campaign ran and produced nothing". */
const PRE_LAUNCH_STATUSES = new Set(["pending_profile", "requested", "scheduled"]);

/** Icon-only row action. The accessible name lives in aria-label; `title`
 *  gives the browser's built-in delayed tooltip — hover ~1s and the full
 *  label appears, no custom tooltip machinery. */
function IconAction({
  label,
  onClick,
  busy,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
        danger
          ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
          : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      } ${busy ? "animate-pulse" : ""}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function nextMoveLabelTone(action: AdBoostNextAction): string {
  return action.level === "attention"
    ? "text-amber-800"
    : action.level === "healthy"
      ? "text-gray-600"
      : action.level === "done"
        ? "text-gray-500"
        : "text-gray-700";
}

function NextMoveCell({ action }: { action: AdBoostNextAction }) {
  return (
    <div className="min-w-0">
      <span className={`${styles.inlineLabel} text-xs`}>Next: </span>
      <span className={`text-xs font-semibold ${nextMoveLabelTone(action)}`}>{action.label}</span>
      <span className="mt-0.5 block truncate text-[11px] leading-tight text-gray-400" title={action.detail}>
        {action.detail}
      </span>
    </div>
  );
}

/** A familiar, fully labeled funnel metric. Pre-launch values remain
 * structural dashes rather than misleading zero-performance results. */
function MetricCell({
  request,
  value,
  label,
  emphasize,
  detail,
  title,
}: {
  request: CampaignRequest;
  value: number;
  label: string;
  emphasize?: boolean;
  detail?: string;
  /** Long-hover explanation — used where a cell carries two measurements and
   *  the difference between them matters. */
  title?: string;
}) {
  const preLaunch = PRE_LAUNCH_STATUSES.has(request.status);
  const tone = preLaunch || value === 0
    ? "text-gray-300"
    : emphasize
      ? "font-semibold text-primary-700"
      : "text-gray-700";
  return (
    <div className={`text-sm tabular-nums ${tone}`} title={title}>
      <span className={`${styles.inlineLabel} font-normal`}>{label}: </span>
      {preLaunch ? "—" : value.toLocaleString()}
      {!preLaunch && detail && (
        <span className="block text-[10px] font-normal leading-tight text-gray-400">
          {detail}
        </span>
      )}
    </div>
  );
}

/** Paying-plan badge on a queue row — the at-a-glance revenue state.
 *  Nothing renders for never-subscribed campaigns (the common case). */
function PlanBadge({ request }: { request: CampaignRequest }) {
  if (!request.plan_status) return null;
  const style =
    request.plan_status === "active"
      ? "bg-emerald-50 text-emerald-700"
      : request.plan_status === "past_due"
        ? "bg-amber-50 text-amber-700"
        : "bg-gray-100 text-gray-500";
  const label =
    request.plan_status === "active"
      ? `💰 $${request.plan_value ?? "?"}/mo`
      : request.plan_status === "past_due"
        ? `⚠️ past due · $${request.plan_value ?? "?"}/mo`
        : "plan canceled";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${style}`}>
      {label}
    </span>
  );
}

/** Header tally: paying campaigns + MRR, computed from the loaded rows.
 *  Hidden until there's at least one paying plan (no zero-state noise). */
function RevenueChip({ requests }: { requests: CampaignRequest[] | null }) {
  const paying = (requests ?? []).filter(
    (r) => !r.deleted_at && (r.plan_status === "active" || r.plan_status === "past_due"),
  );
  if (paying.length === 0) return null;
  const mrr = paying.reduce((sum, r) => sum + (r.plan_value ?? 0), 0);
  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 whitespace-nowrap">
      💰 {paying.length} paying · ${mrr.toLocaleString()}/mo
    </span>
  );
}

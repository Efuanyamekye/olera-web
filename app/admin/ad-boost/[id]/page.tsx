"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  type CampaignRequest,
  type CampaignLead,
  type CampaignCommunication,
  STATUSES,
  STATUS_LABELS,
  CHANNELS,
  StatusBadge,
  PhotoReadinessBadge,
  adBudgetLabel,
  channelLabel,
  utmUrl,
  fmtTimestamp,
  fmtDateOnly,
  fmtMetricsAge,
} from "@/components/admin/AdBoostShared";
import AdBoostCaseTimeline from "@/components/admin/AdBoostCaseTimeline";
import { isTrustedMetricsSource } from "@/lib/ad-boost/metrics-provenance";
import { etInputToUtcIso, toEtInputValue, formatEt } from "@/lib/eastern-time";
import {
  type AdBoostAttentionLevel,
  type AdBoostCommunicationTone,
  formatAdBoostRelativeTime,
  getAdBoostJourneyStates,
  getAdBoostLastContact,
  getAdBoostNextAction,
  getAdBoostRecordedSendCount,
} from "@/lib/ad-boost/admin-communications";

/** The exact numbers the provider sees on their own /provider/boost live view
 *  (mirrored here for admin parity). Real visitors + leads on their page since
 *  launch — same shape the boost-state API returns. */
type ProviderViewStats = {
  visitors: number;
  leads: number;
  questions?: {
    received: number;
    unanswered: number;
    uniqueReceived: number;
    uniqueUnanswered: number;
    attribution: "campaign_utm" | "time_window";
  };
  since: string;
};

/** Rollup half of the campaign receipt (mirrors CampaignReceiptData). */
type ReceiptRollup = {
  google: {
    impressions: number | null;
    clicks: number | null;
    spendCents: number | null;
    ctr: number | null;
    cpcCents: number | null;
  };
  engagement: {
    visitors: number;
    saves: number;
    questionsReceived: number;
    questionTopics: number;
  };
  outcomes: { client: number; talking: number; no: number; unanswered: number };
  expectedLeads: number | null;
};

export default function AdBoostDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [request, setRequest] = useState<CampaignRequest | null>(null);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [communications, setCommunications] = useState<CampaignCommunication[]>([]);
  const [campaignStats, setCampaignStats] = useState<ProviderViewStats | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRollup | null>(null);
  const [profileImages, setProfileImages] = useState<string[]>([]);
  const [providerCampaigns, setProviderCampaigns] = useState<CampaignRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ad-boost?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to load");
      }
      const json = await res.json();
      setRequest(json.request as CampaignRequest);
      setLeads((json.leads as CampaignLead[]) ?? []);
      setCommunications((json.communications as CampaignCommunication[]) ?? []);
      setCampaignStats((json.campaignStats as ProviderViewStats | null) ?? null);
      setReceipt((json.receipt as ReceiptRollup | null) ?? null);
      setProfileImages((json.profileImages as string[]) ?? []);
      setProviderCampaigns((json.providerCampaigns as CampaignRequest[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isCurrentRequest = request?.id === id;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/admin/ad-boost"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
        Back to queue
      </Link>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {!isCurrentRequest && !error && <p className="text-gray-400 text-sm">Loading…</p>}

      {isCurrentRequest && (
        <Detail
          key={request.id}
          request={request}
          leads={leads}
          communications={communications}
          campaignStats={campaignStats}
          receipt={receipt}
          profileImages={profileImages}
          providerCampaigns={providerCampaigns}
          onChanged={load}
          onDeleted={() => router.push("/admin/ad-boost")}
        />
      )}
    </div>
  );
}

function Detail({
  request,
  leads,
  communications,
  campaignStats,
  receipt,
  profileImages,
  providerCampaigns,
  onChanged,
  onDeleted,
}: {
  request: CampaignRequest;
  leads: CampaignLead[];
  communications: CampaignCommunication[];
  campaignStats: ProviderViewStats | null;
  receipt: ReceiptRollup | null;
  profileImages: string[];
  providerCampaigns: CampaignRequest[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [status, setStatus] = useState(request.status);
  const [channel, setChannel] = useState(request.channel ?? "");
  const [setupWeek, setSetupWeek] = useState(request.requested_setup_week);
  const [flightStart, setFlightStart] = useState(request.flight_start_date ?? "");
  const [flightEnd, setFlightEnd] = useState(request.flight_end_date ?? "");
  const [flightBudget, setFlightBudget] = useState(
    request.ad_budget_cents != null ? (request.ad_budget_cents / 100).toString() : "",
  );
  const [budgetType, setBudgetType] = useState(request.ad_budget_type ?? "");
  const [tag, setTag] = useState(request.campaign_tag ?? "");
  const [platformId, setPlatformId] = useState(request.platform_campaign_id ?? "");
  const [note, setNote] = useState(request.admin_note ?? "");
  // Launch-email schedule: datetime-local as US EASTERN wall-clock (TJ
  // schedules from anywhere in the world — see lib/eastern-time.ts).
  const storedLaunchEmailAt = request.launched_email_scheduled_at
    ? toEtInputValue(new Date(request.launched_email_scheduled_at))
    : "";
  const [launchEmailAt, setLaunchEmailAt] = useState(storedLaunchEmailAt);
  // Wrap-up schedule. Unlike the launch email this is normally filled in for
  // you: flipping to `ended` (by hand or by the cron) parks it at the next
  // 10:15 AM ET business morning. Editing it re-times the send; clearing it
  // cancels the send without un-ending the campaign.
  const storedWrapUpAt = request.promo_complete_email_scheduled_at
    ? toEtInputValue(new Date(request.promo_complete_email_scheduled_at))
    : "";
  const [wrapUpAt, setWrapUpAt] = useState(storedWrapUpAt);
  // The SERVER picks this slot on the flip to `ended` — unlike every other
  // field here, it can change without the operator typing anything, and this
  // component is re-rendered (not remounted) after a save, so the useState
  // initializer above never sees it. Re-sync on change, React's adjust-state-
  // during-render pattern. Without this the input sits blank next to a
  // "Scheduled for…" banner and the very next save posts null, silently
  // cancelling the wrap-up.
  const [wrapUpBaseline, setWrapUpBaseline] = useState(storedWrapUpAt);
  if (wrapUpBaseline !== storedWrapUpAt) {
    setWrapUpBaseline(storedWrapUpAt);
    setWrapUpAt(storedWrapUpAt);
  }
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Manual performance entry — dollars / clicks as strings for the inputs.
  const [spend, setSpend] = useState(
    request.ad_spend_cents != null ? (request.ad_spend_cents / 100).toString() : "",
  );
  const [clicks, setClicks] = useState(
    request.ad_clicks != null ? request.ad_clicks.toString() : "",
  );
  const [impressions, setImpressions] = useState(
    request.ad_impressions != null ? request.ad_impressions.toString() : "",
  );
  const [savingPerf, setSavingPerf] = useState(false);
  const [showCommunicationTimeline, setShowCommunicationTimeline] = useState(false);

  const isArchived = !!request.deleted_at;
  const name = request.display_name || request.provider_slug || request.provider_id;
  const url = utmUrl(request.provider_slug, tag, request.id, channel || null);
  const unresolvedOutcomes = receipt?.outcomes.unanswered ?? 0;
  const journeyStates = getAdBoostJourneyStates(request, communications, {
    leadCount: leads.length,
    unresolvedOutcomes,
  });
  const communicationSteps = journeyStates.filter(({ step }) => Boolean(step.emailType));
  const lastContact = getAdBoostLastContact(request, communications);
  const nextAction = getAdBoostNextAction(request, communications, {
    leadCount: leads.length,
    unresolvedOutcomes,
  });
  const successfulCommunicationCount = getAdBoostRecordedSendCount(request, communications);

  const delivered = request.delivered ?? 0;
  const metricsAge = fmtMetricsAge(request.metrics_updated_at);
  const spendNum = spend.trim() === "" ? null : Number(spend);
  const clicksNum = clicks.trim() === "" ? null : Number(clicks);
  const impressionsNum = impressions.trim() === "" ? null : Number(impressions);
  const flightBudgetNum = flightBudget.trim() === "" ? null : Number(flightBudget);
  const flightBudgetCents =
    flightBudgetNum != null && Number.isFinite(flightBudgetNum)
      ? Math.round(flightBudgetNum * 100)
      : null;
  const costPerClick =
    spendNum != null && spendNum > 0 && clicksNum != null && clicksNum > 0
      ? spendNum / clicksNum
      : null;
  const costPerFamily =
    spendNum != null && spendNum > 0 && delivered > 0 ? spendNum / delivered : null;
  const perfDirty =
    (request.ad_spend_cents != null ? request.ad_spend_cents / 100 : null) !== spendNum ||
    (request.ad_clicks ?? null) !== clicksNum ||
    (request.ad_impressions ?? null) !== impressionsNum;
  const willSendTractionEmail =
    request.status === "live" &&
    !request.traction_email_sent_at &&
    ((spendNum ?? 0) > 0 || (clicksNum ?? 0) > 0);

  // The schedule field only participates in dirty/save while its block is
  // shown (live + email unsent) — otherwise a time typed before switching
  // status away would silently ride along on an unrelated save.
  const launchEmailEditable = !request.launched_email_sent_at && status === "live";
  const launchEmailDirty = launchEmailEditable && launchEmailAt !== storedLaunchEmailAt;

  // Only editable once the campaign is ALREADY ended — while the flip is still
  // unsaved there's no schedule yet to re-time, and the server picks the slot.
  const wrapUpEditable =
    !request.promo_complete_email_sent_at &&
    request.status === "ended" &&
    status === "ended";
  const wrapUpDirty = wrapUpEditable && wrapUpAt !== storedWrapUpAt;

  const dirty =
    status !== request.status ||
    channel !== (request.channel ?? "") ||
    setupWeek !== request.requested_setup_week ||
    flightStart !== (request.flight_start_date ?? "") ||
    flightEnd !== (request.flight_end_date ?? "") ||
    flightBudgetCents !== request.ad_budget_cents ||
    budgetType !== (request.ad_budget_type ?? "") ||
    tag !== (request.campaign_tag ?? "") ||
    platformId !== (request.platform_campaign_id ?? "") ||
    note !== (request.admin_note ?? "") ||
    launchEmailDirty ||
    wrapUpDirty;

  const save = async () => {
    if (
      flightBudgetNum != null &&
      (!Number.isFinite(flightBudgetNum) || flightBudgetCents == null || flightBudgetCents <= 0)
    ) {
      setMsg("Flight budget must be greater than zero");
      return;
    }
    if (flightBudgetNum != null && !budgetType) {
      setMsg("Choose whether the ad-platform budget is daily or a lifetime cap");
      return;
    }
    if (flightBudgetNum == null && budgetType) {
      setMsg("Enter the ad-platform budget amount");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          status,
          channel: channel || null,
          requested_setup_week: setupWeek,
          flight_start_date: flightStart || null,
          flight_end_date: flightEnd || null,
          ad_budget_cents: flightBudgetCents,
          ad_budget_type: budgetType || null,
          campaign_tag: tag || null,
          platform_campaign_id: platformId.trim() || null,
          admin_note: note || null,
          // Only when touched: re-sending a stored time would trip the
          // route's not-in-the-past validation between due time and the
          // hourly cron fire.
          ...(launchEmailDirty
            ? {
                launched_email_scheduled_at: launchEmailAt
                  ? etInputToUtcIso(launchEmailAt)
                  : null,
              }
            : {}),
          ...(wrapUpDirty
            ? {
                promo_complete_email_scheduled_at: wrapUpAt
                  ? etInputToUtcIso(wrapUpAt)
                  : null,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const savePerf = async () => {
    if (spendNum != null && (Number.isNaN(spendNum) || spendNum < 0)) {
      setMsg("Spend must be a non-negative number");
      return;
    }
    if (clicksNum != null && (!Number.isInteger(clicksNum) || clicksNum < 0)) {
      setMsg("Clicks must be a non-negative whole number");
      return;
    }
    if (impressionsNum != null && (!Number.isInteger(impressionsNum) || impressionsNum < 0)) {
      setMsg("Impressions must be a non-negative whole number");
      return;
    }
    if (
      willSendTractionEmail &&
      !window.confirm(
        `Saving these metrics will immediately email ${name} their one-time Early traction update. Send it now?`,
      )
    ) {
      return;
    }
    setSavingPerf(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          ad_spend_cents: spendNum != null ? Math.round(spendNum * 100) : null,
          ad_clicks: clicksNum,
          ad_impressions: impressionsNum,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingPerf(false);
    }
  };

  const sendLaunchNow = async () => {
    if (!window.confirm(`Email ${name} that their campaign is live, right now?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, send_launch_email: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Send failed");
      }
      setLaunchEmailAt("");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const sendWrapUpNow = async () => {
    if (
      !window.confirm(
        `Send ${name} their campaign wrap-up (results + subscribe ask) right now, instead of the scheduled morning?`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, send_promo_complete_email: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Send failed");
      }
      setWrapUpAt("");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (archived: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, archived }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Action failed");
      }
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
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
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/ad-boost?id=${encodeURIComponent(request.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      onDeleted();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the URL is shown inline to copy manually */
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-gray-900 truncate">{name}</h1>
            <StatusBadge status={request.status} />
            {!["live", "ended", "cancelled"].includes(request.status) && (
              <PhotoReadinessBadge status={request.photo_readiness_status} />
            )}
            {isArchived && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                archived
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {request.completeness_at_submit ?? "—"}% complete at submit · requested{" "}
            {fmtTimestamp(request.created_at)}
            {request.intended_monthly_budget != null && (
              <> · intended budget ${request.intended_monthly_budget}/mo (confirm before spend)</>
            )}
          </p>
        </div>
        {/* Into the admin provider record (public-page preview + comms history +
            their Olera history), not the bare public page. The directory route
            accepts the business_profiles UUID we store as provider_id. */}
        <Link
          href={`/admin/directory/${request.provider_id}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          View provider record ↗
        </Link>
      </div>

      {providerCampaigns.length > 1 && (
        <CampaignHistory
          campaigns={providerCampaigns}
          currentCampaignId={request.id}
        />
      )}

      {!["live", "ended", "cancelled"].includes(request.status) && (
        <PhotoReadinessReview
          request={request}
          profileImages={profileImages}
          onChanged={onChanged}
        />
      )}

      {/* Campaign-specific communication truth. The canonical journey teaches
          the sequence; this card answers what happened and what happens next
          for the provider currently in front of the operator. */}
      <section className="mb-5 overflow-hidden rounded-xl border border-teal-200/70 bg-white shadow-sm shadow-teal-950/5">
        <div className="flex flex-col gap-3 border-b border-teal-100 bg-teal-50/45 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">Provider communications</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-950">What they heard—and what happens next</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">Campaign milestones and delivery history are checked together, so older sends are not mistaken for missing messages.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={`/admin/relationships/${encodeURIComponent(request.provider_id)}`}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50"
            >
              Relationship log →
            </Link>
            <Link
              href={`/admin/automations/ad-boost?campaign=${encodeURIComponent(request.id)}&step=${encodeURIComponent(nextAction.stepKey ?? "campaign_launched")}#ad-boost-message-preview`}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50"
            >
              Open provider journey →
            </Link>
          </div>
        </div>

        <div className="grid gap-px bg-gray-100 sm:grid-cols-3">
          <CommunicationFact
            label="Last contact"
            value={lastContact?.label ?? "No message recorded"}
            detail={lastContact ? formatAdBoostRelativeTime(lastContact.sentAt) : "The first applicable message is still expected"}
          />
          <CommunicationFact
            label="Next move"
            value={nextAction.label}
            detail={nextAction.detail}
            level={nextAction.level}
          />
          <CommunicationFact
            label="Recorded delivery"
            value={`${successfulCommunicationCount} successful send${successfulCommunicationCount === 1 ? "" : "s"}`}
            detail="Repeating lead and outcome emails count individually"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowCommunicationTimeline((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between border-t border-gray-100 px-5 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50"
          aria-expanded={showCommunicationTimeline}
        >
          <span>{showCommunicationTimeline ? "Hide" : "Show"} campaign communication timeline</span>
          <span aria-hidden="true">{showCommunicationTimeline ? "↑" : "↓"}</span>
        </button>

        {showCommunicationTimeline && (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {communicationSteps.map(({ step, state }) => (
              <div key={step.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{step.timing}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800">{step.title}</p>
                  {state.detail && <p className="mt-0.5 text-xs text-gray-400">{state.detail}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${communicationStateClasses(state.tone)}`}>
                    {state.label}
                  </span>
                  <Link
                    href={`/admin/automations/ad-boost?campaign=${encodeURIComponent(request.id)}&step=${encodeURIComponent(step.key)}#ad-boost-message-preview`}
                    className="text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Preview →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Campaign setup */}
      <section className="rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Campaign setup</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            >
              {STATUSES.map((s) => (
                <option
                  key={s}
                  value={s}
                  disabled={
                    ["scheduled", "live"].includes(s) &&
                    !["live", "ended"].includes(request.status) &&
                    request.photo_readiness_status !== "ready"
                  }
                >
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Channel</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{channelLabel(c || null) ?? "—"}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Requested setup week</span>
            <input
              type="date"
              value={setupWeek}
              onChange={(e) => setSetupWeek(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Flight start (from ad platform)</span>
            <input
              type="date"
              value={flightStart}
              onChange={(e) => setFlightStart(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Flight end (from ad platform)</span>
            <input
              type="date"
              value={flightEnd}
              onChange={(e) => setFlightEnd(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            />
            <span className="mt-1 block text-xs text-gray-400">
              Last serving day. The campaign auto-ends the morning after, and the wrap-up
              email schedules itself. Leave blank and it never auto-ends.
            </span>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Ad-platform budget ($)</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={flightBudget}
              onChange={(e) => setFlightBudget(e.target.value)}
              placeholder="50.00"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Budget control</span>
            <select
              value={budgetType}
              onChange={(e) => setBudgetType(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            >
              <option value="">—</option>
              <option value="lifetime">Lifetime cap</option>
              <option value="daily">Daily budget</option>
            </select>
            {flightBudgetCents != null && (
              <span className="mt-1 block text-xs text-gray-400">
                {adBudgetLabel(
                  flightBudgetCents,
                  budgetType === "daily" || budgetType === "lifetime" ? budgetType : null,
                )}
              </span>
            )}
          </label>
        </div>

        {!["live", "ended", "cancelled"].includes(request.status) && request.photo_readiness_status !== "ready" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Scheduling and launch stay locked until the photo-readiness review is approved above.
          </p>
        )}

        {/* Launch email timing: shown while the "campaign is live" provider
            email hasn't gone out. Empty = it fires the moment the live status
            is saved (today's behavior); a time (US Eastern wall-clock, so the
            flip can happen from any timezone) hands the send to the hourly
            ad-boost-launch-scheduler cron instead. */}
        {launchEmailEditable && (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5">
            <span className="block text-sm font-medium text-gray-700 mb-1.5">
              Launch email to provider
            </span>
            {request.launched_email_scheduled_at && (
              <p className="text-xs text-blue-700 mb-2">
                ⏱ Scheduled for {formatEt(request.launched_email_scheduled_at)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={launchEmailAt}
                min={toEtInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                onChange={(e) => setLaunchEmailAt(e.target.value)}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white text-sm"
              />
              <span className="text-xs font-medium text-gray-500">US Eastern</span>
              {launchEmailAt && (
                <button
                  type="button"
                  onClick={() => setLaunchEmailAt("")}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                >
                  Clear
                </button>
              )}
              {request.status === "live" && (
                <button
                  type="button"
                  disabled={busy || saving}
                  onClick={sendLaunchNow}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Send now
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Time is US Eastern, wherever you are. Empty means the email goes out the
              moment you save the live status; with a time set, it sends within an hour
              of that time instead. Save changes to apply.
            </p>
          </div>
        )}

        {/* Wrap-up email timing. Shown once the campaign is ended and the
            promo-complete email hasn't gone out. The slot is picked for you on
            the flip (next 10:15 AM ET business morning) — this is where you
            re-time it, cancel it, or override it and send now. */}
        {/* What the provider told us about the whole flight, one-tap from the
            zero-lead wrap-up. The only signal we have when a family called
            their office instead of coming through Olera — so an attributed
            count of 0 next to "became a client" here is the Franchil case
            caught rather than missed. */}
        {request.provider_reported_outcome && (
          <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              Provider reported on this flight
            </span>
            <p className="text-sm text-gray-800">
              {request.provider_reported_outcome === "client"
                ? "✅ A family reached them directly and became a client"
                : request.provider_reported_outcome === "talking"
                  ? "💬 A family reached them directly, still talking"
                  : "➖ Nobody reached them directly"}
              {request.provider_reported_outcome_at && (
                <span className="text-gray-500">
                  {" · "}
                  {formatEt(request.provider_reported_outcome_at)}
                </span>
              )}
            </p>
            {request.provider_reported_outcome !== "no" && (delivered ?? 0) === 0 && (
              <p className="mt-1 text-xs text-emerald-800">
                Attributed leads read 0 for this campaign. This answer is the only record that it
                worked. Worth a call before quoting its numbers anywhere.
              </p>
            )}
          </div>
        )}

        {wrapUpEditable && (
          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2.5">
            <span className="block text-sm font-medium text-gray-700 mb-1.5">
              Wrap-up email to provider
            </span>
            <p className="text-xs text-amber-800 mb-2">
              {request.promo_complete_email_scheduled_at ? (
                <>⏱ Scheduled for {formatEt(request.promo_complete_email_scheduled_at)}</>
              ) : (
                <>⚠️ No send scheduled — this provider won&apos;t get their results or the
                  subscribe ask unless you set a time or send now.</>
              )}
              {request.ended_reason === "flight_end" && request.ended_at && (
                <> · auto-ended {formatEt(request.ended_at)}</>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={wrapUpAt}
                min={toEtInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                onChange={(e) => setWrapUpAt(e.target.value)}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white text-sm"
              />
              <span className="text-xs font-medium text-gray-500">US Eastern</span>
              {wrapUpAt && (
                <button
                  type="button"
                  onClick={() => setWrapUpAt("")}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                disabled={busy || saving}
                onClick={sendWrapUpNow}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Send now
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Results summary plus the subscribe pitch. Ending a campaign schedules this
              for the next 10:15 AM ET weekday rather than sending at the hour the flight
              closed. Clearing the time cancels the send. Save changes to apply.
            </p>
          </div>
        )}

        <label className="block text-sm mt-3">
          <span className="block text-gray-500 mb-1">Campaign tag (utm_campaign)</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder={request.id}
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
          />
        </label>

        {/* The join the hourly sync uses. It matches on this id and NOTHING else
            -- never on campaign name -- so a flight left unmapped silently syncs
            no figures at all, and whatever gets typed in the Performance box
            below is withheld from the provider as unverified. Until this field
            existed the column was settable only by raw SQL. */}
        <label className="block text-sm mt-3">
          <span className="block text-gray-500 mb-1">Ad-platform campaign ID</span>
          <input
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            placeholder="e.g. 24223751948"
            inputMode="numeric"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white font-mono text-[13px]"
          />
          <span
            className={`mt-1.5 block text-xs ${
              request.platform_campaign_id ? "text-gray-500" : "text-amber-600"
            }`}
          >
            {request.platform_campaign_id
              ? "Metrics sync hourly from the ad platform."
              : "Not mapped, so nothing syncs for this flight. Copy the numeric campaign ID from the ad platform URL. The sync's run log lists unmapped campaigns under UNMATCHED."}
          </span>
        </label>

        <label className="block text-sm mt-3">
          <span className="block text-gray-500 mb-1">Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white resize-y"
          />
        </label>

        {/* UTM landing URL */}
        <div className="mt-4">
          <span className="block text-gray-500 text-sm mb-1">UTM landing URL (paste into the ad)</span>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 text-xs text-gray-600">
              {url}
            </code>
            <button
              type="button"
              onClick={copyUrl}
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied ? "Copied" : "Copy URL"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!dirty || saving || busy}
            onClick={save}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {msg && <span className="text-sm text-red-600">{msg}</span>}
        </div>
      </section>

      {/* Paid plan (Phase 2) — read-only Stripe state. Activation/status come
          from the webhook; the operator manages billing itself (credits, the
          zero-inquiry guarantee, cancellation) in the Stripe dashboard. */}
      <section className="rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Paid plan</h2>
        {request.plan_status ? (
          <>
            <p className="text-sm text-gray-700">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium mr-2 ${
                  request.plan_status === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : request.plan_status === "past_due"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {request.plan_status}
              </span>
              {request.plan_value != null && <>${request.plan_value}/mo, all-in</>}
              {request.subscribed_at && (
                <span className="text-gray-400"> · since {fmtTimestamp(request.subscribed_at)}</span>
              )}
            </p>
            {request.stripe_subscription_id && (
              <a
                href={`https://dashboard.stripe.com/subscriptions/${request.stripe_subscription_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline"
              >
                Manage in Stripe (credits, guarantee, cancel) ↗
              </a>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">
            No plan yet. The wrap-up ask shows on the provider&apos;s boost page after
            their 3rd lead, or once the promo-complete email is sent. Payment runs
            through Stripe Checkout; this panel fills in via webhook.
          </p>
        )}
      </section>

      {/* What the provider sees — exact parity with their /provider/boost live
          view. Same visitors/leads/conversion numbers Hilda sees signed in, so
          the admin queue mirrors the provider's experience. */}
      <section className="rounded-xl border border-primary-100 bg-primary-50/40 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">What the provider sees</h2>
        <p className="text-xs text-gray-500 mb-4">
          Identical to their signed-in <span className="font-medium">/provider/boost</span> view.
        </p>
        {request.status !== "live" && request.status !== "ended" ? (
          <p className="text-xs text-gray-400">
            The provider sees these once the campaign status is <span className="font-medium">live</span>.
          </p>
        ) : campaignStats ? (
          <>
            {/* Funnel order + equal weight, mirroring CampaignPerformance:
                clicks and questions are first-class results because leads are
                zero for most $50 flights by arithmetic. */}
            <div className="grid grid-cols-3 gap-3">
              <Stat value={campaignStats.visitors.toLocaleString()} label="Visitors" />
              <Stat
                value={(campaignStats.questions?.received ?? 0).toLocaleString()}
                label={
                  campaignStats.questions &&
                  campaignStats.questions.uniqueReceived < campaignStats.questions.received
                    ? `Question taps (${campaignStats.questions.uniqueReceived} topics)`
                    : "Question taps"
                }
              />
              <Stat value={campaignStats.leads.toLocaleString()} label="Leads" accent />
            </div>
            {receipt && (
              <p className="mt-3 text-xs text-gray-500">
                Receipt rollup: {receipt.google.impressions != null ? `${receipt.google.impressions.toLocaleString()} ad views · ` : ""}
                {receipt.engagement.saves} save{receipt.engagement.saves === 1 ? "" : "s"} ·{" "}
                {receipt.engagement.questionsReceived} question taps across {receipt.engagement.questionTopics} topics ·{" "}
                {receipt.outcomes.client} client{receipt.outcomes.client === 1 ? "" : "s"} reported ·{" "}
                {receipt.outcomes.talking} still talking ·{" "}
                {receipt.outcomes.unanswered} unanswered
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">No data yet.</p>
        )}
      </section>

      {/* Performance (admin-only: manual spend + cost-per analysis) */}
      <section className="rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Performance</h2>
        {/* These four tiles are computed from numbers a human typed in, so they
            are only ever as current as the last save. Saying when that was is
            the difference between "this campaign is dead" and "nobody has
            looked since Thursday" — Rosemonte and Edmonds spent six days
            reading as the former while they were the latter. */}
        <p
          className={`text-xs mb-4 ${
            (metricsAge?.days ?? 0) >= 7 ? "text-amber-600" : "text-gray-500"
          }`}
        >
          {metricsAge
            ? `Ad-platform figures last entered ${metricsAge.label}.`
            : "Ad-platform figures have no recorded entry date."}
          {/* WHETHER THE PROVIDER CAN SEE THESE. The receipt and the dashboard
              hero both withhold figures that are neither script-synced nor
              admin-verified, so a `typed` row shows the provider nothing while
              showing an admin four confident tiles. Without this line that gap
              is invisible from here, and the fix (re-enter them) is not
              obviously the fix. */}
          {request.metrics_source !== "script" && (
            <span className="block mt-1">
              {isTrustedMetricsSource(request.metrics_source)
                ? "Verified by hand. The provider sees these."
                : "Not verified, so the provider sees no ad figures. Re-enter them below to release them."}
            </span>
          )}
          {(metricsAge?.days ?? 0) >= 7 && " Re-check the dashboard before acting on them."}
        </p>

        {/* Cross-channel read: spend and CPC make the Nextdoor pilot directly
            comparable with the existing Google flights. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          <Stat value={spendNum != null ? `$${spendNum.toFixed(2)}` : "—"} label="Spend" />
          <Stat
            value={costPerClick != null ? `$${costPerClick.toFixed(2)}` : "—"}
            label="Cost / click"
          />
          <Stat value={String(delivered)} label="Families delivered" accent />
          <Stat value={clicksNum != null ? clicksNum.toLocaleString() : "—"} label="Clicks" />
          <Stat
            value={costPerFamily != null ? `$${costPerFamily.toFixed(0)}` : "—"}
            label="Cost / family"
          />
        </div>

        {/* Manual entry — spend + clicks + impressions from the ad dashboards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Ad spend ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={spend}
              onChange={(e) => setSpend(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Clicks</span>
            <input
              type="number"
              min="0"
              step="1"
              value={clicks}
              onChange={(e) => setClicks(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Impressions</span>
            <input
              type="number"
              min="0"
              step="1"
              value={impressions}
              onChange={(e) => setImpressions(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={!perfDirty || savingPerf}
            onClick={savePerf}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {savingPerf ? "Saving…" : "Save metrics"}
          </button>
          {willSendTractionEmail ? (
            <span className="text-xs text-amber-700">
              Saving will immediately send the provider&apos;s one-time Early traction email.
              You&apos;ll confirm before it sends.
            </span>
          ) : (
            <span className="text-xs text-gray-400">
              Enter spend, clicks &amp; impressions from the Google, Meta, or Nextdoor dashboard.
              Impressions top the provider&apos;s demand receipt; cost per family is
              computed against delivered families.
            </span>
          )}
        </div>
      </section>

      {/* Leads — the families behind the delivered count (no PHI) */}
      <section className="rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Leads{leads.length > 0 ? ` (${leads.length})` : ""}
        </h2>
        {leads.length === 0 ? (
          <p className="text-xs text-gray-400">
            No families delivered yet. Once the campaign is live and a family completes an
            intake from one of its ads, they&apos;ll show here.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-gray-700">
                  <span className="truncate">
                    {l.careNeed ?? "Care inquiry"}
                    {l.state ? ` · ${l.state}` : ""}
                  </span>
                  {/* Provider one-tap outcome self-report (7d/21d pings). */}
                  {l.outcome === "client" && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      client
                    </span>
                  )}
                  {l.outcome === "talking" && (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      still talking
                    </span>
                  )}
                  {l.outcome === "no" && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      didn&apos;t work out
                    </span>
                  )}
                </span>
                <span className="text-gray-400 text-xs shrink-0">
                  {fmtDateOnly(l.created_at.slice(0, 10))}
                  {l.entrySource ? ` · ${l.entrySource}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* What actually happened to this campaign, in order. Collapsed and last:
          the operator comes to this page to change something, and a case with
          thirty audit entries pushed every control several screens down. The
          overdue-review banner inside it still renders while it is shut. */}
      <AdBoostCaseTimeline
        requestId={request.id}
        campaignTag={request.campaign_tag}
      />

      {/* Danger zone */}
      <section className="rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Manage</h2>
        <div className="flex items-center gap-2">
          {isArchived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setArchived(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setArchived(true)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              Archive
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            Delete permanently
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Archive hides this from the queue but keeps the record (reversible). Delete
          removes it for good — for scrubbing test runs.
        </p>
      </section>
    </>
  );
}

function CampaignHistory({
  campaigns,
  currentCampaignId,
}: {
  campaigns: CampaignRequest[];
  currentCampaignId: string;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Campaign history</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            One continuous record for this provider
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-gray-400">
          {campaigns.length} campaigns
        </span>
      </div>

      <div className="divide-y divide-gray-100">
        {campaigns.map((campaign) => (
          <CampaignHistoryRow
            key={`${campaign.id}-${campaign.updated_at}`}
            campaign={campaign}
            current={campaign.id === currentCampaignId}
          />
        ))}
      </div>
    </section>
  );
}

function CampaignHistoryRow({
  campaign,
  current,
}: {
  campaign: CampaignRequest;
  current: boolean;
}) {
  const platform = channelLabel(campaign.channel) ?? "Platform not set";
  const flightStart = campaign.flight_start_date ?? campaign.requested_setup_week;
  const timing = campaign.flight_start_date
    ? campaign.flight_end_date
      ? `Flight ${fmtDateOnly(flightStart)} – ${fmtDateOnly(campaign.flight_end_date)}`
      : `Flight started ${fmtDateOnly(flightStart)}`
    : `Setup week ${fmtDateOnly(campaign.requested_setup_week)}`;
  const statusTone =
    campaign.status === "live"
      ? "text-emerald-700"
      : campaign.status === "scheduled"
        ? "text-blue-700"
        : campaign.status === "requested" || campaign.status === "pending_profile"
          ? "text-amber-700"
          : "text-gray-500";
  const rowClass = `grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
    current ? "bg-teal-50/45" : "transition-colors hover:bg-gray-50/70"
  }`;
  const content = (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-gray-900">
            Submitted {fmtTimestamp(campaign.created_at)}
          </span>
          {current && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
              Viewing
            </span>
          )}
          {!!campaign.deleted_at && (
            <span className="text-[11px] font-medium text-gray-400">Archived</span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-gray-400">
          {platform} · {timing}
        </p>
      </div>

      <div className="flex items-center justify-between gap-5 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className={`text-xs font-medium ${statusTone}`}>
            {STATUS_LABELS[campaign.status] ?? campaign.status}
          </p>
          <p className="mt-1 whitespace-nowrap text-xs tabular-nums text-gray-400">
            {campaign.ad_landings ?? 0} landed · {campaign.delivered ?? 0} leads
          </p>
        </div>
        {!current && (
          <svg
            className="h-4 w-4 shrink-0 text-gray-300"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
          </svg>
        )}
      </div>
    </>
  );

  if (current) {
    return (
      <div className={rowClass} aria-current="page">
        {content}
      </div>
    );
  }

  return (
    <Link href={`/admin/ad-boost/${campaign.id}`} className={rowClass}>
      {content}
    </Link>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2.5">
      <div className={`text-xl font-semibold ${accent ? "text-primary-700" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function PhotoReadinessReview({
  request,
  profileImages,
  onChanged,
}: {
  request: CampaignRequest;
  profileImages: string[];
  onChanged: () => void;
}) {
  const [note, setNote] = useState(request.photo_review_note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const updateReview = async (
    status: "unreviewed" | "update_requested" | "ready",
  ) => {
    const sendsUpdateEmail =
      status === "update_requested" && request.photo_readiness_status !== "update_requested";
    const sendsReadyEmail =
      status === "ready" &&
      ["update_requested", "review_requested"].includes(request.photo_readiness_status);
    if (
      sendsUpdateEmail &&
      !window.confirm(
        "Request stronger photos and email the provider now? Their Ad Boost request will stay saved.",
      )
    ) return;
    if (
      sendsReadyEmail &&
      !window.confirm("Approve the updated photos and email the provider that setup is continuing?")
    ) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          photo_readiness_status: status,
          photo_review_note: note || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Photo review update failed");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Photo review update failed");
    } finally {
      setBusy(false);
    }
  };

  const resendPhotoEmail = async (kind: "update_requested" | "ready") => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ad-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, send_photo_email: kind }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Email send failed");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Email send failed");
    } finally {
      setBusy(false);
    }
  };

  const requested = request.photo_readiness_status === "update_requested";
  const resubmitted = request.photo_readiness_status === "review_requested";
  const ready = request.photo_readiness_status === "ready";

  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-amber-200 bg-white">
      <div className="border-b border-amber-100 bg-amber-50/45 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              Paid-traffic gate
            </p>
            <h2 className="mt-1 text-lg font-semibold text-gray-950">Photo readiness</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">
              Review what families will see at full landing-page size. Approve clear,
              relevant real-world photos; request an update when the gallery is mostly
              logos, text, close crops, duplicates, or visibly soft images.
            </p>
          </div>
          <PhotoReadinessBadge status={request.photo_readiness_status} />
        </div>
      </div>

      <div className="p-5">
        {profileImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {profileImages.slice(0, 8).map((src, index) => (
              <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                <Image
                  src={src}
                  alt={`Provider photo ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 50vw, 180px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/30 px-4 py-5 text-sm text-amber-800">
            No effective provider images were found. Requesting photos is appropriate.
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-gray-500">Internal review note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Example: hero is a blurry text graphic; request team, setting, and care photos"
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-400">
            Internal only. Provider emails use reviewed, supportive copy—not this note.
          </span>
        </label>

        {requested && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The provider was emailed and sees a persistent upload task in Ad Boost. One
            reminder sends after three business days if they do not update the gallery.
          </p>
        )}
        {resubmitted && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            The provider saved new gallery photos. Review them, then approve or request
            another update. Approving sends the resolution email.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!ready && (
            <button
              type="button"
              disabled={busy}
              onClick={() => updateReview("ready")}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {resubmitted ? "Approve updated photos" : "Mark photos ready"}
            </button>
          )}
          {!requested && (
            <button
              type="button"
              disabled={busy}
              onClick={() => updateReview("update_requested")}
              className="rounded-lg border border-amber-300 px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            >
              {resubmitted ? "Request another update" : "Request better photos + email"}
            </button>
          )}
          {requested && !request.photo_nudge_email_sent_at && (
            <button
              type="button"
              disabled={busy}
              onClick={() => resendPhotoEmail("update_requested")}
              className="rounded-lg border border-amber-300 px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            >
              Send photo email
            </button>
          )}
          {ready && request.photo_update_requested_at && !request.photo_ready_email_sent_at && (
            <button
              type="button"
              disabled={busy}
              onClick={() => resendPhotoEmail("ready")}
              className="rounded-lg border border-emerald-300 px-3.5 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
            >
              Send ready confirmation
            </button>
          )}
          {ready && (
            <button
              type="button"
              disabled={busy}
              onClick={() => updateReview("unreviewed")}
              className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Reopen review
            </button>
          )}
          <Link
            href={`/provider/${request.provider_slug ?? ""}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-sm font-medium text-primary-700 hover:underline"
          >
            Open family-facing page ↗
          </Link>
        </div>
        {message && <p className="mt-3 text-sm text-red-600">{message}</p>}
      </div>
    </section>
  );
}

function communicationStateClasses(tone: AdBoostCommunicationTone): string {
  if (tone === "sent") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (tone === "active") return "bg-teal-50 text-teal-800 ring-teal-200";
  if (tone === "scheduled") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (tone === "waiting") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-gray-50 text-gray-400 ring-gray-200";
}

function CommunicationFact({
  label,
  value,
  detail,
  level = "healthy",
}: {
  label: string;
  value: string;
  detail: string;
  level?: AdBoostAttentionLevel;
}) {
  const valueTone =
    level === "attention"
      ? "text-amber-800"
      : level === "done"
        ? "text-gray-600"
        : "text-gray-900";
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${valueTone}`}>{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">{detail}</p>
    </div>
  );
}

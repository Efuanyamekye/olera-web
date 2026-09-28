"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DateRangePopover, {
  resolveRange,
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import {
  buildNavigatorReviewPrompt,
  type ReviewItem,
  type ReviewPick,
} from "@/lib/benefits/navigator-review-prompt";
import NavigatorPacketPanel from "@/components/admin/NavigatorPacketPanel";
import {
  CAVEAT_ROUTE_LABEL,
  ROUTE_LABEL,
  holdLabel,
  isCaveatPacket,
  isRewritePacket,
  type NavigatorPacket,
  type PacketRoute,
} from "@/lib/benefits/navigator-packet";
import { etInputToUtcIso, toEtInputValue, formatEt } from "@/lib/eastern-time";
import { useUrlDateRangeState } from "@/hooks/useUrlDateRangeState";

/**
 * Benefits Families — the queue-shaped view of benefits intake completions.
 * KPI strip + what's-working breakdown + one row per family, newest first.
 * Rows link to the care-seeker detail page where the full record lives.
 */

const CARE_NEED_LABELS: Record<string, string> = {
  stayingAtHome: "Staying at home",
  payingForCare: "Paying for care",
  memoryHealth: "Memory & health",
  companionship: "Companionship",
};

const DEFAULT_BENEFITS_RANGE: DateRangeValue = {
  preset: "30d",
  customFrom: "",
  customTo: "",
};

// Scheduling timezone: sends are anchored to US Eastern wall-clock — the
// conversion helpers (and the rationale) live in lib/eastern-time.ts, shared
// with the Ad Boost launch-email scheduler.

const TIMELINE_LABELS: Record<string, string> = {
  asap: "ASAP",
  within_month: "Within a month",
  few_months: "Few months",
  researching: "Researching",
  exploring: "Exploring",
  // Care-timeline values from other intake flows share the same field.
  immediate: "ASAP",
  within_1_month: "Within a month",
  within_3_months: "Within 3 months",
};

interface FamilyRow {
  profileId: string;
  displayName: string | null;
  email: string | null;
  state: string | null;
  careNeed: string | null;
  /** Derived from the program page they signed up on; the family never chose it. */
  careNeedInferred?: boolean;
  matchCount: number | null;
  topProgram: string | null;
  entrySource: string | null;
  providerSlug: string | null;
  isNewUser: boolean;
  completedAt: string;
  enrichment: {
    relationship: string | null;
    timeline: string | null;
    payments: string[] | null;
  };
  situation: string | null;
  situationComplete: boolean;
  reach: { hasPhone: boolean; textable: boolean };
  signals: {
    emailOpened: boolean;
    emailClicked: boolean;
    resultsViewed: boolean;
    enriched: boolean;
  };
  cascade: {
    status: "matched" | "first_step_sent" | "moving" | "wants_help" | "wrong_program";
    firstStepProgram: string | null;
    firstStepSentAt: string | null;
    applicationStatus: BenefitsApplicationStatus | null;
    applicationStatusAt: string | null;
    lastSmsReply: string | null;
    lastSmsReplyAt: string | null;
    outcomeAt: string | null;
    outcomeReason: string | null;
  };
  caseStatus: "wants_help" | "silent_after_checkin" | "action_stall" | "attention_stall" | null;
  caseInfo: {
    noteCount: number;
    contactedAt: string | null;
    resolvedAt: string | null;
    /** Owned help case, while nobody has logged a contact. */
    help: { owner: string | null; dueAt: string | null; overdue: boolean } | null;
  };
  /** A family reply paused automated sends until a person resumes them. */
  automationHold: { at: string; reason: string; channel: string; excerpt: string | null } | null;
  lifecycle: { status: LifecycleStatus; detail: string | null };
  navigator: {
    status: "pending" | "sent" | "dismissed";
    composedAt: string | null;
    scheduledAt: string | null;
    scheduleFailed: boolean;
    firstStep: string | null;
    /** Verdict summary. Null until the packet cron has judged this letter. */
    packet: {
      route: PacketRoute;
      topHold: string | null;
      /** A caveat recompose: keep the program, add the condition. */
      caveat?: boolean;
      holdCount: number;
      builtAt: string;
    } | null;
  } | null;
  /** Latest real inbound SMS — the 💬 chip (webhook writes metadata.sms_inbound). */
  inboundText: { at: string; body: string | null } | null;
}

type BenefitsApplicationStatus =
  | "called"
  | "no_answer"
  | "needs_docs"
  | "applied"
  | "waiting"
  | "not_eligible"
  | "stuck";

/** Next 10am US Eastern as a datetime-local value — the batch default. A
 *  morning slot beats "whenever TJ happens to click" (the Aug 1 wave landed
 *  ~9pm ET because sends fire at click time). */
function nextEasternMorning(): string {
  const today = toEtInputValue(new Date()).slice(0, 10);
  const todayTen = etInputToUtcIso(`${today}T10:00`);
  if (todayTen && new Date(todayTen).getTime() > Date.now() + 60 * 60_000) {
    return `${today}T10:00`;
  }
  const tomorrow = toEtInputValue(new Date(Date.now() + 24 * 60 * 60_000)).slice(0, 10);
  return `${tomorrow}T10:00`;
}

/** Full draft payload from the per-family GET (list rows carry status only). */
export interface NavigatorDetail {
  status?: "pending" | "sent" | "dismissed";
  subject?: string;
  body?: string;
  /** Care-team companion text; {link} placeholder is replaced at send. */
  sms?: string | null;
  /** Saved in-drawer edits — preferred over the AI originals everywhere. */
  edited_subject?: string;
  edited_body?: string;
  edited_sms?: string | null;
  edited_at?: string;
  /** Scheduled send: fires within the hour of this UTC instant. */
  scheduled_at?: string;
  schedule_failed_at?: string;
  schedule_failed_reason?: string;
  composed_at?: string;
  sent_at?: string;
  /** Full pickSnapshot from metadata — the letter's verifiable claims. */
  pick?: ReviewPick;
  /** The computed routing verdict, rendered above the letter in the drawer. */
  packet?: NavigatorPacket;
}

type LifecycleStatus =
  | "needs_help"
  | "stalled"
  | "acting"
  | "returned"
  | "working"
  | "resolved"
  | "new"
  | "in_cascade";

type QueueFilter = "all" | "draft_ready" | "scheduled" | `route_${PacketRoute}`;

const QUEUE_FILTERS: QueueFilter[] = [
  "draft_ready",
  "scheduled",
  "route_review",
  "route_recompose",
  "route_auto",
  "route_ask",
  "all",
];

/** Read the active queue filter from the URL so a refresh lands back on it. */
/** Cold opens land on the queue TJ actually works, not on everything. `?status=`
 *  still wins, so a refresh keeps whatever tab he was on. */
const DEFAULT_FILTER: QueueFilter = "draft_ready";

/** Family lifecycle is a SECOND dimension, not another value of the first.
 *  "Draft ready + Needs help" is the queue worth working and it was not
 *  expressible while one control carried both axes. */
type LifeFilter = LifecycleStatus | "any";
const LIFE_FILTERS: [LifeFilter, string][] = [
  ["any", "Any"],
  ["needs_help", "Needs help"],
  ["stalled", "Stalled"],
  ["acting", "Acting"],
  ["returned", "Returned"],
  ["new", "New"],
  ["in_cascade", "In cascade"],
  ["working", "Working"],
  ["resolved", "Resolved"],
];

function filterFromUrl(): QueueFilter {
  if (typeof window === "undefined") return DEFAULT_FILTER;
  const status = new URLSearchParams(window.location.search).get("status");
  if (QUEUE_FILTERS.includes(status as QueueFilter)) return status as QueueFilter;
  // A pre-split link carried lifecycle here and meant "every family in this
  // state". Widening the tab to All preserves that breadth; lifeFromUrl picks
  // the lifecycle up on the other axis.
  return legacyStatusIsLifecycle() ? "all" : DEFAULT_FILTER;
}

/** Lifecycle used to be a `?status=` value. A link written before the split
 *  should still land where its author meant, on the family axis, instead of
 *  silently resetting to Draft ready with the filter dropped. */
function legacyStatusIsLifecycle(): LifecycleStatus | null {
  if (typeof window === "undefined") return null;
  const status = new URLSearchParams(window.location.search).get("status");
  if (!status || QUEUE_FILTERS.includes(status as QueueFilter)) return null;
  return LIFE_FILTERS.some(([k]) => k === status) ? (status as LifecycleStatus) : null;
}


function lifeFromUrl(): LifeFilter {
  if (typeof window === "undefined") return "any";
  const v = new URLSearchParams(window.location.search).get("family");
  if (LIFE_FILTERS.some(([k]) => k === v)) return v as LifeFilter;
  return legacyStatusIsLifecycle() ?? "any";
}

interface TimelineEvent {
  at: string;
  kind: string;
  label: string;
  detail?: string;
}

interface FamiliesData {
  /** Window length in days; null = all time (no prior-window comparison). */
  days: number | null;
  /** True when the 500-row fetch cap cut the list (counts stay exact). */
  truncated: boolean;
  summary: {
    completions: number;
    uniqueFamilies: number;
    prevCompletions: number | null;
    engaged: number;
    enriched: number;
    situationComplete: number;
    textable: number;
    wantsHelp: number;
    navigatorPending: number;
    navigatorDraftReady: number;
    navigatorScheduled: number;
    navigatorRoutes: Record<string, number>;
    navigatorUnjudged: number;
    stuck: Record<string, number>;
    lifecycle: Record<string, number>;
  };
  breakdown: {
    topSources: { label: string; path: string | null; count: number }[];
    topStates: { state: string; count: number }[];
    careNeeds: { careNeed: string; count: number }[];
  };
  families: FamilyRow[];
}

export default function BenefitsFamiliesView() {
  const [range, setRange] = useUrlDateRangeState(DEFAULT_BENEFITS_RANGE);
  const [data, setData] = useState<FamiliesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = resolveRange(range);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      // "All time" resolves to no bounds — flag it explicitly so the server
      // doesn't mistake it for a legacy no-param call (which defaults to 30d).
      if (!from && !to) params.set("all", "1");
      const res = await fetch(`/api/admin/benefits/families?${params.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
    } catch (err) {
      console.error("Failed to load benefits families:", err);
      setError("Couldn't load benefits families. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Case drill-in state ─────────────────────────────────────────────
  const [expanded, setExpanded] = useState<string | null>(null);
  // The active filter lives in the URL (?status=draft_ready) so a refresh
  // keeps TJ on the queue he was working, instead of dumping him back on All.
  const [filter, setFilterState] = useState<QueueFilter>(filterFromUrl);
  const setFilter = useCallback((next: QueueFilter) => {
    setFilterState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("status", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const [life, setLifeState] = useState<LifeFilter>(lifeFromUrl);
  const setLife = useCallback((next: LifeFilter) => {
    setLifeState(next);
    const url = new URL(window.location.href);
    if (next === "any") url.searchParams.delete("family");
    else url.searchParams.set("family", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  // "What's working" breakdown — collapsed by default; the family queue below
  // is where the actual work happens.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [exportState, setExportState] = useState<
    "idle" | "working" | "error" | { copied: number; failed: number; downloaded: boolean }
  >("idle");
  const [timelines, setTimelines] = useState<Record<string, TimelineEvent[] | "loading" | "error">>({});
  const [noteText, setNoteText] = useState("");
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);

  const [navigators, setNavigators] = useState<Record<string, NavigatorDetail | null>>({});

  // ── Batch scheduling (Schedule all / Unschedule all) ────────────────
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchExcluded, setBatchExcluded] = useState<Set<string>>(new Set());
  const [batchTime, setBatchTime] = useState("");
  const [batchState, setBatchState] = useState<
    "idle" | "working" | "error" | { ok: number; skipped: number; unscheduled?: boolean }
  >("idle");

  const openBatchModal = () => {
    // Pre-exclude anything the packet says must not send as written. Batch
    // scheduling used to treat every draft-ready letter as equivalent; a
    // letter routed `recompose` names a program the family's own facts rule
    // out, and one routed `ask` was a guess we should not have made. Both are
    // still unticked-by-default rather than hidden, because the reviewer
    // overriding this deliberately is legitimate and hiding rows is not.
    const holdBack = new Set(
      visibleRows
        .filter((f) => {
          const r = f.navigator?.status === "pending" ? f.navigator.packet?.route : null;
          return r === "ask" || r === "recompose";
        })
        .map((f) => f.profileId),
    );
    setBatchExcluded(holdBack);
    setBatchTime(nextEasternMorning());
    setBatchState("idle");
    setBatchOpen(true);
  };

  const runBatch = async (action: "navigator_schedule_all" | "navigator_unschedule_all", profileIds: string[], scheduledAt?: string) => {
    setBatchState("working");
    // Chunk to keep each request small: the server caps a call at 100 ids,
    // and a full backlog in one request (2 DB round-trips per row) would
    // brush the route's execution limit.
    const CHUNK = 25;
    let ok = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < profileIds.length; i += CHUNK) {
        const res = await fetch("/api/admin/benefits/families", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, profileIds: profileIds.slice(i, i + CHUNK), scheduledAt }),
        });
        const d = await res.json();
        if (!res.ok || !d.success) throw new Error(d.error || "batch failed");
        ok += d.ok;
        skipped += d.skipped;
      }
      setBatchState({ ok, skipped, unscheduled: action === "navigator_unschedule_all" });
      await fetchData();
      setTimeout(() => setBatchState("idle"), 8000);
      return true;
    } catch (err) {
      // A later chunk can fail after earlier ones landed — refresh so the
      // chips show what actually got scheduled instead of a stale count.
      console.error("Batch schedule failed:", err);
      setBatchState("error");
      await fetchData();
      return false;
    }
  };

  const loadTimeline = useCallback(async (profileId: string) => {
    setTimelines((t) => ({ ...t, [profileId]: "loading" }));
    try {
      const res = await fetch(`/api/admin/benefits/families/${profileId}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setTimelines((t) => ({ ...t, [profileId]: d.events as TimelineEvent[] }));
      setNavigators((n) => ({ ...n, [profileId]: (d.navigator as NavigatorDetail) ?? null }));
    } catch {
      setTimelines((t) => ({ ...t, [profileId]: "error" }));
    }
  }, []);

  // Navigator letter: send (after TJ's read/edit) or dismiss the draft.
  // Send is outward-facing and irreversible — confirm first, surface the
  // server's reason on a block (governance cap, missing email).
  const navigatorAction = useCallback(
    async (
      profileId: string,
      action: "navigator_send" | "navigator_dismiss" | "navigator_test" | "navigator_recompose" | "navigator_save" | "navigator_schedule" | "navigator_unschedule" | "navigator_build_packet",
      subject?: string,
      letter?: string,
      sms?: string,
      testEmail?: string,
      scheduledAt?: string,
      overridePacket?: boolean,
    ): Promise<boolean> => {
      setCaseBusy(true);
      setCaseError(null);
      try {
        const res = await fetch(`/api/admin/benefits/families/${profileId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, subject, body: letter, sms, testEmail, scheduledAt, overridePacket }),
        });
        let d = await res.json().catch(() => null);
        // The facts gate blocks server-side on the program record, which the
        // client cannot evaluate: clearance is read from the deployed pipeline
        // bundle, not from anything the queue fetches. So unlike the packet
        // gate, there is nothing to confirm BEFORE the request. Confirm on the
        // way back instead, naming the server's reason, and only then retry
        // with the override. Without this the block is a dead end: the message
        // says "send anyway if you disagree" and offers no way to do it.
        if (res.status === 409 && action === "navigator_send" && !overridePacket && d?.error) {
          if (!window.confirm(`${d.error}\n\nSend it anyway?`)) {
            setCaseError(d.error);
            return false;
          }
          const retry = await fetch(`/api/admin/benefits/families/${profileId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, subject, body: letter, sms, testEmail, scheduledAt, overridePacket: true }),
          });
          const rd = await retry.json().catch(() => null);
          if (!retry.ok) {
            setCaseError(rd?.error || "That didn't go through. Try again.");
            return false;
          }
          d = rd;
        } else if (!res.ok) {
          setCaseError(d?.error || "That didn't go through. Try again.");
          return false;
        }
        // Test sends change nothing server-side — skip the refetch churn.
        if (action !== "navigator_test") {
          await Promise.all([fetchData(), loadTimeline(profileId)]);
        }
        return true;
      } catch {
        setCaseError("That didn't go through. Try again.");
        return false;
      } finally {
        setCaseBusy(false);
      }
    },
    [fetchData, loadTimeline],
  );

  const toggleExpand = useCallback(
    (profileId: string) => {
      setCaseError(null);
      setNoteText("");
      if (expanded === profileId) {
        setExpanded(null);
        return;
      }
      setExpanded(profileId);
      if (!timelines[profileId] || timelines[profileId] === "error") void loadTimeline(profileId);
    },
    [expanded, timelines, loadTimeline],
  );

  const deleteFamily = useCallback(
    async (profileId: string, label: string) => {
      const typed = window.prompt(
        `This permanently deletes ${label} — profile, account, sign-in, and all activity. Type "delete" to confirm.`,
      );
      if (typed?.trim().toLowerCase() !== "delete") return;
      setCaseBusy(true);
      setCaseError(null);
      try {
        const res = await fetch(`/api/admin/benefits/families/${profileId}`, { method: "DELETE" });
        // Optimistic removal either way: the intake events (which drive this
        // list) delete first in the chain, so the row is gone from the data
        // even when a later sub-step (e.g. auth user) reports an error. The
        // background refetch reconciles the truth.
        setExpanded(null);
        setData((d) =>
          d
            ? {
                ...d,
                families: d.families.filter((f) => f.profileId !== profileId),
                summary: { ...d.summary, uniqueFamilies: Math.max(0, d.summary.uniqueFamilies - 1) },
              }
            : d,
        );
        if (!res.ok) {
          setCaseError("Deleted, but some linked records may remain (check server logs).");
        }
        void fetchData();
      } catch {
        setCaseError("Delete request failed. Refresh to see its actual state.");
      } finally {
        setCaseBusy(false);
      }
    },
    [fetchData],
  );

  const caseAction = useCallback(
    async (profileId: string, action: string, text?: string) => {
      setCaseBusy(true);
      setCaseError(null);
      try {
        const res = await fetch(`/api/admin/benefits/families/${profileId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, text }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setNoteText("");
        await Promise.all([fetchData(), loadTimeline(profileId)]);
      } catch {
        setCaseError("Couldn't save that. Try again.");
      } finally {
        setCaseBusy(false);
      }
    },
    [fetchData, loadTimeline],
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-gray-400">Loading families…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { summary, breakdown, families } = data;
  // "Draft ready" = pending and un-scheduled (waiting on TJ). Scheduled
  // drafts get their own chip — they're committed, not waiting. The AI-review
  // export still covers BOTH: a scheduled letter hasn't sent yet, so a
  // fact-check catching an error before the fire is exactly the point.
  // World totals — for the truncation banner only, never on a control.
  const worldPending = summary.navigatorPending ?? 0;
  const worldDraftReady = summary.navigatorDraftReady ?? 0;

  /** Redacted review context for the AI fact-check prompt — never carries
   *  the family's name or email (the name is passed only so the builder can
   *  strip it from the letter text). */
  const reviewContextFor = (f: FamilyRow): Omit<ReviewItem, "draft" | "pick"> => {
    // "Care Seeker" is a stored placeholder, not a name — most benefits
    // profiles carry it. Redacting its "first name" would mangle prose.
    const name = f.displayName?.trim();
    const isPlaceholder = !name || name.toLowerCase() === "care seeker";
    return {
      state: f.state,
      // An inferred need is not "what they are looking into"; the reviewer
      // would judge the letter against a need the family never stated.
      careNeed:
        f.careNeed && !f.careNeedInferred ? CARE_NEED_LABELS[f.careNeed] ?? f.careNeed : null,
      situation: f.situation,
      completedAt: f.completedAt,
      firstName: isPlaceholder ? null : name.split(/\s+/)[0] || null,
    };
  };

  /** Batch export: pull every pending draft via the existing per-family GET,
   *  build one paste-ready fact-check prompt, and copy it to the clipboard. */
  const exportPendingDrafts = async () => {
    setExportState("working");
    try {
      const pending = visibleRows.filter((f) => f.navigator?.status === "pending");
      const results = await Promise.all(
        pending.map(async (f) => {
          try {
            const res = await fetch(`/api/admin/benefits/families/${f.profileId}`);
            if (!res.ok) return null;
            const d = await res.json();
            const nav = d.navigator as NavigatorDetail | undefined;
            if (nav?.status !== "pending" || !nav.body) return null;
            // Saved edits are the letter that would actually send — fact-check
            // those, not the superseded AI originals.
            return {
              ...reviewContextFor(f),
              draft: {
                subject: nav.edited_subject ?? nav.subject ?? "",
                body: nav.edited_body ?? nav.body,
                sms: nav.edited_sms ?? nav.sms ?? null,
              },
              pick: nav.pick ?? null,
            } satisfies ReviewItem;
          } catch {
            return null;
          }
        }),
      );
      const items = results.filter((r): r is ReviewItem => r !== null);
      if (items.length === 0) throw new Error("no drafts loaded");
      // Batch export skips programs verified inside the window — re-auditing a
      // program checked last week costs a paste, an external model's time, and
      // a full verification pass, and buys nothing back. The per-letter export
      // below deliberately does NOT skip: asking for one letter's review is an
      // explicit request for that letter.
      const prompt = buildNavigatorReviewPrompt(items, { skipVerifiedWithinDays: 30 });
      let downloaded = false;
      try {
        await window.navigator.clipboard.writeText(prompt);
      } catch {
        // The fetches can outlive the click's transient user activation
        // (always in Safari, sometimes in Chromium), which voids clipboard
        // access. The prompt is built — deliver it as a file instead.
        const url = URL.createObjectURL(new Blob([prompt], { type: "text/markdown" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "navigator-draft-review.md";
        a.click();
        URL.revokeObjectURL(url);
        downloaded = true;
      }
      setExportState({ copied: items.length, failed: pending.length - items.length, downloaded });
      setTimeout(() => setExportState("idle"), 6000);
    } catch {
      setExportState("error");
    }
  };
  const matchesLife = (f: FamilyRow) => life === "any" || f.lifecycle.status === life;
  const matchesQueue = (f: FamilyRow) =>
    filter === "all"
      ? true
      : filter.startsWith("route_")
        ? f.navigator?.status === "pending" &&
          f.navigator.packet?.route === filter.slice("route_".length)
        : filter === "draft_ready"
        ? f.navigator?.status === "pending" && !f.navigator.scheduledAt
        : filter === "scheduled"
          ? f.navigator?.status === "pending" && !!f.navigator.scheduledAt
          : true;
  // Two independent axes, ANDed. The queue tab says what to do next; the family
  // filter says who it is for.
  const matchesFilter = (f: FamilyRow) => matchesQueue(f) && matchesLife(f);

  // Two scopes, and they are different on purpose.
  //
  // FACET rows pass the family axis only, so a tab count answers "how many of
  // this queue state are Needs help" once a family filter is on. Switching the
  // family filter re-counts every tab, which is what a faceted control should do.
  //
  // VISIBLE rows pass both axes: exactly the list on screen. Every bulk action
  // and every button label reads from these, so "Schedule all" means all of what
  // you are looking at. It did not before -- batchRows filtered on pending and
  // unscheduled and ignored the filter entirely, which was survivable when the
  // page opened on All and is not now that it opens on Draft ready with a second
  // axis available. Narrowing to nine rows and scheduling thirty-two is the kind
  // of surprise that costs a send.
  const facetRows = families.filter(matchesLife);
  const visibleRows = families.filter(matchesFilter);

  const isPending = (f: FamilyRow) => f.navigator?.status === "pending";
  const tabAll = facetRows.length;
  const tabDraftReady = facetRows.filter((f) => isPending(f) && !f.navigator!.scheduledAt).length;
  const tabScheduled = facetRows.filter((f) => isPending(f) && !!f.navigator!.scheduledAt).length;
  const routeCounts = facetRows.reduce<Record<string, number>>((acc, f) => {
    const r = isPending(f) ? f.navigator?.packet?.route : null;
    if (r) acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  const unjudged = facetRows.filter((f) => isPending(f) && !f.navigator?.packet).length;

  const actionPending = visibleRows.filter(isPending).length;
  const actionDraftReady = visibleRows.filter((f) => isPending(f) && !f.navigator!.scheduledAt).length;
  const actionScheduled = actionPending - actionDraftReady;
  // Prior-window delta only exists for bounded ranges (null = all time).
  const delta = summary.prevCompletions === null ? null : summary.completions - summary.prevCompletions;
  const priorLabel = data.days ? `prior ${data.days}d` : "prior period";
  const engagedPct = summary.uniqueFamilies ? Math.round((summary.engaged / summary.uniqueFamilies) * 100) : 0;
  const enrichedPct = summary.uniqueFamilies ? Math.round((summary.enriched / summary.uniqueFamilies) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Window picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Families who completed a benefits intake, newest first. Rows open the full care-seeker record.{" "}
          <Link
            href="/admin/automations/benefits-navigator-scheduler"
            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary-700 transition-colors hover:text-primary-800"
            title="Open the Benefits messaging cascade in Automations"
          >
            View messaging journey
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <span className="mx-1.5 text-gray-300" aria-hidden="true">·</span>
          <Link
            href="/admin/inbox"
            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary-700 transition-colors hover:text-primary-800"
            title="Open family text replies in Messages"
          >
            Review family replies
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
        <div className="shrink-0">
          <DateRangePopover value={range} onChange={setRange} />
        </div>
      </div>

      {/* KPI strip */}
      {/* Caseload card removed (TJ, 2026-07-29 QA): stuck families already
          float to the top of the list with lifecycle chips — the card was a
          duplicate signal spending a KPI slot. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Completions"
          value={summary.completions}
          detail={
            delta === null
              ? "all time"
              : delta === 0
                ? `same as ${priorLabel}`
                : `${delta > 0 ? "+" : ""}${delta} vs ${priorLabel}`
          }
          detailTone={delta !== null && delta > 0 ? "up" : delta !== null && delta < 0 ? "down" : "flat"}
        />
        <StatCard
          label="Engaged"
          value={`${engagedPct}%`}
          detail={`${summary.engaged} of ${summary.uniqueFamilies} opened, clicked, or viewed results`}
        />
        <StatCard
          label="Enriched"
          value={`${enrichedPct}%`}
          detail={`${summary.enriched} answered something · ${summary.situationComplete ?? 0} gave the full picture`}
        />
        <StatCard
          label="Textable"
          value={summary.uniqueFamilies ? `${Math.round(((summary.textable ?? 0) / summary.uniqueFamilies) * 100)}%` : "0%"}
          detail={`${summary.textable ?? 0} of ${summary.uniqueFamilies} with phone + consent (SMS can reach them)`}
        />
      </div>

      {/* What's working — collapsed by default so the queue stays above the fold */}
      <div>
        <button
          onClick={() => setBreakdownOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${breakdownOpen ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
          Top entry pages · Top states · Care needs
        </button>
        {breakdownOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <BreakdownCard title="Top entry pages">
              {breakdown.topSources.map((s) => (
                <BreakdownRow
                  key={s.path ?? "direct"}
                  label={
                    s.path ? (
                      <a href={s.path} target="_blank" rel="noopener noreferrer" className="hover:text-primary-600 transition-colors">
                        {s.label}
                      </a>
                    ) : (
                      s.label
                    )
                  }
                  count={s.count}
                  total={summary.uniqueFamilies}
                />
              ))}
            </BreakdownCard>
            <BreakdownCard title="Top states">
              {breakdown.topStates.map((s) => (
                <BreakdownRow key={s.state} label={s.state} count={s.count} total={summary.uniqueFamilies} />
              ))}
            </BreakdownCard>
            <BreakdownCard title="Care needs">
              {breakdown.careNeeds.map((c) => (
                <BreakdownRow
                  key={c.careNeed}
                  label={CARE_NEED_LABELS[c.careNeed] ?? c.careNeed}
                  count={c.count}
                  total={summary.uniqueFamilies}
                />
              ))}
            </BreakdownCard>
          </div>
        )}
      </div>

      {/* Queue tabs — what to do next. Underlined rather than pills: pills are
          the universal language for multi-select and this is single-select.
          Fixed order, never hidden at zero, so the positions can be learned. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-200">
        {(
          [
            ["draft_ready", "Draft ready"],
            ["scheduled", "Scheduled"],
            ["route_review", ROUTE_LABEL.review],
            ["route_recompose", ROUTE_LABEL.recompose],
            ["route_auto", "Cleared"],
            ["route_ask", ROUTE_LABEL.ask],
            ["all", "All"],
          ] as [QueueFilter, string][]
        ).map(([key, label]) => {
          const count =
            key === "all" ? tabAll
            : key === "draft_ready" ? tabDraftReady
            : key === "scheduled" ? tabScheduled
            : routeCounts[key.slice("route_".length)] ?? 0;
          const on = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              aria-current={on ? "page" : undefined}
              className={`relative -mb-px flex items-baseline gap-1.5 border-b-2 pb-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
                on
                  ? "border-gray-900 font-semibold text-gray-900"
                  : "border-transparent font-medium text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
              <span className={`text-xs tabular-nums ${on ? "text-gray-500" : "text-gray-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Family state — a SECOND axis, ANDed with the tab above. This is what
          makes "Draft ready + Needs help" askable. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Family</span>
        {LIFE_FILTERS.map(([key, label]) => {
          const count = key === "any" ? null : summary.lifecycle?.[key] ?? 0;
          if (key !== "any" && count === 0 && life !== key) return null;
          const on = life === key;
          return (
            <button
              key={key}
              onClick={() => setLife(key)}
              aria-pressed={on}
              className={`flex items-baseline gap-1.5 rounded px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1 ${
                on
                  ? "bg-emerald-50 font-semibold text-emerald-800"
                  : "border border-gray-200 font-medium text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
              {count !== null && (
                <span className={`tabular-nums ${on ? "text-emerald-700/70" : "text-gray-400"}`}>{count}</span>
              )}
            </button>
          );
        })}
        {unjudged > 0 && (
          <span className="text-[11px] text-gray-400">
            {unjudged} not checked yet
          </span>
        )}
          {actionPending > 0 && (
            <span className="ml-auto flex items-center gap-2">
              {typeof exportState === "object" && (
                <span className="text-[11px] font-medium text-emerald-700">
                  {exportState.downloaded ? "Downloaded" : "Copied"} {exportState.copied} draft
                  {exportState.copied === 1 ? "" : "s"} ✓{" "}
                  {exportState.downloaded ? "open the .md file and paste it" : "paste into your AI of choice"}
                  {exportState.failed > 0 ? ` (${exportState.failed} failed to load)` : ""}
                </span>
              )}
              {exportState === "error" && (
                <span className="text-[11px] font-medium text-red-600">
                  Couldn&apos;t build the export. Try again.
                </span>
              )}
              <button
                onClick={exportPendingDrafts}
                disabled={exportState === "working"}
                title="Copies a fact-check prompt covering every pending draft — paste it into ChatGPT or Perplexity to verify phone numbers, program facts, and pick fit"
                className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {exportState === "working" ? "Building…" : `Copy AI review prompt (${actionPending})`}
              </button>
              {typeof batchState === "object" && (
                <span className="text-[11px] font-medium text-emerald-700">
                  {batchState.unscheduled ? "Unscheduled" : "Scheduled"} {batchState.ok} guidance send
                  {batchState.ok === 1 ? "" : "s"} ✓
                  {batchState.skipped > 0 ? ` (${batchState.skipped} skipped)` : ""}
                </span>
              )}
              {actionDraftReady > 0 && (
                <button
                  onClick={openBatchModal}
                  title="Schedule every draft-ready guidance message for one send time — each goes through the same caps and checks as a hand send"
                  className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                >
                  Schedule all ({actionDraftReady})
                </button>
              )}
              {actionScheduled > 0 && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`Cancel all ${actionScheduled} scheduled sends? The drafts stay pending.`)) return;
                    await runBatch(
                      "navigator_unschedule_all",
                      visibleRows
                        .filter((f) => f.navigator?.status === "pending" && f.navigator.scheduledAt)
                        .map((f) => f.profileId),
                    );
                  }}
                  disabled={batchState === "working"}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Unschedule all ({actionScheduled})
                </button>
              )}
            </span>
          )}
      </div>

      {/* Schedule-all confirm modal: every draft-ready letter listed with an
          opt-out — this is where pick-fit-flagged drafts get pulled from the
          batch. Bodies are never touched; each letter sends its saved edits. */}
      {batchOpen && (() => {
        const batchRows = visibleRows.filter(
          (f) => f.navigator?.status === "pending" && !f.navigator.scheduledAt,
        );
        const includedCount = batchRows.filter((f) => !batchExcluded.has(f.profileId)).length;
        const toggleExcluded = (id: string) => {
          setBatchExcluded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => batchState !== "working" && setBatchOpen(false)}>
            <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Schedule {includedCount} guidance send{includedCount === 1 ? "" : "s"}</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Each family receives the saved email, text, or both through the normal caps and checks, at most 20 per hour
                  starting at the chosen time. Uncheck any you want to hold back.
                </p>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50 px-5 py-2">
                {batchRows.map((f) => (
                  <li key={f.profileId} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={!batchExcluded.has(f.profileId)}
                      onChange={() => toggleExcluded(f.profileId)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                      {f.email || f.displayName || f.profileId}
                    </span>
                    {f.navigator?.packet && f.navigator.packet.route !== "auto" && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ROUTE_CHIP[f.navigator.packet.route]}`}
                        title={f.navigator.packet.topHold ?? ""}
                      >
                        {f.navigator.packet.caveat ? CAVEAT_ROUTE_LABEL : ROUTE_LABEL[f.navigator.packet.route]}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {f.navigator?.firstStep || "—"}{f.state ? ` · ${f.state}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={batchTime}
                    onChange={(e) => setBatchTime(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
                  />
                  <span className="text-[11px] font-semibold text-amber-700">US Eastern</span>
                  <button
                    onClick={() => setBatchTime(nextEasternMorning())}
                    className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                  >
                    Next 10am ET
                  </button>
                  <button
                    onClick={() => setBatchTime(toEtInputValue(new Date(Date.now() + 2 * 60_000)))}
                    title="Fires on the next hourly run"
                    className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                  >
                    ASAP
                  </button>
                </div>
                {batchState === "error" && (
                  <p className="text-xs font-medium text-red-600">Couldn&apos;t schedule the batch. Try again.</p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setBatchOpen(false)}
                    disabled={batchState === "working"}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const iso = etInputToUtcIso(batchTime);
                      if (!iso || includedCount === 0) return;
                      const ids = batchRows
                        .filter((f) => !batchExcluded.has(f.profileId))
                        .map((f) => f.profileId);
                      const ok = await runBatch("navigator_schedule_all", ids, iso);
                      if (ok) setBatchOpen(false);
                    }}
                    disabled={batchState === "working" || includedCount === 0 || !etInputToUtcIso(batchTime)}
                    className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {batchState === "working" ? "Scheduling…" : `Schedule ${includedCount} for ${batchTime ? formatEt(etInputToUtcIso(batchTime) || new Date().toISOString()) : "…"}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Family queue */}
      {data.truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Long range: showing the newest 500 completions, so every count and button on this
          page covers the {families.length} families loaded here. Across the whole range there
          are {worldPending} pending drafts, {worldDraftReady} of them unscheduled — narrow the
          window to reach the rest.
        </p>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {families.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No completions in this window</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Family</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Need</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Came from</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                      No families in this status right now.
                    </td>
                  </tr>
                )}
                {visibleRows
                  .map((f) => (
                  <Fragment key={f.profileId}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(f.profileId)}>
                    <td className="px-4 py-3">
                      <Link
                        // The case workspace: conversation, reply box and the
                        // program card in one place (2026-09-28).
                        href={`/admin/relationships/families/${f.profileId}?back=${encodeURIComponent("tab=all&from=benefits")}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-gray-900 hover:text-primary-600 transition-colors"
                      >
                        {f.displayName || "Unnamed family"}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {f.email || "no email"}
                        {f.isNewUser && <span className="text-emerald-600"> · new</span>}
                      </p>
                      {/* Reachability: how a human (or the SMS rungs) can
                          actually reach them. Nothing shown = email only. */}
                      {f.reach.textable ? (
                        <p className="text-[11px] font-medium text-emerald-700 mt-0.5">📱 Textable</p>
                      ) : f.reach.hasPhone ? (
                        <p className="text-[11px] text-gray-400 mt-0.5">📱 Phone on file, call only</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">
                        {f.careNeed ? CARE_NEED_LABELS[f.careNeed] ?? f.careNeed : "—"}
                        {f.careNeed && f.careNeedInferred && (
                          <span className="text-gray-400" title="Derived from the program page they signed up on. The family was not asked.">
                            {" "}(from page)
                          </span>
                        )}
                        {f.state && <span className="text-gray-400"> · {f.state}</span>}
                      </p>
                      {(f.enrichment.timeline || f.enrichment.payments?.length) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[
                            f.enrichment.timeline ? TIMELINE_LABELS[f.enrichment.timeline] ?? f.enrichment.timeline : null,
                            f.enrichment.payments?.length ? f.enrichment.payments.join(", ") : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {/* Phase 3: the real situation, once the family gives it */}
                      {f.situation && (
                        <p className="text-xs text-gray-600 mt-0.5">{f.situation}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {f.entrySource
                        ? f.entrySource.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ")
                        : f.providerSlug
                          ? `provider: ${f.providerSlug}`
                          : "direct"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <LifecycleChip lifecycle={f.lifecycle} noteCount={f.caseInfo.noteCount} />
                        {f.cascade.applicationStatus && (
                          <BenefitsProgressChip
                            status={f.cascade.applicationStatus}
                            at={f.cascade.applicationStatusAt}
                            reply={f.cascade.lastSmsReply}
                          />
                        )}
                        {/* Real reply in the last 14 days — the message itself
                            rides the tooltip; the full thread is the timeline. */}
                        {f.inboundText &&
                          Date.now() - new Date(f.inboundText.at).getTime() < 14 * 24 * 60 * 60 * 1000 && (
                            <span
                              className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 whitespace-nowrap"
                              title={`${formatEt(f.inboundText.at)} — "${f.inboundText.body ?? ""}"`}
                            >
                              💬 Texted back
                            </span>
                          )}
                        {f.automationHold && (
                          <span
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 whitespace-nowrap"
                            title={`${formatEt(f.automationHold.at)}${f.automationHold.excerpt ? `: "${f.automationHold.excerpt}"` : ""}. Open the row to resume.`}
                          >
                            {f.automationHold.reason === "deceased"
                              ? "🕊 Paused: may have died"
                              : f.automationHold.reason === "sms_opt_out"
                                ? "⏸ Paused: texted STOP"
                                : "⏸ Automation paused"}
                          </span>
                        )}
                        {f.caseInfo.help && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                              f.caseInfo.help.overdue ? "bg-red-100 text-red-700" : "bg-rose-50 text-rose-700"
                            }`}
                            title={`Help case owner: ${f.caseInfo.help.owner ?? "unassigned"}. Log "I contacted them" to close the clock.`}
                          >
                            {f.caseInfo.help.overdue ? "⏰ Help overdue" : "🆘 Help due"}
                            {f.caseInfo.help.dueAt ? ` ${formatEt(f.caseInfo.help.dueAt)}` : ""}
                          </span>
                        )}
                        {f.navigator?.status === "pending" &&
                          (f.navigator.scheduleFailed ? (
                            <span
                              className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                              title="A scheduled send was blocked — open the row for the reason"
                            >
                              ⚠ Schedule blocked
                            </span>
                          ) : f.navigator.scheduledAt ? (
                            <>
                              <span
                                className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800"
                                title={`Sends automatically around ${formatEt(f.navigator.scheduledAt)}`}
                              >
                                ⏱ Scheduled
                              </span>
                              {/* A scheduled letter whose packet says it must not
                                  send still shows that. Scheduling can precede the
                                  packet, and "Scheduled" alone would hide a pick
                                  the family's own facts rule out. */}
                              {(f.navigator.packet?.route === "recompose" ||
                                f.navigator.packet?.route === "ask") && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROUTE_CHIP[f.navigator.packet.route]}`}
                                  title={f.navigator.packet.topHold ?? ""}
                                >
                                  {f.navigator.packet.caveat ? CAVEAT_ROUTE_LABEL : ROUTE_LABEL[f.navigator.packet.route]}
                                </span>
                              )}
                            </>
                          ) : f.navigator.packet ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROUTE_CHIP[f.navigator.packet.route]}`}
                              title={
                                f.navigator.packet.holdCount > 0
                                  ? f.navigator.packet.topHold ?? ""
                                  : "Clean on every gate"
                              }
                            >
                              {f.navigator.packet.caveat ? CAVEAT_ROUTE_LABEL : ROUTE_LABEL[f.navigator.packet.route]}
                              {f.navigator.packet.holdCount > 1 && (
                                <span className="ml-1 font-normal opacity-70">
                                  {f.navigator.packet.holdCount}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span
                              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"
                              title="Drafted. The packet cron has not judged this letter yet."
                            >
                              ✍ Not yet checked
                            </span>
                          ))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(f.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                  {expanded === f.profileId && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={5} className="px-6 py-4">
                        <CasePanel
                          timeline={timelines[f.profileId]}
                          caseInfo={f.caseInfo}
                          automationHold={f.automationHold}
                          signals={f.signals}
                          reach={f.reach}
                          situationComplete={f.situationComplete}
                          noteText={noteText}
                          setNoteText={setNoteText}
                          busy={caseBusy}
                          error={caseError}
                          navigator={navigators[f.profileId]}
                          reviewContext={reviewContextFor(f)}
                          familyLabel={f.displayName || f.email || "this family"}
                          hasEmail={!!f.email}
                          onNavigator={(action, subject, letter, sms, testEmail, scheduledAt, overridePacket) =>
                            navigatorAction(f.profileId, action, subject, letter, sms, testEmail, scheduledAt, overridePacket)
                          }
                          onAction={(action, text) => caseAction(f.profileId, action, text)}
                          onDelete={() => deleteFamily(f.profileId, f.displayName || f.email || "this family")}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The navigator draft queue's editing surface: AI-composed, TJ-signed
 * guidance, editable in place. Nothing sends until the Send button — and every
 * edit made here is the concierge feedback loop the draft-queue design exists
 * to capture.
 */
/** Also used by the case workspace (/admin/relationships/families/[id]). */
export function NavigatorDraftEditor({
  navigator,
  reviewContext,
  familyLabel,
  hasEmail,
  textable,
  busy,
  onNavigator,
}: {
  navigator: NavigatorDetail;
  reviewContext: Omit<ReviewItem, "draft" | "pick">;
  familyLabel: string;
  hasEmail: boolean;
  textable: boolean;
  busy: boolean;
  onNavigator: (
    action: "navigator_send" | "navigator_dismiss" | "navigator_test" | "navigator_recompose" | "navigator_save" | "navigator_schedule" | "navigator_unschedule" | "navigator_build_packet",
    subject?: string,
    letter?: string,
    sms?: string,
    testEmail?: string,
    scheduledAt?: string,
    overridePacket?: boolean,
  ) => Promise<boolean>;
}) {
  // Saved edits win over the AI originals — reopening a row after a save
  // shows what TJ left, not what the model wrote.
  const [subject, setSubject] = useState(navigator.edited_subject ?? navigator.subject ?? "");
  const [letter, setLetter] = useState(navigator.edited_body ?? navigator.body ?? "");
  const [sms, setSms] = useState(navigator.edited_sms ?? navigator.sms ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveDraft = async () => {
    setSaveState("saving");
    const ok = await onNavigator("navigator_save", subject, letter, sms.trim() || undefined);
    setSaveState(ok ? "saved" : "error");
    if (ok) setTimeout(() => setSaveState("idle"), 4000);
  };
  // Schedule: the datetime-local input is EASTERN wall-clock (never the
  // admin's browser timezone — see lib/eastern-time.ts); converted to UTC
  // ISO before it goes to the server.
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleState, setScheduleState] = useState<"idle" | "working">("idle");
  const scheduleSend = async () => {
    if (!scheduleAt) return;
    const iso = etInputToUtcIso(scheduleAt);
    if (!iso) return;
    setScheduleState("working");
    await onNavigator(
      "navigator_schedule",
      subject,
      letter,
      sms.trim() || undefined,
      undefined,
      iso,
    );
    setScheduleState("idle");
  };
  /** datetime-local min: now + 1h, expressed in ET wall-clock. */
  const scheduleMin = () => toEtInputValue(new Date(Date.now() + 60 * 60 * 1000));
  // Test-send: remember the reviewer's address across sessions; empty falls
  // back server-side to the signed-in admin's own email.
  const [testEmail, setTestEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem("olera.navigator.testEmail") || "";
    } catch {
      return "";
    }
  });
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [packetBusy, setPacketBusy] = useState(false);
  // Copy a single-draft fact-check prompt (with TJ's in-place edits) for
  // pasting into an external AI before sending.
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyReviewPrompt = async () => {
    try {
      const prompt = buildNavigatorReviewPrompt([
        {
          ...reviewContext,
          draft: { subject, body: letter, sms: sms.trim() || null },
          pick: navigator.pick ?? null,
        },
      ]);
      await window.navigator.clipboard.writeText(prompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 4000);
    } catch {
      setCopyState("error");
    }
  };
  const sendTest = async () => {
    setTestState("sending");
    try {
      window.localStorage.setItem("olera.navigator.testEmail", testEmail);
    } catch {
      /* private mode — remembering is best-effort */
    }
    const ok = await onNavigator("navigator_test", subject, letter, undefined, testEmail || undefined);
    setTestState(ok ? "sent" : "error");
    if (ok) setTimeout(() => setTestState("idle"), 4000);
  };
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      {/* The verdict sits ABOVE the letter: whether this is the right letter
          for this family is the question you ask before reading the prose. */}
      {navigator.packet && <NavigatorPacketPanel packet={navigator.packet} />}
      {/* Building the verdict was cron-only, which meant an env var, a redeploy
          and a secret in a URL. One letter, one click, on the admin session. */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          disabled={packetBusy}
          onClick={async () => {
            setPacketBusy(true);
            await onNavigator("navigator_build_packet");
            setPacketBusy(false);
          }}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
        >
          {packetBusy
            ? "Reading the letter…"
            : navigator.packet
              ? "Rebuild verdict"
              : "Build verdict"}
        </button>
        <span className="text-[11px] text-amber-700/70">
          {packetBusy
            ? "Two models judge the pick. Takes up to a minute."
            : "Judges whether this is the right program for this family."}
        </span>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
          ✍ Navigator guidance — waiting for you
        </p>
        <p className="text-[11px] text-amber-700/70">
          {navigator.pick?.shortName ? `First step: ${navigator.pick.shortName} · ` : ""}
          drafted {navigator.composed_at ? new Date(navigator.composed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
          {navigator.edited_at
            ? ` · edited ${new Date(navigator.edited_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : ""}
        </p>
      </div>
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="mb-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        placeholder="Subject"
      />
      <textarea
        value={letter}
        onChange={(e) => setLetter(e.target.value)}
        rows={Math.min(14, Math.max(8, letter.split("\n").length + 2))}
        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-400/40"
      />
      {textable ? (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700/80">
            First-step text — sends with email when available and is the primary delivery for a text-only family ({"{link}"} becomes their plan link; reply choices and STOP are enforced at send)
          </p>
          <textarea
            value={sms}
            onChange={(e) => setSms(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            placeholder="No text drafted — the standard first-step text will be sent instead."
          />
          {(() => {
            // Mirrors smsCarriesPhone in the send path: a text without the
            // program's number is replaced by the standard text that has it.
            const want = (navigator.pick?.contactPhone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
            const missing = !!sms.trim() && want.length >= 3 && !sms.replace(/\D/g, "").includes(want);
            return missing ? (
              <p className="text-[11px] text-amber-800">
                This text has no phone number for the program, so the standard text will go instead:
                &ldquo;For {navigator.pick?.shortName}, call {navigator.pick?.contactPhone}. What to say and what to have ready: [plan link]&rdquo;. Add the number here to send your own wording.
              </p>
            ) : null;
          })()}
          <p className="text-right text-[10px] tabular-nums text-amber-700/60">{sms.length} chars</p>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-amber-700/60">
          No text message will go out: this family hasn&apos;t consented to texts.
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => {
            const scheduledNote = navigator.scheduled_at ? " This replaces the scheduled send." : "";
            const channelCopy = hasEmail && textable
              ? "email and first-step text"
              : hasEmail
                ? "email"
                : "first-step text";
            const quietHoursNote = !hasEmail && textable
              ? " Outside the family’s texting hours, it will stay pending and send in their next window."
              : "";
            if (!window.confirm(`Send this ${channelCopy} to ${familyLabel}? It goes out under your name.${hasEmail ? " Email replies land in the support inbox." : ""}${quietHoursNote}${scheduledNote}`)) {
              return;
            }
            // The packet says this letter should not go as written. Ask a
            // second time, naming the reason, and only then override. The
            // server refuses without this flag, so a stray click cannot send.
            const blocked = navigator.packet?.route;
            let override = false;
            if (blocked === "recompose" || blocked === "ask") {
              const reason = holdLabel(navigator.packet?.holds[0] ?? "");
              const caveat = !!navigator.packet && isCaveatPacket(navigator.packet);
              const rewrite = !!navigator.packet && isRewritePacket(navigator.packet);
              override = window.confirm(
                rewrite
                  ? `This letter tells the family they said they need something they never told us (their need was inferred from the program page). It is waiting for an automatic re-draft of the same program.\n\nSend the current version anyway?`
                  : caveat
                  ? `This letter is waiting for an automatic rewrite that keeps ${navigator.pick?.shortName ?? "their program"} and adds its condition${navigator.packet?.recomposeTarget ? ` plus ${navigator.packet.recomposeTarget.name} as the other call` : ""}.\n\nSend the current version anyway?`
                  : blocked === "recompose"
                  ? `This letter's program was ruled out.\n\n${reason}\n\nSend it anyway?`
                  : `We do not know enough about this family to pick a program for them.\n\n${reason}\n\nSend it anyway?`,
              );
              if (!override) return;
            }
            onNavigator("navigator_send", subject, letter, sms.trim() || undefined, undefined, undefined, override);
          }}
          disabled={busy || letter.trim().length < 40}
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Send as TJ
        </button>
        <button
          onClick={saveDraft}
          disabled={busy || saveState === "saving" || letter.trim().length < 40}
          title="Saves your edits so they survive closing this row or refreshing. Nothing is sent."
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40"
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save draft"}
        </button>
        <button
          onClick={() => {
            const scheduleNote = navigator.scheduled_at ? " This also cancels the scheduled send." : "";
            if (window.confirm(`Dismiss this draft? The family will not get this first-step guidance unless you contact them another way.${scheduleNote}`)) {
              onNavigator("navigator_dismiss");
            }
          }}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40"
        >
          Dismiss
        </button>
        <button
          onClick={() => {
            const recomposeNote = navigator.scheduled_at ? " This also cancels the scheduled send." : "";
            // The same button does two different jobs, so it has to say which.
            // On a `recompose` verdict the current program is excluded and the
            // letter comes back about something else entirely; otherwise it is
            // the fact-check loop and the program stays put.
            const caveat = !!navigator.packet && isCaveatPacket(navigator.packet);
            const rewrite = !!navigator.packet && isRewritePacket(navigator.packet);
            const ruledOut = navigator.packet?.route === "recompose" && !caveat && !rewrite;
            const prompt = caveat
              ? `Re-draft this letter keeping ${navigator.pick?.shortName ?? "their program"}, and add the condition the checks flagged${navigator.packet?.recomposeTarget ? ` with ${navigator.packet.recomposeTarget.name} as the better first call if it does not fit` : ""}? Your edits to this draft, including saved edits, will be discarded.${recomposeNote}`
              : ruledOut
              ? `The verdict ruled out ${navigator.pick?.shortName ?? "this program"} for this family, so re-drafting will pick a DIFFERENT program. Your edits to this draft, including saved edits, will be discarded.${recomposeNote}`
              : `Re-draft this letter from current program data? Same program, today's facts. Your edits to this draft, including saved edits, will be discarded.${recomposeNote}`;
            if (window.confirm(prompt)) {
              onNavigator("navigator_recompose");
            }
          }}
          disabled={busy}
          title="Re-drafts the letter. After a `recompose` verdict it excludes the ruled-out program and picks another; otherwise it re-drafts the same program against today's data, so corrected phone numbers and figures don't need hand-editing"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40"
        >
          {busy ? "Working…" : "Recompose"}
        </button>
        <p className="text-[11px] text-amber-700/70">
          {hasEmail && textable
            ? "Sends the email and first-step text now."
            : hasEmail
              ? "Sends the email now."
              : "Sends in the family’s current texting window, or schedules the next one."}
        </p>
        {saveState === "error" && (
          <span className="text-[11px] font-medium text-red-600">Couldn&apos;t save. Try again.</span>
        )}
      </div>
      {/* Schedule: park the guidance for the hourly scheduler cron. Scheduling
          saves the on-screen edits atomically — what fires is what you see. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200/60 pt-3">
        {navigator.scheduled_at ? (
          <>
            <span className="text-[12px] font-medium text-blue-800">
              ⏱ Scheduled for {formatEt(navigator.scheduled_at)}
            </span>
            <button
              onClick={() => onNavigator("navigator_unschedule")}
              disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40"
            >
              Cancel schedule
            </button>
            <p className="basis-full text-[11px] text-amber-700/60">
              Sends automatically within the hour of that time (US Eastern). Sending caps are
              re-checked at fire time; a blocked send shows up here.
            </p>
          </>
        ) : (
          <>
            <input
              type="datetime-local"
              value={scheduleAt}
              min={scheduleMin()}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            <span className="text-[11px] font-semibold text-amber-700">US Eastern</span>
            <button
              onClick={scheduleSend}
              disabled={busy || scheduleState === "working" || !scheduleAt || letter.trim().length < 40}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40"
            >
              {scheduleState === "working" ? "Scheduling…" : "Schedule send"}
            </button>
            <p className="basis-full text-[11px] text-amber-700/60">
              Time is US Eastern, wherever you are. Saves your edits and sends automatically
              within an hour of the chosen time
              {hasEmail && textable
                ? ", with email and first-step text (text held to daytime hours)"
                : textable
                  ? ", as a first-step text held to daytime hours"
                  : ", by email"}.
            </p>
          </>
        )}
        {navigator.schedule_failed_reason && (
          <p className="basis-full text-[11px] font-medium text-red-600">
            Last scheduled send was blocked: {navigator.schedule_failed_reason}. Reschedule or
            send manually.
          </p>
        )}
      </div>
      {/* Test send: the exact email in a reviewer's inbox. Consumes nothing —
          no stamps, no text, no cap slot; the draft stays pending. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200/60 pt-3">
        <input
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="Test inbox (blank = your admin email)"
          className="w-64 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        />
        <button
          onClick={sendTest}
          disabled={busy || testState === "sending" || letter.trim().length < 40}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40"
        >
          {testState === "sending" ? "Sending…" : "Email me a test"}
        </button>
        <button
          onClick={copyReviewPrompt}
          title="Copies a fact-check prompt for this letter (with your edits) — paste into ChatGPT or Perplexity to verify the phone number, program facts, and fit"
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
        >
          {copyState === "copied" ? "Copied ✓" : "Copy AI review prompt"}
        </button>
        {copyState === "error" && (
          <span className="text-[12px] font-medium text-red-600">Copy failed — try again.</span>
        )}
        {testState === "sent" && (
          <span className="text-[12px] font-medium text-emerald-700">Test sent ✓ check your inbox</span>
        )}
        <p className="basis-full text-[11px] text-amber-700/60">
          Sends this letter (with your edits) as a real email to the test inbox. Nothing is
          recorded, no text goes out, and the draft stays here.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  detailTone,
}: {
  label: string;
  value: string | number;
  detail: string;
  detailTone?: "up" | "down" | "flat";
}) {
  const toneClass =
    detailTone === "up" ? "text-emerald-600" : detailTone === "down" ? "text-amber-600" : "text-gray-400";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 font-serif mt-1">{value}</p>
      <p className={`text-xs mt-1 ${toneClass}`}>{detail}</p>
    </div>
  );
}

function BreakdownCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BreakdownRow({ label, count, total }: { label: React.ReactNode; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700 flex-1 truncate">{label}</span>
      <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
        <div className="h-full bg-gray-300 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right shrink-0">{count}</span>
    </div>
  );
}

/** Route chip colours. One saturated element per row; the route IS the state. */
const ROUTE_CHIP: Record<PacketRoute, string> = {
  ask: "bg-violet-100 text-violet-800",
  recompose: "bg-rose-100 text-rose-800",
  review: "bg-amber-100 text-amber-800",
  auto: "bg-emerald-100 text-emerald-800",
};

const LIFECYCLE_CHIP: Record<LifecycleStatus, { label: string; className: string }> = {
  needs_help: { label: "Needs help", className: "bg-amber-100 text-amber-800" },
  stalled: { label: "Stalled", className: "bg-rose-50 text-rose-700" },
  acting: { label: "Acting", className: "bg-emerald-50 text-emerald-700" },
  returned: { label: "Returned", className: "bg-blue-50 text-blue-700" },
  working: { label: "Working", className: "bg-indigo-50 text-indigo-700" },
  resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-800" },
  new: { label: "New", className: "bg-gray-900 text-white" },
  in_cascade: { label: "In cascade", className: "bg-gray-100 text-gray-500" },
};

function LifecycleChip({
  lifecycle,
  noteCount,
}: {
  lifecycle: FamilyRow["lifecycle"];
  noteCount: number;
}) {
  const chip = LIFECYCLE_CHIP[lifecycle.status] ?? LIFECYCLE_CHIP.in_cascade;
  return (
    <div>
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${chip.className}`}>
        {chip.label}
      </span>
      {(lifecycle.detail || noteCount > 0) && (
        <p className="text-[11px] text-gray-400 mt-1 max-w-[160px]">
          {[lifecycle.detail, noteCount > 0 ? `${noteCount} note${noteCount === 1 ? "" : "s"}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

const BENEFITS_PROGRESS_CHIP: Record<
  BenefitsApplicationStatus,
  { label: string; className: string }
> = {
  called: { label: "Called", className: "bg-cyan-50 text-cyan-800" },
  no_answer: { label: "No answer", className: "bg-rose-50 text-rose-700" },
  needs_docs: { label: "Needs documents", className: "bg-indigo-50 text-indigo-700" },
  applied: { label: "Applied", className: "bg-emerald-100 text-emerald-800" },
  waiting: { label: "Waiting on agency", className: "bg-blue-50 text-blue-700" },
  not_eligible: { label: "Not eligible", className: "bg-slate-100 text-slate-700" },
  stuck: { label: "Asked for help", className: "bg-amber-100 text-amber-800" },
};

function BenefitsProgressChip({
  status,
  at,
  reply,
}: {
  status: BenefitsApplicationStatus;
  at: string | null;
  reply: string | null;
}) {
  const chip = BENEFITS_PROGRESS_CHIP[status];
  const title = [at ? formatEt(at) : null, reply ? `Reply: ${reply}` : null]
    .filter(Boolean)
    .join(" — ");
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${chip.className}`}
      title={title || "Family-reported benefits progress"}
    >
      {chip.label}
    </span>
  );
}

const TIMELINE_ICON: Record<string, string> = {
  intake: "●",
  enriched: "✚",
  email: "✉",
  email_open: "👁",
  email_click: "↗",
  sms: "✆",
  sms_in: "💬",
  viewed: "👁",
  acted: "✓",
  docs: "☑",
  outcome: "✦",
  note: "✎",
  case: "★",
  navigator: "✍",
};

function CasePanel({
  timeline,
  caseInfo,
  automationHold,
  signals,
  reach,
  situationComplete,
  noteText,
  setNoteText,
  busy,
  error,
  navigator,
  reviewContext,
  familyLabel,
  hasEmail,
  onNavigator,
  onAction,
  onDelete,
}: {
  timeline: TimelineEvent[] | "loading" | "error" | undefined;
  caseInfo: FamilyRow["caseInfo"];
  automationHold: FamilyRow["automationHold"];
  signals: FamilyRow["signals"];
  reach: FamilyRow["reach"];
  situationComplete: boolean;
  noteText: string;
  setNoteText: (v: string) => void;
  busy: boolean;
  error: string | null;
  navigator: NavigatorDetail | null | undefined;
  reviewContext: Omit<ReviewItem, "draft" | "pick">;
  familyLabel: string;
  hasEmail: boolean;
  onNavigator: (
    action: "navigator_send" | "navigator_dismiss" | "navigator_test" | "navigator_recompose" | "navigator_save" | "navigator_schedule" | "navigator_unschedule" | "navigator_build_packet",
    subject?: string,
    letter?: string,
    sms?: string,
    testEmail?: string,
    scheduledAt?: string,
    overridePacket?: boolean,
  ) => Promise<boolean>;
  onAction: (action: string, text?: string) => void;
  onDelete: () => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {navigator?.status === "pending" && navigator.body && (
        <NavigatorDraftEditor
          key={navigator.composed_at}
          navigator={navigator}
          reviewContext={reviewContext}
          familyLabel={familyLabel}
          hasEmail={hasEmail}
          textable={reach.textable}
          busy={busy}
          onNavigator={onNavigator}
        />
      )}
      {automationHold && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="min-w-0 flex-1">
            {automationHold.reason === "deceased"
              ? "Their reply suggests someone in the family died. Automated messages and nudges are off. Write back personally."
              : automationHold.reason === "sms_opt_out"
                ? "They texted STOP. Texts are off by law, and the automated letter and check-in emails are paused with them. Resume only if they asked to keep getting email."
                : `They replied by ${automationHold.channel === "email" ? "email" : "text"}, so the check-in, scheduled sends and automatic sends are paused.`}
            {automationHold.excerpt && <span className="block text-[12px] text-amber-800/80">&ldquo;{automationHold.excerpt}&rdquo;</span>}
          </span>
          <button
            onClick={() => onAction("hold_clear")}
            disabled={busy}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 disabled:opacity-40"
            title={
              automationHold.reason === "deceased" || automationHold.reason === "sms_opt_out"
                ? "Only this button resumes it after a death report or a STOP"
                : "Logging a contact or resolving the case also resumes it"
            }
          >
            Resume automation
          </button>
        </div>
      )}
      {caseInfo.help && (
        <p className={`mb-3 text-sm ${caseInfo.help.overdue ? "text-red-700" : "text-rose-700"}`}>
          Asked for a person. Owner {caseInfo.help.owner ?? "unassigned"}
          {caseInfo.help.dueAt ? `, due ${formatEt(caseInfo.help.dueAt)}` : ""}
          {caseInfo.help.overdue ? " (overdue)" : ""}. Log &ldquo;I contacted them&rdquo; once you reach them.
        </p>
      )}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Case timeline</p>
        <div className="flex gap-1">
          <SignalChip active={signals.emailOpened} label="Opened" />
          <SignalChip active={signals.emailClicked} label="Clicked" />
          <SignalChip active={signals.resultsViewed} label="Viewed" />
          <SignalChip active={signals.enriched} label="Enriched" />
          <SignalChip active={situationComplete} label="Full picture" />
          <SignalChip active={reach.textable} label="Textable" />
        </div>
      </div>
      {timeline === "loading" || timeline === undefined ? (
        <p className="text-sm text-gray-400 py-2">Loading timeline…</p>
      ) : timeline === "error" ? (
        <p className="text-sm text-red-600 py-2">Couldn&apos;t load the timeline. Collapse and reopen to retry.</p>
      ) : timeline.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No recorded touches yet.</p>
      ) : (
        <ol className="space-y-1.5 mb-4">
          {timeline.map((e, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="w-9 shrink-0 text-right text-[11px] text-gray-400 pt-0.5">
                {new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="w-4 shrink-0 text-center text-gray-400">{TIMELINE_ICON[e.kind] || "·"}</span>
              <span className="min-w-0">
                <span className="text-gray-800">{e.label}</span>
                {e.detail && <span className="block text-[12px] text-gray-400">{e.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a case note…"
          className="flex-1 min-w-[220px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
        <button
          onClick={() => noteText.trim() && onAction("note", noteText.trim())}
          disabled={busy || !noteText.trim()}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Save note
        </button>
        {caseInfo.resolvedAt ? (
          <button onClick={() => onAction("reopen")} disabled={busy} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40">
            Reopen case
          </button>
        ) : (
          <>
            <button onClick={() => onAction("contacted")} disabled={busy} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40">
              I contacted them
            </button>
            <button onClick={() => onAction("resolved")} disabled={busy} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-40">
              Mark resolved
            </button>
          </>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          onClick={onDelete}
          disabled={busy}
          className="ml-auto rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          Delete family
        </button>
      </div>
    </div>
  );
}

function SignalChip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-300"
      }`}
    >
      {label}
    </span>
  );
}

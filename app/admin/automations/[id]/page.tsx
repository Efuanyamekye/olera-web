"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import EmailStatusPill from "@/components/admin/EmailStatusPill";
import { useToast } from "@/components/admin/Toast";
import { bucketForEmailType } from "@/lib/analytics/provider-email-funnels";

interface Rollup {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}
interface VariantRow extends Rollup {
  key: string;
  label: string;
  // weekly_digest only: rank-led vs plain split
  split?: { withRank: Rollup; plain: Rollup };
  // Downstream conversion (share of delivered sends whose provider took the variant's goal action
  // within 14 days). converted = count, convRate = converted/delivered, convLabel = the action.
  converted?: number;
  convRate?: number;
  convEvent?: string;
  convLabel?: string;
}
interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  summary: Record<string, unknown> | null;
  error: string | null;
  triggered_by: string;
}
interface SamplePreviewType {
  id: string;
  label: string;
  subject: string;
  emailType: string;
}
interface DetailResponse {
  job: {
    id: string;
    name: string;
    description: string;
    recipientCohort: string;
    audience: string;
    fn: string;
    schedule: string;
    humanSchedule: string;
    path: string;
    emailTypes: string[];
    successSignal: string | null;
    relatedAdminPath: string | null;
    isEmail: boolean;
  };
  paused: boolean;
  pause: { reason: string | null; by: string | null; at: string | null; until: string | null } | null;
  rollup30d: Rollup | null;
  trend: Array<{ week: string; sent: number; delivered: number; opened: number; clicked: number }>;
  variants: VariantRow[];
  previewTypes: string[];
  samplePreviewTypes: SamplePreviewType[];
  runs: RunRow[];
  windowDays: number;
}
interface PreviewResponse {
  type?: string;
  html: string;
  recipient?: string;
  subject: string;
  sentAt?: string;
  metadata?: Record<string, unknown> | null;
  from?: string;
  preheader?: string | null;
  // Variant-sample mode (digest): synthetic sample rendered from the template, no real recipient.
  variant?: string;
  sample?: boolean;
}

// The weekly digest's distinct email looks, for the sample preview picker.
const DIGEST_SAMPLES: { key: string; label: string }[] = [
  { key: "family_question", label: "Family question" },
  { key: "leads", label: "Leads recap" },
  // Registry-backed (lib/email-samples.ts) rather than the legacy switch below it:
  // the key must equal the EMAIL_VARIANTS id so the preview route's getVariant()
  // fallback resolves it.
  { key: "provider_find_families", label: "Find Families" },
  { key: "managed_ads", label: "Managed ads" },
  { key: "referral_teaser", label: "Referral teaser" },
  { key: "weekly_digest_rank", label: "Market rank digest" },
  { key: "weekly_digest_plain", label: "Weekly digest · plain" },
  { key: "completion", label: "Completion nudge" },
  { key: "cold_rank", label: "Cold rank note" },
];

// What triggers each variant — shown in the breakdown table via a hover/tap tooltip.
const VARIANT_TRIGGERS: Record<string, string> = {
  family_question: "Goes to providers with an open, unanswered family question. Leads with the question and a one-click answer link.",
  leads: "Goes to providers who received one or more new family inquiries this week. A weekly recap that nudges them to respond, with a one-click link to their connections inbox. Outranks every variant except an open question — a lead is the hottest weekly signal.",
  find_families: "Goes to providers with published care seekers within 50 miles who have no open question and no new lead. Leads with the nearest family's town, care need, and timing, plus a one-click link to /provider/matches. Converts when they reach out to a family.",
  managed_ads: "Goes to the no-leads cohort (no open question, no new lead, not a cold first-contact). Leads with the managed-ads pitch — the one lever that generates demand for an empty local funnel — with a one-click link to /provider/boost. Rotated ~1 in 3 weeks so it yields to the market read / completion nudge. Converts when they view the managed-ads page.",
  referral_teaser: "Goes to providers with a computed market and usable referral targets when there is no hotter lead/question/completion nudge. Leads with curiosity about nearby referral sources instead of asking them to work the call sheet immediately. Converts when they work a referral target in Growth.",
  market_rank: "Goes to active providers whose local market rank has been computed and who do not have a hotter lead/question/completion nudge. Converts when they work a referral target in Growth.",
  weekly_digest: "Goes to providers active in the last 14 days — page views or clicks. Providers with a new lead or an open question get the Leads recap / Family question variant instead.",
  completion: "Goes to claimed providers with an incomplete profile (e.g. no owner story). Nudges them to finish it with a one-click deep link to the editor.",
  cold_rank: "Goes to top-5-ranked agencies in a computed market with no recent activity who haven't claimed their listing — a cold first-contact.",
};
const SPLIT_TRIGGERS: Record<string, string> = {
  withRank: "When we've computed their local market, the digest opens with where they rank.",
  plain: "When their market isn't computed yet, it's the plain weekly recap.",
};

type RecipientStatus = "all" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "undelivered";
interface RecipientRow {
  id: string;
  recipient: string;
  recipient_type: string | null;
  provider_id: string | null;
  subject: string;
  email_type: string;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
}
interface RecipientsResponse {
  run: { id: string; started_at: string; finished_at: string | null; status: string; summary: Record<string, unknown> | null; triggered_by: string } | null;
  rollup: Rollup;
  columnMissing: boolean;
  pageSize: number;
  page: number;
  status: string;
  total: number;
  recipients: RecipientRow[];
  note: string | null;
}

const RECIPIENT_FILTERS: { key: RecipientStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
  { key: "bounced", label: "Bounced" },
  { key: "complained", label: "Complained" },
  { key: "undelivered", label: "Not delivered" },
];

type Tab = "overview" | "recipients" | "runs";

// ── small render helpers ──────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function duration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function pct(n: number, of: number): string {
  return of <= 0 ? "—" : `${Math.round((n / of) * 100)}%`;
}
// ── Next-run forecast (display-only; derived entirely from data already loaded — no backend) ──
// Parse one cron field into the set of allowed values, or null for `*` (matches anything).
// Supports `*`, lists (`1,2,3`), steps (`*/6`, `a/n`), and ranges (`a-b`) — the forms used in vercel.json.
function parseCronField(field: string, min: number, max: number): Set<number> | null {
  if (field === "*") return null;
  const out = new Set<number>();
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10) || 1;
      let lo = min, hi = max;
      if (range !== "*") {
        if (range.includes("-")) { const [a, b] = range.split("-"); lo = parseInt(a, 10); hi = parseInt(b, 10); }
        else { lo = parseInt(range, 10); }
      }
      for (let v = lo; v <= hi; v += step) out.add(v);
    } else if (part.includes("-")) {
      const [a, b] = part.split("-"); for (let v = parseInt(a, 10); v <= parseInt(b, 10); v++) out.add(v);
    } else {
      out.add(parseInt(part, 10));
    }
  }
  return out;
}
/** Next UTC fire time for a 5-field cron, found by forward iteration (capped at 8 days). UTC-based. */
function nextCronRun(schedule: string, from: Date): Date | null {
  const f = schedule.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const min = parseCronField(f[0], 0, 59), hour = parseCronField(f[1], 0, 23);
  const dom = parseCronField(f[2], 1, 31), mon = parseCronField(f[3], 1, 12), dow = parseCronField(f[4], 0, 6);
  const t = new Date(from.getTime());
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);
  for (let i = 0; i < 216_000; i++) { // up to ~150 days — covers the quarterly cron; null beyond
    const okDom = !dom || dom.has(t.getUTCDate()), okDow = !dow || dow.has(t.getUTCDay());
    // Standard cron: when BOTH day-of-month and day-of-week are restricted, a match on either fires.
    const okDay = dom && dow ? okDom || okDow : okDom && okDow;
    if ((!min || min.has(t.getUTCMinutes())) && (!hour || hour.has(t.getUTCHours())) && (!mon || mon.has(t.getUTCMonth() + 1)) && okDay) {
      return new Date(t.getTime());
    }
    t.setUTCMinutes(t.getUTCMinutes() + 1);
  }
  return null;
}
/**
 * Rough forecast for the next run: when it fires, ~how many it'll send, ~how long it takes.
 * Sends/duration are the trailing average of recent post-cadence runs (those carrying a numeric
 * `dayBucket` in their summary — set once the digest moved to per-weekday cadence), which is current
 * (a fresh run lands every weekday) and free (already-loaded data). Cold-start: if no weekday run
 * exists yet, bootstrap sends from the last run's count ÷ 5. Returns null if the schedule can't parse.
 */
function nextRunForecast(schedule: string, runs: RunRow[]): { rel: string; clock: string; sends: number | null; durMin: number | null } | null {
  const next = nextCronRun(schedule, new Date());
  if (!next) return null;
  const hrs = (next.getTime() - Date.now()) / 3_600_000;
  const rel = hrs < 1 ? "soon" : hrs < 24 ? `in ${Math.round(hrs)}h` : `in ${Math.round(hrs / 24)}d`;
  const clock = next.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET";
  const recent = runs.filter((r) => typeof r.summary?.dayBucket === "number" && r.status !== "error").slice(0, 3);
  let sends: number | null = null;
  if (recent.length > 0) {
    sends = Math.round(recent.reduce((a, r) => a + (Number(r.summary?.sent) || 0), 0) / recent.length);
  } else {
    const last = runs.find((r) => typeof r.summary?.sent === "number");
    if (last) sends = Math.round((Number(last.summary?.sent) || 0) / 5); // bootstrap from pre-cadence run
  }
  const durRuns = recent.filter((r) => r.finished_at);
  const durMin = durRuns.length > 0
    ? Math.max(1, Math.round(durRuns.reduce((a, r) => a + (new Date(r.finished_at as string).getTime() - new Date(r.started_at).getTime()) / 60_000, 0) / durRuns.length))
    : null;
  return { rel, clock, sends, durMin };
}
/** Readable one-liner for a run's result — sends/skips first, noise (skipReasons) goes to the title. */
function runResult(s: Record<string, unknown> | null): string {
  if (!s) return "";
  const parts: string[] = [];
  if (typeof s.sent === "number") parts.push(`${s.sent.toLocaleString()} sent`);
  if (typeof s.skipped === "number" && s.skipped > 0) parts.push(`${s.skipped.toLocaleString()} skipped`);
  if (parts.length === 0 && typeof s.processed === "number") parts.push(`${s.processed.toLocaleString()} processed`);
  if (s.dry_run === true) parts.push("dry run");
  if (s.reason) parts.push(String(s.reason));
  return parts.join(" · ");
}
function skipReasonsText(s: Record<string, unknown> | null): string {
  if (!s || !s.skipReasons || typeof s.skipReasons !== "object") return "";
  return Object.entries(s.skipReasons as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join("\n");
}
function runDotCls(status: string): string {
  if (status === "error") return "bg-red-500";
  if (status === "skipped_paused") return "bg-amber-400";
  if (status === "running") return "bg-blue-500";
  return "bg-emerald-500";
}
function runOptionLabel(r: { started_at: string; status: string; summary: Record<string, unknown> | null }): string {
  const rawSent = r.summary?.sent;
  const sent = typeof rawSent === "number" ? rawSent : null;
  const when = new Date(r.started_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${when}${sent != null ? ` · ${sent.toLocaleString()} sent` : ` · ${r.status}`}`;
}

/** Small info dot with a tooltip (hover on desktop, tap to toggle on touch). Used to explain variant triggers. */
function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label="What triggers this variant"
        className="inline-flex text-gray-300 transition-colors hover:text-gray-500"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7 4.75a1 1 0 112 0 1 1 0 01-2 0zM6.75 7h1.5a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0V8.5h-.75a.75.75 0 010-1.5z" /></svg>
      </button>
      <span role="tooltip" className={`pointer-events-none absolute left-0 top-full z-30 mt-1 w-60 rounded-lg bg-gray-900 px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        {text}
      </span>
    </span>
  );
}

function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  if (!values || values.length < 2) return null;
  const w = 56, h = 18;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 1 - ((v - min) / range) * (h - 2)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ value, label, sub, danger, muted, children }: { value: ReactNode; label: string; sub?: string; danger?: boolean; muted?: boolean; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums leading-none ${danger ? "text-red-600" : muted ? "text-gray-300" : "text-gray-900"}`}>{value}</div>
      <div className="mt-1.5 text-xs text-gray-500">
        {label}
        {sub && <span className="text-gray-400"> · {sub}</span>}
      </div>
      {children && <div className="mt-1.5 text-gray-300">{children}</div>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-64 rounded bg-gray-100" />
      <div className="h-4 w-96 rounded bg-gray-100" />
      <div className="h-4 w-80 rounded bg-gray-100" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-100" />)}
      </div>
      <div className="h-72 rounded-xl bg-gray-100" />
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────

export default function AutomationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  // Next-run forecast — computed once per data load (the cron scan can be long for infrequent jobs).
  const forecast = useMemo(() => (data ? nextRunForecast(data.job.schedule, data.runs) : null), [data]);
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | "loading" | "none" | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [recipientStatus, setRecipientStatus] = useState<RecipientStatus>("all");
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipients, setRecipients] = useState<RecipientsResponse | "loading" | "error" | null>(null);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [windowDays, setWindowDays] = useState(30);
  const reqSeq = useRef(0);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!id) return;
    // Don't flip to the full-page loading state on window-change refetches — keep the current
    // numbers visible and let them update in place. The initial useState(true) covers first load.
    setErr(null);
    const reqId = ++reqSeq.current;
    try {
      const r = await fetch(`/api/admin/automations/${id}?days=${windowDays}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d: DetailResponse = await r.json();
      if (reqId !== reqSeq.current) return; // a newer window selection superseded this fetch
      setData(d);
      const isDigestJob = d.job.id === "weekly-provider-digest";
      setPreviewType((prev) => prev ?? (isDigestJob ? DIGEST_SAMPLES[0].key : (d.samplePreviewTypes[0]?.id ?? d.previewTypes[0] ?? null)));
      const bestRun = d.runs.find((rr) => { const s = rr.summary?.sent; return typeof s === "number" && s > 0; }) ?? d.runs[0] ?? null;
      setSelectedRun((prev) => prev ?? bestRun?.id ?? null);
    } catch (e) {
      if (reqId === reqSeq.current) setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, windowDays]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!id || !previewType) return;
    setPreview("loading");
    let cancelled = false;
    // Sample keys fetch a rendered fixture; other values fetch the latest real email.
    const isSample =
      DIGEST_SAMPLES.some((s) => s.key === previewType) ||
      data?.samplePreviewTypes.some((s) => s.id === previewType);
    const qs = isSample ? `variant=${encodeURIComponent(previewType)}` : `type=${encodeURIComponent(previewType)}`;
    fetch(`/api/admin/automations/${id}/preview?${qs}`)
      .then((r) => (r.ok ? r.json() : r.status === 404 ? Promise.resolve("none") : Promise.reject(new Error())))
      .then((d) => { if (!cancelled) setPreview(d === "none" ? "none" : (d as PreviewResponse)); })
      .catch(() => { if (!cancelled) setPreview("none"); });
    return () => { cancelled = true; };
  }, [id, previewType, data?.samplePreviewTypes]);

  useEffect(() => {
    if (!id || !selectedRun) { setRecipients(null); return; }
    setRecipients("loading");
    const p = new URLSearchParams({ run: selectedRun, status: recipientStatus, page: String(recipientPage) });
    let cancelled = false;
    fetch(`/api/admin/automations/${id}/recipients?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) setRecipients(d as RecipientsResponse); })
      .catch(() => { if (!cancelled) setRecipients("error"); });
    return () => { cancelled = true; };
  }, [id, selectedRun, recipientStatus, recipientPage]);

  async function togglePause() {
    if (!data) return;
    const job = data.job;
    if (data.paused) {
      if (!confirm(`Resume "${job.name}"?`)) return;
      setBusy(true);
      try {
        const r = await fetch("/api/admin/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: job.id, action: "resume" }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        await load();
      } catch (e) {
        toast(`Failed: ${e instanceof Error ? e.message : e}`, { variant: "error" });
      } finally { setBusy(false); }
    } else {
      const reason = prompt(`Pause "${job.name}"? It stops running but still logs a skipped entry each cycle; auto-resumes in 30 days.\n\nReason (optional):`);
      if (reason === null) return;
      setBusy(true);
      try {
        const r = await fetch("/api/admin/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: job.id, action: "pause", reason, days: 30 }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        await load();
      } catch (e) {
        toast(`Failed: ${e instanceof Error ? e.message : e}`, { variant: "error" });
      } finally { setBusy(false); }
    }
  }

  // adjacent-run navigation for the recipients run picker
  function stepRun(dir: -1 | 1) {
    if (!data || !selectedRun) return;
    const i = data.runs.findIndex((r) => r.id === selectedRun);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= data.runs.length) return;
    setSelectedRun(data.runs[j].id);
    setRecipientPage(1);
    setRecipientStatus("all");
  }

  const ghostBtn = "rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50";
  const canPause = data?.job.path.startsWith("/api/cron/") ?? false;

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href="/admin/automations" className="inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-700">
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7.5 2.5l-4 3.5 4 3.5" /></svg>
          Automations
        </Link>
      </div>

      {loading && !data && <Skeleton />}
      {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}

      {data && (
        <>
          {/* ── header ── */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{data.job.name}</h1>
                {data.job.fn === "event" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-200"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" />Event monitor</span>
                ) : data.paused ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Paused</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-gray-500">
                <span>{data.job.audience}</span>
                <span className="text-gray-300">·</span>
                <span className="rounded-md bg-gray-100/70 px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-gray-200/60">{data.job.fn}</span>
                <span className="text-gray-300">·</span>
                {/* Keep the meta line scannable — just the cadence; the verbose schedule lives in Details. */}
                <span>{data.job.humanSchedule.split(",")[0]}</span>
              </div>
              {!data.paused && forecast && (() => {
                const f = forecast;
                return (
                  <div className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-gray-50/80 px-3 py-2 ring-1 ring-inset ring-gray-100">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Next run</span>
                    <span className="text-sm text-gray-600">{f.rel}</span>
                    <span className="text-xs text-gray-400">{f.clock}</span>
                    {f.sends != null && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="flex items-baseline gap-1"><span className="text-base font-semibold text-teal-700">~{f.sends.toLocaleString()}</span><span className="text-xs text-gray-400">sends</span></span>
                      </>
                    )}
                    {f.durMin != null && (<><span className="text-gray-300">·</span><span className="text-xs text-gray-400">~{f.durMin} min</span></>)}
                  </div>
                );
              })()}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {data.job.relatedAdminPath && <Link href={data.job.relatedAdminPath} className={ghostBtn}>Related queue →</Link>}
              {canPause && (
                <button disabled={busy} onClick={togglePause} className={`${ghostBtn} ${data.paused ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : ""}`}>
                  {busy ? "…" : data.paused ? "Resume" : "Pause"}
                </button>
              )}
            </div>
          </div>

          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-gray-400">{data.job.description}</p>

          {data.paused && data.pause && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">
              Paused {timeAgo(data.pause.at)} by {data.pause.by ?? "—"}{data.pause.reason ? ` — "${data.pause.reason}"` : ""}{data.pause.until ? ` · auto-resumes ${new Date(data.pause.until).toLocaleDateString()}` : ""}
            </div>
          )}

          {/* Details expander */}
          <details className="group mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600 [&::-webkit-details-marker]:hidden">
              <svg viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 2.5l4 3.5-4 3.5" /></svg>
              Details
            </summary>
            <div className="mt-2 space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-3 text-sm">
              <div className="text-gray-600"><span className="text-gray-400">Who gets it</span><br />{data.job.recipientCohort}</div>
              {data.job.successSignal && <div className="text-gray-600"><span className="text-gray-400">Success signal</span><br />{data.job.successSignal}</div>}
              {data.job.emailTypes.length > 0 && (
                <div className="text-gray-600">
                  <span className="text-gray-400">Email types</span>{" "}
                  {data.job.emailTypes.map((t) => <Link key={t} href={`/admin/emails?type=${t}`} className="mr-2 text-teal-700 hover:underline">{t}</Link>)}
                </div>
              )}
              <div className="text-gray-600"><span className="text-gray-400">Schedule</span><br />{data.job.humanSchedule}</div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs text-gray-400">
                <span>Route <code className="text-gray-500">{data.job.path}</code></span>
                <span>Cron <code className="text-gray-500">{data.job.schedule}</code></span>
              </div>
            </div>
          </details>

          {/* ── tabs ── */}
          <div className="mt-6 flex items-center gap-1 border-b border-gray-200">
            {([["overview", "Overview", null], ["recipients", "Recipients", null], ["runs", "Runs", data.runs.length || null]] as [Tab, string, number | null][]).map(([key, label, count]) => (
              <button key={key} onClick={() => setTab(key)} className={`relative px-3 py-2 text-sm font-medium transition-colors ${tab === key ? "text-gray-900" : "text-gray-400 hover:text-gray-600"}`}>
                {label}{count != null && <span className="ml-1.5 text-xs text-gray-400">{count}</span>}
                {tab === key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gray-900" />}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="mt-5 space-y-6">
              {data.job.isEmail && (
                <div className="flex items-center justify-end">
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                    {[7, 30, 90].map((d) => (
                      <button
                        key={d}
                        onClick={() => setWindowDays(d)}
                        className={`rounded-md px-3 py-1 font-medium transition-colors ${windowDays === d ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"}`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data.rollup30d ? (
                <>
                  <div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      <StatCard value={data.rollup30d.sent.toLocaleString()} label="Sent" sub={`last ${data.windowDays} days`}>
                        {data.trend.length >= 2 && <Sparkline values={data.trend.map((w) => w.sent)} className="text-gray-300" />}
                      </StatCard>
                      <StatCard value={pct(data.rollup30d.delivered, data.rollup30d.sent)} label="Delivered" />
                      <StatCard value={pct(data.rollup30d.opened, data.rollup30d.sent)} label="Opened" />
                      <StatCard value={pct(data.rollup30d.clicked, data.rollup30d.sent)} label="Clicked" />
                      <StatCard value={data.rollup30d.bounced + data.rollup30d.complained} label={data.rollup30d.complained > 0 ? "Bounced / complained" : "Bounced"} danger={data.rollup30d.bounced + data.rollup30d.complained > 0} muted={data.rollup30d.bounced + data.rollup30d.complained === 0} />
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Open and click rates are inflated by Apple Mail Privacy Protection (it prefetches the tracking pixel and rewrites links) — the trend over time is the real signal.
                      {(() => {
                        // Cross-link to the Provider Comms Funnel on /admin/analytics
                        // pre-filtered to this automation's email-type bucket. If every
                        // emailType for this job lands in the same bucket, link to it;
                        // if they span multiple (or none map cleanly), link unfiltered.
                        if (!data.job.isEmail) return null;
                        const mapped = data.job.emailTypes
                          .map(bucketForEmailType)
                          .filter((b): b is NonNullable<ReturnType<typeof bucketForEmailType>> => b !== null);
                        if (mapped.length === 0) return null;
                        const unique = new Set(mapped);
                        const sole = unique.size === 1 ? mapped[0] : null;
                        const q = sole ? `?comms_filter=${sole}` : "";
                        return (
                          <>
                            {" "}
                            <Link href={`/admin/analytics${q}#providerCommsFunnel`} className="text-teal-700 hover:underline">See provider-action funnel →</Link>
                          </>
                        );
                      })()}
                    </p>
                  </div>

                  {data.variants && data.variants.length > 1 && (
                    <div className="mt-6">
                      {(() => {
                        const hasConversion = data.variants.some((v) => Boolean(v.convLabel));
                        const breakdownLabel = data.job.id === "weekly-provider-digest" ? "By variant" : "By email type";
                        return (
                          <>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{breakdownLabel} · last {data.windowDays} days</h3>
                      {/* No overflow-hidden here: the per-row trigger tooltips are absolutely positioned and must escape the wrapper. */}
                      <div className="rounded-xl border border-gray-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                              <th className="px-4 py-2 font-medium">{data.job.id === "weekly-provider-digest" ? "Variant" : "Email type"}</th>
                              <th className="px-4 py-2 text-right font-medium">Sent</th>
                              <th className="px-4 py-2 text-right font-medium">Delivered</th>
                              <th className="px-4 py-2 text-right font-medium">Opened</th>
                              <th className="px-4 py-2 text-right font-medium">Clicked</th>
                              {hasConversion && (
                              <th className="px-4 py-2 text-right font-medium">
                                <span className="inline-flex items-center">Converted<InfoDot text="Share of delivered emails where the provider took that variant's goal action (answered, opened a lead, worked the market, claimed, published, or re-visited the portal) within 14 days of the send — last-touch, so a single action is never double-counted across consecutive weekly sends. This is the honest signal: opens are inflated by Apple Mail's privacy proxy. Note: very recent sends may still be inside their 14-day window." /></span>
                              </th>
                              )}
                              <th className="px-4 py-2 text-right font-medium">Bounced</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.variants.map((v) => (
                              <Fragment key={v.key}>
                                <tr className={`border-b border-gray-100 ${v.sent === 0 ? "text-gray-300" : ""}`}>
                                  <td className={`px-4 py-2 font-medium ${v.sent === 0 ? "" : "text-gray-800"}`}>
                                    {v.label}
                                    {VARIANT_TRIGGERS[v.key] && <InfoDot text={VARIANT_TRIGGERS[v.key]} />}
                                    {v.sent === 0 && <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-gray-400">no sends yet</span>}
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">{v.sent.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right tabular-nums">{v.sent > 0 ? pct(v.delivered, v.sent) : "—"}</td>
                                  <td className="px-4 py-2 text-right tabular-nums">{v.sent > 0 ? pct(v.opened, v.sent) : "—"}</td>
                                  <td className="px-4 py-2 text-right tabular-nums">{v.sent > 0 ? pct(v.clicked, v.sent) : "—"}</td>
                                  {hasConversion && (
                                  <td className="px-4 py-2 text-right">
                                    {v.sent > 0 && v.delivered > 0 ? (
                                      <div className="leading-tight">
                                        <span className={`tabular-nums font-semibold ${(v.converted ?? 0) > 0 ? "text-emerald-700" : "text-gray-400"}`}>{pct(v.converted ?? 0, v.delivered)}</span>
                                        <span className="block text-[10px] font-normal text-gray-400">{(v.converted ?? 0).toLocaleString()} {(v.convLabel ?? "").toLowerCase()}</span>
                                      </div>
                                    ) : "—"}
                                  </td>
                                  )}
                                  <td className={`px-4 py-2 text-right tabular-nums ${v.bounced + v.complained > 0 ? "text-amber-600" : "text-gray-300"}`}>{v.sent > 0 ? (v.bounced + v.complained || "—") : "—"}</td>
                                </tr>
                                {v.split && (["withRank", "plain"] as const).map((sk) => {
                                  const s = v.split![sk];
                                  return (
                                    <tr key={`${v.key}-${sk}`} className="border-b border-gray-100 bg-gray-50/40 text-xs text-gray-400">
                                      <td className="py-1.5 pl-8 pr-4">{sk === "withRank" ? "↳ led with rank hero" : "↳ no rank hero"}<InfoDot text={SPLIT_TRIGGERS[sk]} /></td>
                                      <td className="px-4 py-1.5 text-right tabular-nums">{s.sent.toLocaleString()}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums">{s.sent > 0 ? pct(s.delivered, s.sent) : "—"}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums">{s.sent > 0 ? pct(s.opened, s.sent) : "—"}</td>
                                      <td className="px-4 py-1.5 text-right tabular-nums">{s.sent > 0 ? pct(s.clicked, s.sent) : "—"}</td>
                                      {hasConversion && (
                                      <td className="px-4 py-1.5 text-right text-gray-300">—</td>
                                      )}
                                      <td className="px-4 py-1.5 text-right tabular-nums text-gray-300">{s.sent > 0 ? (s.bounced + s.complained || "—") : "—"}</td>
                                    </tr>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-xs text-gray-400">
                        Open/click rates are % of sent.
                        {hasConversion ? " Converted is % of delivered who took the variant's goal action within 14 days. Variants are inferred from the email for sends before tagging was added." : " Rows are grouped by email_type so this monitor shows which lifecycle emails are actually going out."}
                      </p>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {data.trend.length >= 2 && (
                    <details className="group">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600 [&::-webkit-details-marker]:hidden">
                        <svg viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 2.5l4 3.5-4 3.5" /></svg>
                        Weekly breakdown
                      </summary>
                      <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-sm">
                          <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-400">
                            <tr><th className="px-4 py-2 text-left font-medium">Week of</th><th className="px-4 py-2 text-right font-medium">Sent</th><th className="px-4 py-2 text-right font-medium">Delivered</th><th className="px-4 py-2 text-right font-medium">Open</th><th className="px-4 py-2 text-right font-medium">Click</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {data.trend.map((w) => (
                              <tr key={w.week} className="text-gray-700 hover:bg-gray-50">
                                <td className="px-4 py-2">{new Date(w.week).toLocaleDateString()}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{w.sent.toLocaleString()}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{pct(w.delivered, w.sent)}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{pct(w.opened, w.sent)}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{pct(w.clicked, w.sent)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-400">
                  {data.job.isEmail ? "Sends email via a helper whose email_type isn't mapped in the registry yet — no rollup." : `${data.job.fn === "refresh" ? "Data refresh" : "Maintenance"} job — nothing to chart. See the Runs tab.`}
                </div>
              )}

              {/* Email preview — the digest shows a sample of each variant; other jobs show the latest real send */}
              {(() => {
                const isDigest = data.job.id === "weekly-provider-digest";
                const sampleTypes = isDigest
                  ? DIGEST_SAMPLES.map((s) => ({ id: s.key, label: s.label }))
                  : data.samplePreviewTypes.map((s) => ({ id: s.id, label: s.label }));
                if (sampleTypes.length === 0 && data.previewTypes.length === 0) return null;
                const sampleSel = sampleTypes.some((s) => s.id === previewType);
                const fullUrl = previewType
                  ? `/api/admin/automations/${id}/preview?${sampleSel ? `variant=${encodeURIComponent(previewType)}` : `type=${encodeURIComponent(previewType)}`}&raw=1`
                  : null;
                return (
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="font-medium text-gray-700">{sampleTypes.length > 0 ? "Email samples" : "Latest email"}</span>
                        {preview && typeof preview === "object" && (
                          <span className="truncate text-xs text-gray-400">
                            {preview.sample
                              ? <>sample &middot; &ldquo;{preview.subject}&rdquo;</>
                              : <>to <code className="text-gray-500">{preview.recipient}</code> &middot; &ldquo;{preview.subject}&rdquo;{preview.sentAt ? ` · ${timeAgo(preview.sentAt)}` : ""}</>}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {!isDigest && data.previewTypes.length > 1 && (
                          <select value={previewType ?? ""} onChange={(e) => { setPreviewType(e.target.value); setPreviewExpanded(false); }} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600">
                            {data.previewTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        )}
                        {fullUrl && <a href={fullUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-700 hover:underline">Open full ↗</a>}
                      </div>
                    </div>
                    {sampleTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 bg-gray-50/40 px-4 py-2">
                        {sampleTypes.map((s) => (
                          <button key={s.id} onClick={() => { setPreviewType(s.id); setPreviewExpanded(false); }} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${previewType === s.id ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {preview && typeof preview === "object" && (preview.from || preview.preheader) && (
                      <div className="space-y-0.5 border-b border-gray-100 px-4 py-2 text-xs text-gray-400">
                        {preview.from && <div className="truncate"><span className="font-medium text-gray-500">From</span> <code className="text-gray-600">{preview.from}</code></div>}
                        {preview.preheader && <div className="truncate"><span className="font-medium text-gray-500">Preview text</span> {preview.preheader}</div>}
                      </div>
                    )}
                    {preview === "loading" && <div className="px-4 py-8 text-center text-sm text-gray-400">Loading preview…</div>}
                    {preview === "none" && <div className="px-4 py-8 text-center text-sm text-gray-400">{sampleSel ? "Couldn't render this sample." : "No rendered email on file yet for this type."}</div>}
                    {preview && typeof preview === "object" && (
                      <div className="relative bg-white">
                        <iframe srcDoc={preview.html} title="Email preview" className={`w-full bg-white transition-[height] ${previewExpanded ? "h-[720px]" : "h-[320px]"}`} sandbox="" />
                        {!previewExpanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />}
                        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
                          <button onClick={() => setPreviewExpanded((v) => !v)} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50">
                            {previewExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── RECIPIENTS ── */}
          {tab === "recipients" && (
            <div className="mt-5">
              {!data.job.isEmail ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-400">This automation doesn&rsquo;t send email — nothing to list.</div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
                    <span className="text-sm font-medium text-gray-700">Recipients</span>
                    {data.runs.length > 0 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => stepRun(1)} disabled={data.runs.findIndex((r) => r.id === selectedRun) >= data.runs.length - 1} className="rounded-md border border-gray-200 px-1.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-30" title="Older run">←</button>
                        <select value={selectedRun ?? ""} onChange={(e) => { setSelectedRun(e.target.value || null); setRecipientPage(1); setRecipientStatus("all"); }} className="max-w-[18rem] rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700">
                          {data.runs.map((r) => <option key={r.id} value={r.id}>{runOptionLabel(r)}</option>)}
                        </select>
                        <button onClick={() => stepRun(-1)} disabled={data.runs.findIndex((r) => r.id === selectedRun) <= 0} className="rounded-md border border-gray-200 px-1.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-30" title="Newer run">→</button>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    {data.runs.length === 0 && <div className="py-6 text-center text-sm text-gray-400">No runs recorded yet — recipients appear once this is on production and a run fires.</div>}
                    {recipients === "loading" && <div className="py-6 text-center text-sm text-gray-400">Loading recipients…</div>}
                    {recipients === "error" && <div className="py-6 text-center text-sm text-gray-400">Couldn&rsquo;t load recipients for this run.</div>}

                    {recipients && typeof recipients === "object" && (
                      recipients.columnMissing ? (
                        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">{recipients.note}</div>
                      ) : recipients.rollup.sent === 0 ? (
                        (() => {
                          const runSent = recipients.run?.summary?.sent;
                          const reported = typeof runSent === "number" ? runSent : 0;
                          return (
                            <div className="rounded-xl bg-gray-50/70 px-4 py-10 text-center">
                              <p className="text-sm text-gray-500">{reported > 0 ? `This run reported ${reported.toLocaleString()} sent, but none are linked here.` : "No emails are linked to this run."}</p>
                              {reported > 0 && <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-400">Linking started when migration 083 / this deploy landed — earlier runs aren&rsquo;t backfilled. The next run will populate this.</p>}
                            </div>
                          );
                        })()
                      ) : (
                        <>
                          {/* per-run stat strip */}
                          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                            <span><span className="font-semibold tabular-nums text-gray-900">{recipients.rollup.sent.toLocaleString()}</span> <span className="text-gray-500">in this run</span></span>
                            <span className="text-gray-600"><span className="tabular-nums">{pct(recipients.rollup.delivered, recipients.rollup.sent)}</span> delivered</span>
                            <span className="text-gray-600"><span className="tabular-nums">{pct(recipients.rollup.opened, recipients.rollup.sent)}</span> opened</span>
                            <span className="text-gray-600"><span className="tabular-nums">{pct(recipients.rollup.clicked, recipients.rollup.sent)}</span> clicked</span>
                            {recipients.rollup.bounced > 0 && <span className="text-red-600">{recipients.rollup.bounced} bounced</span>}
                            {recipients.rollup.complained > 0 && <span className="text-red-600">{recipients.rollup.complained} complaints</span>}
                          </div>

                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {RECIPIENT_FILTERS.map((f) => (
                              <button key={f.key} onClick={() => { setRecipientStatus(f.key); setRecipientPage(1); }} className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${recipientStatus === f.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{f.label}</button>
                            ))}
                          </div>

                          {recipients.recipients.length === 0 ? (
                            <div className="py-8 text-center text-sm text-gray-400">No recipients match this filter.</div>
                          ) : (
                            <>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="border-b border-gray-200 text-xs text-gray-400">
                                    <tr><th className="px-3 py-2 text-left font-medium">Recipient</th><th className="px-3 py-2 text-left font-medium">Status</th><th className="px-3 py-2 text-right font-medium">Sent</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {recipients.recipients.map((e) => {
                                      const rawVariant = e.metadata?.variant;
                                      const variant = typeof rawVariant === "string" ? rawVariant : null;
                                      return (
                                        <tr key={e.id} className="transition-colors hover:bg-gray-50">
                                          <td className="px-3 py-2">
                                            {e.provider_id ? (
                                              <Link href={`/admin/directory/${e.provider_id}`} className="text-teal-700 hover:underline">{e.recipient}</Link>
                                            ) : (
                                              <span className="text-gray-800">{e.recipient}</span>
                                            )}
                                            {(e.recipient_type || variant) && <span className="ml-1.5 text-[11px] text-gray-400">{[e.recipient_type, variant].filter(Boolean).join(" · ")}</span>}
                                            {e.error_message && <div className="text-[11px] text-red-600">{e.error_message}</div>}
                                          </td>
                                          <td className="px-3 py-2"><EmailStatusPill status={e.status} sentAt={e.created_at} delivered_at={e.delivered_at} first_opened_at={e.first_opened_at} first_clicked_at={e.first_clicked_at} bounced_at={e.bounced_at} complained_at={e.complained_at} /></td>
                                          <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-gray-400" title={new Date(e.created_at).toLocaleString()}>{timeAgo(e.created_at)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {(() => {
                                const from = (recipients.page - 1) * recipients.pageSize + 1;
                                const to = Math.min(recipients.page * recipients.pageSize, recipients.total);
                                const hasPrev = recipients.page > 1;
                                const hasNext = recipients.page * recipients.pageSize < recipients.total;
                                if (!hasPrev && !hasNext) return <div className="mt-3 text-xs text-gray-400">{recipients.total.toLocaleString()} recipient{recipients.total === 1 ? "" : "s"}</div>;
                                return (
                                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                                    <span>{from.toLocaleString()}–{to.toLocaleString()} of {recipients.total.toLocaleString()}</span>
                                    <button disabled={!hasPrev} onClick={() => setRecipientPage((p) => Math.max(1, p - 1))} className="rounded-md border border-gray-200 px-2 py-0.5 transition-colors hover:bg-gray-50 disabled:opacity-30">← Prev</button>
                                    <button disabled={!hasNext} onClick={() => setRecipientPage((p) => p + 1)} className="rounded-md border border-gray-200 px-2 py-0.5 transition-colors hover:bg-gray-50 disabled:opacity-30">Next →</button>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RUNS ── */}
          {tab === "runs" && (
            <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
              <div className="border-b border-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700">Run history</div>
              {data.runs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">No runs recorded yet. Crons only fire on production — instrumentation fills this in there.</div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100">
                    {(showAllRuns ? data.runs : data.runs.slice(0, 15)).map((run) => {
                      const skips = skipReasonsText(run.summary);
                      return (
                        <div key={run.id} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-gray-50">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${runDotCls(run.status)}`} title={run.status} />
                          <span className="w-24 shrink-0 text-gray-700" title={new Date(run.started_at).toLocaleString()}>{timeAgo(run.started_at)}</span>
                          <span className="w-16 shrink-0 text-xs text-gray-400">{duration(run.started_at, run.finished_at)}</span>
                          <span className="min-w-0 flex-1 truncate text-gray-600" title={skips || undefined}>
                            {run.status === "skipped_paused" ? <span className="text-amber-600">skipped (paused)</span> : run.status === "running" ? <span className="text-blue-600">running…</span> : runResult(run.summary) || (run.status === "ok" ? "completed" : run.status)}
                            {skips && <span className="ml-1.5 text-gray-300">ⓘ</span>}
                          </span>
                          {run.error && <span className="max-w-[16rem] truncate text-xs text-red-600" title={run.error}>{run.error}</span>}
                          {run.triggered_by !== "cron" && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500" title={run.triggered_by}>manual</span>}
                        </div>
                      );
                    })}
                  </div>
                  {data.runs.length > 15 && (
                    <button onClick={() => setShowAllRuns((v) => !v)} className="w-full border-t border-gray-100 px-4 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50">
                      {showAllRuns ? "Show fewer" : `Show all ${data.runs.length} runs`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

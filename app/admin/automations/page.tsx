"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  RESEND_COMPLAINT_LIMIT,
  RESEND_COMPLAINT_WARN,
  RESEND_BOUNCE_LIMIT,
  RESEND_BOUNCE_WARN,
} from "@/lib/email-thresholds";

type Fn = "nudge" | "alert" | "digest" | "outreach" | "event" | "refresh" | "maintenance";
interface Rollup {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}
interface LastRun {
  startedAt: string;
  finishedAt: string | null;
  status: string;
  summary: Record<string, unknown> | null;
  error: string | null;
  triggeredBy: string;
}
interface Job {
  id: string;
  name: string;
  description: string;
  recipientCohort: string;
  audience: string;
  fn: Fn;
  schedule: string;
  humanSchedule: string;
  path: string;
  emailTypes: string[];
  successSignal: string | null;
  relatedAdminPath: string | null;
  isEmail: boolean;
  paused: boolean;
  pause: { reason: string | null; by: string | null; at: string | null; until: string | null } | null;
  lastRun: LastRun | null;
  runs30d: number;
  errors30d: number;
  rollup30d: Rollup | null;
}
interface ApiResponse {
  windowDays: number;
  summary: {
    total: number;
    active: number;
    paused: number;
    errored: number;
    sends30d: number;
    bounces30d: number;
    complaints30d: number;
    deliveredAll30d: number;
    sentAll30d: number;
    complaintEvents30d: number;
    bounceEvents30d: number;
    complaintRate30d: number;
    bounceRate30d: number;
  };
  jobs: Job[];
  note: string;
}

const FN_LABEL: Record<Fn, string> = { nudge: "nudge", alert: "alert", digest: "digest", outreach: "outreach", event: "event-triggered", refresh: "data refresh", maintenance: "maintenance" };

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
function pct(n: number, of: number): string {
  return of <= 0 ? "—" : `${Math.round((n / of) * 100)}%`;
}
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
function jobDot(j: Job): string {
  if (j.paused) return "bg-amber-400";
  if (j.lastRun?.status === "error" || j.errors30d > 0) return "bg-red-500";
  if (j.lastRun?.status === "running") return "bg-blue-500";
  return "bg-emerald-500";
}
function jobHasErr(j: Job): boolean {
  return j.lastRun?.status === "error" || j.errors30d > 0;
}

const COLLAPSE_KEY = "automations:collapsed";
type Filter = "all" | "email" | "errored" | "paused";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="none">
      <path d="M3 1.5 L7 5 L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ value, label, sub, danger, warn, muted, onClick, active }: { value: ReactNode; label: string; sub?: string; danger?: boolean; warn?: boolean; muted?: boolean; onClick?: () => void; active?: boolean }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      className={`rounded-xl border bg-white px-4 py-3 ${active ? "border-gray-900" : "border-gray-200"} ${clickable ? "cursor-pointer transition-colors hover:bg-gray-50" : ""}`}
    >
      <div className={`text-2xl font-semibold leading-none tabular-nums ${danger ? "text-red-600" : warn ? "text-amber-600" : muted ? "text-gray-300" : "text-gray-900"}`}>{value}</div>
      <div className="mt-1.5 text-xs text-gray-500">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</div>
    </div>
  );
}

// Rate is a fraction (e.g. 0.00039). Render as a percentage; complaint rates live
// in the third decimal, bounce rates in the second.
function fmtPct(rate: number, decimals: number): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[68px] rounded-xl bg-gray-100" />)}
      </div>
      <div className="mt-5 h-8 w-72 rounded bg-gray-100" />
      <div className="mt-6 space-y-5">
        {Array.from({ length: 3 }).map((_, i) => <div key={i}><div className="mb-2 h-3 w-32 rounded bg-gray-100" /><div className="h-28 rounded-xl bg-gray-100" /></div>)}
      </div>
    </div>
  );
}

export default function AutomationsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  const persistCollapsed = (next: Record<string, boolean>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const toggleCollapse = (audience: string) => persistCollapsed({ ...collapsed, [audience]: !collapsed[audience] });
  const collapseAll = () => persistCollapsed(Object.fromEntries((data?.jobs ?? []).map((j) => [j.audience, true])));
  const expandAll = () => persistCollapsed({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/automations");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(payload: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    try {
      const r = await fetch("/api/admin/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }
  async function togglePause(job: Job) {
    if (job.paused) {
      if (!confirm(`Resume "${job.name}"? It will run on its normal schedule again.`)) return;
      await post({ job_id: job.id, action: "resume" }, `pause:${job.id}`);
    } else {
      const reason = prompt(`Pause "${job.name}"?\n\nIt stops sending/running but still logs a "skipped (paused)" entry each cycle. Auto-resumes in 30 days.\n\nReason (optional):`);
      if (reason === null) return;
      await post({ job_id: job.id, action: "pause", reason, days: 30 }, `pause:${job.id}`);
    }
  }

  const matches = useCallback(
    (j: Job): boolean => {
      if (filter === "email" && !j.isEmail) return false;
      if (filter === "errored" && !jobHasErr(j)) return false;
      if (filter === "paused" && !j.paused) return false;
      if (q.trim()) {
        const hay = `${j.name} ${j.description} ${j.recipientCohort} ${j.audience} ${j.fn} ${j.emailTypes.join(" ")}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    },
    [filter, q],
  );

  const groups = useMemo(() => {
    if (!data) return [];
    const order: string[] = [];
    const byAud = new Map<string, Job[]>();
    for (const j of data.jobs) {
      if (!matches(j)) continue;
      if (!byAud.has(j.audience)) { byAud.set(j.audience, []); order.push(j.audience); }
      byAud.get(j.audience)!.push(j);
    }
    return order.map((a) => ({ audience: a, jobs: byAud.get(a)! }));
  }, [data, matches]);

  const ghostBtn = "rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50";

  // Counts computed from the loaded jobs so the cards exactly equal what each filter shows.
  const pausedCount = data ? data.jobs.filter((j) => j.paused).length : 0;
  const erroredCount = data ? data.jobs.filter(jobHasErr).length : 0;
  const activeCount = data ? data.jobs.filter((j) => !j.paused && !jobHasErr(j)).length : 0;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Automations</h1>
        <button disabled={loading} onClick={load} className={ghostBtn}>{loading && data ? "Refreshing…" : "Refresh"}</button>
      </div>

      {loading && !data && <Skeleton />}
      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}

      {data && (
        <>
          {/* fleet stats */}
          <div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard value={activeCount} label="Active" sub={`of ${data.summary.total}`} />
              <StatCard value={pausedCount} label="Paused" muted={pausedCount === 0} onClick={pausedCount > 0 ? () => setFilter((f) => (f === "paused" ? "all" : "paused")) : undefined} active={filter === "paused"} />
              <StatCard value={erroredCount} label="Errored" danger={erroredCount > 0} muted={erroredCount === 0} onClick={erroredCount > 0 ? () => setFilter((f) => (f === "errored" ? "all" : "errored")) : undefined} active={filter === "errored"} />
              <StatCard value={data.summary.sends30d.toLocaleString()} label="Sent" sub="last 30 days" muted={data.summary.sends30d === 0} />
              <StatCard
                value={fmtPct(data.summary.complaintRate30d, 3)}
                label="Complaint rate"
                sub={`${data.summary.complaintEvents30d} / ${data.summary.deliveredAll30d.toLocaleString()} · cap 0.08%`}
                danger={data.summary.complaintRate30d > RESEND_COMPLAINT_LIMIT}
                warn={data.summary.complaintRate30d > RESEND_COMPLAINT_WARN && data.summary.complaintRate30d <= RESEND_COMPLAINT_LIMIT}
                muted={data.summary.deliveredAll30d === 0}
              />
              <StatCard
                value={fmtPct(data.summary.bounceRate30d, 2)}
                label="Bounce rate"
                sub={`${data.summary.bounceEvents30d} / ${data.summary.sentAll30d.toLocaleString()} · cap 4%`}
                danger={data.summary.bounceRate30d > RESEND_BOUNCE_LIMIT}
                warn={data.summary.bounceRate30d > RESEND_BOUNCE_WARN && data.summary.bounceRate30d <= RESEND_BOUNCE_LIMIT}
                muted={data.summary.sentAll30d === 0}
              />
            </div>
            <p className="mt-2 text-xs text-gray-400">{data.note}</p>
          </div>

          {/* filter */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter automations…" className="w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none" />
            {(["all", "email", "errored", "paused"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${filter === f ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {f === "all" ? "All" : f === "email" ? "Email" : f === "errored" ? "Errored" : "Paused"}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
              <button onClick={expandAll} className="transition-colors hover:text-gray-700">Expand all</button>
              <span className="text-gray-200">·</span>
              <button onClick={collapseAll} className="transition-colors hover:text-gray-700">Collapse all</button>
            </div>
          </div>

          {groups.length === 0 && !loading && <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-400">No automations match.</div>}

          {groups.map(({ audience, jobs }) => {
            const isCollapsed = !!collapsed[audience];
            return (
              <div key={audience} className="mt-5">
                <button onClick={() => toggleCollapse(audience)} className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400 transition-colors hover:text-gray-600">
                  <Chevron open={!isCollapsed} />
                  <span>{audience}</span>
                  <span className="font-normal normal-case text-gray-300">· {jobs.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="overflow-hidden rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {jobs.map((job) => {
                      const r = job.rollup30d;
                      const canPause = job.path.startsWith("/api/cron/");
                      return (
                        <div key={job.id} className="group relative px-4 py-2.5 transition-colors hover:bg-gray-50/70">
                          <Link href={`/admin/automations/${job.id}`} className="absolute inset-0" aria-label={`Open ${job.name}`} />
                          <div className="flex items-center gap-3">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${jobDot(job)}`} title={job.paused ? "paused" : jobHasErr(job) ? "errors" : "active"} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-gray-900">{job.name}</span>
                                {job.paused && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">Paused</span>}
                                {!job.paused && jobHasErr(job) && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-200">Errors</span>}
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{FN_LABEL[job.fn]}</span>
                                <span className="text-xs text-gray-400">{job.humanSchedule}</span>
                              </div>
                              <div className="mt-0.5 truncate text-xs text-gray-400" title={job.lastRun ? `Last run: ${runResult(job.lastRun.summary) || job.lastRun.status}${job.lastRun.error ? ` — ${job.lastRun.error}` : ""}` : undefined}>
                                {job.fn === "event" ? "Event-triggered monitor" : job.lastRun ? `Last run ${timeAgo(job.lastRun.startedAt)}` : "No runs yet"}
                                {r ? (
                                  <>
                                    <span className="text-gray-300"> · </span>
                                    <span className="tabular-nums text-gray-500">{r.sent.toLocaleString()}</span> sent
                                    <span className="text-gray-300"> · </span>
                                    <span className="tabular-nums text-gray-500">{pct(r.opened, r.sent)}</span> open
                                    {r.bounced > 0 && <span className="text-red-500"> · {r.bounced} bounced</span>}
                                    <span className="text-gray-300"> · 30d</span>
                                  </>
                                ) : job.lastRun && runResult(job.lastRun.summary) ? (
                                  <><span className="text-gray-300"> · </span>{runResult(job.lastRun.summary)}</>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {canPause && (
                                <button
                                  disabled={busy === `pause:${job.id}`}
                                  onClick={() => togglePause(job)}
                                  className={`relative z-10 rounded-lg border px-2 py-0.5 text-xs font-medium opacity-0 transition group-hover:opacity-100 disabled:opacity-40 ${job.paused ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                                >
                                  {busy === `pause:${job.id}` ? "…" : job.paused ? "Resume" : "Pause"}
                                </button>
                              )}
                              <span className="text-sm text-gray-300 transition-colors group-hover:text-gray-500">→</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

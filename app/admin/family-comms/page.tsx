"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DateRangePopover, {
  resolveRange,
  rangeLabel,
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import CollapsibleSection from "@/components/admin/CollapsibleSection";

/**
 * /admin/family-comms — the family-engagement + email-observability surface.
 *
 * First-principles read on how families move through our funnel and how every
 * family email performs (deliver → open → click → convert), so we can iterate
 * on copy/CTAs by data. The compare-led flywheel is the spine; the cutover
 * lens is a secondary, collapsible view. Data: GET /api/admin/family-comms-analytics/summary.
 */

interface PerfRow {
  type: string;
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  weeklySends: number[];
  compareBearing: boolean;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

interface Summary {
  range: { from: string; to: string };
  generatedAt: string;
  totals: { sent: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number };
  compareClick: { sends: number; opened: number; clicked: number; openRate: number; clickRate: number };
  emailPerformance: PerfRow[];
  funnel: {
    emailed: number; opened: number; clicked: number; introRequested: number; answered: number;
    engaged: number; benefitsStarted: number; benefitsCompleted: number; published: number;
  };
  sensor: { sent: number; answered: number; yes: number; no: number; notYet: number; responseRate: number; yesRate: number };
  conversions: { compareSaved: number; guideSaved: number; benefitsStarted: number; benefitsCompleted: number; published: number };
  outcomes: { total: number; connected: number; active: number; guided: number; stalled: number; lookbackDays: number };
  cutover: { anchor: string; cutoverWeekIndex: number; weekStartsISO: string[]; sendsWeekly: number[]; goLivesWeekly: number[] };
}

const pct = (n: number) => `${(n * 100).toFixed(n >= 0.0995 ? 0 : 1)}%`;
const num = (n: number) => n.toLocaleString();

function Sparkline({ points, color = "#0d9488" }: { points: number[]; color?: string }) {
  const w = 72, h = 18;
  if (!points.length) return <svg width={w} height={h} />;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * (h - 2) - 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value, sub, accent, info }: { label: string; value: string; sub?: string; accent?: boolean; info?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        <span>{label}</span>
        {info && (
          <span
            title={info}
            className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-300 text-[9px] font-semibold text-gray-400 hover:border-gray-400 hover:text-gray-600"
            aria-label={info}
          >
            ?
          </span>
        )}
      </div>
      <div className={`mt-1 text-[26px] font-semibold tabular-nums ${accent ? "text-teal-700" : "text-gray-900"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

// ── Per-type detail drawer ──────────────────────────────────────────────────
interface VariantMeta {
  id: string;
  audience: string;
  label: string;
  subject: string;
  emailType: string;
  cron: string | null;
  who: string | null;
  why: string | null;
  from: string;
}

/**
 * Right-side drawer that opens when an email-type row is clicked. Shows the live
 * rendered template (iframe → /api/admin/emails/sample?id=…&raw=1), the "who gets
 * it / why" rationale, and the row's performance. Replaces the old "dump to the
 * unfiltered /admin/emails list" link so copy can be analyzed in place.
 */
function EmailTypeDrawer({
  row,
  variants,
  variantsLoading,
  onClose,
}: {
  row: PerfRow;
  variants: VariantMeta[] | null;
  variantsLoading: boolean;
  onClose: () => void;
}) {
  const matches = useMemo(
    () => (variants || []).filter((v) => v.emailType === row.type && v.audience === "family"),
    [variants, row.type],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = matches.find((v) => v.id === activeId) ?? matches[0] ?? null;
  const rationale = matches.find((v) => v.who || v.why) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-gray-900/30" onClick={onClose} aria-hidden />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-gray-900">{row.label}</h2>
              {row.compareBearing && (
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">compare</span>
              )}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-gray-400">{row.type}</div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Performance strip */}
          <div className="grid grid-cols-4 gap-px border-b border-gray-100 bg-gray-100">
            {[
              { k: "Sent", v: num(row.sent) },
              { k: "Deliv.", v: row.sent ? pct(row.deliveryRate) : "—" },
              { k: "Open", v: row.sent ? pct(row.openRate) : "—" },
              { k: "Click", v: row.sent ? pct(row.clickRate) : "—" },
            ].map((s) => (
              <div key={s.k} className="bg-white px-3 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">{s.k}</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">{s.v}</div>
              </div>
            ))}
          </div>

          {/* Who / Why */}
          <div className="space-y-3 border-b border-gray-100 px-5 py-4">
            {rationale?.who && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Who gets this</div>
                <p className="mt-1 text-sm leading-relaxed text-gray-700">{rationale.who}</p>
              </div>
            )}
            {rationale?.why && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Why</div>
                <p className="mt-1 text-sm leading-relaxed text-gray-700">{rationale.why}</p>
              </div>
            )}
            {active?.cron && (
              <div className="text-[11px] text-gray-400">
                Sent by{" "}
                <Link href={`/admin/automations`} className="text-teal-700 hover:underline">{active.cron}</Link>
              </div>
            )}
            {!rationale && !variantsLoading && (
              <p className="text-sm text-gray-400">No rationale registered for this type yet.</p>
            )}
          </div>

          {/* Preview */}
          <div className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Email preview</div>
              {active && (
                <a
                  href={`/api/admin/emails/sample?id=${encodeURIComponent(active.id)}&raw=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-teal-700 hover:underline"
                >
                  Open full ↗
                </a>
              )}
            </div>

            {/* Variant switcher (when a type has multiple copy variants) */}
            {matches.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {matches.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveId(v.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      active?.id === v.id ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}

            {active && (
              <div className="mb-2 space-y-1 rounded-md bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
                {active.from && (
                  <div><span className="inline-block w-12 text-gray-400">From</span> {active.from}</div>
                )}
                {active.subject && (
                  <div><span className="inline-block w-12 text-gray-400">Subject</span> {active.subject}</div>
                )}
              </div>
            )}

            {variantsLoading ? (
              <p className="py-8 text-center text-sm text-gray-400">Loading preview…</p>
            ) : active ? (
              <iframe
                title={`Preview of ${row.label}`}
                src={`/api/admin/emails/sample?id=${encodeURIComponent(active.id)}&raw=1`}
                className="h-[60vh] w-full rounded-lg border border-gray-200 bg-white"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center">
                <p className="text-sm text-gray-500">No template preview registered for this type yet.</p>
                <Link href={`/admin/emails?type=${encodeURIComponent(row.type)}`} className="mt-2 inline-block text-[12px] text-teal-700 hover:underline">
                  View sent copies in the email log →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Footer links */}
        <div className="flex items-center gap-4 border-t border-gray-100 px-5 py-3 text-[12px]">
          <Link href={`/admin/emails?type=${encodeURIComponent(row.type)}`} className="text-gray-600 hover:text-teal-700">View sent log</Link>
          <Link href="/admin/emails/gallery" className="text-gray-600 hover:text-teal-700">Open Email Gallery</Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Outcome distribution — every family that inquired in the lookback, split into
 * connected / active / guided / stalled. Matchmaking outcomes (connected/active)
 * on the warm side, Guidance outcomes (guided/stalled) on the cool side; the
 * sensor is the conceptual switch between them. Calm palette, not a RAG heatmap.
 */
function OutcomePanel({ oc }: { oc: NonNullable<Summary["outcomes"]> }) {
  const segs = [
    { key: "connected", label: "Connected", value: oc.connected, bar: "bg-emerald-500", text: "text-emerald-700", note: "a real match formed" },
    { key: "active", label: "Active", value: oc.active, bar: "bg-teal-400", text: "text-teal-700", note: "still matchmaking" },
    { key: "guided", label: "Guided", value: oc.guided, bar: "bg-amber-400", text: "text-amber-700", note: "onto self-serve help" },
    { key: "stalled", label: "Stalled", value: oc.stalled, bar: "bg-stone-400", text: "text-stone-500", note: "no connection, no engagement" },
  ] as const;
  const total = oc.total;
  const share = (v: number) => (total > 0 ? v / total : 0);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {segs.map((s) => (
          <div key={s.key} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              <span className={`inline-block h-2 w-2 rounded-full ${s.bar}`} />
              <span>{s.label}</span>
            </div>
            <div className={`mt-1 text-[26px] font-semibold tabular-nums ${s.text}`}>{num(s.value)}</div>
            <div className="mt-0.5 text-[11px] text-gray-500">{total > 0 ? pct(share(s.value)) : "—"} · {s.note}</div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
          {segs.map((s) => (
            <div key={s.key} className={s.bar} style={{ width: `${share(s.value) * 100}%` }} title={`${s.label}: ${num(s.value)}`} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
        {num(total)} families that inquired in the last {oc.lookbackDays} days (rolling — independent of the date range above,
        since a family that connected weeks ago is still connected). <span className="text-emerald-700 font-medium">Connected</span> = provider
        engaged/accepted or the family self-reported a reply; <span className="text-teal-700 font-medium">Active</span> = inquiry &lt; 7d, still
        matchmaking; <span className="text-amber-700 font-medium">Guided</span> = engaged compare/guide/benefits after matchmaking stalled;
        <span className="text-stone-500 font-medium"> Stalled</span> = silent, no engagement (the set v2 exists to shrink). Derived from
        connections + self-report + seeker_activity — no new tracking.
      </p>
    </>
  );
}

/** Horizontal funnel step with a width bar relative to the top of the funnel. */
function FunnelStep({ label, value, base, note }: { label: string; value: number; base: number; note?: string }) {
  const w = base > 0 ? Math.max(2, (value / base) * 100) : 0;
  const conv = base > 0 ? value / base : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-44 shrink-0 text-sm text-gray-700">{label}</div>
      <div className="flex-1 min-w-0">
        <div className="h-7 rounded-md bg-teal-50 overflow-hidden">
          <div className="h-full rounded-md bg-teal-500/80 flex items-center px-2" style={{ width: `${w}%` }}>
            <span className="text-[11px] font-semibold text-white tabular-nums">{num(value)}</span>
          </div>
        </div>
      </div>
      <div className="w-28 shrink-0 text-right text-[11px] text-gray-500 tabular-nums">
        {pct(conv)} of emailed{note ? "" : ""}
      </div>
    </div>
  );
}

export default function FamilyCommsAnalyticsPage() {
  const [range, setRange] = useState<DateRangeValue>({ preset: "30d", customFrom: "", customTo: "" });
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<PerfRow | null>(null);
  const [variants, setVariants] = useState<VariantMeta[] | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(true);

  // Variant metadata (who/why + render ids) — fetched once for the drawer.
  useEffect(() => {
    fetch("/api/admin/emails/sample")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { variants: VariantMeta[] }) => setVariants(d.variants || []))
      .catch(() => setVariants([]))
      .finally(() => setVariantsLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const { from, to } = resolveRange(range);
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    fetch(`/api/admin/family-comms-analytics/summary?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Summary) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [range]);

  const f = data?.funnel;
  const sensor = data?.sensor;
  const conv = data?.conversions;
  const oc = data?.outcomes;

  const sensorBreakdown = useMemo(() => {
    if (!sensor || sensor.answered === 0) return null;
    return [
      { k: "Yes — provider got back", v: sensor.yes, c: "bg-emerald-500" },
      { k: "Not yet", v: sensor.notYet, c: "bg-amber-400" },
      { k: "No", v: sensor.no, c: "bg-rose-400" },
    ];
  }, [sensor]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link href="/admin/automations" className="hover:text-gray-600">Automations</Link>
            <span>·</span>
            <Link href="/admin/emails" className="hover:text-gray-600">Emails log</Link>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Family Comms — engagement & email performance</h1>
          <p className="mt-1 text-sm text-gray-500">
            How families move through the compare-led flywheel, and how every family email performs. {" "}
            <span className="text-gray-400">{rangeLabel(range)}</span>
          </p>
        </div>
        <DateRangePopover value={range} onChange={setRange} />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">Failed to load: {error}</p>}

      {data && !error && (
        <>
          {/* Top-line stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
            <Stat label="Emails sent" value={num(data.totals.sent)} info="Total family emails sent in this window (recipient is a family, not a provider)." />
            <Stat label="Open rate" value={pct(data.totals.sent ? data.totals.opened / (data.totals.delivered || data.totals.sent) : 0)} sub={`${num(data.totals.opened)} opened`} info="Share of delivered family emails that were opened (Resend webhook)." />
            <Stat label="Click rate" value={pct(data.totals.opened ? data.totals.clicked / data.totals.opened : 0)} sub={`${num(data.totals.clicked)} clicked`} info="Share of opened emails where a link was clicked." />
            <Stat label="Intros requested" value={num(data.funnel.introRequested)} sub="one-tap intros" accent info="Families who tapped 'Introduce me' on a compare card, creating a real inquiry to that provider (B2). The clearest signal the curated shortlist drove action — the connection-driver we built it for." />
            <Stat label="Reply rate" value={pct(sensor?.responseRate ?? 0)} sub={`${num(sensor?.answered ?? 0)} / ${num(sensor?.sent ?? 0)} answered`} accent info={`Share of "Outcome check" emails where the family answered the question "Did the provider get back to you?" — our ground-truth signal. ${num(sensor?.answered ?? 0)} of ${num(sensor?.sent ?? 0)} sent answered.`} />
            <Stat label="Provider got back" value={pct(sensor?.yesRate ?? 0)} sub="of those who answered" info="Of families who answered the outcome-check, the share who said YES, a provider did get back to them. A 'no / not yet' routes them into the help cascade." />
            <Stat label="Went live" value={num(conv?.published ?? 0)} sub="profiles published" accent info="Family care-seeker profiles that were published (went live) in this window — the North-Star proxy. Counts the action across all families, not attributed to a single email." />
          </div>

          {/* Where families land — the outcome distribution (Phase 0).
              The north star made legible: we count outcomes, not just sends. */}
          {oc && (
            <CollapsibleSection title="Where families land — outcomes" storageKey="fc.outcomes" defaultCollapsed={false}>
              <OutcomePanel oc={oc} />
            </CollapsibleSection>
          )}

          {/* Flywheel funnel */}
          <CollapsibleSection title="Family engagement flywheel" storageKey="fc.funnel" defaultCollapsed={false}>
            {f && (
              <>
                <div className="space-y-0.5">
                  <FunnelStep label="Emailed" value={f.emailed} base={f.emailed} />
                  <FunnelStep label="Opened" value={f.opened} base={f.emailed} />
                  <FunnelStep label="Clicked" value={f.clicked} base={f.emailed} />
                  <FunnelStep label="Introductions requested" value={f.introRequested} base={f.emailed} />
                  <FunnelStep label="Replied to outcome-check" value={f.answered} base={f.emailed} />
                  <FunnelStep label="Saved compare / guide" value={f.engaged} base={f.emailed} />
                  <FunnelStep label="Benefits quiz completed" value={f.benefitsCompleted} base={f.emailed} />
                  <FunnelStep label="Went live (published)" value={f.published} base={f.emailed} />
                </div>
                <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
                  Emailed / Opened / Clicked are exact per-send email metrics. The later steps are window totals of each
                  action across all families (not yet attributed to a specific send), so treat the lower funnel as
                  directional volume, not a strict click-through chain.
                </p>
              </>
            )}
          </CollapsibleSection>

          {/* Email performance by type — the iterate workhorse */}
          <CollapsibleSection title="Email performance by type" storageKey="fc.perf" defaultCollapsed={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 px-2 font-medium text-right">Sent</th>
                    <th className="py-2 px-2 font-medium text-right">Deliv.</th>
                    <th className="py-2 px-2 font-medium text-right">Open</th>
                    <th className="py-2 px-2 font-medium text-right">Click</th>
                    <th className="py-2 px-2 font-medium text-right">Bounce</th>
                    <th className="py-2 pl-3 font-medium text-right">8-wk sends</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.emailPerformance.map((p) => (
                    <tr key={p.type} className="cursor-pointer hover:bg-gray-50/60" onClick={() => setOpenRow(p)}>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="group inline-flex items-center gap-1 text-left text-gray-800 hover:text-teal-700"
                          onClick={(e) => { e.stopPropagation(); setOpenRow(p); }}
                        >
                          {p.label}
                          <svg className="opacity-0 transition group-hover:opacity-60" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                        </button>
                        {p.compareBearing && (
                          <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">compare</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-900">{num(p.sent)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-500">{p.sent ? pct(p.deliveryRate) : "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-700">{p.sent ? pct(p.openRate) : "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-700">{p.sent ? pct(p.clickRate) : "—"}</td>
                      <td className={`py-2 px-2 text-right tabular-nums ${p.bounceRate > 0.02 ? "text-rose-600" : "text-gray-400"}`}>{p.sent ? pct(p.bounceRate) : "—"}</td>
                      <td className="py-2 pl-3 text-right"><div className="inline-block"><Sparkline points={p.weeklySends} /></div></td>
                    </tr>
                  ))}
                  {data.emailPerformance.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-sm text-gray-400">No family emails sent in this window.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              Click any row to preview the email and see who it goes to and why. Open rate = opened / delivered · Click
              rate = clicked / opened · all from Resend webhook events. The
              <span className="font-medium text-teal-700"> compare</span> tag marks rungs whose body carries alternative-provider cards.
            </p>
          </CollapsibleSection>

          {/* Sensor detail */}
          <CollapsibleSection title="Outcome-check sensor (ground-truth signal)" storageKey="fc.sensor" defaultCollapsed={false}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="Sent" value={num(sensor?.sent ?? 0)} />
              <Stat label="Answered" value={num(sensor?.answered ?? 0)} sub={pct(sensor?.responseRate ?? 0)} accent />
              <Stat label="Provider got back" value={num(sensor?.yes ?? 0)} sub={`${pct(sensor?.yesRate ?? 0)} of answers`} />
              <Stat label="No / not yet" value={num((sensor?.no ?? 0) + (sensor?.notYet ?? 0))} sub="→ help cascade" />
            </div>
            {sensorBreakdown && (
              <div className="space-y-1.5">
                {sensorBreakdown.map((b) => (
                  <div key={b.k} className="flex items-center gap-3">
                    <div className="w-44 shrink-0 text-sm text-gray-700">{b.k}</div>
                    <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                      <div className={`h-full ${b.c}`} style={{ width: `${sensor && sensor.answered ? (b.v / sensor.answered) * 100 : 0}%` }} />
                    </div>
                    <div className="w-12 text-right text-xs tabular-nums text-gray-600">{num(b.v)}</div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Conversions strip */}
          <CollapsibleSection title="Downstream conversions" storageKey="fc.conv" defaultCollapsed={false}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Stat label="Compare saved" value={num(conv?.compareSaved ?? 0)} />
              <Stat label="Guide saved" value={num(conv?.guideSaved ?? 0)} />
              <Stat label="Benefits started" value={num(conv?.benefitsStarted ?? 0)} sub="quiz opens (under-tracked)" />
              <Stat label="Benefits completed" value={num(conv?.benefitsCompleted ?? 0)} sub={conv && conv.benefitsStarted >= conv.benefitsCompleted && conv.benefitsStarted > 0 ? pct(conv.benefitsCompleted / conv.benefitsStarted) + " of started" : "results saved"} />
              <Stat label="Went live" value={num(conv?.published ?? 0)} accent />
            </div>
          </CollapsibleSection>

          {/* Secondary: cutover lens */}
          <CollapsibleSection title="Cutover lens — coordinator vs. the old firehose" storageKey="fc.cutover" defaultCollapsed={true}>
            <p className="text-[12px] text-gray-500 mb-4">
              The coordinator took over the 6 inquiry crons on <span className="font-medium text-gray-700">2026-06-24</span>.
              Weekly family-email volume and go-lives spanning that boundary — directional, since go-lives aren&apos;t solely email-attributed.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <WeeklyBars title="Family emails / week" series={data.cutover.sendsWeekly} starts={data.cutover.weekStartsISO} cutoverIdx={data.cutover.cutoverWeekIndex} color="bg-teal-400" />
              <WeeklyBars title="Profiles went live / week" series={data.cutover.goLivesWeekly} starts={data.cutover.weekStartsISO} cutoverIdx={data.cutover.cutoverWeekIndex} color="bg-emerald-500" />
            </div>
          </CollapsibleSection>

          <p className="mt-2 text-[11px] text-gray-400">
            Generated {new Date(data.generatedAt).toLocaleString()} · all signals from existing data (email_log + Resend webhooks + seeker_activity).
          </p>
        </>
      )}

      {openRow && (
        <EmailTypeDrawer
          row={openRow}
          variants={variants}
          variantsLoading={variantsLoading}
          onClose={() => setOpenRow(null)}
        />
      )}
    </div>
  );
}

function WeeklyBars({ title, series, starts, cutoverIdx, color }: { title: string; series: number[]; starts: string[]; cutoverIdx: number; color: string }) {
  const max = Math.max(1, ...series);
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">{title}</div>
      <div className="flex items-end gap-1.5 h-28">
        {series.map((v, i) => {
          const isPost = cutoverIdx >= 0 && i >= cutoverIdx;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-gray-500">{v || ""}</span>
              <div className="w-full rounded-t bg-gray-100 flex items-end" style={{ height: "100%" }}>
                <div className={`w-full rounded-t ${color} ${isPost ? "" : "opacity-45"}`} style={{ height: `${(v / max) * 100}%` }} />
              </div>
              <span className="text-[9px] text-gray-400">{new Date(starts[i]).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${color} opacity-45`} />pre-cutover</span>
        <span className="flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />post-cutover</span>
      </div>
    </div>
  );
}

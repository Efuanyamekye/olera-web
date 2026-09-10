"use client";

import { useEffect, useState } from "react";
import { QUIZ_CLEAN_START, type QuizFunnel } from "@/lib/city-ads/quiz-funnel";

type Response = QuizFunnel & { from: string; to: string };
const cityName = (slug: string) => slug.replace(/-[a-z]{2}$/, "").split("-").map(s => s[0].toUpperCase() + s.slice(1)).join(" ");
const rate = (n: number, d: number) => d ? `${Math.round(n / d * 100)}%` : "—";
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function CityQuizFunnel() {
  const [range, setRange] = useState("clean");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [applied, setApplied] = useState({ from: "", to: "" });
  const [city, setCity] = useState("all");
  const [channel, setChannel] = useState("all");
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      setLoading(true); setError(null);
      try {
        const now = new Date();
        const from = range === "clean" ? QUIZ_CLEAN_START : range === "all" ? "2026-09-06T00:00:00.000Z"
          : range === "custom" ? `${applied.from}T00:00:00.000Z` : new Date(now.getTime() - 7 * 86400000).toISOString();
        const to = range === "custom" ? new Date(Date.parse(`${applied.to}T00:00:00.000Z`) + 86400000).toISOString() : now.toISOString();
        const res = await fetch(`/api/admin/city-ads/funnel?${new URLSearchParams({ from, to })}`, { cache: "no-store", signal: controller.signal });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Could not load quiz data.");
        if (active) setData(result);
      } catch (e) {
        if (active && !controller.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : "Could not load quiz data."); }
      } finally { inFlight = false; if (active) setLoading(false); }
    }
    if (range === "custom" && (!applied.from || !applied.to)) { setData(null); setLoading(false); return () => controller.abort(); }
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [range, applied, retry]);
  const rows = data?.rows.filter(r => (city === "all" || r.slug === city) && (channel === "all" || r.channel === channel)) ?? [];
  const control = "rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-800";
  return (
    <section aria-labelledby="quiz-funnel-heading" className="mb-8 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 id="quiz-funnel-heading" className="text-lg font-semibold text-gray-900">Quiz progression</h2>
          <p className="mt-1 text-sm text-gray-600">See where paid visitors stop before requesting care.</p></div>
        <button type="button" onClick={() => setRetry(v => v + 1)} disabled={loading} className={`${control} disabled:opacity-50`}>Refresh</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="text-xs text-gray-600">Date range<select className={`${control} mt-1 block`} value={range} onChange={e => { setRange(e.target.value); setData(null); }}>
          <option value="clean">Since page fix · Sep 10</option><option value="7">Last 7 days</option><option value="all">Since launch</option><option value="custom">Custom dates (UTC)</option>
        </select></label>
        <label className="text-xs text-gray-600">City<select className={`${control} mt-1 block`} value={city} onChange={e => setCity(e.target.value)}>
          <option value="all">All cities</option>{[...new Set([...(city === "all" ? [] : [city]), ...(data?.rows.map(r => r.slug) ?? [])])].map(s => <option key={s} value={s}>{cityName(s)}</option>)}
        </select></label>
        <label className="text-xs text-gray-600">Channel<select className={`${control} mt-1 block`} value={channel} onChange={e => setChannel(e.target.value)}>
          <option value="all">All channels</option>{[...new Set(["google", "meta", "nextdoor", ...(data?.rows.map(r => r.channel) ?? [])])].map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </select></label>
      </div>
      {range === "custom" && <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); setData(null); setApplied({ ...custom }); }}>
        <label className="text-xs text-gray-600">From<input required type="date" className={`${control} mt-1 block`} value={custom.from} max={custom.to || undefined} onChange={e => setCustom(v => ({ ...v, from: e.target.value }))} /></label>
        <label className="text-xs text-gray-600">Through<input required type="date" className={`${control} mt-1 block`} value={custom.to} min={custom.from || undefined} max={new Date().toISOString().slice(0, 10)} onChange={e => setCustom(v => ({ ...v, to: e.target.value }))} /></label>
        <button className={control} type="submit">Apply dates</button>
      </form>}
      <div aria-live="polite">
        {range === "custom" && !applied.from && <p className="mt-4 text-sm text-gray-500">Choose dates and select Apply dates to view results.</p>}
        {loading && <p className="mt-4 text-sm text-gray-500">Loading quiz activity…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-error-50 p-3 text-sm text-error-700">{error} Results are unavailable, not zero.</p>}
      </div>
      {data && !loading && <>
        <p className="mt-3 text-xs text-gray-500">{stamp(data.from)} – {stamp(data.to)} UTC · refreshes every minute</p>
        {!rows.some(r => r.visitors) && <p className="mt-4 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">No qualifying paid visitors in this view yet. {range === "clean" ? "The page fix has no measured traffic here yet." : "Try a wider date range."}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">Paid quiz progression by city and channel; submitted leads are separate date-range totals.</caption>
            <thead className="border-b border-gray-200 text-xs text-gray-500"><tr>
              {["City / channel", "Paid visitors", "Started quiz", "Reached contact", "Submitted leads*"].map(h => <th key={h} scope="col" className="whitespace-nowrap px-2 py-2 first:pl-0">{h}</th>)}
            </tr></thead>
            <tbody>{rows.map(r => <tr key={`${r.slug}/${r.channel}`} className="border-b border-gray-100 last:border-0">
              <th scope="row" className="py-3 pr-2 text-sm font-medium text-gray-900">{cityName(r.slug)}<span className="block text-xs font-normal capitalize text-gray-500">{r.channel}</span></th>
              <td className="px-2 py-3 font-semibold">{r.visitors}<span className="block text-xs font-normal text-gray-500">{r.visits} visits</span></td>
              <td className="px-2 py-3 font-semibold">{r.starts}<span className="block text-xs font-normal text-gray-500">{rate(r.starts, r.visitors)} of visitors</span></td>
              <td className="px-2 py-3 font-semibold">{r.contacts}<span className="block text-xs font-normal text-gray-500">{rate(r.contacts, r.visitors)} of visitors</span></td>
              <td className="px-2 py-3 font-semibold">{r.submissions}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-600">Visitors are deduplicated within each city/channel. Quiz steps are matched to the same paid visit. *Submitted leads count real submissions in this date range, including leads without a tracked landing; they are not a matched fourth stage.</p>
        <details className="mt-3 text-xs text-gray-500"><summary className="cursor-pointer font-medium">Tracking coverage</summary>
          <p className="mt-2">{data.lastEventAt ? `Latest quiz event: ${stamp(data.lastEventAt)} UTC.` : "No quiz events recorded in this window."} Quiz tracking began Sep 8; earlier leads can appear without earlier steps. The page-fix window begins Sep 10 at 07:22 UTC.</p>
          <p className="mt-2">Across all cities/channels in this date range: {data.excludedLandings} internal, direct, test or unclassifiable landing events excluded; {data.ambiguousVisits} visits with conflicting channels excluded; {data.unmatchedEvents} quiz events without a qualifying paid visit. Tagged previews with external referrers can still be counted. Individual question completion is not tracked yet.</p>
        </details>
      </>}
    </section>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";

type Receipt = { leadgen_id: string; status: string; last_error: string | null; received_at: string; attempts: number };
type State = { configured: boolean; forms: { formId: string; slug: string; testOnly: boolean }[];
  receipts: Receipt[]; counts: { leads: number; reached: number; clients: number } };
export default function MetaNativeStatus() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/city-ads/meta", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load Meta intake"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function retry(id: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/city-ads/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadgenId: id }) });
      if (!r.ok) throw new Error((await r.json()).error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Retry failed"); }
    finally { setBusy(false); }
  }
  return <section className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-gray-900">Meta Instant Forms</h2>
      <button className="text-sm text-primary-700" onClick={() => void load()}>Refresh</button></div>
    {error && <p role="alert" className="mt-2 text-sm text-error-700">{error}</p>}
    {data && <>
      <p className="mt-2 text-sm text-gray-600">{data.configured ? "Direct intake configured. Submissions are picked up by the city clock every five minutes." : "Setup pending. Keep native ads unpublished until a test submission arrives here."}</p>
      <p className="mt-2 text-sm">{data.counts.leads} leads · {data.counts.reached} reached · {data.counts.clients} clients</p>
      <p className="mt-1 text-xs text-gray-500">All-time native outcomes; test leads excluded. Campaign spend and cost per client are not connected yet.</p>
      {data.forms.map(f => <p key={f.formId} className="mt-2 text-xs text-gray-600">{f.slug} · Form {f.formId} · {f.testOnly ? "Test mode — no messages" : "Live intake"}</p>)}
      <details className="mt-3"><summary className="cursor-pointer text-sm text-primary-700">Latest delivery receipts ({data.receipts.length}, up to 50)</summary>
        {data.receipts.length === 0 && <p className="mt-2 text-sm text-gray-500">No submissions received yet.</p>}
        {data.receipts.map(r => <div key={r.leadgen_id} className="mt-2 border-t border-gray-100 pt-2 text-xs">
          <span>{r.leadgen_id} · {r.status} · {new Date(r.received_at).toLocaleString()}</span>
          {r.last_error && <p className="mt-1 text-error-700">{r.last_error}</p>}
          {r.status === "failed" && <button disabled={busy} onClick={() => void retry(r.leadgen_id)} className="mt-1 text-primary-700 disabled:opacity-50">Retry delivery</button>}
        </div>)}
      </details>
    </>}
  </section>;
}

"use client";

/**
 * /admin/benefits/companion: read what the benefits text companion said, or
 * in practice mode would have said, before moving the switch to Live. One row
 * per opener or reply: what the family wrote, what the companion answered (or
 * would have), and why it answered itself or handed it to a person.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  profileId: string;
  who: string;
  state: string | null;
  at: string;
  mode: "practice" | "live";
  kind: "opener" | "reply";
  theySaid: string | null;
  wouldSay: string | null;
  decision: string | null;
  reason: string | null;
};

const DECISION_LABEL: Record<string, { text: string; cls: string }> = {
  auto: { text: "Answers itself", cls: "bg-emerald-50 text-emerald-700" },
  urgent: { text: "Urgent: person paged", cls: "bg-rose-50 text-rose-700" },
  escalate: { text: "Hands to a person", cls: "bg-amber-50 text-amber-700" },
  opener: { text: "First text", cls: "bg-gray-100 text-gray-700" },
  none: { text: "No first text", cls: "bg-gray-100 text-gray-500" },
};

export default function CompanionReviewPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/benefits/companion-review", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) setError(body?.error || `Couldn't load (${r.status}). Try refreshing.`);
        else setItems(body.items as Item[]);
      })
      .catch(() => setError("Network error. Try refreshing."));
  }, []);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/benefits" className="text-xs text-gray-400 hover:text-gray-700">← Benefits</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Text companion: what it said</h1>
        <p className="text-sm text-gray-500 mt-1">
          In practice mode nothing is sent; this is what it would have said. Read a handful before moving the switch in{" "}
          <Link href="/admin/analytics" className="underline underline-offset-2">Analytics</Link> to Live.
        </p>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {!error && items === null && <p className="text-sm text-gray-400">Loading…</p>}
      {items && items.length === 0 && (
        <p className="text-sm text-gray-500">Nothing yet. Turn on Practice in Analytics, and entries appear as families give their number or text us.</p>
      )}
      <div className="flex flex-col gap-3">
        {(items ?? []).map((it, i) => {
          const d = DECISION_LABEL[it.decision ?? ""] ?? { text: it.decision ?? "", cls: "bg-gray-100 text-gray-600" };
          return (
            <div key={`${it.profileId}-${it.at}-${i}`} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                <Link href={`/admin/care-seekers/${it.profileId}`} className="font-medium text-gray-800 hover:underline">
                  {it.who}
                </Link>
                {it.state && <span>{it.state}</span>}
                <span>{new Date(it.at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET</span>
                <span className="uppercase tracking-wide text-[10px]">{it.mode}</span>
                <span className={`ml-auto rounded px-2 py-0.5 text-[11px] ${d.cls}`}>{d.text}</span>
              </div>
              {it.theySaid && (
                <p className="mt-3 text-sm text-gray-900">
                  <span className="text-gray-400">They wrote: </span>&ldquo;{it.theySaid}&rdquo;
                </p>
              )}
              {it.wouldSay && (
                <p className="mt-2 text-sm text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap">
                  {it.mode === "practice" ? "Would say: " : "Said: "}
                  {it.wouldSay}
                </p>
              )}
              {it.reason && it.decision === "escalate" && <p className="mt-2 text-xs text-gray-400">Why a person: {it.reason}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

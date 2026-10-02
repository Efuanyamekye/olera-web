"use client";

import { useCallback, useEffect, useState } from "react";
import AdminWorkspace from "@/components/admin/AdminWorkspace";

/**
 * Today's inbox items, the same numbered list the Telegram synopsis and the
 * inbox report show, worked in the browser. TJ, 2026-10-02: "So I can handle
 * these emails on my computer." Every button calls /api/admin/inbox/today,
 * which runs the Telegram command path, so either surface can finish an item
 * and the other sees it.
 */

type Item = {
  number: number;
  kind: "triage_batch" | "sms_draft" | "email_draft" | "question" | "slack_draft" | "proposal";
  category: string;
  who: string;
  summary: string;
  text: string | null;
  version: string | null;
  checked: boolean;
  sends: boolean;
  namedOnly: boolean;
  permalink: string | null;
  carried: boolean;
};

const SECTIONS: Array<{ title: string; match: (item: Item) => boolean }> = [
  { title: "Provider emails", match: (i) => i.kind === "email_draft" && i.category === "email:draft:provider" },
  { title: "Family emails", match: (i) => i.kind === "email_draft" && i.category !== "email:draft:provider" },
  { title: "Texts", match: (i) => i.kind === "sms_draft" },
  { title: "Slack: replies you owe", match: (i) => i.kind === "slack_draft" },
  { title: "Organic: today's action", match: (i) => i.kind === "proposal" },
  { title: "Clear", match: (i) => i.kind === "triage_batch" },
  { title: "Call back and questions", match: (i) => i.kind === "question" },
];

function approveLabel(item: Item): string {
  if (item.kind === "email_draft") return item.sends ? "Approve: send from support@" : "Approve: save Gmail draft";
  if (item.kind === "sms_draft") return "Approve: send text";
  if (item.kind === "slack_draft") return "Approve: post as you";
  if (item.kind === "proposal") return "Approve: hand off";
  return "Approve";
}

export default function InboxTodayPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, { ok: boolean; text: string }>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/inbox/today", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setItems(json.items as Item[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load today's items");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(item: Item, action: "approve" | "check" | "skip") {
    setBusy((b) => ({ ...b, [item.number]: action }));
    try {
      const text = drafts[item.number];
      const res = await fetch("/api/admin/inbox/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, number: item.number, text: text ?? null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResults((r) => ({ ...r, [item.number]: { ok: true, text: String(json.result) } }));
      if (action !== "check") {
        setDrafts((d) => { const next = { ...d }; delete next[item.number]; return next; });
        await load();
      }
    } catch (err) {
      setResults((r) => ({ ...r, [item.number]: { ok: false, text: err instanceof Error ? err.message : "Action failed" } }));
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[item.number]; return next; });
    }
  }

  const isDraft = (item: Item) => item.kind === "email_draft" || item.kind === "sms_draft" || item.kind === "slack_draft";
  const canAct = (item: Item) => item.kind !== "question" || item.category === "email:voicemail_callbacks";
  const recentlyDone = Object.entries(results).filter(([n]) => !items?.some((i) => i.number === Number(n)));

  return (
    <AdminWorkspace>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Today&apos;s inbox</h1>
            <p className="mt-1 text-sm text-gray-500">
              The same numbered items as Cortex&apos;s Telegram message. Anything you do here shows there, and the reverse.
              Items expire at the next 8 AM pass and come back if they&apos;re still waiting.
            </p>
          </header>

          {loadError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError} <button className="ml-2 underline" onClick={() => void load()}>Try again</button>
            </div>
          )}
          {!items && !loadError && <p className="text-sm text-gray-500">Loading today&apos;s items…</p>}
          {items && items.length === 0 && (
            <p className="rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
              Nothing is waiting. The next inbox pass runs at 8 AM Bangkok.
            </p>
          )}

          {recentlyDone.length > 0 && (
            <div className="mb-6 space-y-1">
              {recentlyDone.map(([n, r]) => (
                <p key={n} className={`text-sm ${r.ok ? "text-gray-600" : "text-red-700"}`}>{r.text}</p>
              ))}
            </div>
          )}

          {items && SECTIONS.map((section) => {
            const rows = items.filter(section.match);
            if (!rows.length) return null;
            return (
              <section key={section.title} className="mb-8">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{section.title}</h2>
                <div className="divide-y divide-gray-200 border-y border-gray-200">
                  {rows.map((item) => {
                    const result = results[item.number];
                    const running = busy[item.number];
                    return (
                      <article key={item.number} className="py-4">
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-sm text-gray-400">{item.number}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">{item.who}</p>
                            <p className="mt-0.5 text-sm text-gray-600">{item.summary}</p>
                            {item.permalink && (
                              <a className="mt-1 inline-block text-xs text-primary-700 underline" href={item.permalink} target="_blank" rel="noreferrer">Open in Slack</a>
                            )}
                          </div>
                        </div>

                        {isDraft(item) && (
                          <div className="mt-3 pl-7">
                            {item.version && (
                              <p className="mb-1 text-xs text-gray-500">{item.version}{item.checked ? ", fact-checked" : ""}</p>
                            )}
                            <textarea
                              className="w-full rounded-md border border-gray-300 p-3 text-sm leading-relaxed text-gray-900 focus:border-primary-500 focus:outline-none"
                              rows={Math.min(12, Math.max(3, Math.ceil((drafts[item.number] ?? item.text ?? "").length / 80) + 1))}
                              value={drafts[item.number] ?? item.text ?? ""}
                              onChange={(e) => setDrafts((d) => ({ ...d, [item.number]: e.target.value }))}
                              placeholder="No draft. Write the reply here."
                            />
                            {drafts[item.number] !== undefined && drafts[item.number] !== (item.text ?? "") && (
                              <p className="mt-1 text-xs text-gray-500">Edited. Approve sends your version; Check fact-checks it first.</p>
                            )}
                          </div>
                        )}
                        {!isDraft(item) && item.text && (
                          <pre className="mt-3 whitespace-pre-wrap pl-7 font-sans text-sm text-gray-600">{item.text}</pre>
                        )}

                        {canAct(item) && (
                          <div className="mt-3 flex flex-wrap gap-2 pl-7">
                            {item.kind !== "question" && (
                              <button
                                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                                disabled={Boolean(running)}
                                onClick={() => void act(item, "approve")}
                              >
                                {running === "approve" ? "Working…" : approveLabel(item)}
                              </button>
                            )}
                            {(item.kind === "email_draft" || item.kind === "sms_draft") && (
                              <button
                                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 disabled:opacity-50"
                                disabled={Boolean(running)}
                                onClick={() => void act(item, "check")}
                              >
                                {running === "check" ? "Checking…" : "Check"}
                              </button>
                            )}
                            <button
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 disabled:opacity-50"
                              disabled={Boolean(running)}
                              onClick={() => void act(item, "skip")}
                            >
                              {running === "skip" ? "Skipping…" : "Skip"}
                            </button>
                          </div>
                        )}

                        {result && (
                          <p className={`mt-2 whitespace-pre-wrap pl-7 text-sm ${result.ok ? "text-gray-700" : "text-red-700"}`}>{result.text}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AdminWorkspace>
  );
}

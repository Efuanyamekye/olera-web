"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Case history for one Ad Boost campaign.
 *
 * A campaign is a case with a history, not a row with a status. This is where that
 * history lives: setup, hypothesis, tweaks, observations, check-ins, provider comms,
 * outcomes — newest first.
 *
 * The one rule worth knowing: a `tweak` cannot be saved without saying what you expect
 * it to do and when you will come back and check. Unreviewed tweaks past their date
 * surface at the top of this section and as a badge on the queue, because a change
 * nobody evaluated is how a working campaign gets rebuilt into a dead one.
 *
 * The list itself is COLLAPSED by default and sits at the foot of the campaign page.
 * Entries carry full audit detail and a busy campaign accumulates dozens of them, which
 * buried the status controls, metrics and photo review under several screens of prose.
 * The overdue block deliberately stays OUTSIDE the collapse: hiding a change nobody
 * evaluated behind a disclosure would defeat the rule above. Everything that forces an
 * action is visible while shut; only the archive is folded away.
 */

export type CaseEntry = {
  id: string;
  request_id: string | null;
  google_campaign_id: string | null;
  campaign_tag: string | null;
  entry_type: string;
  summary: string;
  detail: string | null;
  before_state: unknown;
  after_state: unknown;
  expected_signal: string | null;
  review_after: string | null;
  reviewed_at: string | null;
  review_outcome: string | null;
  metrics_snapshot: unknown;
  occurred_at: string;
  author: string;
  created_at: string;
};

const ENTRY_TYPES = [
  "observation",
  "tweak",
  "check_in",
  "hypothesis",
  "setup",
  "provider_comms",
  "outcome",
  "alert",
] as const;

const TYPE_LABEL: Record<string, string> = {
  setup: "Setup",
  hypothesis: "Hypothesis",
  tweak: "Tweak",
  observation: "Observation",
  check_in: "Check-in",
  alert: "Alert",
  provider_comms: "Provider comms",
  outcome: "Outcome",
};

/** Colour carries meaning: what we changed, what we noticed, what we told them. */
const TYPE_STYLE: Record<string, string> = {
  setup: "bg-gray-100 text-gray-600",
  hypothesis: "bg-indigo-50 text-indigo-700",
  tweak: "bg-amber-50 text-amber-800",
  observation: "bg-sky-50 text-sky-700",
  check_in: "bg-emerald-50 text-emerald-700",
  alert: "bg-red-50 text-red-700",
  provider_comms: "bg-violet-50 text-violet-700",
  outcome: "bg-teal-50 text-teal-800",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function isOverdue(e: CaseEntry): boolean {
  return !!e.review_after && !e.reviewed_at && new Date(e.review_after) <= new Date();
}

export default function AdBoostCaseTimeline({
  requestId,
  campaignTag,
  googleCampaignId,
}: {
  requestId: string;
  campaignTag: string | null;
  googleCampaignId?: string | null;
}) {
  const [entries, setEntries] = useState<CaseEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [entryType, setEntryType] = useState<string>("observation");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [expectedSignal, setExpectedSignal] = useState("");
  const [reviewAfter, setReviewAfter] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ad-boost/case?request=${encodeURIComponent(requestId)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to load case history");
      }
      const json = await res.json();
      setEntries((json.entries as CaseEntry[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load case history");
      setEntries([]);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const overdue = useMemo(() => (entries ?? []).filter(isOverdue), [entries]);

  // Default the review date to three days out — long enough for Google reporting to
  // settle, short enough that a dead campaign does not sit for two weeks.
  const openForm = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    setReviewAfter(d.toISOString().slice(0, 10));
    setShowForm(true);
    // Writing an entry means reading the ones above it — never leave the author
    // typing into a form whose context is folded shut.
    setOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ad-boost/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          campaign_tag: campaignTag,
          google_campaign_id: googleCampaignId ?? null,
          entry_type: entryType,
          summary,
          detail: detail || null,
          expected_signal: entryType === "tweak" ? expectedSignal : null,
          review_after:
            entryType === "tweak" && reviewAfter
              ? new Date(`${reviewAfter}T12:00:00Z`).toISOString()
              : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save entry");
      }
      setSummary("");
      setDetail("");
      setExpectedSignal("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  const markReviewed = async (id: string) => {
    const outcome = window.prompt("What did you find when you checked?");
    if (!outcome || !outcome.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/admin/ad-boost/case", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, review_outcome: outcome.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to record review");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record review");
    }
  };

  const canSubmit =
    summary.trim().length > 0 &&
    (entryType !== "tweak" || (expectedSignal.trim().length > 0 && reviewAfter.length > 0));

  return (
    <section className="mb-5 rounded-xl border border-gray-200 bg-white p-5">
      <div
        className={`flex items-start justify-between gap-3 ${
          open || error || overdue.length > 0 ? "mb-4" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="case-history-body"
          className="-m-1 flex min-w-0 items-start gap-2 rounded p-1 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
        >
          <svg
            className={`mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Case history</span>
              <span className="text-xs text-gray-400">
                {entries === null
                  ? "loading…"
                  : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-gray-500">
              {open
                ? "What we did, what we expected, and what happened. Every tweak has to say what it should produce and when to check."
                : "What we did, what we expected, and what happened."}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {campaignTag && (
            <a
              href={`/api/admin/ad-boost/case?tag=${encodeURIComponent(campaignTag)}&format=md`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-gray-400 hover:text-gray-600"
            >
              Read as text ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => (showForm ? setShowForm(false) : openForm())}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
          >
            {showForm ? "Cancel" : "Add entry"}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {overdue.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">
            {overdue.length} change{overdue.length === 1 ? "" : "s"} past review
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {overdue.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3">
                <span className="text-xs leading-relaxed text-amber-900">
                  {e.summary}
                  <span className="text-amber-700"> · due {fmtDate(e.review_after)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => markReviewed(e.id)}
                  className="shrink-0 rounded border border-amber-400 px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                >
                  Record what you found
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Everything below the fold line. The overdue block above stays outside it on
          purpose — an unreviewed change has to stay in the operator's face. */}
      <div id="case-history-body">
      {open && showForm && (
        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap gap-1.5">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEntryType(t)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  entryType === t ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One line: what happened"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Why, and anything a future reader would need. Optional."
            rows={3}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />

          {entryType === "tweak" && (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-medium text-amber-900">
                A tweak needs an expectation. Without one there is nothing to evaluate later.
              </p>
              <input
                value={expectedSignal}
                onChange={(e) => setExpectedSignal(e.target.value)}
                placeholder="What should this produce? e.g. impressions on the restored keywords within 72h"
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-xs text-amber-900">
                Check back on
                <input
                  type="date"
                  value={reviewAfter}
                  onChange={(e) => setReviewAfter(e.target.value)}
                  className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm"
                />
              </label>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSubmit || saving}
              onClick={submit}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
            {!canSubmit && summary.trim() && entryType === "tweak" && (
              <span className="text-xs text-gray-500">
                Add what you expect and a date to check it.
              </span>
            )}
          </div>
        </div>
      )}

      {open && !entries && <p className="text-sm text-gray-400">Loading…</p>}
      {open && entries && entries.length === 0 && (
        <p className="text-sm text-gray-400">
          No entries yet. The first one should be what this campaign is meant to do.
        </p>
      )}

      {open && entries && entries.length > 0 && (
        <ol className="flex flex-col">
          {entries.map((e, i) => (
            <li
              key={e.id}
              className={`flex gap-3 py-3 ${i < entries.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <div className="w-24 shrink-0 pt-0.5">
                <div className="text-xs font-medium text-gray-500">{fmtDate(e.occurred_at)}</div>
                <div className="mt-1 text-[10px] text-gray-400">{e.author}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      TYPE_STYLE[e.entry_type] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {TYPE_LABEL[e.entry_type] ?? e.entry_type}
                  </span>
                  {isOverdue(e) && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      Review overdue
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900">{e.summary}</p>
                {e.detail && (
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                    {e.detail}
                  </p>
                )}
                {(e.before_state != null || e.after_state != null) && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700">
                    {JSON.stringify({ before: e.before_state, after: e.after_state }, null, 2)}
                  </pre>
                )}
                {e.expected_signal && (
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Expected:</span> {e.expected_signal}
                  </p>
                )}
                {e.reviewed_at && (
                  <p className="mt-1 text-xs text-emerald-700">
                    <span className="font-medium">Reviewed {fmtDate(e.reviewed_at)}:</span>{" "}
                    {e.review_outcome}
                  </p>
                )}
                {e.review_after && !e.reviewed_at && !isOverdue(e) && (
                  <p className="mt-1 text-xs text-gray-500">
                    Check back {fmtDate(e.review_after)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      </div>
    </section>
  );
}

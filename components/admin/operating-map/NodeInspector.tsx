"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The receipts behind one number: the table it came from, the filters in
 * plain words, and the most recent rows with timestamps.
 *
 * Rendered outside the scaled figure so it stays readable, and it fetches
 * only when a node is actually opened — nobody pays for rows they did not
 * ask to see.
 */

interface InspectResult {
  title: string;
  table: string;
  where: string[];
  rows: { when: string; summary: string }[];
  note: string;
}

export default function NodeInspector({
  node,
  params,
  onClose,
}: {
  node: string;
  /** The map's current window and city, already serialized. */
  params: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Bring the panel to the reader.
   *
   * The map is scaled to fill the viewport, so anything rendered beneath it
   * begins below the fold. Without this, clicking a number looks like
   * nothing happened — the answer arrives somewhere you cannot see.
   */
  useEffect(() => {
    // Twice: once on open so the motion starts with the click, once when the
    // rows land and the panel is taller. "nearest" makes the second a no-op
    // if it is already fully in view.
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [node, data, error]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/admin/operating-map/inspect?node=${node}&${params}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? "Could not load rows");
        return body as InspectResult;
      })
      .then(setData)
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        setError((e as Error)?.message ?? "Could not load rows");
      });
    return () => controller.abort();
  }, [node, params]);

  return (
    <div ref={panelRef} className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
            Where this number comes from
          </p>
          <h3 className="mt-1 text-base font-semibold text-gray-900">
            {data?.title ?? node.toUpperCase()}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          Close
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-gray-500">{error}</p>}
      {!data && !error && <p className="mt-3 text-sm text-gray-400">Loading…</p>}

      {data && (
        <>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-gray-500">Table</dt>
            <dd className="font-mono text-[13px] text-gray-900">{data.table}</dd>
            <dt className="text-gray-500">Counting</dt>
            <dd className="text-gray-900">{data.where.join(" · ")}</dd>
          </dl>

          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
            {data.note}
          </p>
          {data.rows.length > 0 && (
            <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
              {data.rows.map((row, i) => (
                <li key={`${row.when}-${i}`} className="flex gap-4 py-1.5 text-[13px]">
                  <span className="w-40 shrink-0 tabular-nums text-gray-400">
                    {new Date(row.when).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 truncate text-gray-700">{row.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

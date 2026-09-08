"use client";

import { useState } from "react";
import { shortDate } from "./types";

/**
 * The control the whole workspace turns on.
 *
 * The Consumer Relations Manager ticks operational facts. Nothing here
 * selects a status: the parent sends the tick to the engine and re-reads
 * whatever it decided. That is why there is no status picker anywhere in
 * this feature except the deliberate not-available escape.
 *
 * A tick is a network write, so the box moves immediately and the write
 * follows. If the write fails the box goes back and says why, because a
 * checkbox that silently springs back is indistinguishable from a dead
 * one.
 */

export interface ChecklistItem {
  key: string;
  label: string;
  progress?: boolean;
}

export default function LiveWinChecklist({
  scope,
  liveWhen,
  rule,
  items,
  criteria,
  disabled,
  onToggle,
}: {
  /** Unique per rendered checklist. Two channels can share a criterion
   *  key (ST3 and ST7 both have `approved`), and duplicate DOM ids would
   *  point a label at the wrong box. */
  scope: string;
  liveWhen: string;
  rule: "all" | "any";
  items: ChecklistItem[];
  criteria: Record<string, string>;
  disabled?: boolean;
  onToggle: (key: string, checked: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: string, checked: boolean) => {
    setBusy(key);
    setError(null);
    setPending((p) => ({ ...p, [key]: checked }));
    try {
      await onToggle(key, checked);
      // The parent has re-read the record, so the prop is the truth again.
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    } catch (e) {
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
      setError(e instanceof Error ? e.message : "Could not save that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const required = items.filter((i) => !i.progress);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Live win</p>
      <p className="mt-0.5 text-[13px] text-gray-700">{liveWhen}</p>
      {required.length > 1 ? (
        <p className="mt-0.5 text-[11px] text-gray-500">
          {rule === "all" ? "All required." : "Any one is enough."}
        </p>
      ) : null}

      <ul className="mt-2 space-y-1.5">
        {items.map((i) => {
          const at = criteria[i.key];
          const checked = i.key in pending ? pending[i.key] : Boolean(at);
          const id = `crit-${scope}-${i.key}`;
          return (
            <li key={i.key} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || busy === i.key}
                onChange={(e) => void toggle(i.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                id={id}
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className="text-[13px] text-gray-800">{i.label}</span>
                {i.progress ? (
                  <span className="ml-1.5 text-[11px] text-gray-400">progress only</span>
                ) : null}
              </label>
              {at ? (
                <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                  {shortDate(at)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="mt-2 rounded-md bg-error-50 px-2 py-1.5 text-[12px] text-error-700">{error}</p>
      ) : null}
    </div>
  );
}

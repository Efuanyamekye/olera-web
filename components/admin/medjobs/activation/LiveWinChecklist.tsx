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
 */

export interface ChecklistItem {
  key: string;
  label: string;
  progress?: boolean;
}

export default function LiveWinChecklist({
  liveWhen,
  rule,
  items,
  criteria,
  disabled,
  onToggle,
}: {
  liveWhen: string;
  rule: "all" | "any";
  items: ChecklistItem[];
  criteria: Record<string, string>;
  disabled?: boolean;
  onToggle: (key: string, checked: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (key: string, checked: boolean) => {
    setBusy(key);
    try {
      await onToggle(key, checked);
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
          return (
            <li key={i.key} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={Boolean(at)}
                disabled={disabled || busy === i.key}
                onChange={(e) => void toggle(i.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                id={`crit-${i.key}`}
              />
              <label htmlFor={`crit-${i.key}`} className="min-w-0 flex-1 cursor-pointer">
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
    </div>
  );
}

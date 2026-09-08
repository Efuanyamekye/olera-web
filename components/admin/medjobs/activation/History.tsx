"use client";

import { useState } from "react";
import type { ActivationNote } from "./types";

/**
 * Collapsed by default with the count on the toggle, so the record stays
 * available without crowding the expanded view.
 */
export default function History({
  notes,
  onAdd,
}: {
  notes: ActivationNote[];
  onAdd: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      await onAdd(text);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...notes].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
        >
          {open ? "▾" : "▸"} History ({notes.length})
        </button>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[11px] font-medium text-primary-700 hover:text-primary-800"
          >
            Add note
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-[12px] text-gray-500">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-1">
              {sorted.map((n, i) => (
                <li key={`${n.at}-${i}`} className="flex gap-2 text-[12px]">
                  <span className="shrink-0 tabular-nums text-gray-400">
                    {new Date(n.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span className="text-gray-700">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="Add a note"
              className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-[12px] focus:border-primary-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={saving || !draft.trim()}
              className="rounded-md bg-primary-600 px-2 py-1 text-[12px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

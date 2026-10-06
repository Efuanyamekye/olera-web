"use client";

import { useCallback, useEffect, useState } from "react";
import { CHANNEL_ORDER } from "@/lib/medjobs/activation";
import StatusDot, { DueDot, statusLabel } from "./StatusDot";
import UniversityDrawer from "./UniversityDrawer";
import { Drawer } from "@/app/admin/student-outreach/Drawer";
import type { ActivationUniversity } from "./types";

/**
 * The list the Consumer Relations Manager opens first: every university,
 * the state of all five channels, and a red dot where something is due.
 *
 * Deliberately no owner, no counts, no next action and no filters. This
 * surface answers one question, which is where the work is, and the answer
 * has to survive being read at a glance across dozens of rows.
 */

// Providers and Students come first: they are the profiles a campus holds,
// and the five channels are how you reach it. Their counts (clients confirmed,
// students qualified) are not instrumented yet, so they render as a dash
// rather than a plausible-looking zero.
const PROFILE_HEADINGS = ["Providers", "Students"];
const HEADINGS = ["Job board", "Advisors", "Student orgs", "Events", "Professors"];

export default function ActivationTab({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const [rows, setRows] = useState<ActivationUniversity[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // A provider opened from inside a university. Layered over the
  // university drawer so closing it returns to the campus.
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  // Incremented when a provider action is taken, forcing UniversityDrawer
  // to remount and refetch its data.
  const [drawerKey, setDrawerKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/medjobs/activation");
      const d = (await res.json()) as {
        universities: ActivationUniversity[];
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? `Request failed (${res.status}).`);
      // Anything needing attention first, then alphabetical. The manager
      // works top down and stops when the dots run out.
      setRows(
        [...d.universities].sort(
          (a, b) => Number(b.due) - Number(a.due) || a.name.localeCompare(b.name),
        ),
      );
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "University activation could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <p className="rounded-md bg-error-50 px-3 py-2.5 text-sm text-error-700">{failed}</p>
    );
  }
  if (!rows) {
    return <p className="px-1 py-8 text-sm text-gray-500">Loading universities…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center">
        <p className="text-sm font-medium text-gray-900">No universities yet</p>
        <p className="mt-1 text-xs text-gray-500">
          Universities appear here once activation begins.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                University
              </th>
              {[...PROFILE_HEADINGS, ...HEADINGS].map((h) => (
                <th
                  key={h}
                  className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr
                key={u.slug}
                onClick={() => setOpen(u.slug)}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="w-2 shrink-0">{u.due ? <DueDot /> : null}</span>
                    <span className="text-[13px] font-medium text-gray-900">{u.name}</span>
                  </span>
                </td>
                {PROFILE_HEADINGS.map((h) => (
                  <td key={h} className="py-2.5 pr-3 text-[12px] text-gray-400">
                    —
                  </td>
                ))}
                {/* Dots only. The "N of M" that used to live here made the row
                    too wide to scan, which is the one thing this table is for. */}
                {CHANNEL_ORDER.map((key) => {
                  const ch = u.channels.find((c) => c.channel === key)!;
                  return (
                    <td key={key} className="py-2.5 pr-3">
                      <span className="flex items-center" title={statusLabel(ch.status)}>
                        <StatusDot status={ch.status} />
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-gray-500">
        A red dot means something is due or overdue at that university.
      </p>

      {open ? (
        <UniversityDrawer
          key={`${open}-${drawerKey}`}
          slug={open}
          onClose={() => setOpen(null)}
          onOpenTask={onOpenTask}
          onChanged={() => void load()}
          onOpenProvider={(id) => setOpenProvider(id)}
        />
      ) : null}
      {openProvider && (
        <Drawer
          outreachId={openProvider}
          onClose={() => setOpenProvider(null)}
          onAction={() => {
            void load();
            setDrawerKey((k) => k + 1);
          }}
          activeTab="tasks"
        />
      )}
</>
  );
}

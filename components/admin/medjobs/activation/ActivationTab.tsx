"use client";

import { useCallback, useEffect, useState } from "react";
import { CHANNEL_ORDER } from "@/lib/medjobs/activation";
import StatusDot, { DueDot, statusLabel } from "./StatusDot";
import UniversityDrawer from "./UniversityDrawer";
import type { ActivationUniversity } from "./types";

/**
 * The list the Consumer Relations Manager opens first: every university,
 * the state of all five channels, and a red dot where something is due.
 *
 * Deliberately no owner, no counts, no next action and no filters. This
 * surface answers one question, which is where the work is, and the answer
 * has to survive being read at a glance across dozens of rows.
 */

const HEADINGS = ["Job board", "Listserv", "Student orgs", "Events", "Professors"];

export default function ActivationTab({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const [rows, setRows] = useState<ActivationUniversity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/medjobs/activation");
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { universities: ActivationUniversity[] };
      // Anything needing attention first, then alphabetical. The manager
      // works top down and stops when the dots run out.
      setRows(
        [...d.universities].sort(
          (a, b) => Number(b.due) - Number(a.due) || a.name.localeCompare(b.name),
        ),
      );
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return <p className="px-1 py-8 text-sm text-gray-500">University activation could not be loaded.</p>;
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
              {HEADINGS.map((h) => (
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
                {CHANNEL_ORDER.map((key) => {
                  const ch = u.channels.find((c) => c.channel === key)!;
                  const isList = ch.recordCount !== null && ch.recordCount > 0;
                  return (
                    <td key={key} className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        <StatusDot status={ch.status} />
                        <span className="text-[12px] text-gray-700">
                          {isList ? `${ch.liveCount} of ${ch.recordCount}` : statusLabel(ch.status)}
                        </span>
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
          slug={open}
          onClose={() => setOpen(null)}
          onOpenTask={onOpenTask}
          onChanged={() => void load()}
        />
      ) : null}
    </>
  );
}

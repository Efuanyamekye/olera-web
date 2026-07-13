"use client";

import { useMemo, type ReactNode } from "react";
import type { TabRow } from "@/lib/student-outreach/types";
import { sortRepliesRows } from "@/lib/student-outreach/tab-config";

/**
 * Emails tab, split into two labeled sections (same ops cards as everywhere —
 * this only groups them under headers):
 *
 *   "They replied (N)"  — rows with a landed reply to the CURRENT cadence
 *                         awaiting triage (replies_state === "engaged"). These
 *                         need the admin to read the reply and launch the next
 *                         sequence. Pinned to the top.
 *   "Pending reply (N)" — everyone else in the tab (still in cadence,
 *                         opened/clicked, no reply, promised a callback, …).
 *
 * "engaged" resets to a non-reply state the moment a new cadence launches — the
 * shared cadence cutoff in state-derivation.ts — so a row that replied to
 * outreach and then had activation launched drops back to "Pending reply" until
 * it replies to the activation cadence. That keeps this tab in lockstep with the
 * drawer's Next Step, which uses the same cutoff.
 */
export function RepliesGroupedList({
  rows,
  renderRow,
}: {
  rows: TabRow[];
  renderRow: (row: TabRow) => ReactNode;
}) {
  const { replied, pending } = useMemo(() => {
    const sorted = sortRepliesRows(rows);
    return {
      replied: sorted.filter((r) => r.replies_state === "engaged"),
      pending: sorted.filter((r) => r.replies_state !== "engaged"),
    };
  }, [rows]);

  if (replied.length === 0 && pending.length === 0) return null;

  return (
    <div className="space-y-8">
      {replied.length > 0 && (
        <Section title="They replied" count={replied.length} rows={replied} renderRow={renderRow} />
      )}
      {pending.length > 0 && (
        <Section title="Pending reply" count={pending.length} rows={pending} renderRow={renderRow} />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  rows,
  renderRow,
}: {
  title: string;
  count: number;
  rows: TabRow[];
  renderRow: (row: TabRow) => ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title} ({count})
      </h3>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.row_key ?? row.id}>{renderRow(row)}</li>
        ))}
      </ul>
    </section>
  );
}

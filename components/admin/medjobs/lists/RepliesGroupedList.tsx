"use client";

import { useMemo, type ReactNode } from "react";
import type { TabRow } from "@/lib/student-outreach/types";
import { sortRepliesRows } from "@/lib/student-outreach/tab-config";

/**
 * Emails tab, split into two labeled sections (same ops cards as everywhere —
 * this only groups them under headers):
 *
 *   "They replied (N)"  — rows with an actual EMAIL reply to the CURRENT cadence
 *                         (has_email_reply) awaiting triage. These need the admin
 *                         to read the reply and launch the next sequence. Pinned
 *                         to the top.
 *   "Pending reply (N)" — everyone else in the tab (still in cadence,
 *                         opened/clicked, no reply, promised a callback, …).
 *
 * The split keys off has_email_reply (an email_replied touchpoint after the
 * cadence cutoff), NOT replies_state — so a non-email engagement (contact-form
 * submission, IG DM) that still marks the row "engaged" does NOT land in "They
 * replied" with an empty reply box. The cutoff also means a row that replied to
 * outreach and then had a new cadence launched drops back to "Pending reply"
 * until it replies to the new cadence. Both keep this tab in lockstep with the
 * drawer's reply box, which shows a reply under the exact same condition.
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
      replied: sorted.filter((r) => r.has_email_reply === true),
      pending: sorted.filter((r) => r.has_email_reply !== true),
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

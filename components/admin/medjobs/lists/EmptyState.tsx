"use client";

import type { TabCounts } from "@/lib/student-outreach/types";
import type { TabKey } from "@/lib/student-outreach/tab-config";

/**
 * MedJobs row-list empty state. Two-tier:
 *   - tabCounts.all === 0  → "No stakeholders yet" CTA + Add button
 *   - else                 → tab-specific blurb
 *
 * Extracted from app/admin/student-outreach/page.tsx as part of the
 * v9.0 MedJobs reorg (Phase 0).
 */
export function EmptyState({
  tab,
  tabCounts,
  onAdd,
}: {
  tab: TabKey;
  tabCounts: TabCounts | null;
  onAdd: () => void;
}) {
  const totalZero = (tabCounts?.all ?? 0) === 0;
  if (totalZero) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium text-gray-700">No stakeholders yet.</p>
        <p className="mt-1 text-xs text-gray-500">
          Pick a campus, find a pre-health advisor or pre-med society, and click below to add them.
        </p>
        <button
          onClick={onAdd}
          className="mt-4 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          + Add Stakeholder
        </button>
      </div>
    );
  }
  const blurbs: Record<TabKey, string> = {
    providers: "No provider work right now.",
    partner_book: "No partner work right now.",
    unread: "✓ Inbox zero — nothing unread.",
    undone: "✓ All caught up — no aging tasks.",
    clients: "No clients with open tasks.",
    candidates: "No candidates need review right now.",
    prospects: "No prospects need research right now.",
    calls: "No phone calls due. 🎉",
    replies: "No inbox triage right now. The cadence is humming along.",
    meetings: "No meetings in flight or booked.",
    followup: "✓ Nothing to follow up — no finished cadences waiting on a decision.",
    partners: "No partners with open tasks.",
    sites: "No sites need research or have open tasks.",
    campuses: "No sites configured yet.",
    archive: "Archive is empty — no stale or no-response outreach yet.",
    all: "No matches.",
    outbound: "Coming soon — outbound activity log.",
    emails_sent: "Coming soon — email-send log.",
    signups: "Coming soon — student-signup feed.",
    activation: "No universities in activation yet.",
    tasks: "Nothing due.",
  };
  return <p className="py-12 text-center text-sm text-gray-400">{blurbs[tab]}</p>;
}

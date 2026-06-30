"use client";

/**
 * The Pre-Flight verify call (Config A), shared by the provider Research Card
 * (SnapshotCard) and the office/stakeholder Research section (Drawer). Wraps
 * <CallOutcomeModal> with the pre-flight outcome set + dispatch:
 *   Confirmed contact info → log_research_call(connected, verified) — unlocks Launch
 *   No answer / Voicemail   → log_research_call(...) — stays in Pre-Flight
 *   Not interested          → log_call_outcome(connected_not_interested) — closes row
 * No "Interested" here (there's no warm signal pre-launch) and no "Wrong
 * number" (research a new number in the card instead). Notes are optional but
 * cannot alone satisfy the call — Pre-Flight needs a categorical outcome.
 */

import { CallOutcomeModal, type OutcomeChoice } from "@/components/admin/medjobs/CallOutcomeModal";
import type { DrawerContext } from "@/lib/student-outreach/types";

type ActionFn = (
  actionName: string,
  payload?: Record<string, unknown>,
) => Promise<DrawerContext>;

const OUTCOMES: OutcomeChoice[] = [
  {
    key: "confirmed",
    label: "Confirmed contact info",
    blurb: "Reached someone and verified the email / decision maker. Pre-Flight passes.",
    tone: "happy",
  },
  {
    key: "no_answer",
    label: "No answer",
    blurb: "Nobody answered. Stays in Pre-Flight — try again later.",
    tone: "neutral",
  },
  {
    key: "voicemail",
    label: "Voicemail",
    blurb: "Left a message. Stays in Pre-Flight — try again later.",
    tone: "neutral",
  },
  {
    key: "not_interested",
    label: "Not interested",
    blurb: "They don't want information. Closes the row — no outreach.",
    tone: "close",
  },
];

export function PreFlightCallModal({
  organizationName,
  campusName,
  phone,
  action,
  onCancel,
  onDone,
  setError,
  onOverrideLaunch,
}: {
  organizationName: string;
  campusName?: string | null;
  phone: string | null;
  action: ActionFn;
  onCancel: () => void;
  onDone: () => void;
  setError: (msg: string | null) => void;
  /** When provided, an always-visible "Override & launch outreach" button is
   *  shown in the modal footer. It bypasses the confirm-call requirement
   *  (writes pre_flight_overridden) and then runs the caller's launch flow —
   *  the escape hatch for when a contact can't be reached by phone. */
  onOverrideLaunch?: () => Promise<void> | void;
}) {
  const campus = campusName?.trim() || "campus";
  const script = `"Hi, this is [your name] from Dr. DuBose's office, calling about his Student Caregiver Program for ${campus} students. I'd like to send your team an email with the details, and wanted to check first on the best address to send it to."`;

  const dispatch = async (outcomeKey: string | null, notes: string | null) => {
    setError(null);
    try {
      switch (outcomeKey) {
        case "confirmed":
          await action("log_research_call", { outcome: "connected", verified: true, notes });
          break;
        case "no_answer":
          await action("log_research_call", { outcome: "no_answer", notes });
          break;
        case "voicemail":
          await action("log_research_call", { outcome: "voicemail", notes });
          break;
        case "not_interested":
          await action("log_call_outcome", { outcome: "connected_not_interested", notes });
          break;
        default:
          return;
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log outcome");
      throw e;
    }
  };

  return (
    <CallOutcomeModal
      title="Log Pre-Flight outcome"
      subtitle={
        <>
          {organizationName}
          {phone && ` · ${phone}`}
        </>
      }
      scriptLabel="Suggested script"
      script={script}
      outcomes={OUTCOMES}
      notesPlaceholder="What did they confirm? Anything useful for outreach copy?"
      onCancel={onCancel}
      onSubmit={dispatch}
      extraAction={
        onOverrideLaunch
          ? {
              label: "Override & launch outreach",
              savingLabel: "Launching…",
              onClick: async () => {
                setError(null);
                // Bypass the confirm-call gate (e.g. unreachable by phone),
                // then run the caller's launch flow.
                await action("override_pre_flight");
                onDone();
                await onOverrideLaunch();
              },
            }
          : undefined
      }
    />
  );
}

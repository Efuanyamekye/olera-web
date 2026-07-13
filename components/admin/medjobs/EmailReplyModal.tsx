"use client";

/**
 * "Check for reply" flow — the reply outcome modal. Shows the provider's landed
 * reply (or a "no reply yet" empty state) via <ReplyBlock>, then the outcomes
 * that move the funnel toward a MEETING (the single goal of every cadence):
 *   Launch activation cadence     → the standard activation sequence
 *   ✎ Launch custom cadence        → admin composes a bespoke email+call cadence
 *   ↻ OOO reply — restart last     → resume the paused cadence (out-of-office fix)
 *   📅 Book a meeting               → mark scheduled + open Calendly
 *   Not interested                 → close the row
 *
 * Partner/client conversion is intentionally NOT here — it's a post-meeting
 * decision (Meeting outcome + call follow-up flows).
 */

import { useState } from "react";
import {
  CallOutcomeModal,
  type OutcomeChoice,
} from "@/components/admin/medjobs/CallOutcomeModal";
import { ReplyBlock } from "@/components/admin/medjobs/ReplyBlock";
import { CadenceLaunchModal } from "@/app/admin/student-outreach/CadenceLaunchModal";
import { CustomCadenceModal } from "@/components/admin/medjobs/CustomCadenceModal";
import { linkageFromResearchData } from "@/lib/medjobs/smartlead-inbox";
import { bookingUrlFor } from "@/lib/medjobs/booking-url";
import type { DrawerContext } from "@/lib/student-outreach/types";

type ActionFn = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<DrawerContext>;

type Reply = { created_at: string; payload: Record<string, unknown> | null } | null;

/** Stakeholder (advisor / dept head / student org) → converts to a Partner. */
function isPartnerRow(ctx: DrawerContext): boolean {
  return ctx.outreach.kind != null && ctx.outreach.kind !== "provider";
}

/**
 * Every cadence exists to book a meeting, so the outcomes are the paths toward
 * one. "Launch activation cadence" is dropped once activation is already
 * running (relaunching would be moot).
 */
function outcomesFor(activationRunning: boolean): OutcomeChoice[] {
  return [
    ...(activationRunning
      ? []
      : [
          {
            key: "launch_activation",
            label: "Launch activation cadence",
            blurb: "Runs the standard activation sequence toward a meeting.",
            tone: "happy" as const,
          },
        ]),
    {
      key: "launch_custom",
      label: "✎ Launch custom cadence",
      blurb: "Compose your own emails + calls for a bespoke response.",
      tone: "happy",
    },
    {
      key: "ooo_restart",
      label: "↻ OOO reply — restart last cadence",
      blurb: "Out-of-office auto-reply? Resume the cadence and put the row back to pending.",
      tone: "neutral",
    },
    {
      key: "meeting_booked",
      label: "📅 Book a meeting",
      blurb: "Opens the Calendly booking page and marks a meeting scheduled.",
      tone: "happy",
    },
    {
      key: "not_interested",
      label: "Not interested",
      blurb: "Sends a polite closing note and stops outreach.",
      tone: "close",
    },
  ];
}

export function EmailReplyModal({
  ctx,
  action,
  reply,
  activationRunning = false,
  source = "reply",
  onClose,
  setError,
}: {
  ctx: DrawerContext;
  action: ActionFn;
  /** The latest email_replied touchpoint, or null when awaiting a reply. */
  reply: Reply;
  activationRunning?: boolean;
  source?: "reply" | "phone" | "meeting";
  onClose: () => void;
  setError: (m: string | null) => void;
}) {
  const [showLaunch, setShowLaunch] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const primary =
    ctx.contacts.find((c) => c.is_primary && c.status === "active") ??
    ctx.contacts.find((c) => c.status === "active") ??
    null;
  const dm = ctx.outreach.research_data?.decision_maker;
  const gc = ctx.outreach.research_data?.general_contact;
  const recipientEmail =
    (dm && !dm.unavailable && dm.email ? dm.email : null) ??
    primary?.email ??
    gc?.email ??
    null;
  const recipientPhone = primary?.phone ?? gc?.phone ?? null;
  const recipientName = primary
    ? [primary.first_name, primary.last_name].filter(Boolean).join(" ").trim() ||
      primary.name
    : dm?.name ?? null;
  const recipientContactId = primary?.id ?? null;
  const recipientFirstName =
    primary?.first_name ??
    (dm?.name ? dm.name.trim().split(/\s+/)[0] : null) ??
    null;
  const recipientLastName = primary?.last_name ?? null;

  const recipientPayload = {
    name: recipientName,
    email: recipientEmail,
    phone: recipientPhone,
    contact_id: recipientContactId,
    first_name: recipientFirstName,
    last_name: recipientLastName,
  };

  const dispatch = async (outcomeKey: string | null, notes: string | null) => {
    if (outcomeKey === "launch_activation") {
      setShowLaunch(true);
      return;
    }
    if (outcomeKey === "launch_custom") {
      setShowCustom(true);
      return;
    }
    if (outcomeKey === "ooo_restart") {
      // Let errors propagate to the outcome modal (it shows them + resets its
      // Saving state); on success onClose unmounts it.
      await action("ooo_restart", { notes });
      onClose();
      return;
    }
    if (outcomeKey === "meeting_booked") {
      await action("mark_meeting_scheduled", { notes });
      window.open(bookingUrlFor(ctx), "_blank", "noopener,noreferrer");
      onClose();
      return;
    }
    if (outcomeKey === "not_interested") {
      await action("mark_not_interested", {});
      onClose();
      return;
    }
    onClose();
  };

  if (showLaunch) {
    return (
      <CadenceLaunchModal
        cadenceKey="activation"
        isPartner={isPartnerRow(ctx)}
        partnerStakeholderType={ctx.outreach.stakeholder_type}
        organizationName={ctx.outreach.organization_name}
        campusName={ctx.campus.name}
        recipientName={recipientName}
        recipientEmail={recipientEmail}
        smartleadLinkage={linkageFromResearchData(ctx.outreach.research_data)}
        onCancel={onClose}
        onSubmit={async (payload) => {
          try {
            await action("launch_activation", {
              call_scripts: payload.call_scripts,
              recipient: recipientPayload,
              source,
            });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Launch failed");
            throw e;
          }
        }}
      />
    );
  }

  if (showCustom) {
    return (
      <CustomCadenceModal
        recipientName={recipientName}
        recipientEmail={recipientEmail}
        onCancel={onClose}
        onSubmit={async (payload) => {
          try {
            await action("launch_custom_cadence", {
              name: payload.name,
              steps: payload.steps,
              recipient: recipientPayload,
              source,
            });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Launch failed");
            throw e;
          }
        }}
      />
    );
  }

  return (
    <CallOutcomeModal
      title="Check for reply"
      subtitle={ctx.outreach.organization_name}
      topBlock={<ReplyBlock reply={reply} />}
      outcomes={outcomesFor(activationRunning)}
      notesPlaceholder="Context for this reply — what they said, the next step."
      submitLabel="Log"
      savingLabel="Saving…"
      onCancel={onClose}
      onSubmit={dispatch}
    />
  );
}

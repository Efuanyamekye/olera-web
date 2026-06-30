"use client";

/**
 * ProviderProspectDrawerBody — drawer body for materialized provider
 * prospect rows (student_outreach with kind='provider').
 *
 * v9 unified drawer skeleton:
 *
 *   Zone 1 · Header           always — name + identity meta
 *   Zone 2 · NextStepCard     always — stage-driven CTA
 *   Zone 3 · SnapshotCard     pre-launch: prominent;
 *                             post-launch: collapsed into More Details
 *   Zone 4 · OutreachTimeline always — past + future + engagement
 *   Zone 5 · More Details     collapsed — Snapshot (post-launch) +
 *                             Danger Zone
 *
 * Stage-driven collapse rule (per architecture spec §4): once
 * outreach launches, the Snapshot card moves out of the prominent
 * position and into the More Details collapse. Header + Next Step +
 * Timeline carry the operational focus; Snapshot is reference data
 * the admin only needs when they're correcting contact info post-
 * launch (e.g. after a bounce or new email surface).
 */

import { useState } from "react";
import type { DrawerContext } from "@/lib/student-outreach/types";
import type { TabKey } from "@/lib/student-outreach/tab-config";
import { getVerificationState } from "@/lib/student-outreach/verification-state";
import { NextStepCard } from "@/components/admin/medjobs/NextStepCard";
import { OutreachTimeline } from "@/components/admin/medjobs/OutreachTimeline";
import { ProviderSnapshotCard } from "@/components/admin/medjobs/SnapshotCard";

interface Props {
  ctx: DrawerContext;
  action: (
    actionName: string,
    payload?: Record<string, unknown>,
  ) => Promise<DrawerContext>;
  setError: (msg: string | null) => void;
  /** Which In Basket tab the drawer was opened from — threaded to NextStepCard
   *  so providers get the same tab-aware call-first behavior as partners. */
  activeTab?: TabKey;
}

export function ProviderProspectDrawerBody({ ctx, action, setError, activeTab }: Props) {
  const { outreach } = ctx;
  const [showMore, setShowMore] = useState(false);

  const isPreLaunch =
    outreach.status === "prospect" || outreach.status === "researched";

  // v9 final: pre-flight gate. ALL required items must be true to
  // enable Launch:
  //   - website (operationally critical: contact form discovery,
  //     verification, research, outreach validation, automation)
  //   - email (general OR specific contact)
  //   - phone (general OR specific contact)
  //   - structured address: street + city + state + valid ZIP
  // Recommended items (contact form, fax) appear in the checklist
  // but do NOT block launch — admin can ship without them.
  // v9.1 Graize 05.13 audit (Item 1): launch gate respects explicit
  // deletion. undefined → fall back to business_profile; null → honor
  // the admin's removal and treat as missing (which gates launch).
  // Same fix shipped in NextStepCard so the checklist + launch gate
  // stay in sync.
  const gc = ctx.outreach.research_data?.general_contact ?? {};
  const generalEmail =
    gc.email !== undefined ? gc.email : ctx.provider_business_profile?.email ?? null;

  const hasGeneralEmail = Boolean(generalEmail?.includes("@"));

  // v9.x simplified launch gate: a valid outreach destination + a verified
  // call. EITHER a General Contact email OR a Decision Maker email satisfies
  // the email requirement. Address / Website / Fax / Contact form / Decision
  // Maker show in the checklist but DON'T gate — the philosophy is "do we
  // know enough to confidently send outreach to the correct person?", not
  // "force perfect data collection".
  const dm = ctx.outreach.research_data?.decision_maker;
  const hasDecisionMakerEmail = Boolean(dm?.email && dm.email.includes("@"));
  const hasEmail = hasGeneralEmail || hasDecisionMakerEmail;

  // v9.x simplified verification gate. Two unlock paths:
  //   1. Verified — admin confirmed contacts on a call.
  //   2. Override — admin bypassed Pre-Flight (already verified elsewhere,
  //      trusted source, leadership exception).
  // Email-on-file is AND-ed in below so an override without a destination
  // still can't fire outreach. See verification-state.ts.
  const preFlightOverridden =
    ctx.outreach.research_data?.pre_flight_overridden === true;
  const verificationState = getVerificationState(
    ctx.touchpoints,
    preFlightOverridden,
  );

  // Pre-flight call rule (P1): the confirm call is to the MAIN number only
  // (the General Contact line) — never an individual/decision-maker number.
  // The call is REQUIRED only when a main phone is on file; with no main
  // phone there's nothing to call, so the row launches on email alone.
  const mainPhone =
    gc.phone !== undefined ? gc.phone : ctx.provider_business_profile?.phone ?? null;
  const hasMainPhone = Boolean(mainPhone && String(mainPhone).trim());

  // R5: partners (stakeholder rows) often have no phone, so they can't do a
  // confirm call — email alone is enough to launch. Providers gate on the
  // confirm-call (or override) ONLY when a main phone exists; phoneless
  // providers launch directly on a valid email.
  const isPartner = outreach.kind != null && outreach.kind !== "provider";
  const launchEnabled =
    isPartner || !hasMainPhone
      ? hasEmail
      : hasEmail && verificationState.can_launch;
  const launchDisabledReason = !hasEmail
    ? "Add an email — General Contact or Decision Maker."
    : !isPartner && hasMainPhone && !verificationState.can_launch
      ? "Confirm contacts on a Pre-Flight call, or override Pre-Flight."
      : undefined;

  return (
    <div className="space-y-6">
      {/* The drawer's own panel header already carries the org name +
          "Texas A&M University · Provider" subtitle. Skipping the
          redundant inner Provider Prospect box — location + catchment
          live in the General Contact section below, and the campus is
          already in the panel header. */}

      {/* Zone 2 · Next Step. Pre-launch (prospect/researched) the drawer now
          starts directly with the Research Card — the old thin "Pre-Flight"
          indicator box was redundant (the Research Card's own orienting line
          says what to do). NextStepCard stays for post-launch stage CTAs. */}
      {!isPreLaunch && (
        <NextStepCard ctx={ctx} action={action} setError={setError} activeTab={activeTab} />
      )}

      {/* Zone 3 · Snapshot — prominent pre-launch only. Carries the
          General Contact + Specific Contacts + research notes the
          admin works through to complete pre-flight. Post-launch
          the snapshot lives inside More Details. */}
      {isPreLaunch && (
        <ProviderSnapshotCard
          ctx={ctx}
          action={action}
          setError={setError}
          verificationState={verificationState}
          launchEnabled={launchEnabled}
          launchDisabledReason={launchDisabledReason}
        />
      )}

      {/* Zone 4 · Outreach Timeline (touchpoints + Day 0 activities).
          Sits AFTER the snapshot so admin works through pre-flight
          first, then sees history below. The drawer flow reads:
          (1) what to do next → (2) general info + contacts →
          (3) specific contacts → (4) what's happened on the row. */}
      <OutreachTimeline ctx={ctx} action={action} setError={setError} />

      {/* Zone 5 · More Details collapse. Post-launch: snapshot here.
          Pre-launch and post-launch alike: Danger Zone here. */}
      <div>
        <button
          onClick={() => setShowMore((s) => !s)}
          className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <span>{showMore ? "Hide details" : "More details"}</span>
          <span className="text-gray-400" aria-hidden>
            {showMore ? "▴" : "▾"}
          </span>
        </button>
        {showMore && (
          <div className="mt-4 space-y-6">
            {!isPreLaunch && (
              <ProviderSnapshotCard
                ctx={ctx}
                action={action}
                setError={setError}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

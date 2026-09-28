/**
 * The benefits side of a family's case, for the case workspace
 * (/admin/relationships/families/[id]).
 *
 * The case page was built for families being connected to providers: its
 * right panel is about provider legs (offers, hand-overs, "how it went").
 * For a benefits family the "other party" is a program, so this assembles
 * the program card instead: which program we sent them to and its number,
 * the plan link, how far they've got, whether automation is paused, who owns
 * their help request and when it is due, and the text companion's state.
 *
 * Read-only. Actions go through the existing routes: the letter through
 * /api/admin/benefits/families/[id], messages through
 * /api/admin/families/[id]/message.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/site-url";
import { last10 } from "@/lib/seeker-touches/label";
import { switchLine } from "@/lib/benefits/switch-line";
import { looksLikeHours, stripParen } from "@/lib/benefits/call-script";
import { familyBenefitsFacts } from "@/lib/family-comms/benefits-guidance.server";
import {
  benefitsCompletedAt,
  readBenefitsCascade,
  selectFirstStepProgram,
} from "@/lib/family-comms/benefits-cascade.server";
import { readBenefitsNavigator } from "@/lib/family-comms/benefits-navigator.server";
import {
  helpCaseWaiting,
  holdNeedsExplicitResume,
  isBenefitsAutomationHeld,
  isBenefitsFamilyMeta,
  readBenefitsHold,
  type BenefitsHelpCase,
} from "@/lib/family-comms/benefits-automation";

export interface BenefitsCaseView {
  isBenefits: boolean;
  completedAt: string | null;
  program: {
    name: string;
    shortName: string;
    contactLabel: string | null;
    phone: string | null;
    hours: string | null;
    programPath: string | null;
    /** "LIHEAP needs Medicaid first, so we'd start with SNAP." */
    switchLine: string | null;
    /** Where this came from: the letter we sent/drafted, or a live pick. */
    from: "letter" | "live";
  } | null;
  planUrl: string | null;
  letter: {
    status: "pending" | "sent" | "dismissed" | null;
    sentAt: string | null;
    sentVia: string | null;
    scheduledAt: string | null;
    route: string | null;
  };
  progress: {
    firstStepSentAt: string | null;
    calledAt: string | null;
    applicationStatus: string | null;
    applicationStatusAt: string | null;
    outcome: string | null;
    checkSentAt: string | null;
  };
  hold: { reason: string; heldAt: string; needsExplicitResume: boolean; excerpt: string | null } | null;
  help: { openedAt: string; reason: string | null; owner: string | null; dueAt: string | null; overdue: boolean } | null;
  contactedAt: string | null;
  resolvedAt: string | null;
  smsConsentAt: string | null;
  companion: {
    arm: string;
    degraded: boolean;
    urgency: string | null;
    day14: string | null;
  } | null;
  /** The newest researched answer waiting for a person, if any. */
  draftAnswer: {
    jobId: string;
    body: string;
    asked: string;
    reasons: string[];
    createdAt: string;
  } | null;
}

function usableHours(h: string | null | undefined): string | null {
  return h && looksLikeHours(h) && !/not (published|listed|available)|unknown|varies|n\/a/i.test(h) ? h : null;
}

export async function loadBenefitsCaseView(db: SupabaseClient, profileId: string): Promise<BenefitsCaseView | null> {
  const { data: profile } = await db
    .from("business_profiles")
    .select("id, account_id, phone, state, care_types, metadata")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;
  const meta = (profile.metadata as Record<string, unknown>) || {};
  const isBenefits = isBenefitsFamilyMeta(meta);

  const nav = readBenefitsNavigator(meta);
  const cascade = readBenefitsCascade(meta);

  // Program: the letter's pick wins (what the family was told), else a live
  // pick with the same selector the plan page uses.
  let program: BenefitsCaseView["program"] = null;
  if (nav.pick?.shortName) {
    program = {
      name: nav.pick.name,
      shortName: nav.pick.shortName,
      contactLabel: nav.pick.contactLabel ? stripParen(nav.pick.contactLabel) : null,
      phone: nav.pick.contactPhone ?? null,
      hours: usableHours(nav.pick.contactHours),
      programPath: nav.pick.programPath ?? null,
      switchLine: switchLine(nav.pick as never),
      from: "letter",
    };
  } else if (isBenefits && profile.account_id) {
    try {
      const pick = await selectFirstStepProgram(db, {
        accountId: profile.account_id,
        stateAbbrev: profile.state,
        facts: familyBenefitsFacts(profile),
      });
      if (pick) {
        program = {
          name: pick.name,
          shortName: pick.shortName,
          contactLabel: stripParen(pick.contact.label),
          phone: pick.contact.phone,
          hours: usableHours(pick.contact.hours),
          programPath: pick.programPath,
          switchLine: switchLine(pick),
          from: "live",
        };
      }
    } catch (err) {
      console.error("[benefits-case-view] pick failed:", err);
    }
  }

  const { data: tokenRow } = await db
    .from("benefits_results_tokens")
    .select("token")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hold = readBenefitsHold(meta);
  const held = isBenefitsAutomationHeld(meta) && hold;
  const help = (meta.benefits_case as (BenefitsHelpCase & { contacted_at?: string; resolved_at?: string }) | undefined) ?? {};
  const helpOpen = helpCaseWaiting(help);

  const companionRaw = meta.benefits_companion as
    | { arm?: string; degraded?: boolean; urgency?: { answer?: string } | null; day14?: { answer?: string } | null }
    | undefined;

  // The newest drafted answer still waiting for a person, for this number.
  let draftAnswer: BenefitsCaseView["draftAnswer"] = null;
  const key = last10(String(profile.phone ?? ""));
  if (key) {
    const { data: job } = await db
      .from("family_answer_jobs")
      .select("id, body, packet, created_at")
      .eq("phone_last10", key)
      .eq("status", "ready")
      .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const packet = (job?.packet as { draft?: string; autoSend?: { reasons?: string[] }; triage?: { isCrisis?: boolean } } | null) ?? null;
    if (job && packet?.draft?.trim() && !packet.triage?.isCrisis) {
      draftAnswer = {
        jobId: job.id,
        body: packet.draft.trim(),
        asked: String(job.body ?? "").slice(0, 400),
        reasons: packet.autoSend?.reasons ?? [],
        createdAt: job.created_at,
      };
    }
  }

  const consent = meta.sms_consent as { at?: string } | undefined;

  return {
    isBenefits,
    completedAt: benefitsCompletedAt(meta),
    program,
    planUrl: tokenRow?.token ? `${getSiteUrl()}/m/${tokenRow.token}` : null,
    letter: {
      status: (nav.status as BenefitsCaseView["letter"]["status"]) ?? null,
      sentAt: nav.sent_at ?? null,
      sentVia: nav.sent_via ?? null,
      scheduledAt: nav.scheduled_at ?? null,
      route: nav.packet?.route ?? null,
    },
    progress: {
      firstStepSentAt: cascade.first_step_sent_at ?? null,
      calledAt: cascade.first_step_done_at ?? null,
      applicationStatus: cascade.application_status ?? null,
      applicationStatusAt: cascade.application_status_at ?? null,
      outcome: cascade.outcome ?? null,
      checkSentAt: cascade.check_sent_at ?? null,
    },
    hold: held
      ? {
          reason: hold.reason,
          heldAt: hold.held_at,
          needsExplicitResume: holdNeedsExplicitResume(meta),
          excerpt: hold.excerpt ?? null,
        }
      : null,
    help: helpOpen
      ? {
          openedAt: help.help_opened_at as string,
          reason: help.help_reason ?? null,
          owner: help.help_owner ?? null,
          dueAt: help.help_due_at ?? null,
          overdue: !!help.help_due_at && Date.parse(help.help_due_at) < Date.now(),
        }
      : null,
    contactedAt: help.contacted_at ?? null,
    resolvedAt: help.resolved_at ?? null,
    smsConsentAt: consent?.at ?? null,
    companion: companionRaw?.arm
      ? {
          arm: companionRaw.arm,
          degraded: !!companionRaw.degraded,
          urgency: companionRaw.urgency?.answer ?? null,
          day14: companionRaw.day14?.answer ?? null,
        }
      : null,
    draftAnswer,
  };
}

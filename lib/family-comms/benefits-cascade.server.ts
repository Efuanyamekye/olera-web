/**
 * Benefits Cascade — the post-intake help rungs (Phase 2 of the benefits
 * admin work; see the "Phase 2 Redesign" section of the 2026-07-27 handoff).
 *
 * Posture: assume the family has NOT applied (base rate of solo completion of
 * a government benefits application ≈ 0). Rung B1 (day 2-3) shrinks the first
 * step to ten minutes: ONE program, its start-here phone number, a short call
 * script, the top documents to have nearby. Rung B2 (~3 days later) is a
 * check-in whose reply options all point forward; outcome data is the exhaust
 * of helping, never an audit.
 *
 * This module owns first-step program SELECTION + content assembly, and the
 * benefits_cascade metadata shape shared by the coordinator, the capture API,
 * and the admin Families queue. Server-only (reads with the service client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { pipelineDrafts } from "@/data/pipeline-drafts";
import type { PipelineDraft } from "@/data/pipeline-drafts-types";
import type { FamilyBenefitsFacts } from "@/lib/family-comms/benefits-guidance.server";
import {
  evaluateProgramForFamily,
  hasEligibilityFacts,
  incomeLimitFromTable,
  loadSbfEligibility,
  resolveSbfRow,
  type SbfEligibilityRow,
} from "@/lib/benefits/eligibility.server";
import { findPipelineDraftFor, getStateAbbrev, getStateSlug } from "@/lib/program-data";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import {
  BENEFITS_HELP_REQUEST_SMS_COPY_VERSION,
  BENEFITS_RESULTS_SMS_COPY_VERSION,
  BENEFITS_RESULTS_ZERO_MATCH_SMS_COPY_VERSION,
  benefitsResultsSms,
} from "@/lib/sms/templates";
import { withSmsSource } from "@/lib/sms/click-source";
import { getSiteUrl } from "@/lib/site-url";
import { sendSlackAlert } from "@/lib/slack";
import { readCareAge, careAgeShort } from "@/lib/benefits/age";
import { pickCallContact } from "@/lib/benefits/call-script";
import { duplicateTarget } from "@/lib/benefits/program-duplicates";

// ── benefits_cascade metadata (on business_profiles.metadata) ───────────────

export type BenefitsOutcomeValue = "moving" | "wants_help" | "wrong_program";
export type BenefitsApplicationStatus =
  | "called"
  | "no_answer"
  | "needs_docs"
  | "applied"
  | "waiting"
  | "not_eligible"
  | "stuck"
  /** Told us the program said yes (texted APPROVED, or tapped it on the plan). */
  | "approved";

export interface BenefitsCascadeMeta {
  first_step_sent_at?: string;
  first_step_program_id?: string;
  /** State SLUG (e.g. "florida") — matches saved_programs.state_id and the
   *  /benefits/{stateId}/{programId} route. */
  first_step_state_id?: string;
  first_step_program_name?: string;
  check_sent_at?: string;
  /** Living-journey page acts (v2): the family tapped "I made the call" /
   *  checked documents on /m/{token}. Distinct from `outcome` (the check-in
   *  self-report) — this is the page-observed act. */
  first_step_done_at?: string;
  first_step_done_program_id?: string;
  docs_checked?: string[];
  /** SMS mirror stamps (consent-gated companions to the B1/B2 emails). */
  first_step_sms_at?: string;
  /** Scheduled navigator sends that fired outside the recipient's quiet
   *  hours park the companion text in sms_queue — this is its due time. */
  first_step_sms_queued_for?: string;
  check_sms_at?: string;
  /** B2 mirror text parked in sms_queue by the coordinator's quiet-hours
   *  check (e.g. a 17:00 UTC run reaching Hawaii before 8am local). */
  check_sms_queued_for?: string;
  outcome?: BenefitsOutcomeValue;
  outcome_at?: string;
  /** One-tap "what didn't fit" from the wrong_program landing path. */
  outcome_reason?: string;
  /** Structured progress reported by text. Unlike `outcome`, this is a
   *  durable status the living plan can show back to the family. */
  application_status?: BenefitsApplicationStatus;
  application_status_at?: string;
  /** The family said they submitted an application through Olera's
   *  apply-along (lib/benefits/apply-along.ts). `route` "ssa_extra_help":
   *  Social Security's Extra Help form, which also starts the state's
   *  Medicare Savings application. The check-ins about the decision read this. */
  applied?: {
    at: string;
    route: "ssa_extra_help";
    program_id?: string;
    state_id?: string;
    /** The coordinator's B3 check-ins: about a week, then about five weeks after `at`. */
    letter_check_at?: string;
    decision_check_at?: string;
    /** What came back, from a text reply or a tap on the plan. */
    decision?: "approved" | "denied" | "waiting" | "stuck";
    decision_at?: string;
  };
  last_sms_reply?: string;
  last_sms_reply_at?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readBenefitsCascade(profileMeta: Record<string, any> | null | undefined): BenefitsCascadeMeta {
  const raw = profileMeta?.benefits_cascade;
  return raw && typeof raw === "object" ? (raw as BenefitsCascadeMeta) : {};
}

/** When the family completed the benefits intake (save-results stamps
 *  metadata.benefits_results.completed_at). Null = not a benefits family. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function benefitsCompletedAt(profileMeta: Record<string, any> | null | undefined): string | null {
  const raw = profileMeta?.benefits_results?.completed_at;
  return typeof raw === "string" && raw ? raw : null;
}

export type CascadeStatus = "matched" | "first_step_sent" | BenefitsOutcomeValue;

/** Queue-facing status ladder: matched → first_step_sent → outcome. */
export function cascadeStatus(cascade: BenefitsCascadeMeta): CascadeStatus {
  if (cascade.outcome) return cascade.outcome;
  if (cascade.first_step_sent_at) return "first_step_sent";
  return "matched";
}

// ── Case management (the caseload view, TJ 2026-07-28) ──────────────────────

/** Admin case actions stored on the profile: metadata.benefits_case. */
export interface BenefitsCaseMeta {
  notes?: { at: string; by: string; text: string }[];
  contacted_at?: string;
  resolved_at?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readBenefitsCase(profileMeta: Record<string, any> | null | undefined): BenefitsCaseMeta {
  const raw = profileMeta?.benefits_case;
  return raw && typeof raw === "object" ? (raw as BenefitsCaseMeta) : {};
}

/** Stuck states, most severe first. The cascade is the automated first
 *  responder; after two ignored touches the next touch is a HUMAN — these
 *  states are the routing. Resolved cases and moving families never float;
 *  "contacted" suppresses the float for 7 days (the case is being worked). */
export type CaseStatus =
  | "wants_help"
  | "silent_after_checkin"
  | "action_stall"
  | "attention_stall";

const CASE_DAY = 24 * 60 * 60 * 1000;

export function caseStatus(
  cascade: BenefitsCascadeMeta,
  caseMeta: BenefitsCaseMeta,
  lastViewedAt: string | null,
  now: number,
): CaseStatus | null {
  if (caseMeta.resolved_at) return null;
  if (cascade.outcome === "moving" || cascade.first_step_done_at) return null;
  if (caseMeta.contacted_at && now - new Date(caseMeta.contacted_at).getTime() < 7 * CASE_DAY) {
    return null;
  }
  if (cascade.outcome === "wants_help") return "wants_help";
  if (cascade.outcome === "wrong_program") return null;

  // Once the check-in is out, IT owns the verdict: silent after 4 days, or
  // nothing yet. Declaring a stall while the automated follow-up is still in
  // flight would double-count the same silence.
  if (cascade.check_sent_at) {
    return now - new Date(cascade.check_sent_at).getTime() >= 4 * CASE_DAY
      ? "silent_after_checkin"
      : null;
  }
  if (cascade.first_step_sent_at) {
    const sentAt = new Date(cascade.first_step_sent_at).getTime();
    const viewedSinceSend = !!lastViewedAt && new Date(lastViewedAt).getTime() >= sentAt;
    if (viewedSinceSend && now - sentAt >= 4 * CASE_DAY) return "action_stall";
    if (!viewedSinceSend && now - sentAt >= 3 * CASE_DAY) return "attention_stall";
  }
  return null;
}

// ── Unified lifecycle (the family's journey, one vocabulary — TJ 2026-07-28) ─

export type LifecycleStatus =
  | "needs_help"
  | "stalled"
  | "acting"
  | "returned"
  | "working"
  | "resolved"
  | "new"
  | "in_cascade";

export interface Lifecycle {
  status: LifecycleStatus;
  /** Short human sub-label, e.g. "never saw plan" / "said it didn't fit". */
  detail: string | null;
}

/** One family-centric status with strict precedence, replacing the three
 *  system vocabularies (signals / cascade / case) in the queue. */
export function lifecycleStatus(opts: {
  cascade: BenefitsCascadeMeta;
  caseMeta: BenefitsCaseMeta;
  completedAt: string;
  lastViewedAt: string | null;
  /** Latest real (non-keyword) inbound SMS — metadata.sms_inbound. */
  lastInboundTextAt?: string | null;
  now: number;
}): Lifecycle {
  const { cascade, caseMeta, completedAt, lastViewedAt, now } = opts;
  if (caseMeta.resolved_at) return { status: "resolved", detail: null };
  // A family who texted back is a human waiting on a human — float them like
  // wants_help instead of letting the view-based clocks call them "stalled".
  // Logging a contact after the text clears it; a NEWER text re-floats (which
  // is why this outranks the contacted-within-7d "working" check). 7-day
  // bound so a long-handled reply doesn't float forever.
  if (
    opts.lastInboundTextAt &&
    now - new Date(opts.lastInboundTextAt).getTime() < 7 * CASE_DAY &&
    (!caseMeta.contacted_at || caseMeta.contacted_at < opts.lastInboundTextAt)
  ) {
    return { status: "needs_help", detail: "texted back" };
  }
  if (caseMeta.contacted_at && now - new Date(caseMeta.contacted_at).getTime() < 7 * CASE_DAY) {
    return { status: "working", detail: "contacted" };
  }
  if (cascade.application_status === "stuck") {
    return { status: "needs_help", detail: "texted STUCK" };
  }
  if (cascade.application_status === "needs_docs") {
    return { status: "working", detail: "gathering documents" };
  }
  if (cascade.application_status === "no_answer") {
    return { status: "stalled", detail: "could not reach agency" };
  }
  if (cascade.application_status === "approved") {
    return { status: "acting", detail: "approved" };
  }
  if (
    cascade.application_status === "called" ||
    cascade.application_status === "applied" ||
    cascade.application_status === "waiting"
  ) {
    return {
      status: "acting",
      detail:
        cascade.application_status === "applied"
          ? "application submitted"
          : cascade.application_status === "waiting"
            ? "waiting on agency"
            : "made the call",
    };
  }
  if (cascade.application_status === "not_eligible") {
    return { status: "returned", detail: "program was not a fit" };
  }
  if (cascade.outcome === "wants_help") return { status: "needs_help", detail: "asked for a person" };

  const stuck = caseStatus(cascade, caseMeta, lastViewedAt, now);
  if (stuck === "silent_after_checkin") {
    // Engaged with the check-in era (viewed their plan after it went out) then
    // went quiet = requested info, no follow-up → a human's case, not a stall.
    const viewedAfterCheck =
      !!lastViewedAt &&
      !!cascade.check_sent_at &&
      new Date(lastViewedAt).getTime() >= new Date(cascade.check_sent_at).getTime();
    return viewedAfterCheck
      ? { status: "needs_help", detail: "engaged, then went quiet" }
      : { status: "stalled", detail: "silent after check-in" };
  }
  if (stuck === "action_stall") return { status: "stalled", detail: "saw plan, no call yet" };
  if (stuck === "attention_stall") return { status: "stalled", detail: "never saw their plan" };

  if (cascade.first_step_done_at) return { status: "acting", detail: "made the call" };
  if (cascade.outcome === "moving") return { status: "acting", detail: "says it's moving" };
  if ((cascade.docs_checked?.length ?? 0) > 0) {
    return { status: "acting", detail: `${cascade.docs_checked!.length} docs ready` };
  }
  if (cascade.outcome === "wrong_program") return { status: "returned", detail: "said it didn't fit" };

  const completedMs = new Date(completedAt).getTime();
  if (lastViewedAt && new Date(lastViewedAt).getTime() - completedMs > CASE_DAY) {
    return { status: "returned", detail: "came back to their plan" };
  }
  if (now - completedMs < 2 * CASE_DAY) return { status: "new", detail: null };
  return { status: "in_cascade", detail: cascade.first_step_sent_at ? "first step sent" : "awaiting first step" };
}

// ── First-step program selection ────────────────────────────────────────────

export interface FirstStepPick {
  programId: string;
  /** State slug for the program page route. */
  stateId: string;
  stateAbbrev: string;
  /** How this program was chosen — "entry" means it's the program page the
   *  family arrived through, which the email calls out for recognition. */
  source: "entry" | "saved" | "state";
  name: string;
  shortName: string;
  savingsRange: string | null;
  complexity: string;
  contact: { label: string; phone: string; hours: string | null; description: string | null };
  /** Top documents to have nearby — capped at 3 (ten minutes, not a filing). */
  documents: string[];
  tip: string | null;
  /** Site-relative program page path. */
  programPath: string;
  /**
   * Set only when the family arrived through a program page and THIS pick is
   * a different program. The program they came for leads unless their own
   * facts rule it out or it cannot produce a callable step, and either way
   * the switch has to be said out loud (TJ, 2026-09-24). The plan page turns
   * this into one quiet line above the Start here card.
   */
  switchReason?: "ruled_out" | "no_contact" | "no_steps";
  /** Short name of the entry program that was passed over. */
  switchedFromName?: string;
  /** The verdict's family-readable reason ("Needs Medicaid first") when
   *  switchReason is "ruled_out". */
  switchDetail?: string | null;
}

const COMPLEXITY_RANK: Record<string, number> = { simple: 0, medium: 1, deep: 2 };

/**
 * Resolve a saved/startHere program id to its pipeline draft.
 *
 * Families save programs from the waiver-library catalog, which names the same
 * program differently to the pipeline ("texas-medicare-savings-programs" vs
 * "medicaid-buy-in-qmb-slmb-qi"). This used to be a bare exact-id match, so a
 * saved program we hold full content for simply vanished from the ranking and
 * the family's stated interest was dropped without trace. Every other consumer
 * already went through the shared bridge; this was the one that did not.
 */
function draftFor(stateAbbrev: string, rawProgramId: string): PipelineDraft | null {
  // A saved or entry id may be a copy of a program held twice in the data;
  // read the program that stays, so the letter uses its checked number.
  const programId = duplicateTarget(stateAbbrev, rawProgramId) ?? rawProgramId;
  const exact = pipelineDrafts[stateAbbrev]?.programs?.find((p) => p.id === programId);
  if (exact) return exact;
  return findPipelineDraftFor(stateAbbrev, programId);
}

/** A draft can anchor a first-step email only when it carries the v3 content:
 *  a callable contact + a document list. Returns the pick or null. */
function toPick(
  draft: PipelineDraft,
  stateAbbrev: string,
  stateId: string,
  source: FirstStepPick["source"],
): FirstStepPick | null {
  // Shared with the program-page card so both show the same number.
  const contact = pickCallContact(draft.contacts);
  const documents = (draft.documentsNeeded || []).slice(0, 3);
  if (!contact || documents.length === 0) return null;
  return {
    programId: draft.id,
    stateId,
    stateAbbrev,
    source,
    name: draft.name,
    shortName: draft.shortName || draft.name,
    savingsRange: draft.savingsRange?.trim() || null,
    complexity: draft.complexity,
    contact,
    documents,
    tip: draft.applicationGuide?.tip?.trim() || null,
    programPath: `/benefits/${stateId}/${draft.id}`,
  };
}

/**
 * Name and callable number for a program, for letters that NAME a second
 * program without making it the first step (the caveat rewrite). Same
 * contact choice as toPick ("start here" first, then any phone), but a
 * missing phone or document list does not drop the program: it is named
 * without a number instead. Null only when the program is not in the bundle.
 */
export function programCallContact(
  stateAbbrev: string | null,
  programId: string,
): { programId: string; name: string; phone: string | null; label: string | null } | null {
  if (!stateAbbrev) return null;
  const draft = draftFor(stateAbbrev.toUpperCase(), programId);
  if (!draft) return null;
  const contacts = draft.contacts || [];
  const contact =
    contacts.find((c) => c.phone && /start here/i.test(c.label)) ||
    contacts.find((c) => !!c.phone);
  return {
    programId: draft.id,
    name: draft.shortName || draft.name,
    phone: contact?.phone ?? null,
    label: contact?.label ?? null,
  };
}

/** Parse "/benefits/{stateSlug}/{programId}" out of an entry-source path. */
/**
 * The program the full finder (/benefits/finder) told this family to call
 * first, saved with their plan. The finder is not a program page, so
 * signup_source can't carry it. Without this, the plan page, the letter and
 * the texts re-picked on their own and could lead with a different program
 * than the one on the family's screen.
 */
async function finderFirstStep(
  db: SupabaseClient,
  accountId: string,
): Promise<{ stateId: string; programId: string } | null> {
  const { data } = await db
    .from("business_profiles")
    .select("metadata")
    .eq("account_id", accountId)
    .eq("type", "family")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const raw = (data?.metadata as { benefits_results?: { finder_first_step?: { state_id?: unknown; program_id?: unknown } } } | null)
    ?.benefits_results?.finder_first_step;
  return typeof raw?.state_id === "string" && typeof raw?.program_id === "string"
    ? { stateId: raw.state_id, programId: raw.program_id }
    : null;
}

export function parseEntrySourceProgram(entrySource: string | null | undefined): { stateId: string; programId: string } | null {
  if (!entrySource) return null;
  const segs = entrySource.split("?")[0].split("/").filter(Boolean);
  if (segs.length === 3 && segs[0] === "benefits") return { stateId: segs[1], programId: segs[2] };
  return null;
}

/**
 * Pick the ONE program for the family's first step.
 *
 * Order:
 *   1. The entry-source program LEADS — they arrived through a specific
 *      program page (LIHEAP, Weatherization…) and asked about it. It is
 *      passed over only when their own facts rule it out or it has no
 *      callable step; the winning pick then carries switchReason so the
 *      switch is explained (TJ, 2026-09-24).
 *   2. Their saved matches, best fit first, then lowest complexity
 *      (simple > medium > deep), then saved order.
 *   3. The state's stateOverview.startHere list.
 *
 * Every candidate must clear toPick (callable contact + documents). When the
 * family has given eligibility facts (Phase 3), candidates their facts rule
 * out are skipped at every tier — an under-65 family entering through a 65+
 * program page should not get that program as their ten-minute first step.
 * Returns null when nothing qualifies — the coordinator then skips rung B1
 * for this family rather than sending a hollow email.
 */
export async function selectFirstStepProgram(
  db: SupabaseClient,
  opts: {
    accountId: string;
    stateAbbrev: string | null;
    /** Program ids to skip — the living journey uses this to pick "up next"
     *  after the first step is done. */
    exclude?: string[];
    /** The family's benefits facts (familyBenefitsFacts over their profile).
     *  Omitted or fact-free → no eligibility screening, selection unchanged. */
    facts?: FamilyBenefitsFacts | null;
    /** Pin to the program a SENT navigator letter named (benefits_cascade
     *  first_step_program_id/state_id). Once TJ told the family "start with
     *  X", the plan page must show X — recomputing could greet them with a
     *  different program than the letter promised. Bypasses the eligibility
     *  screen deliberately: TJ approved the letter, and contradicting it is
     *  worse than a soft rule firing late. Falls through to the normal
     *  ladder when the pinned program has no callable content. */
    pin?: { programId: string; stateId: string | null } | null;
    /** Run the pin through the eligibility screen. Set when the pin came from
     *  a model suggestion rather than from a letter a human already sent. */
    pinScreened?: boolean;
  },
): Promise<FirstStepPick | null> {
  const excluded = new Set(opts.exclude || []);

  /**
   * draftFor, with the exclusion re-checked on the far side of the id bridge.
   *
   * Every `excluded.has(...)` guard below tests the identifier we were HANDED —
   * a saved row's program_id, the entry program, a startHere id. But draftFor
   * falls through to findPipelineDraftFor, which maps waiver-library ids onto
   * the same pipeline draft. A family holding both forms of one program (they
   * accumulate: "low-income-home-energy-assistance-program-liheap" and
   * "liheap-energy-assistance" are the same thing) passes the pre-bridge guard
   * on the form that is not excluded, and toPick then returns draft.id — the
   * excluded program.
   *
   * That made recompose hand back the exact program the packet ruled out, with
   * no error, which is the worst outcome for that button: the operator is told
   * it worked. Found 2026-09-01 in a batch of 51, where 3 recomposed to
   * themselves — including a Kentucky family whose packet said the program
   * requires Medicaid and the family had stated they do not have it.
   *
   * The pre-bridge guards stay: they are cheap and they short-circuit earlier.
   */
  const draftForUnexcluded = (stateAbbrev: string, programId: string): PipelineDraft | null => {
    const draft = draftFor(stateAbbrev, programId);
    if (!draft) return null;
    return excluded.has(draft.id) ? null : draft;
  };

  // Eligibility screen (conservative: unknown facts and unjoined programs
  // always pass). sbf rows load once, only when there are facts to apply.
  const facts = opts.facts && hasEligibilityFacts(opts.facts) ? opts.facts : null;
  let sbfRows: SbfEligibilityRow[] = [];
  if (facts) {
    sbfRows = await loadSbfEligibility(db, opts.stateAbbrev);
  }
  /**
   * Screen one program against the family's facts.
   *
   * Returns the verdict's ruled-out flag AND its fit boost. The boost is the
   * same score /m/[token] ranks the plan page with (rankProgramsForFamily),
   * so the letter and the plan page now agree on what leads instead of the
   * letter picking on complexity while the page picks on fit.
   *
   * Fact-free families get {ruledOut: false, boost: 0}, which leaves their
   * selection exactly as it was.
   */
  const screenVerdict = (draft: PipelineDraft, stateId: string) => {
    if (!facts) return null;
    const stateName = stateId.replace(/-/g, " ");
    return evaluateProgramForFamily(
      {
        name: draft.name,
        ageRequirement: draft.structuredEligibility?.ageRequirement,
        eligibilitySummary: draft.structuredEligibility?.summary,
        incomeLimitSingle: incomeLimitFromTable(draft.structuredEligibility?.incomeTable),
      },
      resolveSbfRow(sbfRows, draft.name, stateName),
      facts,
    );
  };
  const screen = (
    draft: PipelineDraft,
    stateId: string,
  ): { ruledOut: boolean; boost: number } => {
    const verdict = screenVerdict(draft, stateId);
    return verdict ? { ruledOut: verdict.ruledOut, boost: verdict.boost } : { ruledOut: false, boost: 0 };
  };
  // The pin, resolved here rather than before the screen exists.
  //
  // A pin from a SENT letter is never screened: we already told the family to
  // start there, and contradicting it is worse than a soft rule firing late.
  // A pin from a model suggestion has no such licence — nobody approved it —
  // so `pinScreened` runs it through the same eligibility check every other
  // candidate faces. Without that, a recompose could hand a family a program
  // their own stated facts rule out, which is the exact failure this system
  // exists to prevent.
  if (opts.pin?.programId && opts.pin.stateId && opts.stateAbbrev && !excluded.has(opts.pin.programId)) {
    const pinnedDraft = draftForUnexcluded(opts.stateAbbrev, opts.pin.programId);
    if (pinnedDraft && !(opts.pinScreened && screen(pinnedDraft, opts.pin.stateId).ruledOut)) {
      const pinned = toPick(pinnedDraft, opts.stateAbbrev, opts.pin.stateId, "saved");
      if (pinned) return pinned;
    }
  }

  const { data: account } = await db
    .from("accounts")
    .select("user_id, signup_source")
    .eq("id", opts.accountId)
    .maybeSingle();
  if (!account?.user_id) return null;

  // 1. Entry-source program page — it LEADS.
  //
  // TJ's decision, 2026-09-24: the program the family came for leads unless
  // (a) their own stated facts rule it out, or (b) it cannot produce a
  // callable step (no pipeline draft contact / documents). Anything else is
  // a switch, and a switch must be explained, so the passed-over program is
  // recorded on whatever pick wins below (switchReason + switchedFromName).
  //
  // This reverses the 2026-09 "candidate, not a short circuit" rule. That
  // rule scored the entry page as a tiebreak: an Oregon family whose saved
  // SNAP scored 20 got SNAP over the rental assistance page they entered
  // through (scored 8), on the argument that a page someone read is weaker
  // evidence than facts they typed. In practice it let an EASIER or better
  // scored program beat the one they asked about: a Texas family who clicked
  // "Check my eligibility" on LIHEAP (complexity "deep") was told to start
  // with SNAP, with no word about why. The facts a family typed still win
  // where they are decisive (a rule-out); a fit boost is not decisive enough
  // to override what they came for.
  //
  // Foreign-state filtering applies here too: an entry page in another state
  // than the family's own is dropped silently (same reasoning as step 2), not
  // treated as a switch.
  // A finder family's first step leads the same way a program page does.
  const entry = parseEntrySourceProgram(account.signup_source) ?? (await finderFirstStep(db, opts.accountId));
  let switchInfo: Pick<FirstStepPick, "switchReason" | "switchedFromName" | "switchDetail"> | null =
    null;
  const ownAbbrev = opts.stateAbbrev ? opts.stateAbbrev.toUpperCase() : null;
  if (entry && !excluded.has(entry.programId)) {
    const abbrev = getStateAbbrev(entry.stateId);
    const foreign = !!ownAbbrev && abbrev.toUpperCase() !== ownAbbrev;
    const draft = foreign ? null : draftForUnexcluded(abbrev, entry.programId);
    if (draft) {
      const entryName = draft.shortName || draft.name;
      const verdict = screenVerdict(draft, entry.stateId);
      if (verdict?.ruledOut) {
        switchInfo = {
          switchReason: "ruled_out",
          switchedFromName: entryName,
          switchDetail: verdict.reason,
        };
      } else {
        const pick = toPick(draft, abbrev, entry.stateId, "entry");
        if (pick) return pick;
        // toPick needs a phone AND a document list. When the phone is there
        // and only the steps are missing (Seattle Gold Card), saying "no
        // working number" would be false: the page they came from shows one.
        const hasPhone = (draft.contacts || []).some((c) => !!c.phone);
        switchInfo = {
          switchReason: hasPhone ? "no_steps" : "no_contact",
          switchedFromName: entryName,
          switchDetail: null,
        };
      }
    }
  }
  const withSwitch = (pick: FirstStepPick): FirstStepPick =>
    switchInfo ? { ...pick, ...switchInfo } : pick;

  // 2. Saved matches, ranked by FIT first. saved_programs.state_id is the
  //    state slug; federal programs have no per-state draft and drop out here.
  //
  //    The secondary .order("id") is load-bearing. ~90% of families have every
  //    saved program on an identical created_at because the rows are bulk
  //    inserted at intake, and ordering on a column full of ties leaves the
  //    row order undefined in Postgres. Without a stable tiebreak the same
  //    family could get a different letter on different runs. Ordering by id
  //    is arbitrary but deterministic, which is all the tiebreak needs to be.
  const { data: saved } = await db
    .from("saved_programs")
    .select("id, program_id, state_id, created_at")
    .eq("user_id", account.user_id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const candidates: {
    pick: FirstStepPick;
    boost: number;
    rank: number;
    idx: number;
  }[] = [];
  (saved || []).forEach((row, idx) => {
    if (!row.program_id || !row.state_id || excluded.has(row.program_id)) return;
    const abbrev = getStateAbbrev(row.state_id);
    // Another state's program cannot be this family's first step. Saved programs
    // accumulate across states — a family exploring care for a parent elsewhere
    // ends up with several states in one list — and nothing here used to compare
    // them against the family's OWN state, so a Texas program led the plan page
    // for a family in North Dakota, carrying Texas's hotline and a checklist
    // asking for proof of Texas residency. That is the Louisiana failure again:
    // right-sounding program, wrong state's office.
    //
    // Dropped, not demoted. Demoting was the first attempt and it silently did
    // nothing here: the family's own ND program is missing documentsNeeded, so
    // toPick discarded it below and every surviving candidate was foreign, which
    // let Texas win anyway. Ranking cannot protect a family when their own
    // state's only saved entry never becomes a candidate. Step 3 already exists
    // as the fallback and returns a real ND program, so removing foreign states
    // here routes there instead of misdirecting.
    if (ownAbbrev && abbrev.toUpperCase() !== ownAbbrev) return;
    const draft = draftForUnexcluded(abbrev, row.program_id);
    if (!draft) return;
    const verdict = screen(draft, row.state_id);
    if (verdict.ruledOut) return;
    const pick = toPick(draft, abbrev, row.state_id, "saved");
    if (!pick) return;
    candidates.push({
      pick,
      boost: verdict.boost,
      rank: COMPLEXITY_RANK[draft.complexity] ?? 3,
      idx,
    });
  });
  // Fit, then ease, then a stable tiebreak. Every candidate is already in the
  // family's own state, so state plays no part here.
  //
  // Fit beats ease, which was the previous fix here: complexity used to lead,
  // letting an easy program outrank a relevant one — a WV family saw a
  // blindness program promoted over the waiver they actually matched, purely
  // because it was `medium` and the waiver was `deep`. Families with no
  // eligibility facts have boost 0 across the board and fall straight through
  // to the complexity ordering.
  candidates.sort((a, b) => b.boost - a.boost || a.rank - b.rank || a.idx - b.idx);
  if (candidates[0]) return withSwitch(candidates[0].pick);

  // 3. State fallback: the pipeline's own "start here" list.
  if (opts.stateAbbrev) {
    const abbrev = opts.stateAbbrev.toUpperCase();
    const stateId = getStateSlug(abbrev);
    const startHere = pipelineDrafts[abbrev]?.stateOverview?.startHere || [];
    if (stateId) {
      for (const s of startHere) {
        if (excluded.has(s.programId)) continue;
        const draft = draftForUnexcluded(abbrev, s.programId);
        if (!draft) continue;
        if (screen(draft, stateId).ruledOut) continue;
        const pick = toPick(draft, abbrev, stateId, "state");
        if (pick) return withSwitch(pick);
      }
    }
  }

  return null;
}

// ── Situation line (Phase 3 honesty) ────────────────────────────────────────

/** Humanize the family's held eligibility facts into one line ("age 72, on
 *  Medicaid, income $1,500–$2,500/mo"). Null when we hold nothing — callers
 *  render their own "unknown" placeholder (or nothing at all). Same
 *  vocabulary as the Slack benefits_completed alert. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function benefitsSituationLine(profileMeta: Record<string, any> | null | undefined): string | null {
  const meta = profileMeta || {};
  const parts: string[] = [];
  const ageShort = careAgeShort(readCareAge(meta));
  if (ageShort) parts.push(ageShort);
  const medicaid = meta.medicaid_status as string | undefined;
  if (medicaid === "alreadyHas") parts.push("on Medicaid");
  else if (medicaid === "doesNotHave") parts.push("not on Medicaid, has not applied");
  else if (medicaid === "denied") parts.push("applied for Medicaid and was denied");
  else if (medicaid === "applying") parts.push("applying for Medicaid");
  else if (medicaid === "notSure") parts.push("Medicaid: not sure");
  const incomeLabels: Record<string, string> = {
    under1500: "income under $1,500/mo",
    under2500: "income $1,500–$2,500/mo",
    under4000: "income $2,500–$4,000/mo",
    over4000: "income over $4,000/mo",
    under6000: "income $4,000–$6,000/mo",
    over6000: "income over $6,000/mo",
  };
  const income = meta.income_range as string | undefined;
  if (income && incomeLabels[income]) parts.push(incomeLabels[income]);
  // "Not sure yet" on the payment step — the family self-identifying as
  // needing the benefits path. Triage-relevant, so it rides the same line.
  if (meta.payment_unsure) parts.push("unsure how to pay");
  return parts.length > 0 ? parts.join(", ") : null;
}

// ── Phone capture ───────────────────────────────────────────────────────────

/** "your parent" / "your spouse" / "you" / "your family" — from either the
 *  enrichment enum (self|parent|spouse|other) or the stored display value
 *  (Self|Parent|Spouse|Family member). */
export function familyPhraseFromRelationship(rel: string | null | undefined): string {
  const v = (rel || "").toLowerCase();
  if (v === "self" || v === "myself") return "you";
  if (v.includes("parent")) return "your parent";
  if (v.includes("spouse")) return "your spouse";
  return "your family";
}

/**
 * Capture a family's phone number and keep the promise immediately: store it
 * (fill-if-empty; a DIFFERING existing number is never overwritten and gets no
 * SMS — texting an unstored number would mislead), stamp
 * metadata.sms_consent (the 10DLC audit record, and the gate the future SMS
 * cascade rungs will require), and text the results link right away.
 *
 * Metadata is read FRESH inside this call so the consent merge can't clobber
 * writes made earlier in the same request (e.g. syncIntentToProfile).
 * The SMS is awaited — Vercel kills pending promises after the response.
 */
export async function captureFamilyPhoneAndTextResults(
  db: SupabaseClient,
  opts: {
    profileId: string;
    rawPhone: string;
    /** Consent provenance, e.g. "benefits_enrichment" | "benefits_outcome_help". */
    source: string;
  },
): Promise<{ stored: boolean; smsSent: boolean }> {
  const normalized = normalizeUSPhone(opts.rawPhone);
  if (!normalized) return { stored: false, smsSent: false };

  const { data: profile } = await db
    .from("business_profiles")
    .select("id, phone, metadata, display_name, state")
    .eq("id", opts.profileId)
    .single();
  if (!profile) return { stored: false, smsSent: false };

  const existing = (profile.phone || "").trim();
  const sameAsExisting = existing ? normalizeUSPhone(existing) === normalized : false;
  if (existing && !sameAsExisting) return { stored: false, smsSent: false };

  const meta = (profile.metadata as Record<string, unknown>) || {};
  const update: Record<string, unknown> = {
    metadata: {
      ...meta,
      sms_consent: { at: new Date().toISOString(), source: opts.source },
    },
  };
  if (!existing) update.phone = normalized;
  const { error: updErr } = await db
    .from("business_profiles")
    .update(update)
    .eq("id", opts.profileId);
  if (updErr) {
    console.error("[captureFamilyPhone] update failed:", updErr);
    return { stored: false, smsSent: false };
  }

  // Slack ping — a captured phone is the scarce asset (only ~3% of benefits
  // families had one before capture shipped), so the team hears about each.
  // Awaited (serverless), never fatal.
  const pingSlack = async (smsStatus: string) => {
    try {
      const name = profile.display_name?.trim();
      const who = name && name.toLowerCase() !== "care seeker" ? name : "A family";
      const sourceLabel =
        opts.source === "benefits_enrichment"
          ? "post-capture enrichment"
          : opts.source === "benefits_outcome_help"
            ? "wants-help page"
            : opts.source;
      await sendSlackAlert(
        `📱 ${who}${profile.state ? ` (${profile.state})` : ""} shared their phone number via ${sourceLabel}: ${normalized}. ` +
          `${smsStatus} <${getSiteUrl()}/admin/care-seekers/${opts.profileId}|Open family>`,
      );
    } catch (slackErr) {
      console.error("[captureFamilyPhone] Slack ping failed:", slackErr);
    }
  };

  const { data: tokenRow } = await db
    .from("benefits_results_tokens")
    .select("token, match_count")
    .eq("profile_id", opts.profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!tokenRow?.token) {
    await pingSlack("No results token on file, no text sent.");
    return { stored: true, smsSent: false };
  }

  // Benefits text companion test. Off and practice change nothing here. When
  // live, a family in the companion arm gets its opener instead of the results
  // text below; control (and a companion family with no callable program)
  // gets the results text, tagged with the arm.
  let companionArm: string | null = null;
  try {
    const { startBenefitsCompanion } = await import("@/lib/family-comms/benefits-companion.server");
    const companion = await startBenefitsCompanion(db, {
      profileId: opts.profileId,
      phone: normalized,
      source: opts.source,
      token: tokenRow.token,
    });
    companionArm = companion.arm;
    if (companion.handled) {
      await pingSlack("Companion opener texted (benefits text companion test).");
      return { stored: true, smsSent: true };
    }
  } catch (err) {
    console.error("[captureFamilyPhone] companion start failed, sending results text:", err);
  }

  const smsContext = opts.source === "benefits_outcome_help" ? "help_requested" : "results";
  const copyVersion =
    smsContext === "help_requested"
      ? BENEFITS_HELP_REQUEST_SMS_COPY_VERSION
      : (tokenRow.match_count || 0) > 0
        ? BENEFITS_RESULTS_SMS_COPY_VERSION
        : BENEFITS_RESULTS_ZERO_MATCH_SMS_COPY_VERSION;

  const result = await sendSMS({
    to: normalized,
    body: benefitsResultsSms({
      matchCount: tokenRow.match_count || 0,
      url: withSmsSource(`${getSiteUrl()}/m/${tokenRow.token}`, "benefits_results_sms"),
      context: smsContext,
    }),
    // Ledger entry (channel='sms') so the send shows on /admin/family-comms.
    // benefits_results_sms is transactional — deliberately NOT a governed type.
    emailType: "benefits_results_sms",
    recipientType: "family",
    recipientLogProfileId: opts.profileId,
    metadata: {
      copy_version: copyVersion,
      entry_source: opts.source,
      match_count: tokenRow.match_count || 0,
      ...(companionArm ? { companion_arm: companionArm, companion_kind: "results" } : {}),
    },
  });
  if (!result.success) {
    console.error("[captureFamilyPhone] results SMS failed:", result.error);
    // Twilio 21610 = recipient previously texted STOP.
    if (result.error?.includes("21610")) {
      await db
        .from("business_profiles")
        .update({ phone_validity: "opted_out" })
        .eq("id", opts.profileId);
    }
  }

  await pingSlack(result.success ? "Results link texted." : "Results text FAILED, check logs.");

  return { stored: true, smsSent: result.success };
}

// ── Call script ─────────────────────────────────────────────────────────────
// Lives in a pure module so the program-page card (a client component) says
// the same first sentence as the plan page and the letter.
export { buildCallScript } from "@/lib/benefits/call-script";

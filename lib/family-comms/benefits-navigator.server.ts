/**
 * Benefits Care Navigator — AI-drafted, TJ-approved first-touch letters,
 * written and signed as Olera (not as TJ, since 2026-09-30).
 *
 * Replaces the templated B1 "first step" email with a personal note composed
 * per family from everything we actually hold: their own words (facts they
 * tapped), the eligibility-ranked first step, and what's near them. The
 * coordinator COMPOSES a draft; nothing sends until TJ approves it from the
 * /admin/benefits caseload (draft-queue-first, locked 2026-07-29). TJ signs,
 * TJ reads replies. The draft queue doubles as the concierge discovery engine:
 * every edit TJ makes is a correction the composer learns from at review time.
 *
 * Honesty rails (non-negotiable):
 *  - The model may only reference facts THE FAMILY provided; nothing inferred,
 *    nothing looked up about them.
 *  - Program specifics (name, phone, documents, savings) are injected from the
 *    verified pipeline pick and must be used as given — never invented.
 *  - No persona fabrication: the letter is from Olera, and a real person reads
 *    the replies. "Care navigator" language is fine; "social worker" is not
 *    (licensed title).
 *  - Provider mention is an OFFER of introductions only — no acceptance or
 *    eligibility claims (Phase 4 gate: zero payment-acceptance data).
 */
import Anthropic from "@anthropic-ai/sdk";
import { claimsStatedNeed, rerouteStoredPacket, type NavigatorPacket } from "@/lib/benefits/navigator-packet";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectFirstStepProgram,
  buildCallScript,
  benefitsSituationLine,
  familyPhraseFromRelationship,
  parseEntrySourceProgram,
  type FirstStepPick,
} from "./benefits-cascade.server";
import { findPipelineDraftFor, getStateAbbrev } from "@/lib/program-data";
import { stateToTimezone } from "@/lib/sms/quiet-hours";
import { familyBenefitsFacts, hasCoResidentSpouse } from "./benefits-guidance.server";
import { countProvidersInArea } from "./provider-recs.server";
import { smsCarriesPhone } from "./sms-phone";
import { switchLine } from "@/lib/benefits/switch-line";
import { careNeedSourceFromMeta, isInferredCareNeed } from "@/lib/benefits/care-need-source";

// ── Metadata shape: business_profiles.metadata.benefits_navigator ──────────

export interface BenefitsNavigatorMeta {
  /** pending = waiting for TJ; sent/dismissed are terminal for this draft. */
  status?: "pending" | "sent" | "dismissed";
  composed_at?: string;
  subject?: string;
  body?: string;
  /** Care-team companion text ({link} placeholder; STOP suffix added at send). */
  sms?: string | null;
  model?: string;
  /** Snapshot of the verified first-step pick so the send path never re-runs
   *  selection (the letter references THIS program; re-picking could drift). */
  pick?: {
    programId: string;
    stateId: string | null;
    name: string;
    shortName: string;
    contactLabel: string;
    contactPhone: string;
    contactHours: string | null;
    documents: string[];
    programPath: string;
    complexity: string | null;
    savingsRange: string | null;
    source: string;
  };
  provider_count?: number;
  /** TJ's saved in-drawer edits. The AI originals above stay untouched — the
   *  edit-vs-original diff is the concierge learning signal the draft queue
   *  exists to capture. Send and the AI-review exports prefer these. Cleared
   *  by recompose (the letter they edited no longer exists). */
  edited_subject?: string;
  edited_body?: string;
  edited_sms?: string | null;
  edited_at?: string;
  edited_by?: string;
  /** Scheduled send: the letter (saved edits included) goes out automatically
   *  at/after this UTC instant via the benefits-navigator-scheduler cron.
   *  Cleared on manual send, dismiss, recompose, or a blocked fire. */
  scheduled_at?: string;
  scheduled_by?: string;
  /** A scheduled fire that was blocked (governance cap, no email, …) — the
   *  draft stays pending and the reason surfaces in the admin queue. */
  schedule_failed_at?: string;
  schedule_failed_reason?: string;
  /** Recompose: the letter was re-drafted from current program data, which
   *  discards the prior draft and TJ's edits to it. Present on live rows and
   *  previously absent from this type. */
  recomposed_at?: string;
  recomposed_reason?: string;
  /** Set when a fact-check round patched this draft's text in place. */
  factcheck_patched_at?: string;
  dismissed_reason?: string;
  /** Composed by scripts/backfill-benefits-navigator-drafts.ts rather than by
   *  the coordinator, which is why its intake can be months old. */
  backfill?: boolean;
  backfill_intake_age_days?: number;
  /** The computed routing verdict (lib/benefits/navigator-packet.ts). Built
   *  by the benefits-navigator-packets cron whenever the letter changes, and
   *  read by the admin queue to explain why a letter is waiting. */
  packet?: NavigatorPacket;
  sent_at?: string;
  /** Who fired the send: TJ's button, the scheduler cron firing a scheduled
   *  letter, or the autopilot releasing an `auto`-routed letter. */
  sent_via?: "admin" | "scheduler" | "auto";
  /** Automatic recomposes this draft has been through (autopilot). Capped so
   *  a letter that keeps routing `recompose` lands with a person instead of
   *  looping model spend. Carried across recomposes. */
  auto_recompose_count?: number;
  /** The autopilot could not recompose (no other qualifying program). It
   *  stops retrying; the letter waits for a person. */
  auto_recompose_failed_at?: string;
  auto_recompose_failed_reason?: string;
  /** The letter carries the caveat rewrite (lib/benefits/navigator-packet.ts
   *  routePacket): it kept the family's entry program, stated the condition
   *  the fit reads flagged, and named an agreed alternative. The packet reads
   *  this so the caveat happens once. Carried across later same-program
   *  recomposes (the caveat is re-applied from the fields below). */
  caveat_applied_at?: string;
  caveat_program_id?: string;
  caveat_alt_program_id?: string | null;
  caveat_alt_name?: string;
  /** The fit reads' `why` text the condition was reduced from. */
  caveat_condition?: string[];
  /** The in-flight send lock (benefits-navigator-send.server.ts). Present
   *  only while one caller is delivering this letter. */
  send_claim?: { id: string; at: string; by: "admin" | "scheduler" | "auto" };
  /** Final copies as actually sent (TJ may have edited the drafts). */
  sent_subject?: string;
  sent_body?: string;
  sent_sms?: string;
  dismissed_at?: string;
}

/**
 * Was this family's care need inferred rather than stated? The packet records
 * it at build time from the intake event. A packet built before that field
 * falls back to profile metadata, plus the entry pick as a proxy for
 * program-page intakes older than benefits_results.requested_program
 * (2026-08-25). The proxy errs toward treating a need as inferred, which can
 * only cause a rewrite, never a send.
 */
function letterNeedInferred(
  profileMeta: Record<string, unknown> | null | undefined,
  nav: BenefitsNavigatorMeta,
): boolean {
  if (typeof nav.packet?.needInferred === "boolean") return nav.packet.needInferred;
  const answers = (profileMeta as {
    benefits_results?: { answers?: { careNeed?: unknown; careNeedSource?: unknown } };
  } | null | undefined)?.benefits_results?.answers;
  if (!answers?.careNeed) return false;
  if (isInferredCareNeed(careNeedSourceFromMeta(profileMeta))) return true;
  return answers.careNeedSource !== "stated" && nav.pick?.source === "entry";
}

export function readBenefitsNavigator(
  profileMeta: Record<string, unknown> | null | undefined,
): BenefitsNavigatorMeta {
  const raw = (profileMeta as { benefits_navigator?: unknown } | null | undefined)
    ?.benefits_navigator;
  if (!raw || typeof raw !== "object") return {};
  const nav = raw as BenefitsNavigatorMeta;
  // Every reader (autopilot, send gate, admin queue) sees the stored packet
  // re-routed under today's rules, so a rule change reaches letters judged
  // before it without re-billing the fit models. See rerouteStoredPacket.
  //
  // Only stored `recompose` verdicts, the route whose rules changed on
  // 2026-09-24. Re-deriving every route would also release letters held for
  // reasons retired in August (a stale-intake hold, a bare questionable
  // read): 2 of 124 pending on 2026-09-24 would have gone review -> auto and
  // sent without anyone deciding that.
  //
  // One exception, and it can only hold a letter, never release one: a
  // letter that tells the family they said they need something, when their
  // need was inferred from the program page, re-routes from auto or review
  // to a same-program rewrite. Every letter composed for a program-page
  // family before 2026-09-24 says "You said you need help paying for care".
  //
  // And a packet built before the packet recorded provenance, for a family
  // whose need was inferred, had its fit read under the old prompt, which
  // told the models that need was the family's own. Such a read may not
  // switch or rule out their program; it re-drafts the same program instead,
  // and the rebuilt packet re-reads fit under the corrected prompt.
  if (!nav.packet) return nav;
  const needInferred = letterNeedInferred(profileMeta, nav);
  const claimsUnstatedNeed = needInferred && claimsStatedNeed(nav.edited_body ?? nav.body ?? "");
  const fitReadOnInventedNeed = needInferred && typeof nav.packet.needInferred !== "boolean";
  const route = nav.packet.route;
  if (route !== "recompose" && !(claimsUnstatedNeed && (route === "auto" || route === "review"))) {
    return nav;
  }
  const packet = rerouteStoredPacket(nav.packet, {
    pickIsEntry: nav.pick?.source === "entry",
    caveatApplied: !!nav.caveat_applied_at,
    claimsUnstatedNeed,
    fitReadOnInventedNeed,
  });
  return packet === nav.packet ? nav : { ...nav, packet };
}

// ── Voice spec ─────────────────────────────────────────────────────────────
// This is the product. The audience is confused and overwhelmed, often a
// low-income senior or their adult child, and heavily scam-targeted. The
// letter must read as one competent human who looked at their situation and
// is not going to waste their time.

const NAVIGATOR_VOICE = `You draft short notes from Olera. Olera helps families of older adults find care and the benefit programs that help pay for it. A real person on the Olera team reads and answers every reply to these notes. Write as Olera ("we"), never as a named person: no "it's TJ", no personal name, no "I". TJ, 2026-09-30: for a free benefits service a named sender adds liability and a personal obligation for no gain.

WHO YOU ARE WRITING TO
A family member or senior who used Olera's free benefits finder. The FAMILY section says WHEN — it may have been days ago or months ago, so take the timing from there and never assume it was recent. They are often overwhelmed, short on money, and wary of scams. Many came looking for help with bills first, care second. Write at a 6th-grade reading level.

VOICE
- Plain words. Short sentences. Calm and competent, like a good caseworker.
- Warm but never gushing. No hype, no marketing language, no exclamation points, no emojis.
- Never use these words: journey, navigate, unlock, empower, explore, amazing, exciting.
- No em dashes. Use periods and commas.
- Do not open with "I hope this finds you well" or any filler greeting.
- Anchor trust in what THEY did: name the concrete thing (they used the benefits finder, what they were looking into). Never reveal knowledge they did not give us.

SIMPLICITY (the most important rule)
- Write like you would text a neighbor you respect. Not like an essay.
- Keep most sentences under 12 words. One idea per sentence.
- 90 to 130 words total. If a sentence does not help them make the call, cut it.
- No stacked clauses. No semicolons. At most one short parenthetical (a program nickname).
- If the program covers several sub-programs, name ONLY the part that fits this family's facts, and list ONLY that part's documents. Drop the rest entirely. Two or three documents at most.
- Phrase the call naturally. If the contact label and the phone number say the same thing, say it once ("Call 2-1-1"), never "Call Texas 2-1-1 at 2-1-1".
- If a savings figure is given, one short sentence at most ("Families that qualify often save $X a year.").

HONESTY RULES (never break these)
- Only mention facts listed in the FAMILY section. If something is not listed, do not reference it or guess at it.
- Never state or imply how fast this will go unless the FIRST STEP section gives a timeline. Do not say quick, easy, simple, fast, or "just one call". A family who expects an answer this week and waits three months feels lied to, and stops answering us.
- Never assume the care recipient's gender. "My spouse" is not "your husband". If the FAMILY section does not name them or say wife/husband/mother/father, write "your spouse" or "your loved one".
- Recommend, do not instruct. "We would start with" and "it is worth asking about" are right. "Call this number" and "do not call back" are not. We can be wrong, and a family should never feel ordered around by us.
- Hold a dollar figure until the family qualifies for it. If eligibility turns on something we do not know, ask that question first and leave the amount out. Leading with money a reader cannot get reads as bait.
- Hedge the facts, not the recommendation. Rules and figures get "as we understand it" or "the figure we are seeing". What we would do stays direct.
- Program details (name, phone number, documents, savings) come from the FIRST STEP section. Use them exactly as given. Never invent numbers, dollar amounts, deadlines, or eligibility claims.
- Never promise approval, never say they qualify. "Worth a call" is the ceiling.
- Never tell a family their own numbers are "in range", "within the limits", "in the range they look at", or any equivalent. That reads as a yes and it is the same promise as saying they qualify, made sideways. State what a limit IS if it is given to you. Never measure the family against it.
- The income figure in FAMILY is the care recipient's own income. Means-tested programs count the whole household, including a spouse. So never present that figure as though it were what the program will weigh, and if the family includes a spouse, do not mention the family's income next to a program limit at all.
- Telling a family they do NOT qualify is subject to the same rules in reverse, and the stakes are worse: a wrong yes costs someone an afternoon, a wrong no costs them a benefit they were owed and would have received. If the facts look unpromising, you may say the limits look tight, but you must in the same breath say that only the agency decides, and that applying is free and worth doing anyway. Never write a sentence whose effect is to talk a family out of applying.
- The provider offer, when included, is only an offer to introduce them if they reply. No claims about what providers accept or cost.
- If FAMILY says they applied for Medicaid and were denied, never write the letter as though they have not tried. Being told no already is the reason they may not call again, so answer it before you ask for anything. Say plainly that a denial for one kind of Medicaid does not decide a different one, because long-term-care Medicaid counts income and assets under its own rules. Then hold the usual line: only the agency decides, applying is free, and it is worth doing anyway. Never say or imply the earlier decision was wrong, never guess why they were denied, and never suggest this time will go differently.
- If FAMILY says they are not on Medicaid and have not applied, treat that as a starting point rather than an obstacle, and do not refer to a denial that never happened.

STRUCTURE (90-130 words total)
1. One or two sentences: that this is Olera, and the concrete thing they did. Acknowledge, in plain terms, what they came looking for. If CAME LOOKING FOR names a program that is NOT the first step below, say so in one short clause before you give the step, so they can see we read what they typed. One clause, not a paragraph, and never talk them out of the thing they came for: "You were looking at X. That is worth applying for. For help with Y, the call we would start with is..." Do not do this when CAME LOOKING FOR is the same program as the first step, or when it says nothing specific.

NAMING WHAT THEY NEED CREATES A DEBT. If you say back what they told you they need, and the first step does not directly answer it, you MUST bridge the two in the same breath. One plain sentence saying honestly what this step does and does not do, and why it is still the one to start with. "This will not pay for care itself. It frees up money each month, and it moves in weeks instead of months." Never say their need back and then hand them something unrelated with no connection, which reads as not having listened at all and is worse than never mentioning it. If you cannot make an honest bridge, do not name the need. If FAMILY says the first name is unknown, open with no name at all ("Hi, this is Olera.") — never guess a name and never use a placeholder.
2. The one first step, laid out so it feels doable. Name their plan page in the FIRST sentence of this paragraph, before you give the phone number, and say in that same sentence what is written on it: the phone script and the short list of what to have nearby. Then name the program, who to call, and the number. The number must appear in a sentence of yours, never only on the page, so a family who would rather just dial is never forced through a link. If the program is a Medicaid waiver or needs a Medicaid application first, say plainly that the process runs weeks to months. Never imply the call itself resolves it.
3. ONE of the following, never both, chosen from the data:
   - If MISSING FACTS lists anything: one gentle ask for a single fact, tied to a concrete payoff ("If you tell us X, we can check Y for you").
   - Else if the PROVIDER OFFER section allows it: one sentence offering to introduce them to a few care providers near them if they reply.
   If the FAMILY facts contain a reason they would rule themselves out (no Medicaid, income they think is too high), answer that BEFORE asking them to act. A reader who thinks they do not qualify stops reading at the instruction.
4. Close in one sentence: they can reply to this email and a person on our team reads every reply (phrase it naturally, e.g. "You can reply to this email. A person on our team reads every reply."). Sign off exactly as "Olera" on its own line, with no personal name.

COMPANION TEXT MESSAGE
Also draft one short text message. It goes only to families who asked for texts, alongside the email, from the same number that texted their results. Texts get seen when email does not, so this is often the first thing they read.
- Two short sentences, under 200 characters before the link. It must sound like a person texting, not a notification. Same voice rules as the letter.
- Start with "Olera:" so the thread stays recognizable. Never use a personal name in the text.
- The phone number is the most important thing in the text. Name the program and give the phone number from the FIRST STEP section exactly as written there, once. Families told us a text without the number was useless to them. Example shape: "Olera: For LIHEAP, call 1-877-555-0142. What to say and what to have ready: {link}"
- Include the literal placeholder {link} exactly once where the plan link belongs. Write no other links, no other phone numbers, and no opt-out language (it is added automatically). Never put a period or any other punctuation directly after {link}. End the clause before it, or let the link sit at the end of the sentence.
- End exactly with "Reply CALLED, NO ANSWER, or STUCK." This gives the family a clear way to move their plan forward without opening a link.

FORMAT
Return exactly this format, nothing else:
SUBJECT: <a plain, specific subject line. No clickbait, no colons-and-hype. Something a person would write, like "Your first step for LIHEAP">
TEXT: <the companion text message on a single line>

<the letter body as plain text paragraphs separated by blank lines. No markdown, no links, no bullet points.>`;

/**
 * How the letter should refer to when the family used the finder.
 *
 * The live cascade only composes inside a 2-10 day band, so "on Tuesday" was
 * always true and the weekday was hardcoded. The backfill reaches families
 * whose intake is months old, where "on Tuesday" reads as THIS Tuesday and
 * makes the letter look like it was written about someone else. Past two
 * weeks we name the month instead and tell the model to own the delay: a
 * family who filled the finder in June knows it was June, and pretending
 * otherwise is the fastest way to look automated.
 */
export function intakeReference(
  intakeAt: string,
  now: number = Date.now(),
  state?: string | null,
): { phrase: string; stale: boolean } {
  const at = new Date(intakeAt);
  // Render the weekday in the FAMILY's timezone, not the server's. Without an
  // explicit timeZone, toLocaleDateString uses the process zone: an intake at
  // 02:30 UTC is Wednesday on a UTC serverless box and Tuesday in ET, so the
  // same letter named a different day depending on where it was composed.
  const tz = stateToTimezone(state) ?? "America/New_York";
  const ageDays = (now - at.getTime()) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    // Unparseable or future-dated: say nothing specific rather than guess.
    return { phrase: "recently", stale: false };
  }
  if (ageDays <= 14) {
    return {
      phrase: `on ${at.toLocaleDateString("en-US", { weekday: "long", timeZone: tz })}`,
      stale: false,
    };
  }
  const nowD = new Date(now);
  const sameYear = at.getUTCFullYear() === nowD.getUTCFullYear();
  // "back in August" on August 22nd reads as a mistake. Inside the current
  // month, say how long ago instead of naming it.
  if (sameYear && at.getUTCMonth() === nowD.getUTCMonth()) {
    return { phrase: "a few weeks ago", stale: true };
  }
  const month = at.toLocaleDateString("en-US", {
    month: "long",
    timeZone: tz,
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return { phrase: `back in ${month}`, stale: true };
}

// ── Compose ────────────────────────────────────────────────────────────────

export interface NavigatorComposeInput {
  profileId: string;
  accountId: string;
  displayName: string | null;
  state: string | null;
  city: string | null;
  careTypes: string[];
  /** ISO timestamp of benefits intake completion. */
  intakeAt: string;
  profileMeta: Record<string, unknown>;
  /** Profile row fields familyBenefitsFacts reads (pass the loaded row). */
  factsRow: Parameters<typeof familyBenefitsFacts>[0];
  /** Program ids the selector must skip. Used when a fact-check rules a pick
   *  out but the family still has it saved, so the normal ladder would keep
   *  choosing it (2026-08-07: a WV family's saved VISIONS outranked the Aged
   *  and Disabled Waiver they saved first, because the ladder sorts by
   *  ascending complexity before saved order). */
  exclude?: string[];
  /**
   * Re-select TO this program if it is usable. Set from a packet's
   * recomposeTarget — the alternative both fit models independently named.
   * Passed to selectFirstStepProgram as a pin, so it wins when it has
   * callable content and falls through to the normal ladder when it does
   * not; a suggestion that cannot anchor a letter must never produce one.
   */
  prefer?: { programId: string; stateId: string | null };
  /**
   * Caveat rewrite: keep this program and add its condition plus a better
   * first call if the condition does not apply. Applied only when the ladder
   * lands on `keepProgramId` again; if program data moved and it picks
   * something else, the letter is composed normally and caveatApplied is
   * false.
   */
  caveat?: {
    keepProgramId: string;
    /** The fit reads' reasons. The composer reduces them to the condition. */
    conditions: string[];
    alt: { programId: string | null; name: string; phone: string | null };
  };
}

export interface NavigatorDraft {
  subject: string;
  body: string;
  /** Care-team companion text (one {link} placeholder; STOP suffix added at
   *  send). Null when the model omitted it — send falls back to the template. */
  sms: string | null;
  pick: FirstStepPick;
  providerCount: number;
  /** The caveat was requested AND the pick matched, so the letter carries it. */
  caveatApplied: boolean;
}

/** Care types that make a provider introduction sensible (a LIHEAP-only
 *  bills-relief family should not get a care-provider pitch in touch one). */
function providerOfferAllowed(careTypes: string[], providerCount: number): boolean {
  return providerCount >= 3 && careTypes.length > 0;
}

/**
 * Compose a navigator draft for one family. Returns null when there is no
 * qualifying first-step program (same fewer-honest-beats-hollow rule as the
 * old B1) or when the model output is unusable. Throws only on transport
 * errors — callers decide whether to retry next run.
 */
export async function composeNavigatorDraft(
  db: SupabaseClient,
  input: NavigatorComposeInput,
): Promise<NavigatorDraft | null> {
  const facts = familyBenefitsFacts(input.factsRow);
  const pick = await selectFirstStepProgram(db, {
    accountId: input.accountId,
    stateAbbrev: input.state,
    facts,
    exclude: input.exclude,
    pin: input.prefer ?? null,
    // A preferred program is a model's suggestion, not an approved letter.
    pinScreened: true,
  });
  if (!pick) return null;

  const relationship =
    (input.profileMeta.relationship_to_recipient as string) || null;
  const familyPhrase = familyPhraseFromRelationship(relationship);
  const situation = benefitsSituationLine(input.profileMeta);
  // The benefits intake collects NO name — save-results defaults display_name
  // to "Care Seeker", so a naive split greeted every family "Care," (TJ QA
  // 2026-07-29). Treat placeholder names as no-name; the letter opens
  // nameless unless a real name exists (e.g. set later via enrichment).
  const rawFirst = input.displayName?.split(/\s+/)[0] || null;
  const PLACEHOLDER_FIRST_NAMES = new Set(["care", "seeker", "family", "guest", "friend", "user", "there"]);
  const firstName =
    rawFirst && !PLACEHOLDER_FIRST_NAMES.has(rawFirst.toLowerCase()) ? rawFirst : null;

  const missing: string[] = [];
  const pMeta = input.profileMeta as {
    age?: unknown;
    age_band?: unknown;
    medicaid_status?: unknown;
    income_range?: unknown;
  };
  if (!pMeta.age && !pMeta.age_band) missing.push("the age of the person needing care");
  if (!pMeta.medicaid_status) missing.push("whether they are on Medicaid");
  if (!pMeta.income_range) missing.push("a rough monthly income range");
  // The intake asks for the recipient's income, but every means test counts
  // the household. With a spouse in the picture the stored band is a
  // fragment, so ask for the combined figure before anything weighs it.
  // Skipped for preferNotToSay: they declined to give a figure, and asking
  // about the scope of a number they withheld reads as not having listened.
  else if (pMeta.income_range !== "preferNotToSay" && hasCoResidentSpouse(input.profileMeta)) {
    missing.push("whether that income figure is just theirs or covers both spouses");
  }

  let providerCount = 0;
  if (input.city && input.state && input.careTypes.length > 0) {
    try {
      providerCount = await countProvidersInArea(
        db,
        input.city,
        input.state,
        input.careTypes,
      );
    } catch {
      providerCount = 0;
    }
  }
  const offerProviders = providerOfferAllowed(input.careTypes, providerCount);

  const intakeRef = intakeReference(input.intakeAt, Date.now(), input.state);
  const callScript = buildCallScript(pick.shortName, relationship);

  // What they SAID they need, and what they CAME for. Two different facts,
  // and neither reached the composer before 2026-08-23.
  const NEED_PHRASE: Record<string, string> = {
    payingForCare: "help paying for care",
    stayingAtHome: "help staying at home",
    memoryHealth: "help with memory and health",
    companionship: "companionship",
  };
  const rawNeed =
    (input.profileMeta as { benefits_results?: { answers?: { careNeed?: unknown } } })
      ?.benefits_results?.answers?.careNeed;
  // The program-page card never asks for a need; it derives one from the
  // page. That is not something they said, and writing "What they said they
  // need" from it made letters answer a need nobody stated. Provenance comes
  // from the latest intake event (lib/benefits/care-need-source.ts).
  let intakeEvent: Record<string, unknown> | null = null;
  try {
    const { data: ev } = await db
      .from("seeker_activity")
      .select("metadata")
      .eq("profile_id", input.profileId)
      .eq("event_type", "benefits_completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    intakeEvent = (ev?.metadata as Record<string, unknown> | null) ?? null;
  } catch {
    intakeEvent = null;
  }
  const needInferred = isInferredCareNeed(careNeedSourceFromMeta(input.profileMeta, intakeEvent));
  const statedNeed =
    typeof rawNeed === "string" && !needInferred ? NEED_PHRASE[rawNeed] ?? null : null;

  // The entry program, resolved independently of which tier won the pick.
  let entryLabel: string | null = null;
  try {
    const { data: acct } = await db
      .from("accounts")
      .select("signup_source")
      .eq("id", input.accountId)
      .maybeSingle();
    const entry = parseEntrySourceProgram(acct?.signup_source as string | null);
    if (entry) {
      const draft = findPipelineDraftFor(getStateAbbrev(entry.stateId), entry.programId);
      entryLabel = draft?.shortName || draft?.name || null;
    }
  } catch {
    // A missing entry label just means the letter opens without naming it.
    entryLabel = null;
  }

  const caveat =
    input.caveat && input.caveat.keepProgramId === pick.programId && input.caveat.conditions.length > 0
      ? input.caveat
      : null;
  const caveatLines = caveat
    ? [
        "",
        "CONDITION TO STATE (required for this letter):",
        `- Two independent checks flagged a condition on ${pick.shortName} that we could not confirm from what the family told us:`,
        ...caveat.conditions.map((c) => `  - "${c.replace(/"/g, "'")}"`),
        `- Better first call if that condition does not fit them: ${caveat.alt.name}${caveat.alt.phone ? ` at ${caveat.alt.phone}` : " (we do not have a number for it; name it without one)"}`,
        `- Right after the paragraph with the first step, write ONE plain sentence that says who ${pick.shortName} is for, reduced to the eligibility condition only, in plain words: "This program is for ...". Do not say or imply whether this family meets it.`,
        caveat.alt.phone
          ? `- Then exactly one sentence in this shape: "If that's not you, ${caveat.alt.name} is a better first call: ${caveat.alt.phone}." Use that name and number exactly as given, and nothing else about it (no documents, no figures, no timeline).`
          : `- Then exactly one sentence in this shape: "If that's not you, ${caveat.alt.name} is a better first call." Write no number for it and nothing else about it.`,
        "- Keep the whole letter inside the word limit. Cut elsewhere to make room.",
        "- The companion text stays about the first step and its number only.",
      ]
    : [];

  const dataBlock = [
    "FAMILY (only what they told us — reference nothing else):",
    `- First name: ${firstName ?? "unknown (open without a name)"}`,
    `- Who needs care: ${familyPhrase}`,
    `- State: ${input.state ?? "unknown"}${input.city ? `, city: ${input.city}` : ""}`,
    `- Used the benefits finder ${intakeRef.phrase}`,
    // The stated need and the entry program are DIFFERENT facts, and the
    // composer used to see the entry program only when it happened to be the
    // pick. So a family who typed "paying for care" and landed on the SNAP
    // page got a SNAP letter that never acknowledged either thing.
    statedNeed ? `- What they said they need: ${statedNeed}` : null,
    // Inferred need: the page they came through is the only interest they
    // expressed, and CAME LOOKING FOR below already says it.
    needInferred ? "- What they need: they did not say. We know only the page they came through." : null,
    entryLabel
      ? `- CAME LOOKING FOR: the ${entryLabel} page${entryLabel === pick.shortName ? " (which is also the first step below)" : " (NOT the first step below)"}`
      : "- CAME LOOKING FOR: nothing specific, they arrived through the site",
    // The program they came for leads unless ruled out or uncallable, and a
    // switch must be explained (TJ, 2026-09-24). Hand the composer the reason
    // so the letter says it in a sentence instead of silently swapping.
    switchLine(pick)
      ? `- WHY THE FIRST STEP IS NOT WHAT THEY CAME FOR (say this plainly, once): ${switchLine(pick)}`
      : null,
    intakeRef.stale
      ? "- TIMING: this was a while ago and we are following up late. Say so plainly in the opening, in a few words, without apologizing at length or explaining ourselves. Never imply they just used it. Their situation may well have changed, so offer the step as something still worth doing rather than as news."
      : null,
    `- What they told us about their situation: ${situation || "nothing beyond the above"}`,
    `- MISSING FACTS: ${missing.length > 0 ? missing.join("; ") : "none"}`,
    "",
    "FIRST STEP (verified — use exactly as given):",
    `- Program: ${pick.name} (short name: ${pick.shortName})`,
    `- Call: ${pick.contact.label} at ${pick.contact.phone}${pick.contact.hours ? ` (${pick.contact.hours})` : ""}`,
    `- Have nearby before calling: ${pick.documents.join("; ")}`,
    `- Phone script written on their plan page: "${callScript}"`,
    pick.savingsRange ? `- Typical savings: ${pick.savingsRange}` : null,
    "",
    "PROVIDER OFFER:",
    offerProviders
      ? `- Allowed. There are ${providerCount} ${input.careTypes[0].toLowerCase()} providers near ${input.city}. Offer a personal introduction if they reply. No other claims.`
      : "- Not allowed for this family. Do not mention providers.",
    ...caveatLines,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // max_tokens covers thinking + text on this model — a tight cap truncates
  // the letter mid-sentence, so leave generous headroom (letters are ~200 words).
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: NAVIGATOR_VOICE,
    messages: [{ role: "user", content: dataBlock }],
  });

  // Safety classifiers can decline (stop_reason "refusal") — treat like an
  // unusable draft, not an error; the next run retries.
  if (response.stop_reason === "refusal") return null;
  const text = response.content.find((b) => b.type === "text");
  const raw = text && text.type === "text" ? text.text.trim() : "";
  const match = raw.match(/^SUBJECT:\s*(.+?)\s*\n+(?:TEXT:\s*(.+?)\s*\n+)?([\s\S]+)$/);
  if (!match) return null;
  const subject = match[1].trim();
  const smsRaw = (match[2] || "").trim();
  const body = match[3].trim().replace(/—/g, ", ").replace(/[ \t]+\n/g, "\n");
  if (!subject || body.length < 80) return null;
  // The companion text is optional (send falls back to the template without
  // it) but never oversized or off-format: cap length, strip stray links.
  // It must also carry the program's number: a text without it is the one
  // families replied to with "I need the phone number". A draft that leaves
  // it out is dropped, and the send path uses the template, which always
  // has it.
  const sms =
    smsRaw &&
    smsRaw.length >= 40 &&
    smsRaw.includes("{link}") &&
    !/https?:\/\//.test(smsRaw) &&
    smsCarriesPhone(smsRaw, pick.contact.phone)
      ? smsRaw.replace(/—/g, ", ").slice(0, 320)
      : null;

  return { subject, body, sms, pick, providerCount, caveatApplied: !!caveat };
}

/** Serialize the pick for the metadata snapshot (send path re-reads it). */
export function pickSnapshot(pick: FirstStepPick): NonNullable<BenefitsNavigatorMeta["pick"]> {
  return {
    programId: pick.programId,
    stateId: pick.stateId ?? null,
    name: pick.name,
    shortName: pick.shortName,
    contactLabel: pick.contact.label,
    contactPhone: pick.contact.phone,
    contactHours: pick.contact.hours ?? null,
    documents: pick.documents,
    programPath: pick.programPath,
    complexity: pick.complexity ?? null,
    savingsRange: pick.savingsRange ?? null,
    source: pick.source,
  };
}

// ── Email rendering ────────────────────────────────────────────────────────
// Deliberately un-designed: a personal note, not a campaign. 16px body for
// the senior audience, paragraphs as written, one plan link appended
// deterministically (the model never writes links), unsubscribe footer.

/** tel: href from a human-formatted phone ("2-1-1", "1-877-541-7905"). */
function telHref(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${digits}`;
}

export function renderNavigatorEmail(opts: {
  body: string;
  planUrl: string;
  unsubscribeUrl: string;
  /** The program's phone number, kept tappable (TJ design 2026-07-29): a
   *  70-year-old reading on her phone should never have to memorize a number
   *  and dial it herself. It is no longer the letter's primary action (see
   *  the button below) but it stays one tap away so nobody is gated. */
  call?: { phone: string } | null;
}): string {
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.65; color: #1f2937;">${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");
  // The plan page is the letter's one button (2026-08-22). It used to be the
  // phone number, with the page as a grey line underneath — and the letter was
  // opened by 39% of families and clicked by 2%, against 20% on the day-0
  // results email, which is the one email that asks for a click. Two competing
  // buttons would only split a click rate that barely exists, so the call moves
  // into the caption: still one tap, no longer the headline. The page carries
  // the same call button plus the script, the checklist and the agency's hours,
  // so this routes families through more help rather than past it — and unlike
  // a sent letter, a wrong number on the page can still be corrected.
  const callLine = opts.call
    ? ` Or call <a href="${telHref(opts.call.phone)}" style="color: #6b7280;">${opts.call.phone}</a>.`
    : "";
  return `
<div style="max-width: 560px; margin: 0 auto; padding: 32px 24px; font-family: Georgia, 'Times New Roman', serif;">
  ${paragraphs}
  <a href="${opts.planUrl}" style="display: block; margin: 24px 0 0; padding: 15px 20px; background: #33261e; color: #f7f3ee; text-align: center; border-radius: 12px; font-size: 17px; font-weight: bold; text-decoration: none; font-family: Arial, sans-serif;">Open your call plan</a>
  <p style="margin: 10px 0 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
    The number, the script, and what to have ready.${callLine}
  </p>
  <p style="margin: 28px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; line-height: 1.6; color: #9ca3af; font-family: Arial, sans-serif;">
    You're getting this because you used Olera's benefits finder.
    <a href="${opts.unsubscribeUrl}" style="color: #9ca3af;">Stop these emails</a>.
  </p>
</div>`;
}

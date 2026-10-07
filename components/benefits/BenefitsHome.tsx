import Link from "next/link";
import type { WaiverProgram } from "@/data/waiver-library";
import { CARE_NEED_LABEL, type CareNeed } from "@/lib/benefits/match-care-need";
import type { FirstStepPick, BenefitsCascadeMeta } from "@/lib/family-comms/benefits-cascade.server";
import JourneyActions, { type NextStepInfo } from "@/components/benefits/JourneyActions";
import ApplyStatusCard from "@/components/benefits/ApplyStatusCard";
import FactChips, { type KnownFacts } from "@/components/benefits/FactChips";
import { benefitAmountLabel } from "@/lib/benefits/savings-label";
import { switchLine } from "@/lib/benefits/switch-line";

/**
 * BenefitsHome — the /m/{token} results page, rebuilt as a guide instead of a
 * directory (plans/benefits-results-home.md, TJ 2026-07-28).
 *
 * Structure mirrors the provider "Your profile" page's DNA: personal greeting +
 * recognition of what we know, ONE warm hero card with one action (the
 * ten-minute first step, same selection + script as the day-2 email), a small
 * progress strip, then the other matches grouped by job and collapsed. The
 * flat 11-card wall answered "what exists"; this answers "what should I do".
 *
 * Server component, zero client JS: collapse uses native <details>, the call
 * action is a tel: link. The in-session overlay keeps the old ResultsSheet.
 */

export interface BenefitsHomeProps {
  /** The results token — the grant JourneyActions writes with. */
  token: string;
  /** "Up next" program shown after the first step is marked done. */
  nextStep: FirstStepPick | null;
  /** True only when the session user owns this profile. */
  signedIn?: boolean;
  firstName: string | null;
  stateName: string;
  stateSlug: string;
  careNeed: CareNeed;
  /** careNeed was derived from the page they signed up on, not chosen. The
   *  chip plays back their words, so an inferred need gets no chip. */
  careNeedInferred?: boolean;
  /** Display value, e.g. "Parent" | "Spouse" | "Self" | "Family member". */
  relationship: string | null;
  /** e.g. "asap" | "within_month" — humanized in the chip row. */
  timeline: string | null;
  payments: string[] | null;
  matches: WaiverProgram[];
  /** Programs a HELD fact rules out — demoted into a labeled group, never
   *  silently removed (a family who saw 11 matches yesterday shouldn't
   *  wonder where two went after tapping a chip). */
  ruledOut?: { program: WaiverProgram; reason: string }[];
  /** For the gap chips' PATCH body. */
  profileId: string;
  /** Phase 3 facts we hold; gaps render as tappable "+ Add" chips. */
  knownFacts: KnownFacts;
  firstStep: FirstStepPick | null;
  callScript: string | null;
  cascade: BenefitsCascadeMeta;
  /** Our texting number, set only for families with sms_consent (they already
   *  have a thread with it) — renders the "Stuck? Text TJ" line. */
  textTjNumber?: string | null;
  /** The apply-along link when the first step is Medicare Savings or Extra
   *  Help (lib/benefits/apply-along.ts), carrying this plan's token. */
  applyHref?: string | null;
}

const APPLICATION_STATUS_COPY: Partial<
  Record<NonNullable<BenefitsCascadeMeta["application_status"]>, string>
> = {
  called: "You called the program. We’ll remember where you left off.",
  no_answer: "You couldn’t reach the program yet. Your call details are still here.",
  needs_docs: "The agency asked for documents. Your checklist is ready below.",
  applied: "Your application is marked submitted.",
  waiting: "You’re waiting on the agency. We’ll keep your place here.",
  not_eligible: "That program wasn’t a fit. Your other matches are still here.",
  stuck: "You asked the Olera team for help. Your plan remembers that request.",
};

const TIMELINE_LABELS: Record<string, string> = {
  asap: "Care needed soon",
  immediate: "Care needed soon",
  within_month: "Within a month",
  within_1_month: "Within a month",
  few_months: "In a few months",
  within_3_months: "In a few months",
  researching: "Planning ahead",
  exploring: "Planning ahead",
};

function relationshipChip(rel: string | null): string | null {
  if (!rel) return null;
  const v = rel.toLowerCase();
  if (v === "self" || v === "myself") return "Care for yourself";
  if (v.includes("parent")) return "Caring for a parent";
  if (v.includes("spouse")) return "Caring for a spouse";
  return "Caring for family";
}

/** Group the non-hero matches by the job they do for the family. Keyword
 *  classifier over name + tagline — same spirit as paysForCare() in the
 *  guidance module; precision matters less than not showing a wall. */
function groupLabel(p: WaiverProgram): string {
  const text = `${p.name} ${p.shortName || ""} ${p.tagline || ""}`.toLowerCase();
  if (/(snap|food|meal|grocer|nutrition)/.test(text)) return "Food & groceries";
  if (/(liheap|energy|weatheriz|utility|heating|cooling|phone|internet|lifeline)/.test(text))
    return "Home & utility bills";
  if (/(waiver|hcbs|pace|personal care|attendant|respite|adult day|nursing|assisted living|in-home|home care|long-term care)/.test(text))
    return "Help paying for care";
  if (/(medicare|medicaid|prescription|drug|health|ship|insurance|premium)/.test(text))
    return "Health coverage & costs";
  return "More support";
}

const GROUP_ORDER = [
  "Help paying for care",
  "Health coverage & costs",
  "Home & utility bills",
  "Food & groceries",
  "More support",
];

// Shared parser: a typical range stays a range, a maximum stays "Up to".
function savingsLine(range?: string | null): string | null {
  return benefitAmountLabel(range)?.text ?? null;
}

/** Drop a trailing "(WAP)"-style parenthetical from the hero title. */
function stripParen(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "");
}

/** Draft `hours` values are free text; some are sentinels like "Contact for
 *  hours" that read as broken copy when rendered as hours. Only show values
 *  that look like actual hours. */
function looksLikeHours(h: string): boolean {
  return /\d|am|pm|mon|tue|wed|thu|fri|sat|sun|daily|hour|weekday/i.test(h) && !/contact/i.test(h);
}

/** Doc strings carry long parentheticals ("(pay stubs, Social Security award
 *  letter, pension statements)") that turn checklist rows into paragraphs on
 *  a phone. The page trims them; the full detail lives in the program guide. */
function trimDoc(d: string): string {
  return d.replace(/\s*\([^)]*\)/g, "").trim();
}

export default function BenefitsHome(props: BenefitsHomeProps) {
  const {
    token,
    nextStep,
    signedIn,
    firstName,
    stateName,
    stateSlug,
    careNeed,
    careNeedInferred = false,
    relationship,
    timeline,
    payments,
    matches,
    ruledOut = [],
    profileId,
    knownFacts,
    firstStep,
    callScript,
    cascade,
    textTjNumber,
    applyHref,
  } = props;

  // Family-language chips, not taxonomy: "Paying for care" is our enum label
  // and confused real families (TJ QA, 2026-07-28). Play back their situation
  // in their words.
  const CARE_NEED_CHIP: Record<string, string> = {
    payingForCare: "Help paying for care",
    stayingAtHome: "Help staying at home",
    memoryHealth: "Memory & health support",
    companionship: "Companionship & support",
  };
  const careLabel = careNeedInferred
    ? null
    : CARE_NEED_CHIP[careNeed] || CARE_NEED_LABEL[careNeed] || null;
  const chips = [
    stateName,
    careLabel ? careLabel.charAt(0).toUpperCase() + careLabel.slice(1) : null,
    relationshipChip(relationship),
    timeline ? TIMELINE_LABELS[timeline] || null : null,
    payments && payments.length ? payments.join(", ") : null,
  ].filter(Boolean) as string[];

  const others = matches.filter((p) => p.id !== firstStep?.programId);
  const grouped = new Map<string, WaiverProgram[]>();
  for (const p of others) {
    const g = groupLabel(p);
    grouped.set(g, [...(grouped.get(g) || []), p]);
  }
  const groups = GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => ({
    label: g,
    programs: grouped.get(g)!,
  }));

  // Progress: matched is always done; the first step advances when the family
  // marks the call done on this page OR self-reports "moving" on the check-in.
  const stepState =
    cascade.outcome === "moving" || cascade.first_step_done_at
      ? 3
      : cascade.first_step_sent_at || firstStep
        ? 2
        : 1;

  const nextStepInfo: NextStepInfo | null = nextStep
    ? {
        name: stripParen(nextStep.name),
        shortName: nextStep.shortName,
        phone: nextStep.contact.phone,
        programPath: nextStep.programPath,
        savings:
          savingsLine(nextStep.savingsRange) ??
          savingsLine(matches.find((p) => p.id === nextStep.programId)?.savingsRange),
      }
    : null;

  // The hero needs its "why": drafts often lack a savings range (WAP in GA),
  // but the matched program data usually carries one. Draft wins, match fills.
  const heroMatch = firstStep ? matches.find((p) => p.id === firstStep.programId) : null;
  const heroSavings =
    savingsLine(firstStep?.savingsRange) ?? savingsLine(heroMatch?.savingsRange);
  const switchNote = switchLine(firstStep);

  return (
    <main className="min-h-screen bg-[#faf8f5]">
      <div className="mx-auto max-w-xl px-5 py-8 sm:py-12">
        {/* ── Recognition ─────────────────────────────────────────────── */}
        <h1 className="font-serif text-[28px] font-bold leading-tight text-gray-900">
          {firstName ? `Hi ${firstName},` : "Hello,"} here&apos;s your plan.
        </h1>
        {signedIn && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
            <span aria-hidden>&#10003;</span> Added to your private Olera plan. Your progress here is remembered.
          </p>
        )}
        <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
          Based on what you shared with us:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-700"
            >
              {c}
            </span>
          ))}
          {/* The living half of the row: held facts as chips, gaps as
              tappable asks. Answering re-runs the server re-rank. */}
          <FactChips
            token={token}
            profileId={profileId}
            facts={knownFacts}
            suppressMedicaidChip={!!payments?.some((p) => /medicaid/i.test(p))}
            isSelf={/^(self|myself)$/i.test((relationship || "").trim())}
          />
        </div>

        {cascade.application_status && APPLICATION_STATUS_COPY[cascade.application_status] && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-medium leading-relaxed text-emerald-900">
            <span aria-hidden>&#10003;</span>{" "}
            {APPLICATION_STATUS_COPY[cascade.application_status]}
          </div>
        )}

        {/* ── Progress strip ──────────────────────────────────────────── */}
        <div className="mt-7 flex items-center gap-2 text-[12px] font-medium">
          {["Matched", "First step", "In motion"].map((label, i) => {
            const n = i + 1;
            const done = n < stepState;
            const active = n === stepState;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-6 bg-gray-300" />}
                <span
                  className={
                    done
                      ? "text-emerald-700"
                      : active
                        ? "rounded-full bg-gray-900 px-2.5 py-1 text-white"
                        : "text-gray-400"
                  }
                >
                  {done ? "✓ " : ""}
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Start here — the living half of the page. JourneyActions owns
               the hero, done-state, up-next card, and persisted checklist. ── */}
        {/* When the plan does not start with the program they came for, say
            why in one quiet line (TJ, 2026-09-24). */}
        {switchNote && (
          <p className="-mb-2 mt-6 text-[14px] leading-relaxed text-gray-600">{switchNote}</p>
        )}
        {firstStep ? (
          <JourneyActions
            token={token}
            hero={{
              programId: firstStep.programId,
              name: stripParen(firstStep.name),
              shortName: firstStep.shortName,
              savings: heroSavings,
              agencyLabel: stripParen(firstStep.contact.label),
              phone: firstStep.contact.phone,
              hours:
                firstStep.contact.hours && looksLikeHours(firstStep.contact.hours)
                  ? firstStep.contact.hours
                  : null,
              programPath: firstStep.programPath,
            }}
            callScript={callScript}
            documents={firstStep.documents.map(trimDoc)}
            initialDone={!!cascade.first_step_done_at}
            initialChecked={cascade.docs_checked || []}
            nextStep={nextStepInfo}
          />
        ) : null}
        {cascade.applied?.at ? (
          <ApplyStatusCard token={token} appliedAt={cascade.applied.at} initial={cascade.applied.decision ?? null} />
        ) : null}
        {firstStep && applyHref && !cascade.applied ? (
          <a
            href={applyHref}
            className="mt-3 flex min-h-[52px] items-center justify-center rounded-2xl border-[1.5px] border-primary-800 text-[16px] font-semibold text-primary-800 no-underline"
          >
            Or apply online, with us beside you
          </a>
        ) : null}
        {firstStep ? null : (
          matches[0] && (
            <section className="mt-5 rounded-2xl bg-[#33261e] p-6 text-[#f7f3ee] shadow-sm">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#c9b8a8]">
                Start here
              </p>
              <h2 className="mt-1.5 font-serif text-[22px] font-bold leading-snug">
                {matches[0].name}
              </h2>
              {matches[0].tagline && (
                <p className="mt-2 text-[14px] leading-relaxed text-[#d8ccc0]">{matches[0].tagline}</p>
              )}
              <Link
                href={`/benefits/${stateSlug}/${matches[0].id}`}
                className="mt-4 block rounded-xl bg-[#f7f3ee] px-5 py-3.5 text-center text-[16px] font-bold text-[#33261e] transition-opacity hover:opacity-90"
              >
                See how to apply
              </Link>
            </section>
          )
        )}

        {/* Help is one tap from where stuckness happens. Only for families
            who consented to texts — the number already lives in their thread,
            so this reads as "text the person who texted me", not a stranger. */}
        {textTjNumber && (
          <p className="mt-4 text-[14px] leading-relaxed text-gray-500">
            Stuck or not sure what to say?{" "}
            <a
              href={`sms:${textTjNumber}`}
              className="font-semibold text-gray-800 underline underline-offset-2"
            >
              Text TJ
            </a>{" "}
            and a real person will answer.
          </p>
        )}

        {/* ── The rest, held not shouted ──────────────────────────────── */}
        {groups.length > 0 && (
          <section className="mt-9">
            <h3 className="font-serif text-[19px] font-semibold text-gray-900">
              Your other {others.length} {others.length === 1 ? "match" : "matches"}
            </h3>
            <p className="mt-1 text-[14px] text-gray-500">
              We&apos;re holding these for you. Start with the one above; these will still be here.
            </p>
            <div className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
              {groups.map((g) => (
                <details key={g.label} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[15px] font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                    <span>
                      {g.label}
                      <span className="ml-2 text-[13px] font-normal text-gray-400">
                        {g.programs.length}
                      </span>
                    </span>
                    <span className="text-gray-400 transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <ul className="space-y-3 pb-4">
                    {g.programs.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/benefits/${stateSlug}/${p.id}`}
                          className="block"
                        >
                          <span className="text-[15px] font-medium text-gray-900 hover:text-primary-700">
                            {p.shortName || p.name}
                          </span>
                          {savingsLine(p.savingsRange) && (
                            <span className="ml-2 text-[13px] font-medium text-emerald-700">
                              {savingsLine(p.savingsRange)}
                            </span>
                          )}
                          {p.tagline && (
                            <span className="mt-0.5 block text-[13px] leading-snug text-gray-500">
                              {p.tagline}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* ── Ruled out, honestly held ────────────────────────────────── */}
        {ruledOut.length > 0 && (
          <section className="mt-7">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-[14px] font-medium text-gray-500 [&::-webkit-details-marker]:hidden">
                <span>
                  Probably not a fit, based on what you told us
                  <span className="ml-2 text-[13px] font-normal text-gray-400">
                    {ruledOut.length}
                  </span>
                </span>
                <span className="text-gray-400 transition-transform group-open:rotate-90">›</span>
              </summary>
              <ul className="space-y-3 pb-2 pt-1">
                {ruledOut.map(({ program: p, reason }) => (
                  <li key={p.id}>
                    <Link href={`/benefits/${stateSlug}/${p.id}`} className="block">
                      <span className="text-[14px] font-medium text-gray-500 hover:text-gray-700">
                        {p.shortName || p.name}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-gray-400">
                        {reason}. If your situation changes, it may be worth another look.
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}

        {/* ── Quiet human line ────────────────────────────────────────── */}
        <p className="mt-9 text-[14px] leading-relaxed text-gray-500">
          Not sure where to start? Email{" "}
          <a href="mailto:support@olera.care" className="font-medium text-primary-700">
            support@olera.care
          </a>{" "}
          and a real person will point you the right way.
        </p>
      </div>
    </main>
  );
}

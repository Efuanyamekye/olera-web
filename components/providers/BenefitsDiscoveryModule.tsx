"use client";

/**
 * BenefitsDiscoveryModule (V3 — 2-step embedded SBF on provider pages).
 *
 * Replaces the V2 5-step intake. Two steps only: care need → contact
 * (email or SMS). On submit, the API silently creates the family profile
 * (auth.users + accounts + business_profiles type='family' + token), then
 * the ResultsSheet overlay opens in place — no redirect.
 *
 * Why this exists: V2 was at 8.2% completion / 39% step-1 pickup. The
 * structural friction (visible 5-step form on a provider page) was the
 * killer. V3 removes everything between the first care-need pick and the
 * email field. Targets: 55%+ step-1 pickup, 15%+ contact completion.
 *
 * 3-arm A/B on entry-point copy (lib/analytics/variant.ts):
 *   - availability — "There's help paying for care in {state}." (positive)
 *   - loss         — "Most {state} families miss out…" + dollar floor (loss)
 *   - empathic     — "Care is expensive." (shared truth)
 *
 * Per-card pickup tracking added: benefits_step_completed for step
 * "care-need" carries `care_need_selected` so we can see which card pulls.
 *
 * Standalone /benefits/finder is intentionally untouched — different
 * surface, different intent. Don't copy V3's structural bet there.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  ArrowRight,
  ArrowLeft,
  House,
  Coin,
  Brain,
  HandHeart,
  Spinner,
  UsersThree,
  Heart,
  User,
  UsersFour,
} from "@phosphor-icons/react";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import { trackBenefitsEvent, type BenefitsStepEvent } from "@/lib/analytics/track-step";
import { isPreviewMode } from "@/lib/analytics/preview-mode";
import { type BenefitsVariant } from "@/lib/analytics/variant";
import { useIntakeVariant } from "@/hooks/use-intake-variant";
import { BENEFITS_VARIANT_COPY } from "@/lib/analytics/variant-copy";
import { matchesCareNeed, type CareNeed } from "@/lib/benefits/match-care-need";
import { readUtmParams } from "@/lib/ad-boost/utm";
import type { MatchableProvider } from "@/lib/benefits/provider-tie-in";
import type { WaiverProgram } from "@/data/waiver-library";
import EmpathicSingleStep from "@/components/providers/BenefitsDiscoveryModule.empathic";
import ResultsSheet from "@/components/benefits/ResultsSheet";
import { SmsConsentDisclosure } from "@/components/sms/SmsConsentDisclosure";

/** Minimal program shape passed from the provider page server component. */
export interface BenefitsProgram {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  savingsRange?: string;
  programType?: string;
  structuredEligibility?: {
    ageRequirement?: string;
    incomeTable?: Array<{ householdSize: number; monthlyLimit: number }>;
  };
}

interface BenefitsDiscoveryModuleProps {
  providerState: string; // 2-letter abbreviation (e.g., "TX")
  stateId: string;       // slug (e.g., "texas")
  stateName: string;
  topPrograms: BenefitsProgram[];   // retained for back-compat; unused in V3 layout
  allPrograms: BenefitsProgram[];
  providerName?: string;
  providerSlug?: string;
  /** care_types array for the provider tie-in helper. */
  providerCareTypes?: string[] | null;
  /** category string for the provider tie-in helper. */
  providerCategory?: string | null;
  /** Path of the page the module is mounted on. Provider pages leave this
   *  unset (routing is implied by providerSlug). Editorial mounts pass
   *  `/caregiver-support/{slug}` so downstream analytics can segment
   *  conversion by entry page. Persisted to accounts.signup_source on submit
   *  and attached to every funnel event. */
  entrySource?: string;
}

// ─── Care need cards — order matters. "Paying for care" first because it's
//     the most-universal pain across senior-care provider visitors and creates
//     instant fluency with all 3 H2 arms (each mentions "paying for care").
const CARE_NEED_OPTIONS: Array<{
  value: CareNeed;
  label: string;
  description: string;
  icon: typeof House;
}> = [
  { value: "payingForCare", label: "Paying for care", description: "Medicare savings, cash benefits, food help", icon: Coin },
  { value: "stayingAtHome", label: "In-home care", description: "Personal care, daily tasks, mobility", icon: House },
  { value: "memoryHealth", label: "Memory & medical care", description: "Dementia care, doctor visits, prescriptions", icon: Brain },
  { value: "companionship", label: "Caregiver & social support", description: "Respite breaks, social programs", icon: HandHeart },
];

// 3-arm copy lives in lib/analytics/variant-copy.ts as BENEFITS_VARIANT_COPY
// so the admin drill-in's static preview shares one source. Notion DB
// remains the durable commentary record:
// https://app.notion.com/p/ec27110d1c6a4cc1a76bdf991344f63d

// ─── Relationship — step 2's tap-question. Powers the personalized H2 on
//     step 3 ("Save your parent's matches") AND gives us a structural data
//     point we currently don't capture for downstream personalization.
type Relationship = "my-parent" | "my-spouse" | "myself" | "other-family";

const RELATIONSHIP_OPTIONS: Array<{
  value: Relationship;
  label: string;
  description: string;
  icon: typeof User;
}> = [
  { value: "my-parent", label: "For my parent", description: "Mom, Dad, or both", icon: UsersThree },
  { value: "my-spouse", label: "For my spouse", description: "Husband, wife, or partner", icon: Heart },
  { value: "myself", label: "For me", description: "I'm planning my own care", icon: User },
  { value: "other-family", label: "Someone else in the family", description: "Grandparent, sibling, or other relative", icon: UsersFour },
];

// Possessive phrase used in step 3's H2 + the post-submit overlay's contextual
// copy. "Save your parent's matches" feels like saving something for someone
// you love. "Save your matches" is fine but less personal.
function relationshipPhrase(rel: Relationship | null): string {
  switch (rel) {
    case "my-parent":
      return "your parent's";
    case "my-spouse":
      return "your spouse's";
    case "myself":
      return "your";
    case "other-family":
      return "these";
    case null:
    default:
      return "your";
  }
}

type Step = "care-need" | "relationship" | "contact";
const STEP_NUMBERS: Record<Step, number> = {
  "care-need": 1,
  relationship: 2,
  contact: 3,
};

// Phone normalization helper — UI-side only. Server re-validates with normalizeUSPhone.
function isPlausiblePhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

export default function BenefitsDiscoveryModule({
  providerState,
  stateId,
  stateName,
  topPrograms,
  allPrograms,
  providerName,
  providerSlug,
  providerCareTypes,
  providerCategory,
  entrySource,
}: BenefitsDiscoveryModuleProps) {
  // ─── Step + form state ───────────────────────────────────────────────
  const [step, setStep] = useState<Step>("care-need");
  const [careNeed, setCareNeed] = useState<CareNeed | null>(null);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  // Phone-as-optional design: both fields visible, email required, phone is
  // a bonus signal. Drops the older toggle-based SMS path. The server still
  // accepts SMS-only payloads from any caller, but this UI always submits email.
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Tracking refs ───────────────────────────────────────────────────
  const startTrackedRef = useRef(false);
  const entryTrackedRef = useRef(false);
  const viewedStepsRef = useRef<Set<Step>>(new Set());
  const stepEnterTimeRef = useRef<number>(Date.now());

  // ─── Spotlight echo from Q&A section (preserved from V2) ──────────────
  const [quotedQuestion, setQuotedQuestion] = useState<string | null>(null);
  const [echoVisible, setEchoVisible] = useState(false);

  // ─── Session + variant — driven by the 5-arm dial via useIntakeVariant.
  // Previously this used a standalone 3-arm hash (assignBenefitsVariant)
  // that was uncorrelated with the dial — meaning the dial decided whether
  // the benefits surface rendered at all, but the copy frame was a
  // separate roll. With the empathic_single consolidation, we want the
  // dial to drive copy directly: a session assigned to 5-arm "empathic"
  // sees empathic_single, not a random 1-of-3 copy. useIntakeVariant
  // already honors getPreviewArm() so admin preview links continue to work.
  const [sessionId, setSessionId] = useState<string>("");
  const intakeVariant = useIntakeVariant();
  const [variant, setVariant] = useState<BenefitsVariant>("availability");
  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);
  useEffect(() => {
    if (
      intakeVariant === "availability" ||
      intakeVariant === "loss" ||
      intakeVariant === "empathic"
    ) {
      setVariant(intakeVariant);
    }
    // Other 5-arm values (outreach, qa_email_capture) → BenefitsArmGate
    // hides this entire surface, so the variant state is irrelevant.
    // Initial value "availability" is the SSR-safe placeholder.
  }, [intakeVariant]);

  function fireFunnelEvent(
    event: BenefitsStepEvent,
    extras?: { stepNumber?: number; stepName?: string; timeOnStepMs?: number; careNeedSelected?: CareNeed | null },
  ) {
    trackBenefitsEvent({
      event,
      sessionId,
      stateCode: providerState,
      stateName,
      providerName: providerName || null,
      providerSlug: providerSlug || null,
      variant,
      entrySource: entrySource || null,
      ...extras,
    });
  }

  function trackStepCompleted(stepKey: Step, careNeedSelected?: CareNeed | null) {
    fireFunnelEvent("benefits_step_completed", {
      stepNumber: STEP_NUMBERS[stepKey],
      stepName: stepKey,
      timeOnStepMs: Date.now() - stepEnterTimeRef.current,
      careNeedSelected,
    });
  }

  // ─── Spotlight handoff from Q&A section ───────────────────────────────
  // When a caregiver submits a question, the room quiets around us. Move
  // preserved verbatim from V2 — Perena/Wispr Flow vibe.
  useEffect(() => {
    let pendingTimeouts: number[] = [];
    function clearPending() {
      pendingTimeouts.forEach((id) => window.clearTimeout(id));
      pendingTimeouts = [];
    }
    function handleQuestionSubmitted(e: Event) {
      const detail = (e as CustomEvent<{ question: string }>).detail;
      if (!detail?.question) return;
      clearPending();
      setEchoVisible(false);
      setQuotedQuestion(detail.question);
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") active.blur();
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      // Double rAF + block: "center" — see BenefitsDiscoveryModule.empathic.tsx
      // for the rationale. Same fix applies to the legacy 3-step flow.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById("benefits");
          if (el) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
          document.body.classList.add("benefits-spotlight-active");
        });
      });
      pendingTimeouts.push(window.setTimeout(() => setEchoVisible(true), 450));
      pendingTimeouts.push(
        window.setTimeout(() => document.body.classList.remove("benefits-spotlight-active"), 2700),
      );
    }
    window.addEventListener("olera:question-submitted", handleQuestionSubmitted);
    return () => {
      window.removeEventListener("olera:question-submitted", handleQuestionSubmitted);
      clearPending();
      document.body.classList.remove("benefits-spotlight-active");
    };
  }, []);

  // ─── Funnel: entry_viewed (mount, gated on sessionId) ─────────────────
  useEffect(() => {
    if (!sessionId || entryTrackedRef.current) return;
    entryTrackedRef.current = true;
    fireFunnelEvent("benefits_entry_viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ─── Funnel: step_viewed + entry-time reset ────────────────────────────
  useEffect(() => {
    stepEnterTimeRef.current = Date.now();
    if (!sessionId) return;
    if (viewedStepsRef.current.has(step)) return;
    viewedStepsRef.current.add(step);
    fireFunnelEvent("benefits_step_viewed", {
      stepNumber: STEP_NUMBERS[step],
      stepName: step,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId]);

  // Fire-and-forget: notify Slack + log that a user started the intake.
  function trackStart(selectedCareNeed: CareNeed) {
    if (startTrackedRef.current) return;
    startTrackedRef.current = true;
    if (isPreviewMode()) return; // admin inspection — don't pollute funnel
    const label = CARE_NEED_OPTIONS.find((o) => o.value === selectedCareNeed)?.label || selectedCareNeed;
    try {
      fetch("/api/benefits/track-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careNeedLabel: label,
          stateCode: providerState,
          stateName,
          providerName: providerName || null,
          providerSlug: providerSlug || null,
          sessionId,
          variant,
          entrySource: entrySource || null,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // swallow — tracking must never block the UX
    }
  }

  // ─── Match list — recomputed when careNeed changes. Used both for the
  //     "matchedPrograms" payload sent to the server AND for the post-submit
  //     overlay (passed via overlayMatches state below).
  const matchingPrograms = useMemo(() => {
    if (!careNeed) return [];
    return allPrograms.filter((p) => matchesCareNeed(p, careNeed));
  }, [allPrograms, careNeed]);

  // ─── Post-submit overlay state ────────────────────────────────────────
  // Set on successful submit, opens the ResultsSheet. Snapshotted because
  // the matchingPrograms upstream could change if the user later flips
  // careNeed (they shouldn't be able to in V3, but defensive).
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMatches, setOverlayMatches] = useState<WaiverProgram[]>([]);
  const [overlayMatchCount, setOverlayMatchCount] = useState(0);
  const [overlayContactDest, setOverlayContactDest] = useState<string | null>(null);
  const [overlayContactChannel, setOverlayContactChannel] = useState<"email" | "sms">("email");

  if (topPrograms.length === 0) return null;

  // ─── Empathic_single arm (D) — the consolidated single-step flow ──────
  // Replaces the 3-step relay for variant=empathic. availability + loss
  // continue to render the legacy 3-step flow below (currently weighted
  // 0% but kept iterable as bench assets — see SBF Copy Variants Notion).
  if (variant === "empathic") {
    return (
      <EmpathicSingleStep
        providerState={providerState}
        stateId={stateId}
        stateName={stateName}
        allPrograms={allPrograms}
        providerName={providerName}
        providerSlug={providerSlug}
        providerCareTypes={providerCareTypes}
        providerCategory={providerCategory}
        entrySource={entrySource}
      />
    );
  }

  // ─── Handle submit ────────────────────────────────────────────────────
  async function handleSubmit() {
    setError(null);

    // Admin preview mode: form short-circuits with a friendly notice
    // instead of submitting. Initial state + this notice is enough to
    // evaluate copy + layout per the v1 preview spec.
    if (isPreviewMode()) {
      setError("Preview mode — submission disabled.");
      return;
    }

    // Email is always required in V3 — phone is the bonus signal.
    // Client-side gate; server re-validates strictly via validateEmailStrict.
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    // Phone optional — only validate format if user typed something.
    if (phone.trim() && !isPlausiblePhone(phone)) {
      setError("That phone number doesn't look right. You can leave it blank.");
      return;
    }

    trackStepCompleted("contact");
    setSaving(true);

    const { utmSource, utmCampaign } = readUtmParams();

    try {
      const res = await fetch("/api/benefits/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careNeed,
          age: null,
          medicaidStatus: null,
          incomeRange: null,
          stateCode: providerState,
          // Email-primary contact in the V3 flow. Phone (if given) attaches
          // to the same family profile as a secondary channel.
          contactChannel: "email",
          email: email.trim().toLowerCase(),
          phone: phone.trim() ? phone : undefined,
          relationship: relationship || undefined,
          providerSlug: providerSlug || undefined,
          entrySource: entrySource || undefined,
          sessionId: sessionId || undefined,
          utmSource,
          utmCampaign,
          matchedPrograms: matchingPrograms.map((p) => ({
            programId: p.id,
            stateId,
            name: p.name,
            shortName: p.shortName,
            programType: p.programType,
            savingsRange: p.savingsRange,
          })),
          matchCount: matchingPrograms.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The server returns { error, suggestion?, suggestedEmail?, code? }
        const msg = data?.suggestion || data?.error || "Something went wrong. Please try again.";
        setError(msg);
        setSaving(false);
        return;
      }

      // Success — open the ResultsSheet overlay in place. Email is always
      // the primary contact in V3, so the footer line shows the email.
      setOverlayMatches(matchingPrograms as unknown as WaiverProgram[]);
      setOverlayMatchCount(typeof data.matchCount === "number" ? data.matchCount : matchingPrograms.length);
      setOverlayContactDest(email.trim().toLowerCase());
      setOverlayContactChannel("email");
      setSaving(false);
      setOverlayOpen(true);
    } catch (err) {
      console.error("[BenefitsDiscoveryModule] Submit failed:", err);
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  const v = BENEFITS_VARIANT_COPY[variant];

  // Progress bar — single proportional bar across the full width. Fills as
  // the user completes steps. Beats the segmented design (3 separate bars
  // with gaps) where one filled segment only spans ~30% of the visual
  // width — the eye reads that as "barely started" rather than "1/3 done."
  // No pulse, no flicker. The bar's width transition (500ms ease-out)
  // does the work; CSS handles the smoothness.
  const completedSteps =
    (careNeed ? 1 : 0) +
    (relationship ? 1 : 0) +
    (overlayOpen ? 1 : 0);
  const progressPct = (completedSteps / 3) * 100;
  const ProgressBar = () => (
    <div className="h-1 w-full rounded-full bg-gray-200 overflow-hidden mb-6">
      <div
        className="h-full bg-gray-900 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${progressPct}%` }}
      />
    </div>
  );

  const provider: MatchableProvider | null = providerName
    ? {
        display_name: providerName,
        care_types: providerCareTypes,
        category: providerCategory,
      }
    : null;

  return (
    <section
      id="benefits"
      className="benefits-discovery-module rounded-3xl border border-gray-100 bg-white px-5 py-6 sm:px-7 sm:py-8 shadow-sm"
    >
      {/* Quoted-question echo from Q&A section (preserved) */}
      {quotedQuestion && (
        <p
          className={`benefits-echo-line ${echoVisible ? "is-visible" : ""} font-display italic text-[15px] text-gray-500 mb-3 leading-relaxed`}
        >
          You just asked: <span className="text-gray-700">&ldquo;{quotedQuestion}&rdquo;</span>
        </p>
      )}

      {/* Back button — visible on steps 2 and 3, points one step back */}
      {(step === "relationship" || step === "contact") && (
        <button
          onClick={() => {
            setStep(step === "contact" ? "relationship" : "care-need");
            setError(null);
          }}
          aria-label="Go back"
          className="mb-3 -ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}

      <ProgressBar />

      {/* Step content wrapper — keyed on `step` so React remounts on each
          transition; the wrapper's animate-step-in class plays a 220ms
          slide-up + fade. Replaces the prior abrupt content swap. */}
      <div key={step} className="animate-step-in">
      {step === "care-need" && (
        <>
          <h2 className="font-display text-2xl font-bold text-gray-900 leading-tight">{v.h2(stateName)}</h2>
          {/* Subtitle takes the visual weight that the now-removed trust
              strip used to carry. Larger + darker than before so it lands
              as a clear "do this" beat between the H2 and the cards. */}
          <p className="mt-2 mb-6 text-base leading-relaxed text-gray-700">{v.sub(stateName)}</p>

          <div className="space-y-2 mb-2">
            {CARE_NEED_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = careNeed === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    setCareNeed(opt.value);
                    trackStart(opt.value);
                    trackStepCompleted("care-need", opt.value);
                    setTimeout(() => setStep("relationship"), 140);
                  }}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all ${
                    isSelected
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? "bg-white/15 text-white" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" weight="regular" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[15px] font-semibold leading-tight ${isSelected ? "text-white" : "text-gray-900"}`}>
                      {opt.label}
                    </div>
                    <div className={`mt-0.5 text-[13px] leading-snug ${isSelected ? "text-white/70" : "text-gray-500"}`}>
                      {opt.description}
                    </div>
                  </div>
                  <ArrowRight className={`h-4 w-4 flex-shrink-0 ${isSelected ? "text-white/60" : "text-gray-300"}`} weight="bold" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === "relationship" && (
        <>
          <h2 className="font-display text-2xl font-bold text-gray-900 leading-tight">Who is care for?</h2>
          <p className="mt-1 mb-5 text-sm text-gray-500">So we send the right matches.</p>

          <div className="space-y-2 mb-2">
            {RELATIONSHIP_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = relationship === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    setRelationship(opt.value);
                    trackStepCompleted("relationship");
                    setTimeout(() => setStep("contact"), 140);
                  }}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all ${
                    isSelected
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? "bg-white/15 text-white" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" weight="regular" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[15px] font-semibold leading-tight ${isSelected ? "text-white" : "text-gray-900"}`}>
                      {opt.label}
                    </div>
                    <div className={`mt-0.5 text-[13px] leading-snug ${isSelected ? "text-white/70" : "text-gray-500"}`}>
                      {opt.description}
                    </div>
                  </div>
                  <ArrowRight className={`h-4 w-4 flex-shrink-0 ${isSelected ? "text-white/60" : "text-gray-300"}`} weight="bold" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === "contact" && (
        <>
          <h2 className="font-display text-2xl font-bold text-gray-900 leading-tight">
            {matchingPrograms.length > 0
              ? `Save ${relationshipPhrase(relationship)} ${matchingPrograms.length} ${matchingPrograms.length === 1 ? "match" : "matches"}.`
              : `Save ${relationshipPhrase(relationship)} matches.`}
          </h2>
          <p className="mt-1 mb-5 text-sm text-gray-500">
            We&apos;ll send a magic link so you can come back anytime.
          </p>

          {/* Email — required */}
          <label className="block">
            <span className="sr-only">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              disabled={saving}
              className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[16px] text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-0 transition disabled:opacity-50"
            />
          </label>

          {/* Phone — optional, visually secondary */}
          <label className="mt-3 block">
            <span className="sr-only">Phone number (optional)</span>
            <div className="relative">
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Phone (optional, reaches you faster)"
                autoComplete="tel-national"
                inputMode="tel"
                disabled={saving}
                className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-0 transition disabled:opacity-50"
              />
            </div>
          </label>

          {/* Consent — email (magic link) + carrier-compliant SMS disclosure */}
          <p className="mt-2.5 text-[12px] leading-relaxed text-gray-400">
            We&apos;ll save your matches and email you a magic link to come back. We never sell your info.
          </p>
          <SmsConsentDisclosure className="mt-1.5" />

          {error && (
            <p className="mt-2 text-[13px] text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" weight="bold" />
                Saving…
              </>
            ) : (
              <>
                Save my matches
                <ArrowRight className="h-4 w-4" weight="bold" />
              </>
            )}
          </button>
        </>
      )}
      </div>

      {/* Post-submit overlay — same component as /m/{token}, mode="overlay" */}
      {careNeed && (
        <ResultsSheet
          mode="overlay"
          isOpen={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          matches={overlayMatches}
          matchCount={overlayMatchCount}
          careNeed={careNeed}
          state={{ name: stateName, slug: stateId }}
          provider={provider}
          providerSlug={providerSlug || null}
          contactChannel={overlayContactChannel}
          contactDestination={overlayContactDest}
        />
      )}
    </section>
  );
}

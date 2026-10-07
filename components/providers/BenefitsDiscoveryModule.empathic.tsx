"use client";

/**
 * EmpathicSingleStep — empathic_single arm (D) of the post-question CTA.
 *
 * Consolidates the prior 3-arm copy A/B (availability, loss, empathic) into
 * a single structural variant: one-step capture w/ value preview. Mechanic
 * borrowed from qa_email_capture (the only post-question arm that converted
 * in the pre-consolidation 30d window).
 *
 * Flow on render:
 *   1. Listen for olera:question-submitted; set quotedQuestion + spotlight.
 *   2. Infer (careNeed, intent) from question text + provider category.
 *   3. Compute matchingPrograms from inferred careNeed.
 *   4. Render: echo (12px) → intent-mapped H2 → 2 program chips
 *      → [one-click for authed users OR email field] → dynamic CTA → trust.
 *   5. On submit: POST /api/benefits/save-results, replace the form with
 *      an inline success state (no sheet). Match list lives in the email
 *      so the page stays anchored on the provider the user came to see.
 *
 * The "Submitted" funnel event mirrors the legacy 3-step flow so dashboard
 * continuity is preserved (benefits_step_completed step=contact). A new
 * step_name="empathic_single_submitted" is also fired so we can segment
 * the structural variant in analytics.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ArrowRight, Spinner, CheckCircle } from "@phosphor-icons/react";
import { getOrCreateSessionId, getOrCreateVisitId } from "@/lib/analytics/session";
import { trackBenefitsEvent } from "@/lib/analytics/track-step";
import { isPreviewMode } from "@/lib/analytics/preview-mode";
import { EMPATHIC_INTENT_H2 } from "@/lib/analytics/variant-copy";
import { matchesCareNeed } from "@/lib/benefits/match-care-need";
import { inferCareNeedAndIntent } from "@/lib/benefits/infer-care-need-from-question";
import { readUtmParams } from "@/lib/ad-boost/utm";
import {
  useReducedMotion,
  tapHaptic,
} from "@/components/providers/connection-card/MobileUXPrimitives";
import { useAuth } from "@/components/auth/AuthProvider";
import { studyCohort } from "@/lib/benefits/study-cohort";

type Relationship = "my-parent" | "my-spouse" | "myself" | "other-family";
const RELATIONSHIP_PILLS: Array<{ value: Relationship; label: string }> = [
  { value: "my-parent", label: "My parent" },
  { value: "my-spouse", label: "My spouse" },
  { value: "myself", label: "Me" },
  { value: "other-family", label: "Family member" },
];

interface BenefitsProgram {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  savingsRange?: string;
  programType?: string;
}

interface EmpathicSingleStepProps {
  providerState: string;
  stateId: string;
  stateName: string;
  allPrograms: BenefitsProgram[];
  providerName?: string;
  providerSlug?: string;
  providerCareTypes?: string[] | null;
  providerCategory?: string | null;
  entrySource?: string;
}

export default function EmpathicSingleStep({
  providerState,
  stateId,
  stateName,
  allPrograms,
  providerName,
  providerSlug,
  providerCareTypes,
  providerCategory,
  entrySource,
}: EmpathicSingleStepProps) {
  const { user } = useAuth();

  // ─── Session — deferred to useEffect so SSR matches first client render ──
  const [sessionId, setSessionId] = useState<string>("");
  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  // ─── Spotlight handoff from Q&A section ───────────────────────────────
  // Mirrors the spotlight effect in BenefitsDiscoveryModule.tsx so the
  // empathic_single render still gets the smooth scroll + body class.
  const [quotedQuestion, setQuotedQuestion] = useState<string | null>(null);
  const [echoVisible, setEchoVisible] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    let pending: number[] = [];
    function clearPending() {
      pending.forEach((id) => window.clearTimeout(id));
      pending = [];
    }
    function handleQuestionSubmitted(e: Event) {
      const detail = (e as CustomEvent<{ question: string }>).detail;
      if (!detail?.question) return;
      clearPending();
      setEchoVisible(false);
      setQuotedQuestion(detail.question);
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") active.blur();
      // Double rAF: lets React commit the quotedQuestion state update +
      // any Q&A section DOM insertions (the user's question card) settle
      // before we measure scroll target. Single rAF was racing with those
      // layout shifts, landing the scroll past the module's true position.
      // block: "center" puts the module's visual middle at the viewport's
      // visual middle so the sticky tab nav doesn't crop the H2 + echo.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById("benefits");
          if (el) el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
          document.body.classList.add("benefits-spotlight-active");
        });
      });
      pending.push(window.setTimeout(() => setEchoVisible(true), 450));
      pending.push(
        window.setTimeout(() => document.body.classList.remove("benefits-spotlight-active"), 2700),
      );
    }
    window.addEventListener("olera:question-submitted", handleQuestionSubmitted);
    return () => {
      window.removeEventListener("olera:question-submitted", handleQuestionSubmitted);
      clearPending();
      document.body.classList.remove("benefits-spotlight-active");
    };
  }, [reducedMotion]);

  // ─── Inferred care need + intent (memoized) ───────────────────────────
  const inferred = useMemo(
    () => inferCareNeedAndIntent(quotedQuestion, providerCategory ?? null),
    [quotedQuestion, providerCategory],
  );

  // ─── Matching programs ──────────────────────────────────────────────
  const matchingPrograms = useMemo(
    () => allPrograms.filter((p) => matchesCareNeed(p, inferred.careNeed)),
    [allPrograms, inferred.careNeed],
  );

  // Top 2 visible chips on the form. The full list goes in the post-submit email.
  const previewPrograms = useMemo(() => matchingPrograms.slice(0, 2), [matchingPrograms]);

  // ─── Form state ───────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Use authed user's email when available (one-click path)
  const authedEmail = user?.email ?? null;
  const submittableEmail = (authedEmail ?? email).trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittableEmail);

  // ─── Tracking refs ────────────────────────────────────────────────────
  const entryTrackedRef = useRef(false);
  const viewedRef = useRef(false);

  function fire(event: Parameters<typeof trackBenefitsEvent>[0]["event"], extras?: Record<string, unknown>) {
    trackBenefitsEvent({
      event,
      sessionId,
      stateCode: providerState,
      stateName,
      providerName: providerName ?? null,
      providerSlug: providerSlug ?? null,
      variant: "empathic",
      entrySource: entrySource ?? null,
      ...extras,
    });
  }

  useEffect(() => {
    if (!sessionId || entryTrackedRef.current) return;
    entryTrackedRef.current = true;
    fire("benefits_entry_viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || viewedRef.current) return;
    viewedRef.current = true;
    fire("benefits_step_viewed", {
      stepNumber: 1,
      stepName: "empathic_single",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // moduleRef is used by the parent provider page (or anywhere else) to
  // viewport-gate the global sticky "Check cost" bar — see MobileStickyBottomCTA.
  // We don't render an in-module sticky CTA; the in-flow button below + global
  // sticky-bar suppression covers the thumb-zone need for v1.
  const moduleRef = useRef<HTMLElement>(null);

  // ─── Post-submit success state (inline, not a sheet) ─────────────────
  // Stays inside the empathic section so the provider context isn't
  // disrupted. The full match list + provider tie-in + benefit-detail
  // links live in the email instead — page UI keeps the user on the
  // provider they came to see.
  const [submitted, setSubmitted] = useState(false);
  const [submittedMatchCount, setSubmittedMatchCount] = useState(0);
  const [submittedEmail, setSubmittedEmail] = useState<string>("");
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null);
  const [relationshipSaving, setRelationshipSaving] = useState(false);
  // Results token from save-results — the proof of ownership the
  // update-relationship endpoint requires.
  const [resultsToken, setResultsToken] = useState<string | null>(null);
  // The email belongs to an existing account and this visitor is not signed
  // in as it. save-results returns no token then (privacy), so the
  // relationship pills (which write through the token) are hidden and the
  // owner reaches their plan from the sign-in link we emailed.
  const [returningFamily, setReturningFamily] = useState(false);
  const [signInEmailed, setSignInEmailed] = useState(true);

  const handleRelationshipPick = useCallback(
    async (value: Relationship) => {
      if (relationshipSaving) return;
      setSelectedRelationship(value);
      setRelationshipSaving(true);
      try {
        await fetch("/api/benefits/update-relationship", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resultsToken, relationship: value }),
          keepalive: true,
        });
      } catch {
        // best-effort — lead is already captured
      } finally {
        setRelationshipSaving(false);
      }
    },
    [resultsToken, relationshipSaving],
  );

  // ─── Submit handler ───────────────────────────────────────────────────
  async function handleSubmit() {
    setError(null);

    if (isPreviewMode()) {
      setError("Preview mode — submission disabled.");
      return;
    }

    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    fire("benefits_step_completed", {
      stepNumber: 1,
      stepName: "contact",
      careNeedSelected: inferred.careNeed,
    });
    // Also fire the structural marker so analytics can segment this arm
    fire("benefits_step_completed", {
      stepNumber: 1,
      stepName: "empathic_single_submitted",
      careNeedSelected: inferred.careNeed,
    });

    tapHaptic(10);
    setSaving(true);

    const { utmSource, utmCampaign } = readUtmParams();

    try {
      const res = await fetch("/api/benefits/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careNeed: inferred.careNeed,
          // CARE-NAV study tag, if this browser carries one.
          cohort: studyCohort() ?? undefined,
          // Guessed from their question text, not chosen by them.
          careNeedSource: "inferred_from_question",
          age: null,
          medicaidStatus: null,
          incomeRange: null,
          stateCode: providerState,
          contactChannel: "email",
          email: submittableEmail.toLowerCase(),
          providerSlug: providerSlug ?? undefined,
          entrySource: entrySource ?? undefined,
          sessionId: sessionId || undefined,
          visitId: getOrCreateVisitId(),
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
        const msg = data?.suggestion || data?.error || "Something went wrong. Please try again.";
        setError(msg);
        setSaving(false);
        return;
      }
      setSubmittedMatchCount(typeof data.matchCount === "number" ? data.matchCount : matchingPrograms.length);
      setSubmittedEmail(submittableEmail.toLowerCase());
      setResultsToken(typeof data.token === "string" ? data.token : null);
      setReturningFamily(data.existingUser === true);
      setSignInEmailed(data.signInEmailed !== false);
      setSaving(false);
      setSubmitted(true);
    } catch (err) {
      console.error("[EmpathicSingleStep] Submit failed:", err);
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  if (allPrograms.length === 0) return null;

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  const h2 = EMPATHIC_INTENT_H2[inferred.intent](stateName);

  // Dynamic CTA copy — count + state baked in
  const matchCountForCta = matchingPrograms.length;
  const ctaLabel = saving
    ? "Sending…"
    : matchCountForCta > 0
      ? `Email me my ${matchCountForCta} ${stateName} match${matchCountForCta === 1 ? "" : "es"}`
      : `See what's available in ${stateName}`;

  return (
    <section
      id="benefits"
      ref={moduleRef}
      className="benefits-discovery-module rounded-3xl border border-gray-100 bg-white px-5 py-6 sm:px-7 sm:py-8 shadow-sm"
    >
      {submitted ? (
        // ─── Inline success state ──────────────────────────────────────
        // Replaces the form in place. No sheet, no portal, no off-page
        // links. Match details + provider tie-in live in the email — the
        // page stays anchored on the provider the user came to see.
        returningFamily ? (
          <div className="animate-step-in">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" weight="fill" />
              <p className="font-display text-[18px] font-semibold text-gray-900 leading-tight">
                Welcome back.
              </p>
            </div>
            <p className="text-[15px] text-gray-700 leading-relaxed">
              {signInEmailed ? (
                <>
                  We emailed you a link to your plan at{" "}
                  <span className="text-gray-900">{submittedEmail}</span>. Your{" "}
                  {stateName} matches are saved to it.
                </>
              ) : (
                <>
                  Your {stateName} matches are saved to your plan. Sign in with{" "}
                  <span className="text-gray-900">{submittedEmail}</span> to see it.
                </>
              )}
            </p>
          </div>
        ) : (
        <div className="animate-step-in">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" weight="fill" />
            <p className="font-display text-[18px] font-semibold text-gray-900 leading-tight">
              Sent — check your inbox.
            </p>
          </div>
          <p className="text-[14px] text-gray-600 leading-relaxed mb-5">
            We emailed your{" "}
            {submittedMatchCount > 0 && (
              <span className="text-gray-900 font-medium">
                {submittedMatchCount} {stateName} match{submittedMatchCount === 1 ? "" : "es"}
              </span>
            )}
            {submittedMatchCount === 0 && <>{stateName} matches</>} to{" "}
            <span className="text-gray-900">{submittedEmail}</span>.
          </p>

          {/* Soft relationship enrichment — skippable, single tap */}
          {selectedRelationship ? (
            <p className="text-[13px] text-gray-500">
              Got it — saving for{" "}
              <span className="text-gray-700">
                {RELATIONSHIP_PILLS.find((r) => r.value === selectedRelationship)?.label.toLowerCase()}
              </span>
              .
            </p>
          ) : (
            <>
              <p className="text-[13px] text-gray-500 mb-2">Quick — who is this for?</p>
              <div className="flex flex-wrap gap-1.5">
                {RELATIONSHIP_PILLS.map((pill) => (
                  <button
                    key={pill.value}
                    onClick={() => handleRelationshipPick(pill.value)}
                    disabled={relationshipSaving}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        )
      ) : (
        <>
          {/* Echo — 12px italic gray, only when user actually asked. NOT the headline. */}
          {quotedQuestion && (
            <p
              className={`benefits-echo-line ${echoVisible ? "is-visible" : ""} font-display italic text-[12px] text-gray-500 mb-4 leading-relaxed`}
            >
              You asked: <span className="text-gray-600">&ldquo;{quotedQuestion}&rdquo;</span>
            </p>
          )}

          {/* H2 — intent-mapped. The visual hero. */}
          <h2 className="font-display text-[22px] font-bold text-gray-900 leading-tight mb-5">
            {h2}
          </h2>

          {/* Preview chips — 2 real programs. Email gets the full list. */}
          {previewPrograms.length > 0 && (
            <div className="space-y-2 mb-6">
              {previewPrograms.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-gray-900 leading-tight truncate">
                      {p.shortName || p.name}
                    </div>
                    {p.savingsRange && (
                      <div className="text-[12px] text-gray-500 mt-0.5 truncate">{p.savingsRange}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Authed-user one-click path OR email field for guests */}
          {authedEmail ? (
            <div className="mb-3">
              <p className="text-[12px] text-gray-500 mb-2">Signed in as {authedEmail}</p>
            </div>
          ) : (
            <label className="block mb-3">
              <span className="sr-only">Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving && emailValid) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                disabled={saving}
                className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[16px] text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-0 transition disabled:opacity-50"
              />
            </label>
          )}

          {error && (
            <p className="mt-2 text-[13px] text-red-600 mb-2" role="alert">
              {error}
            </p>
          )}

          {/* Primary CTA — dynamic copy, scale-feedback when valid, transitions on press */}
          <button
            onClick={handleSubmit}
            disabled={saving || !emailValid}
            className={`mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-semibold transition-all duration-200 ${
              saving || !emailValid
                ? "bg-gray-200 text-gray-400 cursor-default"
                : "bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]"
            }`}
          >
            {saving ? <Spinner className="h-4 w-4 animate-spin" weight="bold" /> : null}
            {ctaLabel}
            {!saving && emailValid && <ArrowRight className="h-4 w-4" weight="bold" />}
          </button>

          <p className="mt-3 text-[12px] text-gray-400 text-center">No spam.</p>
        </>
      )}
    </section>
  );
}

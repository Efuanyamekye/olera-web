"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Star } from "@phosphor-icons/react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders, type SaveProviderData } from "@/hooks/use-saved-providers";
import MultiProviderCard from "@/components/providers/MultiProviderCard";
import MultiProviderCardV2 from "@/components/providers/MultiProviderCardV2";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import { isPreviewMode } from "@/lib/analytics/preview-mode";
import type { IntakeVariant } from "@/lib/analytics/variant";
import { getCategoryDisplayName, type ProviderCardData } from "@/lib/types/provider";
import type { SimilarProviderForMulti } from "@/lib/provider-utils";

interface QAEntry {
  id?: string;
  question: string;
  answer?: string | null;
  asker_name?: string;
  asker_user_id?: string;
  status?: "pending" | "approved" | "answered";
  created_at?: string;
  answered_at?: string;
}

interface QASectionProps {
  providerId: string;
  providerName: string;
  providerImage?: string;
  providerSlug?: string;
  providerLocation?: string;
  providerCareTypes?: string[];
  providerRating?: number;
  providerPriceRange?: string;
  providerCity?: string;
  providerState?: string;
  questions?: QAEntry[];
  suggestedQuestions?: string[];
  // When true, the page has a benefits discovery module below Q&A.
  // In that case we skip the inline guest enrichment prompt (email capture)
  // because the benefits intake is the stronger conversion path — it
  // captures name + email + a full profile rather than just an email.
  // The spotlight handoff then owns the post-submit moment.
  hasBenefitsSection?: boolean;
  // Variant for A/B test — determines which experience to render.
  // "multi_provider" variant shows click-to-send multi-provider comparison.
  // "qa_email_capture" variant shows redesigned Top-N comparison cards + email capture.
  variant?: IntakeVariant;
  // Similar providers for multi_provider variant
  similarProvidersForMulti?: SimilarProviderForMulti[];
  /** Top providers in same city + category. qa_email_capture arm renders
   *  these as "Top N [Category] in [City]" cards in the post-question
   *  enrichment prompt. Empty array → fallback "save your spot" prompt. */
  alternativeProviders?: ProviderCardData[];
  /** Display-ready category for the qa_email_capture arm headline. */
  providerCategory?: string | null;
}

// More menu icon component
function MoreIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

// Arrow icon for suggestion cards
function ArrowIcon() {
  return (
    <svg className="w-4 h-4 text-gray-300 group-hover/card:text-primary-600 transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
    </svg>
  );
}

// Send icon for chat bar
function SendIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

// Avatar gradient (deterministic by name)
const AVATAR_GRADIENTS = [
  "from-rose-100 to-pink-50",
  "from-sky-100 to-blue-50",
  "from-amber-100 to-yellow-50",
  "from-emerald-100 to-green-50",
  "from-violet-100 to-purple-50",
  "from-orange-100 to-amber-50",
  "from-teal-100 to-cyan-50",
  "from-fuchsia-100 to-pink-50",
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  if (!name || name === "Anonymous") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Format relative time
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export default function QASectionV2({
  providerId,
  providerName,
  providerImage,
  providerSlug,
  providerLocation = "",
  providerCareTypes = [],
  providerRating,
  providerPriceRange,
  providerCity,
  providerState,
  questions: initialQuestions = [],
  suggestedQuestions = [
    "What services do you provide?",
    "What are your rates or pricing?",
    "How quickly can you get started?",
    "Do you accept insurance or Medicaid?",
  ],
  hasBenefitsSection = false,
  variant,
  similarProvidersForMulti = [],
  alternativeProviders = [],
  providerCategory = null,
}: QASectionProps) {
  const { user, openAuth } = useAuth();
  const { toggleSave, isSaved } = useSavedProviders();
  const [inputValue, setInputValue] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [questions, setQuestions] = useState<QAEntry[]>(initialQuestions);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  // Track which suggestion card was tapped (for success state)
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  // Guest enrichment state (post-submit identity capture)
  const [showEnrichment, setShowEnrichment] = useState(false);
  const [enrichQuestionId, setEnrichQuestionId] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [guestError, setGuestError] = useState("");
  const [enriching, setEnriching] = useState(false);

  // Variant expansion state (accordion-style expansion for multi_provider)
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [inlineSubmitting, setInlineSubmitting] = useState(false);
  const [inlineSuccess, setInlineSuccess] = useState(false);
  const isMultiProviderVariant = variant === "multi_provider";
  const isMultiProviderV2Variant = variant === "multi_provider_v2";
  const isAnyMultiProviderVariant = isMultiProviderVariant || isMultiProviderV2Variant;
  const isQaCaptureArm = variant === "qa_email_capture";

  // qa_email_capture arm: fire impression once when the variant resolves so
  // the funnel comparison has a denominator. Skip in admin preview to keep
  // inspection out of the funnel.
  const variantImpressionFiredRef = useRef(false);
  useEffect(() => {
    if (!isQaCaptureArm || variantImpressionFiredRef.current) return;
    variantImpressionFiredRef.current = true;
    if (isPreviewMode()) return;
    const sid = getOrCreateSessionId();
    void fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_type: "family",
        event_type: "qa_email_capture_impression",
        related_provider_id: providerId,
        metadata: { session_id: sid, variant: "qa_email_capture" },
      }),
      keepalive: true,
    }).catch(() => {});
  }, [isQaCaptureArm, providerId]);

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<QAEntry | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  // Fetch public questions on mount
  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/questions?provider_id=${encodeURIComponent(providerId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.questions?.length > 0) {
          setQuestions(data.questions);
        }
      }
    } catch {
      // Silently fail — questions are non-critical
    }
  }, [providerId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Submit question — fires immediately for both auth and guest
  const submitQuestion = useCallback(async (questionText: string, suggestionIndex?: number) => {
    if (!questionText.trim()) return;

    // Admin preview mode: silent no-op. PreviewModeBanner already tells the
    // operator submissions are disabled — re-stating it via an error toast
    // would conflict with "Something went wrong" which implies system failure.
    if (isPreviewMode()) return;

    setSubmitting(true);
    setSubmitStatus("idle");
    if (suggestionIndex !== undefined) setTappedIndex(suggestionIndex);

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          question: questionText.trim(),
          honeypot: honeypot || undefined,
        }),
      });

      if (!res.ok) {
        setSubmitStatus("error");
        setTappedIndex(null);
        return;
      }

      const data = await res.json();
      if (data.question) {
        setQuestions((prev) => [data.question, ...prev]);

        // For guests: show enrichment prompt after successful submit.
        // SKIP when:
        //   - Page has a benefits module (spotlight handoff owns the moment)
        //   - Multi-provider variants (MultiProviderCard handles email capture)
        if (!user && data.question.id && !hasBenefitsSection && !isAnyMultiProviderVariant) {
          setEnrichQuestionId(data.question.id);
          setShowEnrichment(true);
        }
      }

      setInputValue("");
      setSubmitStatus("success");

      // ─── Benefits spotlight handoff ──────────────────────────────
      // The Q&A moment is peak intent — the caregiver just articulated
      // their exact worry. Pass the question text to the benefits module
      // so it can quietly bring itself into focus.
      // SKIP for multi_provider variants — they own the moment.
      if (typeof window !== "undefined" && !isAnyMultiProviderVariant) {
        window.dispatchEvent(
          new CustomEvent("olera:question-submitted", {
            detail: { question: questionText.trim() },
          }),
        );
      }

      // Auto-dismiss success for authenticated users
      if (user) {
        setTimeout(() => {
          setSubmitStatus("idle");
          setTappedIndex(null);
        }, 3000);
      }
    } catch {
      setSubmitStatus("error");
      setTappedIndex(null);
    } finally {
      setSubmitting(false);
    }
  }, [providerId, user, honeypot, hasBenefitsSection, isAnyMultiProviderVariant]);

  // Handle submit from chat bar
  const handleChatSubmit = () => {
    if (!inputValue.trim() || submitting) return;
    submitQuestion(inputValue);
  };

  // Enrich anonymous question with email (optional, post-submit)
  const handleEnrich = async () => {
    if (!enrichQuestionId) return;
    // Admin preview mode: silent no-op (matches submitQuestion behavior).
    if (isPreviewMode()) return;
    setGuestError("");

    // Honeypot
    if (honeypot) {
      setShowEnrichment(false);
      setTimeout(() => { setSubmitStatus("idle"); setTappedIndex(null); }, 2000);
      return;
    }

    if (!guestEmail.trim()) {
      setShowEnrichment(false);
      setTimeout(() => { setSubmitStatus("idle"); setTappedIndex(null); }, 2000);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guestEmail.trim())) {
      setGuestError("Please enter a valid email.");
      return;
    }

    setEnriching(true);
    try {
      await fetch("/api/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: enrichQuestionId,
          asker_email: guestEmail.trim().toLowerCase(),
          session_id: getOrCreateSessionId(),
        }),
      });
    } catch {
      // Non-blocking — question is already posted
    } finally {
      setEnriching(false);
      setShowEnrichment(false);
      setEnrichQuestionId(null);
      setGuestEmail("");
      setTimeout(() => { setSubmitStatus("idle"); setTappedIndex(null); }, 2000);
    }
  };

  const handleDismissEnrichment = () => {
    setShowEnrichment(false);
    setEnrichQuestionId(null);
    setGuestEmail("");
    setTimeout(() => { setSubmitStatus("idle"); setTappedIndex(null); }, 2000);
  };

  // ─── Multi-Provider Variant Handlers ────────────────────────────────────────

  const handleMultiProviderQuestionTap = useCallback(async (questionText: string, index: number) => {
    if (!isAnyMultiProviderVariant) return;

    // Accordion: collapse current if tapping the same question (V1 only)
    // V2 auto-expands after submit, so this check doesn't apply
    if (isMultiProviderVariant && expandedQuestion === questionText) {
      setExpandedQuestion(null);
      return;
    }

    // Submit the question to the current provider (existing behavior)
    submitQuestion(questionText, index);

    // Expand the multi-provider card
    // V1: expands immediately on tap
    // V2: expands immediately after tap (same effect, different UI state)
    setExpandedQuestion(questionText);
    setInlineSuccess(false);
  }, [isAnyMultiProviderVariant, isMultiProviderVariant, expandedQuestion, submitQuestion]);

  const handleMultiProviderSelect = useCallback(async (targetProviderId: string, targetProviderName: string) => {
    if (!expandedQuestion) return;

    // Submit question to the selected provider
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: targetProviderId,
        question: expandedQuestion.trim(),
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to send question");
    }
  }, [expandedQuestion]);

  const handleMultiProviderEmailSubmit = useCallback(async (
    email: string,
    sentProviderIds: string[],
    sentCount: number
  ) => {
    if (!expandedQuestion) return;

    setInlineSubmitting(true);

    // Determine which variant we're in for correct tracking
    const currentVariant = isMultiProviderV2Variant ? "multi_provider_v2" : "multi_provider";

    try {
      // Capture email via dedicated inline-answer endpoint (handles user creation + welcome email)
      const captureRes = await fetch("/api/inline-answer/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          providerId,
          providerName,
          questionText: expandedQuestion,
          sessionId: getOrCreateSessionId(),
          // Include all providers contacted for multi_provider variants
          sentProviderIds,
          sentCount,
          variant: currentVariant,
        }),
      });

      if (!captureRes.ok) {
        const data = await captureRes.json();
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      // Track conversion with full provider data
      fetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_type: "anonymous",
          event_type: "multi_provider_converted",
          related_provider_id: providerId,
          session_id: getOrCreateSessionId(),
          metadata: {
            question_text: expandedQuestion,
            email,
            variant: currentVariant,
            provider_name: providerName,
            sent_count: sentCount,
            sent_provider_ids: sentProviderIds,
          },
        }),
        keepalive: true,
      }).catch(() => {});

      setInlineSuccess(true);
    } catch (err) {
      throw err;
    } finally {
      setInlineSubmitting(false);
    }
  }, [expandedQuestion, providerId, providerName, isMultiProviderV2Variant]);

  const handleMultiProviderSaveAll = useCallback((providerIds: string[]) => {
    // Save all sent providers (only if not already saved)
    for (const pid of providerIds) {
      // Skip if already saved (avoid toggling OFF)
      if (isSaved(pid)) continue;

      // Find provider data for each ID
      const provider = pid === providerId
        ? {
            providerId,
            slug: providerSlug || providerId,
            name: providerName,
            location: providerLocation,
            careTypes: providerCareTypes,
            image: providerImage || null,
            rating: providerRating,
          }
        : similarProvidersForMulti.find((p) => p.id === pid);

      if (provider) {
        const saveData: SaveProviderData = pid === providerId
          ? (provider as SaveProviderData)
          : {
              providerId: (provider as SimilarProviderForMulti).id,
              slug: (provider as SimilarProviderForMulti).slug,
              name: (provider as SimilarProviderForMulti).name,
              location: [(provider as SimilarProviderForMulti).city, (provider as SimilarProviderForMulti).state].filter(Boolean).join(", "),
              careTypes: providerCareTypes, // Use current provider's care types as fallback
              image: (provider as SimilarProviderForMulti).image,
              rating: (provider as SimilarProviderForMulti).rating ?? undefined,
            };
        toggleSave(saveData);
      }
    }
    // Collapse the card after saving
    setExpandedQuestion(null);
  }, [providerId, providerSlug, providerName, providerLocation, providerCareTypes, providerImage, providerRating, similarProvidersForMulti, toggleSave, isSaved]);

  const handleMultiProviderCollapse = useCallback(() => {
    setExpandedQuestion(null);
    setInlineSuccess(false);
  }, []);

  const handleEditSubmit = async () => {
    if (!editingQuestion?.id || !editValue.trim() || editSubmitting) return;

    setEditSubmitting(true);
    try {
      const res = await fetch("/api/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingQuestion.id, question: editValue.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update question");
        return;
      }

      const data = await res.json();
      setQuestions((prev) =>
        prev.map((q) => (q.id === editingQuestion.id ? { ...q, ...data.question } : q))
      );
      setEditingQuestion(null);
      setEditValue("");
    } catch {
      alert("Failed to update question");
    } finally {
      setEditSubmitting(false);
    }
  };

  const visibleQuestions = questions.slice(0, 2);
  const hasMore = questions.length > 2;
  const [showAllModal, setShowAllModal] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showAllModal) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showAllModal]);

  const hasQuestions = questions.length > 0;
  const answeredCount = questions.filter((q) => q.status === "answered" || q.answer).length;

  // Determine if we're in post-submit state (success or enrichment)
  // For multi_provider variants, the card handles everything inline, so we
  // never show the old post-submit enrichment UI.
  const isPostSubmit = !isAnyMultiProviderVariant && (submitStatus === "success" || showEnrichment);

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <h2 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-tight leading-tight">
          {hasQuestions ? "Families are asking" : "Got questions?"}
        </h2>
        {hasQuestions && (
          <p className="text-[14px] text-gray-400 mt-1.5">
            {questions.length} question{questions.length !== 1 ? "s" : ""}
            {answeredCount > 0 && <> &middot; {answeredCount} answered</>}
          </p>
        )}
        {!hasQuestions && (
          <p className="text-[14px] text-gray-400 mt-1.5">
            Tap a question to ask {providerName} directly
          </p>
        )}
      </div>

      {/* ── Existing Q&A threads (social proof — shown ABOVE suggestions) ── */}
      {hasQuestions && (
        <div className="mb-6">
          {visibleQuestions.map((qa, index) => {
            const isAnswered = qa.status === "answered" || !!qa.answer;
            const isPending = !isAnswered;
            const isOwner = user?.id && qa.asker_user_id === user.id;
            const canEdit = isOwner && isPending;

            return (
              <div
                key={qa.id || index}
                className={`group/question py-4 ${index > 0 ? "border-t border-gray-100" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {/* Asker avatar */}
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradient(qa.asker_name || "Anonymous")} shrink-0 shadow-sm`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-gray-500">
                          {qa.asker_name || "Anonymous"}
                        </p>
                        {qa.created_at && (
                          <span className="text-[12px] text-gray-400">&middot; {timeAgo(qa.created_at)}</span>
                        )}
                      </div>
                      {canEdit && qa.id && (
                        <div className="relative" ref={openMenuId === qa.id ? menuRef : null}>
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === qa.id ? null : qa.id!)}
                            className="w-8 h-8 -mr-2 flex items-center justify-center rounded-full text-gray-400 lg:opacity-0 lg:group-hover/question:opacity-100 hover:text-gray-600 hover:bg-gray-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-all"
                            aria-label="More options"
                          >
                            <MoreIcon className="w-5 h-5" />
                          </button>
                          {openMenuId === qa.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-10 min-w-[120px]">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuestion(qa);
                                  setEditValue(qa.question);
                                  setOpenMenuId(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                              >
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                </svg>
                                Edit question
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-[15px] text-gray-800 leading-relaxed">
                      {qa.question}
                    </p>

                    {isAnswered && qa.answer ? (
                      <div className="mt-4">
                        <div className="flex items-start gap-3">
                          {providerImage ? (
                            <img
                              src={providerImage}
                              alt={providerName}
                              className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-white"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shrink-0 ring-2 ring-white">
                              <span className="text-xs font-bold text-primary-700">
                                {providerName.charAt(0)}
                              </span>
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{providerName}</span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-primary-700 bg-primary-50 uppercase tracking-wide">
                                Provider
                              </span>
                            </div>

                            <div className="mt-2 bg-gray-50 rounded-xl px-4 py-3 border-l-2 border-primary-300">
                              <p className="text-sm text-gray-600 leading-relaxed">
                                {qa.answer}
                              </p>
                            </div>

                            {qa.answered_at && (
                              <p className="text-xs text-gray-400 mt-2">
                                Answered {timeAgo(qa.answered_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : isPending && isOwner ? (
                      <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>Awaiting response</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAllModal(true)}
              className="text-sm font-semibold text-primary-600 hover:text-primary-700 focus:outline-none focus:underline transition-colors mt-1"
            >
              See all {questions.length} questions
            </button>
          )}
        </div>
      )}

      {/* ── Suggestion Cards OR Post-Submit State ── */}
      {isPostSubmit ? (
        /* ── Post-submit: success + enrichment ── */
        <div className="animate-in fade-in duration-200">
          {/* Success confirmation */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-gray-900">Question sent</p>
              <p className="text-[13px] text-gray-400">We&apos;ll notify {providerName}</p>
            </div>
          </div>

          {/* Guest enrichment — qa_email_capture arm renders the redesigned
              compact prompt with 3 inline provider cards as preview-before-email.
              Other arms keep the legacy gray-box prompt unchanged. */}
          {showEnrichment && isQaCaptureArm && (
            <>
              {alternativeProviders.length > 0 ? (
                <div className="mt-4 pt-6 border-t border-zinc-100">
                  {/* Headline — "Top N [Category] in [City]" implies curation
                      (we ranked them), specificity (this kind of care) and
                      relevance (where the user is). */}
                  <h3 className="text-[20px] md:text-2xl font-semibold text-zinc-900 tracking-tight leading-tight">
                    Top {alternativeProviders.length}
                    {providerCategory ? ` ${getCategoryDisplayName(providerCategory)}` : ""}
                    {providerCity ? ` in ${providerCity}` : " nearby"}.
                  </h3>
                  <p className="mt-1.5 text-[13px] text-zinc-500">
                    Plus, we&apos;ll email when {providerName} replies.
                  </p>

                  <ul className="mt-3 space-y-1.5">
                    {alternativeProviders.slice(0, 3).map((alt) => {
                      const metaParts: string[] = [];
                      if (alt.rating > 0) {
                        metaParts.push(
                          alt.reviewCount && alt.reviewCount > 0
                            ? `${alt.rating.toFixed(1)} (${alt.reviewCount})`
                            : alt.rating.toFixed(1),
                        );
                      }
                      if (alt.address) metaParts.push(alt.address);
                      return (
                        <li key={alt.id}>
                          <a
                            href={`/provider/${alt.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 hover:border-zinc-300 transition"
                          >
                            <div className="text-[14px] font-medium text-zinc-900 leading-snug truncate">
                              {alt.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-zinc-500 truncate">
                              {alt.rating > 0 && (
                                <Star size={11} weight="fill" className="text-amber-500 shrink-0" />
                              )}
                              <span className="truncate">{metaParts.join(" · ")}</span>
                            </div>
                          </a>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !enriching) { e.preventDefault(); handleEnrich(); } }}
                      placeholder="your@email.com"
                      autoComplete="email"
                      inputMode="email"
                      autoFocus
                      className={`flex-1 min-w-0 px-4 py-3 border rounded-lg text-[15px] text-zinc-900 placeholder-zinc-400 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition ${
                        guestError ? "border-red-300" : "border-zinc-300"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleEnrich}
                      disabled={enriching || !guestEmail.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 px-5 py-3 text-[15px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {enriching && (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      Email me these
                    </button>
                  </div>

                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                  />

                  {guestError ? (
                    <p className="mt-2 text-[12px] text-red-500" role="alert">{guestError}</p>
                  ) : (
                    <p className="mt-2 text-[12px] text-zinc-500">Free. No spam.</p>
                  )}

                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={handleDismissEnrichment}
                      className="text-[12px] text-zinc-400 hover:text-zinc-600 transition"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : (
                /* Empty-alternatives fallback — small cities / rare categories
                   with 0 candidates. Drop the cards framing; lean on the
                   reply-notification value alone. */
                <div className="mt-4 pt-6 border-t border-zinc-100">
                  <h3 className="text-[20px] md:text-2xl font-semibold text-zinc-900 tracking-tight leading-tight">
                    Save your spot.
                  </h3>
                  <p className="mt-1.5 text-[14px] text-zinc-600">
                    We&apos;ll email when {providerName} replies.
                  </p>

                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !enriching) { e.preventDefault(); handleEnrich(); } }}
                      placeholder="your@email.com"
                      autoComplete="email"
                      inputMode="email"
                      autoFocus
                      className={`flex-1 min-w-0 px-4 py-3 border rounded-lg text-[15px] text-zinc-900 placeholder-zinc-400 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition ${
                        guestError ? "border-red-300" : "border-zinc-300"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleEnrich}
                      disabled={enriching || !guestEmail.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 px-5 py-3 text-[15px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {enriching && (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      Send
                    </button>
                  </div>

                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                  />

                  {guestError ? (
                    <p className="mt-2 text-[12px] text-red-500" role="alert">{guestError}</p>
                  ) : (
                    <p className="mt-2 text-[12px] text-zinc-500">Free. No spam.</p>
                  )}

                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={handleDismissEnrichment}
                      className="text-[12px] text-zinc-400 hover:text-zinc-600 transition"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Legacy enrichment prompt — non-qa_email_capture arms that hit
              !hasBenefitsSection (rare: pages without benefits data). Kept
              for backwards compat. */}
          {showEnrichment && !isQaCaptureArm && (
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <p className="text-[14px] font-medium text-gray-800 mb-1">
                Get notified when they reply
              </p>
              <p className="text-[12px] text-gray-400 mb-3">
                We&apos;ll email you — nothing else.
              </p>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !enriching) { e.preventDefault(); handleEnrich(); } }}
                  placeholder="Your email"
                  autoComplete="email"
                  autoFocus
                  className={`flex-1 min-w-0 px-3.5 py-2.5 border rounded-xl text-[14px] text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/15 focus:border-primary-600 transition-all ${
                    guestError ? "border-red-300" : "border-gray-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={handleEnrich}
                  disabled={enriching || !guestEmail.trim()}
                  className="px-4 py-2.5 text-[14px] font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  {enriching && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Notify me
                </button>
              </div>

              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                style={{ display: "none" }}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              {guestError && (
                <p className="text-xs text-red-500 mt-1.5" role="alert">{guestError}</p>
              )}

              <button
                type="button"
                onClick={handleDismissEnrichment}
                className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors mt-2.5"
              >
                Skip
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Suggestion cards — the hero ── */
        <>
          {suggestedQuestions.length > 0 && (
            <div className="space-y-2 mb-4">
              {suggestedQuestions.map((q, i) => {
                const isTapped = tappedIndex === i;
                const isMultiV1Expanded = isMultiProviderVariant && expandedQuestion === q;
                const isMultiV2Expanded = isMultiProviderV2Variant && expandedQuestion === q;
                const isExpanded = isMultiV1Expanded || isMultiV2Expanded;
                const isOtherExpanded = isAnyMultiProviderVariant && expandedQuestion && expandedQuestion !== q;

                return (
                  <div key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        if (submitting) return;
                        if (isAnyMultiProviderVariant) {
                          handleMultiProviderQuestionTap(q, i);
                        } else {
                          submitQuestion(q, i);
                        }
                      }}
                      disabled={submitting}
                      className={`group/card w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 cursor-pointer disabled:cursor-default ${
                        isTapped || isExpanded
                          ? "bg-primary-50 border-primary-200"
                          : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-[0.99]"
                      } ${isOtherExpanded ? "opacity-50" : ""} ${isExpanded ? "hidden" : ""}`}
                    >
                      <span className={`text-[15px] leading-snug flex-1 ${
                        isTapped || isExpanded ? "text-primary-700 font-medium" : "text-gray-700 font-medium"
                      }`}>
                        {q}
                      </span>
                      {isTapped && submitting ? (
                        <span className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin shrink-0" />
                      ) : (
                        <ArrowIcon />
                      )}
                    </button>

                    {/* Multi-Provider Card V1 (multi_provider variant only) */}
                    {isMultiV1Expanded && (
                      <MultiProviderCard
                        question={q}
                        currentProvider={{
                          id: providerId,
                          slug: providerSlug || providerId,
                          name: providerName,
                          image: providerImage,
                          priceRange: providerPriceRange,
                          rating: providerRating,
                          city: providerCity,
                          state: providerState,
                        }}
                        similarProviders={similarProvidersForMulti}
                        onProviderSelect={handleMultiProviderSelect}
                        onEmailSubmit={handleMultiProviderEmailSubmit}
                        onSaveAll={handleMultiProviderSaveAll}
                        onCollapse={handleMultiProviderCollapse}
                        isSubmitting={inlineSubmitting}
                        isSuccess={inlineSuccess}
                        questionSent={submitStatus === "success"}
                        userEmail={user?.email}
                      />
                    )}

                    {/* Multi-Provider Card V2 (multi_provider_v2 variant only) */}
                    {isMultiV2Expanded && (
                      <MultiProviderCardV2
                        question={q}
                        currentProvider={{
                          id: providerId,
                          slug: providerSlug || providerId,
                          name: providerName,
                          image: providerImage,
                          priceRange: providerPriceRange,
                          rating: providerRating,
                          city: providerCity,
                          state: providerState,
                        }}
                        similarProviders={similarProvidersForMulti}
                        onProviderSelect={handleMultiProviderSelect}
                        onEmailSubmit={handleMultiProviderEmailSubmit}
                        onSaveAll={handleMultiProviderSaveAll}
                        onCollapse={handleMultiProviderCollapse}
                        isSubmitting={inlineSubmitting}
                        isSuccess={inlineSuccess}
                        questionSent={submitStatus === "success"}
                        userEmail={user?.email}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Chat bar input — secondary ── */}
          <div className={`relative flex items-center gap-2 border rounded-xl transition-all duration-150 ${
            inputFocused
              ? "border-gray-300 shadow-[0_2px_8px_rgba(0,0,0,0.06)] bg-white"
              : "border-gray-200 bg-gray-50"
          }`}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) {
                  e.preventDefault();
                  handleChatSubmit();
                }
              }}
              placeholder="Ask something else..."
              maxLength={1000}
              className="flex-1 min-w-0 px-4 py-3 text-[14px] text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleChatSubmit}
              disabled={!inputValue.trim() || submitting}
              className={`mr-2 p-1.5 rounded-lg transition-all ${
                inputValue.trim()
                  ? "text-primary-600 hover:bg-primary-50 active:scale-95"
                  : "text-gray-300 cursor-default"
              }`}
              aria-label="Send question"
            >
              {submitting && !tappedIndex ? (
                <span className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin block" />
              ) : (
                <SendIcon className={`w-5 h-5 ${inputValue.trim() ? "text-primary-600" : "text-gray-300"}`} />
              )}
            </button>
          </div>

          {/* Error feedback */}
          {submitStatus === "error" && (
            <p className="text-[13px] text-red-500 mt-2">Something went wrong. Try again.</p>
          )}
        </>
      )}

      {/* ── Edit Question Modal ── */}
      {editingQuestion && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={() => setEditingQuestion(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-question-title"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl max-w-lg mx-auto p-6"
          >
            <h3 id="edit-question-title" className="text-lg font-bold text-gray-900 mb-4">
              Edit your question
            </h3>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300 focus:bg-white transition-all"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setEditingQuestion(null);
                  setEditValue("");
                }}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={!editValue.trim() || editValue.trim() === editingQuestion.question || editSubmitting}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gray-900 rounded-xl shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSubmitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── All Questions Modal (Desktop) / Bottom Sheet (Mobile) ── */}
      {showAllModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity"
            onClick={() => setShowAllModal(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="all-questions-title"
            className="fixed z-50 bg-white shadow-2xl flex flex-col
              inset-x-0 bottom-0 h-[85vh] rounded-t-3xl
              lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:h-[640px] lg:w-[600px] lg:rounded-2xl lg:border lg:border-gray-200/60"
          >
            {/* Drag handle (mobile only) */}
            <div className="lg:hidden pt-3 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 lg:px-6 py-4 lg:py-5 border-b border-gray-200/80 bg-gray-50/50 shrink-0 rounded-t-3xl lg:rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 id="all-questions-title" className="text-lg lg:text-xl font-bold text-gray-900 tracking-tight">
                    Questions & Answers
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {questions.length} question{questions.length !== 1 ? "s" : ""} &middot; {answeredCount} answered
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllModal(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="px-5 lg:px-6 py-5 lg:py-6">
                {questions.map((qa, index) => {
                  const isAnswered = qa.status === "answered" || !!qa.answer;
                  const isPending = !isAnswered;
                  const isOwner = user?.id && qa.asker_user_id === user.id;
                  const askerName = qa.asker_name || "Anonymous";

                  return (
                    <div
                      key={qa.id || index}
                      className={`${index > 0 ? "mt-6 pt-6 border-t border-gray-100" : ""}`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(askerName)} flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm`}>
                          <span className="text-sm font-bold text-gray-600">
                            {getInitials(askerName)}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="text-[15px] font-semibold text-gray-900">
                              {askerName}
                            </p>
                            {qa.created_at && (
                              <span className="text-[13px] text-gray-400">&middot; {timeAgo(qa.created_at)}</span>
                            )}
                          </div>

                          <p className="text-[15px] text-gray-700 leading-relaxed">
                            {qa.question}
                          </p>

                          {isPending && isOwner && (
                            <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-400">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              <span>Awaiting response</span>
                            </div>
                          )}

                          {isAnswered && qa.answer && (
                            <div className="mt-4 ml-0.5 pl-4 border-l-2 border-primary-200">
                              <div className="flex items-start gap-3">
                                {providerImage ? (
                                  <img
                                    src={providerImage}
                                    alt={providerName}
                                    className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm">
                                    <span className="text-xs font-bold text-primary-700">
                                      {providerName.charAt(0)}
                                    </span>
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-gray-900">{providerName}</span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-primary-700 bg-primary-50 uppercase tracking-wide">
                                      Provider
                                    </span>
                                  </div>

                                  <p className="text-[15px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                                    {qa.answer}
                                  </p>

                                  {qa.answered_at && (
                                    <p className="text-xs text-gray-400 mt-2">
                                      {timeAgo(qa.answered_at)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile footer */}
            <div className="lg:hidden shrink-0 border-t border-gray-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setShowAllModal(false)}
                className="w-full py-3.5 rounded-xl bg-gray-900 text-[15px] font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-colors active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

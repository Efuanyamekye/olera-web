"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Star } from "@phosphor-icons/react";
import Link from "next/link";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import type { SimilarProviderForMulti } from "@/lib/provider-utils";

interface CurrentProviderData {
  id: string;
  slug: string;
  name: string;
  image?: string;
  priceRange?: string;
  rating?: number;
  city?: string;
  state?: string;
}

interface MultiProviderCardV2Props {
  question: string;
  currentProvider: CurrentProviderData;
  similarProviders: SimilarProviderForMulti[];
  onProviderSelect: (providerId: string, providerName: string) => Promise<void>;
  onEmailSubmit: (email: string, sentProviderIds: string[], sentCount: number) => Promise<void>;
  onSaveAll: (providerIds: string[]) => void;
  onCollapse: () => void;
  isSubmitting?: boolean;
  isSuccess?: boolean;
  /** True when the initial question to current provider was sent */
  questionSent?: boolean;
  /** If provided, user is logged in — skip email capture and show confirmation */
  userEmail?: string;
}

/**
 * State machine for V2 variant:
 *   "initial"  → Email-first state: shows email capture immediately after question
 *   "expanded" → Card stack shown after clicking "See who else can help"
 *   "success"  → Confirmation after email submitted
 */
type CardState = "initial" | "expanded" | "success";

export default function MultiProviderCardV2({
  question,
  currentProvider,
  similarProviders,
  onProviderSelect,
  onEmailSubmit,
  onSaveAll,
  onCollapse,
  isSuccess: externalSuccess = false,
  userEmail,
}: MultiProviderCardV2Props) {
  const isLoggedIn = Boolean(userEmail);

  // V2 always starts at "initial" (email-first) state
  const [cardState, setCardState] = useState<CardState>("initial");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [askedProviders, setAskedProviders] = useState<SimilarProviderForMulti[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<"left" | "right" | null>(null);
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewedTrackedRef = useRef(false);

  // Derived state
  const currentCard = similarProviders[currentIndex];
  const isLastCard = currentIndex >= similarProviders.length - 1;
  const totalAsked = 1 + askedProviders.length; // 1 = original provider

  // Handle image load errors
  const handleImageError = (providerId: string) => {
    setFailedImages((prev) => new Set([...prev, providerId]));
  };

  // Track analytics helper
  const trackActivity = (eventType: string, metadata: Record<string, unknown>) => {
    fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_type: "anonymous",
        event_type: eventType,
        related_provider_id: currentProvider.id,
        session_id: getOrCreateSessionId(),
        metadata: { ...metadata, variant: "multi_provider_v2" },
      }),
      keepalive: true,
    }).catch(() => {});
  };

  // Mount animation
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to ensure card content is visible on mount
  useEffect(() => {
    if (mounted && cardRef.current) {
      const scrollTimer = setTimeout(() => {
        const card = cardRef.current;
        if (!card) return;

        const cardRect = card.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const desiredTopOffset = 80;
        const cardTop = cardRect.top;
        const cardBottom = cardRect.bottom;
        const stickyBottomCTA = 80;

        if (cardTop < desiredTopOffset || cardBottom > viewportHeight - stickyBottomCTA) {
          const scrollY = window.scrollY + cardTop - desiredTopOffset;
          window.scrollTo({ top: scrollY, behavior: "smooth" });
        }
      }, 150);
      return () => clearTimeout(scrollTimer);
    }
  }, [mounted]);

  // Track impression on mount (fire-once, intentionally empty deps)
  useEffect(() => {
    if (viewedTrackedRef.current) return;
    viewedTrackedRef.current = true;
    trackActivity("multi_provider_viewed", {
      question_text: question,
      similar_count: similarProviders.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus input on initial state (desktop only)
  useEffect(() => {
    if (cardState === "initial" && inputRef.current && !isLoggedIn) {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (isDesktop) {
        const focusTimer = setTimeout(() => inputRef.current?.focus(), 300);
        return () => clearTimeout(focusTimer);
      }
    }
  }, [cardState, isLoggedIn]);

  // Handle external success (from parent component)
  useEffect(() => {
    if (externalSuccess && cardState !== "success") {
      setCardState("success");
    }
  }, [externalSuccess, cardState]);

  // Auto-collapse after success state OR for logged-in users
  useEffect(() => {
    const shouldCollapse =
      cardState === "success" || (cardState === "initial" && isLoggedIn);

    if (shouldCollapse) {
      const timer = setTimeout(() => onCollapse(), 15000);
      return () => clearTimeout(timer);
    }
  }, [cardState, isLoggedIn, onCollapse]);

  // Track flow completion for logged-in users (fire-once when conditions met)
  const loggedInFlowTrackedRef = useRef(false);
  useEffect(() => {
    if (cardState === "initial" && isLoggedIn && !loggedInFlowTrackedRef.current) {
      loggedInFlowTrackedRef.current = true;
      const allSentProviderIds = [currentProvider.id, ...askedProviders.map((p) => p.id)];
      trackActivity("multi_provider_flow_completed", {
        sent_count: allSentProviderIds.length,
        provider_ids: allSentProviderIds,
        logged_in: true,
      });
    }
    // trackActivity is stable (defined inline with no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState, isLoggedIn, currentProvider.id, askedProviders]);

  const handleExpandToCardStack = () => {
    trackActivity("multi_provider_card_shown", {
      question_text: question,
      similar_count: similarProviders.length,
    });
    setCardState("expanded");
  };

  const handleSkip = () => {
    if (isAnimating || !currentCard) return;
    setIsAnimating(true);
    setAnimationDirection("left");

    trackActivity("multi_provider_skipped", {
      provider_id: currentCard.id,
      position: currentIndex,
    });

    setTimeout(() => {
      if (isLastCard || currentIndex >= similarProviders.length - 1) {
        // Stay in expanded state - the email form is visible and shows all
        // providers the user has interacted with. Moving past the last card
        // just clears the card stack UI.
        setCurrentIndex(similarProviders.length); // No more cards to show
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
      setAnimationDirection(null);
      setIsAnimating(false);
    }, 300);
  };

  const handleAsk = async () => {
    if (isAnimating || isSendingQuestion || !currentCard) return;
    setSendError(null);
    setIsSendingQuestion(true);

    try {
      await onProviderSelect(currentCard.id, currentCard.name);
      setAskedProviders((prev) => [...prev, currentCard]);

      trackActivity("multi_provider_asked", {
        provider_id: currentCard.id,
        position: currentIndex,
        sent_count: askedProviders.length + 2,
      });

      setIsAnimating(true);
      setAnimationDirection("right");

      setTimeout(() => {
        if (isLastCard || currentIndex >= similarProviders.length - 1) {
          // Stay in expanded state - the email form is visible and shows all
          // providers the user has interacted with.
          setCurrentIndex(similarProviders.length); // No more cards to show
        } else {
          setCurrentIndex((prev) => prev + 1);
        }
        setAnimationDirection(null);
        setIsAnimating(false);
        setIsSendingQuestion(false);
      }, 300);
    } catch {
      setSendError("Failed to send. Tap to retry or skip.");
      setIsSendingQuestion(false);
    }
  };

  const handleEmailSubmit = async () => {
    if (!email.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setEmailError(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      setIsSubmitting(false);
      return;
    }

    const allSentProviderIds = [currentProvider.id, ...askedProviders.map((p) => p.id)];

    try {
      await onEmailSubmit(email.trim().toLowerCase(), allSentProviderIds, allSentProviderIds.length);
      setCardState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setEmailError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSubmitting) {
      e.preventDefault();
      handleEmailSubmit();
    }
  };

  const handleSaveAll = () => {
    const allSentIds = [currentProvider.id, ...askedProviders.map((p) => p.id)];
    onSaveAll(allSentIds);
    trackActivity("multi_provider_save_all", {
      saved_count: allSentIds.length,
      provider_ids: allSentIds,
    });
  };

  // Provider avatar component
  const ProviderAvatar = ({
    provider,
    size = "md",
    className = "",
    style,
  }: {
    provider: { id: string; name: string; image?: string | null };
    size?: "sm" | "md" | "lg";
    className?: string;
    style?: React.CSSProperties;
  }) => {
    const sizeClasses = {
      sm: "w-8 h-8 text-xs",
      md: "w-10 h-10 text-sm",
      lg: "w-12 h-12 text-base",
    };

    if (provider.image && !failedImages.has(provider.id)) {
      return (
        <img
          src={provider.image}
          alt={provider.name}
          onError={() => handleImageError(provider.id)}
          className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-white shadow-sm ${className}`}
          style={style}
        />
      );
    }
    return (
      <div
        className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center ring-2 ring-white shadow-sm ${className}`}
        style={style}
      >
        <span className="font-semibold text-primary-700">{provider.name.charAt(0)}</span>
      </div>
    );
  };

  // Browse URL for success state
  const city = currentProvider.city || "";
  const browseUrl = city ? `/browse?location=${encodeURIComponent(city)}` : `/browse`;

  // All providers who were sent questions
  const allSentProviders = [
    {
      id: currentProvider.id,
      name: currentProvider.name,
      image: currentProvider.image || null,
    },
    ...askedProviders.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
    })),
  ];

  return (
    <div
      ref={cardRef}
      className={`
        bg-transparent
        overflow-hidden
        transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
        ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
      `}
    >
      {/* ═══════════════════════════════════════════════════════════════
          STATE 1: INITIAL — Email-first (V2 variant default state)
          ═══════════════════════════════════════════════════════════════ */}
      {cardState === "initial" && (
        <div className="p-4 lg:p-6">
          {isLoggedIn ? (
            /* Logged-in user: show confirmation */
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-100 mb-4">
                <Check size={28} weight="bold" className="text-success-600" />
              </div>
              <h3 className="font-display text-xl font-bold text-gray-900 mb-2">
                {totalAsked === 1 ? "Question sent!" : `${totalAsked} questions sent!`}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                We&apos;ll email <span className="font-medium">{userEmail}</span> as they respond.
              </p>
              <button
                type="button"
                onClick={handleSaveAll}
                className="
                  inline-flex items-center gap-2 px-4 py-2.5
                  text-sm font-medium text-gray-700
                  bg-white rounded-xl border border-gray-200
                  hover:bg-gray-50 hover:border-gray-300
                  transition-all duration-200
                "
              >
                Save all {totalAsked} providers
              </button>
            </div>
          ) : (
            /* Guest user: email-first capture form - 3 stacks with consistent spacing */
            <>
              {/* ─── STACK 1: Question + Provider ─── */}
              <div className="mb-6">
                {/* Question they asked - shown in quotes above provider */}
                <p className="text-sm text-gray-500 text-center mb-3 px-2 line-clamp-2">
                  &ldquo;{question}&rdquo;
                </p>
                {/* Provider row with "Sent" confirmation */}
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-50">
                  <ProviderAvatar provider={currentProvider} size="sm" className="shrink-0" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                    {currentProvider.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-success-600 shrink-0 ml-3">
                    <Check size={14} weight="bold" />
                    <span className="font-medium">Sent</span>
                  </span>
                </div>
              </div>

              {/* ─── STACK 2: Email capture ─── */}
              <div className="mb-6">
                {/* Headline - ties back to getting their answer */}
                <h3 className="font-display text-xl md:text-2xl font-normal text-gray-900 text-center mb-3">
                  Where should your answer go?
                </h3>

                {/* Email form - inset button pattern */}
                <div
                  className={`
                    flex items-center gap-2 p-1.5
                    bg-white border rounded-full
                    transition-all duration-200
                    focus-within:ring-2 focus-within:ring-gray-200 focus-within:border-gray-900
                    ${emailError ? "border-red-300 ring-2 ring-red-50" : "border-gray-300"}
                  `}
                >
                  <input
                    ref={inputRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="yourname@email.com"
                    autoComplete="email"
                    disabled={isSubmitting}
                    className="
                      flex-1 min-w-0 px-4 py-2
                      text-sm text-gray-900 placeholder-gray-500
                      bg-transparent border-none outline-none
                      disabled:opacity-50
                    "
                  />
                  <button
                    type="button"
                    onClick={handleEmailSubmit}
                    disabled={isSubmitting || !email.trim()}
                    className="
                      shrink-0 px-5 py-2.5
                      text-sm font-semibold text-white
                      bg-gray-900 rounded-full
                      hover:bg-gray-800
                      transition-all duration-200
                      disabled:opacity-40 disabled:cursor-not-allowed
                    "
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      </span>
                    ) : (
                      "To my email"
                    )}
                  </button>
                </div>

                {/* Error message */}
                {emailError && (
                  <p className="mt-2 text-sm text-red-600 font-medium">{emailError}</p>
                )}
              </div>

              {/* ─── STACK 3: Expand option ─── */}
              {similarProviders.length > 0 && (
                <div>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <div className="h-px w-12 bg-gray-200" />
                    <span className="text-xs text-gray-400 uppercase tracking-wide">or</span>
                    <div className="h-px w-12 bg-gray-200" />
                  </div>
                  <button
                    type="button"
                    onClick={handleExpandToCardStack}
                    className="
                      w-full flex items-center justify-between
                      px-4 py-3
                      bg-gray-50 hover:bg-gray-100
                      border border-gray-200 hover:border-gray-300
                      rounded-xl
                      transition-all duration-200
                      group
                    "
                  >
                    <div className="flex items-center gap-3">
                      {/* Stacked provider avatars */}
                      <div className="flex -space-x-2">
                        {similarProviders.slice(0, 3).map((provider, idx) => (
                          <ProviderAvatar
                            key={provider.id}
                            provider={provider}
                            size="sm"
                            className="ring-2 ring-gray-50"
                            style={{ zIndex: 3 - idx }}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {similarProviders.length} other{similarProviders.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-medium text-primary-600 group-hover:text-primary-700">
                      <span>Ask them</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STATE 2: EXPANDED — Card stack (after clicking "See who else")
          ═══════════════════════════════════════════════════════════════ */}
      {cardState === "expanded" && similarProviders.length > 0 && (
        <div className="p-4 lg:p-6">
          {/* Provider list with "Sent" confirmation (shows providers already asked) */}
          <div className="space-y-2 mb-4 mx-2 lg:mx-20">
            {allSentProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-50 min-w-0"
              >
                <ProviderAvatar provider={provider} size="sm" className="shrink-0" />
                <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                  {provider.name}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-success-600 shrink-0 ml-3">
                  <Check size={14} weight="bold" />
                  <span className="font-medium">Sent</span>
                </span>
              </div>
            ))}
          </div>

          {/* Headline - singular until multiple providers asked */}
          <h3 className="font-display text-xl md:text-2xl font-normal text-gray-900 text-center mb-2">
            {allSentProviders.length === 1
              ? "Where should your answer go?"
              : "Where should your answers go?"}
          </h3>

          {/* Email form persists in expanded state */}
          <div
            className={`
              flex items-center gap-2 p-1.5
              bg-white border rounded-full
              transition-all duration-200
              focus-within:ring-2 focus-within:ring-gray-200 focus-within:border-gray-900
              mb-8 mx-2 lg:mx-20
              ${emailError ? "border-red-300 ring-2 ring-red-50" : "border-gray-300"}
            `}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="yourname@email.com"
              autoComplete="email"
              disabled={isSubmitting}
              className="
                flex-1 min-w-0 px-4 py-2
                text-sm text-gray-900 placeholder-gray-500
                bg-transparent border-none outline-none
                disabled:opacity-50
              "
            />
            <button
              type="button"
              onClick={handleEmailSubmit}
              disabled={isSubmitting || !email.trim()}
              className="
                shrink-0 px-5 py-2.5
                text-sm font-semibold text-white
                bg-gray-900 rounded-full
                hover:bg-gray-800
                transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </span>
              ) : (
                "To my email"
              )}
            </button>
          </div>

          {/* Error message */}
          {emailError && (
            <p className="mb-4 text-sm text-red-600 font-medium">{emailError}</p>
          )}

          {/* Card Stack */}
          <div className="relative mb-4 mx-2 lg:mx-20">
            {/* Peek card 2 (furthest back) - rotated left */}
            {currentIndex < similarProviders.length - 2 && (
              <div
                className="absolute inset-x-0 top-0 h-24 rounded-2xl bg-white border border-gray-300"
                style={{
                  transform: "translateY(-12px) scale(0.92) rotate(-3deg)",
                  opacity: 0.5,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
                }}
              />
            )}
            {/* Peek card 1 (middle) - rotated right */}
            {currentIndex < similarProviders.length - 1 && (
              <div
                className="absolute inset-x-0 top-0 h-24 rounded-2xl bg-white border border-gray-300"
                style={{
                  transform: "translateY(-6px) scale(0.96) rotate(2deg)",
                  opacity: 0.8,
                  boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                }}
              />
            )}

            {/* Active Card */}
            {currentCard && (
              <div
                className={`
                  relative bg-white rounded-2xl border border-gray-300 p-5
                  transition-transform duration-300
                  ${animationDirection === "left" ? "animate-swipe-left" : ""}
                  ${animationDirection === "right" ? "animate-swipe-right" : ""}
                  ${!animationDirection && currentIndex > 0 ? "animate-card-rise" : ""}
                `}
                style={{
                  boxShadow: "0 12px 32px -4px rgba(0,0,0,0.15), 0 4px 12px -2px rgba(0,0,0,0.08)",
                }}
              >
                {/* Provider header */}
                <div className="flex items-start gap-3 mb-4">
                  <ProviderAvatar provider={currentCard} size="lg" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[17px] font-semibold text-gray-900 truncate">
                      {currentCard.name}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {currentCard.city}
                      {currentCard.state ? `, ${currentCard.state}` : ""}
                    </p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-3 mb-5">
                  {currentCard.rating && (
                    <div className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
                        Rating
                      </div>
                      <div className="flex items-center gap-1">
                        <Star size={14} weight="fill" className="text-amber-400" />
                        <span className="text-sm font-semibold text-gray-900">
                          {currentCard.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )}
                  {currentCard.priceRange && (
                    <div className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
                        {currentCard.priceRange.includes("/hr") ? "Hourly Rate" : "Monthly Rate"}
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {currentCard.priceRange.replace(/\/(hr|mo)$/, '')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSendError(null);
                      handleSkip();
                    }}
                    disabled={isAnimating || isSendingQuestion}
                    className="
                      flex-shrink-0 px-5 py-3
                      text-[15px] font-medium text-gray-700
                      bg-white border-2 border-gray-300 rounded-full
                      hover:border-gray-400 hover:bg-gray-50
                      transition-all duration-200
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={handleAsk}
                    disabled={isAnimating || isSendingQuestion}
                    className="
                      flex-1 px-5 py-3
                      text-[15px] font-semibold text-white
                      bg-gray-900 rounded-full
                      hover:bg-gray-800
                      transition-all duration-200
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {isSendingQuestion ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      "Ask them too"
                    )}
                  </button>
                </div>

                {/* Error message */}
                {sendError && (
                  <p className="mt-3 text-sm text-red-600 text-center font-medium">
                    {sendError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STATE 3: SUCCESS — Confirmation after email submitted
          ═══════════════════════════════════════════════════════════════ */}
      {cardState === "success" && (
        <div className="p-6 text-center">
          {/* Success checkmark */}
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-600 mb-4 animate-success-pop">
            <Check size={28} weight="bold" className="text-white" />
          </div>

          {/* Headline */}
          <h3 className="font-display text-2xl font-bold text-gray-900 mb-2">
            We&apos;ve got it from here.
          </h3>

          {/* Confirmation text */}
          <p className="text-base text-gray-600 mb-4 leading-relaxed">
            We&apos;ll send replies to{" "}
            <span className="font-semibold text-gray-900">{userEmail || email}</span> as they come
            in — usually within a day.
          </p>

          {/* Overlapping avatars */}
          <div className="flex justify-center -space-x-3 mb-5">
            {allSentProviders.slice(0, 4).map((provider, idx) => (
              <ProviderAvatar
                key={provider.id}
                provider={provider}
                size="md"
                className="ring-4 ring-white"
                style={{ zIndex: allSentProviders.length - idx } as React.CSSProperties}
              />
            ))}
            {allSentProviders.length > 4 && (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center ring-4 ring-white text-xs font-semibold text-gray-500">
                +{allSentProviders.length - 4}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onCollapse}
              className="
                px-5 py-2.5
                text-sm font-medium text-gray-500
                hover:text-gray-700
                transition-all duration-200
              "
            >
              Not now
            </button>
            <Link href={browseUrl}>
              <button
                type="button"
                className="
                  inline-flex items-center justify-center px-6 py-2.5
                  text-sm font-medium text-gray-700
                  bg-white border border-gray-200 rounded-full
                  hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700
                  transition-all duration-200
                "
              >
                Find More Options
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

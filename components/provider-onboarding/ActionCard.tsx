"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Provider } from "@/lib/types/provider";
import { getPrimaryImage } from "@/lib/types/provider";
import Link from "next/link";
import AnalyticsTeaserCard from "@/components/provider-onboarding/AnalyticsTeaserCard";

// ============================================================
// Types
// ============================================================

export type NotificationType = "lead" | "message" | "question" | "review" | "interview" | "claim" | "signup";

interface FromProfile {
  display_name: string;
  city?: string | null;
  state?: string | null;
  image_url?: string | null;
}

export interface NotificationData {
  type: NotificationType;
  id: string;
  created_at: string;
  // Lead-specific
  message?: string | null;
  metadata?: {
    care_type?: string;
    auto_intro?: string;
  } | null;
  from_profile?: FromProfile | null;
  // Question-specific
  question?: string;
  asker_name?: string | null;
  // Review-specific
  rating?: number;
  comment?: string;
  reviewer_name?: string;
  // Interview-specific
  candidate_name?: string;
  candidate_image?: string | null;
  interview_format?: string;
  proposed_time?: string;
  notes?: string | null;
  proposed_by?: string;
  provider_profile_id?: string;
  // Claim/signup-specific
  provider_name?: string;
  provider_city?: string | null;
  provider_state?: string | null;
  provider_image?: string | null;
  // Activity counts (for richer claim/signup cards)
  pending_leads?: number;
  pending_questions?: number;
}

export type ActionCardState =
  | "claim-form"
  | "pre-verified"
  | "already-claimed"
  | "dispute-submitted"
  // Notification states (from email links)
  | "notification-lead"
  | "notification-question"
  | "notification-review"
  | "notification-interview"
  | "notification-claim"
  | "notification-signup";

interface ActionCardProps {
  provider: Provider;
  initialState?: ActionCardState;
  /** Called when user clicks claim button - parent should open auth modal */
  onClaimClick: () => void;
  /** Pre-verified email hint from token validation */
  preVerifiedEmail?: string;
  /** Whether to highlight the card (attention state) */
  highlighted?: boolean;
  /** Notification data when coming from email */
  notificationData?: NotificationData | null;
  /** Whether the user is currently signed in */
  isSignedIn?: boolean;
}

// ============================================================
// Constants
// ============================================================

const ROLE_OPTIONS = [
  { value: "Owner", label: "Owner" },
  { value: "Administrator", label: "Administrator" },
  { value: "Executive Director", label: "Executive Director" },
  { value: "Office Manager", label: "Office Manager" },
  { value: "Marketing / Communications", label: "Marketing / Communications" },
  { value: "Staff Member", label: "Staff Member" },
  { value: "Other", label: "Other" },
];

// Tooltip content for each state
const TOOLTIP_CONTENT: Record<ActionCardState, { text: string; showTos?: boolean }> = {
  "claim-form": {
    text: "Sign in with your business email. If it matches our records, you'll get instant access to manage this listing.",
    showTos: true,
  },
  "pre-verified": {
    text: "Your email has been verified. Sign in to complete the claim process.",
    showTos: true,
  },
  "already-claimed": {
    text: "This listing is claimed but not yet verified. If you're the owner, submit a dispute and we'll review within 2–3 business days.",
    showTos: true,
  },
  "dispute-submitted": {
    text: "Our team will review your dispute and contact you at the email provided.",
  },
  "notification-lead": {
    text: "A family is interested in your services. Sign in to respond.",
    showTos: true,
  },
  "notification-question": {
    text: "Someone asked a question about your listing. Sign in to answer.",
    showTos: true,
  },
  "notification-review": {
    text: "Someone left a review for your listing. Sign in to respond.",
    showTos: true,
  },
  "notification-interview": {
    text: "A caregiver candidate wants to schedule an interview. Sign in to respond.",
    showTos: true,
  },
  "notification-claim": {
    text: "Verify your identity to manage this listing on Olera.",
    showTos: true,
  },
  "notification-signup": {
    text: "Complete setup to start managing your organization on Olera.",
    showTos: true,
  },
};

// Care type labels
const CARE_TYPE_LABELS: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  independent_living: "Independent Living",
};

// Helper functions for notification display
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #5fa3a3, #7ab8b8)",
    "linear-gradient(135deg, #417272, #5fa3a3)",
    "linear-gradient(135deg, #4d8a8a, #7ab8b8)",
    "linear-gradient(135deg, #385e5e, #5fa3a3)",
    "linear-gradient(135deg, #5fa3a3, #96c8c8)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ============================================================
// Info Tooltip Component
// ============================================================

function InfoTooltip({
  content,
  showTos = false
}: {
  content: string;
  showTos?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <div className="relative inline-flex" ref={tooltipRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 -m-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        aria-label="More information"
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 sm:left-0 sm:right-auto top-full mt-2 z-[200] w-[calc(100vw-3rem)] max-w-72 p-3.5 bg-gray-900 text-white text-sm rounded-xl shadow-xl animate-fade-in"
          role="tooltip"
        >
          {/* Arrow */}
          <div className="absolute -top-1.5 right-3 sm:right-auto sm:left-4 w-3 h-3 bg-gray-900 rotate-45" />

          <p className="relative text-[13px] leading-relaxed text-gray-100">
            {content}
          </p>

          {showTos && (
            <p className="relative mt-2.5 pt-2.5 border-t border-gray-700 text-[11px] text-gray-400 leading-relaxed">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="text-primary-300 hover:text-primary-200 underline">Provider TOS</Link>
              {" & "}
              <Link href="/privacy" className="text-primary-300 hover:text-primary-200 underline">Privacy Notice</Link>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Role Dropdown Component (Custom Select)
// ============================================================

function RoleDropdown({
  value,
  onChange,
  placeholder = "Select your role...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const selectedOption = ROLE_OPTIONS.find((opt) => opt.value === value);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 pr-10 rounded-xl border bg-gray-50/50 text-[15px] text-left focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all min-h-[48px] cursor-pointer ${
          isOpen ? "border-primary-300 ring-2 ring-primary-300 bg-white" : "border-gray-200"
        } ${!value ? "text-gray-400" : "text-gray-900"}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedOption?.label || placeholder}
      </button>

      {/* Chevron icon */}
      <svg
        className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none transition-transform ${
          isOpen ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-[200] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden animate-fade-in max-h-[280px] overflow-y-auto"
          role="listbox"
        >
          {ROLE_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3.5 text-left text-[15px] transition-colors focus:outline-none focus-visible:bg-gray-100 ${
                value === option.value
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              } ${index === 0 ? "rounded-t-xl" : ""} ${index === ROLE_OPTIONS.length - 1 ? "rounded-b-xl" : ""}`}
              role="option"
              aria-selected={value === option.value}
            >
              <span className="flex items-center gap-2.5">
                {value === option.value ? (
                  <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span>{option.label}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared input classes matching dashboard design system
const inputClasses =
  "w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all min-h-[48px]";
const labelClasses = "block text-[13px] font-semibold text-gray-700 mb-1.5";

// ============================================================
// Helper Functions
// ============================================================

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.com";
  const maskedLocal =
    local.length <= 2
      ? "*".repeat(local.length)
      : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

// ============================================================
// Profile Preview — shows provider what families see
// ============================================================

function ProfilePreviewCard({
  provider,
  googleRating,
  googleReviewCount,
  // Post-response state
  answered,
  askerName,
  questionText,
  answerPreview,
}: {
  provider: Provider;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  answered?: boolean;
  askerName?: string;
  questionText?: string;
  answerPreview?: string;
}) {
  const primaryImage = getPrimaryImage(provider);
  const slug = provider.slug || provider.provider_id;
  const hasGoogleReviews = !!(googleRating && googleRating > 0 && googleReviewCount && googleReviewCount > 0);
  const roundedRating = googleRating ? Math.round(googleRating * 10) / 10 : 0;
  const location = [provider.city, provider.state].filter(Boolean).join(", ");

  // Provider identity row (shared between both states)
  const providerIdentity = (
    <div className="flex items-center gap-4">
      {primaryImage ? (
        <Image src={primaryImage} alt={provider.provider_name} width={48} height={48} className="w-12 h-12 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shrink-0 border border-primary-100/60">
          <span className="text-sm font-display font-bold text-primary-700">
            {getInitials(provider.provider_name)}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-display font-semibold text-gray-900 truncate">{provider.provider_name}</h3>
        {location && <p className="text-sm text-gray-500 truncate">{provider.provider_category ? `${provider.provider_category} · ${location}` : location}</p>}
      </div>
    </div>
  );

  // ── POST-RESPONSE: analytics card + compact identity/Q&A card ──
  if (answered) {
    return (
      <div style={{ animation: "card-enter 0.3s ease-out both" }}>
        <AnalyticsTeaserCard expectedSlug={slug} variant="card" />
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          {providerIdentity}
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-3">
            <span className="text-primary-600 font-medium">1 question answered</span>
            {hasGoogleReviews && (
              <>
                <span>·</span>
                <span>{roundedRating}★ · {googleReviewCount} review{googleReviewCount !== 1 ? "s" : ""}</span>
              </>
            )}
          </div>
          {askerName && questionText && answerPreview && (
            <div className="border-t border-gray-100 mt-4 pt-4">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 mt-0.5" style={{ background: avatarGradient(askerName) }}>
                  {getInitials(askerName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 leading-snug">
                    &ldquo;{questionText.length > 80 ? questionText.substring(0, 77).trimEnd() + "..." : questionText}&rdquo;
                  </p>
                  <div className="mt-1.5 flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm text-gray-500 leading-snug">{answerPreview}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PRE-RESPONSE: analytics card + compact identity card (no Q&A yet) ──
  return (
    <div style={{ animation: "card-enter 0.3s ease-out both", animationDelay: "200ms" }}>
      <AnalyticsTeaserCard expectedSlug={slug} variant="card" />
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        {providerIdentity}
      </div>
    </div>
  );
}

// ============================================================
// Inline Question Response (respond without leaving the page)
// ============================================================

function InlineQuestionResponse({
  questionId,
  askerName,
  questionText,
  providerCity,
  providerState,
  providerSlug,
  googleRating,
  googleReviewCount,
  onSubmitted,
}: {
  questionId: string;
  askerName: string;
  questionText: string;
  providerCity?: string | null;
  providerState?: string | null;
  providerSlug?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  onSubmitted?: (answerText: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const handleSubmit = async () => {
    const trimmed = answer.trim();
    if (!trimmed || isSubmitting) return;
    if (trimmed.length > 2000) {
      setError("Response must be under 2,000 characters.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const doFetch = () =>
        fetch("/api/provider/questions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: questionId, answer: trimmed }),
        });

      let res = await doFetch();

      // Retry once on 401 (auth cookies not set yet) or 429 (rate limit)
      if (res.status === 401 || res.status === 429) {
        await new Promise((r) => setTimeout(r, res.status === 429 ? 3000 : 2000));
        res = await doFetch();
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to send response. Please try again.");
        return;
      }

      setSubmitted(true);
      onSubmitted?.(trimmed);

      // Auto-navigate to the dashboard after a brief pulse so the provider
      // registers "✓ Response sent" before the page transitions. The
      // dashboard hero handles next-action nudging from there — this
      // surface stops being its own next-action UI.
      //
      // setTimeout lives inside the submit handler (not a useEffect) on
      // purpose. When `onSubmitted` flips the parent's `questionAnswered`
      // state, the `{!questionAnswered && ...}` conditional in ActionCard
      // shifts the children list, which can cause React's reconciler to
      // unmount this component. A useEffect-driven timer would have its
      // cleanup fire on that unmount and the redirect would never run —
      // exactly the bug TJ caught on staging. A timer scheduled in the
      // handler closure runs regardless of mount state, and `router` from
      // useRouter is a stable global facade so router.push still navigates.
      window.setTimeout(() => {
        router.push("/provider?from=qa-success");
      }, 400);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Truncate answer for preview (used by parent via getAnswerPreview)
  const answerPreview = answer.length > 120
    ? answer.substring(0, 117).trimEnd() + "..."
    : answer;

  // Success state — compact confirmation only (profile preview is rendered by parent)
  if (submitted) {
    return (
      <div className="flex items-center gap-2.5 pb-2" style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[15px] font-semibold text-gray-900">
          Response sent to {askerName}
        </p>
      </div>
    );
  }

  // Response form
  return (
    <div>
      <textarea
        ref={textareaRef}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your response..."
        rows={3}
        maxLength={2000}
        className="w-full px-4 py-3 text-[15px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-gray-400 transition-all"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-400">
          {answer.length > 0 ? `${answer.length}/2,000` : ""}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!answer.trim() || isSubmitting}
          className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
        >
          {isSubmitting ? "Sending..." : "Send Response"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function ActionCard({
  provider,
  initialState = "claim-form",
  onClaimClick,
  preVerifiedEmail,
  highlighted = false,
  notificationData,
  isSignedIn = false,
}: ActionCardProps) {
  // Current state
  const [state, setState] = useState<ActionCardState>(initialState);

  // Track when inline question response is submitted (for dissolve + profile preview)
  const [questionAnswered, setQuestionAnswered] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState("");

  // Form state
  const [error, setError] = useState("");

  // Dispute form state
  const [disputeName, setDisputeName] = useState("");
  const [disputeEmail, setDisputeEmail] = useState("");
  const [disputePhone, setDisputePhone] = useState("");
  const [disputeRole, setDisputeRole] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  // Track if user clicked to show dispute form (when already claimed)
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  // Sync initial state
  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  // ────────────────────────────────────────────────────────────
  // Dispute Form Handlers
  // ────────────────────────────────────────────────────────────

  const handleDisputeSubmit = async () => {
    if (!disputeName.trim() || !disputeEmail.trim() || !disputePhone.trim() || !disputeRole || !disputeReason.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setDisputeSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.provider_id,
          provider_name: provider.provider_name,
          claimant_name: disputeName.trim(),
          claimant_email: disputeEmail.trim(),
          claimant_phone: disputePhone.trim(),
          claimant_role: disputeRole,
          reason: disputeReason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to submit dispute.");
        return;
      }

      setState("dispute-submitted");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Card Styling
  // ────────────────────────────────────────────────────────────

  const baseCardClass =
    "relative z-10 bg-white rounded-2xl shadow-sm p-8 md:p-10 transition-all duration-300";
  // Default: quiet border. Highlighted: warm ring for urgent attention
  const cardClass = highlighted
    ? `${baseCardClass} border border-primary-200 ring-2 ring-primary-100 shadow-md`
    : `${baseCardClass} border border-gray-200 shadow-sm`;

  // ════════════════════════════════════════════════════════════
  // RENDER: Notification States (Lead, Question, Review)
  // ════════════════════════════════════════════════════════════

  if (state === "notification-lead" && notificationData) {
    const rawName = notificationData.from_profile?.display_name || "A family";
    const rawLocation = [notificationData.from_profile?.city, notificationData.from_profile?.state].filter(Boolean).join(", ");
    const careType = notificationData.metadata?.care_type;
    const rawMessage = notificationData.metadata?.auto_intro;
    const timeAgo = formatTimeAgo(notificationData.created_at);

    // Always mask seeker info on the onboard page — full details revealed in /provider/connections
    // after the provider verifies ownership. This protects seekers if email goes to wrong recipient.
    const personName = rawName.split(" ")[0] || "A family";
    const personImage: string | null = null; // Always masked on onboard page
    const location = rawLocation ? rawLocation.split(",")[0]?.trim() : "";
    const message = rawMessage ? rawMessage.slice(0, 40) + "..." : null;

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        {/* Mascot + Header */}
        <div className="flex items-start gap-4 mb-6">
          <Image src="/images/olera-chat.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" />
          <div>
            <h3 className="text-lg font-display font-bold text-gray-900">
              A family in {notificationData.from_profile?.city || provider.city || "your area"} is looking for care
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{timeAgo}</p>
          </div>
        </div>

        {/* Seeker info — flat, no nested card */}
        <div className="border-t border-gray-100 pt-5 mb-6">
          <div className="flex items-center gap-3">
            {personImage ? (
              <Image src={personImage} alt={personName} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ background: avatarGradient(personName) }}>
                {getInitials(personName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-gray-900">{personName}</p>
              {(location || careType) && (
                <p className="text-sm text-gray-500">
                  {[location, careType ? (CARE_TYPE_LABELS[careType] || careType) : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          {message && (
            <p className="text-[15px] text-gray-500 mt-3 leading-relaxed italic">
              &ldquo;{message}&rdquo;
            </p>
          )}
        </div>

        {/* CTA — always show "View full inquiry" when token-verified.
            The provider proved identity via the email token. Browser session
            is established in the background. No verify/claim UI. */}
        {(isSignedIn || preVerifiedEmail) ? (
          <Link
            href={`/provider/connections?id=${notificationData.id}`}
            className="block w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all min-h-[48px] text-center"
          >
            See their message
          </Link>
        ) : (
          <>
            <button
              onClick={onClaimClick}
              className="w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all min-h-[48px]"
            >
              Sign in to respond
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Olera connects families with quality senior care providers.
            </p>
          </>
        )}
      </div>
    );
  }

  if (state === "notification-question" && notificationData) {
    const rawName = notificationData.asker_name || "Someone";
    const rawQuestion = notificationData.question || "";
    const timeAgo = formatTimeAgo(notificationData.created_at);

    // Q&A is public data — no masking needed
    const personName = rawName;
    const question = rawQuestion;

    const answerPreview = submittedAnswer.length > 120
      ? submittedAnswer.substring(0, 117).trimEnd() + "..."
      : submittedAnswer;

    return (
      <>
        {/* Question card — dissolves header after response */}
        <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
          {/* Mascot + Header + Question — dissolves after response */}
          {!questionAnswered && (
            <div>
              <div className="flex items-start gap-4 mb-6">
                <Image src="/images/olera-chat.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" />
                <div>
                  <h3 className="text-lg font-display font-bold text-gray-900">
                    Someone has a question about your services
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">{timeAgo}</p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ background: avatarGradient(personName) }}>
                    {getInitials(personName)}
                  </div>
                  <p className="text-[15px] font-semibold text-gray-900">{personName}</p>
                </div>
                {question && (
                  <p className="text-[15px] text-gray-500 mt-3 leading-relaxed italic">
                    &ldquo;{question}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Inline response or CTA */}
          {(isSignedIn || preVerifiedEmail) ? (
            <InlineQuestionResponse
              questionId={notificationData.id}
              askerName={personName}
              questionText={question}
              providerCity={provider.city}
              providerState={provider.state}
              providerSlug={provider.slug || provider.provider_id}
              googleRating={provider.google_reviews_data?.rating ?? provider.google_rating}
              googleReviewCount={provider.google_reviews_data?.review_count}
              onSubmitted={(text) => { setQuestionAnswered(true); setSubmittedAnswer(text); }}
            />
          ) : (
            <>
              <button
                onClick={onClaimClick}
                className="w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all min-h-[48px]"
              >
                Sign in to answer
              </button>
              <p className="text-xs text-gray-400 mt-3 text-center">
                Olera connects families with quality senior care providers.
              </p>
            </>
          )}
        </div>

        {/* Profile preview — always visible, adapts to pre/post response state.
            Briefly shows the answer recap during the ~400ms post-submit pulse
            before InlineQuestionResponse navigates to /provider, where the
            dashboard hero handles next-action nudging. */}
        <div className="mt-6">
          <ProfilePreviewCard
            provider={provider}
            googleRating={provider.google_reviews_data?.rating ?? provider.google_rating}
            googleReviewCount={provider.google_reviews_data?.review_count}
            answered={questionAnswered}
            askerName={questionAnswered ? personName : undefined}
            questionText={questionAnswered ? question : undefined}
            answerPreview={questionAnswered ? answerPreview : undefined}
          />
        </div>
      </>
    );
  }

  if (state === "notification-review" && notificationData) {
    const rawName = notificationData.reviewer_name || "Someone";
    const rating = notificationData.rating || 5;
    const rawComment = notificationData.comment || "";
    const timeAgo = formatTimeAgo(notificationData.created_at);

    // Reviews are public data — no masking needed
    const personName = rawName;
    const comment = rawComment;

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        {/* Mascot + Header */}
        <div className="flex items-start gap-4 mb-6">
          <Image src="/images/olera-chat.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" />
          <div>
            <h3 className="text-lg font-display font-bold text-gray-900">
              Someone left a review on your listing
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{timeAgo}</p>
          </div>
        </div>

        {/* Review info — flat */}
        <div className="border-t border-gray-100 pt-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ background: avatarGradient(personName) }}>
              {getInitials(personName)}
            </div>
            <p className="text-[15px] font-semibold text-gray-900 flex-1">{personName}</p>
            {/* Rating stars */}
            <div className="flex items-center gap-0.5 shrink-0">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-4 h-4 ${star <= rating ? "text-amber-400" : "text-gray-200"}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          </div>
          {comment && (
            <p className="text-[15px] text-gray-500 mt-3 leading-relaxed italic">
              &ldquo;{comment}&rdquo;
            </p>
          )}
        </div>

        {/* CTA */}
        {(isSignedIn || preVerifiedEmail) ? (
          <Link
            href={`/provider/reviews?id=${notificationData.id}`}
            className="block w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all min-h-[48px] text-center"
          >
            View review
          </Link>
        ) : (
          <>
            <button
              onClick={onClaimClick}
              className="w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all min-h-[48px]"
            >
              Sign in to respond
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Olera connects families with quality senior care providers.
            </p>
          </>
        )}
      </div>
    );
  }

  if (state === "notification-interview" && notificationData) {
    const candidateName = notificationData.candidate_name || "A candidate";
    const format = notificationData.interview_format || "flexible";
    const proposedTime = notificationData.proposed_time;
    const notes = notificationData.notes;
    const timeAgo = formatTimeAgo(notificationData.created_at);
    // Determine if the provider (recipient of this notification) initiated the interview
    const providerInitiated = notificationData.proposed_by && notificationData.provider_profile_id
      && notificationData.proposed_by === notificationData.provider_profile_id;

    const FORMAT_LABELS: Record<string, string> = {
      video: "Video call",
      phone: "Phone call",
      in_person: "In person",
      flexible: "Flexible",
    };

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        {/* Mascot + Header */}
        <div className="flex items-start gap-4 mb-6">
          <Image src="/images/olera-chat.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" />
          <div>
            <h3 className="text-lg font-display font-bold text-gray-900">
              {providerInitiated
                ? "You scheduled an interview"
                : "Someone wants to schedule an interview"}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{timeAgo}</p>
          </div>
        </div>

        {/* Candidate info — flat */}
        <div className="border-t border-gray-100 pt-5 mb-6">
          <div className="flex items-center gap-3">
            {notificationData.candidate_image ? (
              <Image src={notificationData.candidate_image} alt={candidateName} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ background: avatarGradient(candidateName) }}>
                {getInitials(candidateName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-gray-900">{candidateName}</p>
              <p className="text-sm text-gray-500">Candidate</p>
            </div>
          </div>

          {/* Interview details */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
              </svg>
              {FORMAT_LABELS[format] || format}
            </div>
            {proposedTime && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                {new Date(proposedTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            )}
            {notes && (
              <p className="text-[15px] text-gray-500 mt-2 leading-relaxed italic">
                &ldquo;{notes}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* CTA */}
        {(isSignedIn || preVerifiedEmail) ? (
          <Link
            href="/provider/caregivers"
            className="block w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all min-h-[48px] text-center"
          >
            View interview
          </Link>
        ) : (
          <>
            <button
              onClick={onClaimClick}
              className="w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.99] transition-all min-h-[48px]"
            >
              Sign in to respond
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Olera connects families with quality senior care providers.
            </p>
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Claim State (provider claiming existing listing)
  // ════════════════════════════════════════════════════════════

  if (state === "notification-claim" && notificationData) {
    const pName = notificationData.provider_name || provider.provider_name || "your organization";
    const pCity = notificationData.provider_city || provider.city;
    const pState = notificationData.provider_state || provider.state;
    const locationLine = [pCity, pState].filter(Boolean).join(", ");
    const pendingLeads = notificationData.pending_leads || 0;
    const pendingQuestions = notificationData.pending_questions || 0;
    const hasActivity = pendingLeads > 0 || pendingQuestions > 0;

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        {/* Mascot + Header */}
        <div className="flex items-start gap-4 mb-6">
          <Image src="/images/olera-chat.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" />
          <div>
            <h3 className="text-lg font-display font-bold text-gray-900">
              You now manage {pName}
            </h3>
            {locationLine && (
              <p className="text-sm text-gray-500 mt-0.5">{locationLine}</p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5 mb-6">
          {hasActivity ? (
            <div className="space-y-3">
              <p className="text-[15px] text-gray-600 font-medium">Families are waiting to hear from you:</p>
              <div className="flex flex-wrap gap-3">
                {pendingLeads > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 rounded-lg">
                    <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                    </svg>
                    <span className="text-sm font-semibold text-primary-700">
                      {pendingLeads} {pendingLeads === 1 ? "family" : "families"} reached out
                    </span>
                  </div>
                )}
                {pendingQuestions > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-amber-700">
                      {pendingQuestions} {pendingQuestions === 1 ? "question" : "questions"} to answer
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[15px] text-gray-600 leading-relaxed">
              Your listing is live on Olera. Start responding to families and updating your profile.
            </p>
          )}
        </div>

        {/* CTA */}
        {(isSignedIn || preVerifiedEmail) ? (
          <Link
            href="/provider"
            className="block w-full py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] text-center"
          >
            Go to Dashboard
          </Link>
        ) : (
          <>
            <button
              onClick={onClaimClick}
              className="w-full py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px]"
            >
              Sign in to manage
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Olera connects families with quality senior care providers.
            </p>
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Signup State (new organization setup)
  // ════════════════════════════════════════════════════════════

  if (state === "notification-signup" && notificationData) {
    const orgName = notificationData.provider_name || provider.provider_name || "your organization";
    const pCity = notificationData.provider_city || provider.city;

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        {/* Mascot + Header */}
        <div className="flex items-start gap-4 mb-6">
          <Image src="/images/olera-chat.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" />
          <div>
            <h3 className="text-lg font-display font-bold text-gray-900">
              {orgName} is set up
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Your listing is ready on Olera
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5 mb-6">
          <p className="text-[15px] text-gray-600 mb-4">
            {pCity ? `Families in ${pCity} are searching for care.` : "Families are actively searching for care."} Complete your profile to stand out:
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-sm text-gray-600">
              <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Add photos of your facility</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-600">
              <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Describe your services</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-600">
              <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Set your availability</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        {(isSignedIn || preVerifiedEmail) ? (
          <Link
            href="/provider"
            className="block w-full py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] text-center"
          >
            Complete Your Profile
          </Link>
        ) : (
          <>
            <button
              onClick={onClaimClick}
              className="w-full py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px]"
            >
              Sign in to get started
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Olera connects families with quality senior care providers.
            </p>
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Pre-verified State (from email campaign token)
  // ════════════════════════════════════════════════════════════

  if (state === "pre-verified") {
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Email verified
            <InfoTooltip content={TOOLTIP_CONTENT["pre-verified"].text} showTos={TOOLTIP_CONTENT["pre-verified"].showTos} />
          </h3>
          <p className="text-[15px] text-gray-500">
            <span className="font-semibold text-gray-700">{preVerifiedEmail}</span> is verified. Sign in to continue.
          </p>
        </div>

        <button
          onClick={onClaimClick}
          className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
        >
          Get started
        </button>
      </div>
    );
  }


  // ════════════════════════════════════════════════════════════
  // RENDER: Dispute Submitted State
  // ════════════════════════════════════════════════════════════

  if (state === "dispute-submitted") {
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Dispute submitted
            <InfoTooltip content={TOOLTIP_CONTENT["dispute-submitted"].text} />
          </h3>
          <p className="text-[15px] text-gray-500">
            We&apos;ll review and respond within 2–3 business days.
          </p>
        </div>

        <Link
          href={`/provider/${provider.slug || provider.provider_id}`}
          className="block w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 active:scale-[0.99] transition-all min-h-[48px] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
        >
          Return to listing
        </Link>
      </div>
    );
  }


  // ════════════════════════════════════════════════════════════
  // RENDER: Already Claimed State (Compact + Dispute Form)
  // ════════════════════════════════════════════════════════════

  if (state === "already-claimed") {
    // Compact view - show "Dispute" (primary) + "Sign in" (secondary)
    // Users landing here without a token are likely NOT the owner (owners come via email link)
    if (!showDisputeForm) {
      return (
        <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-amber-500/10 border border-amber-200/60">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
              This listing is claimed
              <InfoTooltip content={TOOLTIP_CONTENT["already-claimed"].text} showTos={TOOLTIP_CONTENT["already-claimed"].showTos} />
            </h3>
            <p className="text-[15px] text-gray-500">
              This listing is claimed but not yet verified. If you&apos;re the owner, submit a dispute.
            </p>
          </div>

          <button
            onClick={() => setShowDisputeForm(true)}
            className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 active:scale-[0.99] transition-all min-h-[48px] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 block"
          >
            Dispute listing
          </button>
          <p className="w-full sm:max-w-[280px] sm:mx-auto mt-4 text-sm text-gray-500 text-center">
            This is yours?{" "}
            <button
              onClick={onClaimClick}
              className="font-semibold text-primary-600 hover:text-primary-700 transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      );
    }

    // Full dispute form
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-amber-500/10 border border-amber-200/60">
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Dispute this listing
            <InfoTooltip content={TOOLTIP_CONTENT["already-claimed"].text} showTos={TOOLTIP_CONTENT["already-claimed"].showTos} />
          </h3>
          <p className="text-[15px] text-gray-500">
            Tell us about yourself and why you should manage this listing.
          </p>
        </div>

        <div className="space-y-4">
          {/* Full name - full width */}
          <div className="space-y-1.5">
            <label htmlFor="dispute-name" className={labelClasses}>
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="dispute-name"
              type="text"
              value={disputeName}
              onChange={(e) => setDisputeName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              className={inputClasses}
            />
          </div>

          {/* Email and Phone - 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label htmlFor="dispute-email" className={labelClasses}>
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="dispute-email"
                type="email"
                value={disputeEmail}
                onChange={(e) => setDisputeEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dispute-phone" className={labelClasses}>
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                id="dispute-phone"
                type="tel"
                value={disputePhone}
                onChange={(e) => setDisputePhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="tel"
                className={inputClasses}
              />
            </div>
          </div>

          {/* Your role dropdown */}
          <div className="space-y-1.5">
            <label id="dispute-role-label" className={labelClasses}>
              Your role <span className="text-red-500">*</span>
            </label>
            <RoleDropdown
              value={disputeRole}
              onChange={setDisputeRole}
            />
          </div>

          {/* Why should you manage this listing - required reason */}
          <div className="space-y-1.5">
            <label htmlFor="dispute-reason" className={labelClasses}>
              Why should you manage this listing? <span className="text-red-500">*</span>
            </label>
            <textarea
              id="dispute-reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Explain your connection to this organization..."
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-red-700" role="alert">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-3">
            <button
              type="button"
              onClick={() => { setShowDisputeForm(false); setError(""); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <button
              onClick={handleDisputeSubmit}
              disabled={!disputeName.trim() || !disputeEmail.trim() || !disputePhone.trim() || !disputeRole || !disputeReason.trim() || disputeSubmitting}
              className="px-6 py-3 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
            >
              {disputeSubmitting ? "Submitting..." : "Submit dispute"}
            </button>
          </div>
        </div>
      </div>
    );
  }


  // ════════════════════════════════════════════════════════════
  // RENDER: Claim Form State (Default) - Auth-based claim design
  // ════════════════════════════════════════════════════════════

  const providerEmail = provider.email;
  const hasEmail = !!providerEmail;

  return (
    <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
      {/* Shield icon + Claim heading */}
      <div className="text-center mb-6">
        {/* Shield Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
          </svg>
        </div>
        <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
          Manage this page
          <InfoTooltip
            content={TOOLTIP_CONTENT["claim-form"].text}
            showTos
          />
        </h3>
        <p className="text-[15px] text-gray-500 leading-relaxed">
          {hasEmail ? (
            <>Sign in with <span className="font-semibold text-gray-700">{maskEmail(providerEmail)}</span> for instant access.</>
          ) : (
            "Use your business email for instant verification."
          )}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg mb-4">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <p className="text-sm text-red-700" role="alert">{error}</p>
        </div>
      )}

      {/* Primary action - triggers auth modal */}
      <button
        onClick={onClaimClick}
        className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 flex items-center justify-center gap-1.5"
      >
        Get started
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

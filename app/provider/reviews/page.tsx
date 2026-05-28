"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReviewUpgradeModal from "@/components/provider/ReviewUpgradeModal";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import { markReviewAsRead } from "@/hooks/useUnreadReviewsCount";
import type { OrganizationMetadata } from "@/lib/types";

// ── Types ──

type ViewState = "landing" | "form";

interface SentRequest {
  id: string;
  clientName: string;
  recipient: string;
  deliveryMethod: string;
  sentAt: string;
  status: string;
  // Olera review data (if they left a review)
  oleraReviewId: string | null;
  hasReview: boolean;
  reviewRating: number | null;
  reviewFlagged: boolean;
}

interface HighlightedReview {
  id: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// ── Helpers ──

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

// ── Icons ──

function MailIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function CheckCircleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function LinkIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
    </svg>
  );
}

function PlayIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  );
}

function XIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function MoreIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
    </svg>
  );
}

function FlagIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function StarIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

// ── New Review Highlight Card ──

function NewReviewCard({
  review,
  providerSlug,
  onDismiss,
}: {
  review: HighlightedReview;
  providerSlug: string | null;
  onDismiss: () => void;
}) {
  return (
    <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-2xl border border-primary-200/60 p-5 lg:p-6 mb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🎉</span>
        <h2 className="text-[15px] font-semibold text-gray-900">
          New review from {review.reviewerName}
        </h2>
      </div>

      {/* Stars */}
      <div className="flex items-center gap-0.5 mb-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon
            key={star}
            className={`w-5 h-5 ${
              star <= review.rating ? "text-amber-400" : "text-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Review text */}
      {review.comment && (
        <p className="text-[15px] text-gray-700 leading-relaxed mb-5">
          "{review.comment}"
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
        >
          Dismiss
        </button>
        {providerSlug && (
          <Link
            href={`/provider/${providerSlug}`}
            target="_blank"
            className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors inline-flex items-center gap-1.5 group"
          >
            View
            <svg
              className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Default message ──

const DEFAULT_MESSAGE = "Hi, we'd love to hear about your experience with us. Would you take a moment to leave a review? It helps other families find quality care.";

// ── Video Panel ──

function VideoPanel() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
      {/* Section header - consistent styling */}
      <div className="px-5 lg:px-6 pt-5 lg:pt-6 pb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
          Learn
        </h2>
        <p className="text-[15px] font-semibold text-gray-900">How to get more reviews</p>
      </div>
      <div className="aspect-video relative">
        {isPlaying ? (
          <iframe
            src="https://www.youtube.com/embed/cb3TMkMNe3I?autoplay=1&rel=0"
            title="How to get more reviews"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <button
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 w-full h-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset"
            aria-label="Play video: How to get more reviews"
          >
            {/* YouTube thumbnail */}
            <img
              src="https://img.youtube.com/vi/cb3TMkMNe3I/maxresdefault.jpg"
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to hqdefault if maxresdefault doesn't exist
                (e.target as HTMLImageElement).src = "https://img.youtube.com/vi/cb3TMkMNe3I/hqdefault.jpg";
              }}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white/95 shadow-lg flex items-center justify-center group-hover:scale-110 group-focus-visible:scale-110 transition-transform duration-200">
                <PlayIcon className="w-6 h-6 text-gray-900 ml-0.5" />
              </div>
            </div>
            {/* Duration badge */}
            <div className="absolute bottom-3 right-3">
              <span className="px-2 py-1 rounded bg-black/70 text-white text-xs font-medium">
                2 min
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Landing View (Value-First) ──

function LandingView({
  city,
  onRequestReview,
}: {
  city: string | null;
  onRequestReview: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Title */}
      <h2 className="text-xl sm:text-2xl font-display font-bold text-gray-900 tracking-tight text-center mb-6">
        Get more Google reviews
      </h2>

      {/* Hero image - centered and fully visible */}
      <div className="flex justify-center mb-6">
        <img
          src="/Reviews-image.png"
          alt="Caregiver helping senior"
          className="w-full max-w-md h-auto object-contain"
        />
      </div>

      {/* Content - vertically stacked, centered */}
      <div className="flex flex-col items-center flex-1 justify-center pb-4">
        {/* Compelling stat badge */}
        <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-amber-50/80 border border-amber-100/60 mb-6">
          <StarIcon className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-gray-700">
            Providers{city ? ` in ${city.length > 20 ? city.slice(0, 18) + "…" : city}` : ""} with 10+ reviews get{" "}
            <span className="font-semibold text-gray-900">3x more inquiries</span>
          </p>
        </div>

        {/* CTA Button - larger, more prominent */}
        <button
          type="button"
          onClick={onRequestReview}
          className="px-10 py-3.5 rounded-xl bg-primary-600 text-white text-base font-semibold hover:bg-primary-700 transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 shadow-md hover:shadow-lg"
        >
          Request a Review
        </button>
      </div>
    </div>
  );
}

// ── Stats Card (Sidebar) ──

function StatsCard({
  totalSent,
  thisMonth,
  isLoading,
  onViewAll,
}: {
  totalSent: number;
  thisMonth: number;
  isLoading: boolean;
  onViewAll: () => void;
}) {
  // Loading skeleton
  if (isLoading) {
    return (
      <div>
        <div className="h-3 w-20 bg-gray-200 rounded animate-pulse mb-5" />
        <div className="flex items-baseline gap-6 mb-5">
          <div>
            <div className="h-8 w-10 bg-gray-200 rounded animate-pulse mb-1" />
            <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <div className="h-8 w-8 bg-gray-200 rounded animate-pulse mb-1" />
            <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  // Empty state with icon and animation
  if (totalSent === 0) {
    return (
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Your Activity
        </h2>
        <div className="flex flex-col items-center text-center py-2">
          <div
            className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center mb-3"
            style={{ animation: "statsFloat 3s ease-in-out infinite" }}
          >
            <MailIcon className="w-5 h-5 text-primary-500" />
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            No requests sent yet.
            <br />
            <span className="text-gray-600 font-medium">Start building your reviews!</span>
          </p>
        </div>
        <style jsx>{`
          @keyframes statsFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">
        Your Activity
      </h2>

      {/* Stats grid - horizontal on mobile, stacked labels */}
      <div className="flex items-baseline gap-6 mb-5">
        <div>
          <p className="text-3xl font-display font-bold text-gray-900 tracking-tight">{totalSent}</p>
          <p className="text-sm text-gray-500 mt-0.5">requests sent</p>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div>
          <p className="text-3xl font-display font-bold text-gray-900 tracking-tight">{thisMonth}</p>
          <p className="text-sm text-gray-500 mt-0.5">this month</p>
        </div>
      </div>

      {/* View all link with hover animation */}
      <button
        type="button"
        onClick={onViewAll}
        className="text-[13px] text-primary-600 hover:text-primary-700 font-semibold transition-colors inline-flex items-center gap-1.5 group"
      >
        View all requests
        <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </button>
    </div>
  );
}

// ── Sent Requests Modal ──

function SentRequestsModal({
  isOpen,
  onClose,
  requests,
  onFlag,
}: {
  isOpen: boolean;
  onClose: () => void;
  requests: SentRequest[];
  onFlag: (reviewId: string) => Promise<void>;
}) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop - subtle blur */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal with scale-in animation */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Sent Requests</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -m-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-200"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content with better scroll */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <SentRequestsList
            requests={requests}
            isLoading={false}
            error={null}
            onFlag={onFlag}
          />
        </div>
      </div>
    </div>
  );
}

// ── Send Request Form ──

function SendRequestForm({
  onSuccess,
  providerSlug,
  remainingRequests,
  creditsUsed,
  onUpgradeRequired,
  hasGooglePlaceId,
  isVerified,
  onVerifyClick,
}: {
  onSuccess?: () => void;
  providerSlug?: string;
  remainingRequests: number;
  creditsUsed: number;
  onUpgradeRequired: () => void;
  hasGooglePlaceId: boolean;
  isVerified?: boolean;
  onVerifyClick?: () => void;
}) {
  // Delivery method toggle
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "link">("email");

  // Email form state
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  // Link form state
  const [linkClientName, setLinkClientName] = useState("");

  // Shared state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState("");
  const [successMethod, setSuccessMethod] = useState<"email" | "shared" | "copied" | "link">("email");
  const [successLink, setSuccessLink] = useState<string | null>(null); // For fallback manual copy
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false); // Track if user copied from success screen
  const isAtLimit = remainingRequests <= 0;

  // Auto-dismiss success after 4 seconds (only if Google is already connected)
  useEffect(() => {
    if (showSuccess && hasGooglePlaceId) {
      const timer = setTimeout(() => setShowSuccess(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess, hasGooglePlaceId]);

  // Email submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !email.trim() || !message.trim() || isSubmitting || isAtLimit) return;

    // Check verification before sending email requests
    // Use !isVerified to catch both false and undefined (profile still loading)
    if (!isVerified && onVerifyClick) {
      onVerifyClick();
      return;
    }

    setIsSubmitting(true);
    setShowSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/review-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients: [{ name: clientName.trim(), email: email.trim() }],
          message: message.trim(),
          delivery_method: "email",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Handle 402 - upgrade required
        if (res.status === 402 && data.upgrade_required) {
          onUpgradeRequired();
          return;
        }
        throw new Error(data.error || "Failed to send request");
      }

      const failedResults = data.results?.filter((r: { status: string }) => r.status === "failed") || [];
      if (failedResults.length > 0) {
        throw new Error(failedResults[0]?.error || "Failed to send email");
      }

      setSuccessName(clientName);
      setSuccessMethod("email");
      setSuccessLink(null);
      setShowSuccess(true);
      setClientName("");
      setEmail("");
      setMessage(DEFAULT_MESSAGE);
      onSuccess?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Link share handler - logs request and generates link (no copy during generation)
  const handleShareLink = async () => {
    if (!providerSlug || isSubmitting || isAtLimit) return;

    const name = linkClientName.trim() || "Client";
    const reviewLink = `${window.location.origin}/review/${providerSlug}${linkClientName.trim() ? `?name=${encodeURIComponent(linkClientName.trim())}` : ""}`;

    setIsSubmitting(true);
    setShowSuccess(false);
    setErrorMessage(null);

    try {
      // Log the request to count toward limit
      const res = await fetch("/api/review-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients: [{ name, email: null }],
          message: null,
          delivery_method: "link",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Handle 402 - upgrade required
        if (res.status === 402 && data.upgrade_required) {
          onUpgradeRequired();
          return;
        }
        throw new Error(data.error || "Failed to create request");
      }

      // Store link for success state - user will copy/share from success screen
      setSuccessLink(reviewLink);
      setSuccessName(name);
      setSuccessMethod("link"); // New method: link ready but not yet copied
      setShowSuccess(true);
      setLinkClientName("");
      onSuccess?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };


  // Success celebration state
  if (showSuccess) {
    const handleCopySuccessLink = async () => {
      if (!successLink) return;

      // Copy to clipboard first
      try {
        await navigator.clipboard.writeText(successLink);
      } catch {
        const textArea = document.createElement("textarea");
        textArea.value = successLink;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      // Show copied feedback
      setLinkCopied(true);

      // Try native share API (will show share sheet on supported devices)
      if (navigator.share) {
        try {
          await navigator.share({
            title: "Leave us a review",
            text: "We'd love to hear about your experience!",
            url: successLink,
          });
        } catch {
          // User cancelled or share failed - that's fine, link is already copied
        }
      }
    };

    return (
      <div className="text-center py-10 animate-fade-in">
        <div className="relative w-16 h-16 mx-auto mb-4 animate-success-bounce">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <CheckCircleIcon className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full" />
          <div className="absolute -bottom-0.5 -left-1 w-2 h-2 bg-primary-400 rounded-full" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {successMethod === "email" && "Request sent!"}
          {(successMethod === "link" || successMethod === "shared") && "Link ready!"}
          {successMethod === "copied" && "Link copied!"}
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          {successMethod === "email" && `${successName} will receive your review request shortly.`}
          {(successMethod === "link" || successMethod === "shared" || successMethod === "copied") && `Share the link with ${successName} via WhatsApp, text, or in person.`}
        </p>

        {/* Show link for manual copy (for shared/copied methods) */}
        {successMethod !== "email" && successLink && (
          <div className="mb-5">
            <div className="flex items-center gap-2 max-w-sm mx-auto">
              <input
                type="text"
                readOnly
                value={successLink}
                className="flex-1 px-3 py-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg truncate"
              />
              <button
                type="button"
                onClick={handleCopySuccessLink}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors shrink-0 ${
                  linkCopied
                    ? "text-emerald-600 bg-emerald-50 border border-emerald-200"
                    : "text-primary-600 bg-primary-50 border border-primary-200 hover:bg-primary-100"
                }`}
              >
                {linkCopied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Google connection prompt for providers without Google Place ID */}
        {!hasGooglePlaceId && (
          <div className="mb-5 mx-auto max-w-sm">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <p className="text-sm font-medium text-gray-900">
                  Want reviews on Google?
                </p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Right now, reviews go to your Olera profile. Connect Google to get them on Google instead.
              </p>
              <a
                href="/account/settings"
                onClick={() => {
                  setShowSuccess(false);
                  setSuccessLink(null);
                  setLinkCopied(false);
                }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                Connect Google Business
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setShowSuccess(false);
            setSuccessLink(null);
            setLinkCopied(false);
          }}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          Send another request
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Premium Segmented Toggle */}
      <div className="relative p-1 bg-gray-100/80 rounded-xl">
        {/* Sliding indicator */}
        <div
          className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-out ${
            deliveryMethod === "link" ? "left-[calc(50%+2px)]" : "left-1"
          }`}
        />
        {/* Toggle buttons */}
        <div className="relative flex" role="group" aria-label="Delivery method">
          <button
            type="button"
            onClick={() => setDeliveryMethod("email")}
            aria-pressed={deliveryMethod === "email"}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
              deliveryMethod === "email"
                ? "text-primary-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <MailIcon className="w-4 h-4" />
            Request via email
          </button>
          <button
            type="button"
            onClick={() => setDeliveryMethod("link")}
            aria-pressed={deliveryMethod === "link"}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
              deliveryMethod === "link"
                ? "text-primary-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            Request via link
          </button>
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm" role="alert">
          <svg className="w-5 h-5 shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Email Form */}
      {deliveryMethod === "email" && (
        <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
          {/* Client Name + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1.5">
                Client name
              </label>
              <input
                type="text"
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Jane Smith"
                disabled={isAtLimit}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed"
                required
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                disabled={isAtLimit}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed"
                required
                autoComplete="off"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1.5">
              Your message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Write a personal message..."
              disabled={isAtLimit}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200 resize-y min-h-[120px] leading-relaxed disabled:bg-gray-50 disabled:cursor-not-allowed"
              required
            />
          </div>

          {/* Submit button */}
          <div className="space-y-2">
            <button
              type="submit"
              disabled={!clientName.trim() || !email.trim() || !message.trim() || isSubmitting || isAtLimit}
              className="w-full py-3.5 rounded-2xl bg-gray-900 text-white text-[15px] font-medium hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 shadow-[0_4px_12px_rgb(0,0,0,0.15)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.2)] disabled:shadow-none"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-2">
                  <MailIcon className="w-5 h-5" />
                  Send review request
                </span>
              )}
            </button>
            {/* Verification hint for unverified providers */}
            {!isVerified && (
              <p className="text-center text-xs text-gray-400">
                <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                Verification required to send
              </p>
            )}
          </div>
        </form>
      )}

      {/* Link Form */}
      {deliveryMethod === "link" && (
        <div className="space-y-5 animate-fade-in">
          {/* Client Name (optional) */}
          <div>
            <label htmlFor="linkClientName" className="block text-sm font-medium text-gray-700 mb-1.5">
              Client name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="linkClientName"
              value={linkClientName}
              onChange={(e) => setLinkClientName(e.target.value)}
              placeholder="Jane Smith"
              disabled={isAtLimit}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed"
              autoComplete="off"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Personalizes the review page with their name
            </p>
          </div>

          {/* Share button */}
          <button
            type="button"
            onClick={handleShareLink}
            disabled={isSubmitting || isAtLimit}
            className="w-full py-3.5 rounded-2xl bg-gray-900 text-white text-[15px] font-medium hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 shadow-[0_4px_12px_rgb(0,0,0,0.15)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.2)] disabled:shadow-none"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating link...
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <LinkIcon className="w-5 h-5" />
                Share link
              </span>
            )}
          </button>

          {/* Helper text */}
          <p className="text-center text-xs text-gray-400">
            Share via WhatsApp, text message, or in person
          </p>
        </div>
      )}

      {/* Footer section - shared between both forms */}
      <div className="space-y-3">

        {/* Google reassurance badge OR connect prompt with tooltip */}
        {hasGooglePlaceId ? (
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Goes directly to your Google Business Profile
          </p>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path fill="#9CA3AF" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#9CA3AF" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#9CA3AF" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#9CA3AF" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <Link
              href="/account/settings"
              className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              Connect Google
            </Link>
            {/* Info icon with tooltip */}
            <div className="relative group">
              <svg className="w-3.5 h-3.5 text-gray-300 cursor-help" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              {/* Tooltip */}
              <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-10">
                <p className="leading-relaxed">
                  Without Google connected, reviews are collected on Olera. Connect your Google Business Profile to get reviews directly on Google.
                </p>
                <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-900" />
              </div>
            </div>
          </div>
        )}

        {/* Remaining requests - only show when low */}
        {remainingRequests <= 3 && remainingRequests > 0 && (
          <p className="text-center text-xs text-amber-600 font-medium">
            {remainingRequests} free request{remainingRequests === 1 ? "" : "s"} remaining
          </p>
        )}

        {/* At limit message */}
        {isAtLimit && (
          <button
            type="button"
            onClick={onUpgradeRequired}
            className="text-center text-xs text-primary-600 hover:text-primary-700 font-medium w-full"
          >
            Upgrade to Pro for unlimited requests
          </button>
        )}
      </div>

    </div>
  );
}

// ── Sent Requests List ──

type MenuState = {
  requestId: string;
  status: "idle" | "loading" | "success" | "error";
  errorMessage?: string;
};

function SentRequestsList({
  requests,
  isLoading,
  error,
  onFlag,
}: {
  requests: SentRequest[];
  isLoading: boolean;
  error: string | null;
  onFlag: (reviewId: string) => Promise<void>;
}) {
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Only close if not in loading/success state
        if (menuState?.status === "idle") {
          setMenuState(null);
        }
      }
    }
    if (menuState) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuState]);

  // Auto-close after success
  useEffect(() => {
    if (menuState?.status === "success") {
      const timer = setTimeout(() => setMenuState(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [menuState?.status]);

  // Auto-close after error (longer delay to read)
  useEffect(() => {
    if (menuState?.status === "error") {
      const timer = setTimeout(() => setMenuState(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [menuState?.status]);

  const openMenu = (requestId: string) => {
    setMenuState({ requestId, status: "idle" });
  };

  const closeMenu = () => {
    if (menuState?.status === "idle") {
      setMenuState(null);
    }
  };

  const handleFlag = async (reviewId: string, requestId: string) => {
    setMenuState({ requestId, status: "loading" });
    try {
      await onFlag(reviewId);
      setMenuState({ requestId, status: "success" });
    } catch (err) {
      setMenuState({
        requestId,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Failed to flag",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading sent requests">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-48 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12" role="alert">
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-14 px-6">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <MailIcon className="w-5 h-5 text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">No requests sent yet</h3>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
          Sent requests will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((request, idx) => {
        const hasReview = request.hasReview && !request.reviewFlagged;
        const isFlagged = request.reviewFlagged;

        return (
          <div
            key={request.id}
            className="bg-gray-50/50 hover:bg-gray-50 rounded-xl p-4 transition-all duration-200"
            style={{ animation: `fadeIn 0.2s ease-out ${idx * 40}ms both` }}
          >
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(request.clientName)} flex items-center justify-center shrink-0`}>
                <span className="text-xs font-semibold text-gray-600">
                  {getInitials(request.clientName)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">
                    {request.clientName}
                  </span>
                  {hasReview ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
                      <StarIcon className="w-3 h-3" />
                      Reviewed
                      {request.reviewRating && (
                        <span className="ml-0.5">{request.reviewRating}</span>
                      )}
                    </span>
                  ) : isFlagged ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      <FlagIcon className="w-3 h-3" />
                      Flagged
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                      Sent
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1.5">
                  {request.deliveryMethod === "link" ? (
                    <>
                      <LinkIcon className="w-3 h-3 shrink-0" />
                      <span>Link shared</span>
                    </>
                  ) : (
                    <>
                      <MailIcon className="w-3 h-3 shrink-0" />
                      <span>{request.recipient}</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatDate(request.sentAt)}
                </p>
              </div>

              {/* More menu for items with Olera reviews (flagged or not) */}
              {request.oleraReviewId && (
                <div className="relative" ref={menuState?.requestId === request.id ? menuRef : null}>
                  <button
                    type="button"
                    onClick={() => menuState?.requestId === request.id ? closeMenu() : openMenu(request.id)}
                    disabled={menuState?.requestId === request.id && menuState.status === "loading"}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    aria-label="More options"
                  >
                    <MoreIcon className="w-5 h-5" />
                  </button>

                  {/* Dropdown tooltip */}
                  {menuState?.requestId === request.id && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-10 animate-fade-in">
                      {/* Loading state */}
                      {menuState.status === "loading" && (
                        <div className="px-4 py-3 flex items-center gap-2.5 text-sm text-gray-600">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          Flagging review...
                        </div>
                      )}

                      {/* Success state */}
                      {menuState.status === "success" && (
                        <div className="px-4 py-3 flex items-center gap-2.5 text-sm text-emerald-700 bg-emerald-50">
                          <CheckCircleIcon className="w-4 h-4" />
                          Review flagged
                        </div>
                      )}

                      {/* Error state */}
                      {menuState.status === "error" && (
                        <div className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2 text-red-600 mb-1">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                            </svg>
                            {menuState.errorMessage || "Failed to flag"}
                          </div>
                        </div>
                      )}

                      {/* Idle state - show appropriate action */}
                      {menuState.status === "idle" && (
                        <>
                          {isFlagged ? (
                            // Already flagged - show info
                            <div className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-2 text-amber-700 mb-1.5">
                                <FlagIcon className="w-4 h-4 shrink-0" />
                                <span className="font-medium">Already flagged</span>
                              </div>
                              <p className="text-gray-500 text-xs leading-relaxed">
                                Need to escalate?{" "}
                                <a
                                  href="mailto:support@olera.care"
                                  className="text-primary-600 hover:text-primary-700 underline"
                                >
                                  Contact support
                                </a>
                              </p>
                            </div>
                          ) : (
                            // Not flagged - show flag action
                            <button
                              type="button"
                              onClick={() => handleFlag(request.oleraReviewId!, request.id)}
                              className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                            >
                              <FlagIcon className="w-4 h-4" />
                              Flag as inappropriate
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──

export default function ProviderReviewsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [view, setView] = useState<ViewState>("landing");
  const [requests, setRequests] = useState<SentRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [remainingRequests, setRemainingRequests] = useState(3);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSentModal, setShowSentModal] = useState(false);
  const [highlightedReview, setHighlightedReview] = useState<HighlightedReview | null>(null);

  // Get provider profile from auth context
  const profile = useProviderProfile();
  const providerSlug = profile?.slug || null;
  const providerCity = profile?.city || null;

  // Check if provider has Google Place ID
  const metadata = profile?.metadata as OrganizationMetadata | undefined;
  const hasGooglePlaceId = !!(metadata?.google_metadata?.place_id);

  // Verification state
  const verificationState = profile?.verification_state as string | null;
  const isVerified =
    verificationState === "verified" ||
    verificationState === "not_required";

  // Verification modal
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModal,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: profile?.id || "",
    onVerified: () => {
      closeVerificationModal();
      router.refresh();
    },
  });

  // Fetch highlighted review if ?id= param is present
  const reviewIdParam = searchParams.get("id");
  const profileId = profile?.id;
  useEffect(() => {
    if (!reviewIdParam) return;

    let cancelled = false;

    async function fetchHighlightedReview() {
      try {
        // Try fetching from reviews table first (authenticated reviews)
        let res = await fetch(`/api/reviews/${reviewIdParam}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.review) {
            setHighlightedReview({
              id: data.review.id,
              reviewerName: data.review.reviewer_name,
              rating: data.review.rating,
              comment: data.review.comment || data.review.review_text || "",
              createdAt: data.review.created_at,
            });
            // Mark review as read when viewed
            if (profileId) {
              markReviewAsRead(data.review.id, profileId);
            }
            return;
          }
        }

        // Fallback: try olera_reviews table
        res = await fetch(`/api/olera-reviews/${reviewIdParam}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.review) {
            setHighlightedReview({
              id: data.review.id,
              reviewerName: data.review.reviewer_name,
              rating: data.review.rating,
              comment: data.review.review_text || "",
              createdAt: data.review.created_at,
            });
            // Mark review as read when viewed
            if (profileId) {
              markReviewAsRead(data.review.id, profileId);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch highlighted review:", err);
        }
      }
    }

    fetchHighlightedReview();

    return () => {
      cancelled = true;
    };
  }, [reviewIdParam, profileId]);

  // Dismiss the highlighted review and clear URL param
  const handleDismissHighlight = useCallback(() => {
    setHighlightedReview(null);
    // Remove ?id= from URL without page reload
    router.replace("/provider/reviews", { scroll: false });
  }, [router]);

  // Calculate stats
  const totalSent = requests.length;
  const thisMonth = requests.filter((r) => {
    const d = new Date(r.sentAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // Fetch requests and credits info
  const fetchRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const res = await fetch("/api/review-requests");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const reqs = data.requests || [];
      setRequests(reqs);
      setRequestsError(null);

      // Use credits info from API (lifetime limit, not monthly)
      const used = data.credits_used ?? 0;
      const remaining = data.is_paid ? Infinity : (data.credits_remaining ?? 3);
      setCreditsUsed(used);
      setRemainingRequests(remaining);
    } catch (err) {
      console.error("Failed to fetch sent requests:", err);
      setRequestsError("Failed to load sent requests");
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleSendSuccess = useCallback(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleFlagReview = useCallback(async (reviewId: string) => {
    const res = await fetch(`/api/provider/olera-reviews/${reviewId}/flag`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to flag review");
    }
    // Update local state to reflect the flagged status
    setRequests((prev) =>
      prev.map((req) =>
        req.oleraReviewId === reviewId
          ? { ...req, reviewFlagged: true, hasReview: false }
          : req
      )
    );
  }, []);

  return (
    <>
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out;
        }
        @keyframes success-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-success-bounce {
          animation: success-bounce 0.4s ease-out;
        }
        @keyframes backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-backdrop-in {
          animation: backdrop-in 0.2s ease-out;
        }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in {
          animation: modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>

      <div className="min-h-screen bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page header */}
          <div className="mb-5 lg:mb-8">
            <h1 className="text-2xl lg:text-[28px] font-display font-bold text-gray-900 tracking-tight">
              Reviews
            </h1>
            <p className="text-[15px] text-gray-500 mt-1.5 leading-relaxed">
              Help families find you.
            </p>
          </div>

          {/* Highlighted new review (from magic link) */}
          {highlightedReview && (
            <NewReviewCard
              review={highlightedReview}
              providerSlug={providerSlug}
              onDismiss={handleDismissHighlight}
            />
          )}

          {/* Mobile: Stats card at top */}
          <div className="lg:hidden mb-4">
            <StatsCard
              totalSent={totalSent}
              thisMonth={thisMonth}
              isLoading={isLoadingRequests}
              onViewAll={() => setShowSentModal(true)}
            />
          </div>

          {/* Content grid */}
          <div className="lg:grid lg:grid-cols-[1fr,340px] lg:gap-8 lg:items-stretch">
            {/* Main content card - overflow-hidden for hero image clipping */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-5 lg:p-6 mb-6 lg:mb-0 overflow-hidden">
              {view === "landing" ? (
                <LandingView
                  city={providerCity}
                  onRequestReview={() => setView("form")}
                />
              ) : (
                <div className="animate-fade-in">
                  {/* Back button with hover background */}
                  <button
                    type="button"
                    onClick={() => setView("landing")}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium mb-5 -ml-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-all duration-150 group"
                  >
                    <ArrowLeftIcon className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
                    Back
                  </button>

                  {/* Form */}
                  <SendRequestForm
                    onSuccess={handleSendSuccess}
                    providerSlug={providerSlug || undefined}
                    remainingRequests={remainingRequests}
                    creditsUsed={creditsUsed}
                    onUpgradeRequired={() => setShowUpgradeModal(true)}
                    hasGooglePlaceId={hasGooglePlaceId}
                    isVerified={isVerified}
                    onVerifyClick={openVerificationModal}
                  />
                </div>
              )}
            </div>

            {/* Desktop sidebar */}
            <div className="hidden lg:flex lg:flex-col lg:gap-6 lg:sticky lg:top-24">
              {/* Stats card */}
              <StatsCard
                totalSent={totalSent}
                thisMonth={thisMonth}
                isLoading={isLoadingRequests}
                onViewAll={() => setShowSentModal(true)}
              />

              {/* Video panel */}
              <VideoPanel />
            </div>
          </div>

          {/* Mobile video */}
          <div className="lg:hidden mt-6">
            <VideoPanel />
          </div>
        </div>
      </div>

      {/* Sent Requests Modal */}
      <SentRequestsModal
        isOpen={showSentModal}
        onClose={() => setShowSentModal(false)}
        requests={requests}
        onFlag={handleFlagReview}
      />

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <ReviewUpgradeModal
          creditsUsed={creditsUsed}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {/* Verification Modal */}
      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={profile?.display_name || "your business"}
        profileId={profile?.id}
      />
    </>
  );
}

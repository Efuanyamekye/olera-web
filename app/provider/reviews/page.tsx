"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { markAllReviewsAsRead } from "@/hooks/useUnreadReviewsCount";
import type { Review } from "@/lib/types";

// Calculate stats from reviews
function calculateStats(reviews: Review[]): ReviewStats {
  const totalReviews = reviews.length;
  const repliedCount = reviews.filter(r => r.provider_reply).length;
  const avgRating = totalReviews > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
    : 0;

  return {
    totalReviews,
    repliedCount,
    avgRating: Math.round(avgRating * 10) / 10,
    categoryStats: {
      care_quality: avgRating > 0 ? Math.min(5, avgRating + 0.3) : 0,
      communication: avgRating > 0 ? Math.min(5, avgRating - 0.2) : 0,
      value: avgRating,
      cleanliness: avgRating > 0 ? Math.min(5, avgRating - 0.1) : 0,
    },
  };
}

// ── Types ──

type TabFilter = "request_now" | "request_onsite" | "all" | "replied";

interface ReviewStats {
  totalReviews: number;
  repliedCount: number;
  avgRating: number;
  categoryStats: {
    care_quality: number;
    communication: number;
    value: number;
    cleanliness: number;
  };
}

// ── Helpers ──

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
  if (name === "Anonymous") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Icons ──

function StarIcon({ className = "w-4 h-4", filled = true }: { className?: string; filled?: boolean }) {
  return filled ? (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ) : (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    </svg>
  );
}

function CloseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

// ── Tips Accordion Component ──

function TipsAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-gray-300 rounded-full" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {title}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-300 ease-out ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={`px-6 pb-5 transition-opacity duration-200 ${
              isOpen ? "opacity-100" : "opacity-0"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Avatar Component ──

function Avatar({
  name,
  size = "md",
  isProvider = false,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  isProvider?: boolean;
}) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const initials = getInitials(name);

  if (isProvider) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm`}>
        <span className="font-bold text-primary-700">{initials}</span>
      </div>
    );
  }

  if (name === "Anonymous") {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gray-100 flex items-center justify-center shrink-0`}>
        <span className="font-medium text-gray-400">{initials}</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm`}>
      <span className="font-bold text-gray-600">{initials}</span>
    </div>
  );
}

// ── Star Rating Display ──

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          className={`${sizeClass} ${star <= rating ? "text-primary-500" : "text-gray-200"}`}
          filled={star <= rating}
        />
      ))}
    </div>
  );
}

// ── Review Card ──

function ReviewCard({
  review,
  onReply,
  onEdit,
  isMobile,
}: {
  review: Review;
  onReply: (review: Review) => void;
  onEdit: (review: Review) => void;
  isMobile: boolean;
}) {
  const hasReply = !!review.provider_reply;

  // Mobile: card is tappable for unreplied reviews
  if (isMobile && !hasReply) {
    return (
      <button
        type="button"
        onClick={() => onReply(review)}
        className="w-full text-left bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden active:bg-vanilla-50/60 transition-colors"
      >
        <div className="p-4">
          {/* Reviewer info + rating */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Avatar name={review.reviewer_name} size="md" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-gray-900 text-[15px]">
                  {review.reviewer_name}
                </span>
                <p className="text-sm text-gray-400 mt-0.5">
                  {formatDate(review.created_at)} · {review.relationship}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <StarRating rating={review.rating} />
            </div>
          </div>

          {/* Review content */}
          <div className="mt-3">
            {review.title && (
              <p className="font-semibold text-gray-900 mb-1.5 text-[15px] line-clamp-1">
                &ldquo;{review.title}&rdquo;
              </p>
            )}
            <p className="text-gray-600 leading-relaxed text-[15px] line-clamp-3">
              {review.comment}
            </p>
          </div>

          {/* Reply prompt */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3.5">
            <p className="text-[15px] text-gray-400">Tap to reply...</p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden hover:border-gray-300/80 transition-colors">
      <div className={isMobile ? "p-4" : "p-6"}>
        {/* Reviewer info + rating */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={review.reviewer_name} size={isMobile ? "md" : "lg"} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-semibold text-gray-900 ${isMobile ? "text-[15px]" : "text-base"}`}>
                  {review.reviewer_name}
                </span>
                {hasReply && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100/50">
                    Replied
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">
                {formatDate(review.created_at)} · {review.relationship}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StarRating rating={review.rating} />
            <span className="text-sm font-semibold text-gray-700">{review.rating}/5</span>
          </div>
        </div>

        {/* Review content */}
        <div className="mt-4">
          {review.title && (
            <p className={`font-semibold text-gray-900 mb-2 ${isMobile ? "text-[15px]" : "text-lg"}`}>
              &ldquo;{review.title}&rdquo;
            </p>
          )}
          <p className={`text-gray-600 leading-relaxed ${isMobile ? "text-[15px]" : "text-base"}`}>
            {review.comment}
          </p>
        </div>

        {/* Provider response */}
        {hasReply && (
          <div className="mt-5 pl-4 border-l-2 border-primary-100 bg-primary-50/30 rounded-r-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary-600">Your response</span>
              {review.replied_at && (
                <span className="text-xs text-gray-400">{formatDate(review.replied_at)}</span>
              )}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{review.provider_reply}</p>
          </div>
        )}

        {/* Action button */}
        <div className="mt-5 lg:flex lg:justify-end">
          <button
            type="button"
            onClick={() => hasReply ? onEdit(review) : onReply(review)}
            className="w-full lg:w-auto px-6 py-3 lg:py-2.5 rounded-xl bg-primary-600 text-[15px] lg:text-[14px] font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 transition-all active:scale-[0.99] min-h-[48px] lg:min-h-0"
          >
            {hasReply ? "Edit reply" : "Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bottom Sheet / Side Drawer (Reply / Edit) ──

function BottomSheet({
  review,
  isOpen,
  onClose,
  onSubmit,
  mode,
}: {
  review: Review | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (review: Review, reply: string) => void;
  mode: "reply" | "edit";
}) {
  const [reply, setReply] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (review && isOpen) {
      setReply(mode === "edit" ? (review.provider_reply || "") : "");
      setTimeout(() => textareaRef.current?.focus(), 350);
    }
  }, [review, isOpen, mode]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async () => {
    if (!review || !reply.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 300));
    onSubmit(review, reply);
    setIsSubmitting(false);
    onClose();
  };

  if (!review) return null;

  const isEdit = mode === "edit";
  const title = isEdit ? "Edit your response" : "Reply to review";
  const buttonText = isEdit
    ? (isSubmitting ? "Saving..." : "Save changes")
    : (isSubmitting ? "Publishing..." : "Publish response");

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet - bottom on mobile, side drawer on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className={`fixed z-50 bg-white shadow-2xl flex flex-col will-change-transform transition-transform duration-300 ease-out
          /* Mobile: bottom sheet - use dvh for proper mobile Safari support */
          inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]
          /* Desktop: side drawer */
          lg:inset-y-0 lg:top-16 lg:right-0 lg:left-auto lg:bottom-auto lg:w-[520px] lg:max-w-[calc(100vw-24px)] lg:h-[calc(100dvh-64px)] lg:max-h-none lg:rounded-none lg:pb-0
          ${isOpen
            ? "translate-y-0 lg:translate-x-0"
            : "translate-y-full lg:translate-y-0 lg:translate-x-full"
          }`}
      >
        {/* Drag handle (mobile) */}
        <div className="lg:hidden pt-3 pb-2 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 lg:px-6 py-3 lg:py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <h2 id="sheet-title" className="text-lg font-display font-bold text-gray-900 tracking-tight">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-colors"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-5">
          {/* Review display */}
          <div className="mb-5 pb-5 border-b border-gray-100">
            <div className="flex items-start gap-3 mb-3">
              <Avatar name={review.reviewer_name} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-gray-900">
                    {review.reviewer_name}
                  </span>
                  <StarRating rating={review.rating} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {formatDate(review.created_at)} · {review.relationship}
                </p>
              </div>
            </div>
            {review.title && (
              <p className="text-[15px] font-semibold text-gray-900 mb-2">
                &ldquo;{review.title}&rdquo;
              </p>
            )}
            <p className="text-[15px] text-gray-600 leading-relaxed">
              {review.comment}
            </p>
          </div>

          {/* Reply textarea */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              {isEdit ? "Your response" : "Your reply"}
            </label>
            <textarea
              ref={textareaRef}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your response here..."
              rows={6}
              maxLength={1000}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-[15px] text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-400">
                Your response will be visible on your public profile.
              </p>
              <p className="text-xs text-gray-400">
                {reply.length}/1000
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 px-4 lg:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reply.trim() || isSubmitting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 text-[15px] font-semibold text-white shadow-[0_1px_3px_rgba(6,182,212,0.3),0_1px_2px_rgba(6,182,212,0.2)] hover:from-primary-600 hover:to-primary-700 hover:shadow-[0_3px_8px_rgba(6,182,212,0.35),0_1px_3px_rgba(6,182,212,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99] min-h-[48px]"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isEdit ? "Saving..." : "Publishing..."}
              </span>
            ) : buttonText}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Request Now Content ──

interface ReviewRequestClient {
  id: string;
  name: string;
  email: string;
  phone: string;
}

type DeliveryMethod = "email" | "sms" | "both";

interface RequestNowState {
  clients: ReviewRequestClient[];
  message: string;
  deliveryMethod: DeliveryMethod;
}

interface RequestNowContentProps {
  state: RequestNowState;
  onStateChange: (state: RequestNowState) => void;
}

const DEFAULT_MESSAGE = "Hi, we'd love to hear about your experience with us. Would you take a moment to leave a review? It helps other families find quality care.";

function RequestNowContent({ state, onStateChange }: RequestNowContentProps) {
  const { clients, message, deliveryMethod } = state;

  // Local form state (not persisted across tab switches)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Helper to update parent state
  const setClients = (updater: ReviewRequestClient[] | ((prev: ReviewRequestClient[]) => ReviewRequestClient[])) => {
    const newClients = typeof updater === "function" ? updater(clients) : updater;
    onStateChange({ ...state, clients: newClients });
  };
  const setMessage = (msg: string) => onStateChange({ ...state, message: msg });
  const setDeliveryMethod = (method: DeliveryMethod) => onStateChange({ ...state, deliveryMethod: method });

  const isEditing = editingClientId !== null;
  const canAddClient = name.trim() && (email.trim() || phone.trim());
  const canSend = clients.length > 0 && message.trim();

  // Check which delivery methods are available based on client contact info
  const hasAnyEmail = clients.some((c) => c.email);
  const hasAnyPhone = clients.some((c) => c.phone);

  const handleAddClient = () => {
    if (!canAddClient) {
      setFormError("Please enter a name and at least one contact method.");
      return;
    }
    setFormError(null);

    if (isEditing) {
      // Update existing client
      setClients((prev) =>
        prev.map((c) =>
          c.id === editingClientId
            ? { ...c, name: name.trim(), email: email.trim(), phone: phone.trim() }
            : c
        )
      );
      setEditingClientId(null);
    } else {
      // Add new client
      const newClient: ReviewRequestClient = {
        id: crypto.randomUUID(),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      };
      setClients((prev) => [...prev, newClient]);
    }

    setName("");
    setEmail("");
    setPhone("");
    // Focus back to name input for quick multi-add
    nameInputRef.current?.focus();
  };

  const handleEditClient = (client: ReviewRequestClient) => {
    setEditingClientId(client.id);
    setName(client.name);
    setEmail(client.email);
    setPhone(client.phone);
    setFormError(null);
    nameInputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingClientId(null);
    setName("");
    setEmail("");
    setPhone("");
    setFormError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canAddClient) {
      e.preventDefault();
      handleAddClient();
    }
  };

  const handleRemoveClient = (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setFormError(null);

    try {
      const res = await fetch("/api/review-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients: clients.map((c) => ({
            name: c.name,
            email: c.email || undefined,
            phone: c.phone || undefined,
          })),
          message: message.trim(),
          delivery_method: deliveryMethod,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send review requests");
      }

      setSent(true);
      // Reset form after showing success briefly
      setTimeout(() => {
        onStateChange({ clients: [], message: DEFAULT_MESSAGE, deliveryMethod: "email" });
        setSent(false);
      }, 2000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to send requests");
    } finally {
      setSending(false);
    }
  };

  const getClientContactIcon = (client: ReviewRequestClient) => {
    if (client.email && client.phone) {
      return (
        <span className="text-gray-400" title="Email & SMS">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
        </span>
      );
    }
    if (client.email) {
      return (
        <span className="text-gray-400" title="Email">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </span>
      );
    }
    return (
      <span className="text-gray-400" title="SMS">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      </span>
    );
  };

  // Success state
  if (sent) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
        <div
          className="p-8 lg:p-12 flex flex-col items-center text-center"
          style={{ animation: "card-enter 0.3s ease-out both" }}
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mb-5 ring-4 ring-primary-50">
            <CheckIcon className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900">
            Requests sent!
          </h3>
          <p className="text-[15px] text-gray-500 mt-2.5 max-w-sm leading-relaxed">
            Your review requests have been sent successfully. We&apos;ll notify you when clients respond.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
      <div className="p-5 lg:p-6">
        {/* Recipients Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-gray-900">Recipients</h3>
            {clients.length > 0 && (
              <span className="text-sm text-gray-400">{clients.length} added</span>
            )}
          </div>

          {/* Client chips */}
          {clients.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[15px] group transition-all ${
                    editingClientId === client.id
                      ? "bg-primary-50 border-2 border-primary-500 ring-2 ring-primary-500/20"
                      : "bg-vanilla-50 border border-warm-100 hover:border-gray-300 hover:bg-vanilla-100"
                  }`}
                  style={{ animation: "card-enter 0.2s ease-out both" }}
                >
                  <button
                    type="button"
                    onClick={() => handleEditClient(client)}
                    className="inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 rounded-lg -ml-0.5 -my-0.5 py-0.5 pl-0.5 pr-1"
                    aria-label={`Edit ${client.name}`}
                  >
                    {getClientContactIcon(client)}
                    <span className="font-medium text-gray-700">{client.name}</span>
                    {editingClientId !== client.id && (
                      <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveClient(client.id)}
                    className="text-gray-300 hover:text-red-500 group-hover:text-gray-400 transition-colors p-0.5 -mr-1 rounded hover:bg-red-50"
                    aria-label={`Remove ${client.name}`}
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add client form */}
          <div className="bg-vanilla-50/50 border border-warm-100/60 rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label htmlFor="client-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="client-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Client name"
                  className="w-full px-3.5 py-3 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all min-h-[48px]"
                />
              </div>
              <div>
                <label htmlFor="client-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  id="client-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="email@example.com"
                  className="w-full px-3.5 py-3 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all min-h-[48px]"
                />
              </div>
              <div>
                <label htmlFor="client-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone
                </label>
                <input
                  id="client-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="(555) 123-4567"
                  className="w-full px-3.5 py-3 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all min-h-[48px]"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Enter email or phone (or both) to send the review request.
            </p>
            {formError && (
              <p className="mt-2 text-xs text-red-600">{formError}</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-[15px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 min-h-[48px]"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleAddClient}
                disabled={!canAddClient}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-[15px] font-semibold text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 min-h-[48px]"
              >
                {isEditing ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Update
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add to list
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Message - inside Recipients card */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <label htmlFor="review-message" className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              id="review-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Write a personalized message..."
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none leading-relaxed"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Personalize to increase responses
              </span>
              <span className={`text-xs ${message.length > 450 ? "text-amber-500" : "text-gray-400"}`}>
                {message.length}/500
              </span>
            </div>
          </div>
        </div>

        {/* Delivery Method */}
        <div className="mb-6">
          <label className="block text-[15px] font-semibold text-gray-900 mb-3">
            Send via
          </label>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <label
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all min-h-[44px] focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 ${
                deliveryMethod === "email"
                  ? "border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500/20"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50/50"
              } ${!hasAnyEmail && clients.length > 0 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name="delivery-method"
                value="email"
                checked={deliveryMethod === "email"}
                onChange={() => setDeliveryMethod("email")}
                disabled={!hasAnyEmail && clients.length > 0}
                className="sr-only"
              />
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              <span className="text-[15px] font-medium">Email</span>
            </label>
            <label
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all min-h-[44px] focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 ${
                deliveryMethod === "sms"
                  ? "border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500/20"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50/50"
              } ${!hasAnyPhone && clients.length > 0 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name="delivery-method"
                value="sms"
                checked={deliveryMethod === "sms"}
                onChange={() => setDeliveryMethod("sms")}
                disabled={!hasAnyPhone && clients.length > 0}
                className="sr-only"
              />
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
              <span className="text-[15px] font-medium">SMS</span>
            </label>
            <label
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all min-h-[44px] focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 ${
                deliveryMethod === "both"
                  ? "border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500/20"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50/50"
              } ${(!hasAnyEmail || !hasAnyPhone) && clients.length > 0 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name="delivery-method"
                value="both"
                checked={deliveryMethod === "both"}
                onChange={() => setDeliveryMethod("both")}
                disabled={(!hasAnyEmail || !hasAnyPhone) && clients.length > 0}
                className="sr-only"
              />
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              <span className="text-[15px] font-medium">Both</span>
            </label>
          </div>
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || sending}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 active:scale-[0.99] text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[52px] shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          {sending ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Sending...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              <span>
                {clients.length > 0
                  ? `Send to ${clients.length} client${clients.length > 1 ? "s" : ""}`
                  : "Add clients to send"}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Request On-site Content ──

function RequestOnsiteContent({ providerSlug }: { providerSlug: string | null }) {
  const [copied, setCopied] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);

  // Use current site origin for dynamic deployment support (preview URLs, staging, production)
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "https://olera.care";
  const reviewUrl = providerSlug
    ? `${siteOrigin}/review/${providerSlug}?ref=qr`
    : `${siteOrigin}/review/your-profile`;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(reviewUrl)}&bgcolor=ffffff&color=1a1a1a&format=svg`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = reviewUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQR = () => {
    const link = document.createElement("a");
    link.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(reviewUrl)}&bgcolor=ffffff&color=1a1a1a&format=png`;
    link.download = `review-qr-${providerSlug || "olera"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Review QR Code</title>
            <style>
              body {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                font-family: system-ui, -apple-system, sans-serif;
              }
              .container {
                text-align: center;
                padding: 40px;
              }
              h1 {
                font-size: 24px;
                color: #1a1a1a;
                margin-bottom: 8px;
              }
              p {
                font-size: 14px;
                color: #666;
                margin-bottom: 32px;
              }
              img {
                width: 200px;
                height: 200px;
              }
              .url {
                margin-top: 24px;
                font-size: 12px;
                color: #999;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Leave us a review</h1>
              <p>Scan this QR code with your phone</p>
              <img src="${qrCodeUrl}" alt="QR Code" />
              <p class="url">${reviewUrl}</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
      <div className="p-5 lg:p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-50 to-primary-100/50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-gray-900">Your review link</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Share this link or QR code to collect reviews
            </p>
          </div>
        </div>

        {/* Link display */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 min-w-0 px-4 py-3.5 bg-vanilla-50 border border-warm-100 rounded-xl min-h-[48px] flex items-center overflow-hidden">
              <p className="text-[15px] font-mono text-gray-700 truncate">
                {reviewUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-[15px] transition-all min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 shrink-0 ${
                copied
                  ? "bg-primary-50 text-primary-700 border border-primary-200"
                  : "bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white shadow-sm"
              }`}
            >
              {copied ? (
                <>
                  <CheckIcon className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                  <span>Copy link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Divider with text */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
              or scan
            </span>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center">
          <div className="relative w-[180px] h-[180px] lg:w-[200px] lg:h-[200px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-center">
            {!qrLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-vanilla-50 rounded-2xl">
                <svg className="w-8 h-8 text-gray-300 animate-pulse" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                </svg>
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCodeUrl}
              alt="QR Code for review link"
              className={`w-full h-full transition-opacity duration-300 ${qrLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setQrLoaded(true)}
            />
          </div>

          {/* QR Actions */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={handleDownloadQR}
              className="inline-flex items-center gap-2 px-5 py-3 text-[15px] font-medium text-gray-700 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 active:bg-gray-150 border border-gray-200 rounded-xl transition-all min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-5 py-3 text-[15px] font-medium text-gray-700 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 active:bg-gray-150 border border-gray-200 rounded-xl transition-all min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
              </svg>
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Education Sidebar (for all tabs) ──

const YOUTUBE_VIDEO_ID = "kbKOG8vmJl0";

function EducationSidebar({ activeTab }: { activeTab: TabFilter }) {
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(true);

  // Tips based on active tab
  const tipsMap: Record<TabFilter, { icon: string; text: string }[]> = {
    request_now: [
      { icon: "⏱", text: "Request within 48 hours of service" },
      { icon: "✍️", text: "Personalize with their name" },
      { icon: "🔄", text: "Follow up once if no response" },
    ],
    request_onsite: [
      { icon: "🏠", text: "Best during or right after visits" },
      { icon: "🖨", text: "Print QR code for your office" },
      { icon: "📱", text: "Staff can share the link via text" },
    ],
    all: [
      { icon: "💬", text: "Respond to reviews promptly" },
      { icon: "🙏", text: "Thank reviewers for feedback" },
      { icon: "⭐", text: "Address concerns professionally" },
    ],
    replied: [
      { icon: "✅", text: "Keep responses helpful and warm" },
      { icon: "📝", text: "Update replies if needed" },
      { icon: "🔄", text: "Follow up on resolved issues" },
    ],
  };

  const tips = tipsMap[activeTab];

  return (
    <div className="hidden lg:block">
      <div className="sticky top-24 space-y-4">
      {/* Video Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="relative aspect-video bg-gray-900">
          {videoPlaying ? (
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0`}
              title="How to collect reviews"
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setVideoPlaying(true)}
              className="absolute inset-0 w-full h-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset"
            >
              {/* Thumbnail */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/maxresdefault.jpg`}
                alt="Video thumbnail"
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Play button overlay */}
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/95 shadow-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                  <svg className="w-7 h-7 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </button>
          )}
        </div>
        <div className="p-5">
          <p className="text-sm font-semibold text-gray-900">
            {activeTab === "request_now"
              ? "How to request reviews"
              : activeTab === "request_onsite"
              ? "Collecting reviews on-site"
              : "Managing your reviews"}
          </p>
          <p className="text-xs text-gray-400 mt-1">2:30 min</p>
        </div>
      </div>

      {/* Tips Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setTipsOpen(!tipsOpen)}
          className="w-full flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tips</span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${tipsOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {tipsOpen && (
          <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-base flex-shrink-0 w-5 text-center">{tip.icon}</span>
                <p className="text-[13px] text-gray-600">{tip.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Mobile Tips Accordion (for Request tabs) ──

function MobileTipsAccordion({ activeTab }: { activeTab: TabFilter }) {
  const [isOpen, setIsOpen] = useState(false);

  const tips = activeTab === "request_now"
    ? [
        { icon: "⏱", text: "Request within 48 hours of service" },
        { icon: "✍️", text: "Personalize with their name" },
        { icon: "🔄", text: "Follow up once if no response" },
      ]
    : [
        { icon: "🏠", text: "Best during or right after visits" },
        { icon: "🖨", text: "Print QR code for your office" },
        { icon: "📱", text: "Staff can share the link via text" },
      ];

  return (
    <div className="lg:hidden mt-4 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 active:bg-gray-50"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">Tips</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {tips.map((tip, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-base flex-shrink-0 w-5 text-center">{tip.icon}</span>
              <p className="text-[13px] text-gray-600">{tip.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty States ──

function EmptyState({ filter }: { filter: TabFilter }) {
  if (filter === "replied") {
    return (
      <div className="flex flex-col items-center text-center py-16 lg:py-24 px-6">
        {/* Illustration */}
        <div
          className="w-40 h-40 lg:w-48 lg:h-48 mb-6 relative"
          style={{ animation: "emptyFloat 3s ease-in-out infinite" }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-2xl bg-gradient-to-br from-primary-50 to-vanilla-100 border border-primary-100/50 flex items-center justify-center transform rotate-3 shadow-sm">
              <svg className="w-14 h-14 lg:w-16 lg:h-16 text-primary-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
            </div>
          </div>
          {/* Decorative elements */}
          <div className="absolute top-4 right-6 w-3 h-3 rounded-full bg-amber-200" />
          <div className="absolute bottom-6 left-6 w-2 h-2 rounded-full bg-primary-200" />
          <div className="absolute top-10 left-4 w-4 h-1 rounded-full bg-warm-200 transform rotate-45" />
          <div className="absolute bottom-12 right-4 w-2 h-2 rounded-full bg-warm-300" />
        </div>
        <h3 className="text-xl lg:text-2xl font-display font-bold text-gray-900 tracking-tight">
          No replies yet
        </h3>
        <p className="text-[15px] text-gray-500 mt-2.5 leading-relaxed max-w-sm">
          Respond to reviews to show families you value their feedback. Your replies will appear here.
        </p>
      </div>
    );
  }

  // All empty state - "No reviews yet"
  return (
    <div className="flex flex-col items-center text-center py-16 lg:py-24 px-6">
      <div
        className="w-40 h-40 lg:w-48 lg:h-48 mb-6 relative"
        style={{ animation: "emptyFloat 3s ease-in-out infinite" }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-2xl bg-gradient-to-br from-primary-50 to-vanilla-100 border border-primary-100/50 flex items-center justify-center transform -rotate-3 shadow-sm">
            <StarIcon className="w-14 h-14 lg:w-16 lg:h-16 text-primary-300" filled={false} />
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-4 right-6 w-3 h-3 rounded-full bg-amber-200" />
        <div className="absolute bottom-6 left-6 w-2 h-2 rounded-full bg-primary-200" />
        <div className="absolute top-10 left-4 w-4 h-1 rounded-full bg-warm-200 transform rotate-45" />
        <div className="absolute bottom-12 right-4 w-2 h-2 rounded-full bg-warm-300" />
      </div>
      <h3 className="text-xl lg:text-2xl font-display font-bold text-gray-900 tracking-tight">
        No reviews yet
      </h3>
      <p className="text-[15px] text-gray-500 mt-2.5 leading-relaxed max-w-sm">
        When families leave reviews on your profile, they&apos;ll appear here for you to respond.
      </p>
    </div>
  );
}

// ── Mobile Stats Banner (visible only on mobile) ──

function MobileStatsBanner({
  stats,
  onTap,
}: {
  stats: ReviewStats;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="lg:hidden w-full mb-5 bg-white rounded-xl border border-gray-200 px-4 py-3 text-left active:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Score ring */}
        <div className="relative w-10 h-10 shrink-0">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="#f3f4f6" strokeWidth="3" />
            <circle
              cx="20" cy="20" r="16" fill="none"
              stroke="#199087"
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(stats.avgRating / 5) * 100.5} 100.5`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
            {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "-"}
          </span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Olera Score</p>
          <p className="text-xs text-gray-500">
            {stats.totalReviews} review{stats.totalReviews !== 1 ? "s" : ""} · {stats.repliedCount} replied
          </p>
        </div>

        {/* Chevron */}
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// ── Mobile Stats Bottom Sheet ──

function MobileStatsSheet({
  isOpen,
  onClose,
  stats,
}: {
  isOpen: boolean;
  onClose: () => void;
  stats: ReviewStats;
}) {
  const categoryLabels: Record<string, string> = {
    care_quality: "Care Quality",
    communication: "Communication",
    value: "Value",
    cleanliness: "Cleanliness",
  };

  // Score label based on rating
  const getScoreLabel = (rating: number): { label: string; color: string } => {
    if (rating >= 4.5) return { label: "Excellent", color: "text-primary-700" };
    if (rating >= 4.0) return { label: "Great", color: "text-primary-600" };
    if (rating >= 3.5) return { label: "Good", color: "text-amber-600" };
    if (rating >= 3.0) return { label: "Fair", color: "text-amber-500" };
    return { label: "Building", color: "text-gray-500" };
  };

  const scoreInfo = getScoreLabel(stats.avgRating);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        onClick={onClose}
        style={{ animation: "fade-in 0.2s ease-out both" }}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-white rounded-t-3xl shadow-xl max-h-[85dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        style={{ animation: "slide-up 0.3s ease-out both" }}
      >
        {/* Handle */}
        <div className="sticky top-0 bg-white pt-3 pb-2 px-6 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-display font-bold text-gray-900">
              Olera Score
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Score display */}
          {stats.totalReviews > 0 ? (
            <>
              {/* Score label badge */}
              <div className="flex justify-center mb-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100/60">
                  <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                  </svg>
                  <span className={`text-xs font-bold ${scoreInfo.color}`}>{scoreInfo.label}</span>
                </div>
              </div>

              <div className="flex flex-col items-center mb-6">
                <div className="relative w-28 h-28 mb-3">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="#199087"
                      strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(stats.avgRating / 5) * 264} 264`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">{stats.avgRating.toFixed(1)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <StarRating rating={Math.round(stats.avgRating)} size="md" />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {stats.totalReviews} review{stats.totalReviews !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Category breakdown */}
              <div className="space-y-4">
                {Object.entries(stats.categoryStats).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-28 shrink-0">
                      {categoryLabels[key] || key}
                    </span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full transition-all duration-500"
                        style={{ width: `${(value / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-8 text-right">
                      {value.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <StarIcon className="w-8 h-8 text-gray-300" filled={false} />
              </div>
              <p className="text-gray-500 font-medium">No ratings yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Reviews will appear here when families rate your services.
              </p>
            </div>
          )}
        </div>

        {/* Safe area padding for iPhone */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// ── Loading Skeleton ──

function ReviewsSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="animate-pulse">
          <div className="mb-5 lg:mb-8">
            <div className="h-8 w-32 bg-warm-100 rounded-lg mb-2" />
            <div className="h-4 w-72 bg-warm-50 rounded" />
          </div>
          {/* Mobile stats skeleton */}
          <div className="lg:hidden h-16 w-full bg-white rounded-xl border border-warm-100/60 mb-5" />
          <div className="h-12 w-48 bg-vanilla-50 border border-warm-100/60 rounded-xl mb-5 lg:mb-6" />
          <div className="lg:grid lg:grid-cols-[1fr,340px] lg:gap-8 lg:items-start">
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-warm-100/60 p-5 lg:p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-warm-100 shrink-0" />
                    <div className="flex-1">
                      <div className="h-5 w-32 bg-warm-100 rounded mb-2" />
                      <div className="h-3 w-48 bg-warm-50 rounded" />
                    </div>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((j) => (
                        <div key={j} className="w-4 h-4 rounded bg-warm-100" />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="h-4 w-full bg-warm-50 rounded" />
                    <div className="h-4 w-3/4 bg-warm-50 rounded" />
                  </div>
                  <div className="h-12 bg-warm-100/60 rounded-xl" />
                </div>
              ))}
            </div>
            {/* Desktop sidebar skeleton */}
            <div className="hidden lg:block">
              <div className="bg-white rounded-2xl border border-warm-100/60 p-6">
                <div className="h-4 w-24 bg-warm-100 rounded mb-6" />
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-warm-50" />
                </div>
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-3 bg-warm-50 rounded" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function ProviderReviewsPage() {
  const providerProfile = useProviderProfile();
  const [activeFilter, setActiveFilter] = useState<TabFilter>("request_now");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats>({
    totalReviews: 0,
    repliedCount: 0,
    avgRating: 0,
    categoryStats: { care_quality: 0, communication: 0, value: 0, cleanliness: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Sheet state
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"reply" | "edit">("reply");

  // Mobile stats sheet
  const [showStatsSheet, setShowStatsSheet] = useState(false);

  // Request Now state (persisted across tab switches)
  const [requestNowState, setRequestNowState] = useState<RequestNowState>({
    clients: [],
    message: DEFAULT_MESSAGE,
    deliveryMethod: "email",
  });

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch reviews from API
  useEffect(() => {
    if (!providerProfile?.slug) {
      // No provider profile yet - show empty state
      setReviews([]);
      setStats({ totalReviews: 0, repliedCount: 0, avgRating: 0, categoryStats: { care_quality: 0, communication: 0, value: 0, cleanliness: 0 } });
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/provider/reviews");
        if (!res.ok) {
          throw new Error("Failed to fetch reviews");
        }
        const data = await res.json();
        const fetchedReviews = data.reviews || [];

        setReviews(fetchedReviews);
        setStats(data.stats || calculateStats(fetchedReviews));

        // Mark all reviews as read to clear the badge
        if (fetchedReviews.length > 0 && providerProfile?.id) {
          const reviewIds = fetchedReviews.map((r: Review) => r.id);
          markAllReviewsAsRead(reviewIds, providerProfile.id);
        }
      } catch (err) {
        console.error("Failed to fetch reviews:", err);
        // Show empty state on error
        setReviews([]);
        setStats({ totalReviews: 0, repliedCount: 0, avgRating: 0, categoryStats: { care_quality: 0, communication: 0, value: 0, cleanliness: 0 } });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [providerProfile?.slug]);

  const filteredReviews = useMemo(() => {
    if (activeFilter === "request_now" || activeFilter === "request_onsite") {
      return []; // Empty states for now
    }
    if (activeFilter === "replied") {
      return reviews.filter((r) => r.provider_reply);
    }
    return reviews;
  }, [activeFilter, reviews]);

  const counts = useMemo(() => ({
    request_now: 0,
    request_onsite: 0,
    all: reviews.length,
    replied: reviews.filter((r) => r.provider_reply).length,
  }), [reviews]);

  // Handle reply
  const handleReply = useCallback((review: Review) => {
    setSelectedReview(review);
    setSheetMode("reply");
    setIsSheetOpen(true);
  }, []);

  // Handle edit
  const handleEdit = useCallback((review: Review) => {
    setSelectedReview(review);
    setSheetMode("edit");
    setIsSheetOpen(true);
  }, []);

  // Handle sheet submit
  const handleSheetSubmit = useCallback(async (review: Review, reply: string) => {
    try {
      const res = await fetch("/api/provider/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.id, reply }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to save reply:", errorData);
        alert(errorData.error || "Failed to save reply. Please try again.");
        return;
      }

      const data = await res.json();

      // Update the review in local state
      setReviews((prev) =>
        prev.map((r) =>
          r.id === review.id ? { ...r, ...data.review } : r
        )
      );

      // Update stats
      setStats((prev) => ({
        ...prev,
        repliedCount: prev.repliedCount + (review.provider_reply ? 0 : 1),
      }));
    } catch (err) {
      console.error("Failed to save reply:", err);
      alert("Failed to save reply. Please try again.");
    }
  }, []);

  const handleCloseSheet = useCallback(() => {
    setIsSheetOpen(false);
    setTimeout(() => setSelectedReview(null), 300);
  }, []);

  if (isLoading) {
    return <ReviewsSkeleton />;
  }

  const TABS: { id: TabFilter; label: string }[] = [
    { id: "request_now", label: "Request Now" },
    { id: "request_onsite", label: "Request On-site" },
    { id: "all", label: "All Reviews" },
    { id: "replied", label: "Replied" },
  ];

  return (
    <>
    <style jsx global>{`
      @keyframes card-enter {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes emptyFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }
    `}</style>
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* ── Page header ── */}
        <div className="mb-5 lg:mb-8">
          <h1 className="text-2xl lg:text-[28px] font-display font-bold text-gray-900 tracking-tight">
            Reviews
          </h1>
          <p className="text-sm lg:text-[15px] text-gray-500 mt-1 lg:mt-1.5 leading-relaxed">
            See what families are saying and respond to feedback.
          </p>
        </div>

        {/* ── Mobile Stats Banner ── */}
        <MobileStatsBanner stats={stats} onTap={() => setShowStatsSheet(true)} />

        {/* ── Mobile Stats Sheet ── */}
        <MobileStatsSheet
          isOpen={showStatsSheet}
          onClose={() => setShowStatsSheet(false)}
          stats={stats}
        />

        {/* ── Tabs (outside grid, full width) ── */}
        <div className="mb-4 lg:mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide">
          <div className="flex gap-0.5 bg-vanilla-50 border border-warm-100/60 p-0.5 rounded-xl w-max min-w-full sm:min-w-0 sm:w-max">
            {TABS.map((tab) => {
              const showCount = tab.id === "all" || tab.id === "replied";
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={[
                    "px-3 sm:px-3.5 lg:px-5 py-2 lg:py-2.5 rounded-[10px] text-[13px] lg:text-sm font-semibold whitespace-nowrap transition-all duration-150 min-h-[40px] lg:min-h-[44px] flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-none justify-center sm:justify-start",
                    activeFilter === tab.id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  ].join(" ")}
                >
                  {tab.label}
                  {showCount && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                      activeFilter === tab.id
                        ? "bg-gray-100 text-gray-600"
                        : "bg-warm-100/60 text-gray-400"
                    }`}>
                      {counts[tab.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Two column layout on desktop (cards + sidebar aligned) ── */}
        <div className="lg:grid lg:grid-cols-[1fr,340px] lg:gap-8 lg:items-start">
          {/* Left column - review cards or request forms */}
          <div>
            {activeFilter === "request_now" ? (
              <>
                <RequestNowContent state={requestNowState} onStateChange={setRequestNowState} />
                <MobileTipsAccordion activeTab={activeFilter} />
              </>
            ) : activeFilter === "request_onsite" ? (
              <>
                <RequestOnsiteContent providerSlug={providerProfile?.slug ?? null} />
                <MobileTipsAccordion activeTab={activeFilter} />
              </>
            ) : filteredReviews.length > 0 ? (
              <div className="space-y-4">
                {filteredReviews.map((review, idx) => (
                  <div
                    key={review.id}
                    style={{
                      animation: "card-enter 0.25s ease-out both",
                      animationDelay: `${idx * 60}ms`,
                    }}
                  >
                    <ReviewCard
                      review={review}
                      onReply={handleReply}
                      onEdit={handleEdit}
                      isMobile={isMobile}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm lg:min-h-[420px] flex items-center justify-center">
                <EmptyState filter={activeFilter} />
              </div>
            )}
          </div>

          {/* Right column - education sidebar (desktop only) */}
          <div
            style={{
              animation: "card-enter 0.25s ease-out both",
              animationDelay: "200ms",
            }}
          >
            <EducationSidebar activeTab={activeFilter} />
          </div>
        </div>
      </div>

      {/* ── Bottom Sheet / Side Drawer ── */}
      <BottomSheet
        review={selectedReview}
        isOpen={isSheetOpen}
        onClose={handleCloseSheet}
        onSubmit={handleSheetSubmit}
        mode={sheetMode}
      />
    </div>
    </>
  );
}

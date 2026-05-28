"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProviderVerification } from "@/lib/hooks/useProviderVerification";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import Pagination from "@/components/ui/Pagination";

// ── Types ──

type TabFilter = "pending" | "published";
type AnswerStatus = "pending" | "published";

interface Question {
  id: string;
  question: string;
  asker_name: string;
  created_at: string;
  status: "pending" | "answered";
  answer?: string;
  answered_at?: string;
  is_public?: boolean;
  answer_status?: AnswerStatus;
  metadata?: Record<string, unknown>;
  isNew?: boolean;
}

import { markQuestionAsRead, migrateQnaReadData } from "@/hooks/useUnreadQnACount";

// ── Constants ──

const PAGE_SIZE = 10;

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
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

// Avatar gradient (deterministic by name) - matches connections page
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

function CloseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
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

// ── Pending Question Card ──

function PendingQuestionCard({
  question,
  onReply,
  isMobile,
  isNew,
  onMarkAsRead,
}: {
  question: Question;
  onReply: (question: Question, answer?: string) => Promise<boolean>;
  isMobile: boolean;
  isNew?: boolean;
  onMarkAsRead?: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasBeenViewed, setHasBeenViewed] = useState(false);

  // Mark as read when card is clicked/interacted with
  const handleInteraction = useCallback(() => {
    if (isNew && !hasBeenViewed && onMarkAsRead) {
      setHasBeenViewed(true);
      onMarkAsRead();
    }
  }, [isNew, hasBeenViewed, onMarkAsRead]);

  // Mobile: tap to open reply sheet
  if (isMobile) {
    return (
      <button
        type="button"
        onClick={() => {
          handleInteraction();
          onReply(question);
        }}
        className="w-full text-left bg-white rounded-2xl border border-gray-200/80 overflow-hidden active:bg-vanilla-50/60 transition-colors relative"
      >
        {/* New indicator dot */}
        {isNew && !hasBeenViewed && (
          <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-primary-500 ring-2 ring-white shadow-sm" />
        )}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <Avatar name={question.asker_name} size="lg" />
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2">
                {question.question}
              </p>
              <p className="text-sm text-gray-500 mt-1.5">
                {question.asker_name} · {timeAgo(question.created_at)}
              </p>
            </div>
          </div>

          {/* Textarea placeholder */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3.5">
            <p className="text-[15px] text-gray-400">Type your answer here...</p>
          </div>

          {/* Publish button */}
          <div className="mt-3">
            <div className="w-full py-3.5 rounded-xl bg-primary-600 text-center">
              <span className="text-[15px] font-semibold text-white">Publish response</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  // Desktop: inline answer form
  const handleSubmit = async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const success = await onReply(question, answer);
      if (success) {
        setAnswer("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden hover:border-gray-300/80 transition-colors relative"
      onClick={handleInteraction}
    >
      {/* New indicator dot */}
      {isNew && !hasBeenViewed && (
        <div className="absolute top-6 right-6 w-2.5 h-2.5 rounded-full bg-primary-500 ring-2 ring-white shadow-sm" />
      )}
      <div className="p-6">
        <div className="flex items-start gap-4">
          <Avatar name={question.asker_name} size="lg" />
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-lg font-semibold text-gray-900 leading-snug">
              {question.question}
            </p>
            <p className="text-sm text-gray-500 mt-1.5">
              {question.asker_name} · {timeAgo(question.created_at)}
            </p>
          </div>
        </div>

        {/* Answer textarea */}
        <div className="mt-5">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onFocus={handleInteraction}
            placeholder="Type your answer here..."
            rows={4}
            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-[15px] text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all"
          />
        </div>

        {/* Publish button */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full lg:w-auto px-6 py-3.5 lg:py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-[15px] lg:text-[14px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.99] min-h-[48px] lg:min-h-0"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Publishing...
              </span>
            ) : "Publish response"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Published Question Card ──

function PublishedQuestionCard({
  question,
  onEdit,
  isMobile,
  onVerifyClick,
}: {
  question: Question;
  onEdit: (question: Question) => void;
  isMobile: boolean;
  onVerifyClick?: () => void;
}) {
  const isPendingVerification = question.answer_status === "pending";

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-colors ${
      isPendingVerification
        ? "border-amber-200 hover:border-amber-300"
        : "border-gray-200/80 hover:border-gray-300/80"
    }`}>
      <div className={isMobile ? "p-4" : "p-6"}>
        {/* Asker info + badge */}
        <div className="flex items-start gap-3">
          <Avatar name={question.asker_name} size={isMobile ? "md" : "lg"} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold text-gray-900 ${isMobile ? "text-[15px]" : "text-base"}`}>
                {question.asker_name}
              </span>
              {isPendingVerification ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/50">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Pending verification
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100/50">
                  Published
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              {formatDate(question.created_at)}
            </p>
          </div>
        </div>

        {/* Question */}
        <p className={`text-gray-900 leading-relaxed mt-4 ${isMobile ? "text-[15px]" : "text-lg font-medium"}`}>
          {question.question}
        </p>

        {/* Provider response */}
        {question.answer && (
          <div className="mt-5">
            <div className="flex items-start gap-3">
              <Avatar name="Provider" size={isMobile ? "md" : "lg"} isProvider />
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-gray-900 ${isMobile ? "text-[15px]" : "text-base"}`}>
                  Your response
                </p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {question.answered_at ? formatDate(question.answered_at) : ""}
                </p>
              </div>
            </div>
            <p className={`text-gray-600 leading-relaxed mt-3 ${isMobile ? "text-[15px]" : "text-base"}`}>
              {question.answer}
            </p>
          </div>
        )}

        {/* Edit button or Verify prompt */}
        <div className="mt-5">
          {isPendingVerification && onVerifyClick ? (
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <p className="text-[13px] text-amber-700">
                Your answer is saved but not visible yet. Verify to publish.
              </p>
              <button
                type="button"
                onClick={onVerifyClick}
                className="w-full lg:w-auto px-6 py-3 lg:py-2.5 rounded-xl bg-primary-600 text-[15px] lg:text-[14px] font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all active:scale-[0.99] min-h-[48px] lg:min-h-0"
              >
                Verify to publish
              </button>
            </div>
          ) : (
            <div className="lg:flex lg:justify-end">
              <button
                type="button"
                onClick={() => onEdit(question)}
                className="w-full lg:w-auto px-6 py-3 lg:py-2.5 rounded-xl border border-gray-200 text-[15px] lg:text-[14px] font-semibold text-primary-600 hover:bg-primary-50/50 hover:border-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-all active:scale-[0.99] min-h-[48px] lg:min-h-0"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bottom Sheet / Side Drawer (Reply / Edit) ──

function BottomSheet({
  question,
  isOpen,
  onClose,
  onSubmit,
  mode,
}: {
  question: Question | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (question: Question, answer: string) => void;
  mode: "reply" | "edit";
}) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (question && isOpen) {
      setAnswer(mode === "edit" ? (question.answer || "") : "");
      setTimeout(() => textareaRef.current?.focus(), 350);
    }
  }, [question, isOpen, mode]);

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
    if (!question || !answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    onSubmit(question, answer);
    setIsSubmitting(false);
    onClose();
  };

  if (!question) return null;

  const isEdit = mode === "edit";
  const title = isEdit ? "Edit your response" : "Reply to question";
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
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-colors"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-5">
          {/* Question display */}
          <div className="flex items-start gap-3 mb-5 pb-5 border-b border-gray-100">
            <Avatar name={question.asker_name} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-gray-900 leading-snug">
                {question.question}
              </p>
              <p className="text-sm text-gray-500 mt-1.5">
                {question.asker_name} · {timeAgo(question.created_at)}
              </p>
            </div>
          </div>

          {/* Answer textarea */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              {isEdit ? "Your response" : "Your answer"}
            </label>
            <textarea
              ref={textareaRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              rows={8}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-[15px] text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all"
            />
            <p className="text-xs text-gray-400 mt-2">
              Your response will be visible on your public profile.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 px-4 lg:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full py-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-[15px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.99] min-h-[48px]"
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

// ── Empty States ──

function EmptyState({ filter, hasAnyPublished }: { filter: TabFilter; hasAnyPublished: boolean }) {
  // For pending tab: distinguish between "no questions at all" vs "all caught up"
  if (filter === "pending") {
    if (hasAnyPublished) {
      // All questions have been answered
      return (
        <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
          <Image
            src="/question.png"
            alt="All caught up"
            width={180}
            height={180}
            className="mb-6"
          />
          <h3 className="text-[17px] font-display font-bold text-gray-900 mb-2">All caught up!</h3>
          <p className="text-[15px] text-gray-500 max-w-sm leading-relaxed">
            You&apos;ve answered all questions. New questions will appear here when families ask.
          </p>
        </div>
      );
    }
    // No questions at all
    return (
      <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
        <Image
          src="/question.png"
          alt="No questions yet"
          width={180}
          height={180}
          className="mb-6"
        />
        <h3 className="text-[17px] font-display font-bold text-gray-900 mb-2">No questions yet</h3>
        <p className="text-[15px] text-gray-500 max-w-sm leading-relaxed">
          When families ask questions about your services, they&apos;ll appear here.
        </p>
      </div>
    );
  }

  // Published tab empty state
  return (
    <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
      <Image
        src="/publish.png"
        alt="No published answers"
        width={180}
        height={180}
        className="mb-6"
      />
      <h3 className="text-[17px] font-display font-bold text-gray-900 mb-2">No published answers</h3>
      <p className="text-[15px] text-gray-500 max-w-sm leading-relaxed">
        Answer pending questions to share your expertise on your profile.
      </p>
    </div>
  );
}

// ── Loading Skeleton ──


// ── Loading Skeleton ──

function QnASkeleton() {
  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-8 w-56 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-72 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200/80 p-5 lg:p-6 animate-pulse">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1">
                  <div className="h-5 w-full max-w-md bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-24 bg-gray-100 rounded-xl mb-4" />
              <div className="h-12 bg-gray-200 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function ProviderQnAPage() {
  const router = useRouter();
  const { refreshAccountData } = useAuth();
  const providerProfile = useProviderProfile();
  const [activeFilter, setActiveFilter] = useState<TabFilter>("pending");
  const [currentPage, setCurrentPage] = useState(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Sheet state
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"reply" | "edit">("reply");

  // Verification state
  const { isVerified } = useProviderVerification();
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModalRaw,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: profileId || "",
    onVerified: async () => {
      // Refresh profile state to update isVerified, then refetch questions
      await refreshAccountData();
      fetchQuestions();
    },
  });

  // Guard: only allow opening modal if profileId is loaded
  const openVerificationModal = useCallback(() => {
    if (!profileId) return;
    openVerificationModalRaw();
  }, [profileId, openVerificationModalRaw]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch questions from API
  const fetchQuestions = useCallback(async () => {
    if (!providerProfile?.slug) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/provider/questions");
      if (!res.ok) {
        throw new Error("Failed to fetch questions");
      }
      const data = await res.json();
      const fetchedProfileId = data.profileId as string | undefined;
      if (fetchedProfileId) {
        setProfileId(fetchedProfileId);
        // Migrate localStorage data from slug-based to profileId-based key
        migrateQnaReadData(providerProfile.slug, fetchedProfileId);
      }

      // Determine isNew for each question based on database read_by with localStorage fallback
      const questionsWithReadState = (data.questions || []).map((q: Question) => {
        // Only pending questions can be "new"
        if (q.status !== "pending") {
          return { ...q, isNew: false };
        }

        // Check database read_by first
        const meta = q.metadata || {};
        const readBy = (meta.read_by as Record<string, string>) || {};
        const isReadInDb = fetchedProfileId ? !!readBy[fetchedProfileId] : false;

        if (isReadInDb) {
          return { ...q, isNew: false };
        }

        // Fallback to localStorage
        try {
          const readKey = fetchedProfileId ? `olera_qna_read_${fetchedProfileId}` : `olera_qna_read_${providerProfile.slug}`;
          const stored = localStorage.getItem(readKey);
          const readIds: string[] = stored ? JSON.parse(stored) : [];
          return { ...q, isNew: !readIds.includes(q.id) };
        } catch {
          return { ...q, isNew: true };
        }
      });

      setQuestions(questionsWithReadState);

      // Count unread questions and sync navbar badge
      const unreadCount = questionsWithReadState.filter((q: Question) => q.isNew).length;
      window.dispatchEvent(new CustomEvent("olera:qna-sync", {
        detail: { count: unreadCount, providerSlug: providerProfile?.slug }
      }));
    } catch (err) {
      console.error("Failed to fetch questions:", err);
      setError("Unable to load questions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [providerProfile?.slug]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const filteredQuestions = useMemo(() => {
    // Map "published" tab to "answered" status
    const statusToMatch = activeFilter === "published" ? "answered" : "pending";
    return questions.filter((q) => q.status === statusToMatch);
  }, [activeFilter, questions]);

  // Pagination
  const totalPages = Math.ceil(filteredQuestions.length / PAGE_SIZE) || 1;
  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredQuestions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredQuestions, currentPage]);

  // Reset page when filter changes or if current page exceeds total pages
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  // Ensure currentPage doesn't exceed totalPages (e.g., after answering questions)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const counts = useMemo(() => ({
    pending: questions.filter((q) => q.status === "pending").length,
    published: questions.filter((q) => q.status === "answered").length,
  }), [questions]);

  // Handle marking a question as read
  const handleMarkAsRead = useCallback((questionId: string) => {
    if (!profileId) return;

    // Update local state
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, isNew: false } : q))
    );

    // Persist to database
    markQuestionAsRead(questionId, profileId);

    // Sync navbar badge (decrement count)
    const currentUnreadCount = questions.filter((q) => q.isNew && q.id !== questionId).length;
    window.dispatchEvent(new CustomEvent("olera:qna-sync", {
      detail: { count: currentUnreadCount, providerSlug: providerProfile?.slug }
    }));
  }, [profileId, questions, providerProfile?.slug]);

  // Handle reply (from card or sheet)
  const handleReply = useCallback(async (question: Question, answer?: string): Promise<boolean> => {
    if (isMobile || !answer) {
      // Mobile or no answer provided - open sheet
      setSelectedQuestion(question);
      setSheetMode("reply");
      setIsSheetOpen(true);
      return false; // Sheet will handle submission
    } else {
      // Desktop inline submit - call API
      try {
        const res = await fetch("/api/provider/questions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: question.id, answer }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error("Failed to publish answer:", errorData);
          alert(errorData.error || "Failed to publish answer. Please try again.");
          return false;
        }

        const data = await res.json();

        // Update the question in local state
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === question.id ? { ...q, ...data.question } : q
          )
        );

        // Auto-switch to Published tab after successful answer
        setActiveFilter("published");
        return true;
      } catch (err) {
        console.error("Failed to publish answer:", err);
        alert("Failed to publish answer. Please try again.");
        return false;
      }
    }
  }, [isMobile]);

  // Handle edit
  const handleEdit = useCallback((question: Question) => {
    setSelectedQuestion(question);
    setSheetMode("edit");
    setIsSheetOpen(true);
  }, []);

  // Handle sheet submit
  const handleSheetSubmit = useCallback(async (question: Question, answer: string) => {
    try {
      const res = await fetch("/api/provider/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: question.id, answer }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to publish answer:", errorData);
        alert(errorData.error || "Failed to publish answer. Please try again.");
        return;
      }

      const data = await res.json();

      // Update the question in local state
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === question.id ? { ...q, ...data.question } : q
        )
      );

      // Auto-switch to Published tab after successful answer
      setActiveFilter("published");
    } catch (err) {
      console.error("Failed to publish answer:", err);
      alert("Failed to publish answer. Please try again.");
    }
  }, []);

  const handleCloseSheet = useCallback(() => {
    setIsSheetOpen(false);
    setTimeout(() => setSelectedQuestion(null), 300);
  }, []);

  if (isLoading) {
    return <QnASkeleton />;
  }

  const TABS: { id: TabFilter; label: string }[] = [
    { id: "pending", label: "Pending" },
    { id: "published", label: "Published" },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header - sticky below navbar (h-16 = 64px) */}
      <div className="bg-white border-b border-gray-100 sticky top-16 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6 sm:py-8">
            {/* Back button - navigates to previous page */}
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>

            <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
              Questions & Answers
            </h1>
            <p className="text-[15px] text-gray-500 mt-1">
              Answer questions from families and showcase your expertise
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`relative pb-3 text-[15px] font-medium transition-colors ${
                  activeFilter === tab.id
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {counts[tab.id] > 0 && (
                  <span className={`ml-1.5 text-[13px] ${
                    activeFilter === tab.id ? "text-gray-900" : "text-gray-400"
                  }`}>
                    ({counts[tab.id]})
                  </span>
                )}
                {activeFilter === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error ? (
          <div className="text-center py-16">
            <p className="text-[15px] text-red-600">{error}</p>
          </div>
        ) : filteredQuestions.length > 0 ? (
          <>
            <div className="space-y-4">
              {paginatedQuestions.map((question) => (
                question.status === "pending" ? (
                  <PendingQuestionCard
                    key={question.id}
                    question={question}
                    onReply={handleReply}
                    isMobile={isMobile}
                    isNew={question.isNew}
                    onMarkAsRead={() => handleMarkAsRead(question.id)}
                  />
                ) : (
                  <PublishedQuestionCard
                    key={question.id}
                    question={question}
                    onEdit={handleEdit}
                    isMobile={isMobile}
                    onVerifyClick={!isVerified ? openVerificationModal : undefined}
                  />
                )
              ))}
            </div>

            {/* Pagination */}
            {filteredQuestions.length > PAGE_SIZE && (
              <div className="pt-4">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredQuestions.length}
                  itemsPerPage={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                  itemLabel="questions"
                  showItemCount={true}
                />
              </div>
            )}
          </>
        ) : (
          <EmptyState filter={activeFilter} hasAnyPublished={counts.published > 0} />
        )}
      </div>

      {/* ── Bottom Sheet / Side Drawer ── */}
      <BottomSheet
        question={selectedQuestion}
        isOpen={isSheetOpen}
        onClose={handleCloseSheet}
        onSubmit={handleSheetSubmit}
        mode={sheetMode}
      />

      {/* ── Verification Modal ── */}
      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={providerProfile?.display_name || "your business"}
        profileId={profileId || undefined}
      />
    </div>
  );
}

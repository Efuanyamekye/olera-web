"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ── Types ──

type TabFilter = "pending" | "published";

interface Question {
  id: string;
  question: string;
  askerName: string;
  askedAt: string;
  status: "pending" | "published";
  likes: number;
  answer?: string;
  answeredAt?: string;
  providerName?: string;
}

// ── Mock Data ──

const MOCK_QUESTIONS: Question[] = [
  {
    id: "1",
    question: "What's special about your business?",
    askerName: "Anonymous",
    askedAt: "2026-03-05T07:50:00Z",
    status: "pending",
    likes: 0,
  },
  {
    id: "2",
    question: "Do you offer overnight care services for seniors who need continuous support?",
    askerName: "Anonymous",
    askedAt: "2026-03-04T14:30:00Z",
    status: "pending",
    likes: 2,
  },
  {
    id: "3",
    question: "Does Home Instead provide 24/7 care for seniors who need continuous support?",
    askerName: "Cameron Williamson",
    askedAt: "2026-02-21T10:00:00Z",
    status: "published",
    likes: 5,
    answer: "Yes, Home Instead offers 24/7 care services to ensure your loved one receives continuous support, day and night. Our dedicated caregivers provide assistance, companionship, and supervision tailored to individual needs. Contact us to discuss a personalized care plan.",
    answeredAt: "2026-02-21T12:00:00Z",
    providerName: "Home Instead Houston",
  },
  {
    id: "4",
    question: "What are your hourly rates for companionship care?",
    askerName: "Sarah M.",
    askedAt: "2026-02-18T09:15:00Z",
    status: "published",
    likes: 8,
    answer: "Our companionship care rates are competitive and vary based on the specific services needed and scheduling requirements. We offer flexible packages to fit your budget. Please reach out through our profile for a personalized quote.",
    answeredAt: "2026-02-18T11:30:00Z",
    providerName: "Home Instead Houston",
  },
  {
    id: "5",
    question: "Do your caregivers have experience with dementia patients?",
    askerName: "Anonymous",
    askedAt: "2026-02-15T16:00:00Z",
    status: "published",
    likes: 12,
    answer: "Yes, many of our caregivers have specialized training in dementia and Alzheimer's care. We match caregivers with families based on experience and compatibility. Our team receives ongoing education on best practices for memory care.",
    answeredAt: "2026-02-15T18:00:00Z",
    providerName: "Home Instead Houston",
  },
];

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

function QuestionMarkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
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
}: {
  question: Question;
  onReply: (question: Question, answer?: string) => void;
  isMobile: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile: tap to open reply sheet
  if (isMobile) {
    return (
      <button
        type="button"
        onClick={() => onReply(question)}
        className="w-full text-left bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden active:bg-vanilla-50/60 transition-colors"
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <Avatar name={question.askerName} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2">
                {question.question}
              </p>
              <p className="text-sm text-gray-500 mt-1.5">
                {question.askerName} · {timeAgo(question.askedAt)}
              </p>
            </div>
          </div>

          {/* Textarea placeholder */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3.5">
            <p className="text-[15px] text-gray-400">Type your answer here...</p>
          </div>

          {/* Publish button */}
          <div className="mt-3">
            <div className="w-full py-3.5 rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 text-center shadow-[0_1px_3px_rgba(6,182,212,0.3),0_1px_2px_rgba(6,182,212,0.2)]">
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
    await new Promise(r => setTimeout(r, 800));
    onReply(question, answer);
    setIsSubmitting(false);
    setAnswer("");
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden hover:border-gray-300/80 transition-colors">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <Avatar name={question.askerName} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-gray-900 leading-snug">
              {question.question}
            </p>
            <p className="text-sm text-gray-500 mt-1.5">
              {question.askerName} · {timeAgo(question.askedAt)}
            </p>
          </div>
        </div>

        {/* Answer textarea */}
        <div className="mt-5">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            rows={4}
            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-[15px] text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all"
          />
        </div>

        {/* Publish button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 text-[15px] font-semibold text-white shadow-[0_1px_3px_rgba(6,182,212,0.3),0_1px_2px_rgba(6,182,212,0.2)] hover:from-primary-600 hover:to-primary-700 hover:shadow-[0_3px_8px_rgba(6,182,212,0.35),0_1px_3px_rgba(6,182,212,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
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
}: {
  question: Question;
  onEdit: (question: Question) => void;
  isMobile: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden hover:border-gray-300/80 transition-colors">
      <div className={isMobile ? "p-4" : "p-6"}>
        {/* Asker info + badge */}
        <div className="flex items-start gap-3">
          <Avatar name={question.askerName} size={isMobile ? "md" : "lg"} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold text-gray-900 ${isMobile ? "text-[15px]" : "text-base"}`}>
                {question.askerName}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100/50">
                Published
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              {formatDate(question.askedAt)}
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
              <Avatar name={question.providerName || "Provider"} size={isMobile ? "md" : "lg"} isProvider />
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-gray-900 ${isMobile ? "text-[15px]" : "text-base"}`}>
                  {question.providerName || "Your response"}
                </p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {question.answeredAt ? formatDate(question.answeredAt) : ""}
                </p>
              </div>
            </div>
            <p className={`text-gray-600 leading-relaxed mt-3 ${isMobile ? "text-[15px]" : "text-base"}`}>
              {question.answer}
            </p>
          </div>
        )}

        {/* Edit button */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => onEdit(question)}
            className="w-full py-3 rounded-xl border border-gray-200 text-[15px] font-semibold text-primary-600 hover:bg-primary-50/50 hover:border-primary-200 transition-all active:scale-[0.99] min-h-[48px]"
          >
            Edit
          </button>
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
      />

      {/* Sheet - bottom on mobile, side drawer on desktop */}
      <div
        className={`fixed z-50 bg-white shadow-2xl flex flex-col will-change-transform transition-transform duration-300 ease-out
          /* Mobile: bottom sheet */
          inset-x-0 bottom-0 max-h-[90vh] rounded-t-3xl
          /* Desktop: side drawer */
          lg:inset-y-0 lg:top-16 lg:right-0 lg:left-auto lg:bottom-auto lg:w-[520px] lg:max-w-[calc(100vw-24px)] lg:h-[calc(100dvh-64px)] lg:max-h-none lg:rounded-none
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
            <h2 className="text-lg font-display font-bold text-gray-900 tracking-tight">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
            <Avatar name={question.askerName} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-gray-900 leading-snug">
                {question.question}
              </p>
              <p className="text-sm text-gray-500 mt-1.5">
                {question.askerName} · {timeAgo(question.askedAt)}
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

// ── Empty States ──

function EmptyState({ filter }: { filter: TabFilter }) {
  if (filter === "published") {
    return (
      <div className="flex flex-col items-center text-center py-16 lg:py-24 px-6">
        {/* Illustration */}
        <div className="w-40 h-40 lg:w-48 lg:h-48 mb-6 relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-28 h-28 lg:w-32 lg:h-32 rounded-2xl bg-gradient-to-br from-primary-50 to-vanilla-100 border border-primary-100/50 flex items-center justify-center transform rotate-3 shadow-sm">
              <QuestionMarkIcon className="w-14 h-14 lg:w-16 lg:h-16 text-primary-300" />
            </div>
          </div>
          {/* Decorative elements */}
          <div className="absolute top-4 right-6 w-3 h-3 rounded-full bg-amber-200" />
          <div className="absolute bottom-6 left-6 w-2 h-2 rounded-full bg-primary-200" />
          <div className="absolute top-10 left-4 w-4 h-1 rounded-full bg-warm-200 transform rotate-45" />
          <div className="absolute bottom-12 right-4 w-2 h-2 rounded-full bg-warm-300" />
        </div>
        <h3 className="text-xl lg:text-2xl font-display font-bold text-gray-900 tracking-tight">
          You haven&apos;t published any response
        </h3>
        <p className="text-[15px] text-gray-500 mt-2.5 leading-relaxed max-w-sm">
          Respond to pending Q&As now to get your answers published and visible on your profile.
        </p>
      </div>
    );
  }

  // Pending empty state - "All caught up"
  return (
    <div className="flex flex-col items-center text-center py-16 lg:py-24 px-6">
      <div className="w-16 h-16 rounded-2xl bg-primary-50 border border-primary-100/50 flex items-center justify-center mb-6">
        <CheckIcon className="w-8 h-8 text-primary-500" />
      </div>
      <h3 className="text-lg lg:text-xl font-display font-bold text-gray-900">
        All caught up!
      </h3>
      <p className="text-[15px] text-gray-500 mt-2 leading-relaxed max-w-sm">
        You&apos;ve answered all questions from families. New questions will appear here when families ask.
      </p>
    </div>
  );
}

// ── Loading Skeleton ──

function QnASkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="animate-pulse">
          <div className="mb-5 lg:mb-8">
            <div className="h-8 w-56 bg-warm-100 rounded-lg mb-2" />
            <div className="h-4 w-72 bg-warm-50 rounded" />
          </div>
          <div className="h-12 w-64 bg-vanilla-50 border border-warm-100/60 rounded-xl mb-5 lg:mb-6" />
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-warm-100/60 p-5 lg:p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-warm-100 shrink-0" />
                  <div className="flex-1">
                    <div className="h-5 w-full max-w-md bg-warm-100 rounded mb-2" />
                    <div className="h-3 w-32 bg-warm-50 rounded" />
                  </div>
                </div>
                <div className="h-24 bg-warm-50/50 rounded-xl mb-4" />
                <div className="h-12 bg-warm-100/60 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function ProviderQnAPage() {
  const [activeFilter, setActiveFilter] = useState<TabFilter>("pending");
  const [questions, setQuestions] = useState<Question[]>(MOCK_QUESTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Sheet state
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"reply" | "edit">("reply");

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => q.status === activeFilter);
  }, [activeFilter, questions]);

  const counts = useMemo(() => ({
    pending: questions.filter((q) => q.status === "pending").length,
    published: questions.filter((q) => q.status === "published").length,
  }), [questions]);

  // Handle reply (from card or sheet)
  const handleReply = useCallback((question: Question, answer?: string) => {
    if (isMobile || !answer) {
      // Mobile or no answer provided - open sheet
      setSelectedQuestion(question);
      setSheetMode("reply");
      setIsSheetOpen(true);
    } else {
      // Desktop inline submit
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === question.id
            ? {
                ...q,
                status: "published" as const,
                answer,
                answeredAt: new Date().toISOString(),
                providerName: "Your Business"
              }
            : q
        )
      );
    }
  }, [isMobile]);

  // Handle edit
  const handleEdit = useCallback((question: Question) => {
    setSelectedQuestion(question);
    setSheetMode("edit");
    setIsSheetOpen(true);
  }, []);

  // Handle sheet submit
  const handleSheetSubmit = useCallback((question: Question, answer: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === question.id
          ? {
              ...q,
              status: "published" as const,
              answer,
              answeredAt: new Date().toISOString(),
              providerName: q.providerName || "Your Business"
            }
          : q
      )
    );
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
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* ── Page header ── */}
        <div className="mb-5 lg:mb-8">
          <h1 className="text-2xl lg:text-[28px] font-display font-bold text-gray-900 tracking-tight">
            Questions & Answers
          </h1>
          <p className="text-sm lg:text-[15px] text-gray-500 mt-1 lg:mt-1.5 leading-relaxed">
            Answer questions from families and showcase your expertise.
          </p>
        </div>

        {/* ── Tabs ── */}
        <div className="mb-5 lg:mb-6">
          <div className="inline-flex bg-vanilla-50 border border-warm-100/60 p-0.5 rounded-xl">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={[
                  "px-5 lg:px-6 py-2.5 rounded-[10px] text-sm font-semibold transition-all duration-150 min-h-[44px] flex items-center justify-center gap-2",
                  activeFilter === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                  activeFilter === tab.id
                    ? "bg-gray-100 text-gray-600"
                    : "bg-warm-100/60 text-gray-400"
                }`}>
                  {counts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        {filteredQuestions.length > 0 ? (
          <div className="space-y-4">
            {filteredQuestions.map((question) => (
              question.status === "pending" ? (
                <PendingQuestionCard
                  key={question.id}
                  question={question}
                  onReply={handleReply}
                  isMobile={isMobile}
                />
              ) : (
                <PublishedQuestionCard
                  key={question.id}
                  question={question}
                  onEdit={handleEdit}
                  isMobile={isMobile}
                />
              )
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
            <EmptyState filter={activeFilter} />
          </div>
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
    </div>
  );
}

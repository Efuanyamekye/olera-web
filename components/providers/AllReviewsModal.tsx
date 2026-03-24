"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Review } from "@/lib/types";

// ── Types ──

interface MockReview {
  name: string;
  rating: number;
  date: string;
  comment: string;
  relationship?: string;
}

export interface DisplayReview {
  id: string;
  name: string;
  rating: number;
  date: string;
  comment: string;
  relationship?: string;
  title?: string | null;
  isMock: boolean;
  providerReply?: string | null;
  repliedAt?: string | null;
  accountId?: string;
  source?: "olera" | "google";
  profilePhotoUrl?: string | null;
}

type SortOption = "helpful" | "recent" | "highest" | "lowest";

const SORT_LABELS: Record<SortOption, string> = {
  helpful: "Most Helpful",
  recent: "Most Recent",
  highest: "Highest Rated",
  lowest: "Lowest Rated",
};

// ── Icons ──

function StarIcon({ className, filled = true }: { className?: string; filled?: boolean }) {
  return filled ? (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ) : (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Helpers ──

function getScrollbarWidth(): number {
  return window.innerWidth - document.documentElement.clientWidth;
}

// ── Props ──

interface AllReviewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerName: string;
  reviews: DisplayReview[];
  averageRating: number;
  /** ID of review to scroll to on open */
  scrollToReviewId?: string | null;
  /** When true, shows a "Demo" indicator */
  isDemoMode?: boolean;
  /** Callback to open write review modal */
  onWriteReview?: () => void;
}

export default function AllReviewsModal({
  isOpen,
  onClose,
  providerName,
  reviews,
  averageRating,
  scrollToReviewId,
  isDemoMode = false,
  onWriteReview,
}: AllReviewsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("helpful");
  const [sortOpen, setSortOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const reviewRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Track mount for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Blur before close
  const handleClose = useCallback(() => {
    const active = document.activeElement;
    if (active && active !== document.body) {
      (active as HTMLElement).blur();
    }
    onCloseRef.current();
  }, []);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    },
    [handleClose]
  );

  // Scroll lock + keyboard
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const scrollbarWidth = getScrollbarWidth();

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const storedScrollY = parseInt(document.body.style.top || "0", 10) * -1;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.paddingRight = "";
      requestAnimationFrame(() => {
        window.scrollTo({ top: storedScrollY, behavior: "instant" });
      });
    };
  }, [isOpen, handleKeyDown]);

  // Scroll to specific review when modal opens
  useEffect(() => {
    if (!isOpen || !scrollToReviewId) return;

    // Wait for render
    const timer = setTimeout(() => {
      const reviewEl = reviewRefs.current.get(scrollToReviewId);
      if (reviewEl && scrollContainerRef.current) {
        reviewEl.scrollIntoView({ behavior: "smooth", block: "center" });
        // Brief highlight effect
        reviewEl.classList.add("ring-2", "ring-primary-300", "ring-offset-2");
        setTimeout(() => {
          reviewEl.classList.remove("ring-2", "ring-primary-300", "ring-offset-2");
        }, 1500);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, scrollToReviewId]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sortOpen]);

  // Sort reviews
  function sortReviews(reviewList: DisplayReview[]): DisplayReview[] {
    const sorted = [...reviewList];
    switch (sortBy) {
      case "recent":
        return sorted.sort((a, b) => {
          if (a.isMock && b.isMock) return 0;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
      case "highest":
        return sorted.sort((a, b) => b.rating - a.rating);
      case "lowest":
        return sorted.sort((a, b) => a.rating - b.rating);
      case "helpful":
      default:
        return sorted;
    }
  }

  const sortedReviews = sortReviews(reviews);
  const reviewCount = reviews.length;

  // Rating display
  const ratingDisplay = averageRating > 0 ? averageRating.toFixed(1) : "—";
  const isHighRating = averageRating >= 4.5;

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Reviews for ${providerName}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/50 animate-fade-in"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      />

      {/* Content */}
      <div
        ref={contentRef}
        className={[
          "relative bg-white shadow-2xl w-full flex flex-col",
          "rounded-t-2xl max-h-[92dvh] animate-sheet-up",
          "sm:rounded-2xl sm:max-h-[85dvh] sm:animate-modal-pop",
          "max-w-2xl",
        ].join(" ")}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle — mobile */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 sm:px-7 pt-4 sm:pt-6 pb-0 shrink-0">
          <div className="flex-1" />
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollContainerRef}
          className="px-5 sm:px-7 pt-2 pb-6 flex-1 min-h-0 overflow-y-auto overscroll-contain"
        >
          {/* Rating hero */}
          <div className="text-center py-6 border-b border-gray-100 mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              {isHighRating && <span className="text-3xl">🏆</span>}
              <span className="text-5xl sm:text-6xl font-bold text-gray-900 font-display tracking-tight">
                {ratingDisplay}
              </span>
              {isHighRating && <span className="text-3xl">🏆</span>}
            </div>
            <div className="flex items-center justify-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <StarIcon
                  key={star}
                  className={`w-5 h-5 ${star <= Math.round(averageRating) ? "text-primary-500" : "text-gray-200"}`}
                  filled={star <= Math.round(averageRating)}
                />
              ))}
            </div>
            {isHighRating && (
              <p className="text-sm text-gray-600 font-medium">
                Highly rated by families
              </p>
            )}
            {isDemoMode && (
              <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                Demo Reviews
              </span>
            )}
          </div>

          {/* Sort bar */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-900">
              {reviewCount} review{reviewCount !== 1 ? "s" : ""}
            </span>
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-1.5 text-sm text-gray-700 font-medium border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                {SORT_LABELS[sortBy]}
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-10 min-w-[160px] animate-slide-down">
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSortBy(option);
                        setSortOpen(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                        sortBy === option
                          ? "text-primary-600 font-medium bg-primary-50"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {SORT_LABELS[option]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reviews list — single column */}
          <div className="space-y-6">
            {sortedReviews.map((review) => (
              <div
                key={review.id}
                ref={(el) => {
                  if (el) reviewRefs.current.set(review.id, el);
                }}
                className="pb-6 border-b border-gray-100 last:border-b-0 transition-all duration-300 rounded-xl"
              >
                {/* Review header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-gray-600">
                      {review.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{review.name}</p>
                    {review.relationship && (
                      <p className="text-xs text-gray-500">{review.relationship}</p>
                    )}
                  </div>
                </div>

                {/* Rating + date */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <StarIcon
                        key={star}
                        className={`w-3.5 h-3.5 ${star <= review.rating ? "text-gray-900" : "text-gray-200"}`}
                        filled={star <= review.rating}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">·</span>
                  <span className="text-xs text-gray-500">{review.date}</span>
                </div>

                {/* Title */}
                {review.title && (
                  <p className="text-sm font-semibold text-gray-900 mb-1">{review.title}</p>
                )}

                {/* Full comment — no truncation in modal */}
                <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>

                {/* Provider reply */}
                {review.providerReply && (
                  <div className="mt-4 pl-4 border-l-2 border-primary-200 bg-primary-50/40 rounded-r-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                        <svg
                          className="w-3.5 h-3.5 text-primary-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                          />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-primary-700">
                          Response from {providerName}
                        </span>
                        {review.repliedAt && (
                          <span className="text-xs text-gray-400 ml-2">
                            {new Date(review.repliedAt).toLocaleDateString("en-US", {
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{review.providerReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Empty state */}
          {reviewCount === 0 && (
            <div className="text-center py-12">
              <StarIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" filled={false} />
              <p className="text-gray-500 font-medium">No reviews yet</p>
              <p className="text-sm text-gray-400 mt-1">Be the first to share your experience.</p>
            </div>
          )}
        </div>

        {/* Footer — write review CTA */}
        {onWriteReview && (
          <div className="px-5 sm:px-7 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={() => {
                handleClose();
                onWriteReview();
              }}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-gradient-to-b from-primary-500 to-primary-600 rounded-xl shadow-sm hover:from-primary-600 hover:to-primary-700 transition-all"
            >
              Write a review
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ── Export helper to normalize reviews ──

interface GoogleReviewSnippet {
  author_name: string;
  rating: number;
  text: string;
  relative_time: string;
  profile_photo_url: string | null;
  time: number;
}

export function normalizeReviews(
  realReviews: Review[],
  mockReviews: MockReview[],
  googleReviews?: GoogleReviewSnippet[],
): { reviews: DisplayReview[]; averageRating: number } {
  const normalizedReal: DisplayReview[] = realReviews.map((r) => ({
    id: r.id,
    name: r.reviewer_name,
    rating: r.rating,
    date: new Date(r.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    comment: r.comment,
    relationship: r.relationship ?? undefined,
    title: r.title,
    isMock: false,
    providerReply: r.provider_reply,
    repliedAt: r.replied_at,
    accountId: r.account_id ?? undefined,
    source: "olera" as const,
  }));

  const normalizedGoogle: DisplayReview[] = (googleReviews ?? []).map((r, i) => ({
    id: `google-${i}`,
    name: r.author_name,
    rating: r.rating,
    date: r.relative_time,
    comment: r.text,
    title: null,
    isMock: false,
    source: "google" as const,
    profilePhotoUrl: r.profile_photo_url,
  }));

  const normalizedMock: DisplayReview[] = mockReviews.map((r, i) => ({
    id: `mock-${i}`,
    name: r.name,
    rating: r.rating,
    date: r.date,
    comment: r.comment,
    relationship: r.relationship,
    title: null,
    isMock: true,
  }));

  // Merge real Olera reviews + Google reviews, then fall back to mock
  const oleraAndGoogle = [...normalizedReal, ...normalizedGoogle];
  const reviews = oleraAndGoogle.length > 0 ? oleraAndGoogle : normalizedMock;

  // Calculate average from Olera reviews only (Google has its own rating)
  const oleraForAvg = normalizedReal.length > 0 ? normalizedReal : normalizedMock;
  const averageRating =
    oleraForAvg.length > 0 ? oleraForAvg.reduce((sum, r) => sum + r.rating, 0) / oleraForAvg.length : 0;

  return { reviews, averageRating };
}

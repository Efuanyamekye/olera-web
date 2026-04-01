"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDeferredAction, clearDeferredAction } from "@/lib/deferred-action";
import type { Review, GoogleReviewsData } from "@/lib/types";
import ReviewModal from "@/components/providers/ReviewModal";
import AllReviewsModal, { normalizeReviews } from "@/components/providers/AllReviewsModal";

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

function MoreIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Types ──

interface MockReview {
  name: string;
  rating: number;
  date: string;
  comment: string;
  relationship?: string;
}

const INITIAL_VISIBLE = 4;
const TRUNCATE_LENGTH = 150;

// ── Props ──

interface ReviewsSectionProps {
  providerId: string;
  providerSlug: string;
  providerName: string;
  mockReviews: MockReview[];
  /** When true, shows a "Demo" badge to indicate these are example reviews, not real user reviews */
  isDemoMode?: boolean;
  /** Google review data to merge into the unified feed */
  googleReviewsData?: GoogleReviewsData | null;
  /** Google Place ID for "See all on Google" link */
  placeId?: string | null;
  /** Hide the top border (e.g., when this is the first section) */
  hideBorder?: boolean;
}

// ── Component ──

export default function ReviewsSection({
  providerId,
  providerSlug,
  providerName,
  mockReviews,
  isDemoMode = false,
  googleReviewsData,
  placeId,
  hideBorder = false,
}: ReviewsSectionProps) {
  const { user, account, activeProfile } = useAuth();

  // Only family profiles can write reviews (providers/caregivers cannot)
  const canWriteReview = !activeProfile || activeProfile.type === "family";

  // Data
  const [realReviews, setRealReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [allReviewsModalOpen, setAllReviewsModalOpen] = useState(false);
  const [scrollToReviewId, setScrollToReviewId] = useState<string | null>(null);

  // Write review modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  // Edit review state
  const [editingReview, setEditingReview] = useState<{
    id: string;
    rating: number;
    comment: string;
  } | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Fetch real reviews ──

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?provider_id=${encodeURIComponent(providerId)}`);
      if (res.ok) {
        const data = await res.json();
        setRealReviews(data.reviews ?? []);
      }
    } catch {
      // Silently fail — mock reviews will show
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // ── Detect deferred action (returning from auth) ──
  // If review data was saved, auto-submit it

  useEffect(() => {
    if (!user) return;
    const deferred = getDeferredAction();
    if (deferred?.action === "review" && deferred?.targetProfileId === providerId) {
      clearDeferredAction();

      // If review data exists, auto-submit
      if (deferred.reviewData) {
        const { rating, comment, title, relationship } = deferred.reviewData;
        (async () => {
          try {
            const res = await fetch("/api/reviews", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider_id: providerId,
                rating,
                comment,
                title: title || undefined,
                relationship: relationship || undefined,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.review) {
                setRealReviews((prev) => [data.review, ...prev]);
              }
            }
          } catch {
            // Silently fail - user can retry manually
          }
        })();
      } else {
        // Legacy fallback - open modal
        setReviewModalOpen(true);
      }
    }
  }, [user, providerId]);

  // ── Close more menu on outside click ──

  useEffect(() => {
    if (!openMenuId) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  // ── Normalize reviews ──

  const { reviews: allReviews, averageRating } = normalizeReviews(realReviews, mockReviews, googleReviewsData?.reviews);
  const googleMapsUrl = placeId
    ? `https://search.google.com/local/reviews?placeid=${placeId}`
    : null;
  const visibleReviews = allReviews.slice(0, INITIAL_VISIBLE);
  const hasMore = allReviews.length > INITIAL_VISIBLE;
  const hasReviews = allReviews.length > 0;
  const reviewCount = allReviews.length;

  // Check if showing demo reviews
  const showingDemoReviews = isDemoMode && realReviews.length === 0 && mockReviews.length > 0;

  // ── Handle "Show more" on individual review ──

  const handleShowMore = (reviewId: string) => {
    setScrollToReviewId(reviewId);
    setAllReviewsModalOpen(true);
  };

  // ── Handle edit review submit ──

  const handleEditSubmit = async () => {
    if (!editingReview?.id || !editComment.trim() || editSubmitting) return;

    setEditSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingReview.id,
          rating: editRating,
          comment: editComment.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update review");
        return;
      }

      const data = await res.json();
      // Update review in local state
      setRealReviews((prev) =>
        prev.map((r) => (r.id === editingReview.id ? { ...r, ...data.review } : r))
      );
      setEditingReview(null);
      setEditComment("");
    } catch {
      alert("Failed to update review");
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Render ──

  return (
    <div className={`py-8 ${hideBorder ? "" : "border-t border-gray-200"}`}>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 font-display tracking-tight">
          What families are saying
        </h2>
        {showingDemoReviews && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            Demo
          </span>
        )}
      </div>

      {hasReviews ? (
        <>
          {/* Rating summary bar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              {googleReviewsData && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-900">{googleReviewsData.rating.toFixed(1)}</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <StarIcon
                        key={star}
                        className={`w-4 h-4 ${star <= Math.round(googleReviewsData.rating) ? "text-amber-400" : "text-gray-200"}`}
                        filled={star <= Math.round(googleReviewsData.rating)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <span className="text-sm text-gray-500">
                {reviewCount} review{reviewCount !== 1 ? "s" : ""}
              </span>
            </div>
            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                See all on Google
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              </a>
            )}
          </div>

          {/* Reviews grid — 2 columns on desktop, clean cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleReviews.map((review) => {
              const isLong = review.comment.length > TRUNCATE_LENGTH;
              const displayComment = isLong
                ? review.comment.slice(0, TRUNCATE_LENGTH).trimEnd() + "..."
                : review.comment;
              const isOwner = !review.isMock && account && review.accountId === account.id;

              return (
                <div
                  key={review.id}
                  className="group/review shadow-sm hover:shadow-md transition-shadow rounded-2xl p-5 bg-white"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {review.source === "google" && review.profilePhotoUrl ? (
                        <img
                          src={review.profilePhotoUrl}
                          alt={review.name}
                          className="w-8 h-8 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-gray-600">
                            {review.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{review.name}</p>
                        <p className="text-xs text-gray-400">{review.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary-600">
                        {review.rating.toFixed(1)} / 5{" "}
                        <StarIcon className="w-3.5 h-3.5 text-primary-500 inline" />
                      </span>
                      {/* More menu - only for review owner */}
                      {isOwner && (
                        <div className="relative" ref={openMenuId === review.id ? menuRef : null}>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuId(openMenuId === review.id ? null : review.id)
                            }
                            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 lg:opacity-0 lg:group-hover/review:opacity-100 hover:text-gray-600 hover:bg-gray-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-all"
                            aria-label="More options"
                          >
                            <MoreIcon className="w-5 h-5" />
                          </button>
                          {/* Dropdown menu */}
                          {openMenuId === review.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-10 min-w-[120px] animate-slide-down">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingReview({
                                    id: review.id,
                                    rating: review.rating,
                                    comment: review.comment,
                                  });
                                  setEditRating(review.rating);
                                  setEditComment(review.comment);
                                  setOpenMenuId(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                              >
                                <svg
                                  className="w-4 h-4 text-gray-500"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.5}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                                  />
                                </svg>
                                Edit review
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Relationship */}
                  {review.relationship && (
                    <p className="text-xs text-gray-400 mb-2">{review.relationship}</p>
                  )}

                  {/* Title */}
                  {review.title && (
                    <p className="text-sm font-semibold text-gray-900 mb-1">{review.title}</p>
                  )}

                  {/* Comment — truncated, "Show more" opens modal */}
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {displayComment}
                    {isLong && (
                      <>
                        {" "}
                        <button
                          onClick={() => handleShowMore(review.id)}
                          className="text-gray-900 font-semibold underline underline-offset-2 hover:text-primary-600 transition-colors"
                        >
                          Show more
                        </button>
                      </>
                    )}
                  </p>

                  {/* Provider reply indicator — just a subtle hint, full reply in modal */}
                  {review.providerReply && (
                    <button
                      onClick={() => handleShowMore(review.id)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                        />
                      </svg>
                      Provider responded
                    </button>
                  )}

                  {/* Source badge */}
                  {review.source === "google" && (
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      <span className="text-xs text-gray-400">Google review</span>
                    </div>
                  )}
                  {review.source === "olera" && (
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-400">Olera review</span>
                      <span className="text-xs">🌿</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between mt-5">
            {/* Show all reviews button */}
            {hasMore ? (
              <button
                onClick={() => {
                  setScrollToReviewId(null);
                  setAllReviewsModalOpen(true);
                }}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 underline underline-offset-2 hover:text-primary-600 transition-colors"
              >
                Show all {reviewCount} reviews
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            ) : (
              <div />
            )}

            {/* Add review button (hidden for non-family profiles) */}
            {canWriteReview && (
              <button
                onClick={() => setReviewModalOpen(true)}
                className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-600 rounded-xl hover:bg-primary-50 transition-colors"
              >
                Add review
              </button>
            )}
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
          <StarIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" filled={false} />
          <p className="text-gray-500 font-medium">No reviews yet.</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            {canWriteReview
              ? "Be the first to share your experience with this provider."
              : "No family reviews have been shared yet."}
          </p>
          {canWriteReview && (
            <button
              onClick={() => setReviewModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-600 rounded-xl hover:bg-primary-50 transition-colors"
            >
              Write a review
            </button>
          )}
        </div>
      )}

      {/* All Reviews Modal */}
      <AllReviewsModal
        isOpen={allReviewsModalOpen}
        onClose={() => {
          setAllReviewsModalOpen(false);
          setScrollToReviewId(null);
        }}
        providerName={providerName}
        reviews={allReviews}
        averageRating={averageRating}
        scrollToReviewId={scrollToReviewId}
        isDemoMode={showingDemoReviews}
        onWriteReview={() => setReviewModalOpen(true)}
      />

      {/* Write Review Modal */}
      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        providerId={providerId}
        providerSlug={providerSlug}
        providerName={providerName}
        googlePlaceId={placeId}
        onReviewSubmitted={(review) => setRealReviews((prev) => [review, ...prev])}
      />

      {/* Edit Review Modal */}
      {editingReview && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={() => setEditingReview(null)}
            aria-hidden="true"
          />
          {/* Modal */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-review-title"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl max-w-lg mx-auto p-6"
          >
            <h3
              id="edit-review-title"
              className="text-lg font-display font-bold text-gray-900 mb-4"
            >
              Edit your review
            </h3>

            {/* Star rating */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Rating</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setEditRating(star)}
                    className="p-0.5 focus:outline-none focus:ring-2 focus:ring-primary-200 rounded transition-transform hover:scale-110"
                  >
                    <StarIcon
                      className={`w-7 h-7 ${star <= editRating ? "text-primary-500" : "text-gray-200"}`}
                      filled={star <= editRating}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Your review</label>
              <textarea
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                rows={4}
                maxLength={2000}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300 focus:bg-white transition-all"
              />
              <p className="text-xs text-gray-400 text-right mt-1">{editComment.length}/2000</p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingReview(null);
                  setEditComment("");
                }}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={
                  !editComment.trim() ||
                  (editComment.trim() === editingReview.comment &&
                    editRating === editingReview.rating) ||
                  editSubmitting
                }
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-b from-primary-500 to-primary-600 rounded-xl shadow-sm hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSubmitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

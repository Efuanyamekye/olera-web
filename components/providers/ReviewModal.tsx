"use client";

import { useState, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useAuth } from "@/components/auth/AuthProvider";
import { setDeferredAction } from "@/lib/deferred-action";
import type { Review } from "@/lib/types";

// ── Star icon (same SVG paths as ReviewsSection) ──

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

// ── Constants ──

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

// Dynamic headers based on rating (from family's perspective)
function getStepTwoHeader(rating: number): string {
  if (rating >= 5) return "Share what made it great";
  if (rating >= 4) return "Tell us more about your experience";
  if (rating >= 3) return "Share your honest thoughts";
  if (rating >= 2) return "Help others know what to expect";
  return "Share your concerns";
}

// Pre-filled comment starter based on rating
function getDefaultComment(providerName: string, rating: number): string {
  if (rating >= 5) return `I had an excellent experience with ${providerName}. The care and attention provided was exceptional. `;
  if (rating >= 4) return `Overall, I had a positive experience with ${providerName}. `;
  if (rating >= 3) return `My experience with ${providerName} was mixed. `;
  if (rating >= 2) return `I was disappointed with my experience at ${providerName}. `;
  return `I had significant concerns about my experience with ${providerName}. `;
}

const RELATIONSHIP_OPTIONS = [
  "Family Member of Resident",
  "Daughter of Resident",
  "Son of Resident",
  "Spouse of Resident",
  "Grandchild of Resident",
  "Friend of Resident",
  "Resident",
  "Family Member of Client",
  "Client",
  "Other",
];

// ── Props ──

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerId: string;
  providerSlug: string;
  providerName: string;
  googlePlaceId?: string | null;
  onReviewSubmitted: (review: Review) => void;
}

// ── Component ──

type Step = "rating" | "details" | "success";

export default function ReviewModal({
  isOpen,
  onClose,
  providerId,
  providerSlug,
  providerName,
  googlePlaceId,
  onReviewSubmitted,
}: ReviewModalProps) {
  const { user, openAuth } = useAuth();

  // Step
  const [step, setStep] = useState<Step>("rating");

  // Form state
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [relationship, setRelationship] = useState("");
  const [comment, setComment] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [postAnonymously, setPostAnonymously] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Google share
  const [copiedForGoogle, setCopiedForGoogle] = useState(false);

  // ── Reset ──

  const resetForm = useCallback(() => {
    setStep("rating");
    setRating(0);
    setHoverRating(0);
    setRelationship("");
    setComment("");
    setReviewerName("");
    setPostAnonymously(false);
    setError("");
    setSubmitting(false);
    setCopiedForGoogle(false);
  }, []);

  // Share on Google: copy review text, show feedback, then open Google
  const handleShareOnGoogle = useCallback(async () => {
    if (!googlePlaceId) return;

    // Build the review text to copy
    const reviewText = comment.trim();

    try {
      await navigator.clipboard.writeText(reviewText);
      setCopiedForGoogle(true);

      // Open Google after a brief delay so user sees the "copied" feedback
      setTimeout(() => {
        window.open(
          `https://search.google.com/local/writereview?placeid=${googlePlaceId}`,
          "_blank",
          "noopener,noreferrer"
        );
      }, 600);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = reviewText;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedForGoogle(true);

      setTimeout(() => {
        window.open(
          `https://search.google.com/local/writereview?placeid=${googlePlaceId}`,
          "_blank",
          "noopener,noreferrer"
        );
      }, 600);
    }
  }, [googlePlaceId, comment]);

  function handleClose() {
    onClose();
    // Delay reset so modal exit animation plays
    setTimeout(resetForm, 300);
  }

  // ── Submit ──

  async function handleSubmit() {
    setError("");

    if (!comment.trim()) {
      setError("Please write a review.");
      return;
    }

    // Auth-on-submit - save review data so it auto-submits after auth
    if (!user) {
      setDeferredAction({
        action: "review",
        targetProfileId: providerId,
        returnUrl: `/provider/${providerSlug}`,
        reviewData: {
          rating,
          comment: comment.trim(),
          relationship: relationship || undefined,
          reviewer_name: postAnonymously ? "Anonymous" : (reviewerName.trim() || undefined),
        },
      });
      openAuth({
        defaultMode: "sign-up",
        intent: "family",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          rating,
          comment: comment.trim(),
          relationship,
          reviewer_name: postAnonymously ? "Anonymous" : (reviewerName.trim() || undefined),
        }),
      });

      if (res.status === 409) {
        setError("You have already reviewed this provider.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to submit review. Please try again.");
        return;
      }

      const data = await res.json();
      onReviewSubmitted(data.review);
      setStep("success");
    } catch {
      setError("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Modal config per step ──

  const modalTitle = step === "success" ? undefined : "Write a review";
  const modalOnBack = step === "details" ? () => { setStep("rating"); setError(""); } : undefined;

  const handleNextToDetails = () => {
    // Pre-fill comment if empty when moving to step 2
    if (!comment.trim()) {
      setComment(getDefaultComment(providerName, rating));
    }
    setStep("details");
  };

  const modalFooter = step === "rating" ? (
    <Button
      fullWidth
      disabled={!rating || !relationship}
      onClick={handleNextToDetails}
    >
      Next
    </Button>
  ) : step === "details" ? (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 text-center" role="alert">{error}</p>
      )}
      <Button
        fullWidth
        onClick={handleSubmit}
        loading={submitting}
        disabled={!comment.trim()}
      >
        Submit review
      </Button>
    </div>
  ) : (
    <Button fullWidth variant="secondary" onClick={handleClose}>
      Done
    </Button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === "success" ? handleClose : handleClose}
      title={modalTitle}
      onBack={modalOnBack}
      footer={modalFooter}
      size="lg"
    >
      {/* ── Step Indicator ── */}
      {step !== "success" && (
        <div className="flex items-center justify-center gap-2 mb-6">
          {["rating", "details"].map((s, idx) => {
            const stepIndex = ["rating", "details"].indexOf(step);
            const isCompleted = idx < stepIndex;
            const isCurrent = s === step;
            return (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    isCompleted || isCurrent
                      ? "bg-primary-600 text-white"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                {idx < 1 && (
                  <div
                    className={`w-12 h-0.5 mx-2 transition-colors ${
                      isCompleted ? "bg-primary-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Step 1: Rating ── */}
      {step === "rating" && (
        <div className="px-2">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              How was your experience?
            </h2>
            <p className="text-base text-gray-500">
              Select a rating below
            </p>
          </div>

          {/* Star rating */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-2 transition-transform hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-lg"
                  aria-label={`Rate ${star} stars`}
                >
                  <StarIcon
                    className={`w-11 h-11 transition-colors duration-150 ${
                      star <= (hoverRating || rating)
                        ? "text-primary-500"
                        : "text-gray-200"
                    }`}
                    filled={star <= (hoverRating || rating)}
                  />
                </button>
              ))}
            </div>
            {(hoverRating || rating) > 0 && (
              <p className="mt-3 text-base font-medium text-primary-600">
                {RATING_LABELS[hoverRating || rating]}
              </p>
            )}
          </div>

          {/* Relationship */}
          <div className="mb-6">
            <Select
              label="Your relationship"
              required
              options={RELATIONSHIP_OPTIONS}
              value={relationship}
              onChange={setRelationship}
              placeholder="Select your relationship"
              dropdownDirection="down"
            />
          </div>
        </div>
      )}

      {/* ── Step 2: Details ── */}
      {step === "details" && (
        <div className="px-2">
          {/* Dynamic header based on rating */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              {getStepTwoHeader(rating)}
            </h2>
            <p className="text-base text-gray-500">
              Your story helps other families find quality care
            </p>
          </div>

          {/* Summary bar — shows rating + relationship from step 1 */}
          <button
            type="button"
            onClick={() => setStep("rating")}
            className="w-full flex items-center justify-between p-3.5 mb-6 bg-vanilla-50 border border-warm-100 rounded-xl hover:bg-vanilla-100 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 min-h-[56px]"
          >
            <div className="flex items-center gap-3">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <StarIcon
                    key={star}
                    className={`w-5 h-5 ${star <= rating ? "text-primary-500" : "text-gray-200"}`}
                    filled={star <= rating}
                  />
                ))}
              </div>
              <span className="text-base text-gray-600">{relationship}</span>
            </div>
            <span className="text-sm text-primary-600 font-medium">Edit</span>
          </button>

          {/* Reviewer name */}
          <div className="mb-5">
            <label htmlFor="reviewer-name" className="block text-base font-medium text-gray-700 mb-2">
              Your name
            </label>
            <input
              id="reviewer-name"
              type="text"
              value={reviewerName}
              onChange={(e) => {
                setReviewerName(e.target.value);
                if (e.target.value) setPostAnonymously(false);
              }}
              disabled={postAnonymously}
              placeholder="How should we display your name?"
              className={`w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all min-h-[52px] ${postAnonymously ? "opacity-50 cursor-not-allowed bg-gray-50" : ""}`}
            />
            {/* Post anonymously checkbox */}
            <label className="flex items-center gap-2.5 mt-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={postAnonymously}
                  onChange={(e) => {
                    setPostAnonymously(e.target.checked);
                    if (e.target.checked) setReviewerName("");
                  }}
                  className="sr-only peer"
                />
                <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                  postAnonymously
                    ? "bg-primary-600 border-primary-600"
                    : "border-gray-300 bg-white group-hover:border-gray-400"
                }`}>
                  {postAnonymously && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-base text-gray-600">Post anonymously</span>
            </label>
          </div>

          {/* Comment */}
          <div className="mb-4">
            <label htmlFor="review-comment" className="block text-base font-medium text-gray-700 mb-2">
              Your review <span className="text-red-500">*</span>
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share details about your experience with this provider..."
              rows={4}
              className="w-full px-4 py-4 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none leading-relaxed transition-all"
            />
          </div>
        </div>
      )}

      {/* ── Step 3: Success ── */}
      {step === "success" && (
        <div className="py-6 animate-step-in">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center ring-4 ring-green-50/50 shadow-sm">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">
              Thank you!
            </h2>
            <p className="text-base text-gray-500 leading-relaxed">
              Your review for <span className="font-medium text-gray-700">{providerName}</span> has been submitted successfully.
            </p>
          </div>

          {/* Google Share Card - only show if provider has place_id */}
          {googlePlaceId && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 animate-step-in">
              <div className="flex items-start gap-3 mb-4">
                {/* Google "G" logo */}
                <div className="w-11 h-11 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-gray-900">
                    Help them get discovered
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Share on Google so more families can find quality care
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleShareOnGoogle}
                disabled={copiedForGoogle}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-base transition-all min-h-[52px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  copiedForGoogle
                    ? "bg-primary-50 text-primary-700 border border-primary-200 focus-visible:ring-primary-500"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99] focus-visible:ring-gray-300 shadow-sm"
                }`}
              >
                {copiedForGoogle ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span>Review copied — opening Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    <span>Share on Google</span>
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2.5">
                We&apos;ll copy your review so you can paste it on Google
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

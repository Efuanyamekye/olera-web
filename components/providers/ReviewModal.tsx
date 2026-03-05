"use client";

import { useState, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
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
  onReviewSubmitted,
}: ReviewModalProps) {
  const { user, openAuth } = useAuth();

  // Step
  const [step, setStep] = useState<Step>("rating");

  // Form state
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [relationship, setRelationship] = useState("");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Reset ──

  const resetForm = useCallback(() => {
    setStep("rating");
    setRating(0);
    setHoverRating(0);
    setRelationship("");
    setTitle("");
    setComment("");
    setError("");
    setSubmitting(false);
  }, []);

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

    // Auth-on-submit
    if (!user) {
      setDeferredAction({
        action: "review",
        targetProfileId: providerId,
        returnUrl: `/provider/${providerSlug}`,
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
          title: title.trim() || undefined,
          comment: comment.trim(),
          relationship,
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

  const modalFooter = step === "rating" ? (
    <Button
      fullWidth
      disabled={!rating || !relationship}
      onClick={() => setStep("details")}
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
      size="md"
    >
      {/* ── Step 1: Rating ── */}
      {step === "rating" && (
        <div className="py-6 animate-step-in">
          {/* Star rating */}
          <div className="text-center mb-8">
            <p className="text-base text-gray-500 mb-5">
              How would you rate your experience with <strong className="text-gray-700">{providerName}</strong>?
            </p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <StarIcon
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoverRating || rating)
                        ? "text-primary-500"
                        : "text-gray-200"
                    }`}
                    filled={star <= (hoverRating || rating)}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm font-medium text-gray-600 mt-3 animate-step-in">
                {RATING_LABELS[rating]}
              </p>
            )}
          </div>

          {/* Relationship */}
          <div>
            <label htmlFor="review-relationship" className="block text-sm font-medium text-gray-700 mb-2">
              How do you know this provider? <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                id="review-relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
              >
                <option value="">Select your relationship</option>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Details ── */}
      {step === "details" && (
        <div className="py-4 animate-step-in">
          {/* Summary bar — shows rating + relationship from step 1 */}
          <button
            type="button"
            onClick={() => setStep("rating")}
            className="w-full flex items-center gap-3 bg-gray-50 rounded-xl p-3 mb-6 text-left hover:bg-gray-100 transition-colors group"
          >
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <StarIcon
                  key={star}
                  className={`w-4 h-4 ${star <= rating ? "text-primary-500" : "text-gray-200"}`}
                  filled={star <= rating}
                />
              ))}
            </div>
            <span className="text-sm text-gray-500">
              {RATING_LABELS[rating]} · {relationship}
            </span>
            <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 ml-auto shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          {/* Title (optional) */}
          <div className="mb-5">
            <label htmlFor="review-title" className="block text-sm font-medium text-gray-700 mb-1.5">
              Title <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summarize your experience"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Comment */}
          <div>
            <label htmlFor="review-comment" className="block text-sm font-medium text-gray-700 mb-1.5">
              Your review <span className="text-red-500">*</span>
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share details about your experience with this provider..."
              rows={5}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>
        </div>
      )}

      {/* ── Step 3: Success ── */}
      {step === "success" && (
        <div className="py-12 text-center animate-wizard-in">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6 shadow-sm">
            <svg className="w-8 h-8 text-green-600 animate-success-pop" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-bold text-gray-900 tracking-tight mb-3">
            Thank you for your review!
          </h2>
          <p className="text-base text-gray-500 leading-relaxed max-w-xs mx-auto">
            Your review of <strong className="text-gray-700">{providerName}</strong> has been published
            and will help other families in their search.
          </p>
        </div>
      )}
    </Modal>
  );
}

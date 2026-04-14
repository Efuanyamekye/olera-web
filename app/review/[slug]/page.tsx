"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

// ── Types ──

interface Provider {
  id: string;
  display_name: string;
  slug: string;
  image_url: string | null;
  tagline: string | null;
  city: string | null;
  state: string | null;
  google_place_id: string | null;
}

// ── Review Sentence Starters ──
// These are incomplete sentences that require the user to continue typing

function getReviewStarter(rating: number, providerName: string): string {
  const name = providerName || "this provider";
  switch (rating) {
    case 5:
      return `My experience with ${name} was exceptional. What stood out most was `;
    case 4:
      return `I had a positive experience with ${name}. I especially appreciated `;
    case 3:
      return `My experience with ${name} was `;
    case 2:
      return `My experience with ${name} could have been better. Specifically, `;
    case 1:
      return `I was disappointed with my experience at ${name} because `;
    default:
      return "";
  }
}

// ── Icons ──

function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function StarIcon({ filled, className = "w-8 h-8" }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {filled ? (
        <path
          fill="currentColor"
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        />
      )}
    </svg>
  );
}

// ── Minimal Header ──

function MinimalHeader() {
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100/50 sticky top-0 z-10">
      <div className="flex items-center justify-center h-14">
        <Link href="/" className="flex items-center gap-2 group" aria-label="Olera homepage">
          <Image src="/images/olera-logo.png" alt="" width={24} height={24} className="object-contain" />
          <span className="text-base font-bold text-gray-900 group-hover:text-primary-600 transition-colors">Olera</span>
        </Link>
      </div>
    </header>
  );
}

// ── Truncate helper ──

function truncateName(name: string, maxLength: number = 28): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength).trimEnd() + "...";
}

// ── Main Page Content ──

function ReviewPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const clientName = searchParams.get("name") || "";

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [experience, setExperience] = useState("");
  const [hasEditedText, setHasEditedText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Olera review state (for providers without Google Place ID)
  const [oleraSubmitting, setOleraSubmitting] = useState(false);
  const [oleraSuccess, setOleraSuccess] = useState(false);
  const [submittedReview, setSubmittedReview] = useState<{
    rating: number;
    review_text: string;
  } | null>(null);

  // Fetch provider info
  useEffect(() => {
    async function fetchProvider() {
      try {
        const res = await fetch(`/api/provider/${slug}/info`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Provider not found");
          } else {
            setError("Failed to load provider");
          }
          return;
        }
        const data = await res.json();
        setProvider(data.provider);
      } catch {
        setError("Failed to load provider");
      } finally {
        setLoading(false);
      }
    }
    fetchProvider();
  }, [slug]);

  // Handle rating selection - pre-fill sentence starter
  const handleRatingSelect = (newRating: number) => {
    setRating(newRating);
    // Only pre-fill if user hasn't manually edited the text
    if (!hasEditedText && provider) {
      setExperience(getReviewStarter(newRating, provider.display_name));
    }
  };

  // Handle text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setExperience(e.target.value);
    setHasEditedText(true);
  };

  // Submit Olera review (for providers without Google Place ID)
  const handleSubmitOleraReview = async () => {
    if (!provider || !experience.trim() || rating === 0 || oleraSubmitting) return;

    setOleraSubmitting(true);

    try {
      const res = await fetch(`/api/provider/${provider.slug}/olera-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewer_name: clientName || "Anonymous",
          rating,
          review_text: experience.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit review");
      }

      setSubmittedReview({ rating, review_text: experience.trim() });
      setOleraSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setOleraSubmitting(false);
    }
  };

  // Copy to clipboard and open Google
  const handleShareOnGoogle = async () => {
    if (!provider?.google_place_id || !experience.trim()) return;

    const reviewText = experience.trim();

    try {
      await navigator.clipboard.writeText(reviewText);
      setCopied(true);

      setTimeout(() => {
        setShowSuccess(true);
        window.open(
          `https://search.google.com/local/writereview?placeid=${provider.google_place_id}`,
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
      setCopied(true);

      setTimeout(() => {
        setShowSuccess(true);
        window.open(
          `https://search.google.com/local/writereview?placeid=${provider.google_place_id}`,
          "_blank",
          "noopener,noreferrer"
        );
      }, 600);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col">
        <MinimalHeader />
        <div className="flex-1 flex items-center justify-center" role="status" aria-label="Loading">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !provider) {
    return (
      <div className="min-h-screen min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col">
        <MinimalHeader />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm animate-fade-in">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1.5">{error || "Provider not found"}</h1>
            <p className="text-sm text-gray-500 mb-5">The link may be incorrect or expired.</p>
            <Link
              href="/"
              className="inline-flex px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-full transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Olera review success state (for providers without Google Place ID)
  if (!provider.google_place_id && oleraSuccess && submittedReview) {
    return (
      <div className="min-h-screen min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col">
        <MinimalHeader />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm animate-fade-in">
            {/* Celebratory icon with bounce */}
            <div className="w-18 h-18 mx-auto mb-5 relative animate-success-bounce">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              {/* Subtle sparkle accents */}
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full opacity-80" />
              <div className="absolute -bottom-0.5 -left-1 w-2 h-2 bg-primary-400 rounded-full opacity-70" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Thank you for your review!</h1>
            <p className="text-sm text-gray-500 mb-6">
              Your feedback helps other families find quality care.
            </p>

            {/* Show submitted review */}
            <div className="bg-gray-50 rounded-2xl p-4 text-left mb-6">
              <div className="flex items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <StarIcon
                    key={star}
                    filled={star <= submittedReview.rating}
                    className={`w-4 h-4 ${star <= submittedReview.rating ? "text-amber-400" : "text-gray-300"}`}
                  />
                ))}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                {submittedReview.review_text}
              </p>
            </div>

            <Link
              href={`/provider/${provider.slug}`}
              className="inline-flex px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-full transition-colors"
            >
              View their profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Olera review form (for providers without Google Place ID)
  if (!provider.google_place_id) {
    const displayRatingOlera = hoverRating || rating;
    const providerDisplayNameOlera = truncateName(provider.display_name);

    return (
      <div className="min-h-screen min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col">
        <MinimalHeader />

        <main className="flex-1 flex items-center justify-center p-4 py-6">
          <div className="w-full max-w-md animate-fade-in">
            {/* Main card - contains everything */}
            <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgb(0,0,0,0.06)] border border-gray-200/60 overflow-hidden">
              {/* Provider header - compact */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-primary-50 flex-shrink-0 ring-2 ring-white shadow-sm">
                    {provider.image_url ? (
                      <Image src={provider.image_url} alt="" width={48} height={48} className="w-full h-full object-cover" priority />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-50">
                        <span className="text-lg font-bold text-primary-600">{provider.display_name.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-semibold text-gray-900 truncate">{provider.display_name}</h1>
                    {provider.city && provider.state && (
                      <p className="text-sm text-gray-500">{provider.city}, {provider.state}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Form content */}
              <div className="px-6 py-5">
                {/* Personalized greeting */}
                {clientName && (
                  <p className="text-sm text-primary-600 font-medium mb-4 text-center">
                    Hi {clientName}! Thanks for sharing your feedback.
                  </p>
                )}

                {/* Title + subtitle + stars as unified stack */}
                <div className="text-center mb-6">
                  <h2 className="text-xl font-medium text-gray-900">
                    How was your experience?
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5 mb-4">
                    with {providerDisplayNameOlera}
                  </p>

                  {/* Star rating - larger on desktop */}
                  <div className="flex items-center justify-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleRatingSelect(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className={`p-2 rounded-xl transition-all duration-150 ${
                          star <= displayRatingOlera
                            ? "text-amber-400 scale-110"
                            : "text-gray-300 hover:text-amber-300"
                        }`}
                        aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                      >
                        <StarIcon filled={star <= displayRatingOlera} className="w-9 h-9 sm:w-10 sm:h-10" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating label - consistent single words */}
                {rating > 0 && (
                  <p className="text-center text-sm text-gray-500 -mt-4 mb-5 animate-fade-in">
                    {rating === 5 && "Excellent"}
                    {rating === 4 && "Great"}
                    {rating === 3 && "Good"}
                    {rating === 2 && "Fair"}
                    {rating === 1 && "Poor"}
                  </p>
                )}

                {/* Text area - appears after rating */}
                <div className={`transition-all duration-200 ${rating > 0 ? "opacity-100 max-h-[500px]" : "opacity-50 max-h-28"}`}>
                  {rating > 0 && (
                    <p className="text-xs text-gray-500 mb-2 text-center">
                      Mention caregivers, services, or moments that stood out
                    </p>
                  )}
                  <textarea
                    value={experience}
                    onChange={handleTextChange}
                    disabled={rating === 0}
                    rows={4}
                    placeholder={rating > 0 ? "What made this experience memorable?" : "Select a rating to start"}
                    className="w-full px-4 py-3.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200 resize-y min-h-[110px] leading-relaxed disabled:bg-gray-50 disabled:border-gray-200 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="button"
                  onClick={handleSubmitOleraReview}
                  disabled={!experience.trim() || rating === 0 || oleraSubmitting}
                  className={`w-full py-3.5 mt-6 rounded-full font-medium text-[15px] transition-all duration-200 flex items-center justify-center gap-2 ${
                    oleraSubmitting
                      ? "bg-gray-400 text-white cursor-wait"
                      : experience.trim() && rating > 0
                      ? "bg-gray-900 hover:bg-gray-800 text-white shadow-lg shadow-gray-900/10 active:scale-[0.98]"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {oleraSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Review"
                  )}
                </button>

                {/* Olera note - below button */}
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <Image src="/images/olera-logo.png" alt="" width={14} height={14} className="object-contain" />
                  <p className="text-xs text-gray-400">Review will appear on Olera</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-gray-400 mt-6">
              Powered by{" "}
              <Link href="/" className="text-gray-500 hover:text-gray-600 transition-colors">
                Olera
              </Link>
            </p>
          </div>
        </main>

        <style jsx global>{`
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fade-in 0.25s ease-out;
          }
          @keyframes success-bounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          .animate-success-bounce {
            animation: success-bounce 0.4s ease-out;
          }
        `}</style>
      </div>
    );
  }

  // Success state
  if (showSuccess) {
    return (
      <div className="min-h-screen min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col">
        <MinimalHeader />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm animate-fade-in">
            {/* Celebratory icon with bounce */}
            <div className="w-18 h-18 mx-auto mb-5 relative animate-success-bounce">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              {/* Subtle sparkle accents */}
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full opacity-80" />
              <div className="absolute -bottom-0.5 -left-1 w-2 h-2 bg-primary-400 rounded-full opacity-70" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Review copied!</h1>
            <p className="text-sm text-gray-500 mb-6">Paste it in the Google window that just opened.</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => window.open(`https://search.google.com/local/writereview?placeid=${provider.google_place_id}`, "_blank")}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm"
              >
                <GoogleIcon className="w-4 h-4" />
                Open Google again
              </button>
              <Link
                href={`/provider/${provider.slug}`}
                className="block text-sm text-gray-500 hover:text-gray-600 transition-colors py-2"
              >
                Back to profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main review form - compact, everything in viewport
  const displayRating = hoverRating || rating;
  const providerDisplayName = truncateName(provider.display_name);

  return (
    <div className="min-h-screen min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col">
      <MinimalHeader />

      <main className="flex-1 flex items-center justify-center p-4 py-6">
        <div className="w-full max-w-md animate-fade-in">
          {/* Main card - contains everything */}
          <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgb(0,0,0,0.06)] border border-gray-200/60 overflow-hidden">
            {/* Provider header - compact */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-primary-50 flex-shrink-0 ring-2 ring-white shadow-sm">
                  {provider.image_url ? (
                    <Image src={provider.image_url} alt="" width={48} height={48} className="w-full h-full object-cover" priority />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-50">
                      <span className="text-lg font-bold text-primary-600">{provider.display_name.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="font-semibold text-gray-900 truncate">{provider.display_name}</h1>
                  {provider.city && provider.state && (
                    <p className="text-sm text-gray-500">{provider.city}, {provider.state}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Form content */}
            <div className="px-6 py-5">
              {/* Personalized greeting */}
              {clientName && (
                <p className="text-sm text-primary-600 font-medium mb-4 text-center">
                  Hi {clientName}! Thanks for sharing your feedback.
                </p>
              )}

              {/* Title + subtitle + stars as unified stack */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-medium text-gray-900">
                  How was your experience?
                </h2>
                <p className="text-sm text-gray-500 mt-0.5 mb-4">
                  with {providerDisplayName}
                </p>

                {/* Star rating - larger on desktop */}
                <div className="flex items-center justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingSelect(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className={`p-2 rounded-xl transition-all duration-150 ${
                        star <= displayRating
                          ? "text-amber-400 scale-110"
                          : "text-gray-300 hover:text-amber-300"
                      }`}
                      aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                    >
                      <StarIcon filled={star <= displayRating} className="w-9 h-9 sm:w-10 sm:h-10" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Rating label - consistent single words */}
              {rating > 0 && (
                <p className="text-center text-sm text-gray-500 -mt-4 mb-5 animate-fade-in">
                  {rating === 5 && "Excellent"}
                  {rating === 4 && "Great"}
                  {rating === 3 && "Good"}
                  {rating === 2 && "Fair"}
                  {rating === 1 && "Poor"}
                </p>
              )}

              {/* Text area - appears after rating */}
              <div className={`transition-all duration-200 ${rating > 0 ? "opacity-100 max-h-[500px]" : "opacity-50 max-h-28"}`}>
                {rating > 0 && (
                  <p className="text-xs text-gray-500 mb-2 text-center">
                    Mention caregivers, services, or moments that stood out
                  </p>
                )}
                <textarea
                  value={experience}
                  onChange={handleTextChange}
                  disabled={rating === 0}
                  rows={4}
                  placeholder={rating > 0 ? "What made this experience memorable?" : "Select a rating to start"}
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200 resize-y min-h-[110px] leading-relaxed disabled:bg-gray-50 disabled:border-gray-200 disabled:cursor-not-allowed"
                />
              </div>

              {/* Share button - more spacing from textarea */}
              <button
                type="button"
                onClick={handleShareOnGoogle}
                disabled={!experience.trim() || rating === 0}
                className={`w-full py-3.5 mt-6 rounded-full font-medium text-[15px] transition-all duration-200 flex items-center justify-center gap-2 ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : experience.trim() && rating > 0
                    ? "bg-gray-900 hover:bg-gray-800 text-white shadow-lg shadow-gray-900/10 active:scale-[0.98]"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                {copied ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Opening Google...
                  </>
                ) : (
                  "Share on Google"
                )}
              </button>

              {/* Google note - below button */}
              <div className="flex items-center justify-center gap-1.5 mt-3">
                <GoogleIcon className="w-3.5 h-3.5" />
                <p className="text-xs text-gray-400">Requires a Google account</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-6">
            Powered by{" "}
            <Link href="/" className="text-gray-500 hover:text-gray-600 transition-colors">
              Olera
            </Link>
          </p>
        </div>
      </main>

      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.25s ease-out;
        }
        @keyframes success-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-success-bounce {
          animation: success-bounce 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}

// ── Default Export with Suspense ──

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen min-h-dvh bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ReviewPageContent />
    </Suspense>
  );
}

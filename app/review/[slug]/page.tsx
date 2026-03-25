"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Select from "@/components/ui/Select";

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

type Step = "rating" | "details" | "success";

const RELATIONSHIPS = [
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

const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

// ── Helper Components ──

function StarRating({
  value,
  onChange,
  hoverValue,
  onHover,
}: {
  value: number;
  onChange: (rating: number) => void;
  hoverValue: number;
  onHover: (rating: number) => void;
}) {
  const displayValue = hoverValue || value;

  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => onHover(star)}
          onMouseLeave={() => onHover(0)}
          className="p-2 sm:p-1.5 transition-transform hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-lg min-w-[48px] min-h-[48px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
          aria-label={`Rate ${star} stars`}
        >
          <svg
            className={`w-10 h-10 sm:w-11 sm:h-11 transition-colors duration-150 ${
              star <= displayValue ? "text-primary-500" : "text-gray-200"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const steps = [
    { id: "rating", label: "Rating" },
    { id: "details", label: "Details" },
  ];

  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              idx < currentIndex
                ? "bg-primary-600 text-white"
                : idx === currentIndex
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {idx < currentIndex ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              idx + 1
            )}
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-12 sm:w-16 h-0.5 mx-2 transition-colors ${
                idx < currentIndex ? "bg-primary-600" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Minimal Header Component ──

function MinimalHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
      <div className="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <Link href="/" className="flex items-center space-x-2">
          <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" />
          <span className="text-xl font-bold text-gray-900">Olera</span>
        </Link>

        {/* Hamburger menu button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Menu"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-gray-200 shadow-xl z-50 overflow-hidden">
                <nav className="py-2">
                  <Link
                    href="/browse"
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Find Care
                  </Link>
                  <Link
                    href="/caregiver-support"
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Caregiver Support
                  </Link>
                  <Link
                    href="/benefits-center"
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Benefits Center
                  </Link>
                  <Link
                    href="/medjobs"
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    MedJobs
                  </Link>
                  <div className="border-t border-gray-100 my-1" />
                  <Link
                    href="/for-providers"
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    For Providers
                  </Link>
                </nav>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Main Page Component ──

function ReviewPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const refSource = searchParams.get("ref") || "direct";
  const prefillName = searchParams.get("name") || "";

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [step, setStep] = useState<Step>("rating");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [relationship, setRelationship] = useState("");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [reviewerName, setReviewerName] = useState(prefillName);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Google share state
  const [copiedForGoogle, setCopiedForGoogle] = useState(false);

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

  const handleSubmit = async () => {
    if (!provider) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/reviews/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.id,
          rating,
          relationship,
          title: title.trim() || null,
          comment: comment.trim(),
          reviewer_name: reviewerName.trim() || "Anonymous",
          ref_source: refSource,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit review");
      }

      setStep("success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  // Share on Google: copy review text, show feedback, then open Google
  const handleShareOnGoogle = async () => {
    if (!provider?.google_place_id) return;

    // Build the review text to copy
    const reviewText = title.trim()
      ? `${title.trim()}\n\n${comment.trim()}`
      : comment.trim();

    try {
      await navigator.clipboard.writeText(reviewText);
      setCopiedForGoogle(true);

      // Open Google after a brief delay so user sees the "copied" feedback
      setTimeout(() => {
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
      setCopiedForGoogle(true);

      setTimeout(() => {
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
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white flex flex-col">
        <MinimalHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !provider) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white flex flex-col">
        <MinimalHeader />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-xl font-display font-bold text-gray-900 mb-2">
            {error || "Provider not found"}
          </h1>
          <p className="text-gray-500 mb-6">
            We couldn&apos;t find this provider. The link may be incorrect or expired.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 active:scale-[0.99] text-white font-semibold rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 shadow-sm hover:shadow min-h-[48px]"
          >
            Go to homepage
          </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white flex flex-col">
        <MinimalHeader />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
          {/* Main success card */}
          <div
            className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-8 text-center"
            style={{ animation: "card-enter 0.3s ease-out both" }}
          >
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center ring-4 ring-green-50/50 shadow-sm">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">
              Thank you!
            </h1>
            <p className="text-gray-500 mb-6 leading-relaxed">
              Your review for <span className="font-medium text-gray-700">{provider.display_name}</span> has been submitted successfully.
            </p>

            {/* Google Share Card - only show if provider has place_id */}
            {provider.google_place_id && (
              <div
                className="bg-gray-50 border border-gray-100 rounded-xl p-5 mb-6 text-left"
                style={{ animation: "card-enter 0.3s ease-out both", animationDelay: "150ms" }}
              >
                <div className="flex items-start gap-3 mb-4">
                  {/* Google "G" logo */}
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      Help them get discovered
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Share on Google so more families can find quality care
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleShareOnGoogle}
                  disabled={copiedForGoogle}
                  className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    copiedForGoogle
                      ? "bg-primary-50 text-primary-700 border border-primary-200 focus-visible:ring-primary-500"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99] focus-visible:ring-gray-300 shadow-sm"
                  }`}
                >
                  {copiedForGoogle ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span>Review copied — opening Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      <span>Share on Google</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray-400 text-center mt-2.5">
                  We&apos;ll copy your review so you can paste it on Google
                </p>
              </div>
            )}

            <Link
              href={`/provider/${provider.slug}`}
              className={`inline-flex items-center gap-2 px-6 py-3.5 font-semibold rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-h-[52px] ${
                provider.google_place_id
                  ? "text-gray-600 hover:text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-300"
                  : "bg-primary-600 hover:bg-primary-700 active:bg-primary-800 active:scale-[0.99] text-white shadow-sm hover:shadow focus-visible:ring-primary-500"
              }`}
            >
              View provider profile
            </Link>
          </div>
          </div>
        </div>
        <style jsx global>{`
          @keyframes card-enter {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white flex flex-col">
      <MinimalHeader />
      <style jsx global>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex-1">
        <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        {/* Provider Header */}
        <div className="text-center mb-8" style={{ animation: "card-enter 0.25s ease-out both" }}>
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden bg-gray-100 ring-4 ring-white shadow-sm">
            {provider.image_url ? (
              <Image
                src={provider.image_url}
                alt={provider.display_name}
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-50">
                <span className="text-2xl font-bold text-primary-600">
                  {provider.display_name.charAt(0)}
                </span>
              </div>
            )}
          </div>
          <h1 className="text-lg font-display font-bold text-gray-900">
            Review {provider.display_name}
          </h1>
          {provider.city && provider.state && (
            <p className="text-sm text-gray-500 mt-1">
              {provider.city}, {provider.state}
            </p>
          )}
        </div>

        {/* Step Indicator */}
        <div style={{ animation: "card-enter 0.25s ease-out both", animationDelay: "50ms" }}>
          <StepIndicator currentStep={step} />
        </div>

        {/* Form Card */}
        <div
          className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden"
          style={{ animation: "card-enter 0.3s ease-out both", animationDelay: "100ms" }}
        >
          {/* Step 1: Rating */}
          {step === "rating" && (
            <div className="p-6">
              <div className="text-center mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  How was your experience?
                </h2>
                <p className="text-sm text-gray-500">
                  Select a rating below
                </p>
              </div>

              {/* Star Rating */}
              <div className="flex flex-col items-center mb-8">
                <StarRating
                  value={rating}
                  onChange={setRating}
                  hoverValue={hoverRating}
                  onHover={setHoverRating}
                />
                {(hoverRating || rating) > 0 && (
                  <p className="mt-3 text-sm font-medium text-primary-600">
                    {RATING_LABELS[hoverRating || rating]}
                  </p>
                )}
              </div>

              {/* Relationship */}
              <div className="mb-6">
                <Select
                  label="Your relationship"
                  required
                  options={RELATIONSHIPS}
                  value={relationship}
                  onChange={setRelationship}
                  placeholder="Select your relationship"
                />
              </div>

              {/* Next Button */}
              <button
                type="button"
                onClick={() => setStep("details")}
                disabled={rating === 0 || !relationship}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 active:scale-[0.99] text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[52px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 shadow-sm hover:shadow"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Details */}
          {step === "details" && (
            <div className="p-6">
              {/* Summary bar */}
              <button
                type="button"
                onClick={() => setStep("rating")}
                className="w-full flex items-center justify-between p-3.5 mb-6 bg-vanilla-50 border border-warm-100 rounded-xl hover:bg-vanilla-100 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 min-h-[56px]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${star <= rating ? "text-primary-500" : "text-gray-200"}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm text-gray-600">{relationship}</span>
                </div>
                <span className="text-xs text-primary-600 font-medium">Edit</span>
              </button>

              {/* Your Name */}
              <div className="mb-5">
                <label htmlFor="reviewer-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Your name <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  id="reviewer-name"
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="How should we display your name?"
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all min-h-[48px]"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Leave blank to post anonymously
                </p>
              </div>

              {/* Title */}
              <div className="mb-5">
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Summarize your experience"
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all min-h-[48px]"
                />
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-2">
                  Your review <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={5}
                  placeholder="Share details about your experience with this provider..."
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none leading-relaxed"
                />
              </div>

              {/* Error message */}
              {submitError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-sm text-red-600">{submitError}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!comment.trim() || submitting}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 active:scale-[0.99] text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[52px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 shadow-sm hover:shadow"
              >
                {submitting ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Submitting...</span>
                  </>
                ) : (
                  "Submit review"
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Powered by <Link href="/" className="text-primary-600 hover:text-primary-700 hover:underline transition-colors">Olera</Link>
        </p>
        </div>
      </div>
    </div>
  );
}

// ── Default Export with Suspense ──

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ReviewPageContent />
    </Suspense>
  );
}

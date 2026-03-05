"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { avatarGradient } from "@/components/portal/ConnectionDetailContent";
import type { InterestedProvider } from "@/hooks/useInterestedProviders";
import type { OrganizationMetadata } from "@/lib/types";
import Button from "@/components/ui/Button";

interface InterestedDetailContentProps {
  item: InterestedProvider;
  onClose: () => void;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}

function StarRating({ rating, count }: { rating: number; count?: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="text-sm font-bold text-gray-900">{rating.toFixed(1)}</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: full }).map((_, i) => (
          <svg key={`f${i}`} className="w-3.5 h-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
        {hasHalf && (
          <svg className="w-3.5 h-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
            <defs><clipPath id="half"><rect x="0" y="0" width="10" height="20" /></clipPath></defs>
            <path clipPath="url(#half)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            <path fill="#e5e7eb" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" clipPath="url(#halfR)" />
          </svg>
        )}
        {Array.from({ length: empty }).map((_, i) => (
          <svg key={`e${i}`} className="w-3.5 h-3.5 text-gray-200" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-gray-400">({count})</span>
      )}
    </div>
  );
}

export default function InterestedDetailContent({
  item,
  onClose,
  onAccept,
  onDecline,
}: InterestedDetailContentProps) {
  const [actionState, setActionState] = useState<
    "idle" | "accepting" | "declining" | "accepted"
  >("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when switching between providers
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [item.id]);

  const profile = item.providerProfile;
  const name = profile?.display_name || "Unknown Provider";
  const imageUrl = profile?.image_url;
  const initial = name.charAt(0).toUpperCase();
  const location = [profile?.city, profile?.state].filter(Boolean).join(", ");
  const description = profile?.description;
  const slug = profile?.slug;

  const careTypes = profile?.care_types || [];
  const typeLabel = careTypes[0] || "Care Provider";

  // Category label — human-readable
  const categoryLabel = profile?.category
    ? profile.category
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
    : typeLabel;

  // Received date
  const shortDate = new Date(item.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const matchReasons =
    ((item.metadata as Record<string, unknown>)?.match_reasons as string[]) ||
    [];

  // Provider metadata for pricing/payment/rating
  const provMeta = (profile?.metadata || {}) as OrganizationMetadata & Record<string, unknown>;
  const priceRange = provMeta.price_range || "Contact for pricing";
  const acceptedPayments = (provMeta.accepted_payments as string[]) || [];
  // Merge legacy booleans for backwards compatibility
  const paymentMethods: string[] = [...acceptedPayments];
  if (provMeta.accepts_medicare && !paymentMethods.includes("Medicare")) paymentMethods.push("Medicare");
  if (provMeta.accepts_medicaid && !paymentMethods.includes("Medicaid")) paymentMethods.push("Medicaid");
  if (provMeta.accepts_private_insurance && !paymentMethods.includes("Private Health Insurance")) paymentMethods.push("Private Health Insurance");
  if (paymentMethods.length === 0) paymentMethods.push("Contact provider");

  // Rating from iOS data (stored in metadata by hook)
  const googleRating = (provMeta.google_rating as number) || 0;
  const reviewCount = (provMeta.review_count as number) || undefined;

  const handleAccept = async () => {
    setActionState("accepting");
    try {
      await onAccept(item.id);
      setActionState("accepted");
    } catch {
      setActionState("idle");
    }
  };

  const handleDecline = async () => {
    setActionState("declining");
    try {
      await onDecline(item.id);
    } catch {
      setActionState("idle");
    }
  };

  // ── Accepted confirmation state ──
  if (actionState === "accepted") {
    return (
      <div className="flex flex-col h-full">
        {/* Close button */}
        <div className="flex justify-end px-7 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center px-7">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Connected!
            </h3>
            <p className="text-sm text-gray-500 mb-6 max-w-[280px] mx-auto">
              You can now message {name} in My Connections.
            </p>
            <a href="/portal/inbox">
              <Button size="sm">Go to Messages</Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal detail view ──
  // Layout matches ConnectionDetailContent: header + buttons are fixed (shrink-0),
  // only the middle content area scrolls if needed.
  return (
    <div className="flex flex-col h-full">
      {/* ── HEADER: fixed at top (shrink-0), same as ConnectionDetailContent ── */}
      <div className="px-7 pt-5 pb-4 shrink-0 border-b border-gray-100">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="shrink-0">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={name}
                width={56}
                height={56}
                sizes="56px"
                className="w-14 h-14 rounded-xl object-cover"
              />
            ) : (
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                style={{ background: avatarGradient(name) }}
              >
                {initial}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-display font-bold text-gray-900 leading-snug">
                  {name}
                </h2>
                <p className="text-sm text-gray-500 leading-tight">
                  {categoryLabel}{location ? ` \u00B7 ${location}` : ""}
                </p>
                {googleRating > 0 && (
                  <StarRating rating={googleRating} count={reviewCount} />
                )}
              </div>

              {/* Status pill + Close button */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Interested
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Profile link + received date */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {slug && (
                <a
                  href={`/provider/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                >
                  View profile
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Reached out {shortDate}
            </p>
          </div>
        </div>
      </div>

      {/* ── CONTENT: scrollable middle area (match reasons, about, pricing) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-7 py-4">
        {/* Match reasons */}
        {matchReasons.length > 0 && (
          <div className="pb-4 mb-4 border-b border-gray-100">
            <h3 className="text-sm font-display font-bold text-gray-900 mb-3">
              Why this provider reached out
            </h3>
            <div className="space-y-2">
              {matchReasons.map((reason) => (
                <div key={reason} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-warm-100/70 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700">{reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* About */}
        {description && (
          <div className="pb-4 mb-4 border-b border-gray-100">
            <h3 className="text-sm font-display font-bold text-gray-900 mb-2">About</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {description}
            </p>
          </div>
        )}

        {/* Pricing & Payment */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Pricing
            </span>
            <span className="text-sm text-gray-700">{priceRange}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Payment
            </span>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {paymentMethods.map((method) => (
                <span
                  key={method}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F5F4F1] text-gray-700"
                >
                  {method}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER: Accept / Decline buttons pinned to bottom ── */}
      <div className="shrink-0 px-7 py-4 border-t border-gray-100">
        <div className="flex gap-3">
          <Button
            size="sm"
            onClick={handleAccept}
            disabled={actionState !== "idle"}
            loading={actionState === "accepting"}
            className="flex-1"
          >
            Accept &amp; Connect
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDecline}
            disabled={actionState !== "idle"}
            loading={actionState === "declining"}
            className="flex-1"
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}

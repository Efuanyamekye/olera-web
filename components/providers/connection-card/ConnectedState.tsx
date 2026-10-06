"use client";

import Link from "next/link";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import NextBestOption from "./NextBestOption";

interface ConnectedStateProps {
  providerName: string;
  providerSlug: string;
  providerCity?: string | null;
  providerState?: string | null;
  providerImage?: string | null;
  careTypes?: string[];
  priceRange?: string | null;
  /** @deprecated Not currently used in the new UI */
  phone?: string | null;
  /** @deprecated Not currently used in the new UI */
  requestDate?: string | null;
  connectionId: string | null;
  /** This visit sent the inquiry: offer the next best option once. */
  justSent?: boolean;
}

/**
 * Post-connection CTA that matches the LoggedInFamilyCTA layout.
 * Shows [♡ Save] [Go to inbox →] pattern for consistency.
 */
export default function ConnectedState({
  providerName,
  providerSlug,
  providerCity,
  providerState,
  providerImage,
  careTypes = [],
  priceRange,
  connectionId,
  justSent = false,
}: ConnectedStateProps) {
  const { isSaved, toggleSave } = useSavedProviders();
  const providerIsSaved = isSaved(providerSlug);

  const careLabel = careTypes.length > 0 ? careTypes[0] : null;
  const locationStr = [providerCity, providerState].filter(Boolean).join(", ");

  const inboxHref = connectionId
    ? `/portal/inbox?id=${connectionId}`
    : "/portal/inbox";

  const handleSave = () => {
    toggleSave({
      providerId: providerSlug,
      slug: providerSlug,
      name: providerName,
      location: locationStr,
      careTypes: careTypes,
      image: providerImage || null,
    });
  };

  return (
    <div>
      {/* Success banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 rounded-xl mb-4 border border-emerald-100">
        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-600"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-gray-900">
          Connected with {providerName}
        </p>
      </div>

      {/* Pricing context - matches LoggedInFamilyCTA */}
      {priceRange ? (
        <div className="mb-4">
          {(careLabel || locationStr) && (
            <p className="text-[13px] text-gray-500 font-medium mb-1">
              {careLabel}{locationStr ? ` in ${locationStr}` : ""}
            </p>
          )}
          <p className="text-[24px] font-bold text-gray-900 tracking-tight leading-none">
            {priceRange}
          </p>
          <p className="text-[13px] text-gray-600 font-semibold mt-1.5">
            Area estimate — not this provider&apos;s actual price
          </p>
        </div>
      ) : (
        <div className="mb-4">
          {(careLabel || locationStr) && (
            <p className="text-[13px] text-gray-500 font-medium mb-1">
              {careLabel}{locationStr ? ` in ${locationStr}` : ""}
            </p>
          )}
          <p className="text-[18px] font-bold text-gray-900 leading-snug">
            Contact for pricing
          </p>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-100 mb-4" />

      {/* CTA section header */}
      <p className="text-[15px] font-semibold text-gray-900 mb-3">
        Continue the conversation
      </p>

      {/* Side-by-side buttons: [♡] [Go to inbox] */}
      <div className="flex items-center gap-2">
        {/* Save button (left, smaller) */}
        <button
          type="button"
          onClick={handleSave}
          className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-xl border-2 transition-all ${
            providerIsSaved
              ? "border-primary-500 bg-primary-50 text-primary-600"
              : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
          }`}
          aria-label={providerIsSaved ? "Saved" : "Save for later"}
        >
          {providerIsSaved ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          )}
        </button>

        {/* Primary CTA (right, takes remaining space) */}
        <Link
          href={inboxHref}
          className="flex-1 py-3 px-4 rounded-xl text-[15px] font-semibold bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 transition-all duration-200 flex items-center justify-center gap-2"
        >
          Go to inbox
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
      </div>

      {/* Trust signal */}
      <p className="text-[13px] text-gray-600 text-center font-medium mt-3 flex items-center justify-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-primary-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
        No spam. No sales calls.
      </p>

      {justSent && connectionId && <NextBestOption connectionId={connectionId} providerName={providerName} />}
    </div>
  );
}

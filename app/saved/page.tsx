"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import ProviderCard, {
  type Provider,
} from "@/components/providers/ProviderCard";

/** Map a saved entry to the Provider shape expected by ProviderCard */
function toProvider(entry: {
  providerId: string;
  slug: string;
  name: string;
  location: string;
  careTypes: string[];
  image: string | null;
  rating?: number;
}): Provider {
  return {
    id: entry.providerId,
    slug: entry.slug,
    name: entry.name,
    image: entry.image || "/placeholder-provider.jpg",
    address: entry.location,
    rating: entry.rating || 0,
    priceRange: "Contact for pricing",
    primaryCategory: entry.careTypes[0] || "Senior Care",
    careTypes: entry.careTypes,
    highlights: [],
    verified: false,
  };
}

export default function SavedProvidersPage() {
  const { user, activeProfile, profiles, openAuth } = useAuth();
  const { savedProviders } = useSavedProviders();
  const [shareLabel, setShareLabel] = useState<"share" | "copied">("share");
  const [showToast, setShowToast] = useState(false);

  // Check if user is logged in but doesn't have a family profile
  const hasFamilyProfile = profiles.some((p) => p.type === "family");
  const isNonFamilyUser = user && !hasFamilyProfile;

  // Dynamic label for the account type hint
  const accountTypeLabel = activeProfile?.type === "organization"
    ? "provider"
    : (activeProfile?.type === "caregiver" || activeProfile?.type === "student")
    ? "caregiver"
    : "current";

  // Show conversion page for non-family logged-in users
  if (isNonFamilyUser) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* Header */}
          <div className="mb-6">
            <h1 className="font-display text-display-sm sm:text-display-md font-semibold text-gray-900 tracking-tight">
              Saved
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Save providers you&apos;re interested in
            </p>
          </div>

          {/* Conversion card */}
          <div className="relative w-full max-w-lg">
            <div className="relative bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

              <div className="px-8 py-10 sm:px-10 sm:py-12 text-center">
                <div className="relative inline-flex mb-6">
                  <div className="absolute inset-0 bg-primary-400/20 rounded-2xl blur-xl scale-150" />
                  <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                </div>

                <h2 className="text-xl font-display font-bold text-gray-900 mb-2">
                  Save providers with a family account
                </h2>

                <p className="text-[15px] text-gray-500 leading-relaxed mb-6 max-w-sm mx-auto">
                  Looking for care for yourself or a loved one? Create a family account to save and compare providers.
                </p>

                <button
                  onClick={() => openAuth({ defaultMode: "sign-up", intent: "family" })}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary-600/25 hover:shadow-lg hover:shadow-primary-600/30 active:scale-[0.98]"
                >
                  Create Family Account
                </button>

                <p className="text-sm text-gray-500 mt-4">
                  Already have a family account?{" "}
                  <button
                    onClick={() => openAuth({ defaultMode: "sign-in", intent: "family" })}
                    className="text-primary-600 font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </p>

                <div className="mt-8 pt-6 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    Use a different email than your {accountTypeLabel} account. Family accounts are separate for privacy.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";

    if (navigator.share) {
      try {
        await navigator.share({ title: "My Saved Providers — Olera", url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareLabel("copied");
      setShowToast(true);
      setTimeout(() => {
        setShareLabel("share");
        setShowToast(false);
      }, 2500);
    } catch {
      // Clipboard not available
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast notification */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
          showToast
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Link copied to clipboard
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-display-sm sm:text-display-md font-semibold text-gray-900 tracking-tight">
              Saved
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {savedProviders.length > 0
                ? `${savedProviders.length} provider${savedProviders.length !== 1 ? "s" : ""}`
                : "Providers you save will appear here"}
            </p>
          </div>
          {savedProviders.length > 0 && (
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-sm font-medium text-gray-400 hover:text-gray-900 bg-transparent border-none cursor-pointer transition-colors shrink-0"
              aria-label="Share saved providers"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {shareLabel === "copied" ? "Copied!" : "Share"}
            </button>
          )}
        </div>

        {/* Banner — compact for logged-out users */}
        {savedProviders.length > 0 && !user && (
          <div className="mb-6 px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-between gap-3">
            <p className="text-sm text-primary-800">
              <span className="font-medium">Sign up</span> to sync across devices
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/browse"
                className="px-4 py-2 min-h-[40px] text-sm font-medium text-primary-700 hover:bg-primary-100 rounded-lg transition-colors whitespace-nowrap flex items-center"
              >
                Browse
              </Link>
              <button
                onClick={() => openAuth({ defaultMode: "sign-up", intent: "family" })}
                className="px-4 py-2 min-h-[40px] bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                Sign up
              </button>
            </div>
          </div>
        )}

        {/* Provider grid or empty state */}
        {savedProviders.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedProviders.map((entry) => (
              <ProviderCard
                key={entry.providerId}
                provider={toProvider(entry)}
              />
            ))}
          </div>
        ) : (
          <div>
            <div className="relative w-full max-w-md">
              {/* Premium card */}
              <div className="relative bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
                {/* Subtle gradient accent at top */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

                <div className="px-8 py-10 sm:px-10 sm:py-12 text-center">
                  {/* Icon with glow effect */}
                  <div className="relative inline-flex mb-6">
                    <div className="absolute inset-0 bg-primary-400/20 rounded-2xl blur-xl scale-150" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
                      <svg
                        className="w-8 h-8 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Headline */}
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-2">
                    Find providers you love
                  </h2>

                  {/* Description */}
                  <p className="text-[15px] text-gray-500 leading-relaxed mb-8 max-w-sm mx-auto">
                    Browse care providers in your area and save your favorites here for easy comparison.
                  </p>

                  {/* CTA Buttons */}
                  <div className="flex items-center justify-center gap-3">
                    <Link
                      href="/browse"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary-600/25 hover:shadow-lg hover:shadow-primary-600/30 active:scale-[0.98]"
                    >
                      Start browsing
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                    {!user && (
                      <button
                        onClick={() => openAuth({ defaultMode: "sign-up", intent: "family" })}
                        className="inline-flex items-center px-5 py-3 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
                      >
                        Sign up
                      </button>
                    )}
                  </div>

                  {/* Hint text */}
                  <p className="text-xs text-gray-400 mt-5">
                    Tap the heart icon on any provider to save them
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

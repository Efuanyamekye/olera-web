"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders, type SaveProviderData } from "@/hooks/use-saved-providers";

interface MobileGalleryActionBarProps {
  provider: SaveProviderData;
}

export default function MobileGalleryActionBar({ provider }: MobileGalleryActionBarProps) {
  const router = useRouter();
  const { activeProfile, openAuth } = useAuth();
  const { isSaved, toggleSave } = useSavedProviders();
  const saved = isSaved(provider.providerId);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const heartButtonRef = useRef<HTMLButtonElement>(null);

  // Check if user is a non-family profile
  const isNonFamilyProfile = activeProfile && activeProfile.type !== "family";

  // Dynamic label for account type hint
  const accountTypeLabel = activeProfile?.type === "organization"
    ? "provider"
    : (activeProfile?.type === "caregiver" || activeProfile?.type === "student")
    ? "caregiver"
    : "current";

  // Close tooltip on click outside
  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        heartButtonRef.current &&
        !heartButtonRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: provider.name,
          url: window.location.href,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleBack = () => {
    // If there's history, go back; otherwise navigate to home
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const btnClass =
    "w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center active:bg-black/70 transition-colors shadow-lg";

  return (
    <div
      className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Back */}
      <button onClick={handleBack} className={`${btnClass} pointer-events-auto`} aria-label="Go back">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Save + Share */}
      <div className="flex items-center gap-3 pointer-events-auto relative">
        <button
          ref={heartButtonRef}
          onClick={() => {
            if (isNonFamilyProfile) {
              setShowTooltip(true);
              return;
            }
            toggleSave(provider);
          }}
          className={btnClass}
          aria-label={saved ? "Unsave" : "Save"}
        >
          <svg
            className={`w-5 h-5 ${saved ? "text-primary-400" : "text-white"}`}
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>

        {/* Tooltip for non-family users */}
        {showTooltip && (
          <div
            ref={tooltipRef}
            className="absolute top-14 right-0 z-50 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-3 animate-in fade-in slide-in-from-top-1 duration-150"
          >
            <p className="text-sm text-gray-600 mb-2">
              Save providers with a family account.
            </p>
            <button
              onClick={() => {
                setShowTooltip(false);
                openAuth({ defaultMode: "sign-up", intent: "family" });
              }}
              className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              Create one →
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Use a different email than your {accountTypeLabel} account.
            </p>
          </div>
        )}

        <button onClick={handleShare} className={btnClass} aria-label="Share">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

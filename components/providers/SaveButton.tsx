"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders, type SaveProviderData } from "@/hooks/use-saved-providers";

interface SaveButtonProps {
  provider: SaveProviderData;
  variant?: "default" | "icon" | "pill";
}

export default function SaveButton({ provider, variant = "default" }: SaveButtonProps) {
  const { activeProfile, openAuth } = useAuth();
  const { isSaved, toggleSave } = useSavedProviders();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Check if user is a non-family profile (provider/caregiver/student)
  const isNonFamilyProfile = activeProfile && activeProfile.type !== "family";

  // Dynamic label for the account type hint
  const accountTypeLabel = activeProfile?.type === "organization"
    ? "provider"
    : (activeProfile?.type === "caregiver" || activeProfile?.type === "student")
    ? "caregiver"
    : "current";

  const saved = isSaved(provider.providerId);

  // Close tooltip on click outside
  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  const handleClick = () => {
    if (isNonFamilyProfile) {
      setShowTooltip(true);
      return;
    }
    toggleSave(provider);
  };

  const handleCreateAccount = () => {
    setShowTooltip(false);
    openAuth({ defaultMode: "sign-up", intent: "family" });
  };

  const tooltip = showTooltip && (
    <div
      ref={tooltipRef}
      className="absolute z-50 top-full mt-2 right-0 w-56 sm:w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-3 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      <p className="text-sm text-gray-600 mb-2">
        Save providers with a family account.
      </p>
      <button
        onClick={handleCreateAccount}
        className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
      >
        Create one →
      </button>
      <p className="text-xs text-gray-400 mt-2">
        Use a different email than your {accountTypeLabel} account.
      </p>
    </div>
  );

  if (variant === "icon") {
    return (
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleClick}
          className="w-9 h-9 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center"
        >
          <svg
            className={`w-5 h-5 ${saved ? "text-primary-600" : "text-gray-400 hover:text-gray-600"}`}
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
        {tooltip}
      </div>
    );
  }

  if (variant === "pill") {
    return (
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleClick}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
            saved
              ? "text-primary-600 border-primary-300 bg-primary-50 hover:bg-primary-100"
              : "text-primary-700 border-primary-200 hover:bg-primary-50"
          }`}
        >
          {saved ? "Saved" : "Save"}
          <svg
            className="w-4 h-4"
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
        {tooltip}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`flex items-center justify-center gap-1.5 text-sm font-medium border rounded-lg w-24 py-2 transition-colors ${
          saved
            ? "text-primary-600 border-primary-300 bg-primary-50 hover:bg-primary-100"
            : "text-gray-700 border-gray-300 hover:bg-gray-50"
        }`}
      >
        <svg
          className="w-4 h-4"
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
        {saved ? "Saved" : "Save"}
      </button>
      {tooltip}
    </div>
  );
}

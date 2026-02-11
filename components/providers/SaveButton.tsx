"use client";

import { useSavedProviders, type SaveProviderData } from "@/hooks/use-saved-providers";

interface SaveButtonProps {
  provider: SaveProviderData;
}

export default function SaveButton({ provider }: SaveButtonProps) {
  const { isSaved, toggleSave } = useSavedProviders();
  const saved = isSaved(provider.providerId);

  return (
    <button
      onClick={() => toggleSave(provider)}
      className={`flex items-center justify-center gap-1.5 text-sm font-medium border rounded-lg w-24 py-2 transition-colors ${
        saved
          ? "text-red-500 border-red-300 bg-red-50 hover:bg-red-100"
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
  );
}

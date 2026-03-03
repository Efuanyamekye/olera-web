"use client";

import { useRouter } from "next/navigation";
import { useSavedProviders, type SaveProviderData } from "@/hooks/use-saved-providers";

interface MobileGalleryActionBarProps {
  provider: SaveProviderData;
}

export default function MobileGalleryActionBar({ provider }: MobileGalleryActionBarProps) {
  const router = useRouter();
  const { isSaved, toggleSave } = useSavedProviders();
  const saved = isSaved(provider.providerId);

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

  const btnClass =
    "w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center";

  return (
    <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between md:hidden">
      {/* Back */}
      <button onClick={() => router.back()} className={btnClass} aria-label="Go back">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Save + Share */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => toggleSave(provider)}
          className={btnClass}
          aria-label={saved ? "Unsave" : "Save"}
        >
          <svg
            className={`w-5 h-5 ${saved ? "text-red-400" : "text-white"}`}
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

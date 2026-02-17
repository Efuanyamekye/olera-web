"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useSavedProviders,
  type SaveProviderData,
} from "@/hooks/use-saved-providers";

function HeartFilledIcon() {
  return (
    <svg
      className="w-5 h-5 text-red-500"
      fill="currentColor"
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
  );
}

function SavedProviderCard({
  provider,
  onUnsave,
}: {
  provider: {
    providerId: string;
    slug: string;
    name: string;
    location: string;
    careTypes: string[];
    image: string | null;
    savedAt: string;
  };
  onUnsave: (data: SaveProviderData) => void;
}) {
  const initials = provider.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Image / placeholder */}
      <div className="relative h-40 bg-gray-100">
        {provider.image ? (
          <Image
            src={provider.image}
            alt={provider.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-50">
            <span className="text-2xl font-bold text-primary-300">
              {initials}
            </span>
          </div>
        )}
        {/* Unsave button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            onUnsave({
              providerId: provider.providerId,
              slug: provider.slug,
              name: provider.name,
              location: provider.location,
              careTypes: provider.careTypes,
              image: provider.image,
            });
          }}
          className="absolute top-3 right-3 w-9 h-9 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors"
          aria-label="Remove from saved"
        >
          <HeartFilledIcon />
        </button>
      </div>

      {/* Card body */}
      <div className="p-4">
        <Link
          href={`/provider/${provider.slug}`}
          className="text-base font-semibold text-gray-900 hover:text-primary-600 transition-colors line-clamp-1"
        >
          {provider.name}
        </Link>

        {provider.location && (
          <p className="text-sm text-gray-500 mt-1">{provider.location}</p>
        )}

        {provider.careTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {provider.careTypes.slice(0, 2).map((type) => (
              <span
                key={type}
                className="text-xs font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full"
              >
                {type}
              </span>
            ))}
          </div>
        )}

        <Link
          href={`/provider/${provider.slug}`}
          className="inline-block mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          View details →
        </Link>
      </div>
    </div>
  );
}

export default function SavedProvidersPage() {
  const { user, openAuth } = useAuth();
  const { savedProviders, toggleSave } = useSavedProviders();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Saved Providers
            {savedProviders.length > 0 && (
              <span className="ml-2 text-lg font-normal text-gray-500">
                ({savedProviders.length})
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Providers you&apos;ve saved for comparison
          </p>
        </div>

        {/* Anonymous user banner */}
        {!user && savedProviders.length > 0 && (
          <div className="mb-6 px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-primary-800">
              Sign up to save more than 3 providers and keep your saves across
              sessions.
            </p>
            <button
              onClick={() => openAuth({ defaultMode: "sign-up", intent: "family" })}
              className="text-sm font-semibold text-primary-600 hover:text-primary-700 whitespace-nowrap"
            >
              Create account →
            </button>
          </div>
        )}

        {/* Provider grid or empty state */}
        {savedProviders.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedProviders.map((provider) => (
              <SavedProviderCard
                key={provider.providerId}
                provider={provider}
                onUnsave={toggleSave}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
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
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              No saved providers yet
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              Save providers while browsing to compare them later. Look for the
              heart icon on provider cards.
            </p>
            <Link
              href="/browse"
              className="inline-flex items-center px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Browse providers
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

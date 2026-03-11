"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { PROVIDERS_TABLE } from "@/lib/types/provider";
import SimilarProvidersRow from "@/components/providers/SimilarProvidersRow";
import BrowseByCareTypeSection from "@/components/home/BrowseByCareTypeSection";

const CLAIM_TOKEN_KEY = "olera_claim_token";


interface ProviderInfo {
  name: string;
  slug: string;
  imageUrl: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
}

function formatCategory(cat: string | null): string {
  if (!cat) return "";
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Deterministic gradient from provider name for personalized avatar fallback */
function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #0891b2, #0ea5e9)",
    "linear-gradient(135deg, #14b8a6, #0891b2)",
    "linear-gradient(135deg, #199087, #14b8a6)",
    "linear-gradient(135deg, #0e7490, #0ea5e9)",
    "linear-gradient(135deg, #0891b2, #2dd4bf)",
    "linear-gradient(135deg, #199087, #0ea5e9)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

/** Get up to 2 initials from a name */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function ConnectedPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const connectionId = params.connectionId as string;

  // Instant display from URL search params
  const nameFromParams = searchParams.get("name") || "";
  const slugFromParams = searchParams.get("slug") || "";
  const categoryFromParams = searchParams.get("category") || null;
  const cityFromParams = searchParams.get("city") || null;
  const stateFromParams = searchParams.get("state") || null;

  const [provider, setProvider] = useState<ProviderInfo>({
    name: nameFromParams,
    slug: slugFromParams,
    imageUrl: null,
    category: categoryFromParams,
    city: cityFromParams,
    state: stateFromParams,
  });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [claimToken, setClaimToken] = useState<string | null>(null);

  // Read claim token from localStorage (for guest inbox access)
  useEffect(() => {
    try {
      const token = localStorage.getItem(CLAIM_TOKEN_KEY);
      if (token) setClaimToken(token);
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    async function fetchProviderData() {
      if (!isSupabaseConfigured() || !connectionId) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();

        // Get the connection to find to_profile_id
        const { data: connection } = await supabase
          .from("connections")
          .select("to_profile_id")
          .eq("id", connectionId)
          .single();

        if (!connection) {
          // If we have provider info from URL params, show success anyway (guest flow)
          if (nameFromParams) {
            setLoading(false);
            return;
          }
          setNotFound(true);
          setLoading(false);
          return;
        }

        // Get provider's business_profile
        const { data: profile } = await supabase
          .from("business_profiles")
          .select("display_name, slug, image_url, category, care_types, city, state, source_provider_id")
          .eq("id", connection.to_profile_id)
          .single();

        if (!profile) {
          setLoading(false);
          return;
        }

        let imageUrl = profile.image_url;
        let category = profile.category || profile.care_types?.[0] || null;
        let city = profile.city;
        let state = profile.state;

        // Fetch from iOS provider table if we're missing any data
        if (profile.source_provider_id && (!imageUrl || !category || !city || !state)) {
          const { data: iosProvider } = await supabase
            .from(PROVIDERS_TABLE)
            .select("provider_images, provider_logo, provider_category, provider_city, provider_state")
            .eq("provider_id", profile.source_provider_id)
            .single();

          if (iosProvider) {
            if (!imageUrl) {
              imageUrl = iosProvider.provider_logo ||
                iosProvider.provider_images?.split(" | ")?.[0] || null;
            }
            if (!category) category = iosProvider.provider_category;
            if (!city) city = iosProvider.provider_city;
            if (!state) state = iosProvider.provider_state;
          }
        }

        setProvider({
          name: profile.display_name || nameFromParams,
          slug: profile.slug || slugFromParams,
          imageUrl,
          category: category || categoryFromParams,
          city: city || cityFromParams,
          state: state || stateFromParams,
        });
      } catch (err) {
        console.error("[connected] fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProviderData();
  }, [connectionId, nameFromParams, slugFromParams, categoryFromParams, cityFromParams, stateFromParams]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Connection not found</h1>
          <p className="text-gray-500 mb-6">This connection may have been removed or the link is invalid.</p>
          <Link
            href="/browse"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white transition-colors"
          >
            Browse providers
          </Link>
        </div>
      </div>
    );
  }

  const location = [provider.city, provider.state].filter(Boolean).join(", ");
  const category = formatCategory(provider.category);
  const initials = getInitials(provider.name);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Section 1: Warm hero with success card */}
      <section className="relative overflow-hidden">
        {/* Warm gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-vanilla-100 via-primary-50/40 to-gray-50" />
        {/* Subtle decorative glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary-200/20 rounded-full blur-3xl" />

        <div className="relative z-10 pt-20 sm:pt-28 pb-16 sm:pb-20">
          <div className="max-w-lg mx-auto px-4 sm:px-6 text-center">
            {/* Avatar with animated ring */}
            <div className="relative w-28 h-28 mx-auto mb-10">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="52" fill="none" stroke="#e0f2f1" strokeWidth="2.5" />
                <circle
                  cx="56" cy="56" r="52" fill="none"
                  stroke="#199087" strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray="326.73" strokeDashoffset="0"
                  className="animate-[draw_1s_ease-out_0.3s_both]"
                  transform="rotate(-90 56 56)"
                />
              </svg>

              <div className="absolute inset-[6px] rounded-full overflow-hidden">
                {provider.imageUrl ? (
                  <Image src={provider.imageUrl} alt={provider.name} fill className="object-cover" sizes="100px" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: avatarGradient(provider.name) }}
                  >
                    <span className="text-2xl font-bold text-white tracking-wide">{initials}</span>
                  </div>
                )}
              </div>

              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center ring-[3px] ring-vanilla-100">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Headline */}
            <h1 className="font-serif text-display-sm sm:text-display-md text-gray-900 mb-2">
              {loading && !provider.name
                ? "Connecting\u2026"
                : provider.name
                  ? `You\u2019re connected with ${provider.name}`
                  : "You\u2019re connected"}
            </h1>

            {/* Metadata — single quiet line */}
            {(category || location) && (
              <p className="text-sm text-gray-400 mb-10">
                {[category, location].filter(Boolean).join(" \u00B7 ")}
              </p>
            )}

            {/* CTA */}
            <Link
              href={`/portal/inbox?id=${connectionId}${claimToken ? `&token=${claimToken}` : ""}`}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-[15px] rounded-xl transition-all duration-200 shadow-md shadow-primary-600/20 hover:shadow-lg hover:shadow-primary-600/25"
            >
              Start Messaging
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Section 2: You might also like */}
      <SimilarProvidersRow excludeSlug={provider.slug} />

      {/* Section 3: Browse by Care Type */}
      <BrowseByCareTypeSection />

      {/* Ring draw animation */}
      <style jsx global>{`
        @keyframes draw {
          from { stroke-dashoffset: 326.73; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

export default function ConnectedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ConnectedPageContent />
    </Suspense>
  );
}

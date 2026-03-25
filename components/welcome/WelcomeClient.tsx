"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import { useSavedBenefits } from "@/hooks/use-saved-benefits";
import { PRE_AUTH_PAGE_KEY } from "@/components/auth/UnifiedAuthModal";
import CompactProviderCard from "@/components/providers/CompactProviderCard";
import type { Provider } from "@/components/providers/ProviderCard";
import { useProfileCompleteness } from "@/components/portal/profile/completeness";
import ProfileWizard from "@/components/welcome/ProfileWizard";
import BenefitsWizard from "@/components/welcome/BenefitsWizard";
import GoLiveModal from "@/components/welcome/GoLiveModal";
import type { FamilyMetadata } from "@/lib/types";

// ============================================================
// Types
// ============================================================

interface MatchProvider {
  provider_id: string;
  provider_name: string;
  provider_logo: string | null;
  provider_images: string | null;
  provider_category: string;
  city: string | null;
  state: string | null;
  google_rating: number | null;
}

interface WelcomeClientProps {
  destination: string;
  initialProviders?: MatchProvider[];
  initialCity?: string | null;
}

interface ConnectionWithProvider {
  id: string;
  from_profile_id?: string;
  metadata?: {
    thread?: Array<{
      from_profile_id: string;
      text: string;
      created_at: string;
      is_auto_reply?: boolean;
    }>;
    [key: string]: unknown;
  } | null;
  to_profile: {
    id: string;
    slug: string | null;
    source_provider_id: string | null;
    display_name: string;
    image_url: string | null;
    city: string | null;
    state: string | null;
    category: string | null;
    metadata: {
      google_rating?: number;
      review_count?: number;
      lower_price?: number;
      upper_price?: number;
    } | null;
  } | null;
}

// ============================================================
// Helper Functions
// ============================================================

/** Deterministic gradient from name for personalized avatar fallback */
function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #5fa3a3, #7ab8b8)",
    "linear-gradient(135deg, #417272, #5fa3a3)",
    "linear-gradient(135deg, #4d8a8a, #7ab8b8)",
    "linear-gradient(135deg, #385e5e, #5fa3a3)",
    "linear-gradient(135deg, #5fa3a3, #96c8c8)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

/** Get initials from a name */
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ============================================================
// Illustration — person being discovered by providers
// ============================================================

function DiscoveryIllustration() {
  return (
    <div className="w-24 h-24 mx-auto">
      <svg viewBox="0 0 96 96" fill="none" className="w-full h-full">
        {/* Soft background glow */}
        <circle cx="48" cy="48" r="40" fill="#199087" fillOpacity="0.08" />
        <circle cx="48" cy="48" r="28" fill="#199087" fillOpacity="0.12" />

        {/* Person silhouette - warm, approachable */}
        <circle cx="48" cy="36" r="10" fill="#199087" fillOpacity="0.9" />
        <path
          d="M32 62c0-8.837 7.163-16 16-16s16 7.163 16 16"
          stroke="#199087"
          strokeWidth="3"
          strokeLinecap="round"
          fill="#199087"
          fillOpacity="0.15"
        />

        {/* Connection dots - representing providers finding you */}
        <circle cx="22" cy="40" r="4" fill="#199087" fillOpacity="0.4">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="74" cy="40" r="4" fill="#199087" fillOpacity="0.4">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" begin="0.5s" />
        </circle>
        <circle cx="28" cy="58" r="3" fill="#199087" fillOpacity="0.3">
          <animate attributeName="opacity" values="0.15;0.45;0.15" dur="2s" repeatCount="indefinite" begin="0.25s" />
        </circle>
        <circle cx="68" cy="58" r="3" fill="#199087" fillOpacity="0.3">
          <animate attributeName="opacity" values="0.15;0.45;0.15" dur="2s" repeatCount="indefinite" begin="0.75s" />
        </circle>

        {/* Subtle connection lines */}
        <path d="M26 40 L38 38" stroke="#199087" strokeOpacity="0.2" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M70 40 L58 38" stroke="#199087" strokeOpacity="0.2" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ============================================================
// Helper Components
// ============================================================

// ============================================================
// Confetti Celebration Component
// ============================================================

function ConfettiCelebration() {
  // More refined, premium confetti colors (Olera teal, warm gold, soft purple, rose)
  const colors = ['#199087', '#199087', '#10b981', '#f59e0b', '#d4a574', '#a78bfa', '#f472b6'];

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Generate confetti pieces - varied shapes for visual interest */}
      {Array.from({ length: 60 }).map((_, i) => {
        const color = colors[i % colors.length];
        const left = 10 + Math.random() * 80; // Keep within 10-90% to avoid edge clustering
        const delay = Math.random() * 0.8;
        const duration = 2.5 + Math.random() * 1.5;
        const size = 5 + Math.random() * 7;
        const rotation = Math.random() * 360;
        const swayAmount = 15 + Math.random() * 30;
        const swayDirection = Math.random() > 0.5 ? 1 : -1;

        // Varied shapes: circles, squares, rectangles (confetti strips)
        const shapeType = Math.random();
        const isCircle = shapeType < 0.3;
        const isStrip = shapeType > 0.7;

        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${left}%`,
              top: '-20px',
              width: isStrip ? `${size * 0.4}px` : `${size}px`,
              height: isStrip ? `${size * 1.8}px` : `${size}px`,
              backgroundColor: color,
              borderRadius: isCircle ? '50%' : '2px',
              transform: `rotate(${rotation}deg)`,
              animation: `confetti-fall-${swayDirection > 0 ? 'right' : 'left'} ${duration}s ease-out ${delay}s forwards`,
              ['--sway' as string]: `${swayAmount * swayDirection}px`,
            }}
          />
        );
      })}
      <style jsx>{`
        @keyframes confetti-fall-right {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          25% {
            transform: translateY(25vh) translateX(var(--sway)) rotate(180deg);
          }
          50% {
            transform: translateY(50vh) translateX(0) rotate(360deg);
          }
          75% {
            transform: translateY(75vh) translateX(calc(var(--sway) * -0.5)) rotate(540deg);
          }
          100% {
            transform: translateY(100vh) translateX(var(--sway)) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes confetti-fall-left {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          25% {
            transform: translateY(25vh) translateX(calc(var(--sway) * -1)) rotate(-180deg);
          }
          50% {
            transform: translateY(50vh) translateX(0) rotate(-360deg);
          }
          75% {
            transform: translateY(75vh) translateX(calc(var(--sway) * 0.5)) rotate(-540deg);
          }
          100% {
            transform: translateY(100vh) translateX(calc(var(--sway) * -1)) rotate(-720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

function BenefitsCard() {
  return (
    <Link
      href="/benefits/finder"
      className="group flex items-center gap-4 p-4 bg-gradient-to-r from-warm-50 to-vanilla-100 rounded-xl border border-warm-100/60 hover:border-warm-200 transition-all focus:outline-none focus:ring-2 focus:ring-warm-300 focus:ring-offset-2"
    >
      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm border border-warm-100/60">
        <svg className="w-5 h-5 text-warm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[15px] font-semibold text-gray-900">Care may be covered</p>
        <p className="text-sm text-gray-500 mt-0.5">Find benefits you qualify for · 3 min</p>
      </div>
      <svg className="w-5 h-5 text-gray-400 flex-shrink-0 group-hover:text-warm-500 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

/** Horizontal scroll provider card (comparison style matching ProviderCard) */
function ProviderScrollCard({ provider }: { provider: MatchProvider }) {
  const { isSaved, toggleSave } = useSavedProviders();
  const saved = isSaved(provider.provider_id);
  const imageUrl = provider.provider_logo || provider.provider_images?.split(" | ")?.[0] || null;
  const location = [provider.city, provider.state].filter(Boolean).join(", ");

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSave({
      providerId: provider.provider_id,
      slug: provider.provider_id,
      name: provider.provider_name,
      location: location,
      careTypes: [provider.provider_category],
      image: imageUrl,
      rating: provider.google_rating ?? undefined,
    });
  };

  return (
    <Link
      href={`/provider/${provider.provider_id}`}
      className="group w-[280px] min-w-[280px] bg-white rounded-xl border border-gray-200 shadow-md hover:shadow-xl hover:border-gray-300 transition-all overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
    >
      {/* Image */}
      <div className="relative h-40 sm:h-48 bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={provider.provider_name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: avatarGradient(provider.provider_name) }}>
              <span className="text-xl font-bold text-white">{getInitials(provider.provider_name)}</span>
            </div>
            <span className="text-xs font-medium text-primary-400 mt-2">{provider.provider_category}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />

        {/* Heart save button — 44px touch target for WCAG compliance */}
        <button
          onClick={handleSave}
          className={`absolute top-2 right-2 w-11 h-11 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-1 ${saved ? "scale-105" : ""}`}
          aria-label={saved ? "Remove from saved" : "Save provider"}
        >
          <svg
            className={`w-5 h-5 transition-all ${saved ? "text-primary-600 fill-primary-600" : "text-gray-400 hover:text-primary-600"}`}
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        {/* Name + Rating */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 text-[15px] group-hover:text-primary-700 transition-colors line-clamp-2 flex-1 leading-snug">
            {provider.provider_name}
          </h3>
          {provider.google_rating && provider.google_rating > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900">{provider.google_rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Category · Location */}
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
          {provider.provider_category}{location ? ` · ${location}` : ""}
        </p>

        {/* Spacer */}
        <div className="flex-1 min-h-2" />

        {/* Pricing */}
        <p className="text-sm font-bold text-gray-900 mt-3">Contact for pricing</p>
      </div>
    </Link>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function WelcomeClient({ destination, initialProviders = [], initialCity = null }: WelcomeClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { account, activeProfile, refreshAccountData, user, isLoading: authLoading } = useAuth();

  // URL params for instant connection (from guest connection flow)
  const connectionIdParam = searchParams.get("connection");
  const providerSlugParam = searchParams.get("provider");
  const scrollRef = useRef<HTMLDivElement>(null);
  const providerScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [connection, setConnection] = useState<ConnectionWithProvider | null>(null);
  // Use server-fetched providers — no loading state needed
  const [matches, setMatches] = useState<MatchProvider[]>(initialProviders);
  const [providersLoading, setProvidersLoading] = useState(false); // Already loaded from server
  const [city, setCity] = useState<string | null>(initialCity);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [preAuthPage, setPreAuthPage] = useState<string | null>(null);

  // Profile wizard state
  const [profileWizardOpen, setProfileWizardOpen] = useState(false);

  // Benefits wizard state
  const [benefitsWizardOpen, setBenefitsWizardOpen] = useState(false);

  // Profile activation state (for "Go Live" action)
  const [activatingProfile, setActivatingProfile] = useState(false);

  // Go Live modal state (shown from Matches card or after profile wizard)
  const [goLiveModalOpen, setGoLiveModalOpen] = useState(false);

  // Track if user has viewed benefits (for gamification)
  const [hasViewedBenefits, setHasViewedBenefits] = useState(false);

  // Track if user has completed the onboarding (made a Go Live decision)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  // Track if user JUST went live (for immediate UI feedback before auth state refreshes)
  const [justWentLive, setJustWentLive] = useState(false);

  // Celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);

  // Track if this is a returning user
  const [isReturningUser, setIsReturningUser] = useState(false);

  // Check localStorage on mount for benefits view status, celebration, and visit tracking
  useEffect(() => {
    try {
      const viewed = localStorage.getItem("olera_viewed_benefits");
      if (viewed === "true") {
        setHasViewedBenefits(true);
      }
      const completed = localStorage.getItem("olera_completed_onboarding");
      if (completed === "true") {
        setHasCompletedOnboarding(true);
      }
      const celebrated = localStorage.getItem("olera_onboarding_celebrated");
      if (celebrated === "true") {
        setCelebrationShown(true);
      }

      // Visit tracking for "Welcome back" messaging
      const lastVisit = localStorage.getItem("olera_welcome_last_visit");
      const now = Date.now();

      if (lastVisit) {
        const hoursSinceLastVisit = (now - parseInt(lastVisit, 10)) / (1000 * 60 * 60);
        // Consider "returning" if more than 1 hour since last visit
        if (hoursSinceLastVisit > 1) {
          setIsReturningUser(true);
        }
      }

      // Update last visit timestamp
      localStorage.setItem("olera_welcome_last_visit", now.toString());
    } catch { /* localStorage not available */ }
  }, []);

  // Profile completeness tracking
  const { percentage: profilePercentage, firstIncompleteStep } = useProfileCompleteness(
    activeProfile ?? null,
    user?.email
  );

  // Saved benefits tracking
  const { savedCount: benefitsSavedCount } = useSavedBenefits();

  // Profile live status — aligned with Matches page logic
  // Uses metadata.care_post.status === "active" (set by /api/care-post/activate-matches)
  // Also considers justWentLive for immediate UI feedback before auth state refreshes
  const carePostStatus = ((activeProfile?.metadata as FamilyMetadata)?.care_post?.status) || null;
  const isProfileLive = carePostStatus === "active" || justWentLive;

  // Go Live validation — minimum data required for meaningful matching
  // Providers filter by location and care types, so we require both
  const hasLocation = Boolean(activeProfile?.city && activeProfile?.state);
  const hasCareTypes = Boolean(activeProfile?.care_types && activeProfile.care_types.length > 0);
  const canGoLive = hasLocation && hasCareTypes;
  const goLiveMissingItems: string[] = [];
  if (!hasLocation) goLiveMissingItems.push("location");
  if (!hasCareTypes) goLiveMissingItems.push("care needs");

  // Read pre-auth page from localStorage on mount (for "Skip for now" redirect)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRE_AUTH_PAGE_KEY);
      if (stored && stored !== "/welcome" && !stored.startsWith("/portal") && !stored.startsWith("/admin")) {
        setPreAuthPage(stored);
        // Clear it so it's not reused on future visits
        localStorage.removeItem(PRE_AUTH_PAGE_KEY);
      }
    } catch { /* localStorage not available */ }
  }, []);

  // Fetch connection data immediately if connection ID is in URL
  // This runs independently of auth state to speed up initial load
  useEffect(() => {
    if (!connectionIdParam || connection) return;

    async function fetchConnection() {
      const supabase = createClient();
      try {
        // Fetch connection directly by ID - no need to wait for activeProfile
        // Include metadata to check if user has sent messages
        const { data: conn } = await supabase
          .from("connections")
          .select(`
            id,
            metadata,
            from_profile_id,
            to_profile:business_profiles!connections_to_profile_id_fkey(
              id, slug, source_provider_id, display_name, image_url, city, state, category, metadata
            )
          `)
          .eq("id", connectionIdParam)
          .single();

        if (conn?.to_profile) {
          let enrichedConn = conn as ConnectionWithProvider;

          // Enrich with iOS data in parallel
          const iosKey = conn.to_profile.source_provider_id || conn.to_profile.slug;
          if (iosKey) {
            const { data: iosData } = await supabase
              .from("olera-providers")
              .select("provider_logo, provider_images, google_rating, review_count, lower_price, upper_price")
              .eq("provider_id", iosKey)
              .single();

            if (iosData) {
              const iosImage = iosData.provider_logo || iosData.provider_images?.split(" | ")[0] || null;
              enrichedConn = {
                ...enrichedConn,
                to_profile: {
                  ...enrichedConn.to_profile!,
                  image_url: enrichedConn.to_profile!.image_url || iosImage,
                  metadata: {
                    ...((enrichedConn.to_profile!.metadata || {}) as Record<string, unknown>),
                    ...(iosData.google_rating ? { google_rating: iosData.google_rating } : {}),
                    ...(iosData.review_count ? { review_count: iosData.review_count } : {}),
                    ...(iosData.lower_price ? { lower_price: iosData.lower_price } : {}),
                    ...(iosData.upper_price ? { upper_price: iosData.upper_price } : {}),
                  },
                },
              };
            }
          }

          setConnection(enrichedConn);
          // Clear localStorage now that we have the real data
          try {
            localStorage.removeItem("olera_pending_connection");
          } catch {
            // localStorage not available
          }
          if (enrichedConn.to_profile?.city) {
            setCity(enrichedConn.to_profile.city);
          }
          return; // Successfully fetched, exit early
        }
      } catch (err) {
        console.error("[welcome] Failed to fetch connection from DB:", err);
      }

      // Fallback: Use localStorage data if DB fetch failed (e.g., RLS blocked due to no session yet)
      try {
        const stored = localStorage.getItem("olera_pending_connection");
        if (stored) {
          const pending = JSON.parse(stored);
          if (pending.connectionId === connectionIdParam) {
            console.log("[welcome] Using localStorage fallback for connection");
            // Create a minimal connection object from localStorage + iOS data
            const supabase = createClient();
            const providerSlug = pending.providerSlug || providerSlugParam;
            // Use providerId for iOS lookup, fall back to slug
            const lookupId = pending.providerId || providerSlug;

            // Try to get provider info from olera-providers
            const { data: iosData } = await supabase
              .from("olera-providers")
              .select("provider_id, provider_name, provider_logo, provider_images, google_rating, review_count, lower_price, upper_price, city, state, provider_category")
              .eq("provider_id", lookupId)
              .single();

            if (iosData) {
              const iosImage = iosData.provider_logo || iosData.provider_images?.split(" | ")[0] || null;
              const fallbackConn: ConnectionWithProvider = {
                id: connectionIdParam!, // Safe: guard above checks connectionIdParam exists
                to_profile: {
                  id: "", // Unknown, but not needed for display
                  slug: providerSlug,
                  source_provider_id: iosData.provider_id,
                  display_name: iosData.provider_name || pending.providerName || "Provider",
                  image_url: iosImage,
                  city: iosData.city,
                  state: iosData.state,
                  category: iosData.provider_category,
                  metadata: {
                    google_rating: iosData.google_rating,
                    review_count: iosData.review_count,
                    lower_price: iosData.lower_price,
                    upper_price: iosData.upper_price,
                  },
                },
              };
              setConnection(fallbackConn);
              if (iosData.city) {
                setCity(iosData.city);
              }
            } else if (pending.providerName) {
              // Even if iOS data not found, show something
              const fallbackConn: ConnectionWithProvider = {
                id: connectionIdParam!, // Safe: guard above checks connectionIdParam exists
                to_profile: {
                  id: "",
                  slug: providerSlug,
                  source_provider_id: null,
                  display_name: pending.providerName,
                  image_url: null,
                  city: null,
                  state: null,
                  category: null,
                  metadata: null,
                },
              };
              setConnection(fallbackConn);
            }
          }
        }
      } catch (lsErr) {
        console.error("[welcome] localStorage fallback failed:", lsErr);
      }
    }

    fetchConnection();
  }, [connectionIdParam, connection, providerSlugParam]);

  // Main initialization - handle auth state and other data
  useEffect(() => {
    async function init() {
      // If auth is still loading, wait (but connection fetch above runs in parallel)
      if (authLoading) {
        return;
      }

      // No active profile - show the page anyway (connection card already fetched above)
      if (!activeProfile) {
        setLoading(false);
        return;
      }

      const supabase = createClient();
      setHasInitialized(true);

      // Update city from profile if not already set
      if (!city && activeProfile.city) {
        setCity(activeProfile.city);
      }

      // If no connection from URL, fetch the most recent one
      if (!connectionIdParam && !connection) {
        try {
          const { data: connections } = await supabase
            .from("connections")
            .select(`
              id,
              to_profile:business_profiles!connections_to_profile_id_fkey(
                id, slug, source_provider_id, display_name, image_url, city, state, category, metadata
              )
            `)
            .eq("from_profile_id", activeProfile.id)
            .eq("type", "inquiry")
            .order("created_at", { ascending: false })
            .limit(1);

          if (connections && connections.length > 0) {
            let conn = connections[0] as ConnectionWithProvider;

            // Enrich with iOS data
            if (conn.to_profile) {
              const iosKey = conn.to_profile.source_provider_id || conn.to_profile.slug;
              if (iosKey) {
                const { data: iosData } = await supabase
                  .from("olera-providers")
                  .select("provider_logo, provider_images, google_rating, review_count, lower_price, upper_price")
                  .eq("provider_id", iosKey)
                  .single();

                if (iosData) {
                  const iosImage = iosData.provider_logo || iosData.provider_images?.split(" | ")[0] || null;
                  conn = {
                    ...conn,
                    to_profile: {
                      ...conn.to_profile,
                      image_url: conn.to_profile.image_url || iosImage,
                      metadata: {
                        ...((conn.to_profile.metadata || {}) as Record<string, unknown>),
                        ...(iosData.google_rating ? { google_rating: iosData.google_rating } : {}),
                        ...(iosData.review_count ? { review_count: iosData.review_count } : {}),
                        ...(iosData.lower_price ? { lower_price: iosData.lower_price } : {}),
                        ...(iosData.upper_price ? { upper_price: iosData.upper_price } : {}),
                      },
                    },
                  };
                }
              }
            }

            setConnection(conn);
            if (conn.to_profile?.city) {
              setCity(conn.to_profile.city);
            }
          }
        } catch (err) {
          console.error("[welcome] Failed to fetch connection:", err);
        }
      }

      setLoading(false);
    }

    init();
  }, [activeProfile, account, destination, router, hasInitialized, connectionIdParam, authLoading, connection, city]);

  // Complete onboarding and redirect (or show confirmation)
  const completeOnboarding = useCallback(async (activateMatches: boolean, showConfirmationAfter: boolean = false, customRedirect?: string) => {
    setSaving(true);

    try {
      // Build the profile update request
      const profileRequest = fetch("/api/auth/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "family",
          displayName: activeProfile?.display_name || account?.display_name || "Family",
          city: city || activeProfile?.city || undefined,
          state: activeProfile?.state || undefined,
          isAddingProfile: true,
        }),
      });

      if (activateMatches) {
        // Run both API calls in parallel for faster completion
        console.log("[welcome] Activating matches with city:", city, "state:", activeProfile?.state);
        const [activateRes, profileRes] = await Promise.all([
          fetch("/api/care-post/activate-matches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              city: city || activeProfile?.city || undefined,
              state: activeProfile?.state || undefined,
              careTypes: activeProfile?.care_types?.length ? activeProfile.care_types : undefined,
            }),
          }),
          profileRequest,
        ]);

        if (!activateRes.ok) {
          const errorData = await activateRes.json().catch(() => ({}));
          console.error("[welcome] Failed to activate matches:", activateRes.status, errorData);
        } else {
          const successData = await activateRes.json();
          console.log("[welcome] Matches activated successfully:", successData);
        }

        if (!profileRes.ok) {
          const errorData = await profileRes.json().catch(() => ({}));
          console.error("[welcome] Failed to update profile:", profileRes.status, errorData);
        }
      } else {
        // Just complete the profile update
        const profileRes = await profileRequest;
        if (!profileRes.ok) {
          const errorData = await profileRes.json().catch(() => ({}));
          console.error("[welcome] Failed to update profile:", profileRes.status, errorData);
        }
      }

      // Refresh account data in background — don't wait for it
      refreshAccountData?.();

      if (showConfirmationAfter) {
        setSaving(false);
        setShowConfirmation(true);
      } else {
        router.push(customRedirect || destination);
      }
    } catch (err) {
      console.error("[welcome] Error completing onboarding:", err);
      setSaving(false);
    }
  }, [city, activeProfile, account, refreshAccountData, router, destination]);

  const handleSkip = useCallback(() => {
    if (connection) {
      // Connected user: go to their intended destination (inbox)
      completeOnboarding(false);
    } else {
      // Fresh account: go back to where they were before signup (or landing page)
      completeOnboarding(false, false, preAuthPage || "/");
    }
  }, [completeOnboarding, connection, preAuthPage]);

  const handleActivate = useCallback(() => {
    completeOnboarding(true, true); // Show confirmation after activation
  }, [completeOnboarding]);

  const handleGoToInbox = useCallback(() => {
    setNavigating(true);
    router.push(destination);
  }, [router, destination]);

  // Navigate to inbox with a specific provider, marking onboarding complete first
  const handleStartConversation = useCallback(async (providerId: string) => {
    setNavigating(true);
    try {
      // Mark onboarding as complete so middleware doesn't redirect back
      await fetch("/api/auth/ensure-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_onboarding_complete: true }),
      });
      // Refresh account data to update local state
      await refreshAccountData();
    } catch {
      // Continue anyway - worst case they see welcome page again
    }
    router.push(`/portal/inbox?provider=${providerId}`);
  }, [router, refreshAccountData]);

  const handleViewMatches = useCallback(() => {
    setNavigating(true);
    router.push("/portal/matches");
  }, [router]);

  const handleBrowseProviders = useCallback(() => {
    setNavigating(true);
    router.push("/browse");
  }, [router]);

  // Provider scroll navigation
  const updateScrollButtons = useCallback(() => {
    if (providerScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = providerScrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  const scrollProviders = useCallback((direction: "left" | "right") => {
    if (providerScrollRef.current) {
      const scrollAmount = 300;
      providerScrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
      setTimeout(updateScrollButtons, 350);
    }
  }, [updateScrollButtons]);

  // Gamification: attention moves through cards as user completes steps
  // 1. Profile card pulses until profile >= 50% complete
  // 2. Matches card pulses until profile is live
  // NOTE: These calculations and the useEffect MUST be before any conditional returns
  // to avoid the "Rendered more hooks than during the previous render" error
  const profileComplete = profilePercentage >= 50;
  // Show "All Set" page when user has made a Go Live decision (either went live or explicitly skipped)
  // The profile percentage is for gamification/progress tracking, not a gate for the celebration
  const allStepsComplete = isProfileLive || hasCompletedOnboarding;

  // Trigger celebration only when user actually goes live (not when they skip)
  useEffect(() => {
    if (isProfileLive && !celebrationShown && !showCelebration) {
      setShowCelebration(true);
      setCelebrationShown(true);
      try {
        localStorage.setItem("olera_onboarding_celebrated", "true");
      } catch { /* localStorage not available */ }
      // Auto-hide celebration after 4 seconds
      const timer = setTimeout(() => setShowCelebration(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isProfileLive, celebrationShown, showCelebration]);

  // Loading state - controlled by init function
  // Connection data is fetched in parallel, so we can show content faster
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" style={{ willChange: "transform" }} />
      </div>
    );
  }

  const cityDisplay = city || "your area";
  const userName = activeProfile?.display_name?.split(" ")[0] || account?.display_name?.split(" ")[0];
  const isConnected = !!connection?.to_profile?.display_name;

  // Detect if user has sent a message (not auto-reply) to the connected provider
  const connectionThread = connection?.metadata?.thread || [];
  const userProfileId = activeProfile?.id;
  const hasUserMessaged = connectionThread.some(
    (msg) => msg.from_profile_id === userProfileId && !msg.is_auto_reply
  );

  // Determine if this is a fresh connection (URL has connection param) vs returning user
  const isFreshConnection = !!connectionIdParam;

  // Decide what to show in the top card area
  // - Fresh connection + hasn't messaged: Show full connection card
  // - Has messaged: Hide the connection card (they're engaged)
  // - Returning user + not fresh + profile incomplete: Show "Pick up where you left off"
  // - Returning user + profile done but not live: Hide card, focus on step cards
  const showConnectionCard = isConnected && !hasUserMessaged && isFreshConnection;
  const showPickUpWhereLeftOff = isConnected && !isFreshConnection && !hasUserMessaged && !allStepsComplete;

  const needsProfileAttention = !profileComplete;
  const needsBenefitsAttention = false; // Benefits is optional, not part of core onboarding
  const needsMatchesAttention = profileComplete && !isProfileLive;

  // Toggle this to switch between new and old version during development
  const USE_NEW_VERSION = true;

  // Time-aware greeting with "Welcome back" for returning users
  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const greeting = isReturningUser || allStepsComplete
    ? (userName ? `Welcome back, ${userName}` : "Welcome back")
    : (userName ? `${getTimeGreeting()}, ${userName}` : getTimeGreeting());

  const subtitle = allStepsComplete
    ? "Your care journey continues"
    : isReturningUser
      ? "Pick up where you left off"
      : "Welcome to Olera";

  // ================================================================
  // NEW VERSION — Building on top (Connected State first)
  // ================================================================
  if (USE_NEW_VERSION) {
    return (
      <div className="min-h-screen bg-white">
        {/* Main content container */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ============================================================
              HEADER — Time-aware greeting + Welcome message
              ============================================================ */}
          <section className="pt-8 sm:pt-12 pb-6">
            <p className="text-text-md sm:text-text-lg text-gray-500">
              {greeting}
            </p>
            <h1 className="mt-1 text-display-xs sm:text-display-sm font-display text-gray-900">
              {subtitle}
            </h1>
          </section>

          {/* ============================================================
              TOP CARD — Context-aware based on user journey state
              - Fresh connection: Show provider card with "Start conversation"
              - Returning user (connected, not messaged): Show "Pick up where you left off"
              - Has messaged: Hide card (they're engaged)
              - New user (no connection): Show welcome card
              ============================================================ */}
          {showConnectionCard && connection?.to_profile ? (() => {
            const provider = connection.to_profile;
            const location = [provider.city, provider.state].filter(Boolean).join(", ");
            const hasRatingOrPricing = provider.metadata?.google_rating || provider.metadata?.lower_price;

            return (
              <section className="pb-12">
                {/* Card container — no border, subtle shadow like Airbnb */}
                <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
                  <div className="flex flex-col sm:flex-row">
                    {/* Provider Image — rounded corners on mobile top, left on desktop */}
                    <div className="relative w-full sm:w-[240px] aspect-[16/10] sm:aspect-auto sm:min-h-[200px] flex-shrink-0 bg-gray-100 overflow-hidden sm:rounded-l-2xl">
                      {provider.image_url ? (
                        <Image
                          src={provider.image_url}
                          alt={provider.display_name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ background: avatarGradient(provider.display_name) }}
                        >
                          <span className="text-4xl font-bold text-white">
                            {getInitials(provider.display_name)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-5 sm:p-6 flex flex-col min-w-0">
                      {/* Provider Name — with line clamp for long names */}
                      <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight line-clamp-2">
                        {provider.display_name}
                      </h2>

                      {/* Location · Category */}
                      <p className="mt-1.5 text-text-md text-gray-500 line-clamp-1">
                        {location || provider.category || "Care Provider"}
                        {location && provider.category && (
                          <span className="text-gray-300"> · </span>
                        )}
                        {location && provider.category && (
                          <span>{provider.category}</span>
                        )}
                      </p>

                      {/* Rating & Pricing row — only show if data exists */}
                      {hasRatingOrPricing && (
                        <>
                          <div className="my-4 border-t border-gray-100" />
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-text-sm">
                            {provider.metadata?.google_rating && (
                              <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                <span className="font-semibold text-gray-900">
                                  {provider.metadata.google_rating.toFixed(1)}
                                </span>
                                {provider.metadata.review_count && (
                                  <span className="text-gray-400">
                                    ({provider.metadata.review_count})
                                  </span>
                                )}
                              </div>
                            )}
                            {provider.metadata?.lower_price && (
                              <div className="text-gray-600">
                                <span className="font-medium text-gray-900">
                                  ${provider.metadata.lower_price.toLocaleString()}
                                  {provider.metadata.upper_price && (
                                    <span>–${provider.metadata.upper_price.toLocaleString()}</span>
                                  )}
                                </span>
                                <span className="text-gray-400">/mo</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Spacer — pushes button to bottom on desktop */}
                      <div className="flex-1 min-h-4" />

                      {/* Message Button — full width on mobile, right-aligned on desktop */}
                      <div className="mt-4 sm:mt-5 flex sm:justify-end">
                        <button
                          type="button"
                          onClick={() => handleStartConversation(provider.id)}
                          disabled={navigating}
                          className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50"
                        >
                          {navigating ? "Loading..." : "Start conversation"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })() : showPickUpWhereLeftOff && connection?.to_profile ? (
            /* ============================================================
               RETURNING USER CARD — "Pick up where you left off"
               For users who connected but came back without the connection URL param
               ============================================================ */
            <section className="pb-10">
              <div className="bg-gradient-to-br from-primary-50/50 to-white rounded-2xl border border-primary-100/60 p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  {/* Provider mini avatar */}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                    {connection.to_profile.image_url ? (
                      <Image
                        src={connection.to_profile.image_url}
                        alt={connection.to_profile.display_name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: avatarGradient(connection.to_profile.display_name) }}
                      >
                        <span className="text-sm font-bold text-white">
                          {getInitials(connection.to_profile.display_name)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-sm font-medium text-primary-700">
                      Pick up where you left off
                    </p>
                    <p className="mt-1 text-text-md text-gray-900 font-semibold line-clamp-1">
                      Continue your conversation with {connection.to_profile.display_name.split(' ')[0]}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleStartConversation(connection.to_profile!.id)}
                        disabled={navigating}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {navigating ? "Loading..." : "Message"}
                      </button>
                      {!profileComplete && (
                        <button
                          onClick={() => setProfileWizardOpen(true)}
                          className="text-text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          or complete profile
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : !isConnected && !allStepsComplete ? (
            /* ============================================================
               FRESH STATE CARD — Welcome card for new users without connection
               Hidden when all steps complete
               ============================================================ */
            <section className="pb-12">
              <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  {/* Image — warm, welcoming photograph */}
                  <div className="relative w-full sm:w-[240px] aspect-[16/10] sm:aspect-auto sm:min-h-[200px] flex-shrink-0 bg-gray-100 overflow-hidden sm:rounded-l-2xl">
                    <Image
                      src="/images/for-providers/hero.jpg"
                      alt="Caregiver helping a senior"
                      fill
                      className="object-cover"
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-5 sm:p-6 flex flex-col min-w-0">
                    {/* Headline */}
                    <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight">
                      Finding Care Made Simple
                    </h2>

                    {/* Subtext — brief value proposition */}
                    <p className="mt-2 text-text-md text-gray-500 leading-relaxed">
                      One profile connects you with qualified providers in your area.
                    </p>

                    {/* Spacer */}
                    <div className="flex-1 min-h-4" />

                    {/* CTA Button — gray style like connected user's Message button */}
                    <div className="mt-4 sm:mt-5 flex sm:justify-end">
                      <button
                        onClick={() => setProfileWizardOpen(true)}
                        className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
                      >
                        Get Started
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Confetti celebration */}
          {showCelebration && <ConfettiCelebration />}

          {/* ============================================================
              ACTION TIMELINE — Profile & Matches cards
              Cards transform inline to show completion states
              The journey IS the celebration
              ============================================================ */}
          <section className="pb-12 sm:ml-16">
            {/* Nested layout: timeline on left (desktop only), cards fill remaining space */}
            <div className="relative sm:pl-14">
              {/* Timeline — hidden on mobile, visible on sm+ */}
              <div className="hidden sm:flex absolute left-0 top-0 bottom-0 w-12 flex-col items-center">
                {/* Step 1 marker — Profile */}
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-semibold text-gray-500 mb-1">Profile</span>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${profileComplete ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                    {profileComplete ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : '1'}
                  </div>
                </div>
                {/* Line segment 1→2 */}
                <div className={`flex-1 w-px my-3 ${profileComplete ? 'bg-primary-200' : ''}`} style={{ backgroundColor: profileComplete ? undefined : '#e8e8e8' }} />
                {/* Step 2 marker — Matches */}
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-semibold text-gray-500 mb-1">Matches</span>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${isProfileLive ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                    {isProfileLive ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : '2'}
                  </div>
                </div>
                {/* Line segment 2→3 — show when onboarding complete (live or skipped) */}
                {(isProfileLive || hasCompletedOnboarding) && (
                  <>
                    <div className={`flex-1 w-px my-3 ${isProfileLive ? 'bg-primary-200' : 'bg-gray-200'}`} />
                    {/* Step 3 marker — Benefits (current step - ring style) */}
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-semibold text-gray-500 mb-1">Benefits</span>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${isProfileLive ? 'bg-white border-2 border-primary-400 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                        3
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Cards — full width, generous spacing */}
              <div className="space-y-8">
                {/* Card 1: Profile — links to page after onboarding, otherwise opens wizard */}
                <div className="relative">
                  {allStepsComplete ? (
                    // Onboarding complete — link to profile page
                    <Link
                      href="/portal/profile"
                      className="relative flex items-center gap-4 p-4 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow group"
                    >
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary-50">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-md font-semibold text-gray-900">Profile</p>
                        <p className="text-text-sm mt-0.5 text-primary-600">{profilePercentage}% complete</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ) : (
                    // Still onboarding — open wizard modal
                    <button
                      onClick={() => setProfileWizardOpen(true)}
                      className="relative w-full flex items-center gap-4 p-4 bg-white rounded-2xl transition-all group text-left"
                      style={needsProfileAttention ? {
                        border: '2px solid #199087',
                        boxShadow: '0 0 0 4px rgba(25, 144, 135, 0.15), 0 8px 24px rgba(0,0,0,0.12), 0 16px 40px rgba(0,0,0,0.08)',
                      } : {
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)',
                      }}
                    >
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${profileComplete ? 'bg-primary-50' : 'bg-[#FEF7ED]'}`}>
                        {profileComplete ? (
                          <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 32 32" className="w-8 h-8">
                            <rect x="6" y="4" width="20" height="26" rx="2" fill="#E8DDD4" stroke="#C4B5A6" strokeWidth="1.5"/>
                            <rect x="9" y="8" width="14" height="10" rx="1" fill="#F5EFE8"/>
                            <circle cx="20" cy="20" r="1.5" fill="#A69484"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-md font-semibold text-gray-900">
                          {profileComplete ? "Profile looking good!" : (isConnected && connection?.to_profile?.display_name
                            ? `Help ${connection.to_profile.display_name.split(' ')[0]} learn more about you`
                            : "Complete your profile")}
                        </p>
                        <p className={`text-text-sm mt-0.5 ${profileComplete ? 'text-primary-600' : 'text-gray-500'}`}>
                          {profilePercentage}% complete
                        </p>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${needsProfileAttention ? 'bg-primary-500' : 'bg-gray-100'}`}>
                        <svg className={`w-4 h-4 ${needsProfileAttention ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  )}
                </div>

                {/* Card 2: Matches — transforms to show success state when live */}
                <div className="relative">
                  {isProfileLive ? (
                    // Already live — white card with checkmark and Live badge
                    <Link
                      href="/portal/matches"
                      className="relative flex items-center gap-4 p-4 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow group"
                    >
                      {/* Live badge - top right */}
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary-50">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-md font-semibold text-gray-900">Matches</p>
                        <p className="text-text-sm mt-0.5 text-primary-600">Providers can discover you</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ) : hasCompletedOnboarding ? (
                    // Skipped Go Live — keep teal highlight to indicate next action
                    <Link
                      href="/portal/matches"
                      className="relative flex items-center gap-4 p-4 bg-white rounded-2xl transition-all group"
                      style={{
                        border: '2px solid #199087',
                        boxShadow: '0 0 0 4px rgba(25, 144, 135, 0.15), 0 8px 24px rgba(0,0,0,0.12), 0 16px 40px rgba(0,0,0,0.08)',
                      }}
                    >
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#E8F5F3]">
                        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-md font-semibold text-gray-900">Explore matches</p>
                        <p className="text-text-sm mt-0.5 text-gray-500">
                          Go live anytime to let providers find you
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-600 transition-colors">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ) : canGoLive ? (
                    // Ready to go live — personalized CTA with provider name if connected
                    <button
                      onClick={() => setGoLiveModalOpen(true)}
                      className="relative w-full flex items-center gap-4 p-4 bg-white rounded-2xl transition-all group text-left"
                      style={needsMatchesAttention ? {
                        border: '2px solid #199087',
                        boxShadow: '0 0 0 4px rgba(25, 144, 135, 0.15), 0 8px 24px rgba(0,0,0,0.12), 0 16px 40px rgba(0,0,0,0.08)',
                      } : {
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)',
                      }}
                    >
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#E8F5F3]">
                        <svg viewBox="0 0 32 32" className="w-8 h-8">
                          <rect x="6" y="4" width="20" height="26" rx="2" fill="#C5E8E4" stroke="#8BCDC5" strokeWidth="1.5"/>
                          <rect x="9" y="8" width="14" height="10" rx="1" fill="#E0F2EF"/>
                          <rect x="13" y="20" width="6" height="10" fill="#8BCDC5"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-md font-semibold text-gray-900">
                          {isConnected && connection?.to_profile?.display_name
                            ? `Let providers like ${connection.to_profile.display_name.split(' ')[0]} find you`
                            : "Go live & get matched"}
                        </p>
                        <p className="text-text-sm mt-0.5 text-gray-500">
                          {isConnected ? "More providers can discover your profile" : "Let providers discover you"}
                        </p>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${needsMatchesAttention ? 'bg-primary-500' : 'bg-primary-100'}`}>
                        <svg className={`w-4 h-4 ${needsMatchesAttention ? 'text-white' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </button>
                  ) : (
                    // Not ready to go live — missing data, prompt to complete profile
                    <button
                      onClick={() => setProfileWizardOpen(true)}
                      className="relative w-full flex items-center gap-4 p-4 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)] transition-all group text-left"
                    >
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-md font-semibold text-gray-900">
                          Complete profile to go live
                        </p>
                        <p className="text-text-sm mt-0.5 text-gray-500">
                          Add {goLiveMissingItems.join(" and ")} first
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  )}
                </div>

                {/* Card 3: Benefits — appears after going live OR when user skipped */}
                {(isProfileLive || hasCompletedOnboarding) && (
                  <div className="relative">
                    <Link
                      href="/benefits/finder"
                      className="relative flex items-center gap-4 p-4 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow group"
                    >
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${isProfileLive ? 'bg-amber-50' : 'bg-gray-100'}`}>
                        <svg className={`w-6 h-6 ${isProfileLive ? 'text-amber-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-md font-semibold text-gray-900">Explore benefits</p>
                        <p className="text-text-sm mt-0.5 text-gray-500">
                          Care may be covered — find benefits you qualify for
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ============================================================
              PROVIDER RECOMMENDATIONS — Full width, aligned with main card
              ============================================================ */}
          {matches.length > 0 && (
            <section className="pb-20">
              {/* Section header — bigger when onboarding complete */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className={`font-semibold text-gray-900 ${allStepsComplete ? 'text-text-xl sm:text-display-xs' : 'text-text-lg'}`}>
                    {allStepsComplete ? 'Your recommended providers' : 'Discover providers near you'}
                  </h2>
                  {allStepsComplete && (
                    <p className="text-text-sm text-gray-500 mt-1">Based on your profile and location</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* "Explore All" button - more prominent when complete */}
                  {allStepsComplete && (
                    <Link
                      href="/browse"
                      className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-text-sm font-medium rounded-full hover:bg-primary-700 transition-colors"
                    >
                      Explore all
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                  {/* Navigation arrows */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => scrollProviders("left")}
                      disabled={!canScrollLeft}
                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                      aria-label="Scroll left"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => scrollProviders("right")}
                      disabled={!canScrollRight}
                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                      aria-label="Scroll right"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable provider cards — using Olera's CompactProviderCard */}
              <div
                ref={providerScrollRef}
                onScroll={updateScrollButtons}
                className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {matches.map((provider) => {
                  // Map olera-providers data to Provider interface
                  const imageUrl = provider.provider_logo || provider.provider_images?.split(" | ")?.[0] || "";
                  const location = [provider.city, provider.state].filter(Boolean).join(", ");

                  const mappedProvider: Provider = {
                    id: provider.provider_id,
                    slug: provider.provider_id,
                    name: provider.provider_name,
                    image: imageUrl,
                    address: location,
                    rating: provider.google_rating || 0,
                    priceRange: "",
                    primaryCategory: provider.provider_category,
                    careTypes: [provider.provider_category],
                    highlights: [],
                    verified: false,
                  };

                  return (
                    <div key={provider.provider_id} className="flex-shrink-0 w-[220px]">
                      <CompactProviderCard provider={mappedProvider} />
                    </div>
                  );
                })}
              </div>

              {/* Mobile "Explore All" button — shown when onboarding complete */}
              {allStepsComplete && (
                <div className="mt-6 sm:hidden">
                  <Link
                    href="/browse"
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-primary-600 text-white text-text-md font-medium rounded-xl hover:bg-primary-700 transition-colors"
                  >
                    Explore all providers
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* Loading state for providers */}
          {providersLoading && (
            <section className="pb-20">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                  <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                </div>
              </div>
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[220px]">
                    <div className="aspect-[4/3] rounded-xl bg-gray-100 animate-pulse" />
                    <div className="mt-2.5 space-y-2">
                      <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
                      <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Profile Wizard */}
        {profileWizardOpen && activeProfile && (
          <ProfileWizard
            profile={activeProfile}
            userEmail={user?.email}
            onClose={() => setProfileWizardOpen(false)}
            onComplete={() => {
              // Profile wizard done - user stays on welcome page
              // The Matches card will be highlighted to prompt them to go live
              refreshAccountData();
              setProfileWizardOpen(false);
            }}
            onStepSaved={() => {
              // Refresh profile data after each step so percentage updates live
              refreshAccountData();
            }}
          />
        )}

        {benefitsWizardOpen && (
          <BenefitsWizard
            profile={activeProfile}
            onClose={() => setBenefitsWizardOpen(false)}
            onComplete={() => {
              refreshAccountData();
              setBenefitsWizardOpen(false);
            }}
          />
        )}

        {/* Go Live Modal — shown when clicking Matches card */}
        <GoLiveModal
          isOpen={goLiveModalOpen}
          onClose={() => setGoLiveModalOpen(false)}
          onGoLive={async () => {
            setActivatingProfile(true);
            try {
              const res = await fetch("/api/care-post/activate-matches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  city: city || activeProfile?.city || undefined,
                  state: activeProfile?.state || undefined,
                }),
              });
              if (res.ok) {
                // Immediately show live state in UI (don't wait for auth refresh)
                setJustWentLive(true);
                await refreshAccountData?.();
                // Mark onboarding complete and persist
                setHasCompletedOnboarding(true);
                try {
                  localStorage.setItem("olera_completed_onboarding", "true");
                } catch { /* localStorage not available */ }
                setGoLiveModalOpen(false);
                // Stay on welcome page - will now show "All Set" view with live state
              }
            } catch (err) {
              console.error("[welcome] Failed to activate profile:", err);
            } finally {
              setActivatingProfile(false);
            }
          }}
          onSkip={async () => {
            // Mark onboarding complete in database so user can navigate freely
            try {
              await fetch("/api/auth/ensure-account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mark_onboarding_complete: true }),
              });
            } catch (err) {
              console.error("[welcome] Failed to mark onboarding complete:", err);
            }
            // Also update local state
            setHasCompletedOnboarding(true);
            try {
              localStorage.setItem("olera_completed_onboarding", "true");
            } catch { /* localStorage not available */ }
            refreshAccountData?.();
            setGoLiveModalOpen(false);
            // Stay on welcome page - will now show "All Set" view (without LIVE badge)
          }}
        />
      </div>
    );
  }

  // ================================================================
  // OLD VERSION — REFERENCE (set USE_NEW_VERSION = false to render)
  // ================================================================
  return (
    <div className="min-h-screen bg-white">
      {/* Subtle warm gradient background accent */}
      <div className="absolute inset-x-0 top-0 h-[500px] bg-gradient-to-b from-warm-50/40 via-vanilla-50/20 to-transparent pointer-events-none" />

      {/* ================================================================
          OPENING — personalized greeting
          ================================================================ */}
      <section className="relative px-4 sm:px-6 pt-10 sm:pt-14 pb-6 animate-fadeIn">
        <div className="max-w-xl mx-auto text-center">
          {connection?.to_profile?.display_name ? (
            <>
              <h1 className="text-[32px] sm:text-[40px] font-display font-bold text-gray-900 leading-[1.15] tracking-tight">
                You&apos;re connected{userName ? `, ${userName}` : ""}.
              </h1>
              <p className="mt-3 text-lg text-gray-500">
                Explore more providers and benefits you may qualify for.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[32px] sm:text-[40px] font-display font-bold text-gray-900 leading-[1.15] tracking-tight">
                {userName ? `Welcome, ${userName}.` : "Welcome to Olera."}
              </h1>
              <p className="mt-3 text-lg text-gray-500">
                Let&apos;s find the right care for you.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ================================================================
          SECTION 1 — ACTIVATION CARD
          ================================================================ */}
      <section className="relative px-4 sm:px-6 pt-4 pb-12">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg shadow-gray-100/50 overflow-hidden">
            <div className="px-6 sm:px-10 pt-10 pb-8 text-center">
              {showConfirmation ? (
                /* ============ CONFIRMATION STATE — celebratory ============ */
                <>
                  {/* Animated checkmark with glow */}
                  <div className="relative w-20 h-20 mx-auto">
                    <div className="absolute inset-0 rounded-full bg-primary-100 animate-ping opacity-20" />
                    <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-200">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>

                  {/* Celebratory text */}
                  <h2 className="mt-6 text-2xl sm:text-[26px] font-display font-bold text-gray-900 leading-snug">
                    You&apos;re all set!
                  </h2>
                  <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
                    Providers in <span className="text-primary-600 font-semibold">{cityDisplay}</span> can now see your profile.<br className="hidden sm:inline" />
                    We&apos;ll notify you when someone reaches out.
                  </p>

                  {/* Action buttons */}
                  <div className="mt-7 space-y-3">
                    {/* Primary: View matches profile */}
                    <button
                      onClick={handleViewMatches}
                      disabled={navigating}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        width: "100%",
                        minHeight: "52px",
                        padding: "0 24px",
                        backgroundColor: "#4d8a8a",
                        backgroundImage: "linear-gradient(to bottom, #5fa3a3, #4d8a8a)",
                        color: "#ffffff",
                        fontSize: "15px",
                        fontWeight: 600,
                        borderRadius: "12px",
                        border: "none",
                        cursor: navigating ? "not-allowed" : "pointer",
                        opacity: navigating ? 0.7 : 1,
                        boxShadow: "0 4px 6px -1px rgba(77, 138, 138, 0.2), 0 2px 4px -1px rgba(77, 138, 138, 0.1)",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        if (!navigating) {
                          e.currentTarget.style.backgroundImage = "linear-gradient(to bottom, #6db3b3, #5fa3a3)";
                          e.currentTarget.style.boxShadow = "0 6px 10px -2px rgba(77, 138, 138, 0.25), 0 3px 6px -2px rgba(77, 138, 138, 0.15)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundImage = "linear-gradient(to bottom, #5fa3a3, #4d8a8a)";
                        e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(77, 138, 138, 0.2), 0 2px 4px -1px rgba(77, 138, 138, 0.1)";
                      }}
                    >
                      {navigating ? (
                        <>
                          <svg style={{ animation: "spin 1s linear infinite", height: "16px", width: "16px" }} fill="none" viewBox="0 0 24 24">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Loading...
                        </>
                      ) : (
                        "View my matches"
                      )}
                    </button>

                    {/* Secondary: Context-aware button */}
                    {connection ? (
                      <button
                        onClick={handleGoToInbox}
                        disabled={navigating}
                        className="w-full min-h-[48px] px-6 text-[15px] font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {navigating ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Loading...
                          </>
                        ) : (
                          "Go to my inbox"
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleBrowseProviders}
                        disabled={navigating}
                        className="w-full min-h-[48px] px-6 text-[15px] font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {navigating ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Loading...
                          </>
                        ) : (
                          "Browse providers"
                        )}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* ============ DEFAULT STATE ============ */
                <>
                  {/* Content stack — clean, minimal */}
                  <div>
                    {/* Illustration */}
                    <DiscoveryIllustration />

                    {/* Headline */}
                    <h2 className="mt-6 text-xl sm:text-[22px] font-display font-bold text-gray-900 leading-snug">
                      {connection?.to_profile?.display_name
                        ? "Let more providers find you"
                        : "Let providers find you"
                      }
                    </h2>

                    {/* Subtext */}
                    <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
                      Share your care needs once. Providers in your area<br className="hidden sm:inline" /> will reach out to you directly.
                    </p>
                  </div>

                  {/* Action stack */}
                  <div className="mt-7">
                    {/* Primary CTA with explicit inline styles */}
                    <button
                      onClick={handleActivate}
                      disabled={saving}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        minHeight: "52px",
                        padding: "0 24px",
                      backgroundColor: "#4d8a8a",
                      backgroundImage: "linear-gradient(to bottom, #5fa3a3, #4d8a8a)",
                      color: "#ffffff",
                      fontSize: "15px",
                      fontWeight: 600,
                      borderRadius: "12px",
                      border: "none",
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.5 : 1,
                      boxShadow: "0 4px 6px -1px rgba(77, 138, 138, 0.2), 0 2px 4px -1px rgba(77, 138, 138, 0.1)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) {
                        e.currentTarget.style.backgroundImage = "linear-gradient(to bottom, #6db3b3, #5fa3a3)";
                        e.currentTarget.style.boxShadow = "0 6px 10px -2px rgba(77, 138, 138, 0.25), 0 3px 6px -2px rgba(77, 138, 138, 0.15)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundImage = "linear-gradient(to bottom, #5fa3a3, #4d8a8a)";
                      e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(77, 138, 138, 0.2), 0 2px 4px -1px rgba(77, 138, 138, 0.1)";
                    }}
                  >
                    {saving ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <svg style={{ animation: "spin 1s linear infinite", height: "16px", width: "16px" }} fill="none" viewBox="0 0 24 24">
                          <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </span>
                    ) : (
                      "Yes, let providers find me"
                    )}
                    </button>

                    {/* Secondary option — equally valid */}
                    <button
                      onClick={handleSkip}
                      disabled={saving}
                      className="mt-3 w-full min-h-[48px] px-6 text-[15px] font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                    >
                      {connection ? "Take me to my inbox" : "I'll explore on my own"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          SECTION 2 — BENEFITS
          ================================================================ */}
      <section className="relative px-4 sm:px-6 pt-2 pb-8">
        <div className="max-w-lg mx-auto">
          <p className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            While you&apos;re here
          </p>
          <BenefitsCard />
        </div>
      </section>

      {/* ================================================================
          SECTION 3 — PROVIDER RECOMMENDATIONS (horizontal scroll)
          ================================================================ */}
      <section className="relative pt-10 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header with View all button */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-gray-900">
                {city ? (
                  <>Top-rated providers in {city}</>
                ) : (
                  "Top-rated providers"
                )}
              </h2>
              <p className="text-gray-500 mt-1">
                Highly reviewed care providers {city ? `near ${city}` : "in your area"}
              </p>
            </div>
            {matches.length > 0 && (
              <Link
                href="/browse"
                className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors flex-shrink-0"
              >
                View all providers
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>

          {/* Horizontal scroll container — 2 cards visible + third peeking */}
          {matches.length > 0 ? (
            <div
              ref={scrollRef}
              className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 snap-x snap-mandatory"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {matches.map((provider) => (
                <div key={provider.provider_id} className="snap-start flex-shrink-0">
                  <ProviderScrollCard provider={provider} />
                </div>
              ))}
            </div>
          ) : providersLoading ? (
            /* Loading skeleton placeholders */
            <div
              className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`placeholder-${i}`} className="w-[280px] min-w-[280px]">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
                    <div className="h-40 sm:h-48 bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-primary-100/60 animate-pulse" />
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-gray-100 rounded-full w-3/4 animate-pulse" />
                      <div className="h-3 bg-gray-100 rounded-full w-1/2 animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty state — no providers to show */
            <div className="bg-gradient-to-br from-gray-50 to-primary-50/30 rounded-2xl border border-gray-200/60 p-8 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Find providers near you</h3>
              <p className="text-gray-500 text-sm mb-5 max-w-sm mx-auto">
                Browse our network of trusted care providers and find the right match for your needs.
              </p>
              <Link
                href="/browse"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors"
              >
                Browse all providers
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}

          {/* Mobile View all button — only show when we have provider cards */}
          {matches.length > 0 && (
            <div className="mt-6 sm:hidden">
              <Link
                href="/browse"
                className="flex items-center justify-center gap-2 w-full py-3 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors"
              >
                View all providers
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Animations and scrollbar hiding */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes card-glow {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(25, 144, 135, 0.08),
              0 4px 20px rgba(25, 144, 135, 0.08),
              0 8px 32px rgba(25, 144, 135, 0.04);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(25, 144, 135, 0.12),
              0 6px 28px rgba(25, 144, 135, 0.12),
              0 12px 40px rgba(25, 144, 135, 0.06);
          }
        }
        .active-card {
          border: 2px solid #199087 !important;
          box-shadow:
            0 4px 12px rgba(0,0,0,0.1),
            0 8px 24px rgba(0,0,0,0.08) !important;
        }
        .active-card:hover {
          border-color: #147a72 !important;
          box-shadow:
            0 6px 16px rgba(0,0,0,0.12),
            0 12px 32px rgba(0,0,0,0.1) !important;
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        /* Hide scrollbar for horizontal scroll containers */
        [style*="scrollbar-width: none"]::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

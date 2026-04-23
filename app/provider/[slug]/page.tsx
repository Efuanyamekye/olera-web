import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, OrganizationMetadata, CaregiverMetadata, GoogleReviewsData, CMSData, AiTrustSignals, StaffInfo } from "@/lib/types";
import { iosProviderToProfile } from "@/lib/mock-providers";
import type { Provider as IOSProvider } from "@/lib/types/provider";
import ConnectionCardWithRedirect from "@/components/providers/ConnectionCardWithRedirect";
import ProviderHeroGallery from "@/components/providers/ProviderHeroGallery";
import Breadcrumbs from "@/components/providers/Breadcrumbs";
import ExpandableText from "@/components/providers/ExpandableText";
import CompactProviderCard from "@/components/providers/CompactProviderCard";
import SaveButton from "@/components/providers/SaveButton";
import CareServicesList from "@/components/providers/CareServicesList";
import QASectionV2 from "@/components/providers/QASectionV2";
import SectionNav from "@/components/providers/SectionNav";
import type { SectionItem } from "@/components/providers/SectionNav";
import ClaimBadge from "@/components/providers/ClaimBadge";
import MobileGalleryActionBar from "@/components/providers/MobileGalleryActionBar";
import MobileStickyBottomCTA from "@/components/providers/MobileStickyBottomCTA";
import MobileClaimLink from "@/components/providers/MobileClaimLink";
import PriceEstimate from "@/components/providers/PriceEstimate";
import PricingEducationBadge from "@/components/providers/PricingEducationBadge";
import { getPricingConfig } from "@/lib/pricing-config";
import ManagePageCTA from "@/components/providers/ManagePageCTA";
import SectionEmptyState from "@/components/providers/SectionEmptyState";
import ReviewsSection from "@/components/providers/ReviewsSection";
import CMSQualitySection from "@/components/providers/CMSQualitySection";
import AiTrustSignalsSection from "@/components/providers/AiTrustSignalsSection";
import ScrollToConnectionCard from "@/components/providers/ScrollToConnectionCard";
import BenefitsDiscoveryModule from "@/components/providers/BenefitsDiscoveryModule";
import type { BenefitsProgram } from "@/components/providers/BenefitsDiscoveryModule";
import { getTopProgramsForState, getAllProgramIds, getEnrichedProgram } from "@/lib/program-data";
import {
  getInitials,
  formatCategory,
  getCategoryDescription,
  getCategoryServices,
  getSimilarProviders,
  getSuggestedQuestions,
} from "@/lib/provider-utils";

// Cache provider detail pages for 1 hour (ISR) — reduces Supabase query volume
export const revalidate = 3600;
import { buildHighlights, normalizeCareLabel, type HighlightItem, type HighlightIconType } from "@/lib/provider-highlights";
import { getServiceClient } from "@/lib/admin";
import { ViewTracker } from "@/components/analytics/ViewTracker";

// ============================================================
// Dynamic Metadata (SEO title, description, OG, canonical)
// ============================================================

async function fetchProviderForMeta(slug: string) {
  try {
    const supabase = await createClient();

    // Try slug column first (human-readable URL)
    const { data: bySlug } = await supabase
      .from("olera-providers")
      .select("provider_name, provider_category, city, state, provider_description, provider_images, provider_logo")
      .eq("slug", slug)
      .not("deleted", "is", true)
      .single();
    if (bySlug) return bySlug;

    // Fall back to provider_id (legacy alphanumeric ID)
    const { data: byId } = await supabase
      .from("olera-providers")
      .select("provider_name, provider_category, city, state, provider_description, provider_images, provider_logo")
      .eq("provider_id", slug)
      .not("deleted", "is", true)
      .single();
    if (byId) return byId;
  } catch { /* fall through */ }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("business_profiles")
      .select("display_name, category, city, state, description, image_url")
      .eq("slug", slug)
      .in("type", ["organization", "caregiver"])
      .single();
    if (data) {
      return {
        provider_name: data.display_name,
        provider_category: data.category,
        city: data.city,
        state: data.state,
        provider_description: data.description,
        provider_images: null,
        provider_logo: data.image_url,
      };
    }
  } catch { /* fall through */ }

  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const provider = await fetchProviderForMeta(slug);

  if (!provider) {
    return { title: "Provider Not Found | Olera" };
  }

  const name = provider.provider_name;
  const category = provider.provider_category || "Senior Care";
  const city = provider.city;
  const state = provider.state;
  const locationComma = [city, state].filter(Boolean).join(", ");
  const locationSpace = [city, state].filter(Boolean).join(" ");

  // Match v1.0 title format exactly to preserve SERP CTR during migration
  // v1: "{Name}, {City} {State}: Pricing & Availability | Olera.care"
  const title = locationSpace
    ? `${name}, ${locationSpace}: Pricing & Availability | Olera.care`
    : `${name}: Pricing & Availability | Olera.care`;
  const description = provider.provider_description
    ? provider.provider_description.slice(0, 160).trimEnd() + (provider.provider_description.length > 160 ? "..." : "")
    : `Find details, reviews, and pricing for ${name}, a ${category} provider${locationComma ? ` in ${locationComma}` : ""}. Compare options on Olera.`;

  const images: string[] = [];
  if (provider.provider_images) {
    const first = provider.provider_images.split(" | ")[0];
    if (first) images.push(first);
  } else if (provider.provider_logo) {
    images.push(provider.provider_logo);
  }

  return {
    title,
    description,
    alternates: {
      canonical: `https://olera.care/provider/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://olera.care/provider/${slug}`,
      siteName: "Olera",
      type: "website",
      ...(images.length > 0 && { images }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images.length > 0 && { images }),
    },
  };
}

// Extended metadata type that includes mock-specific fields
interface ExtendedMetadata extends OrganizationMetadata, CaregiverMetadata {
  rating?: number;
  review_count?: number;
  images?: string[];
  staff?: StaffInfo;
  badge?: string;
  accepted_payments?: string[];
  pricing_details?: { service: string; rate: string; rateType: string }[];
  staff_screening?: { background_checked: boolean; licensed: boolean; insured: boolean };
  reviews?: { name: string; rating: number; date: string; comment: string; relationship?: string }[];
  community_score?: number;
  value_score?: number;
  info_score?: number;
  price_min?: number;
  price_max?: number;
  price_unit?: "HOUR" | "MONTH";
}

// --- Inline SVG icon components ---

function StarIcon({ className, filled = true }: { className?: string; filled?: boolean }) {
  return filled ? (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ) : (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Icon for each highlight type — matches Olera 1.0 Figma
function HighlightIcon({ icon, className }: { icon: HighlightIconType; className?: string }) {
  switch (icon) {
    case "shield":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "badge":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      );
    case "clock":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "star":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      );
    case "check":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "house":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
        </svg>
      );
    case "people":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "medical":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
        </svg>
      );
    default: // "sparkle"
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      );
  }
}


// ============================================================
// Page Component
// ============================================================

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // --- Data fetching ---
  let profile: Profile | null = null;
  let googleReviewsData: GoogleReviewsData | null = null;
  let cmsData: CMSData | null = null;
  let aiTrustSignals: AiTrustSignals | null = null;
  let providerPlaceId: string | null = null;
  let rawProviderId: string | null = null;
  let providerSource: "ios" | "bp" = "ios";

  // 1. Try iOS Supabase (olera-providers table) — slug first, then provider_id
  try {
    const supabase = await createClient();

    // Try slug column (human-readable URL)
    const { data: bySlug } = await supabase
      .from("olera-providers")
      .select("*")
      .eq("slug", slug)
      .not("deleted", "is", true)
      .single<IOSProvider>();

    if (bySlug) {
      profile = iosProviderToProfile(bySlug);
      googleReviewsData = bySlug.google_reviews_data;
      cmsData = bySlug.cms_data ?? null;
      aiTrustSignals = bySlug.ai_trust_signals ?? null;
      providerPlaceId = bySlug.place_id;
      rawProviderId = bySlug.provider_id;
    } else {
      // Fall back to provider_id (legacy alphanumeric ID)
      const { data: byId } = await supabase
        .from("olera-providers")
        .select("*")
        .eq("provider_id", slug)
        .not("deleted", "is", true)
        .single<IOSProvider>();

      if (byId) {
        profile = iosProviderToProfile(byId);
        googleReviewsData = byId.google_reviews_data;
        cmsData = byId.cms_data ?? null;
        aiTrustSignals = byId.ai_trust_signals ?? null;
        providerPlaceId = byId.place_id;
        rawProviderId = byId.provider_id;
      }
    }
  } catch {
    // iOS Supabase not configured or provider not found
  }

  // 2. Try web business_profiles table
  if (!profile) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("slug", slug)
        .in("type", ["organization", "caregiver"])
        .single<Profile>();
      if (data) {
        profile = data;
        providerSource = "bp";
        // Extract Google data from business_profile metadata
        const bpMeta = data.metadata as Record<string, unknown> | null;
        const gm = bpMeta?.google_metadata as { place_id?: string; rating?: number; review_count?: number } | undefined;
        const bpGoogleReviews = bpMeta?.google_reviews_data as GoogleReviewsData | undefined;
        if (bpGoogleReviews) {
          googleReviewsData = bpGoogleReviews;
        }
        if (gm?.place_id) {
          providerPlaceId = gm.place_id;
        }
        rawProviderId = data.id;
      }
    } catch {
      // Supabase not configured — fall through to mock lookup
    }
  }

  if (!profile) {
    notFound();
  }

  // --- Data extraction ---
  const meta = profile.metadata as ExtendedMetadata;
  const priceRange =
    meta?.price_range ||
    (meta?.hourly_rate_min && meta?.hourly_rate_max
      ? `$${meta.hourly_rate_min}-${meta.hourly_rate_max}/hr`
      : null);

  const rating = meta?.rating;
  const images = meta?.images || (profile.image_url ? [profile.image_url] : []);
  let staff = meta?.staff;
  const acceptedPayments = meta?.accepted_payments || [];

  const categoryLabel = formatCategory(profile.category);
  const locationStr = [profile.city, profile.state].filter(Boolean).join(", ");
  const pricingConfig = profile.category ? getPricingConfig(profile.category) : null;

  // --- Parallel data fetching (claim state, similar providers, Q&A, reviews) ---
  const [claimResult, similarProviders, qaResult] = await Promise.all([
    // 1. Actual claim state (iOS data always says "unclaimed")
    profile.source_provider_id
      ? (async () => {
          try {
            const supabase = await createClient();
            const { data: bp } = await supabase
              .from("business_profiles")
              .select("claim_state, account_id, metadata, verification_state")
              .eq("source_provider_id", profile.source_provider_id!)
              .maybeSingle();
            return bp;
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null),

    // 2. Similar providers (state-filtered, with global fallback)
    getSimilarProviders(profile.category, profile.source_provider_id || profile.id, profile.state, 3),

    // 3. Q&A pairs + review count
    (async () => {
      try {
        const db = getServiceClient();
        const [qaResponse, reviewResponse] = await Promise.all([
          db
            .from("provider_questions")
            .select("id, question, answer, asker_name, created_at")
            .eq("provider_id", profile.slug)
            .eq("is_public", true)
            .eq("answer_status", "published")  // Only show published answers (not pending verification)
            .in("status", ["approved", "answered"])
            .not("answer", "is", null)
            .order("created_at", { ascending: false })
            .limit(20),
          db
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("provider_id", profile.id)
            .eq("status", "published"),
        ]);
        return {
          questions: (qaResponse.data || []).filter((q: { answer: string | null }) => q.answer && q.answer.trim().length > 0),
          reviewCount: reviewResponse.count ?? 0,
        };
      } catch {
        return { questions: [], reviewCount: 0 };
      }
    })(),
  ]);

  let actualClaimState = profile.claim_state;
  let claimAccountId: string | null = profile.account_id;
  // For native business_profiles, use profile.verification_state directly
  // For iOS providers, this may be undefined but claimResult will override
  let actualVerificationState: string | null = profile.verification_state ?? null;
  if (claimResult) {
    actualClaimState = claimResult.claim_state;
    claimAccountId = claimResult.account_id;
    actualVerificationState = claimResult.verification_state ?? actualVerificationState;
    // Merge staff/owner data from business_profiles metadata (iOS metadata doesn't have it)
    const bpMeta = claimResult.metadata as ExtendedMetadata | null;
    if (bpMeta?.staff) {
      staff = bpMeta.staff;
    }
  }

  // Only show "Claimed" badge when provider is BOTH claimed AND verified
  // This prevents the trust signal from appearing before verification is complete
  const displayClaimState = (actualClaimState === "claimed" && actualVerificationState === "verified")
    ? "claimed"
    : "unclaimed";

  const answeredQuestions = qaResult.questions as { id: string; question: string; answer: string; asker_name: string; created_at: string }[];
  const realReviewCount = qaResult.reviewCount;

  const pricingDetails = meta?.pricing_details || [];
  const staffScreening = meta?.staff_screening;

  // === Review Data Sources (properly separated) ===
  // 1. Real reviews come from the reviews table (realReviewCount from DB query above)
  // 2. Demo reviews are for testing only (clearly marked in UI)
  // 3. Google rating is external data (read-only)
  const isDemoProfile = meta?.demo_mode === true;
  // Support both new demo_reviews and legacy reviews field for backwards compatibility
  const demoReviews = meta?.demo_reviews || meta?.reviews || [];
  // Only use demo reviews if the profile is in demo mode OR it's a seeded profile
  // Real providers (claimed_from_directory) should not show demo reviews
  const shouldShowDemoReviews = isDemoProfile || profile.source === "seeded";
  const reviewsToShow = shouldShowDemoReviews ? demoReviews : [];

  // Use real review count from database for CTA display
  const reviewCount = realReviewCount;

  // Google rating (external, read-only) - stored in google_metadata
  const googleRating = meta?.google_metadata?.rating ?? null;

  // --- Non-blocking background tasks (view tracking + on-demand backfill) ---
  if (rawProviderId) {
    const db = getServiceClient();
    // Task 6: Update last_viewed_at (debounced: only if >24h stale)
    db.from("olera-providers")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("provider_id", rawProviderId)
      .or("last_viewed_at.is.null,last_viewed_at.lt." + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .then(() => { /* fire and forget */ });

    // Task 7: On-demand backfill if provider has place_id but no cached reviews
    if (providerPlaceId && !googleReviewsData) {
      fetch(new URL("/api/internal/backfill-google-review", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: rawProviderId, place_id: providerPlaceId, source: providerSource }),
      }).catch(() => { /* fire and forget */ });
    }
  }

  // --- Boolean flags for real data availability ---
  const hasRating = rating != null;
  const hasPriceRange = priceRange != null;
  const hasStaff = staff != null;
  const hasReviews = reviewsToShow.length > 0 || realReviewCount > 0;
  const hasStaffScreening = staffScreening != null &&
    (staffScreening.background_checked || staffScreening.licensed || staffScreening.insured);
  const hasAcceptedPayments = acceptedPayments.length > 0;

  // Build care services: real data first, then pad with category-inferred services
  // Normalize labels to collapse synonyms (e.g., "Home Care (Non-medical)" → "Home Care")
  const rawCareTypes = (profile.care_types ?? []).map(normalizeCareLabel);
  const careServices: string[] = [...rawCareTypes];
  if (profile.category) {
    const inferred = getCategoryServices(profile.category);
    const existing = new Set(careServices.map((s) => s.toLowerCase()));
    for (const s of inferred) {
      if (!existing.has(s.toLowerCase())) careServices.push(s);
    }
  }

  // Build highlights: data-driven waterfall (trust signals → social proof → CMS → screening → capability)
  const highlights: HighlightItem[] = buildHighlights({
    trustSignals: aiTrustSignals,
    googleReviews: googleReviewsData,
    cmsData,
    staffScreening,
    careTypes: profile.care_types,
    category: profile.category,
  });

  // Prepare benefits data for this provider's state (server-side, keeps client bundle small)
  const benefitsData = profile.state ? getTopProgramsForState(profile.state, 3) : null;
  let benefitsAllPrograms: BenefitsProgram[] = [];
  if (benefitsData) {
    const allIds = getAllProgramIds(benefitsData.stateId);
    benefitsAllPrograms = allIds
      .map((id) => getEnrichedProgram(benefitsData.stateId, id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        tagline: p.tagline,
        savingsRange: p.savingsRange,
        programType: p.programType,
        structuredEligibility: p.structuredEligibility
          ? {
              ageRequirement: p.structuredEligibility.ageRequirement,
              incomeTable: p.structuredEligibility.incomeTable,
            }
          : undefined,
      }));
  }
  const hasBenefitsData = !!(benefitsData && benefitsData.programs.length > 0);

  // ============================================================
  // Section navigation items — only show tabs for visible sections
  // ============================================================
  const sectionItems: SectionItem[] = [];
  sectionItems.push({ id: "highlights", label: "Highlights" });
  const hasGoogleReviews = (googleReviewsData?.reviews?.length ?? 0) > 0;
  if (hasGoogleReviews) sectionItems.push({ id: "reviews", label: "Reviews" });
  sectionItems.push({ id: "qa", label: "Q&A" });
  if (hasBenefitsData) sectionItems.push({ id: "benefits", label: "Benefits" });
  sectionItems.push({ id: "services", label: "Services" });
  if (!hasGoogleReviews) sectionItems.push({ id: "reviews", label: "Reviews" });
  if (cmsData?.overall_rating && cmsData.overall_rating >= 4) sectionItems.push({ id: "quality", label: "Quality" });
  if (aiTrustSignals && aiTrustSignals.summary_score > 0) sectionItems.push({ id: "trust-signals", label: "Verified" });
  sectionItems.push({ id: "about", label: "About" });
  if (pricingDetails.length > 0) sectionItems.push({ id: "pricing", label: "Pricing" });
  if (hasAcceptedPayments) sectionItems.push({ id: "payment", label: "Payment" });

  // ============================================================
  // Render
  // ============================================================

  // ── JSON-LD structured data ──
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://olera.care" },
      ...(categoryLabel
        ? [{ "@type": "ListItem", position: 2, name: categoryLabel, item: `https://olera.care/browse?type=${profile.category}` }]
        : []),
      ...(profile.city && profile.state
        ? [{ "@type": "ListItem", position: categoryLabel ? 3 : 2, name: `${profile.city}, ${profile.state}`, item: `https://olera.care/browse?type=${profile.category}&q=${encodeURIComponent(`${profile.city}, ${profile.state}`)}` }]
        : []),
      { "@type": "ListItem", position: (categoryLabel ? 3 : 2) + (profile.city ? 1 : 0), name: profile.display_name, item: `https://olera.care/provider/${profile.slug}` },
    ],
  };

  const localBusinessJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: profile.display_name,
    url: `https://olera.care/provider/${profile.slug}`,
    ...(profile.description && { description: profile.description.slice(0, 300) }),
    ...(profile.address && {
      address: {
        "@type": "PostalAddress",
        streetAddress: profile.address,
        addressLocality: profile.city,
        addressRegion: profile.state,
        ...(profile.zip && { postalCode: profile.zip }),
      },
    }),
    ...(profile.lat != null && profile.lng != null && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: profile.lat,
        longitude: profile.lng,
      },
    }),
    ...(profile.phone && { telephone: profile.phone }),
    ...(images.length > 0 && { image: images[0] }),
    ...(googleReviewsData && googleReviewsData.rating > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: googleReviewsData.rating,
        bestRating: 5,
        worstRating: 0,
        ...(googleReviewsData.review_count != null && { reviewCount: googleReviewsData.review_count }),
      },
    }),
    // Suppress priceRange in schema for Tier 3 unless provider explicitly entered pricing
    ...(priceRange && (pricingConfig?.tier !== 3 || (meta?.price_min != null)) && { priceRange }),
    ...(meta?.price_min != null && meta?.price_max != null && {
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        priceCurrency: "USD",
        minPrice: meta.price_min,
        maxPrice: meta.price_max,
        unitText: meta.price_unit || "MONTH",
      },
    }),
    ...(reviewsToShow.length > 0 && {
      review: reviewsToShow.slice(0, 5).map((r) => ({
        "@type": "Review",
        author: { "@type": "Person", name: r.name },
        reviewRating: {
          "@type": "Rating",
          ratingValue: r.rating,
          bestRating: 5,
          worstRating: 1,
        },
        datePublished: r.date,
        reviewBody: r.comment,
      })),
    }),
    // OfferCatalog — maps the list of services offered to schema.org Offers.
    // Uses careServices (real care_types padded with category-inferred defaults).
    ...(careServices.length > 0 && {
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Care Services",
        itemListElement: careServices.map((service) => ({
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: service,
          },
        })),
      },
    }),
    // sameAs — identity assertion linking this Olera page to the same
    // entity on Google Maps via the place_id. Helps search engines
    // understand the two listings describe the same business.
    ...(providerPlaceId && {
      sameAs: [
        `https://www.google.com/maps/place/?q=place_id:${providerPlaceId}`,
      ],
    }),
  };

  // FAQPage schema — only emitted when real answered Q&A pairs exist
  const faqJsonLd = answeredQuestions.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: answeredQuestions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  } : null;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <ViewTracker providerId={slug} />

      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      {/* Section Navigation (appears on scroll) */}
      <SectionNav
        sections={sectionItems}
        providerName={profile.display_name}
      />

      {/* ===== Hero Zone — Vanilla Background ===== */}
      <div className="bg-vanilla-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 md:pt-6 pb-8">

          {/* Breadcrumbs */}
          <Breadcrumbs
            category={profile.category}
            city={profile.city}
            state={profile.state}
            providerName={profile.display_name}
          />

          {/* ── Hero (full width, above the grid) ── */}
          <div className="flex flex-col md:flex-row gap-6">
            {/* Gallery */}
            <div className="flex-shrink-0 relative w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] md:w-[448px] -mx-4 sm:-mx-6 md:mx-0">
              <ProviderHeroGallery
                images={images}
                providerName={profile.display_name}
                category={profile.category}
              />
              <MobileGalleryActionBar
                provider={{
                  providerId: profile.id,
                  slug: profile.slug,
                  name: profile.display_name,
                  location: locationStr,
                  careTypes: profile.care_types || [],
                  image: images[0] || null,
                  rating: rating || undefined,
                }}
              />
              {images.length > 0 && (
                <div className="absolute top-4 left-4 z-20 hidden md:block">
                  <ClaimBadge
                    claimState={displayClaimState}
                    providerName={profile.display_name}
                    claimUrl={`/provider/onboarding?org=${profile.slug}`}
                  />
                </div>
              )}
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Name + Save */}
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight leading-tight font-display">
                  {profile.display_name}
                </h1>
                <div className="hidden md:block">
                  <SaveButton
                    provider={{
                      providerId: profile.id,
                      slug: profile.slug,
                      name: profile.display_name,
                      location: locationStr,
                      careTypes: profile.care_types || [],
                      image: images[0] || null,
                      rating: rating || undefined,
                    }}
                    variant="pill"
                  />
                </div>
              </div>

              {/* ── Mobile identity layout ── */}
              <div className="md:hidden">
                {/* Row 1: Category · Location · Address */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-sm text-gray-500">
                  {categoryLabel && (
                    <>
                      <span className="text-gray-700 font-medium">{categoryLabel}</span>
                      {locationStr && <span className="text-gray-300">·</span>}
                    </>
                  )}
                  {locationStr && <span>{locationStr}</span>}
                  {profile.address && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="truncate max-w-[180px]">{profile.address}</span>
                    </>
                  )}
                </div>

                {/* Row 2: Price (left) — Rating (right) */}
                <div className="flex items-center justify-between mt-3">
                  <div>
                    {pricingConfig?.tier === 3 && !hasPriceRange ? (
                      <PricingEducationBadge
                        category={profile.category!}
                        providerName={profile.display_name}
                        city={profile.city ?? undefined}
                        state={profile.state ?? undefined}
                      />
                    ) : hasPriceRange ? (
                      <PriceEstimate
                        priceRange={priceRange!}
                        category={profile.category ?? undefined}
                        providerName={profile.display_name}
                        city={profile.city ?? undefined}
                        state={profile.state ?? undefined}
                      />
                    ) : (
                      <p className="text-sm text-gray-400">Contact for pricing</p>
                    )}
                  </div>
                  {hasRating && rating != null && (
                    <span className="flex items-center gap-1.5">
                      <StarIcon className="w-5 h-5 text-amber-400" />
                      <span className="text-base font-bold text-gray-900">{rating.toFixed(1)}</span>
                      <span className="text-sm text-gray-400">on Google</span>
                    </span>
                  )}
                </div>

                {/* Row 3: Claim status */}
                <MobileClaimLink
                  claimState={displayClaimState}
                  providerName={profile.display_name}
                  claimUrl={`/provider/onboarding?org=${profile.slug}`}
                />
              </div>

              {/* ── Desktop identity layout (unchanged) ── */}
              <div className="hidden md:block">
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-2 text-sm text-gray-500">
                  {categoryLabel && (
                    <>
                      <span className="text-gray-700 font-medium">{categoryLabel}</span>
                      {(locationStr || hasRating) && <span className="text-gray-300">·</span>}
                    </>
                  )}
                  {locationStr && (
                    <>
                      <span>{locationStr}</span>
                      {hasRating && <span className="text-gray-300">·</span>}
                    </>
                  )}
                  {hasRating && rating != null && (
                    <span className="flex items-center gap-1">
                      <StarIcon className="w-4 h-4 text-amber-400" />
                      <span className="font-semibold text-gray-900">{rating.toFixed(1)}</span>
                      <span>on Google</span>
                    </span>
                  )}
                </div>

                {pricingConfig?.tier === 3 && !hasPriceRange ? (
                  <div className="mt-1">
                    <PricingEducationBadge
                      category={profile.category!}
                      providerName={profile.display_name}
                      city={profile.city ?? undefined}
                      state={profile.state ?? undefined}
                    />
                  </div>
                ) : hasPriceRange ? (
                  <PriceEstimate
                    priceRange={priceRange!}
                    category={profile.category ?? undefined}
                    providerName={profile.display_name}
                    city={profile.city ?? undefined}
                    state={profile.state ?? undefined}
                  />
                ) : (
                  <p className="text-sm text-gray-400 mt-1">Contact for pricing</p>
                )}

                {profile.address && (
                  <p className="text-sm text-gray-400 mt-0.5">{profile.address}</p>
                )}
              </div>

              {/* Highlight badges — data-driven, variable count (1-4 items) */}
              {highlights.length > 0 && (
                <div id="highlights" className="scroll-mt-20">
                  {/* Mobile: flex-wrap chips */}
                  <div className="md:hidden flex flex-wrap gap-2.5 mt-4">
                    {highlights.map((h) => (
                      <div key={h.label} className="bg-gray-50 rounded-xl py-3 px-3.5 flex items-center gap-2.5">
                        <HighlightIcon icon={h.icon} className="w-5 h-5 text-gray-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-700 leading-tight">{h.label}</span>
                      </div>
                    ))}
                  </div>
                  {/* Desktop: flex-wrap chips */}
                  <div className="hidden md:flex flex-wrap gap-2 mt-4">
                    {highlights.map((h) => (
                      <div key={h.label} className="bg-white border border-gray-200 rounded-lg py-2.5 px-3 flex items-center gap-2">
                        <HighlightIcon icon={h.icon} className="w-4 h-4 text-primary-500 flex-shrink-0" />
                        <span className="text-sm text-gray-600">{h.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── "Manage this page" CTA ── */}
              <ManagePageCTA
                providerSlug={profile.slug}
                providerName={profile.display_name}
                providerId={profile.id}
                sourceProviderId={profile.source_provider_id}
                providerEmail={profile.email}
                providerCity={profile.city}
                providerState={profile.state}
                isClaimed={actualClaimState === "claimed"}
                claimAccountId={claimAccountId}
              />

              {/* Managed by — only show when staff data exists */}
              {hasStaff && (
                <div className="flex items-center gap-2.5 mt-4">
                  <div className="relative flex-shrink-0">
                    {staff!.image ? (
                      <Image src={staff!.image} alt={staff!.name} width={28} height={28} className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-gray-500">{getInitials(staff!.name)}</span>
                      </div>
                    )}
                    {displayClaimState === "claimed" && (
                      <svg className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 text-[#198087]" viewBox="0 0 20 20" fill="currentColor">
                        <circle cx="10" cy="10" r="10" fill="white" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    Managed by: <span className="font-medium text-gray-700">{staff!.name}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ===== Content Zone — White Background ===== */}
      <div className="bg-white" data-spotlight-zone>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* -- Two-Column Grid (content + sticky sidebar) -- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ========== Left Column ========== */}
          <div className="lg:col-span-2">

            {/* ══════════════════════════════════════════
                Content Sections (1.0 order)
               ══════════════════════════════════════════ */}
            <div data-spotlight-parent>

              {/* ── What families are saying (above services when reviews exist) ── */}
              {(googleReviewsData?.reviews?.length ?? 0) > 0 && (
                <div id="reviews" className="scroll-mt-20">
                  <ReviewsSection
                    providerId={profile.slug}
                    providerSlug={profile.slug}
                    providerName={profile.display_name}
                    mockReviews={reviewsToShow}
                    isDemoMode={shouldShowDemoReviews && reviewsToShow.length > 0}
                    googleReviewsData={googleReviewsData}
                    placeId={providerPlaceId}
                    hideBorder
                  />
                </div>
              )}

              {/* ── Customer Questions & Answers ── */}
              <div id="qa" className={`py-8 scroll-mt-20 ${(googleReviewsData?.reviews?.length ?? 0) > 0 ? "border-t border-gray-200" : ""}`}>
                <QASectionV2
                  providerId={profile.slug}
                  providerName={profile.display_name}
                  providerImage={images[0]}
                  questions={answeredQuestions.map((q) => ({
                    id: q.id,
                    question: q.question,
                    answer: q.answer,
                    asker_name: q.asker_name,
                    created_at: q.created_at,
                  }))}
                  suggestedQuestions={getSuggestedQuestions(profile.category)}
                  hasBenefitsSection={hasBenefitsData && !!benefitsData}
                />
              </div>

              {/* ── Benefits Discovery ── */}
              {hasBenefitsData && benefitsData && (
                <div id="benefits" className="py-8 scroll-mt-20 border-t border-gray-200">
                  <BenefitsDiscoveryModule
                    providerState={profile.state!}
                    stateId={benefitsData.stateId}
                    stateName={benefitsData.stateName}
                    providerName={profile.display_name}
                    providerSlug={profile.slug}
                    topPrograms={benefitsData.programs.map((p) => ({
                      id: p.id,
                      name: p.name,
                      shortName: p.shortName,
                      tagline: p.tagline,
                      savingsRange: p.savingsRange,
                    }))}
                    allPrograms={benefitsAllPrograms}
                  />
                </div>
              )}

              {/* ── Care Services ── */}
              <div id="services" className="py-8 scroll-mt-20 border-t border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 font-display mb-5">Care Services</h2>
                <CareServicesList services={careServices} initialCount={6} />
              </div>

              {/* ── Staff Screening — hidden when no real data ── */}
              {hasStaffScreening && (
                <div id="screening" className="py-8 scroll-mt-20 border-t border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-900 font-display mb-5">Staff Screening</h2>
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    {[
                      { label: "Background Checked", verified: staffScreening!.background_checked },
                      { label: "Licensed", verified: staffScreening!.licensed },
                      { label: "Insured", verified: staffScreening!.insured },
                    ].filter(item => item.verified).map((item) => (
                      <div key={item.label} className="flex items-center gap-2.5">
                        <CheckIcon className="w-5 h-5 text-primary-600 flex-shrink-0" />
                        <span className="text-base text-gray-700">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── What families are saying (below Q&A when no reviews — empty state) ── */}
              {(googleReviewsData?.reviews?.length ?? 0) === 0 && (
                <div id="reviews" className="scroll-mt-20">
                  <ReviewsSection
                    providerId={profile.slug}
                    providerSlug={profile.slug}
                    providerName={profile.display_name}
                    mockReviews={reviewsToShow}
                    isDemoMode={shouldShowDemoReviews && reviewsToShow.length > 0}
                    googleReviewsData={googleReviewsData}
                    placeId={providerPlaceId}
                  />
                </div>
              )}

              {/* ── CMS Quality & Safety — only show 4/5 and 5/5 publicly (lower scores used for ranking only) ── */}
              {cmsData && cmsData.overall_rating && cmsData.overall_rating >= 4 && (
                <div className="py-8 border-t border-gray-200">
                  <CMSQualitySection cmsData={cmsData} />
                </div>
              )}

              {/* ── AI Verified Credentials ── */}
              {aiTrustSignals && aiTrustSignals.summary_score > 0 && (
                <div className="py-8 border-t border-gray-200">
                  <AiTrustSignalsSection signals={aiTrustSignals} />
                </div>
              )}

              {/* ── About ── */}
              <div id="about" className="py-8 scroll-mt-20 border-t border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 font-display mb-4">About</h2>
                <ExpandableText
                  text={profile.description || (profile.category ? getCategoryDescription(profile.category, profile.display_name, locationStr || null) : "")}
                  maxLength={300}
                />
              </div>

              {/* ── Detailed Pricing ── */}
              {pricingDetails.length > 0 && (
                <div id="pricing" className="py-8 scroll-mt-20 border-t border-gray-200">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 font-display">Prices at {profile.display_name}</h2>
                    </div>
                    <ScrollToConnectionCard className="px-5 py-2.5 text-sm font-medium text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50 transition-colors flex-shrink-0">
                      Get a custom quote
                    </ScrollToConnectionCard>
                  </div>
                  <div className="space-y-2">
                    {pricingDetails.map((item) => (
                      <div
                        key={item.service}
                        className="flex items-center justify-between py-3.5 px-4 bg-gray-50 rounded-lg"
                      >
                        <span className="text-base font-medium text-gray-900">{item.service}</span>
                        <span className="text-base font-semibold text-gray-900">
                          {item.rate} <span className="font-normal text-gray-500">/{item.rateType.replace("per ", "")}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {pricingConfig && (
                    <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                      {pricingConfig.disclaimer({
                        providerName: profile.display_name,
                        city: profile.city ?? undefined,
                        state: profile.state ?? undefined,
                      })}
                      {pricingConfig.coverageNote && (
                        <> {pricingConfig.coverageNote({
                          providerName: profile.display_name,
                          city: profile.city ?? undefined,
                          state: profile.state ?? undefined,
                        })}</>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* ── Payment & Insurance — hidden when no real data ── */}
              {hasAcceptedPayments && (
                <div id="payment" className="py-8 scroll-mt-20 border-t border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-900 font-display mb-5">Acceptable Payment / Insurance Options</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {acceptedPayments.map((payment) => (
                      <div key={payment} className="flex items-center justify-between py-3 px-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          <span className="text-base text-primary-600 font-medium">{payment}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-base text-gray-500">
                    For clarity and guidance,{" "}
                    <ScrollToConnectionCard className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
                      Book a consultation
                    </ScrollToConnectionCard>
                  </p>
                </div>
              )}

              {/* ── Facility Manager — hidden when no staff data ── */}
              {hasStaff && (
                <div id="team" className="py-8 border-t border-gray-200 scroll-mt-20">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 font-display">Facility manager</h2>
                    <ScrollToConnectionCard className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50 transition-colors">
                      Connect with us
                    </ScrollToConnectionCard>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start gap-6">
                    <div className="border border-gray-100 rounded-2xl px-6 pt-8 pb-6 text-center flex-shrink-0 w-52 shadow-md">
                      <div className="relative mx-auto mb-5 w-24 h-24">
                        {staff!.image ? (
                          <Image src={staff!.image} alt={staff!.name} width={96} height={96} className="w-24 h-24 rounded-full object-cover" />
                        ) : (
                          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
                            <span className="text-3xl font-bold text-gray-500">{getInitials(staff!.name)}</span>
                          </div>
                        )}
                        {displayClaimState === "claimed" && (
                          <svg className="absolute bottom-0 right-0 w-6 h-6 text-[#198087]" viewBox="0 0 20 20" fill="currentColor">
                            <circle cx="10" cy="10" r="10" fill="white" />
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <p className="text-base font-bold text-gray-900">{staff!.name}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{staff!.position}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 mb-2">Care motivation</h3>
                      <ExpandableText text={staff!.care_motivation || staff!.bio} maxLength={200} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-6 text-sm text-gray-500">
                    <svg className="w-5 h-5 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17,8C8,10,5.9,16.17,3.82,21.34L5.71,22l1-2.3A4.49,4.49,0,0,0,8,20C19,20,22,3,22,3,21,5,14,5.25,9,6.25S2,11.5,2,13.5a6.22,6.22,0,0,0,1.75,3.75" />
                    </svg>
                    To help protect your family, the Olera team vet facility managers for information accuracy.
                  </div>
                </div>
              )}

              {/* ── Disclaimer ── */}
              <div className="py-8 border-t border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 font-display mb-4">Disclaimer</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  We strive to keep this page accurate and current, but some details may not be up to date. To confirm whether {profile.display_name} is the right fit for you or your loved one, please verify all information directly with the provider by submitting a connect request or contacting them.
                </p>
                <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-200">
                  <p className="text-sm text-gray-500">Are you the owner of this business?</p>
                  <a
                    href={`/provider/onboarding?org=${profile.slug}`}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    Manage this page <span aria-hidden="true">→</span>
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* ========== Right Column — Sticky Sidebar (hidden on mobile) ========== */}
          <div className="hidden md:block lg:col-span-1 self-stretch">
            <div id="connection-card" className="sticky top-24">
              <ConnectionCardWithRedirect
                providerId={profile.id}
                providerName={profile.display_name}
                providerSlug={profile.slug}
                priceRange={priceRange}
                reviewCount={reviewCount}
                phone={profile.phone}
                acceptedPayments={acceptedPayments}
                careTypes={profile.care_types}
                city={profile.city}
                state={profile.state}
                responseTime={null}
                providerCategory={profile.category}
                providerCity={profile.city}
                providerState={profile.state}
              />
            </div>
          </div>
        </div>

        {/* ===== Compare Providers ===== */}
        {similarProviders.providers.length > 0 && (
          <div className="border-t border-gray-200 pt-8 mt-4">
            <h2 className="text-2xl font-bold text-gray-900 font-display mb-6">
              {similarProviders.isLocal
                ? <>Compare {profile.display_name}{locationStr ? ` of ${locationStr}` : ""} to the best local options</>
                : <>Compare {profile.display_name} to top-rated {categoryLabel ?? "similar"} providers</>
              }
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {similarProviders.providers.map((provider) => (
                <CompactProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </div>
        )}

        </div>
      </div>

      {/* Mobile sticky bottom CTA — opens bottom sheet with ConnectionCard */}
      <MobileStickyBottomCTA
        providerName={profile.display_name}
        priceRange={priceRange}
        providerId={profile.id}
        providerSlug={profile.slug}
        reviewCount={reviewCount}
        phone={profile.phone}
        acceptedPayments={acceptedPayments}
        careTypes={profile.care_types}
        providerCategory={profile.category}
        providerCity={profile.city}
        providerState={profile.state}
      />
    </div>
  );
}

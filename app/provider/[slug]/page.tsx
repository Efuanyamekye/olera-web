import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, OrganizationMetadata, CaregiverMetadata } from "@/lib/types";
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
import { ManagePageButton } from "@/components/providers/ManageListingModal";
import SectionEmptyState from "@/components/providers/SectionEmptyState";
import ReviewsSection from "@/components/providers/ReviewsSection";
import ScrollToConnectionCard from "@/components/providers/ScrollToConnectionCard";
import {
  getInitials,
  formatCategory,
  getCategoryHighlights,
  getCategoryDescription,
  getCategoryServices,
  getSimilarProviders,
} from "@/lib/provider-utils";
import { getServiceClient } from "@/lib/admin";

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
  const location = [city, state].filter(Boolean).join(", ");

  const title = `${name} | ${category} in ${location || "Your Area"} | Olera`;
  const description = provider.provider_description
    ? provider.provider_description.slice(0, 160).trimEnd() + (provider.provider_description.length > 160 ? "..." : "")
    : `Find details, reviews, and pricing for ${name}, a ${category} provider${location ? ` in ${location}` : ""}. Compare options on Olera.`;

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
  staff?: { name: string; position: string; bio: string; image: string };
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
function HighlightIcon({ label, className }: { label: string; className?: string }) {
  const lower = label.toLowerCase();
  // Shield-check for background/screening
  if (lower.includes("background") || lower.includes("screen") || lower.includes("insured") || lower.includes("licensed")) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    );
  }
  // House for housekeeping/cleaning/home
  if (lower.includes("housekeep") || lower.includes("clean") || lower.includes("home care") || lower.includes("laundry")) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    );
  }
  // Badge/certificate for caregivers/certified
  if (lower.includes("caregiver") || lower.includes("certif") || lower.includes("staff") || lower.includes("nurse")) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    );
  }
  // People/heart for companionship/community/recreation
  if (lower.includes("companion") || lower.includes("communit") || lower.includes("social") || lower.includes("recreation")) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    );
  }
  // Medical cross for health/medical/medication/wellness
  if (lower.includes("medical") || lower.includes("health") || lower.includes("medic") || lower.includes("wellness") || lower.includes("exercise")) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    );
  }
  // Default: sparkle/star for meals, transport, other services
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
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
      profile = data;
    } catch {
      // Supabase not configured — fall through to mock lookup
    }
  }

  if (!profile) {
    notFound();
  }

  // --- Actual claim state (iOS data always says "unclaimed") ---
  let actualClaimState = profile.claim_state;
  let claimAccountId: string | null = profile.account_id;
  if (profile.source_provider_id) {
    try {
      const supabase = await createClient();
      const { data: bp } = await supabase
        .from("business_profiles")
        .select("claim_state, account_id")
        .eq("source_provider_id", profile.source_provider_id)
        .maybeSingle();
      if (bp) {
        actualClaimState = bp.claim_state;
        claimAccountId = bp.account_id;
      }
    } catch {
      // Best effort — use profile defaults
    }
  }

  // --- Data extraction ---
  const meta = profile.metadata as ExtendedMetadata;
  const priceRange =
    meta?.price_range ||
    (meta?.hourly_rate_min && meta?.hourly_rate_max
      ? `$${meta.hourly_rate_min}-${meta.hourly_rate_max}/hr`
      : null);

  const rating = meta?.rating;
  const reviewCount = meta?.review_count;
  const images = meta?.images || (profile.image_url ? [profile.image_url] : []);
  const staff = meta?.staff;
  const acceptedPayments = meta?.accepted_payments || [];

  const categoryLabel = formatCategory(profile.category);
  const locationStr = [profile.city, profile.state].filter(Boolean).join(", ");

  const similarProviders = await getSimilarProviders(profile.category, profile.source_provider_id || profile.id, 3);

  // Fetch answered Q&A pairs server-side (for FAQPage JSON-LD + initial render)
  let answeredQuestions: { id: string; question: string; answer: string; asker_name: string; created_at: string }[] = [];
  try {
    const db = getServiceClient();
    const { data: qaRows } = await db
      .from("provider_questions")
      .select("id, question, answer, asker_name, created_at")
      .eq("provider_id", profile.slug)
      .eq("is_public", true)
      .in("status", ["approved", "answered"])
      .not("answer", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (qaRows) {
      answeredQuestions = qaRows.filter((q) => q.answer && q.answer.trim().length > 0);
    }
  } catch {
    // Service client not available or table doesn't exist — degrade gracefully
  }

  const pricingDetails = meta?.pricing_details || [];
  const staffScreening = meta?.staff_screening;
  const reviews = meta?.reviews || [];

  // Olera Score: use community_score if available, otherwise rating
  const oleraScore = meta?.community_score || (rating ? Math.round(rating * 10) / 10 : null);

  // --- Boolean flags for real data availability ---
  const hasRating = rating != null;
  const hasPriceRange = priceRange != null;
  const hasStaff = staff != null;
  const hasReviews = reviews.length > 0;
  const hasOleraScore = oleraScore != null;
  const hasStaffScreening = staffScreening != null &&
    (staffScreening.background_checked || staffScreening.licensed || staffScreening.insured);
  const hasAcceptedPayments = acceptedPayments.length > 0;

  // Build care services: real data first, then pad with category-inferred services
  const careServices: string[] = [...(profile.care_types ?? [])];
  if (profile.category) {
    const inferred = getCategoryServices(profile.category);
    const existing = new Set(careServices.map((s) => s.toLowerCase()));
    for (const s of inferred) {
      if (!existing.has(s.toLowerCase())) careServices.push(s);
    }
  }

  // Build highlights: real data first, then pad with category-inferred highlights
  const highlights: string[] = [];
  if (staffScreening?.background_checked) highlights.push("Background-Checked");
  if (staffScreening?.licensed) highlights.push("Licensed");
  if (staffScreening?.insured) highlights.push("Insured");
  if (profile.care_types && profile.care_types.length > 0) {
    for (const ct of profile.care_types.slice(0, 4 - highlights.length)) {
      highlights.push(ct);
    }
  }
  if (highlights.length < 4 && profile.category) {
    const inferred = getCategoryHighlights(profile.category);
    const existing = new Set(highlights.map((h) => h.toLowerCase()));
    for (const h of inferred) {
      if (highlights.length >= 4) break;
      if (!existing.has(h.toLowerCase())) highlights.push(h);
    }
  }

  // Score breakdowns — only real values, no hardcoded fallbacks
  const scoreBreakdown = [
    meta?.community_score != null ? { label: "Community", value: meta.community_score } : null,
    meta?.value_score != null ? { label: "Value", value: meta.value_score } : null,
    meta?.info_score != null ? { label: "Transparency", value: meta.info_score } : null,
  ].filter((item): item is { label: string; value: number } => item !== null);
  const hasScoreBreakdown = scoreBreakdown.length > 0;

  // ============================================================
  // Section navigation items — only show tabs for visible sections
  // ============================================================
  const sectionItems: SectionItem[] = [];
  sectionItems.push({ id: "highlights", label: "Highlights" });
  sectionItems.push({ id: "services", label: "Services" });
  sectionItems.push({ id: "about", label: "About" });
  if (pricingDetails.length > 0) sectionItems.push({ id: "pricing", label: "Pricing" });
  if (hasAcceptedPayments) sectionItems.push({ id: "payment", label: "Payment" });
  sectionItems.push({ id: "qa", label: "Q&A" });
  sectionItems.push({ id: "reviews", label: "Reviews" });

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
        ? [{ "@type": "ListItem", position: categoryLabel ? 3 : 2, name: `${profile.city}, ${profile.state}` }]
        : []),
      { "@type": "ListItem", position: (categoryLabel ? 3 : 2) + (profile.city ? 1 : 0), name: profile.display_name },
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
    ...(oleraScore != null && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: oleraScore,
        bestRating: 5,
        worstRating: 0,
        ...(reviewCount != null && { reviewCount }),
      },
    }),
    ...(priceRange && { priceRange }),
    ...(meta?.price_min != null && meta?.price_max != null && {
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        priceCurrency: "USD",
        minPrice: meta.price_min,
        maxPrice: meta.price_max,
        unitText: meta.price_unit || "MONTH",
      },
    }),
    ...(reviews.length > 0 && {
      review: reviews.slice(0, 5).map((r) => ({
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
        oleraScore={oleraScore}
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
                    claimState={profile.claim_state}
                    providerName={profile.display_name}
                    claimUrl={`/for-providers/claim/${profile.slug}`}
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

              {/* Context line: category · location · rating (if available) */}
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
                {hasRating && (
                  <span className="flex items-center gap-1">
                    <StarIcon className="w-4 h-4 text-primary-500" />
                    <span className="font-semibold text-gray-900">{rating!.toFixed(1)}</span>
                    {reviewCount != null && <span>({reviewCount})</span>}
                  </span>
                )}
              </div>

              {/* Price estimate with tooltip, or contact-for-pricing */}
              {hasPriceRange ? (
                <div className="relative group/price inline-flex items-center gap-1.5 mt-1">
                  <p className="text-lg font-semibold text-gray-900">{priceRange}</p>
                  <span className="text-xs text-gray-400 font-normal self-center">est.</span>
                  <svg className="w-3.5 h-3.5 text-gray-300 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="absolute left-0 top-full mt-1 z-30 hidden group-hover/price:block">
                    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                      Price is an estimate and may vary. Contact the provider for exact rates.
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-1">Contact for pricing</p>
              )}

              {/* Address */}
              {profile.address && (
                <p className="text-sm text-gray-400 mt-0.5">{profile.address}</p>
              )}

              {/* Claim status — tap-friendly tooltip on mobile, badge stays on image for desktop */}
              <MobileClaimLink
                claimState={profile.claim_state}
                providerName={profile.display_name}
                claimUrl={`/for-providers/claim/${profile.slug}`}
              />

              {/* Highlight badges — real data + category-inferred */}
              <div id="highlights" className="grid grid-cols-2 gap-2.5 mt-4 scroll-mt-20">
                {highlights.map((label) => (
                  <div key={label} className="bg-white border border-gray-200 rounded-lg py-3 px-3 flex items-center gap-2.5">
                    <HighlightIcon label={label} className="w-5 h-5 text-primary-500 flex-shrink-0" />
                    <span className="text-sm text-gray-600">{label}</span>
                  </div>
                ))}
              </div>

              {/* Managed by — only show when staff data exists */}
              {hasStaff && (
                <div className="flex items-center gap-2.5 mt-4">
                  {staff!.image ? (
                    <Image src={staff!.image} alt={staff!.name} width={28} height={28} className="rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="text-[10px] font-semibold text-gray-500">{getInitials(staff!.name)}</span>
                    </div>
                  )}
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
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* -- Two-Column Grid (content + sticky sidebar) -- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ========== Left Column ========== */}
          <div className="lg:col-span-2">

            {/* ══════════════════════════════════════════
                Content Sections (1.0 order)
               ══════════════════════════════════════════ */}
            <div>

              {/* ── Care Services ── */}
              <div id="services" className="py-8 scroll-mt-20">
                <h2 className="text-2xl font-bold text-gray-900 font-display mb-5">Care Services</h2>
                <CareServicesList services={careServices} initialCount={9} />
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

              {/* ── Customer Questions & Answers ── */}
              <div id="qa" className="py-8 scroll-mt-20 border-t border-gray-200">
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
                />
              </div>

              {/* ── Olera Score — hidden when no scores exist ── */}
              {hasOleraScore && (
                <div id="reviews" className="py-12 scroll-mt-20 border-t border-gray-200">
                  {/* Centered score display */}
                  <div className="flex flex-col items-center text-center mb-10">
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary-700 mb-5">Olera Score</p>
                    <div className="w-24 h-24 rounded-full border-4 border-gray-200 flex items-center justify-center mb-4">
                      <span className="text-4xl font-bold text-gray-900">{oleraScore!.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon
                          key={star}
                          className={`w-5 h-5 ${star <= Math.round(oleraScore!) ? "text-yellow-400" : "text-gray-200"}`}
                          filled={star <= Math.round(oleraScore!)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Breakdown cards — only items with real values */}
                  {hasScoreBreakdown && (
                    <div className={`grid grid-cols-2 ${scoreBreakdown.length === 3 ? "md:grid-cols-3" : scoreBreakdown.length >= 4 ? "md:grid-cols-4" : ""} gap-4`}>
                      {scoreBreakdown.map((item) => (
                        <div key={item.label} className="text-center">
                          <p className="text-2xl font-bold text-gray-900 mb-2">{item.value.toFixed(1)}</p>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                            <div
                              className="h-full bg-primary-600 rounded-full"
                              style={{ width: `${(item.value / 5) * 100}%` }}
                            />
                          </div>
                          <p className="text-xs font-semibold tracking-[0.1em] uppercase text-gray-500">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── What families are saying ── */}
              <ReviewsSection
                providerId={profile.slug}
                providerSlug={profile.slug}
                providerName={profile.display_name}
                mockReviews={reviews}
              />

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
                    <div className="border border-gray-200 rounded-xl p-5 text-center flex-shrink-0 w-40">
                      {staff!.image ? (
                        <Image src={staff!.image} alt={staff!.name} width={80} height={80} className="rounded-full object-cover mx-auto mb-3" />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                          <span className="text-2xl font-bold text-gray-500">{getInitials(staff!.name)}</span>
                        </div>
                      )}
                      <p className="text-sm font-semibold text-gray-900">{staff!.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{staff!.position}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 mb-2">Care motivation</h3>
                      <ExpandableText text={staff!.bio} maxLength={200} />
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
                  <p className="text-base font-semibold text-gray-900">Are you the owner of this business?</p>
                  <ManagePageButton
                    providerName={profile.display_name}
                    providerSlug={profile.slug}
                    providerId={profile.id}
                    sourceProviderId={profile.source_provider_id}
                    claimState={actualClaimState}
                    claimAccountId={claimAccountId}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* ========== Right Column — Sticky Sidebar ========== */}
          <div className="lg:col-span-1 self-stretch">
            <div id="connection-card" className="sticky top-24">
              <ConnectionCardWithRedirect
                providerId={profile.id}
                providerName={profile.display_name}
                providerSlug={profile.slug}
                priceRange={priceRange}
                oleraScore={oleraScore}
                reviewCount={meta?.review_count}
                phone={profile.phone}
                acceptedPayments={acceptedPayments}
                careTypes={profile.care_types}
                responseTime={null}
                providerCategory={profile.category}
                providerCity={profile.city}
                providerState={profile.state}
              />
            </div>
          </div>
        </div>

        {/* ===== Compare Providers ===== */}
        {similarProviders.length > 0 && (
          <div className="border-t border-gray-200 pt-8 mt-4">
            <h2 className="text-2xl font-bold text-gray-900 font-display mb-6">
              Compare {profile.display_name}{locationStr ? ` of ${locationStr}` : ""} to the best local options
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {similarProviders.map((provider) => (
                <CompactProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </div>
        )}

        </div>
      </div>

      {/* Mobile sticky bottom CTA */}
      <MobileStickyBottomCTA
        providerName={profile.display_name}
        priceRange={priceRange}
      />
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile, OrganizationMetadata, CaregiverMetadata } from "@/lib/types";
import { getProviderBySlug, mockProviderToProfile } from "@/lib/mock-providers";
import Badge from "@/components/ui/Badge";
import InquiryButton from "@/components/providers/InquiryButton";
import ImageCarousel from "@/components/providers/ImageCarousel";
import ExpandableText from "@/components/providers/ExpandableText";
import CompactProviderCard from "@/components/providers/CompactProviderCard";
import {
  getInitials,
  formatCategory,
  buildQuickFacts,
  getSimilarProviders,
  type QuickFact,
} from "@/lib/provider-utils";

// Extended metadata type that includes mock-specific fields
interface ExtendedMetadata extends OrganizationMetadata, CaregiverMetadata {
  rating?: number;
  review_count?: number;
  images?: string[];
  staff?: { name: string; position: string; bio: string; image: string };
  badge?: string;
  accepted_payments?: string[];
}

// --- Inline SVG icon components ---

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

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

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Quick fact icon mapping
const factIcons: Record<QuickFact["icon"], (props: { className?: string }) => React.JSX.Element> = {
  category: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  location: MapPinIcon,
  calendar: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  users: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  award: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
  shield: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  dollar: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// ============================================================
// Page Component
// ============================================================

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // --- Data fetching (unchanged) ---
  let profile: Profile | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("slug", slug)
      .in("type", ["organization", "caregiver"])
      .single<Profile>();
    profile = data;
  } catch {
    // Supabase not configured — fall through to mock lookup
  }

  if (!profile) {
    const mockProvider = getProviderBySlug(slug);
    if (mockProvider) {
      profile = mockProviderToProfile(mockProvider);
    }
  }

  if (!profile) {
    return (
      <div className="bg-[#FFFEF8] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Provider not found</h1>
          <p className="mt-2 text-gray-600">
            The provider you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link href="/" className="mt-4 inline-block text-primary-600 hover:text-primary-700 font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  // --- Data extraction ---
  const meta = profile.metadata as ExtendedMetadata;
  const amenities = meta?.amenities || [];
  const priceRange =
    meta?.price_range ||
    (meta?.hourly_rate_min && meta?.hourly_rate_max
      ? `$${meta.hourly_rate_min}-${meta.hourly_rate_max}/hr`
      : null);

  const rating = meta?.rating;
  const reviewCount = meta?.review_count;
  const images = meta?.images || (profile.image_url ? [profile.image_url] : []);
  const staff = meta?.staff;
  const badge = meta?.badge;
  const acceptedPayments = meta?.accepted_payments || [];

  const categoryLabel = formatCategory(profile.category);
  const locationStr = [profile.city, profile.state].filter(Boolean).join(", ");

  const quickFacts = buildQuickFacts({
    category: profile.category,
    city: profile.city,
    state: profile.state,
    yearFounded: meta?.year_founded,
    bedCount: meta?.bed_count,
    yearsExperience: meta?.years_experience,
    acceptsMedicaid: meta?.accepts_medicaid,
    acceptsMedicare: meta?.accepts_medicare,
    priceRange,
  });

  const similarProviders = getSimilarProviders(profile.category, profile.slug, 3);

  const details: { label: string; value: string; icon: string }[] = [];
  if (meta?.year_founded) details.push({ label: "Year Founded", value: String(meta.year_founded), icon: "calendar" });
  if (meta?.bed_count) details.push({ label: "Capacity", value: `${meta.bed_count} beds`, icon: "users" });
  if (meta?.years_experience) details.push({ label: "Experience", value: `${meta.years_experience} years`, icon: "award" });
  if (meta?.accepts_medicaid !== undefined) details.push({ label: "Medicaid", value: meta.accepts_medicaid ? "Accepted" : "Not accepted", icon: "shield" });
  if (meta?.accepts_medicare !== undefined) details.push({ label: "Medicare", value: meta.accepts_medicare ? "Accepted" : "Not accepted", icon: "shield" });

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="bg-[#FFFEF8] min-h-screen">

      {/* ===== Breadcrumbs + Share ===== */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        <div className="flex items-center justify-between">
          <ol className="flex items-center gap-1.5 text-base text-gray-500">
            <li>
              <Link href="/" className="hover:text-primary-600 transition-colors">Home</Link>
            </li>
            <li><ChevronRightIcon className="w-3.5 h-3.5 text-gray-300" /></li>
            <li>
              <Link href="/browse" className="hover:text-primary-600 transition-colors">Browse</Link>
            </li>
            {categoryLabel && (
              <>
                <li><ChevronRightIcon className="w-3.5 h-3.5 text-gray-300" /></li>
                <li>
                  <Link
                    href={`/browse?type=${profile.category}`}
                    className="hover:text-primary-600 transition-colors"
                  >
                    {categoryLabel}
                  </Link>
                </li>
              </>
            )}
            <li><ChevronRightIcon className="w-3.5 h-3.5 text-gray-300" /></li>
            <li className="text-gray-900 font-medium truncate max-w-[200px]">
              {profile.display_name}
            </li>
          </ol>
          <div className="flex items-center gap-4 flex-shrink-0">
            <button className="flex items-center gap-1.5 text-base text-gray-500 hover:text-gray-900 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Share
            </button>
            <button className="flex items-center gap-1.5 text-base text-gray-500 hover:text-gray-900 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              Save
            </button>
          </div>
        </div>
      </nav>

      {/* ===== Main Two-Column Layout ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* Left Column — Image + Content */}
          <div className="lg:col-span-2">

            {/* ── Top Stack: Image + Identity + Highlights ── */}
            <div>
              {/* Image Carousel */}
              {images.length > 0 && (
                <ImageCarousel images={images} alt={profile.display_name} className="h-[420px]" />
              )}

              {/* Category + Provider Name + Location */}
              <div className={images.length > 0 ? "mt-6" : ""}>
                {categoryLabel && (
                  <p className="text-primary-600 text-sm font-semibold uppercase tracking-wider mb-1">
                    {categoryLabel}
                  </p>
                )}
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight flex items-center gap-2">
                  {profile.display_name}
                  <svg className="w-6 h-6 text-primary-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                  </svg>
                </h1>
                {profile.address && (
                  <p className="text-[15px] text-gray-500 mt-1">
                    {profile.address}
                  </p>
                )}
              </div>

              {/* Highlights Bar */}
              {amenities.length > 0 && (
                <div className="grid grid-cols-3 rounded-lg overflow-hidden mt-4 bg-white border border-gray-200 shadow-sm">
                  {amenities.slice(0, 3).map((item, index) => (
                    <div
                      key={item}
                      className={`flex flex-col items-center text-center px-4 py-4 ${
                        index > 0 ? "border-l border-gray-200" : ""
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center mb-2.5">
                        <CheckIcon className="w-4 h-4 text-primary-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{item}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Content Sections ── */}
            <div className="mt-[44px] space-y-[44px]">

            {/* Unclaimed Banner */}
            {profile.claim_state === "unclaimed" && (
              <div className="bg-warm-50 border border-warm-200 rounded-xl p-4 md:p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-warm-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-warm-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-warm-800 text-[15px]">
                        This profile hasn&apos;t been claimed yet
                      </p>
                      <p className="text-sm text-warm-600">
                        Information may be outdated. Is this your organization?
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/for-providers/claim/${profile.slug}`}
                    className="shrink-0 bg-primary-600 hover:bg-primary-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm"
                  >
                    Claim This Profile
                  </Link>
                </div>
              </div>
            )}

            {/* Services Offered */}
            {profile.care_types && profile.care_types.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2.5">Services Offered</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.care_types.map((type) => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 text-sm font-medium border border-primary-100"
                    >
                      <CheckIcon className="w-3.5 h-3.5" />
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* About */}
            {profile.description && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2.5">
                  About {profile.display_name}
                </h2>
                <ExpandableText text={profile.description} maxLength={250} />
              </div>
            )}

            {/* Meet Our Team */}
            {staff && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2.5">Meet Our Team</h2>
                <div className="flex items-start gap-4">
                  {staff.image ? (
                    <img
                      src={staff.image}
                      alt={staff.name}
                      className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-primary-600">
                        {getInitials(staff.name)}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900">{staff.name}</h3>
                    <p className="text-primary-600 text-sm font-medium">{staff.position}</p>
                    <p className="text-gray-500 text-sm mt-2 leading-relaxed">{staff.bio}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Amenities & Highlights */}
            {amenities.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2.5">Amenities &amp; Highlights</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {amenities.map((amenity) => (
                    <div key={amenity} className="flex items-center gap-3 py-2">
                      <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <CheckIcon className="w-4 h-4 text-primary-600" />
                      </div>
                      <span className="text-sm text-gray-700 font-medium">{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Details */}
            {details.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2.5">Details</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {details.map((detail) => {
                    const IconComp = factIcons[detail.icon as QuickFact["icon"]] || factIcons.category;
                    return (
                      <div key={detail.label} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <IconComp className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 font-medium">{detail.label}</dt>
                          <dd className="text-sm text-gray-900 font-semibold">{detail.value}</dd>
                        </div>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}
            </div>
          </div>

          {/* Right Column — Sticky Sidebar */}
          <div className="lg:col-span-1 self-stretch">
            <div className="sticky top-24 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[646px]">
              {/* Accent bar */}
              <div className="h-1 bg-gradient-to-r from-primary-500 to-primary-600" />

              <div className="p-5 space-y-4">
                {/* Price */}
                {priceRange && (
                  <div className="text-center pb-4 border-b border-gray-100">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Starting from</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{priceRange}</p>
                  </div>
                )}

                {/* Rating */}
                {rating && (
                  <div className="flex items-center justify-center gap-2 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <StarIcon
                          key={i}
                          className={`w-5 h-5 ${i <= Math.round(rating) ? "text-yellow-400" : "text-gray-200"}`}
                          filled={i <= Math.round(rating)}
                        />
                      ))}
                    </div>
                    <span className="font-semibold text-gray-900">{rating.toFixed(1)}</span>
                    {reviewCount && (
                      <span className="text-sm text-gray-500">({reviewCount})</span>
                    )}
                  </div>
                )}

                {/* CTA Buttons */}
                <div className="space-y-2.5">
                  <InquiryButton
                    providerProfileId={profile.id}
                    providerName={profile.display_name}
                    providerSlug={profile.slug}
                  />
                  {profile.phone && (
                    <a
                      href={`tel:${profile.phone}`}
                      className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[44px] text-sm"
                    >
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {profile.phone}
                    </a>
                  )}
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[44px] text-sm"
                    >
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Visit Website
                    </a>
                  )}
                </div>

                {/* Accepted Payments */}
                {acceptedPayments.length > 0 && (
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500 font-medium mb-2">Accepted payments</p>
                    <div className="flex flex-wrap gap-1.5">
                      {acceptedPayments.map((payment) => (
                        <span
                          key={payment}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-100"
                        >
                          {payment}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hours */}
                {meta?.hours && (
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-gray-600">{meta.hours}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Similar Providers ===== */}
      {similarProviders.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="border-t border-gray-200 pt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Similar providers nearby
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {similarProviders.map((provider) => (
                <CompactProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

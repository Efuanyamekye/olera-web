"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { avatarGradient } from "@/components/portal/ConnectionDetailContent";
import type {
  Connection,
  Profile,
  ProfileCategory,
  OrganizationMetadata,
  CaregiverMetadata,
} from "@/lib/types";

interface MatchDetailData extends Connection {
  providerProfile: Profile | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  home_care_agency: "Home Care Agency",
  home_health_agency: "Home Health Agency",
  hospice_agency: "Hospice Agency",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  inpatient_hospice: "Inpatient Hospice",
  rehab_facility: "Rehab Facility",
  adult_day_care: "Adult Day Care",
  wellness_center: "Wellness Center",
  private_caregiver: "Private Caregiver",
};

function getCategoryLabel(
  category: ProfileCategory | null | undefined,
  type: string | undefined
): string {
  if (category && CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  if (type === "caregiver") return "Private Caregiver";
  if (type === "organization") return "Care Provider";
  return "Care Provider";
}

function getPricingLabel(
  profile: Profile | null
): string | null {
  if (!profile) return null;
  const meta = profile.metadata as
    | (OrganizationMetadata & CaregiverMetadata & Record<string, unknown>)
    | null;
  if (!meta) return null;
  if (meta.hourly_rate_min && meta.hourly_rate_max) {
    return `$${meta.hourly_rate_min}–$${meta.hourly_rate_max}/hr`;
  }
  if (meta.hourly_rate_min) return `From $${meta.hourly_rate_min}/hr`;
  if (meta.price_range) return meta.price_range;
  const lower = meta.lower_price as number | undefined;
  const upper = meta.upper_price as number | undefined;
  if (lower && upper) return `$${lower}–$${upper}/hr`;
  if (lower) return `From $${lower}/hr`;
  return null;
}

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const connectionId = params.connectionId as string;

  const [data, setData] = useState<MatchDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Fetch connection and provider data
  useEffect(() => {
    async function fetchData() {
      if (!connectionId || !isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();

        // Fetch connection
        const { data: conn, error: connError } = await supabase
          .from("connections")
          .select(
            "id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at"
          )
          .eq("id", connectionId)
          .single();

        if (connError) throw connError;
        if (!conn) {
          setLoading(false);
          return;
        }

        // Fetch provider profile
        const { data: profile } = await supabase
          .from("business_profiles")
          .select(
            "id, display_name, description, image_url, city, state, lat, lng, type, email, phone, website, slug, care_types, category, source_provider_id, metadata"
          )
          .eq("id", conn.from_profile_id)
          .single();

        // Enrich with iOS data if available
        let enrichedProfile = profile as Profile | null;
        if (enrichedProfile) {
          const iosKey =
            enrichedProfile.source_provider_id || enrichedProfile.slug;
          if (iosKey) {
            const { data: iosProvider } = await supabase
              .from("olera-providers")
              .select(
                "provider_id, provider_logo, provider_images, google_rating, provider_description, review_count, lower_price, upper_price"
              )
              .eq("provider_id", iosKey)
              .single();

            if (iosProvider) {
              const iosImage =
                iosProvider.provider_logo ||
                iosProvider.provider_images?.split(" | ")[0] ||
                null;
              enrichedProfile = {
                ...enrichedProfile,
                image_url: enrichedProfile.image_url || iosImage,
                description:
                  enrichedProfile.description ||
                  iosProvider.provider_description ||
                  null,
                metadata: {
                  ...((enrichedProfile.metadata || {}) as Record<
                    string,
                    unknown
                  >),
                  ...(iosProvider.google_rating
                    ? { google_rating: iosProvider.google_rating }
                    : {}),
                  ...(iosProvider.review_count
                    ? { review_count: iosProvider.review_count }
                    : {}),
                  ...(iosProvider.lower_price
                    ? { lower_price: iosProvider.lower_price }
                    : {}),
                  ...(iosProvider.upper_price
                    ? { upper_price: iosProvider.upper_price }
                    : {}),
                } as Profile["metadata"],
              };
            }
          }
        }

        // Mark as viewed
        const meta = (conn.metadata || {}) as Record<string, unknown>;
        if (!meta.viewed) {
          await fetch("/api/connections/respond-interest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId, action: "view" }),
          });
        }

        setData({
          ...(conn as Connection),
          providerProfile: enrichedProfile,
        });
      } catch (err) {
        console.error("[MatchDetail] fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [connectionId]);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    try {
      const res = await fetch("/api/connections/respond-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, action: "accept" }),
      });
      if (res.ok) {
        setAccepted(true);
      }
    } catch (err) {
      console.error("[MatchDetail] accept error:", err);
    } finally {
      setAccepting(false);
    }
  }, [connectionId]);

  const handleDecline = useCallback(async () => {
    setDeclining(true);
    try {
      const res = await fetch("/api/connections/respond-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, action: "decline" }),
      });
      if (res.ok) {
        router.push("/portal/matches");
      }
    } catch (err) {
      console.error("[MatchDetail] decline error:", err);
    } finally {
      setDeclining(false);
    }
  }, [connectionId, router]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
        {/* Sticky header skeleton */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-warm-100/60 px-4 py-3">
          <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="bg-white px-5 pt-6 pb-5">
          <div className="flex items-start gap-4 animate-pulse">
            <div className="w-[72px] h-[72px] rounded-2xl bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-20 bg-gray-100 rounded" />
              <div className="h-5 w-40 bg-gray-200 rounded" />
              <div className="h-4 w-28 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 animate-pulse">
            <div className="h-4 w-16 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="h-2 bg-warm-50/50" />
        <div className="bg-white px-5 py-5 animate-pulse">
          <div className="h-3 w-28 bg-gray-100 rounded mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-3/4 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="h-2 bg-warm-50/50" />
        <div className="bg-white px-5 py-5 animate-pulse">
          <div className="h-3 w-32 bg-gray-100 rounded mb-4" />
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-100 shrink-0" />
              <div className="h-4 w-48 bg-gray-100 rounded" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-100 shrink-0" />
              <div className="h-4 w-40 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (!data) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <p className="text-gray-500 mb-4">Match not found</p>
        <Link
          href="/portal/matches"
          className="text-primary-600 font-medium hover:text-primary-700"
        >
          Back to Matches
        </Link>
      </div>
    );
  }

  const profile = data.providerProfile;
  const name = profile?.display_name || "Unknown Provider";
  const location = [profile?.city, profile?.state].filter(Boolean).join(", ");
  const imageUrl = profile?.image_url;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const categoryLabel = getCategoryLabel(
    profile?.category as ProfileCategory | null,
    profile?.type
  );
  const reachOutNote =
    data.message ||
    ((data.metadata as Record<string, unknown>)?.reach_out_note as
      | string
      | undefined);
  const matchReasons =
    ((data.metadata as Record<string, unknown>)?.match_reasons as string[]) ||
    [];
  const careTypes = profile?.care_types || [];
  const profileSlug = profile?.slug;
  const pricingLabel = getPricingLabel(profile);

  // Provider metadata
  const providerMeta = profile?.metadata as
    | (OrganizationMetadata & CaregiverMetadata & Record<string, unknown>)
    | null;
  const googleRating = (providerMeta?.google_rating as number) || 0;
  const reviewCount = (providerMeta?.review_count as number) || 0;

  // Accepted payments
  const acceptedPayments =
    (providerMeta?.accepted_payments as string[]) || [];
  const paymentMethods: string[] = [...acceptedPayments];
  if (
    providerMeta?.accepts_medicaid &&
    !paymentMethods.includes("Medicaid")
  )
    paymentMethods.push("Medicaid");
  if (
    providerMeta?.accepts_medicare &&
    !paymentMethods.includes("Medicare")
  )
    paymentMethods.push("Medicare");
  if (
    providerMeta?.accepts_private_insurance &&
    !paymentMethods.includes("Private Health Insurance")
  )
    paymentMethods.push("Private Health Insurance");

  // "Why they're a good fit" reasons
  const fitReasons: string[] = [];
  const matchCount = matchReasons.length;
  if (matchCount > 0) {
    fitReasons.push(
      `Offers ${matchCount} service${matchCount !== 1 ? "s" : ""} you're looking for`
    );
  }
  if (providerMeta?.years_experience) {
    fitReasons.push(
      `${providerMeta.years_experience}+ years${profile?.city ? ` serving the ${profile.city} area` : " of experience"}`
    );
  }
  if (providerMeta?.year_founded) {
    const years = new Date().getFullYear() - providerMeta.year_founded;
    if (years > 0 && fitReasons.length < 3) {
      fitReasons.push(
        `${years}+ years${profile?.city ? ` serving the ${profile.city} area` : " in operation"}`
      );
    }
  }

  // Accepted / Connected state
  if (accepted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-warm-100/60 px-4 py-3">
          <button
            onClick={() => router.push("/portal/matches")}
            className="flex items-center gap-1.5 text-[15px] font-medium text-gray-600 hover:text-gray-900 transition-colors min-h-[44px]"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
            Matches
          </button>
        </div>

        {/* Success content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-primary-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-display font-bold text-gray-900 mb-2 text-center">
            You&apos;re connected!
          </h2>
          <p className="text-[14px] text-gray-500 leading-relaxed text-center max-w-[320px] mb-6">
            Your details have been shared with this provider. They&apos;ll see
            your care profile and can reply directly.
          </p>

          {/* Provider mini card */}
          <div className="inline-flex items-center gap-2.5 bg-white border border-gray-200/80 rounded-xl px-4 py-2.5 shadow-sm mb-6">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={name}
                width={36}
                height={36}
                sizes="36px"
                className="w-9 h-9 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[12px] font-bold text-white"
                style={{ background: avatarGradient(name) }}
              >
                {initials}
              </div>
            )}
            <span className="text-[14px] font-semibold text-gray-900">
              {name}
            </span>
          </div>

          <Link
            href="/portal/inbox"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-6 py-2.5 rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 text-white text-[14px] font-semibold shadow-[0_1px_3px_rgba(25,144,135,0.3),0_1px_2px_rgba(25,144,135,0.2)] hover:from-primary-600 hover:to-primary-700 hover:shadow-[0_3px_8px_rgba(25,144,135,0.35),0_1px_3px_rgba(25,144,135,0.25)] active:scale-[0.97] transition-all duration-200"
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
              />
            </svg>
            Go to inbox
          </Link>

          <button
            type="button"
            onClick={() => router.push("/portal/matches")}
            className="mt-3 min-h-[44px] px-3 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            or keep reviewing providers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-warm-100/60 px-4 py-3">
        <button
          onClick={() => router.push("/portal/matches")}
          className="flex items-center gap-1.5 text-[15px] font-medium text-gray-600 hover:text-gray-900 transition-colors min-h-[44px]"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Matches
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Provider header */}
        <div className="bg-white px-5 pt-6 pb-5">
          <div className="flex items-start gap-4">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={name}
                width={72}
                height={72}
                sizes="72px"
                className="w-[72px] h-[72px] rounded-2xl object-cover shrink-0 shadow-sm"
              />
            ) : (
              <div
                className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center shrink-0 text-lg font-bold text-white shadow-sm"
                style={{ background: avatarGradient(name) }}
              >
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider leading-none mb-1">
                {categoryLabel}
              </p>
              <h1 className="text-xl font-display font-bold text-gray-900 leading-tight">
                {name}
              </h1>
              {location && (
                <p className="flex items-center gap-1 text-[13px] text-gray-500 mt-0.5">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                    />
                  </svg>
                  {location}
                </p>
              )}
            </div>
          </div>

          {/* Rating + Pricing row */}
          {(googleRating > 0 || pricingLabel) && (
            <div className="flex items-center gap-4 mt-4">
              {googleRating > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-4 h-4 text-amber-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-[14px] font-semibold text-gray-900">
                    {googleRating.toFixed(1)}
                  </span>
                  {reviewCount > 0 && (
                    <span className="text-[13px] text-gray-400">
                      ({reviewCount})
                    </span>
                  )}
                </div>
              )}
              {pricingLabel && (
                <span className="text-[14px] text-gray-500">{pricingLabel}</span>
              )}
            </div>
          )}

          {/* View full profile link */}
          {profileSlug && (
            <Link
              href={`/provider/${profileSlug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 mt-3 text-[14px] font-semibold text-primary-600 hover:text-primary-700 transition-colors min-h-[44px]"
            >
              View full profile
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </Link>
          )}
        </div>

        {/* Divider */}
        <div className="h-2 bg-warm-50/50" />

        {/* Their message */}
        {reachOutNote && (
          <>
            <div className="bg-white px-5 py-5">
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                Their message to you
              </h2>
              <p className="text-[15px] text-gray-700 leading-relaxed">
                {reachOutNote}
              </p>
            </div>
            <div className="h-2 bg-warm-50/50" />
          </>
        )}

        {/* Description fallback if no note */}
        {!reachOutNote && profile?.description && (
          <>
            <div className="bg-white px-5 py-5">
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                About this provider
              </h2>
              <p className="text-[15px] text-gray-600 leading-relaxed">
                {profile.description}
              </p>
            </div>
            <div className="h-2 bg-warm-50/50" />
          </>
        )}

        {/* Why they're a good fit */}
        {fitReasons.length > 0 && (
          <>
            <div className="bg-white px-5 py-5">
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Why they&apos;re a good fit
              </h2>
              <div className="space-y-3">
                {fitReasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-primary-500 shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                    <p className="text-[15px] text-gray-700 leading-relaxed">
                      {reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-2 bg-warm-50/50" />
          </>
        )}

        {/* Services */}
        {careTypes.length > 0 && (
          <>
            <div className="bg-white px-5 py-5">
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Services
              </h2>
              <div className="flex flex-wrap gap-2">
                {careTypes.map((ct) => {
                  const isMatched = matchReasons.some(
                    (r) => r.toLowerCase() === ct.toLowerCase()
                  );
                  return (
                    <span
                      key={ct}
                      className={[
                        "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full border",
                        isMatched
                          ? "border-[#F5F4F1] text-gray-700 bg-[#F5F4F1]"
                          : "border-warm-100 text-gray-500 bg-white",
                      ].join(" ")}
                    >
                      {isMatched && (
                        <svg
                          className="w-3.5 h-3.5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                      )}
                      {ct}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="h-2 bg-warm-50/50" />
          </>
        )}

        {/* Payment */}
        {paymentMethods.length > 0 && (
          <div className="bg-white px-5 py-5">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Payment
            </h2>
            <div className="flex flex-wrap gap-2">
              {paymentMethods.slice(0, 1).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full border border-primary-100 text-primary-700 bg-primary-50/40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                  </svg>
                  {p}
                </span>
              ))}
              {paymentMethods.slice(1).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center text-[13px] font-medium px-3 py-1.5 rounded-full border border-warm-100 text-gray-500 bg-white"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-warm-100/60 px-4 py-3.5 flex items-center gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={handleDecline}
          disabled={declining || accepting}
          className="flex-1 inline-flex items-center justify-center min-h-[48px] px-5 py-3 rounded-xl text-[15px] font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
        >
          {declining ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          ) : (
            "Decline"
          )}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting || declining}
          className="flex-[1.5] inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 text-white text-[15px] font-semibold shadow-[0_1px_3px_rgba(25,144,135,0.3),0_1px_2px_rgba(25,144,135,0.2)] hover:from-primary-600 hover:to-primary-700 hover:shadow-[0_3px_8px_rgba(25,144,135,0.35),0_1px_3px_rgba(25,144,135,0.25)] active:scale-[0.97] disabled:opacity-70 transition-all duration-200"
        >
          {accepting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                />
              </svg>
              Start conversation
            </>
          )}
        </button>
      </div>
    </div>
  );
}

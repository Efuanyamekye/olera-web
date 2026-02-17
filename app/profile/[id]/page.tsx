import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile, FamilyMetadata, CaregiverMetadata, OrganizationMetadata } from "@/lib/types";

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  within_1_month: "Within 1 month",
  within_3_months: "Within 3 months",
  exploring: "Just exploring",
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let profile: Profile | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("id", id)
      .single<Profile>();
    profile = data;
  } catch {
    // fall through to not-found
  }

  if (!profile) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Profile not found</h1>
        <p className="mt-2 text-gray-600">
          The profile you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-primary-600 hover:underline"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // For org/caregiver profiles, redirect to the richer /provider/[slug] page
  if (
    (profile.type === "organization" || profile.type === "caregiver") &&
    profile.slug
  ) {
    redirect(`/provider/${profile.slug}`);
  }

  // Family profile view
  if (profile.type === "family") {
    return <FamilyProfileView profile={profile} />;
  }

  // Fallback for any profile type without a slug
  return <GenericProfileView profile={profile} />;
}

function FamilyProfileView({ profile }: { profile: Profile }) {
  const meta = profile.metadata as FamilyMetadata;
  const locationStr = [profile.city, profile.state].filter(Boolean).join(", ");
  const careNeeds = meta?.care_needs || profile.care_types || [];
  const timeline = meta?.timeline
    ? TIMELINE_LABELS[meta.timeline] || meta.timeline
    : null;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-warm-100 text-warm-700 rounded-full flex items-center justify-center text-2xl font-bold shrink-0">
              {profile.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {profile.display_name}
              </h1>
              <p className="text-base text-gray-500">
                Family
                {locationStr && ` \u00B7 ${locationStr}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* About */}
        {profile.description && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">About</h2>
            <p className="text-gray-600 leading-relaxed">
              {profile.description}
            </p>
          </div>
        )}

        {/* Care details */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Care Details
          </h2>
          <dl className="space-y-4">
            {timeline && (
              <div>
                <dt className="text-sm text-gray-500">Timeline</dt>
                <dd className="text-gray-900 font-medium">{timeline}</dd>
              </div>
            )}
            {meta?.relationship_to_recipient && (
              <div>
                <dt className="text-sm text-gray-500">Relationship</dt>
                <dd className="text-gray-900 font-medium">
                  {meta.relationship_to_recipient}
                </dd>
              </div>
            )}
            {meta?.budget_min != null && meta?.budget_max != null && (
              <div>
                <dt className="text-sm text-gray-500">Budget Range</dt>
                <dd className="text-gray-900 font-medium">
                  ${meta.budget_min.toLocaleString()} &ndash; $
                  {meta.budget_max.toLocaleString()}/month
                </dd>
              </div>
            )}
          </dl>

          {careNeeds.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">Care Needs</p>
              <div className="flex flex-wrap gap-2">
                {careNeeds.map((need) => (
                  <span
                    key={need}
                    className="bg-secondary-50 text-secondary-700 text-sm px-3 py-1 rounded-full"
                  >
                    {need}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Back link */}
        <Link
          href="/browse/families"
          className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to families
        </Link>
      </div>
    </div>
  );
}

function GenericProfileView({ profile }: { profile: Profile }) {
  const locationStr = [profile.city, profile.state].filter(Boolean).join(", ");
  const meta = profile.metadata as OrganizationMetadata &
    CaregiverMetadata &
    FamilyMetadata;

  const typeLabel =
    profile.type === "organization"
      ? "Organization"
      : profile.type === "caregiver"
      ? "Caregiver"
      : "Family";

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-2xl font-bold shrink-0">
              {profile.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {profile.display_name}
              </h1>
              <p className="text-base text-gray-500">
                {typeLabel}
                {locationStr && ` \u00B7 ${locationStr}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {profile.description && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">About</h2>
            <p className="text-gray-600 leading-relaxed">
              {profile.description}
            </p>
          </div>
        )}

        {profile.care_types.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Care Types
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.care_types.map((type) => (
                <span
                  key={type}
                  className="bg-primary-50 text-primary-700 text-sm px-3 py-1 rounded-full"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        )}

        <Link
          href="/browse"
          className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to browse
        </Link>
      </div>
    </div>
  );
}

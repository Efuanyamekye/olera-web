import Image from "next/image";
import type { Profile, ProfileCategory } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import DashboardSectionCard from "./DashboardSectionCard";
import VerificationStatusBadge from "./VerificationStatusBadge";

// Inline pure helpers to avoid importing provider-utils (which has server deps)
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const categoryLabels: Record<ProfileCategory, string> = {
  home_care_agency: "Home Care",
  home_health_agency: "Home Health",
  hospice_agency: "Hospice",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  inpatient_hospice: "Inpatient Hospice",
  rehab_facility: "Rehabilitation",
  adult_day_care: "Adult Day Care",
  wellness_center: "Wellness Center",
  private_caregiver: "Private Caregiver",
};

function formatCategory(category: ProfileCategory | null): string | null {
  if (!category) return null;
  return categoryLabels[category] || null;
}

type VerificationState = "not_required" | "unverified" | "pending" | "verified" | "rejected";

interface ProfileOverviewCardProps {
  profile: Profile;
  completionPercent: number;
  onEdit?: () => void;
  /** Callback when user clicks to open verification form */
  onVerifyClick?: () => void;
}

export default function ProfileOverviewCard({
  profile,
  completionPercent,
  onEdit,
  onVerifyClick,
}: ProfileOverviewCardProps) {
  const location = [profile.address, profile.city, profile.state]
    .filter(Boolean)
    .join(", ");
  const initials = getInitials(profile.display_name);

  // Badge logic:
  // - "Verified" = verification_state === 'verified' OR badge_approved === true
  // - "Claimed" = verification_state === 'not_required' (high trust, no verification needed)
  // - "Pending verification" = verification_state is unverified/pending/rejected
  const meta = profile.metadata as { badge_approved?: boolean } | null;
  const verificationState = (profile.verification_state as VerificationState) || null;
  const isVerified = meta?.badge_approved === true || verificationState === "verified";
  // Show "Claimed" badge only for high-trust providers who don't need verification
  const showClaimedBadge = profile.claim_state === "claimed" && verificationState === "not_required" && !isVerified;
  // Show verification status badge for other states (unverified, pending, rejected, or verified)
  const showVerificationBadge = verificationState && verificationState !== "not_required";

  return (
    <DashboardSectionCard
      title=""
      completionPercent={completionPercent}
      id="overview"
    >
      <div>
        {/* Provider identity */}
        <div className="mb-5">
          {/* Mobile: stacked layout */}
          <div className="sm:hidden">
            {/* Top row: Avatar + Controls */}
            <div className="flex items-start justify-between gap-4 mb-3">
              {profile.image_url ? (
                <Image
                  src={profile.image_url}
                  alt={profile.display_name}
                  width={72}
                  height={72}
                  sizes="72px"
                  className="w-[72px] h-[72px] rounded-xl object-cover shrink-0 ring-2 ring-primary-100 ring-offset-2"
                />
              ) : (
                <div className="w-[72px] h-[72px] rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shrink-0 shadow-sm shadow-primary-500/10 border border-primary-100/60">
                  <span className="text-lg font-display font-bold text-primary-700">
                    {initials}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onEdit}
                  className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-900 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 min-h-[44px]"
                  aria-label="Edit profile overview"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  completionPercent >= 100
                    ? "bg-success-50 text-success-700"
                    : "bg-primary-50 text-primary-700"
                }`}>
                  {completionPercent}%
                </span>
              </div>
            </div>
            {/* Bottom: Provider info - full width */}
            <div>
              {profile.category && (
                <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase mb-1">
                  {formatCategory(profile.category)}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900 font-display">
                  {profile.display_name}
                </h2>
                {showVerificationBadge && (
                  <VerificationStatusBadge
                    metadata={meta}
                    verificationState={verificationState}
                    onVerifyClick={onVerifyClick}
                  />
                )}
                {showClaimedBadge && <Badge variant="claimed">Claimed</Badge>}
              </div>
              {location && (
                <p className="text-[15px] text-gray-500 mt-1">{location}</p>
              )}
            </div>
          </div>

          {/* Desktop: horizontal layout */}
          <div className="hidden sm:flex items-center gap-4">
            {/* Avatar / Logo */}
            {profile.image_url ? (
              <Image
                src={profile.image_url}
                alt={profile.display_name}
                width={80}
                height={80}
                sizes="80px"
                className="w-20 h-20 rounded-xl object-cover shrink-0 ring-2 ring-primary-100 ring-offset-2"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shrink-0 shadow-sm shadow-primary-500/10 border border-primary-100/60">
                <span className="text-xl font-display font-bold text-primary-700">
                  {initials}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              {profile.category && (
                <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase mb-1">
                  {formatCategory(profile.category)}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900 font-display truncate">
                  {profile.display_name}
                </h2>
                {showVerificationBadge && (
                  <VerificationStatusBadge
                    metadata={meta}
                    verificationState={verificationState}
                    onVerifyClick={onVerifyClick}
                  />
                )}
                {showClaimedBadge && <Badge variant="claimed">Claimed</Badge>}
              </div>
              {location && (
                <p className="text-[15px] text-gray-500 mt-0.5">{location}</p>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onEdit}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-900 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all duration-200"
                aria-label="Edit profile overview"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                completionPercent >= 100
                  ? "bg-success-50 text-success-700"
                  : "bg-primary-50 text-primary-700"
              }`}>
                {completionPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="border-t border-gray-100 pt-5 mb-5">
          <h4 className="text-[15px] font-medium text-gray-700 mb-3">
            Contact Information
          </h4>
          <div className="space-y-4">
            <ContactRow
              icon="phone"
              label="Phone"
              value={profile.phone}
            />
            <ContactRow
              icon="email"
              label="Email"
              value={profile.email}
            />
            <ContactRow
              icon="website"
              label="Website"
              value={profile.website}
            />
          </div>
        </div>

      </div>
    </DashboardSectionCard>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: "phone" | "email" | "website";
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-vanilla-50 border border-warm-100/40 flex items-center justify-center shrink-0">
        {icon === "phone" && (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
            />
          </svg>
        )}
        {icon === "email" && (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        )}
        {icon === "website" && (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
            />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className={`text-[15px] truncate ${value ? "text-gray-700" : "text-gray-400"}`}>
          {value || "N/A"}
        </p>
      </div>
    </div>
  );
}

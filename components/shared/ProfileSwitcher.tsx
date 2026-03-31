"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Profile } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  organization: "Organization",
  caregiver: "Caregiver",
  student: "Caregiver", // Students are unified as Caregivers
  family: "Family",
};

const TYPE_COLORS: Record<string, string> = {
  organization: "bg-primary-100 text-primary-700",
  caregiver: "bg-secondary-100 text-secondary-700",
  student: "bg-secondary-100 text-secondary-700", // Students are unified as Caregivers
  family: "bg-warm-100 text-warm-700",
};

function ProfileIcon({ profile, size = "sm" }: { profile: Profile; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  const colorClass = TYPE_COLORS[profile.type] || "bg-gray-100 text-gray-700";
  return (
    <div
      className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center font-semibold shrink-0`}
    >
      {profile.display_name.charAt(0).toUpperCase()}
    </div>
  );
}

interface ProfileSwitcherProps {
  /** Called after a profile switch completes (e.g., to close a menu). */
  onSwitch?: () => void;
  /** Render variant. "dropdown" for navbar dropdown, "sidebar" for portal sidebar. */
  variant?: "dropdown" | "sidebar";
  /** If provided, only show profiles whose type is in this list. */
  allowedTypes?: string[];
  /** Where to navigate after switching profiles. Defaults to "/portal". */
  navigateTo?: string;
}

export default function ProfileSwitcher({
  onSwitch,
  variant = "dropdown",
  allowedTypes,
  navigateTo = "/portal",
}: ProfileSwitcherProps) {
  const { profiles, activeProfile, switchProfile } = useAuth();
  const router = useRouter();

  const visibleProfiles = allowedTypes
    ? profiles.filter((p) => allowedTypes.includes(p.type))
    : profiles;

  const hasMultipleProfiles = visibleProfiles.length > 1;

  const handleSwitch = (profileId: string) => {
    if (profileId === activeProfile?.id) return;
    switchProfile(profileId);
    onSwitch?.();
    router.push(navigateTo);
  };

  if (variant === "sidebar") {
    return (
      <div className="space-y-1">
        {hasMultipleProfiles && (
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-4 mb-2">
            Switch Profile
          </p>
        )}
        {visibleProfiles.map((profile) => {
          const isActive = profile.id === activeProfile?.id;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => handleSwitch(profile.id)}
              className={[
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors min-h-[44px]",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50",
              ].join(" ")}
            >
              <ProfileIcon profile={profile} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {profile.display_name}
                </p>
                <p className="text-xs text-gray-400">
                  {TYPE_LABELS[profile.type] || profile.type}
                </p>
              </div>
              {isActive && (
                <svg className="w-4 h-4 text-primary-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown variant (for navbar)
  return (
    <div className="py-1">
      {hasMultipleProfiles && (
        <p className="px-4 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
          Profiles
        </p>
      )}
      {visibleProfiles.map((profile) => {
        const isActive = profile.id === activeProfile?.id;
        return (
          <button
            key={profile.id}
            type="button"
            onClick={() => handleSwitch(profile.id)}
            className={[
              "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
              isActive
                ? "bg-primary-50 text-primary-700"
                : "text-gray-700 hover:bg-gray-50",
            ].join(" ")}
          >
            <ProfileIcon profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {profile.display_name}
              </p>
              <p className="text-xs text-gray-400">
                {TYPE_LABELS[profile.type] || profile.type}
              </p>
            </div>
            {isActive && (
              <svg className="w-4 h-4 text-primary-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

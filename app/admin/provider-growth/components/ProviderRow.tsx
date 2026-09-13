"use client";

/**
 * ProviderRow - Card-based provider row in the growth tracking list
 *
 * Shows provider name, contact info (phone/email), claim date,
 * verification status, profile completeness, and eligibility badges.
 */

import Link from "next/link";
import type { ProviderGrowthWithProfile } from "@/lib/provider-growth/queries";
import {
  type AdsStatus,
  type MedjobsStatus,
  type MeetingType,
  type MeetingFocus,
  type MeetingFormat,
} from "@/lib/provider-growth/stages";
import { EligibilityBadges } from "./EligibilityBadges";

interface ProviderRowProps {
  provider: ProviderGrowthWithProfile;
  onClick: () => void;
  onDelete?: () => void;
  selected?: boolean;
}

export function ProviderRow({ provider, onClick, onDelete, selected }: ProviderRowProps) {
  // Line 2: Location · Category
  const location = [provider.city, provider.state].filter(Boolean).join(", ");
  const category = provider.care_types?.slice(0, 2).join(", ") || null;
  const locationCategory = [location, category].filter(Boolean).join(" · ");

  // Claim date - computed once, used conditionally
  const claimDateDisplay = provider.claimed_at ? formatClaimDate(provider.claimed_at) : null;

  // Line 3: Phone · Email
  const contactParts: string[] = [];
  if (provider.phone) contactParts.push(provider.phone);
  if (provider.email) contactParts.push(provider.email);

  return (
    <div
      onClick={onClick}
      className={`group px-4 py-3 cursor-pointer transition-colors ${
        selected ? "bg-primary-50" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Provider info (3 lines) */}
        <div className="min-w-0 flex-1">
          {/* Line 1: Name + verification badge */}
          <div className="flex items-center gap-2">
            {provider.slug ? (
              <Link
                href={`/admin/directory/${provider.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-sm font-medium text-gray-900 hover:text-primary-600 transition-colors"
              >
                {provider.display_name || "Unnamed Provider"}
              </Link>
            ) : (
              <h3 className="truncate text-sm font-medium text-gray-900">
                {provider.display_name || "Unnamed Provider"}
              </h3>
            )}
            <VerificationBadge state={provider.verification_state} providerName={provider.display_name} />
          </div>

          {/* Line 2: Location · Category */}
          {locationCategory && (
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {locationCategory}
            </p>
          )}

          {/* Line 3: Phone · Email */}
          {contactParts.length > 0 && (
            <p className="mt-0.5 text-xs text-gray-500">
              {provider.phone && (
                <a
                  href={`tel:${provider.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {provider.phone}
                </a>
              )}
              {provider.phone && provider.email && <span className="text-gray-400"> · </span>}
              {provider.email && <span>{provider.email}</span>}
            </p>
          )}
        </div>

        {/* Right: Badges + claim date stacked */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* Top row: All badges */}
          <div className="flex items-center gap-2">
            {/* Profile completeness */}
            <ProfileProgress value={provider.profile_completeness || 0} />

            {/* Conversion status badges */}
            {provider.ads_status !== "none" && (
              <StatusBadge
                type="ads"
                status={provider.ads_status as AdsStatus}
                campaignStatus={provider.ads_campaign_status}
              />
            )}
            {provider.medjobs_status !== "none" && (
              <StatusBadge type="medjobs" status={provider.medjobs_status as MedjobsStatus} />
            )}

            {/* Call count + last call indicator */}
            {provider.pipeline_stage === "new_claim" && (provider.call_count || 0) > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200"
                title={`${provider.call_count} call${provider.call_count === 1 ? "" : "s"} logged${provider.last_call_at ? `, last ${timeAgo(provider.last_call_at)}` : ""}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {provider.call_count}
                {provider.last_call_at && (
                  <span className="text-blue-500">· {timeAgo(provider.last_call_at)}</span>
                )}
              </span>
            )}

            {/* Eligibility badges */}
            <EligibilityBadges
              adsEligible={provider.ads_eligible}
              medjobsEligible={provider.medjobs_eligible}
              medjobsUniversity={provider.medjobs_catchment_university}
            />

            {/* Meeting/pitch info */}
            {(provider.pipeline_stage === "meeting_scheduled" || provider.pipeline_stage === "upgrade_meeting") && provider.meeting_scheduled_at && (
              <>
                <MeetingBadge
                  type={provider.meeting_type as MeetingType | null}
                  focus={provider.meeting_focus as MeetingFocus | null}
                  format={provider.meeting_format as MeetingFormat | null}
                />
                <span className="text-xs font-medium text-blue-600">
                  {formatDate(provider.meeting_scheduled_at)}
                </span>
              </>
            )}
            {provider.pipeline_stage === "pitched" && (
              <>
                {provider.pitch_interest_level && (
                  <InterestBadge level={provider.pitch_interest_level} />
                )}
                {provider.pitched_at && (
                  <span className="text-xs text-gray-400">
                    Pitched {timeAgo(provider.pitched_at)}
                  </span>
                )}
              </>
            )}

            {/* Trash icon - always visible but subtle, more prominent on hover */}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 text-gray-200 hover:text-red-500 transition-colors"
                title="Remove from tracking"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom row: Claim date */}
          {claimDateDisplay && (
            <span className="text-xs text-gray-400">
              Claimed {claimDateDisplay}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function VerificationBadge({ state, providerName }: { state: string | null; providerName: string | null }) {
  const verificationLink = `/admin/verification?search=${encodeURIComponent(providerName || "")}`;

  // Verified or not_required: show green checkmark
  if (state === "verified" || state === "not_required") {
    return (
      <Link
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="text-emerald-600 hover:text-emerald-700 transition-colors"
        title="Verified — click to view"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      </Link>
    );
  }

  // Pending verification: show amber badge linking to verification page
  if (state === "pending") {
    return (
      <Link
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        title="Click to review verification"
      >
        Pending Verification
      </Link>
    );
  }

  // Unverified: show orange badge linking to verification page
  if (state === "unverified") {
    return (
      <Link
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
        title="Click to verify this provider"
      >
        Unverified
      </Link>
    );
  }

  // Rejected: show red badge linking to verification page (for context/history)
  if (state === "rejected") {
    return (
      <Link
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
        title="Verification rejected — click for details"
      >
        Rejected
      </Link>
    );
  }

  return null;
}

function StatusBadge({
  type,
  status,
  campaignStatus,
}: {
  type: "ads" | "medjobs";
  status: AdsStatus | MedjobsStatus;
  campaignStatus?: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | null;
}) {
  // For ads with free_intro status, show granular campaign status
  if (type === "ads" && status === "free_intro" && campaignStatus) {
    const campaignLabels: Record<string, string> = {
      pending_profile: "Pending",
      requested: "Requested",
      scheduled: "Scheduled",
      live: "Live",
      ended: "Ended",
    };

    const campaignColors: Record<string, string> = {
      pending_profile: "bg-gray-50 text-gray-600 border-gray-200",
      requested: "bg-amber-50 text-amber-700 border-amber-200",
      scheduled: "bg-blue-50 text-blue-700 border-blue-200",
      live: "bg-emerald-50 text-emerald-700 border-emerald-200",
      ended: "bg-gray-50 text-gray-500 border-gray-200",
    };

    const label = campaignLabels[campaignStatus] || campaignStatus;
    const colorClass = campaignColors[campaignStatus] || "bg-amber-50 text-amber-700 border-amber-200";

    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${colorClass}`}
      >
        Ads: {label}
      </span>
    );
  }

  // Default labels for other statuses
  const labels: Record<string, string> = {
    free_intro: "Free Trial",
    in_pilot: "Pilot",
    pilot_expired: "Expired",
    subscribed: "Subscribed",
  };

  const label = labels[status] || status;
  const colorClass =
    status === "subscribed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : type === "ads"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-purple-50 text-purple-700 border-purple-200";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${colorClass}`}
    >
      {type === "ads" ? "Ads" : "MJ"}: {label}
    </span>
  );
}

function ProfileProgress({ value }: { value: number }) {
  const color =
    value >= 80
      ? "text-emerald-600"
      : value >= 50
      ? "text-amber-600"
      : "text-gray-400";

  return (
    <span className={`text-xs font-medium ${color}`} title="Profile completeness">
      {value}%
    </span>
  );
}

function InterestBadge({ level }: { level: string }) {
  const config: Record<string, { label: string; className: string }> = {
    high: { label: "High", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    medium: { label: "Med", className: "bg-amber-50 text-amber-700 border-amber-200" },
    low: { label: "Low", className: "bg-orange-50 text-orange-700 border-orange-200" },
    none: { label: "None", className: "bg-gray-50 text-gray-500 border-gray-200" },
  };

  const { label, className } = config[level] || config.none;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${className}`}
      title={`Interest level: ${label}`}
    >
      {label}
    </span>
  );
}

function MeetingBadge({ type, focus, format }: { type: MeetingType | null; focus: MeetingFocus | null; format: MeetingFormat | null }) {
  const focusLabels: Record<MeetingFocus, string> = {
    ads: "Ads",
    medjobs: "MedJobs",
    both: "Both",
  };

  const focusLabel = focus ? focusLabels[focus] : null;
  const isUpgrade = type === "upgrade";
  const isPhoneCall = format === "phone";

  // Build clear, self-explanatory label
  let label: string;
  if (isUpgrade) {
    label = focusLabel ? `Upgrade: ${focusLabel}` : "Upgrade Meeting";
  } else {
    label = focusLabel ? `Scheduled for ${focusLabel}` : "Meeting Scheduled";
  }

  // Color: phone calls get green, upgrades amber, new meetings blue
  const colorClass = isPhoneCall
    ? "bg-green-50 text-green-700 border-green-200"
    : isUpgrade
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${colorClass}`}
      title={`${isUpgrade ? "Upgrade" : "New"} ${isPhoneCall ? "phone call" : "video call"} for ${focusLabel || "products"}`}
    >
      {isPhoneCall && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      )}
      {label}
    </span>
  );
}

function timeAgo(isoDate: string | undefined | null): string {
  if (!isoDate) return "—";
  const days = Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatClaimDate(isoDate: string): string {
  const date = new Date(isoDate);

  // Guard against invalid dates - return empty string (caller shows nothing)
  if (isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Future dates: show actual date instead of nonsensical "-Xd ago"
  if (diffDays < 0) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  // Show actual date for older claims
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  // Compare dates in Eastern Time for accurate "Today"/"Tomorrow" detection
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const etDateStr = etFormatter.format(date);
  const nowEtStr = etFormatter.format(new Date());

  // Get tomorrow in ET by parsing today's ET date and adding 1 day
  // This handles DST correctly (avoids 24-hour assumption)
  const [month, day, year] = nowEtStr.split("/").map(Number);
  const tomorrowInET = new Date(year, month - 1, day + 1, 12, 0, 0); // noon to avoid edge cases
  const tomorrowEtStr = etFormatter.format(tomorrowInET);

  const isToday = etDateStr === nowEtStr;
  const isTomorrow = etDateStr === tomorrowEtStr;

  if (isToday) {
    return `Today ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    })} ET`;
  }
  if (isTomorrow) {
    return `Tomorrow ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    })} ET`;
  }
  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })} ET`;
}

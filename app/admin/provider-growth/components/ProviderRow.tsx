"use client";

/**
 * ProviderRow - Card-based provider row in the growth tracking list
 *
 * Shows provider name, contact info (phone/email), source, claim date,
 * verification status, profile completeness, and eligibility badges.
 * Follows the MedjobsCard pattern for consistency across admin pages.
 */

import Link from "next/link";
import type { ProviderGrowthWithProfile } from "@/lib/provider-growth/queries";
import {
  CLAIM_SOURCE_LABELS,
  CLAIM_SOURCE_COLORS,
  type ClaimSource,
  type AdsStatus,
  type MedjobsStatus,
} from "@/lib/provider-growth/stages";
import { EligibilityBadges } from "./EligibilityBadges";

interface ProviderRowProps {
  provider: ProviderGrowthWithProfile;
  onClick: () => void;
  selected?: boolean;
}

export function ProviderRow({ provider, onClick, selected }: ProviderRowProps) {
  // Build subtitle: city, state · email
  const locationPart = [provider.city, provider.state].filter(Boolean).join(", ");
  const subtitle = [locationPart, provider.email].filter(Boolean).join(" · ");

  // Build category from care_types
  const category = provider.care_types?.slice(0, 2).join(", ") || null;

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border bg-white px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${
        selected
          ? "border-blue-500 ring-1 ring-blue-500"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Provider info */}
        <div className="min-w-0 flex-1">
          {/* Title row: Name + verification badge */}
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-gray-900">
              {provider.display_name || "Unnamed Provider"}
            </h3>
            <VerificationBadge state={provider.verification_state} providerName={provider.display_name} />
          </div>

          {/* Subtitle: Location · Email */}
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
          )}

          {/* Phone (clickable) */}
          {provider.phone && (
            <p className="mt-0.5 text-xs text-gray-500">
              <a
                href={`tel:${provider.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                {provider.phone}
              </a>
            </p>
          )}

          {/* Category */}
          {category && (
            <p className="mt-0.5 truncate text-[11px] text-gray-400">{category}</p>
          )}

          {/* Badges row: Source + Claim date */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {provider.claim_source && (
              <SourceBadge source={provider.claim_source as ClaimSource} />
            )}
            {provider.claimed_at && (
              <span className="text-[10px] text-gray-400">
                Claimed {timeAgo(provider.claimed_at)}
              </span>
            )}
          </div>
        </div>

        {/* Right: Status indicators + CTA */}
        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
          {/* Top: Overflow/status */}
          <div className="flex items-center gap-2">
            {/* Profile completeness */}
            <ProfileProgress value={provider.profile_completeness || 0} />

            {/* Conversion status badges */}
            {provider.ads_status !== "none" && (
              <StatusBadge type="ads" status={provider.ads_status as AdsStatus} />
            )}
            {provider.medjobs_status !== "none" && (
              <StatusBadge type="medjobs" status={provider.medjobs_status as MedjobsStatus} />
            )}
          </div>

          {/* Bottom: Eligibility badges */}
          <EligibilityBadges
            adsEligible={provider.ads_eligible}
            medjobsEligible={provider.medjobs_eligible}
            medjobsUniversity={provider.medjobs_catchment_university}
          />

          {/* Meeting/pitch info */}
          {provider.pipeline_stage === "meeting_scheduled" && provider.meeting_scheduled_at && (
            <div className="text-right">
              <div className="text-xs font-medium text-blue-600">
                {formatDate(provider.meeting_scheduled_at)}
              </div>
            </div>
          )}
          {provider.pipeline_stage === "pitched" && provider.pitched_at && (
            <div className="text-right">
              <div className="text-xs text-gray-400">
                Pitched {timeAgo(provider.pitched_at)}
              </div>
            </div>
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

  // Everything else (unverified, rejected, etc.): show nothing
  return null;
}

function SourceBadge({ source }: { source: ClaimSource }) {
  const label = CLAIM_SOURCE_LABELS[source] || source;
  const colorClass = CLAIM_SOURCE_COLORS[source] || "text-gray-600 bg-gray-50 border-gray-200";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${colorClass}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({
  type,
  status,
}: {
  type: "ads" | "medjobs";
  status: AdsStatus | MedjobsStatus;
}) {
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

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow =
    date.toDateString() === new Date(now.getTime() + 86400000).toDateString();

  if (isToday) {
    return `Today ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  if (isTomorrow) {
    return `Tomorrow ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

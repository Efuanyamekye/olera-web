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
            <h3 className="truncate text-sm font-medium text-gray-900">
              {provider.display_name || "Unnamed Provider"}
            </h3>
            <VerificationBadge state={provider.verification_state} providerName={provider.display_name} />
          </div>

          {/* Line 2: Location · Category */}
          {locationCategory && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{locationCategory}</p>
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

        {/* Right: All badges on one line + trash icon */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Profile completeness */}
          <ProfileProgress value={provider.profile_completeness || 0} />

          {/* Conversion status badges */}
          {provider.ads_status !== "none" && (
            <StatusBadge type="ads" status={provider.ads_status as AdsStatus} />
          )}
          {provider.medjobs_status !== "none" && (
            <StatusBadge type="medjobs" status={provider.medjobs_status as MedjobsStatus} />
          )}

          {/* Eligibility badges */}
          <EligibilityBadges
            adsEligible={provider.ads_eligible}
            medjobsEligible={provider.medjobs_eligible}
            medjobsUniversity={provider.medjobs_catchment_university}
          />

          {/* Meeting/pitch info */}
          {provider.pipeline_stage === "meeting_scheduled" && provider.meeting_scheduled_at && (
            <span className="text-xs font-medium text-blue-600">
              {formatDate(provider.meeting_scheduled_at)}
            </span>
          )}
          {provider.pipeline_stage === "pitched" && provider.pitched_at && (
            <span className="text-xs text-gray-400">
              Pitched {timeAgo(provider.pitched_at)}
            </span>
          )}

          {/* Trash icon - appears on hover */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              title="Remove from tracking"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
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

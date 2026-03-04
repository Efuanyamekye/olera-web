"use client";

import Image from "next/image";
import Link from "next/link";
import { avatarGradient } from "@/components/portal/ConnectionDetailContent";
import type { InterestedProvider } from "@/hooks/useInterestedProviders";
import type { ProfileCategory } from "@/lib/types";

interface InterestedCardCompactProps {
  item: InterestedProvider;
  familyLat?: number | null;
  familyLng?: number | null;
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export default function InterestedCardCompact({
  item,
}: InterestedCardCompactProps) {
  const profile = item.providerProfile;
  const name = profile?.display_name || "Unknown Provider";
  const location = [profile?.city, profile?.state].filter(Boolean).join(", ");
  const imageUrl = profile?.image_url;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const viewed = (item.metadata as Record<string, unknown>)?.viewed === true;
  const matchReasons =
    ((item.metadata as Record<string, unknown>)?.match_reasons as string[]) ||
    [];
  const dateLabel = formatRelativeDate(item.created_at);
  const categoryLabel = getCategoryLabel(
    profile?.category as ProfileCategory | null,
    profile?.type
  );
  const matchCount = matchReasons.length;

  return (
    <Link
      href={`/portal/matches/${item.id}`}
      className="group flex items-center gap-3.5 px-5 py-4 bg-white border-b border-warm-100/60 last:border-b-0 hover:bg-warm-50/30 active:bg-warm-50/50 transition-colors"
    >
      {/* Avatar */}
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          width={48}
          height={48}
          sizes="48px"
          className="w-12 h-12 rounded-2xl object-cover shrink-0 shadow-sm"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-[14px] font-bold text-white shadow-sm"
          style={{ background: avatarGradient(name) }}
        >
          {initials}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name */}
        <h3 className="text-[15px] font-display font-semibold text-gray-900 truncate leading-tight">
          {name}
        </h3>

        {/* Category + Location */}
        <p className="text-[13px] text-gray-500 truncate mt-0.5">
          {categoryLabel}
          {location && (
            <>
              <span className="text-gray-300 mx-1">·</span>
              {location}
            </>
          )}
        </p>

        {/* Match count */}
        {matchCount > 0 && (
          <p className="flex items-center gap-1.5 text-[12px] text-gray-500 mt-1">
            <svg
              className="w-3.5 h-3.5 text-primary-500"
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
            <span>
              <span className="font-semibold text-gray-700">{matchCount}</span>{" "}
              service{matchCount !== 1 ? "s" : ""} match
            </span>
          </p>
        )}
      </div>

      {/* Right side: badge + time + chevron */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex flex-col items-end gap-1.5">
          {!viewed && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-600 border border-green-200 bg-white rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              New
            </span>
          )}
          <span className="text-[12px] text-gray-400 tabular-nums">
            {dateLabel}
          </span>
        </div>
        <svg
          className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
      </div>
    </Link>
  );
}

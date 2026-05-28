"use client";

import Link from "next/link";
import Image from "next/image";
import type { CandidateData } from "./CandidateRow";
import {
  getTrackLabel,
  formatAvailability,
  formatHoursPerWeek,
  hasVideo,
} from "@/lib/medjobs-helpers";

// Softer, more muted colors for avatar fallbacks
const AVATAR_COLORS = [
  "bg-slate-100 text-slate-600",
  "bg-stone-100 text-stone-600",
  "bg-zinc-100 text-zinc-600",
  "bg-neutral-100 text-neutral-600",
  "bg-gray-100 text-gray-600",
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getFirstName(name: string): string {
  if (!name) return "Someone";
  const firstName = name.trim().split(" ")[0];
  return firstName || "Someone";
}

interface CandidateCardProps {
  candidate: CandidateData;
  basePath: string;
  /** Whether the provider has already contacted this candidate */
  isContacted?: boolean;
}

export default function CandidateCard({
  candidate,
  basePath,
  isContacted = false,
}: CandidateCardProps) {
  const meta = candidate.metadata;
  const trackLabel = getTrackLabel(meta);
  const availLabel = formatAvailability(meta);
  const hoursLabel = formatHoursPerWeek(meta);
  const certs = meta.certifications || [];
  const videoAvailable = hasVideo(meta);
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ");
  const verifiedHours = meta.total_verified_hours ?? 0;

  const profileUrl = `${basePath}/${candidate.slug}`;
  const firstName = getFirstName(candidate.display_name);

  // Determine the single most important trust signal to highlight
  const primaryBadge = verifiedHours > 0
    ? { label: `${verifiedHours} hrs verified`, type: "verified" as const }
    : videoAvailable
    ? { label: "Video intro", type: "video" as const }
    : certs.length > 0
    ? { label: certs[0].split(" (")[0], type: "cert" as const }
    : null;

  // No click gate - Airbnb pattern: browse freely, actions gated at detail page

  const cardContent = (
    <div className="flex flex-col p-6 flex-1">
      {/* Avatar + Name row */}
      <div className="flex items-start gap-4 mb-4">
        <div className="relative w-14 h-14 rounded-full overflow-hidden shadow-sm shrink-0">
          {candidate.image_url ? (
            <Image
              src={candidate.image_url}
              alt={firstName}
              fill
              className="object-cover"
              sizes="56px"
            />
          ) : (
            <div
              className={`w-full h-full ${getAvatarColor(candidate.id)} flex items-center justify-center`}
            >
              <span className="text-xl font-medium">
                {candidate.display_name?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors leading-tight truncate">
            {candidate.display_name}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {meta.university || "University not specified"}
          </p>
        </div>
      </div>

      {/* Key info — clean two-line layout */}
      <div className="space-y-2 mb-4">
        {/* Track + Location - show for all users */}
        <div className="flex items-center gap-3 text-sm">
          {trackLabel && (
            <span className="font-medium text-gray-900">{trackLabel}</span>
          )}
          {trackLabel && location && (
            <span className="text-gray-300">·</span>
          )}
          {location && (
            <span className="text-gray-500">{location}</span>
          )}
        </div>

        {/* Availability - show for all users */}
        {(availLabel || hoursLabel) && (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {availLabel && <span>{availLabel}</span>}
            {availLabel && hoursLabel && (
              <span className="text-gray-300">·</span>
            )}
            {hoursLabel && <span>{hoursLabel}</span>}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom row: Primary badge + secondary certs - show for all users */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        {/* Primary trust signal */}
        {primaryBadge ? (
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              primaryBadge.type === "verified"
                ? "text-emerald-600"
                : primaryBadge.type === "video"
                ? "text-gray-700"
                : "text-gray-600"
            }`}
          >
            {primaryBadge.type === "verified" && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            )}
            {primaryBadge.type === "video" && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h7.5A2.25 2.25 0 0013 13.75v-7.5A2.25 2.25 0 0010.75 4h-7.5zM19 4.75a.75.75 0 00-1.28-.53l-3 3a.75.75 0 00-.22.53v4.5c0 .199.079.39.22.53l3 3a.75.75 0 001.28-.53V4.75z" />
              </svg>
            )}
            {primaryBadge.label}
          </span>
        ) : (
          <span />
        )}

        {/* Secondary: cert count if we have more */}
        {certs.length > (primaryBadge?.type === "cert" ? 1 : 0) && (
          <span className="text-xs text-gray-400">
            {certs.length} certification{certs.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Link
      href={profileUrl}
      className="group relative flex flex-col bg-white rounded-2xl border border-gray-200/80 hover:border-gray-300 transition-colors duration-200 overflow-hidden"
    >
      {/* Contacted badge */}
      {isContacted && (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-full">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Contacted
          </span>
        </div>
      )}
      {cardContent}
    </Link>
  );
}


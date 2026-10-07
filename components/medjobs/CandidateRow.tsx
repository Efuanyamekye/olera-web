"use client";

import Link from "next/link";
import Image from "next/image";
import type { StudentMetadata } from "@/lib/types";
import {
  getTrackLabel,
  formatAvailability,
  hasVideo,
} from "@/lib/medjobs-helpers";

const GRADIENTS = [
  "from-primary-400 to-teal-500",
  "from-teal-400 to-emerald-500",
  "from-primary-500 to-cyan-500",
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-primary-500",
  "from-teal-500 to-primary-400",
];

function getGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export interface CandidateData {
  id: string;
  slug: string;
  display_name: string;
  email?: string;
  phone?: string;
  city: string | null;
  state: string | null;
  description: string | null;
  care_types: string[];
  metadata: StudentMetadata;
  image_url?: string | null;
  created_at: string;
  updated_at?: string;
  lat?: number | null;
  lng?: number | null;
  /** Whether the student has toggled their profile as available */
  is_active?: boolean;
  /** Placement status with the current provider (if authenticated) */
  placementStatus?: "offered" | "accepted" | "confirmed" | null;
}

interface CandidateRowProps {
  candidate: CandidateData;
  /** Base path for profile links */
  basePath: string;
  /** Show contact info (email/phone) */
  showContact?: boolean;
}

export default function CandidateRow({
  candidate,
  basePath,
  showContact = false,
}: CandidateRowProps) {
  const meta = candidate.metadata;
  const trackLabel = getTrackLabel(meta);
  const availLabel = formatAvailability(meta);
  const certs = meta.certifications || [];
  const videoAvailable = hasVideo(meta);
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ");
  const isAvailable = candidate.is_active !== false; // Default to available if not specified

  const profileUrl = `${basePath}/${candidate.slug}`;

  return (
    <Link
      href={profileUrl}
      className="group flex items-start gap-4 px-4 py-4 sm:px-5 sm:py-5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 transition-colors duration-150 cursor-pointer"
    >
      {/* Avatar */}
      <div className="relative w-11 h-11 rounded-full overflow-hidden ring-1 ring-gray-100 shrink-0 mt-0.5">
        {candidate.image_url ? (
          <Image
            src={candidate.image_url}
            alt={candidate.display_name}
            fill
            className="object-cover"
            sizes="44px"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${getGradient(candidate.id)} flex items-center justify-center`}
          >
            <span className="text-base font-semibold text-white/90">
              {candidate.display_name?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name + University + Availability */}
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[15px] font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
            {candidate.display_name}
          </h3>
          <span className="text-sm text-gray-400 truncate">
            {meta.university || "University not specified"}
          </span>
          {/* Availability indicator */}
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              isAvailable ? "text-emerald-600" : "text-gray-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isAvailable ? "bg-emerald-500" : "bg-gray-400"
              }`}
            />
            {isAvailable ? "Available" : "Not Available"}
          </span>
        </div>

        {/* Inline metadata line */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-gray-500">
          {trackLabel && (
            <>
              <span className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs font-medium">
                {trackLabel}
              </span>
              <span className="text-gray-300" aria-hidden="true">&middot;</span>
            </>
          )}
          {location && (
            <>
              <span>{location}</span>
              {availLabel && <span className="text-gray-300" aria-hidden="true">&middot;</span>}
            </>
          )}
          {availLabel && <span>{availLabel}</span>}
        </div>

        {/* Certs + badges */}
        {(certs.length > 0 || videoAvailable || (meta.total_verified_hours ?? 0) > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {certs.slice(0, 4).map((cert) => (
              <span
                key={cert}
                className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs"
              >
                {cert.split(" (")[0]}
              </span>
            ))}
            {certs.length > 4 && (
              <span className="text-xs text-gray-400">+{certs.length - 4}</span>
            )}
            {videoAvailable && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                  />
                </svg>
                Video
              </span>
            )}
            {(meta.total_verified_hours ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {meta.total_verified_hours} hrs verified
              </span>
            )}
          </div>
        )}

        {/* Contact info — provider only */}
        {showContact && (candidate.email || candidate.phone) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {candidate.email && (
              <span
                className="inline-flex items-center gap-1.5 hover:text-primary-600 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.location.href = `mailto:${candidate.email}`;
                }}
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                {candidate.email}
              </span>
            )}
            {candidate.phone && (
              <span
                className="inline-flex items-center gap-1.5 hover:text-primary-600 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.location.href = `tel:${candidate.phone}`;
                }}
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {candidate.phone}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Arrow on hover */}
      <div className="hidden sm:flex items-center self-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-gray-400 shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

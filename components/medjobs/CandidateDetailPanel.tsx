"use client";

import Image from "next/image";
import type { CandidateData } from "@/components/medjobs/CandidateRow";
import {
  getTrackLabel,
  formatAvailability,
  getMajorLabel,
  getActualCertifications,
} from "@/lib/medjobs-helpers";

/**
 * CandidateDetailPanel — inline profile preview that replaces the map
 * on the Hire Caregivers board when a candidate card is clicked. The single
 * action is "Schedule interview" (the interview-scheduling MVP); the old
 * post-a-job / invite-to-posting machinery has been removed.
 */
export default function CandidateDetailPanel({
  candidate,
  onClose,
  onSchedule,
}: {
  candidate: CandidateData;
  onClose: () => void;
  /** Open the schedule-interview flow for this candidate. */
  onSchedule: () => void;
}) {
  const meta = candidate.metadata;
  const firstName = candidate.display_name.split(" ")[0];
  const trackLabel = getTrackLabel(meta);
  const availabilityLabel = formatAvailability(meta);
  const isDemo = candidate.slug.startsWith("sample-");
  const isAvailable = candidate.is_active !== false; // Default to available if not specified

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <a
          href={`/medjobs/candidates/${candidate.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary-700 hover:text-primary-800 transition-colors"
        >
          Open full profile &rarr;
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Identity */}
        <div className="flex items-start gap-4">
          {candidate.image_url ? (
            <Image
              src={candidate.image_url}
              alt={candidate.display_name}
              width={72}
              height={72}
              className="w-[72px] h-[72px] rounded-full object-cover shadow-sm ring-2 ring-white shrink-0"
            />
          ) : (
            <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-sm ring-2 ring-white shrink-0">
              <span className="text-2xl font-bold text-primary-600">
                {candidate.display_name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-display font-bold text-gray-900">{firstName}</h2>
                {meta.university && (
                  <p className="text-sm text-gray-600 font-medium mt-0.5">{meta.university}</p>
                )}
                <p className="text-sm text-gray-500 mt-0.5">
                  {[trackLabel, candidate.city && candidate.state ? `${candidate.city}, ${candidate.state}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={onSchedule}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Schedule interview
              </button>
            </div>
            {/* Availability status */}
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isAvailable
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isAvailable ? "bg-emerald-500" : "bg-gray-400"
                  }`}
                />
                {isAvailable ? "Available" : "Not Available"}
              </span>
              {isDemo && (
                <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                  Demo
                </span>
              )}
              {!isDemo && meta.seeking_status === "actively_looking" && isAvailable && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ready to Start
                </span>
              )}
            </div>
          </div>
        </div>

        {/* About — shown first when available since it's often the most informative */}
        {(meta.why_caregiving || candidate.description) && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              About {firstName}
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              {meta.why_caregiving || candidate.description}
            </p>
          </div>
        )}

        {/* Availability */}
        {availabilityLabel && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Availability</h3>
            <p className="text-sm font-medium text-gray-700">{availabilityLabel}</p>
          </div>
        )}

        {/* Certifications — moved up since it's a key hiring signal */}
        {(() => {
          const certs = getActualCertifications(meta.certifications);
          return certs.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Certifications</h3>
              <div className="flex flex-wrap gap-1.5">
                {certs.map((cert) => (
                  <span key={cert} className="px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-semibold border border-primary-100">
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        {/* Program (Qualifications) */}
        {meta.major && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Program</h3>
            <p className="text-sm font-medium text-gray-900">{getMajorLabel(meta.major)}</p>
          </div>
        )}

        {/* View full profile prompt */}
        <div className="pt-2">
          <a
            href={`/medjobs/candidates/${candidate.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 text-center text-sm font-semibold text-primary-700 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
          >
            View full profile for more details →
          </a>
        </div>
      </div>
    </div>
  );
}

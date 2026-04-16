import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import type { StudentMetadata } from "@/lib/types";
import {
  getTrackLabel,
  formatHoursPerWeek,
  formatDuration,
  SEASON_LABELS,
  getSeasonalStatusLabel,
  hasVideo,
  getYouTubeId,
  INTENDED_SCHOOL_LABELS,
} from "@/lib/medjobs-helpers";
import { getAccessTier, filterCandidateForTier, type AccessTier, type AccessInfo } from "@/lib/medjobs-access";
import CandidateDetailClientWrapper from "./CandidateDetailClientWrapper";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = getSupabase();
  const { data } = await supabase
    .from("business_profiles")
    .select("display_name, metadata, city, state")
    .eq("slug", slug)
    .eq("type", "student")
    .eq("is_active", true)
    .single();

  if (!data) return { title: "Candidate Not Found | Hire Staff" };

  const meta = data.metadata as StudentMetadata;
  const trackLabel = getTrackLabel(meta);

  // Redact full name in metadata to prevent de-platforming via view-source.
  // Use "First L." format since we can't check access tier in generateMetadata.
  const parts = (data.display_name || "").trim().split(/\s+/);
  const redactedName = parts.length <= 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;

  return {
    title: `${redactedName} — Student Caregiver | Hire Staff`,
    description: `${redactedName} is a ${trackLabel || "healthcare"} student${meta.university ? ` at ${meta.university}` : ""} seeking healthcare experience${data.city ? ` in ${data.city}, ${data.state}` : ""}.`,
  };
}

/** Format a timestamp into "Updated Mar 28" or "Updated 3 days ago" */
function formatLastUpdated(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 14) return `Updated ${diffDays} days ago`;
  return `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default async function ProviderStudentProfilePage({ params }: PageProps) {
  const { slug } = await params;

  const supabase = getSupabase();
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("slug", slug)
    .eq("type", "student")
    .eq("is_active", true)
    .single();

  if (!profile) notFound();

  const meta = (profile.metadata || {}) as StudentMetadata;
  const trackLabel = getTrackLabel(meta);
  const hoursLabel = formatHoursPerWeek(meta);
  const durationLabel = formatDuration(meta);
  const videoAvailable = hasVideo(meta);
  const youtubeId = videoAvailable ? getYouTubeId(meta.video_intro_url!) : null;
  const lastUpdated = profile.updated_at ? formatLastUpdated(profile.updated_at) : null;

  // Determine the viewing provider's access tier for paywall gating
  const adminSb = getAdminSupabase();
  let accessTier: AccessTier = "anonymous";
  let accessInfo: AccessInfo = { tier: "anonymous", creditsUsed: 0, creditsRemaining: 0, isPaid: false };
  try {
    const serverSb = await createServerClient();
    const { data: { user } } = await serverSb.auth.getUser();
    if (user) {
      const { data: account } = await adminSb.from("accounts").select("id").eq("user_id", user.id).single();
      if (account) {
        const { data: providerProfile } = await adminSb
          .from("business_profiles")
          .select("metadata")
          .eq("account_id", account.id)
          .in("type", ["organization", "caregiver"])
          .limit(1)
          .single();
        if (providerProfile) {
          const providerMeta = (providerProfile.metadata ?? {}) as Record<string, unknown>;
          accessInfo = getAccessTier(true, providerMeta);
          accessTier = accessInfo.tier;
        }
      }
    }
  } catch {
    // If auth check fails, default to anonymous (most restrictive)
  }
  const filtered = filterCandidateForTier(
    {
      displayName: profile.display_name || "",
      email: profile.email,
      phone: profile.phone,
      linkedinUrl: meta.linkedin_url,
      resumeUrl: meta.resume_url,
    },
    accessInfo
  );
  const firstName = (profile.display_name?.split(" ")[0]) || "This candidate";

  // Generate signed URLs for private documents (only if paid)
  async function getSignedUrl(path: string | undefined): Promise<string | null> {
    if (!path || path.startsWith("http")) return path || null;
    const { data } = await adminSb.storage.from("student-documents").createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  }
  const resumeUrl = accessInfo.isPaid ? await getSignedUrl(meta.resume_url) : null;

  // Verification status
  const isVerified = !!(meta.drivers_license_url && meta.car_insurance_url);

  // Build highlight chips (max 4, most important only)
  const highlights: string[] = [];
  if (hoursLabel) highlights.push(hoursLabel);
  if (durationLabel) highlights.push(durationLabel);
  if (meta.years_caregiving && meta.years_caregiving > 0) highlights.push(`${meta.years_caregiving}+ yr experience`);
  if ((meta.certifications?.length ?? 0) > 0) highlights.push(meta.certifications![0]);
  const displayHighlights = highlights.slice(0, 4);

  // Check if sections have content
  const hasAbout = !!(meta.why_caregiving || profile.description || meta.intended_professional_school);
  const hasCommitments = !!(meta.acknowledgments_completed || meta.ncns_pledge || meta.school_balance_pledge || meta.advance_notice_pledge || meta.prn_willing);
  const hasScenarios = meta.scenario_responses && meta.scenario_responses.length > 0;
  const hasReferences = meta.references && meta.references.length > 0;
  const hasSocial = !!(meta.instagram_url || meta.facebook_url || meta.tiktok_url);

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-32 lg:pb-12">
        {/* Back button */}
        <nav className="mb-4">
          <Link
            href="/provider/medjobs/candidates"
            className="group inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </Link>
        </nav>

        {/* ═══════════════════════════════════════════════════════════════════
            TWO-COLUMN LAYOUT: Content (left) + Sticky CTA (right)
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">

          {/* ─── LEFT COLUMN: All Content ─── */}
          <div className="space-y-6">

            {/* ─── HERO CARD: Identity Only ─── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
                {/* Photo */}
                <div className="flex-shrink-0 flex justify-center sm:justify-start">
                  {profile.image_url ? (
                    <Image
                      src={profile.image_url}
                      alt={profile.display_name}
                      width={120}
                      height={120}
                      className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover shadow-md ring-4 ring-white"
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-md ring-4 ring-white">
                      <span className="text-3xl sm:text-4xl font-bold text-primary-600">
                        {profile.display_name?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Identity Info */}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  {/* Name + Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap justify-center sm:justify-start">
                    <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900">
                      {filtered.displayName}
                    </h1>
                    {meta.seeking_status === "actively_looking" && (
                      <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 w-fit mx-auto sm:mx-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Ready to Start
                      </span>
                    )}
                  </div>

                  {/* University + Track + Location */}
                  <div className="mt-2 space-y-0.5">
                      {meta.university && (
                        <p className="text-base text-gray-700 font-medium">{meta.university}</p>
                      )}
                    <p className="text-sm text-gray-500">
                      {[trackLabel, profile.city && profile.state ? `${profile.city}, ${profile.state}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  {/* Trust Signals */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                    {isVerified && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Verified
                      </span>
                    )}
                    {videoAvailable && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                        Video Intro
                      </span>
                    )}
                    {lastUpdated && (
                      <span className="text-xs text-gray-400">{lastUpdated}</span>
                    )}
                  </div>

                  {/* Highlight Chips */}
                  {displayHighlights.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
                      {displayHighlights.map((fact) => (
                        <span
                          key={fact}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-50 text-gray-700 border border-gray-100"
                        >
                          {fact}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quick Links - only visible to paid providers */}
                  {accessInfo.isPaid && (resumeUrl || filtered.linkedinUrl) && (
                    <div className="mt-4 flex flex-wrap gap-3 justify-center sm:justify-start">
                      {resumeUrl && (
                        <a
                          href={resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm rounded-lg text-sm font-medium text-gray-700 transition-all duration-200"
                        >
                          <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-700 transition-colors" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          Resume
                        </a>
                      )}
                      {filtered.linkedinUrl && (
                        <a
                          href={filtered.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                            className="group inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-white border border-gray-200 hover:border-[#0A66C2]/30 hover:shadow-sm rounded-lg text-sm font-medium text-gray-700 transition-all duration-200"
                          >
                            <svg className="w-4 h-4 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                            </svg>
                            LinkedIn
                          </a>
                        )}
                      </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── RESUME CARD: All Content Sections with Dividers ─── */}
            {/* Section order optimized for provider screening: practical filters first, personality later */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

              {/* ── Video Section ── */}
              {videoAvailable && (
                <div className="py-8 px-6 sm:px-8">
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                    Meet {firstName}
                  </h2>
                  <div className="rounded-xl overflow-hidden border border-gray-100">
                    {youtubeId ? (
                      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                        <iframe
                          className="absolute inset-0 w-full h-full"
                          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
                          title={`${firstName}'s intro video`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <a
                        href={meta.video_intro_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-center gap-4 py-16 bg-gray-50 hover:bg-gray-100 transition-all duration-200"
                      >
                        <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-200">
                          <svg className="w-7 h-7 text-primary-600 ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">Watch Intro Video</p>
                          <p className="text-sm text-gray-500 mt-0.5">Hear directly from {firstName}</p>
                        </div>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* ── Availability Section ── */}
              <div className={`py-8 px-6 sm:px-8 ${videoAvailable ? "border-t border-gray-200" : ""}`}>
                <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                  Availability
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {hoursLabel && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Hours per Week</dt>
                      <dd className="text-lg font-semibold text-gray-900">{hoursLabel}</dd>
                    </div>
                  )}
                  {durationLabel && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Commitment</dt>
                      <dd className="text-lg font-semibold text-gray-900">{durationLabel}</dd>
                    </div>
                  )}
                  {meta.seeking_status === "actively_looking" && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Status</dt>
                      <dd className="text-lg font-semibold text-emerald-600">Ready to start</dd>
                    </div>
                  )}
                </div>

                {/* Year-Round Availability */}
                {meta.year_round_availability && Object.keys(meta.year_round_availability).length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-medium text-gray-500 mb-3">Year-Round Availability</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(["spring", "summer", "fall", "winter"] as const).map((season) => {
                        const data = meta.year_round_availability?.[season];
                        if (!data) return null;
                        return (
                          <div key={season} className="bg-gray-50 rounded-lg px-4 py-3">
                            <p className="text-xs font-medium text-gray-400 uppercase">{SEASON_LABELS[season]}</p>
                            <p className="text-sm font-semibold text-gray-900 mt-0.5">{getSeasonalStatusLabel(data.status)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Schedule Grid */}
                {meta.course_schedule_grid && (
                  <details open className="mt-6 pt-6 border-t border-gray-100 group">
                    <summary className="flex items-center justify-between cursor-pointer list-none hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors">
                      <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                        View Class Schedule {meta.course_schedule_semester && `(${meta.course_schedule_semester})`}
                      </span>
                      <svg className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="mt-4">
                      <ScheduleGrid grid={meta.course_schedule_grid} />
                    </div>
                  </details>
                )}

                {/* Commitment Statement */}
                {meta.commitment_statement && (
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Commitment Statement</h3>
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      &ldquo;{meta.commitment_statement}&rdquo;
                    </p>
                  </div>
                )}
              </div>

              {/* ── Qualifications Section ── */}
              <div className="py-8 px-6 sm:px-8 border-t border-gray-200">
                <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                  Qualifications
                </h2>

                {/* Verification Banner */}
                {isVerified && (
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100 mb-6">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Verified Candidate</p>
                      <p className="text-xs text-emerald-600">Driver&apos;s license and car insurance on file</p>
                    </div>
                  </div>
                )}

                {/* Education & Experience Grid */}
                <div className="grid sm:grid-cols-2 gap-6">
                    {meta.university && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500 mb-1">University</dt>
                        <dd className="text-base font-semibold text-gray-900">{meta.university}</dd>
                        {meta.major && <dd className="text-sm text-gray-600 mt-0.5">{meta.major}</dd>}
                      </div>
                    )}
                  <div>
                    <dt className="text-sm font-medium text-gray-500 mb-1">Caregiving Experience</dt>
                    <dd className="text-base font-semibold text-gray-900">
                      {meta.years_caregiving && meta.years_caregiving > 0
                        ? `${meta.years_caregiving}+ years`
                        : "New to caregiving"}
                    </dd>
                  </div>
                  {(meta.languages?.length ?? 0) > 0 && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Languages</dt>
                      <dd className="text-base font-semibold text-gray-900">{meta.languages!.join(", ")}</dd>
                    </div>
                  )}
                  {meta.gpa && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">GPA</dt>
                      <dd className="text-base font-semibold text-gray-900">{meta.gpa.toFixed(1)}</dd>
                    </div>
                  )}
                </div>

                {/* Care Types */}
                {(meta.care_experience_types?.length ?? 0) > 0 && (
                  <div className="mt-6">
                    <dt className="text-sm font-medium text-gray-500 mb-2">Care Experience</dt>
                    <dd className="flex flex-wrap gap-2">
                      {meta.care_experience_types!.map((type) => (
                        <span key={type} className="px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-sm font-medium border border-gray-100">
                          {type}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}

                {/* Certifications */}
                {(meta.certifications?.length ?? 0) > 0 && (
                  <div className="mt-6">
                    <dt className="text-sm font-medium text-gray-500 mb-2">Certifications</dt>
                    <dd className="flex flex-wrap gap-2">
                      {meta.certifications!.map((cert) => (
                        <span key={cert} className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-sm font-semibold border border-primary-100">
                          {cert}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}

                {/* Verified Hours */}
                {(meta.total_verified_hours ?? 0) > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-primary-600">{meta.total_verified_hours}</p>
                        <p className="text-xs text-gray-500 font-medium uppercase">Verified Hours</p>
                      </div>
                      {(meta.verified_care_types?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {meta.verified_care_types!.map((type) => (
                            <span key={type} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                              {type}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Commitments Section ── */}
              {hasCommitments && (
                <div className="py-8 px-6 sm:px-8 border-t border-gray-200">
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                    {firstName}&apos;s Commitments
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">Verified commitments this candidate has made</p>
                  <div className="space-y-3">
                    {meta.acknowledgments_completed && (
                      <>
                        <CommitmentItem text="I will be on time, professional, and communicate schedule changes 24+ hours in advance" />
                        <CommitmentItem text="I consent to a background check and drug test upon hire" />
                        <CommitmentItem text="I have reliable transportation and accept responsibility for transport costs" />
                      </>
                    )}
                    {meta.ncns_pledge && (
                      <CommitmentItem text="I understand that a no-call no-show means a vulnerable person goes without care. I commit to never doing this." />
                    )}
                    {meta.school_balance_pledge && (
                      <CommitmentItem text="I will maintain my scheduled shifts even during midterms and finals — I will plan ahead and communicate early if I need coverage." />
                    )}
                    {meta.advance_notice_pledge && (
                      <CommitmentItem text="I will keep my availability and schedule updated regularly and work with office staff if anything changes." />
                    )}
                    {meta.prn_willing && (
                      <CommitmentItem text="I am open to starting PRN/as-needed until we find the right ongoing fit." />
                    )}
                  </div>
                </div>
              )}

              {/* ── Screening Responses Section ── */}
              {hasScenarios && (
                <div className="py-8 px-6 sm:px-8 border-t border-gray-200">
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                    Screening Responses
                  </h2>
                  <p className="text-sm text-gray-500 mb-6">{firstName}&apos;s responses to common care scenarios</p>
                  <div className="space-y-6">
                    {meta.scenario_responses!.map((sr, i) => (
                      <div key={i} className="border-l-4 border-primary-200 pl-5">
                        <p className="text-sm font-semibold text-gray-800 mb-2">&ldquo;{sr.question}&rdquo;</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{sr.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── About Section ── */}
              {hasAbout && (
                <div className="py-8 px-6 sm:px-8 border-t border-gray-200">
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                    About {firstName}
                  </h2>
                  <div className="space-y-4">
                    {meta.why_caregiving && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Why I Want to Be a Caregiver
                        </h3>
                        <p className="text-base text-gray-700 leading-relaxed whitespace-pre-line">
                          {meta.why_caregiving}
                        </p>
                      </div>
                    )}
                    {profile.description && !meta.why_caregiving && (
                      <p className="text-base text-gray-700 leading-relaxed whitespace-pre-line">
                        {profile.description}
                      </p>
                    )}
                    {meta.intended_professional_school && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-900">Career Goal:</span>{" "}
                        {INTENDED_SCHOOL_LABELS[meta.intended_professional_school]}
                        {meta.graduation_year && ` · Graduating ${meta.graduation_year}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── References Section ── */}
              {hasReferences && (
                <div className="py-8 px-6 sm:px-8 border-t border-gray-200">
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                    References
                  </h2>
                  <div className="space-y-4">
                    {meta.references!.map((ref, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-gray-500">{ref.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{ref.name}</p>
                          <p className="text-xs text-gray-500">{ref.relationship}</p>
                          {ref.note && <p className="text-xs text-gray-400 mt-1 italic">{ref.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
                    Contact details available after scheduling an interview.
                  </p>
                </div>
              )}

              {/* ── Social Links Section ── */}
              {hasSocial && (
                <div className="py-8 px-6 sm:px-8 border-t border-gray-200">
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-4">
                    Social
                  </h2>
                  <div className="flex gap-3">
                    {meta.instagram_url && (
                      <a href={meta.instagram_url} target="_blank" rel="noopener noreferrer" className="group w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 hover:border-pink-300 hover:bg-pink-50 flex items-center justify-center transition-all duration-200" title="Instagram">
                        <svg className="w-5 h-5 text-gray-600 group-hover:text-[#E4405F] transition-colors duration-200" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                      </a>
                    )}
                    {meta.facebook_url && (
                      <a href={meta.facebook_url} target="_blank" rel="noopener noreferrer" className="group w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 hover:border-blue-300 hover:bg-blue-50 flex items-center justify-center transition-all duration-200" title="Facebook">
                        <svg className="w-5 h-5 text-gray-600 group-hover:text-[#1877F2] transition-colors duration-200" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      </a>
                    )}
                    {meta.tiktok_url && (
                      <a href={meta.tiktok_url} target="_blank" rel="noopener noreferrer" className="group w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-400 hover:bg-gray-100 flex items-center justify-center transition-all duration-200" title="TikTok">
                        <svg className="w-5 h-5 text-gray-600 group-hover:text-black transition-colors duration-200" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT COLUMN: Sticky CTA Sidebar (Desktop Only) ─── */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-6">
                <CandidateDetailClientWrapper
                  studentId={profile.id}
                  studentName={filtered.displayName}
                  studentEmail={filtered.email}
                  studentPhone={filtered.phone}
                  studentSlug={profile.slug}
                  variant="inline"
                  accessTier={accessTier}
                  creditsUsed={accessInfo.creditsUsed}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE STICKY CTA
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">
        <CandidateDetailClientWrapper
          studentId={profile.id}
          studentName={filtered.displayName}
          studentEmail={filtered.email}
          studentPhone={filtered.phone}
          studentSlug={profile.slug}
          variant="sticky"
          accessTier={accessTier}
          creditsUsed={accessInfo.creditsUsed}
        />
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

const SCHED_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SCHED_SLOTS = [
  { key: "8am", label: "8-10a" },
  { key: "10am", label: "10-12p" },
  { key: "12pm", label: "12-2p" },
  { key: "2pm", label: "2-4p" },
  { key: "4pm", label: "4-6p" },
  { key: "6pm", label: "6-8p" },
  { key: "8pm", label: "8p+" },
];

function ScheduleGrid({ grid: gridStr }: { grid: string }) {
  let grid: Record<string, boolean> = {};
  try {
    grid = JSON.parse(gridStr);
  } catch {
    return null;
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[340px]">
        <div className="grid grid-cols-[50px_repeat(5,1fr)] gap-1 mb-1">
          <div />
          {SCHED_DAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-gray-500 py-1">
              {d}
            </div>
          ))}
        </div>
        {SCHED_SLOTS.map((slot) => (
          <div key={slot.key} className="grid grid-cols-[50px_repeat(5,1fr)] gap-1 mb-1">
            <div className="flex items-center justify-end pr-2">
              <span className="text-[10px] text-gray-400">{slot.label}</span>
            </div>
            {SCHED_DAYS.map((day) => {
              const isClass = !!grid[`${day}-${slot.key}`];
              return (
                <div
                  key={day}
                  className={`h-7 rounded-md text-[10px] font-medium flex items-center justify-center ${
                    isClass ? "bg-gray-800 text-white" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {isClass ? "Class" : "Free"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommitmentItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/60">
      <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
      <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
    </div>
  );
}

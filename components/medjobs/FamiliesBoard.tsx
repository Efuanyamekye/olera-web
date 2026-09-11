"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";
import ScheduleInterviewModal from "@/components/medjobs/ScheduleInterviewModal";
import BrowseCard from "@/components/browse/BrowseCard";
import StudentEligibilityModal from "@/components/medjobs/StudentEligibilityModal";
import { STUDENT_AGREEMENT_URL } from "@/lib/medjobs/student-eligibility";
import { SAMPLE_FAMILIES } from "@/lib/medjobs/demo-family";
import Pagination from "@/components/ui/Pagination";
import { PARTNER_UNIVERSITIES } from "@/lib/staffing-outreach/partner-universities";
import type { FamilyCard } from "@/app/api/medjobs/families/route";

const PAGE_SIZE = 12;

// Explore Job Options — care types a student can filter by. Only the ones with
// at least one job in the current catchment are shown.
const CARE_OPTIONS = [
  { label: "Memory Care", kw: "memory", image: "/images/memory-care.jpg" },
  { label: "Home Care", kw: "home care", image: "/images/home-care.jpg" },
  { label: "Assisted Living", kw: "assisted", image: "/images/assisted-living.jpg" },
  { label: "Skilled Nursing", kw: "nursing", image: "/images/nursing-home.jpg" },
  { label: "Home Health Care", kw: "home health", image: "/images/home-health.jpg" },
];

function cardMatches(c: FamilyCard, kw: string): boolean {
  const hay = `${c.primaryCategory} ${c.providerCategory ?? ""} ${(c.careTypes || []).join(" ")}`.toLowerCase();
  return hay.includes(kw);
}

// "Top" = evidence density (rating × log(reviews + 1)); newest order is the
// API fallback when ratings are sparse.
function evidenceScore(c: FamilyCard): number {
  return (c.rating || 0) * Math.log((c.reviewCount || 0) + 1);
}

interface StudentStatus {
  isLive: boolean;
  completeness: number | null;
  firstName: string | null;
}

function Board() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profiles, isLoading: authLoading, openAuth } = useAuth();

  const campusParam = searchParams?.get("campus") || "";
  const autoScreener = searchParams?.get("screener") === "1";
  const autoViewAllJobs = searchParams?.get("jobs") === "all";

  const [campus, setCampus] = useState<string>(campusParam);
  const [cards, setCards] = useState<FamilyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [careFilter, setCareFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);

  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);
  const [studentStatus, setStudentStatus] = useState<StudentStatus | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [modalTarget, setModalTarget] = useState<FamilyCard | null>(null);
  const [showScreener, setShowScreener] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const topJobsRef = useRef<HTMLDivElement>(null);
  const jobsDeepLinkRef = useRef(false);

  const campusName = PARTNER_UNIVERSITIES.find((u) => u.slug === campus)?.name ?? null;

  const fetchFamilies = useCallback(async (campusSlug: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ sort: "newest" });
      if (campusSlug) qs.set("campus", campusSlug);
      const res = await fetch(`/api/medjobs/families?${qs.toString()}`);
      const data = await res.json();
      setCards(data.cards || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchFamilies(campus);
  }, [campus, fetchFamilies]);

  // Auth → capture student profile + status (drives the note variant).
  useEffect(() => {
    if (authLoading) return;
    const studentProfile = profiles?.find((p) => p.type === "student");
    if (!studentProfile) {
      setStudentProfileId(null);
      setStudentStatus(null);
      return;
    }
    setStudentProfileId(studentProfile.id);
    fetchExistingInterviews();
    fetchStudentStatus(studentProfile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profiles]);

  // Open the screener for an anon arrival with ?screener=1 (reacts to the
  // param so the marketing "Apply" buttons can trigger it via navigation).
  useEffect(() => {
    if (authLoading) return;
    if (autoScreener && !studentProfileId) setShowScreener(true);
  }, [autoScreener, authLoading, studentProfileId]);

  // Deep link from the footer "Find Jobs" (?jobs=all): expand the Top Jobs grid
  // (the "View all jobs" state) and scroll to it once the feed has loaded.
  useEffect(() => {
    if (jobsDeepLinkRef.current) return;
    if (authLoading || loading || !autoViewAllJobs) return;
    jobsDeepLinkRef.current = true;
    setExpanded(true);
    setPage(1);
    // Wait for the expanded grid to paint before measuring the scroll target.
    const t = setTimeout(() => {
      topJobsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(t);
  }, [autoViewAllJobs, authLoading, loading]);

  const fetchStudentStatus = async (profileId: string) => {
    try {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await sb
        .from("business_profiles")
        .select("is_active, display_name, metadata")
        .eq("id", profileId)
        .single();
      if (!data) return;
      const meta = (data.metadata || {}) as Record<string, unknown>;
      setStudentStatus({
        isLive: !!data.is_active,
        completeness: typeof meta.profile_completeness === "number" ? meta.profile_completeness : null,
        firstName: (data.display_name || "").trim().split(" ")[0] || null,
      });
      if (!campus && typeof meta.campus === "string") setCampus(meta.campus);
    } catch {
      /* note falls back to generic copy */
    }
  };

  const fetchExistingInterviews = async () => {
    try {
      const res = await fetch("/api/medjobs/interviews");
      if (!res.ok) return;
      const data = await res.json();
      const ids = new Set<string>();
      const active = ["proposed", "confirmed", "rescheduled", "completed"];
      for (const iv of data.interviews || []) {
        if (iv.proposed_by === iv.student_profile_id && active.includes(iv.status)) {
          ids.add(iv.provider_profile_id);
        }
      }
      setRequested(ids);
    } catch {
      /* ignore */
    }
  };

  const showSamples = !loading && cards.length === 0; // real replaces demo

  const noteVariant: "anon" | "not_live" | "live" = !studentProfileId
    ? "anon"
    : studentStatus?.isLive
      ? "live"
      : "not_live";

  // Care-filtered, "Top"-sorted set + the options that actually have jobs.
  const visibleCards = careFilter ? cards.filter((c) => cardMatches(c, careFilter)) : cards;
  // Program (claimed/requestable) agencies first, then by evidence density.
  const topCards = [...visibleCards].sort((a, b) => {
    if (!!a.isProgram !== !!b.isProgram) return a.isProgram ? -1 : 1;
    return evidenceScore(b) - evidenceScore(a);
  });
  const carouselCards = topCards.slice(0, 12); // the row is a preview; "View all" opens the rest
  const careLabel = CARE_OPTIONS.find((o) => o.kw === careFilter)?.label ?? null;
  const totalPages = Math.ceil(topCards.length / PAGE_SIZE);
  const pageCards = topCards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const onSelectOption = (kw: string) => {
    setCareFilter(kw);
    setPage(1);
    topJobsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Close the screener AND strip ?screener from the URL, so a later marketing
  // "Apply Now" (which pushes ?screener=1) re-triggers the open effect.
  const closeScreener = () => {
    setShowScreener(false);
    const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (params.has("screener")) {
      params.delete("screener");
      const qs = params.toString();
      router.replace(qs ? `/medjobs/families?${qs}` : "/medjobs/families", { scroll: false });
    }
  };

  // On successful eligibility (silent auth done), send the new student to their
  // portal — but only if a session is actually established, since /portal is
  // middleware-protected and would bounce a session-less visitor to "/".
  const handleScreenerComplete = async () => {
    try {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await sb.auth.getSession();
      if (data.session) {
        setShowScreener(false);
        // Land new students on Find Jobs (the catchment board), not the profile
        // tab — they see real local opportunities immediately, with the board's
        // own "complete your profile to apply" nudge.
        router.push("/portal/medjobs/jobs");
        return;
      }
    } catch {
      /* fall through to the safe default */
    }
    closeScreener();
  };

  const cardEl = (f: FamilyCard) => (
    <BrowseCard
      key={f.id}
      provider={f}
      variant="student"
      campus={campus || undefined}
      isRequested={requested.has(f.id)}
      canRequest={!!studentProfileId}
      requestLabel={studentStatus?.isLive ? "Request interview" : "Complete profile to apply →"}
      onRequestInterview={() => (studentProfileId ? setModalTarget(f) : setShowScreener(true))}
    />
  );

  return (
    <>
      {/* Hero — two-column, campus- and auth-aware */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-primary-50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 md:pt-12 md:pb-12">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left — copy */}
            <div>
              <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 leading-[1.1]">
                Get real healthcare experience
              </h1>
              <p className="mt-5 text-lg text-gray-500 leading-relaxed max-w-lg">
                Paid caregiving jobs for college students pursuing careers in medicine and nursing.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                {noteVariant === "anon" ? (
                  <button
                    type="button"
                    onClick={() => setShowScreener(true)}
                    className="inline-flex items-center px-7 py-3.5 bg-primary-600 text-white text-[15px] font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
                  >
                    Apply Now →
                  </button>
                ) : (
                  <Link
                    href="/portal/medjobs"
                    className="inline-flex items-center px-7 py-3.5 bg-primary-600 text-white text-[15px] font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
                  >
                    {noteVariant === "not_live"
                      ? `Complete your application${typeof studentStatus?.completeness === "number" ? ` · ${studentStatus.completeness}%` : ""}`
                      : "View your applications"}
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                )}
                <a
                  href="#how-it-works"
                  className="inline-flex items-center px-5 py-3.5 text-gray-500 text-[15px] font-medium hover:text-gray-900 transition-colors"
                >
                  See how it works
                  <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </a>
              </div>
              {/* Founder attribution */}
              <div className="mt-6 flex items-center gap-2.5">
                <Image
                  src="/images/for-providers/team/logan.jpg"
                  alt="Dr. Logan DuBose"
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover shadow-sm"
                />
                <p className="text-sm text-gray-500">
                  Co-Founded by Logan DuBose, MD &middot; GP &middot; Researcher
                </p>
              </div>
            </div>

            {/* Right — hero image with a floating universities card */}
            <div className="relative">
              <div className="aspect-[3/2] rounded-3xl overflow-hidden bg-gray-100 shadow-xl shadow-gray-900/10">
                <Image
                  src="/images/young-caregiver-hero.webp"
                  alt="Student caregiver sharing a warm moment with an elderly client at home"
                  width={800}
                  height={1000}
                  className="w-full h-full object-cover object-top"
                  priority
                />
              </div>
              <div className="absolute -bottom-4 -left-4 sm:-left-6 max-w-[88%] rounded-xl border border-primary-100 bg-white px-4 py-3 shadow-lg shadow-gray-900/10">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Students from
                </p>
                <div className="flex items-center gap-3">
                  {[
                    { name: "University of Houston", logo: "/images/medjobs/universities/houston.png" },
                    { name: "Texas A&M University", logo: "/images/medjobs/universities/texas-am.png" },
                    { name: "Prairie View A&M", logo: "/images/medjobs/universities/prairie-view.webp" },
                    { name: "University of Michigan", logo: "/images/medjobs/universities/michigan.png" },
                    { name: "University of Maryland", logo: "/images/medjobs/universities/maryland.png" },
                  ].map((uni) => (
                    <Image
                      key={uni.name}
                      src={uni.logo}
                      alt={uni.name}
                      width={120}
                      height={60}
                      className="h-6 w-auto object-contain opacity-80"
                    />
                  ))}
                  <span className="text-lg leading-none text-gray-300" aria-hidden="true">
                    …
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Status strip — signed-in students only (anon renders nothing) */}
        {noteVariant === "not_live" ? (
          <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700">
              Finish your application
              {typeof studentStatus?.completeness === "number" ? ` — ${studentStatus.completeness}%` : ""} to get
              hired and start earning healthcare experience.
            </p>
            <Link href="/portal/medjobs" className="shrink-0 text-sm font-semibold text-primary-700 hover:underline">
              Complete now →
            </Link>
          </div>
        ) : noteVariant === "live" ? (
          <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-gray-900">You&apos;re live near {campusName || "you"}.</span>{" "}
              Browse who&apos;s hiring below and request an interview when you find a fit.
            </p>
            <a
              href={STUDENT_AGREEMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm font-semibold text-primary-700 hover:underline"
            >
              Student Agreement ↗
            </a>
          </div>
        ) : null}

        {/* ── Top Jobs ── */}
        <div ref={topJobsRef} className="scroll-mt-20">
          {/* Header — always visible: title + campus filter on one row */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Top jobs near {campusName || "you"}
            </h2>
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">All providers</option>
              {PARTNER_UNIVERSITIES.map((u) => (
                <option key={u.slug} value={u.slug}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse" />
              ))}
            </div>
          ) : showSamples ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SAMPLE_FAMILIES.map((f) => (
                <BrowseCard key={f.id} provider={f} variant="student" isDemo />
              ))}
            </div>
          ) : topCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
              <p className="text-gray-500">
                No {careLabel ?? "matching"} jobs near {campusName || "you"} yet.
              </p>
              <button
                type="button"
                onClick={() => setCareFilter(null)}
                className="mt-3 text-sm font-semibold text-primary-700 hover:underline"
              >
                View all jobs →
              </button>
            </div>
          ) : expanded ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pageCards.map(cardEl)}
              </div>
              {totalPages > 1 && (
                <div className="mt-8">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={topCards.length}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={(p) => {
                      setPage(p);
                      topJobsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    itemLabel="jobs"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="relative">
              {carouselCards.length > 3 && (
                <>
                  <button
                    type="button"
                    aria-label="Scroll left"
                    onClick={() => carouselRef.current?.scrollBy({ left: -340, behavior: "smooth" })}
                    className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Scroll right"
                    onClick={() => carouselRef.current?.scrollBy({ left: 340, behavior: "smooth" })}
                    className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
                  >
                    ›
                  </button>
                </>
              )}
              <div
                ref={carouselRef}
                className="flex gap-4 overflow-x-auto pb-2 snap-x scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {carouselCards.map((f) => (
                  <div key={f.id} className="w-72 shrink-0 snap-start">
                    {cardEl(f)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom row — active filter label, clear, view all (right-aligned) */}
          {!loading && !showSamples && topCards.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
              {careFilter && (
                <>
                  <span className="text-gray-500">
                    Showing: <span className="font-medium text-gray-700">{careLabel}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCareFilter(null)}
                    className="font-medium text-gray-500 hover:text-gray-700"
                  >
                    Clear filter
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  // Signed-in students get the full Find Jobs board (map + cards);
                  // anon visitors expand the preview inline.
                  if (studentProfileId) {
                    router.push("/portal/medjobs/jobs");
                    return;
                  }
                  setExpanded((e) => !e);
                  setPage(1);
                }}
                className="font-semibold text-primary-700 hover:underline"
              >
                {expanded ? "Show less" : "View all jobs →"}
              </button>
            </div>
          )}
        </div>

        {/* ── Explore Job Options — all categories ── */}
        {!loading && cards.length > 0 && (
          <div className="mt-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5">Explore job options near {campusName || "you"}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
              {CARE_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => onSelectOption(o.kw)}
                  className="relative overflow-hidden rounded-2xl group aspect-[4/3] shadow-sm hover:shadow-lg transition-shadow duration-300 text-left"
                >
                  <Image src={o.image} alt={o.label} fill className="object-cover transition-transform duration-500 ease-out group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 flex items-end justify-between">
                    <h3 className="text-white font-bold text-base md:text-lg leading-tight">{o.label}</h3>
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:bg-white/25 transition-colors duration-300">
                      <svg className="w-4 h-4 text-white transition-transform duration-300 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {modalTarget && (
        <ScheduleInterviewModal
          providerProfileId={modalTarget.id}
          otherName={modalTarget.name}
          onClose={() => setModalTarget(null)}
          onScheduled={() => {
            setRequested((prev) => new Set(prev).add(modalTarget.id));
            setModalTarget(null);
          }}
        />
      )}

      {showScreener && (
        <StudentEligibilityModal
          context={{
            campusName,
            campusSlug: campus || null,
            universityName: searchParams?.get("uni") || campusName,
            demandCount: cards.length,
            referral: {
              campus: campus || null,
              partner_outreach_id: searchParams?.get("pid") || null,
              source: searchParams?.get("src") || null,
            },
          }}
          onClose={closeScreener}
          onComplete={handleScreenerComplete}
          onExistingUser={(email) => {
            // Close the screener (cleans up ?screener=1 from URL) and open auth flow
            // API already sent them a magic link — they can enter the OTP
            closeScreener();
            openAuth({
              defaultMode: "sign-in",
              initialEmail: email.toLowerCase(),
              headline: "Welcome back",
              subline: "We just sent you a sign-in code. Check your email.",
              // Deferred action ensures redirect to portal after successful auth
              deferred: {
                action: "student-return",
                returnUrl: "/portal/medjobs",
              },
            });
          }}
        />
      )}
    </>
  );
}

export default function FamiliesBoard() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <Board />
    </Suspense>
  );
}

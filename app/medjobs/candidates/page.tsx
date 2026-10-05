"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import DrDuBoseWelcome from "@/components/medjobs/DrDuBoseWelcome";
import ScheduleInterviewModal, { type JobDetails } from "@/components/medjobs/ScheduleInterviewModal";
import { getStudentTimezone } from "@/lib/medjobs/timezone";
import { DEMAND_PROFILE_KEY, type DemandProfile } from "@/lib/medjobs/eligibility";
import { REQUIREMENTS_KEY, type MedjobsRequirements } from "@/lib/medjobs/hiring-needs-questions";
import { createClient } from "@/lib/supabase/client";
import BrowseCard from "@/components/browse/BrowseCard";
import Pagination from "@/components/ui/Pagination";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import { candidateToCardFormat, candidateMatchLabel } from "@/lib/medjobs/candidate-card";
import type { CandidateData } from "@/components/medjobs/CandidateRow";
import RefreshAfterCheckout from "@/components/medjobs/RefreshAfterCheckout";
import { isMedjobsEligible } from "@/lib/medjobs/eligibility";
import EligibilityScreenerModal, { HIRE_PREFILL_KEY } from "@/components/medjobs/EligibilityScreenerModal";
import ProvidersMarketing from "@/components/medjobs/ProvidersMarketing";
import { SAMPLE_CANDIDATES } from "@/lib/medjobs/demo-candidate";
import { US_STATES } from "@/lib/power-pages";

const GRID_PAGE = 12;
// Session key so the university filter persists across navigation.
const UNIVERSITY_FILTER_KEY = "medjobs_university_filter";

// Explore-by-availability tiles — filter the board by when a candidate is free.
// Time-of-day keys map to metadata.availability_types; PRN/full-time map to
// their own fields (best-effort) so a tile never silently returns nothing.
const AVAILABILITY_TILES = [
  { label: "Days", value: "in_between_classes", image: "/images/home-care.jpg" },
  { label: "Evenings", value: "evenings", image: "/images/assisted-living.jpg" },
  { label: "Weekends", value: "weekends", image: "/images/memory-care.jpg" },
  { label: "Overnights", value: "overnights", image: "/images/nursing-home.jpg" },
  { label: "PRN", value: "prn", image: "/images/home-health.jpg" },
  { label: "Full-time", value: "full_time", image: "/images/medjobs/students-group.jpg" },
];
const AVAILABILITY_OPTIONS = [{ label: "All availability", value: "" }, ...AVAILABILITY_TILES.map((t) => ({ label: t.label, value: t.value }))];

function matchesAvailability(c: CandidateData, val: string): boolean {
  if (!val) return true;
  const meta = c.metadata;
  if (val === "prn") return !!meta.prn_willing;
  if (val === "full_time") return /30|40|full/i.test(meta.hours_per_week_range ?? "");
  return (meta.availability_types ?? []).includes(val);
}

interface University {
  id: string;
  name: string;
  state: string | null;
}

export default function CandidateBrowsePage() {
  return (
    <Suspense fallback={<div />}>
      <CandidateBrowseInner />
    </Suspense>
  );
}

function CandidateBrowseInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profiles, isLoading } = useAuth();

  const providerProfile = profiles?.find(
    (p) => p.type === "organization" || p.type === "caregiver"
  );
  const hasProviderProfile = !!providerProfile;
  const isEligible = isMedjobsEligible(
    (providerProfile?.metadata ?? null) as Record<string, unknown> | null
  );
  const matchBuckets = (
    (providerProfile?.metadata as Record<string, unknown> | undefined)?.[
      "medjobs_demand_profile"
    ] as { coverage_buckets?: string[] } | undefined
  )?.coverage_buckets;

  // Extract hiring defaults for interview metadata snapshot
  const providerMeta = (providerProfile?.metadata ?? {}) as Record<string, unknown>;
  const jobDetails = useMemo((): JobDetails | undefined => {
    const demand = providerMeta[DEMAND_PROFILE_KEY] as Partial<DemandProfile> | undefined;
    const requirements = providerMeta[REQUIREMENTS_KEY] as MedjobsRequirements | undefined;
    if (!demand && !requirements) return undefined;
    return {
      job_description: demand?.job_description,
      coverage_buckets: demand?.coverage_buckets,
      prn_open: demand?.prn_open,
      requirements,
    };
  }, [providerMeta]);

  const claimConflict = searchParams?.get("claim_conflict") === "1";
  // Cold-cadence link (Chunk 5): public board + ?outreach_id=...&screener=1.
  // Non-auth trigger that pre-locks the screener to the provider's listing.
  const outreachIdParam = searchParams?.get("outreach_id") ?? null;
  const screenerParam = searchParams?.get("screener") === "1";
  const autoOpenScreener =
    searchParams?.get("welcome") === "1" ||
    searchParams?.get("activate") === "1" ||
    screenerParam;
  const universityFromUrl = searchParams?.get("university") ?? null;
  const campusSlugParam = searchParams?.get("campus") ?? null;

  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);

  const [universities, setUniversities] = useState<University[]>([]);
  const [universityId, setUniversityId] = useState<string>("");
  const [geoState, setGeoState] = useState<string | null>(null);
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [showScreener, setShowScreener] = useState(false);
  // Track which mobile filter bottom sheet is open: null, "university", or "availability"
  const [mobileFilterOpen, setMobileFilterOpen] = useState<"university" | "availability" | null>(null);
  const [highlightFirst, setHighlightFirst] = useState(false);
  const firstCardRef = useRef<HTMLDivElement>(null);
  const [scheduleTarget, setScheduleTarget] = useState<CandidateData | null>(null);

  const initedRef = useRef(false);
  const geoTriedRef = useRef(false);
  const campusResolvedRef = useRef(false);
  const autoOpenedRef = useRef(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Universities for the dropdown.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("medjobs_universities")
      .select("id, name, state")
      .eq("is_active", true)
      .order("name")
      .then(({ data }: { data: University[] | null }) => {
        if (data) setUniversities(data);
      });
  }, []);

  // Initialize the university filter once: session > magic-link url > none.
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    let initial = "";
    try {
      const stored = sessionStorage.getItem(UNIVERSITY_FILTER_KEY);
      if (stored) initial = stored;
    } catch {
      /* sessionStorage unavailable */
    }
    if (!initial && universityFromUrl) initial = universityFromUrl;
    if (initial) {
      setUniversityId(initial);
      try {
        sessionStorage.setItem(UNIVERSITY_FILTER_KEY, initial);
      } catch {
        /* ignore */
      }
    }
  }, [universityFromUrl]);

  // Resolve a threaded campus slug (?campus=…) to a university id.
  useEffect(() => {
    if (!initedRef.current || campusResolvedRef.current) return;
    if (universityId || universityFromUrl || !campusSlugParam) return;
    campusResolvedRef.current = true;
    const supabase = createClient();
    supabase
      .from("medjobs_universities")
      .select("id")
      .eq("slug", campusSlugParam)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        if (data?.id) setUniversityId((cur) => cur || data.id);
      });
  }, [campusSlugParam, universityId, universityFromUrl]);

  // Geo auto-filter when nothing pinned the campus.
  useEffect(() => {
    if (!initedRef.current || geoTriedRef.current) return;
    if (universityId || universityFromUrl || campusSlugParam) return;
    geoTriedRef.current = true;
    fetch("/api/geo")
      .then((r) => r.json())
      .then((d: { state?: string | null }) => setGeoState(d?.state ?? null))
      .catch(() => {});
  }, [universityId, universityFromUrl, campusSlugParam]);

  // Resolve geo'd state → the active university in that state (soft default).
  useEffect(() => {
    if (!geoState || universities.length === 0) return;
    if (universityId || universityFromUrl || campusSlugParam) return;
    const abbr = geoState.trim().toUpperCase();
    const fullName = US_STATES[abbr]?.toLowerCase();
    const match = universities.find((u) => {
      const s = (u.state ?? "").trim();
      return s.toUpperCase() === abbr || (!!fullName && s.toLowerCase() === fullName);
    });
    if (match) setUniversityId((cur) => cur || match.id);
  }, [geoState, universities, universityId, universityFromUrl, campusSlugParam]);

  // Auto-open the screener for a ?welcome=1 / ?activate=1 arrival who isn't
  // eligible yet (anon or not-eligible provider).
  useEffect(() => {
    if (autoOpenedRef.current || isLoading) return;
    if (!autoOpenScreener || isEligible || claimConflict) return;
    autoOpenedRef.current = true;
    (async () => {
      // Cold link: resolve the provider's own directory listing and stash it as
      // the screener prefill so the org is pre-locked (they claim their listing,
      // not a duplicate). Best-effort — on failure the screener falls back to
      // manual search + the "Create new" path for genuinely new providers.
      if (outreachIdParam) {
        try {
          const res = await fetch(
            `/api/medjobs/outreach-org?outreach_id=${encodeURIComponent(outreachIdParam)}`,
          );
          if (res.ok) {
            const data = (await res.json()) as { org?: unknown };
            if (data.org) {
              sessionStorage.setItem(
                HIRE_PREFILL_KEY,
                JSON.stringify({ selectedOrg: data.org }),
              );
            }
          }
        } catch {
          /* ignore — screener handles the no-prefill case */
        }
      }
      setShowScreener(true);
    })();
  }, [autoOpenScreener, isEligible, claimConflict, isLoading, outreachIdParam]);

  const onUniversityChange = useCallback((id: string) => {
    setUniversityId(id);
    try {
      if (id) sessionStorage.setItem(UNIVERSITY_FILTER_KEY, id);
      else sessionStorage.removeItem(UNIVERSITY_FILTER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Pull the full catchment set once per campus; carousel/expand/availability
  // are all client-side (mirrors the student families board).
  const fetchCandidates = useCallback(async (uniId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: "newest", loadAll: "true" });
      if (uniId) params.set("universityId", uniId);
      const res = await fetch(`/api/medjobs/candidates?${params}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("[medjobs/candidates] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    setExpanded(false);
    fetchCandidates(universityId);
  }, [universityId, fetchCandidates]);

  const selectedUniversityName =
    universities.find((u) => u.id === universityId)?.name ?? null;
  const availabilityLabel = AVAILABILITY_TILES.find((t) => t.value === availabilityFilter)?.label ?? null;

  // Demo era (no real students yet) → fall back to curated samples so the
  // carousel / view-all / map all stay populated, exactly like real cards.
  const isDemoEra = !loading && candidates.length === 0;
  const baseCards = candidates.length > 0 ? candidates : SAMPLE_CANDIDATES;
  const topCards = availabilityFilter
    ? baseCards.filter((c) => matchesAvailability(c, availabilityFilter))
    : baseCards;
  const carouselCards = topCards.slice(0, 12);
  const totalPages = Math.ceil(topCards.length / GRID_PAGE);
  const pageCards = topCards.slice((page - 1) * GRID_PAGE, page * GRID_PAGE);

  const onCheckEligibility = useCallback(() => setShowScreener(true), []);
  const onReviewCandidates = useCallback(() => {
    firstCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightFirst(true);
    window.setTimeout(() => setHighlightFirst(false), 2200);
  }, []);
  // Schedule from a real candidate card. Anon/unclaimed providers are funneled
  // to claim/setup first (the screener), since scheduling requires an account.
  const openSchedule = useCallback(
    (c: CandidateData) => {
      if (hasProviderProfile) setScheduleTarget(c);
      else setShowScreener(true);
    },
    [hasProviderProfile],
  );

  // After the needs quiz, land the provider on the Hire Caregivers board (their
  // map-based workspace). The screener already established the session + wrote
  // eligibility, so we navigate straight there. We deliberately DON'T close the
  // modal or re-refresh first: closing it would briefly reveal this marketing
  // page before the hard navigation lands (the jank). Keeping the modal overlay
  // up until the document load replaces the page makes the transition seamless.
  // Hard nav (not router.push) so the gated route gets a fresh server auth read.
  const onScreenerComplete = useCallback(async () => {
    window.location.assign("/provider/medjobs/candidates");
  }, []);

  // Options for the polished Select dropdowns
  const universityOptions = [
    { value: "", label: "All universities" },
    ...universities.map((u) => ({ value: u.id, label: u.name })),
  ];
  const availabilityOptions = AVAILABILITY_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const cardEl = (c: CandidateData) =>
    isDemoEra ? (
      <BrowseCard
        key={c.id}
        provider={candidateToCardFormat(c, { isDemo: true })}
        variant="candidate"
        isDemo
        href={`/medjobs/candidates/${c.slug}`}
        ctaLabel="More details"
        onCta={() => router.push(`/medjobs/candidates/${c.slug}`)}
      />
    ) : (
      <BrowseCard
        key={c.id}
        provider={candidateToCardFormat(c)}
        variant="candidate"
        href={`/medjobs/candidates/${c.slug}`}
        matchLabel={candidateMatchLabel(matchBuckets, c) ?? undefined}
        ctaLabel="Schedule interview"
        onCta={() => openSchedule(c)}
      />
    );

  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <RefreshAfterCheckout />

      {/* Hero — anonymous visitors only; signed-in providers get the welcome
          banner inside the content area below. */}
      {!hasProviderProfile && (
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-primary-50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 md:pt-12 md:pb-12">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 leading-[1.1]">
                Need more caregivers?
                <br />
                <span className="text-primary-600">Hire college students</span>
              </h1>
              <p className="mt-5 text-lg text-gray-500 leading-relaxed max-w-lg">
                Future doctors, nurses, and healthcare professionals are seeking caregiving jobs.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                <button
                  type="button"
                  onClick={onCheckEligibility}
                  className="inline-flex items-center px-7 py-3.5 bg-primary-600 text-white text-[15px] font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
                >
                  Get started →
                </button>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center px-5 py-3.5 text-gray-500 text-[15px] font-medium hover:text-gray-900 transition-colors"
                >
                  How it works
                  <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </a>
              </div>
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

            <div className="relative">
              <div className="aspect-[3/2] rounded-3xl overflow-hidden bg-gray-100 shadow-xl shadow-gray-900/10">
                <Image
                  src="/images/medjobs/provider-caregiving.jpg"
                  alt="Student caregiver with a senior client"
                  width={800}
                  height={600}
                  className="w-full h-full object-cover"
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
                    <Image key={uni.name} src={uni.logo} alt={uni.name} width={120} height={60} className="h-6 w-auto object-contain opacity-80" />
                  ))}
                  <span className="text-lg leading-none text-gray-300" aria-hidden="true">…</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {hasProviderProfile && (
          <DrDuBoseWelcome
            campusName={selectedUniversityName}
            onReviewCandidates={onReviewCandidates}
          />
        )}
        {claimConflict && (
          <div className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/60 px-5 py-4">
            <h2 className="font-serif text-lg text-gray-900">
              This organization is already linked to another team member.
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-700">
              You can browse the board freely. To be added to the existing team account, email{" "}
              <a href="mailto:logan@olera.care" className="font-medium text-primary-700 hover:underline">
                logan@olera.care
              </a>{" "}
              and we&apos;ll handle it.
            </p>
          </div>
        )}

        {/* ── Top candidates ── */}
        <div ref={topRef} id="candidates" className="scroll-mt-20">
          {/* Header row — responsive: stacked on mobile, side-by-side on desktop */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
              Top candidates {selectedUniversityName ? `near ${selectedUniversityName}` : "near you"}
            </h2>

            {/* Mobile: Two explicit filter buttons that open bottom sheets */}
            <div className="flex items-center gap-2 sm:hidden">
              <button
                onClick={() => setMobileFilterOpen("university")}
                className={`flex-1 flex items-center justify-between px-3 py-2.5 bg-white border rounded-xl text-sm transition-colors ${
                  universityId ? "border-primary-300 text-primary-700" : "border-gray-200 text-gray-700"
                }`}
              >
                <span className="truncate">
                  {universityId
                    ? universities.find((u) => u.id === universityId)?.name || "University"
                    : "All universities"}
                </span>
                <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={() => setMobileFilterOpen("availability")}
                className={`flex-1 flex items-center justify-between px-3 py-2.5 bg-white border rounded-xl text-sm transition-colors ${
                  availabilityFilter ? "border-primary-300 text-primary-700" : "border-gray-200 text-gray-700"
                }`}
              >
                <span className="truncate">{availabilityFilter ? availabilityLabel : "All availability"}</span>
                <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Desktop: Inline dropdowns */}
            <div className="hidden sm:flex shrink-0 items-center gap-3">
              <div className="w-44">
                <Select
                  options={universityOptions}
                  value={universityId}
                  onChange={onUniversityChange}
                  placeholder="All universities"
                  ariaLabel="Filter by university"
                  size="sm"
                  searchable={universities.length > 8}
                  searchPlaceholder="Search universities..."
                />
              </div>
              <div className="w-40">
                <Select
                  options={availabilityOptions}
                  value={availabilityFilter}
                  onChange={setAvailabilityFilter}
                  placeholder="All availability"
                  ariaLabel="Filter by availability"
                  size="sm"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse" />
              ))}
            </div>
          ) : topCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
              <p className="text-gray-500">
                No {availabilityLabel ? availabilityLabel.toLowerCase() : "matching"} candidates near{" "}
                {selectedUniversityName || "you"} yet.
              </p>
              <button type="button" onClick={() => setAvailabilityFilter("")} className="mt-3 text-sm font-semibold text-primary-700 hover:underline">
                View all candidates →
              </button>
            </div>
          ) : expanded ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pageCards.map((c, i) => (
                  <div
                    key={c.id}
                    ref={i === 0 ? firstCardRef : undefined}
                    className={i === 0 && highlightFirst ? "rounded-2xl ring-2 ring-primary-500 ring-offset-2 transition" : undefined}
                  >
                    {cardEl(c)}
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-8">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={topCards.length}
                    itemsPerPage={GRID_PAGE}
                    onPageChange={(p) => {
                      setPage(p);
                      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    itemLabel="candidates"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="relative">
              {carouselCards.length > 3 && (
                <>
                  <button type="button" aria-label="Scroll left" onClick={() => carouselRef.current?.scrollBy({ left: -340, behavior: "smooth" })} className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50">‹</button>
                  <button type="button" aria-label="Scroll right" onClick={() => carouselRef.current?.scrollBy({ left: 340, behavior: "smooth" })} className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50">›</button>
                </>
              )}
              <div ref={carouselRef} className="flex gap-4 overflow-x-auto pb-2 snap-x scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {carouselCards.map((c, i) => (
                  <div
                    key={c.id}
                    ref={i === 0 ? firstCardRef : undefined}
                    className={`w-72 shrink-0 snap-start${i === 0 && highlightFirst ? " rounded-2xl ring-2 ring-primary-500 ring-offset-2" : ""}`}
                  >{cardEl(c)}</div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom row — active filter label, clear, view all (right-aligned) */}
          {!loading && topCards.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
              {availabilityFilter && (
                <>
                  <span className="text-gray-500">
                    Showing: <span className="font-medium text-gray-700">{availabilityLabel}</span>
                  </span>
                  <button type="button" onClick={() => setAvailabilityFilter("")} className="font-medium text-gray-500 hover:text-gray-700">
                    Clear filter
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  // Signed-in providers go to the full map-based Hire Caregivers
                  // board; anon visitors expand the preview inline.
                  if (hasProviderProfile) {
                    router.push("/provider/medjobs/candidates");
                    return;
                  }
                  setExpanded((e) => !e);
                  setPage(1);
                }}
                className="font-semibold text-primary-700 hover:underline"
              >
                {expanded ? "Show less" : "View all candidates →"}
              </button>
            </div>
          )}
        </div>

        {/* ── Explore candidates by availability ── */}
        {!loading && baseCards.length > 0 && (
          <div className="mt-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5">Explore candidates by availability</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
              {AVAILABILITY_TILES.map((t) => {
                const active = availabilityFilter === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setAvailabilityFilter(active ? "" : t.value);
                      setPage(1);
                      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`relative overflow-hidden rounded-2xl group aspect-[4/3] shadow-sm hover:shadow-lg transition-shadow duration-300 text-left ${active ? "ring-2 ring-primary-500" : ""}`}
                  >
                    <Image src={t.image} alt={t.label} fill className="object-cover transition-transform duration-500 ease-out group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 flex items-end justify-between">
                      <h3 className="text-white font-bold text-base md:text-lg leading-tight">{t.label}</h3>
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:bg-white/25 transition-colors duration-300">
                        <svg className="w-4 h-4 text-white transition-transform duration-300 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ProvidersMarketing />

      {showScreener && (
        <EligibilityScreenerModal
          providerProfileId={providerProfile?.id}
          campusName={selectedUniversityName}
          orgName={providerProfile?.display_name ?? null}
          onClose={() => setShowScreener(false)}
          onComplete={onScreenerComplete}
        />
      )}

      {scheduleTarget && (
        <ScheduleInterviewModal
          studentProfileId={scheduleTarget.id}
          otherName={scheduleTarget.display_name}
          onClose={() => setScheduleTarget(null)}
          onScheduled={() => setScheduleTarget(null)}
          jobDetails={jobDetails}
          studentAvailability={scheduleTarget.metadata?.availability_schedule}
          studentTimezone={getStudentTimezone(scheduleTarget.metadata)}
        />
      )}

      {/* Mobile: University filter bottom sheet */}
      <Modal
        isOpen={mobileFilterOpen === "university"}
        onClose={() => setMobileFilterOpen(null)}
        title="University"
        size="lg"
      >
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              onUniversityChange("");
              setMobileFilterOpen(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              !universityId
                ? "bg-primary-100 text-primary-700 border-2 border-primary-400"
                : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
            }`}
          >
            All universities
          </button>
          {universities.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onUniversityChange(u.id);
                setMobileFilterOpen(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                universityId === u.id
                  ? "bg-primary-100 text-primary-700 border-2 border-primary-400"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>
      </Modal>

      {/* Mobile: Availability filter bottom sheet */}
      <Modal
        isOpen={mobileFilterOpen === "availability"}
        onClose={() => setMobileFilterOpen(null)}
        title="Availability"
        size="lg"
      >
        <div className="flex flex-wrap gap-2 pt-2">
          {AVAILABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value || "all"}
              type="button"
              onClick={() => {
                setAvailabilityFilter(opt.value);
                setMobileFilterOpen(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                availabilityFilter === opt.value
                  ? "bg-primary-100 text-primary-700 border-2 border-primary-400"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Modal>
    </main>
  );
}

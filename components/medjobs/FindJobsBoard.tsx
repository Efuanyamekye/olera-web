"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import BrowseCard from "@/components/browse/BrowseCard";
import ScheduleInterviewModal from "@/components/medjobs/ScheduleInterviewModal";
import ProviderBottomSheet from "@/components/medjobs/ProviderBottomSheet";
import Pagination from "@/components/ui/Pagination";
import { useNavbar } from "@/components/shared/NavbarContext";
import { PARTNER_UNIVERSITIES } from "@/lib/staffing-outreach/partner-universities";
import { getTimezoneBySlug } from "@/lib/medjobs/timezone";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import type { ProviderCard } from "@/app/api/medjobs/providers/route";
import type { StudentMetadata } from "@/lib/types";

/**
 * FindJobsBoard — the signed-in student's "Find Jobs" board at
 * /portal/medjobs/find-jobs. The student mirror of the provider Hire Caregivers
 * board: MedJobs-interested providers on a map + "Request interview."
 *
 * Two tabs:
 * - "Near You" (default) — Providers in the student's campus catchment
 * - "All Providers" — All MedJobs providers nationwide
 *
 * When "Near You" is empty, shows an illustration with "No providers in your
 * area yet" and displays the "All Providers" section below.
 */

const BrowseMap = dynamic(() => import("@/components/browse/BrowseMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 rounded-2xl animate-pulse flex items-center justify-center">
      <span className="text-sm text-gray-400">Loading map...</span>
    </div>
  ),
});

type TabType = "near" | "all";

const PAGE_SIZE = 12;

interface StudentInfo {
  profileId: string | null;
  isLive: boolean;
  completeness: number;
  campus: string;
}

// ---------------------------------------------------------------------------
// Empty State Component
// ---------------------------------------------------------------------------

function NearYouEmptyState({
  onViewAll,
  hasCampus,
}: {
  onViewAll: () => void;
  hasCampus: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
      {/* Illustration - simple icon-based */}
      <div className="mx-auto w-16 h-16 rounded-2xl bg-warm-100/60 border border-warm-200/50 flex items-center justify-center mb-5">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {hasCampus ? "No providers in your area yet" : "Set your campus first"}
      </h3>
      <p className="text-gray-500 text-sm max-w-sm mx-auto mb-5">
        {hasCampus
          ? "We're actively expanding to more locations. In the meantime, check out all available providers you can apply to."
          : "Complete your profile to see providers near your campus. Or browse all available providers."}
      </p>
      <button
        type="button"
        onClick={onViewAll}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors"
      >
        View all providers
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function FindJobsBoard() {
  const { profiles, isLoading: authLoading } = useAuth();
  const { disableAutoHide } = useNavbar();
  const studentProfile = profiles?.find((p) => p.type === "student");

  const [student, setStudent] = useState<StudentInfo>({
    profileId: null,
    isLive: false,
    completeness: 0,
    campus: "",
  });
  const [activeTab, setActiveTab] = useState<TabType>("near");
  const [nearProviders, setNearProviders] = useState<ProviderCard[]>([]);
  const [allProviders, setAllProviders] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ProviderCard | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderCard | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const fetchedRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Ensure navbar stays visible (sticky) on this page
  useEffect(() => {
    disableAutoHide();
  }, [disableAutoHide]);

  const campusName = PARTNER_UNIVERSITIES.find((u) => u.slug === student.campus)?.name ?? null;

  // Resolve the signed-in student's profile, live status, completeness, and home campus.
  useEffect(() => {
    if (authLoading) return;
    const sp = studentProfile;
    if (!sp) {
      setStudent({ profileId: null, isLive: false, completeness: 0, campus: "" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb
          .from("business_profiles")
          .select("is_active, display_name, email, phone, city, state, image_url, metadata")
          .eq("id", sp.id)
          .single();
        if (cancelled) return;
        const meta = (data?.metadata || {}) as StudentMetadata;
        const homeCampus = typeof meta.campus === "string" ? meta.campus : "";

        // Calculate completeness
        const hasPhoto = !!data?.image_url;
        const hasBasicInfo = {
          hasName: !!data?.display_name,
          hasEmail: !!data?.email,
          hasPhone: !!data?.phone,
          hasUniversity: !!meta.university,
          hasLocation: !!(data?.city && data?.state),
        };
        const completeness = calculateCompleteness(meta, hasPhoto, hasBasicInfo);

        setStudent({
          profileId: sp.id,
          isLive: !!data?.is_active,
          completeness,
          campus: homeCampus,
        });
      } catch {
        if (!cancelled) setStudent({ profileId: sp.id, isLive: false, completeness: 0, campus: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, studentProfile]);

  // Fetch existing interview requests to mark providers as "Requested"
  useEffect(() => {
    if (!student.profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/medjobs/interviews");
        if (!res.ok) return;
        const data = await res.json();
        const ids = new Set<string>();
        const active = ["proposed", "confirmed", "rescheduled", "completed"];
        for (const iv of data.interviews || []) {
          // Student-initiated requests to providers
          if (iv.proposed_by === iv.student_profile_id && active.includes(iv.status)) {
            ids.add(iv.provider_profile_id);
          }
        }
        if (!cancelled) setRequested(ids);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student.profileId]);

  // Fetch providers when campus is resolved
  const fetchProviders = useCallback(async (campus: string) => {
    setLoading(true);
    try {
      // Fetch both near and all in parallel
      const [nearRes, allRes] = await Promise.all([
        fetch(`/api/medjobs/providers?campus=${encodeURIComponent(campus)}&scope=near`),
        fetch(`/api/medjobs/providers?scope=all`),
      ]);
      const [nearData, allData] = await Promise.all([nearRes.json(), allRes.json()]);
      setNearProviders(nearData.cards || []);
      setAllProviders(allData.cards || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    if (authLoading) return; // Wait for auth to resolve

    // If user has a student profile, wait for the profile data to load
    // (student.profileId will be set when the async fetch in the first effect completes)
    if (studentProfile && student.profileId !== studentProfile.id) {
      return; // Still loading student profile data
    }

    // Fetch providers regardless of sign-in status
    // - Signed in with campus: fetch for that campus
    // - Signed in without campus: fetch all (empty campus)
    // - Signed out: fetch all (empty campus)
    fetchedRef.current = true;
    fetchProviders(student.campus);
  }, [student.campus, student.profileId, studentProfile, authLoading, fetchProviders]);

  // Determine which providers to display based on active tab
  const displayProviders = activeTab === "near" ? nearProviders : allProviders;
  const mapCards = displayProviders.filter((p) => p.lat != null && p.lon != null);

  // Pagination
  const totalPages = Math.ceil(displayProviders.length / PAGE_SIZE);
  const pageProviders = displayProviders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Handle interview request
  const handleRequestInterview = (provider: ProviderCard) => {
    if (!student.profileId) {
      // Not signed in — redirect to auth
      window.location.href = "/portal/medjobs";
      return;
    }
    if (student.completeness < 100) {
      // Profile not complete — redirect to profile
      window.location.href = "/portal/medjobs";
      return;
    }
    // Profile is 100% complete — allow proceeding to schedule modal
    // Approval status will be checked at final submission step
    setScheduleTarget(provider);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-hidden">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
          Find Jobs
        </h1>
        <p className="text-gray-500 mt-1">
          Browse care providers hiring student caregivers
          {campusName ? ` near ${campusName}` : ""} and request interviews.
        </p>
      </div>

      {/* Profile completion banner — only show when profile is incomplete */}
      {student.profileId && student.completeness < 100 && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Complete your profile to apply ({student.completeness}% done)
            </p>
            <p className="text-sm text-gray-600">
              Finish your profile to start applying to providers.
            </p>
          </div>
          <Link
            href="/portal/medjobs"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Complete profile
          </Link>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => { setActiveTab("near"); setPage(1); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "near"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Near You
          {/* Only show count if we have a campus (otherwise we show empty state) */}
          {nearProviders.length > 0 && student.campus && (
            <span className="ml-1.5 text-xs text-gray-400">
              ({nearProviders.length})
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("all"); setPage(1); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "all"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          All Providers
          {allProviders.length > 0 && (
            <span className="ml-1.5 text-xs text-gray-400">
              ({allProviders.length})
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div ref={gridRef} className="scroll-mt-20">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse"
                />
              ))}
            </div>
          ) : displayProviders.length === 0 || (activeTab === "near" && !student.campus) ? (
            activeTab === "near" ? (
              <NearYouEmptyState
                onViewAll={() => { setActiveTab("all"); setPage(1); }}
                hasCampus={!!student.campus}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
                <p className="text-gray-500">
                  No providers available yet. Check back soon!
                </p>
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pageProviders.map((provider) => (
                  <div
                    key={provider.id}
                    onMouseEnter={() => setHoveredId(provider.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => {
                      // Cmd/ctrl-click always opens in new tab (let Link handle it)
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();

                      // Desktop (lg+): open profile in new tab
                      // Mobile: open bottom sheet for quick preview
                      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
                      if (isDesktop) {
                        // Include ctx=medjobs-student so server renders the "About this opportunity" section
                        const params = new URLSearchParams();
                        params.set("ctx", "medjobs-student");
                        if (student.campus) params.set("campus", student.campus);
                        const url = `/provider/${provider.slug}?${params.toString()}`;
                        window.open(url, "_blank");
                      } else {
                        setSelectedProvider(provider);
                      }
                    }}
                    className="rounded-2xl transition-shadow hover:shadow-md cursor-pointer"
                  >
                    <BrowseCard
                      provider={provider}
                      variant="student"
                      campus={student.campus || undefined}
                      showProviderName={true}
                      isRequested={requested.has(provider.id)}
                      canRequest={!!student.profileId}
                      requestLabel={
                        requested.has(provider.id)
                          ? "Requested"
                          : student.completeness >= 100
                          ? "Apply"
                          : "Complete profile to apply"
                      }
                      onRequestInterview={
                        requested.has(provider.id)
                          ? undefined
                          : () => handleRequestInterview(provider)
                      }
                    />
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-8">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={displayProviders.length}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={(p) => {
                      setPage(p);
                      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    itemLabel="providers"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Desktop: Sticky map */}
        <div className="hidden lg:block">
          <div className="sticky top-24 h-[calc(100vh-7rem)]">
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-sm border border-gray-200 isolate">
              <BrowseMap
                providers={mapCards}
                hoveredProviderId={hoveredId}
                onMarkerHover={setHoveredId}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Provider Bottom Sheet */}
      {selectedProvider && (
        <ProviderBottomSheet
          isOpen={!!selectedProvider}
          onClose={() => setSelectedProvider(null)}
          provider={selectedProvider}
          campus={student.campus || undefined}
          isRequested={requested.has(selectedProvider.id)}
          canRequest={!!student.profileId}
          requestLabel={
            requested.has(selectedProvider.id)
              ? "Interview Requested"
              : student.completeness >= 100
              ? "Apply"
              : "Complete profile to apply"
          }
          onRequestInterview={() => {
            if (requested.has(selectedProvider.id)) return;
            // Close sheet and open schedule modal
            const provider = selectedProvider;
            setSelectedProvider(null);
            handleRequestInterview(provider);
          }}
        />
      )}

      {/* Schedule Interview Modal */}
      {scheduleTarget && (
        <ScheduleInterviewModal
          providerProfileId={scheduleTarget.id}
          otherName={scheduleTarget.name}
          onClose={() => setScheduleTarget(null)}
          onScheduled={() => {
            // Add to requested set and close modal
            setRequested((prev) => new Set([...prev, scheduleTarget.id]));
            setScheduleTarget(null);
          }}
          studentTimezone={getTimezoneBySlug(student.campus)}
        />
      )}
    </div>
  );
}

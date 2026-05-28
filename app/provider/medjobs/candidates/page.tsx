"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import CandidateCard from "@/components/medjobs/CandidateCard";
import type { CandidateData } from "@/components/medjobs/CandidateRow";
import CandidateFilters, { DEFAULT_CANDIDATE_FILTERS } from "@/components/medjobs/CandidateFilters";
import type { CandidateFilterValues } from "@/components/medjobs/CandidateFilters";
import Pagination from "@/components/ui/Pagination";

const PAGE_SIZE = 12;

type FilterTab = "all" | "contacted";

export default function ProviderCandidateBrowsePage() {
  const { activeProfile, user } = useAuth();

  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<CandidateFilterValues>(DEFAULT_CANDIDATE_FILTERS);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  // Fetch existing interviews to know which candidates have been contacted
  useEffect(() => {
    if (!user) return;

    const fetchExistingInterviews = async () => {
      try {
        const res = await fetch("/api/medjobs/interviews");
        if (!res.ok) return;
        const data = await res.json();
        // Build set of student IDs that provider has already contacted
        // Exclude cancelled/no_show interviews so provider can re-schedule
        const contactedIds = new Set<string>();
        const activeStatuses = ["proposed", "confirmed", "rescheduled", "completed"];
        for (const interview of data.interviews || []) {
          // Only count active interviews initiated by the provider (provider → student)
          if (
            interview.proposed_by === interview.provider_profile_id &&
            activeStatuses.includes(interview.status)
          ) {
            contactedIds.add(interview.student_profile_id);
          }
        }
        setContacted(contactedIds);
      } catch {
        // Silently fail
      }
    };

    fetchExistingInterviews();
  }, [user]);

  const fetchCandidates = useCallback(
    async (page: number) => {
      setLoading(true);

      try {
        const params = new URLSearchParams({
          page: String(page - 1), // API uses 0-indexed pages
          pageSize: String(PAGE_SIZE),
          sort: filters.sort,
        });
        if (filters.city) params.set("city", filters.city);
        if (filters.state) params.set("state", filters.state);
        if (filters.track) params.set("programTrack", filters.track);
        if (filters.certifications.length > 0) {
          params.set("certifications", filters.certifications.join(","));
        }
        if (filters.availability.length > 0) {
          params.set("availability", filters.availability.join(","));
        }
        if (filters.hoursPerWeek) params.set("hoursPerWeek", filters.hoursPerWeek);
        if (filters.languages.length > 0) {
          params.set("languages", filters.languages.join(","));
        }
        if (filters.hasVideo) params.set("hasVideo", "true");

        const res = await fetch(`/api/medjobs/candidates?${params}`);
        const data = await res.json();

        setCandidates(data.candidates || []);
        setTotal(data.total || 0);
        setCurrentPage(page);
      } catch (err) {
        console.error("[provider/medjobs/candidates] fetch error:", err);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Initial load + filter changes
  useEffect(() => {
    fetchCandidates(1);
  }, [fetchCandidates]);

  const handleFilterChange = useCallback(
    (newFilters: CandidateFilterValues) => {
      setFilters(newFilters);
    },
    []
  );

  const handlePageChange = (page: number) => {
    fetchCandidates(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 font-display mb-0.5 lg:mb-1">
            Hire caregivers
          </h1>
          <p className="text-sm lg:text-[15px] text-gray-500">
            Pre-vetted students pursuing careers in healthcare — ready to provide quality care in your area
          </p>
        </div>

        {/* Tabs row */}
        <div className="border-b border-gray-200 mb-6">
          <div className="flex items-center justify-between">
            {/* Tabs */}
            <div className="flex items-center gap-6 lg:gap-8">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`relative pb-3 text-[15px] transition-colors ${
                  activeTab === "all"
                    ? "font-semibold text-gray-900"
                    : "font-normal text-gray-400 hover:text-gray-600"
                }`}
              >
                All{total > 0 ? ` (${total})` : ""}
                {activeTab === "all" && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("contacted")}
                className={`relative pb-3 text-[15px] transition-colors ${
                  activeTab === "contacted"
                    ? "font-semibold text-gray-900"
                    : "font-normal text-gray-400 hover:text-gray-600"
                }`}
              >
                Contacted{contacted.size > 0 ? ` (${contacted.size})` : ""}
                {activeTab === "contacted" && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <CandidateFilters
          filters={filters}
          onChange={handleFilterChange}
          showSort
          totalResults={total}
        />

        {/* Results */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden animate-pulse"
              >
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-full bg-gray-100 shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-5 bg-gray-100 rounded w-2/3" />
                      <div className="h-4 bg-gray-50 rounded w-4/5" />
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="h-4 bg-gray-50 rounded w-3/4" />
                    <div className="h-4 bg-gray-50 rounded w-1/2" />
                  </div>
                  <div className="pt-4 border-t border-gray-100 flex justify-between">
                    <div className="h-4 bg-gray-100 rounded w-24" />
                    <div className="h-4 bg-gray-50 rounded w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">
              No caregivers found matching your filters.
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Try broadening your search or removing some filters.
            </p>
          </div>
        ) : (() => {
          // Filter candidates based on active tab
          const filteredCandidates = activeTab === "contacted"
            ? candidates.filter((c) => contacted.has(c.id))
            : candidates;

          if (filteredCandidates.length === 0 && activeTab === "contacted") {
            return (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm font-medium">
                  No candidates contacted yet.
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Browse caregivers and schedule interviews to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className="mt-4 inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  View all caregivers &rarr;
                </button>
              </div>
            );
          }

          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    basePath="/provider/medjobs/candidates"
                    isContacted={contacted.has(candidate.id)}
                  />
                ))}
              </div>

              {/* Pagination - only show for "All" tab */}
              {activeTab === "all" && totalPages > 1 && (
                <div className="mt-8">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={total}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={handlePageChange}
                    itemLabel="caregivers"
                  />
                </div>
              )}
            </>
          );
        })()}
      </div>
    </main>
  );
}

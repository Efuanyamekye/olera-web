"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import type { OrganizationMetadata } from "@/lib/types";
import { US_STATES } from "@/lib/us-states";
import { useClickOutside } from "@/hooks/use-click-outside";

interface VerificationSubmission {
  name: string;
  email?: string | null;
  role: string;
  phone?: string | null;
  notes?: string | null;
  // Legacy field for backwards compatibility
  affiliation?: string | null;
  submitted_at?: string;
  // New verification fields
  linkedin_url?: string | null;
  business_website_url?: string | null;
  manual_review_requested?: boolean;
}

interface VerificationAttempt {
  method: "email" | "linkedin" | "website" | "document";
  value: string;
  submitted_at: string;
  reason: string;
  claimer_name?: string;
  screenshot_urls?: {
    header?: string;
    experience?: string;
  };
  document_url?: string;
}

interface EmailOtpAttempt {
  email: string;
  fullName?: string;
  submitted_at: string;
  reason: string;
  otp_verified: boolean;
}

interface ProviderMetadata extends OrganizationMetadata {
  verification_submission?: VerificationSubmission;
  verification_attempts?: VerificationAttempt[];
  verification_attempt?: VerificationAttempt;
  email_otp_attempt?: EmailOtpAttempt;
  verification_method?: string;
  badge_approved?: boolean;
  badge_rejected?: boolean;
  auto_verified?: boolean;
  claim_trust_level?: "high" | "medium" | "low";
}

interface ClaimJourney {
  claim_source: "email" | "page" | "unknown";
  used_one_click: boolean;
  pre_claim_engagement: {
    email_clicks: number;
    inquiries_received: number;
    questions_answered: number;
  };
  first_engagement_at: string | null;
}

interface Provider {
  id: string;
  display_name: string;
  type: string;
  category: string | null;
  city: string | null;
  state: string | null;
  claim_state: string | null;
  verification_state: string;
  metadata: ProviderMetadata | null;
  created_at: string;
  updated_at: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  slug: string | null;
  claim_trust_level: "high" | "medium" | "low" | null;
  claim_trust_reason: string | null;
  source: string | null;
  claimer_email: string | null;
  claim_journey: ClaimJourney | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  administrator: "Administrator",
  executive_director: "Executive Director",
  office_manager: "Office Manager",
  marketing: "Marketing / Communications",
  staff: "Staff Member",
  other: "Other",
};

const METHOD_LABELS: Record<string, { label: string; icon: string }> = {
  email: { label: "Email OTP", icon: "✉️" },
  linkedin: { label: "LinkedIn", icon: "🔗" },
  website: { label: "Website", icon: "🌐" },
  document: { label: "Document", icon: "📄" },
  "badge-request": { label: "Badge Request", icon: "🎖️" },
};

type StatusFilter = "unverified_claims" | "pending" | "approved" | "rejected";

const PAGE_SIZE = 50;

const TRUST_OPTIONS = [
  { value: "high", label: "High trust" },
  { value: "medium", label: "Medium trust" },
  { value: "low", label: "Low trust" },
  { value: "none", label: "Not scored" },
];

// ── Helper to format relative time ──

function formatDaysAgo(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return ""; // Future date edge case
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
}

// ── Filter Components ──

function StateSelectFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useClickOutside(containerRef, () => {
    setIsOpen(false);
    setSearch("");
  }, isOpen);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const filteredStates = search
    ? US_STATES.filter(
        (s) =>
          s.label.toLowerCase().includes(search.toLowerCase()) ||
          s.value.toLowerCase().includes(search.toLowerCase())
      )
    : US_STATES;

  const selectedLabel = value
    ? US_STATES.find((s) => s.value === value)?.label || value
    : "State";

  const handleSelect = (stateValue: string) => {
    onChange(stateValue);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center justify-between gap-2 px-3 py-2
          bg-white border rounded-lg text-sm font-medium
          transition-all min-w-[120px]
          ${value
            ? "border-primary-400 text-gray-900"
            : "border-gray-200 text-gray-500 hover:border-gray-300"
          }
          ${isOpen ? "ring-2 ring-primary-100 border-primary-400" : ""}
        `}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search states..."
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 placeholder:text-gray-400"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {value && (
              <button
                type="button"
                onClick={() => handleSelect("")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                Clear selection
              </button>
            )}

            {filteredStates.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">
                No states found
              </div>
            ) : (
              filteredStates.map((state) => (
                <button
                  key={state.value}
                  type="button"
                  onClick={() => handleSelect(state.value)}
                  className={`
                    w-full px-3 py-2.5 text-left text-sm transition-colors
                    ${value === state.value
                      ? "bg-primary-50 text-primary-700 font-medium"
                      : "text-gray-900 hover:bg-gray-50"
                    }
                  `}
                >
                  {state.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TrustSelectFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const selectedOption = TRUST_OPTIONS.find((o) => o.value === value);
  const selectedLabel = selectedOption?.label || "Trust level";

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center justify-between gap-2 px-3 py-2
          bg-white border rounded-lg text-sm font-medium
          transition-all min-w-[140px]
          ${value
            ? "border-primary-400 text-gray-900"
            : "border-gray-200 text-gray-500 hover:border-gray-300"
          }
          ${isOpen ? "ring-2 ring-primary-100 border-primary-400" : ""}
        `}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 w-48 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          {value && (
            <button
              type="button"
              onClick={() => handleSelect("")}
              className="w-full px-3 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              Clear selection
            </button>
          )}

          {TRUST_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`
                w-full px-3 py-2.5 text-left text-sm transition-colors
                ${value === option.value
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-gray-900 hover:bg-gray-50"
                }
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Pagination({ page, setPage, total, pageSize }: {
  page: number; setPage: (p: number) => void; total: number; pageSize: number;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
      <span className="text-xs text-gray-400">
        {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 0}
          className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
        >
          Previous
        </button>
        <button
          onClick={() => setPage(page + 1)}
          disabled={(page + 1) * pageSize >= total}
          className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function AdminVerificationPage() {
  const [filter, setFilter] = useState<StatusFilter>("unverified_claims");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [trustFilter, setTrustFilter] = useState("");
  const [tabCounts, setTabCounts] = useState<Record<StatusFilter, number>>({
    unverified_claims: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchChange = (value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(0);
      setSearch(value);
    }, 300);
  };

  const openProviderModal = (provider: Provider) => {
    setActionError(null);
    setSelectedProvider(provider);
  };

  const clearSearch = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setPage(0);
    setSearch("");
  };

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/verification?counts_only=true");
      if (res.ok) {
        const data = await res.json();
        if (data.counts) {
          setTabCounts(data.counts);
        }
      }
    } catch (err) {
      console.error("Failed to fetch counts:", err);
    }
  }, []);

  // Fetch counts on mount
  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = page * PAGE_SIZE;
      const params = new URLSearchParams({
        status: filter,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search.trim()) params.set("search", search.trim());
      if (stateFilter) params.set("state", stateFilter);
      if (trustFilter) params.set("trust_level", trustFilter);
      const res = await fetch(`/api/admin/verification?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers ?? []);
        setTotal(data.total ?? 0);
      } else {
        setError("Failed to load verification requests. Please try again.");
      }
    } catch (err) {
      console.error("Failed to fetch providers:", err);
      setError("Failed to load verification requests. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [filter, page, search, stateFilter, trustFilter]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const filters: { label: string; value: StatusFilter }[] = [
    { label: "Unverified Claims", value: "unverified_claims" },
    { label: "Awaiting Review", value: "pending" },
    { label: "Verified", value: "approved" },
    { label: "Rejected", value: "rejected" },
  ];

  async function handleAction(id: string, action: "approve" | "reject" | "unclaim") {
    setActionLoading(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/verification/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setProviders((prev) => {
          const updated = prev.filter((p) => p.id !== id);
          // If current page becomes empty and we're not on page 0, go back to page 0
          if (updated.length === 0 && page > 0) {
            setPage(0);
          }
          return updated;
        });
        setTotal((prev) => prev - 1);
        setSelectedProvider(null);
        // Refresh tab counts after action
        fetchCounts();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || `Failed to ${action} badge. Please try again.`);
      }
    } catch (err) {
      console.error("Action failed:", err);
      setActionError(`Failed to ${action} badge. Please check your connection.`);
    } finally {
      setActionLoading(null);
    }
  }

  // Get verification submission from metadata (supports both old and new flows)
  function getVerificationSubmission(provider: Provider): VerificationSubmission | null {
    const metadata = provider.metadata;

    // Old flow: verification_submission exists
    if (metadata?.verification_submission) {
      return metadata.verification_submission;
    }

    // New flow: extract info from verification_attempts or email_otp_attempt
    const attempts = metadata?.verification_attempts;
    const emailOtpAttempt = metadata?.email_otp_attempt;

    // Try to build a submission-like object from new flow data
    if (attempts && attempts.length > 0) {
      // Get the most recent attempt
      const latestAttempt = attempts[attempts.length - 1];
      return {
        name: latestAttempt.claimer_name || "Unknown",
        email: latestAttempt.value?.includes("@") ? latestAttempt.value : null,
        role: "unknown",
        submitted_at: latestAttempt.submitted_at,
      };
    }

    if (emailOtpAttempt) {
      return {
        name: emailOtpAttempt.fullName || "Unknown",
        email: emailOtpAttempt.email || null,
        role: "unknown",
        submitted_at: emailOtpAttempt.submitted_at,
      };
    }

    return null;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Provider Verification</h1>
        <p className="text-lg text-gray-600 mt-1">
          Manage provider claims and verification status. Review submissions, approve badges, and monitor verified providers.
        </p>
      </div>

      {/* Tabs - prominent, own row */}
      <div className="flex gap-2 mb-4">
        {filters.map((f) => {
          const count = tabCounts[f.value];
          const isActionable = f.value === "unverified_claims" || f.value === "pending";
          const showBadge = isActionable && count > 0;

          return (
            <button
              key={f.value}
              type="button"
              onClick={() => { setPage(0); setProviders([]); setLoading(true); setFilter(f.value); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                filter === f.value
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
              {showBadge ? (
                <span className={`px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                  filter === f.value
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {count}
                </span>
              ) : (
                <span className={`text-xs ${
                  filter === f.value ? "text-white/70" : "text-gray-400"
                }`}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + Filters - single row on desktop, wraps on mobile */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search - responsive width */}
        <div className="relative w-full sm:w-64">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by name or email..."
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
          {search && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* State filter */}
        <StateSelectFilter
          value={stateFilter}
          onChange={(v) => { setPage(0); setStateFilter(v); }}
        />

        {/* Trust filter */}
        <TrustSelectFilter
          value={trustFilter}
          onChange={(v) => { setPage(0); setTrustFilter(v); }}
        />

        {/* Clear filters - only when active */}
        {(stateFilter || trustFilter) && (
          <button
            onClick={() => {
              setPage(0);
              setStateFilter("");
              setTrustFilter("");
            }}
            className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {(() => {
        const hasActiveFilters = search || stateFilter || trustFilter;

        if (loading) {
          return (
            <div className="flex items-center justify-center py-12">
              <div className="text-lg text-gray-500">Loading...</div>
            </div>
          );
        }

        if (providers.length === 0) {
          return (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
                {hasActiveFilters ? (
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {hasActiveFilters
                  ? "No results found"
                  : filter === "unverified_claims"
                    ? "No unverified claims"
                    : filter === "pending"
                      ? "All caught up!"
                      : `No ${filter} badge requests`}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {hasActiveFilters
                  ? "Try adjusting your search or filters."
                  : filter === "unverified_claims"
                    ? "No claimed providers awaiting verification."
                    : filter === "pending"
                      ? "No badge requests waiting for review."
                      : `No providers with ${filter} badges.`}
              </p>
            </div>
          );
        }

        return null;
      })()}
      {!loading && providers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Provider</th>
                  {filter === "pending" && (
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Submitter</th>
                  )}
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Location</th>
                  {filter !== "pending" && filter !== "unverified_claims" && (
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                  )}
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    {filter === "pending" ? "Submitted" : filter === "unverified_claims" ? "Claimed" : "Updated"}
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providers.map((provider) => {
                  const submission = getVerificationSubmission(provider);
                  return (
                    <tr key={provider.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {provider.image_url ? (
                            <img
                              src={provider.image_url}
                              alt={provider.display_name}
                              className="w-10 h-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-sm font-medium">
                                {provider.display_name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <div>
                            {provider.slug ? (
                              <a
                                href={`/provider/${provider.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline"
                              >
                                {provider.display_name}
                              </a>
                            ) : (
                              <p className="text-sm font-medium text-gray-900">{provider.display_name}</p>
                            )}
                            <p className="text-xs text-gray-400">
                              {provider.type === "organization" ? "Organization" : "Caregiver"}
                              {provider.category && ` · ${provider.category.replace(/_/g, " ")}`}
                            </p>
                            {provider.claimer_email && (
                              <p className="text-xs text-gray-500">{provider.claimer_email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      {filter === "pending" && submission && (
                        <td className="px-6 py-4">
                          <button
                            onClick={() => openProviderModal(provider)}
                            className="text-left group"
                          >
                            <p className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                              {submission.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {ROLE_LABELS[submission.role] || submission.role}
                            </p>
                          </button>
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {[provider.city, provider.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      {filter !== "pending" && filter !== "unverified_claims" && (
                        <td className="px-6 py-4">
                          {filter === "approved" ? (
                            // Simplified badge system:
                            // - High Trust: High-trust email at claim time OR verification_state = "not_required"
                            // - Admin: Manual admin approval
                            // - Self-Verified: All self-verification methods (email, LinkedIn, website, document, auto)
                            // - Legacy: No verification method recorded
                            <div className="flex items-center gap-2">
                              <Badge variant="verified">Verified</Badge>
                              {provider.verification_state === "not_required" || provider.claim_trust_level === "high" ? (
                                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium whitespace-nowrap">
                                  High Trust
                                </span>
                              ) : provider.metadata?.verification_method === "admin_approval" ? (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                                  Admin
                                </span>
                              ) : provider.metadata?.auto_verified || provider.metadata?.verification_method ? (
                                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-medium whitespace-nowrap">
                                  Self-Verified
                                </span>
                              ) : (
                                <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded font-medium border border-gray-200">
                                  Legacy
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="rejected">Badge Rejected</Badge>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-500">
                          {filter === "pending" && submission?.submitted_at
                            ? new Date(submission.submitted_at).toLocaleDateString()
                            : new Date(provider.updated_at).toLocaleDateString()}
                        </p>
                        {filter === "unverified_claims" && (
                          <p className="text-xs text-gray-400">
                            {formatDaysAgo(provider.updated_at)}
                          </p>
                        )}
                        {filter === "pending" && (
                          <p className="text-xs text-gray-400">
                            {formatDaysAgo(submission?.submitted_at || provider.updated_at)}
                          </p>
                        )}
                        {filter === "approved" && (
                          <p className="text-xs text-gray-400">
                            {formatDaysAgo(provider.updated_at)}
                          </p>
                        )}
                        {filter === "rejected" && (
                          <p className="text-xs text-gray-400">
                            {formatDaysAgo(provider.updated_at)}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-nowrap gap-2 justify-end">
                          {filter === "unverified_claims" && (
                            <>
                              <button
                                onClick={() => openProviderModal(provider)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Details
                              </button>
                              <button
                                onClick={() => handleAction(provider.id, "approve")}
                                disabled={actionLoading === provider.id}
                                className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                              >
                                {actionLoading === provider.id ? "..." : "Verify"}
                              </button>
                            </>
                          )}
                          {filter === "pending" && (
                            <>
                              <button
                                onClick={() => openProviderModal(provider)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Details
                              </button>
                              <button
                                onClick={() => handleAction(provider.id, "approve")}
                                disabled={actionLoading === provider.id}
                                className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                              >
                                {actionLoading === provider.id ? "..." : "Approve"}
                              </button>
                              <button
                                onClick={() => handleAction(provider.id, "reject")}
                                disabled={actionLoading === provider.id}
                                className="px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                              >
                                {actionLoading === provider.id ? "..." : "Reject"}
                              </button>
                            </>
                          )}
                          {filter === "approved" && (
                            <>
                              <button
                                onClick={() => openProviderModal(provider)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Details
                              </button>
                              <button
                                onClick={() => handleAction(provider.id, "reject")}
                                disabled={actionLoading === provider.id}
                                className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {actionLoading === provider.id ? "..." : "Revoke"}
                              </button>
                            </>
                          )}
                          {filter === "rejected" && (
                            <>
                              <button
                                onClick={() => openProviderModal(provider)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                              >
                                Details
                              </button>
                              <button
                                onClick={() => handleAction(provider.id, "approve")}
                                disabled={actionLoading === provider.id}
                                className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {actionLoading === provider.id ? "..." : "Approve Badge"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} />
        </div>
      )}

      {/* Verification Review Modal */}
      {selectedProvider && (
        <VerificationReviewModal
          provider={selectedProvider}
          currentTab={filter}
          onClose={() => { setSelectedProvider(null); setActionError(null); }}
          onApprove={() => handleAction(selectedProvider.id, "approve")}
          onReject={() => handleAction(selectedProvider.id, "reject")}
          onUnclaim={() => handleAction(selectedProvider.id, "unclaim")}
          isLoading={actionLoading === selectedProvider.id}
          actionError={actionError}
        />
      )}
    </div>
  );
}

// ── Helper to check if provider has verification attempts ──

function hasVerificationAttempts(provider: Provider): boolean {
  const metadata = provider.metadata;
  if (!metadata) return false;

  const attempts = metadata.verification_attempts || [];
  const emailOtpAttempt = metadata.email_otp_attempt;

  return attempts.length > 0 || !!emailOtpAttempt;
}

// ── Verification Review Modal ──

interface VerificationReviewModalProps {
  provider: Provider;
  currentTab: StatusFilter;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onUnclaim: () => void;
  isLoading: boolean;
  actionError: string | null;
}

// Map source values to human-readable labels
const SOURCE_LABELS: Record<string, string> = {
  user_created: "Created new listing",
  claimed_from_directory: "Claimed from directory",
  self_service: "Instant claim",
  admin_seed: "Admin seeded",
  npi_sync: "NPI sync",
  medjobs_sync: "MedJobs sync",
};

// Map trust levels to display info
const TRUST_LEVEL_STYLES: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "text-blue-700 bg-blue-50" },
  medium: { label: "Medium", color: "text-amber-700 bg-amber-50" },
  low: { label: "Low", color: "text-red-700 bg-red-50" },
};

// ── Claim Journey Badges ──

function ClaimJourneyBadges({
  journey,
  sourceFallback,
}: {
  journey: ClaimJourney | null;
  sourceFallback: string | null;
}) {
  // Determine if we have meaningful journey data
  const hasJourneyData = journey && (
    journey.used_one_click ||
    journey.claim_source !== "unknown"
  );

  // If no journey data, fall back to showing the source label (old behavior)
  if (!hasJourneyData) {
    const sourceLabel = SOURCE_LABELS[sourceFallback || ""] || sourceFallback || "Unknown";
    return <p className="text-sm font-medium text-gray-900">{sourceLabel}</p>;
  }

  const totalInteractions =
    journey.pre_claim_engagement.email_clicks +
    journey.pre_claim_engagement.inquiries_received +
    journey.pre_claim_engagement.questions_answered;

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* Claim method badge */}
      {journey.used_one_click ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-purple-50 text-purple-700">
          <span>⚡</span> One-click claim
        </span>
      ) : journey.claim_source === "email" ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-blue-50 text-blue-700">
          <span>✉️</span> Email flow
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-teal-50 text-teal-700">
          <span>🌐</span> Page claim
        </span>
      )}

      {/* Pre-claim engagement badge */}
      {totalInteractions > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-amber-50 text-amber-700">
          <span>📊</span> {totalInteractions} pre-claim interaction{totalInteractions !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Empty State Message ──

function EmptyStateMessage({
  currentTab,
  isHighTrust,
  trustReason,
}: {
  currentTab: StatusFilter;
  isHighTrust: boolean;
  trustReason: string | null;
}) {
  // Determine appropriate message based on context
  const isUnverifiedClaim = currentTab === "unverified_claims";
  const isVerifiedTab = currentTab === "approved";

  let icon: React.ReactNode;
  let title: string;
  let description: string;

  if (isUnverifiedClaim) {
    // Unverified claim - hasn't submitted verification yet
    icon = (
      <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
    title = "No verification submitted yet";
    description = "This provider claimed their listing but hasn't started the verification process.";
  } else if (isVerifiedTab && isHighTrust) {
    // High-trust verified - no verification needed
    icon = (
      <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    );
    title = "High-trust claim — no verification required";
    description = trustReason || "Verified automatically based on trusted email domain.";
  } else {
    // Legacy record
    icon = (
      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    );
    title = "No verification details found";
    description = "This record may be from an older submission format.";
  }

  return (
    <div className="text-center py-8">
      <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
        isHighTrust && isVerifiedTab ? "bg-blue-50" : isUnverifiedClaim ? "bg-amber-50" : "bg-gray-100"
      }`}>
        {icon}
      </div>
      <p className="text-gray-700 text-sm font-medium">{title}</p>
      <p className="text-gray-500 text-xs mt-1 max-w-xs mx-auto">{description}</p>
    </div>
  );
}

// ── Pre-Claim Engagement Section ──

function PreClaimEngagementSection({ journey }: { journey: ClaimJourney | null }) {
  if (!journey) return null;

  const { email_clicks, inquiries_received, questions_answered } = journey.pre_claim_engagement;
  const hasEngagement = email_clicks > 0 || inquiries_received > 0 || questions_answered > 0;

  if (!hasEngagement) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="mb-6 pb-5 border-b border-gray-100">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Pre-Claim Engagement
      </p>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="grid grid-cols-3 gap-4 text-center mb-3">
          <div>
            <p className="text-2xl font-semibold text-gray-900">{email_clicks}</p>
            <p className="text-xs text-gray-500">Email clicks</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">{inquiries_received}</p>
            <p className="text-xs text-gray-500">Inquiries</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">{questions_answered}</p>
            <p className="text-xs text-gray-500">Q&A</p>
          </div>
        </div>
        {journey.first_engagement_at && (
          <p className="text-xs text-gray-500 text-center border-t border-gray-200 pt-2">
            First engagement: {formatDate(journey.first_engagement_at)}
          </p>
        )}
      </div>
    </div>
  );
}

function VerificationReviewModal({
  provider,
  currentTab,
  onClose,
  onApprove,
  onReject,
  onUnclaim,
  isLoading,
  actionError,
}: VerificationReviewModalProps) {
  const [showUnclaimConfirm, setShowUnclaimConfirm] = useState(false);
  const submission = provider.metadata?.verification_submission;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Determine modal title based on tab context
  const modalTitle = currentTab === "unverified_claims"
    ? "Claim Details"
    : currentTab === "approved"
      ? "Verified Provider"
      : currentTab === "rejected"
        ? "Rejected Provider"
        : "Review Badge Request";

  // Render footer buttons based on current tab
  const renderFooter = () => {
    switch (currentTab) {
      case "unverified_claims":
        // [Reject] [Verify]
        return (
          <div className="flex gap-3">
            <button
              onClick={onReject}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Processing..." : "Verify"}
            </button>
          </div>
        );
      case "pending":
        // [Reject] [Approve]
        return (
          <div className="flex gap-3">
            <button
              onClick={onReject}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Processing..." : "Approve"}
            </button>
          </div>
        );
      case "approved":
        // [Close] [Revoke Badge]
        return (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
            <button
              onClick={onReject}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Processing..." : "Revoke"}
            </button>
          </div>
        );
      case "rejected":
        // [Close] [Approve Badge]
        return (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
            <button
              onClick={onApprove}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Processing..." : "Approve Badge"}
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      footer={renderFooter()}
    >
      {/* Provider Info */}
      <div className="mb-6 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-4">
          {provider.image_url ? (
            <img
              src={provider.image_url}
              alt={provider.display_name}
              className="w-14 h-14 rounded-xl object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center">
              <span className="text-gray-400 text-lg font-semibold">
                {provider.display_name.charAt(0)}
              </span>
            </div>
          )}
          <div>
            {provider.slug ? (
              <a
                href={`/provider/${provider.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-semibold text-gray-900 hover:text-primary-600 hover:underline"
              >
                {provider.display_name}
              </a>
            ) : (
              <h3 className="text-lg font-semibold text-gray-900">{provider.display_name}</h3>
            )}
            <p className="text-sm text-gray-500">
              {provider.type === "organization" ? "Organization" : "Caregiver"}
              {provider.category && ` · ${provider.category.replace(/_/g, " ")}`}
            </p>
            <p className="text-sm text-gray-500">
              {[provider.city, provider.state].filter(Boolean).join(", ") || "No location"}
            </p>
          </div>
        </div>
      </div>

      {/* Claim Context - Shows entry point and trust reasoning */}
      <div className="mb-6 pb-5 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Claim Context
        </p>
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">Claimer Email</p>
              <p
                className="text-sm text-gray-700 truncate"
                title={provider.claimer_email || "Unknown"}
              >
                {provider.claimer_email || "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Entry Point</p>
              <ClaimJourneyBadges journey={provider.claim_journey} sourceFallback={provider.source} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Trust Level</p>
              {provider.claim_trust_level ? (
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${TRUST_LEVEL_STYLES[provider.claim_trust_level]?.color || "text-gray-600 bg-gray-100"}`}>
                  {TRUST_LEVEL_STYLES[provider.claim_trust_level]?.label || provider.claim_trust_level}
                </span>
              ) : (
                <p className="text-sm text-gray-500">Not scored</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Claim State</p>
              <p className="text-sm text-gray-700 capitalize">
                {provider.claim_state || "None"}
              </p>
            </div>
          </div>
          {provider.claim_trust_reason && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Trust Reason</p>
              <p className="text-sm text-gray-700">{provider.claim_trust_reason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Pre-Claim Engagement - Only show if there's engagement data */}
      <PreClaimEngagementSection journey={provider.claim_journey} />

      {/* Verification Attempts - Always show if they exist (regardless of submission) */}
      <VerificationAttemptsSection provider={provider} formatDate={formatDate} />

      {/* Submission Details */}
      {submission && (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {currentTab === "pending"
                ? "Verification Submission"
                : currentTab === "approved"
                  ? "Verification Record"
                  : currentTab === "rejected"
                    ? "Rejected Submission"
                    : "Badge Request Details"}
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Submitted by</p>
                  <p className="text-sm font-medium text-gray-900">{submission.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Role</p>
                  <p className="text-sm font-medium text-gray-900">
                    {ROLE_LABELS[submission.role] || submission.role}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {submission.email && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                    <p className="text-sm text-gray-700">{submission.email}</p>
                  </div>
                )}
                {submission.phone && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                    <p className="text-sm text-gray-700">{submission.phone}</p>
                  </div>
                )}
              </div>

              {submission.submitted_at && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Submitted</p>
                  <p className="text-sm text-gray-700">{formatDate(submission.submitted_at)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Verification Evidence */}
          {(submission.linkedin_url || submission.business_website_url || submission.manual_review_requested) && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Verification Evidence
              </p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                {submission.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <a
                      href={submission.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#0A66C2] hover:underline"
                    >
                      {submission.linkedin_url}
                    </a>
                  </div>
                )}
                {submission.business_website_url && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                    <a
                      href={submission.business_website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:underline"
                    >
                      {submission.business_website_url}
                    </a>
                  </div>
                )}
                {submission.manual_review_requested && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <span className="text-sm text-amber-700 font-medium">
                      Manual review requested — no LinkedIn or website provided
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Show notes (new field) or affiliation (legacy field) */}
          {(submission.notes || submission.affiliation) && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Additional Notes
              </p>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {submission.notes || submission.affiliation}
                </p>
              </div>
            </div>
          )}

          {/* Provider Contact Info */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Provider Contact
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              {provider.email && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <span className="text-gray-700">{provider.email}</span>
                </div>
              )}
              {provider.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  <span className="text-gray-700">{provider.phone}</span>
                </div>
              )}
              {provider.slug && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <a
                    href={`/provider/${provider.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700"
                  >
                    View public profile →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state - only show if NO submission AND NO verification attempts */}
      {!submission && !hasVerificationAttempts(provider) && (
        <EmptyStateMessage
          currentTab={currentTab}
          isHighTrust={provider.claim_trust_level === "high" || provider.verification_state === "not_required"}
          trustReason={provider.claim_trust_reason}
        />
      )}

      {/* Unclaim link - only for claimed providers */}
      {provider.claimer_email && (
        <div className="mt-8 pt-5 border-t border-gray-100 text-center">
          <button
            onClick={() => setShowUnclaimConfirm(true)}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
          >
            Need to remove this claim? <span className="underline">Unclaim provider</span>
          </button>
        </div>
      )}

      {/* Action error message */}
      {actionError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Unclaim Confirmation Dialog */}
      {showUnclaimConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Remove claim?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Remove <span className="font-medium">{provider.claimer_email}</span>&apos;s claim on{" "}
              <span className="font-medium">{provider.display_name}</span>?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              The listing will remain public but will be available for anyone to claim.
            </p>
            {actionError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowUnclaimConfirm(false)}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onUnclaim}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? "Processing..." : "Unclaim"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Verification Attempts Section ──

interface VerificationAttemptsSectionProps {
  provider: Provider;
  formatDate: (dateString: string) => string;
}

function VerificationAttemptsSection({ provider, formatDate }: VerificationAttemptsSectionProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const metadata = provider.metadata;
  const attempts = metadata?.verification_attempts || [];
  const emailOtpAttempt = metadata?.email_otp_attempt;

  // Combine all attempts into a unified list
  const allAttempts: Array<{
    type: "verification" | "email_otp";
    data: VerificationAttempt | EmailOtpAttempt;
  }> = [
    ...attempts.map((a) => ({ type: "verification" as const, data: a })),
    ...(emailOtpAttempt ? [{ type: "email_otp" as const, data: emailOtpAttempt }] : []),
  ];

  // Sort by submitted_at date
  allAttempts.sort((a, b) => {
    const dateA = new Date(a.data.submitted_at).getTime();
    const dateB = new Date(b.data.submitted_at).getTime();
    return dateB - dateA; // Most recent first
  });

  if (allAttempts.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Verification Attempts ({allAttempts.length})
        </p>
        <div className="space-y-3">
          {allAttempts.map((attempt, index) => {
            if (attempt.type === "email_otp") {
              const otp = attempt.data as EmailOtpAttempt;
              return (
                <div key={`otp-${index}`} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✉️</span>
                      <span className="text-sm font-semibold text-gray-900">Email OTP</span>
                      {otp.otp_verified && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                          OTP Verified
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDate(otp.submitted_at)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Email</p>
                      <p className="text-gray-700">{otp.email}</p>
                    </div>
                    {otp.fullName && (
                      <div>
                        <p className="text-xs text-gray-400">Name</p>
                        <p className="text-gray-700">{otp.fullName}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-amber-200">
                    <p className="text-xs text-gray-400">Result</p>
                    <p className="text-sm text-amber-700">{otp.reason}</p>
                  </div>
                </div>
              );
            }

            const v = attempt.data as VerificationAttempt;
            const methodInfo = METHOD_LABELS[v.method] || { label: v.method, icon: "📋" };

            return (
              <div key={`attempt-${index}`} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{methodInfo.icon}</span>
                    <span className="text-sm font-semibold text-gray-900">{methodInfo.label}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(v.submitted_at)}
                  </span>
                </div>

                {/* Verification details */}
                <div className="space-y-2 text-sm">
                  {v.claimer_name && (
                    <div>
                      <p className="text-xs text-gray-400">Claimer</p>
                      <p className="text-gray-700">{v.claimer_name}</p>
                    </div>
                  )}

                  {v.value && v.value !== "[document]" && (
                    <div>
                      <p className="text-xs text-gray-400">
                        {v.method === "linkedin" ? "LinkedIn URL" : v.method === "website" ? "Website URL" : "Value"}
                      </p>
                      {v.method === "linkedin" || v.method === "website" ? (
                        <a
                          href={v.value.startsWith("http") ? v.value : `https://${v.value}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline break-all"
                        >
                          {v.value}
                        </a>
                      ) : (
                        <p className="text-gray-700">{v.value}</p>
                      )}
                    </div>
                  )}

                  {/* Screenshots */}
                  {v.screenshot_urls && (v.screenshot_urls.header || v.screenshot_urls.experience) && (
                    <div className="pt-2">
                      <p className="text-xs text-gray-400 mb-2">Screenshots</p>
                      <div className="flex gap-3">
                        {v.screenshot_urls.header && (
                          <button
                            onClick={() => setExpandedImage(v.screenshot_urls!.header!)}
                            className="group relative"
                          >
                            <img
                              src={v.screenshot_urls.header}
                              alt="Profile header"
                              className="w-24 h-24 object-cover rounded-lg border border-gray-200 group-hover:border-primary-400 transition-colors"
                            />
                            <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                              Header
                            </span>
                          </button>
                        )}
                        {v.screenshot_urls.experience && (
                          <button
                            onClick={() => setExpandedImage(v.screenshot_urls!.experience!)}
                            className="group relative"
                          >
                            <img
                              src={v.screenshot_urls.experience}
                              alt="Experience section"
                              className="w-24 h-24 object-cover rounded-lg border border-gray-200 group-hover:border-primary-400 transition-colors"
                            />
                            <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                              Experience
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Document */}
                  {v.document_url && (
                    <div className="pt-2">
                      <p className="text-xs text-gray-400 mb-2">Document</p>
                      <a
                        href={v.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-primary-600 hover:bg-gray-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        View Document
                      </a>
                    </div>
                  )}

                  {/* Result reason */}
                  <div className="pt-2 mt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-400">Result</p>
                    <p className="text-sm text-gray-600">{v.reason}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={expandedImage}
              alt="Expanded screenshot"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProviderDashboardData } from "@/hooks/useProviderDashboardData";
import { useProviderDashboardV2Data } from "@/hooks/useProviderDashboardV2Data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { canEngage, getFreeConnectionsRemaining, FREE_CONNECTION_LIMIT } from "@/lib/membership";
import type { Profile, FamilyMetadata } from "@/lib/types";
import { type ExtendedMetadata } from "@/lib/profile-completeness";
import {
  type MatchesFilters,
  DEFAULT_FILTERS,
} from "@/components/provider/matches/MatchesFilterBar";
import FamilyMatchCard from "@/components/provider/matches/FamilyMatchCard";
import FiltersModal, { type FiltersState, DEFAULT_FILTERS_STATE, countActiveFilters, type SortOption } from "@/components/provider/matches/FiltersModal";
import MyOutreach from "@/components/provider/matches/MyOutreach";
import ReachOutDrawer from "@/components/provider/matches/ReachOutDrawer";
import ManagedAdsCTA from "@/components/provider/ManagedAdsCTA";
import ManagedAdsPitch from "@/components/provider/ManagedAdsPitch";

// Tab types for the matches view
type MatchesTab = "best_matches" | "near_you";
import Pagination from "@/components/ui/Pagination";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import { getCachedBoostState, cacheBoostState, type BoostStateResponse } from "@/lib/ad-boost/boost-state";
import { Star, Briefcase, LinkSimple, Check } from "@phosphor-icons/react";


// ── Timeline config ──

const TIMELINE_CONFIG: Record<string, { label: string; dot: string; glow: string; border: string; text: string; bg: string }> = {
  immediate: { label: "Immediate", dot: "bg-red-400", glow: "glowRed", border: "border-red-200", text: "text-red-600", bg: "bg-red-50/50" },
  within_1_month: { label: "Within 1 month", dot: "bg-amber-400", glow: "glowAmber", border: "border-amber-200", text: "text-amber-600", bg: "bg-amber-50/50" },
  within_3_months: { label: "Within 3 months", dot: "bg-blue-400", glow: "glowBlue", border: "border-blue-200", text: "text-blue-600", bg: "bg-blue-50/50" },
  exploring: { label: "Exploring", dot: "bg-warm-300", glow: "glowWarm", border: "border-warm-200", text: "text-gray-500", bg: "bg-warm-50/50" },
};


// ── Helpers ──

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function getFirstName(name: string): string {
  if (!name) return "User";
  return name.split(" ")[0];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function computeMatchingServices(
  familyNeeds: string[],
  providerServices: string[],
): number {
  if (!familyNeeds.length || !providerServices.length) return 0;
  const providerSet = new Set(providerServices.map((s) => s.toLowerCase()));
  return familyNeeds.filter((n) => providerSet.has(n.toLowerCase())).length;
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveTime(miles: number): string {
  const minutes = Math.round(miles / 0.5); // ~30 mph avg
  if (minutes < 1) return "1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

const URGENCY_ORDER: Record<string, number> = {
  immediate: 0,
  within_1_month: 1,
  within_3_months: 2,
  exploring: 3,
};

// Profile status type for inactive family handling
// - active: care post published and active
// - paused: care post paused (evaluating providers)
// - found_care: care post closed/deleted, account still exists (labeled "No Longer Searching")
// - deleted: profile/account deleted
type ProfileStatus = "active" | "paused" | "found_care" | "deleted";

function getProfileStatus(family: Profile): ProfileStatus {
  // First check if profile/account is deleted (is_active = false)
  if (family.is_active === false) return "deleted";

  const meta = family.metadata as FamilyMetadata;
  // Found care: has care_post_deleted flag (they deleted their care need)
  if (meta?.care_post_deleted && !meta?.care_post) return "found_care";
  // Paused: has care_post with paused status
  if (meta?.care_post?.status === "paused") return "paused";
  // Active: has care_post with active status
  if (meta?.care_post?.status === "active") return "active";
  // Default to found_care if no care_post exists (edge case)
  return "found_care";
}

const DEFAULT_NOTE_KEY = "olera_default_reachout_note";
const PAGE_SIZE = 12;

// ── Activity Tracking ──

function trackMatchesEvent(
  providerId: string,
  eventType:
    | "matches_page_viewed"
    | "matches_card_clicked"
    | "matches_message_generated"
    | "matches_outreach_sent"
    | "market_diagnostic_viewed_no_leads",
  metadata?: Record<string, unknown>
) {
  fetch("/api/activity/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actor_type: "provider",
      provider_id: providerId,
      event_type: eventType,
      metadata,
    }),
  }).catch(() => {
    // Fire-and-forget - don't block UI
  });
}

// ── Inline keyframes ──

const floatKeyframes = `
@keyframes matchFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes glowRed {
  0%, 100% { box-shadow: 0 0 3px 1px rgba(248,113,113,0.3); }
  50% { box-shadow: 0 0 8px 3px rgba(248,113,113,0.6); }
}
@keyframes glowAmber {
  0%, 100% { box-shadow: 0 0 3px 1px rgba(251,191,36,0.3); }
  50% { box-shadow: 0 0 8px 3px rgba(251,191,36,0.6); }
}
@keyframes glowBlue {
  0%, 100% { box-shadow: 0 0 3px 1px rgba(96,165,250,0.3); }
  50% { box-shadow: 0 0 8px 3px rgba(96,165,250,0.6); }
}
@keyframes glowWarm {
  0%, 100% { box-shadow: 0 0 3px 1px rgba(168,162,158,0.25); }
  50% { box-shadow: 0 0 8px 3px rgba(168,162,158,0.45); }
}
`;

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Discovery Banner (matches Profile page style)
// ---------------------------------------------------------------------------

function DiscoveryBanner({
  familyCount,
  firstName,
}: {
  familyCount: number;
  firstName: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-warm-950 md:min-h-[220px]">
      {/* Background image - hidden on mobile, fades into warm-950 on left */}
      <div
        className="absolute inset-0 hidden md:block"
        style={{
          backgroundImage: "url('/Matches-banner-image.png')",
          backgroundSize: "auto 140%",
          backgroundPosition: "right 30%",
          backgroundRepeat: "no-repeat",
          // Soft-fade into the warm-950 background
          maskImage: "linear-gradient(to right, transparent 0%, transparent calc(100% - 520px), black calc(100% - 320px), black 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, transparent calc(100% - 520px), black calc(100% - 320px), black 100%)",
        }}
      />

      {/* Dark gradient overlay for text readability */}
      <div
        className="absolute inset-0 hidden md:block"
        style={{
          background: `linear-gradient(to right,
            rgba(42, 24, 16, 0.96) 0%,
            rgba(42, 24, 16, 0.96) calc(100% - 480px),
            rgba(42, 24, 16, 0.7) calc(100% - 340px),
            rgba(42, 24, 16, 0.25) calc(100% - 160px),
            rgba(42, 24, 16, 0.08) 100%)`,
        }}
      />

      {/* Content */}
      <div className="relative px-6 py-5 md:px-9 md:py-7 max-w-[560px]">
        {/* Greeting */}
        <p className="font-serif italic text-[15px] md:text-[16px] text-warm-200/85 leading-snug mb-2">
          Hey {firstName}
        </p>

        {/* Headline */}
        <p className="font-display text-[20px] md:text-[24px] font-semibold text-white leading-[1.2] tracking-tight">
          {familyCount} {familyCount === 1 ? 'family is' : 'families are'} looking for care.
        </p>

        {/* Subline */}
        <p className="mt-2 text-sm text-warm-100/70 leading-relaxed">
          First to reach out is 3× more likely to connect.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches Tabs (replaces filter bar)
// ---------------------------------------------------------------------------

const TABS: { id: MatchesTab; label: string }[] = [
  { id: "best_matches", label: "Best Matches" },
  { id: "near_you", label: "Near You" },
];

function MatchesTabs({
  activeTab,
  onTabChange,
  activeFilterCount,
  onFiltersClick,
}: {
  activeTab: MatchesTab;
  onTabChange: (tab: MatchesTab) => void;
  activeFilterCount: number;
  onFiltersClick: () => void;
}) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex items-center justify-between">
        {/* Tabs */}
        <div className="flex items-center gap-6 lg:gap-8">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`relative pb-3 text-[15px] transition-colors ${
                  isActive
                    ? "font-semibold text-gray-900"
                    : "font-normal text-gray-400 hover:text-gray-600"
                }`}
              >
                {tab.label}
                {/* Active underline */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900" />
                )}
              </button>
            );
          })}
        </div>

        {/* Filters button - desktop */}
        <button
          type="button"
          onClick={onFiltersClick}
          className="hidden sm:flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-primary-600 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Chips (shows active filters with quick-clear)
// ---------------------------------------------------------------------------

// Label mappings for filter values
const FILTER_LABELS: Record<string, Record<string, string>> = {
  distance: {
    "25": "Within 25 mi",
    "50": "Within 50 mi",
    "100": "Within 100 mi",
  },
  urgency: {
    immediate: "ASAP",
    within_1_month: "Within 1 month",
    within_3_months: "Within 3 months",
    exploring: "Exploring",
  },
  careTypes: {
    home_care: "Home Care",
    memory_care: "Memory Care",
    assisted_living: "Assisted Living",
    nursing_home: "Nursing Home",
    independent_living: "Independent Living",
    hospice: "Hospice",
  },
  paymentMethods: {
    private_pay: "Private Pay",
    medicaid: "Medicaid",
    medicare: "Medicare",
    veterans_benefits: "Veterans Benefits",
    private_insurance: "Private Insurance",
  },
  whoNeedsCare: {
    myself: "Self",
    my_parent: "Parent",
    my_spouse: "Spouse",
    someone_else: "Other",
  },
  schedule: {
    mornings: "Mornings",
    afternoons: "Afternoons",
    evenings: "Evenings",
    overnight: "Overnight",
    full_time: "Full-time",
    flexible: "Flexible",
  },
  profileQuality: {
    complete: "Complete profiles",
  },
};

function FilterChips({
  filters,
  onRemove,
  onClearAll,
}: {
  filters: FiltersState;
  onRemove: (key: string, value: string) => void;
  onClearAll: () => void;
}) {
  const chips: { key: string; value: string; label: string }[] = [];

  // Distance
  if (filters.distance !== "any") {
    chips.push({
      key: "distance",
      value: filters.distance,
      label: FILTER_LABELS.distance[filters.distance] || filters.distance,
    });
  }

  // Urgency
  for (const value of filters.urgency) {
    chips.push({
      key: "urgency",
      value,
      label: FILTER_LABELS.urgency[value] || value,
    });
  }

  // Care Types
  for (const value of filters.careTypes) {
    chips.push({
      key: "careTypes",
      value,
      label: FILTER_LABELS.careTypes[value] || value,
    });
  }

  // Payment Methods
  for (const value of filters.paymentMethods) {
    chips.push({
      key: "paymentMethods",
      value,
      label: FILTER_LABELS.paymentMethods[value] || value,
    });
  }

  // Who Needs Care
  for (const value of filters.whoNeedsCare) {
    chips.push({
      key: "whoNeedsCare",
      value,
      label: FILTER_LABELS.whoNeedsCare[value] || value,
    });
  }

  // Schedule
  for (const value of filters.schedule) {
    chips.push({
      key: "schedule",
      value,
      label: FILTER_LABELS.schedule[value] || value,
    });
  }

  // Profile Quality
  if (filters.profileQuality !== "all") {
    chips.push({
      key: "profileQuality",
      value: filters.profileQuality,
      label: FILTER_LABELS.profileQuality[filters.profileQuality] || filters.profileQuality,
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      {chips.map((chip) => (
        <span
          key={`${chip.key}-${chip.value}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-full"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.key, chip.value)}
            className="p-0.5 -mr-0.5 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={`Remove ${chip.label} filter`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CheckCircleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function LocationIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  );
}

function PeopleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function MatchesSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-vanilla-50 via-white to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse">
        <div className="mb-8">
          <div className="h-8 w-32 bg-warm-100 rounded-lg mb-2.5" />
          <div className="h-4 w-96 bg-warm-50 rounded" />
        </div>
        <div className="flex items-center justify-between mb-6">
          <div className="h-11 w-[420px] bg-vanilla-50 border border-warm-100/60 rounded-xl" />
          <div className="h-5 w-32 bg-warm-50 rounded" />
        </div>
        <div className="h-16 bg-white rounded-2xl border border-warm-100/60 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-[14px] border border-warm-100/60 overflow-hidden">
                {/* Meta bar */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="h-3.5 w-36 bg-warm-50 rounded" />
                  <div className="h-3.5 w-28 bg-warm-50 rounded" />
                </div>

                <div className="p-5">
                  {/* Avatar + Name/Location */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-warm-100 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="h-5 w-32 bg-warm-100 rounded mb-1.5" />
                      <div className="h-3.5 w-24 bg-warm-50 rounded" />
                    </div>
                  </div>

                  {/* Inline specs */}
                  <div className="h-3.5 w-56 bg-warm-50 rounded mb-4" />

                  {/* Description */}
                  <div className="space-y-2 mb-4">
                    <div className="h-3.5 bg-warm-50 rounded w-full" />
                    <div className="h-3.5 bg-warm-50 rounded w-11/12" />
                    <div className="h-3.5 bg-warm-50 rounded w-3/4" />
                  </div>

                  {/* Timeline */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-warm-100" />
                    <div className="h-3.5 w-40 bg-warm-50 rounded" />
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <div className="h-7 w-24 bg-warm-50 rounded-lg" />
                    <div className="h-7 w-20 bg-warm-50 rounded-lg" />
                    <div className="h-7 w-28 bg-warm-50 rounded-lg" />
                  </div>

                  {/* Trust signals footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-warm-100/60">
                    <div className="h-3.5 w-28 bg-warm-50 rounded" />
                    <div className="h-3.5 w-32 bg-warm-50 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="lg:col-span-1">
            <div className="h-72 bg-warm-50/50 rounded-2xl border border-warm-100/60" />
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function MatchesEmptyState() {
  return (
    <div className="flex flex-col items-center text-center py-20 px-8">
        <div
          className="w-16 h-16 rounded-2xl bg-warm-100/60 border border-warm-200/50 flex items-center justify-center mb-6"
          style={{ animation: "matchFloat 3s ease-in-out infinite" }}
        >
          <PeopleIcon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-display font-bold text-gray-900">
          No families found yet
        </h3>
        <p className="text-[15px] text-gray-500 mt-2 leading-relaxed max-w-sm">
          When families publish care profiles matching your services and location,
          they&apos;ll appear here. Check back soon.
        </p>
        <div className="mt-8 w-full">
          <ManagedAdsCTA variant="empty" />
        </div>
      </div>
  );
}

// ---------------------------------------------------------------------------
// Near You Empty State (with growth actions)
// ---------------------------------------------------------------------------

function NearYouEmptyState({
  city,
  providerSlug,
}: {
  city: string;
  providerSlug: string;
}) {
  const [copied, setCopied] = useState(false);
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "https://olera.care";
  const profileUrl = `${siteOrigin}/provider/${providerSlug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = profileUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const actions = [
    {
      icon: Star,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
      title: "Collect Reviews",
      description: "Request reviews from your clients",
      href: "/provider/reviews",
      cta: "Get Reviews",
    },
    {
      icon: Briefcase,
      iconBg: "bg-sky-50",
      iconColor: "text-sky-500",
      title: "Hire Caregivers",
      description: "Find qualified care professionals",
      href: "/medjobs/candidates",
      cta: "Browse",
    },
    {
      icon: LinkSimple,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
      title: "Share Profile",
      description: "Get direct inquiries from families",
      onClick: handleCopyLink,
      cta: copied ? "Copied!" : "Copy Link",
      isCopied: copied,
    },
  ];

  return (
    <div className="py-8 px-4">
      {/* Illustration + Header */}
      <div className="text-center mb-6">
        <Image
          src="/Near-you-img.png"
          alt="No families nearby"
          width={120}
          height={120}
          className="mx-auto mb-4"
        />
        <h3 className="text-xl font-display font-bold text-gray-900 mb-1">
          No families in {city} yet
        </h3>
        <p className="text-base text-gray-500">
          While you wait, grow your presence on Olera
        </p>
      </div>

      {/* Managed Ads — the direct answer to an empty shelf: we'll go get families */}
      <ManagedAdsCTA variant="empty" />

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-8">
        {actions.map((action) => {
          const Icon = action.icon;
          const content = (
            <div className="bg-white border border-gray-200/80 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all group text-center">
              {/* Icon */}
              <div className={`w-9 h-9 rounded-xl ${action.iconBg} flex items-center justify-center mb-3 mx-auto`}>
                <Icon weight="fill" className={`w-[18px] h-[18px] ${action.iconColor}`} />
              </div>

              {/* Text */}
              <p className="text-[15px] font-semibold text-gray-900 mb-0.5">
                {action.title}
              </p>
              <p className="text-sm text-gray-500 leading-snug mb-3">
                {action.description}
              </p>

              {/* CTA */}
              <span className={`inline-flex items-center justify-center gap-1 text-sm font-semibold ${
                action.isCopied
                  ? "text-emerald-600"
                  : "text-primary-600 group-hover:text-primary-700"
              }`}>
                {action.isCopied && <Check weight="bold" className="w-3.5 h-3.5" />}
                {action.cta}
              </span>
            </div>
          );

          if (action.href) {
            return (
              <Link key={action.title} href={action.href}>
                {content}
              </Link>
            );
          }

          return (
            <button
              key={action.title}
              type="button"
              onClick={action.onClick}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Summary (prominent 2-column layout)
// ---------------------------------------------------------------------------

function ActivitySummary({
  totalFamilies,
  outreachSent,
  connections,
}: {
  totalFamilies: number;
  outreachSent: number;
  connections: number;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-display font-bold text-gray-900">
        At a glance
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Total Families */}
        <div className="space-y-1">
          <p className="font-display text-[32px] font-semibold text-gray-900 leading-none tabular-nums tracking-tight">
            {totalFamilies}
          </p>
          <p className="text-sm text-gray-500">families looking</p>
        </div>

        {/* Outreach / Connections */}
        <div className="space-y-1">
          {connections > 0 ? (
            <>
              <p className="font-display text-[32px] font-semibold text-gray-900 leading-none tabular-nums tracking-tight">
                {connections}
              </p>
              <p className="text-sm text-gray-500">
                {connections === 1 ? "connection" : "connections"}
              </p>
            </>
          ) : (
            <>
              <p className={`font-display text-[32px] font-semibold leading-none tabular-nums tracking-tight ${outreachSent === 0 ? "text-gray-300" : "text-gray-900"}`}>
                {outreachSent}
              </p>
              <p className="text-sm text-gray-500">outreach</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign tracker — shown at the top of Find Families for a provider running a
// live managed-ads campaign. Surfaces the same since-launch performance the
// Boost page tracks (visitors + families delivered) PLUS questions, which are
// campaign engagement too. The questions cell carries the action (unanswered +
// "Answer questions") since that's the thing the provider can act on right now.
// ---------------------------------------------------------------------------

function CampaignTrackerCard({
  stats,
}: {
  stats: NonNullable<BoostStateResponse["campaignStats"]>;
}) {
  const sinceLabel = new Date(stats.since).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const { questions } = stats;

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-5 lg:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
        </span>
        <p className="text-[13px] font-medium text-gray-500">
          Campaign live · since {sinceLabel}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-0.5">
          <p className="font-display text-[28px] font-semibold leading-none tabular-nums tracking-tight text-gray-900">
            {stats.visitors.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">
            {stats.visitors === 1 ? "Visitor" : "Visitors"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="font-display text-[28px] font-semibold leading-none tabular-nums tracking-tight text-gray-900">
            {stats.leads.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">
            {stats.leads === 1 ? "Family delivered" : "Families delivered"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="font-display text-[28px] font-semibold leading-none tabular-nums tracking-tight text-gray-900">
            {questions.received.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">
            {questions.received === 1 ? "Question" : "Questions"}
          </p>
          {questions.unanswered > 0 && (
            <p className="text-xs font-medium text-primary-600">
              {questions.unanswered} unanswered
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4">
        {questions.unanswered > 0 && (
          <Link
            href="/provider/qna"
            className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Answer questions →
          </Link>
        )}
        <Link
          href="/provider/boost"
          className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          View campaign →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module-level matches snapshot — survives client-side navigation within the
// SPA session (e.g. Find Families → "Answer questions" → /provider/qna → back).
// Lets a back-navigation repaint the last leads INSTANTLY from memory while a
// silent background refresh reconciles, instead of a cold MatchesSkeleton + a
// full re-fetch every time. Same pattern as the boost-state cache. A hard
// reload clears it (cold → skeleton, fine). TTL guards acting on stale data.
// ---------------------------------------------------------------------------
type ConnDatum = {
  id: string;
  message: string | null;
  created_at: string;
  status: "pending" | "accepted" | "declined" | "expired";
  reply_message?: string | null;
  replied_at?: string | null;
};
interface MatchesSnapshot {
  profileId: string;
  families: Profile[];
  contactedIds: Set<string>;
  respondedIds: Set<string>;
  connectionData: Map<string, ConnDatum>;
  totalCount: number;
  at: number;
}
let matchesSnapshot: MatchesSnapshot | null = null;
const MATCHES_SNAPSHOT_TTL_MS = 5 * 60_000;

/** The snapshot to seed initial state from — only when it belongs to this
 *  provider and is still fresh. null → cold load (skeleton + fetch). */
function readMatchesSnapshot(profileId: string | undefined): MatchesSnapshot | null {
  if (!profileId || !matchesSnapshot) return null;
  if (matchesSnapshot.profileId !== profileId) return null;
  if (Date.now() - matchesSnapshot.at > MATCHES_SNAPSHOT_TTL_MS) return null;
  return matchesSnapshot;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProviderMatchesPage() {
  const providerProfile = useProviderProfile();
  const { user, membership, refreshAccountData } = useAuth();
  const { metadata: dashboardMetadata } = useProviderDashboardData(providerProfile);
  // Fetch v2 data (reviews, response rate) for accurate profile completeness
  const v2 = useProviderDashboardV2Data("30d", true, user?.id);
  // Seed from the module snapshot when we already have fresh leads for this
  // provider (a within-session back-navigation), so the page paints instantly
  // instead of flashing the skeleton. Computed once; only the lazy useState
  // initializers below read it.
  const initialSnapshot = readMatchesSnapshot(providerProfile?.id);

  const [families, setFamilies] = useState<Profile[]>(() => initialSnapshot?.families ?? []);
  const [contactedIds, setContactedIds] = useState<Set<string>>(() => initialSnapshot?.contactedIds ?? new Set());
  const [respondedIds, setRespondedIds] = useState<Set<string>>(() => initialSnapshot?.respondedIds ?? new Set());
  const [reachOutCounts, setReachOutCounts] = useState<Map<string, number>>(new Map());
  // Full connection data for Reached Out tab cards
  const [connectionData, setConnectionData] = useState<Map<string, ConnDatum>>(
    () => initialSnapshot?.connectionData ?? new Map(),
  );
  const [archivedConnectionIds, setArchivedConnectionIds] = useState<Set<string>>(new Set());
  // No skeleton when we seeded fresh leads from the snapshot — paint them now,
  // refresh silently in the background.
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MatchesFilters>(DEFAULT_FILTERS);
  const [modalFilters, setModalFilters] = useState<FiltersState>(() => {
    // Load from localStorage on initial mount
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("olera_matches_filters");
        if (saved) {
          const parsed = JSON.parse(saved);
          // Validate the parsed object has expected shape
          if (parsed && typeof parsed === "object" && "distance" in parsed) {
            const merged = { ...DEFAULT_FILTERS_STATE, ...parsed };

            // Migrate old filter values to new values (Phase 2 rename)
            const PAYMENT_MIGRATIONS: Record<string, string> = {
              va_benefits: "veterans_benefits",
              long_term_care_insurance: "", // removed, clear it
              aid_attendance: "", // removed, clear it
            };
            const WHO_MIGRATIONS: Record<string, string> = {
              self: "myself",
              parent: "my_parent",
              spouse: "my_spouse",
              other: "someone_else",
            };

            // Migrate payment methods
            if (Array.isArray(merged.paymentMethods)) {
              merged.paymentMethods = merged.paymentMethods
                .map((v: string) => PAYMENT_MIGRATIONS[v] ?? v)
                .filter((v: string) => v !== "");
            }

            // Migrate who needs care
            if (Array.isArray(merged.whoNeedsCare)) {
              merged.whoNeedsCare = merged.whoNeedsCare
                .map((v: string) => WHO_MIGRATIONS[v] ?? v)
                .filter((v: string) => v !== "");
            }

            return merged;
          }
        }
      } catch {
        // Ignore parsing errors, use defaults
      }
    }
    return DEFAULT_FILTERS_STATE;
  });
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MatchesTab>("best_matches");

  const [sortOption, setSortOption] = useState<SortOption>("recommended");
  // Shared state for MyOutreach (syncs mobile + desktop instances)
  const [isOutreachOpen, setIsOutreachOpen] = useState(false);

  // Reach-out drawer state
  const [drawerFamily, setDrawerFamily] = useState<Profile | null>(null);
  const [reachOutNote, setReachOutNote] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);


  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Track if initial fetch has completed (ref to avoid re-renders). Seeded true
  // when we hydrated from the snapshot, so the mount fetch runs as a silent
  // background refresh (no skeleton) rather than a foreground load.
  const hasFetchedOnceRef = useRef(!!initialSnapshot);
  const [totalCount, setTotalCount] = useState(() => initialSnapshot?.totalCount ?? 0);

  // Track which family's drawer should reopen after verification
  const [pendingDrawerFamily, setPendingDrawerFamily] = useState<Profile | null>(null);

  // Verification-based access control: only verified providers see full details
  // Note: "not_required" is for high-trust providers who auto-verified at claim time
  const isVerified = providerProfile?.verification_state === "verified" || providerProfile?.verification_state === "not_required";
  const hasFullAccess = isVerified;

  // Verification modal hook
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModalRaw,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: providerProfile?.id || "",
    onVerified: () => {
      // Reopen drawer with saved family after verification
      if (pendingDrawerFamily) {
        setDrawerFamily(pendingDrawerFamily);
        setPendingDrawerFamily(null);
      }
      // Refresh data to reflect verification state
      window.location.reload();
    },
    onDismissed: () => {
      setPendingDrawerFamily(null);
    },
  });

  // Handle verification click from drawer - close drawer first to avoid stacking
  const handleVerifyFromDrawer = useCallback(() => {
    if (drawerFamily) {
      setPendingDrawerFamily(drawerFamily);
      setDrawerFamily(null); // Close drawer first
    }
    // Small delay to prevent visual stacking
    setTimeout(() => {
      openVerificationModalRaw();
    }, 100);
  }, [drawerFamily, openVerificationModalRaw]);

  const freeRemaining = getFreeConnectionsRemaining(membership);
  const isFreeTier = freeRemaining !== null;
  const providerCareTypes = useMemo(
    () => providerProfile?.care_types || [],
    [providerProfile?.care_types]
  );
  const providerPaymentMethods = useMemo(() => {
    const meta = providerProfile?.metadata as ExtendedMetadata | undefined;
    return meta?.accepted_payments || [];
  }, [providerProfile]);

  // Memoize connections count to avoid recomputing in multiple places
  const connectionsCount = useMemo(
    () => Array.from(connectionData.values()).filter((c) => c.status === "accepted").length,
    [connectionData]
  );

  const profileId = providerProfile?.id;

  // ── Drawer handlers ──

  const handleReachOut = useCallback(
    (family: Profile) => {
      // Check if this is viewing existing outreach (contacted AND has connection data)
      const hasConnectionData = connectionData.has(family.id);
      const isViewingExisting = contactedIds.has(family.id) && hasConnectionData;

      // Track card click event
      if (providerProfile?.slug) {
        trackMatchesEvent(providerProfile.slug, "matches_card_clicked", {
          family_id: family.id,
          family_name: family.display_name,
          is_viewing_existing: isViewingExisting,
        });
      }

      // No profile-completeness gate here on purpose: a provider must be able to
      // reach out to a real lead without finishing their profile first.
      // Verification is the ONLY restriction on reaching out (handled by the
      // drawer's isVerified / onVerifyClick path). Profile completion is nudged
      // elsewhere (the dashboard hero), never used to block a lead.
      setSendError(null);

      // Only load saved message for new outreach
      if (!isViewingExisting) {
        try {
          const saved = localStorage.getItem(DEFAULT_NOTE_KEY);
          if (saved) {
            setReachOutNote(saved);
            setSaveAsDefault(true);
          } else {
            setReachOutNote("");
            setSaveAsDefault(false);
          }
        } catch {
          setReachOutNote("");
          setSaveAsDefault(false);
        }
      }
      setDrawerFamily(family);
    },
    [providerProfile, contactedIds, connectionData],
  );

  const handleCloseDrawer = useCallback(() => {
    if (!sending) {
      setDrawerFamily(null);
      setSendError(null);
    }
  }, [sending]);

  // Handle archiving a declined connection (removes from view)
  const handleArchiveConnection = useCallback(
    async (connectionId: string) => {
      if (!isSupabaseConfigured()) return;

      try {
        const supabase = createClient();

        // Update the connection metadata to mark as archived
        const { error } = await supabase
          .from("connections")
          .update({
            metadata: {
              archived: true,
              archived_at: new Date().toISOString(),
            },
          })
          .eq("id", connectionId);

        if (error) throw error;

        // Update local state to hide the card immediately
        setArchivedConnectionIds((prev) => new Set([...prev, connectionId]));
      } catch (err) {
        console.error("[olera] Failed to archive connection:", err);
      }
    },
    [],
  );

  const handleSendFromDrawer = useCallback(
    async (toProfileId: string, message: string, shouldSaveAsDefault: boolean, usedAi: boolean): Promise<boolean> => {
      if (!profileId || !isSupabaseConfigured()) return false;

      setSending(true);
      setSendError(null);

      try {
        const supabase = createClient();

        const { data: insertedConn, error: insertError } = await supabase
          .from("connections")
          .insert({
            from_profile_id: profileId,
            to_profile_id: toProfileId,
            type: "request",
            status: "pending",
            message: message.trim() || null,
            metadata: { provider_initiated: true, used_ai: usedAi },
          })
          .select("id, created_at")
          .single();

        if (insertError) {
          if (
            insertError.code === "23505" ||
            insertError.message.includes("duplicate") ||
            insertError.message.includes("unique")
          ) {
            // Already contacted - close drawer, don't show success
            setContactedIds((prev) => new Set([...prev, toProfileId]));
            setDrawerFamily(null);
            return false;
          }
          throw new Error(insertError.message);
        }

        // Notify family of reach-out (fire-and-forget)
        fetch("/api/matches/notify-reach-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toProfileId }),
        }).catch(() => {});

        // Track outreach sent event with accurate AI usage flag
        if (providerProfile?.slug && insertedConn) {
          trackMatchesEvent(providerProfile.slug, "matches_outreach_sent", {
            family_id: toProfileId,
            connection_id: insertedConn.id,
            used_ai: usedAi,
            provider_name: providerProfile.display_name,
            city: providerProfile.city,
            state: providerProfile.state,
          });
        }

        // Increment free_responses_used only for free tier (not trial)
        if (membership && membership.status === "free") {
          const newCount = (membership.free_responses_used ?? 0) + 1;
          await supabase
            .from("memberships")
            .update({ free_responses_used: newCount })
            .eq("account_id", membership.account_id);

          await refreshAccountData();
        }

        // Persist default note
        if (shouldSaveAsDefault && message.trim()) {
          try {
            localStorage.setItem(DEFAULT_NOTE_KEY, message.trim());
          } catch {
            /* ignore */
          }
        } else if (!shouldSaveAsDefault) {
          try {
            localStorage.removeItem(DEFAULT_NOTE_KEY);
          } catch {
            /* ignore */
          }
        }

        // Mark as contacted (drawer will show success state and close itself)
        setContactedIds((prev) => new Set([...prev, toProfileId]));

        // Optimistically add to connectionData so MyOutreach updates immediately
        if (insertedConn) {
          setConnectionData((prev) => {
            const updated = new Map(prev);
            updated.set(toProfileId, {
              id: insertedConn.id,
              message: message.trim() || null,
              created_at: insertedConn.created_at,
              status: "pending",
              reply_message: null,
              replied_at: null,
            });
            return updated;
          });
        }

        // Optimistically increment reach-out count for this family
        setReachOutCounts((prev) => {
          const updated = new Map(prev);
          updated.set(toProfileId, (prev.get(toProfileId) || 0) + 1);
          return updated;
        });

        setReachOutNote("");
        return true;
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? (err as { message: string }).message
            : String(err);
        setSendError(`Something went wrong: ${msg}`);
        return false;
      } finally {
        setSending(false);
      }
    },
    [profileId, membership, refreshAccountData],
  );

  const fetchFamilies = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!profileId || !isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      // Only show loading skeleton on initial load, not during background refreshes
      // Also skip loading state if we've already fetched once (covers effect re-runs)
      const shouldShowLoading = !isBackgroundRefresh && !hasFetchedOnceRef.current;
      if (shouldShowLoading) {
        setLoading(true);
      }
      setFetchError(null);

      try {
        const supabase = createClient();

        // Fetch families + provider's connections in parallel (optimized: 2 queries instead of 4)
        // Include both active and paused families - paused will be shown at bottom with disabled reach-out
        const [familiesRes, fullConnectionsRes] = await Promise.all([
          supabase
            .from("business_profiles")
            .select("id, display_name, city, state, lat, lng, type, care_types, metadata, image_url, slug, created_at", { count: "exact" })
            .eq("type", "family")
            .eq("is_active", true)
            .not("metadata->care_post", "is", null) // Must have a care_post (active or paused)
            .order("created_at", { ascending: false }),
          // Full connection data - we derive contactedIds and respondedIds from this
          // Include "expired" so providers can see inactive families they previously contacted
          supabase
            .from("connections")
            .select("id, to_profile_id, message, created_at, status, metadata")
            .eq("from_profile_id", profileId)
            .eq("type", "request")
            .in("status", ["pending", "accepted", "declined", "expired"])
            .order("created_at", { ascending: false }),
        ]);

        if (familiesRes.error) {
          throw new Error(familiesRes.error.message);
        }
        if (fullConnectionsRes.error) {
          // Log but don't fail - connections are less critical than families
          console.error("[olera] connections fetch failed:", fullConnectionsRes.error.message);
        }

        const fetchedFamilies = (familiesRes.data as Profile[]) || [];

        // Derive contactedIds and respondedIds from fullConnectionsRes (eliminates 2 redundant queries)
        const connections = fullConnectionsRes.data || [];
        const contacted = new Set<string>(
          connections.map((c: { to_profile_id: string }) => c.to_profile_id),
        );
        const responded = new Set<string>(
          connections.filter((c: { status: string }) => c.status === "accepted").map((c: { to_profile_id: string }) => c.to_profile_id),
        );
        setContactedIds(contacted);
        setRespondedIds(responded);

        // Process full connection data for Reached Out tab
        const connDataMap = new Map<string, ConnDatum>();

        (fullConnectionsRes.data || []).forEach((conn: {
          id: string;
          to_profile_id: string;
          message: string | null;
          created_at: string;
          status: string;
          metadata: Record<string, unknown> | null;
        }) => {
          const meta = conn.metadata as {
            reply_message?: string;
            replied_at?: string;
          } | null;

          connDataMap.set(conn.to_profile_id, {
            id: conn.id,
            message: conn.message,
            created_at: conn.created_at,
            status: conn.status as "pending" | "accepted" | "declined" | "expired",
            reply_message: meta?.reply_message || null,
            replied_at: meta?.replied_at || null,
          });
        });

        setConnectionData(connDataMap);

        // PAINT NOW. Active families + connections are everything the first
        // render needs to show leads. Drop the loading skeleton here so the
        // page appears after just these two parallel queries — the two fetches
        // below (inactive families, per-card reach-out counts) are non-critical
        // and fill in after, instead of blocking arrival on extra round-trips.
        setFamilies(fetchedFamilies);
        setTotalCount(familiesRes.count || fetchedFamilies.length);
        setLoading(false);
        hasFetchedOnceRef.current = true;

        // Cache this paint so a within-session back-navigation rehydrates
        // instantly (see readMatchesSnapshot). Stores the critical-path leads +
        // connections only; the secondary background fills (inactive families,
        // reach-out counts) re-derive on the next refresh.
        matchesSnapshot = {
          profileId,
          families: fetchedFamilies,
          contactedIds: contacted,
          respondedIds: responded,
          connectionData: connDataMap,
          totalCount: familiesRes.count || fetchedFamilies.length,
          at: Date.now(),
        };

        // Background: inactive families the provider previously contacted
        // (paused/deleted profiles — server API bypasses RLS). Append on arrival.
        const connectedIds = connections.map((c: { to_profile_id: string }) => c.to_profile_id);
        const activeFamilyIds = new Set(fetchedFamilies.map((f) => f.id));
        const missingIds = connectedIds.filter((id: string) => !activeFamilyIds.has(id));

        if (missingIds.length > 0) {
          try {
            const res = await fetch("/api/matches/inactive-profiles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ profileIds: missingIds }),
            });
            if (res.ok) {
              const { profiles: inactiveFamilies } = await res.json();
              if (inactiveFamilies && inactiveFamilies.length > 0) {
                setFamilies((prev) => [...prev, ...(inactiveFamilies as Profile[])]);
              }
            }
          } catch {
            // Non-critical - log but don't fail
            console.error("[olera] Failed to fetch inactive families");
          }
        }

        // Reach-out counts per family — use server API to bypass RLS
        // (RLS only allows providers to see their own connections, but we need
        // aggregate counts of ALL providers interested in each family)
        const familyIds = fetchedFamilies.map((f) => f.id);
        if (familyIds.length > 0) {
          try {
            const counts = new Map<string, number>();
            const CHUNK_SIZE = 400; // Stay under API's 500 limit

            // Chunk requests if there are many families
            const chunks: string[][] = [];
            for (let i = 0; i < familyIds.length; i += CHUNK_SIZE) {
              chunks.push(familyIds.slice(i, i + CHUNK_SIZE));
            }

            // Fetch counts for all chunks (parallel for speed)
            const chunkResults = await Promise.all(
              chunks.map(async (chunk) => {
                const res = await fetch("/api/matches/reach-out-counts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ familyIds: chunk }),
                });
                return res.json();
              })
            );

            // Merge all chunk results into single map
            for (const result of chunkResults) {
              for (const [familyId, count] of Object.entries(result.counts || {})) {
                counts.set(familyId, count as number);
              }
            }

            setReachOutCounts(counts);
          } catch {
            // Non-critical — fall back to empty counts
            console.error("[olera] Failed to fetch reach-out counts");
          }
        }
      } catch (err) {
        console.error("[olera] matches fetch failed:", err);
        setFetchError(
          err && typeof err === "object" && "message" in err
            ? (err as { message: string }).message
            : "Failed to load matches. Please try again.",
        );
      } finally {
        setLoading(false);
        hasFetchedOnceRef.current = true;
      }
    },
    [profileId],
  );

  // Fetch families on mount or when profileId changes
  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  // Track page view on mount (once per session)
  const hasTrackedPageView = useRef(false);
  useEffect(() => {
    if (providerProfile?.slug && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      trackMatchesEvent(providerProfile.slug, "matches_page_viewed", {
        tab: activeTab,
        provider_name: providerProfile.display_name,
        city: providerProfile.city,
        state: providerProfile.state,
      });
    }
  }, [providerProfile?.slug, activeTab]);

  // Boost / campaign state — drives the live-campaign tracker shown at the top
  // of Find Families (and also warms the shared cache so "Get Started" →
  // /provider/boost paints the correct page on the first frame). Init from the
  // cache for an instant first paint, then refetch to reconcile.
  const [boostState, setBoostState] = useState<BoostStateResponse | null>(
    () => getCachedBoostState(),
  );
  // Whether we yet KNOW the campaign status. Seeded true from a warm cache so
  // back-navigation never holds. Set true once the fetch settles (success OR
  // failure) so the pitch branch can't deadlock waiting on it. Gates the pitch
  // vs. tracker decision so a live-campaign provider never flashes the "get a
  // campaign" pitch before the tracker resolves.
  const [boostStateLoaded, setBoostStateLoaded] = useState(
    () => getCachedBoostState() != null,
  );
  useEffect(() => {
    if (!providerProfile?.slug) return;
    let cancelled = false;
    const cached = getCachedBoostState();
    if (cached) {
      setBoostState(cached);
      setBoostStateLoaded(true);
    }
    fetch("/api/provider/ad-boost/request", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<BoostStateResponse>) : null))
      .then((d) => {
        if (cancelled) return;
        if (d) {
          setBoostState(d);
          cacheBoostState(d);
        }
        setBoostStateLoaded(true);
      })
      .catch(() => {
        // best-effort; tracker just won't show — but unblock the pitch branch.
        if (!cancelled) setBoostStateLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [providerProfile?.slug]);

  // The live campaign tracker payload (or null when there's no live campaign).
  const liveCampaign =
    boostState?.request?.status === "live" && boostState.campaignStats
      ? boostState.campaignStats
      : null;

  // Published care-seekers within ~50 mi of the provider (the catchment) — the rare
  // "concrete leads." These pin above the market diagnostic when they exist. Reuses the
  // already-loaded families + the same haversine the browse view uses, so no extra fetch.
  // Replaces the old exact-city match (which hid, e.g., an Austin family from a Round
  // Rock provider). Only active profiles; sorted nearest-first.
  const nearbySeekers = useMemo(() => {
    const lat = providerProfile?.lat;
    const lng = providerProfile?.lng;
    if (lat == null || lng == null) return [] as { family: Profile; distanceMi: number }[];
    return families
      .filter((f) => f.lat != null && f.lng != null && getProfileStatus(f) === "active")
      .map((f) => ({ family: f, distanceMi: haversineDistance(lat, lng, f.lat as number, f.lng as number) }))
      .filter((x) => x.distanceMi <= 50)
      .sort((a, b) => a.distanceMi - b.distanceMi);
  }, [families, providerProfile?.lat, providerProfile?.lng]);

  // Track when a provider with NO family within the catchment lands on Find Families
  // (the ~99.9% no-leads case that now shows the Managed Ads pitch). Waits for the
  // families fetch to resolve so we don't fire on the pre-load empty state, then fires
  // once per visit. Powers a Slack alert + the Activity Center feed. Providers WITH a
  // nearby family see the lead cards and are intentionally not signalled here. (Event
  // name kept as-is to avoid an allowlist migration — see feedback_event_allowlist.)
  const hasTrackedMarketNoLeads = useRef(false);
  useEffect(() => {
    if (
      !providerProfile?.slug ||
      loading ||
      !hasFetchedOnceRef.current ||
      hasTrackedMarketNoLeads.current
    ) {
      return;
    }
    if (nearbySeekers.length > 0) return; // a real nearby family → not the no-leads signal
    hasTrackedMarketNoLeads.current = true;
    trackMatchesEvent(providerProfile.slug, "market_diagnostic_viewed_no_leads", {
      provider_name: providerProfile.display_name,
      city: providerProfile.city,
      state: providerProfile.state,
      email: user?.email,
    });
  }, [providerProfile, loading, nearbySeekers, user?.email]);

  // Poll for updates every 45 seconds (family profile changes, new listings)
  // Pass isBackgroundRefresh=true to avoid showing loading skeleton during refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFamilies(true);
    }, 45000);

    return () => clearInterval(interval);
  }, [fetchFamilies]);

  // Reset to page 1 when filters, tab, or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, modalFilters, activeTab, sortOption]);

  // Persist filter preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("olera_matches_filters", JSON.stringify(modalFilters));
    } catch {
      // Ignore storage errors (e.g., quota exceeded, private browsing)
    }
  }, [modalFilters]);

  // Compute family counts for filter badges
  const familyCounts = useMemo(() => {
    const nonContactedFamilies = families.filter((f) => !contactedIds.has(f.id));
    const byUrgency: Record<string, number> = {};
    const byCareType: Record<string, number> = {};
    const byPayment: Record<string, number> = {};
    const byWhoNeedsCare: Record<string, number> = {};
    const bySchedule: Record<string, number> = {};
    const cityMap: Record<string, { city: string; state: string; count: number }> = {};
    let completeProfiles = 0;

    for (const family of nonContactedFamilies) {
      const meta = family.metadata as FamilyMetadata;

      // City/Location
      if (family.city) {
        const cityKey = `${family.city}|${family.state || ""}`;
        if (!cityMap[cityKey]) {
          cityMap[cityKey] = { city: family.city, state: family.state || "", count: 0 };
        }
        cityMap[cityKey].count++;
      }

      // Urgency/Timeline
      const timeline = meta?.timeline || "exploring";
      byUrgency[timeline] = (byUrgency[timeline] || 0) + 1;

      // Care Types
      const careNeeds = meta?.care_needs || family.care_types || [];
      for (const need of careNeeds) {
        const normalized = need.toLowerCase().replace(/[\s-]+/g, "_");
        byCareType[normalized] = (byCareType[normalized] || 0) + 1;
      }

      // Payment Methods
      const payments = meta?.payment_methods || [];
      for (const payment of payments) {
        const normalized = payment.toLowerCase().replace(/[\s-]+/g, "_");
        byPayment[normalized] = (byPayment[normalized] || 0) + 1;
      }

      // Who Needs Care (stored in relationship_to_recipient)
      const relationship = (meta?.relationship_to_recipient || meta?.who_needs_care || "")
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
      if (relationship) {
        byWhoNeedsCare[relationship] = (byWhoNeedsCare[relationship] || 0) + 1;
      }

      // Schedule
      const schedule = meta?.schedule_preference?.toLowerCase() || "";
      if (schedule) {
        bySchedule[schedule] = (bySchedule[schedule] || 0) + 1;
      }

      // Profile completeness (80%+ is "complete")
      const completeness = meta?.profile_completeness ?? 0;
      if (completeness >= 80) {
        completeProfiles++;
      }
    }

    // Convert cityMap to sorted array (by count descending)
    const byCity = Object.values(cityMap).sort((a, b) => b.count - a.count);

    return {
      byCity,
      byUrgency,
      byCareType,
      byPayment,
      byWhoNeedsCare,
      bySchedule,
      completeProfiles,
      totalProfiles: nonContactedFamilies.length,
    };
  }, [families, contactedIds]);

  // Helper to get outreach status for a family
  const getOutreachStatus = useCallback((familyId: string): "pending" | "connected" | "declined" | null => {
    const conn = connectionData.get(familyId);
    if (!conn) return null;
    if (conn.status === "accepted") return "connected";
    // Map "expired" to "declined" for display (connection ended)
    if (conn.status === "expired") return "declined";
    return conn.status; // "pending" or "declined"
  }, [connectionData]);

  // Filter + sort families based on active tab and modal filters
  // Note: We keep contacted families in the list (sorted to bottom) instead of filtering them out
  const filteredFamilies = useMemo(() => {
    let result = [...families]; // Keep all families

    // Apply modal filters: cities
    if (modalFilters.cities.length > 0) {
      result = result.filter((f) => {
        const cityKey = `${f.city || ""}|${f.state || ""}`;
        return modalFilters.cities.includes(cityKey);
      });
    }

    // Apply modal filters: urgency
    if (modalFilters.urgency.length > 0) {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        const timeline = meta?.timeline || "exploring";
        return modalFilters.urgency.includes(timeline);
      });
    }

    // Apply modal filters: care types
    if (modalFilters.careTypes.length > 0) {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        const careNeeds = meta?.care_needs || f.care_types || [];
        const normalizedNeeds = careNeeds.map((n) => n.toLowerCase().replace(/[\s-]+/g, "_"));
        return modalFilters.careTypes.some((ct) => normalizedNeeds.includes(ct));
      });
    }

    // Apply modal filters: payment methods
    if (modalFilters.paymentMethods.length > 0) {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        const payments = meta?.payment_methods || [];
        const normalizedPayments = payments.map((p) => p.toLowerCase().replace(/[\s-]+/g, "_"));
        return modalFilters.paymentMethods.some((pm) => normalizedPayments.includes(pm));
      });
    }

    // Apply modal filters: who needs care (stored in relationship_to_recipient)
    if (modalFilters.whoNeedsCare.length > 0) {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        // Data is stored as "Myself", "My parent", "My spouse", "Someone else"
        // Normalize to lowercase with underscores: "myself", "my_parent", "my_spouse", "someone_else"
        const relationship = (meta?.relationship_to_recipient || meta?.who_needs_care || "")
          .toLowerCase()
          .replace(/[\s-]+/g, "_");
        return modalFilters.whoNeedsCare.includes(relationship);
      });
    }

    // Apply modal filters: schedule
    if (modalFilters.schedule.length > 0) {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        const schedule = meta?.schedule_preference?.toLowerCase() || "";
        return modalFilters.schedule.includes(schedule);
      });
    }

    // Apply modal filters: profile quality
    if (modalFilters.profileQuality === "complete") {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        const completeness = meta?.profile_completeness ?? 0;
        return completeness >= 80;
      });
    }

    // Apply distance filter (from modal) or "Near You" tab location filter
    const providerLat = providerProfile?.lat;
    const providerLng = providerProfile?.lng;

    if (activeTab === "near_you") {
      // Near You tab: filter to families near provider's location
      // Use distance filter if set, otherwise default to 50 miles
      const maxDistance = modalFilters.distance !== "any" ? parseInt(modalFilters.distance, 10) : 50;

      if (providerLat && providerLng) {
        result = result.filter((f) => {
          if (!f.lat || !f.lng) return false;
          const distance = haversineDistance(providerLat, providerLng, f.lat, f.lng);
          return distance <= maxDistance;
        });
      } else {
        // Fallback: filter by matching city only (state is too broad)
        const providerCity = providerProfile?.city?.toLowerCase();
        if (providerCity) {
          result = result.filter((f) => {
            const familyCity = f.city?.toLowerCase();
            return familyCity === providerCity;
          });
        }
        // If provider has no city, Near You will show empty (which is correct)
      }
    } else if (modalFilters.distance !== "any") {
      // Best Matches tab with distance filter applied
      const maxDistance = parseInt(modalFilters.distance, 10);
      if (providerLat && providerLng) {
        result = result.filter((f) => {
          if (!f.lat || !f.lng) return false;
          const distance = haversineDistance(providerLat, providerLng, f.lat, f.lng);
          return distance <= maxDistance;
        });
      }
    }

    // Filter families based on profile status:
    // - Active: show to all providers
    // - Paused/No Longer Searching/Deleted: show ONLY to providers who have already contacted them
    // (LinkedIn/Upwork behavior: inactive profiles hidden from non-connected users)
    result = result.filter((f) => {
      const status = getProfileStatus(f);
      // Keep all active families - they're in the feed for everyone
      if (status === "active") return true;
      // All other statuses: only show to providers who have already connected
      return contactedIds.has(f.id);
    });

    // Sort based on active tab
    const sorted = [...result].sort((a, b) => {
      const metaA = a.metadata as FamilyMetadata;
      const metaB = b.metadata as FamilyMetadata;

      // First priority: sort by profile status (active > paused > found_care > deleted)
      const statusOrder: Record<ProfileStatus, number> = { active: 0, paused: 1, found_care: 2, deleted: 3 };
      const aStatus = getProfileStatus(a);
      const bStatus = getProfileStatus(b);
      const statusDiff = statusOrder[aStatus] - statusOrder[bStatus];
      if (statusDiff !== 0) return statusDiff;

      if (activeTab === "near_you") {
        // Near You: sort by recency
        const dateA = metaA?.care_post?.published_at || a.created_at;
        const dateB = metaB?.care_post?.published_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }

      // Helper: get recency (newest first)
      const getRecency = (profile: Profile, meta: FamilyMetadata | undefined) => {
        const publishedAt = meta?.care_post?.published_at || profile.created_at;
        return new Date(publishedAt).getTime();
      };

      // Helper: get urgency score
      const getUrgencyScore = (meta: FamilyMetadata | undefined) => {
        const urgencyScores: Record<string, number> = {
          immediate: 100,
          within_1_month: 75,
          within_3_months: 50,
          exploring: 25,
        };
        return urgencyScores[meta?.timeline || "exploring"] ?? 25;
      };

      // Second priority: separate contacted from uncontacted
      const aContacted = contactedIds.has(a.id);
      const bContacted = contactedIds.has(b.id);

      // Uncontacted families come first (within active families)
      if (!aContacted && bContacted) return -1;
      if (aContacted && !bContacted) return 1;

      // If both contacted, sort by status: pending > connected > declined
      if (aContacted && bContacted) {
        const statusOrder: Record<string, number> = { pending: 0, connected: 1, declined: 2 };
        const aStatus = getOutreachStatus(a.id) || "declined";
        const bStatus = getOutreachStatus(b.id) || "declined";
        const statusDiff = (statusOrder[aStatus] ?? 3) - (statusOrder[bStatus] ?? 3);
        if (statusDiff !== 0) return statusDiff;
        // Same status: sort by most recent outreach first
        const aConn = connectionData.get(a.id);
        const bConn = connectionData.get(b.id);
        if (aConn && bConn) {
          return new Date(bConn.created_at).getTime() - new Date(aConn.created_at).getTime();
        }
        return 0;
      }

      // Both uncontacted: sort based on sortOption
      if (sortOption === "newest") {
        // Pure recency sort
        return getRecency(b, metaB) - getRecency(a, metaA);
      }

      if (sortOption === "urgent") {
        // Sort by urgency first, then recency
        const urgencyDiff = getUrgencyScore(metaB) - getUrgencyScore(metaA);
        if (urgencyDiff !== 0) return urgencyDiff;
        return getRecency(b, metaB) - getRecency(a, metaA);
      }

      // Default "recommended": composite score balancing match + urgency + freshness
      const computeScore = (profile: Profile, meta: FamilyMetadata | undefined) => {
        // Service match score (0-100): how many services overlap
        const needs = meta?.care_needs || profile.care_types || [];
        const matchCount = computeMatchingServices(needs, providerCareTypes);
        const maxPossible = Math.max(needs.length, 1);
        const matchScore = (matchCount / maxPossible) * 100;

        const urgencyScore = getUrgencyScore(meta);

        // Freshness score (0-100): decays over time
        const publishedAt = meta?.care_post?.published_at || profile.created_at;
        const daysAgo = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
        let freshnessScore: number;
        if (daysAgo <= 1) freshnessScore = 100;
        else if (daysAgo <= 7) freshnessScore = 85;
        else if (daysAgo <= 14) freshnessScore = 70;
        else if (daysAgo <= 30) freshnessScore = 50;
        else if (daysAgo <= 60) freshnessScore = 30;
        else freshnessScore = 10;

        // Weighted composite: freshness 45%, match 30%, urgency 25%
        return (freshnessScore * 0.45) + (matchScore * 0.30) + (urgencyScore * 0.25);
      };

      const scoreA = computeScore(a, metaA);
      const scoreB = computeScore(b, metaB);
      return scoreB - scoreA;
    });

    return sorted;
  }, [families, contactedIds, connectionData, getOutreachStatus, modalFilters, activeTab, sortOption, providerCareTypes, providerProfile]);

  // Paginate filtered families
  const totalPages = Math.ceil(filteredFamilies.length / PAGE_SIZE);
  const paginatedFamilies = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredFamilies.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredFamilies, currentPage]);

  // Compute new matches today for sidebar (must be before early returns for hooks rules)
  const newTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return families.filter((f) => {
      const meta = f.metadata as FamilyMetadata;
      const publishedAt = meta?.care_post?.published_at || f.created_at;
      return publishedAt && new Date(publishedAt).toDateString() === today;
    }).length;
  }, [families]);

  // The reach-out drawer is shared by the market view (pinned lead) and the full browse
  // view below. Built once so the pinned card opens the exact same flow ("connect the
  // pipes" — reuse Esther's drawer verbatim, just surface it from the pin).
  const reachOutDrawerNode = (() => {
    const conn = drawerFamily ? connectionData.get(drawerFamily.id) : undefined;
    const isViewMode = drawerFamily && contactedIds.has(drawerFamily.id) && !!conn;
    const viewOutreachStatus = conn
      ? conn.status === "accepted" ? "connected" : conn.status as "pending" | "declined"
      : undefined;
    const drawerProfileStatus = drawerFamily ? getProfileStatus(drawerFamily) : "active";
    return (
      <ReachOutDrawer
        family={drawerFamily}
        isOpen={!!drawerFamily}
        onClose={handleCloseDrawer}
        onSend={handleSendFromDrawer}
        defaultMessage={reachOutNote}
        providerProfile={providerProfile}
        providerCareTypes={providerCareTypes}
        providerPaymentMethods={providerPaymentMethods}
        sending={sending}
        sendError={sendError}
        isVerified={isVerified}
        onVerifyClick={handleVerifyFromDrawer}
        mode={isViewMode ? "view" : "compose"}
        sentMessage={isViewMode ? (conn?.message || undefined) : undefined}
        sentAt={isViewMode ? conn?.created_at : undefined}
        outreachStatus={viewOutreachStatus}
        profileStatus={drawerProfileStatus}
        onAIGenerate={(familyId, tone) => {
          if (providerProfile?.slug) {
            trackMatchesEvent(providerProfile.slug, "matches_message_generated", {
              family_id: familyId,
              tone,
            });
          }
        }}
      />
    );
  })();

  if (!providerProfile || loading) {
    return <MatchesSkeleton />;
  }

  // Error state — show after loading completes with no data
  if (fetchError && families.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center justify-center text-center min-h-[50vh]">
          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-5">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="text-[17px] font-display font-semibold text-gray-900 mb-1.5">
            Couldn&apos;t load matches
          </p>
          <p className="text-sm text-gray-500 mb-6 max-w-xs">
            {fetchError}
          </p>
          <button
            type="button"
            onClick={() => fetchFamilies()}
            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
      </div>
    );
  }

  // No nearby leads (the ~99.9% case) — Find Families becomes the Managed Ads
  // pitch: "no families showing up on their own? we'll go get them." The pitch
  // links to /provider/boost for the actual eligibility gate + setup. Market
  // intelligence now lives on its own tab (/provider/growth), not here.
  if (nearbySeekers.length === 0) {
    // Hold the skeleton until campaign status is known, so a live-campaign
    // provider never flashes the "get a campaign" pitch before the tracker
    // resolves. Warm cache makes this instant; only a cold load waits (briefly).
    if (!boostStateLoaded) {
      return <MatchesSkeleton />;
    }
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
          {liveCampaign ? (
            // Already running a campaign → show the tracker, not the "get a
            // campaign" pitch. No family has landed nearby yet, but the campaign
            // is out there working, so frame the wait honestly.
            <div className="space-y-5">
              <CampaignTrackerCard stats={liveCampaign} />
              <p className="text-center text-sm text-gray-500">
                No families have landed in your area just yet — your campaign is out
                there bringing them in. New inquiries and questions show up here.
              </p>
            </div>
          ) : (
            <ManagedAdsPitch
              ctaHref="/provider/boost"
              providerSlug={providerProfile.slug}
              providerName={providerProfile.display_name}
            />
          )}
        </div>
      </div>
    );
  }

  // Get first name for greeting
  const firstName = providerProfile?.display_name?.split(" ")[0] || "there";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-vanilla-50 via-white to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <style dangerouslySetInnerHTML={{ __html: floatKeyframes }} />

      {/* Page header - outside grid so both columns align */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 font-display mb-0.5 lg:mb-1">
            Find families
          </h1>
          <p className="text-sm lg:text-[15px] text-gray-500">
            Connect with families looking for care in your area
          </p>
        </div>
      </div>

      {/* Campaign tracker — full-width above the grid for a provider running a
          live campaign. Their questions + delivered families live here, where
          they came looking for campaign results. */}
      {liveCampaign && (
        <div className="mb-6">
          <CampaignTrackerCard stats={liveCampaign} />
        </div>
      )}

      {/* ── Main layout (matches Profile page grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        {/* ── LEFT COLUMN: Banner + Filters + Content ── */}
        <div className="lg:col-span-2">
          {/* ── Mobile-only: My Outreach above banner (Upwork pattern) ── */}
          <div className="lg:hidden mb-4">
            <MyOutreach
              families={families}
              connectionData={connectionData}
              archivedIds={archivedConnectionIds}
              isOpen={isOutreachOpen}
              onToggle={() => setIsOutreachOpen(!isOutreachOpen)}
            />
          </div>

          {/* Discovery Banner */}
          <div className="mb-6">
            <DiscoveryBanner
              familyCount={families.length}
              firstName={firstName}
            />
          </div>

          {/* Tabs + Cards = one grouped stack */}
          <MatchesTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            activeFilterCount={countActiveFilters(modalFilters)}
            onFiltersClick={() => setIsFiltersModalOpen(true)}
          />

          {/* Active filter chips */}
          {countActiveFilters(modalFilters) > 0 && (
            <FilterChips
              filters={modalFilters}
              onRemove={(key, value) => {
                if (key === "distance") {
                  setModalFilters((prev) => ({ ...prev, distance: "any" }));
                } else if (key === "profileQuality") {
                  setModalFilters((prev) => ({ ...prev, profileQuality: "all" }));
                } else {
                  setModalFilters((prev) => ({
                    ...prev,
                    [key]: (prev[key as keyof typeof prev] as string[]).filter((v) => v !== value),
                  }));
                }
              }}
              onClearAll={() => setModalFilters(DEFAULT_FILTERS_STATE)}
            />
          )}

          {/* Content based on active tab */}
          {families.length === 0 ? (
            <MatchesEmptyState />
          ) : filteredFamilies.length === 0 ? (
            // Empty state - different message based on tab
            activeTab === "near_you" ? (
              <NearYouEmptyState
                city={providerProfile?.city || "your area"}
                providerSlug={providerProfile?.slug || ""}
              />
            ) : (
              // Filter mismatch - no families match current filters
              <div className="text-center py-16 px-8">
                <div className="w-12 h-12 rounded-2xl bg-warm-50 border border-warm-100/60 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-warm-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
                  </svg>
                </div>
                <p className="text-[15px] font-display font-semibold text-gray-900 mb-1">
                  No families match your filters
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Try adjusting your filter criteria.
                </p>
                <button
                  type="button"
                  onClick={() => setModalFilters(DEFAULT_FILTERS_STATE)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  Clear all filters
                </button>
              </div>
            )
          ) : (
                <>
                <div className="flex flex-col gap-2.5 mt-4">
                  {paginatedFamilies.map((family, index) => (
                    <FamilyMatchCard
                      key={family.id}
                      family={family}
                      hasFullAccess={hasFullAccess}
                      providerCareTypes={providerCareTypes}
                      contacted={contactedIds.has(family.id)}
                      outreachStatus={getOutreachStatus(family.id) || undefined}
                      reachOutCount={reachOutCounts.get(family.id) || 0}
                      onReachOut={handleReachOut}
                      animationDelay={index * 40}
                      profileStatus={getProfileStatus(family)}
                    />
                  ))}
                </div>
                </>
              )}

          {/* Pagination */}
          {filteredFamilies.length > PAGE_SIZE && (
            <div className="pt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredFamilies.length}
                itemsPerPage={PAGE_SIZE}
                onPageChange={setCurrentPage}
                itemLabel="families"
                showItemCount={true}
              />
            </div>
          )}

          {/* Managed Ads — secondary "get even more" nudge, below the leads so the
              real (rare) leads stay the focus. */}
          <div className="mt-6">
            <ManagedAdsCTA
              variant="banner"
              tone="more"
              providerSlug={providerProfile?.slug}
              providerName={providerProfile?.display_name}
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN: Profile Snapshot + Sidebar (matches Profile page) ── */}
        {/* self-stretch ensures this column matches left column height, enabling sticky */}
        <div className="hidden lg:block lg:col-span-1 self-stretch">
          <div className="sticky top-24 space-y-4">
            {/* Activity Summary - prominent stats */}
            <ActivitySummary
              totalFamilies={families.length}
              outreachSent={contactedIds.size}
              connections={connectionsCount}
            />

            {/* My Outreach - tracking sent messages */}
            <MyOutreach
              families={families}
              connectionData={connectionData}
              archivedIds={archivedConnectionIds}
              isOpen={isOutreachOpen}
              onToggle={() => setIsOutreachOpen(!isOutreachOpen)}
            />
          </div>
        </div>
      </div>

      {/* ── Reach Out Drawer (shared with the market view's pinned lead) ── */}
      {reachOutDrawerNode}

      {/* ── Verification Modal ── */}
      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={providerProfile?.display_name || "Your Business"}
        profileId={providerProfile?.id}
      />

      {/* ── Filters Modal ── */}
      <FiltersModal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        filters={modalFilters}
        onApply={setModalFilters}
        familyCounts={familyCounts}
        hasProviderCoordinates={!!(providerProfile?.lat && providerProfile?.lng)}
        sortOption={sortOption}
        onSortChange={setSortOption}
        showSort={activeTab === "best_matches"}
      />

      {/* ── Mobile FAB for Filters ── */}
      <button
        type="button"
        onClick={() => setIsFiltersModalOpen(true)}
        className="sm:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="Open filters"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
        {countActiveFilters(modalFilters) > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-white text-primary-600 text-xs font-bold rounded-full flex items-center justify-center shadow-sm">
            {countActiveFilters(modalFilters)}
          </span>
        )}
      </button>
    </div>
    </div>
  );
}

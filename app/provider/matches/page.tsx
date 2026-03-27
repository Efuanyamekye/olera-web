"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProviderDashboardData } from "@/hooks/useProviderDashboardData";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { canEngage, getFreeConnectionsRemaining, FREE_CONNECTION_LIMIT, isProfileShareable } from "@/lib/membership";
import type { Profile, FamilyMetadata } from "@/lib/types";
import { avatarGradient } from "@/components/portal/ConnectionDetailContent";
import { calculateProfileCompleteness, type ExtendedMetadata } from "@/lib/profile-completeness";
import {
  type MatchesFilters,
  DEFAULT_FILTERS,
} from "@/components/provider/matches/MatchesFilterBar";
import FamilyMatchCard from "@/components/provider/matches/FamilyMatchCard";

// Tab types for the matches view
type MatchesTab = "best_match" | "most_recent" | "most_urgent" | "reached_out";
import ReachOutDrawer from "@/components/provider/matches/ReachOutDrawer";
import Pagination from "@/components/ui/Pagination";


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

function blurName(name: string): string {
  if (!name) return "***";
  return name.charAt(0) + "***";
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

const DEFAULT_NOTE_KEY = "olera_default_reachout_note";
const PAGE_SIZE = 12;

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
// Discovery Banner (with location selector)
// ---------------------------------------------------------------------------

function DiscoveryBanner({
  familyCount,
  currentLocation,
  providerLocation,
  onLocationChange,
}: {
  familyCount: number;
  currentLocation: string | null; // current filter selection
  providerLocation: string | null; // provider's default location
  onLocationChange: (location: string | null) => void;
}) {
  const [locationOpen, setLocationOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!locationOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLocationOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [locationOpen]);

  // Close on Escape
  useEffect(() => {
    if (!locationOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLocationOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [locationOpen]);

  const displayLocation = currentLocation || providerLocation || "All locations";

  return (
    <div className="relative rounded-2xl overflow-hidden border border-warm-200/60">
      {/* Background with warm gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(145deg, #fdfbf8 0%, #f9f6f2 40%, #f5f0ea 100%)`,
        }}
      />

      {/* Subtle dot pattern for texture */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #417272 0.5px, transparent 0)`,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Content */}
      <div className="relative px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
        {/* Location selector */}
        <div className="relative inline-block mb-3" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setLocationOpen(!locationOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50/80 hover:bg-primary-100/80 rounded-full border border-primary-100/60 transition-colors group"
          >
            <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            <span className="text-[12px] font-semibold text-primary-700 uppercase tracking-wide">
              {displayLocation}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-primary-500 transition-transform duration-200 ${locationOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {/* Location dropdown */}
          {locationOpen && (
            <div className="absolute top-[calc(100%+6px)] left-0 w-56 bg-white rounded-xl shadow-lg border border-gray-200/80 py-1.5 z-50 animate-fade-in">
              <button
                type="button"
                onClick={() => {
                  onLocationChange(null);
                  setLocationOpen(false);
                }}
                className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${
                  currentLocation === null ? "bg-primary-50 text-primary-700" : "text-gray-700"
                }`}
              >
                {currentLocation === null && (
                  <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
                {currentLocation !== null && <span className="w-4" />}
                <span>All locations</span>
              </button>

              {providerLocation && (
                <button
                  type="button"
                  onClick={() => {
                    onLocationChange(providerLocation);
                    setLocationOpen(false);
                  }}
                  className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${
                    currentLocation === providerLocation ? "bg-primary-50 text-primary-700" : "text-gray-700"
                  }`}
                >
                  {currentLocation === providerLocation && (
                    <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  {currentLocation !== providerLocation && <span className="w-4" />}
                  <span>{providerLocation}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Main headline */}
        <h1 className="font-display text-[22px] sm:text-2xl lg:text-[28px] leading-snug tracking-tight text-gray-900">
          <span className="text-primary-600 font-bold">{familyCount}</span>
          <span className="text-gray-800"> {familyCount === 1 ? 'family is' : 'families are'} looking</span>
          <br className="sm:hidden" />
          <span className="text-gray-800"> for care near you</span>
        </h1>

        {/* Divider + Supporting text */}
        <div className="mt-4 pt-4 border-t border-warm-200/60">
          <p className="text-sm text-gray-500 leading-relaxed">
            Reach out within 24 hours — families are{' '}
            <span className="font-semibold text-gray-700">3× more likely</span>{' '}
            to respond to early contact. The first provider to connect has the highest chance of being chosen.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches Tabs (replaces filter bar)
// ---------------------------------------------------------------------------

const TABS: { id: MatchesTab; label: string }[] = [
  { id: "best_match", label: "Best Matches" },
  { id: "most_recent", label: "Most Recent" },
  { id: "most_urgent", label: "Urgent First" },
  { id: "reached_out", label: "Reached Out" },
];

function MatchesTabs({
  activeTab,
  onTabChange,
  matchCount,
  reachedOutCount,
  locationLabel,
}: {
  activeTab: MatchesTab;
  onTabChange: (tab: MatchesTab) => void;
  matchCount: number;
  reachedOutCount: number;
  locationLabel: string | null;
}) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex items-center justify-between">
        {/* Tabs */}
        <div className="flex items-center gap-6 lg:gap-8">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === "reached_out" && reachedOutCount > 0;

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
                <span className="flex items-center gap-2">
                  {tab.label}
                  {showBadge && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-[11px] font-bold text-white bg-gray-700 rounded-full">
                      {reachedOutCount}
                    </span>
                  )}
                </span>
                {/* Active underline */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900" />
                )}
              </button>
            );
          })}
        </div>

        {/* Match count on the right */}
        <p className="hidden sm:block text-sm text-gray-400">
          {matchCount} {matchCount === 1 ? "match" : "matches"}
          {locationLabel && <span> in {locationLabel}</span>}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile Snapshot Card (Upwork-style sidebar header)
// ---------------------------------------------------------------------------

function ProfileSnapshotCard({
  profile,
  completeness,
}: {
  profile: Profile;
  completeness: number;
}) {
  const displayName = profile.display_name || "Your Business";
  const category = profile.category || profile.care_types?.[0] || "Care Provider";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start gap-3.5">
        {/* Profile image or initials */}
        {profile.image_url ? (
          <Image
            src={profile.image_url}
            alt={displayName}
            width={52}
            height={52}
            className="w-13 h-13 rounded-xl object-cover shrink-0"
            style={{ width: 52, height: 52 }}
          />
        ) : (
          <div
            className="w-13 h-13 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: avatarGradient(displayName), width: 52, height: 52 }}
          >
            {initials}
          </div>
        )}

        {/* Name and category */}
        <div className="flex-1 min-w-0 pt-0.5">
          <Link
            href={profile.slug ? `/provider/${profile.slug}` : "/provider"}
            className="block text-[15px] font-semibold text-gray-900 hover:underline truncate leading-tight"
          >
            {displayName}
          </Link>
          <p className="text-sm text-gray-500 truncate mt-0.5">
            {category}
          </p>
        </div>
      </div>

      {/* Complete your profile link */}
      <Link
        href="/provider"
        className="inline-block text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline mt-4 transition-colors"
      >
        Complete your profile
      </Link>

      {/* Progress bar - simple, Upwork style */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-500"
            style={{ width: `${completeness}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-700 tabular-nums">{completeness}%</span>
      </div>
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
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
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
              <div key={i} className="bg-white rounded-2xl border border-warm-100/60 overflow-hidden">
                <div className="p-7">
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-14 h-14 rounded-2xl bg-warm-100 shrink-0" />
                    <div className="flex-1">
                      <div className="h-5 w-40 bg-warm-100 rounded mb-2" />
                      <div className="h-3.5 w-24 bg-warm-50 rounded" />
                    </div>
                    <div className="h-7 w-24 bg-warm-50 rounded-full" />
                  </div>
                  <div className="grid grid-cols-3 gap-px bg-warm-100/60 rounded-xl overflow-hidden mb-5">
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="bg-warm-50/50 py-3 px-4">
                        <div className="h-4 w-20 bg-warm-100 rounded mx-auto" />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 mb-5 pl-4 border-l-2 border-warm-100">
                    <div className="h-3.5 bg-warm-50 rounded w-full" />
                    <div className="h-3.5 bg-warm-50 rounded w-4/5" />
                  </div>
                  <div className="flex gap-2.5">
                    <div className="h-8 w-24 bg-warm-50 rounded-full" />
                    <div className="h-8 w-28 bg-warm-50 rounded-full" />
                  </div>
                </div>
                <div className="bg-warm-50/40 px-7 py-4">
                  <div className="h-4 w-48 bg-warm-100/60 rounded" />
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
    <div className="lg:col-span-2">
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReachedOutCard — Full card for Reached Out tab
// Two visual states: Pending Reply (amber) and Connected (teal)
// ---------------------------------------------------------------------------

function ReachedOutCard({
  family,
  connectionInfo,
  isConnected,
  reminderSent,
  onSendReminder,
  sendingReminder,
}: {
  family: Profile;
  connectionInfo: {
    id: string;
    message: string | null;
    created_at: string;
    status: "pending" | "accepted";
    reply_message?: string | null;
    replied_at?: string | null;
    reminder_sent?: boolean;
  };
  isConnected: boolean;
  reminderSent: boolean;
  onSendReminder: (connectionId: string) => void;
  sendingReminder: boolean;
}) {
  const displayName = family.display_name || "Family";
  const initials = getInitials(displayName);
  const locationStr = [family.city, family.state].filter(Boolean).join(", ");
  const meta = family.metadata as FamilyMetadata;
  const timeline = meta?.timeline ? TIMELINE_CONFIG[meta.timeline] : null;

  // Calculate hours since reach-out
  const reachedOutAt = new Date(connectionInfo.created_at);
  const hoursSinceReachOut = Math.floor((Date.now() - reachedOutAt.getTime()) / (1000 * 60 * 60));
  const canSendReminder = hoursSinceReachOut >= 48 && !reminderSent && !isConnected;
  const hoursUntilReminder = Math.max(0, 48 - hoursSinceReachOut);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Border and accent colors
  const borderColor = isConnected ? "#2a7a6e" : "#b86e1a";
  const pillBg = isConnected ? "bg-teal-50" : "bg-amber-50";
  const pillText = isConnected ? "text-teal-700" : "text-amber-700";
  const pillBorder = isConnected ? "border-teal-200" : "border-amber-200";

  return (
    <div
      className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden"
      style={{ borderLeftWidth: "3px", borderLeftColor: borderColor }}
    >
      <div className="p-5">
        {/* Header row: Avatar + Name/Location + Status pill */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white shadow-sm"
            style={{ background: avatarGradient(displayName) }}
          >
            {initials}
          </div>

          {/* Name + location + timeline */}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 truncate">{displayName}</p>
            {locationStr && (
              <p className="text-sm text-gray-500 truncate">{locationStr}</p>
            )}
            {/* Timeline badge */}
            {timeline && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border mt-1.5 ${timeline.border} ${timeline.text} ${timeline.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${timeline.dot}`} />
                {timeline.label}
              </span>
            )}
          </div>

          {/* Status pill */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full shrink-0 border ${pillBg} ${pillText} ${pillBorder}`}>
            {isConnected ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>Connected</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span>Pending reply</span>
              </>
            )}
          </div>
        </div>

        {/* YOUR MESSAGE block (always shown) */}
        <div className="mb-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Your message</p>
          <div className="bg-warm-50/50 rounded-lg px-3.5 py-3 border border-warm-100/60">
            <p className="text-sm text-gray-600 italic leading-relaxed">
              {connectionInfo.message || "No message sent."}
            </p>
          </div>
        </div>

        {/* CONNECTED STATE: Their reply + Contact details */}
        {isConnected && (
          <>
            {/* THEIR REPLY block */}
            {connectionInfo.reply_message && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Their reply</p>
                <div className="bg-teal-50/50 rounded-lg px-3.5 py-3 border border-teal-100/60">
                  <p className="text-sm text-gray-700 italic leading-relaxed">
                    {connectionInfo.reply_message}
                  </p>
                </div>
              </div>
            )}

            {/* CONTACT DETAILS UNLOCKED */}
            <div className="bg-gray-50/80 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Contact details unlocked</p>
              </div>

              <div className="space-y-2.5">
                {/* Email */}
                {meta?.contact_email && (
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    </svg>
                    <a href={`mailto:${meta.contact_email}`} className="text-sm text-primary-600 hover:underline">
                      {meta.contact_email}
                    </a>
                  </div>
                )}

                {/* Phone */}
                {meta?.contact_phone && (
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                    <a href={`tel:${meta.contact_phone}`} className="text-sm text-primary-600 hover:underline">
                      {meta.contact_phone}
                    </a>
                  </div>
                )}

                {/* Preferred contact method */}
                {meta?.contact_preference && (
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                    </svg>
                    <span className="text-sm text-gray-600">
                      Prefers <span className="font-medium capitalize">{meta.contact_preference}</span>
                    </span>
                  </div>
                )}

                {/* Connected timestamp */}
                {connectionInfo.replied_at && (
                  <div className="flex items-center gap-2.5 pt-1.5 border-t border-gray-200/60">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    <span className="text-sm text-gray-500">
                      Connected {formatDate(connectionInfo.replied_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* View in Leads link */}
            <div className="mt-4 flex justify-end">
              <Link
                href="/provider/leads"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors group"
              >
                View in Leads
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </>
        )}

        {/* PENDING STATE: Follow-up reminder logic */}
        {!isConnected && (
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Reached out {timeAgo(connectionInfo.created_at)}
            </p>

            {/* Follow-up status/button */}
            {reminderSent || connectionInfo.reminder_sent ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Reminder sent
              </span>
            ) : canSendReminder ? (
              <button
                type="button"
                onClick={() => onSendReminder(connectionInfo.id)}
                disabled={sendingReminder}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full transition-colors disabled:opacity-50"
              >
                {sendingReminder ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Send a reminder
                  </>
                )}
              </button>
            ) : (
              <span className="text-xs text-gray-400">
                Follow-up available in {hoursUntilReminder}h
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches Sidebar (sticky — mirrors dashboard completeness sidebar)
// ---------------------------------------------------------------------------

// Avatar colors by position
const AVATAR_COLORS = [
  { bg: "#d4ede7", text: "#1a6055" }, // green
  { bg: "#fce5d8", text: "#a04020" }, // orange
  { bg: "#e0ddf4", text: "#4838a0" }, // purple
  { bg: "#fcdede", text: "#982828" }, // red
];

function getInitialsForSidebar(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function MatchesSidebar({
  families,
  contactedIds,
  providerLocation,
}: {
  families: Profile[];
  contactedIds: Set<string>;
  providerLocation: string | null;
}) {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // Calculate counts
  const totalFamilies = families.length;
  const contactedCount = contactedIds.size;
  const remainingFamilies = totalFamilies - contactedCount;

  // Determine state
  const isZeroOutreach = contactedCount === 0;
  const isActive = contactedCount > 0;

  // Get families for avatar display (up to 4 + overflow)
  const displayFamilies = families.slice(0, 4);
  const overflowCount = Math.max(0, totalFamilies - 4);

  return (
    <div className="space-y-3">
      {/* ── Main sidebar card ── */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
        <div className="p-5">
          {/* ── STATE 1: ZERO OUTREACH ── */}
          {isZeroOutreach && totalFamilies > 0 && (
            <>
              {/* Full Access header */}
              <div className="flex items-center gap-1.5 mb-5">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-[10.5px] font-bold text-primary-600 uppercase tracking-wide">
                  Full Access {providerLocation && `· ${providerLocation}`}
                </span>
              </div>

              {/* Avatar stack - all bright */}
              <div className="flex items-center mb-4">
                {displayFamilies.map((family, index) => (
                  <div
                    key={family.id}
                    className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-[2.5px] border-white"
                    style={{
                      backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length].bg,
                      color: AVATAR_COLORS[index % AVATAR_COLORS.length].text,
                      marginRight: index < displayFamilies.length - 1 || overflowCount > 0 ? "-10px" : "0",
                      zIndex: displayFamilies.length - index,
                    }}
                  >
                    {getInitialsForSidebar(family.display_name || "?")}
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div
                    className="relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold border-[2.5px] border-white bg-gray-100 text-gray-500"
                    style={{ zIndex: 0 }}
                  >
                    +{overflowCount}
                  </div>
                )}
              </div>

              {/* Family count */}
              <p className="text-[22px] font-display font-bold text-gray-900 leading-tight">
                {totalFamilies} {totalFamilies === 1 ? "family" : "families"}
              </p>
              <p className="text-[14px] text-gray-500 mt-0.5">
                haven&apos;t heard from you yet.
              </p>

              {/* Tip section */}
              <div className="mt-5 pt-4 border-t border-gray-100">
                <div className="flex items-start gap-2">
                  <span className="text-base">💡</span>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Tip</p>
                    <p className="text-[13px] text-gray-600 leading-relaxed">
                      First to reach out is 3× more likely to be chosen.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── STATE 2: ACTIVE (reached out to some) ── */}
          {isActive && totalFamilies > 0 && (
            <>
              {/* Full Access header */}
              <div className="flex items-center gap-1.5 mb-5">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-[10.5px] font-bold text-primary-600 uppercase tracking-wide">
                  Full Access {providerLocation && `· ${providerLocation}`}
                </span>
              </div>

              {/* Avatar stack - contacted are dimmed with checkmark */}
              <div className="flex items-center mb-4">
                {displayFamilies.map((family, index) => {
                  const isContacted = contactedIds.has(family.id);
                  return (
                    <div
                      key={family.id}
                      className="relative"
                      style={{
                        marginRight: index < displayFamilies.length - 1 || overflowCount > 0 ? "-10px" : "0",
                        zIndex: displayFamilies.length - index,
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-[2.5px] border-white transition-opacity"
                        style={{
                          backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length].bg,
                          color: AVATAR_COLORS[index % AVATAR_COLORS.length].text,
                          opacity: isContacted ? 0.3 : 1,
                        }}
                      >
                        {getInitialsForSidebar(family.display_name || "?")}
                      </div>
                      {/* Checkmark badge for contacted */}
                      {isContacted && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary-500 flex items-center justify-center">
                          <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
                {overflowCount > 0 && (
                  <div
                    className="relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold border-[2.5px] border-white bg-gray-100 text-gray-500"
                    style={{ zIndex: 0 }}
                  >
                    +{overflowCount}
                  </div>
                )}
              </div>

              {/* Remaining family count */}
              <p className="text-[22px] font-display font-bold text-gray-900 leading-tight">
                {remainingFamilies} {remainingFamilies === 1 ? "family" : "families"}
              </p>
              <p className="text-[14px] text-gray-500 mt-0.5">
                haven&apos;t heard from you yet.
              </p>
            </>
          )}

          {/* ── ALL CAUGHT UP (no families) ── */}
          {totalFamilies === 0 && (
            <>
              {/* Full Access header */}
              <div className="flex items-center gap-1.5 mb-5">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-[10.5px] font-bold text-primary-600 uppercase tracking-wide">
                  Full Access {providerLocation && `· ${providerLocation}`}
                </span>
              </div>

              {/* Checkmark circle */}
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full bg-primary-50/60 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              </div>

              <h3 className="text-lg font-display font-bold text-gray-900 text-center">
                You&apos;re all caught up
              </h3>
              <p className="text-[13px] text-gray-400 text-center mt-2 leading-relaxed">
                No new families waiting. We&apos;ll notify you when someone&apos;s looking for care in your area.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
         STATE 3: FREE PLAN (commented out — enable when subscriptions launch)
         ══════════════════════════════════════════════════════════════════════

      {isFreeTier && (
        <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
          <div className="p-5">
            {/* Free Plan header *}
            <div className="flex items-center gap-1.5 mb-5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[10.5px] font-bold text-amber-600 uppercase tracking-wide">
                Free Plan {providerLocation && `· ${providerLocation}`}
              </span>
            </div>

            {/* Avatar stack - 3 bright, 1 blurred, dashed overflow *}
            <div className="flex items-center mb-4">
              {displayFamilies.slice(0, 3).map((family, index) => (
                <div
                  key={family.id}
                  className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-[2.5px] border-white"
                  style={{
                    backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length].bg,
                    color: AVATAR_COLORS[index % AVATAR_COLORS.length].text,
                    marginRight: "-10px",
                    zIndex: 4 - index,
                  }}
                >
                  {getInitialsForSidebar(family.display_name || "?")}
                </div>
              ))}
              {/* Blurred avatar *}
              {displayFamilies[3] && (
                <div
                  className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-[2.5px] border-white"
                  style={{
                    backgroundColor: AVATAR_COLORS[3].bg,
                    color: AVATAR_COLORS[3].text,
                    marginRight: "-10px",
                    zIndex: 1,
                    opacity: 0.25,
                    filter: "blur(2px)",
                  }}
                >
                  {getInitialsForSidebar(displayFamilies[3].display_name || "?")}
                </div>
              )}
              {/* Dashed overflow *}
              {overflowCount > 0 && (
                <div
                  className="relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold bg-gray-50 text-gray-400"
                  style={{
                    zIndex: 0,
                    border: "2px dashed #d1d5db",
                  }}
                >
                  +{overflowCount}
                </div>
              )}
            </div>

            {/* Family count *}
            <p className="text-[22px] font-display font-bold text-gray-900 leading-tight">
              {totalFamilies} families
            </p>
            <p className="text-[14px] text-gray-500 mt-0.5 leading-relaxed">
              in your area. You can reach <span className="font-semibold">{FREE_CONNECTION_LIMIT} per month</span> on the free plan.
            </p>

            {/* Upgrade CTA *}
            <Link
              href="/provider/pro"
              className="flex items-center justify-center w-full mt-5 py-3 rounded-xl bg-primary-500 text-white text-[14px] font-semibold hover:bg-primary-600 transition-colors"
            >
              Unlock all {totalFamilies} families
            </Link>
          </div>
        </div>
      )}

      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── How It Works accordion ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <button
          type="button"
          onClick={() => setHowItWorksOpen(!howItWorksOpen)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-warm-50/30 transition-colors"
        >
          <span className="text-[13px] font-semibold text-gray-500">How it works</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${howItWorksOpen ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]"
          style={{ gridTemplateRows: howItWorksOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="px-5 pb-5 space-y-4 border-t border-warm-100/60 pt-4">
              {[
                { num: 1, bold: "Send a note", rest: "explaining why you\u2019re a good fit" },
                { num: 2, bold: "Family reviews", rest: "your profile and message" },
                { num: 3, bold: "If they reply,", rest: "you\u2019re connected" },
              ].map((step) => (
                <div key={step.num} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-warm-100/70 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[12px] font-bold text-gray-500">{step.num}</span>
                  </div>
                  <p className="text-[13px] text-gray-500 leading-relaxed">
                    <span className="font-semibold text-gray-700">{step.bold}</span> {step.rest}
                  </p>
                </div>
              ))}
              <p className="text-[12px] text-gray-400 leading-relaxed pt-2 border-t border-warm-100/60">
                Families choose the first provider who responds.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProviderMatchesPage() {
  const providerProfile = useProviderProfile();
  const { membership, refreshAccountData } = useAuth();
  const { metadata: dashboardMetadata } = useProviderDashboardData(providerProfile);
  const [families, setFamilies] = useState<Profile[]>([]);
  const [contactedIds, setContactedIds] = useState<Set<string>>(new Set());
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [reachOutCounts, setReachOutCounts] = useState<Map<string, number>>(new Map());
  // Full connection data for Reached Out tab cards
  const [connectionData, setConnectionData] = useState<Map<string, {
    id: string;
    message: string | null;
    created_at: string;
    status: "pending" | "accepted";
    reply_message?: string | null;
    replied_at?: string | null;
    reminder_sent?: boolean;
  }>>(new Map());
  // Track which connections have had reminders sent (local state, persisted via DB)
  const [reminderSentIds, setReminderSentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MatchesFilters>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState<MatchesTab>("best_match");

  // Reach-out drawer state
  const [drawerFamily, setDrawerFamily] = useState<Profile | null>(null);
  const [reachOutNote, setReachOutNote] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Reminder sending state
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Track if initial fetch has completed (ref to avoid re-renders)
  const hasFetchedOnceRef = useRef(false);
  const [totalCount, setTotalCount] = useState(0);

  const hasFullAccess = canEngage(
    providerProfile?.type,
    membership,
    "view_inquiry_details"
  );

  const freeRemaining = getFreeConnectionsRemaining(membership);
  const isFreeTier = freeRemaining !== null;
  const providerCareTypes = providerProfile?.care_types || [];
  const providerPaymentMethods = useMemo(() => {
    const meta = providerProfile?.metadata as ExtendedMetadata | undefined;
    return meta?.accepted_payments || [];
  }, [providerProfile]);

  const profileId = providerProfile?.id;

  // Profile completeness for sidebar snapshot
  const profileCompleteness = useMemo(() => {
    if (!providerProfile) return 0;
    const meta = (dashboardMetadata || providerProfile.metadata || {}) as ExtendedMetadata;
    return calculateProfileCompleteness(providerProfile, meta).overall;
  }, [providerProfile, dashboardMetadata]);

  // ── Drawer handlers ──

  const handleReachOut = useCallback(
    (family: Profile) => {
      if (!isProfileShareable(providerProfile)) return;
      setSendError(null);
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
      setDrawerFamily(family);
    },
    [providerProfile],
  );

  const handleCloseDrawer = useCallback(() => {
    if (!sending) {
      setDrawerFamily(null);
      setSendError(null);
    }
  }, [sending]);

  // Handle sending a follow-up reminder (48-hour rule, max 1 per family)
  const handleSendReminder = useCallback(
    async (connectionId: string) => {
      if (!profileId || !isSupabaseConfigured() || sendingReminderId) return;

      setSendingReminderId(connectionId);

      try {
        const supabase = createClient();

        // Update the connection metadata to mark reminder as sent
        const { error } = await supabase
          .from("connections")
          .update({
            metadata: {
              provider_initiated: true,
              reminder_sent: true,
              reminder_sent_at: new Date().toISOString(),
            },
          })
          .eq("id", connectionId);

        if (error) throw error;

        // Update local state
        setReminderSentIds((prev) => new Set([...prev, connectionId]));

        // Optionally trigger a notification to the family (fire-and-forget)
        // This could be expanded with an API route similar to notify-reach-out
      } catch (err) {
        console.error("[olera] Failed to send reminder:", err);
      } finally {
        setSendingReminderId(null);
      }
    },
    [profileId, sendingReminderId],
  );

  const handleSendFromDrawer = useCallback(
    async (toProfileId: string, message: string, shouldSaveAsDefault: boolean) => {
      if (!profileId || !isSupabaseConfigured()) return;

      setSending(true);
      setSendError(null);

      try {
        const supabase = createClient();

        const { error: insertError } = await supabase
          .from("connections")
          .insert({
            from_profile_id: profileId,
            to_profile_id: toProfileId,
            type: "request",
            status: "pending",
            message: message.trim() || null,
            metadata: { provider_initiated: true },
          });

        if (insertError) {
          if (
            insertError.code === "23505" ||
            insertError.message.includes("duplicate") ||
            insertError.message.includes("unique")
          ) {
            setContactedIds((prev) => new Set([...prev, toProfileId]));
            setDrawerFamily(null);
            return;
          }
          throw new Error(insertError.message);
        }

        // Notify family of reach-out (fire-and-forget)
        fetch("/api/matches/notify-reach-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toProfileId }),
        }).catch(() => {});

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

        // Mark as contacted and close drawer
        setContactedIds((prev) => new Set([...prev, toProfileId]));
        setDrawerFamily(null);
        setReachOutNote("");
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? (err as { message: string }).message
            : String(err);
        setSendError(`Something went wrong: ${msg}`);
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

        // Fetch all families + provider's own connections (+ responded)
        const [familiesRes, connectionsRes, respondedRes, fullConnectionsRes] = await Promise.all([
          supabase
            .from("business_profiles")
            .select("id, display_name, city, state, lat, lng, type, care_types, metadata, image_url, slug, created_at", { count: "exact" })
            .eq("type", "family")
            .eq("is_active", true)
            .filter("metadata->care_post->>status", "eq", "active")
            .order("created_at", { ascending: false }),
          supabase
            .from("connections")
            .select("to_profile_id")
            .eq("from_profile_id", profileId)
            .eq("type", "request")
            .in("status", ["pending", "accepted"]),
          supabase
            .from("connections")
            .select("to_profile_id")
            .eq("from_profile_id", profileId)
            .eq("type", "request")
            .eq("status", "accepted"),
          // Full connection data for Reached Out tab (includes message, timestamps, metadata)
          supabase
            .from("connections")
            .select("id, to_profile_id, message, created_at, status, metadata")
            .eq("from_profile_id", profileId)
            .eq("type", "request")
            .in("status", ["pending", "accepted"])
            .order("created_at", { ascending: false }),
        ]);

        if (familiesRes.error) {
          throw new Error(familiesRes.error.message);
        }

        const fetchedFamilies = (familiesRes.data as Profile[]) || [];
        setFamilies(fetchedFamilies);
        setTotalCount(familiesRes.count || fetchedFamilies.length);
        setContactedIds(
          new Set(connectionsRes.data?.map((c: { to_profile_id: string }) => c.to_profile_id) || [])
        );
        setRespondedIds(
          new Set(respondedRes.data?.map((c: { to_profile_id: string }) => c.to_profile_id) || [])
        );

        // Process full connection data for Reached Out tab
        const connDataMap = new Map<string, {
          id: string;
          message: string | null;
          created_at: string;
          status: "pending" | "accepted";
          reply_message?: string | null;
          replied_at?: string | null;
          reminder_sent?: boolean;
        }>();
        const reminderIds = new Set<string>();

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
            reminder_sent?: boolean;
          } | null;

          connDataMap.set(conn.to_profile_id, {
            id: conn.id,
            message: conn.message,
            created_at: conn.created_at,
            status: conn.status as "pending" | "accepted",
            reply_message: meta?.reply_message || null,
            replied_at: meta?.replied_at || null,
            reminder_sent: meta?.reminder_sent || false,
          });

          if (meta?.reminder_sent) {
            reminderIds.add(conn.id);
          }
        });

        setConnectionData(connDataMap);
        setReminderSentIds(reminderIds);

        // Reach-out counts per family
        const familyIds = fetchedFamilies.map((f) => f.id);
        if (familyIds.length > 0) {
          const { data: reachOuts } = await supabase
            .from("connections")
            .select("to_profile_id")
            .in("to_profile_id", familyIds)
            .eq("type", "request")
            .in("status", ["pending", "accepted"]);

          const counts = new Map<string, number>();
          (reachOuts || []).forEach((r: { to_profile_id: string }) => {
            counts.set(r.to_profile_id, (counts.get(r.to_profile_id) || 0) + 1);
          });
          setReachOutCounts(counts);
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

  // Poll for updates every 45 seconds (family profile changes, new listings)
  // Pass isBackgroundRefresh=true to avoid showing loading skeleton during refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFamilies(true);
    }, 45000);

    return () => clearInterval(interval);
  }, [fetchFamilies]);

  // Reset to page 1 when filters or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, activeTab]);

  // Filter + sort families (excludes contacted - those show in "Reached Out" tab)
  const filteredFamilies = useMemo(() => {
    let result = families.filter((f) => !contactedIds.has(f.id));

    // Location filter
    if (filters.location) {
      result = result.filter((f) => {
        const familyLocation = [f.city, f.state].filter(Boolean).join(", ");
        return familyLocation.toLowerCase() === filters.location!.toLowerCase();
      });
    }

    // Sort based on active tab
    const sorted = [...result].sort((a, b) => {
      const metaA = a.metadata as FamilyMetadata;
      const metaB = b.metadata as FamilyMetadata;

      if (activeTab === "most_recent") {
        const dateA = metaA?.care_post?.published_at || a.created_at;
        const dateB = metaB?.care_post?.published_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }

      if (activeTab === "most_urgent") {
        const urgA = URGENCY_ORDER[metaA?.timeline || "exploring"] ?? 3;
        const urgB = URGENCY_ORDER[metaB?.timeline || "exploring"] ?? 3;
        return urgA - urgB;
      }

      // best_match (default): most service overlap first, then urgent, then recent
      const needsA = metaA?.care_needs || a.care_types || [];
      const needsB = metaB?.care_needs || b.care_types || [];
      const matchA = computeMatchingServices(needsA, providerCareTypes);
      const matchB = computeMatchingServices(needsB, providerCareTypes);
      if (matchA !== matchB) return matchB - matchA;
      const urgA = URGENCY_ORDER[metaA?.timeline || "exploring"] ?? 3;
      const urgB = URGENCY_ORDER[metaB?.timeline || "exploring"] ?? 3;
      if (urgA !== urgB) return urgA - urgB;
      const dateA = metaA?.care_post?.published_at || a.created_at;
      const dateB = metaB?.care_post?.published_at || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return sorted;
  }, [families, contactedIds, filters, activeTab, providerCareTypes]);

  // Paginate filtered families
  const totalPages = Math.ceil(filteredFamilies.length / PAGE_SIZE);
  const paginatedFamilies = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredFamilies.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredFamilies, currentPage]);

  const contactedFamilies = useMemo(
    () => families.filter((f) => contactedIds.has(f.id)),
    [families, contactedIds],
  );

  // Compute new matches today for sidebar (must be before early returns for hooks rules)
  const newTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return families.filter((f) => {
      const meta = f.metadata as FamilyMetadata;
      const publishedAt = meta?.care_post?.published_at || f.created_at;
      return publishedAt && new Date(publishedAt).toDateString() === today;
    }).length;
  }, [families]);

  const providerLocation = providerProfile
    ? [providerProfile.city, providerProfile.state].filter(Boolean).join(", ") || null
    : null;

  if (!providerProfile || loading) {
    return <MatchesSkeleton />;
  }

  // Error state — show after loading completes with no data
  if (fetchError && families.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <style dangerouslySetInnerHTML={{ __html: floatKeyframes }} />

      {/* ── Main layout ── */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* ── LEFT COLUMN: Banner + Filters + Content ── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Discovery Banner */}
          <div className="mb-6">
            <DiscoveryBanner
              familyCount={filteredFamilies.length}
              currentLocation={filters.location}
              providerLocation={providerLocation}
              onLocationChange={(location) => setFilters({ ...filters, location })}
            />
          </div>

          {/* Tabs row */}
          <MatchesTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            matchCount={activeTab === "reached_out" ? contactedFamilies.length : filteredFamilies.length}
            reachedOutCount={contactedFamilies.length}
            locationLabel={filters.location || providerLocation}
          />

          {/* Content based on active tab */}
          {activeTab === "reached_out" ? (
            // Reached Out tab - show contacted families with full card view
            contactedFamilies.length === 0 ? (
              <div className="text-center py-16 px-8">
                <div className="w-14 h-14 rounded-2xl bg-warm-50 border border-warm-100/60 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-7 h-7 text-warm-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </div>
                <h3 className="text-[17px] font-display font-bold text-gray-900 mb-1.5">
                  No reach-outs yet
                </h3>
                <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
                  When you reach out to families, they&apos;ll appear here. You can track responses and send follow-up reminders.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {contactedFamilies.map((family) => {
                  const connInfo = connectionData.get(family.id);
                  if (!connInfo) return null;

                  return (
                    <ReachedOutCard
                      key={family.id}
                      family={family}
                      connectionInfo={connInfo}
                      isConnected={respondedIds.has(family.id)}
                      reminderSent={reminderSentIds.has(connInfo.id)}
                      onSendReminder={handleSendReminder}
                      sendingReminder={sendingReminderId === connInfo.id}
                    />
                  );
                })}
              </div>
            )
          ) : (
            // Other tabs - show filtered/sorted families
            <>
              {families.length === 0 ? (
                <MatchesEmptyState />
              ) : filteredFamilies.length === 0 ? (
                <div className="text-center py-16 px-8">
                  <div className="w-12 h-12 rounded-2xl bg-warm-50 border border-warm-100/60 flex items-center justify-center mx-auto mb-4">
                    <PeopleIcon className="w-6 h-6 text-warm-300" />
                  </div>
                  <p className="text-[15px] font-display font-semibold text-gray-900 mb-1">
                    No matches in this location
                  </p>
                  <p className="text-sm text-gray-500">
                    Try selecting a different location.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 pt-2">
                  {paginatedFamilies.map((family, index) => (
                    <FamilyMatchCard
                      key={family.id}
                      family={family}
                      hasFullAccess={hasFullAccess}
                      providerCareTypes={providerCareTypes}
                      providerPaymentMethods={providerPaymentMethods}
                      contacted={contactedIds.has(family.id)}
                      reachOutCount={reachOutCounts.get(family.id) || 0}
                      onReachOut={handleReachOut}
                      animationDelay={index * 40}
                    />
                  ))}
                </div>
              )}
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
        </div>

        {/* ── RIGHT COLUMN: Profile Snapshot + Sidebar (fixed width, hidden on mobile) ── */}
        <div className="hidden lg:block w-[300px] shrink-0">
          <div className="sticky top-24 space-y-4">
            {/* Profile Snapshot Card */}
            <ProfileSnapshotCard
              profile={providerProfile}
              completeness={profileCompleteness}
            />

            {/* Membership / Access Card + How it works */}
            <MatchesSidebar
              families={families}
              contactedIds={contactedIds}
              providerLocation={providerLocation}
            />
          </div>
        </div>
      </div>

      {/* ── Reach Out Drawer ── */}
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
      />
    </div>
    </div>
  );
}

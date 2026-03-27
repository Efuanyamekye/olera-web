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
import MatchesFilterBar, {
  type MatchesFilters,
  type SortOption,
  DEFAULT_FILTERS,
  SERVICE_OPTIONS,
  PAYMENT_OPTIONS,
} from "@/components/provider/matches/MatchesFilterBar";
import MatchesFilterSheet, { type FilterSheetType } from "@/components/provider/matches/MatchesFilterSheet";
import FamilyMatchCard from "@/components/provider/matches/FamilyMatchCard";
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
// Discovery Banner
// ---------------------------------------------------------------------------

function DiscoveryBanner({
  familyCount,
  hotLeadsCount,
  newTodayCount,
  responseRate,
  providerLocation,
  hasContacted,
}: {
  familyCount: number;
  hotLeadsCount: number;
  newTodayCount: number;
  responseRate: number;
  providerLocation: string | null;
  hasContacted: boolean;
}) {
  return (
    <div className="relative mb-6 lg:mb-8 rounded-2xl overflow-hidden border border-warm-200/60">
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
      <div className="relative px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          {/* Left: Main content */}
          <div className="flex-1 min-w-0">
            {/* Location label */}
            {providerLocation && (
              <div className="inline-flex items-center gap-1.5 mb-2.5 px-2.5 py-1 bg-primary-50/80 rounded-full border border-primary-100/60">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span className="text-[11px] font-semibold text-primary-700 uppercase tracking-wide">
                  {providerLocation}
                </span>
              </div>
            )}

            {/* Main headline */}
            <h1 className="font-display text-[22px] sm:text-2xl lg:text-3xl leading-snug tracking-tight text-gray-900">
              <span className="text-primary-600 font-bold">{familyCount}</span>
              <span className="text-gray-800"> {familyCount === 1 ? 'family is' : 'families are'} looking for care near you</span>
            </h1>

            {/* Supporting text */}
            <p className="mt-2 lg:mt-3 text-sm text-gray-500 leading-relaxed max-w-lg">
              Reach out within 24 hours — families are{' '}
              <span className="font-medium text-gray-600">3× more likely</span>{' '}
              to respond to early contact.
            </p>
          </div>

          {/* Right: Stats - horizontal scroll on mobile */}
          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-1 -mx-1 px-1 lg:mx-0 lg:px-0 lg:overflow-visible lg:shrink-0">
            {/* Hot Leads */}
            <div className="flex-shrink-0 min-w-[95px] sm:min-w-[105px] lg:min-w-[115px] bg-white/80 backdrop-blur-sm rounded-xl p-3.5 lg:p-4 border border-gray-100 shadow-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Hot Leads</span>
              </div>
              <p className="text-xl sm:text-2xl font-display font-bold text-gray-900 tracking-tight">
                {hotLeadsCount}
              </p>
            </div>

            {/* New Today */}
            <div className="flex-shrink-0 min-w-[95px] sm:min-w-[105px] lg:min-w-[115px] bg-white/80 backdrop-blur-sm rounded-xl p-3.5 lg:p-4 border border-gray-100 shadow-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">New Today</span>
              </div>
              <p className="text-xl sm:text-2xl font-display font-bold text-gray-900 tracking-tight">
                {newTodayCount}
              </p>
            </div>

            {/* Response Rate - only show if they've contacted someone */}
            {hasContacted && (
              <div className="flex-shrink-0 min-w-[95px] sm:min-w-[105px] lg:min-w-[115px] bg-white/80 backdrop-blur-sm rounded-xl p-3.5 lg:p-4 border border-gray-100 shadow-xs">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-400" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Your Rate</span>
                </div>
                <p className="text-xl sm:text-2xl font-display font-bold text-gray-900 tracking-tight">
                  {responseRate}%
                </p>
              </div>
            )}
          </div>
        </div>
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
// Contacted Row (condensed view for already contacted families)
// ---------------------------------------------------------------------------

function ContactedRow({
  family,
  isAccepted,
}: {
  family: Profile;
  isAccepted: boolean;
}) {
  const displayName = family.display_name || "Family";
  const initials = getInitials(displayName);
  const locationStr = [family.city, family.state].filter(Boolean).join(", ");
  const meta = family.metadata as FamilyMetadata;
  const timeline = meta?.timeline ? TIMELINE_CONFIG[meta.timeline] : null;

  return (
    <div className="flex items-center gap-3 py-3 px-4 bg-white rounded-xl border border-gray-200/60 shadow-sm hover:shadow transition-shadow duration-200">
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white shadow-sm"
        style={{ background: avatarGradient(displayName) }}
      >
        {initials}
      </div>

      {/* Name + location */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
        {locationStr && (
          <p className="text-xs text-gray-500 truncate">{locationStr}</p>
        )}
      </div>

      {/* Timeline badge (smaller, hidden on mobile) */}
      {timeline && (
        <span className={`hidden lg:inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${timeline.border} ${timeline.text} ${timeline.bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${timeline.dot}`} />
          {timeline.label}
        </span>
      )}

      {/* Status */}
      <div className={`flex items-center gap-1.5 text-[11px] lg:text-xs font-semibold px-2 lg:px-3 py-1.5 rounded-full shrink-0 ${
        isAccepted
          ? "bg-green-50 text-green-700 border border-green-200/80"
          : "bg-amber-50 text-amber-600 border border-amber-200/80"
      }`}>
        {isAccepted ? (
          <>
            <CheckCircleIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Connected</span>
            <span className="sm:hidden">Done</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span>Pending</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches Sidebar (sticky — mirrors dashboard completeness sidebar)
// ---------------------------------------------------------------------------

function MatchesSidebar({
  remaining,
  totalFamilies,
  isFreeTier,
  contactedCount,
  respondedCount,
  newMatchesToday,
}: {
  remaining: number | null;
  totalFamilies: number;
  isFreeTier: boolean;
  contactedCount: number;
  respondedCount: number;
  newMatchesToday: number;
}) {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const isPro = !isFreeTier;
  const responseRate = contactedCount > 0 ? Math.round((respondedCount / contactedCount) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* ── Main sidebar card ── */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <div className="bg-white p-5">

          {/* ── FREE TIER: reach-outs ring + families count ── */}
          {isFreeTier && remaining !== null && (
            <>
              {/* Circular progress + count */}
              <div className="flex flex-col items-center text-center mb-5">
                <div className="relative w-20 h-20 mb-3">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#f0eeeb" strokeWidth="5" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke="#374151" strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={`${(remaining / FREE_CONNECTION_LIMIT) * 213.6} 213.6`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[28px] font-display font-bold text-gray-900">
                    {remaining}
                  </span>
                </div>
                <p className="text-[15px] text-gray-500">
                  <span className="font-bold text-gray-900">{remaining} of {FREE_CONNECTION_LIMIT}</span> reach-outs remaining
                </p>
              </div>

              {/* Families stat */}
              <div className="flex items-center justify-center gap-2.5 bg-warm-50/50 rounded-xl px-4 py-3">
                <PeopleIcon className="w-5 h-5 text-gray-400 shrink-0" />
                <p className="text-[13px] text-gray-500">
                  <span className="font-bold text-gray-900">{totalFamilies}</span> families waiting
                </p>
              </div>
            </>
          )}

          {/* ── PRO + FAMILIES WAITING ── */}
          {isPro && totalFamilies > 0 && (
            <>
              {/* Full Access badge */}
              <div className="flex justify-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary-50/60 border border-primary-100/60">
                  <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-xs font-bold text-primary-700 tracking-wide">Full Access</span>
                </div>
              </div>

              {/* Big family count */}
              <div className="text-center mb-2">
                <p className="text-[52px] font-display font-bold text-gray-900 leading-none tracking-tight">
                  {totalFamilies}
                </p>
              </div>
              <p className="text-[17px] text-gray-700 text-center font-medium leading-snug">
                {totalFamilies === 1 ? "family" : "families"} waiting for you
              </p>
              <p className="text-[13px] text-gray-400 text-center mt-1.5 leading-relaxed">
                Families choose the first provider who responds.
              </p>

              {/* Stats row */}
              <div className="mt-6 pt-5 border-t border-gray-100">
                <div className="grid grid-cols-3 gap-1">
                  <div className="text-center">
                    <p className="text-xl font-display font-bold text-gray-900 tracking-tight">{contactedCount}</p>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">Reached out</p>
                  </div>
                  <div className="text-center border-x border-gray-100">
                    <p className="text-xl font-display font-bold text-gray-900 tracking-tight">{respondedCount}</p>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">Responded</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-display font-bold text-gray-900 tracking-tight">{responseRate}%</p>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">Rate</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── PRO + ALL CAUGHT UP ── */}
          {isPro && totalFamilies === 0 && (
            <>
              {/* Full Access badge */}
              <div className="flex justify-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary-50/60 border border-primary-100/60">
                  <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-xs font-bold text-primary-700 tracking-wide">Full Access</span>
                </div>
              </div>

              {/* Checkmark circle */}
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 rounded-full bg-primary-50/60 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              </div>

              <h3 className="text-lg font-display font-bold text-gray-900 text-center">
                You&apos;re all caught up
              </h3>
              <p className="text-[13px] text-gray-400 text-center mt-2 leading-relaxed max-w-[220px] mx-auto">
                No new families waiting. We&apos;ll notify you when someone&apos;s looking for care in your area.
              </p>
            </>
          )}
        </div>

        {/* ── Contextual footer strip ── */}

        {/* Pro + families: urgency nudge */}
        {isPro && totalFamilies > 0 && newMatchesToday > 0 && (
          <div className="px-5 py-3.5 bg-amber-50/60 border-t border-amber-100/40 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
            </div>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-800">{newMatchesToday} new {newMatchesToday === 1 ? "match" : "matches"} today</span> — respond within 24hrs for the best chance.
            </p>
          </div>
        )}

        {/* Pro + all caught up: profile tip */}
        {isPro && totalFamilies === 0 && (
          <div className="px-5 py-3.5 bg-warm-50/50 border-t border-warm-100/60">
            <p className="text-[13px] text-gray-500 text-center leading-relaxed">
              Tip: <Link href="/provider/profile" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">Complete your profile</Link> to match with more families.
            </p>
          </div>
        )}

        {/* Free tier: dark Pro upsell */}
        {isFreeTier && (
          <div
            className="relative"
            style={{ background: "linear-gradient(135deg, #1a1d23 0%, #252830 50%, #1e2127 100%)" }}
          >
            <div
              className="absolute top-0 right-0 w-48 h-48 opacity-[0.06] pointer-events-none"
              style={{ background: "radial-gradient(circle at 80% 20%, #199087, transparent 70%)" }}
            />

            <div className="relative p-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 mb-4">
                <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
                <span className="text-[11px] font-bold text-amber-400 tracking-wide uppercase">Pro</span>
              </div>

              <h3 className="text-[17px] font-display font-bold text-white leading-tight mb-1.5 tracking-tight">
                Connect with every family
              </h3>
              <p className="text-[13px] text-gray-400 leading-relaxed mb-5">
                Unlimited reach-outs, priority visibility, and more leads.
              </p>

              <div className="flex items-center justify-between mb-5">
                <div className="text-center">
                  <p className="text-sm font-display font-bold text-white tracking-tight leading-none uppercase">Unlimited</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-1.5">Reach-outs</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-display font-bold text-white tracking-tight leading-none">3&times;</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-1.5">Visibility</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-display font-bold text-white tracking-tight leading-none">2&times;</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-1.5">More leads</p>
                </div>
              </div>

              <Link
                href="/provider/pro"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-primary-500 text-white text-[14px] font-bold hover:bg-primary-400 transition-colors shadow-lg shadow-primary-500/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
                Get unlimited · $25/mo
              </Link>
            </div>
          </div>
        )}
      </div>

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
                { num: 3, bold: "If they accept,", rest: "a conversation opens in your inbox" },
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
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MatchesFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>("best_match");

  // Mobile filter sheet state
  const [filterSheetType, setFilterSheetType] = useState<FilterSheetType | null>(null);

  // Reach-out drawer state
  const [drawerFamily, setDrawerFamily] = useState<Profile | null>(null);
  const [reachOutNote, setReachOutNote] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Contacted section accordion (collapsed by default)
  const [contactedExpanded, setContactedExpanded] = useState(false);

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
        const [familiesRes, connectionsRes, respondedRes] = await Promise.all([
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  // Filter + sort
  const filteredFamilies = useMemo(() => {
    let result = families.filter((f) => !contactedIds.has(f.id));

    // Location filter
    if (filters.location) {
      result = result.filter((f) => {
        const familyLocation = [f.city, f.state].filter(Boolean).join(", ");
        return familyLocation.toLowerCase() === filters.location!.toLowerCase();
      });
    }

    // Services filter (OR logic - any match)
    if (filters.services.length > 0) {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        const needs = meta?.care_needs || f.care_types || [];
        // Normalize: check if any filter service matches any family need
        return filters.services.some((filterService) => {
          const filterLabel = SERVICE_OPTIONS.find((s) => s.id === filterService)?.label.toLowerCase();
          return needs.some((need) => {
            const needLower = need.toLowerCase();
            return needLower.includes(filterLabel || filterService) ||
                   (filterLabel && filterLabel.includes(needLower));
          });
        });
      });
    }

    // Payment filter (OR logic - any match)
    if (filters.payment.length > 0) {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        const methods = meta?.payment_methods || [];
        return filters.payment.some((filterPayment) => {
          const filterLabel = PAYMENT_OPTIONS.find((p) => p.id === filterPayment)?.label.toLowerCase();
          return methods.some((method) => {
            const methodLower = method.toLowerCase();
            return methodLower.includes(filterLabel || filterPayment) ||
                   (filterLabel && filterLabel.includes(methodLower));
          });
        });
      });
    }

    // Timeline filter
    if (filters.timeline !== "all") {
      result = result.filter((f) => {
        const meta = f.metadata as FamilyMetadata;
        return meta?.timeline === filters.timeline;
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      const metaA = a.metadata as FamilyMetadata;
      const metaB = b.metadata as FamilyMetadata;

      if (sortBy === "most_recent") {
        const dateA = metaA?.care_post?.published_at || a.created_at;
        const dateB = metaB?.care_post?.published_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }

      if (sortBy === "most_urgent") {
        const urgA = URGENCY_ORDER[metaA?.timeline || "exploring"] ?? 3;
        const urgB = URGENCY_ORDER[metaB?.timeline || "exploring"] ?? 3;
        return urgA - urgB;
      }

      // best_match: most service overlap first, then urgent, then recent
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
  }, [families, contactedIds, filters, sortBy, providerCareTypes]);

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

  // Compute banner stats (must be before early returns to satisfy React hooks rules)
  const hotLeadsCount = useMemo(() => {
    return families.filter((f) => {
      const meta = f.metadata as FamilyMetadata;
      return meta?.timeline === "immediate" && !contactedIds.has(f.id);
    }).length;
  }, [families, contactedIds]);

  const newTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return families.filter((f) => {
      const meta = f.metadata as FamilyMetadata;
      const publishedAt = meta?.care_post?.published_at || f.created_at;
      return publishedAt && new Date(publishedAt).toDateString() === today;
    }).length;
  }, [families]);

  const responseRate = useMemo(() => {
    return contactedIds.size > 0
      ? Math.round((respondedIds.size / contactedIds.size) * 100)
      : 0;
  }, [contactedIds, respondedIds]);

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

      {/* ── Mobile filter sheet ── */}
      <MatchesFilterSheet
        isOpen={filterSheetType !== null}
        onClose={() => setFilterSheetType(null)}
        type={filterSheetType || "timeline"}
        filters={filters}
        onChange={setFilters}
        resultCount={filteredFamilies.length}
        providerLocation={providerLocation}
      />

      {/* ── Main layout (Upwork-style) ── */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* ── LEFT COLUMN: Banner + Filters + Content ── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Discovery Banner */}
          <DiscoveryBanner
            familyCount={filteredFamilies.length}
            hotLeadsCount={hotLeadsCount}
            newTodayCount={newTodayCount}
            responseRate={responseRate}
            providerLocation={providerLocation}
            hasContacted={contactedIds.size > 0}
          />

          {/* Filter bar */}
          <MatchesFilterBar
            filters={filters}
            onChange={setFilters}
            sortBy={sortBy}
            onSortChange={setSortBy}
            resultCount={filteredFamilies.length}
            providerLocation={providerLocation}
            onOpenSheet={(type) => setFilterSheetType(type)}
          />

          {/* Family cards or empty state */}
          {families.length === 0 ? (
            <MatchesEmptyState />
          ) : filteredFamilies.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm text-center py-16 px-8">
              <div className="w-12 h-12 rounded-2xl bg-warm-50 border border-warm-100/60 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-warm-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
                </svg>
              </div>
              <p className="text-[15px] font-display font-semibold text-gray-900 mb-1">
                No matches for these filters
              </p>
              <p className="text-sm text-gray-500">
                Try adjusting your filters to see more families.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {paginatedFamilies.map((family) => (
                <FamilyMatchCard
                  key={family.id}
                  family={family}
                  hasFullAccess={hasFullAccess}
                  providerCareTypes={providerCareTypes}
                  providerPaymentMethods={providerPaymentMethods}
                  providerLat={providerProfile?.lat}
                  providerLng={providerProfile?.lng}
                  contacted={contactedIds.has(family.id)}
                  reachOutCount={reachOutCounts.get(family.id) || 0}
                  onReachOut={handleReachOut}
                />
              ))}
            </div>
          )}

          {/* Already contacted - collapsible accordion */}
          {contactedFamilies.length > 0 && (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setContactedExpanded(!contactedExpanded)}
                className="w-full flex items-center justify-between py-3.5 px-4 bg-gray-50/80 hover:bg-gray-100/80 rounded-xl border border-gray-200/60 transition-all duration-200 group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200/80 flex items-center justify-center shadow-sm">
                    <CheckCircleIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    Already contacted
                  </span>
                  <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200/80 shadow-sm">
                    {contactedFamilies.length}
                  </span>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 group-hover:text-gray-500 transition-all duration-300 ease-out ${contactedExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Expandable content */}
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]"
                style={{ gridTemplateRows: contactedExpanded ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <div className="pt-3 space-y-2">
                    {contactedFamilies.map((family) => (
                      <ContactedRow
                        key={family.id}
                        family={family}
                        isAccepted={respondedIds.has(family.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
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
              remaining={freeRemaining}
              totalFamilies={families.length}
              isFreeTier={isFreeTier}
              contactedCount={contactedIds.size}
              respondedCount={respondedIds.size}
              newMatchesToday={newTodayCount}
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

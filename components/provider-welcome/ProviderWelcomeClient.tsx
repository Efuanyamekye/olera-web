"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { ActionType, TokenValidationInfo } from "@/app/provider/welcome/page";
import { createClient } from "@/lib/supabase/client";
import { markSessionTokenValidated } from "@/lib/claim-session";
import {
  getOrCreateClaimSession,
  getClaimSession,
  updateClaimSession,
  markSessionVerified,
  clearClaimSession,
} from "@/lib/claim-session";

// ============================================================
// Types
// ============================================================

interface ProviderProfile {
  id: string;
  display_name: string;
  type: string;
  slug: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
}

interface ProviderStats {
  leads: number;
  questions: number;
  reviews: number;
  messages: number;
}

interface FromProfile {
  id: string;
  display_name: string;
  city?: string | null;
  state?: string | null;
  image_url?: string | null;
}

interface ConnectionData {
  id: string;
  created_at: string;
  message?: string | null; // JSON string with care details
  metadata?: {
    care_type?: string;
    message?: string;
    auto_intro?: string; // Family's actual intro message
    thread?: Array<{ text: string; created_at: string; is_auto_reply?: boolean }>;
    unread_count?: number;
  } | null;
  from_profile?: FromProfile | null;
  to_profile?: FromProfile | null;
}

interface QuestionData {
  id: string;
  question: string;
  asker_name: string | null;
  created_at: string;
}

interface ReviewData {
  id: string;
  rating: number;
  comment: string;
  reviewer_name: string;
  created_at: string;
}

type ActionData = ConnectionData | QuestionData | ReviewData | null;

interface ProviderForAuth {
  profile: {
    id: string;
    display_name: string;
    image_url: string | null;
    city: string | null;
    state: string | null;
    slug: string | null;
  } | null;
  email: string | null;
  // For unclaimed providers (State 3)
  isClaimed: boolean;
  sourceProviderId: string | null;
  providerEmail: string | null;
}

interface ProviderWelcomeClientProps {
  user: User | null;
  providerProfile: ProviderProfile | null;
  providerStats: ProviderStats | null;
  action: ActionType;
  actionId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionData: any;
  providerForAuth?: ProviderForAuth | null;
  // Token validation for campaign emails (pre-verified)
  tokenInfo?: TokenValidationInfo | null;
  // Campaign-specific content
  campaignHeadline?: string;
  campaignMessage?: string;
}

// ============================================================
// Helper Functions
// ============================================================

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(name: string | null | undefined): string {
  if (!name) return "there";
  return name.split(" ")[0];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #5fa3a3, #7ab8b8)",
    "linear-gradient(135deg, #417272, #5fa3a3)",
    "linear-gradient(135deg, #4d8a8a, #7ab8b8)",
    "linear-gradient(135deg, #385e5e, #5fa3a3)",
    "linear-gradient(135deg, #5fa3a3, #96c8c8)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

const CARE_TYPE_LABELS: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  independent_living: "Independent Living",
};

// ============================================================
// Action Config
// ============================================================

interface ActionConfig {
  subtitle: string;
  routeTo: string;
  icon: React.ReactNode;
}

function getActionConfig(action: ActionType, actionData: ActionData): ActionConfig {
  const configs: Record<ActionType, ActionConfig> = {
    lead: {
      subtitle: "You have a new lead",
      routeTo: "/provider/connections",
      icon: (
        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    match: {
      subtitle: "A family wants to connect",
      routeTo: "/provider/connections",
      icon: (
        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
    },
    question: {
      subtitle: "Someone has a question",
      routeTo: "/provider/qna",
      icon: (
        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    review: {
      subtitle: "You received a review",
      routeTo: "/provider/reviews",
      icon: (
        <svg className="w-6 h-6 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ),
    },
    message: {
      subtitle: "New message",
      routeTo: "/provider/inbox",
      icon: (
        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    campaign: {
      subtitle: "Families are looking for care",
      routeTo: "/provider",
      icon: (
        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  };

  return configs[action];
}

// ============================================================
// Stats Row Component — Matches family welcome card style
// ============================================================

interface StatsRowProps {
  stats: ProviderStats;
  excludeAction: ActionType;
  onHighlightContextCard?: () => void;
  sectionTitle?: string;
}

const STAT_ICONS: Record<string, React.ReactNode> = {
  lead: (
    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  question: (
    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  review: (
    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  message: (
    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
};

// Value-focused messaging for zero-stat items
const ZERO_STAT_MESSAGES: Record<string, string> = {
  lead: "Connect with families",
  question: "Build trust with answers",
  review: "Collect client reviews",
  message: "Message families directly",
};

function StatsRow({ stats, excludeAction, onHighlightContextCard, sectionTitle }: StatsRowProps) {
  const statItems = [
    { key: "lead", label: "Leads", sublabel: "new", count: stats.leads, href: "/provider/connections", excludeOn: ["lead", "match"] },
    { key: "question", label: "Q&A", sublabel: "unanswered", count: stats.questions, href: "/provider/qna", excludeOn: ["question"] },
    { key: "review", label: "Reviews", sublabel: "total", count: stats.reviews, href: "/provider/reviews", excludeOn: ["review"] },
    { key: "message", label: "Inbox", sublabel: "unread", count: stats.messages, href: "/provider/inbox", excludeOn: ["message"] },
  ];

  const visibleStats = statItems.filter((item) => !item.excludeOn.includes(excludeAction));

  const handleStatClick = (e: React.MouseEvent, stat: typeof statItems[0]) => {
    // If count is zero and we have a highlight handler, highlight instead of navigating
    if (stat.count === 0 && onHighlightContextCard) {
      e.preventDefault();
      onHighlightContextCard();
    }
  };

  return (
    <div className="space-y-3">
      {sectionTitle && (
        <h2 className="text-text-md font-semibold text-gray-900 mb-4">{sectionTitle}</h2>
      )}
      {visibleStats.map((stat) => (
        <Link
          key={stat.key}
          href={stat.href}
          onClick={(e) => handleStatClick(e, stat)}
          className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow group"
        >
          <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary-50">
            {STAT_ICONS[stat.key]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-md font-semibold text-gray-900">{stat.label}</p>
            <p className="text-text-sm mt-0.5 text-gray-500">
              {stat.count > 0 ? (
                <span className="text-primary-600">{stat.count} {stat.sublabel}</span>
              ) : (
                <span>{ZERO_STAT_MESSAGES[stat.key]}</span>
              )}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ============================================================
// Context Card Components
// ============================================================

interface LeadCardProps {
  data: ConnectionData;
  routeTo: string;
}

function LeadCard({ data, routeTo }: LeadCardProps) {
  const profile = data.from_profile;
  const name = profile?.display_name || "A family";
  const location = [profile?.city, profile?.state].filter(Boolean).join(", ");

  // Parse the connection message JSON to get care details
  let careType: string | null = null;
  let careRecipient: string | null = null;
  let urgency: string | null = null;
  let seekerPhone: string | null = null;
  let seekerEmail: string | null = null;

  try {
    const msgData = typeof data.message === "string" ? JSON.parse(data.message) : data.message;
    careType = msgData?.care_type || data.metadata?.care_type || null;
    careRecipient = msgData?.care_recipient || null;
    urgency = msgData?.urgency || null;
    seekerPhone = msgData?.seeker_phone || null;
    seekerEmail = msgData?.seeker_email || null;
  } catch {
    careType = data.metadata?.care_type || null;
  }

  // Use auto_intro (family's actual message) instead of auto-reply from thread
  const message = data.metadata?.auto_intro || data.metadata?.message;
  const timeAgo = formatTimeAgo(data.created_at);

  // Check if we have any care details to show
  const hasCareDetails = careType || urgency || careRecipient;
  const hasContactInfo = seekerPhone || seekerEmail;

  // Format urgency for display (both old and new formats)
  const urgencyLabels: Record<string, string> = {
    immediate: "Immediate",
    within_1_month: "Within 1 month",
    exploring: "Exploring",
    asap: "ASAP",
    within_month: "Within 1 month",
    few_months: "In a few months",
    researching: "Researching",
  };

  // Format care recipient for display
  const recipientLabels: Record<string, string> = {
    parent: "For a parent",
    spouse: "For a spouse",
    self: "For themselves",
    other: "For a family member",
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Avatar — matches family welcome card dimensions */}
        <div className="relative w-full sm:w-[240px] aspect-[16/10] sm:aspect-auto sm:min-h-[200px] flex-shrink-0 bg-gray-100 overflow-hidden sm:rounded-l-2xl">
          {profile?.image_url ? (
            <Image
              src={profile.image_url}
              alt={name}
              fill
              className="object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: avatarGradient(name) }}
            >
              <span className="text-4xl font-bold text-white">
                {getInitials(name)}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col min-w-0">
          <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight">
            {getFirstName(name)}
          </h2>
          {location && (
            <p className="mt-1 text-text-md text-gray-500">{location}</p>
          )}

          <div className="my-4 border-t border-gray-100" />

          {/* Care details summary - only show if we have data */}
          {hasCareDetails && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {careType && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-primary-50 text-text-sm font-medium text-primary-700">
                  {CARE_TYPE_LABELS[careType] || careType}
                </span>
              )}
              {urgency && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 text-text-sm font-medium text-amber-700">
                  {urgencyLabels[urgency] || urgency}
                </span>
              )}
              {careRecipient && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-100 text-text-sm font-medium text-gray-600">
                  {recipientLabels[careRecipient] || careRecipient}
                </span>
              )}
            </div>
          )}

          {/* Family's message or fallback */}
          {message ? (
            <p className="text-text-md text-gray-600 line-clamp-2 leading-relaxed">
              &ldquo;{message}&rdquo;
            </p>
          ) : (
            <p className="text-text-md text-gray-500 leading-relaxed">
              {getFirstName(name)} is interested in learning more about your services.
            </p>
          )}

          {/* Meta info */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-sm text-gray-500">
            <span>{timeAgo}</span>
            {hasContactInfo && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-primary-600 font-medium">
                  {seekerPhone ? "Phone" : "Email"} provided
                </span>
              </>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1 min-h-4" />

          {/* CTA */}
          <div className="mt-4 sm:mt-5 flex sm:justify-end">
            <Link
              href={routeTo}
              className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
            >
              View and respond
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

interface QuestionCardProps {
  data: QuestionData;
  routeTo: string;
}

function QuestionCard({ data, routeTo }: QuestionCardProps) {
  const name = data.asker_name || "Someone";
  const timeAgo = formatTimeAgo(data.created_at);

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-col">
        {/* Header — larger avatar to match lead card feel */}
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: avatarGradient(name) }}
          >
            <span className="text-xl font-bold text-white">
              {getInitials(name)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight">
              {getFirstName(name)}
            </h2>
            <p className="mt-1 text-text-md text-gray-500">{timeAgo}</p>
          </div>
        </div>

        {/* Question — styled quote block */}
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border-l-4 border-primary-200">
          <p className="text-text-md text-gray-700 leading-relaxed line-clamp-3">
            &ldquo;{data.question}&rdquo;
          </p>
        </div>

        {/* Spacer for consistent height */}
        <div className="flex-1 min-h-4" />

        {/* CTA — matches family welcome button style */}
        <div className="mt-4 sm:mt-5 flex sm:justify-end">
          <Link
            href={routeTo}
            className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            View and respond
          </Link>
        </div>
      </div>
    </div>
  );
}

interface ReviewCardProps {
  data: ReviewData;
  routeTo: string;
}

function ReviewCard({ data, routeTo }: ReviewCardProps) {
  const name = data.reviewer_name || "Someone";
  const timeAgo = formatTimeAgo(data.created_at);
  const stars = "★".repeat(data.rating) + "☆".repeat(5 - data.rating);

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-col">
        {/* Header — larger avatar to match lead card feel */}
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: avatarGradient(name) }}
          >
            <span className="text-xl font-bold text-white">
              {getInitials(name)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight">
              {getFirstName(name)}
            </h2>
            <p className="mt-1 text-text-md text-gray-500">{timeAgo}</p>
          </div>
        </div>

        {/* Rating — prominent display */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-2xl text-primary-500 tracking-wider">{stars}</span>
          <span className="text-text-md font-medium text-gray-700">{data.rating}.0</span>
        </div>

        {/* Comment — styled quote block */}
        {data.comment && (
          <div className="mt-3 p-4 bg-gray-50 rounded-xl">
            <p className="text-text-md text-gray-700 leading-relaxed line-clamp-3">
              &ldquo;{data.comment}&rdquo;
            </p>
          </div>
        )}

        {/* Spacer for consistent height */}
        <div className="flex-1 min-h-4" />

        {/* CTA — matches family welcome button style */}
        <div className="mt-4 sm:mt-5 flex sm:justify-end">
          <Link
            href={routeTo}
            className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            View and respond
          </Link>
        </div>
      </div>
    </div>
  );
}

interface MessageCardProps {
  data: ConnectionData;
  providerId: string;
  routeTo: string;
}

function MessageCard({ data, providerId, routeTo }: MessageCardProps) {
  // Determine who sent the message (the other party)
  const isFromProvider = data.from_profile?.id === providerId;
  const otherParty = isFromProvider ? data.to_profile : data.from_profile;
  const name = otherParty?.display_name || "Someone";

  // Get latest message from thread
  const thread = data.metadata?.thread || [];
  const latestMessage = thread.length > 0 ? thread[thread.length - 1] : null;
  const messagePreview = latestMessage?.text || "New message";
  const timeAgo = latestMessage?.created_at ? formatTimeAgo(latestMessage.created_at) : "";

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-col">
        {/* Header — larger avatar to match lead card feel */}
        <div className="flex items-start gap-4">
          {otherParty?.image_url ? (
            <Image
              src={otherParty.image_url}
              alt={name}
              width={56}
              height={56}
              className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: avatarGradient(name) }}
            >
              <span className="text-xl font-bold text-white">
                {getInitials(name)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight">
              {getFirstName(name)}
            </h2>
            {timeAgo && <p className="mt-1 text-text-md text-gray-500">{timeAgo}</p>}
          </div>
        </div>

        {/* Message preview — styled quote block */}
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border-l-4 border-primary-200">
          <p className="text-text-md text-gray-700 leading-relaxed line-clamp-2">
            {messagePreview}
          </p>
        </div>

        {/* Spacer for consistent height */}
        <div className="flex-1 min-h-4" />

        {/* CTA — matches family welcome button style */}
        <div className="mt-4 sm:mt-5 flex sm:justify-end">
          <Link
            href={routeTo}
            className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            View and respond
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Fallback Card (when no specific action data)
// ============================================================

interface FallbackCardProps {
  action: ActionType;
  config: ActionConfig;
}

function FallbackCard({ action, config }: FallbackCardProps) {
  const descriptions: Record<ActionType, string> = {
    lead: "A family reached out to your organization. View and respond to start the conversation.",
    match: "A family accepted your reach-out. You can now message each other directly.",
    question: "Someone asked a question about your services. A thoughtful answer builds trust.",
    review: "You received a new review. See what families are saying about your care.",
    message: "You have a new message. Continue the conversation with the family.",
    campaign: "Families in your area are actively searching for care providers like you.",
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-col">
        {/* Icon + Content row */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight">
              {config.subtitle}
            </h2>
            <p className="mt-2 text-text-md text-gray-500 leading-relaxed">
              {descriptions[action]}
            </p>
          </div>
        </div>

        {/* Spacer for consistent height */}
        <div className="flex-1 min-h-4" />

        {/* CTA — matches family welcome button style */}
        <div className="mt-4 sm:mt-5 flex sm:justify-end">
          <Link
            href={config.routeTo}
            className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            View and respond
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Campaign Card (for marketing emails)
// ============================================================

interface CampaignCardProps {
  headline?: string;
  message?: string;
  config: ActionConfig;
  highlighted?: boolean;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

function CampaignCard({ headline, message, config, highlighted, cardRef }: CampaignCardProps) {
  const displayHeadline = headline || "Families are searching for care in your area";
  const displayMessage = message || "Your listing is visible to families looking for care providers. Claim your page to respond to inquiries and manage your profile.";

  const baseCardClass = "bg-white rounded-2xl overflow-hidden transition-all duration-300";
  const cardClass = highlighted
    ? `${baseCardClass} border-2 border-orange-400 ring-4 ring-orange-200 shadow-lg shadow-orange-100/50`
    : `${baseCardClass} shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)]`;

  return (
    <div ref={cardRef} className={cardClass}>
      <div className="p-5 sm:p-6 flex flex-col">
        {/* Icon + Content row */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-text-xl sm:text-display-xs font-semibold text-gray-900 leading-tight">
              {displayHeadline}
            </h2>
            <p className="mt-2 text-text-md text-gray-500 leading-relaxed">
              {displayMessage}
            </p>
          </div>
        </div>

        {/* Spacer for consistent height */}
        <div className="flex-1 min-h-4" />

        {/* CTA */}
        <div className="mt-4 sm:mt-5 flex sm:justify-end">
          <Link
            href={config.routeTo}
            className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-700 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Manage your listing
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Inline Context Components (for State 3 unified card)
// ============================================================

function CampaignContextInline({ headline, message }: { headline?: string; message?: string }) {
  const displayHeadline = headline || "Families are searching for care";
  const displayMessage = message || "Claim your page to respond to inquiries and grow your business.";

  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-text-md font-medium text-gray-900">{displayHeadline}</p>
        <p className="text-text-sm text-gray-500 mt-1">{displayMessage}</p>
      </div>
    </div>
  );
}

function LeadContextInline({ data }: { data: ConnectionData }) {
  const profile = data.from_profile;
  const name = profile?.display_name || "A family";
  const message = data.metadata?.message || data.metadata?.thread?.[0]?.text;
  const timeAgo = formatTimeAgo(data.created_at);

  return (
    <div className="flex items-start gap-3">
      {profile?.image_url ? (
        <Image
          src={profile.image_url}
          alt={name}
          width={40}
          height={40}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: avatarGradient(name) }}
        >
          <span className="text-sm font-bold text-white">{getInitials(name)}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        {message ? (
          <p className="text-text-md text-gray-700 line-clamp-2">&ldquo;{message}&rdquo;</p>
        ) : (
          <p className="text-text-md text-gray-700">Wants to connect with you</p>
        )}
        <p className="text-text-sm text-gray-500 mt-1">— {getFirstName(name)} · {timeAgo}</p>
      </div>
    </div>
  );
}

function QuestionContextInline({ data }: { data: QuestionData }) {
  const name = data.asker_name || "Someone";
  const timeAgo = formatTimeAgo(data.created_at);

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: avatarGradient(name) }}
      >
        <span className="text-sm font-bold text-white">{getInitials(name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-text-md text-gray-700 line-clamp-2">&ldquo;{data.question}&rdquo;</p>
        <p className="text-text-sm text-gray-500 mt-1">— {getFirstName(name)} · {timeAgo}</p>
      </div>
    </div>
  );
}

function ReviewContextInline({ data }: { data: ReviewData }) {
  const name = data.reviewer_name || "Someone";
  const timeAgo = formatTimeAgo(data.created_at);
  const stars = "★".repeat(data.rating);

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: avatarGradient(name) }}
      >
        <span className="text-sm font-bold text-white">{getInitials(name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-primary-500 text-lg leading-none mb-1">{stars}</p>
        {data.comment && (
          <p className="text-text-md text-gray-700 line-clamp-2">&ldquo;{data.comment}&rdquo;</p>
        )}
        <p className="text-text-sm text-gray-500 mt-1">— {getFirstName(name)} · {timeAgo}</p>
      </div>
    </div>
  );
}

function MessageContextInline({ data, providerId }: { data: ConnectionData; providerId: string }) {
  const isFromProvider = data.from_profile?.id === providerId;
  const otherParty = isFromProvider ? data.to_profile : data.from_profile;
  const name = otherParty?.display_name || "Someone";
  const thread = data.metadata?.thread || [];
  const latestMessage = thread.length > 0 ? thread[thread.length - 1] : null;
  const messagePreview = latestMessage?.text || "New message";
  const timeAgo = latestMessage?.created_at ? formatTimeAgo(latestMessage.created_at) : "";

  return (
    <div className="flex items-start gap-3">
      {otherParty?.image_url ? (
        <Image
          src={otherParty.image_url}
          alt={name}
          width={40}
          height={40}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: avatarGradient(name) }}
        >
          <span className="text-sm font-bold text-white">{getInitials(name)}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-text-md text-gray-700 line-clamp-2">{messagePreview}</p>
        <p className="text-text-sm text-gray-500 mt-1">— {getFirstName(name)}{timeAgo && ` · ${timeAgo}`}</p>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function ProviderWelcomeClient({
  user,
  providerProfile,
  providerStats,
  action,
  actionId,
  actionData,
  providerForAuth,
  tokenInfo,
  campaignHeadline,
  campaignMessage,
}: ProviderWelcomeClientProps) {
  const greeting = getTimeOfDayGreeting();
  const firstName = getFirstName(providerProfile?.display_name || user?.email);
  const config = useMemo(() => getActionConfig(action, actionData), [action, actionData]);

  const router = useRouter();

  // State 2: Magic link / sign-in states
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // State 3: Claim flow states
  type ClaimStep = "verify" | "code" | "verified" | "signup-link-sent" | "finalizing";
  const [claimStep, setClaimStep] = useState<ClaimStep>("verify");
  const [verificationCode, setVerificationCode] = useState("");
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [signupCooldown, setSignupCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Context card highlight state (for zero-stat clicks)
  const contextCardRef = useRef<HTMLDivElement>(null);
  const [contextCardHighlighted, setContextCardHighlighted] = useState(false);

  const handleHighlightContextCard = useCallback(() => {
    // Scroll to the context card
    contextCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Highlight it
    setContextCardHighlighted(true);
    // Remove highlight after animation
    setTimeout(() => setContextCardHighlighted(false), 2000);
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Signup cooldown timer
  useEffect(() => {
    if (signupCooldown > 0) {
      const timer = setTimeout(() => setSignupCooldown(signupCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [signupCooldown]);

  // Initialize claim session for State 3
  useEffect(() => {
    if (!user && providerForAuth?.profile && !providerForAuth.isClaimed && providerForAuth.sourceProviderId) {
      const session = getOrCreateClaimSession(
        providerForAuth.sourceProviderId,
        providerForAuth.profile.slug || "",
        providerForAuth.profile.display_name
      );

      // Token-based pre-verification (from campaign emails)
      // If token is valid, skip verification and go directly to signup
      if (tokenInfo?.isValid && tokenInfo.emailHint) {
        markSessionTokenValidated(tokenInfo.emailHint);
        markSessionVerified(tokenInfo.emailHint);
        setEmailHint(tokenInfo.emailHint);
        setClaimStep("verified");
        return;
      }

      // Restore step from session
      if (session.verified) {
        setClaimStep("verified");
        setEmailHint(session.emailHint || null);
      } else if (session.step === "code-sent") {
        setClaimStep("code");
        setEmailHint(session.emailHint || null);
      }
    }
  }, [user, providerForAuth, tokenInfo]);

  // Auto-finalize claim if user just authenticated and session is verified
  useEffect(() => {
    async function autoFinalize() {
      if (!user) return;

      const session = getClaimSession();
      if (!session || !session.verified) return;

      // Don't auto-finalize if we already have a provider profile
      if (providerProfile) return;

      setClaimLoading(true);
      try {
        const res = await fetch("/api/claim/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: session.providerId,
            claimSession: session.sessionId,
          }),
        });

        if (res.ok) {
          const { profileSlug } = await res.json();
          clearClaimSession();
          // Redirect to the action destination or provider dashboard
          const redirectTo = config.routeTo || `/provider/${profileSlug}`;
          router.push(redirectTo);
          router.refresh();
        } else {
          const data = await res.json();
          setClaimError(data.error || "Failed to claim page. Please try again.");
          setClaimLoading(false);
        }
      } catch {
        setClaimError("Something went wrong. Please try again.");
        setClaimLoading(false);
      }
    }

    autoFinalize();
  }, [user, providerProfile, config.routeTo, router]);

  const handleSendMagicLink = async () => {
    if (!providerForAuth?.email) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/provider/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: providerForAuth.email,
          providerSlug: providerForAuth.profile?.slug || providerForAuth.sourceProviderId || providerForAuth.profile?.id,
          action,
          actionId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send sign-in link. Please try again.");
        setSending(false);
        return;
      }

      setLinkSent(true);
      setResendCooldown(30);
      setSending(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setSending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  };

  // State 3 handlers
  const handleSendVerificationCode = useCallback(async () => {
    if (!providerForAuth?.sourceProviderId) return;

    setClaimLoading(true);
    setClaimError(null);

    const session = getClaimSession();
    if (!session) {
      setClaimError("Session expired. Please refresh the page.");
      setClaimLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/claim/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: providerForAuth.sourceProviderId,
          claimSession: session.sessionId,
          method: "email",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setClaimError(data.error || "Failed to send verification code.");
        setClaimLoading(false);
        return;
      }

      // Update session and transition to code entry
      updateClaimSession({ step: "code-sent", emailHint: data.emailHint });
      setEmailHint(data.emailHint);
      setClaimStep("code");
      setClaimLoading(false);
      setResendCooldown(30);

      // Focus code input
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch {
      setClaimError("Something went wrong. Please try again.");
      setClaimLoading(false);
    }
  }, [providerForAuth?.sourceProviderId]);

  const handleVerifyCode = useCallback(async () => {
    if (!providerForAuth?.sourceProviderId || !verificationCode.trim()) return;

    const session = getClaimSession();
    if (!session) {
      setClaimError("Session expired. Please refresh the page.");
      return;
    }

    setClaimLoading(true);
    setClaimError(null);

    try {
      const res = await fetch("/api/claim/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: providerForAuth.sourceProviderId,
          code: verificationCode.trim(),
          claimSession: session.sessionId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.verified) {
        setClaimError(data.error || "Invalid code. Please try again.");
        setClaimLoading(false);
        return;
      }

      // Mark session as verified
      markSessionVerified(emailHint || undefined);

      // Auto-send magic link for sign-in
      if (providerForAuth?.providerEmail) {
        const supabase = createClient();
        const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

        await supabase.auth.signInWithOtp({
          email: providerForAuth.providerEmail,
          options: { emailRedirectTo: redirectUrl },
        });

        setSignupCooldown(30);
      }

      setClaimStep("verified");
      setClaimLoading(false);
    } catch {
      setClaimError("Something went wrong. Please try again.");
      setClaimLoading(false);
    }
  }, [providerForAuth?.sourceProviderId, providerForAuth?.providerEmail, verificationCode, emailHint]);

  const handleSignupMagicLink = useCallback(async () => {
    if (!providerForAuth?.providerEmail) return;

    setClaimLoading(true);
    setClaimError(null);

    const supabase = createClient();
    const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

    try {
      const { error: signupError } = await supabase.auth.signInWithOtp({
        email: providerForAuth.providerEmail,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (signupError) {
        setClaimError(signupError.message || "Failed to send sign-up link.");
        setClaimLoading(false);
        return;
      }

      setClaimStep("signup-link-sent");
      setSignupCooldown(30);
      setClaimLoading(false);
    } catch {
      setClaimError("Something went wrong. Please try again.");
      setClaimLoading(false);
    }
  }, [providerForAuth?.providerEmail]);

  const handleSignupGoogle = useCallback(async () => {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }, []);

  // State 1: Claimed + Authenticated
  if (user && providerProfile) {
    return (
      <div className="min-h-screen bg-white">
        {/* Main content container — matches family welcome */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header — matches family welcome spacing */}
          <section className="pt-8 sm:pt-12 pb-6">
            <p className="text-text-md sm:text-text-lg text-gray-500">
              {greeting}, {firstName}
            </p>
            <h1 className="mt-1 text-display-xs sm:text-display-sm font-display text-gray-900">
              {config.subtitle}
            </h1>
          </section>

          {/* Context Card — pb-12 matches family welcome */}
          <section className="pb-12">
            {action === "campaign" ? (
              <CampaignCard
                headline={campaignHeadline}
                message={campaignMessage}
                config={config}
                highlighted={contextCardHighlighted}
                cardRef={contextCardRef}
              />
            ) : actionData ? (
              <>
                {(action === "lead" || action === "match") && (
                  <LeadCard data={actionData as ConnectionData} routeTo={config.routeTo} />
                )}
                {action === "question" && (
                  <QuestionCard data={actionData as QuestionData} routeTo={config.routeTo} />
                )}
                {action === "review" && (
                  <ReviewCard data={actionData as ReviewData} routeTo={config.routeTo} />
                )}
                {action === "message" && providerProfile && (
                  <MessageCard
                    data={actionData as ConnectionData}
                    providerId={providerProfile.id}
                    routeTo={config.routeTo}
                  />
                )}
              </>
            ) : (
              <FallbackCard action={action} config={config} />
            )}
          </section>

          {/* Stats Navigation — styled like family welcome action cards */}
          {providerStats && (
            <section className="pb-20">
              <StatsRow
                stats={providerStats}
                excludeAction={action}
                sectionTitle="What you can do on Olera"
                onHighlightContextCard={action === "campaign" ? handleHighlightContextCard : undefined}
              />
            </section>
          )}
        </div>
      </div>
    );
  }

  // State 1b: Authenticated but no provider profile (family account or no active profile)
  // Show campaign content and prompt to switch to provider account
  if (user && !providerProfile && action === "campaign") {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <section className="pt-8 sm:pt-12 pb-6">
            <p className="text-text-md sm:text-text-lg text-gray-500">
              {greeting}
            </p>
            <h1 className="mt-1 text-display-xs sm:text-display-sm font-display text-gray-900">
              {campaignHeadline || "Families are looking for care"}
            </h1>
          </section>

          <section className="pb-12">
            <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="p-5 sm:p-6 flex flex-col">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-md text-gray-600 leading-relaxed">
                      {campaignMessage || "Your listing is visible to families searching for care. Claim or manage your provider page to respond to inquiries."}
                    </p>
                  </div>
                </div>

                <div className="flex-1 min-h-4" />

                <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <Link
                    href="/for-providers"
                    className="flex items-center justify-center w-full sm:w-auto px-6 py-3 text-text-md font-medium text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-700 rounded-xl transition-colors"
                  >
                    Claim your listing
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // State 2: Claimed + Not logged in (expired magic link)
  if (!user && providerForAuth?.email && providerForAuth?.profile) {
    const profile = providerForAuth.profile;
    const location = [profile.city, profile.state].filter(Boolean).join(", ");

    // Context messages based on action type
    const contextMessages: Record<ActionType, string> = {
      lead: "You have a new care inquiry",
      match: "A family wants to connect",
      question: "Someone asked you a question",
      review: "You received a new review",
      message: "You have a new message",
      campaign: "Families are looking for care",
    };

    // Link sent confirmation view
    if (linkSent) {
      return (
        <div className="min-h-screen bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Header — matches State 1 spacing */}
            <section className="pt-8 sm:pt-12 pb-6">
              <p className="text-text-md sm:text-text-lg text-gray-500">
                Almost there
              </p>
              <h1 className="mt-1 text-display-xs sm:text-display-sm font-display text-gray-900">
                Check your email
              </h1>
            </section>

            {/* Card — matches State 1 padding and shadow */}
            <section className="pb-20">
              <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="p-5 sm:p-6">
                  {/* Email icon — consistent 14x14 icon container */}
                  <div className="flex justify-center mb-6">
                    <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
                      <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="text-text-lg text-gray-900 font-semibold mb-1">
                      We sent a sign-in link to
                    </p>
                    <p className="text-text-md text-primary-600 font-medium mb-5">
                      {providerForAuth.email}
                    </p>

                    <p className="text-text-md text-gray-500 leading-relaxed max-w-sm mx-auto">
                      Click the link in your email to sign in and respond to the {action === "lead" || action === "match" ? "inquiry" : action}.
                    </p>
                  </div>

                  {/* Divider and resend — consistent spacing */}
                  <div className="mt-6 pt-5 border-t border-gray-100 text-center">
                    {resendCooldown > 0 ? (
                      <p className="text-text-sm text-gray-400">
                        Resend in {resendCooldown}s
                      </p>
                    ) : (
                      <button
                        onClick={handleSendMagicLink}
                        disabled={sending}
                        className="text-text-sm text-primary-600 hover:text-primary-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-lg px-2 py-1 -mx-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? "Sending..." : "Didn't receive it? Resend link"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      );
    }

    // Sign-in form view
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header — matches State 1 with greeting + heading */}
          <section className="pt-8 sm:pt-12 pb-6">
            <p className="text-text-md sm:text-text-lg text-gray-500">
              {greeting}
            </p>
            <h1 className="mt-1 text-display-xs sm:text-display-sm font-display text-gray-900">
              Sign in to continue
            </h1>
          </section>

          {/* Card — matches State 1 shadow and padding */}
          <section className="pb-20">
            <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="p-5 sm:p-6">
                {/* Provider info header — consistent icon size */}
                <div className="flex items-center gap-4 pb-5 border-b border-gray-100">
                  {profile.image_url ? (
                    <Image
                      src={profile.image_url}
                      alt={profile.display_name}
                      width={56}
                      height={56}
                      className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: avatarGradient(profile.display_name) }}
                    >
                      <span className="text-xl font-bold text-white">
                        {getInitials(profile.display_name)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-text-lg font-semibold text-gray-900 truncate">
                      {profile.display_name}
                    </h2>
                    {location && (
                      <p className="text-text-sm text-gray-500 mt-0.5">{location}</p>
                    )}
                  </div>
                </div>

                {/* Context message — consistent 14x14 icon container */}
                <div className="flex items-center gap-4 py-5 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                    {config.icon}
                  </div>
                  <p className="text-text-md text-gray-900 font-medium">
                    {contextMessages[action]}
                  </p>
                </div>

                {/* Sign-in section */}
                <div className="pt-5">
                  <p className="text-text-md text-gray-500 mb-4">
                    Sign in to respond
                  </p>

                  {error && (
                    <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-text-sm" role="alert">
                      {error}
                    </div>
                  )}

                  {/* Email display (read-only) — consistent height with buttons */}
                  <div className="mb-4 px-4 py-3.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                    <span className="text-text-md text-gray-700">{providerForAuth.email}</span>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>

                  {/* Primary CTA: Magic link — matches family welcome button style */}
                  <button
                    onClick={handleSendMagicLink}
                    disabled={sending}
                    className="w-full px-6 py-3.5 text-text-md font-medium text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-800 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? "Sending..." : "Send me a sign-in link"}
                  </button>

                  {/* Divider — consistent styling */}
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-100" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">or</span>
                    </div>
                  </div>

                  {/* Secondary CTA: Google — with proper focus state */}
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3.5 border border-gray-200 rounded-xl text-text-md font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // State 3: Unclaimed provider — simplified claim flow
  if (!user && providerForAuth?.profile && !providerForAuth.isClaimed) {
    const profile = providerForAuth.profile;
    const providerEmail = providerForAuth.providerEmail;

    // Context messages based on action type
    const contextMessages: Record<ActionType, string> = {
      lead: "A family is looking for care",
      match: "A family wants to connect",
      question: "Someone has a question for you",
      review: "You received a new review",
      message: "You have a new message",
      campaign: "Families are searching for care",
    };

    // If no email on file, redirect to full onboard
    if (!providerEmail && !emailHint) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <p className="text-text-md text-gray-500 mb-4">
              Redirecting to claim your page...
            </p>
            <Link
              href={`/provider/${profile.slug}/onboard`}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Click here if not redirected
            </Link>
          </div>
        </div>
      );
    }

    // After verification: Check email for sign-in link
    if (claimStep === "verified" || claimStep === "signup-link-sent") {
      return (
        <div className="min-h-screen bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <section className="pt-8 sm:pt-12 pb-6">
              <h1 className="text-display-xs sm:text-display-sm font-display text-gray-900">
                Check your email
              </h1>
            </section>

            <section className="pb-20">
              <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="p-6 sm:p-8 text-center">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>

                  <p className="text-text-md text-gray-600 mb-1">
                    Click the link we sent to
                  </p>
                  <p className="text-text-md text-gray-900 font-medium mb-4">
                    {emailHint || providerEmail}
                  </p>
                  <p className="text-text-sm text-gray-500">
                    to access your dashboard.
                  </p>

                  <div className="mt-6 pt-5 border-t border-gray-100">
                    {signupCooldown > 0 ? (
                      <p className="text-text-sm text-gray-400">
                        Resend in {signupCooldown}s
                      </p>
                    ) : (
                      <button
                        onClick={handleSignupMagicLink}
                        disabled={claimLoading}
                        className="text-text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Resend link
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      );
    }

    // Step: Enter verification code
    if (claimStep === "code") {
      return (
        <div className="min-h-screen bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <section className="pt-8 sm:pt-12 pb-6">
              <h1 className="text-display-xs sm:text-display-sm font-display text-gray-900">
                Enter your code
              </h1>
            </section>

            <section className="pb-20">
              <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="p-6 sm:p-8">
                  <p className="text-text-md text-gray-600 text-center mb-6">
                    We sent a 6-digit code to <span className="font-medium text-gray-900">{emailHint || providerEmail}</span>
                  </p>

                  {claimError && (
                    <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-text-sm text-center" role="alert">
                      {claimError}
                    </div>
                  )}

                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full px-4 py-4 text-center text-2xl font-mono tracking-[0.5em] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-4"
                  />

                  <button
                    onClick={handleVerifyCode}
                    disabled={claimLoading || verificationCode.length !== 6}
                    className="w-full px-6 py-3.5 text-text-md font-medium text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-800 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claimLoading ? "Verifying..." : "Verify"}
                  </button>

                  <div className="mt-5 text-center">
                    {resendCooldown > 0 ? (
                      <p className="text-text-sm text-gray-400">Resend in {resendCooldown}s</p>
                    ) : (
                      <button
                        onClick={handleSendVerificationCode}
                        disabled={claimLoading}
                        className="text-text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      );
    }

    // Default: ONE unified card with context + claim prompt
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <section className="pt-8 sm:pt-12 pb-6">
            <p className="text-text-md sm:text-text-lg text-gray-500">
              {greeting}
            </p>
            <h1 className="mt-1 text-display-xs sm:text-display-sm font-display text-gray-900">
              {contextMessages[action]}
            </h1>
          </section>

          {/* ONE unified card: context + claim */}
          <section className="pb-20">
            <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="p-5 sm:p-6">
                {/* Context preview */}
                {(actionData || action === "campaign") && (
                  <div className="pb-5 border-b border-gray-100">
                    {(action === "lead" || action === "match") && actionData && (
                      <LeadContextInline data={actionData as ConnectionData} />
                    )}
                    {action === "question" && actionData && (
                      <QuestionContextInline data={actionData as QuestionData} />
                    )}
                    {action === "review" && actionData && (
                      <ReviewContextInline data={actionData as ReviewData} />
                    )}
                    {action === "message" && actionData && (
                      <MessageContextInline data={actionData as ConnectionData} providerId={profile.id} />
                    )}
                    {action === "campaign" && (
                      <CampaignContextInline headline={campaignHeadline} message={campaignMessage} />
                    )}
                  </div>
                )}

                {/* Claim section */}
                <div className={actionData ? "pt-5" : ""}>
                  <p className="text-text-md text-gray-900 font-semibold mb-1">
                    Claim your page to respond
                  </p>
                  <p className="text-text-sm text-gray-500 mb-4">
                    We&apos;ll send a code to <span className="font-medium text-gray-700">{providerEmail}</span>
                  </p>

                  {claimError && (
                    <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-text-sm" role="alert">
                      {claimError}
                    </div>
                  )}

                  <button
                    onClick={handleSendVerificationCode}
                    disabled={claimLoading}
                    className="w-full px-6 py-3.5 text-text-md font-medium text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-800 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claimLoading ? "Sending..." : "Send verification code"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Fallback: No provider info found — show generic error
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-text-lg font-semibold text-gray-900 mb-2">
          Page not found
        </h2>
        <p className="text-text-md text-gray-500 mb-6">
          We couldn&apos;t find the page you&apos;re looking for. The link may have expired.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 text-text-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Image from "next/image";
import type { Profile, FamilyMetadata } from "@/lib/types";

interface FamilyMatchCardProps {
  family: Profile;
  hasFullAccess: boolean;
  providerCareTypes: string[];
  providerPaymentMethods: string[];
  contacted?: boolean;
  reachOutCount?: number;
  onReachOut: (family: Profile) => void;
  animationDelay?: number;
}

// ── Helpers ──

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #7fbfb5, #5a9e94)", // teal/mint
    "linear-gradient(135deg, #9683b5, #7c6a9a)", // purple/violet
    "linear-gradient(135deg, #7a8fa8, #5d7490)", // slate/blue
    "linear-gradient(135deg, #b59683, #9a7c6a)", // terracotta
    "linear-gradient(135deg, #a89683, #8a7a68)", // warm brown
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 5) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
}

function activityAgo(dateStr: string | null | undefined): { label: string; color: "green" | "amber" | "gray" } {
  if (!dateStr) return { label: "No activity yet", color: "gray" };

  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 5) return { label: "Online now", color: "green" };
  if (diffDays === 0) return { label: "Active today", color: "amber" };
  if (diffDays === 1) return { label: "Active 1d ago", color: "amber" };
  if (diffDays < 7) return { label: `Active ${diffDays}d ago`, color: "amber" };
  return { label: "No activity yet", color: "gray" };
}

// Calculate profile completeness based on filled fields
function calculateCompleteness(family: Profile, meta: FamilyMetadata | null): number {
  // If explicitly set, use that value
  if (meta?.profile_completeness !== undefined) {
    return meta.profile_completeness;
  }

  let score = 0;
  const weights = {
    display_name: 15,
    city: 10,
    care_needs: 20,
    timeline: 15,
    payment_methods: 15,
    who_needs_care: 10,
    about_situation: 15,
  };

  if (family.display_name?.trim()) score += weights.display_name;
  if (family.city?.trim()) score += weights.city;
  if (meta?.care_needs && meta.care_needs.length > 0) score += weights.care_needs;
  if (meta?.timeline) score += weights.timeline;
  if (meta?.payment_methods && meta.payment_methods.length > 0) score += weights.payment_methods;
  if (meta?.who_needs_care || meta?.relationship_to_recipient) score += weights.who_needs_care;
  if (meta?.about_situation?.trim()) score += weights.about_situation;

  return Math.min(100, score);
}

// Timeline badge configuration
const TIMELINE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  // New values
  as_soon_as_possible: { label: "Immediate", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  within_a_month: { label: "Within a month", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  in_a_few_months: { label: "In a few months", color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200", dot: "bg-teal-500" },
  just_researching: { label: "Just researching", color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-500" },
  // Legacy values (map to new display)
  immediate: { label: "Immediate", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  within_1_month: { label: "Within a month", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  within_3_months: { label: "In a few months", color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200", dot: "bg-teal-500" },
  exploring: { label: "Just researching", color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-500" },
};

// Who needs care display
function formatWhoNeedsCare(value: string | undefined): string | null {
  if (!value) return null;
  const mapping: Record<string, string> = {
    myself: "For themselves",
    my_parent: "For a parent",
    my_spouse: "For a spouse",
    someone_else: "For someone",
  };
  return mapping[value] || null;
}

// Completeness color config
function getCompletenessColors(percent: number): { dot: string; text: string; border: string } {
  if (percent >= 70) return { dot: "#2a7a6e", text: "#2a7a6e", border: "#2a7a6e" };
  if (percent >= 30) return { dot: "#b86e1a", text: "#b86e1a", border: "#b86e1a" };
  return { dot: "#a8b8b4", text: "#a8b8b4", border: "#a8b8b4" };
}

export default function FamilyMatchCard({
  family,
  hasFullAccess,
  providerCareTypes,
  providerPaymentMethods,
  contacted = false,
  reachOutCount = 0,
  onReachOut,
  animationDelay = 0,
}: FamilyMatchCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const meta = (family.metadata || {}) as FamilyMetadata;
  const displayName = family.display_name || "Family";
  const initials = getInitials(displayName);
  const location = [family.city, family.state].filter(Boolean).join(", ");
  const timeline = meta?.timeline ? TIMELINE_CONFIG[meta.timeline] : null;
  const careNeeds = meta?.care_needs || family.care_types || [];
  const paymentMethods = meta?.payment_methods || [];
  const publishedAt = meta?.care_post?.published_at || family.created_at;
  const lastActiveAt = meta?.last_active_at;
  const familyDescription = meta?.about_situation?.trim();

  // Calculate profile completeness and determine card state
  const completeness = calculateCompleteness(family, meta);
  const cardState: "full" | "partial" | "minimal" =
    completeness >= 70 ? "full" :
    completeness >= 30 ? "partial" : "minimal";

  // Completeness chip colors
  const completenessColors = getCompletenessColors(completeness);

  // Tooltip hover handlers
  const handleTooltipMouseEnter = () => {
    tooltipTimeoutRef.current = setTimeout(() => setShowTooltip(true), 300);
  };
  const handleTooltipMouseLeave = () => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setShowTooltip(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  // Activity status
  const activity = activityAgo(lastActiveAt);
  const isOnline = activity.color === "green";

  // Services matched
  const matchingServices = useMemo(() => {
    return careNeeds.filter((need) =>
      providerCareTypes.some((service) => service.toLowerCase() === need.toLowerCase())
    );
  }, [careNeeds, providerCareTypes]);

  // Who needs care display
  const whoNeedsCare = formatWhoNeedsCare(meta?.who_needs_care || meta?.relationship_to_recipient);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!contacted) {
      onReachOut(family);
    }
  };

  return (
    <div
      className={`group bg-white rounded-[14px] border overflow-hidden ${
        contacted
          ? "border-[#e4edea] opacity-60 cursor-default"
          : "border-[#e4edea] hover:border-[#a8d4cf] cursor-pointer card-hover-shadow"
      }`}
      style={{
        animation: `fadeSlideUp 0.4s ease-out ${animationDelay}ms both`,
      }}
      onClick={handleClick}
    >
      <div className="p-5">
        {/* TOP ROW: Avatar + Name/Location + Timeline */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar with optional online dot */}
          <div className="relative shrink-0">
            {family.image_url ? (
              <Image
                src={family.image_url}
                alt={displayName}
                width={40}
                height={40}
                className="w-10 h-10 rounded-[11px] object-cover"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-[11px] flex items-center justify-center text-sm font-semibold text-white"
                style={{ background: avatarGradient(displayName) }}
              >
                {initials}
              </div>
            )}
            {/* Online indicator dot */}
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-[9px] h-[9px] bg-[#38b068] rounded-full border-[1.5px] border-white" />
            )}
          </div>

          {/* Name + Location + Time */}
          <div className="flex-1 min-w-0">
            <h3 className="text-[14.5px] font-medium text-gray-900 truncate leading-tight">
              {hasFullAccess ? displayName : displayName.charAt(0) + "***"}
            </h3>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {hasFullAccess ? location : "***"} · {timeAgo(publishedAt)}
            </p>
          </div>

          {/* Timeline badge */}
          {timeline && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${timeline.border} ${timeline.color} ${timeline.bg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${timeline.dot}`} />
              {timeline.label}
            </span>
          )}
        </div>

        {/* FAMILY DESCRIPTION QUOTE */}
        {familyDescription && (
          <>
            <p
              className="text-[13px] text-gray-500 italic leading-[1.6] mb-4"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              &ldquo;{familyDescription}&rdquo;
            </p>
            <div className="border-t border-gray-100 mb-4" />
          </>
        )}

        {/* FULL STATE: Match highlight block */}
        {cardState === "full" && matchingServices.length > 0 && (
          <div className="bg-teal-50/60 border border-teal-100/60 rounded-lg px-3.5 py-3 mb-4 flex items-start gap-2.5">
            <svg className="w-5 h-5 text-[#2a7a6e] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm text-gray-700">
              Looking for <span className="font-semibold">{matchingServices.length} service{matchingServices.length > 1 ? "s" : ""} you offer</span> — {matchingServices.join(" & ")}
            </p>
          </div>
        )}

        {/* PARTIAL STATE: Match Details */}
        {cardState === "partial" && careNeeds.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Match Details
            </p>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#2a7a6e] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="text-sm text-gray-700">
                Looking for <span className="font-semibold">{careNeeds.slice(0, 2).join(", ")}</span>
              </p>
            </div>
          </div>
        )}

        {/* OPPORTUNITY LINE (Partial + Minimal only) */}
        {cardState === "partial" && (
          <div className="bg-amber-50/70 border border-amber-100/60 rounded-lg px-3.5 py-3 mb-4">
            <p className="text-sm text-amber-900/80 leading-relaxed">
              <span className="font-semibold">✦ Still filling in their profile.</span> Families at this stage are open — reach out first and build the relationship early.
            </p>
          </div>
        )}
        {cardState === "minimal" && (
          <div className="bg-amber-50/70 border border-amber-100/60 rounded-lg px-3.5 py-3 mb-4">
            <p className="text-sm text-amber-900/80 leading-relaxed">
              <span className="font-semibold">✦ Early in their journey.</span> The provider who reaches out first — warmly, with no pressure — builds the relationship that leads to a placement.
            </p>
          </div>
        )}

        {/* TAGS ROW (Full + Partial only) */}
        {cardState !== "minimal" && (careNeeds.length > 0 || whoNeedsCare) && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {careNeeds.slice(0, 3).map((need) => (
              <span
                key={need}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full border border-gray-200/60"
              >
                {need}
              </span>
            ))}
            {whoNeedsCare && (
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full border border-gray-200/60">
                {whoNeedsCare}
              </span>
            )}
          </div>
        )}

        {/* PAYS WITH ROW (Full only) */}
        {cardState === "full" && paymentMethods.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 shrink-0">Pays with:</span>
            <div className="flex flex-wrap gap-1.5">
              {paymentMethods.slice(0, 3).map((method) => (
                <span
                  key={method}
                  className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full border border-gray-200/60"
                >
                  {method}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM ROW */}
      <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
        {/* Completeness chip with tooltip */}
        <div className="relative flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: completenessColors.dot }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: completenessColors.text }}
          >
            {completeness}% complete
          </span>
          <button
            type="button"
            className="relative flex items-center justify-center w-[15px] h-[15px] rounded-full border text-[9px] font-medium leading-none transition-colors hover:bg-gray-50"
            style={{ borderColor: completenessColors.border, color: completenessColors.text }}
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
            onClick={(e) => e.stopPropagation()}
            aria-label="View shared details"
          >
            i
          </button>

          {/* Tooltip - Dynamic content based on profile state */}
          {showTooltip && (
            <div
              className="absolute bottom-full left-0 mb-2 z-50"
              style={{ minWidth: "220px", maxWidth: "260px" }}
            >
              <div
                className="relative bg-[#141918] text-white rounded-[7px] px-3 py-2.5 shadow-lg"
                style={{ fontSize: "11px", lineHeight: "1.6" }}
              >
                {/* FULL PROFILE */}
                {cardState === "full" && (
                  <>
                    <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                      Match quality
                    </p>
                    <p className="text-white/90 mb-2.5">
                      {matchingServices.length > 0 ? (
                        <>Strong match — needs {matchingServices.length} {matchingServices.length === 1 ? "service" : "services"} you offer.</>
                      ) : (
                        <>Strong match — detailed profile shared.</>
                      )}
                    </p>
                    <div className="border-t border-white/10 pt-2.5">
                      <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                        Tip
                      </p>
                      <p className="text-white/70">
                        Reference their care needs in your message — they&apos;ve shared enough for a personalized intro.
                      </p>
                    </div>
                  </>
                )}

                {/* PARTIAL PROFILE */}
                {cardState === "partial" && (
                  <>
                    <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                      Match quality
                    </p>
                    <p className="text-white/90 mb-2.5">
                      Potential match — still filling in their profile.
                    </p>
                    <div className="border-t border-white/10 pt-2.5">
                      <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                        Tip
                      </p>
                      <p className="text-white/70">
                        Ask what matters most to them. Families at this stage are open to conversation.
                      </p>
                    </div>
                  </>
                )}

                {/* MINIMAL PROFILE */}
                {cardState === "minimal" && (
                  <>
                    <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                      Match quality
                    </p>
                    <p className="text-white/90 mb-2.5">
                      New lead — just getting started.
                    </p>
                    <div className="border-t border-white/10 pt-2.5">
                      <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                        Tip
                      </p>
                      <p className="text-white/70">
                        Keep it warm and pressure-free. Early outreach builds trust before they&apos;ve talked to anyone else.
                      </p>
                    </div>
                  </>
                )}

                {/* Arrow pointing down-left */}
                <div
                  className="absolute -bottom-1.5 left-3 w-0 h-0"
                  style={{
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: "6px solid #141918",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Competition indicator */}
        {reachOutCount === 0 ? (
          <span className="text-sm font-medium text-[#2a7a6e]">
            ✦ Be the first to connect
          </span>
        ) : (
          <span className="text-sm text-gray-400">
            {reachOutCount} provider{reachOutCount !== 1 ? "s" : ""} contacted
          </span>
        )}
      </div>

      {/* Animation keyframes and hover styles */}
      <style jsx>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .card-hover-shadow {
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .card-hover-shadow:hover {
          box-shadow: 0 4px 12px rgba(42, 122, 110, 0.08);
        }
      `}</style>
    </div>
  );
}

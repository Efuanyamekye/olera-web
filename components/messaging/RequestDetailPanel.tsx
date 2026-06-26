"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import type { ConnectionWithProfile } from "./ConversationList";

interface RequestDetailPanelProps {
  connection: ConnectionWithProfile | null;
  onConnect: (connectionId: string) => Promise<void>;
  onDecline: (connectionId: string) => Promise<void>;
  onBack?: () => void;
  className?: string;
}

/** Deterministic gradient for fallback avatars */
function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #0ea5e9, #6366f1)",
    "linear-gradient(135deg, #14b8a6, #0ea5e9)",
    "linear-gradient(135deg, #8b5cf6, #ec4899)",
    "linear-gradient(135deg, #f59e0b, #ef4444)",
    "linear-gradient(135deg, #10b981, #14b8a6)",
    "linear-gradient(135deg, #6366f1, #a855f7)",
    "linear-gradient(135deg, #ec4899, #f43f5e)",
    "linear-gradient(135deg, #0891b2, #2dd4bf)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

/** Format category for display */
function formatCategory(type: string | null | undefined, category?: string | null): string {
  const value = type || category;
  if (!value) return "Care Provider";
  const labels: Record<string, string> = {
    organization: "Care Agency",
    caregiver: "Independent Caregiver",
    home_care: "Home Care Agency",
    assisted_living: "Assisted Living",
    memory_care: "Memory Care",
    nursing_home: "Nursing Home",
  };
  return labels[value] || value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract message from connection */
function getProviderMessage(connection: ConnectionWithProfile): string | null {
  // Check metadata for the message first
  const meta = connection.metadata as Record<string, unknown> | undefined;
  if (meta?.message && typeof meta.message === "string") {
    return meta.message;
  }

  // Check connection.message field
  if (connection.message) {
    try {
      const parsed = JSON.parse(connection.message);
      if (parsed.message || parsed.note || parsed.additional_notes) {
        return parsed.message || parsed.note || parsed.additional_notes;
      }
    } catch {
      // Plain text message
      return connection.message;
    }
  }

  // Fall back to auto-intro from metadata
  if (meta?.auto_intro && typeof meta.auto_intro === "string") {
    return meta.auto_intro;
  }

  return null;
}

/** Format relative time */
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Render star rating */
function StarRating({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${
              star <= fullStars
                ? "text-amber-400"
                : star === fullStars + 1 && hasHalfStar
                ? "text-amber-400"
                : "text-gray-200"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-sm text-gray-500">
        {rating.toFixed(1)} · {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
      </span>
    </div>
  );
}

export default function RequestDetailPanel({
  connection,
  onConnect,
  onDecline,
  onBack,
  className = "",
}: RequestDetailPanelProps) {
  const [connecting, setConnecting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());

  // Mark the request as viewed when displayed (clears navbar badge)
  useEffect(() => {
    if (!connection) return;

    const connectionId = connection.id;
    const meta = connection.metadata as Record<string, unknown> | undefined;

    // Skip if already viewed (locally or in DB)
    if (viewedRef.current.has(connectionId) || meta?.viewed) return;

    // Mark as viewed locally to prevent duplicate calls
    viewedRef.current.add(connectionId);

    // Call API to mark as viewed in database
    fetch("/api/connections/respond-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, action: "view" }),
    }).catch((err) => {
      console.error("[RequestDetailPanel] Failed to mark as viewed:", err);
    });

    // Dispatch event so navbar badge updates immediately
    window.dispatchEvent(
      new CustomEvent("olera:interested-viewed", { detail: { connectionId } })
    );
  }, [connection]);

  // Empty state when no connection selected
  if (!connection) {
    return (
      <div className={`flex flex-col bg-gray-50/50 ${className}`}>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-gray-900 mb-1">Select a request</p>
            <p className="text-sm text-gray-500">Choose a request to view details</p>
          </div>
        </div>
      </div>
    );
  }

  // Provider is the one who initiated (from_profile)
  const provider = connection.fromProfile;

  if (!provider) {
    return (
      <div className={`flex flex-col bg-gray-50/50 ${className}`}>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-gray-900 mb-1">Provider unavailable</p>
            <p className="text-sm text-gray-500">This provider&apos;s information couldn&apos;t be loaded</p>
          </div>
        </div>
      </div>
    );
  }

  const name = provider.display_name || "Care Provider";
  const initials = name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const category = formatCategory(provider.type, provider.category);
  const location = [provider.city, provider.state].filter(Boolean).join(", ");
  const careTypes = provider.care_types || [];
  const message = getProviderMessage(connection);
  const profileSlug = provider.slug;
  const requestTime = formatRelativeTime(connection.created_at);

  // Get rating from metadata if available
  const meta = provider.metadata as Record<string, unknown> | undefined;
  const rating = (meta?.avg_rating as number) || (meta?.rating as number) || null;
  const reviewCount = (meta?.review_count as number) || (meta?.reviews as number) || 0;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect(connection.id);
    } finally {
      setConnecting(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await onDecline(connection.id);
    } finally {
      setDeclining(false);
    }
  };

  return (
    <div className={`flex flex-col bg-white ${className}`}>
      {/* Mobile back button */}
      {onBack && (
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[15px] font-semibold text-gray-900">Request Details</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 lg:p-10">
          {/* Provider Card */}
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden mb-8">
            {/* Card header with subtle background */}
            <div className="bg-gradient-to-b from-gray-50 to-white px-6 pt-6 pb-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                {provider.image_url ? (
                  <Image
                    src={provider.image_url}
                    alt={name}
                    width={72}
                    height={72}
                    className="w-[72px] h-[72px] rounded-2xl object-cover border border-gray-200/60 shadow-sm"
                  />
                ) : (
                  <div
                    className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-sm"
                    style={{ background: avatarGradient(name) }}
                  >
                    {initials}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h2 className="text-xl font-semibold text-gray-900">{name}</h2>
                    {(provider.verification_state === "verified" || provider.verification_state === "not_required") && (
                      <svg className="w-5 h-5 text-primary-600 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="Verified business">
                        <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className="text-[15px] text-gray-500 mb-2">
                    {category}{location ? ` · ${location}` : ""}
                  </p>

                  {/* Rating */}
                  {rating && rating > 0 ? (
                    <StarRating rating={rating} reviewCount={reviewCount} />
                  ) : null}
                </div>
              </div>
            </div>

            {/* Care type pills */}
            {careTypes.length > 0 && (
              <div className="px-6 pb-5">
                <div className="flex flex-wrap gap-2">
                  {careTypes.map((type) => (
                    <span
                      key={type}
                      className="px-3 py-1.5 text-[13px] font-medium text-gray-600 bg-gray-100/80 border border-gray-200/60 rounded-full"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Their Message Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Their Message
              </h3>
              <span className="text-xs text-gray-400">{requestTime}</span>
            </div>

            {message ? (
              <div className="relative">
                {/* Quote decoration */}
                <div className="absolute -left-1 top-0 bottom-0 w-1 bg-primary-200 rounded-full" />
                <blockquote className="pl-5 text-[15px] text-gray-700 leading-relaxed">
                  {message}
                </blockquote>
              </div>
            ) : (
              <p className="text-[15px] text-gray-400 italic pl-5 border-l-2 border-gray-100">
                No message provided
              </p>
            )}
          </div>

          {/* View full profile link */}
          {profileSlug && (
            <Link
              href={`/provider/${profileSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 text-[15px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              View full profile
              <svg
                className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Action buttons - sticky at bottom */}
      <div className="shrink-0 border-t border-gray-100 bg-white">
        <div className="max-w-xl mx-auto p-4 lg:p-6">
          <div className="flex gap-3">
            {/* Not a fit - left, outlined */}
            <button
              onClick={handleDecline}
              disabled={declining || connecting}
              className="flex-1 px-6 py-3.5 text-[15px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {declining ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Declining...
                </span>
              ) : (
                "Not a fit"
              )}
            </button>

            {/* Connect - right, primary */}
            <button
              onClick={handleConnect}
              disabled={connecting || declining}
              className="flex-1 px-6 py-3.5 text-[15px] font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-700 active:bg-primary-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {connecting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </span>
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

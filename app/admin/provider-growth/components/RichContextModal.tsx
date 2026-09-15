"use client";

/**
 * RichContextModal - AI-generated sales briefing modal
 *
 * Shows a comprehensive briefing synthesized from all available provider data.
 * Clean, light theme with metrics grid, tags, and structured sections.
 */

import { useState, useEffect, useCallback } from "react";
import type { BriefingResponse } from "@/app/api/admin/provider-growth/[id]/briefing/route";

interface RichContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackingId: string;
  providerName: string;
}

interface BriefingData {
  briefing: BriefingResponse;
  generatedAt: string;
  cached: boolean;
  metrics?: {
    googleRating: number | null;
    googleReviewCount: number;
    photoCount: number;
    adSpendCents: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
        {label}
      </div>
      {subtext && (
        <div className="text-xs text-gray-400 mt-0.5">{subtext}</div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
      {children}
    </span>
  );
}

function Section({
  title,
  borderColor,
  children,
}: {
  title: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-l-4 ${borderColor} pl-4 py-2`}>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function QuotedScript({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded px-3 py-2 text-sm text-gray-700 italic">
      &ldquo;{children}&rdquo;
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Metrics skeleton */}
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-100 rounded-lg p-3 h-16" />
        ))}
      </div>
      {/* Tags skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-100 rounded-full h-6 w-24" />
        ))}
      </div>
      {/* Sections skeleton */}
      <div className="space-y-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="border-l-4 border-gray-200 pl-4 py-2">
            <div className="h-4 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-8 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function RichContextModal({
  isOpen,
  onClose,
  trackingId,
  providerName,
}: RichContextModalProps) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const fetchBriefing = useCallback(async (regenerate = false) => {
    if (regenerate) {
      setRegenerating(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const url = `/api/admin/provider-growth/${trackingId}/briefing${regenerate ? "?regenerate=true" : ""}`;
      const res = await fetch(url);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load briefing");
      }

      const result = await res.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load briefing");
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [trackingId]);

  useEffect(() => {
    if (isOpen && !data && !loading) {
      fetchBriefing();
    }
  }, [isOpen, data, loading, fetchBriefing]);

  // Reset state when modal opens with different provider
  useEffect(() => {
    if (isOpen) {
      setData(null);
      setError(null);
    }
  }, [trackingId, isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const briefing = data?.briefing;
  const metrics = data?.metrics;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/20"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col border border-gray-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Sales Briefing
              </h2>
              <p className="text-sm text-gray-500">{providerName}</p>
            </div>
            <div className="flex items-center gap-2">
              {data && (
                <>
                  {data.cached && (
                    <span className="text-xs text-gray-400">
                      Generated {formatRelativeTime(data.generatedAt)}
                    </span>
                  )}
                  <button
                    onClick={() => fetchBriefing(true)}
                    disabled={regenerating}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {regenerating ? "Regenerating..." : "Regenerate"}
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && <LoadingSkeleton />}

            {error && (
              <div className="text-center py-8">
                <div className="text-red-600 mb-4">{error}</div>
                <button
                  onClick={() => fetchBriefing()}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Try Again
                </button>
              </div>
            )}

            {briefing && metrics && (
              <div className="space-y-6">
                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-3">
                  <MetricCard
                    label="Google Rating"
                    value={metrics.googleRating?.toFixed(1) ?? "N/A"}
                  />
                  <MetricCard
                    label="Google Reviews"
                    value={metrics.googleReviewCount}
                  />
                  <MetricCard
                    label="Photos"
                    value={metrics.photoCount}
                  />
                  <MetricCard
                    label="Our Spend"
                    value={`$${Math.round(metrics.adSpendCents / 100)}`}
                  />
                </div>

                {/* Tags */}
                {briefing.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {briefing.tags.map((tag, i) => (
                      <Tag key={i}>{tag}</Tag>
                    ))}
                  </div>
                )}

                {/* THE ONE FIX */}
                <Section title="The One Fix" borderColor="border-amber-400">
                  <p className="text-gray-900 text-sm">{briefing.theOneFix}</p>
                </Section>

                {/* WHAT WE OWE THEM */}
                {briefing.whatWeOweThem && (
                  <Section title="What We Owe Them" borderColor="border-rose-400">
                    <p className="text-gray-900 text-sm">{briefing.whatWeOweThem}</p>
                  </Section>
                )}

                {/* OPEN WITH */}
                <Section title="Open With" borderColor="border-teal-400">
                  <div className="space-y-2">
                    {briefing.openWith.map((script, i) => (
                      <QuotedScript key={i}>{script}</QuotedScript>
                    ))}
                  </div>
                </Section>

                {/* GET THESE */}
                <Section title="Get These" borderColor="border-gray-300">
                  <ul className="space-y-1.5">
                    {briefing.getThese.map((question, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-gray-400 mt-0.5">•</span>
                        {question}
                      </li>
                    ))}
                  </ul>
                </Section>

                {/* OFFER */}
                <Section title="Offer" borderColor="border-gray-300">
                  <p className="text-gray-900 text-sm">{briefing.offer}</p>
                </Section>

                {/* LOG */}
                <Section title="Log" borderColor="border-gray-200">
                  <div className="bg-gray-50 border border-gray-100 rounded px-3 py-2 font-mono text-xs text-gray-600">
                    {briefing.logAfterCall}
                  </div>
                </Section>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

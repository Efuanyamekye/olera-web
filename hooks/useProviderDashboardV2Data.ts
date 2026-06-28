"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shape returned by GET /api/provider/dashboard. See that route for the
 * authoritative comments on each field.
 */
export interface ProviderDashboardV2Data {
  profile: {
    id: string;
    slug: string;
    source_provider_id: string | null;
    display_name: string | null;
    city: string | null;
    state: string | null;
    category: string | null;
  };
  window: "7d" | "30d" | "90d";
  greeting: {
    unansweredQuestions: number;
    fiveMostRecentUnanswered: Array<{
      id: string;
      question: string;
      askerName: string | null;
      createdAt: string;
    }>;
    viewsThisPeriod: number;
    viewsPriorPeriod: number;
    deltaPct: number | null;
    newLeadsThisPeriod: number;
  };
  reviews: {
    count: number;
    avgRating: number | null;
    oleraCount: number;
    googleCount: number;
    googleRating: number | null;
  };
  responseRate: {
    totalQuestions: number;
    answeredCount: number;
    windowDays: number;
  };
  /** All-time question counts for the persistent Questions card. `received` and
   *  `answered` are lifetime (capped at the last 500); `unanswered` matches the
   *  hero banner / Q&A queue's action number. */
  questions: {
    received: number;
    answered: number;
    unanswered: number;
  };
  recentActivity: Array<{
    id: string;
    kind: "question" | "question_answered" | "lead" | "review";
    timestamp: string;
    title: string;
    detail?: string;
    actionHref?: string;
    actorName?: string;
  }>;
  views: {
    thisPeriod: number;
    priorPeriod: number;
    deltaPct: number | null;
    lifetime: number;
  };
  cohort: {
    scope: "near" | "state" | null;
    demand: number;
    radiusMiles?: number;
  };
  /** Count of published care-seekers with an active care_post within ~50mi of
   *  the provider — the rare "concrete leads" that drive the hero's
   *  high-priority "family near you" tier. */
  nearbyFamilies: { count: number };
  /** True if the provider has an active ad boost request (pending_profile,
   *  requested, scheduled, or live). Drives banner prioritization — shows
   *  reviews banner instead of managed_ads when they already have a launch plan. */
  hasActiveBoostRequest: boolean;
}

/**
 * Fetches the unified provider dashboard payload via the session cookie.
 *
 * `enabled` gates the fetch (so FF-off providers don't pay for a round-trip).
 *
 * `userId` is used as a fetch dependency — when auth resolves and the user id
 * becomes available, we refetch. This covers the common first-load race:
 * the session cookie isn't set at mount time, the first fetch 401s, but the
 * session cookie lands a moment later and a retry succeeds. Without this,
 * the new dashboard pillars stayed invisible until the user reloaded.
 */
export function useProviderDashboardV2Data(
  window: "7d" | "30d" | "90d" = "30d",
  enabled = true,
  userId?: string | null,
) {
  const [data, setData] = useState<ProviderDashboardV2Data | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/provider/dashboard?window=${window}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          // Transient — session cookie may not be set yet. Keep loading=true
          // so the caller's skeleton stays visible; the userId dep will
          // trigger a retry when auth resolves.
          setError("auth-pending");
          return;
        }
        setError("Failed to load");
        setLoading(false);
        return;
      }
      const json = (await res.json()) as ProviderDashboardV2Data;
      setData(json);
      setError(null);
      setLoading(false);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }, [window, enabled]);

  useEffect(() => {
    fetchData();
    // Include userId as a dep so auth resolving from `null → uuid` triggers
    // a refetch. This is what turns first-load-401 into eventual success.
  }, [fetchData, userId]);

  return { data, loading, error, refetch: fetchData };
}

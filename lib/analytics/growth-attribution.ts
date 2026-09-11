import { classifyOrganicPage } from "@/lib/analytics/content-pages";
import { getOrCreateSessionId, getOrCreateVisitId } from "@/lib/analytics/session";
import { isPreviewMode } from "@/lib/analytics/preview-mode";

export type GrowthClientEvent =
  | "page_landed"
  | "cta_visible"
  | "cta_engaged"
  | "lead_started"
  | "contact_intent"
  // Added for the /care/{city} landing A/B test. FOUR allowlists gate a growth
  // event and ALL FOUR have to know about a new one:
  //   1. this union
  //   2. CLIENT_EVENTS in app/api/activity/track-growth/route.ts  (a 400)
  //   3. the CHECK on growth_attribution_events.event_type        (silent drop)
  //   4. the safeMetadata allowlist in that same route            (silent drop)
  //
  // This comment said THREE until 11 Sep, and the missing fourth is what let
  // the landing arms ship dropping their own `arm` tag on every event. Only
  // (2) announces itself; the other two silent ones are silent because the
  // fetch below swallows its own errors by design.
  | "question_viewed"
  | "provider_expanded";

/**
 * Categories that are NOT organic pages and so are never returned by
 * classifyOrganicPage(). A caller passes one explicitly to opt a page into
 * growth tracking without it entering the organic reporting path.
 */
export type NonOrganicPageCategory = "city_landing";

interface TrackGrowthEventInput {
  eventType: GrowthClientEvent;
  pagePath?: string;
  ctaId?: string;
  ctaSurface?: string;
  metadata?: Record<string, unknown>;
  /**
   * Explicit category for pages the organic classifier deliberately rejects —
   * today only the paid /care/{city} landings. Leave unset for organic pages so
   * classifyOrganicPage stays the single source of truth for those.
   */
  pageCategory?: NonOrganicPageCategory;
}

/**
 * Shared client entry point for first-party growth attribution. It deliberately
 * stays fire-and-forget: measurement must never delay a family seeking care.
 */
export function trackGrowthEvent(input: TrackGrowthEventInput): void {
  if (typeof window === "undefined" || isPreviewMode()) return;
  const pagePath = input.pagePath || window.location.pathname;
  const pageCategory = input.pageCategory ?? classifyOrganicPage(pagePath);
  if (!pageCategory) return;

  const sp = new URLSearchParams(window.location.search);
  fetch("/api/activity/track-growth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      anonymous_id: getOrCreateSessionId(),
      visit_id: getOrCreateVisitId(),
      event_type: input.eventType,
      page_path: pagePath,
      page_category: pageCategory,
      cta_id: input.ctaId || null,
      cta_surface: input.ctaSurface || null,
      metadata: {
        ...(input.metadata || {}),
        ...(input.eventType === "page_landed" ? {
          referrer: document.referrer,
          utm_source: sp.get("utm_source") || null,
          utm_medium: sp.get("utm_medium") || null,
          utm_campaign: sp.get("utm_campaign") || null,
          gclid: sp.has("gclid"),
        } : {}),
      },
    }),
    keepalive: true,
  }).catch(() => {});
}

"use client";

import { useEffect } from "react";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import { readArrivalParams } from "@/lib/analytics/arrival-params";
import { trackGrowthEvent } from "@/lib/analytics/growth-attribution";

interface ContentViewTrackerProps {
  /**
   * Canonical path for this page, passed explicitly rather than read from
   * window.location. Callers already know it server-side, and hard-coding it
   * keeps one page from splitting into several `page` values over trailing
   * slashes, query strings, or casing.
   */
  page: string;
}

/**
 * Fire-and-forget page_view event for public content pages — the benefits
 * hub/state/program tree and the caregiver-support editorial tree.
 *
 * Deliberately mirrors components/analytics/ViewTracker.tsx (the provider-page
 * equivalent): same cookie-backed session id, same webdriver skip, same
 * keepalive fetch, same silent failure. The admin Overview counts these rows
 * next to Provider Page Views, so any divergence in how a view is defined
 * would make those cards quietly incomparable.
 *
 * Client-side because these pages are static/ISR — server code doesn't run on
 * cached hits. Mounting in the browser also filters most non-JS bots; the
 * server-side bot filter in the track route is the safety net.
 */
export function ContentViewTracker({ page }: ContentViewTrackerProps) {
  useEffect(() => {
    if (!page) return;
    if (typeof navigator !== "undefined" && (navigator as Navigator & { webdriver?: boolean }).webdriver) {
      return;
    }

    const session_id = getOrCreateSessionId();
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    trackGrowthEvent({ eventType: "page_landed", pagePath: page });

    // Every acquisition signal the channel classifier needs, same set the
    // provider ViewTracker stamps. Recording a subset is how an auto-tagged
    // Google Ads click ends up counted as organic search.
    const arrival = readArrivalParams();

    fetch("/api/activity/track-page-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page,
        event_type: "page_view",
        session_id,
        metadata: { referrer, ...arrival },
      }),
      keepalive: true,
    }).catch(() => {
      // Silent. Never block the page on analytics.
    });
  }, [page]);

  // Capture the contact actions that can happen without an Olera form. A
  // phone/mail click is intent—not a confirmed lead—and is deliberately kept
  // in its own metric. Other links opt in with data-growth-contact or
  // data-growth-cta so ordinary citations do not inflate the funnel.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = link.getAttribute("href") || "";
      const contactKind = link.dataset.growthContact
        || (href.startsWith("tel:") ? "phone" : href.startsWith("mailto:") ? "email" : null);
      if (contactKind) {
        trackGrowthEvent({
          eventType: "contact_intent",
          pagePath: page,
          ctaId: link.dataset.growthCta || `contact_${contactKind}`,
          ctaSurface: link.dataset.growthSurface || "content",
          metadata: { contact_kind: contactKind },
        });
        return;
      }
      if (link.dataset.growthCta) {
        trackGrowthEvent({
          eventType: "cta_engaged",
          pagePath: page,
          ctaId: link.dataset.growthCta,
          ctaSurface: link.dataset.growthSurface || "content",
        });
      }
    }
    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [page]);

  return null;
}

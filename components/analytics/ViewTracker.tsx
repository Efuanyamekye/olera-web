"use client";

import { useEffect } from "react";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import { readArrivalParams } from "@/lib/analytics/arrival-params";
import { trackGrowthEvent } from "@/lib/analytics/growth-attribution";

interface ViewTrackerProps {
  providerId: string;
}

/**
 * Fire-and-forget page_view event for the public provider page.
 *
 * Lives client-side because the provider page is RSC + ISR (revalidate=3600) —
 * server code doesn't run on cached hits. Client-side mounts on every visit
 * and naturally filters most non-JS-executing bots; server-side bot filter
 * (lib/analytics/bot-filter) is the safety net.
 */
export function ViewTracker({ providerId }: ViewTrackerProps) {
  useEffect(() => {
    if (!providerId) return;
    if (typeof navigator !== "undefined" && (navigator as Navigator & { webdriver?: boolean }).webdriver) {
      return;
    }

    const session_id = getOrCreateSessionId();
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const path = typeof window !== "undefined" ? window.location.pathname : "";

    // First-party conversion denominator. Kept alongside the legacy
    // provider_activity page_view until the existing provider analytics cards
    // are intentionally migrated.
    trackGrowthEvent({ eventType: "page_landed", pagePath: path });

    // Every acquisition signal the channel classifier needs. utm_source and
    // utm_campaign were already here for per-campaign attribution; medium,
    // gclid and ref are what separate paid from organic and owned from
    // direct.
    const arrival = readArrivalParams();

    fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_type: "anonymous",
        event_type: "page_view",
        related_provider_id: providerId,
        session_id,
        metadata: { referrer, path, ...arrival },
      }),
      keepalive: true,
    }).catch(() => {
      // Silent. Never block the page on analytics.
    });
  }, [providerId]);

  useEffect(() => {
    function handleContactClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("tel:") && !href.startsWith("mailto:")) return;
      trackGrowthEvent({
        eventType: "contact_intent",
        pagePath: window.location.pathname,
        ctaId: href.startsWith("tel:") ? "contact_phone" : "contact_email",
        ctaSurface: "provider",
        metadata: { contact_kind: href.startsWith("tel:") ? "phone" : "email" },
      });
    }
    document.addEventListener("click", handleContactClick, { capture: true });
    return () => document.removeEventListener("click", handleContactClick, { capture: true });
  }, []);

  return null;
}

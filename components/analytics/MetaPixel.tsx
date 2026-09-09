"use client";

import Script from "next/script";
import { META_PIXEL_ID, isMetaPixelConfigured } from "@/lib/city-ads/meta";

/**
 * Meta pixel, mounted ONLY on /care/{city}. Read the scope note in
 * lib/city-ads/meta.ts before mounting this anywhere else — it does not belong
 * in the root layout.
 *
 * Renders nothing and loads nothing until NEXT_PUBLIC_META_PIXEL_ID is set, so
 * this can ship ahead of the dataset existing in Events Manager.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void };
    _fbq?: unknown;
  }
}

export function MetaPixel() {
  if (!isMetaPixelConfigured()) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window,document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${META_PIXEL_ID}');
      fbq('track', 'PageView');`}
    </Script>
  );
}

/**
 * Fire the Lead conversion for a submitted city request.
 *
 * `eventId` must be the same id the server hands to the Conversions API for
 * this lead, or Meta counts one submission as two conversions — which on a
 * volume-starved campaign would halve the apparent cost per lead and wreck the
 * 20 Sep read. No care details are passed; see lib/city-ads/meta.ts.
 *
 * Best effort by design: if the pixel is blocked, the server-side CAPI call
 * still records the conversion.
 */
export function trackMetaLead(eventId: string): void {
  try {
    if (typeof window.fbq !== "function") return;
    window.fbq("track", "Lead", {}, { eventID: eventId });
  } catch {
    /* a blocked pixel must never break the confirmation screen */
  }
}

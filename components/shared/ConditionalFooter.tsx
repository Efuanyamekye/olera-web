"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";
import SimpleFooter from "./SimpleFooter";

/**
 * Renders the appropriate footer based on page context:
 *  - Inbox views: no footer
 *  - Hub / account pages: simple legal-only footer
 *  - Marketing / public pages: full footer
 */
export default function ConditionalFooter() {
  const pathname = usePathname();

  // Admin, inbox, onboarding, claim wizard, removal request, match detail, and MedJobs forms — no footer
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/portal/inbox") ||
    pathname.startsWith("/provider/inbox") ||
    pathname.startsWith("/provider/onboarding") ||
    pathname.startsWith("/for-providers/claim") ||
    pathname.startsWith("/for-providers/removal-request") ||
    pathname.startsWith("/for-providers/dispute") ||
    pathname.startsWith("/medjobs/apply") ||
    pathname.startsWith("/medjobs/submit-video") ||
    pathname.match(/^\/portal\/matches\/[^/]+$/)
  ) {
    return null;
  }

  // Hub / account pages — simple footer (legal bar only)
  if (
    pathname.startsWith("/portal") ||
    pathname.startsWith("/provider")
  ) {
    return <SimpleFooter />;
  }

  // MedJobs pages — full footer but skip the senior care discovery zone
  const hidePrefooter = pathname.startsWith("/medjobs");

  return <Footer hideDiscoveryZone={hidePrefooter} />;
}

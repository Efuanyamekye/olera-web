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

  // Inbox, onboarding, and match detail — no footer
  if (
    pathname.startsWith("/portal/inbox") ||
    pathname.startsWith("/provider/inbox") ||
    pathname.startsWith("/provider/onboarding") ||
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

  // Everything else — full marketing footer
  return <Footer />;
}

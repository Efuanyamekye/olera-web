"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";
import SimpleFooter from "./SimpleFooter";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Renders the appropriate footer based on page context:
 *  - Inbox views: no footer
 *  - Hub / account pages: simple legal-only footer (desktop only for providers)
 *  - Marketing / public pages: full footer
 */
export default function ConditionalFooter() {
  const pathname = usePathname();
  const { activeProfile } = useAuth();
  const isProvider = activeProfile?.type === "organization";

  // Admin, inbox, onboarding, claim wizard, removal request, match detail, MedJobs
  // forms, and unsubscribe confirmations — no footer. These are terminal/utility
  // pages; the marketing footer + SEO city grid is noise (and cramped on mobile).
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/portal/inbox") ||
    pathname.startsWith("/provider/inbox") ||
    pathname.startsWith("/provider/onboarding") ||
    pathname.startsWith("/for-providers/removal-request") ||
    pathname.startsWith("/for-providers/dispute") ||
    pathname.startsWith("/medjobs/apply") ||
    pathname.startsWith("/medjobs/submit-video") ||
    pathname.startsWith("/unsubscribe") ||
    pathname.match(/^\/portal\/matches\/[^/]+$/)
  ) {
    return null;
  }

  // Logged-in providers get SimpleFooter on desktop only.
  // On mobile, footer is hidden for all variants - screen real estate is tight
  // and support/legal links can be accessed via settings.
  if (isProvider) {
    return (
      <div className="hidden lg:block">
        <SimpleFooter />
      </div>
    );
  }

  // Hub / account pages for non-providers — simple footer (legal bar only)
  if (
    pathname.startsWith("/portal") ||
    pathname.startsWith("/provider") ||
    pathname.startsWith("/account")
  ) {
    return <SimpleFooter />;
  }

  // MedJobs, senior-benefits, and /welcome — skip the senior care discovery zone pre-footer
  // (welcome users are mid-flow; the generic city browser is noise)
  const hidePrefooter =
    pathname.startsWith("/medjobs") ||
    pathname.startsWith("/senior-benefits") ||
    pathname === "/welcome";

  return <Footer hideDiscoveryZone={hidePrefooter} />;
}

"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";
import SimpleFooter from "./SimpleFooter";
import { useMobileNavVariant } from "@/hooks/use-mobile-nav-variant";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Renders the appropriate footer based on page context:
 *  - Inbox views: no footer
 *  - Hub / account pages: simple legal-only footer
 *  - Marketing / public pages: full footer
 *  - Mobile provider pages with bottom_tabs: no footer (bottom tabs replace it)
 */
export default function ConditionalFooter() {
  const pathname = usePathname();
  const mobileNavVariant = useMobileNavVariant();
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

  // Logged-in providers get SimpleFooter on ALL pages (not just hub)
  // For bottom_tabs variant: hide on mobile, show on desktop
  // For current variant: show SimpleFooter everywhere
  // When variant is null (brief moment during navigation), default to hidden on mobile
  // to prevent layout shift - better to briefly hide than briefly show
  if (isProvider) {
    const hideOnMobile = mobileNavVariant !== "current";
    return (
      <div className={hideOnMobile ? "hidden lg:block" : undefined}>
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

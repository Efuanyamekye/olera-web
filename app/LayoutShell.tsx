"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/shared/Navbar";
import ConditionalFooter from "@/components/shared/ConditionalFooter";
import GlobalUnifiedAuthModal from "@/components/auth/GlobalUnifiedAuthModal";
import { NavbarProvider } from "@/components/shared/NavbarContext";
import { useMobileNavVariant } from "@/hooks/use-mobile-nav-variant";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Client-side layout shell that conditionally renders navbar/footer
 * based on the current route. Standalone pages like /welcome opt out.
 */
const STANDALONE_ROUTES: string[] = ["/review", "/caregiver/apply"];

// Provider portal routes where bottom tabs appear (must match Navbar's isProviderPortal logic EXACTLY)
// Note: /provider/[slug] detail pages are NOT included - they don't show bottom tabs
const PROVIDER_PORTAL_ROUTES = [
  "/provider/connections",
  "/provider/inbox",
  "/provider/onboarding",
  "/provider/profile",
  "/provider/reviews",
  "/provider/matches",
  "/provider/growth",
  "/provider/boost",
  "/provider/pro",
  "/provider/qna",
  "/provider/account",
  "/provider/medjobs",
  "/provider/caregivers",
  "/provider/welcome",
];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mobileNavVariant = useMobileNavVariant();
  const { activeProfile } = useAuth();
  const isStandalone = STANDALONE_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));

  // Check if bottom tabs are visible (provider portal with bottom_tabs variant)
  // Must match Navbar's isProviderPortal logic exactly to avoid spacer without tabs
  const isOrg = activeProfile?.type === "organization";
  const isProviderPortal =
    pathname === "/provider" ||
    PROVIDER_PORTAL_ROUTES.some(route => pathname.startsWith(route)) ||
    (pathname.startsWith("/provider/") && pathname.endsWith("/onboard")) ||
    (pathname.startsWith("/medjobs/candidates") && isOrg) ||
    (pathname.startsWith("/account") && isOrg) ||
    (pathname.startsWith("/portal/inbox") && isOrg);

  if (isStandalone) {
    return (
      <>
        {children}
        <GlobalUnifiedAuthModal />
      </>
    );
  }

  return (
    <NavbarProvider>
      <Navbar />
      <main className="flex-grow">{children}</main>
      {/* Spacer for bottom tabs - ensures content isn't hidden behind fixed nav.
          Always render on provider portal routes to prevent layout shift during navigation.
          Height transitions smoothly if variant changes. */}
      {isProviderPortal && (
        <div
          className="lg:hidden"
          style={{
            height: mobileNavVariant === "bottom_tabs"
              ? "calc(72px + env(safe-area-inset-bottom, 0px))"
              : "0px",
            transition: "height 0.15s ease-out",
          }}
          aria-hidden="true"
        />
      )}
      <ConditionalFooter />
      <GlobalUnifiedAuthModal />
    </NavbarProvider>
  );
}

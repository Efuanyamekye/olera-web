"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useAuth } from "@/components/auth/AuthProvider";
import FindCareMegaMenu from "@/components/shared/FindCareMegaMenu";
import { CARE_CATEGORIES, NAV_LINKS } from "@/components/shared/NavMenuData";
import { useNavbar } from "@/components/shared/NavbarContext";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import { useUnreadInboxCount } from "@/hooks/useUnreadInboxCount";
import { useUnreadQnACount } from "@/hooks/useUnreadQnACount";
import { useUnreadReviewsCount } from "@/hooks/useUnreadReviewsCount";
import { useUnreadLeadsCount } from "@/hooks/useUnreadLeadsCount";
import { useInterestedProviders } from "@/hooks/useInterestedProviders";
import { useMobileNavVariant } from "@/hooks/use-mobile-nav-variant";
import MobileBottomTabs from "@/components/shared/MobileBottomTabs";
import MoreBottomSheet from "@/components/shared/MoreBottomSheet";
import { trackProviderEvent } from "@/lib/analytics/track-provider-event";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFindCareOpen, setIsFindCareOpen] = useState(false);
  const megaMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobileCareOpen, setIsMobileCareOpen] = useState(false);
  // Mobile accordion states — only one open at a time
  const [mobileAccordion, setMobileAccordion] = useState<"account" | "discover" | "hub" | "settings" | null>(null);
  // Mobile menu mode — tracks which portal view is shown (separate from actual URL context)
  const [mobileMenuMode, setMobileMenuMode] = useState<"family" | "provider" | "caregiver">("family");
  const { user, account, activeProfile, profiles, openAuth, signOut, fetchError, isLoading: authLoading, switchProfile } =
    useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileNavImpressionFired = useRef(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { visible: navbarVisible } = useNavbar();
  const { savedCount, hasInitialized: savedInitialized } = useSavedProviders();
  // For family inbox badge: only count unread for the ACTIVE profile, not all profiles
  // This matches the inbox page behavior which only shows connections for the active profile
  const unreadInboxCount = useUnreadInboxCount(activeProfile ? [activeProfile.id] : []);
  // For provider inbox badge: only count unread for the ACTIVE provider profile, not all providers
  // This ensures proper data isolation when users have multiple provider profiles
  const activeProviderProfileId = activeProfile?.type === "organization" ? activeProfile.id : null;
  const providerInboxCount = useUnreadInboxCount(activeProviderProfileId ? [activeProviderProfileId] : []);
  // Provider profile ID for badge counts
  const activeProviderId = activeProfile?.type === "organization"
    ? activeProfile.id
    : (profiles || []).find((p) => p.type === "organization")?.id ?? null;
  // Use activeProfile slug if it's a provider, otherwise fall back to first provider
  const activeProviderSlug = activeProfile?.type === "organization"
    ? activeProfile.slug
    : (profiles || []).find((p) => p.type === "organization")?.slug ?? null;
  const qnaCount = useUnreadQnACount(activeProviderSlug, activeProviderId);
  const familyProfileForMatches = (profiles || []).find((p) => p.type === "family");
  const { pendingCount: matchesPendingCount } = useInterestedProviders(
    familyProfileForMatches?.id
  );
  // Leads count: database-backed with localStorage fallback
  const newLeadsCount = useUnreadLeadsCount(activeProviderId);
  // Reviews count
  const reviewsCount = useUnreadReviewsCount(activeProviderId);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  // Mobile nav variant for A/B testing bottom tabs vs hamburger
  const mobileNavVariant = useMobileNavVariant();

  // Track client-side mount for createPortal (SSR-safe)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lightweight admin check
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    fetch("/api/admin/auth")
      .then((res) => setIsAdmin(res.ok))
      .catch(() => setIsAdmin(false));
  }, [user]);

  const isPortal = pathname.startsWith("/portal");
  const isInboxPage = pathname.startsWith("/portal/inbox");
  // Check if unified inbox is in provider mode - use activeProfile type instead of URL param
  // This avoids useSearchParams which requires Suspense boundary
  const isInboxProviderMode = isInboxPage && activeProfile?.type === "organization";
  const isProviderPortal =
    pathname === "/provider" ||
    pathname.startsWith("/provider/connections") ||
    pathname.startsWith("/provider/inbox") ||
    pathname.startsWith("/provider/onboarding") ||
    pathname.startsWith("/provider/profile") ||
    pathname.startsWith("/provider/reviews") ||
    pathname.startsWith("/provider/matches") ||
    pathname.startsWith("/provider/growth") ||
    pathname.startsWith("/provider/boost") ||
    pathname.startsWith("/provider/pro") ||
    pathname.startsWith("/provider/qna") ||
    pathname.startsWith("/provider/account") ||
    pathname.startsWith("/provider/medjobs") ||
    pathname.startsWith("/provider/caregivers") ||
    // MedJobs board consolidation (G3): the canonical Hire Caregivers board is
    // the public /medjobs/candidates. A signed-in provider org there still gets
    // the provider portal nav; families + unclaimed cold visitors keep the
    // public nav (gated on the active profile being an organization).
    (pathname.startsWith("/medjobs/candidates") && activeProfile?.type === "organization") ||
    // Claim/onboard flow shows provider portal nav
    (pathname.startsWith("/provider/") && pathname.endsWith("/onboard")) ||
    // Account settings page when user is a provider - show provider nav
    (pathname.startsWith("/account") && activeProfile?.type === "organization") ||
    // Unified inbox when active profile is a provider
    isInboxProviderMode;
  const isMinimalNav = pathname.startsWith("/welcome") || pathname.startsWith("/provider/welcome");
  // Auth-gated provider hub routes — the layout gate guarantees the user is signed in,
  // so we can safely render signed-in UI without waiting for hasSession
  const isProviderHub = pathname === "/provider" ||
    pathname.startsWith("/provider/connections") ||
    pathname.startsWith("/provider/inbox") ||
    pathname.startsWith("/provider/reviews") ||
    pathname.startsWith("/provider/matches") ||
    pathname.startsWith("/provider/growth") ||
    pathname.startsWith("/provider/boost") ||
    pathname.startsWith("/provider/pro") ||
    pathname.startsWith("/provider/qna") ||
    pathname.startsWith("/provider/medjobs");
  const isProviderWelcome = pathname.startsWith("/provider/welcome");

  // Track mobile nav variant impression — fires once per page load on mobile provider portal
  useEffect(() => {
    // Skip if already fired, not mounted, not provider portal, or no variant assigned yet
    if (mobileNavImpressionFired.current || !mounted || !isProviderPortal || !mobileNavVariant) return;
    // Skip if not on mobile viewport (lg breakpoint = 1024px)
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    // Skip if no provider to attribute the event to
    if (!activeProviderId) return;

    mobileNavImpressionFired.current = true;
    trackProviderEvent(activeProviderId, "mobile_nav_variant_impression", {
      variant: mobileNavVariant,
    });
  }, [mounted, isProviderPortal, mobileNavVariant, activeProviderId]);

  // Provider detail page detection — has its own mobile nav (MobileProviderTopNav)
  // Pattern: /provider/[slug] where slug is not a known portal route
  const providerPortalRoutes = ["connections", "inbox", "onboarding", "profile", "reviews", "matches", "growth", "boost", "pro", "qna", "account", "medjobs", "caregivers", "welcome"];
  const isProviderDetailPage = (() => {
    if (!pathname.startsWith("/provider/")) return false;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2) return false; // Just "/provider"
    const slug = segments[1];
    // Not a detail page if it's a known portal route
    if (providerPortalRoutes.includes(slug)) return false;
    // Not a detail page if it ends with /onboard
    if (pathname.endsWith("/onboard")) return false;
    return true;
  })();

  // Show auth pill as soon as we know a user session exists.
  // Guard against showing logged-out UI while auth is still loading
  const hasSession = !!user;
  const showLoggedOutUI = !hasSession && !authLoading;
  // Mode switcher — shown when user has both a family and a provider profile
  const hasFamilyProfile = (profiles || []).some((p) => p.type === "family");
  const hasProviderProfile = (profiles || []).some((p) => p.type === "organization");
  const showModeSwitcher = hasSession && hasFamilyProfile && hasProviderProfile;

  // Profile IDs for hub switching — used by the mode switcher to also switch activeProfile
  const familyProfileId = (profiles || []).find((p) => p.type === "family")?.id;
  const providerProfileId = (profiles || []).find((p) => p.type === "organization")?.id;

  // Show user's actual name in the dropdown, not the org/profile name
  const displayName = account?.display_name || user?.email || "";
  const initials = getInitials(displayName);

  // Show the contextual profile type based on which portal the user is in,
  // not the database-stored activeProfile (which may be stale).
  const hasStudentProfile = (profiles || []).some((p) => p.type === "student" || p.type === "caregiver");
  const contextProfileType = isProviderPortal
    ? (profiles || []).find((p) => p.type === "organization")?.type
    : hasStudentProfile
    ? "caregiver"
    : hasFamilyProfile ? "family" : activeProfile?.type;
  const profileTypeLabel = contextProfileType
    ? contextProfileType === "organization"
      ? "Organization"
      : contextProfileType === "caregiver"
      ? "Caregiver"
      : "Family"
    : null;

  // "For Providers" click handler
  const handleForProviders = useCallback(() => {
    const hasProviderProfile = profiles.some(
      (p) => p.type === "organization"
    );
    if (hasProviderProfile) {
      router.push("/provider");
      return;
    }
    // Always route to marketing page — let them click "Get Started" there
    router.push("/for-providers");
  }, [profiles, router]);

  // Track scroll position for navbar background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mega menu on Escape key
  useEffect(() => {
    if (!isFindCareOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (megaMenuCloseTimer.current) { clearTimeout(megaMenuCloseTimer.current); megaMenuCloseTimer.current = null; }
        setIsFindCareOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFindCareOpen]);

  // Clean up mega menu close timer on unmount
  useEffect(() => {
    return () => {
      if (megaMenuCloseTimer.current) clearTimeout(megaMenuCloseTimer.current);
    };
  }, []);

  // Close user/account menu on outside click (blur-before-close prevents scroll-to-footer)
  useClickOutside(userMenuRef, () => setIsUserMenuOpen(false), isUserMenuOpen);

  // Close user menu on Escape
  useEffect(() => {
    if (!isUserMenuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsUserMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isUserMenuOpen]);

  // Close menus on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
    if (megaMenuCloseTimer.current) { clearTimeout(megaMenuCloseTimer.current); megaMenuCloseTimer.current = null; }
    setIsFindCareOpen(false);
  }, [pathname]);

  // Listen for external toggle-mobile-menu events (from MobileProviderTopNav)
  useEffect(() => {
    const handleToggle = () => setIsMobileMenuOpen((prev) => !prev);
    window.addEventListener("toggle-mobile-menu", handleToggle);
    return () => window.removeEventListener("toggle-mobile-menu", handleToggle);
  }, []);

  // Reset mobile menu state when menu opens
  // Provider-only accounts (no family profile) should always see provider mode
  const isProviderOnlyAccount = hasProviderProfile && !hasFamilyProfile && !hasStudentProfile;

  // Logo href based on account type — each user type goes to their dashboard
  // Family or not logged in → main site
  // Provider (organization) → Provider dashboard
  // MedJobs caregiver (student or legacy caregiver) → MedJobs portal
  // Logo destination based on profile type (use has* checks for faster detection after login)
  // Priority: Provider > Student > Family/logged-out
  // If user has multiple profile types, provider takes precedence (they can use mode switcher)
  const logoHref = hasStudentProfile
    ? "/portal/medjobs"
    : (isProviderPortal || isProviderOnlyAccount)
      ? "/provider"
      : "/";

  useEffect(() => {
    if (isMobileMenuOpen && hasSession) {
      // Set mode based on profile type: caregiver > provider > family
      // This matches desktop behavior where hasStudentProfile is checked first
      const mode = hasStudentProfile
        ? "caregiver"
        : (isProviderPortal || isProviderOnlyAccount)
          ? "provider"
          : "family";
      setMobileMenuMode(mode);
      // Set default accordion based on mode
      setMobileAccordion(mode === "provider" ? "hub" : mode === "caregiver" ? "hub" : "account");
    } else if (!isMobileMenuOpen) {
      setMobileAccordion(null);
      setIsMobileCareOpen(false);
    }
  }, [isMobileMenuOpen, hasSession, isProviderPortal, isProviderOnlyAccount, hasStudentProfile]);

  // NOTE: /for-providers used to return null here, but we want the full navbar
  // to show on the provider landing page for navigation consistency.

  // Shared dropdown content (context-aware links, mode switcher, sign out)
  // User menu is always in the right column, so dropdown always aligns right
  const dropdownAlign = "right-0";

  const signedInDropdown = (
    <div
      className={`absolute ${dropdownAlign} mt-2.5 w-64 bg-white rounded-2xl shadow-xl ring-1 ring-black/[0.06] py-1 z-50`}
    >
      {/* Identity header with pill badge */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[15px] font-semibold text-gray-900 truncate">
            {displayName}
          </p>
          {profileTypeLabel && (
            <span className="shrink-0 text-[10px] font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
              {profileTypeLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 truncate">{user?.email}</p>
      </div>

      <div className="mx-4 border-t border-gray-100" />

      {/* Mode switcher — only shown when user has BOTH family and provider profiles */}
      {showModeSwitcher && (
        <>
          <div className="px-3 pt-2 pb-1">
            <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  if (hasFamilyProfile && familyProfileId) switchProfile(familyProfileId);
                  setIsUserMenuOpen(false);
                  router.push("/");
                }}
                className={[
                  "flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  !isProviderPortal
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                Family Portal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (hasProviderProfile && providerProfileId) {
                    switchProfile(providerProfileId);
                    setIsUserMenuOpen(false);
                    router.push("/provider");
                  }
                }}
                className={[
                  "flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  isProviderPortal
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                Provider Hub
              </button>
            </div>
          </div>
          <div className="mx-4 border-t border-gray-100" />
        </>
      )}

      {/* Hub-specific links — based on profile type, not URL */}
      <div className="px-2 py-1.5">
          {/* Provider-only accounts (no family profile) always see provider dropdown */}
          {(isProviderPortal || (hasProviderProfile && !hasFamilyProfile && !hasStudentProfile)) ? (
            <>
              {/* Provider Hub engagement links — Inbox, Q&A, Leads, Reviews */}
              {([
                { label: "Inbox", href: "/portal/inbox?role=provider", badge: providerInboxCount, icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
                { label: "Q&A", href: "/provider/qna", badge: qnaCount, icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
                { label: "Leads", href: "/provider/connections", badge: newLeadsCount, icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
                { label: "Reviews", href: "/provider/reviews", badge: reviewsCount, icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" },
                { label: "Interviews", href: "/provider/caregivers", badge: 0, icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
              ] as const).map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                  {item.badge > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
              <div className="mx-4 my-1 border-t border-gray-100" />
              <Link
                href="/account/settings"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Account Settings
              </Link>
            </>
          ) : hasStudentProfile ? (
            <>
              {/* Caregiver (Student) links */}
              <Link
                href="/portal/medjobs/jobs"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h2" />
                </svg>
                Find Jobs
              </Link>
              <Link
                href="/portal/medjobs"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </Link>
              <Link
                href="/portal/medjobs/interviews"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Interviews
              </Link>
              <Link
                href="/account/settings"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Settings
              </Link>
            </>
          ) : hasStudentProfile ? (
            <>
              {/* Caregiver (Student) links */}
              <Link
                href="/portal/medjobs"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Application
              </Link>
              <Link
                href="/portal/medjobs/jobs"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h2" />
                </svg>
                Find Jobs
              </Link>
              <Link
                href="/portal/medjobs/interviews"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Interviews
              </Link>
            </>
          ) : (
            <>
              {/* Family Portal links */}
              <Link
                href="/portal/inbox"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
                </svg>
                Inbox
                {unreadInboxCount > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-white bg-red-500 rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                    {unreadInboxCount}
                  </span>
                )}
              </Link>
              <Link
                href="/portal/profile"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Profile
              </Link>
              <Link
                href="/account/settings"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Account Settings
              </Link>
              {/* "Become a Caregiver" removed - with strict account separation,
                  family users would need a new account to become a caregiver */}
            </>
          )}
        </div>

      {isAdmin && (
        <>
          <div className="mx-4 border-t border-gray-100" />
          <div className="px-2 py-1.5">
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
              onClick={() => setIsUserMenuOpen(false)}
            >
              <svg className="w-[18px] h-[18px] text-primary-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Admin Dashboard
            </Link>
          </div>
        </>
      )}

      <div className="mx-4 border-t border-gray-100" />

      {/* Sign out */}
      <div className="px-2 py-1.5 pb-2">
        <button
          type="button"
          onClick={() => {
            setIsUserMenuOpen(false);
            signOut(() => router.push("/"));
          }}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );

  const unauthDropdown = (
    <div
      className={`absolute ${dropdownAlign} mt-2.5 w-60 bg-white rounded-2xl shadow-xl ring-1 ring-black/[0.06] py-1.5 z-50`}
      role="menu"
      aria-label="Account menu"
    >
      {/* Auth action */}
      <div className="px-1.5 pb-1">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setIsUserMenuOpen(false);
            openAuth({ defaultMode: "sign-in" });
          }}
          className="w-full text-left px-3.5 py-2.5 text-[15px] font-semibold text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
        >
          Log in or sign up
        </button>
      </div>

      <div className="mx-3.5 border-t border-gray-100" />

      {/* Intent actions */}
      <div className="px-1.5 pt-1">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setIsUserMenuOpen(false);
            router.push("/browse");
          }}
          className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 text-[15px] text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
        >
          <svg className="w-[18px] h-[18px] text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          Find care
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setIsUserMenuOpen(false);
            // Return to current page on Exit, or /for-providers if on onboarding already
            const returnTo = pathname.startsWith("/provider/onboarding") ? "/for-providers" : pathname;
            router.push(`/provider/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
          }}
          className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 text-[15px] text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
        >
          <svg className="w-[18px] h-[18px] text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
          Find your organization
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setIsUserMenuOpen(false);
            router.push("/medjobs/families");
          }}
          className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 text-[15px] text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
        >
          <svg className="w-[18px] h-[18px] text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          Join as a caregiver
        </button>
      </div>
    </div>
  );

  // Onboarding pages have their own minimal nav — don't render the main navbar at all
  if (pathname === "/provider/onboarding") return null;
  if (pathname.startsWith("/provider/") && pathname.endsWith("/onboard")) return null;

  return (
    <>
      <nav
        className={`${navbarVisible ? "sticky" : "fixed"} top-0 left-0 right-0 z-50 bg-white ${isProviderDetailPage ? "hidden md:block" : ""} ${isInboxPage && mobileNavVariant === "bottom_tabs" ? "hidden lg:block" : ""} ${isPortal || isProviderPortal || pathname.startsWith("/welcome") ? "border-b border-gray-200" : isScrolled && navbarVisible ? "shadow-sm" : ""}`}
        style={{
          transform: navbarVisible ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 200ms cubic-bezier(0.33, 1, 0.68, 1)"
        }}
      >
        <div className={(isInboxPage || isMinimalNav) ? "px-5 sm:px-[44px]" : "max-w-7xl mx-auto px-5 sm:px-6 lg:px-8"}>
          {/*
           * 3-column layout: Left | Center Nav | Right
           *
           * Family mode:  [Olera logo]  |  [Find Care, Caregiver Support, ...]  |  [For Providers, ♥, User menu]
           * Provider mode: [User menu]  |  [Profile, Inbox, Leads, ...]  |  [Olera logo]
           *
           * Left and right are flex-1 so center nav is truly page-centered.
           */}
          <div className="flex items-center h-16">

            {/* ── LEFT COLUMN — always Olera logo ── */}
            <div className="flex-1 flex items-center">
              <Link href={logoHref} className="flex items-center space-x-2">
                <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" priority />
                <span className="text-xl font-bold text-gray-900">Olera</span>
              </Link>
            </div>

            {/* ── CENTER — Primary navigation (page-centered, hidden on mobile + inbox) ── */}
            {!isMinimalNav && (
              <div className="hidden lg:flex items-center gap-1">
                {hasStudentProfile ? null : (isProviderPortal || activeProfile?.type === "organization") ? (
                  /* Provider Hub nav links - shown on /provider/* URLs or for organization users (e.g., in inbox) */
                  <>
                    {/* Profile */}
                    <Link
                      href="/provider"
                      data-wizard-target="dashboard"
                      className={`relative px-4 py-2 text-[15px] font-medium transition-colors ${
                        pathname === "/provider"
                          ? "text-primary-600"
                          : "text-gray-700 hover:text-gray-900"
                      }`}
                    >
                      Profile
                    </Link>

                    {/* Find Families */}
                    <Link
                      href="/provider/matches"
                      data-wizard-target="matches"
                      className={`relative px-4 py-2 text-[15px] font-medium transition-colors ${
                        pathname.startsWith("/provider/matches")
                          ? "text-primary-600"
                          : "text-gray-700 hover:text-gray-900"
                      }`}
                    >
                      Find Families
                    </Link>

                    {/* Growth */}
                    <Link
                      href="/provider/growth"
                      className={`relative px-4 py-2 text-[15px] font-medium transition-colors ${
                        pathname.startsWith("/provider/growth")
                          ? "text-primary-600"
                          : "text-gray-700 hover:text-gray-900"
                      }`}
                    >
                      Growth
                    </Link>

                    {/* Hire Caregivers */}
                    <Link
                      href="/provider/medjobs/candidates"
                      className={`relative px-4 py-2 text-[15px] font-medium transition-colors ${
                        pathname.startsWith("/provider/medjobs/candidates") || pathname.startsWith("/medjobs/candidates")
                          ? "text-primary-600"
                          : "text-gray-700 hover:text-gray-900"
                      }`}
                    >
                      Hire Caregivers
                    </Link>
                  </>
                ) : (
                  /* Family / public nav links */
                  <>
                    {/* Find Care - simple link in inbox, mega menu elsewhere */}
                    {isInboxPage ? (
                      <Link
                        href="/browse"
                        className="px-4 py-2 rounded-full text-[15px] font-medium transition-colors text-gray-700 hover:bg-gray-50"
                      >
                        Find Care
                      </Link>
                    ) : (
                      <div onMouseEnter={() => {
                        if (megaMenuCloseTimer.current) { clearTimeout(megaMenuCloseTimer.current); megaMenuCloseTimer.current = null; }
                        setIsFindCareOpen(true);
                      }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (megaMenuCloseTimer.current) { clearTimeout(megaMenuCloseTimer.current); megaMenuCloseTimer.current = null; }
                            setIsFindCareOpen(false);
                            router.push("/browse");
                          }}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[15px] font-medium transition-colors ${
                            isFindCareOpen
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                          aria-expanded={isFindCareOpen}
                          aria-haspopup="true"
                        >
                          Find Care
                          <svg
                            className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${
                              isFindCareOpen ? "rotate-180" : ""
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Simple nav links - filter out MedJobs for families (students handled above) */}
                    {NAV_LINKS
                      .filter((link) => !(link.href === "/medjobs" && hasFamilyProfile))
                      .map((link) => {
                        const isActive = pathname.startsWith(link.href);
                        return (
                        <Link
                          key={link.label}
                          href={link.href}
                          className={`px-4 py-2 text-[15px] font-medium rounded-full transition-colors ${
                            isActive
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {link.label}
                        </Link>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ── RIGHT COLUMN ── */}
            <div className="flex-1 flex items-center justify-end">
              {/* Desktop right section */}
              <div className="hidden lg:flex items-center gap-2">
                {isProviderPortal ? (
                  /* Provider mode: Switch to family + user menu
                   * On auth-gated hub routes, always render signed-in layout to avoid
                   * flipping between signed-out/signed-in hamburger during auth churn.
                   * On public provider pages (onboard, detail), respect hasSession. */
                  <>
                    {/* Switch to family — only when signed in AND has family profile */}
                    {(hasSession || isProviderHub) && hasFamilyProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          if (familyProfileId) switchProfile(familyProfileId);
                          router.push("/");
                        }}
                        className="px-4 py-2 text-[15px] font-medium text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                      >
                        Switch to family
                      </button>
                    )}
                    {(hasSession || isProviderHub) ? (
                      <div className="relative" ref={userMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                          className="relative flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-gray-200 rounded-full hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                          aria-label="User menu"
                          aria-expanded={isUserMenuOpen}
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          {activeProfile?.image_url ? (
                            <Image src={activeProfile.image_url} alt={displayName} width={32} height={32} className="w-8 h-8 rounded-full object-cover aspect-square shrink-0" />
                          ) : (
                            <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
                              {initials || "?"}
                            </div>
                          )}
                          {(providerInboxCount > 0 || newLeadsCount > 0 || qnaCount > 0 || reviewsCount > 0) && (
                            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                          )}
                        </button>
                        {isUserMenuOpen && signedInDropdown}
                      </div>
                    ) : (
                      <div className="relative" ref={userMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                          className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-gray-200 rounded-full hover:shadow-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 min-h-[44px]"
                          aria-label="Account menu"
                          aria-expanded={isUserMenuOpen}
                          aria-haspopup="true"
                        >
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          <div className="w-8 h-8 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                            </svg>
                          </div>
                        </button>
                        {isUserMenuOpen && unauthDropdown}
                      </div>
                    )}
                  </>
                ) : (
                  /* Family mode: For Providers + heart + user menu */
                  <>
                    {/* For Providers link — shown for guests and family accounts, hidden for providers/students */}
                    {!isMinimalNav && !hasProviderProfile && !hasStudentProfile && (
                      <button
                        onClick={handleForProviders}
                        className="px-4 py-2 text-[15px] font-medium text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                      >
                        For Providers
                      </button>
                    )}

                    {/* Saved providers heart — hidden on provider welcome and for non-family profiles */}
                    {!isProviderWelcome && (!hasSession || hasFamilyProfile) && (
                      <Link
                        href="/saved"
                        className="relative flex items-center justify-center w-[44px] min-h-[44px] border border-gray-200 rounded-full text-gray-500 hover:text-red-500 hover:shadow-md transition-all"
                        aria-label="Saved providers"
                      >
                        <svg
                          className="w-[18px] h-[18px]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </Link>
                    )}

                    {/* User menu */}
                    {hasSession ? (
                      <div className="relative" ref={userMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                          className="relative flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-gray-200 rounded-full hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                          aria-label="User menu"
                          aria-expanded={isUserMenuOpen}
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          {activeProfile?.image_url ? (
                            <Image src={activeProfile.image_url} alt={displayName} width={32} height={32} className="w-8 h-8 rounded-full object-cover aspect-square shrink-0" />
                          ) : (
                            <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
                              {initials}
                            </div>
                          )}
                          {(unreadInboxCount > 0 || matchesPendingCount > 0) && (
                            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                          )}
                        </button>
                        {isUserMenuOpen && signedInDropdown}
                      </div>
                    ) : showLoggedOutUI ? (
                      <div className="relative" ref={userMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                          className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-gray-200 rounded-full hover:shadow-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 min-h-[44px]"
                          aria-label="Account menu"
                          aria-expanded={isUserMenuOpen}
                          aria-haspopup="true"
                        >
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          <div className="w-8 h-8 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                            </svg>
                          </div>
                        </button>
                        {isUserMenuOpen && unauthDropdown}
                      </div>
                    ) : (
                      /* Loading state - show skeleton while auth is initializing */
                      <div className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-gray-200 rounded-full min-h-[44px]">
                        <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Mobile Menu Button — direct link to settings for bottom_tabs variant, hamburger otherwise */}
              {isProviderPortal && mobileNavVariant === "bottom_tabs" ? (
                /* Direct link to account settings for bottom_tabs variant — just avatar, no menu icon */
                <Link
                  href="/account/settings"
                  className="lg:hidden flex items-center justify-center w-11 h-11 border border-gray-200 rounded-full hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
                  aria-label="Account settings"
                >
                  {activeProfile?.image_url ? (
                    <Image src={activeProfile.image_url} alt={displayName} width={36} height={36} className="w-9 h-9 rounded-full object-cover aspect-square" />
                  ) : (
                    <div className="w-9 h-9 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
                      {initials || "?"}
                    </div>
                  )}
                </Link>
              ) : (
                /* Hamburger button for default variant */
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="lg:hidden w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                  aria-label="Toggle menu"
                >
                  {isMobileMenuOpen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>

        </div>
      </nav>

      {/* ── MOBILE MENU (Full-screen overlay via portal) ── */}
      {isMobileMenuOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden bg-white flex flex-col animate-fade-in">
          {/* Header — matches navbar height and padding */}
          <div className={`flex items-center justify-between h-16 shrink-0 ${(isInboxPage || isMinimalNav) ? "px-5 sm:px-[44px]" : "px-5"}`}>
            <Link
              href={logoHref}
              className="flex items-center space-x-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" priority />
              <span className="text-xl font-bold text-gray-900">Olera</span>
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Top-anchored list (Apple Settings / Airbnb sections), not centered. max-w-md keeps a tidy column on tablet. */}
            <div className="flex flex-col w-full max-w-md mx-auto">
              {authLoading ? (
                /* Loading state - show skeleton while auth is initializing */
                <div className="py-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gray-200 rounded-full animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-32" />
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
                    </div>
                  </div>
                  <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                  <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                </div>
              ) : hasSession ? (
                /* ═══ LOGGED-IN MENU ═══ */
                <>
                  {/* Identity header */}
                  <div className="flex items-center gap-3 py-3 mb-2">
                    {activeProfile?.image_url ? (
                      <Image src={activeProfile.image_url} alt={displayName} width={44} height={44} className="rounded-full object-cover shrink-0 aspect-square" />
                    ) : (
                      <div className="w-11 h-11 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-semibold text-gray-900 truncate">{displayName}</p>
                        {profileTypeLabel && (
                          <span className="shrink-0 text-[10px] font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                            {profileTypeLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                    </div>
                  </div>

                  {/* Mode switcher — only shown when user has BOTH family and provider profiles */}
                  {showModeSwitcher && (
                    <div className="py-2 mb-2">
                      <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            if (familyProfileId) {
                              switchProfile(familyProfileId);
                              setMobileMenuMode("family");
                            }
                          }}
                          className={[
                            "flex-1 text-center px-3 py-2 rounded-lg text-sm font-semibold transition-all min-h-[44px]",
                            mobileMenuMode === "family" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                          ].join(" ")}
                        >
                          Family Portal
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (providerProfileId) {
                              switchProfile(providerProfileId);
                              setMobileMenuMode("provider");
                            }
                          }}
                          className={[
                            "flex-1 text-center px-3 py-2 rounded-lg text-sm font-semibold transition-all min-h-[44px]",
                            mobileMenuMode === "provider" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                          ].join(" ")}
                        >
                          Provider Hub
                        </button>
                      </div>
                    </div>
                  )}

                  <hr className="border-gray-100 mb-2" />

                  {mobileMenuMode === "provider" ? (
                    /* ─── PROVIDER LOGGED-IN ─── */
                    <div className="space-y-0.5">
                      {([
                        { label: "Profile", href: "/provider", match: "/provider", badge: 0, icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
                        { label: "Find Families", href: "/provider/matches", match: "/provider/matches", badge: 0, icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" },
                        { label: "Growth", href: "/provider/growth", match: "/provider/growth", badge: 0, icon: "M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.519l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941" },
                        { label: "Hire Caregivers", href: "/provider/medjobs/candidates", match: "/provider/medjobs/candidates", badge: 0, icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" },
                        { label: "Inbox", href: "/portal/inbox?role=provider", match: "/portal/inbox", badge: providerInboxCount, icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
                        { label: "Q&A", href: "/provider/qna", match: "/provider/qna", badge: qnaCount, icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
                        { label: "Leads", href: "/provider/connections", match: "/provider/connections", badge: newLeadsCount, icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
                        { label: "Reviews", href: "/provider/reviews", match: "/provider/reviews", badge: reviewsCount, icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" },
                        { label: "Interviews", href: "/provider/caregivers", match: "/provider/caregivers", badge: 0, icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                      ] as const).map((item) => {
                        const active = item.match === "/provider" ? pathname === "/provider" : pathname.startsWith(item.match);
                        return (
                          <Link
                            key={item.label}
                            href={item.href}
                            className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${active ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"}`}
                            onClick={() => {
                              // Switch to provider profile if not already active
                              if (hasProviderProfile && providerProfileId) switchProfile(providerProfileId);
                              setIsMobileMenuOpen(false);
                              // Track key navigation actions for A/B test analysis
                              if (activeProviderId && item.label === "Find Families") {
                                trackProviderEvent(activeProviderId, "nav_families_clicked", {
                                  variant: mobileNavVariant ?? "current",
                                  source: "hamburger_menu",
                                });
                              } else if (activeProviderId && item.label === "Hire Caregivers") {
                                trackProviderEvent(activeProviderId, "nav_hire_clicked", {
                                  variant: mobileNavVariant ?? "current",
                                  source: "hamburger_menu",
                                });
                              }
                            }}
                          >
                            <svg className={`w-5 h-5 shrink-0 ${active ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                            </svg>
                            <span className="text-[15px]">{item.label}</span>
                            {item.badge > 0 && (
                              <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}

                      {/* Account Settings */}
                      <div className="my-3 border-t border-gray-100" />
                      <Link
                        href="/account/settings"
                        className="flex items-center gap-3 px-3 py-3 text-gray-600 hover:text-primary-600 hover:bg-gray-50 rounded-xl transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-[15px]">Account Settings</span>
                      </Link>

                      {/* Switch to Family */}
                      {hasFamilyProfile && (
                        <>
                          <div className="my-3 border-t border-gray-100" />
                          <button
                            type="button"
                            onClick={() => {
                              if (showModeSwitcher && familyProfileId) {
                                // Has both profiles — just switch menu view
                                switchProfile(familyProfileId);
                                setMobileMenuMode("family");
                              } else {
                                // Only one profile — navigate to landing
                                if (familyProfileId) switchProfile(familyProfileId);
                                setIsMobileMenuOpen(false);
                                router.push("/");
                              }
                            }}
                            className="flex items-center gap-3 px-3 py-3 text-gray-600 hover:text-primary-600 hover:bg-gray-50 rounded-xl transition-colors text-left w-full"
                          >
                            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                            </svg>
                            <span className="text-[15px]">Switch to Family Portal</span>
                          </button>
                        </>
                      )}
                    </div>
                  ) : mobileMenuMode === "caregiver" ? (
                    /* ─── CAREGIVER (MedJobs) LOGGED-IN ─── */
                    <div className="space-y-1">
                      {/* My Hub accordion (open by default) */}
                      <div className="rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setMobileAccordion(mobileAccordion === "hub" ? null : "hub")}
                          className={`flex items-center justify-between w-full px-3 py-3 rounded-xl transition-colors ${mobileAccordion === "hub" ? "bg-gray-50" : "hover:bg-gray-50"}`}
                          aria-expanded={mobileAccordion === "hub"}
                        >
                          <span className="text-[15px] font-semibold text-gray-900">My Hub</span>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${mobileAccordion === "hub" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {mobileAccordion === "hub" && (
                          <div className="mt-1 space-y-0.5">
                            {([
                              { label: "Find Jobs", href: "/portal/medjobs/jobs", match: "/portal/medjobs/jobs", icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h2" },
                              { label: "Profile", href: "/portal/medjobs", match: "/portal/medjobs", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
                              { label: "Interviews", href: "/portal/medjobs/interviews", match: "/portal/medjobs/interviews", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                              { label: "Settings", href: "/account/settings", match: "/account/settings", icon: "M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
                            ] as const).map((item) => {
                              const active = item.match === "/portal/medjobs" ? pathname === "/portal/medjobs" : pathname.startsWith(item.match);
                              return (
                                <Link
                                  key={item.label}
                                  href={item.href}
                                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${active ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                >
                                  <svg className={`w-5 h-5 shrink-0 ${active ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                  </svg>
                                  <span className="text-[15px]">{item.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ─── FAMILY LOGGED-IN ─── */
                    <div className="space-y-1">
                      {/* My Account accordion (open by default) */}
                      <div className="rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setMobileAccordion(mobileAccordion === "account" ? null : "account")}
                          className={`flex items-center justify-between w-full px-3 py-3 rounded-xl transition-colors ${mobileAccordion === "account" ? "bg-gray-50" : "hover:bg-gray-50"}`}
                          aria-expanded={mobileAccordion === "account"}
                        >
                          <span className="text-[15px] font-semibold text-gray-900">My Account</span>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${mobileAccordion === "account" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {mobileAccordion === "account" && (
                          <div className="mt-1 space-y-0.5">
                            {([
                              { label: "Inbox", href: "/portal/inbox", badge: unreadInboxCount, icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
                              // Saved link only shown for family profiles
                              ...(hasFamilyProfile ? [{ label: "Saved", href: "/saved", badge: 0, icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" }] : []),
                              { label: "Profile", href: "/portal/profile", badge: 0, icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
                              { label: "Account Settings", href: "/portal/settings", badge: 0, icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28zM15 12a3 3 0 11-6 0 3 3 0 016 0z" },
                            ] as const).map((item) => {
                              const active = pathname.startsWith(item.href) || (item.href === "/saved" && pathname === "/saved");
                              return (
                                <Link
                                  key={item.label}
                                  href={item.href}
                                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${active ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => {
                                    // Switch to family profile if not already active
                                    if (hasFamilyProfile && familyProfileId) switchProfile(familyProfileId);
                                    setIsMobileMenuOpen(false);
                                  }}
                                >
                                  <svg className={`w-5 h-5 shrink-0 ${active ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                  </svg>
                                  <span className="text-[15px]">{item.label}</span>
                                  {item.badge > 0 && (
                                    <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                                      {item.badge}
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Discover accordion (collapsed by default) */}
                      <div className="rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setMobileAccordion(mobileAccordion === "discover" ? null : "discover")}
                          className={`flex items-center justify-between w-full px-3 py-3 rounded-xl transition-colors ${mobileAccordion === "discover" ? "bg-gray-50" : "hover:bg-gray-50"}`}
                          aria-expanded={mobileAccordion === "discover"}
                        >
                          <span className="text-[15px] font-semibold text-gray-900">Discover</span>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${mobileAccordion === "discover" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {mobileAccordion === "discover" && (
                          <div className="mt-1 space-y-0.5">
                            <Link
                              href="/browse"
                              className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${pathname.startsWith("/browse") ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"}`}
                              onClick={() => {
                                if (hasFamilyProfile && familyProfileId) switchProfile(familyProfileId);
                                setIsMobileMenuOpen(false);
                              }}
                            >
                              <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/browse") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                              </svg>
                              <span className="text-[15px]">Find Care</span>
                            </Link>
                            {NAV_LINKS.map((link) => {
                              const active = pathname.startsWith(link.href);
                              return (
                                <Link
                                  key={link.label}
                                  href={link.href}
                                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${active ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => {
                                    if (hasFamilyProfile && familyProfileId) switchProfile(familyProfileId);
                                    setIsMobileMenuOpen(false);
                                  }}
                                >
                                  <svg className={`w-5 h-5 shrink-0 ${active ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={
                                      link.label === "Caregiver Support" ? "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" :
                                      "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                                    } />
                                  </svg>
                                  <span className="text-[15px]">{link.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Switch to Provider - only show when user has a provider profile */}
                      {hasProviderProfile && (
                        <>
                          <div className="my-3 border-t border-gray-100" />
                          <button
                            type="button"
                            onClick={() => {
                              if (providerProfileId) {
                                switchProfile(providerProfileId);
                                if (showModeSwitcher) {
                                  setMobileMenuMode("provider");
                                } else {
                                  setIsMobileMenuOpen(false);
                                  router.push("/provider");
                                }
                              }
                            }}
                            className="flex items-center gap-3 px-3 py-3 text-gray-600 hover:text-primary-600 hover:bg-gray-50 rounded-xl transition-colors text-left w-full"
                          >
                            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                            </svg>
                            <span className="text-[15px]">Switch to Provider Hub</span>
                          </button>
                        </>
                      )}

                      {isAdmin && (
                        <Link href="/admin" className="flex items-center gap-3 px-3 py-3 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-xl transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                          <span className="text-[15px]">Admin Dashboard</span>
                        </Link>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* ═══ LOGGED-OUT MENU ═══ */
                <>
                  {/* Find Care with expandable subcategories */}
                  <button
                    type="button"
                    onClick={() => setIsMobileCareOpen((prev) => !prev)}
                    className={`flex items-center justify-between w-full py-4 text-xl font-semibold transition active:opacity-60 ${pathname.startsWith("/browse") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                    aria-expanded={isMobileCareOpen}
                  >
                    <span className="flex items-center gap-3">
                      <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/browse") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      Find Care
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${isMobileCareOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isMobileCareOpen && (
                    <div className="pl-8 pb-2 space-y-1">
                      {CARE_CATEGORIES.map((cat) => (
                        <Link
                          key={cat.id}
                          href={`/browse?type=${cat.id}`}
                          className="block py-2 text-sm text-gray-600 hover:text-primary-600"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <span className="font-medium">{cat.label}</span>
                          <span className="block text-xs text-gray-400 mt-0.5">{cat.description}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Caregiver Support */}
                  <Link
                    href="/caregiver-support"
                    className={`flex items-center gap-3 py-4 text-xl font-semibold transition active:opacity-60 ${pathname.startsWith("/caregiver-support") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/caregiver-support") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                    </svg>
                    Caregiver Support
                  </Link>

                  {/* Find Benefits */}
                  <Link
                    href="/senior-benefits"
                    className={`flex items-center gap-3 py-4 text-xl font-semibold transition active:opacity-60 ${pathname.startsWith("/senior-benefits") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/senior-benefits") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    Find Benefits
                  </Link>

                  {/* Saved — hidden for non-family profiles */}
                  {(!hasSession || hasFamilyProfile) && (
                    <Link
                      href="/saved"
                      className={`flex items-center gap-3 py-4 text-xl font-semibold transition active:opacity-60 ${pathname === "/saved" ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <svg className={`w-5 h-5 shrink-0 ${pathname === "/saved" ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                      Saved
                    </Link>
                  )}

                  {/* For Providers — shown for guests and family accounts, hidden for providers/students */}
                  {!hasProviderProfile && !hasStudentProfile && (
                    <>
                      <div className="my-3 border-t border-gray-100" />
                      <Link
                        href="/for-providers"
                        className={`flex items-center gap-3 py-4 text-xl font-semibold transition active:opacity-60 ${pathname.startsWith("/for-providers") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/for-providers") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                        </svg>
                        For Providers
                      </Link>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Sticky footer — auth card (logged out) or sign out (logged in) */}
          <div className="shrink-0 px-5 py-4 border-t border-gray-100 bg-white" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
            {authLoading ? (
              /* Loading state */
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ) : hasSession ? (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  signOut(() => router.push("/"));
                }}
                className="w-full flex items-center justify-center gap-2 py-3 text-red-600 hover:text-red-700 font-medium border border-red-200 rounded-xl hover:bg-red-50 transition-colors min-h-[48px]"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Sign out
              </button>
            ) : (
              <div className="space-y-2 w-full max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openAuth({ defaultMode: "sign-in" });
                  }}
                  className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors active:bg-primary-800 min-h-[48px]"
                >
                  Log in or sign up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    // Return to current page on Exit, or /for-providers if on onboarding already
                    const returnTo = pathname.startsWith("/provider/onboarding") ? "/for-providers" : pathname;
                    router.push(`/provider/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
                  }}
                  className="w-full py-2.5 text-[15px] font-medium text-gray-700 hover:text-primary-600 transition-colors active:opacity-60 min-h-[44px]"
                >
                  Find your organization
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    router.push("/medjobs/families");
                  }}
                  className="w-full py-2.5 text-[15px] font-medium text-gray-700 hover:text-primary-600 transition-colors active:opacity-60 min-h-[44px]"
                >
                  Join as a caregiver
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Find Care Mega Menu */}
      <FindCareMegaMenu
        isOpen={isFindCareOpen}
        onClose={() => {
          if (megaMenuCloseTimer.current) { clearTimeout(megaMenuCloseTimer.current); megaMenuCloseTimer.current = null; }
          setIsFindCareOpen(false);
        }}
        onMouseEnter={() => {
          if (megaMenuCloseTimer.current) { clearTimeout(megaMenuCloseTimer.current); megaMenuCloseTimer.current = null; }
          setIsFindCareOpen(true);
        }}
        onMouseLeave={() => {
          megaMenuCloseTimer.current = setTimeout(() => setIsFindCareOpen(false), 200);
        }}
      />

      {/* Mobile Bottom Tabs — only shown for provider portal when variant is bottom_tabs */}
      {isProviderPortal && mobileNavVariant === "bottom_tabs" && (
        <div className="lg:hidden">
          <MobileBottomTabs
            hasNotifications={providerInboxCount > 0 || qnaCount > 0 || newLeadsCount > 0}
            onMorePress={() => setIsMoreSheetOpen(true)}
            onNavClick={(tabKey) => {
              if (!activeProviderId) return;
              // Track key navigation actions for A/B test analysis
              if (tabKey === "families") {
                trackProviderEvent(activeProviderId, "nav_families_clicked", {
                  variant: "bottom_tabs",
                  source: "bottom_tabs",
                });
              } else if (tabKey === "hire") {
                trackProviderEvent(activeProviderId, "nav_hire_clicked", {
                  variant: "bottom_tabs",
                  source: "bottom_tabs",
                });
              }
            }}
          />
          <MoreBottomSheet
            isOpen={isMoreSheetOpen}
            onClose={() => setIsMoreSheetOpen(false)}
            inboxCount={providerInboxCount}
            qnaCount={qnaCount}
            leadsCount={newLeadsCount}
          />
        </div>
      )}
    </>
  );
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.split(/[\s@]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

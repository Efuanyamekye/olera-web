"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useAuth } from "@/components/auth/AuthProvider";
import ProfileSwitcher from "@/components/shared/ProfileSwitcher";
import FindCareMegaMenu from "@/components/shared/FindCareMegaMenu";
import { CARE_CATEGORIES, NAV_LINKS } from "@/components/shared/NavMenuData";
import { useNavbar } from "@/components/shared/NavbarContext";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import { useUnreadInboxCount } from "@/hooks/useUnreadInboxCount";
import { useInterestedProviders } from "@/hooks/useInterestedProviders";
import { MOCK_LEADS } from "@/lib/mock/provider-leads";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFindCareOpen, setIsFindCareOpen] = useState(false);
  const [isMobileCareOpen, setIsMobileCareOpen] = useState(false);
  // Mobile accordion states — only one open at a time
  const [mobileAccordion, setMobileAccordion] = useState<"account" | "discover" | "hub" | "settings" | null>(null);
  // Mobile menu mode — tracks which portal view is shown (separate from actual URL context)
  const [mobileMenuMode, setMobileMenuMode] = useState<"family" | "provider">("family");
  const { user, account, activeProfile, profiles, openAuth, signOut, fetchError, isLoading: authLoading, switchProfile } =
    useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const { visible: navbarVisible } = useNavbar();
  const { savedCount, hasInitialized: savedInitialized } = useSavedProviders();
  const profileIds = (profiles || []).map((p) => p.id);
  const unreadInboxCount = useUnreadInboxCount(profileIds);
  const providerProfileIds = (profiles || []).filter((p) => p.type !== "family").map((p) => p.id);
  const providerInboxCount = useUnreadInboxCount(providerProfileIds);
  const familyProfileForMatches = (profiles || []).find((p) => p.type === "family");
  const { pendingCount: matchesPendingCount } = useInterestedProviders(
    familyProfileForMatches?.id
  );
  const [newLeadsCount, setNewLeadsCount] = useState(() => {
    try {
      const stored = localStorage.getItem("olera_leads_new_count");
      if (stored !== null) return parseInt(stored, 10) || 0;
    } catch { /* localStorage unavailable */ }
    // No stored value yet — compute from source data
    return MOCK_LEADS.filter((l) => l.isNew).length;
  });
  useEffect(() => {
    const handler = (e: Event) => setNewLeadsCount((e as CustomEvent).detail as number);
    window.addEventListener("olera:leads-count", handler);
    return () => window.removeEventListener("olera:leads-count", handler);
  }, []);
  const [hasAttemptedOnboarding, setHasAttemptedOnboarding] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Track client-side mount for createPortal (SSR-safe)
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setHasAttemptedOnboarding(
      !!localStorage.getItem("olera_onboarding_provider_type")
    );
  }, []);

  // Lightweight admin check
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    fetch("/api/admin/auth")
      .then((res) => setIsAdmin(res.ok))
      .catch(() => setIsAdmin(false));
  }, [user]);

  const isPortal = pathname.startsWith("/portal");
  const isProviderPortal =
    pathname === "/provider" ||
    pathname.startsWith("/provider/connections") ||
    pathname.startsWith("/provider/inbox") ||
    pathname.startsWith("/provider/onboarding") ||
    pathname.startsWith("/provider/profile") ||
    pathname.startsWith("/provider/reviews") ||
    pathname.startsWith("/provider/matches") ||
    pathname.startsWith("/provider/pro") ||
    pathname.startsWith("/provider/qna") ||
    pathname.startsWith("/provider/verification") ||
    pathname.startsWith("/provider/account");
  const isCommunity = pathname.startsWith("/community");
  const isMinimalNav = pathname.startsWith("/portal/inbox");

  // Show auth pill as soon as we know a user session exists.
  const hasSession = !!user;
  const isFullyLoaded = !!user && !authLoading;
  // Mode switcher — shown when user has both a family and a provider profile
  const hasFamilyProfile = (profiles || []).some((p) => p.type === "family");
  const hasProviderProfile = (profiles || []).some(
    (p) => p.type === "organization" || p.type === "caregiver"
  );
  const showModeSwitcher = isFullyLoaded && hasFamilyProfile && hasProviderProfile;

  // Profile IDs for hub switching — used by the mode switcher to also switch activeProfile
  const familyProfileId = (profiles || []).find((p) => p.type === "family")?.id;
  const providerProfileId = (profiles || []).find(
    (p) => p.type === "organization" || p.type === "caregiver"
  )?.id;

  // Show user's actual name in the dropdown, not the org/profile name
  const displayName = account?.display_name || user?.email || "";
  const initials = getInitials(displayName);

  // Show the contextual profile type based on which portal the user is in,
  // not the database-stored activeProfile (which may be stale).
  const contextProfileType = isProviderPortal
    ? (profiles || []).find((p) => p.type === "organization" || p.type === "caregiver")?.type
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
      (p) => p.type === "organization" || p.type === "caregiver"
    );
    if (hasProviderProfile) {
      router.push("/provider");
      return;
    }
    if (user) {
      router.push("/provider/onboarding");
    } else {
      router.push("/for-providers");
    }
  }, [user, profiles, openAuth, router]);

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
      if (e.key === "Escape") setIsFindCareOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFindCareOpen]);

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
    setIsFindCareOpen(false);
  }, [pathname]);

  // Reset mobile menu state when menu opens
  useEffect(() => {
    if (isMobileMenuOpen && hasSession) {
      // Set mode based on current URL context
      const mode = isProviderPortal ? "provider" : "family";
      setMobileMenuMode(mode);
      // Set default accordion based on mode
      setMobileAccordion(mode === "provider" ? "hub" : "account");
    } else if (!isMobileMenuOpen) {
      setMobileAccordion(null);
      setIsMobileCareOpen(false);
    }
  }, [isMobileMenuOpen, hasSession, isProviderPortal]);

  // Provider-facing flows (claim, removal request) use their own minimal top nav.
  // All hooks are above this point so the early-return is safe.
  if (pathname.startsWith("/for-providers")) return null;

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

      {/* Mode switcher — loading skeleton while profiles load */}
      {authLoading && (
        <>
          <div className="px-3 pt-2 pb-1">
            <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl animate-pulse">
              <div className="flex-1 h-7 bg-gray-200 rounded-lg" />
              <div className="flex-1 h-7 bg-gray-200 rounded-lg" />
            </div>
          </div>
          <div className="mx-4 border-t border-gray-100" />
        </>
      )}

      {/* Mode switcher — shown when both profiles exist OR user has started provider onboarding */}
      {!authLoading && (showModeSwitcher || hasAttemptedOnboarding) && (
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
                  } else if (hasAttemptedOnboarding) {
                    setIsUserMenuOpen(false);
                    router.push("/provider/onboarding");
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

      {isFullyLoaded ? (
        <>
          {/* Tier 1 — Hub-specific links */}
          <div className="px-2 py-1.5">
            {isProviderPortal ? (
              <>
                {/* Provider Hub links */}
                <Link
                  href="/portal/profile"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Account
                </Link>
                <Link
                  href="/provider/pro"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Olera Pro
                </Link>
                <Link
                  href="/provider/verification"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                  Identity Verification
                </Link>
                <Link
                  href="/provider/qna"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Questions & Answers
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
                    <span className="ml-auto text-[10px] font-bold text-white bg-primary-600 rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
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
                  Account
                </Link>
                {hasFamilyProfile && (
                  <Link
                    href="/portal/matches"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                      <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
                    </svg>
                    Matches
                    {matchesPendingCount > 0 && (
                      <span className="ml-auto text-[10px] font-bold text-white bg-primary-600 rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                        {matchesPendingCount}
                      </span>
                    )}
                  </Link>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="px-5 py-3 space-y-2.5">
          <div className="h-3.5 w-28 bg-gray-100 rounded animate-pulse" />
          <div className="h-3.5 w-36 bg-gray-100 rounded animate-pulse" />
          <div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
      )}

      {/* Profile switcher */}
      {isFullyLoaded && <div className="mx-4 border-t border-gray-100" />}
      {isFullyLoaded && (
        <div className="px-2 py-1">
          <ProfileSwitcher
            onSwitch={() => setIsUserMenuOpen(false)}
            variant="dropdown"
            allowedTypes={isProviderPortal ? ["organization", "caregiver"] : ["family"]}
            navigateTo={isProviderPortal ? "/provider" : "/"}
          />
        </div>
      )}

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
      {/* Auth actions */}
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
          Log in
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setIsUserMenuOpen(false);
            openAuth({});
          }}
          className="w-full text-left px-3.5 py-2.5 text-[15px] text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
        >
          Create account
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
            openAuth({ intent: "provider", providerType: "organization" });
          }}
          className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 text-[15px] text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
        >
          <svg className="w-[18px] h-[18px] text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
          List your organization
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setIsUserMenuOpen(false);
            openAuth({ intent: "provider", providerType: "caregiver" });
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

  // Onboarding page has its own minimal nav
  if (pathname === "/provider/onboarding") return null;

  return (
    <>
      <nav
        className={`sticky top-0 z-50 bg-white ${isPortal || isProviderPortal || isCommunity ? "border-b border-gray-200" : isScrolled && navbarVisible ? "shadow-sm" : ""}`}
        style={{
          transform: navbarVisible ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 200ms cubic-bezier(0.33, 1, 0.68, 1)"
        }}
      >
        <div className={isMinimalNav ? "px-[44px]" : isCommunity ? "px-8" : "max-w-7xl mx-auto px-5 sm:px-6 lg:px-8"}>
          {/*
           * 3-column layout: Left | Center Nav | Right
           *
           * Family mode:  [Olera logo]  |  [Find Care, Community, ...]  |  [For Providers, ♥, User menu]
           * Provider mode: [User menu]  |  [Profile, Inbox, Leads, ...]  |  [Olera logo]
           *
           * Left and right are flex-1 so center nav is truly page-centered.
           */}
          <div className="flex items-center h-16">

            {/* ── LEFT COLUMN — always Olera logo ── */}
            <div className="flex-1 flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" priority />
                <span className="text-xl font-bold text-gray-900">Olera</span>
              </Link>
            </div>

            {/* ── CENTER — Primary navigation (page-centered, hidden on mobile + inbox) ── */}
            {!isMinimalNav && (
              <div className="hidden lg:flex items-center gap-1">
                {isProviderPortal ? (
                  /* Provider Hub nav links */
                  <>
                    {([
                      { label: "Dashboard", href: "/provider", match: "/provider", badge: 0 },
                      { label: "Inbox", href: "/provider/inbox", match: "/provider/inbox", badge: providerInboxCount },
                      { label: "Leads", href: "/provider/connections", match: "/provider/connections", badge: newLeadsCount },
                      { label: "Reviews", href: "/provider/reviews", match: "/provider/reviews", badge: 0 },
                      { label: "Matches", href: "/provider/matches", match: "/provider/matches", badge: 0 },
                    ] as const).map((item) => {
                      const active = item.match
                        ? item.match === "/provider"
                          ? pathname === "/provider"
                          : pathname.startsWith(item.match)
                        : false;
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          className={`relative px-4 py-2 text-[15px] font-medium transition-colors ${
                            active
                              ? "text-primary-600"
                              : "text-gray-700 hover:text-gray-900"
                          }`}
                        >
                          {item.label}
                          {item.badge > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-primary-600 rounded-full">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </>
                ) : (
                  /* Family / public nav links */
                  <>
                    {/* Find Care trigger */}
                    <div onMouseEnter={() => setIsFindCareOpen(true)}>
                      <button
                        type="button"
                        onClick={() => {
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

                    {/* Simple nav links */}
                    {NAV_LINKS.map((link) => {
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
                  /* Provider mode: Switch to family + user menu */
                  <>
                    {/* Switch to family */}
                    {user && (
                      <button
                        type="button"
                        onClick={() => {
                          if (hasFamilyProfile && familyProfileId) switchProfile(familyProfileId);
                          router.push("/");
                        }}
                        className="px-4 py-2 text-[15px] font-medium text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                      >
                        Switch to family
                      </button>
                    )}
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
                            <Image src={activeProfile.image_url} alt={displayName} width={32} height={32} className="rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
                              {initials}
                            </div>
                          )}
                          {(unreadInboxCount > 0 || matchesPendingCount > 0) && (
                            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-primary-600 rounded-full border-2 border-white" />
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
                    {/* For Providers link */}
                    <button
                      onClick={handleForProviders}
                      className="px-4 py-2 text-[15px] font-medium text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                    >
                      For Providers
                    </button>

                    {/* Saved providers heart */}
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
                            <Image src={activeProfile.image_url} alt={displayName} width={32} height={32} className="rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
                              {initials}
                            </div>
                          )}
                          {(unreadInboxCount > 0 || matchesPendingCount > 0) && (
                            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-primary-600 rounded-full border-2 border-white" />
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
                )}
              </div>

              {/* Mobile Menu Button — always on right */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
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
            </div>
          </div>

        </div>
      </nav>

      {/* ── MOBILE MENU (Full-screen overlay via portal) ── */}
      {isMobileMenuOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden bg-white flex flex-col animate-fade-in">
          {/* Header — matches navbar height and padding */}
          <div className="flex items-center justify-between h-16 px-5 shrink-0">
            <Link
              href="/"
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
            <div className="flex flex-col">
              {hasSession ? (
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

                  {/* Mode switcher — loading skeleton while profiles load */}
                  {hasSession && authLoading && (
                    <div className="py-2 mb-2">
                      <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl animate-pulse">
                        <div className="flex-1 h-[44px] bg-gray-200 rounded-lg" />
                        <div className="flex-1 h-[44px] bg-gray-200 rounded-lg" />
                      </div>
                    </div>
                  )}

                  {/* Mode switcher — navigates AND closes menu (matches desktop behavior) */}
                  {!authLoading && (showModeSwitcher || hasAttemptedOnboarding) && (
                    <div className="py-2 mb-2">
                      <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            if (hasFamilyProfile && familyProfileId) switchProfile(familyProfileId);
                            setIsMobileMenuOpen(false);
                            router.push("/");
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
                            if (hasProviderProfile && providerProfileId) {
                              switchProfile(providerProfileId);
                              setIsMobileMenuOpen(false);
                              router.push("/provider");
                            } else if (hasAttemptedOnboarding) {
                              setIsMobileMenuOpen(false);
                              router.push("/provider/onboarding");
                            }
                          }}
                          disabled={!hasProviderProfile && !hasAttemptedOnboarding}
                          className={[
                            "flex-1 text-center px-3 py-2 rounded-lg text-sm font-semibold transition-all min-h-[44px]",
                            mobileMenuMode === "provider" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                            !hasProviderProfile && !hasAttemptedOnboarding ? "opacity-50 cursor-not-allowed" : "",
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
                              { label: "Dashboard", href: "/provider", match: "/provider", badge: 0, icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
                              { label: "Inbox", href: "/provider/inbox", match: "/provider/inbox", badge: providerInboxCount, icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
                              { label: "Leads", href: "/provider/connections", match: "/provider/connections", badge: newLeadsCount, icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
                              { label: "Matches", href: "/provider/matches", match: "/provider/matches", badge: 0, icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" },
                              { label: "Reviews", href: "/provider/reviews", match: "/provider/reviews", badge: 0, icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" },
                            ] as const).map((item) => {
                              const active = item.match === "/provider" ? pathname === "/provider" : pathname.startsWith(item.match);
                              return (
                                <Link
                                  key={item.label}
                                  href={item.href}
                                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${active ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => {
                                    // Switch to provider profile if not already active
                                    if (hasProviderProfile && providerProfileId) switchProfile(providerProfileId);
                                    setIsMobileMenuOpen(false);
                                  }}
                                >
                                  <svg className={`w-5 h-5 shrink-0 ${active ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                  </svg>
                                  <span className="text-[15px]">{item.label}</span>
                                  {item.badge > 0 && (
                                    <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold text-white bg-primary-600 rounded-full">
                                      {item.badge}
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Account accordion (collapsed by default) */}
                      <div className="rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setMobileAccordion(mobileAccordion === "settings" ? null : "settings")}
                          className={`flex items-center justify-between w-full px-3 py-3 rounded-xl transition-colors ${mobileAccordion === "settings" ? "bg-gray-50" : "hover:bg-gray-50"}`}
                          aria-expanded={mobileAccordion === "settings"}
                        >
                          <span className="text-[15px] font-semibold text-gray-900">Account</span>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${mobileAccordion === "settings" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {mobileAccordion === "settings" && (
                          <div className="mt-1 space-y-0.5">
                            {([
                              { label: "Profile", href: "/provider/profile", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
                              { label: "Q&A", href: "/provider/qna", icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
                              { label: "Identity Verification", href: "/provider/verification", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
                              { label: "Olera Pro", href: "/provider/pro", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
                            ] as const).map((item) => {
                              const active = pathname.startsWith(item.href);
                              return (
                                <Link
                                  key={item.label}
                                  href={item.href}
                                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${active ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => {
                                    if (hasProviderProfile && providerProfileId) switchProfile(providerProfileId);
                                    setIsMobileMenuOpen(false);
                                  }}
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

                      {/* Switch to Family */}
                      {hasFamilyProfile && (
                        <>
                          <div className="my-3 border-t border-gray-100" />
                          <button
                            type="button"
                            onClick={() => {
                              if (familyProfileId) switchProfile(familyProfileId);
                              setIsMobileMenuOpen(false);
                              router.push("/");
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
                              { label: "Matches", href: "/portal/matches", badge: matchesPendingCount, icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" },
                              { label: "Saved", href: "/saved", badge: 0, icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" },
                              { label: "Account", href: "/portal/profile", badge: 0, icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
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
                                    <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold text-white bg-primary-600 rounded-full">
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
                                      link.label === "Community" ? "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" :
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

                      {/* Profile switcher & other actions */}
                      <div className="my-3 border-t border-gray-100" />

                      {isFullyLoaded && (
                        <div className="px-3">
                          <ProfileSwitcher
                            onSwitch={() => setIsMobileMenuOpen(false)}
                            variant="dropdown"
                            allowedTypes={["family"]}
                            navigateTo="/"
                          />
                        </div>
                      )}

                      {/* Switch to Provider */}
                      {(hasProviderProfile || hasAttemptedOnboarding) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (hasProviderProfile && providerProfileId) {
                              switchProfile(providerProfileId);
                              setIsMobileMenuOpen(false);
                              router.push("/provider");
                            } else if (hasAttemptedOnboarding) {
                              setIsMobileMenuOpen(false);
                              router.push("/provider/onboarding");
                            }
                          }}
                          className="flex items-center gap-3 px-3 py-3 text-gray-600 hover:text-primary-600 hover:bg-gray-50 rounded-xl transition-colors text-left w-full"
                        >
                          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                          <span className="text-[15px]">Switch to Provider Hub</span>
                        </button>
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
                    className={`flex items-center justify-between w-full py-3 font-medium ${pathname.startsWith("/browse") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
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

                  {/* Community */}
                  <Link
                    href="/community"
                    className={`flex items-center gap-3 py-3 font-medium ${pathname.startsWith("/community") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/community") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                    Community
                  </Link>

                  {/* Caregiver Support */}
                  <Link
                    href="/caregiver-support"
                    className={`flex items-center gap-3 py-3 font-medium ${pathname.startsWith("/caregiver-support") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/caregiver-support") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                    </svg>
                    Caregiver Support
                  </Link>

                  {/* Benefits Center */}
                  <Link
                    href="/benefits"
                    className={`flex items-center gap-3 py-3 font-medium ${pathname.startsWith("/benefits") ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <svg className={`w-5 h-5 shrink-0 ${pathname.startsWith("/benefits") ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    Benefits Center
                  </Link>

                  {/* Saved */}
                  <Link
                    href="/saved"
                    className={`flex items-center gap-3 py-3 font-medium ${pathname === "/saved" ? "text-primary-600" : "text-gray-700 hover:text-primary-600"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <svg className={`w-5 h-5 shrink-0 ${pathname === "/saved" ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                    Saved
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Sticky footer — auth card (logged out) or sign out (logged in) */}
          <div className="shrink-0 px-5 py-4 border-t border-gray-100 bg-white" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
            {hasSession ? (
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
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openAuth({ defaultMode: "sign-in" });
                  }}
                  className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors min-h-[48px]"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openAuth({});
                  }}
                  className="w-full py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors min-h-[48px]"
                >
                  Sign up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openAuth({ intent: "provider", providerType: "organization" });
                  }}
                  className="w-full py-2.5 text-sm text-gray-500 hover:text-primary-600 transition-colors min-h-[44px]"
                >
                  List your organization
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
        onClose={() => setIsFindCareOpen(false)}
        onMouseEnter={() => setIsFindCareOpen(true)}
        onMouseLeave={() => setIsFindCareOpen(false)}
      />
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

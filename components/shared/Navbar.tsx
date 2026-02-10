"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import ProfileSwitcher from "@/components/shared/ProfileSwitcher";
import FindCareMegaMenu from "@/components/shared/FindCareMegaMenu";
import { CARE_CATEGORIES, NAV_LINKS } from "@/components/shared/NavMenuData";
import { useNavbar } from "@/components/shared/NavbarContext";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const isPortalRoute = pathname?.startsWith("/portal");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFindCareOpen, setIsFindCareOpen] = useState(false);
  const [isMobileCareOpen, setIsMobileCareOpen] = useState(false);
  const { user, account, activeProfile, openAuth, signOut } =
    useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const { visible: navbarVisible } = useNavbar();

  // Show auth pill as soon as we know a user session exists.
  // Full dropdown content requires account data.
  const hasSession = !!user;
  const isFullyLoaded = !!user && !!account;
  const hasProfile = !!activeProfile;
  const isProvider =
    activeProfile?.type === "organization" ||
    activeProfile?.type === "caregiver";

  // Show user's actual name in the dropdown, not the org/profile name
  const displayName = account?.display_name || user?.email || "";
  const initials = getInitials(displayName);

  const profileTypeLabel = activeProfile
    ? activeProfile.type === "organization"
      ? "Organization"
      : activeProfile.type === "caregiver"
      ? "Caregiver"
      : "Family"
    : null;

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

  // Close user/account menu on outside click or Escape
  useEffect(() => {
    if (!isUserMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  // Close menus on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsFindCareOpen(false);
  }, [pathname]);

  return (
    <>
      <nav
        className={`sticky top-0 z-50 bg-white ${isScrolled && navbarVisible ? "shadow-sm" : ""}`}
        style={{
          transform: navbarVisible ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 200ms cubic-bezier(0.33, 1, 0.68, 1)"
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/*
           * 3-column layout: Logo | Center Nav | Right Menu
           * Left and right get flex-1 so the center nav is truly page-centered.
           */}
          <div className="flex items-center h-16">
            {/* Left — Logo (flex-1, align left) */}
            <div className="flex-1 flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary-600">
                  <span className="font-bold text-lg text-white">O</span>
                </div>
                <span className="text-xl font-bold text-gray-900">Olera</span>
              </Link>
            </div>

            {/* Center — Primary navigation (page-centered, hidden on portal & mobile) */}
            {!isPortalRoute && (
              <div className="hidden lg:flex items-center gap-1">
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
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="px-4 py-2 text-[15px] font-medium text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}

            {/* Right — Account menu (flex-1, align right) */}
            <div className="flex-1 flex items-center justify-end">
              {/* Desktop right section */}
              <div className="hidden lg:flex items-center">
                {hasSession ? (
                  /* ── Signed in: avatar pill with user/account menu ── */
                  <div className="relative" ref={userMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-gray-200 rounded-full hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                      aria-label="User menu"
                      aria-expanded={isUserMenuOpen}
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
                        {initials}
                      </div>
                    </button>

                    {isUserMenuOpen && (
                      <div className="absolute right-0 mt-2.5 w-60 bg-white rounded-2xl shadow-xl ring-1 ring-black/[0.06] py-1.5 z-50">
                        {/* User identity header */}
                        <div className="px-4 py-2.5 border-b border-gray-100">
                          <p className="text-[15px] font-semibold text-gray-900 truncate">
                            {displayName}
                          </p>
                          {profileTypeLabel && (
                            <p className="text-xs text-primary-600 font-medium mt-0.5">
                              {profileTypeLabel}
                            </p>
                          )}
                          <p className="text-sm text-gray-500 truncate mt-0.5">
                            {user?.email}
                          </p>
                        </div>
                        {isFullyLoaded ? (
                          hasProfile ? (
                            <div className="px-1.5 py-1">
                              <Link
                                href="/portal"
                                className="block px-3.5 py-2.5 text-[15px] text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                                onClick={() => setIsUserMenuOpen(false)}
                              >
                                Dashboard
                              </Link>
                              <Link
                                href="/portal/profile"
                                className="block px-3.5 py-2.5 text-[15px] text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                                onClick={() => setIsUserMenuOpen(false)}
                              >
                                Edit Profile
                              </Link>
                              <Link
                                href="/portal/connections"
                                className="block px-3.5 py-2.5 text-[15px] text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                                onClick={() => setIsUserMenuOpen(false)}
                              >
                                {isProvider ? "Connections" : "My Inquiries"}
                              </Link>
                              {isProvider && (
                                <Link
                                  href="/portal/settings"
                                  className="block px-3.5 py-2.5 text-[15px] text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                                  onClick={() => setIsUserMenuOpen(false)}
                                >
                                  Settings
                                </Link>
                              )}
                            </div>
                          ) : (
                            <div className="px-1.5 py-1">
                              <Link
                                href="/onboarding"
                                className="block px-3.5 py-2.5 text-[15px] text-primary-600 hover:bg-primary-50 rounded-xl transition-colors font-medium"
                                onClick={() => setIsUserMenuOpen(false)}
                              >
                                Complete your profile
                              </Link>
                            </div>
                          )
                        ) : (
                          <div className="px-4 py-3 text-sm text-gray-400">
                            Loading account...
                          </div>
                        )}
                        {/* Profile switcher — only when account data loaded */}
                        {isFullyLoaded && (
                          <div className="mx-3.5 border-t border-gray-100" />
                        )}
                        {isFullyLoaded && (
                          <div className="px-1.5 py-1">
                            <ProfileSwitcher
                              onSwitch={() => setIsUserMenuOpen(false)}
                              variant="dropdown"
                            />
                          </div>
                        )}
                        <div className="mx-3.5 border-t border-gray-100" />
                        <div className="px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              signOut(() => router.push("/"));
                            }}
                            className="w-full text-left px-3.5 py-2.5 text-[15px] text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Unauthenticated: pill menu with auth + intent options ── */
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

                    {isUserMenuOpen && (
                      <div
                        className="absolute right-0 mt-2.5 w-60 bg-white rounded-2xl shadow-xl ring-1 ring-black/[0.06] py-1.5 z-50"
                        role="menu"
                        aria-label="Account menu"
                      >
                        {/* Auth actions — prominent at top */}
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

                        {/* Intent actions — secondary, with icons */}
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
                    )}
                  </div>
                )}
              </div>

              {/* Mobile Menu Button */}
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

          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-gray-100">
              <div className="flex flex-col space-y-1">
                {/* Public nav items — hidden on portal routes */}
                {!isPortalRoute && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsMobileCareOpen((prev) => !prev)}
                      className="flex items-center justify-between w-full py-3 text-gray-700 hover:text-primary-600 font-medium"
                      aria-expanded={isMobileCareOpen}
                    >
                      Find Care
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          isMobileCareOpen ? "rotate-180" : ""
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
                    {isMobileCareOpen && (
                      <div className="pl-4 pb-2 space-y-1">
                        {CARE_CATEGORIES.map((cat) => (
                          <Link
                            key={cat.id}
                            href={`/browse?type=${cat.id}`}
                            className="block py-2 text-sm text-gray-600 hover:text-primary-600"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            <span className="font-medium">{cat.label}</span>
                            <span className="block text-xs text-gray-400 mt-0.5">
                              {cat.description}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {NAV_LINKS.map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        className="block py-3 text-gray-700 hover:text-primary-600 font-medium"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {link.label}
                      </Link>
                    ))}

                    <hr className="border-gray-100" />
                  </>
                )}

                {/* Account section */}
                {hasSession ? (
                  <>
                    {isFullyLoaded ? (
                      hasProfile ? (
                        <>
                          <Link
                            href="/portal"
                            className="block py-3 text-gray-600 hover:text-primary-600 font-medium"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            Dashboard
                          </Link>
                          <Link
                            href="/portal/profile"
                            className="block py-3 text-gray-600 hover:text-primary-600 font-medium"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            Edit Profile
                          </Link>
                          <Link
                            href="/portal/connections"
                            className="block py-3 text-gray-600 hover:text-primary-600 font-medium"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            {isProvider ? "Connections" : "My Inquiries"}
                          </Link>
                          {isProvider && (
                            <Link
                              href="/portal/settings"
                              className="block py-3 text-gray-600 hover:text-primary-600 font-medium"
                              onClick={() => setIsMobileMenuOpen(false)}
                            >
                              Settings
                            </Link>
                          )}
                        </>
                      ) : (
                        <Link
                          href="/onboarding"
                          className="block py-3 text-primary-600 hover:text-primary-700 font-medium"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          Complete your profile
                        </Link>
                      )
                    ) : (
                      <p className="py-3 text-sm text-gray-400">Loading account...</p>
                    )}
                    {/* Profile switcher — only when account loaded */}
                    {isFullyLoaded && (
                      <div className="border-t border-gray-100 pt-2">
                        <ProfileSwitcher
                          onSwitch={() => setIsMobileMenuOpen(false)}
                          variant="dropdown"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        signOut(() => router.push("/"));
                      }}
                      className="text-left text-red-600 hover:text-red-700 font-medium"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  /* ── Mobile unauthenticated: auth-first, then intent ── */
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuth({ defaultMode: "sign-in" });
                      }}
                      className="text-left py-3 text-gray-900 font-semibold"
                    >
                      Log in
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuth({});
                      }}
                      className="text-left py-3 text-gray-600 font-medium"
                    >
                      Create account
                    </button>
                    <hr className="border-gray-100 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        router.push("/browse");
                      }}
                      className="text-left py-3 text-gray-600 hover:text-primary-600 font-medium"
                    >
                      Find care
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuth({ intent: "provider", providerType: "organization" });
                      }}
                      className="text-left py-3 text-gray-600 hover:text-primary-600 font-medium"
                    >
                      List your organization
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuth({ intent: "provider", providerType: "caregiver" });
                      }}
                      className="text-left py-3 text-gray-600 hover:text-primary-600 font-medium"
                    >
                      Join as a caregiver
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Find Care Mega Menu — only on public pages */}
      {!isPortalRoute && (
        <FindCareMegaMenu
          isOpen={isFindCareOpen}
          onClose={() => setIsFindCareOpen(false)}
          onMouseEnter={() => setIsFindCareOpen(true)}
          onMouseLeave={() => setIsFindCareOpen(false)}
        />
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

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
  const { user, account, activeProfile, isLoading, openAuthFlow, signOut } =
    useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const { visible: navbarVisible } = useNavbar();

  // Gate on account existence — not just user — to ensure data has loaded
  const isAuthenticated = !!user && !!account;
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

  // Close user/account menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
                    onClick={() => setIsFindCareOpen((prev) => !prev)}
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
                {isLoading ? (
                  <div className="w-20 h-8" />
                ) : isAuthenticated ? (
                  /* ── Authenticated: avatar pill with user menu ── */
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
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                        <div className="px-4 py-2 border-b border-gray-100">
                          <p className="text-base font-medium text-gray-900 truncate">
                            {displayName}
                          </p>
                          {profileTypeLabel && (
                            <p className="text-xs text-primary-600 font-medium">
                              {profileTypeLabel}
                            </p>
                          )}
                          <p className="text-sm text-gray-500 truncate">
                            {user?.email}
                          </p>
                        </div>
                        {hasProfile ? (
                          <>
                            <Link
                              href="/portal"
                              className="block px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              Dashboard
                            </Link>
                            <Link
                              href="/portal/profile"
                              className="block px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              Edit Profile
                            </Link>
                            <Link
                              href="/portal/connections"
                              className="block px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              {isProvider ? "Connections" : "My Inquiries"}
                            </Link>
                            {isProvider && (
                              <Link
                                href="/portal/settings"
                                className="block px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                                onClick={() => setIsUserMenuOpen(false)}
                              >
                                Settings
                              </Link>
                            )}
                          </>
                        ) : (
                          <Link
                            href="/onboarding"
                            className="block px-4 py-3 text-base text-primary-600 hover:bg-primary-50 transition-colors font-medium"
                            onClick={() => setIsUserMenuOpen(false)}
                          >
                            Complete your profile
                          </Link>
                        )}
                        {/* Profile switcher */}
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <ProfileSwitcher
                            onSwitch={() => setIsUserMenuOpen(false)}
                            variant="dropdown"
                          />
                        </div>
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              signOut(() => router.push("/"));
                            }}
                            className="w-full text-left px-4 py-3 text-base text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Unauthenticated: pill menu with get-started options ── */
                  <div className="relative" ref={userMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 border border-gray-200 rounded-full hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                      aria-label="Account menu"
                      aria-expanded={isUserMenuOpen}
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      <div className="w-8 h-8 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                    </button>

                    {isUserMenuOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                        <p className="px-4 pt-2 pb-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Get started
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            openAuthFlow({ intent: "family" });
                          }}
                          className="w-full text-left px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          I&apos;m looking for care
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            openAuthFlow({ intent: "provider", providerType: "organization" });
                          }}
                          className="w-full text-left px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          List my organization
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            openAuthFlow({ intent: "provider", providerType: "caregiver" });
                          }}
                          className="w-full text-left px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Join as a caregiver
                        </button>
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              openAuthFlow({ defaultToSignIn: true });
                            }}
                            className="w-full text-left px-4 py-3 text-base text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Log in
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
                {isAuthenticated ? (
                  <>
                    {hasProfile ? (
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
                    )}
                    {/* Profile switcher */}
                    <div className="border-t border-gray-100 pt-2">
                      <ProfileSwitcher
                        onSwitch={() => setIsMobileMenuOpen(false)}
                        variant="dropdown"
                      />
                    </div>
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
                  /* ── Mobile unauthenticated: get-started options ── */
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuthFlow({ intent: "family" });
                      }}
                      className="text-left py-3 text-gray-700 hover:text-primary-600 font-medium"
                    >
                      I&apos;m looking for care
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuthFlow({ intent: "provider", providerType: "organization" });
                      }}
                      className="text-left py-3 text-gray-700 hover:text-primary-600 font-medium"
                    >
                      List my organization
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuthFlow({ intent: "provider", providerType: "caregiver" });
                      }}
                      className="text-left py-3 text-gray-700 hover:text-primary-600 font-medium"
                    >
                      Join as a caregiver
                    </button>
                    <hr className="border-gray-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openAuthFlow({ defaultToSignIn: true });
                      }}
                      className="text-left py-3 text-gray-700 hover:text-primary-600 font-medium"
                    >
                      Log in
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

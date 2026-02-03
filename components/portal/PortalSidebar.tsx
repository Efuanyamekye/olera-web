"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import ProfileSwitcher from "@/components/shared/ProfileSwitcher";
import type { Profile } from "@/lib/types";

interface PortalSidebarProps {
  profile: Profile | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

// Shared icon components
const icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  profile: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  connections: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  inquiries: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  saved: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

interface SidebarNav {
  main: NavSection[];
  bottom: NavItem[];
}

function getSidebarNav(profileType: string | undefined): SidebarNav {
  const mainItems: NavItem[] = [
    { label: "Dashboard", href: "/portal", icon: icons.dashboard },
    { label: "Profile", href: "/portal/profile", icon: icons.profile },
  ];

  if (profileType === "organization" || profileType === "caregiver") {
    mainItems.push(
      { label: "Connections", href: "/portal/connections", icon: icons.connections },
      { label: "Appointments", href: "/portal/calendar", icon: icons.calendar }
    );
  }

  if (profileType === "family") {
    mainItems.push(
      { label: "My Inquiries", href: "/portal/connections", icon: icons.inquiries },
      { label: "Appointments", href: "/portal/calendar", icon: icons.calendar },
      { label: "Saved Providers", href: "/portal/saved", icon: icons.saved }
    );
  }

  const sections: NavSection[] = [{ items: mainItems }];

  // Discover section — role-aware links inside portal
  const discoverItems: NavItem[] = [];
  if (profileType === "organization") {
    discoverItems.push(
      { label: "Browse Families", href: "/portal/discover/families", icon: icons.search },
      { label: "Browse Caregivers", href: "/portal/discover/caregivers", icon: icons.search }
    );
  } else if (profileType === "caregiver") {
    discoverItems.push(
      { label: "Browse Families", href: "/portal/discover/families", icon: icons.search },
      { label: "Find Jobs", href: "/portal/discover/providers", icon: icons.search }
    );
  } else if (profileType === "family") {
    discoverItems.push(
      { label: "Browse Providers", href: "/browse", icon: icons.search }
    );
  }

  if (discoverItems.length > 0) {
    sections.push({ label: "Discover", items: discoverItems });
  }

  // Bottom items — settings for providers
  const bottom: NavItem[] = [];
  if (profileType === "organization" || profileType === "caregiver") {
    bottom.push({ label: "Settings", href: "/portal/settings", icon: icons.settings });
  }

  return { main: sections, bottom };
}

export default function PortalSidebar({ profile }: PortalSidebarProps) {
  const pathname = usePathname();
  const sidebarNav = getSidebarNav(profile?.type);

  // Flat list of main items for mobile bottom nav (first 4 max)
  const mobileItems = (sidebarNav.main[0]?.items || []).slice(0, 4);

  const renderNavLink = (item: NavItem, compact = false) => {
    const isActive =
      item.href === "/portal"
        ? pathname === "/portal"
        : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={[
          compact
            ? "flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium min-w-[64px] min-h-[44px] justify-center"
            : "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors min-h-[44px]",
          isActive
            ? compact ? "text-primary-600" : "bg-primary-50 text-primary-700"
            : compact ? "text-gray-500" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        ].join(" ")}
      >
        {item.icon}
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar — sticky so bottom section stays visible on long pages */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          {profile ? (
            <div>
              <p className="text-base text-gray-500 mb-1">
                {profile.type === "organization"
                  ? "Organization"
                  : profile.type === "caregiver"
                  ? "Caregiver"
                  : "Family"}
              </p>
              <p className="text-lg font-semibold text-gray-900 truncate">
                {profile.display_name}
              </p>
            </div>
          ) : (
            <p className="text-base text-gray-500">No profile set</p>
          )}
        </div>

        <nav className="flex-1 p-4">
          {sidebarNav.main.map((section, idx) => (
            <div key={idx} className={idx > 0 ? "mt-6" : ""}>
              {section.label && (
                <p className="px-4 mb-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => renderNavLink(item))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: Settings + Profile switcher */}
        <div className="border-t border-gray-100">
          {sidebarNav.bottom.length > 0 && (
            <div className="px-4 pt-3">
              {sidebarNav.bottom.map((item) => renderNavLink(item))}
            </div>
          )}
          <div className="p-4">
            <ProfileSwitcher variant="sidebar" />
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="flex justify-around py-2">
          {mobileItems.map((item) => renderNavLink(item, true))}
        </div>
      </nav>
    </>
  );
}

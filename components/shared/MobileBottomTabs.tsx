"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface MobileBottomTabsProps {
  /** Whether any of Inbox/Q&A/Leads have unread items - shows red dot on More */
  hasNotifications: boolean;
  /** Callback when More tab is tapped */
  onMorePress: () => void;
}

interface TabConfig {
  key: string;
  label: string;
  href: string;
  /** Path prefix to match for active state */
  match: string;
  /** Exact match only (for /provider root) */
  exact?: boolean;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  {
    key: "profile",
    label: "Profile",
    href: "/provider",
    match: "/provider",
    exact: true,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    key: "families",
    label: "Families",
    href: "/provider/matches",
    match: "/provider/matches",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    key: "growth",
    label: "Growth",
    href: "/provider/growth",
    match: "/provider/growth",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    key: "hire",
    label: "Hire",
    href: "/provider/medjobs/candidates",
    match: "/provider/medjobs",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
  },
];

/**
 * Fixed bottom tab bar for provider mobile navigation.
 * Shows 4 direct links + "More" button that opens a bottom sheet.
 */
export default function MobileBottomTabs({
  hasNotifications,
  onMorePress,
}: MobileBottomTabsProps) {
  const pathname = usePathname();

  const isActive = (tab: TabConfig) => {
    if (tab.exact) {
      return pathname === tab.match;
    }
    return pathname.startsWith(tab.match);
  };

  // Check if any "More" route is active
  const moreRoutes = ["/portal/inbox", "/provider/qna", "/provider/connections", "/provider/reviews", "/provider/caregivers"];
  const isMoreActive = moreRoutes.some((route) => pathname.startsWith(route));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-[72px]">
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
                active ? "text-primary-600" : "text-gray-500"
              }`}
            >
              <span className={active ? "text-primary-500" : "text-gray-400"}>
                {tab.icon}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          type="button"
          onClick={onMorePress}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
            isMoreActive ? "text-primary-600" : "text-gray-500"
          }`}
        >
          <span className="relative">
            <svg
              className={`w-6 h-6 ${isMoreActive ? "text-primary-500" : "text-gray-400"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
              />
            </svg>
            {/* Red notification dot */}
            {hasNotifications && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </span>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}

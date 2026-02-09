"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Badge from "@/components/ui/Badge";
import type { AdminUser } from "@/lib/types";

interface AdminSidebarProps {
  adminUser: AdminUser;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const icons = {
  overview: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  providers: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  leads: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  team: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
    </svg>
  ),
};

const navItems: NavItem[] = [
  { label: "Overview", href: "/admin", icon: icons.overview },
  { label: "Providers", href: "/admin/providers", icon: icons.providers },
  { label: "Leads", href: "/admin/leads", icon: icons.leads },
  { label: "Team", href: "/admin/team", icon: icons.team },
];

export default function AdminSidebar({ adminUser }: AdminSidebarProps) {
  const pathname = usePathname();

  const renderNavLink = (item: NavItem, compact = false) => {
    const isActive =
      item.href === "/admin"
        ? pathname === "/admin"
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
            ? compact
              ? "text-primary-600"
              : "bg-primary-50 text-primary-700"
            : compact
              ? "text-gray-500"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        ].join(" ")}
      >
        {item.icon}
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <p className="text-base text-gray-500 mb-1">Admin Dashboard</p>
          <p className="text-sm text-gray-700 truncate">{adminUser.email}</p>
          <Badge variant={adminUser.role === "master_admin" ? "pro" : "default"}>
            {adminUser.role === "master_admin" ? "Master Admin" : "Admin"}
          </Badge>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {navItems.map((item) => renderNavLink(item))}
          </div>
        </nav>

        <div className="border-t border-gray-100 p-4">
          <Link
            href="/portal"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            <span>Back to Portal</span>
          </Link>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="flex justify-around py-2">
          {navItems.map((item) => renderNavLink(item, true))}
        </div>
      </nav>
    </>
  );
}

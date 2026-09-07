"use client";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import SidebarDrawerToggle from "@/components/admin/SidebarDrawerToggle";
import { ToastProvider } from "@/components/admin/Toast";
import { RecentMovesProvider } from "@/components/admin/RecentMoves";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const SIDEBAR_VISIBILITY_KEY = "admin-sidebar-hidden";
const WORKSPACE_ROUTES = new Set(["/admin/inbox", "/admin/support-email"]);
// Pages whose content is one wide figure rather than a column of cards.
// The 6xl reading column would force them to shrink or scroll sideways.
const WIDE_ROUTES = new Set(["/admin/operating-map"]);

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { adminUser, isLoading: adminLoading, error, retry } = useAdminAuth();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const isWorkspaceRoute = WORKSPACE_ROUTES.has(pathname);
  const isWideRoute = WIDE_ROUTES.has(pathname);

  useEffect(() => {
    try {
      setSidebarHidden(localStorage.getItem(SIDEBAR_VISIBILITY_KEY) === "true");
    } catch {
      // Storage can be unavailable in privacy-restricted browsers. The
      // drawer still works for the current page; it simply won't persist.
    }
  }, []);

  const setSidebarVisibility = useCallback((hidden: boolean) => {
    setSidebarHidden(hidden);
    try {
      localStorage.setItem(SIDEBAR_VISIBILITY_KEY, String(hidden));
    } catch {
      // Treat persistence as a convenience, never a navigation dependency.
    }
  }, []);

  // /api/admin/auth already validates the Supabase session. Do not also wait
  // for the global account/profile refresh: admin pages do not consume that
  // data, and a slow profile query used to hold the entire console hostage.
  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error === "not_authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Sign in required
          </h1>
          <p className="text-lg text-gray-600">
            You need to be signed in to access the admin dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (error === "access_denied") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access denied
          </h1>
          <p className="text-lg text-gray-600">
            You do not have admin privileges.
          </p>
        </div>
      </div>
    );
  }

  if (error || !adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Admin is taking too long
          </h1>
          <p className="text-base text-gray-600 mb-5">
            Your session is intact. The admin access check did not finish cleanly.
          </p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <RecentMovesProvider>
        <div className={isWorkspaceRoute ? "flex h-dvh min-h-0 overflow-hidden" : "flex min-h-screen"}>
          <AdminSidebar
            adminUser={adminUser}
            desktopHidden={sidebarHidden}
            onRequestClose={() => setSidebarVisibility(true)}
          />
          {sidebarHidden && (
            <div className="fixed left-3 top-3 z-30 hidden md:block">
              <SidebarDrawerToggle
                direction="open"
                onClick={() => setSidebarVisibility(false)}
                floating
              />
            </div>
          )}
          <div
            className={[
              "min-w-0 flex-1 transition-[padding] duration-200 ease-out",
              isWorkspaceRoute ? "h-full min-h-0 overflow-hidden" : "",
              sidebarHidden ? "md:pl-10" : "",
            ].join(" ")}
          >
            <div className={
              isWorkspaceRoute
                ? "h-full min-h-0 w-full overflow-hidden"
                : isWideRoute
                  ? "w-full px-4 py-8 sm:px-6 lg:px-8"
                  : "mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
            }>
              {children}
            </div>
          </div>
        </div>
      </RecentMovesProvider>
    </ToastProvider>
  );
}

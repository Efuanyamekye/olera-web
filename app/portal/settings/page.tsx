"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirect from old /portal/settings to new /account/settings.
 * Preserves bookmarks and existing links.
 */
export default function PortalSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account/settings");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 text-sm">Redirecting...</p>
    </div>
  );
}

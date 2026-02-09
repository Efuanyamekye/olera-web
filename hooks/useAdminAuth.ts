"use client";

import { useState, useEffect } from "react";
import type { AdminUser } from "@/lib/types";

interface UseAdminAuthResult {
  adminUser: AdminUser | null;
  isLoading: boolean;
  error: string | null;
}

export function useAdminAuth(): UseAdminAuthResult {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      try {
        const res = await fetch("/api/admin/auth");
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setAdminUser(data.adminUser);
          } else if (res.status === 403) {
            setError("access_denied");
          } else if (res.status === 401) {
            setError("not_authenticated");
          } else {
            setError("server_error");
          }
        }
      } catch {
        if (!cancelled) setError("network_error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  return { adminUser, isLoading, error };
}

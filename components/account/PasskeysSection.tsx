"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

/** A WebAuthn ceremony that the user simply dismissed — not a real error. */
function isCancellation(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  const name = e.name ?? "";
  const msg = (e.message ?? "").toLowerCase();
  return (
    name === "NotAllowedError" ||
    name === "AbortError" ||
    msg.includes("not allowed") ||
    msg.includes("cancel") ||
    msg.includes("aborted") ||
    msg.includes("timed out")
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Account-settings section to register and manage passkeys. Self-contained:
 * runs the WebAuthn ceremonies on the browser Supabase client (which has
 * experimental.passkey enabled) and manages its own list/loading state.
 * Renders nothing on browsers without WebAuthn support.
 */
export default function PasskeysSection() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // If listing fails (e.g. the dashboard passkey feature isn't enabled yet, or a
  // transient error) we hide the whole section rather than showing a scary error
  // box — passkeys are an optional, opt-in convenience.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined"
    );
  }, []);

  const loadPasskeys = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: listErr } = await (supabase.auth as any).passkey.list();
      if (listErr) throw listErr;
      setPasskeys((data ?? []) as Passkey[]);
    } catch (err) {
      console.error("[passkeys] list failed:", err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (supported) loadPasskeys();
  }, [supported, loadPasskeys]);

  const handleRegister = async () => {
    setError("");
    setRegistering(true);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: regErr } = await (supabase.auth as any).registerPasskey();
      if (regErr) {
        if (!isCancellation(regErr)) {
          setError("Couldn't create a passkey. Please try again.");
        }
        return;
      }
      // Append the freshly-created passkey from the response instead of
      // re-fetching — avoids a reload that could transiently fail.
      if (data) setPasskeys((prev) => [...prev, data as Passkey]);
    } catch (err) {
      if (!isCancellation(err)) {
        console.error("[passkeys] register failed:", err);
        setError("Couldn't create a passkey. Please try again.");
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    setDeletingId(id);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (supabase.auth as any).passkey.delete({ passkeyId: id });
      if (delErr) throw delErr;
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("[passkeys] delete failed:", err);
      setError("Couldn't remove that passkey. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!supported || loadFailed) return null;

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[15px] font-semibold text-gray-900">Passkeys</p>
        {passkeys.length > 0 && (
          <button
            type="button"
            onClick={handleRegister}
            disabled={registering}
            className="text-[13px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {registering ? "Setting up…" : "Add a passkey"}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Sign in with Face ID, Touch ID, or your device PIN — no password to remember.
      </p>

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-10 rounded-xl bg-gray-50 animate-pulse" />
      ) : passkeys.length === 0 ? (
        /* Empty state doubles as the gentle "set one up" nudge */
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-900">Skip the password next time</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Set up a passkey to sign in with a single tap.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRegister}
            disabled={registering}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {registering ? "Setting up…" : "Set up a passkey"}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3 min-w-0">
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {pk.friendly_name || "Passkey"}
                  </p>
                  <p className="text-xs text-gray-400">
                    Added {formatDate(pk.created_at)}
                    {pk.last_used_at ? ` · Last used ${formatDate(pk.last_used_at)}` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(pk.id)}
                disabled={deletingId === pk.id}
                className="text-[13px] font-medium text-gray-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 px-2"
              >
                {deletingId === pk.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

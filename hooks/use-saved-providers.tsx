"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  getAnonSaves,
  addAnonSave,
  removeAnonSave,
  clearAnonSaves,
  shouldShowNudge,
  recordNudgeShown,
  recordNudgeDismissed,
  type SavedProviderEntry,
} from "@/lib/saved-providers";
import SaveNudgeToast from "@/components/ui/SaveNudgeToast";
import { getDeferredAction, clearDeferredAction } from "@/lib/deferred-action";

export type { SavedProviderEntry } from "@/lib/saved-providers";

// Key for tracking if conversion was already tracked this session (prevents duplicates)
const CONVERSION_TRACKED_KEY = "olera_save_nudge_tracked";

export interface SaveProviderData {
  providerId: string;
  slug: string;
  name: string;
  location: string;
  careTypes: string[];
  image: string | null;
  rating?: number;
}

interface SavedProvidersContextValue {
  isSaved: (providerId: string) => boolean;
  toggleSave: (provider: SaveProviderData) => void;
  savedCount: number;
  anonSaves: SavedProviderEntry[];
  savedProviders: SavedProviderEntry[];
  /** True after the initial data load (anon + DB) has settled */
  hasInitialized: boolean;
  /** Error message from last save/unsave operation */
  saveError: string | null;
}

const SavedProvidersContext = createContext<SavedProvidersContextValue | null>(
  null
);

export function useSavedProviders() {
  const ctx = useContext(SavedProvidersContext);
  if (!ctx) {
    throw new Error(
      "useSavedProviders must be used within a SavedProvidersProvider"
    );
  }
  return ctx;
}

export function SavedProvidersProvider({ children }: { children: ReactNode }) {
  const { user, activeProfile, openAuth } = useAuth();

  // Anonymous saves (from sessionStorage)
  const [anonSaves, setAnonSaves] = useState<SavedProviderEntry[]>([]);
  // Authenticated saves — keyed by original provider ID (iOS slug or UUID)
  const [dbSaveIds, setDbSaveIds] = useState<Set<string>>(new Set());
  const [dbSaves, setDbSaves] = useState<SavedProviderEntry[]>([]);
  // Error state for save/unsave operations
  const [saveError, setSaveError] = useState<string | null>(null);
  // Nudge toast state for prompting guests to sign up
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeCount, setNudgeCount] = useState(0);

  const migrationDone = useRef(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Auto-dismiss save error after 4 seconds
  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 4000);
    return () => clearTimeout(timer);
  }, [saveError]);

  // Reset initialization flag on auth transitions so the Navbar
  // doesn't misinterpret DB-load count changes as user-initiated saves
  const prevUserId = useRef(user?.id);
  useEffect(() => {
    if (user?.id !== prevUserId.current) {
      prevUserId.current = user?.id;
      setHasInitialized(false);
    }
  }, [user?.id]);

  // Hydrate anonymous saves from sessionStorage on mount
  useEffect(() => {
    setAnonSaves(getAnonSaves());
  }, []);

  // Check for server-side tracking marker (_snt=1) in URL
  // This indicates the OAuth callback already tracked the save_nudge_converted event
  // Set sessionStorage flag to prevent duplicate client-side tracking
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("_snt") === "1") {
      sessionStorage.setItem(CONVERSION_TRACKED_KEY, Date.now().toString());

      // Clean up URL to remove the marker (cosmetic)
      params.delete("_snt");
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // Fetch DB saves for authenticated users
  useEffect(() => {
    if (!activeProfile || !isSupabaseConfigured()) {
      setDbSaveIds(new Set());
      setDbSaves([]);
      // Anonymous user or no profile yet — mark initialized after anon hydration
      if (!user) setHasInitialized(true);
      return;
    }

    const fetchDbSaves = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("connections")
        .select("to_profile_id, message, created_at")
        .eq("from_profile_id", activeProfile.id)
        .eq("type", "save")
        .order("created_at", { ascending: false });

      if (data) {
        const ids = new Set<string>();
        const entries: SavedProviderEntry[] = [];

        for (const r of data) {
          const meta = r.message ? JSON.parse(r.message) : {};
          // Use the originalProviderId (iOS slug) if stored, otherwise fall back to to_profile_id
          const originalId = meta.originalProviderId || r.to_profile_id;
          ids.add(originalId);
          entries.push({
            providerId: originalId,
            slug: meta.slug || originalId,
            name: meta.name || "Unknown Provider",
            location: meta.location || "",
            careTypes: meta.careTypes || [],
            image: meta.image || null,
            rating: meta.rating || undefined,
            savedAt: r.created_at,
          });
        }

        setDbSaveIds(ids);
        setDbSaves(entries);
      }
      setHasInitialized(true);
    };

    fetchDbSaves();
  }, [activeProfile, user]);

  // Create family profile for OAuth users who signed up via save nudge
  // This handles the case where ensure-account doesn't create a profile (no claimToken)
  const profileCreationAttempted = useRef(false);
  useEffect(() => {
    // Only run if user exists but no activeProfile yet
    if (!user || activeProfile || !isSupabaseConfigured()) return;
    if (profileCreationAttempted.current) return;

    const deferredAction = getDeferredAction();
    if (deferredAction?.action !== "save") return;

    const saves = getAnonSaves();
    if (saves.length === 0) return;

    profileCreationAttempted.current = true;

    // Create family profile for save nudge signups (OAuth flow)
    // This will trigger AuthProvider to refetch profiles, setting activeProfile
    const createFamilyProfile = async () => {
      try {
        // IMPORTANT: Call ensure-account first to create the account if it doesn't exist.
        // This fixes a race condition where create-profile was called before AuthProvider
        // had a chance to call ensure-account, resulting in "Account not found" errors.
        const ensureRes = await fetch("/api/auth/ensure-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mark_onboarding_complete: true }),
        });

        if (!ensureRes.ok) {
          console.error("[save-nudge] ensure-account failed:", ensureRes.status);
          // Don't clear deferred action - let user retry on next page load
          return;
        }

        const res = await fetch("/api/auth/create-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "family",
            displayName: user.email?.split("@")[0] || "My Family",
          }),
        });

        if (res.ok) {
          // Track conversion - use keepalive to ensure request completes even after page unload
          // This prevents the browser from canceling the request when we reload
          // Check for idempotency first - server may have already tracked this in callback
          const alreadyTracked = sessionStorage.getItem(CONVERSION_TRACKED_KEY);
          if (!alreadyTracked) {
            fetch("/api/activity/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                actor_type: "family",
                event_type: "save_nudge_converted",
                metadata: {
                  saved_count: saves.length,
                  saved_provider_names: saves.map((s) => s.name),
                  user_email: user.email,
                  user_name: user.email?.split("@")[0] || "User",
                  signup_method: "oauth",
                  tracked_at: "profile_creation_effect",
                },
              }),
              keepalive: true,
            })
              .then((res) => {
                if (!res.ok) {
                  console.error("[save-nudge] converted track failed (profile_creation):", res.status);
                } else {
                  sessionStorage.setItem(CONVERSION_TRACKED_KEY, Date.now().toString());
                }
              })
              .catch((err) => console.error("[save-nudge] converted track error (profile_creation):", err));
          }

          clearDeferredAction();

          // Force page refresh to reload auth state with new profile
          // This ensures activeProfile gets set and migration can proceed
          window.location.reload();
        } else {
          // Profile creation failed
          const errorData = await res.json().catch(() => ({}));
          console.error("[save-nudge] create-profile failed:", res.status, errorData);

          if (errorData.code === "ACCOUNT_TYPE_MISMATCH") {
            // Permanent failure - user has provider/caregiver profile with this email
            // Can't create family profile, clear deferred action to prevent retry loops
            clearDeferredAction();
            setSaveError("This email is already used for a different account type.");
          } else if (res.status === 409) {
            // Profile already exists (created by AuthProvider's ensure-account)
            // Still fire tracking since this is effectively a successful signup
            fetch("/api/activity/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                actor_type: "family",
                event_type: "save_nudge_converted",
                metadata: {
                  saved_count: saves.length,
                  saved_provider_names: saves.map((s) => s.name),
                  user_email: user.email,
                  user_name: user.email?.split("@")[0] || "User",
                  signup_method: "email_otp",
                },
              }),
              keepalive: true,
            }).catch(() => {});

            clearDeferredAction();

            // Reload to pick up the existing profile
            window.location.reload();
          } else {
            // Transient failure (500, network) - allow retry on next page load
            console.error("[save-nudge] Transient error, will retry on next load");
            profileCreationAttempted.current = false;
          }
        }
      } catch (err) {
        // Network error - allow retry on next page load
        console.error("[save-nudge] Network error:", err);
        profileCreationAttempted.current = false;
      }
    };

    createFamilyProfile();
  }, [user, activeProfile]);

  // Migrate anonymous saves to DB when user authenticates
  useEffect(() => {
    if (!user || !activeProfile || !isSupabaseConfigured()) return;
    if (migrationDone.current) return;

    const saves = getAnonSaves();

    // Handle deferred action BEFORE checking saves count.
    // This ensures we always clear stale deferred actions, even if saves are empty
    // (e.g., localStorage was cleared, user in incognito closed tab, etc.)
    try {
      const deferredAction = getDeferredAction();

      if (deferredAction?.action === "save") {
        // Check for idempotency first - server may have already tracked this in callback
        const alreadyTracked = sessionStorage.getItem(CONVERSION_TRACKED_KEY);
        if (alreadyTracked) {
          clearDeferredAction();
        } else if (saves.length > 0) {
          // Track conversion only if there are saves to migrate
          // (Most conversions are tracked in profile creation effect or magic-link handler;
          // this is a fallback for OAuth users)
          fetch("/api/activity/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actor_type: "family",
              event_type: "save_nudge_converted",
              metadata: {
                saved_count: saves.length,
                saved_provider_names: saves.map((s) => s.name),
                user_email: user.email || "unknown",
                user_name: user.email?.split("@")[0] || "User",
                signup_method: "oauth",
                tracked_at: "migration_effect",
              },
            }),
            keepalive: true,
          })
            .then((res) => {
              if (!res.ok) {
                console.error("[save-nudge] converted track failed (migration):", res.status);
              } else {
                sessionStorage.setItem(CONVERSION_TRACKED_KEY, Date.now().toString());
              }
            })
            .catch((err) => console.error("[save-nudge] converted track error (migration):", err));
          // Always clear deferred action to prevent stale state
          clearDeferredAction();
        } else {
          // Always clear deferred action to prevent stale state
          clearDeferredAction();
        }
      }
    } catch {
      // Non-blocking — conversion tracking failure should not affect migration
    }

    // Nothing to migrate if no saves
    if (saves.length === 0) return;

    migrationDone.current = true;

    const migrate = async () => {
      // Migrate each save via API (handles FK resolution)
      for (const s of saves) {
        try {
          await fetch("/api/connections/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId: s.providerId,
              providerName: s.name,
              providerSlug: s.slug,
              providerMeta: {
                location: s.location,
                careTypes: s.careTypes,
                image: s.image,
                rating: s.rating,
              },
            }),
          });
        } catch (err) {
          console.error("Migration save error:", err);
        }
      }

      clearAnonSaves();
      setAnonSaves([]);

      // Refresh DB saves
      const supabase = createClient();
      const { data } = await supabase
        .from("connections")
        .select("to_profile_id, message, created_at")
        .eq("from_profile_id", activeProfile.id)
        .eq("type", "save")
        .order("created_at", { ascending: false });

      if (data) {
        const ids = new Set<string>();
        const entries: SavedProviderEntry[] = [];

        for (const r of data) {
          const meta = r.message ? JSON.parse(r.message) : {};
          const originalId = meta.originalProviderId || r.to_profile_id;
          ids.add(originalId);
          entries.push({
            providerId: originalId,
            slug: meta.slug || originalId,
            name: meta.name || "Unknown Provider",
            location: meta.location || "",
            careTypes: meta.careTypes || [],
            image: meta.image || null,
            rating: meta.rating || undefined,
            savedAt: r.created_at,
          });
        }

        setDbSaveIds(ids);
        setDbSaves(entries);
      }
    };

    migrate();
  }, [user, activeProfile]);

  const isSaved = useCallback(
    (providerId: string) => {
      // Check primary key (providerId) first
      if (dbSaveIds.has(providerId)) return true;
      if (anonSaves.some((s) => s.providerId === providerId)) return true;
      // Fallback: check by slug for backward compatibility
      // (old saves keyed by UUID can still be found when checking by slug)
      if (dbSaves.some((s) => s.slug === providerId)) return true;
      if (anonSaves.some((s) => s.slug === providerId)) return true;
      return false;
    },
    [dbSaveIds, dbSaves, anonSaves]
  );

  const toggleSave = useCallback(
    async (provider: SaveProviderData) => {
      // Check if currently saved (by providerId or slug for backward compatibility)
      const currentlySaved = dbSaveIds.has(provider.providerId) ||
        anonSaves.some((s) => s.providerId === provider.providerId) ||
        dbSaves.some((s) => s.slug === provider.providerId) ||
        anonSaves.some((s) => s.slug === provider.providerId);

      if (currentlySaved) {
        // ── Unsave ──
        if (user && activeProfile && isSupabaseConfigured()) {
          // Find the actual entry to get its providerId (may differ from lookup key)
          const matchedEntry = dbSaves.find(
            (s) => s.providerId === provider.providerId || s.slug === provider.providerId
          );
          const entryProviderId = matchedEntry?.providerId || provider.providerId;

          // Store entry for potential rollback
          const entryToRestore = matchedEntry;

          // Optimistic local update
          setDbSaveIds((prev) => {
            const next = new Set(prev);
            next.delete(entryProviderId);
            return next;
          });
          setDbSaves((prev) => prev.filter(
            (s) => s.providerId !== entryProviderId && s.slug !== provider.providerId
          ));

          // Delete via API (use slug for consistent resolution)
          fetch("/api/connections/save", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: provider.slug || provider.providerId }),
          })
            .then((res) => {
              if (!res.ok) {
                // Rollback: restore the entry
                if (entryToRestore) {
                  setDbSaveIds((prev) => new Set(prev).add(entryProviderId));
                  setDbSaves((prev) => [entryToRestore, ...prev]);
                }
                setSaveError("Couldn't unsave. Please try again.");
              }
            })
            .catch(() => {
              // Rollback: restore the entry on network error
              if (entryToRestore) {
                setDbSaveIds((prev) => new Set(prev).add(entryProviderId));
                setDbSaves((prev) => [entryToRestore, ...prev]);
              }
              setSaveError("Couldn't unsave. Please try again.");
            });
        } else {
          // Anonymous unsave
          removeAnonSave(provider.providerId);
          setAnonSaves(getAnonSaves());
        }
      } else {
        // ── Save ──
        if (user && activeProfile && isSupabaseConfigured()) {
          // Optimistic local update
          setDbSaveIds((prev) => new Set(prev).add(provider.providerId));
          setDbSaves((prev) => [
            {
              providerId: provider.providerId,
              slug: provider.slug,
              name: provider.name,
              location: provider.location,
              careTypes: provider.careTypes,
              image: provider.image,
              rating: provider.rating,
              savedAt: new Date().toISOString(),
            },
            ...prev,
          ]);

          // Save via API (handles FK resolution)
          fetch("/api/connections/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId: provider.providerId,
              providerName: provider.name,
              providerSlug: provider.slug,
              providerMeta: {
                location: provider.location,
                careTypes: provider.careTypes,
                image: provider.image,
                rating: provider.rating,
              },
            }),
          })
            .then((res) => {
              if (!res.ok) {
                // Rollback optimistic update on failure
                setDbSaveIds((prev) => {
                  const next = new Set(prev);
                  next.delete(provider.providerId);
                  return next;
                });
                setDbSaves((prev) => prev.filter((s) => s.providerId !== provider.providerId));
                setSaveError("Couldn't save. Please try again.");
                // Provider accounts can't save; show why instead of "try again"
                res.json().then((data) => {
                  if (data?.code === "PROVIDER_ACCOUNT" && data.error) setSaveError(data.error);
                }).catch(() => {});
              }
            })
            .catch(() => {
              // Rollback optimistic update on network error
              setDbSaveIds((prev) => {
                const next = new Set(prev);
                next.delete(provider.providerId);
                return next;
              });
              setDbSaves((prev) => prev.filter((s) => s.providerId !== provider.providerId));
              setSaveError("Couldn't save. Please try again.");
            });
        } else {
          // Anonymous save — no limit, just save and maybe show nudge
          const newCount = addAnonSave({
            providerId: provider.providerId,
            slug: provider.slug,
            name: provider.name,
            location: provider.location,
            careTypes: provider.careTypes,
            image: provider.image,
            rating: provider.rating,
          });

          setAnonSaves(getAnonSaves());

          // Track provider_saved event (fire-and-forget)
          fetch("/api/activity/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actor_type: "provider",
              provider_id: provider.slug,
              event_type: "provider_saved",
              metadata: { anonymous_session: true },
            }),
          }).catch(() => {});

          // Check if we should show the nudge at this milestone
          if (shouldShowNudge(newCount)) {
            setNudgeCount(newCount);
            setShowNudge(true);
            recordNudgeShown(newCount);

            // Track save_nudge_shown event
            fetch("/api/activity/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                actor_type: "family",
                event_type: "save_nudge_shown",
                metadata: { milestone: newCount, saved_count: newCount },
              }),
            })
              .then((res) => {
                if (!res.ok) console.error("[save-nudge] shown track failed:", res.status);
              })
              .catch((err) => console.error("[save-nudge] shown track error:", err));
          }
        }
      }
    },
    [user, activeProfile, dbSaveIds, dbSaves, anonSaves]
  );

  const savedCount = dbSaveIds.size + anonSaves.length;
  const savedProviders = user && activeProfile ? dbSaves : anonSaves;

  // Nudge toast handlers
  const handleNudgeSignUp = useCallback(() => {
    setShowNudge(false);
    openAuth({
      defaultMode: "sign-up",
      intent: "family",
      deferred: {
        action: "save",
        returnUrl: typeof window !== "undefined" ? window.location.pathname : "/",
      },
    });
  }, [openAuth]);

  const handleNudgeDismiss = useCallback(() => {
    setShowNudge(false);
    recordNudgeDismissed();
  }, []);

  // Auto-dismiss doesn't count against the user's dismiss limit
  const handleNudgeAutoDismiss = useCallback(() => {
    setShowNudge(false);
  }, []);

  return (
    <SavedProvidersContext.Provider
      value={{ isSaved, toggleSave, savedCount, anonSaves, savedProviders, hasInitialized, saveError }}
    >
      {children}
      {/* Non-intrusive nudge toast for guests */}
      {showNudge && (
        <SaveNudgeToast
          savedCount={nudgeCount}
          savedProviders={anonSaves.slice(0, 3)}
          onSignUp={handleNudgeSignUp}
          onDismiss={handleNudgeDismiss}
          onAutoDismiss={handleNudgeAutoDismiss}
        />
      )}
      {/* Error toast for save/profile creation failures */}
      {saveError && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg shadow-lg">
            <p className="text-sm">{saveError}</p>
          </div>
        </div>
      )}
    </SavedProvidersContext.Provider>
  );
}

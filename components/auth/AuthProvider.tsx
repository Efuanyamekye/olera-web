"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { AuthState, Account, Profile, Membership, DeferredAction } from "@/lib/types";
import { setDeferredAction, clearDeferredAction } from "@/lib/deferred-action";

export type AuthModalView = "sign-in" | "sign-up";

/** Intent for the auth flow modal */
export type AuthFlowIntent = "family" | "provider" | null;

/** Provider subtype for the auth flow modal */
export type AuthFlowProviderType = "organization" | "caregiver" | null;

/** Options for opening the auth flow modal */
export interface OpenAuthFlowOptions {
  /** Deferred action to execute after auth */
  deferred?: Omit<DeferredAction, "createdAt">;
  /** Pre-set intent (skip the family vs provider question) */
  intent?: AuthFlowIntent;
  /** Pre-set provider type (skip the org vs caregiver question) */
  providerType?: AuthFlowProviderType;
  /** Profile to claim (for claim flow) */
  claimProfile?: Profile | null;
  /** Start with sign-in instead of sign-up */
  defaultToSignIn?: boolean;
}

// ────────────────────────────────────────────────────────────
// Unified Auth API (replaces openAuthModal + openAuthFlow)
// ────────────────────────────────────────────────────────────

/** Options for the unified openAuth() method */
export interface OpenAuthOptions {
  /** Default auth mode */
  defaultMode?: "sign-in" | "sign-up";
  /** Pre-set intent (skip the intent question) */
  intent?: AuthFlowIntent;
  /** Pre-set provider type (skip provider type question) */
  providerType?: AuthFlowProviderType;
  /** Profile to claim (for claim flow) */
  claimProfile?: Profile | null;
  /** Deferred action after auth */
  deferred?: Omit<DeferredAction, "createdAt">;
  /** Start in post-auth onboarding (for returning OAuth users) */
  startAtPostAuth?: boolean;
}

const AUTH_INTENT_KEY = "olera_auth_intent";

interface AuthContextValue extends AuthState {
  /** @deprecated Use openAuth instead */
  openAuthModal: (deferred?: Omit<DeferredAction, "createdAt">, view?: AuthModalView) => void;
  /** @deprecated Use openAuth instead */
  openAuthFlow: (options?: OpenAuthFlowOptions) => void;
  /** Open the unified auth modal */
  openAuth: (options?: OpenAuthOptions) => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
  authModalDefaultView: AuthModalView;
  /** Current auth flow modal options (legacy) */
  authFlowOptions: OpenAuthFlowOptions;
  /** Current unified auth options */
  unifiedAuthOptions: OpenAuthOptions;
  /** Whether unified auth modal is open */
  isUnifiedAuthOpen: boolean;
  /** Close the unified auth modal */
  closeUnifiedAuth: () => void;
  signOut: (onComplete?: () => void) => Promise<void>;
  refreshAccountData: (overrideUserId?: string) => Promise<void>;
  switchProfile: (profileId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

const EMPTY_STATE: AuthState = {
  user: null,
  account: null,
  activeProfile: null,
  profiles: [],
  membership: null,
  isLoading: false,
  fetchError: false,
};

// ─── Query timeout ──────────────────────────────────────────────────────
// Bounded wait: if Supabase doesn't respond in 5s, fail explicitly
// so the user sees an error + retry instead of an infinite spinner.
const QUERY_TIMEOUT_MS = 5_000;

function withBoundedTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Persistent cache (localStorage) ────────────────────────────────────
// Persists auth data across tabs, refreshes, and browser restarts.
// Background fetch on every page load keeps data fresh.
const CACHE_KEY = "olera_auth_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — background fetch refreshes on every page load

interface CachedAuthData {
  userId: string;
  account: Account;
  activeProfile: Profile | null;
  profiles: Profile[];
  membership: Membership | null;
  cachedAt: number;
}

function cacheAuthData(userId: string, data: Omit<CachedAuthData, "userId" | "cachedAt">) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...data, userId, cachedAt: Date.now() })
    );
  } catch {
    /* quota exceeded or SSR — ignore */
  }
}

function getCachedAuthData(
  userId: string
): Omit<CachedAuthData, "userId" | "cachedAt"> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAuthData;
    if (parsed.userId !== userId) return null;
    // Expired cache — discard
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearAuthCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Provider ───────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    ...EMPTY_STATE,
    isLoading: true,
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalDefaultView, setAuthModalDefaultView] = useState<AuthModalView>("sign-up");
  const [authFlowOptions, setAuthFlowOptions] = useState<OpenAuthFlowOptions>({});
  const [isUnifiedAuthOpen, setIsUnifiedAuthOpen] = useState(false);
  const [unifiedAuthOptions, setUnifiedAuthOptions] = useState<OpenAuthOptions>({});

  const configured = isSupabaseConfigured();

  // Refs to avoid stale closures
  const userIdRef = useRef<string | null>(null);
  const accountIdRef = useRef<string | null>(null);
  // Version counter to discard stale async responses
  const versionRef = useRef(0);
  // Tracks whether init() is handling the initial session.
  // Prevents the SIGNED_IN listener from firing a duplicate fetchAccountData.
  const initHandlingRef = useRef(true);

  // Keep refs in sync with state
  useEffect(() => {
    userIdRef.current = state.user?.id ?? null;
    accountIdRef.current = state.account?.id ?? null;
  }, [state.user, state.account]);

  /**
   * Fetch account, profiles, and membership for a given user ID.
   * Has a 15-second timeout — throws on timeout so callers can handle it.
   */
  const fetchAccountData = useCallback(
    async (userId: string) => {
      if (!configured) return null;

      const supabase = createClient();

      console.time("[olera] fetchAccountData");

      // Step 1: Get account (required for everything else)
      console.time("[olera] query: accounts");
      const accountResult = await withBoundedTimeout(
        supabase
          .from("accounts")
          .select("*")
          .eq("user_id", userId)
          .single<Account>(),
        QUERY_TIMEOUT_MS,
        "accounts query"
      );
      const account = accountResult.data;
      const accountError = accountResult.error;
      console.timeEnd("[olera] query: accounts");

      if (accountError || !account) {
        console.timeEnd("[olera] fetchAccountData");
        return null;
      }

      // Step 2: Fetch profiles and membership in parallel
      console.time("[olera] query: profiles+membership");
      const [profilesResult, membershipResult] = await withBoundedTimeout(
        Promise.all([
          supabase
            .from("business_profiles")
            .select("*")
            .eq("account_id", account.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("memberships")
            .select("*")
            .eq("account_id", account.id)
            .limit(1),
        ]),
        QUERY_TIMEOUT_MS,
        "profiles+membership query"
      );
      console.timeEnd("[olera] query: profiles+membership");

      const profiles = (profilesResult.data as Profile[]) || [];
      const membershipRows = (membershipResult.data as Membership[]) || [];
      const membership = membershipRows[0] ?? null;

      let activeProfile: Profile | null = null;
      if (account.active_profile_id) {
        activeProfile =
          profiles.find((p) => p.id === account.active_profile_id) || null;
      }

      console.timeEnd("[olera] fetchAccountData");
      return { account, activeProfile, profiles, membership };
    },
    [configured]
  );

  // Initialize: check session + listen for auth changes
  useEffect(() => {
    if (!configured) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    const init = async () => {
      console.time("[olera] init");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      let userId: string;
      let userEmail: string | undefined;
      let emailConfirmedAt: string | undefined;

      if (session?.user) {
        userId = session.user.id;
        userEmail = session.user.email;
        emailConfirmedAt = session.user.email_confirmed_at ?? undefined;
      } else {
        // getSession() reads cookies locally and can fail due to chunking,
        // timing, or token refresh races (especially in new tabs).
        // Fall back to getUser() which validates server-side.
        const { data: { user: validatedUser } } = await supabase.auth.getUser();

        if (cancelled) return;

        if (!validatedUser) {
          // No session found. Don't clear the cache here — the session
          // might be in flight (OTP flow: setSession hasn't completed yet).
          // Cache is cleared on explicit SIGNED_OUT instead, which is the
          // only reliable signal that the user intentionally logged out.
          setState({ ...EMPTY_STATE, isLoading: false });
          initHandlingRef.current = false;
          console.timeEnd("[olera] init");
          return;
        }

        userId = validatedUser.id;
        userEmail = validatedUser.email;
        emailConfirmedAt = validatedUser.email_confirmed_at ?? undefined;
      }

      // Restore cached data immediately — no loading screens, correct
      // initials, full portal rendered on first paint.
      const cached = getCachedAuthData(userId);
      const hasCachedData = !!cached?.account;

      // Set user immediately so the avatar pill shows. If cache is warm,
      // also set account/profiles for instant render. If cache is cold,
      // keep isLoading true — the dropdown will show a brief loading state
      // instead of an empty-then-full flash.
      setState({
        user: { id: userId, email: userEmail!, email_confirmed_at: emailConfirmedAt },
        account: cached?.account ?? null,
        activeProfile: cached?.activeProfile ?? null,
        profiles: cached?.profiles ?? [],
        membership: cached?.membership ?? null,
        isLoading: !hasCachedData, // Only "done" if we have cached data
        fetchError: false,
      });

      // Fetch fresh data. When cache is cold this is the critical path —
      // the UI stays in loading state until this completes.
      try {
        const data = await fetchAccountData(userId);
        if (cancelled) return;

        if (data) {
          // If account exists but no family profile, ensure one gets created
          const hasFamilyProfile = data.profiles.some((p) => p.type === "family");
          if (!hasFamilyProfile) {
            try {
              await fetch("/api/auth/ensure-account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              if (cancelled) return;
              // Re-fetch to pick up the new family profile
              const refreshed = await fetchAccountData(userId);
              if (cancelled) return;
              if (refreshed) {
                cacheAuthData(userId, refreshed);
                setState((prev) => ({
                  ...prev,
                  account: refreshed.account,
                  activeProfile: refreshed.activeProfile,
                  profiles: refreshed.profiles,
                  membership: refreshed.membership,
                  isLoading: false,
                  fetchError: false,
                }));
                console.timeEnd("[olera] init");
                return;
              }
            } catch {
              // Best-effort — continue with what we have
            }
          }
          cacheAuthData(userId, data);
          setState((prev) => ({
            ...prev,
            account: data.account,
            activeProfile: data.activeProfile,
            profiles: data.profiles,
            membership: data.membership,
            isLoading: false,
            fetchError: false,
          }));
        } else {
          // No account found — ensure one exists (creates account + family profile)
          try {
            await fetch("/api/auth/ensure-account", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });
            if (cancelled) return;
            // Re-fetch now that account + family profile exist
            const retryData = await fetchAccountData(userId);
            if (cancelled) return;
            if (retryData) {
              cacheAuthData(userId, retryData);
              setState((prev) => ({
                ...prev,
                account: retryData.account,
                activeProfile: retryData.activeProfile,
                profiles: retryData.profiles,
                membership: retryData.membership,
                isLoading: false,
                fetchError: false,
              }));
            } else {
              setState((prev) => ({ ...prev, isLoading: false, fetchError: true }));
            }
          } catch {
            if (cancelled) return;
            setState((prev) => ({ ...prev, isLoading: false, fetchError: !hasCachedData }));
          }
        }
      } catch (err) {
        console.error("[olera] init fetch failed:", err);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          fetchError: !hasCachedData,
        }));
      }

      // Allow the SIGNED_IN listener to fire on subsequent sign-ins
      initHandlingRef.current = false;
      console.timeEnd("[olera] init");
    };

    init();

    // Auth state listener — handles sign in, sign out, token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT") {
        versionRef.current++;
        clearAuthCache();
        setState({ ...EMPTY_STATE });
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        // On page load, init() already handles the initial session.
        // Skip here to avoid a duplicate fetchAccountData call.
        if (initHandlingRef.current) return;

        const userId = session.user.id;

        // Set user + any cached data immediately
        const cached = getCachedAuthData(userId);
        const hasCachedData = !!cached?.account;
        setState((prev) => ({
          ...prev,
          user: { id: userId, email: session.user.email!, email_confirmed_at: session.user.email_confirmed_at ?? undefined },
          account: cached?.account ?? prev.account,
          activeProfile: cached?.activeProfile ?? prev.activeProfile,
          profiles: cached?.profiles ?? prev.profiles,
          membership: cached?.membership ?? prev.membership,
          // Only mark as "done loading" if we have cached data — otherwise
          // keep loading until the background fetch completes to avoid
          // showing empty states that flash to populated states.
          isLoading: !hasCachedData && !prev.account,
          fetchError: false,
        }));

        // Fetch fresh data in the background. Don't block the user.
        // Only retry (once) if the account row is missing (DB trigger delay),
        // NOT on timeout — retrying a timeout just doubles the wait.
        const version = ++versionRef.current;
        try {
          let data = await fetchAccountData(userId);

          // Retry once for missing account row (new signup, DB trigger delay).
          // Skip retry if it was a timeout — no point waiting again.
          if (!data?.account && !cancelled && versionRef.current === version) {
            await new Promise((r) => setTimeout(r, 1500));
            if (cancelled || versionRef.current !== version) return;
            data = await fetchAccountData(userId);
          }

          if (cancelled || versionRef.current !== version) return;

          if (data) {
            cacheAuthData(userId, data);
            setState((prev) => ({
              ...prev,
              account: data.account,
              activeProfile: data.activeProfile,
              profiles: data.profiles,
              membership: data.membership,
              isLoading: false,
              fetchError: false,
            }));
          } else if (!cached?.account) {
            setState((prev) => ({ ...prev, isLoading: false, fetchError: true }));
          } else {
            // Had cache, fetch returned nothing — keep cache, stop loading
            setState((prev) => ({ ...prev, isLoading: false }));
          }
        } catch (err) {
          // Timeout or network error — don't retry, just use cache
          console.error("[olera] SIGNED_IN fetch failed:", err);
          if (cancelled || versionRef.current !== version) return;
          setState((prev) => ({ ...prev, isLoading: false, fetchError: !cached?.account }));
        }
      }

      if (event === "TOKEN_REFRESHED" && session?.user) {
        const version = ++versionRef.current;
        try {
          const data = await fetchAccountData(session.user.id);

          if (cancelled || versionRef.current !== version) return;

          if (data) {
            cacheAuthData(session.user.id, data);
            setState((prev) => ({
              ...prev,
              user: { id: session.user.id, email: session.user.email!, email_confirmed_at: session.user.email_confirmed_at ?? undefined },
              account: data.account,
              activeProfile: data.activeProfile,
              profiles: data.profiles,
              membership: data.membership,
              isLoading: false,
            }));
          }
          // If fetch failed, silently keep existing state
        } catch (err) {
          console.error("[olera] TOKEN_REFRESHED fetch failed:", err);
          // Keep existing state — don't disrupt the user
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configured, fetchAccountData]);

  // Detect authenticated users who haven't completed onboarding and auto-open
  useEffect(() => {
    if (state.isLoading || !state.user) return;
    if (state.account && !state.account.onboarding_completed && !isUnifiedAuthOpen) {
      // Try to restore saved intent for context (OAuth redirects, CTA clicks)
      let intent: AuthFlowIntent = null;
      let providerType: AuthFlowProviderType = null;
      try {
        const saved = sessionStorage.getItem(AUTH_INTENT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          sessionStorage.removeItem(AUTH_INTENT_KEY);
          intent = parsed.intent;
          providerType = parsed.providerType;
        }
      } catch {
        // sessionStorage unavailable
      }

      // If the user was in the middle of provider onboarding (intent saved from auth,
      // or they already completed Step 1 and saved their provider type), redirect them
      // to the wizard instead of re-opening the modal.
      const hasStartedProviderOnboarding = (() => {
        try {
          return !!localStorage.getItem("olera_onboarding_provider_type")
            || !!localStorage.getItem("olera_provider_intent_started");
        } catch {
          return false;
        }
      })();

      if (intent === "provider" || hasStartedProviderOnboarding) {
        router.push("/provider/onboarding");
        return;
      }

      // Family or unknown intent — open the post-auth onboarding modal
      setUnifiedAuthOptions({
        intent,
        providerType,
        startAtPostAuth: true,
      });
      setIsUnifiedAuthOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isLoading, state.user, state.account]);

  /** @deprecated Use openAuth instead */
  const openAuthModal = useCallback(
    (deferred?: Omit<DeferredAction, "createdAt">, view?: AuthModalView) => {
      if (deferred) {
        setDeferredAction(deferred);
      }
      setAuthFlowOptions({
        deferred,
        defaultToSignIn: view === "sign-in",
      });
      setAuthModalDefaultView(view || "sign-up");
      setIsAuthModalOpen(true);
    },
    []
  );

  /** Open the unified auth flow modal with configurable options */
  const openAuthFlow = useCallback((options: OpenAuthFlowOptions = {}) => {
    if (options.deferred) {
      setDeferredAction(options.deferred);
    }
    setAuthFlowOptions(options);
    setAuthModalDefaultView(options.defaultToSignIn ? "sign-in" : "sign-up");
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthFlowOptions({});
  }, []);

  /** Open the unified auth modal */
  const openAuth = useCallback((options: OpenAuthOptions = {}) => {
    if (options.deferred) {
      setDeferredAction(options.deferred);
    } else if (options.intent) {
      // Clear stale deferred actions when an explicit intent is set.
      // Prevents e.g. a prior "Inquire" returnUrl from overriding
      // the post-auth redirect for "List your organization".
      clearDeferredAction();
    }
    // Persist intent to sessionStorage for OAuth redirects
    if (options.intent || options.providerType || options.claimProfile) {
      try {
        sessionStorage.setItem(
          AUTH_INTENT_KEY,
          JSON.stringify({
            intent: options.intent ?? null,
            providerType: options.providerType ?? null,
            claimProfileId: options.claimProfile?.id ?? null,
          })
        );
      } catch {
        // sessionStorage unavailable
      }
    }
    setUnifiedAuthOptions(options);
    setIsUnifiedAuthOpen(true);
  }, []);

  const closeUnifiedAuth = useCallback(() => {
    setIsUnifiedAuthOpen(false);
    setUnifiedAuthOptions({});
  }, []);

  /**
   * Sign out. Clears local state and navigates immediately,
   * then fires the Supabase signOut in the background.
   */
  const signOut = useCallback(
    async (onComplete?: () => void) => {
      if (!configured) return;
      clearAuthCache();
      // Clear onboarding session so a different user doesn't see stale data
      try {
        localStorage.removeItem("olera_onboarding_provider_type");
        localStorage.removeItem("olera_provider_wizard_data");
        localStorage.removeItem("olera_onboarding_step");
        localStorage.removeItem("olera_onboarding_search");
        localStorage.removeItem("olera_onboarding_claim");
      } catch {
        /* ignore */
      }
      versionRef.current++;
      setState({ ...EMPTY_STATE });
      onComplete?.();
      // Fire-and-forget — session invalidation happens in the background
      const supabase = createClient();
      supabase.auth.signOut().catch((err) => {
        console.error("Sign out error:", err);
      });
    },
    [configured]
  );

  /**
   * Refresh account data from the database.
   * Accepts an optional userId override for use immediately after
   * authentication (before React state has updated the ref).
   * Updates cache on success. Clears fetchError on success.
   */
  const refreshAccountData = useCallback(async (overrideUserId?: string) => {
    const userId = overrideUserId || userIdRef.current;
    if (!userId) return;

    const version = ++versionRef.current;
    try {
      const data = await fetchAccountData(userId);

      if (versionRef.current !== version) return;

      if (data) {
        cacheAuthData(userId, data);
        setState((prev) => ({
          ...prev,
          account: data.account,
          activeProfile: data.activeProfile,
          profiles: data.profiles,
          membership: data.membership,
          fetchError: false,
        }));
      }
    } catch (err) {
      console.error("[olera] refreshAccountData failed:", err);
      // Keep existing state
    }
  }, [fetchAccountData]);

  /**
   * Switch the active profile. Optimistic-first: updates local state
   * immediately so callers can navigate without waiting, then persists
   * to DB and refreshes in the background.
   */
  const switchProfile = useCallback(
    (profileId: string) => {
      const userId = userIdRef.current;
      const accountId = accountIdRef.current;
      if (!userId || !accountId || !configured) return;

      // Optimistic local update — instant
      setState((prev) => {
        const newActive =
          prev.profiles.find((p) => p.id === profileId) || null;
        return {
          ...prev,
          account: prev.account
            ? { ...prev.account, active_profile_id: profileId }
            : null,
          activeProfile: newActive,
        };
      });

      // DB write + refresh in the background (fire-and-forget)
      const supabase = createClient();
      (async () => {
        try {
          const { error } = await supabase
            .from("accounts")
            .update({ active_profile_id: profileId })
            .eq("id", accountId);
          if (error) console.error("Failed to switch profile:", error.message);
          await refreshAccountData();
        } catch {
          // Background sync failed — optimistic state still holds
        }
      })();
    },
    [configured, refreshAccountData]
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        openAuthModal,
        openAuthFlow,
        openAuth,
        closeAuthModal,
        isAuthModalOpen,
        authModalDefaultView,
        authFlowOptions,
        unifiedAuthOptions,
        isUnifiedAuthOpen,
        closeUnifiedAuth,
        signOut,
        refreshAccountData,
        switchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

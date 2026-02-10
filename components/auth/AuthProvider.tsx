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
  refreshAccountData: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
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
// Bounded wait: if Supabase doesn't respond in 15s, fail explicitly
// so the user sees an error + retry instead of an infinite spinner.
const QUERY_TIMEOUT_MS = 15_000;

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
// 30-minute TTL ensures stale data is refreshed.
const CACHE_KEY = "olera_auth_cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

      if (!session?.user) {
        clearAuthCache();
        setState({ ...EMPTY_STATE, isLoading: false });
        // Allow the SIGNED_IN listener to handle sign-ups that happen after page load
        initHandlingRef.current = false;
        console.timeEnd("[olera] init");
        return;
      }

      const userId = session.user.id;

      // Restore cached data immediately — no loading screens, correct
      // initials, full portal rendered on first paint.
      const cached = getCachedAuthData(userId);
      const hasCachedData = !!cached?.account;

      setState({
        user: { id: userId, email: session.user.email! },
        account: cached?.account ?? null,
        activeProfile: cached?.activeProfile ?? null,
        profiles: cached?.profiles ?? [],
        membership: cached?.membership ?? null,
        isLoading: false,
        fetchError: false,
      });

      // Background refresh — keeps data current without blocking UI
      try {
        const data = await fetchAccountData(userId);
        if (cancelled) return;

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
        } else if (!hasCachedData) {
          // Fetch returned null (no account row yet) and we have no cache.
          // Signal error so the UI can show a retry button.
          setState((prev) => ({ ...prev, fetchError: true }));
        }
      } catch (err) {
        console.error("[olera] init fetch failed:", err);
        if (cancelled) return;
        if (!hasCachedData) {
          // Timeout or network error with no cache — show error + retry
          setState((prev) => ({ ...prev, fetchError: true }));
        }
        // If we have cache, silently keep it — user sees stale data
        // which is much better than a spinner or error.
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
        setState((prev) => ({
          ...prev,
          user: { id: userId, email: session.user.email! },
          account: cached?.account ?? prev.account,
          activeProfile: cached?.activeProfile ?? prev.activeProfile,
          profiles: cached?.profiles ?? prev.profiles,
          membership: cached?.membership ?? prev.membership,
          isLoading: false,
          fetchError: false,
        }));

        // Fetch fresh data. For brand-new accounts the DB trigger may
        // not have run yet, so retry once after a short delay.
        const version = ++versionRef.current;
        try {
          let data = await fetchAccountData(userId);

          if (!data?.account) {
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
              fetchError: false,
            }));
          } else if (!cached?.account) {
            setState((prev) => ({ ...prev, fetchError: true }));
          }
        } catch (err) {
          console.error("[olera] SIGNED_IN fetch failed:", err);
          if (cancelled || versionRef.current !== version) return;
          if (!cached?.account) {
            setState((prev) => ({ ...prev, fetchError: true }));
          }
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
              user: { id: session.user.id, email: session.user.email! },
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

  // Post-OAuth: detect returning users who need onboarding
  useEffect(() => {
    if (state.isLoading || !state.user) return;
    // If user is authenticated but hasn't completed onboarding, and we have
    // a saved intent from a pre-OAuth redirect, auto-open post-auth onboarding
    if (state.account && !state.account.onboarding_completed && !isUnifiedAuthOpen) {
      try {
        const saved = sessionStorage.getItem(AUTH_INTENT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          sessionStorage.removeItem(AUTH_INTENT_KEY);
          setUnifiedAuthOptions({
            intent: parsed.intent,
            providerType: parsed.providerType,
            startAtPostAuth: true,
          });
          setIsUnifiedAuthOpen(true);
        }
      } catch {
        // sessionStorage unavailable
      }
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
   * Sign out. Let the auth listener handle state clearing.
   * Only clear state manually if signOut fails.
   */
  const signOut = useCallback(
    async (onComplete?: () => void) => {
      if (!configured) return;
      clearAuthCache();
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error.message);
        versionRef.current++;
        setState({ ...EMPTY_STATE });
      }
      onComplete?.();
    },
    [configured]
  );

  /**
   * Refresh account data from the database.
   * Updates cache on success. Clears fetchError on success.
   */
  const refreshAccountData = useCallback(async () => {
    const userId = userIdRef.current;
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
   * Switch the active profile. Uses refs to avoid stale closures.
   */
  const switchProfile = useCallback(
    async (profileId: string) => {
      const userId = userIdRef.current;
      const accountId = accountIdRef.current;
      if (!userId || !accountId || !configured) return;

      const supabase = createClient();
      const { error } = await supabase
        .from("accounts")
        .update({ active_profile_id: profileId })
        .eq("id", accountId);

      if (error) {
        console.error("Failed to switch profile:", error.message);
        return;
      }

      // Optimistic local update
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

      await refreshAccountData();
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

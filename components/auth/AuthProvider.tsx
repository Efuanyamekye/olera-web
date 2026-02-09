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
import { setDeferredAction } from "@/lib/deferred-action";

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

interface AuthContextValue extends AuthState {
  /** @deprecated Use openAuthFlow instead */
  openAuthModal: (deferred?: Omit<DeferredAction, "createdAt">, view?: AuthModalView) => void;
  /** Open the unified auth flow modal */
  openAuthFlow: (options?: OpenAuthFlowOptions) => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
  authModalDefaultView: AuthModalView;
  /** Current auth flow modal options */
  authFlowOptions: OpenAuthFlowOptions;
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
};

// ─── Session cache ──────────────────────────────────────────────────────
// Persists auth data across page refreshes so the UI never shows a blank
// loading state. Background fetch keeps it current.
const CACHE_KEY = "olera_auth_cache";

interface CachedAuthData {
  userId: string;
  account: Account;
  activeProfile: Profile | null;
  profiles: Profile[];
  membership: Membership | null;
}

function cacheAuthData(userId: string, data: Omit<CachedAuthData, "userId">) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, userId }));
  } catch { /* quota exceeded or SSR — ignore */ }
}

function getCachedAuthData(userId: string): Omit<CachedAuthData, "userId"> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAuthData;
    // Only use cache if it matches the current user
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch { return null; }
}

function clearAuthCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
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

  const configured = isSupabaseConfigured();

  // Refs to avoid stale closures
  const userIdRef = useRef<string | null>(null);
  const accountIdRef = useRef<string | null>(null);
  // Version counter to discard stale async responses
  const versionRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => {
    userIdRef.current = state.user?.id ?? null;
    accountIdRef.current = state.account?.id ?? null;
  }, [state.user, state.account]);

  /**
   * Fetch account, profiles, and membership for a given user ID.
   * No artificial timeouts — let queries complete naturally.
   * The browser's native HTTP timeout (~60-120s) handles dead connections.
   */
  const fetchAccountData = useCallback(
    async (userId: string) => {
      if (!configured) return null;

      const supabase = createClient();

      // Step 1: Get account (required for everything else)
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", userId)
        .single<Account>();

      if (accountError || !account) return null;

      // Step 2: Fetch profiles and membership in parallel
      const [profilesResult, membershipResult] = await Promise.all([
        supabase
          .from("business_profiles")
          .select("*")
          .eq("account_id", account.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("memberships")
          .select("*")
          .eq("account_id", account.id)
          .single<Membership>(),
      ]);

      const profiles = (profilesResult.data as Profile[]) || [];
      const membership = membershipResult.data ?? null;

      let activeProfile: Profile | null = null;
      if (account.active_profile_id) {
        activeProfile = profiles.find((p) => p.id === account.active_profile_id) || null;
      }

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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session?.user) {
        clearAuthCache();
        setState({ ...EMPTY_STATE, isLoading: false });
        return;
      }

      const userId = session.user.id;

      // Restore cached data immediately — no loading screens, correct
      // initials, full portal rendered on first paint.
      const cached = getCachedAuthData(userId);
      setState({
        user: { id: userId, email: session.user.email! },
        account: cached?.account ?? null,
        activeProfile: cached?.activeProfile ?? null,
        profiles: cached?.profiles ?? [],
        membership: cached?.membership ?? null,
        isLoading: false,
      });

      // Background refresh — keeps data current without blocking UI
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
        }));
      }
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
        }));

        // Fetch fresh data. For brand-new accounts the DB trigger may
        // not have run yet, so retry once after a short delay.
        const version = ++versionRef.current;
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
          }));
        }
      }

      if (event === "TOKEN_REFRESHED" && session?.user) {
        const version = ++versionRef.current;
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
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configured, fetchAccountData]);

  /** @deprecated Use openAuthFlow instead */
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

  /**
   * Sign out. Let the auth listener handle state clearing.
   * Only clear state manually if signOut fails.
   */
  const signOut = useCallback(async (onComplete?: () => void) => {
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
  }, [configured]);

  /**
   * Refresh account data from the database.
   * Updates cache on success.
   */
  const refreshAccountData = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;

    const version = ++versionRef.current;
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
      }));
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
        const newActive = prev.profiles.find((p) => p.id === profileId) || null;
        return {
          ...prev,
          account: prev.account ? { ...prev.account, active_profile_id: profileId } : null,
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
        closeAuthModal,
        isAuthModalOpen,
        authModalDefaultView,
        authFlowOptions,
        signOut,
        refreshAccountData,
        switchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

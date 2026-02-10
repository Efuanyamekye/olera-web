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
};

const FETCH_TIMEOUT_MS = 10000;

/** Race a promise against a timeout. Returns null on timeout. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

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

  // Keep refs in sync with state
  useEffect(() => {
    userIdRef.current = state.user?.id ?? null;
    accountIdRef.current = state.account?.id ?? null;
  }, [state.user, state.account]);

  /**
   * Fetch account, profiles, and membership for a given user ID.
   * Parallelizes queries where possible and has a timeout guard.
   */
  const fetchAccountData = useCallback(
    async (userId: string) => {
      if (!configured) return null;

      const supabase = createClient();

      // Step 1: Get account (required for everything else)
      const accountResult = await withTimeout(
        supabase.from("accounts").select("*").eq("user_id", userId).single<Account>(),
        FETCH_TIMEOUT_MS
      );

      const account = accountResult?.data ?? null;
      if (!account) return null;

      // Step 2: Fetch profiles and membership in parallel
      const [profilesResult, membershipResult] = await Promise.all([
        withTimeout(
          supabase
            .from("business_profiles")
            .select("*")
            .eq("account_id", account.id)
            .order("created_at", { ascending: true }),
          FETCH_TIMEOUT_MS
        ),
        withTimeout(
          supabase
            .from("memberships")
            .select("*")
            .eq("account_id", account.id)
            .single<Membership>(),
          FETCH_TIMEOUT_MS
        ),
      ]);

      const profiles = (profilesResult?.data as Profile[]) || [];
      const membership = membershipResult?.data ?? null;

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

      if (session?.user) {
        const data = await fetchAccountData(session.user.id);
        if (cancelled) return;

        setState({
          user: { id: session.user.id, email: session.user.email! },
          account: data?.account ?? null,
          activeProfile: data?.activeProfile ?? null,
          profiles: data?.profiles ?? [],
          membership: data?.membership ?? null,
          isLoading: false,
        });
      } else {
        setState({ ...EMPTY_STATE, isLoading: false });
      }
    };

    init();

    // Auth state listener — handles sign in, sign out, token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT") {
        // Immediately clear state — no async work needed
        versionRef.current++;
        setState({ ...EMPTY_STATE });
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        // New sign-in: must fetch fresh data (ok to show loading briefly)
        const version = ++versionRef.current;
        const data = await fetchAccountData(session.user.id);

        if (cancelled || versionRef.current !== version) return;

        setState({
          user: { id: session.user.id, email: session.user.email! },
          account: data?.account ?? null,
          activeProfile: data?.activeProfile ?? null,
          profiles: data?.profiles ?? [],
          membership: data?.membership ?? null,
          isLoading: false,
        });
      }

      if (event === "TOKEN_REFRESHED" && session?.user) {
        // Token refresh: keep existing state if refetch fails.
        // This prevents random sign-out appearance on slow networks.
        const version = ++versionRef.current;
        const data = await fetchAccountData(session.user.id);

        if (cancelled || versionRef.current !== version) return;

        // Only update state if fetch succeeded — never clear on failure
        if (data) {
          setState({
            user: { id: session.user.id, email: session.user.email! },
            account: data.account,
            activeProfile: data.activeProfile,
            profiles: data.profiles,
            membership: data.membership,
            isLoading: false,
          });
        }
        // If data is null (timeout/error), silently keep existing state
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
      // Convert to new auth flow options format
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
    // Reset options when modal closes
    setAuthFlowOptions({});
  }, []);

  /** Open the unified auth modal */
  const openAuth = useCallback((options: OpenAuthOptions = {}) => {
    if (options.deferred) {
      setDeferredAction(options.deferred);
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
   * Optional onComplete callback fires after state is cleared (e.g. to redirect).
   */
  const signOut = useCallback(async (onComplete?: () => void) => {
    if (!configured) return;
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Supabase signOut failed — force-clear local state anyway
      console.error("Sign out error:", error.message);
      versionRef.current++;
      setState({ ...EMPTY_STATE });
    }
    // On success, the onAuthStateChange SIGNED_OUT handler clears state
    onComplete?.();
  }, [configured]);

  /**
   * Refresh account data from the database.
   * Uses userIdRef to avoid stale closure issues.
   */
  const refreshAccountData = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;

    const version = ++versionRef.current;
    const data = await fetchAccountData(userId);

    // Discard if a newer request has been issued
    if (versionRef.current !== version) return;

    if (data) {
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

      // Refresh full account data so membership state stays accurate
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

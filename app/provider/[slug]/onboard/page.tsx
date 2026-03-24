"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Provider } from "@/lib/types/provider";
import SmartDashboardShell from "@/components/provider-onboarding/SmartDashboardShell";
import type { ActionCardState } from "@/components/provider-onboarding/ActionCard";
import {
  getOrCreateClaimSession,
  markSessionVerified,
  clearClaimSession,
  type ClaimSessionData,
} from "@/lib/claim-session";

type OnboardStep =
  | "loading"
  | "dashboard" // Shows SmartDashboardShell with appropriate ActionCard state
  | "finalizing"
  | "success"
  | "error";

export default function ProviderOnboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const providerIdParam = searchParams.get("provider_id");
  const stateParam = searchParams.get("state") as ActionCardState | null;
  const router = useRouter();
  const { user, account, openAuth, refreshAccountData, switchProfile } = useAuth();

  // Core state
  const [step, setStep] = useState<OnboardStep>("loading");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [session, setSession] = useState<ClaimSessionData | null>(null);
  const [actionCardState, setActionCardState] = useState<ActionCardState>("verify-form");
  const initRef = useRef(false);
  const finalizeRef = useRef(false);

  // Get claimSession ID for API calls
  const claimSession = session?.sessionId || "";

  // Fetch provider on mount
  useEffect(() => {
    if (initRef.current || !isSupabaseConfigured() || !slug) return;
    initRef.current = true;

    (async () => {
      const supabase = createClient();
      let foundProvider: Provider | null = null;

      // Strategy 1: Look up in olera-providers by provider_id (if param provided)
      if (providerIdParam) {
        const { data } = await supabase
          .from("olera-providers")
          .select("*")
          .eq("provider_id", providerIdParam)
          .not("deleted", "is", true)
          .single<Provider>();
        if (data) foundProvider = data;
      }

      // Strategy 2: Look up by slug in olera-providers
      if (!foundProvider) {
        const { data } = await supabase
          .from("olera-providers")
          .select("*")
          .eq("slug", slug)
          .not("deleted", "is", true)
          .single<Provider>();
        if (data) foundProvider = data;
      }

      // Strategy 3: Look up by provider_id = slug in olera-providers (legacy)
      if (!foundProvider) {
        const { data } = await supabase
          .from("olera-providers")
          .select("*")
          .eq("provider_id", slug)
          .not("deleted", "is", true)
          .single<Provider>();
        if (data) foundProvider = data;
      }

      if (!foundProvider) {
        setErrorMsg("Provider not found.");
        setStep("error");
        return;
      }

      setProvider(foundProvider);

      // Initialize or recover session
      const claimSessionData = getOrCreateClaimSession(
        foundProvider.provider_id,
        foundProvider.slug || foundProvider.provider_id,
        foundProvider.provider_name
      );
      setSession(claimSessionData);

      // Check if already claimed via business_profiles
      const { data: bp } = await supabase
        .from("business_profiles")
        .select("claim_state, account_id")
        .eq("source_provider_id", foundProvider.provider_id)
        .maybeSingle();

      if (bp?.claim_state === "claimed") {
        // If the signed-in user owns this listing, send them to their dashboard
        if (account && bp.account_id && account.id === bp.account_id) {
          router.replace("/provider");
          return;
        }
        // Otherwise show dashboard with dispute form in ActionCard
        setActionCardState("already-claimed");
        setStep("dashboard");
        return;
      }

      // Check if returning from OAuth with verified session
      if (claimSessionData.verified && user) {
        setStep("finalizing");
        return;
      }

      // Check recovered session state
      if (claimSessionData.step === "verified" || claimSessionData.step === "code-sent") {
        setActionCardState("verify-code");
        setStep("dashboard");
        return;
      }

      // Start with dashboard (wizard will show first, then verification)
      // If state param provided (e.g., from dispute link), use it
      const validStates: ActionCardState[] = ["verify-form", "already-claimed", "no-access"];
      if (stateParam && validStates.includes(stateParam)) {
        setActionCardState(stateParam);
      } else {
        setActionCardState("verify-form");
      }
      setStep("dashboard");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, providerIdParam, stateParam]);

  // Auto-finalize after OAuth return
  useEffect(() => {
    if (step !== "finalizing" || !user || finalizeRef.current) return;
    finalizeRef.current = true;
    handleFinalize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, user]);

  // Auto-finalize when user becomes available and session is verified
  useEffect(() => {
    if (!user || !session?.verified) return;
    if (step === "dashboard" && !finalizeRef.current) {
      finalizeRef.current = true;
      setStep("finalizing");
      handleFinalize();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session?.verified, step]);

  // Finalize claim
  const handleFinalize = async () => {
    const pid = provider?.provider_id || providerIdParam || session?.providerId;
    if (!pid || !claimSession) {
      setErrorMsg("Could not determine provider.");
      setStep("error");
      return;
    }

    try {
      const res = await fetch("/api/claim/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: pid,
          claimSession,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        setErrorMsg(result.error || "Failed to finalize claim.");
        setStep("error");
        return;
      }

      clearClaimSession();
      await refreshAccountData();

      // Switch to the newly claimed profile
      if (result.profileId) {
        switchProfile(result.profileId);
      }

      setStep("success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStep("error");
    }
  };

  // Handle verification complete (called from ActionCard via SmartDashboardShell)
  const handleVerificationComplete = useCallback(() => {
    markSessionVerified();
    setSession(prev => prev ? { ...prev, verified: true } : null);

    if (user) {
      setStep("finalizing");
      handleFinalize();
    } else {
      openAuth({
        deferred: {
          action: "claim",
          returnUrl: `${window.location.pathname}?provider_id=${provider?.provider_id}`,
        },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, openAuth, provider?.provider_id]);

  // Loading state
  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="text-center px-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">{errorMsg || "Something went wrong"}</h1>
          <p className="text-gray-500 mb-6">Please try again or contact support if the issue persists.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => {
                clearClaimSession();
                window.location.reload();
              }}
              className="px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors min-h-[44px]"
            >
              Try again
            </button>
            <Link
              href={provider ? `/provider/${slug}` : "/"}
              className="text-primary-600 hover:text-primary-700 font-medium min-h-[44px] flex items-center"
            >
              Go back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="text-center max-w-md px-4" style={{ animation: "card-enter 0.3s ease-out both" }}>
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-sm border border-primary-100/60">
              <svg className="w-10 h-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary-600 rounded-full flex items-center justify-center ring-4 ring-white">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-display font-bold text-gray-900 mb-3">
            You&apos;re all set!
          </h1>
          <p className="text-gray-500 text-lg mb-8 leading-relaxed">
            <strong className="text-gray-700">{provider?.provider_name}</strong> is now linked to your account.
          </p>
          <button
            onClick={() => router.push("/provider")}
            className="px-8 py-4 bg-primary-600 text-white text-base font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all shadow-sm min-h-[48px]"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Finalizing state
  if (step === "finalizing") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="text-center px-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-500">Setting up your account...</p>
        </div>
      </div>
    );
  }

  // Dashboard state - render SmartDashboardShell with ActionCard
  if (!provider || !session) return null;

  return (
    <SmartDashboardShell
      provider={provider}
      claimSession={claimSession}
      onVerificationComplete={handleVerificationComplete}
      initialActionState={actionCardState}
    />
  );
}

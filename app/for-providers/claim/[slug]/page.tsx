"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Provider } from "@/lib/types/provider";
import { getPrimaryImage } from "@/lib/types/provider";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ClaimVerifyForm from "@/components/providers/ClaimVerifyForm";

// ── Session Storage Keys ─────────────────────────────────────
const SK_SESSION = "olera_claim_session";
const SK_VERIFIED = "olera_claim_verified";
const SK_PROVIDER_ID = "olera_claim_provider_id";
// No-access form data (preserved across OAuth redirect)
const SK_NO_ACCESS = "olera_claim_no_access";

type ClaimStep =
  | "loading"
  | "info"
  | "verify"
  | "already-claimed"
  | "dispute"
  | "dispute-success"
  | "finalizing"
  | "success"
  | "error";

function generateUUID(): string {
  return crypto.randomUUID();
}

function getOrCreateClaimSession(): string {
  if (typeof window === "undefined") return generateUUID();
  const existing = sessionStorage.getItem(SK_SESSION);
  if (existing) return existing;
  const fresh = generateUUID();
  sessionStorage.setItem(SK_SESSION, fresh);
  return fresh;
}

function clearClaimStorage() {
  try {
    sessionStorage.removeItem(SK_SESSION);
    sessionStorage.removeItem(SK_VERIFIED);
    sessionStorage.removeItem(SK_PROVIDER_ID);
    sessionStorage.removeItem(SK_NO_ACCESS);
  } catch {
    // sessionStorage unavailable
  }
}

export default function ClaimPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const providerIdParam = searchParams.get("provider_id");
  const router = useRouter();
  const { user, openAuth, refreshAccountData } = useAuth();

  // ── Core State ──────────────────────────────────────────────
  const [step, setStep] = useState<ClaimStep>("loading");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [claimSession] = useState(getOrCreateClaimSession);
  const initRef = useRef(false);
  const finalizeRef = useRef(false);

  // ── Verify State ────────────────────────────────────────────
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyEmailHint, setVerifyEmailHint] = useState("");
  const [verifySending, setVerifySending] = useState(false);
  const [verifyChecking, setVerifyChecking] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifyResendCooldown, setVerifyResendCooldown] = useState(0);
  const [verifyNoEmail, setVerifyNoEmail] = useState(false);
  const [showNoAccess, setShowNoAccess] = useState(false);

  // ── No-Access Form State ────────────────────────────────────
  const [noAccessName, setNoAccessName] = useState("");
  const [noAccessRole, setNoAccessRole] = useState("");
  const [noAccessEmail, setNoAccessEmail] = useState("");
  const [noAccessNotes, setNoAccessNotes] = useState("");
  const [noAccessSubmitting, setNoAccessSubmitting] = useState(false);
  const [noAccessSuccess, setNoAccessSuccess] = useState(false);

  // ── Dispute Form State ──────────────────────────────────────
  const [disputeName, setDisputeName] = useState("");
  const [disputeRole, setDisputeRole] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  // ── Resend cooldown timer ───────────────────────────────────
  useEffect(() => {
    if (verifyResendCooldown <= 0) return;
    const t = setInterval(() => setVerifyResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [verifyResendCooldown]);

  // ── Provider Lookup + Init ──────────────────────────────────
  useEffect(() => {
    if (initRef.current || !isSupabaseConfigured() || !slug) return;
    initRef.current = true;

    (async () => {
      const supabase = createClient();
      let foundProvider: Provider | null = null;
      const lookupId = providerIdParam || slug;

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

      // Save provider_id for OAuth return
      try {
        sessionStorage.setItem(SK_PROVIDER_ID, foundProvider.provider_id);
      } catch {}

      // Check if already claimed via business_profiles
      const { data: bp } = await supabase
        .from("business_profiles")
        .select("claim_state, account_id")
        .eq("source_provider_id", foundProvider.provider_id)
        .maybeSingle();

      if (bp?.claim_state === "claimed") {
        setStep("already-claimed");
        return;
      }

      // Check if returning from OAuth with verified session
      const wasVerified = sessionStorage.getItem(SK_VERIFIED) === "true";
      if (wasVerified && user) {
        setStep("finalizing");
        return;
      }

      // Restore no-access form data from sessionStorage (after OAuth return)
      try {
        const savedNoAccess = sessionStorage.getItem(SK_NO_ACCESS);
        if (savedNoAccess) {
          const parsed = JSON.parse(savedNoAccess);
          setNoAccessName(parsed.name || "");
          setNoAccessRole(parsed.role || "");
          setNoAccessEmail(parsed.email || "");
          setNoAccessNotes(parsed.notes || "");
          sessionStorage.removeItem(SK_NO_ACCESS);
          if (user) {
            // Returned from OAuth with form data — auto-show and submit
            setShowNoAccess(true);
          }
        }
      } catch {}

      setStep("info");
    })();
  }, [slug, providerIdParam, user]);

  // ── Auto-finalize after OAuth return ────────────────────────
  useEffect(() => {
    if (step !== "finalizing" || !user || finalizeRef.current) return;
    finalizeRef.current = true;
    handleFinalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, user]);

  // ── Auto-finalize when user becomes available (email/password auth) ──
  useEffect(() => {
    if (!user) return;
    const wasVerified = sessionStorage.getItem(SK_VERIFIED) === "true";
    if (wasVerified && step === "verify" && !finalizeRef.current) {
      finalizeRef.current = true;
      setStep("finalizing");
      handleFinalize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, step]);

  // ── Send Verification Code ──────────────────────────────────
  const handleSendCode = useCallback(async () => {
    if (!provider) return;
    setVerifySending(true);
    setVerifyError("");
    setVerifyCode("");
    setVerifyNoEmail(false);

    try {
      const res = await fetch("/api/claim/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.provider_id,
          claimSession,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 422) {
          setVerifyNoEmail(true);
        } else {
          setVerifyError(result.error || "Failed to send code.");
        }
        return;
      }

      setVerifyEmailHint(result.emailHint);
      setVerifyResendCooldown(60);
    } catch {
      setVerifyError("Something went wrong. Please try again.");
    } finally {
      setVerifySending(false);
    }
  }, [provider, claimSession]);

  // ── Auto-send code on verify step entry ─────────────────────
  const sentCodeRef = useRef(false);
  useEffect(() => {
    if (step === "verify" && provider && !sentCodeRef.current) {
      sentCodeRef.current = true;
      handleSendCode();
    }
  }, [step, provider, handleSendCode]);

  // ── Verify Code ─────────────────────────────────────────────
  const handleVerifyCode = async () => {
    if (verifyCode.length !== 6 || !provider) return;
    setVerifyChecking(true);
    setVerifyError("");

    try {
      const res = await fetch("/api/claim/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.provider_id,
          code: verifyCode,
          claimSession,
        }),
      });
      const result = await res.json();

      if (!res.ok || !result.verified) {
        setVerifyError(result.error || "Incorrect code. Please try again.");
        return;
      }

      // Verified! Save state for OAuth resilience
      sessionStorage.setItem(SK_VERIFIED, "true");

      if (user) {
        // Already signed in — finalize immediately
        setStep("finalizing");
        handleFinalize();
      } else {
        // Need auth — prompt sign in
        openAuth({
          deferred: {
            action: "claim",
            returnUrl: `${window.location.pathname}${window.location.search}`,
          },
        });
      }
    } catch {
      setVerifyError("Something went wrong. Please try again.");
    } finally {
      setVerifyChecking(false);
    }
  };

  // Auto-submit code when 6 digits entered
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (verifyCode.length === 6 && !verifyChecking && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      handleVerifyCode();
    }
    if (verifyCode.length < 6) {
      autoSubmitRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyCode]);

  // ── Finalize Claim ──────────────────────────────────────────
  const handleFinalize = async () => {
    if (!provider && !providerIdParam) return;
    const pid = provider?.provider_id || providerIdParam || sessionStorage.getItem(SK_PROVIDER_ID);
    if (!pid) {
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

      clearClaimStorage();
      await refreshAccountData();
      setStep("success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStep("error");
    }
  };

  // ── No-Access Submit (auth-on-submit) ───────────────────────
  const handleNoAccessSubmit = async () => {
    if (!provider || !noAccessName.trim() || !noAccessRole || !noAccessEmail.trim()) return;

    // If not signed in, save form data and prompt auth
    if (!user) {
      try {
        sessionStorage.setItem(
          SK_NO_ACCESS,
          JSON.stringify({
            name: noAccessName,
            role: noAccessRole,
            email: noAccessEmail,
            notes: noAccessNotes,
          })
        );
      } catch {}
      openAuth({
        deferred: {
          action: "claim",
          returnUrl: `${window.location.pathname}${window.location.search}`,
        },
      });
      return;
    }

    setNoAccessSubmitting(true);
    try {
      const res = await fetch("/api/claim/no-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.provider_id,
          providerName: provider.provider_name,
          contactName: noAccessName,
          reason: noAccessNotes ? `${noAccessRole} — ${noAccessNotes}` : noAccessRole,
          alternativeEmail: noAccessEmail,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVerifyError(data.error || "Failed to submit request.");
        return;
      }

      setNoAccessSuccess(true);
      clearClaimStorage();
    } catch {
      setVerifyError("Something went wrong. Please try again.");
    } finally {
      setNoAccessSubmitting(false);
    }
  };

  // ── Dispute Submit (auth-on-submit) ─────────────────────────
  const handleDisputeSubmit = async () => {
    if (!provider || !disputeName.trim() || !disputeRole || !disputeReason.trim()) return;

    if (!user) {
      openAuth({
        deferred: {
          action: "claim",
          returnUrl: `${window.location.pathname}${window.location.search}`,
        },
      });
      return;
    }

    setDisputeSubmitting(true);
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.provider_id,
          provider_name: provider.provider_name,
          claimant_name: disputeName.trim(),
          claimant_role: disputeRole,
          reason: disputeReason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || "Failed to submit dispute.");
        return;
      }

      setStep("dispute-success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────

  // Loading
  if (step === "loading") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading provider...</p>
      </div>
    );
  }

  // Error
  if (step === "error") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-step-in">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{errorMsg || "Something went wrong"}</h1>
        <Link
          href={provider ? `/provider/${slug}` : "/for-providers"}
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Go back
        </Link>
      </div>
    );
  }

  // Success
  if (step === "success") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-wizard-in">
        <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <svg className="w-8 h-8 text-primary-600 animate-success-pop" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
          You&apos;re all set!
        </h1>
        <p className="text-gray-500 text-lg leading-relaxed max-w-md mx-auto mb-8">
          <strong className="text-gray-700">{provider?.provider_name}</strong> is now linked to your account.
          Head to your dashboard to start managing your listing.
        </p>
        <Button size="lg" onClick={() => router.push("/provider")}>
          Go to Dashboard
        </Button>
      </div>
    );
  }

  // Finalizing (spinner)
  if (step === "finalizing") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Setting up your account...</p>
      </div>
    );
  }

  // Already claimed
  if (step === "already-claimed" || step === "dispute" || step === "dispute-success") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <Link
          href={`/provider/${slug}`}
          className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mb-8"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to listing
        </Link>

        {step === "dispute-success" ? (
          <div className="text-center py-12 animate-wizard-in">
            <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6 shadow-sm">
              <svg className="w-8 h-8 text-primary-600 animate-success-pop" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
              Dispute submitted
            </h1>
            <p className="text-gray-500 text-lg leading-relaxed max-w-sm mx-auto mb-8">
              Our team will review your claim and get back to you within 2–3 business days.
            </p>
            <Button onClick={() => router.push(`/provider/${slug}`)}>
              Return to listing
            </Button>
          </div>
        ) : step === "dispute" ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Dispute this claim</h2>
            <p className="text-gray-500 mb-6">
              Tell us about your connection to <strong className="text-gray-700">{provider?.provider_name}</strong> and why you believe you should manage this listing.
            </p>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-base font-medium text-gray-700">
                  Full name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={disputeName}
                  onChange={(e) => setDisputeName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-base font-medium text-gray-700">
                  Your role <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={disputeRole}
                    onChange={(e) => setDisputeRole(e.target.value)}
                    className={`w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px] bg-white ${!disputeRole ? "text-gray-400" : "text-gray-900"}`}
                  >
                    <option value="" disabled>Select your role…</option>
                    <option value="Owner">Owner</option>
                    <option value="Administrator">Administrator</option>
                    <option value="Executive Director">Executive Director</option>
                    <option value="Office Manager">Office Manager</option>
                    <option value="Marketing / Communications">Marketing / Communications</option>
                    <option value="Staff Member">Staff Member</option>
                    <option value="Other">Other</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-base font-medium text-gray-700">
                  Why do you believe you should manage this listing? <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Explain your connection to this organization..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-500 resize-none"
                />
              </div>

              {errorMsg && <p className="text-sm text-red-600" role="alert">{errorMsg}</p>}

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => { setStep("already-claimed"); setErrorMsg(""); }}
                  className="text-base font-medium text-gray-600 hover:text-gray-900 underline underline-offset-4 transition-colors"
                >
                  Cancel
                </button>
                <Button
                  onClick={handleDisputeSubmit}
                  disabled={!disputeName.trim() || !disputeRole || !disputeReason.trim()}
                  loading={disputeSubmitting}
                >
                  Submit dispute
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* already-claimed info */
          <div>
            {/* Provider card */}
            {provider && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-8">
                {getPrimaryImage(provider) && (
                  <div className="h-48 bg-gray-200">
                    <img
                      src={getPrimaryImage(provider)!}
                      alt={provider.provider_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                      {provider.provider_name}
                    </h1>
                    <Badge variant="verified">Claimed</Badge>
                  </div>
                  {(provider.city || provider.state) && (
                    <p className="text-lg text-gray-600">
                      {[provider.address, provider.city, provider.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-amber-50/60 shadow-md border border-amber-100 rounded-2xl p-6 md:p-8 animate-step-in">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">This listing has been claimed</h2>
                  <p className="text-gray-600 mb-4">
                    Someone has already verified ownership of this listing. If you believe this is incorrect, you can dispute the claim.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep("dispute")}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    Dispute this claim
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Info + Verify steps
  return (
    <>
      {/* Page content — padded bottom for sticky button on info step */}
      <div className={`max-w-lg mx-auto px-4 sm:px-6 py-8 ${step === "info" ? "pb-36" : "pb-12"}`}>
        <Link
          href={`/provider/${slug}`}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to listing
        </Link>

        {/* ── Info Step ── */}
        {step === "info" && provider && (
          <div className="animate-step-in">
            {/* Compact provider card */}
            <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 mb-8">
              <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                {getPrimaryImage(provider) ? (
                  <img
                    src={getPrimaryImage(provider)!}
                    alt={provider.provider_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{provider.provider_name}</p>
                {(provider.address || provider.city) && (
                  <p className="text-xs text-gray-500 truncate">
                    {[provider.address, provider.city, provider.state].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <Badge variant="unclaimed">Unclaimed</Badge>
            </div>

            {/* Heading */}
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify your ownership</h1>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Confirm you represent this organization to manage its listing and respond to families.
            </p>

            {/* Numbered steps */}
            <div className="space-y-0">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    1
                  </div>
                  <div className="w-px flex-1 bg-gray-200 my-1.5 min-h-[32px]" />
                </div>
                <div className="pb-6 pt-0.5">
                  <p className="font-semibold text-gray-900 text-base">Receive a verification code</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    We&apos;ll email a code to the address on file
                  </p>
                </div>
              </div>
              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-400 text-sm font-semibold shrink-0">
                    2
                  </div>
                </div>
                <div className="pt-0.5">
                  <p className="font-semibold text-gray-900 text-base">Enter the code &amp; claim</p>
                  <p className="text-sm text-gray-500 mt-0.5">Start managing your listing right away</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Verify Step ── */}
        {step === "verify" && (
          <ClaimVerifyForm
            providerName={provider?.provider_name || ""}
            emailHint={verifyEmailHint}
            noEmailOnFile={verifyNoEmail}
            sending={verifySending}
            checking={verifyChecking}
            error={verifyError}
            resendCooldown={verifyResendCooldown}
            code={verifyCode}
            onCodeChange={setVerifyCode}
            onVerify={handleVerifyCode}
            onResend={handleSendCode}
            showNoAccess={showNoAccess}
            onToggleNoAccess={setShowNoAccess}
            noAccess={{
              name: noAccessName,
              role: noAccessRole,
              email: noAccessEmail,
              notes: noAccessNotes,
              onNameChange: setNoAccessName,
              onRoleChange: setNoAccessRole,
              onEmailChange: setNoAccessEmail,
              onNotesChange: setNoAccessNotes,
              onSubmit: handleNoAccessSubmit,
              submitting: noAccessSubmitting,
            }}
            noAccessSuccess={noAccessSuccess}
          />
        )}
      </div>

      {/* ── Sticky CTA (info step only) ── */}
      {step === "info" && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 pt-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
        >
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setStep("verify")}
              className="w-full py-4 bg-primary-700 hover:bg-primary-800 active:bg-primary-900 text-white rounded-xl text-base font-semibold transition-colors flex items-center justify-center gap-2"
            >
              Send verification code
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <p className="text-xs text-gray-400 text-center mt-2.5 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Your information is secure and never shared
            </p>
          </div>
        </div>
      )}
    </>
  );
}

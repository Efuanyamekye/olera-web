"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Provider } from "@/lib/types/provider";
import SmartDashboardShell from "@/components/provider-onboarding/SmartDashboardShell";
import type { ActionCardState, NotificationData, NotificationType } from "@/components/provider-onboarding/ActionCard";
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
  // Action params for email notifications (lead/message/review/question) or campaign
  const actionParam = searchParams.get("action") as NotificationType | "campaign" | null;
  const actionIdParam = searchParams.get("actionId");
  // Token param for marketing campaign emails (pre-verified flow)
  const tokenParam = searchParams.get("token");
  const router = useRouter();
  const { user, account, openAuth, refreshAccountData, switchProfile } = useAuth();

  // Core state
  const [step, setStep] = useState<OnboardStep>("loading");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [session, setSession] = useState<ClaimSessionData | null>(null);
  const [actionCardState, setActionCardState] = useState<ActionCardState>("verify-form");
  const [notificationData, setNotificationData] = useState<NotificationData | null>(null);
  const [preVerifiedEmail, setPreVerifiedEmail] = useState<string | null>(null);
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

      // Strategy 4: Look up in business_profiles by slug (for native/claimed providers)
      // These providers may not exist in olera-providers
      // Include both "organization" and "caregiver" types (both are provider profiles)
      if (!foundProvider) {
        const { data: bp } = await supabase
          .from("business_profiles")
          .select("id, slug, display_name, claim_state, account_id, source_provider_id, email, phone, address, city, state, zip, description, image_url, care_types, metadata, type, category")
          .eq("slug", slug)
          .in("type", ["organization", "caregiver"])
          .maybeSingle();

        if (bp) {
          // For claimed providers, check if user owns it and redirect appropriately
          if (bp.claim_state === "claimed" && account && bp.account_id === account.id) {
            // User owns this listing - redirect to appropriate section
            if (actionParam === "lead" && actionIdParam) {
              router.replace(`/provider/connections?id=${actionIdParam}`);
            } else if (actionParam === "message" && actionIdParam) {
              router.replace(`/provider/inbox?id=${actionIdParam}`);
            } else if (actionParam === "question" && actionIdParam) {
              router.replace(`/provider/qna?id=${actionIdParam}`);
            } else if (actionParam === "review" && actionIdParam) {
              router.replace(`/provider/reviews?id=${actionIdParam}`);
            } else {
              router.replace("/provider");
            }
            return;
          }

          // For other cases (not owned or unclaimed), create a Provider-like object
          // to continue with the onboard flow
          foundProvider = {
            provider_id: bp.source_provider_id || bp.id,
            provider_name: bp.display_name || "Provider",
            slug: bp.slug,
            email: bp.email,
            phone: bp.phone,
            address: bp.address,
            city: bp.city,
            state: bp.state,
            zipcode: bp.zip ? parseInt(bp.zip, 10) : null,
            provider_description: bp.description,
            provider_images: bp.image_url ? JSON.stringify([bp.image_url]) : null,
            provider_category: bp.category || "",
            main_category: bp.care_types?.[0] || null,
            lat: null,
            lon: null,
            website: null,
            lower_price: null,
            upper_price: null,
            deleted: false,
          } as Provider;
        }
      }

      if (!foundProvider) {
        setErrorMsg("Provider not found.");
        setStep("error");
        return;
      }

      setProvider(foundProvider);

      // Fetch notification data if action params provided (lead/review/question from email)
      if (actionParam && actionIdParam) {
        try {
          if (actionParam === "lead") {
            // Fetch connection (lead) data
            const { data: conn } = await supabase
              .from("connections")
              .select("id, created_at, message, metadata, from_profile:business_profiles!connections_from_profile_id_fkey(display_name, email, city, state, image_url)")
              .eq("id", actionIdParam)
              .single();
            if (conn) {
              // Parse the message field - it's stored as JSON string with seeker info
              let parsedMessage: Record<string, unknown> = {};
              try {
                if (conn.message && typeof conn.message === "string") {
                  parsedMessage = JSON.parse(conn.message);
                }
              } catch {
                // If parsing fails, message might be plain text (legacy)
                parsedMessage = { message: conn.message };
              }

              // Extract the actual custom message (additionalNotes) from parsed data
              const customMessage = (parsedMessage.message as string) || (parsedMessage.additional_notes as string) || null;

              // Extract care_type from parsed message or metadata
              const careType = (parsedMessage.care_type as string) || null;

              // Get auto_intro from metadata (generated intro message)
              const connMetadata = conn.metadata as Record<string, unknown> | null;
              const autoIntro = (connMetadata?.auto_intro as string) || null;

              setNotificationData({
                type: "lead",
                id: conn.id,
                created_at: conn.created_at,
                message: customMessage,
                metadata: {
                  care_type: careType || undefined,
                  auto_intro: autoIntro || undefined,
                },
                from_profile: conn.from_profile as NotificationData["from_profile"],
              });
            }
          } else if (actionParam === "question") {
            // Fetch question data
            const { data: question } = await supabase
              .from("questions")
              .select("id, question, asker_name, created_at")
              .eq("id", actionIdParam)
              .single();
            if (question) {
              setNotificationData({
                type: "question",
                id: question.id,
                created_at: question.created_at,
                question: question.question,
                asker_name: question.asker_name,
              });
            }
          } else if (actionParam === "review") {
            // Fetch review data
            const { data: review } = await supabase
              .from("reviews")
              .select("id, rating, comment, reviewer_name, created_at")
              .eq("id", actionIdParam)
              .single();
            if (review) {
              setNotificationData({
                type: "review",
                id: review.id,
                created_at: review.created_at,
                rating: review.rating,
                comment: review.comment,
                reviewer_name: review.reviewer_name,
              });
            }
          }
        } catch (err) {
          console.error("[ProviderOnboard] Failed to fetch notification data:", err);
        }
      }

      // Initialize or recover session
      const claimSessionData = getOrCreateClaimSession(
        foundProvider.provider_id,
        foundProvider.slug || foundProvider.provider_id,
        foundProvider.provider_name
      );
      setSession(claimSessionData);

      // Handle campaign token (marketing email pre-verification)
      if (actionParam === "campaign" && tokenParam) {
        try {
          const tokenRes = await fetch("/api/claim/validate-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: tokenParam,
              claimSession: claimSessionData.sessionId,
            }),
          });
          const tokenResult = await tokenRes.json();

          if (tokenResult.valid) {
            // Token is valid - user is pre-verified
            setPreVerifiedEmail(tokenResult.emailHint);
            setActionCardState("pre-verified");
            setStep("dashboard");
            return;
          } else if (tokenResult.alreadyClaimed) {
            // Listing already claimed
            setActionCardState("already-claimed");
            setStep("dashboard");
            return;
          } else {
            // Token invalid/expired - fall through to normal flow
            console.warn("[ProviderOnboard] Campaign token invalid:", tokenResult.error);
          }
        } catch (err) {
          console.error("[ProviderOnboard] Failed to validate campaign token:", err);
          // Fall through to normal flow
        }
      }

      // Check if already claimed via business_profiles
      const { data: bp } = await supabase
        .from("business_profiles")
        .select("claim_state, account_id")
        .eq("source_provider_id", foundProvider.provider_id)
        .maybeSingle();

      if (bp?.claim_state === "claimed") {
        // If the signed-in user owns this listing, redirect to the appropriate section
        if (account && bp.account_id && account.id === bp.account_id) {
          // Route to specific section based on notification type
          if (actionParam === "lead" && actionIdParam) {
            router.replace(`/provider/connections?id=${actionIdParam}`);
          } else if (actionParam === "message" && actionIdParam) {
            router.replace(`/provider/inbox?id=${actionIdParam}`);
          } else if (actionParam === "question" && actionIdParam) {
            router.replace(`/provider/qna?id=${actionIdParam}`);
          } else if (actionParam === "review" && actionIdParam) {
            router.replace(`/provider/reviews?id=${actionIdParam}`);
          } else {
            router.replace("/provider");
          }
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
      // Set initial state based on context:
      // 1. Notification from email (lead/question/review) → show notification card
      // 2. State param provided (e.g., from dispute link) → use that state
      // 3. Default → verify-form
      if (actionParam) {
        // Map action param to notification state
        const notificationStateMap: Record<string, ActionCardState> = {
          lead: "notification-lead",
          message: "notification-lead", // Messages show similar card to leads
          question: "notification-question",
          review: "notification-review",
        };
        setActionCardState(notificationStateMap[actionParam] || "verify-form");
      } else {
        const validStates: ActionCardState[] = ["verify-form", "already-claimed", "no-access"];
        if (stateParam && validStates.includes(stateParam)) {
          setActionCardState(stateParam);
        } else {
          setActionCardState("verify-form");
        }
      }
      setStep("dashboard");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, providerIdParam, stateParam, actionParam, actionIdParam, tokenParam]);

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
      notificationData={notificationData}
      isSignedIn={!!user}
      preVerifiedEmail={preVerifiedEmail || undefined}
    />
  );
}

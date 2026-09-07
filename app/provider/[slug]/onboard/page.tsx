"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { createAuthClient } from "@/lib/supabase/auth-client";
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

import { getActionRedirectUrl, isPortalRedirectAction } from "@/lib/provider-comms/destinations";

// Fire-and-forget client-side failure telemetry for the one-click pipeline.
// Server-side stages log themselves; these cover the hops that only exist in
// the browser (verifyOtp, fetch failures). See migration 155.
function trackOneClickFailure(
  providerSlug: string,
  stage: string,
  reason: string,
  action?: string | null,
  actionId?: string | null
) {
  fetch("/api/activity/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider_id: providerSlug,
      event_type: "one_click_failed",
      metadata: { stage, reason, action: action || null, action_id: actionId || null },
    }),
  }).catch(() => {});
}

export default function ProviderOnboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const providerIdParam = searchParams.get("provider_id");
  const stateParam = searchParams.get("state") as ActionCardState | null;
  // Action params for email notifications (lead/message/review/question) or campaign
  const actionParam = searchParams.get("action") as NotificationType | "campaign" | "claim" | "signup" | "manage" | "settings" | "market" | "ads" | "leads" | "matches" | "profile" | "notifications" | null;
  const actionIdParam = searchParams.get("actionId");
  // Token param for marketing campaign emails (pre-verified flow)
  // Named "otk" (one-time key) instead of "token" to avoid Apple Mail's
  // Link Tracking Protection which strips params named "token" from URLs
  const tokenParam = searchParams.get("otk");
  // Pending claim flag - when true, claim_state will be "pending" for manual review
  // (used when user claims with alternate email they don't have access to the email on file)
  const pendingClaimParam = searchParams.get("pending") === "true";
  const router = useRouter();
  const { user, account, profiles, openAuth, refreshAccountData, switchProfile } = useAuth();

  // Track email click if this visit came from an email link (fire-and-forget)
  useEffect(() => {
    const ref = searchParams.get("ref");
    const eid = searchParams.get("eid");
    if (ref === "email" && eid) {
      const emailTypeMap: Record<string, string> = {
        lead: "connection_request",
        review: "new_review",
        question: "question_received",
        interview: "interview_request",
        claim: "listing_claimed",
        signup: "account_created",
        // Onboarding profile-preview CTA. Without this the click event files
        // itself under "profile" while the send is logged as
        // "profile_preview_nudge", so the two never line up when grouped by type.
        profile: "profile_preview_nudge",
        notifications: "notification_setup_nudge",
      };
      fetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: slug,
          event_type: "email_click",
          email_log_id: eid,
          email_type: actionParam ? emailTypeMap[actionParam] || actionParam : null,
          metadata: { source: "direct_link", destination: window.location.pathname },
        }),
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Core state
  const [step, setStep] = useState<OnboardStep>("loading");
  const [openingNotifications, setOpeningNotifications] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [session, setSession] = useState<ClaimSessionData | null>(null);
  const [actionCardState, setActionCardState] = useState<ActionCardState>("claim-form");
  const [notificationData, setNotificationData] = useState<NotificationData | null>(null);
  const [preVerifiedEmail, setPreVerifiedEmail] = useState<string | null>(null);
  // Failed-token context: set when the otk is invalid/expired so the ActionCard
  // can offer a one-tap fresh link instead of a dead sign-in wall.
  const [resendContext, setResendContext] = useState<{
    token: string;
    action: string | null;
    actionId: string | null;
    slug: string;
  } | null>(null);
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
          .single();
        if (data) foundProvider = data as Provider;
      }

      // Strategy 2: Look up by slug in olera-providers
      if (!foundProvider) {
        const { data } = await supabase
          .from("olera-providers")
          .select("*")
          .eq("slug", slug)
          .not("deleted", "is", true)
          .single();
        if (data) foundProvider = data as Provider;
      }

      // Strategy 3: Look up by provider_id = slug in olera-providers (legacy)
      if (!foundProvider) {
        const { data } = await supabase
          .from("olera-providers")
          .select("*")
          .eq("provider_id", slug)
          .not("deleted", "is", true)
          .single();
        if (data) foundProvider = data as Provider;
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
            router.replace(getActionRedirectUrl(actionParam, actionIdParam, slug, searchParams.get("eid")));
            return;
          }

          // If BP has a source_provider_id, try to get the rich olera-providers record
          // (has Google reviews, images, ratings that the BP doesn't)
          if (bp.source_provider_id) {
            const { data: opData } = await supabase
              .from("olera-providers")
              .select("*")
              .eq("provider_id", bp.source_provider_id)
              .not("deleted", "is", true)
              .single();
            if (opData) {
              // Use the rich record but keep the BP slug (which is the URL slug)
              foundProvider = { ...(opData as Provider), slug: bp.slug };
            }
          }

          // Fallback: create a Provider-like object from the BP data
          if (!foundProvider) {
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
              provider_images: bp.image_url
                ? bp.image_url
                : (bp.metadata as Record<string, unknown>)?.images
                  ? ((bp.metadata as Record<string, unknown>).images as string[]).join(" | ")
                  : null,
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
      }

      if (!foundProvider) {
        setErrorMsg("Provider not found.");
        setStep("error");
        return;
      }

      // For providers without google_reviews_data, fetch review stats from reviews table
      if (!foundProvider.google_reviews_data && !foundProvider.google_rating) {
        const providerSlug = foundProvider.slug || foundProvider.provider_id;
        const { data: reviewRows } = await supabase
          .from("reviews")
          .select("rating")
          .eq("provider_id", providerSlug);
        if (reviewRows && reviewRows.length > 0) {
          const avg = (reviewRows as Array<{ rating: number }>).reduce((sum, r) => sum + r.rating, 0) / reviewRows.length;
          foundProvider = {
            ...foundProvider,
            google_rating: Math.round(avg * 10) / 10,
            google_reviews_data: {
              rating: Math.round(avg * 10) / 10,
              review_count: reviewRows.length,
              reviews: [],
              last_synced: new Date().toISOString(),
            },
          };
        }
      }

      setProvider(foundProvider);

      // Fetch notification data if action params provided (lead/review/question from email)
      // Track locally so we can use it later in this same function (state isn't readable until re-render)
      let fetchedNotificationData: NotificationData | null = null;

      // For claim/signup, we don't need actionId - provider info IS the notification data
      // Handle these separately since their URLs don't include actionId
      // Note: pending_leads and pending_questions will be populated by validate-token API
      if (actionParam === "claim" || actionParam === "signup") {
        fetchedNotificationData = {
          type: actionParam,
          id: foundProvider.provider_id || foundProvider.slug || slug,
          created_at: new Date().toISOString(),
          provider_name: foundProvider.provider_name,
          provider_city: foundProvider.city || null,
          provider_state: foundProvider.state || null,
          provider_image: foundProvider.provider_images?.split("|")[0]?.trim() || null,
          // Activity counts will be populated by validate-token API (defaults to 0 in UI)
          pending_leads: 0,
          pending_questions: 0,
        };
        setNotificationData(fetchedNotificationData);
      } else if (actionParam && actionIdParam) {
        // For lead/question/review/interview, we need to fetch data using actionId
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

              fetchedNotificationData = {
                type: "lead",
                id: conn.id,
                created_at: conn.created_at,
                message: customMessage,
                metadata: {
                  care_type: careType || undefined,
                  auto_intro: autoIntro || undefined,
                },
                from_profile: conn.from_profile as NotificationData["from_profile"],
              };
            }
          } else if (actionParam === "question") {
            // Fetch question data
            const { data: question } = await supabase
              .from("provider_questions")
              .select("id, question, asker_name, created_at, canonical_question_id")
              .eq("id", actionIdParam)
              .single();
            if (question) {
              fetchedNotificationData = {
                type: "question",
                // Historical notification emails point at duplicate rows that
                // migration 185 archives. Answer the surviving topic instead.
                id: question.canonical_question_id || question.id,
                created_at: question.created_at,
                question: question.question,
                asker_name: question.asker_name,
              };
            }
          } else if (actionParam === "review") {
            // Fetch review data
            const { data: review } = await supabase
              .from("reviews")
              .select("id, rating, comment, reviewer_name, created_at")
              .eq("id", actionIdParam)
              .single();
            if (review) {
              fetchedNotificationData = {
                type: "review",
                id: review.id,
                created_at: review.created_at,
                rating: review.rating,
                comment: review.comment,
                reviewer_name: review.reviewer_name,
              };
            }
          } else if (actionParam === "interview") {
            // Fetch interview data with student details
            const { data: interview } = await supabase
              .from("interviews")
              .select("id, type, proposed_time, notes, status, created_at, student:business_profiles!interviews_student_profile_id_fkey(display_name, image_url)")
              .eq("id", actionIdParam)
              .single();
            if (interview) {
              const student = interview.student as unknown as { display_name: string; image_url: string | null } | null;
              fetchedNotificationData = {
                type: "interview",
                id: interview.id,
                created_at: interview.created_at,
                candidate_name: student?.display_name || "A candidate",
                candidate_image: student?.image_url || null,
                interview_format: interview.type,
                proposed_time: interview.proposed_time,
                notes: interview.notes,
              };
            }
          }
        } catch (err) {
          console.error("[ProviderOnboard] Failed to fetch notification data:", err);
        }
        if (fetchedNotificationData) {
          setNotificationData(fetchedNotificationData);
        }
      }

      // Initialize or recover session
      const claimSessionData = getOrCreateClaimSession(
        foundProvider.provider_id,
        foundProvider.slug || foundProvider.provider_id,
        foundProvider.provider_name
      );
      setSession(claimSessionData);

      // Handle signed claim token (from any email: lead, question, review, campaign)
      // One-click flow: validate token → auto-sign-in → auto-claim → redirect
      if (tokenParam) {
        try {
          const tokenRes = await fetch("/api/claim/validate-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: tokenParam,
              claimSession: claimSessionData.sessionId,
              action: actionParam,
              actionId: actionIdParam,
            }),
          });
          const tokenResult = await tokenRes.json();

          if (tokenResult.valid) {
            const verifiedEmail = tokenResult.email || tokenResult.emailHint;

            // For notification actions (lead/question/review):
            // Show notification card + dashboard IMMEDIATELY, then
            // run auto-sign-in in the background. The provider sees
            // the lead while auth happens silently.
            if (actionParam && actionParam !== "campaign") {
              const notificationStateMap: Record<string, ActionCardState> = {
                lead: "notification-lead", message: "notification-lead",
                question: "notification-question", review: "notification-review",
                interview: "notification-interview",
                claim: "notification-claim", signup: "notification-signup",
              };

              // Use notification data from validate-token (fetched server-side
              // with service role key — bypasses RLS that blocks the anon client)
              if (tokenResult.notificationData) {
                setNotificationData(tokenResult.notificationData as NotificationData);
              }

              // 1. Show notification card + dashboard NOW (no auth needed)
              finalizeRef.current = true; // prevent useEffect auto-finalize race
              setPreVerifiedEmail(verifiedEmail);
              setOpeningNotifications(actionParam === "notifications");
              setActionCardState(notificationStateMap[actionParam] || "pre-verified");
              setStep("dashboard");

              // 2. Background auto-sign-in — invisible to the provider
              (async () => {
                try {
                  // If already signed in and owns the listing, just switch profile
                  if (user && account) {
                    const { data: ownedProfile } = await createClient()
                      .from("business_profiles")
                      .select("id")
                      .eq("slug", slug)
                      .in("type", ["organization", "caregiver"])
                      .eq("account_id", account.id)
                      .maybeSingle();
                    if (ownedProfile) {
                      switchProfile(ownedProfile.id);
                      console.log("[OneClick] Already signed in as owner");
                      // Auto-redirect for manage/settings (already signed in)
                      if (isPortalRedirectAction(actionParam)) {
                        router.replace(getActionRedirectUrl(actionParam, null, slug, searchParams.get("eid")));
                      }
                      return;
                    }
                  }

                  // Auto-sign-in with the verified email. One retry after a
                  // short pause — a transient auth hiccup here used to dump
                  // the provider at a sign-in wall they can't get past.
                  console.log("[OneClick] Starting auto-sign-in for", verifiedEmail);
                  const attemptSignIn = async () => {
                    const signInRes = await fetch("/api/auth/auto-sign-in", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email: verifiedEmail,
                        claimSession: claimSessionData.sessionId,
                      }),
                    });
                    const signInData = await signInRes.json();
                    if (!signInRes.ok || !signInData.tokenHash) {
                      return { ok: false as const, status: signInRes.status, error: signInData.error };
                    }
                    // Establish session (implicit flow — no PKCE)
                    const authClient = createAuthClient();
                    const { data: otpData, error: otpError } = await authClient.auth.verifyOtp({
                      token_hash: signInData.tokenHash,
                      type: "magiclink",
                    });
                    if (otpError || !otpData?.session) {
                      return { ok: false as const, status: 0, error: `verifyOtp: ${otpError?.message}` };
                    }
                    return { ok: true as const, signInData, session: otpData.session };
                  };

                  let attempt = await attemptSignIn();
                  if (!attempt.ok) {
                    console.warn("[OneClick] sign-in attempt 1 failed:", attempt.error || attempt.status);
                    await new Promise((r) => setTimeout(r, 1500));
                    attempt = await attemptSignIn();
                  }
                  if (!attempt.ok) {
                    setOpeningNotifications(false);
                    console.warn("[OneClick] auto-sign-in failed:", attempt.error || attempt.status);
                    trackOneClickFailure(
                      slug,
                      attempt.status === 0 ? "client_verify_otp" : "client_auto_sign_in_http",
                      String(attempt.error || attempt.status),
                      actionParam,
                      actionIdParam
                    );
                    return;
                  }
                  const { signInData, session: authSession } = attempt;

                  // Transfer session to SSR client
                  await createClient().auth.setSession({
                    access_token: authSession.access_token,
                    refresh_token: authSession.refresh_token,
                  });
                  console.log("[OneClick] Session established");

                  // Finalize claim (creates account + links profile for first-time providers).
                  // Use the CANONICAL provider id from validate-token — that's the id
                  // the claim_verification_codes row was written under. Posting
                  // foundProvider.provider_id breaks for BP-only providers, where the
                  // two resolution ladders disagree and finalize 403s silently.
                  if (!tokenResult.alreadyClaimed) {
                    const finalizeRes = await fetch("/api/claim/finalize", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        providerId: tokenResult.providerId || foundProvider.provider_id,
                        claimSession: claimSessionData.sessionId,
                        pendingClaim: pendingClaimParam, // For alternate email claims
                      }),
                    });
                    console.log("[OneClick] Finalize:", finalizeRes.ok ? "success" : finalizeRes.status, pendingClaimParam ? "(pending)" : "");
                    if (!finalizeRes.ok && finalizeRes.status !== 409) {
                      // 409 = already claimed / type mismatch — server logged it.
                      trackOneClickFailure(slug, "client_finalize_http", String(finalizeRes.status), actionParam, actionIdParam);
                    }
                  }

                  // Refresh auth state + switch to provider profile
                  await refreshAccountData();
                  const { data: bp } = await createClient()
                    .from("business_profiles")
                    .select("id")
                    .eq("slug", slug)
                    .in("type", ["organization", "caregiver"])
                    .maybeSingle();
                  if (bp) switchProfile(bp.id);

                  console.log("[OneClick] Background sign-in complete");

                  // Log for observability. Include the trust level/reason from
                  // auto-sign-in so the admin feed renders a trust badge and the
                  // Slack message surfaces the assessment alongside the access event.
                  fetch("/api/activity/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider_id: slug,
                      event_type: "one_click_access",
                      metadata: {
                        action: actionParam,
                        action_id: actionIdParam,
                        email: verifiedEmail,
                        source: "email_token",
                        trust_level: signInData.trustLevel ?? null,
                        trust_reason: signInData.trustReason ?? null,
                      },
                    }),
                  }).catch(() => {});

                  // Auto-redirect for manage/settings actions (no notification card)
                  // These footer links should take the user directly to their destination
                  if (isPortalRedirectAction(actionParam)) {
                    router.replace(getActionRedirectUrl(actionParam, null, slug, searchParams.get("eid")));
                  }
                } catch (err) {
                  setOpeningNotifications(false);
                  console.warn("[OneClick] Background sign-in error:", err);
                  trackOneClickFailure(slug, "client_exception", String(err), actionParam, actionIdParam);
                }
              })();

              return; // notification card is already showing
            }

            // For campaign or fallback: show pre-verified state
            setPreVerifiedEmail(verifiedEmail);
            setActionCardState(actionParam && actionParam !== "campaign"
              ? (({ lead: "notification-lead", message: "notification-lead", question: "notification-question", review: "notification-review", interview: "notification-interview", claim: "notification-claim", signup: "notification-signup" } as Record<string, ActionCardState>)[actionParam] || "pre-verified")
              : "pre-verified"
            );
            setStep("dashboard");
            return;
          } else if (tokenResult.alreadyClaimed) {
            // Token valid but already claimed — for notification actions,
            // this is handled by the notification card path above (which
            // fires background sign-in). For campaigns, show already-claimed.
            setActionCardState("already-claimed");
            setStep("dashboard");
            return;
          } else {
            // Token invalid/expired. The old behavior silently fell through to
            // the generic sign-in wall, which providers can't get past (they
            // don't have a password — the link WAS their sign-in). Instead,
            // offer a one-tap fresh link to the on-file address.
            // 404 = provider genuinely unknown → fall through to normal flow.
            console.warn("[ProviderOnboard] Token invalid:", tokenResult.error);
            if (tokenRes.status !== 404) {
              setResendContext({
                token: tokenParam,
                action: actionParam,
                actionId: actionIdParam,
                slug,
              });
              setActionCardState("link-expired");
              setStep("dashboard");
              return;
            }
          }
        } catch (err) {
          console.error("[ProviderOnboard] Failed to validate token:", err);
          trackOneClickFailure(slug, "client_exception", "validate_token_fetch_failed", actionParam, actionIdParam);
          // Fall through to normal flow
        }
      }

      // Check if already claimed via business_profiles
      // Query by source_provider_id first (olera-providers path), then by slug (BP-only path)
      let bp: { claim_state: string | null; account_id: string | null } | null = null;
      const { data: bpBySource } = await supabase
        .from("business_profiles")
        .select("claim_state, account_id")
        .eq("source_provider_id", foundProvider.provider_id)
        .maybeSingle();
      bp = bpBySource;

      if (!bp && foundProvider.slug) {
        // BP-only provider: look up by slug directly
        const { data: bpBySlug } = await supabase
          .from("business_profiles")
          .select("claim_state, account_id")
          .eq("slug", foundProvider.slug)
          .in("type", ["organization", "caregiver"])
          .maybeSingle();
        bp = bpBySlug;
      }

      if (bp?.claim_state === "claimed") {
        // If the signed-in user owns this listing, redirect to the appropriate section
        if (account && bp.account_id && account.id === bp.account_id) {
          router.replace(getActionRedirectUrl(actionParam, actionIdParam, slug, searchParams.get("eid")));
          return;
        }
        // If they arrived from a notification email (lead/question/review),
        // show the contextual card OR redirect if notification data failed to load.
        // This prevents confusing "This listing is claimed" error for legitimate providers.
        if (actionParam && actionParam !== "claim" && actionParam !== "signup") {
          // If we successfully fetched notification data, show the preview card
          if (fetchedNotificationData) {
            const notificationStateMap: Record<string, ActionCardState> = {
              lead: "notification-lead",
              message: "notification-lead",
              question: "notification-question",
              review: "notification-review",
            };
            setActionCardState(notificationStateMap[actionParam] || "already-claimed");
            setStep("dashboard");
            return;
          }
          // If notification fetch failed but we have actionId, redirect to the destination
          // (e.g., lead was deleted, or connection not found)
          // This prevents showing "This listing is claimed" error when it's just a missing lead
          if (actionIdParam) {
            console.log("[ProviderOnboard] Notification fetch failed, redirecting to destination");
            router.replace(getActionRedirectUrl(actionParam, actionIdParam, slug, searchParams.get("eid")));
            return;
          }
        }
        // No notification context — show dispute form
        setActionCardState("already-claimed");
        setStep("dashboard");
        return;
      }

      // Check if returning from OAuth with verified session
      if (claimSessionData.verified && user) {
        setStep("finalizing");
        return;
      }

      // Check recovered session state - if previously verified, go to finalize
      if (claimSessionData.step === "verified" || claimSessionData.step === "code-sent") {
        // Old OTP flow states - now just show claim form
        setActionCardState("claim-form");
        setStep("dashboard");
        return;
      }

      // Pre-verify if user is authenticated via magic link with provider's email
      // If they clicked the magic link in the email, they've proven email ownership
      if (user && actionParam && actionIdParam) {
        const userEmail = user.email?.toLowerCase();
        const providerEmail = foundProvider.email?.toLowerCase();

        // If user's email matches provider's email, they came from the magic link
        // and are already verified (no need for OTP)
        if (userEmail && providerEmail && userEmail === providerEmail) {
          console.log("[ProviderOnboard] User authenticated via magic link, pre-verifying");
          // Mark session as verified
          await markSessionVerified(claimSessionData.sessionId);
          setPreVerifiedEmail(user.email || "");
          setActionCardState("pre-verified");
          setStep("dashboard");
          return;
        }
      }

      // Start with dashboard (wizard will show first, then verification)
      // Set initial state based on context:
      // 1. Notification from email (lead/question/review) → show notification card
      // 2. State param provided (e.g., from dispute link) → use that state
      // 3. Default → claim-form
      if (actionParam) {
        // Map action param to notification state
        const notificationStateMap: Record<string, ActionCardState> = {
          lead: "notification-lead",
          message: "notification-lead", // Messages show similar card to leads
          question: "notification-question",
          review: "notification-review",
        };
        setActionCardState(notificationStateMap[actionParam] || "claim-form");
      } else {
        const validStates: ActionCardState[] = ["claim-form", "already-claimed"];
        if (stateParam && validStates.includes(stateParam)) {
          setActionCardState(stateParam);
        } else {
          setActionCardState("claim-form");
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
          pendingClaim: pendingClaimParam, // For alternate email claims
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

  // Handle claim button click - open auth modal for authentication-based claim flow
  // After auth, the API will check if email matches provider's email for auto-verification
  const hasProviderProfile = (profiles || []).some((p) => p.type === "organization");

  const handleClaimClick = useCallback(async () => {
    // If user is signed in AND has a provider profile, call claim-listing API directly
    if (user && hasProviderProfile) {
      setStep("finalizing");
      try {
        const res = await fetch("/api/provider/claim-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: provider?.provider_id,
            providerName: provider?.provider_name,
            providerSlug: provider?.slug || provider?.provider_id,
            providerEmail: provider?.email,
            city: provider?.city,
            state: provider?.state,
          }),
        });
        const result = await res.json();

        if (!res.ok) {
          setErrorMsg(result.error || "Failed to claim listing.");
          setStep("error");
          return;
        }

        await refreshAccountData();
        if (result.profileId) {
          switchProfile(result.profileId);
        }
        setStep("success");
      } catch {
        setErrorMsg("Something went wrong. Please try again.");
        setStep("error");
      }
      return;
    }

    // Store provider data in sessionStorage for UnifiedAuthModal to read after auth
    sessionStorage.setItem("olera_claim_provider_cache", JSON.stringify({
      provider_id: provider?.provider_id,
      provider_name: provider?.provider_name,
      slug: provider?.slug || provider?.provider_id,
      email: provider?.email,
      city: provider?.city,
      state: provider?.state,
    }));

    // Open auth modal with claim intent
    // For users signed in with family/caregiver account, they'll see error and can try different email
    // For guests, they sign up/in with business email
    // The claim-listing API will handle email matching for verification status
    openAuth({
      intent: "provider",
      providerType: "organization",
      headline: "Sign in to claim this listing",
      subline: user
        ? "Sign in with your business email to claim this listing"
        : provider?.email
          ? `Use ${provider.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")} for instant verification`
          : "Use your business email to claim and manage this listing",
      deferred: {
        action: "claim-listing",
        returnUrl: `${window.location.pathname}?provider_id=${provider?.provider_id}`,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasProviderProfile, openAuth, provider?.provider_id, provider?.provider_name, provider?.slug, provider?.email, provider?.city, provider?.state, refreshAccountData, switchProfile]);

  // Loading state
  if (step === "loading" || openingNotifications) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0]">
        <div className="text-center px-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
          <div role="status" aria-live="polite">
            <p className="mt-4 text-gray-700">
              {actionParam === "notifications" ? "Opening notification settings…" : "Loading…"}
            </p>
            {actionParam === "notifications" && (
              <p className="mt-2 text-sm text-gray-500">
                {provider?.provider_name ? `For ${provider.provider_name}. ` : ""}Please wait while we securely open your settings.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0]">
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
                sessionStorage.removeItem("olera_post_claim_redirect");
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

  // Determine success redirect URL based on action type
  const getSuccessRedirectUrl = () => {
    // Check for stored redirect from reviews card click
    const storedRedirect = typeof window !== "undefined"
      ? sessionStorage.getItem("olera_post_claim_redirect")
      : null;
    if (storedRedirect) {
      sessionStorage.removeItem("olera_post_claim_redirect");
      return storedRedirect;
    }
    return getActionRedirectUrl(actionParam, actionIdParam, slug, searchParams.get("eid"));
  };

  // Get button text based on action type
  const getSuccessButtonText = () => {
    // Check for stored redirect from card clicks
    const storedRedirect = typeof window !== "undefined"
      ? sessionStorage.getItem("olera_post_claim_redirect")
      : null;
    if (storedRedirect === "/provider/reviews") {
      return "Go to Reviews";
    }
    if (storedRedirect === "/medjobs/candidates") {
      return "Browse Caregivers";
    }
    if (actionParam === "lead" || actionParam === "message") {
      return "View Message";
    } else if (actionParam === "question") {
      return "View Question";
    } else if (actionParam === "review") {
      return "View Review";
    }
    return "Go to Dashboard";
  };

  // Success state
  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0]">
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
            onClick={() => router.push(getSuccessRedirectUrl())}
            className="px-8 py-4 bg-primary-600 text-white text-base font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all shadow-sm min-h-[48px]"
          >
            {getSuccessButtonText()}
          </button>
        </div>
      </div>
    );
  }

  // Finalizing state
  if (step === "finalizing") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0]">
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
      onClaimClick={handleClaimClick}
      initialActionState={actionCardState}
      notificationData={notificationData}
      isSignedIn={!!user}
      preVerifiedEmail={preVerifiedEmail || undefined}
      resendContext={resendContext}
    />
  );
}

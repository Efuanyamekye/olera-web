"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDeferredAction, clearDeferredAction } from "@/lib/deferred-action";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import { getOrCreateSessionId, getOrCreateVisitId } from "@/lib/analytics/session";
import {
  mapProviderCareTypes,
  RECIPIENT_FROM_PROFILE,
  URGENCY_FROM_TIMELINE,
  CARE_TYPE_FROM_DISPLAY,
} from "./constants";
import { storeGuestRedirect } from "@/components/auth/MagicLinkHandler";
import type {
  CardState,
  IntentStep,
  IntentData,
  CareRecipient,
  CareTypeValue,
  UrgencyValue,
  ConnectionCardProps,
} from "./types";

const CONNECTION_INTENT_KEY = "olera_connection_intent";
const CLAIM_TOKEN_KEY = "olera_claim_token";

const INITIAL_INTENT: IntentData = {
  careRecipient: null,
  careType: null,
  urgency: null,
};

// Module-level cache for iOS provider UUID resolution
const resolvedIdCache = new Map<string, string>();

/** Build intent data from profile metadata when no prior connection intent exists */
function buildIntentFromProfile(profile: {
  metadata?: Record<string, unknown>;
  care_types?: string[];
}): IntentData | null {
  const meta = profile.metadata || {};
  const recipient = meta.relationship_to_recipient as string | undefined;
  const timeline = meta.timeline as string | undefined;
  const careTypes = profile.care_types || [];

  const careRecipient = recipient
    ? RECIPIENT_FROM_PROFILE[recipient] || "other"
    : null;

  const urgency = timeline ? URGENCY_FROM_TIMELINE[timeline] || null : null;

  // Care type is optional now (removed from new flow)
  let careType: IntentData["careType"] = null;
  for (const ct of careTypes) {
    const mapped = CARE_TYPE_FROM_DISPLAY[ct];
    if (mapped) {
      careType = mapped;
      break;
    }
  }

  // Only require recipient + urgency for returning user state
  if (careRecipient && urgency) {
    return { careRecipient, careType, urgency };
  }
  return null;
}

/**
 * Fire the CTA funnel events for A/B and channel reporting.
 *
 * `form_submitted` maps to `lead_started` downstream; everything else maps to
 * `cta_engaged` (see the mirror in app/api/activity/track/route.ts).
 *
 * WHY `form_engaged` AND NOT `form_opened`
 * The original TODO asked for a "form-open" boundary, which assumed the mobile
 * shape where a sheet has to be opened before anything can be typed. Desktop
 * has no such step: the card renders `InquiryForm` inline and already open, so
 * an "opened" event would fire on every render and mean nothing.
 *
 * The honest desktop analogue of mobile's `sheet_opened` is the first time the
 * visitor actually touches the form. That is the moment intent becomes
 * observable, and it is the signal that was missing: desktop recorded 21
 * completed inquiries against 10 engagement events, so we could see arrivals
 * and submissions with nothing in between.
 */
function fireCTAClickEvent(
  providerSlug: string,
  variant: string | null | undefined,
  surface: "desktop" | "mobile",
  action: "form_engaged" | "form_submitted",
  isPreview: boolean,
) {
  // Don't fire if variant not yet resolved (CTAVariantRouter passes fallback, so this is rare)
  if (!variant) return;
  // Don't fire in preview mode (contaminates A/B data)
  if (isPreview) return;
  // Fire-and-forget POST (anonymous event format)
  fetch("/api/activity/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actor_type: "anonymous",
      related_provider_id: providerSlug,
      event_type: "cta_variant_clicked",
      session_id: getOrCreateSessionId(),
      metadata: {
        variant,
        surface,
        action,
        visit_id: getOrCreateVisitId(),
        page_path: `/provider/${providerSlug}`,
      },
    }),
  }).catch(() => {});
}

export function useConnectionCard(props: ConnectionCardProps) {
  const {
    providerId,
    providerName,
    providerSlug,
    careTypes: providerCareTypes,
    onConnectionCreated,
    ctaVariant,
    ctaSurface = "desktop",
    ctaPreviewMode = false,
  } = props;

  const router = useRouter();
  const { user, account, activeProfile, profiles, isLoading: authLoading, openAuth, refreshAccountData } =
    useAuth();
  const savedProviders = useSavedProviders();

  // ── Non-family profile guard ──
  // Provider, caregiver, and student accounts cannot send care inquiries
  const isNonFamilyProfile = activeProfile &&
    (activeProfile.type === "organization" || activeProfile.type === "caregiver" || activeProfile.type === "student");
  const phoneRevealTriggered = useRef(false);
  const connectionAuthTriggered = useRef(false);

  // ── State machine ──
  // Start in "loading" to prevent flash while checking auth + existing connections
  const [cardState, setCardState] = useState<CardState>("loading");
  const [intentStep, setIntentStep] = useState<IntentStep>(0);
  const [intentData, setIntentData] = useState<IntentData>(INITIAL_INTENT);

  // ── UI state ──
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  // Use providerSlug for save check to match header SaveButton (which also uses slug)
  const saved = savedProviders.isSaved(providerSlug);
  const [error, setError] = useState("");
  const [pendingRequestDate, setPendingRequestDate] = useState<string | null>(
    null
  );
  const [previousIntent, setPreviousIntent] = useState<IntentData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  // True only when THIS visit sent the inquiry, never on a return visit that
  // found an old one. Gates the one-time "next best option" offer.
  const [justSent, setJustSent] = useState(false);
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);

  // ── Social proof: monthly connection count ──
  const [connectionCount, setConnectionCount] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/connections/count")
      .then((r) => r.json())
      .then((d) => setConnectionCount(d.count ?? null))
      .catch(() => {});
  }, []);

  // Track where to redirect after enrichment save/skip
  const postEnrichmentRedirect = useRef<string | null>(null);
  // Lock: prevents checkExisting from overriding enrichment state
  const enrichmentLock = useRef(false);

  // ── Derived ──
  const availableCareTypes = mapProviderCareTypes();
  const notificationEmail = user?.email || "your email";

  // ── Profile pre-fill data (must be before callbacks that use it) ──
  const profileMeta = (activeProfile?.metadata || {}) as Record<string, unknown>;
  const hasProfileCareDetails = Boolean(
    profileMeta.relationship_to_recipient && profileMeta.timeline
  );
  const profileRecipient = profileMeta.relationship_to_recipient as string | undefined;
  const profileTimeline = profileMeta.timeline as string | undefined;
  const initialRecipient = profileRecipient
    ? RECIPIENT_FROM_PROFILE[profileRecipient] || null
    : null;
  const initialUrgency = profileTimeline
    ? URGENCY_FROM_TIMELINE[profileTimeline] || null
    : null;

  // ── Smart routing: check if user is fully onboarded ──
  // Profile complete = has name, location, care types, and care details
  const isProfileComplete = Boolean(
    activeProfile?.display_name &&
    activeProfile?.city &&
    activeProfile?.state &&
    activeProfile?.care_types?.length &&
    profileMeta.relationship_to_recipient &&
    profileMeta.timeline
  );
  // Matches live = care_post.status === "active"
  const carePost = profileMeta.care_post as { status?: string } | undefined;
  const isMatchesLive = carePost?.status === "active";
  // Fully onboarded = profile complete AND matches live
  const isFullyOnboarded = isProfileComplete && isMatchesLive;

  // ── Prefetch /portal/inbox so post-enrichment navigation is instant ──
  useEffect(() => {
    router.prefetch("/portal/inbox");
  }, [router]);

  // Track previous user to detect login transitions
  const prevUserRef = useRef<typeof user>(undefined);

  // ── Resolve initial state and handle auth transitions ──
  // Prevents flash by showing "loading" until we know the right state
  useEffect(() => {
    if (authLoading) return;
    // Don't reset if user is answering enrichment questions
    if (enrichmentLock.current) return;

    const wasGuest = prevUserRef.current === null;
    const isNowLoggedIn = !!user;
    prevUserRef.current = user;

    if (!user) {
      // Guest: show form immediately
      setCardState("default");
    } else if (wasGuest && isNowLoggedIn) {
      // User just logged in: show loading while we check for existing connections
      setCardState("loading");
    }
    // If already logged in (page load), stay in "loading" until checkExisting runs
  }, [authLoading, user]);

  // ── Check for existing connection + fetch previous intent (logged-in users) ──
  useEffect(() => {
    // Don't override enrichment state — the user is answering post-submission questions
    if (enrichmentLock.current) return;

    // Wait for user and profiles to be ready
    if (!user || !profiles.length) return;

    // If Supabase not configured (dev/testing), show default state
    if (!isSupabaseConfigured()) {
      setCardState("default");
      return;
    }

    const checkExisting = async () => {
      const supabase = createClient();
      const profileIds = profiles.map((p) => p.id);

      // Resolve provider ID: if it's not a UUID (iOS provider), look up from cache or DB
      let resolvedId: string | null = providerId;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId);
      if (!isUUID) {
        const cached = resolvedIdCache.get(providerId);
        if (cached) {
          resolvedId = cached;
        } else {
          const { data: profile } = await supabase
            .from("business_profiles")
            .select("id")
            .eq("source_provider_id", providerId)
            .limit(1)
            .single();
          resolvedId = profile?.id || null;
          if (resolvedId) {
            resolvedIdCache.set(providerId, resolvedId);
          }
        }
      }

      // Fire connection check and previous intent fetch in parallel
      const connectionPromise = resolvedId
        ? supabase
            .from("connections")
            .select("id, status, metadata, created_at")
            .in("from_profile_id", profileIds)
            .eq("to_profile_id", resolvedId)
            .eq("type", "inquiry")
            .order("created_at", { ascending: false })
            .limit(1)
            .single()
        : Promise.resolve({ data: null });

      const previousIntentPromise = supabase
        .from("connections")
        .select("message")
        .in("from_profile_id", profileIds)
        .eq("type", "inquiry")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const [connectionResult, intentResult] = await Promise.all([
        connectionPromise,
        previousIntentPromise,
      ]);

      // Check connection to THIS provider
      if (connectionResult.data) {
        const data = connectionResult.data;
        setPendingRequestDate(data.created_at);
        setConnectionId(data.id);

        if (data.status === "accepted" || data.status === "pending") {
          setCardState("connected");
          return;
        }

        // Past/ended connection — fall through to check for previous intent data
      }

      // No active connection — stay on default (form) state
      setCardState("default");
    };

    checkExisting();
  }, [user, profiles, providerId, activeProfile]);

  // ── Handle deferred phone reveal after auth ──
  useEffect(() => {
    if (phoneRevealTriggered.current) return;
    if (!user) return;

    const deferred = getDeferredAction();
    if (
      deferred?.action === "phone_reveal" &&
      deferred?.targetProfileId === providerId
    ) {
      phoneRevealTriggered.current = true;
      clearDeferredAction();
      setPhoneRevealed(true);
    }
  }, [user, providerId]);

  // ── Submit connection request via API ──
  const submitRequest = useCallback(async (intentOverride?: IntentData) => {
    const intent = intentOverride || intentData;
    setError("");
    setSubmitting(true);

    try {
      if (!user) {
        throw new Error("Please sign in to send a connection request.");
      }

      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          providerName,
          providerSlug,
          intentData: intent,
          session_id: getOrCreateSessionId(),
          visit_id: getOrCreateVisitId(),
          cta_variant: ctaVariant || "legacy",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send request.");
      }

      // Dispatch event so inbox pages can refresh without manual reload
      window.dispatchEvent(new CustomEvent("olera:connection-created"));

      // Redirect to post-connection success page if callback provided
      // Do this BEFORE state transitions so the redirect is instant
      if (data.connectionId && onConnectionCreated) {
        onConnectionCreated(data.connectionId);
        return; // Skip further state updates — we're navigating away
      }

      // No redirect callback — update local state as before
      await refreshAccountData();

      if (data.created_at) {
        setPendingRequestDate(data.created_at);
      }
      if (data.connectionId) {
        setConnectionId(data.connectionId);
      }

      setCardState("connected");
      setPendingRequestDate((prev) => prev || new Date().toISOString());
      setPhoneRevealed(true);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : String(err);
      console.error("Connection request error:", msg);
      setError(msg || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    user,
    providerId,
    providerName,
    providerSlug,
    intentData,
    refreshAccountData,
    onConnectionCreated,
    ctaVariant,
  ]);

  // ── Handle deferred connection request after auth ──
  useEffect(() => {
    if (connectionAuthTriggered.current) return;
    if (!user || !account) return;

    const deferred = getDeferredAction();
    if (
      deferred?.action === "connection_request" &&
      deferred?.targetProfileId === providerId
    ) {
      connectionAuthTriggered.current = true;
      clearDeferredAction();

      // Restore intent data from sessionStorage (needed for Google OAuth redirect)
      let restoredIntent: IntentData | null = null;
      try {
        const savedIntent = sessionStorage.getItem(CONNECTION_INTENT_KEY);
        if (savedIntent) {
          restoredIntent = JSON.parse(savedIntent);
          sessionStorage.removeItem(CONNECTION_INTENT_KEY);
        }
      } catch {
        // sessionStorage may fail in private browsing
      }

      // Fire API — submitRequest handles state transitions
      if (!onConnectionCreated) {
        setCardState("connected");
        setPendingRequestDate(new Date().toISOString());
        setPhoneRevealed(true);
      }
      submitRequest(restoredIntent || undefined);
    }
  }, [user, account, providerId, submitRequest, onConnectionCreated]);

  // ── Funnel: first real interaction with the inquiry form ──
  // Fires once per card. Without this the desktop funnel has a hole between
  // "landed" and "submitted", which is exactly where the CTA fails.
  const formEngagedRef = useRef(false);
  const trackFormEngaged = useCallback(() => {
    if (formEngagedRef.current) return;
    formEngagedRef.current = true;
    fireCTAClickEvent(providerSlug, ctaVariant, ctaSurface, "form_engaged", ctaPreviewMode);
  }, [providerSlug, ctaVariant, ctaSurface, ctaPreviewMode]);

  // ── Navigation helpers ──
  const startFlow = useCallback(() => {
    if (user && previousIntent) {
      setIntentData(previousIntent);
      setCardState("returning");
    } else {
      setCardState("intent");
      setIntentStep(0);
    }
  }, [user, previousIntent]);

  const resetFlow = useCallback(() => {
    setCardState("default");
    setIntentStep(0);
    setIntentData(INITIAL_INTENT);
    setError("");
  }, []);

  // ── Reset from provider email block (use different email) ──
  const resetFromProviderEmailBlock = useCallback(() => {
    setBlockedEmail(null);
    setCardState("default");
    setError("");
  }, []);

  // ── Auto-advancing field setters (for intent steps) ──
  const selectRecipient = useCallback((val: CareRecipient) => {
    setIntentData((prev) => ({ ...prev, careRecipient: val }));
    // Auto-advance to urgency step after a short delay for visual feedback
    setTimeout(() => setIntentStep(1), 150);
  }, []);

  const selectUrgency = useCallback((val: UrgencyValue) => {
    setIntentData((prev) => ({ ...prev, urgency: val }));
  }, []);

  // ── Submit guest connection request via API (instant account creation) ──
  const submitGuestRequest = useCallback(async (email: string) => {
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          providerName,
          providerSlug,
          intentData,
          guest: true,
          guestEmail: email,
          session_id: getOrCreateSessionId(),
          visit_id: getOrCreateVisitId(),
          cta_variant: ctaVariant || "legacy",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send request.");
      }

      window.dispatchEvent(new CustomEvent("olera:connection-created"));

      // Establish session instantly using tokenHash
      if (data.tokenHash) {
        try {
          const supabase = createClient();
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: data.tokenHash,
            type: "magiclink",
          });

          if (verifyError) {
            console.error("Failed to establish session:", verifyError);
          }
        } catch (sessionErr) {
          console.error("Session error:", sessionErr);
        }
      }

      // Navigate to inbox with connection ID
      router.push(`/portal/inbox?id=${data.connectionId}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : String(err);
      console.error("Guest connection request error:", msg);
      setError(msg || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [providerId, providerName, providerSlug, intentData, router, ctaVariant]);

  // ── Connect (submit from intent or returning) ──
  const connect = useCallback(() => {
    if (user) {
      if (!onConnectionCreated) {
        // No redirect — show connected state immediately
        setCardState("connected");
        setPendingRequestDate(new Date().toISOString());
        setPhoneRevealed(true);
      }
      // When onConnectionCreated exists, stay on current screen with
      // submitting=true on the button, then redirect instantly after API
      submitRequest();
    } else {
      // Guest user — go to email capture step
      setCardState("email_capture");
    }
  }, [user, submitRequest, onConnectionCreated]);

  const editFromReturning = useCallback(() => {
    setIntentStep(0);
    setCardState("intent");
  }, []);

  const revealPhone = useCallback(() => {
    if (!user) {
      openAuth({
        defaultMode: "sign-up",
        deferred: {
          action: "phone_reveal",
          targetProfileId: providerId,
          returnUrl: `/provider/${providerSlug}`,
        },
      });
      return;
    }
    setPhoneRevealed(true);
  }, [user, openAuth, providerId, providerSlug]);

  const toggleSave = useCallback(() => {
    savedProviders.toggleSave({
      providerId,
      slug: providerSlug,
      name: providerName,
      location: "",
      careTypes: providerCareTypes || [],
      image: null,
    });
  }, [savedProviders, providerId, providerSlug, providerName, providerCareTypes]);

  // ── Edit from email capture ──
  const editFromEmailCapture = useCallback(() => {
    setIntentStep(0);
    setCardState("intent");
  }, []);

  // ── Submit inquiry form (v3.0 — email-only, optimistic enrichment) ──
  const submitInquiryForm = useCallback(async (formData: {
    email: string;
  }) => {
    if (enrichmentLock.current) return; // Prevent double-submit
    setError("");

    // Fire CTA click event for A/B tracking
    fireCTAClickEvent(providerSlug, ctaVariant, ctaSurface, "form_submitted", ctaPreviewMode);

    // ── OPTIMISTIC: Show enrichment instantly (before API) ──
    enrichmentLock.current = true;
    postEnrichmentRedirect.current = `/portal/inbox`;
    setCardState("enrichment");

    // ── BACKGROUND: Fire API without blocking the UI ──
    // Name, phone, message no longer collected upfront — moved to enrichment
    const formIntentData = {
      careRecipient: null,
      careType: null,
      urgency: null,
      additionalNotes: null,
    };

    try {
      if (user) {
        // Authenticated user flow
        const res = await fetch("/api/connections/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId,
            providerName,
            providerSlug,
            intentData: formIntentData,
            formData: {
              fullName: "",
              phone: "",
              message: "",
            },
            session_id: getOrCreateSessionId(),
            visit_id: getOrCreateVisitId(),
            cta_variant: ctaVariant || "legacy",
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send request.");

        window.dispatchEvent(new CustomEvent("olera:connection-created"));
        if (data.created_at) setPendingRequestDate(data.created_at);
        if (data.connectionId) {
          setConnectionId(data.connectionId);
          setJustSent(true);
        }

        // Update redirect with real connectionId
        postEnrichmentRedirect.current = `/portal/inbox?id=${data.connectionId}`;

        // Refresh account data in background (non-blocking)
        refreshAccountData().catch(() => {});
      } else {
        // Guest flow — instant account creation + session
        const res = await fetch("/api/connections/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId,
            providerName,
            providerSlug,
            intentData: formIntentData,
            guest: true,
            guestEmail: formData.email,
            formData: {
              fullName: "",
              phone: "",
              message: "",
            },
            session_id: getOrCreateSessionId(),
            visit_id: getOrCreateVisitId(),
            cta_variant: ctaVariant || "legacy",
          }),
        });

        const data = await res.json();

        // Check for provider email block — show blocking UI instead of error
        if (!res.ok && data.code === "PROVIDER_EMAIL") {
          enrichmentLock.current = false;
          postEnrichmentRedirect.current = null;
          setBlockedEmail(formData.email);
          setCardState("provider_email_block");
          return;
        }

        if (!res.ok) throw new Error(data.error || "Failed to send request.");

        window.dispatchEvent(new CustomEvent("olera:connection-created"));

        try {
          localStorage.setItem("olera_pending_connection", JSON.stringify({
            connectionId: data.connectionId,
            providerId,
            providerSlug,
            providerName,
          }));
        } catch {
          // localStorage not available
        }

        if (data.connectionId) {
          setConnectionId(data.connectionId);
          setJustSent(true);
        }
        if (data.created_at) setPendingRequestDate(data.created_at);

        // Update redirect with real connectionId — but ONLY for users who now
        // hold a session. An existing account gets no session (anti-takeover:
        // we can't trust a typed email); a sign-in link was emailed instead, so
        // don't bounce them into the gated inbox. They land on the in-card
        // "connected" success state and sign in from their email.
        if (!data.existingUser) {
          postEnrichmentRedirect.current = `/portal/inbox?id=${data.connectionId}`;
        }

        // Establish session in background
        if (data.accessToken && data.refreshToken) {
          const supabase = createClient();
          supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          }).then(({ data: sessionData, error: sessionError }: { data: { session: { user?: { id?: string } | null } | null }; error: unknown }) => {
            if (sessionError) {
              console.error("[guest-connection] Background session error:", sessionError);
            } else {
              const userId = sessionData?.session?.user?.id;
              if (userId && refreshAccountData) {
                refreshAccountData(userId).catch(() => {});
              }
            }
          }).catch((err: unknown) => {
            console.error("[guest-connection] Background session error:", err);
          });
        }
      }
    } catch (err: unknown) {
      // ── ROLLBACK: API failed — snap back to form ──
      enrichmentLock.current = false;
      postEnrichmentRedirect.current = null;
      setCardState("default");
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : String(err);
      console.error("Inquiry form error:", msg);
      setError(msg || "Something went wrong. Please try again.");
    }
  }, [user, providerId, providerName, providerSlug, refreshAccountData, ctaVariant, ctaSurface, ctaPreviewMode]);

  // ── Navigate after enrichment (save or skip) ──
  const navigatePostEnrichment = useCallback(() => {
    if (onConnectionCreated && connectionId) {
      // Keep lock during callback navigation — prevents flash
      onConnectionCreated(connectionId);
    } else if (postEnrichmentRedirect.current) {
      // Keep lock during router navigation — prevents "connected" state flash
      router.push(postEnrichmentRedirect.current);
    } else {
      // Only unlock when explicitly showing connected state (no redirect case)
      enrichmentLock.current = false;
      setCardState("connected");
    }
  }, [connectionId, onConnectionCreated, router]);

  // ── Save enrichment data (post-submit) → update connection + sync to profile ──
  const saveEnrichment = useCallback(async (data?: {
    careRecipient?: string;
    urgency?: string;
    phone?: string;
    notifyChannel?: string;
    contactPreference?: string;
    // Extended enrichment fields
    careType?: string;
    careNeed?: string;
    paymentMethod?: string;
    name?: string;
    city?: string;
    state?: string;
  }) => {
    // Need at least connectionId and some data to save
    const hasIntentData = data?.careRecipient || data?.urgency || data?.careType || data?.careNeed || data?.paymentMethod;
    const hasPhone = data?.phone && data.phone.trim();
    const hasContact = data?.notifyChannel || data?.contactPreference;
    const hasDetails = data?.name || data?.city || data?.state;
    if (!connectionId || (!hasIntentData && !hasPhone && !hasContact && !hasDetails)) {
      // Stay on page instead of redirecting
      enrichmentLock.current = false;
      setCardState("connected");
      return;
    }

    setSubmitting(true);
    try {
      // For guest flow: session may still be establishing in background.
      // Wait briefly for it if needed, then retry once on 401.
      const doSave = async (retry = false): Promise<boolean> => {
        const res = await fetch("/api/connections/update-intent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId,
            careRecipient: data.careRecipient,
            urgency: data.urgency,
            phone: data.phone || undefined,
            // Support both old notifyChannel and new contactPreference
            notifyChannel: data.contactPreference || data.notifyChannel || undefined,
            // Extended enrichment fields
            careType: data.careType || undefined,
            careNeed: data.careNeed || undefined,
            paymentMethod: data.paymentMethod || undefined,
            name: data.name || undefined,
            city: data.city || undefined,
            state: data.state || undefined,
          }),
        });

        if (res.status === 401 && !retry) {
          // Session not ready yet — wait and retry once
          await new Promise(r => setTimeout(r, 1500));
          return doSave(true);
        }

        if (!res.ok) {
          console.error("[enrichment] update-intent failed:", await res.text());
          return false;
        }
        return true;
      };

      await doSave();

      // Refresh auth context so welcome page has fresh profile data
      await refreshAccountData().catch(() => {});
    } catch (err) {
      console.error("[enrichment] update-intent error:", err);
    } finally {
      setSubmitting(false);
    }

    // Stay on page — show connected state instead of redirecting to inbox
    enrichmentLock.current = false;
    setCardState("connected");
  }, [connectionId, refreshAccountData]);

  const skipEnrichment = useCallback(() => {
    // Stay on page — show connected state instead of redirecting to inbox
    enrichmentLock.current = false;
    setCardState("connected");
  }, []);

  // Total steps: 2 for logged-in, 3 for guest (includes email capture)
  const totalSteps = user ? 2 : 3;

  // Pre-fill data for signed-in users
  const userEmail = user?.email || "";
  const userName = account?.display_name || "";
  const userPhone = activeProfile?.phone || "";

  return {
    // State
    cardState,
    intentStep,
    intentData,
    phoneRevealed,
    saved,
    error,
    submitting,
    pendingRequestDate,
    connectionId,
    availableCareTypes,
    notificationEmail,
    totalSteps,

    // Funnel tracking
    trackFormEngaged,

    // Navigation
    startFlow,
    resetFlow,
    editFromReturning,
    editFromEmailCapture,
    connect,

    // Auto-advancing field setters
    selectRecipient,
    selectUrgency,
    setIntentStep,
    revealPhone,
    toggleSave,

    // Guest flow
    submitGuestRequest,

    // v2.0 inquiry form flow
    submitInquiryForm,
    saveEnrichment,
    skipEnrichment,

    // Pre-fill for signed-in users
    userEmail,
    userName,
    userPhone,
    hasProfileCareDetails,
    initialRecipient,
    initialUrgency,
    isMatchesLive,

    // Non-family profile guard
    isNonFamilyProfile,
    accountTypeLabel: activeProfile?.type === "organization"
      ? "provider"
      : (activeProfile?.type === "caregiver" || activeProfile?.type === "student")
      ? "caregiver"
      : "current",
    openAuth,

    // Provider email block (guest flow)
    blockedEmail,
    resetFromProviderEmailBlock,

    // Social proof
    connectionCount,

    // Post-send "next best option" offer
    justSent,
  };
}

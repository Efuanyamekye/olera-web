"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDeferredAction, clearDeferredAction } from "@/lib/deferred-action";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import {
  mapProviderCareTypes,
  RECIPIENT_FROM_PROFILE,
  URGENCY_FROM_TIMELINE,
  CARE_TYPE_FROM_DISPLAY,
} from "./constants";
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

export function useConnectionCard(props: ConnectionCardProps) {
  const {
    providerId,
    providerName,
    providerSlug,
    careTypes: providerCareTypes,
    onConnectionCreated,
  } = props;

  const { user, account, activeProfile, profiles, isLoading: authLoading, openAuth, refreshAccountData } =
    useAuth();
  const savedProviders = useSavedProviders();
  const phoneRevealTriggered = useRef(false);
  const connectionAuthTriggered = useRef(false);

  // ── State machine ──
  const [cardState, setCardState] = useState<CardState>("default");
  const [intentStep, setIntentStep] = useState<IntentStep>(0);
  const [intentData, setIntentData] = useState<IntentData>(INITIAL_INTENT);

  // ── UI state ──
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const saved = savedProviders.isSaved(providerId);
  const [error, setError] = useState("");
  const [pendingRequestDate, setPendingRequestDate] = useState<string | null>(
    null
  );
  const [previousIntent, setPreviousIntent] = useState<IntentData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // ── Derived ──
  const availableCareTypes = mapProviderCareTypes();
  const notificationEmail = user?.email || "your email";

  // ── Resolve initial state — show optimistic UI immediately ──
  useEffect(() => {
    if (authLoading) return;

    // Anonymous user — show default immediately
    if (!user) {
      setCardState("default");
      return;
    }

    // Logged-in user — try optimistic render from profile data (skip skeleton)
    if (activeProfile) {
      const profileIntent = buildIntentFromProfile({
        metadata: activeProfile.metadata as Record<string, unknown> | undefined,
        care_types: activeProfile.care_types ?? undefined,
      });
      if (profileIntent) {
        setPreviousIntent(profileIntent);
        setIntentData(profileIntent);
        setCardState("returning");
        return;
      }
    }

    // Logged-in but no profile data to pre-fill — show default instead of skeleton
    setCardState("default");
  }, [authLoading, user, activeProfile]);

  // ── Check for existing connection + fetch previous intent (logged-in users) ──
  useEffect(() => {
    if (!user || !profiles.length || !isSupabaseConfigured()) return;

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

      // Restore previous intent data (from any connection)
      if (intentResult.data?.message) {
        try {
          const parsed = JSON.parse(intentResult.data.message);
          const restored: IntentData = {
            careRecipient: parsed.care_recipient || null,
            careType: parsed.care_type || null, // Optional - may be null for new flow
            urgency: parsed.urgency || null,
          };
          // Only require recipient + urgency for returning user state
          if (restored.careRecipient && restored.urgency) {
            setPreviousIntent(restored);
            setIntentData(restored);
            setCardState("returning");
            return;
          }
        } catch {
          // Invalid JSON — ignore
        }
      }

      // Fallback: try to build intent from profile metadata
      if (activeProfile) {
        const profileIntent = buildIntentFromProfile({
          metadata: activeProfile.metadata as Record<string, unknown> | undefined,
          care_types: activeProfile.care_types ?? undefined,
        });
        if (profileIntent) {
          setPreviousIntent(profileIntent);
          setIntentData(profileIntent);
          setCardState("returning");
          return;
        }
      }

      // No connection, no previous intent, no profile data → default
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

  // ── Auto-advancing field setters (for intent steps) ──
  const selectRecipient = useCallback((val: CareRecipient) => {
    setIntentData((prev) => ({ ...prev, careRecipient: val }));
    // Auto-advance to urgency step after a short delay for visual feedback
    setTimeout(() => setIntentStep(1), 150);
  }, []);

  const selectUrgency = useCallback((val: UrgencyValue) => {
    setIntentData((prev) => ({ ...prev, urgency: val }));
  }, []);

  // ── Submit guest connection request via API ──
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send request.");
      }

      // Store claim token in localStorage for inbox access
      if (data.claimToken) {
        try {
          localStorage.setItem(CLAIM_TOKEN_KEY, data.claimToken);
        } catch {
          // localStorage may fail in private browsing
        }
      }

      // Redirect to post-connection success page if callback provided
      if (data.connectionId && onConnectionCreated) {
        onConnectionCreated(data.connectionId);
        return;
      }

      // No redirect callback — update local state
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
      console.error("Guest connection request error:", msg);
      setError(msg || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [providerId, providerName, providerSlug, intentData, onConnectionCreated]);

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

  // Total steps: 2 for logged-in, 3 for guest (includes email capture)
  const totalSteps = user ? 2 : 3;

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
  };
}

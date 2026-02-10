"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import { mapProviderCareTypes } from "./constants";
import type {
  CardState,
  IntentStep,
  IdentityStep,
  IntentData,
  IdentityData,
  CareRecipient,
  CareTypeValue,
  UrgencyValue,
  ContactPreference,
  ConnectionCardProps,
} from "./types";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `family-${base}-${suffix}`;
}

const INITIAL_INTENT: IntentData = {
  careRecipient: null,
  careType: null,
  careTypeOtherText: "",
  urgency: null,
  additionalNotes: "",
};

const INITIAL_IDENTITY: IdentityData = {
  email: "",
  firstName: "",
  lastName: "",
  contactPreference: null,
  phone: "",
};

export function useConnectionCard(props: ConnectionCardProps) {
  const {
    providerId,
    providerName,
    providerSlug,
    careTypes: providerCareTypes,
    isActive,
  } = props;

  const { user, account, activeProfile, refreshAccountData } = useAuth();
  const savedProviders = useSavedProviders();

  // ── State machine ──
  const [cardState, setCardState] = useState<CardState>("default");
  const [intentStep, setIntentStep] = useState<IntentStep>(0);
  const [identityStep, setIdentityStep] = useState<IdentityStep>(0);
  const [intentData, setIntentData] = useState<IntentData>(INITIAL_INTENT);
  const [identityData, setIdentityData] =
    useState<IdentityData>(INITIAL_IDENTITY);

  // ── UI state ──
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const saved = savedProviders.isSaved(providerId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingRequestDate, setPendingRequestDate] = useState<string | null>(
    null
  );

  // ── Derived ──
  const availableCareTypes = mapProviderCareTypes(providerCareTypes);

  // ── Check for inactive provider ──
  useEffect(() => {
    if (!isActive) {
      setCardState("inactive");
    }
  }, [isActive]);

  // ── Check for existing connection (logged-in users) ──
  useEffect(() => {
    if (!user || !activeProfile || !isSupabaseConfigured()) return;

    const checkExisting = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("connections")
        .select("id, created_at")
        .eq("from_profile_id", activeProfile.id)
        .eq("to_profile_id", providerId)
        .eq("type", "inquiry")
        .single();

      if (data) {
        setCardState("pending");
        setPendingRequestDate(data.created_at);
      }
    };

    checkExisting();
  }, [user, activeProfile, providerId]);

  // ── Navigation helpers ──
  const startFlow = useCallback(() => {
    setCardState("intent");
    setIntentStep(0);
  }, []);

  const resetFlow = useCallback(() => {
    setCardState("default");
    setIntentStep(0);
    setIdentityStep(0);
    setIntentData(INITIAL_INTENT);
    setIdentityData(INITIAL_IDENTITY);
    setError("");
  }, []);

  const goToNextIntentStep = useCallback(() => {
    if (intentStep === 0 && intentData.careRecipient) {
      // If provider has only 1 care type, auto-select and skip step 1
      if (availableCareTypes.length === 1) {
        setIntentData((prev) => ({
          ...prev,
          careType: availableCareTypes[0],
        }));
        setIntentStep(2);
      } else {
        setIntentStep(1);
      }
    } else if (intentStep === 1 && intentData.careType) {
      setIntentStep(2);
    } else if (intentStep === 2 && intentData.urgency) {
      // "Just researching" → save and go back to default
      if (intentData.urgency === "researching") {
        if (!saved) {
          savedProviders.toggleSave({
            providerId,
            slug: providerSlug,
            name: providerName,
            location: "",
            careTypes: providerCareTypes || [],
            image: null,
          });
        }
        resetFlow();
        return;
      }
      // Otherwise proceed to identity capture
      setCardState("identity");
      setIdentityStep(0);
    }
  }, [intentStep, intentData, availableCareTypes, resetFlow]);

  const goBackIntentStep = useCallback(() => {
    if (intentStep === 0) {
      resetFlow();
    } else if (intentStep === 2 && availableCareTypes.length === 1) {
      // Skip back over step 1 if it was auto-skipped
      setIntentStep(0);
    } else {
      setIntentStep((prev) => (prev - 1) as IntentStep);
    }
  }, [intentStep, availableCareTypes, resetFlow]);

  const editIntentStep = useCallback((step: IntentStep) => {
    setIntentStep(step);
    setCardState("intent");
  }, []);

  const goToNextIdentityStep = useCallback(() => {
    if (identityStep === 0) {
      setIdentityStep(1);
    }
  }, [identityStep]);

  const goBackIdentityStep = useCallback(() => {
    if (identityStep === 0) {
      // Back from identity sub-step 0 → intent step 2
      setCardState("intent");
      setIntentStep(2);
    } else {
      setIdentityStep(0);
    }
  }, [identityStep]);

  const editIdentityStep = useCallback((step: IdentityStep) => {
    setIdentityStep(step);
  }, []);

  // ── Field setters ──
  const setRecipient = useCallback((val: CareRecipient) => {
    setIntentData((prev) => ({ ...prev, careRecipient: val }));
  }, []);

  const setCareType = useCallback((val: CareTypeValue) => {
    setIntentData((prev) => ({ ...prev, careType: val }));
  }, []);

  const setUrgency = useCallback((val: UrgencyValue) => {
    setIntentData((prev) => ({ ...prev, urgency: val }));
  }, []);

  const setNotes = useCallback((val: string) => {
    setIntentData((prev) => ({ ...prev, additionalNotes: val }));
  }, []);

  const setEmail = useCallback((val: string) => {
    setIdentityData((prev) => ({ ...prev, email: val }));
  }, []);

  const setFirstName = useCallback((val: string) => {
    setIdentityData((prev) => ({ ...prev, firstName: val }));
  }, []);

  const setLastName = useCallback((val: string) => {
    setIdentityData((prev) => ({ ...prev, lastName: val }));
  }, []);

  const setContactPref = useCallback((val: ContactPreference) => {
    setIdentityData((prev) => ({ ...prev, contactPreference: val }));
  }, []);

  const setPhone = useCallback((val: string) => {
    setIdentityData((prev) => ({ ...prev, phone: val }));
  }, []);

  const revealPhone = useCallback(() => {
    setPhoneRevealed(true);
    // AUTH_INTEGRATION_POINT: In the post-auth period, log phone_reveal_event here.
  }, []);

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

  // ── Submit connection request ──
  const submitRequest = useCallback(async () => {
    setSubmitting(true);
    setError("");

    try {
      // If user is logged in, persist to database
      if (user && account && isSupabaseConfigured()) {
        const supabase = createClient();

        // Ensure we have a family profile
        let fromProfileId: string;

        if (activeProfile?.type === "family") {
          fromProfileId = activeProfile.id;
        } else {
          // Check for existing family profile
          const { data: existingFamily } = await supabase
            .from("business_profiles")
            .select("id")
            .eq("account_id", account.id)
            .eq("type", "family")
            .limit(1)
            .single();

          if (existingFamily) {
            fromProfileId = existingFamily.id;
          } else {
            // Create a minimal family profile
            const displayName =
              identityData.firstName && identityData.lastName
                ? `${identityData.firstName} ${identityData.lastName}`
                : account.display_name ||
                  user.email?.split("@")[0] ||
                  "Family";
            const slug = generateSlug(displayName);

            const { data: newProfile, error: profileError } = await supabase
              .from("business_profiles")
              .insert({
                account_id: account.id,
                slug,
                type: "family",
                category: null,
                display_name: displayName,
                care_types: [],
                claim_state: "claimed",
                verification_state: "unverified",
                source: "user_created",
                metadata: {},
              })
              .select("id")
              .single();

            if (profileError) throw new Error(profileError.message);
            fromProfileId = newProfile.id;

            if (!activeProfile) {
              await supabase
                .from("accounts")
                .update({
                  active_profile_id: newProfile.id,
                  onboarding_completed: true,
                })
                .eq("id", account.id);
              await refreshAccountData();
            }
          }
        }

        // Insert connection request
        const messagePayload = JSON.stringify({
          care_recipient: intentData.careRecipient,
          care_type: intentData.careType,
          care_type_other: intentData.careTypeOtherText || null,
          urgency: intentData.urgency,
          additional_notes: intentData.additionalNotes || null,
          contact_preference: identityData.contactPreference,
          seeker_phone: identityData.phone || null,
          seeker_email: identityData.email,
          seeker_first_name: identityData.firstName,
          seeker_last_name: identityData.lastName,
        });

        const { error: insertError } = await supabase
          .from("connections")
          .insert({
            from_profile_id: fromProfileId,
            to_profile_id: providerId,
            type: "inquiry",
            status: "pending",
            message: messagePayload,
          });

        if (insertError) {
          if (
            insertError.code === "23505" ||
            insertError.message.includes("duplicate") ||
            insertError.message.includes("unique")
          ) {
            setCardState("pending");
            setPendingRequestDate(new Date().toISOString());
            return;
          }
          throw new Error(insertError.message);
        }
      }

      // AUTH_INTEGRATION_POINT:
      // For anonymous users (pre-auth), the request data is captured in
      // component state but not persisted to the database. When auth is
      // integrated, this path will trigger authentication first, then
      // persist the connection request.

      // Transition to confirmation
      setCardState("confirmation");
      setPhoneRevealed(true); // Phone revealed as reward after connecting
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : String(err);
      console.error("Connection request error:", msg);
      setError(`Something went wrong. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  }, [
    user,
    account,
    activeProfile,
    providerId,
    providerName,
    intentData,
    identityData,
    refreshAccountData,
  ]);

  return {
    // State
    cardState,
    intentStep,
    identityStep,
    intentData,
    identityData,
    phoneRevealed,
    saved,
    submitting,
    error,
    pendingRequestDate,
    availableCareTypes,

    // Navigation
    startFlow,
    resetFlow,
    goToNextIntentStep,
    goBackIntentStep,
    editIntentStep,
    goToNextIdentityStep,
    goBackIdentityStep,
    editIdentityStep,

    // Field setters
    setRecipient,
    setCareType,
    setUrgency,
    setNotes,
    setEmail,
    setFirstName,
    setLastName,
    setContactPref,
    setPhone,
    revealPhone,
    toggleSave,

    // Actions
    submitRequest,
  };
}

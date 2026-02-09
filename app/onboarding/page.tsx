"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ProfileType, ProfileCategory, Profile } from "@/lib/types";
import Button from "@/components/ui/Button";
import IntentStep from "@/components/onboarding/IntentStep";
import ProfileInfoStep from "@/components/onboarding/ProfileInfoStep";
import OrgClaimStep from "@/components/onboarding/OrgClaimStep";

export interface OnboardingData {
  intent: ProfileType | null;
  displayName: string;
  category: ProfileCategory | null;
  city: string;
  state: string;
  zip: string;
  careTypes: string[];
  // Provider-specific (required for shareable profile)
  description: string;
  phone: string;
  // Family-specific
  timeline: string;
  relationshipToRecipient: string;
  // Org claim
  claimedProfileId: string | null;
}

const INITIAL_DATA: OnboardingData = {
  intent: null,
  displayName: "",
  category: null,
  city: "",
  state: "",
  zip: "",
  careTypes: [],
  description: "",
  phone: "",
  timeline: "",
  relationshipToRecipient: "",
  claimedProfileId: null,
};

type Step = "intent" | "profile-info" | "org-claim";

const FORM_STORAGE_KEY = "olera_onboarding_form";

interface StoredForm {
  data: OnboardingData;
  step: Step;
}

function saveFormToStorage(data: OnboardingData, step: Step) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ data, step }));
}

function loadFormFromStorage(): StoredForm | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FORM_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearFormStorage() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FORM_STORAGE_KEY);
}

const VALID_INTENTS: ProfileType[] = ["organization", "caregiver", "family"];

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const { user, account, activeProfile, isLoading, openAuthModal, refreshAccountData } = useAuth();
  const isAddingProfile = !!activeProfile;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("intent");
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [authPrompted, setAuthPrompted] = useState(false);

  // Restore form state: sessionStorage first (mid-flow), then URL params (fresh entry)
  useEffect(() => {
    const saved = loadFormFromStorage();
    if (saved) {
      setData(saved.data);
      setStep(saved.step);
      return;
    }

    // Check URL params for pre-population (e.g., from /for-providers/claim/[slug])
    const intentParam = searchParams.get("intent") as ProfileType | null;
    const claimParam = searchParams.get("claim");

    if (intentParam && VALID_INTENTS.includes(intentParam)) {
      if (claimParam) {
        // Pre-fill from seeded profile and skip intent step
        fetchAndPreFill(intentParam, claimParam);
      } else {
        // Skip intent step with the given intent
        const next = { ...INITIAL_DATA, intent: intentParam };
        setData(next);
        setStep("profile-info");
        saveFormToStorage(next, "profile-info");
      }
    } else if (claimParam) {
      // claim param without intent — default to organization
      fetchAndPreFill("organization", claimParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch seeded profile for claim pre-fill
  const fetchAndPreFill = async (intent: ProfileType, profileId: string) => {
    let profile: Profile | null = null;
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data: fetched } = await supabase
          .from("business_profiles")
          .select("*")
          .eq("id", profileId)
          .single<Profile>();
        profile = fetched;
      }
    } catch {
      // Supabase not configured — proceed with empty data
    }

    const next: OnboardingData = {
      ...INITIAL_DATA,
      intent,
      claimedProfileId: profileId,
      displayName: profile?.display_name || "",
      category: profile?.category || null,
      city: profile?.city || "",
      state: profile?.state || "",
      zip: profile?.zip || "",
      careTypes: profile?.care_types ?? [],
      description: profile?.description || "",
      phone: profile?.phone || "",
    };
    setData(next);
    setStep("profile-info");
    saveFormToStorage(next, "profile-info");
  };

  const updateData = (partial: Partial<OnboardingData>) => {
    setData((prev) => {
      const next = { ...prev, ...partial };
      saveFormToStorage(next, step);
      return next;
    });
  };

  const handleIntentSelected = (intent: ProfileType) => {
    const next = { ...data, intent };
    setData(next);
    setStep("profile-info");
    saveFormToStorage(next, "profile-info");
  };

  const handleProfileInfoComplete = () => {
    // If claiming a pre-selected profile (from URL param), skip org-claim step
    if (data.intent === "organization" && !data.claimedProfileId) {
      setStep("org-claim");
      saveFormToStorage(data, "org-claim");
    } else {
      handleSubmit();
    }
  };

  const handleClaimComplete = (claimedProfileId: string, seededProfile: Profile) => {
    updateData({ claimedProfileId });
    handleSubmit(claimedProfileId, seededProfile);
  };

  const handleSubmit = async (claimedId?: string | null, seededProfile?: Profile) => {
    if (!user || !isSupabaseConfigured()) return;
    setSubmitting(true);
    setError("");

    try {
      const supabase = createClient();

      // Ensure account exists (create if needed - handles edge case where
      // database trigger hasn't fired yet after OTP verification)
      let currentAccount = account;
      if (!currentAccount) {
        // First try to fetch (trigger may have created it)
        const { data: existingAcct } = await supabase
          .from("accounts")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (existingAcct) {
          currentAccount = existingAcct;
        } else {
          // Create account if it doesn't exist
          const { data: newAcct, error: createErr } = await supabase
            .from("accounts")
            .insert({
              user_id: user.id,
              display_name: data.displayName || user.email?.split("@")[0] || "",
              onboarding_completed: false,
            })
            .select()
            .single();

          if (createErr) {
            console.error("Failed to create account:", createErr);
            // One more fetch attempt in case of race condition
            const { data: retryAcct } = await supabase
              .from("accounts")
              .select("*")
              .eq("user_id", user.id)
              .single();
            currentAccount = retryAcct;
          } else {
            currentAccount = newAcct;
          }
        }
      }

      if (!currentAccount) {
        setError("Failed to set up your account. Please try refreshing the page.");
        setSubmitting(false);
        return;
      }

      // Refresh auth context to pick up the new account
      await refreshAccountData();
      const profileId = claimedId ?? data.claimedProfileId;

      if (profileId) {
        // Claiming an existing seeded profile.
        // Fetch the seeded profile if not provided (e.g., claim came from URL param)
        let s = seededProfile ?? null;
        if (!s) {
          const { data: fetched } = await supabase
            .from("business_profiles")
            .select("*")
            .eq("id", profileId)
            .single<Profile>();
          s = fetched;
        }

        // Only overwrite fields that are empty/missing in the seeded profile
        // to preserve richer seeded data (e.g., care_types, description).
        // Providers go to "pending" for admin review; families skip to "claimed"
        const update: Record<string, unknown> = {
          account_id: currentAccount.id,
          claim_state: data.intent === "family" ? "claimed" : "pending",
        };

        if (!s?.display_name?.trim() && data.displayName) {
          update.display_name = data.displayName;
        }
        if (!s?.city && data.city) {
          update.city = data.city;
        }
        if (!s?.state && data.state) {
          update.state = data.state;
        }
        if (!s?.zip && data.zip) {
          update.zip = data.zip;
        }
        if ((!s?.care_types || s.care_types.length === 0) && data.careTypes.length > 0) {
          update.care_types = data.careTypes;
        }
        if (!s?.description?.trim() && data.description) {
          update.description = data.description;
        }
        if (!s?.phone && data.phone) {
          update.phone = data.phone;
        }

        const { error: claimError } = await supabase
          .from("business_profiles")
          .update(update)
          .eq("id", profileId);

        if (claimError) throw claimError;

        // Update account
        const accountUpdate: Record<string, unknown> = {
          onboarding_completed: true,
        };
        if (!currentAccount.display_name) {
          accountUpdate.display_name = data.displayName;
        }
        if (!isAddingProfile) {
          accountUpdate.active_profile_id = profileId;
        }

        const { error: accountError } = await supabase
          .from("accounts")
          .update(accountUpdate)
          .eq("id", currentAccount.id);

        if (accountError) throw accountError;

        // Create membership for providers
        if (data.intent !== "family") {
          await supabase.from("memberships").upsert(
            {
              account_id: currentAccount.id,
              plan: "free",
              status: "free",
            },
            { onConflict: "account_id" }
          );
        }
      } else {
        // Creating a new profile
        const slug = generateSlug(data.displayName, data.city, data.state);

        const { data: newProfile, error: profileError } = await supabase
          .from("business_profiles")
          .insert({
            account_id: currentAccount.id,
            slug,
            type: data.intent!,
            category: data.category,
            display_name: data.displayName,
            description: data.description || null,
            phone: data.phone || null,
            city: data.city || null,
            state: data.state || null,
            zip: data.zip || null,
            care_types: data.careTypes,
            claim_state: data.intent === "family" ? ("claimed" as const) : ("pending" as const),
            verification_state: "unverified" as const,
            source: "user_created" as const,
            is_active: true,
            metadata: buildMetadata(data),
          })
          .select("id")
          .single();

        if (profileError) throw profileError;

        // Update account
        const newAccountUpdate: Record<string, unknown> = {
          onboarding_completed: true,
        };
        if (!currentAccount.display_name) {
          newAccountUpdate.display_name = data.displayName;
        }
        if (!isAddingProfile) {
          newAccountUpdate.active_profile_id = newProfile.id;
        }

        const { error: accountError } = await supabase
          .from("accounts")
          .update(newAccountUpdate)
          .eq("id", currentAccount.id);

        if (accountError) throw accountError;

        // Create membership for providers
        if (data.intent !== "family") {
          await supabase.from("memberships").upsert(
            {
              account_id: currentAccount.id,
              plan: "free",
              status: "free",
            },
            { onConflict: "account_id" }
          );
        }
      }

      clearFormStorage();
      await refreshAccountData();

      // Redirect: families go to browse; everyone else (providers, orgs) goes to portal
      if (data.intent === "family" && !isAddingProfile) {
        router.push("/browse");
      } else {
        router.push("/portal");
      }
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : String(err);
      console.error("Onboarding error:", message, err);
      setError(`Something went wrong: ${message}`);
      setSubmitting(false);
    }
  };

  // --- Auth gate ---
  // /onboarding is no longer middleware-protected so it can receive redirects
  // from /for-providers flows. Auto-open the auth modal overlay for
  // unauthenticated users instead of showing a standalone page.
  useEffect(() => {
    if (!isLoading && !user && !authPrompted) {
      setAuthPrompted(true);
      openAuthModal(undefined, "sign-up");
    }
  }, [isLoading, user, authPrompted, openAuthModal]);

  if (!isLoading && !user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Create your profile
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Sign in or create an account to get started on Olera.
          </p>
          <Button
            size="lg"
            onClick={() => openAuthModal(undefined, "sign-up")}
          >
            Get started
          </Button>
          <p className="mt-4 text-base text-gray-500">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => openAuthModal(undefined, "sign-in")}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  // When claiming a pre-selected profile, org-claim step is skipped
  const showOrgClaimStep = data.intent === "organization" && !data.claimedProfileId;
  const totalSteps = showOrgClaimStep ? 3 : 2;
  const stepNumber =
    step === "intent" ? 1 : step === "profile-info" ? 2 : 3;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base text-gray-500">
              Step {stepNumber} of {totalSteps}
            </span>
            {step !== "intent" && (
              <button
                type="button"
                onClick={() => {
                  if (step === "org-claim") {
                    setStep("profile-info");
                    saveFormToStorage(data, "profile-info");
                  } else {
                    setStep("intent");
                    saveFormToStorage(data, "intent");
                  }
                }}
                className="text-base text-primary-600 hover:text-primary-700 font-medium focus:outline-none focus:underline"
              >
                Back
              </button>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div
            className="mb-6 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-base"
            role="alert"
          >
            {error}
          </div>
        )}

        {step === "intent" && (
          <IntentStep onSelect={handleIntentSelected} />
        )}

        {step === "profile-info" && (
          <ProfileInfoStep
            data={data}
            onChange={updateData}
            onComplete={handleProfileInfoComplete}
            submitting={submitting && data.intent !== "organization"}
          />
        )}

        {step === "org-claim" && (
          <OrgClaimStep
            data={data}
            onClaim={handleClaimComplete}
            onSkip={() => handleSubmit(null)}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}

function generateSlug(name: string, city: string, state: string): string {
  const parts = [name, city, state].filter(Boolean);
  const slug = parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`;
}

function buildMetadata(data: OnboardingData): Record<string, unknown> {
  if (data.intent === "family") {
    return {
      timeline: data.timeline || undefined,
      relationship_to_recipient: data.relationshipToRecipient || undefined,
    };
  }
  return {};
}

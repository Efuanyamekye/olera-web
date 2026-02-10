"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDeferredAction, clearDeferredAction } from "@/lib/deferred-action";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";

interface InquiryButtonProps {
  providerProfileId: string;
  providerName: string;
  providerSlug: string;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `family-${base}-${suffix}`;
}

export default function InquiryButton({
  providerProfileId,
  providerName,
  providerSlug,
}: InquiryButtonProps) {
  const { user, account, activeProfile, openAuth, refreshAccountData } =
    useAuth();
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [alreadySent, setAlreadySent] = useState(false);
  const [showCompleteProfileHint, setShowCompleteProfileHint] = useState(false);
  const autoInquiryTriggered = useRef(false);

  // Check if inquiry already exists
  useEffect(() => {
    if (!user || !activeProfile || !isSupabaseConfigured()) return;

    const checkExisting = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("connections")
        .select("id")
        .eq("from_profile_id", activeProfile.id)
        .eq("to_profile_id", providerProfileId)
        .eq("type", "inquiry")
        .single();

      if (data) setAlreadySent(true);
    };

    checkExisting();
  }, [user, activeProfile, providerProfileId]);

  /**
   * Ensure the user has a family profile to send inquiries from.
   * If they signed up through the inquiry flow (skipping onboarding),
   * auto-create a minimal family profile so the inquiry can proceed.
   */
  const ensureFamilyProfile = useCallback(
    async (
      supabase: ReturnType<typeof createClient>,
      userAccount: NonNullable<typeof account>
    ): Promise<string> => {
      // If active profile is already a family profile, use it
      if (activeProfile?.type === "family") return activeProfile.id;

      // Check if user already owns a family profile (even if not active)
      const { data: existingFamily } = await supabase
        .from("business_profiles")
        .select("id")
        .eq("account_id", userAccount.id)
        .eq("type", "family")
        .limit(1)
        .single();

      if (existingFamily) return existingFamily.id;

      // Create a minimal family profile (don't switch active profile away from provider)
      const displayName =
        userAccount.display_name || user?.email?.split("@")[0] || "Family";
      const slug = generateSlug(displayName);

      const { data: newProfile, error: profileError } = await supabase
        .from("business_profiles")
        .insert({
          account_id: userAccount.id,
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

      // Only set as active if user has no active profile yet
      if (!activeProfile) {
        const { error: updateError } = await supabase
          .from("accounts")
          .update({
            active_profile_id: newProfile.id,
            onboarding_completed: true,
          })
          .eq("id", userAccount.id);

        if (updateError) throw new Error(updateError.message);
        await refreshAccountData();
      }

      return newProfile.id;
    },
    [activeProfile, user, refreshAccountData]
  );

  const submitInquiry = useCallback(
    async (inquiryMessage: string) => {
      if (!account) {
        setError("Please sign in to send an inquiry.");
        return;
      }
      if (!isSupabaseConfigured()) return;

      setSubmitting(true);
      setError("");

      try {
        const supabase = createClient();

        // Ensure we have a profile to send from
        const fromProfileId = await ensureFamilyProfile(supabase, account);

        const { error: insertError } = await supabase
          .from("connections")
          .insert({
            from_profile_id: fromProfileId,
            to_profile_id: providerProfileId,
            type: "inquiry",
            status: "pending",
            message: inquiryMessage.trim() || null,
          });

        if (insertError) {
          // PostgreSQL unique violation error code
          if (
            insertError.code === "23505" ||
            insertError.message.includes("duplicate") ||
            insertError.message.includes("unique")
          ) {
            setAlreadySent(true);
            setShowModal(false);
            return;
          }
          throw new Error(insertError.message);
        }

        setSuccess(true);
        setAlreadySent(true);

        // If user's family profile was just auto-created (no care_types),
        // prompt them to complete it after the success message
        const needsCompletion =
          activeProfile?.type !== "family" ||
          (activeProfile?.care_types?.length ?? 0) === 0;

        setTimeout(() => {
          setShowModal(false);
          setSuccess(false);
          setMessage("");
          if (needsCompletion) {
            setShowCompleteProfileHint(true);
          }
        }, 2000);
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? (err as { message: string }).message
            : String(err);
        console.error("Inquiry error:", msg);
        setError(`Something went wrong: ${msg}`);
      } finally {
        setSubmitting(false);
      }
    },
    [account, ensureFamilyProfile, providerProfileId]
  );

  // Auto-open inquiry modal after returning from auth
  // Only requires user + account (not activeProfile — we'll create one on submit)
  useEffect(() => {
    if (autoInquiryTriggered.current) return;
    if (!user || !account) return;

    const deferred = getDeferredAction();
    if (
      deferred?.action === "inquiry" &&
      deferred?.targetProfileId === providerProfileId
    ) {
      autoInquiryTriggered.current = true;
      clearDeferredAction();
      setShowModal(true);
    }
  }, [user, account, providerProfileId]);

  const handleClick = () => {
    if (!user) {
      openAuth({
        deferred: {
          action: "inquiry",
          targetProfileId: providerProfileId,
          returnUrl: `/provider/${providerSlug}`,
        },
        defaultMode: "sign-up",
      });
      return;
    }

    if (alreadySent) return;
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitInquiry(message);
  };

  return (
    <>
      <Button
        fullWidth
        size="lg"
        onClick={handleClick}
        disabled={alreadySent}
      >
        {alreadySent
          ? "Inquiry Sent"
          : user
          ? "Request Consultation"
          : "Sign Up to Request Consultation"}
      </Button>

      {showCompleteProfileHint && (
        <div className="mt-3 bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm">
          <p className="text-primary-800 font-medium mb-1">
            Your inquiry has been sent!
          </p>
          <p className="text-primary-700">
            Complete your profile so providers can learn more about your care
            needs.{" "}
            <a
              href="/portal/profile"
              className="underline font-medium hover:text-primary-900"
            >
              Complete profile
            </a>
          </p>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => {
          if (!submitting) {
            setShowModal(false);
            setError("");
          }
        }}
        title={success ? "Inquiry Sent" : `Contact ${providerName}`}
        size="md"
      >
        {success ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-lg text-gray-900 mb-1">
              Your profile has been shared!
            </p>
            <p className="text-base text-gray-600">
              {providerName} can now see your profile and respond to you.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-base text-gray-600">
              Share your profile with {providerName} to start a conversation.
              They&#39;ll see your care needs and can reach out to you directly.
            </p>

            <Input
              as="textarea"
              label="Add a note (optional)"
              name="message"
              value={message}
              onChange={(e) =>
                setMessage((e.target as HTMLTextAreaElement).value)
              }
              placeholder="Anything specific you'd like to mention..."
              rows={3}
            />

            {error && (
              <div
                className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-base"
                role="alert"
              >
                {error}
              </div>
            )}

            <Button type="submit" fullWidth loading={submitting}>
              Share Profile
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}

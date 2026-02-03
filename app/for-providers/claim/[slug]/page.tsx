"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDeferredAction, clearDeferredAction } from "@/lib/deferred-action";
import type { Profile, OrganizationMetadata } from "@/lib/types";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export default function ClaimProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, account, openAuthModal, refreshAccountData } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const autoClaimTriggered = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured() || !slug) return;

    const fetchProfile = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("slug", slug)
        .single<Profile>();

      if (fetchError || !data) {
        setError("Profile not found.");
      } else if (data.claim_state !== "unclaimed") {
        setError("This profile has already been claimed.");
      } else {
        setProfile(data);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [slug]);

  const executeClaim = useCallback(async (claimProfile: Profile, claimAccount: typeof account) => {
    if (!claimAccount) return;

    setClaiming(true);
    setError("");

    try {
      const supabase = createClient();

      // Claim the profile: set account_id and claim_state
      const { error: claimError } = await supabase
        .from("profiles")
        .update({
          account_id: claimAccount.id,
          claim_state: "claimed",
          source: "user_created",
        })
        .eq("id", claimProfile.id)
        .eq("claim_state", "unclaimed");

      if (claimError) {
        throw new Error(claimError.message);
      }

      // Set as active profile on account
      const { error: accountError } = await supabase
        .from("accounts")
        .update({
          active_profile_id: claimProfile.id,
          onboarding_completed: true,
        })
        .eq("id", claimAccount.id);

      if (accountError) {
        throw new Error(accountError.message);
      }

      // Create free membership if none exists
      const { data: existingMembership } = await supabase
        .from("memberships")
        .select("id")
        .eq("account_id", claimAccount.id)
        .single();

      if (!existingMembership) {
        await supabase.from("memberships").insert({
          account_id: claimAccount.id,
          plan: "free",
          status: "free",
        });
      }

      await refreshAccountData();
      router.push("/portal");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : String(err);
      console.error("Claim error:", message);
      setError(`Failed to claim profile: ${message}`);
      setClaiming(false);
    }
  }, [refreshAccountData, router]);

  const handleClaim = () => {
    if (!user) {
      openAuthModal({
        action: "claim",
        targetProfileId: profile?.id,
        returnUrl: `/for-providers/claim/${slug}`,
      }, "sign-up");
      return;
    }

    if (profile && account) {
      executeClaim(profile, account);
    }
  };

  // Auto-claim: if user returns from auth with a deferred claim action,
  // trigger the claim automatically instead of making them click again
  useEffect(() => {
    if (autoClaimTriggered.current) return;
    if (!user || !account || !profile || loading) return;

    const deferred = getDeferredAction();
    if (deferred?.action === "claim" && deferred?.targetProfileId === profile.id) {
      autoClaimTriggered.current = true;
      clearDeferredAction();
      executeClaim(profile, account);
    }
  }, [user, account, profile, loading, executeClaim]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading profile...</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
        <Link
          href="/for-providers/claim"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Back to search
        </Link>
      </div>
    );
  }

  if (!profile) return null;

  const meta = profile.metadata as OrganizationMetadata;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
      <Link
        href="/for-providers/claim"
        className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mb-8"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to search
      </Link>

      {/* Profile preview card */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
        {profile.image_url && (
          <div className="h-48 bg-gray-200">
            <img
              src={profile.image_url}
              alt={profile.display_name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {profile.display_name}
            </h1>
            <Badge variant="unclaimed">Unclaimed</Badge>
          </div>

          {(profile.city || profile.state) && (
            <p className="text-lg text-gray-600 mb-2">
              {[profile.address, profile.city, profile.state]
                .filter(Boolean)
                .join(", ")}
              {profile.zip && ` ${profile.zip}`}
            </p>
          )}

          {profile.description && (
            <p className="text-gray-600 mb-4">{profile.description}</p>
          )}

          {profile.care_types && profile.care_types.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {profile.care_types.map((ct) => (
                <span
                  key={ct}
                  className="bg-primary-50 text-primary-700 text-sm px-3 py-1 rounded-full"
                >
                  {ct}
                </span>
              ))}
            </div>
          )}

          {meta?.price_range && (
            <p className="text-gray-600">
              <span className="font-medium">Estimated pricing:</span>{" "}
              {meta.price_range}
            </p>
          )}
        </div>
      </div>

      {/* Claim CTA */}
      <div className="mt-8 bg-primary-50 rounded-2xl p-6 md:p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Is this your organization?
        </h2>
        <p className="text-gray-600 mb-6">
          Claim this profile to take control of your listing. You&apos;ll be
          able to update your information, respond to inquiries from families,
          and start connecting right away.
        </p>

        {error && (
          <div className="mb-4 bg-warm-50 text-warm-700 px-4 py-3 rounded-lg text-base" role="alert">
            {error}
          </div>
        )}

        <Button size="lg" fullWidth loading={claiming} onClick={handleClaim}>
          {user ? "Claim This Profile" : "Create Account to Claim"}
        </Button>

        {!user && (
          <p className="mt-3 text-sm text-gray-500 text-center">
            You&apos;ll need to create an account or sign in to claim this profile.
          </p>
        )}
      </div>
    </div>
  );
}

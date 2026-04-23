"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { canEngage } from "@/lib/membership";
import type { Profile, FamilyMetadata } from "@/lib/types";
import { useProviderVerification } from "@/lib/hooks/useProviderVerification";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import UpgradePrompt from "@/components/providers/UpgradePrompt";
import ConnectButton from "@/components/shared/ConnectButton";
import EmptyState from "@/components/ui/EmptyState";

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  within_1_month: "Within 1 month",
  within_3_months: "Within 3 months",
  exploring: "Just exploring",
};

export default function DiscoverFamiliesPage() {
  const { activeProfile, membership, refreshAccountData } = useAuth();
  const [families, setFamilies] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const isProvider =
    activeProfile?.type === "organization" ||
    activeProfile?.type === "caregiver";

  // Verification state
  const { isVerified, profileId: providerProfileId } = useProviderVerification();
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModalRaw,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: providerProfileId || "",
    onVerified: async () => {
      await refreshAccountData();
    },
  });

  // Guard: only allow opening modal if profile is loaded
  const openVerificationModal = useCallback(() => {
    if (!providerProfileId) return;
    openVerificationModalRaw();
  }, [providerProfileId, openVerificationModalRaw]);

  // Full access requires membership access (everyone is verified via email)
  const hasFullAccess = canEngage(
    activeProfile?.type,
    membership,
    "view_inquiry_details"
  );

  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!profileId || !isProvider || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const fetchFamilies = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("business_profiles")
          .select("id, display_name, city, state, type, care_types, metadata, image_url, slug")
          .eq("type", "family")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) console.error("[olera] discover families error:", error.message);
        setFamilies((data as Profile[]) || []);
      } catch (err) {
        console.error("[olera] discover families failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFamilies();
  }, [profileId, isProvider]);

  if (!isProvider) {
    return (
      <div className="px-8 py-6">
        <EmptyState
          title="Provider access required"
          description="Switch to an organization or caregiver profile to browse families."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-8 py-6">
        <div className="text-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-500">Loading families...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Families Looking for Care
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Connect with families in your area who are looking for care services.
        </p>
      </div>

      {/* Membership upgrade prompt - show if no membership access */}
      {!hasFullAccess && (
        <div className="mb-8">
          <UpgradePrompt context="browse family profiles and initiate contact" />
        </div>
      )}

      {families.length === 0 ? (
        <EmptyState
          title="No families found"
          description="Families who sign up will appear here."
        />
      ) : (
        <>
          <p className="text-base text-gray-500 mb-6">
            {families.length} famil{families.length !== 1 ? "ies" : "y"} found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {families.map((family) => (
              <FamilyCard
                key={family.id}
                family={family}
                hasFullAccess={hasFullAccess}
                fromProfileId={activeProfile?.id}
                isVerified={isVerified}
                onVerifyClick={openVerificationModal}
              />
            ))}
          </div>
        </>
      )}
      {/* Verification Modal */}
      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={activeProfile?.display_name || "your business"}
      />
    </div>
    </div>
  );
}

function FamilyCard({
  family,
  hasFullAccess,
  fromProfileId,
  isVerified,
  onVerifyClick,
}: {
  family: Profile;
  hasFullAccess: boolean;
  fromProfileId?: string;
  isVerified: boolean;
  onVerifyClick: () => void;
}) {
  const meta = family.metadata as FamilyMetadata;
  const locationStr = [family.city, family.state].filter(Boolean).join(", ");
  const timeline = meta?.timeline
    ? TIMELINE_LABELS[meta.timeline] || meta.timeline
    : null;
  const careNeeds = meta?.care_needs || family.care_types || [];

  const cardBody = (
    <>
      <div className="flex items-center gap-3 mb-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-secondary-100 text-secondary-700">
          {family.display_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {family.display_name}
          </h3>
          {locationStr && (
            <p className="text-sm text-gray-500">{locationStr}</p>
          )}
        </div>
      </div>

      {timeline && (
        <p className="text-base text-gray-600 mb-2">
          <span className="font-medium">Timeline:</span> {timeline}
        </p>
      )}

      {careNeeds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {careNeeds.map((need) => (
            <span
              key={need}
              className="bg-secondary-50 text-secondary-700 text-xs px-2.5 py-1 rounded-full"
            >
              {need}
            </span>
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors duration-200">
        {/* Card content - not clickable since no profile page exists */}
        <div className="p-6">
          {cardBody}
        </div>

        {/* Contact button area */}
        {fromProfileId && (
          <div className="px-6 pb-6 -mt-2">
            {!isVerified ? (
              // Not verified - show verify button
              <button
                type="button"
                onClick={onVerifyClick}
                className="w-full py-2.5 text-sm font-medium text-center text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
              >
                Verify to connect
              </button>
            ) : hasFullAccess ? (
              <ConnectButton
                fromProfileId={fromProfileId}
                toProfileId={family.id}
                toName={family.display_name}
                connectionType="inquiry"
                label="Initiate Contact"
                sentLabel="Contact Sent"
                fullWidth
              />
            ) : (
              // Verified but no membership - link to upgrade page
              <Link
                href="/provider/pro"
                className="block w-full py-2.5 text-sm font-medium text-center text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
              >
                Upgrade to contact
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}

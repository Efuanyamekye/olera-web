"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { canEngage } from "@/lib/membership";
import type { Profile, CaregiverMetadata } from "@/lib/types";
import UpgradePrompt from "@/components/providers/UpgradePrompt";
import ConnectButton from "@/components/shared/ConnectButton";
import EmptyState from "@/components/ui/EmptyState";

export default function DiscoverCaregiversPage() {
  const { activeProfile, membership } = useAuth();
  const [caregivers, setCaregivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const isOrg = activeProfile?.type === "organization";
  const hasAccess = canEngage(
    activeProfile?.type,
    membership,
    "view_inquiry_details"
  );

  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!profileId || !isOrg || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const fetchCaregivers = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("business_profiles")
          .select("id, display_name, city, state, type, care_types, metadata, image_url, slug")
          .eq("type", "caregiver")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) console.error("[olera] discover caregivers error:", error.message);
        setCaregivers((data as Profile[]) || []);
      } catch (err) {
        console.error("[olera] discover caregivers failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCaregivers();
  }, [profileId, isOrg]);

  if (!isOrg) {
    return (
      <EmptyState
        title="Organization access required"
        description="Switch to an organization profile to browse caregivers."
      />
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading caregivers...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Browse Caregivers</h1>
        <p className="text-lg text-gray-600 mt-1">
          Find experienced caregivers to join your team.
        </p>
      </div>

      {!hasAccess && (
        <div className="mb-8">
          <UpgradePrompt context="browse caregiver profiles and send invitations" />
        </div>
      )}

      {caregivers.length === 0 ? (
        <EmptyState
          title="No caregivers found"
          description="Caregivers who sign up will appear here."
        />
      ) : (
        <>
          <p className="text-base text-gray-500 mb-6">
            {caregivers.length} caregiver{caregivers.length !== 1 ? "s" : ""}{" "}
            found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {caregivers.map((caregiver) => (
              <CaregiverCard
                key={caregiver.id}
                caregiver={caregiver}
                hasAccess={hasAccess}
                fromProfileId={activeProfile?.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CaregiverCard({
  caregiver,
  hasAccess,
  fromProfileId,
}: {
  caregiver: Profile;
  hasAccess: boolean;
  fromProfileId?: string;
}) {
  const meta = caregiver.metadata as CaregiverMetadata;
  const locationStr = [caregiver.city, caregiver.state]
    .filter(Boolean)
    .join(", ");
  const rateStr =
    meta?.hourly_rate_min && meta?.hourly_rate_max
      ? `$${meta.hourly_rate_min}-${meta.hourly_rate_max}/hr`
      : null;
  const certifications = meta?.certifications || [];
  const experience = meta?.years_experience;

  const cardBody = (
    <>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-secondary-100 text-secondary-700 rounded-full flex items-center justify-center text-sm font-semibold">
          {hasAccess ? caregiver.display_name.charAt(0).toUpperCase() : "?"}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {hasAccess
              ? caregiver.display_name
              : blurName(caregiver.display_name)}
          </h3>
          {locationStr && (
            <p className="text-sm text-gray-500">
              {hasAccess ? locationStr : "***"}
            </p>
          )}
        </div>
      </div>

      {experience && (
        <p className="text-base text-gray-600 mb-2">
          <span className="font-medium">{experience} years</span> experience
        </p>
      )}

      {rateStr && (
        <p className="text-base text-gray-600 mb-2">
          <span className="font-medium">Rate:</span> {rateStr}
        </p>
      )}

      {certifications.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {certifications.slice(0, 3).map((cert) => (
            <span
              key={cert}
              className="bg-secondary-50 text-secondary-700 text-xs px-2.5 py-1 rounded-full"
            >
              {cert}
            </span>
          ))}
          {certifications.length > 3 && (
            <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full">
              +{certifications.length - 3} more
            </span>
          )}
        </div>
      )}

      {caregiver.care_types.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {caregiver.care_types.slice(0, 2).map((type) => (
            <span
              key={type}
              className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full"
            >
              {type}
            </span>
          ))}
        </div>
      )}

      {!hasAccess && (
        <p className="text-sm text-warm-600 font-medium mt-3">
          Upgrade to Pro to view full details and invite.
        </p>
      )}

      {hasAccess && (
        <p className="mt-3 text-primary-600 font-medium text-sm">
          View profile &rarr;
        </p>
      )}
    </>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-primary-200 transition-shadow duration-200 cursor-pointer">
      {hasAccess && caregiver.slug ? (
        <Link
          href={`/provider/${caregiver.slug}`}
          target="_blank"
          className="block p-6"
        >
          {cardBody}
        </Link>
      ) : (
        <div className="p-6">{cardBody}</div>
      )}

      {hasAccess && fromProfileId && (
        <div className="px-6 pb-6 -mt-2">
          <ConnectButton
            fromProfileId={fromProfileId}
            toProfileId={caregiver.id}
            toName={caregiver.display_name}
            connectionType="invitation"
            label="Invite to Apply"
            sentLabel="Invitation Sent"
          />
        </div>
      )}
    </div>
  );
}

function blurName(name: string): string {
  if (!name) return "***";
  return name.charAt(0) + "***";
}

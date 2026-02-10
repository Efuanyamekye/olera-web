"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { canEngage } from "@/lib/membership";
import type { Profile, OrganizationMetadata } from "@/lib/types";
import ConnectButton from "@/components/shared/ConnectButton";
import UpgradePrompt from "@/components/providers/UpgradePrompt";
import EmptyState from "@/components/ui/EmptyState";

export default function DiscoverProvidersPage() {
  const { activeProfile, membership } = useAuth();
  const [orgs, setOrgs] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const isCaregiver = activeProfile?.type === "caregiver";
  const hasAccess = canEngage(
    activeProfile?.type,
    membership,
    "initiate_contact"
  );

  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!profileId || !isCaregiver || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const fetchOrgs = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("business_profiles")
          .select("id, display_name, city, state, type, care_types, metadata, image_url, slug")
          .eq("type", "organization")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) console.error("[olera] discover providers error:", error.message);
        setOrgs((data as Profile[]) || []);
      } catch (err) {
        console.error("[olera] discover providers failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrgs();
  }, [profileId, isCaregiver]);

  if (!isCaregiver) {
    return (
      <EmptyState
        title="Caregiver access required"
        description="Switch to a caregiver profile to browse job opportunities."
      />
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading organizations...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Find Job Opportunities
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Browse agencies, facilities, and organizations looking for caregivers.
        </p>
      </div>

      {!hasAccess && (
        <div className="mb-8">
          <UpgradePrompt context="apply to organizations and share your profile" />
        </div>
      )}

      {orgs.length === 0 ? (
        <EmptyState
          title="No organizations found"
          description="Organizations who sign up will appear here."
        />
      ) : (
        <>
          <p className="text-base text-gray-500 mb-6">
            {orgs.length} organization{orgs.length !== 1 ? "s" : ""} found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {orgs.map((org) => (
              <OrgJobCard
                key={org.id}
                org={org}
                fromProfileId={activeProfile?.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrgJobCard({
  org,
  fromProfileId,
}: {
  org: Profile;
  fromProfileId?: string;
}) {
  const meta = org.metadata as OrganizationMetadata;
  const locationStr = [org.city, org.state].filter(Boolean).join(", ");

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-primary-200 transition-shadow duration-200 cursor-pointer">
      <Link href={`/provider/${org.slug}`} target="_blank" className="block">
        <div className="relative h-36 bg-gray-200">
          {org.image_url ? (
            <img
              src={org.image_url}
              alt={org.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-300 flex items-center justify-center">
              <span className="text-3xl font-bold text-primary-600/40">
                {org.display_name.charAt(0)}
              </span>
            </div>
          )}
        </div>

        <div className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {org.display_name}
          </h3>
          {locationStr && (
            <p className="text-sm text-gray-500 mb-2">{locationStr}</p>
          )}
          {org.care_types.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {org.care_types.slice(0, 2).map((type) => (
                <span
                  key={type}
                  className="bg-primary-50 text-primary-700 text-xs px-2.5 py-1 rounded-full"
                >
                  {type}
                </span>
              ))}
              {org.care_types.length > 2 && (
                <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full">
                  +{org.care_types.length - 2} more
                </span>
              )}
            </div>
          )}
          {meta?.staff_count && (
            <p className="text-sm text-gray-500 mb-3">
              {meta.staff_count} staff members
            </p>
          )}
          <p className="text-primary-600 font-medium text-sm">
            View provider &rarr;
          </p>
        </div>
      </Link>

      {fromProfileId && (
        <div className="px-5 pb-5 -mt-2">
          <ConnectButton
            fromProfileId={fromProfileId}
            toProfileId={org.id}
            toName={org.display_name}
            connectionType="application"
            label="Apply"
            sentLabel="Applied"
            fullWidth
          />
        </div>
      )}
    </div>
  );
}

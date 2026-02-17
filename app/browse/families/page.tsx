"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { canEngage } from "@/lib/membership";
import type { Profile, FamilyMetadata } from "@/lib/types";
import UpgradePrompt from "@/components/providers/UpgradePrompt";
import ConnectButton from "@/components/shared/ConnectButton";

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  within_1_month: "Within 1 month",
  within_3_months: "Within 3 months",
  exploring: "Just exploring",
};

export default function BrowseFamiliesPage() {
  const { user, activeProfile, membership } = useAuth();
  const [families, setFamilies] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const isProvider =
    activeProfile?.type === "organization" ||
    activeProfile?.type === "caregiver";
  const hasAccess = canEngage(
    activeProfile?.type,
    membership,
    "view_inquiry_details"
  );

  const userId = user?.id;

  useEffect(() => {
    if (!userId || !isProvider || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const fetchFamilies = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("business_profiles")
          .select("id, display_name, city, state, type, care_types, metadata, image_url, slug")
          .eq("type", "family")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(50);

        setFamilies((data as Profile[]) || []);
      } catch (err) {
        console.error("[olera] browse families failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFamilies();
  }, [userId, isProvider]);

  // Non-provider guard
  if (!isProvider) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Provider access required
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          This page is only available to care providers.
        </p>
        <Link href="/browse" className="text-primary-600 hover:text-primary-700 font-medium">
          Browse care providers instead
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading families...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            Families Looking for Care
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Connect with families in your area who are looking for care services.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Paywall for non-pro providers */}
        {!hasAccess && (
          <div className="mb-8">
            <UpgradePrompt context="browse family profiles and initiate contact" />
          </div>
        )}

        {families.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No families found
            </h2>
            <p className="text-lg text-gray-600">
              Families who sign up will appear here.
            </p>
          </div>
        ) : (
          <>
            <p className="text-base text-gray-500 mb-6">
              {families.length} famil{families.length !== 1 ? "ies" : "y"} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {families.map((family) => (
                <FamilyCard
                  key={family.id}
                  family={family}
                  hasAccess={hasAccess}
                  fromProfileId={activeProfile?.id}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FamilyCard({
  family,
  hasAccess,
  fromProfileId,
}: {
  family: Profile;
  hasAccess: boolean;
  fromProfileId?: string;
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
        <div className="w-10 h-10 bg-secondary-100 text-secondary-700 rounded-full flex items-center justify-center text-sm font-semibold">
          {hasAccess
            ? family.display_name.charAt(0).toUpperCase()
            : "?"}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {hasAccess ? family.display_name : blurName(family.display_name)}
          </h3>
          {locationStr && (
            <p className="text-sm text-gray-500">
              {hasAccess ? locationStr : "***"}
            </p>
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

      {!hasAccess && (
        <p className="text-sm text-warm-600 font-medium mt-3">
          Upgrade to Pro to view full details and reach out.
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
      {hasAccess ? (
        <Link href={`/profile/${family.id}`} target="_blank" className="block p-6">
          {cardBody}
        </Link>
      ) : (
        <div className="p-6">{cardBody}</div>
      )}

      {hasAccess && fromProfileId && (
        <div className="px-6 pb-6 -mt-2">
          <ConnectButton
            fromProfileId={fromProfileId}
            toProfileId={family.id}
            toName={family.display_name}
            connectionType="inquiry"
            label="Initiate Contact"
            sentLabel="Contact Sent"
            fullWidth
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

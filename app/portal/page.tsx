"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getFreeConnectionsRemaining, FREE_CONNECTION_LIMIT } from "@/lib/membership";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import UpgradePrompt from "@/components/providers/UpgradePrompt";

export default function PortalDashboard() {
  const { activeProfile, membership } = useAuth();
  const [inquiryCount, setInquiryCount] = useState<number | null>(null);

  const isProvider =
    activeProfile?.type === "organization" ||
    activeProfile?.type === "caregiver";
  const isFamily = activeProfile?.type === "family";

  // Fetch real connection counts
  useEffect(() => {
    if (!activeProfile || !isSupabaseConfigured()) return;

    const fetchCounts = async () => {
      const supabase = createClient();
      const column = isProvider ? "to_profile_id" : "from_profile_id";
      const { count } = await supabase
        .from("connections")
        .select("*", { count: "exact", head: true })
        .eq(column, activeProfile.id)
        .eq("type", "inquiry");

      setInquiryCount(count ?? 0);
    };

    fetchCounts();
  }, [activeProfile, isProvider]);

  if (!activeProfile) {
    return (
      <EmptyState
        title="No profile found"
        description="Complete onboarding to set up your profile."
        action={<Link href="/onboarding"><Button>Complete setup</Button></Link>}
      />
    );
  }

  const freeRemaining = getFreeConnectionsRemaining(membership);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-lg text-gray-600 mt-1">
          Welcome back, {activeProfile.display_name}.
        </p>
      </div>

      {/* Free connections banner for providers */}
      {isProvider && freeRemaining !== null && freeRemaining > 0 && (
        <div className="mb-8 bg-primary-50 border border-primary-200 rounded-xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-semibold text-primary-800 mb-1">
                {freeRemaining} of {FREE_CONNECTION_LIMIT} free connections remaining
              </h2>
              <p className="text-base text-primary-700">
                Upgrade to Pro for unlimited connections.
              </p>
            </div>
            <Link
              href="/portal/settings"
              className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-5 rounded-lg transition-colors text-sm"
            >
              Upgrade
            </Link>
          </div>
        </div>
      )}

      {/* Paywall banner — out of free connections */}
      {isProvider && freeRemaining !== null && freeRemaining === 0 && (
        <div className="mb-8">
          <UpgradePrompt context="continue connecting with families and providers" />
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Profile views"
          value="—"
          description="Coming soon"
        />
        {isProvider && (
          <>
            <Link href="/portal/connections" className="block">
              <StatCard
                label="Inquiries received"
                value={inquiryCount !== null ? String(inquiryCount) : "—"}
                description={
                  inquiryCount === 0
                    ? "No inquiries yet"
                    : "Click to view"
                }
              />
            </Link>
            <StatCard
              label="Response rate"
              value="—"
              description="Start responding to build your rate"
            />
          </>
        )}
        {isFamily && (
          <>
            <Link href="/portal/connections" className="block">
              <StatCard
                label="Inquiries sent"
                value={inquiryCount !== null ? String(inquiryCount) : "—"}
                description={
                  inquiryCount === 0
                    ? "Request a consultation to get started"
                    : "Click to view"
                }
              />
            </Link>
            <StatCard
              label="Saved providers"
              value="0"
              description="Save providers while you browse"
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Get started
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <QuickAction
            title="Complete your profile"
            description="Add more details to help families find you."
            href="/portal/profile"
            show={isProvider}
          />
          <QuickAction
            title="Browse providers"
            description="Find and compare care options near you."
            href="/browse"
            show={isFamily}
          />
          <QuickAction
            title="View connections"
            description={
              isProvider
                ? "See inquiries from families."
                : "See your sent inquiries."
            }
            href="/portal/connections"
            show={true}
          />
          <QuickAction
            title="View your public profile"
            description="See how your profile appears to families."
            href={`/provider/${activeProfile.slug}`}
            show={isProvider}
          />

          {/* Role-specific discovery actions */}
          <QuickAction
            title="Browse families"
            description="Find families looking for care in your area."
            href="/browse/families"
            show={isProvider}
          />
          <QuickAction
            title="Browse caregivers"
            description="Find experienced caregivers to join your team."
            href="/browse/caregivers"
            show={activeProfile.type === "organization"}
          />
          <QuickAction
            title="Find job opportunities"
            description="Browse organizations looking for caregivers."
            href="/browse/providers"
            show={activeProfile.type === "caregiver"}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-primary-200 transition-colors">
      <p className="text-base text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-base text-gray-500">{description}</p>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
  show,
}: {
  title: string;
  description: string;
  href: string;
  show: boolean;
}) {
  if (!show) return null;

  return (
    <Link
      href={href}
      className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all group"
    >
      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-700 mb-1">
        {title}
      </h3>
      <p className="text-base text-gray-600">{description}</p>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getFreeConnectionsRemaining, FREE_CONNECTION_LIMIT, isProfileShareable } from "@/lib/membership";
import UpgradePrompt from "@/components/providers/UpgradePrompt";

export default function PortalDashboard() {
  const { activeProfile, membership } = useAuth();
  const [inquiryCount, setInquiryCount] = useState<number | null>(null);

  // activeProfile is guaranteed by the portal layout guard
  if (!activeProfile) return null;

  const isProvider =
    activeProfile.type === "organization" ||
    activeProfile.type === "caregiver";
  const isFamily = activeProfile.type === "family";

  // Fetch real connection counts
  useEffect(() => {
    if (!activeProfile || !isSupabaseConfigured()) return;

    const fetchCounts = async () => {
      try {
        console.time("[olera] dashboard: inquiry count");
        const supabase = createClient();
        const column = isProvider ? "to_profile_id" : "from_profile_id";
        const { count, error } = await supabase
          .from("connections")
          .select("*", { count: "exact", head: true })
          .eq(column, activeProfile.id)
          .eq("type", "inquiry");
        console.timeEnd("[olera] dashboard: inquiry count");

        if (error) {
          console.error("[olera] dashboard count error:", error.message);
          return;
        }
        setInquiryCount(count ?? 0);
      } catch (err) {
        console.error("[olera] dashboard fetchCounts failed:", err);
      }
    };

    fetchCounts();
  }, [activeProfile, isProvider]);

  const freeRemaining = getFreeConnectionsRemaining(membership);

  return (
    <div>
      {/* Pending review banner */}
      {activeProfile.claim_state === "pending" && (
        <div className="mb-8 bg-warm-50 border border-warm-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-warm-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-warm-800 mb-1">
                Profile under review
              </h2>
              <p className="text-base text-warm-700">
                Your profile is being reviewed by our team. You&apos;ll have full access once approved. In the meantime, you can complete your profile details.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rejected banner */}
      {activeProfile.claim_state === "rejected" && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-red-800 mb-1">
                Profile not approved
              </h2>
              <p className="text-base text-red-700">
                Your profile was not approved. Please contact support for more information.
              </p>
            </div>
          </div>
        </div>
      )}

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
        <Link href="/portal/profile" className="block">
          <StatCard
            label="Profile status"
            value={isProfileShareable(activeProfile) ? "Complete" : "Incomplete"}
            description={
              isProfileShareable(activeProfile)
                ? "Your profile is ready to share"
                : "Finish setting up your profile"
            }
          />
        </Link>
        {isProvider && (
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
            <Link href="/browse" className="block">
              <StatCard
                label="Browse providers"
                value="Explore"
                description="Find and compare care options"
              />
            </Link>
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
            title="Browse private caregivers"
            description="Find experienced private caregivers to join your team."
            href="/browse/caregivers"
            show={activeProfile.type === "organization"}
          />
          <QuickAction
            title="Find job opportunities"
            description="Browse organizations looking for private caregivers."
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

"use client";

/**
 * ProviderDrawer - Detail panel for provider growth tracking
 *
 * Redesigned to match the Provider Outreach drawer UX:
 * - Call script at top for new_claim providers
 * - Read-only contact section (provider owns their data)
 * - Sticky action footer
 * - Clean section organization
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DrawerShell } from "@/components/admin/medjobs/DrawerShell";
import type { ProviderGrowthWithProfile } from "@/lib/provider-growth/queries";
import {
  ADS_STATUS_LABELS,
  MEDJOBS_STATUS_LABELS,
  INTEREST_LEVEL_LABELS,
  type AdsStatus,
  type MedjobsStatus,
} from "@/lib/provider-growth/stages";
import { MeetingScheduler } from "./MeetingScheduler";
import { ActivityLog } from "./ActivityLog";

interface ProviderDrawerProps {
  provider: ProviderGrowthWithProfile;
  onClose: () => void;
  onUpdate: () => void;
  onCallLogged?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Components
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
      {children}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-gray-100 my-5" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Script Section
// ─────────────────────────────────────────────────────────────────────────────

function CallScriptSection({ provider }: { provider: ProviderGrowthWithProfile }) {
  const claimDate = provider.claimed_at
    ? formatClaimDateForScript(provider.claimed_at)
    : "recently";

  return (
    <div className="mb-4 px-3 py-2.5 bg-gray-50 rounded-lg">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
        Script
      </div>
      <p className="text-[12px] leading-relaxed text-gray-600">
        &quot;Hi, this is <span className="text-gray-800">[your name]</span> from Olera.
        You claimed your profile <span className="text-gray-800">{claimDate}</span>.
        I&apos;m calling to check in on how things are going and see if I can help you
        get the most out of your page — like optimizing your profile to connect with
        more families looking for{" "}
        <span className="text-gray-800">
          {provider.care_types?.[0] || "care services"}
        </span>
        .&quot;
      </p>
    </div>
  );
}

function formatClaimDateForScript(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "recently";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "about a week ago";
  if (diffDays < 21) return "about two weeks ago";
  if (diffDays < 30) return "a few weeks ago";

  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact Section (Read-only - provider owns their data)
// ─────────────────────────────────────────────────────────────────────────────

function ContactSection({ provider }: { provider: ProviderGrowthWithProfile }) {
  const hasContact = provider.phone || provider.email;

  if (!hasContact) return null;

  return (
    <div>
      <SectionHeader>Contact</SectionHeader>
      <div className="space-y-2">
        {provider.phone && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Phone</span>
            <a
              href={`tel:${provider.phone}`}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              {formatPhone(provider.phone)}
            </a>
          </div>
        )}
        {provider.email && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Email</span>
            <span className="text-sm text-gray-900">{provider.email}</span>
          </div>
        )}
        {provider.website && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Website</span>
            <a
              href={provider.website.startsWith("http") ? provider.website : `https://${provider.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[200px]"
            >
              {provider.website.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

// ─────────────────────────────────────────────────────────────────────────────
// Meeting Info Section (when meeting is scheduled)
// ─────────────────────────────────────────────────────────────────────────────

function MeetingInfoSection({
  provider,
}: {
  provider: ProviderGrowthWithProfile;
}) {
  const isUpgradeMeeting = provider.pipeline_stage === "upgrade_meeting";
  const isMeetingScheduled = provider.pipeline_stage === "meeting_scheduled";

  if ((!isMeetingScheduled && !isUpgradeMeeting) || !provider.meeting_scheduled_at) {
    return null;
  }

  const meetingDate = new Date(provider.meeting_scheduled_at);
  const isPast = meetingDate < new Date();
  const formattedDate = meetingDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = meetingDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  // Different styling for upgrade meetings
  const bgColor = isUpgradeMeeting ? "bg-amber-50" : "bg-primary-50";
  const borderColor = isUpgradeMeeting ? "border-amber-100" : "border-primary-100";
  const textColor = isUpgradeMeeting ? "text-amber-600" : "text-primary-600";
  const linkColor = isUpgradeMeeting ? "text-amber-600 hover:text-amber-700" : "text-primary-600 hover:text-primary-700";

  const label = isUpgradeMeeting
    ? isPast ? "Upgrade Meeting Was Scheduled" : "Upgrade Meeting Scheduled"
    : isPast ? "Meeting Was Scheduled" : "Meeting Scheduled";

  return (
    <div className={`p-4 ${bgColor} border ${borderColor} rounded-lg`}>
      <div>
        <div className={`text-[10px] font-semibold ${textColor} uppercase tracking-wide mb-1`}>
          {label}
        </div>
        <div className="text-sm font-medium text-gray-900">{formattedDate}</div>
        <div className="text-sm text-gray-600">{formattedTime}</div>
        {isPast && (
          <p className="mt-2 text-xs text-gray-500">
            Use the Activity Log below to record the outcome.
          </p>
        )}
      </div>
      {provider.calendly_event_id && (
        <a
          href={`https://calendly.com/app/scheduled_events/${provider.calendly_event_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 mt-2 text-xs ${linkColor} hover:underline`}
        >
          View in Calendly
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions Section (sticky footer)
// ─────────────────────────────────────────────────────────────────────────────

function ActionsSection({
  provider,
  onScheduleMeeting,
  onLogUpgradeOutcome,
}: {
  provider: ProviderGrowthWithProfile;
  onScheduleMeeting: () => void;
  onLogUpgradeOutcome: () => void;
}) {
  return (
    <div className="space-y-3">
      <SectionHeader>Actions</SectionHeader>
      <div className="flex flex-wrap gap-2">
        {provider.pipeline_stage === "new_claim" && (
          <button
            onClick={onScheduleMeeting}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Schedule Meeting
          </button>
        )}
        {provider.pipeline_stage === "meeting_scheduled" && (
          <p className="text-sm text-gray-500 py-1">
            Use Activity Log to record the meeting outcome
          </p>
        )}
        {provider.pipeline_stage === "upgrade_meeting" && (
          <>
            <button
              onClick={onLogUpgradeOutcome}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
            >
              Log Upgrade Outcome
            </button>
            <button
              onClick={onScheduleMeeting}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Reschedule
            </button>
          </>
        )}
        {(provider.pipeline_stage === "pitched" || provider.pipeline_stage === "no_show" || provider.pipeline_stage === "not_interested") && (
          <button
            onClick={onScheduleMeeting}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Schedule Follow-up
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion Actions Section
// ─────────────────────────────────────────────────────────────────────────────

function ConversionActionsSection({
  provider,
  onUpdateStatus,
}: {
  provider: ProviderGrowthWithProfile;
  onUpdateStatus: (updates: { ads_status?: string; medjobs_status?: string }) => void;
}) {
  // Only show conversion actions for providers who have been pitched
  const canShowConversion = ["pitched", "upgrade_meeting"].includes(provider.pipeline_stage);

  if (!canShowConversion) return null;

  const showAdsFreeTrial = provider.ads_status === "none";
  const showAdsPaying = provider.ads_status === "free_intro";
  const showMedjobsPilot = provider.medjobs_status === "none" && provider.medjobs_eligible;
  const showMedjobsPaying = provider.medjobs_status === "in_pilot";

  if (!showAdsFreeTrial && !showAdsPaying && !showMedjobsPilot && !showMedjobsPaying) {
    return null;
  }

  return (
    <>
      <SectionDivider />
      <div>
        <SectionHeader>Conversion Actions</SectionHeader>
        <div className="flex flex-wrap gap-2">
          {showAdsFreeTrial && (
            <button
              onClick={() => onUpdateStatus({ ads_status: "free_intro" })}
              className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200"
            >
              Start Ads Free Trial
            </button>
          )}
          {showAdsPaying && (
            <button
              onClick={() => onUpdateStatus({ ads_status: "subscribed" })}
              className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200"
            >
              Mark Ads Paying
            </button>
          )}
          {showMedjobsPilot && (
            <button
              onClick={() => onUpdateStatus({ medjobs_status: "in_pilot" })}
              className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 border border-purple-200"
            >
              Start MedJobs Pilot
            </button>
          )}
          {showMedjobsPaying && (
            <button
              onClick={() => onUpdateStatus({ medjobs_status: "subscribed" })}
              className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 border border-purple-200"
            >
              Mark MedJobs Paying
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade Outcome Logger
// ─────────────────────────────────────────────────────────────────────────────

interface UpgradeOutcome {
  pipeline_stage: "pitched" | "not_interested";
  ads_status?: "subscribed";
  medjobs_status?: "subscribed";
  meeting_completed_at?: string;
}

function UpgradeOutcomeLogger({
  provider,
  onSubmit,
  onCancel,
}: {
  provider: ProviderGrowthWithProfile;
  onSubmit: (outcome: UpgradeOutcome) => void;
  onCancel: () => void;
}) {
  const [adsUpgraded, setAdsUpgraded] = useState(false);
  const [medjobsUpgraded, setMedjobsUpgraded] = useState(false);
  const [notInterested, setNotInterested] = useState(false);

  const hasAds = provider.ads_status === "free_intro";
  const hasMedjobs = provider.medjobs_status === "in_pilot";

  const handleSubmit = () => {
    const outcome: UpgradeOutcome = {
      pipeline_stage: notInterested ? "not_interested" : "pitched",
      meeting_completed_at: new Date().toISOString(),
    };

    if (adsUpgraded) {
      outcome.ads_status = "subscribed";
    }
    if (medjobsUpgraded) {
      outcome.medjobs_status = "subscribed";
    }

    onSubmit(outcome);
  };

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-amber-800">
        Log Upgrade Meeting Outcome
      </div>

      {/* Upgrade checkboxes */}
      <div className="space-y-2">
        {hasAds && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={adsUpgraded}
              onChange={(e) => {
                setAdsUpgraded(e.target.checked);
                if (e.target.checked) setNotInterested(false);
              }}
              className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
            />
            <span className="text-sm text-gray-700">
              Upgraded to Ads Subscription
            </span>
          </label>
        )}
        {hasMedjobs && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={medjobsUpgraded}
              onChange={(e) => {
                setMedjobsUpgraded(e.target.checked);
                if (e.target.checked) setNotInterested(false);
              }}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">
              Upgraded to MedJobs Subscription
            </span>
          </label>
        )}
        <div className="border-t border-amber-200 pt-2 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={notInterested}
              onChange={(e) => {
                setNotInterested(e.target.checked);
                if (e.target.checked) {
                  setAdsUpgraded(false);
                  setMedjobsUpgraded(false);
                }
              }}
              className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500"
            />
            <span className="text-sm text-gray-700">
              Not interested in upgrading
            </span>
          </label>
        </div>
      </div>

      {/* Info text */}
      <p className="text-xs text-amber-700">
        {adsUpgraded || medjobsUpgraded
          ? "Provider will be marked as Paying and moved to Pitched stage."
          : notInterested
          ? "Provider will be marked as Not Interested."
          : "If no upgrade, provider returns to Pitched for future follow-up."}
      </p>

      {/* Buttons */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
        >
          Save Outcome
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Drawer Component
// ─────────────────────────────────────────────────────────────────────────────

// Engagement data from API
interface EngagementData {
  questions_count: number;
  leads_count: number;
  provider_slug: string | null;
}

export function ProviderDrawer({ provider, onClose, onUpdate, onCallLogged }: ProviderDrawerProps) {
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [activeAction, setActiveAction] = useState<"schedule" | "upgrade" | null>(null);

  const fetchProviderData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/provider-growth/${provider.id}`);
      if (res.ok) {
        const data = await res.json();
        setEngagement(data.engagement || null);
      }
    } catch (e) {
      console.error("Failed to fetch provider data:", e);
    } finally {
      setLoadingData(false);
    }
  }, [provider.id]);

  useEffect(() => {
    fetchProviderData();
  }, [fetchProviderData]);

  // Reset action when provider changes
  useEffect(() => {
    setActiveAction(null);
  }, [provider.id]);

  const handleScheduleMeeting = async (_meetingInfo: { scheduled_at: string }) => {
    setActiveAction(null);
    onUpdate();
  };

  const handleUpdateConversionStatus = async (updates: { ads_status?: string; medjobs_status?: string }) => {
    try {
      const res = await fetch(`/api/admin/provider-growth/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        throw new Error("Failed to update conversion status");
      }
      onUpdate();
    } catch (e) {
      console.error("Failed to update conversion status:", e);
    }
  };

  // Show call script only for new_claim providers
  const showCallScript = provider.pipeline_stage === "new_claim";

  // Header
  const header = (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {provider.display_name || "Unnamed Provider"}
        </h2>
        {provider.slug && (
          <Link
            href={`/provider/${provider.slug}`}
            target="_blank"
            className="text-gray-400 hover:text-blue-600 transition-colors"
            title="View public profile"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Link>
        )}
      </div>
      <p className="text-sm text-gray-500 mt-0.5">
        {[
          provider.care_types?.[0],
          [provider.city, provider.state].filter(Boolean).join(", "),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );

  // Footer with actions
  const footer = (
    <ActionsSection
      provider={provider}
      onScheduleMeeting={() => setActiveAction("schedule")}
      onLogUpgradeOutcome={() => setActiveAction("upgrade")}
    />
  );

  return (
    <DrawerShell onClose={onClose} header={header} footer={footer}>
      <div className="py-2">
        {/* Call Script - for new_claim providers */}
        {showCallScript && <CallScriptSection provider={provider} />}

        {/* Active action panel */}
        {activeAction === "schedule" && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <MeetingScheduler
              trackingId={provider.id}
              providerName={provider.display_name || "Provider"}
              contactEmail={provider.email || undefined}
              onScheduled={handleScheduleMeeting}
              onCancel={() => setActiveAction(null)}
            />
          </div>
        )}

        {activeAction === "upgrade" && (
          <div className="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <UpgradeOutcomeLogger
              provider={provider}
              onSubmit={async (outcome) => {
                try {
                  const res = await fetch(`/api/admin/provider-growth/${provider.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(outcome),
                  });
                  if (!res.ok) throw new Error("Failed to log outcome");
                  setActiveAction(null);
                  onUpdate();
                } catch (e) {
                  console.error("Failed to log upgrade outcome:", e);
                }
              }}
              onCancel={() => setActiveAction(null)}
            />
          </div>
        )}

        {/* Contact Section */}
        <ContactSection provider={provider} />

        {(provider.phone || provider.email) && <SectionDivider />}

        {/* Meeting Info - when meeting is scheduled */}
        <MeetingInfoSection provider={provider} />

        {(provider.pipeline_stage === "meeting_scheduled" || provider.pipeline_stage === "upgrade_meeting") &&
          provider.meeting_scheduled_at && (
          <SectionDivider />
        )}

        {/* Provider Stats - unified row matching Provider Outreach pattern */}
        <div>
          <SectionHeader>Provider Stats</SectionHeader>
          <div className="flex items-center gap-6">
            <div>
              <span className="text-2xl font-semibold text-gray-900">
                {provider.profile_completeness || 0}%
              </span>
              <span className="ml-1.5 text-sm text-gray-500">Profile</span>
            </div>
            <div>
              <span className={`text-2xl font-semibold ${
                loadingData ? "text-gray-400" :
                (engagement?.questions_count ?? 0) > 0 ? "text-gray-900" : "text-gray-400"
              }`}>
                {loadingData ? "·" : (engagement?.questions_count ?? 0)}
              </span>
              <span className="ml-1.5 text-sm text-gray-500">Questions</span>
            </div>
            <div>
              <span className={`text-2xl font-semibold ${
                loadingData ? "text-gray-400" :
                (engagement?.leads_count ?? 0) > 0 ? "text-gray-900" : "text-gray-400"
              }`}>
                {loadingData ? "·" : (engagement?.leads_count ?? 0)}
              </span>
              <span className="ml-1.5 text-sm text-gray-500">Leads</span>
            </div>
            <div>
              <span className={`text-2xl font-semibold ${provider.ads_eligible ? "text-gray-900" : "text-gray-400"}`}>
                {provider.ads_eligible ? "✓" : "—"}
              </span>
              <span className="ml-1.5 text-sm text-gray-500">Ads</span>
            </div>
            {provider.medjobs_eligible && (
              <div>
                <span className="text-2xl font-semibold text-gray-900">✓</span>
                <span className="ml-1.5 text-sm text-gray-500">
                  MJ{provider.medjobs_catchment_university ? `: ${provider.medjobs_catchment_university}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Conversion status */}
        {(provider.ads_status !== "none" || provider.medjobs_status !== "none") && (
          <>
            <SectionDivider />
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
              <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-2">
                Conversion Status
              </div>
              <div className="space-y-2">
                {provider.ads_status !== "none" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ads</span>
                    <span className="font-medium text-emerald-700">
                      {ADS_STATUS_LABELS[provider.ads_status as AdsStatus]}
                    </span>
                  </div>
                )}
                {provider.medjobs_status !== "none" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">MedJobs</span>
                    <span className="font-medium text-purple-700">
                      {MEDJOBS_STATUS_LABELS[provider.medjobs_status as MedjobsStatus]}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Pitch info */}
        {provider.pitched_at && (
          <>
            <SectionDivider />
            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
              <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">
                Pitch Details
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Pitched</span>
                  <span className="text-gray-900">{formatDate(provider.pitched_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Products</span>
                  <span className="text-gray-900">
                    {[provider.pitched_ads && "Ads", provider.pitched_medjobs && "MedJobs"]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </span>
                </div>
                {provider.pitch_interest_level && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Interest</span>
                    <span className="text-gray-900">
                      {INTEREST_LEVEL_LABELS[provider.pitch_interest_level as keyof typeof INTEREST_LEVEL_LABELS]}
                    </span>
                  </div>
                )}
                {provider.pitch_notes && (
                  <div className="mt-2 pt-2 border-t border-indigo-100">
                    <p className="text-gray-700">{provider.pitch_notes}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Conversion Actions - for pitched/upgrade_meeting providers */}
        <ConversionActionsSection
          provider={provider}
          onUpdateStatus={handleUpdateConversionStatus}
        />

        {/* Notes (legacy - displayed if any exist from previous entries) */}
        {provider.notes && (
          <>
            <SectionDivider />
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-2">
                Notes
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{provider.notes}</p>
            </div>
          </>
        )}

        <SectionDivider />

        {/* Unified Activity Log - replaces separate Call Log and Admin Activity */}
        <ActivityLog
          trackingId={provider.id}
          businessProfileId={provider.business_profile_id}
          pipelineStage={provider.pipeline_stage}
          onActivityLogged={() => {
            onCallLogged?.();
            onUpdate();
          }}
        />
      </div>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(isoDate: string | undefined | null): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "—";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

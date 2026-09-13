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
  MEETING_FORMAT_LABELS,
  CLAIM_SOURCE_CONTEXT_LABELS,
  type AdsStatus,
  type MedjobsStatus,
  type MeetingType,
  type MeetingFocus,
  type MeetingFormat,
  type ClaimSource,
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
// Context Section
// ─────────────────────────────────────────────────────────────────────────────

interface ClaimerInfo {
  name: string;
  position?: string;
  email: string;
}

interface EmailEngagement {
  total_sent: number;
  opened: number;
  clicked: number;
  last_clicked_at: string | null;
}

interface ProviderContextData {
  claimer: ClaimerInfo | null;
  emailEngagement: EmailEngagement | null;
}

function ContextSection({
  context,
  claimSource,
  claimedAt,
  expanded,
  onToggle,
}: {
  context: ProviderContextData | null;
  claimSource: ClaimSource | null;
  claimedAt: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Build collapsed summary
  const claimerName = context?.claimer?.name || "Unknown";
  const claimSourceLabel = claimSource
    ? CLAIM_SOURCE_CONTEXT_LABELS[claimSource] || claimSource
    : null;
  const claimDateShort = claimedAt ? formatDateShort(claimedAt) : null;
  const emailStats = context?.emailEngagement;
  const openedRatio = emailStats && emailStats.total_sent > 0
    ? `${emailStats.opened}/${emailStats.total_sent} opened`
    : null;

  // Collapsed summary parts
  const summaryParts = [
    claimSourceLabel && `via ${claimSourceLabel}`,
    claimDateShort,
    openedRatio,
  ].filter(Boolean);

  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left group"
      >
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Context
        </span>
        <span className="text-gray-400 text-[10px]" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        {!expanded && (
          <span className="text-[12px] text-gray-500 truncate">
            {claimerName} claimed {summaryParts.join(" · ")}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 px-3 py-2.5 bg-gray-50 rounded-lg space-y-3">
          {/* Claimer info */}
          {context?.claimer && (
            <div className="text-sm">
              <span className="text-gray-500">Claimed by: </span>
              <span className="text-gray-900 font-medium">{context.claimer.name}</span>
              {context.claimer.position && (
                <span className="text-gray-500"> ({context.claimer.position})</span>
              )}
              {context.claimer.email && (
                <span className="text-gray-600"> – {context.claimer.email}</span>
              )}
            </div>
          )}

          {/* Claim source */}
          {claimSourceLabel && (
            <div className="text-sm">
              <span className="text-gray-500">Found us via: </span>
              <span className="text-gray-900">{claimSourceLabel}</span>
            </div>
          )}

          {/* Claim date with relative time */}
          {claimedAt && (
            <div className="text-sm">
              <span className="text-gray-500">Claimed: </span>
              <span className="text-gray-900">
                {formatDateFull(claimedAt)} ({daysAgo(claimedAt)})
              </span>
            </div>
          )}

          {/* Email engagement */}
          <div className="pt-1 border-t border-gray-200">
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">
              Email Engagement (30 days)
            </div>
            {emailStats && emailStats.total_sent > 0 ? (
              <div className="space-y-1">
                <div className="text-sm text-gray-700">
                  • {emailStats.total_sent} emails sent, {emailStats.opened} opened, {emailStats.clicked} clicked
                </div>
                {emailStats.last_clicked_at && (
                  <div className="text-sm text-gray-700">
                    • Last clicked: {formatDateShort(emailStats.last_clicked_at)}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No emails sent</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateShort(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateFull(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysAgo(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
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
    timeZone: "America/New_York",
  });
  const formattedTime = meetingDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
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
        <div className="text-sm text-gray-600">{formattedTime} ET</div>
        {/* Meeting format display */}
        {provider.meeting_format && (
          <div className="mt-2 flex items-center gap-2">
            {provider.meeting_format === "phone" ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Phone Call
                </span>
                {provider.meeting_phone && (
                  <a
                    href={`tel:${provider.meeting_phone}`}
                    className="text-xs text-green-700 hover:text-green-800 hover:underline"
                  >
                    {formatPhone(provider.meeting_phone)}
                  </a>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Zoom Video Call
              </span>
            )}
          </div>
        )}
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
          <>
            <button
              onClick={onScheduleMeeting}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Change Meeting Time
            </button>
            <p className="text-sm text-gray-500 py-1">
              Use Activity Log to record the meeting outcome
            </p>
          </>
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
  const [contextData, setContextData] = useState<ProviderContextData | null>(null);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [activeAction, setActiveAction] = useState<"schedule" | "upgrade" | null>(null);

  const fetchProviderData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/provider-growth/${provider.id}`);
      if (res.ok) {
        const data = await res.json();
        setEngagement(data.engagement || null);
        setContextData(data.context || null);
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

  const handleScheduleMeeting = async () => {
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

  // Check if provider is converted (has free trial)
  const isConverted =
    provider.ads_status === "free_intro" ||
    provider.medjobs_status === "in_pilot" ||
    provider.medjobs_status === "pilot_expired";

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
              isConverted={isConverted}
              initialMeetingType={provider.meeting_type as MeetingType | undefined}
              initialMeetingFocus={provider.meeting_focus as MeetingFocus | undefined}
              providerPhone={provider.phone || undefined}
              initialMeetingFormat={provider.meeting_format as MeetingFormat | undefined}
              initialMeetingPhone={provider.meeting_phone || undefined}
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

        {/* Context Section - helps sales reps understand provider history */}
        <ContextSection
          context={contextData}
          claimSource={provider.claim_source as ClaimSource | null}
          claimedAt={provider.claimed_at}
          expanded={contextExpanded}
          onToggle={() => setContextExpanded((prev) => !prev)}
        />

        <SectionDivider />

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

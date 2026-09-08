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
import type { ProviderGrowthWithProfile, ProviderGrowthTouchpoint } from "@/lib/provider-growth/queries";
import {
  PIPELINE_STAGE_LABELS,
  ADS_STATUS_LABELS,
  MEDJOBS_STATUS_LABELS,
  TOUCHPOINT_TYPE_LABELS,
  INTEREST_LEVEL_LABELS,
  type PipelineStage,
  type AdsStatus,
  type MedjobsStatus,
} from "@/lib/provider-growth/stages";
import { EligibilityBadges } from "./EligibilityBadges";
import { MeetingScheduler } from "./MeetingScheduler";
import { PitchLogger, type PitchLogData } from "./PitchLogger";
import { CallLogSection } from "./CallLogSection";

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
    <div className="mb-4 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
      <div className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1.5">
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
// Actions Section (sticky footer)
// ─────────────────────────────────────────────────────────────────────────────

function ActionsSection({
  provider,
  onScheduleMeeting,
  onLogPitch,
  onAddNote,
  onMarkNotInterested,
  onReEngage,
}: {
  provider: ProviderGrowthWithProfile;
  onScheduleMeeting: () => void;
  onLogPitch: () => void;
  onAddNote: () => void;
  onMarkNotInterested: () => void;
  onReEngage: () => void;
}) {
  return (
    <div className="space-y-3">
      <SectionHeader>Actions</SectionHeader>
      <div className="flex flex-wrap gap-2">
        {provider.pipeline_stage === "new_claim" && (
          <button
            onClick={onScheduleMeeting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Schedule Meeting
          </button>
        )}
        {provider.pipeline_stage === "meeting_scheduled" && (
          <button
            onClick={onLogPitch}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Log Pitch
          </button>
        )}
        {provider.pipeline_stage === "pitched" && (
          <button
            onClick={onScheduleMeeting}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200"
          >
            Schedule Follow-up
          </button>
        )}
        {provider.pipeline_stage === "not_interested" && (
          <button
            onClick={onReEngage}
            className="px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200"
          >
            Re-engage
          </button>
        )}
        <button
          onClick={onAddNote}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Add Note
        </button>
        {provider.pipeline_stage !== "not_interested" && (
          <button
            onClick={onMarkNotInterested}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Not Interested
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Drawer Component
// ─────────────────────────────────────────────────────────────────────────────

export function ProviderDrawer({ provider, onClose, onUpdate, onCallLogged }: ProviderDrawerProps) {
  const [touchpoints, setTouchpoints] = useState<ProviderGrowthTouchpoint[]>([]);
  const [loadingTouchpoints, setLoadingTouchpoints] = useState(true);
  const [activeAction, setActiveAction] = useState<"schedule" | "pitch" | "notes" | null>(null);
  const [notes, setNotes] = useState(provider.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchTouchpoints = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/provider-growth/${provider.id}`);
      if (res.ok) {
        const data = await res.json();
        setTouchpoints(data.touchpoints || []);
      }
    } catch (e) {
      console.error("Failed to fetch touchpoints:", e);
    } finally {
      setLoadingTouchpoints(false);
    }
  }, [provider.id]);

  useEffect(() => {
    fetchTouchpoints();
  }, [fetchTouchpoints]);

  // Reset notes when provider changes
  useEffect(() => {
    setNotes(provider.notes || "");
    setActiveAction(null);
  }, [provider.id, provider.notes]);

  const handleScheduleMeeting = async (_meetingInfo: { scheduled_at: string }) => {
    setActiveAction(null);
    onUpdate();
  };

  const handleLogPitch = async (data: PitchLogData) => {
    try {
      const res = await fetch("/api/admin/provider-growth/log-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_id: provider.id,
          ...data,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to log pitch");
      }
      setActiveAction(null);
      onUpdate();
    } catch (e) {
      console.error("Failed to log pitch:", e);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/admin/provider-growth/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        throw new Error("Failed to save notes");
      }
      setActiveAction(null);
      onUpdate();
    } catch (e) {
      console.error("Failed to save notes:", e);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleMarkNotInterested = async () => {
    if (!confirm("Mark this provider as not interested?")) return;

    try {
      const res = await fetch(`/api/admin/provider-growth/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_stage: "not_interested",
          not_interested_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to mark not interested");
      }
      onUpdate();
    } catch (e) {
      console.error("Failed to mark not interested:", e);
    }
  };

  const handleReEngage = async () => {
    try {
      const res = await fetch(`/api/admin/provider-growth/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage: "new_claim" }),
      });
      if (!res.ok) {
        throw new Error("Failed to re-engage");
      }
      onUpdate();
    } catch (e) {
      console.error("Failed to re-engage:", e);
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
      onLogPitch={() => setActiveAction("pitch")}
      onAddNote={() => setActiveAction("notes")}
      onMarkNotInterested={handleMarkNotInterested}
      onReEngage={handleReEngage}
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
              onScheduled={handleScheduleMeeting}
              onCancel={() => setActiveAction(null)}
            />
          </div>
        )}

        {activeAction === "pitch" && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <PitchLogger
              providerName={provider.display_name || "Provider"}
              medjobsEligible={provider.medjobs_eligible}
              onSubmit={handleLogPitch}
              onCancel={() => setActiveAction(null)}
            />
          </div>
        )}

        {activeAction === "notes" && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Add notes about this provider..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setActiveAction(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingNotes ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Contact Section */}
        <ContactSection provider={provider} />

        {(provider.phone || provider.email) && <SectionDivider />}

        {/* Status Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Eligibility */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Eligibility
            </div>
            <EligibilityBadges
              adsEligible={provider.ads_eligible}
              medjobsEligible={provider.medjobs_eligible}
              medjobsUniversity={provider.medjobs_catchment_university}
              size="md"
            />
          </div>

          {/* Profile completeness */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Profile
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${provider.profile_completeness || 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {provider.profile_completeness || 0}%
              </span>
            </div>
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

        {/* Notes */}
        {provider.notes && !activeAction && (
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

        {/* Call Log */}
        <CallLogSection
          trackingId={provider.id}
          businessProfileId={provider.business_profile_id}
          onCallLogged={onCallLogged}
        />

        <SectionDivider />

        {/* Activity timeline */}
        <div>
          <SectionHeader>Activity</SectionHeader>
          {loadingTouchpoints ? (
            <div className="flex items-center justify-center py-4">
              <span className="w-4 h-4 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : touchpoints.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {touchpoints.map((tp) => (
                <div key={tp.id} className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900">
                      {TOUCHPOINT_TYPE_LABELS[tp.touchpoint_type] || tp.touchpoint_type}
                    </div>
                    <div className="text-xs text-gray-500">{timeAgo(tp.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

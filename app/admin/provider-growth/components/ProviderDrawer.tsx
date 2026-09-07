"use client";

/**
 * ProviderDrawer - Detail panel for provider growth tracking
 *
 * Shows full provider context, touchpoint history, and actions
 * for managing the provider through the growth pipeline.
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

interface ProviderDrawerProps {
  provider: ProviderGrowthWithProfile;
  onClose: () => void;
  onUpdate: () => void;
}

export function ProviderDrawer({ provider, onClose, onUpdate }: ProviderDrawerProps) {
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

  // Called by MeetingScheduler after it successfully schedules via API
  // The schedule-meeting route already updated the tracking, so we just refresh
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

  return (
    <DrawerShell
      onClose={onClose}
      header={
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {provider.display_name || "Unnamed Provider"}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            {(provider.city || provider.state) && (
              <span className="text-sm text-gray-500">
                {[provider.city, provider.state].filter(Boolean).join(", ")}
              </span>
            )}
            <span className="text-gray-300">·</span>
            <span className={`text-sm font-medium ${getStageColor(provider.pipeline_stage)}`}>
              {PIPELINE_STAGE_LABELS[provider.pipeline_stage]}
            </span>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            {provider.slug && (
              <Link
                href={`/provider/${provider.slug}`}
                target="_blank"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View Profile →
              </Link>
            )}
          </div>
          <div className="text-xs text-gray-400">
            Claimed {timeAgo(provider.claimed_at)}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Active action panel */}
        {activeAction === "schedule" && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <MeetingScheduler
              trackingId={provider.id}
              providerName={provider.display_name || "Provider"}
              onScheduled={handleScheduleMeeting}
              onCancel={() => setActiveAction(null)}
            />
          </div>
        )}

        {activeAction === "pitch" && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <PitchLogger
              providerName={provider.display_name || "Provider"}
              medjobsEligible={provider.medjobs_eligible}
              onSubmit={handleLogPitch}
              onCancel={() => setActiveAction(null)}
            />
          </div>
        )}

        {activeAction === "notes" && (
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Add notes about this provider..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveAction(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingNotes ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Quick actions */}
        {!activeAction && (
          <div className="flex flex-wrap gap-2">
            {provider.pipeline_stage === "new_claim" && (
              <button
                onClick={() => setActiveAction("schedule")}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Schedule Meeting
              </button>
            )}
            {provider.pipeline_stage === "meeting_scheduled" && (
              <button
                onClick={() => setActiveAction("pitch")}
                className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                Log Pitch
              </button>
            )}
            {provider.pipeline_stage === "pitched" && (
              <button
                onClick={() => setActiveAction("schedule")}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
              >
                Schedule Follow-up
              </button>
            )}
            {provider.pipeline_stage === "not_interested" && (
              <button
                onClick={handleReEngage}
                className="px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100"
              >
                Re-engage
              </button>
            )}
            <button
              onClick={() => setActiveAction("notes")}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Add Note
            </button>
            {provider.pipeline_stage !== "not_interested" && (
              <button
                onClick={handleMarkNotInterested}
                className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Not Interested
              </button>
            )}
          </div>
        )}

        {/* Status cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Eligibility */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs font-medium text-gray-500 mb-2">Eligibility</div>
            <EligibilityBadges
              adsEligible={provider.ads_eligible}
              medjobsEligible={provider.medjobs_eligible}
              medjobsUniversity={provider.medjobs_catchment_university}
              size="md"
            />
          </div>

          {/* Profile completeness */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs font-medium text-gray-500 mb-2">Profile</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
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
          <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
            <div className="text-xs font-medium text-emerald-700 mb-2">Conversion Status</div>
            <div className="space-y-2">
              {provider.ads_status !== "none" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Ads</span>
                  <span className="font-medium text-emerald-700">
                    {ADS_STATUS_LABELS[provider.ads_status as AdsStatus]}
                  </span>
                </div>
              )}
              {provider.medjobs_status !== "none" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">MedJobs</span>
                  <span className="font-medium text-purple-700">
                    {MEDJOBS_STATUS_LABELS[provider.medjobs_status as MedjobsStatus]}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pitch info */}
        {provider.pitched_at && (
          <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
            <div className="text-xs font-medium text-indigo-700 mb-2">Pitch Details</div>
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
        )}

        {/* Notes */}
        {provider.notes && !activeAction && (
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
            <div className="text-xs font-medium text-amber-700 mb-2">Notes</div>
            <p className="text-sm text-gray-700">{provider.notes}</p>
          </div>
        )}

        {/* Activity timeline */}
        <div>
          <div className="text-sm font-medium text-gray-900 mb-3">Activity</div>
          {loadingTouchpoints ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : touchpoints.length === 0 ? (
            <div className="text-sm text-gray-500">No activity yet</div>
          ) : (
            <div className="space-y-3">
              {touchpoints.map((tp) => (
                <div key={tp.id} className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-300" />
                  <div className="flex-1">
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

function getStageColor(stage: PipelineStage): string {
  switch (stage) {
    case "new_claim":
      return "text-gray-600";
    case "meeting_scheduled":
      return "text-blue-600";
    case "pitched":
      return "text-indigo-600";
    case "not_interested":
      return "text-gray-400";
    default:
      return "text-gray-600";
  }
}

function timeAgo(isoDate: string | undefined | null): string {
  if (!isoDate) return "—";
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

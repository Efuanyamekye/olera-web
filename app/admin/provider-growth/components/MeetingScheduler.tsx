"use client";

/**
 * MeetingScheduler - Simple meeting booking flow (matches MedJobs pattern)
 *
 * 1. Opens Calendly in a new tab immediately when shown
 * 2. Shows a simple form to confirm the meeting date/time
 * 3. Admin tags the meeting as New/Upgrade and selects product focus (Ads/MedJobs/Both)
 * 4. On confirm, moves provider to meeting_scheduled stage
 */

import { useState, useEffect } from "react";
import { generateBookingUrl } from "@/lib/provider-growth/calendly";
import type { MeetingType, MeetingFocus } from "@/lib/provider-growth/stages";

interface MeetingSchedulerProps {
  trackingId: string;
  providerName: string;
  contactName?: string;
  contactEmail?: string;
  /** Whether provider is already converted (has free trial) - used to default meeting type */
  isConverted?: boolean;
  onScheduled: (meetingInfo: {
    scheduled_at: string;
    calendly_event_id?: string;
    meeting_type: MeetingType;
    meeting_focus: MeetingFocus;
  }) => void;
  onCancel: () => void;
}

export function MeetingScheduler({
  trackingId,
  providerName,
  contactName,
  contactEmail,
  isConverted = false,
  onScheduled,
  onCancel,
}: MeetingSchedulerProps) {
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [meetingType, setMeetingType] = useState<MeetingType>(isConverted ? "upgrade" : "new");
  const [meetingFocus, setMeetingFocus] = useState<MeetingFocus>("both");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open Calendly immediately when this component mounts
  useEffect(() => {
    const bookingUrl = generateBookingUrl({
      trackingId,
      contactName: contactName || providerName,
      contactEmail,
    });
    window.open(bookingUrl, "_blank", "noopener,noreferrer");
  }, [trackingId, providerName, contactName, contactEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDate || !manualTime) return;

    setSubmitting(true);
    setError(null);

    try {
      // Treat input as UTC (matching Calendly's timezone)
      const scheduledAt = new Date(`${manualDate}T${manualTime}:00Z`).toISOString();

      const res = await fetch("/api/admin/provider-growth/schedule-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_id: trackingId,
          meeting_scheduled_at: scheduledAt,
          meeting_type: meetingType,
          meeting_focus: meetingFocus,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to schedule meeting");
      }

      onScheduled({
        scheduled_at: scheduledAt,
        meeting_type: meetingType,
        meeting_focus: meetingFocus,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900">
          Confirm meeting with {providerName}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Calendly opened in a new tab. Enter the meeting time you booked (in UTC):
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Date and Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time <span className="text-gray-400 font-normal">(UTC)</span>
            </label>
            <input
              type="time"
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
        </div>

        {/* Meeting Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Meeting Type
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="meetingType"
                value="new"
                checked={meetingType === "new"}
                onChange={() => setMeetingType("new")}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">New Meeting</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="meetingType"
                value="upgrade"
                checked={meetingType === "upgrade"}
                onChange={() => setMeetingType("upgrade")}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Upgrade Meeting</span>
            </label>
          </div>
        </div>

        {/* Meeting Focus */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Focus
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="meetingFocus"
                value="ads"
                checked={meetingFocus === "ads"}
                onChange={() => setMeetingFocus("ads")}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Ads</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="meetingFocus"
                value="medjobs"
                checked={meetingFocus === "medjobs"}
                onChange={() => setMeetingFocus("medjobs")}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">MedJobs</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="meetingFocus"
                value="both"
                checked={meetingFocus === "both"}
                onChange={() => setMeetingFocus("both")}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Both</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !manualDate || !manualTime}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? "Scheduling..." : "Confirm Meeting"}
          </button>
        </div>
      </form>
    </div>
  );
}

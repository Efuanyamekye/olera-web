"use client";

/**
 * MeetingScheduler - Simple meeting booking flow (matches MedJobs pattern)
 *
 * 1. Opens Calendly in a new tab immediately when shown
 * 2. Shows a simple form to confirm the meeting date/time
 * 3. On confirm, moves provider to meeting_scheduled stage
 */

import { useState, useEffect } from "react";
import { generateBookingUrl } from "@/lib/provider-growth/calendly";

interface MeetingSchedulerProps {
  trackingId: string;
  providerName: string;
  contactName?: string;
  contactEmail?: string;
  onScheduled: (meetingInfo: { scheduled_at: string; calendly_event_id?: string }) => void;
  onCancel: () => void;
}

export function MeetingScheduler({
  trackingId,
  providerName,
  contactName,
  contactEmail,
  onScheduled,
  onCancel,
}: MeetingSchedulerProps) {
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
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
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to schedule meeting");
      }

      onScheduled({ scheduled_at: scheduledAt });
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

      <form onSubmit={handleSubmit} className="space-y-3">
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

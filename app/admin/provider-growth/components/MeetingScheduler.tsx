"use client";

/**
 * MeetingScheduler - Calendly integration for scheduling meetings
 *
 * Generates a Calendly booking link and optionally allows manual scheduling.
 * Can also send the booking link directly to the provider via email.
 */

import { useState } from "react";

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
  const [mode, setMode] = useState<"calendly" | "manual">("calendly");
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Manual scheduling fields
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const generateBookingUrl = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/provider-growth/schedule-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_id: trackingId,
          provider_name: providerName,
          contact_name: contactName,
          contact_email: contactEmail,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate booking URL");
      }

      const data = await res.json();
      setBookingUrl(data.booking_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const sendBookingEmail = async () => {
    setSendingEmail(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/provider-growth/send-booking-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_id: trackingId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send email");
      }

      setEmailSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDate || !manualTime) return;

    setSubmitting(true);
    try {
      const scheduledAt = new Date(`${manualDate}T${manualTime}`).toISOString();

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
        <h3 className="text-sm font-medium text-gray-900 mb-1">
          Schedule meeting with {providerName}
        </h3>
        {contactName && (
          <p className="text-sm text-gray-500">
            Contact: {contactName} {contactEmail && `(${contactEmail})`}
          </p>
        )}
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("calendly");
            setError(null);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            mode === "calendly"
              ? "bg-primary-50 text-primary-700 border-primary-200"
              : "border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          Use Calendly
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("manual");
            setError(null);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            mode === "manual"
              ? "bg-primary-50 text-primary-700 border-primary-200"
              : "border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          Manual Entry
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {mode === "calendly" && (
        <div className="space-y-3">
          {/* Option 1: Send booking link to provider via email */}
          {contactEmail && !emailSent && (
            <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg">
              <p className="text-sm text-gray-700 mb-2">
                Send the booking link to <span className="font-medium">{contactEmail}</span>?
              </p>
              <button
                type="button"
                onClick={sendBookingEmail}
                disabled={sendingEmail}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {sendingEmail ? "Sending..." : "Send Booking Link to Provider"}
              </button>
            </div>
          )}

          {emailSent && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                Booking link sent to {contactEmail}. The provider will pick a time and the meeting will be automatically scheduled.
              </p>
            </div>
          )}

          {/* Option 2: Generate link for admin to share manually */}
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs text-gray-500 mb-2">Or get the link to share yourself:</p>
            {!bookingUrl ? (
              <button
                type="button"
                onClick={generateBookingUrl}
                disabled={loading}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Booking Link"}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Booking URL:</p>
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:text-primary-700 break-all"
                  >
                    {bookingUrl}
                  </a>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(bookingUrl);
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Copy Link
                  </button>
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 text-center"
                  >
                    Open Calendly
                  </a>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Once the provider books, the meeting will be automatically scheduled via Calendly webhook.
          </p>
        </div>
      )}

      {mode === "manual" && (
        <form onSubmit={handleManualSubmit} className="space-y-3">
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
                Time
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
          <button
            type="submit"
            disabled={submitting || !manualDate || !manualTime}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? "Scheduling..." : "Schedule Meeting"}
          </button>
        </form>
      )}

      {/* Cancel button */}
      <div className="flex justify-end pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

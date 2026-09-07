/**
 * Calendly Integration Helpers for Provider Growth
 *
 * Generates booking URLs with tracking parameters and handles
 * webhook event processing for meeting scheduled/completed events.
 */

// Default Calendly URL - this should match your Calendly event type
// TODO: Make this configurable via env var or admin settings
const CALENDLY_BASE_URL = "https://calendly.com/olera-partnerships/provider-growth-call";

export interface CalendlyBookingParams {
  trackingId: string;  // provider_growth_tracking.id for callback
  providerName?: string;
  contactName?: string;
  contactEmail?: string;
}

/**
 * Generate a Calendly booking URL with tracking parameters.
 * The utm_content parameter carries the tracking ID for webhook callback.
 */
export function generateBookingUrl(params: CalendlyBookingParams): string {
  const searchParams = new URLSearchParams();

  // Use utm_content for tracking ID (consistent with MedJobs pattern)
  searchParams.set("utm_content", params.trackingId);

  // Prefill invitee details if available
  if (params.contactName) {
    searchParams.set("name", params.contactName);
  }
  if (params.contactEmail) {
    searchParams.set("email", params.contactEmail);
  }

  return `${CALENDLY_BASE_URL}?${searchParams.toString()}`;
}

/**
 * Extract tracking ID from a Calendly webhook payload.
 * The tracking ID is passed via utm_content during booking.
 */
export function extractTrackingIdFromWebhook(
  payload: CalendlyWebhookPayload
): string | null {
  // Calendly sends tracking params in the event payload
  const trackingParams = payload.payload?.tracking;
  if (trackingParams?.utm_content) {
    return trackingParams.utm_content;
  }

  // Also check questions_and_answers for custom fields
  const questionsAndAnswers = payload.payload?.questions_and_answers;
  if (questionsAndAnswers) {
    const trackingQuestion = questionsAndAnswers.find(
      (qa) => qa.question?.toLowerCase().includes("tracking") || qa.question?.toLowerCase().includes("id")
    );
    if (trackingQuestion?.answer) {
      return trackingQuestion.answer;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Types (based on Calendly webhook payload structure)
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendlyWebhookPayload {
  event: "invitee.created" | "invitee.canceled";
  payload: {
    uri: string;
    email: string;
    name: string;
    status: "active" | "canceled";
    scheduled_event: {
      uri: string;
      name: string;
      start_time: string;  // ISO 8601
      end_time: string;
      status: "active" | "canceled";
      event_type: string;
    };
    tracking?: {
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;  // We use this for tracking ID
      utm_term?: string;
    };
    questions_and_answers?: Array<{
      question: string;
      answer: string;
    }>;
    cancel_url?: string;
    reschedule_url?: string;
    created_at: string;
    updated_at: string;
  };
  created_at: string;
}

export interface CalendlyEventInfo {
  eventId: string;
  eventUri: string;
  inviteeName: string;
  inviteeEmail: string;
  scheduledAt: string;
  status: "active" | "canceled";
  trackingId: string | null;
}

/**
 * Parse a Calendly webhook payload into a simplified event info structure.
 */
export function parseWebhookEvent(payload: CalendlyWebhookPayload): CalendlyEventInfo {
  const scheduledEvent = payload.payload.scheduled_event;

  // Extract event ID from URI (last segment)
  const eventUri = scheduledEvent.uri;
  const eventId = eventUri.split("/").pop() || eventUri;

  return {
    eventId,
    eventUri,
    inviteeName: payload.payload.name,
    inviteeEmail: payload.payload.email,
    scheduledAt: scheduledEvent.start_time,
    status: payload.payload.status,
    trackingId: extractTrackingIdFromWebhook(payload),
  };
}

/**
 * Determine if a Calendly event is a meeting completion vs scheduling.
 * In Calendly, we infer completion from the meeting start time passing.
 */
export function isMeetingCompleted(scheduledAt: string): boolean {
  const meetingTime = new Date(scheduledAt);
  const now = new Date();
  return meetingTime < now;
}

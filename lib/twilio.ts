import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import { shouldSendNotification } from "./notification-prefs";

let twilioClient: twilio.Twilio | null = null;

function getTwilio(): twilio.Twilio | null {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  twilioClient = twilio(sid, token);
  return twilioClient;
}

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

interface SendSMSOptions {
  to: string;
  body: string;
  /** Recipient's profile ID for checking notification preferences */
  recipientProfileId?: string;
  /** Notification type for preference checking (e.g., 'new_leads') */
  notificationType?: string;
  /**
   * Logging fields. When provided, the send is recorded in email_log with
   * channel='sms' so it shows on /admin/family-comms and counts toward the
   * cross-channel frequency cap (see migration 121). Omit for fire-and-forget
   * sends that should stay off the comms ledger.
   */
  emailType?: string;
  recipientType?: "family" | "provider" | "caregiver";
  /** Provider/business_profiles id, when the recipient has one. */
  recipientLogProfileId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record an SMS attempt in email_log (channel='sms'). Fire-and-forget — never
 * throws. The `recipient` is the destination phone (E.164); `subject` carries a
 * short label since SMS has no subject line. Only called when the caller passes
 * emailType, so transactional one-offs can opt out of the ledger.
 */
async function logSms(params: {
  to: string;
  body: string;
  emailType: string;
  recipientType?: string;
  providerId?: string;
  status: "sent" | "failed";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getServiceDb();
    if (!db) return;
    await db.from("email_log").insert({
      channel: "sms",
      recipient: params.to,
      sender: process.env.TWILIO_FROM_NUMBER ?? "twilio",
      subject: `SMS: ${params.emailType}`,
      email_type: params.emailType,
      recipient_type: params.recipientType ?? null,
      provider_id: params.providerId ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
      html_body: params.body,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error("[sms] Failed to log send:", err);
  }
}

/**
 * Send an SMS via Twilio. Fire-and-forget safe — logs errors
 * but never throws so callers can wrap in try/catch without
 * breaking their main flow.
 *
 * If recipientProfileId and notificationType are provided, checks
 * user preferences before sending. Defaults to sending if preferences
 * can't be checked.
 */
export async function sendSMS(
  options: SendSMSOptions
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const { to, body, recipientProfileId, notificationType, emailType, recipientType, recipientLogProfileId, metadata } = options;

  // Check notification preferences if profile ID and type provided
  if (recipientProfileId && notificationType) {
    const shouldSend = await shouldSendNotification(recipientProfileId, notificationType, "sms");
    if (!shouldSend) {
      console.log(`[sms] Skipped to ${to} - user preference disabled for ${notificationType}`);
      return { success: true, skipped: true };
    }
  }

  const client = getTwilio();
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!client || !from) {
    console.error("[sms] Twilio not configured");
    return { success: false, error: "SMS service not configured" };
  }

  try {
    await client.messages.create({
      from,
      to,
      body,
    });
    if (emailType) {
      await logSms({ to, body, emailType, recipientType, providerId: recipientLogProfileId, status: "sent", metadata });
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sms] Send failed:", message);
    if (emailType) {
      await logSms({ to, body, emailType, recipientType, providerId: recipientLogProfileId, status: "failed", errorMessage: message, metadata });
    }
    return { success: false, error: message };
  }
}

/**
 * Format a US phone number to E.164 (+1XXXXXXXXXX).
 * Returns null if the number can't be normalized.
 */
export function normalizeUSPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Mask a phone number for display: +1213****970
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "****";
  return `+${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

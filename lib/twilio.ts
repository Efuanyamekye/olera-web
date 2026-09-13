import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import { shouldSendNotification } from "./notification-prefs";
import { isPhoneDoNotContact } from "./do-not-contact";
import { usPhoneDigits } from "./phone";

let twilioClient: twilio.Twilio | null = null;

/**
 * Build a Twilio REST client from env, for OUTBOUND calls (send SMS, read
 * balance/messages). Prefers a scoped API key (TWILIO_API_KEY_SID +
 * TWILIO_API_KEY_SECRET) so a flagged/leaked sending credential can be revoked
 * on its own without rotating the account auth token and taking the whole
 * account down; falls back to the account SID + auth token when no API key is
 * configured, so an environment that hasn't been given the key still works.
 *
 * NOTE: inbound webhook signature validation still uses TWILIO_AUTH_TOKEN
 * directly (Twilio signs webhooks with the account auth token, never an API
 * key) — see app/api/sms/webhook + app/api/whatsapp/webhook. Don't migrate those.
 */
export function createTwilioClient(): twilio.Twilio | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  if (!accountSid) return null;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  if (apiKeySid && apiKeySecret) return twilio(apiKeySid, apiKeySecret, { accountSid });
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) return twilio(accountSid, authToken);
  return null;
}

function getTwilio(): twilio.Twilio | null {
  if (twilioClient) return twilioClient;
  twilioClient = createTwilioClient();
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
  // "admin" covers internal self-checks texting a teammate rather than a
  // recipient. email_log.recipient_type already stores it on the email side, and
  // logSms below takes a plain string — this union was just narrower than the
  // column it feeds.
  recipientType?: "family" | "provider" | "caregiver" | "admin";
  /** Provider/business_profiles id, when the recipient has one. */
  recipientLogProfileId?: string;
  metadata?: Record<string, unknown>;
  /**
   * Skip the send unless the number can actually receive SMS (migration 167).
   *
   * Set this for numbers WE sourced — provider phones from the `olera-providers`
   * directory are mostly front-desk landlines and office VoIP, and ~68% of those
   * alerts died with Twilio error 30006. Do NOT set it for numbers a person gave
   * us for this purpose (family phones, claim OTPs): there, a wrong skip breaks
   * the flow, and the recipient chose the channel.
   */
  requireMobile?: boolean;
}

/**
 * Record an SMS attempt in email_log (channel='sms'). Fire-and-forget — never
 * throws. The `recipient` is the destination phone (E.164); `subject` carries a
 * short label since SMS has no subject line. Only called when the caller passes
 * emailType, so transactional one-offs can opt out of the ledger.
 */
/**
 * Public HTTPS base for Twilio to POST delivery receipts back to.
 * Mirrors buildWebhookUrl in app/api/sms/webhook/route.ts so the signature
 * Twilio computes matches the URL that route validates against.
 */
function statusCallbackUrl(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (!siteUrl) return null;
  const base = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
  if (!base.startsWith("https://")) return null;
  return `${base}/api/sms/status`;
}

async function logSms(params: {
  to: string;
  body: string;
  emailType: string;
  recipientType?: string;
  providerId?: string;
  status: "sent" | "failed";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  /** Twilio message SID. Stored in resend_id, the existing provider-message-id
   *  column, so the status callback has a key to find this row by and SMS reads
   *  symmetrically with email. No collision risk: Resend ids are UUIDs, Twilio
   *  SIDs are prefixed SM/MM.
   *
   *  Note: resend_id is NOT indexed on email_log (024 indexes recipient,
   *  email_type, created_at, provider_id, status, recipient_type; 051 adds
   *  first_opened_at and bounced_at). At ~1k rows the callback's lookup is a
   *  cheap scan. Worth an index if SMS volume grows. */
  providerMessageId?: string;
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
      resend_id: params.providerMessageId ?? null,
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
  const { to, body, recipientProfileId, notificationType, emailType, recipientType, recipientLogProfileId, metadata, requireMobile } = options;

  // Do-Not-Contact kill switch — cross-channel HARD suppression (admin-managed).
  // A number here has asked to be removed from all Olera comms. Fails open.
  if (await isPhoneDoNotContact(to)) {
    console.log(`[sms] Skipped to ${to} - on do-not-contact list`);
    if (emailType) {
      await logSms({ to, body, emailType, recipientType, providerId: recipientLogProfileId, status: "failed", errorMessage: "Suppressed: do-not-contact list", metadata });
    }
    return { success: true, skipped: true };
  }

  // Check notification preferences if profile ID and type provided
  if (recipientProfileId && notificationType) {
    const shouldSend = await shouldSendNotification(recipientProfileId, notificationType, "sms");
    if (!shouldSend) {
      console.log(`[sms] Skipped to ${to} - user preference disabled for ${notificationType}`);
      return { success: true, skipped: true };
    }
  }

  // Line-type gate — deliberately LAST of the three checks, because it is the
  // only one that can cost money (a Twilio Lookup on a cache miss). No point
  // paying to classify a number we were already going to skip. Fails open.
  if (requireMobile) {
    const { isSmsCapable } = await import("@/lib/sms/line-type.server");
    if (!(await isSmsCapable(to))) {
      console.log(`[sms] Skipped to ${to} - number cannot receive SMS (landline/VoIP)`);
      if (emailType) {
        await logSms({ to, body, emailType, recipientType, providerId: recipientLogProfileId, status: "failed", errorMessage: "Skipped: number cannot receive SMS", metadata });
      }
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
    // statusCallback is what turns "we handed it to Twilio" into "the carrier
    // actually delivered it". Without it every row reads `sent` forever, which
    // is not a cosmetic gap: before the 10DLC campaign cleared in July 2026 the
    // carriers silently dropped ~80% of our texts (error 30034) while our own
    // log said `sent`. Only set when a public HTTPS base URL exists — Twilio
    // cannot reach localhost, and passing an unreachable callback just produces
    // noise in the Twilio error log.
    const callbackUrl = statusCallbackUrl();
    const msg = await client.messages.create({
      from,
      to,
      body,
      ...(callbackUrl ? { statusCallback: callbackUrl } : {}),
    });
    if (emailType) {
      await logSms({
        to,
        body,
        emailType,
        recipientType,
        providerId: recipientLogProfileId,
        status: "sent",
        metadata,
        // The Twilio SID is the only key the status callback carries back, so
        // without storing it here a callback has no row to update.
        providerMessageId: msg.sid,
      });
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
 * Returns null if the number cannot be dialed.
 *
 * Counting digits is not enough. This used to accept any ten digits and put
 * "+1" on the front, which manufactured numbers that no carrier can route --
 * see the worked example in lib/phone.ts. Callers all handle null already, and
 * a null is strictly better than a send that fails silently at Twilio: the
 * claim flow, for one, answers it with "use email verification instead".
 */
export function normalizeUSPhone(phone: string): string | null {
  const local = usPhoneDigits(phone);
  return local ? `+1${local}` : null;
}

/**
 * Mask a phone number for display: +1213****970
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "****";
  return `+${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

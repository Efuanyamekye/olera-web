import { createClient } from "@supabase/supabase-js";

type Channel = "email" | "sms" | "whatsapp";

interface NotificationPrefs {
  [key: string]: {
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
}

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Check if a notification should be sent based on user preferences.
 *
 * IMPORTANT: Only checks activity-based notifications (those in EMAIL_TYPE_TO_PREF_KEY).
 * Marketing and transactional emails bypass this check and always send.
 *
 * @param profileId - The recipient's business_profiles.id
 * @param notificationType - The preference key (e.g., 'messages_and_responses', 'new_leads')
 * @param channel - The notification channel ('email', 'sms', 'whatsapp')
 * @returns true if notification should be sent (default: true)
 */
export async function shouldSendNotification(
  profileId: string,
  notificationType: string,
  channel: Channel
): Promise<boolean> {
  try {
    const db = getServiceDb();
    if (!db) {
      console.warn("[notification-prefs] No database connection, defaulting to send");
      return true;
    }

    const { data: profile, error } = await db
      .from("business_profiles")
      .select("metadata")
      .eq("id", profileId)
      .single();

    if (error || !profile?.metadata) {
      // Default: send if we can't fetch preferences
      return true;
    }

    const metadata = profile.metadata as Record<string, unknown>;
    const prefs = metadata.notification_prefs as NotificationPrefs | undefined;

    if (!prefs) {
      // No preferences set, default to send
      return true;
    }

    const notifPref = prefs[notificationType];
    if (!notifPref) {
      // No preference for this notification type, default to send
      return true;
    }

    // If explicitly set to false, don't send
    // If undefined or true, send
    return notifPref[channel] !== false;
  } catch (error) {
    console.error("[notification-prefs] Error checking preferences:", error);
    // Default: send on error to avoid blocking notifications
    return true;
  }
}

/**
 * Mapping of email types to notification preference keys.
 * Only activity-based notifications are listed here.
 * Marketing/transactional emails are NOT in this map and always send.
 *
 * Some email types need recipientType to determine the correct preference key
 * (e.g., 'new_message' goes to both families and providers with different pref keys).
 */
export const EMAIL_TYPE_TO_PREF_KEY: Record<string, { prefKey: string; profileType: "family" | "organization" | "caregiver" }> = {
  // Family notifications
  new_message_to_family: { prefKey: "messages_and_responses", profileType: "family" },
  connection_response: { prefKey: "messages_and_responses", profileType: "family" },
  provider_reach_out: { prefKey: "match_updates", profileType: "family" },

  // Provider/Organization notifications
  ad_boost_lead_delivered: { prefKey: "new_leads", profileType: "organization" },
  ad_boost_campaign_launched: { prefKey: "new_leads", profileType: "organization" },
  ad_boost_traction: { prefKey: "new_leads", profileType: "organization" },
  ad_boost_promo_complete: { prefKey: "new_leads", profileType: "organization" },
  connection_request: { prefKey: "new_leads", profileType: "organization" },
  new_review: { prefKey: "reviews_and_questions", profileType: "organization" },
  question_received: { prefKey: "reviews_and_questions", profileType: "organization" },
  new_message_to_provider: { prefKey: "messages", profileType: "organization" },

  // Caregiver/Student notifications
  interview_request: { prefKey: "interview_requests", profileType: "caregiver" },
  interview_proposed: { prefKey: "interview_requests", profileType: "caregiver" },
  application_response: { prefKey: "application_updates", profileType: "caregiver" },
};

/**
 * Email types that vary by recipient type.
 * These need the recipientType to resolve the correct preference key.
 */
const RECIPIENT_DEPENDENT_TYPES: Record<string, Record<string, string>> = {
  new_message: {
    family: "messages_and_responses",
    provider: "messages",
  },
};

/**
 * Check if an email type is controllable by user preferences.
 * Returns false for marketing/transactional emails (they always send).
 *
 * @param emailType - The email type from the send function
 * @param recipientType - Optional recipient type for context-dependent email types
 * @returns true if the notification is user-controllable
 */
export function isControllableNotification(emailType: string, recipientType?: string): boolean {
  // Check direct mapping first
  if (emailType in EMAIL_TYPE_TO_PREF_KEY) return true;
  // Check recipient-dependent types
  if (emailType in RECIPIENT_DEPENDENT_TYPES && recipientType) {
    return recipientType in RECIPIENT_DEPENDENT_TYPES[emailType];
  }
  return false;
}

/**
 * Get the preference key for a given email type.
 * Returns null for non-controllable (marketing/transactional) emails.
 *
 * @param emailType - The email type from the send function
 * @param recipientType - Optional recipient type for context-dependent email types
 * @returns The preference key to check, or null
 */
export function getPrefKeyForEmailType(emailType: string, recipientType?: string): string | null {
  // Check direct mapping first
  const directMapping = EMAIL_TYPE_TO_PREF_KEY[emailType];
  if (directMapping) return directMapping.prefKey;

  // Check recipient-dependent types
  if (emailType in RECIPIENT_DEPENDENT_TYPES && recipientType) {
    return RECIPIENT_DEPENDENT_TYPES[emailType][recipientType] ?? null;
  }

  return null;
}

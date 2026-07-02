import { createClient } from "@supabase/supabase-js";

/**
 * Do-Not-Contact kill switch (see supabase/migrations/128_do_not_contact.sql).
 *
 * An email or phone on this list has explicitly asked to be removed from ALL
 * Olera communications (typically an angry reply to cold provider outreach).
 * Unlike provider_unsubscribes (per-channel, self-serve) this is an admin-
 * controlled, cross-channel HARD suppression.
 *
 * Enforcement is centralized so no individual sender can bypass it:
 *   • lib/email.ts sendEmail()  — checks isEmailDoNotContact() (non-auth mail)
 *   • lib/twilio.ts sendSMS()   — checks isPhoneDoNotContact()
 *
 * Both checks FAIL OPEN: any config/DB error returns false (send proceeds).
 * A transient error must never silently kill all mail/SMS globally — the list
 * is small and the reputational cost of one extra send is far lower than
 * dropping every message on a blip.
 */

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * True if this exact email address is on the do-not-contact list.
 * Address is lowercased/trimmed to match how the admin UI stores it.
 */
export async function isEmailDoNotContact(email: string): Promise<boolean> {
  try {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    const db = getServiceDb();
    if (!db) return false;
    const { data } = await db
      .from("do_not_contact")
      .select("id")
      .eq("email", normalized)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error("[do-not-contact] Email check failed (sending anyway):", err);
    return false;
  }
}

/**
 * True if this phone number is on the do-not-contact list. Numbers are stored
 * normalized to their last 10 digits (US country code dropped) by the admin API,
 * so an incoming "+15125551234" / "(512) 555-1234" matches a stored "5125551234".
 */
export async function isPhoneDoNotContact(phone: string): Promise<boolean> {
  try {
    const last10 = phone.replace(/\D/g, "").slice(-10);
    if (last10.length !== 10) return false;
    const db = getServiceDb();
    if (!db) return false;
    const { data } = await db
      .from("do_not_contact")
      .select("id")
      .eq("phone", last10)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error("[do-not-contact] Phone check failed (sending anyway):", err);
    return false;
  }
}

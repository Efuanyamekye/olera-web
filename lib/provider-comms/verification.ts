export const VERIFICATION_REMINDER_EMAIL_TYPE = "verification_reminder_21d";
export function verificationReminderEligibility(profile: {
  type: string; email: string | null; claimed_at: string | null;
  verification_state: string | null; metadata: Record<string, unknown> | null;
}, now = Date.now()): string | null {
  const meta = profile.metadata ?? {};
  if (!["organization", "caregiver"].includes(profile.type)) return "unsupported_profile";
  if (profile.verification_state !== "unverified") return "verification_not_needed";
  if (meta.admin_archived === true) return "archived";
  if (meta.verification_reminder_21d_sent || meta.verification_reminder_21d_attempt_id) return "already_processed";
  if (!profile.email) return "no_email";
  const claimed = Date.parse(profile.claimed_at ?? "");
  if (!Number.isFinite(claimed) || now - claimed < 21 * 86_400_000) return "not_due";
  return null;
}

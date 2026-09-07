import { stateToTimezone } from "../sms/quiet-hours";

export const NOTIFICATION_DELAY_HOURS = 72;
export const NOTIFICATION_EMAIL_TYPE = "notification_setup_nudge";
export function notificationEligibility(profile: {
  type: string; phone: string | null; email: string | null; metadata: Record<string, unknown> | null;
}, now = Date.now()): string | null {
  const meta = profile.metadata ?? {};
  if (profile.type !== "organization") return "unsupported_profile";
  if (meta.admin_archived === true) return "archived";
  if (meta.notification_nudge_attempt_id || meta.notification_nudge_sent) return "already_processed";
  const prefs = meta.notification_prefs as Record<string, Record<string, boolean>> | undefined;
  if (prefs?.new_leads?.sms === true) return "already_enabled";
  if (!profile.email) return "no_email";
  const digits = (profile.phone ?? "").replace(/\D/g, "");
  if (!(digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))) return "no_usable_phone";
  const preview = Date.parse(String(meta.profile_preview_nudge_sent_at ?? ""));
  if (!meta.profile_preview_nudge_sent || !Number.isFinite(preview)) return "no_preview";
  if (now - preview < NOTIFICATION_DELAY_HOURS * 3_600_000) return "not_due";
  return null;
}
export function notificationBusinessHours(now: Date, state: string | null): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: stateToTimezone(state) ?? "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const day = parts.find(p => p.type === "weekday")?.value;
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  return day !== "Sat" && day !== "Sun" && hour >= 9 && hour < 17;
}

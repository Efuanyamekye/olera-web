/** Client-safe definitions and accounting shared by the onboarding report. */
export const ONBOARDING_MESSAGES = [
  {
    type: "provider_welcome",
    label: "Welcome",
    timing: "After claim · next business-hour run",
    action: "Open the provider experience",
    automation: "provider-welcome",
  },
  {
    type: "profile_preview_nudge",
    label: "Profile preview",
    timing: "48 hours after welcome · business hours",
    action: "Review and improve their profile",
    automation: "profile-preview-nudge",
  },
  {
    type: "notification_setup_nudge",
    label: "Notifications",
    timing: "72 hours after profile preview · business hours",
    action: "Choose notification preferences",
    automation: "notification-setup-nudge",
  },
] as const;
export const ONBOARDING_EMAIL_TYPES = ONBOARDING_MESSAGES.map((m) => m.type);
export type OnboardingType = (typeof ONBOARDING_MESSAGES)[number]["type"];
export type Source = "outreach" | "unknown" | "unresolved";
export const SOURCE_LABELS: Record<Source, string> = {
  outreach: "Outreach before claim",
  unknown: "Source unknown",
  unresolved: "Profile unresolved",
};
export type DeliveryState =
  | "suppressed"
  | "failed"
  | "pending"
  | "accepted"
  | "delivered"
  | "bounced"
  | "complained";
export interface EmailRecord {
  id: string;
  provider_id: string | null;
  recipient: string;
  email_type: string;
  status: string | null;
  error_message: string | null;
  resend_id: string | null;
  created_at: string;
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}
export function suppressionReason(error: string | null): string | null {
  const value = (error ?? "").toLowerCase();
  if (value === "nudge_cap") return "Frequency limit";
  if (!/^(suppressed:|skipped:)/.test(value)) return null;
  if (value.includes("verified undeliverable"))
    return "Address verified undeliverable";
  if (value.includes("complaint")) return "Spam complaint on file";
  if (value.includes("bounc")) return "Bounce history";
  if (value.includes("do-not-contact")) return "Do not contact";
  if (value.includes("preference")) return "Notification preference";
  return "Other suppression";
}
type DeliveryRecord = Pick<
  EmailRecord,
  | "status"
  | "error_message"
  | "resend_id"
  | "delivered_at"
  | "bounced_at"
  | "complained_at"
>;
export function deliveryState(row: DeliveryRecord): DeliveryState {
  if (suppressionReason(row.error_message)) return "suppressed";
  if (row.complained_at || row.status === "complained") return "complained";
  if (row.bounced_at || row.status === "bounced") return "bounced";
  if (row.delivered_at) return "delivered";
  if (row.status === "failed") return "failed";
  if (
    row.resend_id ||
    ["sent", "delivered", "opened", "clicked"].includes(row.status ?? "")
  )
    return "accepted";
  return "pending";
}
/** A reserved/suppressed/failed attempt is not a dispatched message. */
export function isAcceptedEmail(row: DeliveryRecord): boolean {
  return !["suppressed", "failed", "pending"].includes(deliveryState(row));
}
export function isInternalRecipient(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@olera.care");
}
export function outreachBeforeClaim(
  claimedAt: string | null,
  outreachDates: string[],
): boolean {
  const claim = Date.parse(claimedAt ?? "");
  return (
    Number.isFinite(claim) &&
    outreachDates.some((date) => {
      const at = Date.parse(date);
      return Number.isFinite(at) && at <= claim;
    })
  );
}
export interface Recipient {
  id: string;
  providerKey: string;
  providerName: string;
  directoryId: string | null;
  email: string;
  type: OnboardingType;
  attemptedAt: string;
  source: Source;
  state: DeliveryState;
  reason: string | null;
  accepted: boolean;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  settingsViewed?: boolean;
  preferenceSaved?: boolean;
  smsEnabled?: boolean;
}
export interface Performance {
  type: OnboardingType;
  attempts: number;
  providers: number;
  accepted: number;
  delivered: number;
  opened: number;
  clicked: number;
  settingsViewed: number;
  preferenceSaved: number;
  smsEnabled: number;
  suppressed: number;
  failed: number;
  pending: number;
  bounced: number;
  complained: number;
}
export function summarizeRecipients(rows: Recipient[]): Performance[] {
  return ONBOARDING_MESSAGES.map((message) => {
    const group = rows.filter((row) => row.type === message.type);
    const count = (state: DeliveryState) =>
      group.filter((row) => row.state === state).length;
    return {
      type: message.type,
      attempts: group.length,
      providers: new Set(group.map((row) => row.providerKey)).size,
      accepted: group.filter((row) => row.accepted).length,
      delivered: group.filter((row) => row.delivered).length,
      opened: group.filter((row) => row.opened).length,
      clicked: group.filter((row) => row.clicked).length,
      settingsViewed: group.filter((row) => row.settingsViewed).length,
      preferenceSaved: group.filter((row) => row.preferenceSaved).length,
      smsEnabled: group.filter((row) => row.smsEnabled).length,
      suppressed: count("suppressed"),
      failed: count("failed"),
      pending: count("pending"),
      bounced: count("bounced"),
      complained: count("complained"),
    };
  });
}
export interface ProviderCommsReport {
  generatedAt: string;
  range: { from: string; to: string };
  excludedInternal: number;
  unresolved: number;
  recipients: Recipient[];
}

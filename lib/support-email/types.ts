export type SupportEmailState = "needs_reply" | "handled" | "snoozed" | "escalated" | "noise";
export type SupportEmailCategory =
  | "care_seeker"
  | "provider"
  | "partner"
  | "press"
  | "marketing"
  | "automated"
  | "legal"
  | "security"
  | "billing"
  | "voicemail"
  | "internal"
  | "other";
export type SupportEmailPriority = "low" | "normal" | "high" | "urgent";
export type SupportEmailAction =
  | "draft_reply"
  | "archive"
  | "unsubscribe"
  | "escalate"
  | "call_back"
  | "provider_removal"
  | "do_not_contact"
  | "create_task"
  | "no_action";

export interface SupportRecommendation {
  category: SupportEmailCategory;
  priority: SupportEmailPriority;
  summary: string;
  reason: string;
  confidence: number;
  suggestedAction: SupportEmailAction;
  suggestedOwner: string | null;
  suggestedDraft: string | null;
  riskFlags: string[];
  model: string;
}
export interface MatchedSupportIdentity {
  profileId: string | null;
  profileType: "family" | "provider" | "student" | null;
  profileName: string | null;
  providerId: string | null;
}

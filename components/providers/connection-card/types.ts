// ============================================================
// ConnectionCard Types
// ============================================================

export type CardState =
  | "default" // State 1: All users on landing
  | "intent" // State 2: Intent capture (steps 1-3)
  | "identity" // State 2 continued: email + profile basics
  | "returning" // State 3: Returning user (not reachable until auth)
  | "confirmation" // State 4: Request sent
  | "pending" // State 5: Existing request
  | "inactive"; // State 6: Provider not accepting

export type IntentStep = 0 | 1 | 2;

export type IdentityStep = 0 | 1; // 0 = email+name, 1 = contact+phone

export type CareRecipient = "self" | "loved_one";

export type CareTypeValue =
  | "companion"
  | "personal"
  | "memory"
  | "skilled_nursing"
  | "other";

export type UrgencyValue =
  | "asap"
  | "within_month"
  | "few_months"
  | "researching";

export type ContactPreference = "call" | "text" | "email";

export interface IntentData {
  careRecipient: CareRecipient | null;
  careType: CareTypeValue | null;
  careTypeOtherText: string;
  urgency: UrgencyValue | null;
  additionalNotes: string;
}

export interface IdentityData {
  email: string;
  firstName: string;
  lastName: string;
  contactPreference: ContactPreference | null;
  phone: string;
}

export interface ConnectionCardProps {
  providerId: string;
  providerName: string;
  providerSlug: string;
  priceRange: string | null;
  oleraScore: number | null;
  reviewCount: number | undefined;
  phone: string | null;
  acceptedPayments: string[];
  careTypes: string[];
  isActive: boolean;
  responseTime: string | null; // null in v1
}

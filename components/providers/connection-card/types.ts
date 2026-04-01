// ============================================================
// ConnectionCard Types
// ============================================================

export type CardState =
  | "loading" // Logged-in users while DB queries run
  | "default" // State 1: Form visible (email, name, phone, message)
  | "intent" // State 2: Intent capture (2 steps for logged-in, 3 for guest)
  | "email_capture" // State 2b: Guest email capture (after intent)
  | "returning" // State 3: Returning user (prior connection or past)
  | "enrichment" // Post-submit: optional who/when enrichment
  | "connected" // State 4: Existing connection (pending or accepted)
  | "provider_email_block"; // Guest email belongs to provider account

export type IntentStep = 0 | 1;

export type CareRecipient = "self" | "parent" | "spouse" | "other";

export type CareTypeValue =
  | "assisted_living"
  | "home_care"
  | "memory_care"
  | "home_health";

export type UrgencyValue =
  | "asap"
  | "within_month"
  | "few_months"
  | "researching";

export interface IntentData {
  careRecipient: CareRecipient | null;
  careType: CareTypeValue | null;
  urgency: UrgencyValue | null;
}

export interface InquiryFormData {
  email: string;
  fullName: string;
  phone: string;
  message: string;
}

export interface ConnectionCardProps {
  providerId: string;
  providerName: string;
  providerSlug: string;
  priceRange: string | null;
  reviewCount: number | undefined;
  phone: string | null;
  acceptedPayments: string[];
  careTypes: string[];
  responseTime: string | null; // null in v1
  /** Called after a new connection is successfully created (not on duplicates). */
  onConnectionCreated?: (connectionId: string) => void;
}

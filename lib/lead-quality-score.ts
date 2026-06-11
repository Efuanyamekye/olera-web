/**
 * Lead Quality Score - Intelligence layer for provider leads
 *
 * Calculates a 0-100 score indicating how "ready to hire" a lead is.
 * Designed to help providers prioritize high-quality leads and increase
 * the view-to-connect conversion rate.
 *
 * Score Tiers:
 * - 85-100: Hot (🔥) - Ready to hire, immediate timeline, phone provided
 * - 65-84:  Strong (⭐) - High interest, near-term timeline
 * - 40-64:  Good (📊) - Engaged prospect, has timeline
 * - 0-39:   Exploring (🔍) - Early stage, just browsing
 */

import type { FamilyMetadata } from "@/lib/types";

export interface LeadQualityInput {
  // From family business_profile
  phone?: string | null;
  displayName?: string | null;
  careTypes?: string[] | null;

  // From family metadata
  metadata?: FamilyMetadata | null;

  // From connection metadata.thread
  thread?: Array<{
    from_profile_id: string;
    text?: string;
    is_auto_reply?: boolean;
  }> | null;

  // Family's profile ID (for checking thread messages)
  familyProfileId?: string | null;

  // Number of connections this family has made (active shopper signal)
  connectionCount?: number;
}

export interface LeadQualityResult {
  /** 0-100 score */
  score: number;
  /** Human-readable tier: "hot" | "strong" | "good" | "exploring" */
  tier: "hot" | "strong" | "good" | "exploring";
  /** Display label with emoji */
  label: string;
  /** Breakdown of points earned for debugging/display */
  breakdown: {
    intent: number;
    contactReadiness: number;
    profileQuality: number;
    engagement: number;
  };
  /** Key highlights to show providers (what makes this lead good) */
  highlights: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING WEIGHTS
// ═══════════════════════════════════════════════════════════════════════════

// Tier 1: Intent (35 points max)
// Timeline is the strongest signal of hiring readiness
// Handle both raw values (from metadata) and normalized values
const INTENT_SCORES: Record<string, number> = {
  // Immediate / ASAP variants
  immediate: 35,
  asap: 35,
  // Within 1 month variants
  within_1_month: 25,
  within_month: 25,
  // Within 3 months variants
  within_3_months: 12,
  few_months: 12,
  // Exploring variants
  exploring: 0,
  researching: 0,
};

// Tier 2: Contact Readiness (25 points max)
const CONTACT_PHONE = 15; // Phone = ready to be called
const CONTACT_REAL_NAME = 10; // Real name vs "Care Seeker" placeholder

// Tier 3: Profile Quality (25 points max)
const PROFILE_PAYMENT_METHODS = 10; // Knows how to pay
const PROFILE_CARE_NEEDS = 7; // Specific needs
const PROFILE_ABOUT_SITUATION = 5; // Detailed context
const PROFILE_RELATIONSHIP = 3; // Basic context

// Tier 4: Engagement (15 points max)
const ENGAGEMENT_SENT_MESSAGE = 10; // Family initiated conversation
const ENGAGEMENT_ACTIVE_SHOPPER = 5; // Multiple inquiries = serious

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCORING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function calculateLeadQualityScore(input: LeadQualityInput): LeadQualityResult {
  const meta = input.metadata ?? {};
  const highlights: string[] = [];

  // ─── Tier 1: Intent (35 max) ───────────────────────────────────────────────
  let intentScore = 0;
  const timeline = meta.timeline as string | undefined;

  if (timeline && timeline in INTENT_SCORES) {
    intentScore = INTENT_SCORES[timeline];

    // Add highlight for urgent timelines
    if (intentScore === 35) {
      highlights.push("Hiring immediately");
    } else if (intentScore === 25) {
      highlights.push("Hiring within a month");
    }
  }

  // ─── Tier 2: Contact Readiness (25 max) ────────────────────────────────────
  let contactScore = 0;

  // Phone provided
  if (input.phone?.trim()) {
    contactScore += CONTACT_PHONE;
    highlights.push("Phone provided");
  }

  // Real name (not "Care Seeker" placeholder)
  const hasRealName =
    input.displayName &&
    input.displayName.toLowerCase() !== "care seeker" &&
    input.displayName.trim().length > 0;

  if (hasRealName) {
    contactScore += CONTACT_REAL_NAME;
  }

  // ─── Tier 3: Profile Quality (25 max) ──────────────────────────────────────
  let profileScore = 0;

  // Payment methods filled
  if ((meta.payment_methods?.length ?? 0) > 0) {
    profileScore += PROFILE_PAYMENT_METHODS;
    highlights.push("Payment ready");
  }

  // Care needs specified
  if ((meta.care_needs?.length ?? 0) > 0) {
    profileScore += PROFILE_CARE_NEEDS;
  }

  // About situation written
  if (meta.about_situation?.trim()) {
    profileScore += PROFILE_ABOUT_SITUATION;
    highlights.push("Detailed request");
  }

  // Relationship to care recipient
  if (meta.relationship_to_recipient || meta.who_needs_care) {
    profileScore += PROFILE_RELATIONSHIP;
  }

  // ─── Tier 4: Engagement (15 max) ───────────────────────────────────────────
  let engagementScore = 0;

  // Family sent a message in thread (not auto-reply)
  if (input.thread && input.familyProfileId) {
    const familySentMessage = input.thread.some(
      (m) =>
        m.from_profile_id === input.familyProfileId &&
        !m.is_auto_reply &&
        m.text?.trim()
    );
    if (familySentMessage) {
      engagementScore += ENGAGEMENT_SENT_MESSAGE;
      highlights.push("Sent a message");
    }
  }

  // Active shopper (multiple connections)
  if ((input.connectionCount ?? 0) >= 2) {
    engagementScore += ENGAGEMENT_ACTIVE_SHOPPER;
  }

  // ─── Calculate Total ───────────────────────────────────────────────────────
  const totalScore = intentScore + contactScore + profileScore + engagementScore;

  // Determine tier and label (verdicts, not scores)
  let tier: LeadQualityResult["tier"];
  let label: string;

  if (totalScore >= 85) {
    tier = "hot";
    label = "Ready to hire";
  } else if (totalScore >= 65) {
    tier = "strong";
    label = "Actively looking";
  } else if (totalScore >= 40) {
    tier = "good";
    label = "Exploring options";
  } else {
    tier = "exploring";
    label = "Just browsing";
  }

  return {
    score: totalScore,
    tier,
    label,
    breakdown: {
      intent: intentScore,
      contactReadiness: contactScore,
      profileQuality: profileScore,
      engagement: engagementScore,
    },
    highlights: highlights.slice(0, 3), // Max 3 highlights
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a short description of what makes a lead high quality.
 * Used for tooltip/explanation text.
 */
export function getLeadQualityExplanation(tier: LeadQualityResult["tier"]): string {
  switch (tier) {
    case "hot":
      return "High priority: Needs care immediately, shared phone number, and has a complete profile. Most likely to hire.";
    case "strong":
      return "Good prospect: Planning to hire soon and has shared detailed information about their care needs.";
    case "good":
      return "Interested: Has a timeline and shared some information. May need follow-up to understand their needs.";
    case "exploring":
      return "Early stage: Just starting their search. May take longer to make a decision.";
  }
}

/**
 * Get tier color for UI display.
 */
export function getLeadQualityColor(tier: LeadQualityResult["tier"]): {
  bg: string;
  text: string;
  border: string;
  iconBg: string;
  iconText: string;
} {
  switch (tier) {
    case "hot":
      return {
        bg: "bg-rose-50",
        text: "text-rose-700",
        border: "border-rose-200",
        iconBg: "bg-rose-200/70",  // More visible on rose-50 background
        iconText: "text-rose-600",
      };
    case "strong":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        iconBg: "bg-amber-200/70",  // More visible
        iconText: "text-amber-600",
      };
    case "good":
      return {
        bg: "bg-sky-50",
        text: "text-sky-700",
        border: "border-sky-200",
        iconBg: "bg-sky-200/70",  // More visible
        iconText: "text-sky-600",
      };
    case "exploring":
      return {
        bg: "bg-gray-50",
        text: "text-gray-600",
        border: "border-gray-200",
        iconBg: "bg-gray-200/70",  // More visible
        iconText: "text-gray-500",
      };
  }
}

/**
 * Get the icon component props for each tier.
 * Returns SVG path data for the icon.
 */
export function getLeadQualityIcon(tier: LeadQualityResult["tier"]): {
  type: "flame" | "star" | "search" | "clock";
} {
  switch (tier) {
    case "hot":
      return { type: "flame" };
    case "strong":
      return { type: "star" };
    case "good":
      return { type: "search" };
    case "exploring":
      return { type: "clock" };
  }
}

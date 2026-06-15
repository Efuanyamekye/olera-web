/**
 * Quick Reply Configuration
 *
 * A low-commitment engagement system that helps providers initiate conversations
 * with families through a single click, with guided follow-up prompts.
 */

export const QUICK_REPLY_CONFIG = {
  question: "How much help are you looking for?",
  options: [
    "A few hours a week",
    "Daily",
    "Full-time or live-in",
    "Still figuring it out",
  ],
} as const;

export type QuickReplyOption = (typeof QUICK_REPLY_CONFIG.options)[number];

/**
 * Quick reply request metadata stored on connection
 */
export interface QuickReplyRequest {
  question: string;
  options: readonly string[];
  sent_at: string;
  answered_at?: string;
  dismissed_at?: string;
}

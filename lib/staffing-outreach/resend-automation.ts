/**
 * Resend Automation Integration for Staffing Outreach V2
 *
 * This module handles triggering Resend Automations for automated email sequences.
 * Email templates live in Resend Dashboard - this code triggers the automation
 * with dynamic data (provider name, university, etc.)
 *
 * Automation: "Staffing Outreach Sequence"
 * Trigger: staffing.sequence.start event
 *
 * Sequence:
 *   1. Email 1 (Initial outreach) - immediately
 *   2. Wait 3 days
 *   3. Email 2 (Follow-up) - if not enrolled
 */

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Resend Automation audience ID - set this in Resend Dashboard
const STAFFING_AUTOMATION_AUDIENCE_ID = process.env.RESEND_STAFFING_AUDIENCE_ID ?? "";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  if (!RESEND_API_KEY) return null;
  resendClient = new Resend(RESEND_API_KEY);
  return resendClient;
}

export interface StartSequenceParams {
  /** Provider's general email address */
  email: string;
  /** Staffing outreach row ID */
  outreachId: string;
  /** Provider ID */
  providerId: string;
  /** Provider name for email personalization */
  providerName: string;
  /** University name for email personalization */
  universityName: string;
  /** Service area (e.g., "Austin area") for email personalization */
  serviceArea: string;
  /** Batch ID for tracking */
  batchId: string;
}

export interface StartSequenceResult {
  success: boolean;
  contactId?: string;
  error?: string;
}

/**
 * Start the automated email sequence for a provider.
 *
 * This adds the contact to the Resend Automation audience, which triggers
 * the automation to start sending emails.
 *
 * The automation will:
 * 1. Send Email 1 immediately
 * 2. Wait 3 days
 * 3. Send Email 2 (if not enrolled)
 *
 * Webhooks will update our database as emails are sent/opened/clicked.
 */
export async function startEmailSequence(
  params: StartSequenceParams
): Promise<StartSequenceResult> {
  const resend = getResend();
  if (!resend) {
    console.error("[resend-automation] RESEND_API_KEY not configured");
    return { success: false, error: "Resend not configured" };
  }

  if (!STAFFING_AUTOMATION_AUDIENCE_ID) {
    console.error("[resend-automation] RESEND_STAFFING_AUDIENCE_ID not configured");
    return { success: false, error: "Automation audience not configured" };
  }

  try {
    // Add contact to the automation audience with custom fields
    // Resend Automations trigger based on audience membership
    const { data, error } = await resend.contacts.create({
      audienceId: STAFFING_AUTOMATION_AUDIENCE_ID,
      email: params.email,
      firstName: params.providerName,
      unsubscribed: false,
      // Custom data fields used in email templates
      // Note: Resend uses these in the {{custom_field}} syntax in templates
    });

    if (error) {
      console.error("[resend-automation] Failed to add contact:", error);
      return { success: false, error: error.message };
    }

    // Log success
    console.log(
      `[resend-automation] Started sequence for ${params.email} (outreach: ${params.outreachId})`
    );

    return {
      success: true,
      contactId: data?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[resend-automation] Error starting sequence:", message);
    return { success: false, error: message };
  }
}

/**
 * Remove a contact from the automation audience.
 * Use this when:
 * - Provider enrolls (no need for more emails)
 * - Provider is marked as closed/bounced
 * - Email bounces
 */
export async function stopEmailSequence(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  if (!resend || !STAFFING_AUTOMATION_AUDIENCE_ID) {
    return { success: false, error: "Resend not configured" };
  }

  try {
    // Remove contact from audience to stop the automation
    await resend.contacts.remove({
      audienceId: STAFFING_AUTOMATION_AUDIENCE_ID,
      email,
    });

    console.log(`[resend-automation] Stopped sequence for ${email}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[resend-automation] Error stopping sequence:", message);
    return { success: false, error: message };
  }
}

/**
 * Check if a contact is in the automation audience.
 */
export async function isInSequence(
  email: string
): Promise<{ inSequence: boolean; contactId?: string; error?: string }> {
  const resend = getResend();
  if (!resend || !STAFFING_AUTOMATION_AUDIENCE_ID) {
    return { inSequence: false, error: "Resend not configured" };
  }

  try {
    const { data } = await resend.contacts.get({
      audienceId: STAFFING_AUTOMATION_AUDIENCE_ID,
      email,
    });

    return {
      inSequence: !!data,
      contactId: data?.id,
    };
  } catch {
    // Contact not found is not an error, just means not in sequence
    return { inSequence: false };
  }
}

/**
 * Get sequence email templates for preview in the drawer.
 * These are the same templates used in Resend Automations.
 */
export function getSequenceEmailPreviews(params: {
  providerName: string;
  universityName: string;
  serviceArea: string;
}): { email1: { subject: string; body: string }; email2: { subject: string; body: string } } {
  const { providerName, universityName, serviceArea } = params;

  return {
    email1: {
      subject: `${universityName} Student Caregiver Program`,
      body: `Hello

I am hoping to reach the person who handles hiring to share more information on a pilot ${universityName} Student Caregiver Program.

My name is Dr. Logan DuBose. I am a physician-researcher working with the National Institute of Aging, a small business owner, and affiliate faculty at ${universityName}. I am currently working on a pilot program to match pre-nursing and pre-medical students with care agency jobs so they can help improve community care worker turnover and shortages, while gaining critical experience for their future careers as doctors and nurses.

Would you be interested in hearing more about this program? In pilot testing in the ${serviceArea}, I have seen potential for it to be an evergreen pipeline delivering vetted pre-health ${universityName} students seeking employment in caregiver roles.

Some materials to consider:
• Pilot website here (demo profiles): https://olera.care/medjobs/providers
• Demo video I made here: https://www.youtube.com/watch?v=ParY1tGaiew (~7 minutes long)
• Recent system improvements since the last pilot include a more robust candidate vetting and scheduling system, and the price point potentially being lowered to $50/month (however, for earlier adopters, I am not charging anything for a period of time, and instead would appreciate feedback and reviews of the system)
• Goal to send 5 new candidates a week with 1-3 solid hires per month in perpetuity

Please let me know if you have any questions, would like to meet, or if there is any interest in restarting the program. If I can get your team's buy-in, then I will begin recruitment for you at ${universityName} pre-nursing and pre-medical organizations this month (and could be sending vetted candidates for summer caregiving roles ASAP)!

Take care!

Best,
Logan`,
    },
    email2: {
      subject: `Quick follow-up – ${universityName} Student Program`,
      body: `Hi,

Just wanted to follow up in case this got buried.

We're starting to connect agencies with pre-nursing students from ${universityName} who are actively looking for caregiving roles.

Would it make sense to share a quick overview or schedule a brief call?

Best,
Logan`,
    },
  };
}

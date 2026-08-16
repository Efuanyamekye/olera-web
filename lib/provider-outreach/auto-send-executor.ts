/**
 * Server-only: execute one scheduled provider outreach email task.
 *
 * Used by the cron auto-send pipeline. Handles:
 *   1. Atomically claiming the task (status: pending → completed)
 *   2. Validating the provider is still in in_sequence stage
 *   3. Rendering and sending the email via Resend
 *   4. Logging touchpoints
 *   5. Handling failures gracefully
 */

import { getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import {
  renderEmail,
  buildContextFromProvider,
  getProviderGaps,
  formatGapList,
  getCityViews,
  PROVIDER_OUTREACH_EMAIL_TYPE,
  PROVIDER_OUTREACH_FROM,
  PROVIDER_OUTREACH_REPLY_TO,
  type ProviderOutreachTemplateKey,
} from "./index";
import { getDay0Template, shouldUseVariant } from "./variant-testing";
import { renderVariantEmail } from "./email-utils";

type DB = ReturnType<typeof getServiceClient>;

export interface ExecuteResult {
  task_id: string;
  outcome:
    | "sent"
    | "failed"
    | "skipped_stage_changed"
    | "skipped_no_email"
    | "skipped_suppressed"
    | "task_already_taken";
  error?: string;
}

/**
 * Try to atomically claim a single task. Returns the claimed row or null.
 * Uses optimistic locking: UPDATE ... WHERE status='pending'
 */
async function claimTask(
  db: DB,
  taskId: string
): Promise<null | {
  id: string;
  tracking_id: string;
  provider_id: string;
  template_key: ProviderOutreachTemplateKey;
  cadence_day: number;
  payload: Record<string, unknown>;
}> {
  const { data, error } = await db
    .from("provider_outreach_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "pending")
    .select("id, tracking_id, provider_id, template_key, cadence_day, payload")
    .maybeSingle();

  if (error || !data) return null;
  return data as {
    id: string;
    tracking_id: string;
    provider_id: string;
    template_key: ProviderOutreachTemplateKey;
    cadence_day: number;
    payload: Record<string, unknown>;
  };
}

/**
 * Mark a task as failed (revert from completed status).
 */
async function markTaskFailed(
  db: DB,
  taskId: string,
  error: string
): Promise<void> {
  const { data } = await db
    .from("provider_outreach_tasks")
    .select("payload")
    .eq("id", taskId)
    .single();

  const payload = (data?.payload ?? {}) as Record<string, unknown>;

  await db
    .from("provider_outreach_tasks")
    .update({
      status: "failed",
      completed_at: null,
      payload: { ...payload, outcome: "failed", error },
    })
    .eq("id", taskId);
}

/**
 * Annotate a completed task with outcome metadata.
 */
async function annotateOutcome(
  db: DB,
  taskId: string,
  outcome: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const { data } = await db
    .from("provider_outreach_tasks")
    .select("payload")
    .eq("id", taskId)
    .single();

  const payload = (data?.payload ?? {}) as Record<string, unknown>;

  await db
    .from("provider_outreach_tasks")
    .update({ payload: { ...payload, outcome, ...extra } })
    .eq("id", taskId);
}

/**
 * Log a touchpoint for this provider.
 */
async function logTouchpoint(
  db: DB,
  providerId: string,
  type: string,
  details: Record<string, unknown>
): Promise<void> {
  await db.from("provider_outreach_touchpoints").insert({
    provider_id: providerId,
    touchpoint_type: type,
    details,
    admin_user_id: null, // System action
    created_at: new Date().toISOString(),
  });
}

/**
 * Check if email is suppressed (bounced, unsubscribed, etc.)
 */
async function isEmailSuppressed(db: DB, email: string): Promise<boolean> {
  // Check email_verifications for invalid status
  const { data: verification } = await db
    .from("email_verifications")
    .select("status")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (verification?.status === "invalid" || verification?.status === "catch-all") {
    return true;
  }

  // Check do_not_contact list
  const { data: dnc } = await db
    .from("do_not_contact")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (dnc) {
    return true;
  }

  return false;
}

/**
 * Execute a single provider outreach email task.
 * Idempotent — calling twice for the same task is safe (second call returns task_already_taken).
 *
 * Race condition note: We intentionally claim the task BEFORE validating stage.
 * This is safer than the alternative:
 *   - If we checked stage first, a provider could claim between check and claim,
 *     and we'd send email to a now-claimed provider (bad!).
 *   - By claiming first, we lock the task, then validate. If stage changed,
 *     we skip sending and mark as "skipped_stage_changed" (correct!).
 */
export async function executeProviderOutreachTask(taskId: string): Promise<ExecuteResult> {
  const db = getServiceClient();

  // 1. Atomically claim the task (locks it so no duplicate sends)
  const claimed = await claimTask(db, taskId);
  if (!claimed) {
    return { task_id: taskId, outcome: "task_already_taken" };
  }

  const { tracking_id, provider_id, template_key, cadence_day, payload } = claimed;
  const recipientEmail = (payload.recipient_email as string) || "";

  // 2. Validate tracking record is still in in_sequence stage
  // If provider claimed/archived since task was queued, skip sending
  // Also fetch apollo_contact for personalized greeting
  const { data: tracking } = await db
    .from("provider_outreach_tracking")
    .select("stage, apollo_contact")
    .eq("id", tracking_id)
    .single();

  if (!tracking || tracking.stage !== "in_sequence") {
    await annotateOutcome(db, taskId, "skipped_stage_changed", {
      actual_stage: tracking?.stage ?? "not_found",
    });
    return { task_id: taskId, outcome: "skipped_stage_changed" };
  }

  // Extract Apollo contact for personalized greeting
  const apolloContact = tracking.apollo_contact as { first_name?: string } | null;

  // 3. Check if email is suppressed
  if (!recipientEmail) {
    await annotateOutcome(db, taskId, "skipped_no_email");
    return { task_id: taskId, outcome: "skipped_no_email" };
  }

  const suppressed = await isEmailSuppressed(db, recipientEmail);
  if (suppressed) {
    await annotateOutcome(db, taskId, "skipped_suppressed", { email: recipientEmail });
    return { task_id: taskId, outcome: "skipped_suppressed" };
  }

  // 4. Fetch provider data for email rendering
  const { data: provider } = await db
    .from("olera-providers")
    .select("provider_id, slug, provider_name, email, city, state, provider_category, lower_price, upper_price, contact_for_price, provider_images, phone, provider_description")
    .eq("provider_id", provider_id)
    .single();

  if (!provider) {
    await markTaskFailed(db, taskId, "Provider not found");
    return { task_id: taskId, outcome: "failed", error: "Provider not found" };
  }

  // 5. Build context and render email
  try {
    // Compute profile gaps for followup email
    const gaps = getProviderGaps({
      lower_price: provider.lower_price,
      upper_price: provider.upper_price,
      contact_for_price: provider.contact_for_price,
      provider_images: provider.provider_images,
      phone: provider.phone,
      provider_description: provider.provider_description,
    });
    const gapList = formatGapList(gaps);

    // Get city views for demand_loss email
    const cityViews = await getCityViews(provider.city, provider.provider_category, db);

    // Build decision_maker for personalized greeting
    const decisionMaker = apolloContact?.first_name ? {
      first_name: apolloContact.first_name,
      last_name: null,
      title: null,
    } : undefined;

    const context = buildContextFromProvider(
      {
        provider_id: provider.provider_id,
        name: provider.provider_name,
        email: recipientEmail,
        city: provider.city,
        state: provider.state,
        category: provider.provider_category,
        slug: provider.slug,
      },
      {
        gap_list: gapList,
        city_views: cityViews,
        decision_maker: decisionMaker,
      }
    );

    // Check if this is a Day 0 email with variant assigned
    const variantId = payload.variant_id as string | undefined;
    let rendered: { subject: string; html: string };

    if (shouldUseVariant(template_key) && variantId) {
      // Use variant template for Day 0 email with full layout
      const variantDraft = await getDay0Template(context, variantId);
      rendered = renderVariantEmail(variantDraft, context);
    } else {
      // Use standard template
      rendered = renderEmail(template_key, context);
    }

    // 6. Send via Resend
    const { success, error: sendError, emailLogId } = await sendEmail({
      to: recipientEmail,
      from: PROVIDER_OUTREACH_FROM,
      replyTo: PROVIDER_OUTREACH_REPLY_TO,
      subject: rendered.subject,
      html: rendered.html,
      emailType: PROVIDER_OUTREACH_EMAIL_TYPE,
      providerId: provider_id,
      metadata: {
        template_key,
        cadence_day,
      },
    });

    if (!success) {
      await markTaskFailed(db, taskId, sendError || "Send failed");
      return { task_id: taskId, outcome: "failed", error: sendError };
    }

    // 7. Annotate success and log touchpoint
    await annotateOutcome(db, taskId, "sent", {
      email_log_id: emailLogId,
      sent_at: new Date().toISOString(),
    });

    const touchpointDetails: Record<string, unknown> = {
      template_key,
      cadence_day,
      email: recipientEmail,
      email_log_id: emailLogId,
    };

    // Include variant info if this was a variant email
    if (variantId) {
      touchpointDetails.variant_id = variantId;
      touchpointDetails.variant_key = payload.variant_key;
    }

    await logTouchpoint(db, provider_id, "email_sent", touchpointDetails);

    return { task_id: taskId, outcome: "sent" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await markTaskFailed(db, taskId, errorMessage);
    return { task_id: taskId, outcome: "failed", error: errorMessage };
  }
}

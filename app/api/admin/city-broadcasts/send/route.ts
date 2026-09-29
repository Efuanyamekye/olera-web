/**
 * POST /api/admin/city-broadcasts/send
 *
 * Manually send a broadcast to selected providers.
 * Creates a broadcast event, sends emails, and tracks recipients.
 *
 * Body:
 *   - provider_ids: string[] (required, max 50)
 *   - event_type: "question_asked" or "profile_published" (required)
 *   - city: string (required - for event record)
 *   - category: string (optional)
 *   - question_text: string (optional, for question broadcasts)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import {
  renderQuestionBroadcast,
  renderProfileBroadcast,
  type BroadcastTemplateContext,
} from "@/lib/city-broadcasts/templates";
import {
  CITY_BROADCAST_QUESTION_TYPE,
  CITY_BROADCAST_PROFILE_TYPE,
} from "@/lib/city-broadcasts/process";

const MAX_PROVIDERS = 50;

interface SendResult {
  provider_id: string;
  provider_name: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    provider_ids,
    event_type,
    city,
    category,
    question_text,
  } = body as {
    provider_ids?: string[];
    event_type?: string;
    city?: string;
    category?: string;
    question_text?: string;
  };

  // Validation
  if (!provider_ids || !Array.isArray(provider_ids) || provider_ids.length === 0) {
    return NextResponse.json({ error: "provider_ids is required and must be a non-empty array" }, { status: 400 });
  }
  if (provider_ids.length > MAX_PROVIDERS) {
    return NextResponse.json({ error: `Maximum ${MAX_PROVIDERS} providers per send` }, { status: 400 });
  }
  if (!event_type || !["question_asked", "profile_published"].includes(event_type)) {
    return NextResponse.json({ error: "event_type must be 'question_asked' or 'profile_published'" }, { status: 400 });
  }
  if (!city) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }

  const db = getServiceClient();
  const results: SendResult[] = [];
  let sentCount = 0;
  let skippedCount = 0;

  try {
    // Step 1: Create the broadcast event record
    // Generate a random UUID for manual broadcasts since event_id is NOT NULL
    const manualEventId = crypto.randomUUID();
    const { data: eventRecord, error: eventError } = await db
      .from("city_broadcast_events")
      .insert({
        event_type,
        event_id: manualEventId, // Random UUID for manual broadcasts
        city,
        category: category || null,
        status: "processing",
        // Mark as manual in skip_reason when completed
      })
      .select("id")
      .single();

    if (eventError || !eventRecord) {
      console.error("[city-broadcasts/send] Failed to create event:", eventError);
      return NextResponse.json({ error: "Failed to create broadcast event" }, { status: 500 });
    }

    const broadcastEventId = eventRecord.id;

    // Step 2: Fetch provider details
    const { data: providers, error: providerError } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, slug, city, state, provider_category, email")
      .in("provider_id", provider_ids)
      .or("deleted.is.null,deleted.eq.false");

    if (providerError) {
      console.error("[city-broadcasts/send] Failed to fetch providers:", providerError);
      return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
    }

    const providerMap = new Map(
      (providers || []).map((p) => [p.provider_id, p])
    );

    // Step 3: Fetch tracking data for emails
    const { data: trackingRows } = await db
      .from("provider_outreach_tracking")
      .select("provider_id, apollo_contact")
      .in("provider_id", provider_ids);

    const trackingMap = new Map(
      (trackingRows || []).map((t) => [t.provider_id, t])
    );

    // Step 4: Check for bounced/complained emails
    const emails = provider_ids
      .map((id) => {
        const tracking = trackingMap.get(id);
        const provider = providerMap.get(id);
        const apolloContact = tracking?.apollo_contact as { email?: string } | null;
        return apolloContact?.email || provider?.email;
      })
      .filter(Boolean) as string[];

    const { data: badEmails } = await db
      .from("email_log")
      .select("recipient")
      .in("recipient", emails)
      .or("bounced_at.not.is.null,complained_at.not.is.null");

    const blockedEmails = new Set(
      (badEmails || []).map((e) => e.recipient.toLowerCase())
    );

    // Step 5: Create recipient records and send emails
    const emailType = event_type === "question_asked"
      ? CITY_BROADCAST_QUESTION_TYPE
      : CITY_BROADCAST_PROFILE_TYPE;

    for (const providerId of provider_ids) {
      const provider = providerMap.get(providerId);

      if (!provider) {
        results.push({
          provider_id: providerId,
          provider_name: "Unknown",
          status: "skipped",
          reason: "Provider not found",
        });
        skippedCount++;
        continue;
      }

      // Get email
      const tracking = trackingMap.get(providerId);
      const apolloContact = tracking?.apollo_contact as { email?: string } | null;
      const email = apolloContact?.email || provider.email;

      if (!email) {
        results.push({
          provider_id: providerId,
          provider_name: provider.provider_name || "Unknown",
          status: "skipped",
          reason: "No email address",
        });
        skippedCount++;
        continue;
      }

      // Check if email is blocked
      if (blockedEmails.has(email.toLowerCase())) {
        results.push({
          provider_id: providerId,
          provider_name: provider.provider_name || "Unknown",
          status: "skipped",
          reason: "Email bounced or complained",
        });
        skippedCount++;

        // Create skipped recipient record
        await db.from("city_broadcast_recipients").insert({
          event_id: broadcastEventId,
          provider_id: providerId,
          provider_email: email,
          provider_name: provider.provider_name,
          status: "skipped",
          skip_reason: "Email bounced or complained",
        });

        continue;
      }

      // Build template context
      const ctx: BroadcastTemplateContext = {
        providerId: provider.provider_id,
        providerName: provider.provider_name || "Provider",
        providerSlug: provider.slug || "",
        providerEmail: email,
        city: provider.city || city,
        category: category || provider.provider_category,
        questionText: event_type === "question_asked" ? question_text : undefined,
      };

      // Render email
      const rendered = event_type === "question_asked"
        ? renderQuestionBroadcast(ctx)
        : renderProfileBroadcast(ctx);

      // Create pending recipient record
      await db.from("city_broadcast_recipients").insert({
        event_id: broadcastEventId,
        provider_id: providerId,
        provider_email: email,
        provider_name: provider.provider_name,
        status: "pending",
      });

      // Send email
      const sendResult = await sendEmail({
        to: email,
        subject: rendered.subject,
        html: rendered.html,
        emailType,
        recipientType: "provider",
        providerId: provider.provider_id,
        metadata: {
          broadcast_event_id: broadcastEventId,
          event_type,
          city,
          category,
          manual: true,
          sent_by: adminUser.email,
        },
      });

      if (sendResult.success && !sendResult.skipped) {
        // Update recipient record to sent
        await db
          .from("city_broadcast_recipients")
          .update({
            status: "sent",
            email_log_id: sendResult.emailLogId || null,
          })
          .eq("event_id", broadcastEventId)
          .eq("provider_id", providerId);

        results.push({
          provider_id: providerId,
          provider_name: provider.provider_name || "Unknown",
          status: "sent",
        });
        sentCount++;
      } else {
        // Update recipient record to failed/skipped
        const skipReason = sendResult.skipReason || sendResult.error || "Unknown error";
        await db
          .from("city_broadcast_recipients")
          .update({
            status: sendResult.skipped ? "skipped" : "failed",
            skip_reason: skipReason,
            email_log_id: sendResult.emailLogId || null,
          })
          .eq("event_id", broadcastEventId)
          .eq("provider_id", providerId);

        results.push({
          provider_id: providerId,
          provider_name: provider.provider_name || "Unknown",
          status: sendResult.skipped ? "skipped" : "failed",
          reason: skipReason,
        });
        skippedCount++;
      }
    }

    // Step 6: Update event record with final status
    await db
      .from("city_broadcast_events")
      .update({
        status: sentCount > 0 ? "completed" : "skipped",
        skip_reason: `Manual broadcast by ${adminUser.email}`,
        providers_eligible: provider_ids.length,
        providers_sent: sentCount,
        processed_at: new Date().toISOString(),
      })
      .eq("id", broadcastEventId);

    return NextResponse.json({
      success: true,
      broadcast_event_id: broadcastEventId,
      summary: {
        total: provider_ids.length,
        sent: sentCount,
        skipped: skippedCount,
      },
      results,
    });
  } catch (err) {
    console.error("[city-broadcasts/send] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

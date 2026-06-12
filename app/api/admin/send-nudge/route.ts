import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams, isSuppressedRecipient } from "@/lib/email";
import { isUndeliverable } from "@/lib/email-verification";
import { providerNudgeEmail } from "@/lib/email-templates";
import { getSiteUrl } from "@/lib/site-url";

/**
 * POST /api/admin/send-nudge
 *
 * Sends a reminder email to a provider about an unanswered lead.
 * Admin-only endpoint with 24h cooldown per connection.
 *
 * Body: { connection_id: string }
 */

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: NextRequest) {
  // Admin auth check
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await getAdminUser(user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceClient();

  // Check if this is a preview request
  const { searchParams } = new URL(req.url);
  const isPreview = searchParams.get("preview") === "true";

  // Parse body
  let body: { connection_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { connection_id } = body;
  if (!connection_id) {
    return NextResponse.json(
      { error: "connection_id is required" },
      { status: 400 }
    );
  }

  // Fetch connection with provider and family profile
  const { data: connection, error: fetchError } = await db
    .from("connections")
    .select(
      `
      id,
      type,
      from_profile_id,
      to_profile_id,
      message,
      metadata,
      created_at,
      from_profile:business_profiles!connections_from_profile_id_fkey(display_name, slug, source_provider_id, email, care_types, metadata),
      to_profile:business_profiles!connections_to_profile_id_fkey(display_name, slug, source_provider_id, email, care_types, metadata)
    `
    )
    .eq("id", connection_id)
    .single();

  if (fetchError || !connection) {
    console.error("[send-nudge] Connection not found:", fetchError);
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  // Normalize joined relations and resolve family/provider based on connection type
  // - inquiry: from=family, to=provider
  // - request (Matches): from=provider, to=family
  const fromProfile = Array.isArray(connection.from_profile)
    ? connection.from_profile[0]
    : connection.from_profile;
  const toProfile = Array.isArray(connection.to_profile)
    ? connection.to_profile[0]
    : connection.to_profile;

  const isInquiry = connection.type === "inquiry";
  const familyProfile = isInquiry ? fromProfile : toProfile;
  const providerProfile = isInquiry ? toProfile : fromProfile;
  const familyProfileId = isInquiry ? connection.from_profile_id : connection.to_profile_id;

  // Check provider email - first from business_profiles, then fallback to olera-providers
  let providerEmail = providerProfile?.email?.trim() || null;
  if (!providerEmail && providerProfile?.source_provider_id) {
    const { data: iosProvider } = await db
      .from("olera-providers")
      .select("email")
      .eq("provider_id", providerProfile.source_provider_id)
      .not("deleted", "is", true)
      .maybeSingle();
    providerEmail = iosProvider?.email?.trim() || null;
  }

  if (!providerEmail) {
    return NextResponse.json(
      { error: "Provider has no email address" },
      { status: 400 }
    );
  }

  // Check if provider is admin-archived
  const providerMeta = (providerProfile?.metadata as Record<string, unknown>) ?? {};
  if (providerMeta.admin_archived === true) {
    return NextResponse.json(
      { error: "This provider is archived. No emails can be sent to them." },
      { status: 400 }
    );
  }

  // Check cooldown
  const meta = (connection.metadata as Record<string, unknown>) ?? {};
  const lastNudgedAt = meta.nudged_at as string | undefined;

  if (lastNudgedAt) {
    const timeSinceNudge = Date.now() - new Date(lastNudgedAt).getTime();
    if (timeSinceNudge < NUDGE_COOLDOWN_MS) {
      const hoursRemaining = Math.ceil(
        (NUDGE_COOLDOWN_MS - timeSinceNudge) / (60 * 60 * 1000)
      );
      return NextResponse.json(
        {
          error: `This provider was already nudged recently. Please wait ${hoursRemaining} hour(s).`,
          nudged_at: lastNudgedAt,
        },
        { status: 429 }
      );
    }
  }

  // Calculate days since inquiry
  const daysSinceInquiry = Math.floor(
    (Date.now() - new Date(connection.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Extract message preview from JSON or thread
  // We want the FAMILY's message, not the provider's auto-reply
  let messagePreview: string | null = null;
  if (connection.message) {
    try {
      const msgJson = JSON.parse(String(connection.message));
      messagePreview = msgJson.additional_notes || msgJson.message || msgJson.notes || null;
    } catch {
      // If not JSON, use as-is (legacy format)
      messagePreview = String(connection.message);
    }
  }
  // Fall back to first FAMILY message in thread (skip provider auto-replies)
  if (!messagePreview) {
    const thread = (meta.thread as Array<{ from_profile_id?: string; text?: string; is_auto_reply?: boolean }>) || [];
    const familyMessage = thread.find(
      (m) => m.from_profile_id === familyProfileId && m.text && !m.is_auto_reply
    );
    if (familyMessage?.text) {
      messagePreview = familyMessage.text;
    }
  }

  // If still no message, build context from care type and timeline
  if (!messagePreview) {
    // Match labels used in admin/leads for consistency
    const CARE_TYPE_LABELS: Record<string, string> = {
      home_care: "Home Care",
      home_health: "Home Health Care",
      assisted_living: "Assisted Living",
      memory_care: "Memory Care",
    };

    // Covers both "urgency" and "timeline" field naming conventions
    const TIMELINE_LABELS: Record<string, string> = {
      // timeline field values
      immediate: "ASAP",
      within_1_month: "Within 1 month",
      within_3_months: "Within 3 months",
      exploring: "Exploring",
      // urgency field values
      asap: "ASAP",
      within_month: "Within 1 month",
      few_months: "Within 3 months",
      researching: "Exploring",
    };

    // Try to get care type from family profile or connection message
    let careType: string | null = null;
    let timeline: string | null = null;

    // From family profile
    const familyMeta = (familyProfile?.metadata as Record<string, unknown>) ?? {};
    const familyCareTypes = (familyProfile as { care_types?: string[] })?.care_types;
    if (familyCareTypes && familyCareTypes.length > 0) {
      careType = CARE_TYPE_LABELS[familyCareTypes[0]] || familyCareTypes[0];
    }
    if (familyMeta.timeline) {
      timeline = TIMELINE_LABELS[familyMeta.timeline as string] || (familyMeta.timeline as string);
    }

    // From connection message JSON (if not already found)
    if ((!careType || !timeline) && connection.message) {
      try {
        const msgJson = JSON.parse(String(connection.message));
        if (!careType && msgJson.care_type) {
          careType = CARE_TYPE_LABELS[msgJson.care_type] || msgJson.care_type;
        }
        if (!timeline && msgJson.urgency) {
          timeline = TIMELINE_LABELS[msgJson.urgency] || msgJson.urgency;
        }
      } catch {
        // ignore parse errors
      }
    }

    // Build context string
    const contextParts: string[] = [];
    if (careType) contextParts.push(`Looking for ${careType}`);
    if (timeline) contextParts.push(`Timeline: ${timeline}`);
    if (contextParts.length > 0) {
      messagePreview = contextParts.join(" · ");
    }
  }

  // Truncate for email
  if (messagePreview && messagePreview.length > 100) {
    messagePreview = messagePreview.substring(0, 97) + "...";
  }

  const siteUrl = getSiteUrl();
  const providerSlug = providerProfile.slug || providerProfile.source_provider_id || "";
  const providerName = providerProfile.display_name || "Your Organization";
  const familyName = familyProfile?.display_name || "A family";
  const subject = `${familyName} is waiting for a response`;
  const fromAddress = "Olera <noreply@olera.care>";

  // Build view URL (without tracking for preview, with tracking for actual send)
  const viewUrl = isPreview
    ? `${siteUrl}/provider/connections`
    : appendTrackingParams(`${siteUrl}/provider/connections`, null);

  // Build email HTML
  const html = providerNudgeEmail({
    providerName,
    familyName,
    messagePreview,
    daysSinceInquiry,
    viewUrl,
    providerSlug,
  });

  // If preview mode, return email details without sending
  if (isPreview) {
    // Check if email would be suppressed
    let warning: string | null = null;
    const suppressed = await isSuppressedRecipient(providerEmail);
    const undeliverable = await isUndeliverable(providerEmail);

    if (suppressed) {
      warning = "This email may be suppressed due to prior bounces or spam complaints on record.";
    } else if (undeliverable) {
      warning = "This email may be suppressed because the address was verified as invalid/undeliverable.";
    }

    return NextResponse.json({
      preview: true,
      from: fromAddress,
      to: providerEmail,
      subject,
      html,
      warning,
    });
  }

  // Reserve email log ID for tracking (only when actually sending)
  const emailLogId = await reserveEmailLogId({
    to: providerEmail,
    subject,
    emailType: "provider_nudge",
    recipientType: "provider",
    providerId: providerSlug,
    metadata: {
      connection_id,
      nudged_by: user.email,
      days_since_inquiry: daysSinceInquiry,
    },
  });

  // Update viewUrl with tracking params for actual send
  const trackedViewUrl = appendTrackingParams(
    `${siteUrl}/provider/connections`,
    emailLogId
  );

  // Rebuild email HTML with tracked URL for actual send
  const trackedHtml = providerNudgeEmail({
    providerName,
    familyName,
    messagePreview,
    daysSinceInquiry,
    viewUrl: trackedViewUrl,
    providerSlug,
  });

  // Send email with tracked HTML
  const { success, error: sendError } = await sendEmail({
    to: providerEmail,
    subject,
    html: trackedHtml,
    emailType: "provider_nudge",
    recipientType: "provider",
    providerId: providerSlug,
    metadata: {
      connection_id,
      nudged_by: user.email,
      days_since_inquiry: daysSinceInquiry,
    },
    emailLogId: emailLogId ?? undefined,
  });

  if (!success) {
    console.error("[send-nudge] Email send failed:", sendError);
    return NextResponse.json(
      { error: "Failed to send nudge email" },
      { status: 500 }
    );
  }

  // Update connection metadata with nudge info
  const nudgedAt = new Date().toISOString();
  const updatedMeta = {
    ...meta,
    nudged_at: nudgedAt,
    nudged_by: user.email,
    nudge_count: ((meta.nudge_count as number) || 0) + 1,
  };

  const { error: updateError } = await db
    .from("connections")
    .update({ metadata: updatedMeta })
    .eq("id", connection_id);

  if (updateError) {
    console.error("[send-nudge] Failed to update connection metadata:", updateError);
    // Don't fail the request - email was sent successfully
  }

  return NextResponse.json({
    success: true,
    nudged_at: nudgedAt,
    provider_email: providerEmail,
  });
}

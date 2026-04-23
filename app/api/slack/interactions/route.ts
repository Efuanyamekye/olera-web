import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { sendEmail } from "@/lib/email";
import {
  verificationApprovedEmail,
  verificationRejectedEmail,
} from "@/lib/email-templates";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Verify the Slack request signature.
 * Returns true if valid, false otherwise.
 */
function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string
): boolean {
  if (!SLACK_SIGNING_SECRET || !signature || !timestamp) {
    console.warn("[slack] Missing signing secret or request headers");
    return false;
  }

  // Prevent replay attacks (reject requests older than 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 60 * 5) {
    console.warn("[slack] Request timestamp too old");
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(sigBasestring, "utf8")
    .digest("hex")}`;

  // timingSafeEqual throws if buffers have different lengths
  const myBuffer = Buffer.from(mySignature, "utf8");
  const theirBuffer = Buffer.from(signature, "utf8");
  if (myBuffer.length !== theirBuffer.length) {
    return false;
  }

  return timingSafeEqual(myBuffer, theirBuffer);
}

/**
 * Handle Slack interactive component payloads.
 * This endpoint receives button clicks from Slack messages.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const timestamp = request.headers.get("x-slack-request-timestamp");
    const signature = request.headers.get("x-slack-signature");

    // Verify request is from Slack
    if (!verifySlackSignature(signature, timestamp, rawBody)) {
      console.error("[slack] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse the URL-encoded payload
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get("payload");
    if (!payloadStr) {
      return NextResponse.json({ error: "No payload" }, { status: 400 });
    }

    const payload = JSON.parse(payloadStr);

    // We only handle block_actions (button clicks)
    if (payload.type !== "block_actions") {
      return NextResponse.json({ ok: true });
    }

    const action = payload.actions?.[0];
    if (!action) {
      return NextResponse.json({ ok: true });
    }

    const actionId = action.action_id;
    const actionValue = action.value;

    // Handle verification actions
    if (actionId === "verification_approve" || actionId === "verification_reject") {
      if (!actionValue) {
        return updateSlackMessage(payload, "❌ Missing action data");
      }
      return await handleVerificationAction(
        actionId === "verification_approve" ? "approve" : "reject",
        actionValue,
        payload
      );
    }

    // View profile is just a link, no action needed
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[slack] Interaction error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleVerificationAction(
  action: "approve" | "reject",
  value: string,
  payload: Record<string, unknown>
): Promise<NextResponse> {
  const admin = getAdminClient();
  if (!admin) {
    return updateSlackMessage(payload, "❌ Server configuration error");
  }

  // Parse action value as JSON
  let profileId: string;
  let claimerEmail: string;
  let providerName: string;
  try {
    const parsed = JSON.parse(value) as { profileId?: string; email?: string; name?: string };
    profileId = parsed.profileId || "";
    claimerEmail = parsed.email || "";
    providerName = parsed.name || "";
  } catch {
    return updateSlackMessage(payload, "❌ Invalid action data");
  }

  if (!profileId || !claimerEmail) {
    return updateSlackMessage(payload, "❌ Missing profile or email");
  }

  // Get the Slack user who clicked
  const slackUser = (payload.user as { name?: string })?.name || "Unknown";

  // Fetch the current profile
  const { data: profile, error: fetchError } = await admin
    .from("business_profiles")
    .select("id, slug, verification_state, metadata, display_name")
    .eq("id", profileId)
    .single();

  if (fetchError || !profile) {
    console.error("[slack] Profile not found:", profileId, fetchError);
    return updateSlackMessage(payload, "❌ Profile not found");
  }

  // Check if already processed
  if (profile.verification_state === "verified" && action === "approve") {
    return updateSlackMessage(payload, "✓ Already verified");
  }
  if (profile.verification_state === "rejected" && action === "reject") {
    return updateSlackMessage(payload, "✗ Already rejected");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const dashboardUrl = `${siteUrl}/provider`;
  const resubmitUrl = `${siteUrl}/provider/${profile.slug}/onboard`;
  const actualProviderName = profile.display_name || providerName || "your organization";

  if (action === "approve") {
    // Update profile to verified
    const currentMetadata = (profile.metadata as Record<string, unknown>) || {};
    const updatedMetadata = {
      ...currentMetadata,
      badge_approved: true,
      badge_approved_at: new Date().toISOString(),
      verified_by: slackUser,
      verified_via: "slack",
    };

    const { error: updateError } = await admin
      .from("business_profiles")
      .update({
        verification_state: "verified",
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (updateError) {
      console.error("[slack] Failed to approve:", updateError);
      return updateSlackMessage(payload, "❌ Failed to update profile");
    }

    // Send approval email
    if (claimerEmail) {
      const recipientName = (currentMetadata.verification_submission as Record<string, unknown>)?.name as string || "there";
      try {
        await sendEmail({
          to: claimerEmail,
          subject: "You're verified ✓",
          html: verificationApprovedEmail({
            providerName: actualProviderName,
            recipientName,
            dashboardUrl,
            autoApproved: false,
          }),
          emailType: "verification_approved",
          recipientType: "provider",
          providerId: profile.slug,
          metadata: { approved_by: slackUser },
        });
      } catch (emailErr) {
        console.error("[slack] Failed to send approval email:", emailErr);
      }
    }

    console.log(`[slack] Verification approved: ${actualProviderName} by ${slackUser}`);
    return updateSlackMessage(
      payload,
      `✅ *Approved* by ${slackUser}\n${actualProviderName} is now verified.`
    );
  } else {
    // Reject the verification
    const currentMetadata = (profile.metadata as Record<string, unknown>) || {};
    const rejectionReason = "Your provided information could not be verified. Please resubmit with clearer documentation.";

    const updatedMetadata = {
      ...currentMetadata,
      badge_rejected: true,
      badge_rejected_at: new Date().toISOString(),
      rejected_by: slackUser,
      rejected_via: "slack",
      rejection_reason: rejectionReason,
    };

    const { error: updateError } = await admin
      .from("business_profiles")
      .update({
        verification_state: "rejected",
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (updateError) {
      console.error("[slack] Failed to reject:", updateError);
      return updateSlackMessage(payload, "❌ Failed to update profile");
    }

    // Send rejection email
    if (claimerEmail) {
      const recipientName = (currentMetadata.verification_submission as Record<string, unknown>)?.name as string || "there";
      try {
        await sendEmail({
          to: claimerEmail,
          subject: "Verification needs more info",
          html: verificationRejectedEmail({
            providerName: actualProviderName,
            recipientName,
            reason: rejectionReason,
            resubmitUrl,
          }),
          emailType: "verification_rejected",
          recipientType: "provider",
          providerId: profile.slug,
          metadata: { rejected_by: slackUser },
        });
      } catch (emailErr) {
        console.error("[slack] Failed to send rejection email:", emailErr);
      }
    }

    console.log(`[slack] Verification rejected: ${actualProviderName} by ${slackUser}`);
    return updateSlackMessage(
      payload,
      `❌ *Rejected* by ${slackUser}\nThe provider will be asked to resubmit.`
    );
  }
}

/**
 * Update the original Slack message with the action result.
 */
function updateSlackMessage(
  payload: Record<string, unknown>,
  resultText: string
): NextResponse {
  // Get the original blocks and replace the actions block with the result
  const originalBlocks = (payload.message as { blocks?: unknown[] })?.blocks || [];

  // Remove the actions block and add a result context
  const updatedBlocks = originalBlocks.filter(
    (block: unknown) => (block as { type?: string }).type !== "actions"
  );

  updatedBlocks.push({
    type: "section",
    text: { type: "mrkdwn", text: resultText },
  });

  // Slack expects us to respond with the updated message
  return NextResponse.json({
    replace_original: true,
    blocks: updatedBlocks,
  });
}

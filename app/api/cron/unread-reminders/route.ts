import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { newMessageEmail, unreadReminderEmail, firstName } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";

interface ThreadMessage {
  from_profile_id: string;
  text: string;
  created_at: string;
  is_auto_reply?: boolean;
}

/**
 * GET /api/cron/unread-reminders
 *
 * Runs every 6 hours. Finds connections with unread messages older than 24h
 * and sends a reminder email to the recipient.
 *
 * "Unread" heuristic: the last message in the thread was NOT sent by the
 * connection's to_profile (provider) or from_profile (family), and no
 * message from the recipient exists after it.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("unread-reminders", async () => {
  try {
    const db = getServiceClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Get active connections with recent thread activity
    // We look at connections updated in the last 48h but with last message > 24h old
    const { data: connections, error } = await db
      .from("connections")
      .select("id, from_profile_id, to_profile_id, metadata, updated_at")
      .in("status", ["pending", "accepted"])
      .eq("type", "inquiry")
      .gte("updated_at", twoDaysAgo)
      .limit(100);

    if (error) {
      console.error("[cron/unread-reminders] query error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    let remindersSent = 0;

    for (const conn of connections || []) {
      const meta = (conn.metadata || {}) as Record<string, unknown>;
      const thread = (meta.thread as ThreadMessage[]) || [];
      if (thread.length === 0) continue;

      // Filter out auto-reply messages (seeded at connection creation)
      const humanMessages = thread.filter((msg) => !msg.is_auto_reply);
      if (humanMessages.length === 0) continue;

      const lastMsg = humanMessages[humanMessages.length - 1];
      const lastMsgTime = new Date(lastMsg.created_at).getTime();

      // Skip if last message is less than 24h old
      if (lastMsgTime > new Date(oneDayAgo).getTime()) continue;

      // Skip if already reminded (check metadata flag)
      const lastRemindedAt = meta.last_reminder_sent_at as string | undefined;
      if (lastRemindedAt && new Date(lastRemindedAt).getTime() > lastMsgTime) continue;

      // Determine recipient (the person who did NOT send the last message)
      const recipientProfileId =
        lastMsg.from_profile_id === conn.from_profile_id
          ? conn.to_profile_id
          : conn.from_profile_id;

      // Get recipient email + names + type for routing
      const [{ data: recipient }, { data: sender }] = await Promise.all([
        db
          .from("business_profiles")
          .select("display_name, email, type")
          .eq("id", recipientProfileId)
          .single(),
        db
          .from("business_profiles")
          .select("display_name")
          .eq("id", lastMsg.from_profile_id)
          .single(),
      ]);

      if (!recipient?.email) continue;

      const preview =
        lastMsg.text.length > 200 ? lastMsg.text.slice(0, 200) + "..." : lastMsg.text;

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
      const isFamily = recipient.type === "family";

      // Different subject and template for families vs providers
      const senderFirstName = firstName(sender?.display_name || "", isFamily ? "A provider" : "Someone");
      const urSubject = isFamily
        ? `${senderFirstName} is waiting to hear from you`
        : `${senderFirstName} sent you a message`;

      const urLogId = await reserveEmailLogId({
        to: recipient.email,
        subject: urSubject,
        emailType: "unread_reminder",
        recipientType: isFamily ? "family" : "provider",
      });

      // Build view URL with deep link to specific conversation
      let viewUrl: string;
      if (isFamily) {
        // Family: deep link to specific conversation + magic link
        const redirectPath = appendTrackingParams(
          `/portal/inbox?id=${conn.id}`,
          urLogId
        );
        viewUrl = `${siteUrl}${redirectPath}`;

        // Generate magic link for one-click access
        try {
          const { data: magicLinkData, error: magicLinkError } = await db.auth.admin.generateLink({
            type: "magiclink",
            email: recipient.email,
            options: {
              redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(redirectPath)}`,
            },
          });
          if (!magicLinkError && magicLinkData?.properties?.action_link) {
            viewUrl = magicLinkData.properties.action_link;
          }
        } catch (linkErr) {
          console.error("[unread-reminders] magic link failed:", linkErr);
          // Continue with fallback URL
        }
      } else {
        // Provider: link to provider connections page
        viewUrl = appendTrackingParams(`${siteUrl}/provider/connections`, urLogId);
      }

      // Use dedicated template for families, generic for providers
      const emailHtml = isFamily
        ? unreadReminderEmail({
            recipientName: recipient.display_name || "",
            senderName: sender?.display_name || "",
            messagePreview: preview,
            viewUrl,
          })
        : newMessageEmail({
            recipientName: recipient.display_name || "",
            senderName: sender?.display_name || "",
            messagePreview: preview,
            viewUrl,
          });

      await sendEmail({
        to: recipient.email,
        subject: urSubject,
        html: emailHtml,
        emailType: "unread_reminder",
        recipientType: isFamily ? "family" : "provider",
        emailLogId: urLogId ?? undefined,
      });

      // Mark as reminded so we don't send again for the same message
      await db
        .from("connections")
        .update({
          metadata: { ...meta, last_reminder_sent_at: new Date().toISOString() },
        })
        .eq("id", conn.id);

      remindersSent++;
    }

    return NextResponse.json({ status: "ok", remindersSent });
  } catch (err) {
    console.error("[cron/unread-reminders] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  });
}

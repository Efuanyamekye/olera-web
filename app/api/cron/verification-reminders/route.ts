import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import {
  verificationReminder7DayEmail,
  verificationReminder21DayEmail,
} from "@/lib/email-templates";

/**
 * GET /api/cron/verification-reminders
 *
 * Runs daily. Sends reminder emails to providers who claimed their listing
 * but haven't completed verification:
 *
 * 1. 7-day reminder — "Complete verification to unlock family inquiries..."
 * 2. 21-day final reminder — "Final reminder — your claim will be revoked in 9 days..."
 *
 * Each email sent at most ONCE per provider (metadata flag guard).
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getServiceClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twentyOneDaysAgo = new Date(now - 21 * 24 * 60 * 60 * 1000).toISOString();
    // Don't send reminders to very old claims (30+ days) - they'll be handled separately
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const counts = {
      reminder7Day: 0,
      reminder21Day: 0,
      skipped: 0,
      errors: 0,
    };

    // Fetch providers needing verification
    // verification_state = 'unverified' means they claimed but haven't submitted verification
    const { data: providers, error: fetchError } = await db
      .from("business_profiles")
      .select("id, slug, display_name, email, metadata, created_at, account_id")
      .eq("type", "provider")
      .eq("verification_state", "unverified")
      .not("account_id", "is", null) // Only claimed providers
      .gte("created_at", thirtyDaysAgo) // Don't remind 30+ day old claims
      .lte("created_at", sevenDaysAgo) // At least 7 days old
      .limit(200);

    if (fetchError) {
      console.error("[cron/verification-reminders] Fetch error:", fetchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!providers?.length) {
      return NextResponse.json({
        status: "ok",
        message: "No providers needing reminders",
        dry_run: dryRun,
        ...counts,
      });
    }

    // Resolve emails from accounts where business_profiles.email is null
    const accountIds = providers
      .filter((p) => !p.email && p.account_id)
      .map((p) => p.account_id);

    let accountEmailMap: Record<string, { email: string; name: string }> = {};
    if (accountIds.length > 0) {
      const { data: accounts } = await db
        .from("accounts")
        .select("id, user_id")
        .in("id", accountIds);

      if (accounts?.length) {
        const userIds = accounts.map((a) => a.user_id).filter(Boolean);
        const { data: { users } } = await db.auth.admin.listUsers({ perPage: 500 });

        const userDataMap: Record<string, { email: string; name: string }> = {};
        for (const u of users || []) {
          if (u.id && u.email) {
            userDataMap[u.id] = {
              email: u.email,
              name: (u.user_metadata?.full_name as string) || u.email.split("@")[0],
            };
          }
        }

        for (const acct of accounts) {
          if (acct.user_id && userDataMap[acct.user_id]) {
            accountEmailMap[acct.id] = userDataMap[acct.user_id];
          }
        }
      }
    }

    // Process each provider
    for (const provider of providers) {
      const meta = (provider.metadata || {}) as Record<string, unknown>;
      const verificationSubmission = meta.verification_submission as Record<string, unknown> | undefined;

      // Get email and recipient name
      let email = provider.email;
      let recipientName = verificationSubmission?.name as string || "there";

      if (!email && provider.account_id && accountEmailMap[provider.account_id]) {
        email = accountEmailMap[provider.account_id].email;
        if (recipientName === "there") {
          recipientName = accountEmailMap[provider.account_id].name;
        }
      }

      if (!email) {
        counts.skipped++;
        continue;
      }

      const providerName = provider.display_name || "your organization";
      const verifyUrl = `${siteUrl}/provider/${provider.slug}/onboard`;
      const claimDate = new Date(provider.created_at).getTime();
      const daysSinceClaim = Math.floor((now - claimDate) / (24 * 60 * 60 * 1000));

      try {
        // Priority 1: 21-day final reminder (if not sent)
        if (daysSinceClaim >= 21 && !meta.verification_reminder_21d_sent) {
          if (!dryRun) {
            await sendEmail({
              to: email,
              subject: `Final reminder: Verify ${providerName}`,
              html: verificationReminder21DayEmail({
                providerName,
                recipientName,
                verifyUrl,
              }),
              emailType: "verification_reminder_21d",
              recipientType: "provider",
              providerId: provider.slug,
            });

            await db
              .from("business_profiles")
              .update({
                metadata: {
                  ...meta,
                  verification_reminder_21d_sent: true,
                  verification_reminder_21d_sent_at: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", provider.id);
          }

          console.log(`[cron/verification-reminders] 21-day reminder: ${providerName} (${email})`);
          counts.reminder21Day++;
          continue;
        }

        // Priority 2: 7-day reminder (if not sent)
        if (daysSinceClaim >= 7 && !meta.verification_reminder_7d_sent) {
          if (!dryRun) {
            await sendEmail({
              to: email,
              subject: `Families are looking for ${providerName}`,
              html: verificationReminder7DayEmail({
                providerName,
                recipientName,
                verifyUrl,
              }),
              emailType: "verification_reminder_7d",
              recipientType: "provider",
              providerId: provider.slug,
            });

            await db
              .from("business_profiles")
              .update({
                metadata: {
                  ...meta,
                  verification_reminder_7d_sent: true,
                  verification_reminder_7d_sent_at: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", provider.id);
          }

          console.log(`[cron/verification-reminders] 7-day reminder: ${providerName} (${email})`);
          counts.reminder7Day++;
          continue;
        }
      } catch (err) {
        console.error(`[cron/verification-reminders] Error for ${provider.id}:`, err);
        counts.errors++;
      }
    }

    return NextResponse.json({
      status: "ok",
      dry_run: dryRun,
      processed: providers.length,
      ...counts,
    });
  } catch (err) {
    console.error("[cron/verification-reminders] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

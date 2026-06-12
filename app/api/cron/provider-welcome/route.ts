import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { providerWelcomeEmail } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { calculateProfileCompleteness } from "@/lib/profile-completeness";
import type { ExtendedMetadata } from "@/lib/profile-completeness";

/**
 * GET /api/cron/provider-welcome
 *
 * Runs hourly. Sends a welcome email to providers 24h after their verification
 * was approved. This is a warm onboarding email separate from the transactional
 * verification approval email.
 *
 * Detection logic:
 * - verification_state = 'verified'
 * - verified_at is 23-25 hours ago (hourly cron window)
 * - metadata.welcome_email_sent is null
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

  return withCronRun("provider-welcome", async () => {
    const db = getServiceClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
    const now = Date.now();

    // 23-25 hour window for hourly cron
    const twentyThreeHoursAgo = new Date(now - 23 * 60 * 60 * 1000).toISOString();
    const twentyFiveHoursAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString();

    const counts = {
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // Find providers verified 23-25 hours ago who haven't received welcome email
    const { data: providers, error: fetchError } = await db
      .from("business_profiles")
      .select("id, slug, display_name, email, metadata, account_id, image_url, description, category, care_types, city, state, address")
      .in("type", ["organization", "caregiver"])
      .eq("verification_state", "verified")
      .not("account_id", "is", null)
      .gte("metadata->>badge_approved_at", twentyFiveHoursAgo)
      .lte("metadata->>badge_approved_at", twentyThreeHoursAgo)
      .limit(100);

    if (fetchError) {
      console.error("[cron/provider-welcome] Fetch error:", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!providers?.length) {
      return {
        status: "ok",
        message: "No providers needing welcome email",
        dry_run: dryRun,
        ...counts,
      };
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

      // Skip if already sent
      if (meta.welcome_email_sent) {
        counts.skipped++;
        continue;
      }

      // Skip if provider is admin-archived (no emails sent to them)
      if (meta.admin_archived === true) {
        counts.skipped++;
        continue;
      }

      // Get email
      let email = provider.email;
      let recipientName = meta.verification_submission
        ? (meta.verification_submission as Record<string, unknown>).name as string
        : provider.display_name || "there";

      if (!email && provider.account_id && accountEmailMap[provider.account_id]) {
        email = accountEmailMap[provider.account_id].email;
        if (!recipientName || recipientName === "there") {
          recipientName = accountEmailMap[provider.account_id].name;
        }
      }

      if (!email) {
        counts.skipped++;
        continue;
      }

      const providerName = provider.display_name || "your organization";

      // Calculate profile completeness
      const profileData = {
        id: provider.id,
        display_name: provider.display_name,
        image_url: provider.image_url,
        description: provider.description,
        category: provider.category,
        care_types: provider.care_types,
        city: provider.city,
        state: provider.state,
        address: provider.address,
      };
      const completeness = calculateProfileCompleteness(
        profileData as Parameters<typeof calculateProfileCompleteness>[0],
        (meta as ExtendedMetadata) || {}
      );

      try {
        if (!dryRun) {
          const emailLogId = await reserveEmailLogId({
            to: email,
            subject: "Welcome to Olera",
            emailType: "provider_welcome",
            recipientType: "provider",
            providerId: provider.id,
          });

          // Generate magic link for auto-sign-in
          const dashboardPath = appendTrackingParams("/provider", emailLogId);
          const profilePath = appendTrackingParams(`/provider/${provider.slug}`, emailLogId);
          let dashboardUrl = `${siteUrl}${dashboardPath}`;
          let profileUrl = `${siteUrl}${profilePath}`;

          try {
            const { data: magicLinkData, error: magicLinkError } = await db.auth.admin.generateLink({
              type: "magiclink",
              email,
              options: {
                redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(dashboardPath)}`,
              },
            });
            if (!magicLinkError && magicLinkData?.properties?.action_link) {
              dashboardUrl = magicLinkData.properties.action_link;
            }

            // Generate separate magic link for profile URL
            const { data: profileLinkData, error: profileLinkError } = await db.auth.admin.generateLink({
              type: "magiclink",
              email,
              options: {
                redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(profilePath)}`,
              },
            });
            if (!profileLinkError && profileLinkData?.properties?.action_link) {
              profileUrl = profileLinkData.properties.action_link;
            }
          } catch (linkErr) {
            console.error("[cron/provider-welcome] Failed to generate magic link:", linkErr);
            // Continue with fallback URLs
          }

          await sendEmail({
            to: email,
            subject: "Welcome to Olera",
            html: providerWelcomeEmail({
              providerName,
              recipientName,
              slug: provider.slug,
              profileCompleteness: completeness.overall,
              dashboardUrl,
              profileUrl,
            }),
            emailType: "provider_welcome",
            recipientType: "provider",
            providerId: provider.id,
            emailLogId: emailLogId ?? undefined,
            recipientProfileId: provider.id,
          });

          // Mark as sent
          await db
            .from("business_profiles")
            .update({
              metadata: {
                ...meta,
                welcome_email_sent: true,
                welcome_email_sent_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", provider.id);
        }

        console.log(`[cron/provider-welcome] ${dryRun ? "[DRY RUN] " : ""}Sent to: ${providerName} (${email})`);
        counts.sent++;
      } catch (err) {
        console.error(`[cron/provider-welcome] Error for ${provider.id}:`, err);
        counts.errors++;
      }
    }

    return {
      status: "ok",
      dry_run: dryRun,
      processed: providers.length,
      ...counts,
    };
  });
}

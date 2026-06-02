import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { familyNudgeEmail, goLiveReminderEmail } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { calculateFamilyCompleteness } from "@/lib/admin/profile-completeness";

/**
 * GET /api/cron/lead-family-nudge
 *
 * Runs twice weekly (Tuesday/Friday 4 PM UTC). Nudges families who have active
 * leads but need to complete or publish their profile:
 *
 * Criteria:
 * - Connection type is 'inquiry' or 'request'
 * - Lead is at least 2 days old
 * - Family profile < 60% → nudge to complete
 * - Family profile ≥ 60% but not published → nudge to publish
 * - Family was NOT nudged (for this lead) in the last 7 days
 *
 * One email per family per run (even if they have multiple leads).
 */
export const maxDuration = 120;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const limit = Math.min(500, parseInt(searchParams.get("limit") || "500", 10));
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("lead-family-nudge", async () => {
    const db = getServiceClient();
    const siteUrl = getSiteUrl();
    const now = Date.now();
    const twoDaysAgo = new Date(now - TWO_DAYS_MS).toISOString();

    const counts = {
      processed: 0,
      sent: 0,
      skipped: 0,
      skipReasons: {
        profile_complete_and_published: 0,
        recently_nudged: 0,
        no_email: 0,
        already_sent_this_run: 0,
        send_failed: 0,
        unsubscribed: 0,
      },
      byType: {
        complete_profile: 0,
        publish_profile: 0,
      },
      dry_run: dryRun,
    };

    // Fetch leads that are at least 2 days old
    const { data: connections, error: fetchError } = await db
      .from("connections")
      .select(
        `
        id,
        from_profile_id,
        to_profile_id,
        metadata,
        created_at,
        from_profile:business_profiles!connections_from_profile_id_fkey(
          id,
          display_name,
          email,
          phone,
          image_url,
          city,
          state,
          description,
          care_types,
          metadata
        ),
        to_profile:business_profiles!connections_to_profile_id_fkey(display_name)
      `
      )
      .in("type", ["inquiry", "request"])
      .lte("created_at", twoDaysAgo)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("[cron/lead-family-nudge] Fetch error:", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!connections?.length) {
      return {
        ok: true,
        message: "No leads to process",
        ...counts,
      };
    }

    // Track families we've already processed this run (one email per family)
    const processedFamilies = new Set<string>();

    for (const conn of connections) {
      counts.processed++;

      // Normalize joined relations
      const fromProfile = Array.isArray(conn.from_profile)
        ? conn.from_profile[0]
        : conn.from_profile;
      const toProfile = Array.isArray(conn.to_profile)
        ? conn.to_profile[0]
        : conn.to_profile;

      const familyId = conn.from_profile_id;
      if (!familyId) {
        counts.skipped++;
        continue;
      }

      // One email per family per run
      if (processedFamilies.has(familyId)) {
        counts.skipped++;
        counts.skipReasons.already_sent_this_run++;
        continue;
      }

      // Check if family has email
      const familyEmail = fromProfile?.email?.trim();
      if (!familyEmail) {
        counts.skipped++;
        counts.skipReasons.no_email++;
        continue;
      }

      // Calculate profile completeness
      const completeness = calculateFamilyCompleteness(fromProfile, familyEmail);
      const isComplete = completeness.percentage >= 60;

      // Check if published
      const familyMeta = (fromProfile?.metadata as Record<string, unknown>) ?? {};
      const carePost = familyMeta.care_post as { status?: string } | undefined;
      const isPublished = carePost?.status === "active";

      // Respect user's unsubscribe preference
      if (familyMeta.nudges_unsubscribed === true) {
        counts.skipped++;
        counts.skipReasons.unsubscribed++;
        continue;
      }

      // If complete AND published, skip
      if (isComplete && isPublished) {
        counts.skipped++;
        counts.skipReasons.profile_complete_and_published++;
        continue;
      }

      // Check cooldown (7 days) based on nudge type
      const connMeta = (conn.metadata as Record<string, unknown>) ?? {};
      const lastNudgeField = isComplete ? "family_publish_nudged_at" : "family_nudged_at";
      const lastNudgedAt = connMeta[lastNudgeField] as string | undefined;

      if (lastNudgedAt) {
        const timeSinceNudge = now - new Date(lastNudgedAt).getTime();
        if (timeSinceNudge < SEVEN_DAYS_MS) {
          counts.skipped++;
          counts.skipReasons.recently_nudged++;
          continue;
        }
      }

      const familyName = fromProfile?.display_name?.split(/\s+/)[0] || "there";
      const providerName = toProfile?.display_name || "the provider";

      if (dryRun) {
        const nudgeType = isComplete ? "publish" : "complete";
        console.log(`[cron/lead-family-nudge] [DRY RUN] Would nudge ${familyEmail} to ${nudgeType} for connection ${conn.id}`);
        processedFamilies.add(familyId);
        counts.sent++;
        if (isComplete) counts.byType.publish_profile++;
        else counts.byType.complete_profile++;
        continue;
      }

      // Determine which email to send
      let html: string;
      let subject: string;
      let emailType: string;

      if (isComplete) {
        // Nudge to publish
        subject = `Providers in ${fromProfile?.city || "your area"} are looking for families like yours`;
        emailType = "go_live_reminder";

        const emailLogId = await reserveEmailLogId({
          to: familyEmail,
          subject,
          emailType,
          recipientType: "family",
          metadata: {
            connection_id: conn.id,
            nudged_by: "cron:lead-family-nudge",
            nudge_type: "publish",
          },
        });

        const matchesUrl = appendTrackingParams(`${siteUrl}/portal/profile`, emailLogId);

        html = goLiveReminderEmail({
          familyName,
          matchesUrl,
          city: fromProfile?.city || "your area",
        });

        const { success, error: sendError } = await sendEmail({
          to: familyEmail,
          subject,
          html,
          emailType,
          recipientType: "family",
          metadata: {
            connection_id: conn.id,
            nudged_by: "cron:lead-family-nudge",
            nudge_type: "publish",
          },
          emailLogId: emailLogId ?? undefined,
        });

        if (!success) {
          console.error(`[cron/lead-family-nudge] Send failed for ${conn.id}:`, sendError);
          counts.skipped++;
          counts.skipReasons.send_failed++;
          continue;
        }

        // Update ALL connections for this family (not just the triggering one)
        // This ensures the 7-day cooldown applies family-wide
        const nudgedAt = new Date().toISOString();
        const familyConnections = connections.filter((c) => c.from_profile_id === familyId);
        for (const fc of familyConnections) {
          const fcMeta = (fc.metadata as Record<string, unknown>) ?? {};
          const { error: updateError } = await db
            .from("connections")
            .update({
              metadata: {
                ...fcMeta,
                family_publish_nudged_at: nudgedAt,
                family_publish_nudged_by: "cron:lead-family-nudge",
                family_publish_nudge_count: ((fcMeta.family_publish_nudge_count as number) || 0) + 1,
              },
            })
            .eq("id", fc.id);

          if (updateError) {
            console.error(
              `[cron/lead-family-nudge] Failed to update metadata for ${fc.id}:`,
              updateError
            );
          }
        }

        counts.byType.publish_profile++;
      } else {
        // Nudge to complete profile
        subject = `Complete your profile to help ${providerName} respond`;
        emailType = "family_nudge";

        const emailLogId = await reserveEmailLogId({
          to: familyEmail,
          subject,
          emailType,
          recipientType: "family",
          metadata: {
            connection_id: conn.id,
            nudged_by: "cron:lead-family-nudge",
            nudge_type: "complete",
            completion_percent: completeness.percentage,
          },
        });

        const profileUrl = appendTrackingParams(`${siteUrl}/portal/profile`, emailLogId);

        html = familyNudgeEmail({
          familyName,
          providerName,
          missingFields: completeness.missingFields.slice(0, 5),
          completionPercent: completeness.percentage,
          profileUrl,
        });

        const { success, error: sendError } = await sendEmail({
          to: familyEmail,
          subject,
          html,
          emailType,
          recipientType: "family",
          metadata: {
            connection_id: conn.id,
            nudged_by: "cron:lead-family-nudge",
            nudge_type: "complete",
            completion_percent: completeness.percentage,
          },
          emailLogId: emailLogId ?? undefined,
        });

        if (!success) {
          console.error(`[cron/lead-family-nudge] Send failed for ${conn.id}:`, sendError);
          counts.skipped++;
          counts.skipReasons.send_failed++;
          continue;
        }

        // Update ALL connections for this family (not just the triggering one)
        // This ensures the 7-day cooldown applies family-wide
        const nudgedAt = new Date().toISOString();
        const familyConnections = connections.filter((c) => c.from_profile_id === familyId);
        for (const fc of familyConnections) {
          const fcMeta = (fc.metadata as Record<string, unknown>) ?? {};
          const { error: updateError } = await db
            .from("connections")
            .update({
              metadata: {
                ...fcMeta,
                family_nudged_at: nudgedAt,
                family_nudged_by: "cron:lead-family-nudge",
                family_nudge_count: ((fcMeta.family_nudge_count as number) || 0) + 1,
              },
            })
            .eq("id", fc.id);

          if (updateError) {
            console.error(
              `[cron/lead-family-nudge] Failed to update metadata for ${fc.id}:`,
              updateError
            );
          }
        }

        counts.byType.complete_profile++;
      }

      processedFamilies.add(familyId);
      counts.sent++;
    }

    return {
      ok: true,
      ...counts,
    };
  });
}

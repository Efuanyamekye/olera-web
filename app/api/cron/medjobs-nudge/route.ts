import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { profileIncompleteNudgeEmail, studentActivationEmail } from "@/lib/medjobs-email-templates";
import { calculateCompleteness, getIncompleteItems } from "@/lib/medjobs-completeness";
import { generateStudentPortalUrl } from "@/lib/claim-tokens";
import type { StudentMetadata } from "@/lib/types";
import { withCronRun } from "@/lib/crons/run";

/**
 * GET /api/cron/medjobs-nudge
 *
 * Runs daily at 10 AM CT (15:00 UTC).
 *
 * Nudge cadence:
 *   Nudge 1: Day 1 (24hrs after signup)
 *   Nudge 2: Day 3
 *   Nudge 3: Day 5
 *   Nudge 4: Day 7
 *   Nudge 5-8: Every 2 weeks
 *   Stop after nudge 8 (~6 weeks)
 *
 * Anyone with < 100% completeness gets nudged.
 */

const NUDGE_CADENCE_DAYS = [1, 3, 5, 7, 21, 35, 49, 63]; // Day thresholds for nudges 1-8
const MAX_NUDGES = 8;
const PAGE_SIZE = 500; // Fetch students in batches to handle >1000 students

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("medjobs-nudge", async () => {
  try {
    const db = getServiceClient();

    let nudged = 0;
    let activated = 0;
    let skipped = 0;
    let totalProcessed = 0;
    const now = Date.now();

    // Paginate through all students (Supabase defaults to 1000 row limit)
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: students, error } = await db
        .from("business_profiles")
        .select("id, slug, display_name, email, city, image_url, metadata, created_at")
        .eq("type", "student")
        .not("email", "is", null)
        .not("display_name", "is", null)
        .range(offset, offset + PAGE_SIZE - 1)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[medjobs-nudge] query error:", error);
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
      }

      const batch = students || [];
      hasMore = batch.length === PAGE_SIZE;
      offset += PAGE_SIZE;
      totalProcessed += batch.length;

    for (const student of batch) {
      // Skip if display_name is empty (belt and suspenders)
      if (!student.display_name?.trim()) {
        skipped++;
        continue;
      }

      const meta = (student.metadata || {}) as StudentMetadata;
      const hasPhoto = !!student.image_url;

      // Recalculate completeness fresh (single source of truth)
      const completeness = calculateCompleteness(meta, hasPhoto);

      // If 100% complete — check if activation email needs to be sent
      if (completeness >= 100) {
        const activationSent = (meta as Record<string, unknown>).activation_email_sent as boolean;
        if (!activationSent) {
          try {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
            const profileUrl = `${siteUrl}/medjobs/candidates/${student.slug}`;

            // Generate one-click sign-in URL with 15-day HMAC token
            const magicLink = generateStudentPortalUrl(
              student.email!,
              "/medjobs/providers",
              siteUrl
            );

            await sendEmail({
              to: student.email!,
              subject: "Your MedJobs profile is live!",
              html: studentActivationEmail({
                studentName: student.display_name,
                city: student.city || undefined,
                profileUrl,
                magicLink,
              }),
              emailType: "student_activation",
              recipientType: "student",
            });

            // Re-fetch metadata to reduce race condition risk
            const { data: freshProfile } = await db
              .from("business_profiles")
              .select("metadata")
              .eq("id", student.id)
              .single();
            const freshMeta = (freshProfile?.metadata || meta) as Record<string, unknown>;

            await db.from("business_profiles").update({
              metadata: { ...freshMeta, activation_email_sent: true },
            }).eq("id", student.id);

            activated++;
          } catch (err) {
            console.error(`[medjobs-nudge] activation email error for ${student.email}:`, err);
          }
        } else {
          skipped++;
        }
        continue;
      }

      // Check nudge count
      const nudgeCount = (meta as Record<string, unknown>).nudge_count as number || 0;
      if (nudgeCount >= MAX_NUDGES) { skipped++; continue; }

      // Check if enough time has passed for the next nudge
      const daysSinceCreation = (now - new Date(student.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const nextNudgeDay = NUDGE_CADENCE_DAYS[nudgeCount] || Infinity;
      if (daysSinceCreation < nextNudgeDay) { skipped++; continue; }

      // Check we haven't sent today (safety — cron might run multiple times)
      const lastNudge = (meta as Record<string, unknown>).last_nudge_sent_at as string | undefined;
      if (lastNudge) {
        const hoursSinceLastNudge = (now - new Date(lastNudge).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastNudge < 20) { skipped++; continue; }
      }

      // Get incomplete items for the email
      const incompleteItems = getIncompleteItems(meta, hasPhoto);
      if (incompleteItems.length === 0) { skipped++; continue; }

      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

        // Generate one-click sign-in URL with 15-day HMAC token
        const magicLink = generateStudentPortalUrl(
          student.email!,
          "/portal/medjobs/profile",
          siteUrl
        );

        await sendEmail({
          to: student.email!,
          subject: `Your MedJobs profile is ${completeness}% complete`,
          html: profileIncompleteNudgeEmail({
            studentName: student.display_name,
            completeness,
            missingItems: incompleteItems.slice(0, 5),
            magicLink,
          }),
          emailType: "profile_incomplete_nudge",
          recipientType: "student",
        });

        // Re-fetch metadata to reduce race condition risk
        const { data: freshProfile } = await db
          .from("business_profiles")
          .select("metadata")
          .eq("id", student.id)
          .single();
        const freshMeta = (freshProfile?.metadata || meta) as Record<string, unknown>;

        // Update nudge tracking
        await db
          .from("business_profiles")
          .update({
            metadata: {
              ...freshMeta,
              last_nudge_sent_at: new Date().toISOString(),
              nudge_count: nudgeCount + 1,
            },
          })
          .eq("id", student.id);

        nudged++;
      } catch (err) {
        console.error(`[medjobs-nudge] error for ${student.email}:`, err);
      }
    }
    } // end while (hasMore)

    return NextResponse.json({ nudged, activated, skipped, totalProcessed });
  } catch (err) {
    console.error("[medjobs-nudge] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { newCandidateAlertEmail } from "@/lib/medjobs-email-templates";
import { sendSlackAlert } from "@/lib/slack";
import { getTrackLabel } from "@/lib/medjobs-helpers";
import { getClientStatus, type ProviderMetadata } from "@/lib/medjobs/clients";
import type { StudentMetadata } from "@/lib/types";
import { withCronRun } from "@/lib/crons/run";

/**
 * GET /api/cron/medjobs-digest
 *
 * Runs weekly on Monday at 8 AM CT (13:00 UTC).
 * Sends providers a digest of new student candidates from the past week.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("medjobs-digest", async () => {
  try {
    const db = getServiceClient();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get new students from the past week
    const { data: newStudents, error: studentsError } = await db
      .from("business_profiles")
      .select("slug, display_name, city, state, metadata")
      .eq("type", "student")
      .eq("is_active", true)
      .gte("created_at", oneWeekAgo)
      .order("created_at", { ascending: false })
      .limit(10);

    if (studentsError) {
      console.error("[medjobs-digest] students query error:", studentsError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    if (!newStudents || newStudents.length === 0) {
      // No new students — skip digest
      return NextResponse.json({ message: "No new candidates this week", sent: 0 });
    }

    // Get providers who have organization or caregiver profiles with email,
    // then narrow to MedJobs *clients* only. A client is a provider in the
    // 90-day pilot (interview_terms_accepted_at) or with an active paid
    // subscription — the same definition /admin/medjobs/clients uses
    // (getClientStatus). This digest is a client benefit, NOT a directory
    // blast: without this filter it emails every claimed provider (~529),
    // which is not what MedJobs (Logan's targeted work) intends.
    const { data: allProviders, error: providersError } = await db
      .from("business_profiles")
      .select("id, display_name, email, metadata")
      .in("type", ["organization", "caregiver"])
      .eq("claim_state", "claimed")
      .eq("is_active", true)
      .not("email", "is", null);

    if (providersError) {
      console.error("[medjobs-digest] providers query error:", providersError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const providers = (allProviders || []).filter(
      (p) => getClientStatus(p.metadata as ProviderMetadata | null).isClient,
    );

    if (providers.length === 0) {
      // No MedJobs clients to notify — skip rather than blast the directory.
      return NextResponse.json({
        newStudents: newStudents.length,
        providersSent: 0,
        message: "No MedJobs clients to notify",
      });
    }

    const candidates = newStudents.map((s) => {
      const meta = s.metadata as StudentMetadata;
      return {
        name: s.display_name,
        university: meta.university || "Not specified",
        programTrack: getTrackLabel(meta) || "Student",
        slug: s.slug,
      };
    });

    let sent = 0;
    for (const provider of (providers || [])) {
      if (!provider.email) continue;

      try {
        await sendEmail({
          to: provider.email,
          subject: `${newStudents.length} new student caregiver${newStudents.length > 1 ? "s" : ""} this week — Olera MedJobs`,
          html: newCandidateAlertEmail({
            providerName: provider.display_name,
            candidates,
          }),
          emailType: "new_candidate_alert",
          recipientType: "provider",
          providerId: provider.id,
        });
        sent++;
      } catch (err) {
        console.error(`[medjobs-digest] email error for ${provider.email}:`, err);
      }
    }

    // Slack summary
    try {
      await sendSlackAlert(
        `MedJobs Weekly Digest: ${newStudents.length} new students, ${sent} provider emails sent`
      );
    } catch (err) {
      console.error("[medjobs-digest] slack error:", err);
    }

    return NextResponse.json({
      newStudents: newStudents.length,
      providersSent: sent,
    });
  } catch (err) {
    console.error("[medjobs-digest] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  });
}

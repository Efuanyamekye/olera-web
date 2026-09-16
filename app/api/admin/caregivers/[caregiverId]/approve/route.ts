import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { medjobsProfileApprovedEmail } from "@/lib/email-templates";
import { generateStudentPortalUrl } from "@/lib/claim-tokens";
import type { StudentMetadata } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

/**
 * POST /api/admin/caregivers/[caregiverId]/approve
 *
 * Admin action to approve a student's profile review request.
 * This sets is_active: true and application_completed: true,
 * making the profile visible to providers.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ caregiverId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { caregiverId: studentId } = await params;
    const db = getServiceClient();

    // Fetch student profile
    const { data: student, error: fetchError } = await db
      .from("business_profiles")
      .select("id, slug, display_name, email, metadata")
      .eq("id", studentId)
      .eq("type", "student")
      .single();

    if (fetchError || !student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const meta = (student.metadata ?? {}) as StudentMetadata & {
      application_completed?: boolean;
      review_requested_at?: string;
      approved_at?: string;
      approved_by?: string;
    };

    // Update: set is_active, application_completed, clear review_requested_at
    const nowIso = new Date().toISOString();
    const updatedMeta = {
      ...meta,
      application_completed: true,
      review_requested_at: null, // Clear the pending request
      approved_at: nowIso,
      approved_by: adminUser.email || user.id,
    };

    const { error: updateError } = await db
      .from("business_profiles")
      .update({
        is_active: true,
        metadata: updatedMeta,
        updated_at: nowIso,
      })
      .eq("id", studentId);

    if (updateError) {
      console.error("[admin/caregivers/approve] update error:", updateError);
      return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: user.id,
      action: "student_approved",
      targetType: "student",
      targetId: studentId,
      details: { studentName: student.display_name, studentEmail: student.email },
    });

    // Send approval email to student with one-click magic link (15-day expiry)
    if (student.email) {
      try {
        const profileUrl = `${BASE_URL}/medjobs/candidates/${student.slug}`;
        // Magic link auto-authenticates student and redirects to their portal
        const portalUrl = generateStudentPortalUrl(student.email, "/portal/medjobs");
        await sendEmail({
          to: student.email,
          subject: "Your MedJobs profile is live!",
          html: medjobsProfileApprovedEmail({
            studentName: student.display_name || "there",
            profileUrl,
            portalUrl,
          }),
          emailType: "medjobs_profile_approved",
          recipientType: "student",
          recipientProfileId: studentId,
        });
      } catch (emailErr) {
        // Non-blocking - log but don't fail the approval
        console.error("[admin/caregivers/approve] email error:", emailErr);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Student profile approved and is now live.",
    });
  } catch (err) {
    console.error("[admin/caregivers/approve] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

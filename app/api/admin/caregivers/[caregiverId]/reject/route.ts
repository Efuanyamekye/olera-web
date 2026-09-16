import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { medjobsProfileRejectedEmail } from "@/lib/email-templates";
import { generateStudentPortalUrl } from "@/lib/claim-tokens";
import type { StudentMetadata } from "@/lib/types";

/**
 * POST /api/admin/caregivers/[caregiverId]/reject
 *
 * Admin action to reject a student's profile review request.
 * This clears the review request but keeps is_active: false.
 * Student can make improvements and request review again.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caregiverId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { caregiverId: studentId } = await params;
    const db = getServiceClient();

    // Parse optional rejection reason from body
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body or invalid JSON is fine
    }

    // Fetch student profile
    const { data: student, error: fetchError } = await db
      .from("business_profiles")
      .select("id, display_name, email, metadata")
      .eq("id", studentId)
      .eq("type", "student")
      .single();

    if (fetchError || !student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const meta = (student.metadata ?? {}) as StudentMetadata & {
      review_requested_at?: string;
      rejected_at?: string;
      rejected_by?: string;
      rejection_reason?: string;
    };

    // Update: clear review_requested_at, add rejection info
    const nowIso = new Date().toISOString();
    const updatedMeta = {
      ...meta,
      review_requested_at: null, // Clear the pending request
      rejected_at: nowIso,
      rejected_by: adminUser.email || user.id,
      rejection_reason: reason || undefined,
    };

    const { error: updateError } = await db
      .from("business_profiles")
      .update({
        metadata: updatedMeta,
        updated_at: nowIso,
      })
      .eq("id", studentId);

    if (updateError) {
      console.error("[admin/caregivers/reject] update error:", updateError);
      return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: user.id,
      action: "student_rejected",
      targetType: "student",
      targetId: studentId,
      details: {
        studentName: student.display_name,
        studentEmail: student.email,
        reason,
      },
    });

    // Send rejection email to student with one-click magic link (15-day expiry)
    if (student.email) {
      try {
        // Magic link auto-authenticates student and redirects to their portal
        const portalUrl = generateStudentPortalUrl(student.email, "/portal/medjobs");
        await sendEmail({
          to: student.email,
          subject: "Your MedJobs profile needs some updates",
          html: medjobsProfileRejectedEmail({
            studentName: student.display_name || "there",
            reason,
            portalUrl,
          }),
          emailType: "medjobs_profile_rejected",
          recipientType: "student",
          recipientProfileId: studentId,
        });
      } catch (emailErr) {
        // Non-blocking - log but don't fail the rejection
        console.error("[admin/caregivers/reject] email error:", emailErr);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Review request rejected. Student can make improvements and request again.",
    });
  } catch (err) {
    console.error("[admin/caregivers/reject] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

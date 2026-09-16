import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendSlackAlert, slackMedJobsReviewRequest } from "@/lib/slack";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import type { StudentMetadata } from "@/lib/types";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/medjobs/request-review
 *
 * Student requests admin review of their profile. This is required before
 * going live for the first time. The admin must approve the profile before
 * it becomes visible to providers.
 *
 * Requirements:
 * - Profile must be 100% complete
 * - Cannot already have a pending review request
 * - Cannot have already been approved (use toggle-visibility instead)
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();

    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!account) return NextResponse.json({ error: "No account" }, { status: 403 });

    const { data: student } = await admin
      .from("business_profiles")
      .select("id, slug, display_name, email, phone, city, state, image_url, is_active, metadata")
      .eq("account_id", account.id)
      .eq("type", "student")
      .single();
    if (!student) return NextResponse.json({ error: "Student profile not found" }, { status: 404 });

    const meta = (student.metadata ?? {}) as StudentMetadata & {
      application_completed?: boolean;
      review_requested_at?: string;
    };

    // If already approved (application_completed), they should use toggle-visibility
    if (meta.application_completed) {
      return NextResponse.json(
        { error: "Profile already approved. Use the visibility toggle instead." },
        { status: 400 }
      );
    }

    // If already has a pending review request
    if (meta.review_requested_at) {
      return NextResponse.json(
        { error: "Review already requested. Please wait for admin approval." },
        { status: 400 }
      );
    }

    // Calculate completeness to ensure profile is 100% complete
    const hasPhoto = !!student.image_url;
    const hasBasicInfo = {
      hasName: !!student.display_name,
      hasEmail: !!student.email,
      hasPhone: !!student.phone,
      hasUniversity: !!meta.university,
      hasLocation: !!(student.city && student.state),
    };
    const completeness = calculateCompleteness(meta, hasPhoto, hasBasicInfo);

    if (completeness < 100) {
      return NextResponse.json(
        {
          error: "Profile must be 100% complete before requesting review.",
          completeness,
        },
        { status: 400 }
      );
    }

    // Set review_requested_at timestamp
    const nowIso = new Date().toISOString();
    const { error: updateError } = await admin
      .from("business_profiles")
      .update({
        metadata: { ...meta, review_requested_at: nowIso },
        updated_at: nowIso,
      })
      .eq("id", student.id);

    if (updateError) {
      console.error("[medjobs/request-review] update error:", updateError);
      return NextResponse.json({ error: "Failed to submit review request" }, { status: 500 });
    }

    // Send Slack notification
    try {
      const alert = slackMedJobsReviewRequest({
        studentName: student.display_name || "Unknown",
        studentId: student.id,
        university: meta.university || "Not specified",
        location: [student.city, student.state].filter(Boolean).join(", ") || "Not specified",
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch (err) {
      // Non-blocking - log but don't fail the request
      console.error("[medjobs/request-review] slack error:", err);
    }

    return NextResponse.json({
      ok: true,
      message: "Review requested. An admin will review your profile shortly."
    });
  } catch (err) {
    console.error("[medjobs/request-review] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

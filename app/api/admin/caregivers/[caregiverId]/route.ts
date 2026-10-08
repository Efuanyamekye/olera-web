import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import type { StudentMetadata } from "@/lib/types";

// Top-level fields on business_profiles that admins can edit
const EDITABLE_TOP_FIELDS = new Set([
  "display_name",
  "email",
  "phone",
  "city",
  "state",
  "is_active",
]);

// Metadata keys that admins can edit
const EDITABLE_META_FIELDS = new Set([
  "university",
  "major",
  "certifications",
  "skills",
  "profile_completeness",
  "why_caregiving",
  "availability_notes",
  "commitment_statement",
  "resume_url",
  "video_intro_url",
]);

/**
 * GET /api/admin/caregivers/[caregiverId]
 *
 * Fetch student profile detail with connection history.
 * Note: Route path still uses "caregiverId" for URL compatibility.
 */
export async function GET(
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

    const { data: student, error } = await db
      .from("business_profiles")
      .select("*")
      .eq("id", studentId)
      .eq("type", "student")
      .single();

    if (error || !student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Get connection count (applications made by this student)
    const { count: connectionCount } = await db
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("from_profile_id", studentId);

    // Get last 20 connections with provider names
    const { data: connections } = await db
      .from("connections")
      .select(`
        id,
        type,
        status,
        message,
        created_at,
        to_profile:business_profiles!connections_to_profile_id_fkey(id, display_name, type, slug)
      `)
      .eq("from_profile_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Also get invitations TO this student (providers reaching out)
    const { data: invitations } = await db
      .from("connections")
      .select(`
        id,
        type,
        status,
        message,
        created_at,
        from_profile:business_profiles!connections_from_profile_id_fkey(id, display_name, type, slug)
      `)
      .eq("to_profile_id", studentId)
      .eq("type", "invitation")
      .order("created_at", { ascending: false })
      .limit(20);

    // Get interview history if any
    const { data: interviews } = await db
      .from("interviews")
      .select(`
        id,
        status,
        type,
        proposed_time,
        confirmed_time,
        duration_minutes,
        location,
        notes,
        created_at,
        provider_profile:business_profiles!interviews_provider_profile_id_fkey(id, display_name, slug)
      `)
      .eq("student_profile_id", studentId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      student,
      connectionCount: connectionCount ?? 0,
      connections: connections ?? [],
      invitations: invitations ?? [],
      interviews: interviews ?? [],
    });
  } catch (err) {
    console.error("Admin student detail error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/caregivers/[caregiverId]
 *
 * Update student profile fields.
 * Note: Route path still uses "caregiverId" for URL compatibility.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caregiverId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { caregiverId: studentId } = await params;
    const body = await request.json();
    const db = getServiceClient();

    // Fetch current record
    const { data: current, error: fetchError } = await db
      .from("business_profiles")
      .select("*")
      .eq("id", studentId)
      .eq("type", "student")
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Separate top-level and metadata updates
    const topUpdates: Record<string, unknown> = {};
    const metaUpdates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (EDITABLE_TOP_FIELDS.has(key)) {
        topUpdates[key] = value;
      } else if (EDITABLE_META_FIELDS.has(key)) {
        metaUpdates[key] = value;
      }
    }

    if (Object.keys(topUpdates).length === 0 && Object.keys(metaUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Build the final update object
    const updates: Record<string, unknown> = { ...topUpdates };

    if (Object.keys(metaUpdates).length > 0) {
      const currentMeta = (current.metadata as Record<string, unknown>) || {};
      updates.metadata = { ...currentMeta, ...metaUpdates };
    }

    const { error: updateError } = await db
      .from("business_profiles")
      .update(updates)
      .eq("id", studentId);

    if (updateError) {
      console.error("Admin caregiver update error:", updateError);
      return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
    }

    // Recalculate profile completeness after any update that might affect it
    // These fields contribute to section completeness calculations
    const completenessFields = new Set([
      // Profile Overview section
      "display_name", "email", "phone", "city", "state", "image_url", "university",
      // Why section
      "why_caregiving",
      // Availability section
      "commitment_statement",
      // Resume section
      "resume_url",
      // Video Introduction section
      "video_intro_url",
      // Certifications section (0% but still tracked)
      "certifications",
    ]);
    const affectsCompleteness = [...Object.keys(topUpdates), ...Object.keys(metaUpdates)]
      .some(key => completenessFields.has(key));

    if (affectsCompleteness) {
      // Fetch the updated record to recalculate completeness
      const { data: updated } = await db
        .from("business_profiles")
        .select("*")
        .eq("id", studentId)
        .single();

      if (updated) {
        const updatedMeta = (updated.metadata || {}) as StudentMetadata;
        const hasPhoto = !!updated.image_url;
        const hasBasicInfo = {
          hasName: !!updated.display_name,
          hasEmail: !!updated.email,
          hasPhone: !!updated.phone,
          hasUniversity: !!updatedMeta.university,
          hasLocation: !!(updated.city && updated.state),
        };
        const newCompleteness = calculateCompleteness(updatedMeta, hasPhoto, hasBasicInfo);

        // Update completeness if it changed
        if (updatedMeta.profile_completeness !== newCompleteness) {
          await db
            .from("business_profiles")
            .update({
              metadata: { ...updatedMeta, profile_completeness: newCompleteness }
            })
            .eq("id", studentId);
        }
      }
    }

    // Build audit diff
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, value] of Object.entries(topUpdates)) {
      const currentVal = current[key as keyof typeof current];
      if (currentVal !== value) {
        changedFields[key] = { from: currentVal, to: value };
      }
    }
    const currentMeta = (current.metadata as Record<string, unknown>) || {};
    for (const [key, value] of Object.entries(metaUpdates)) {
      if (currentMeta[key] !== value) {
        changedFields[`metadata.${key}`] = { from: currentMeta[key], to: value };
      }
    }

    if (Object.keys(changedFields).length > 0) {
      await logAuditAction({
        adminUserId: adminUser.id,
        action: "update_student_profile",
        targetType: "student",
        targetId: studentId,
        details: {
          display_name: current.display_name,
          changed_fields: changedFields,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin caregiver update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/caregivers/[caregiverId]
 *
 * Hard delete a student profile (FK cascades handle connections).
 * Note: Route path still uses "caregiverId" for URL compatibility.
 */
export async function DELETE(
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

    // Fetch current for audit
    const { data: current, error: fetchError } = await db
      .from("business_profiles")
      .select("display_name, email, type")
      .eq("id", studentId)
      .eq("type", "student")
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Hard delete - include type constraint to prevent accidental deletion of other profile types
    const { error: deleteError } = await db
      .from("business_profiles")
      .delete()
      .eq("id", studentId)
      .eq("type", "student");

    if (deleteError) {
      console.error("Admin student delete error:", deleteError);
      return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "delete_student",
      targetType: "student",
      targetId: studentId,
      details: { display_name: current.display_name, email: current.email },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin student delete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";

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

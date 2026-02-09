import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  getAdminUser,
  getServiceClient,
  logAuditAction,
} from "@/lib/admin";
import type { AdminUser } from "@/lib/types";

/**
 * GET /api/admin/team — list all admins
 * POST /api/admin/team — add admin (master_admin only)
 * DELETE /api/admin/team — remove admin (master_admin only)
 */

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const db = getServiceClient();
    const { data: admins, error } = await db
      .from("admin_users")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch admins:", error);
      return NextResponse.json({ error: "Failed to fetch admins" }, { status: 500 });
    }

    return NextResponse.json({ admins: admins ?? [] });
  } catch (err) {
    console.error("Admin team GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser || adminUser.role !== "master_admin") {
      return NextResponse.json(
        { error: "Only master admins can add new admins" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const email = (body.email as string)?.trim().toLowerCase();
    const role = (body.role as string) || "admin";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!["admin", "master_admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const db = getServiceClient();

    // Find the user in auth.users by email
    const { data: authUsers, error: authError } = await db.auth.admin.listUsers();

    if (authError) {
      console.error("Failed to list auth users:", authError);
      return NextResponse.json({ error: "Failed to look up user" }, { status: 500 });
    }

    const targetUser = authUsers.users.find(
      (u) => u.email?.toLowerCase() === email
    );

    if (!targetUser) {
      return NextResponse.json(
        { error: "No account found with that email. The user must sign up first." },
        { status: 404 }
      );
    }

    // Check if already an admin
    const { data: existing } = await db
      .from("admin_users")
      .select("id")
      .eq("user_id", targetUser.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "User is already an admin" }, { status: 409 });
    }

    // Add admin
    const { data: newAdmin, error: insertError } = await db
      .from("admin_users")
      .insert({
        user_id: targetUser.id,
        email,
        role,
        granted_by: adminUser.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to add admin:", insertError);
      return NextResponse.json({ error: "Failed to add admin" }, { status: 500 });
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "add_admin",
      targetType: "admin_user",
      targetId: (newAdmin as AdminUser).id,
      details: { email, role },
    });

    return NextResponse.json({ admin: newAdmin });
  } catch (err) {
    console.error("Admin team POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser || adminUser.role !== "master_admin") {
      return NextResponse.json(
        { error: "Only master admins can remove admins" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const targetId = body.id as string;

    if (!targetId) {
      return NextResponse.json({ error: "Admin ID is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Don't allow removing the last master_admin
    const { data: target } = await db
      .from("admin_users")
      .select("*")
      .eq("id", targetId)
      .single();

    if (!target) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    if ((target as AdminUser).role === "master_admin") {
      const { count } = await db
        .from("admin_users")
        .select("*", { count: "exact", head: true })
        .eq("role", "master_admin");

      if (count !== null && count <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last master admin" },
          { status: 400 }
        );
      }
    }

    const { error: deleteError } = await db
      .from("admin_users")
      .delete()
      .eq("id", targetId);

    if (deleteError) {
      console.error("Failed to remove admin:", deleteError);
      return NextResponse.json({ error: "Failed to remove admin" }, { status: 500 });
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "remove_admin",
      targetType: "admin_user",
      targetId,
      details: { email: (target as AdminUser).email },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin team DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

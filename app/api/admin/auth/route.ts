import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, seedInitialAdmin } from "@/lib/admin";

/**
 * GET /api/admin/auth
 *
 * Returns the AdminUser if the caller is an admin.
 * Auto-seeds from ADMIN_EMAILS env var if no admins exist.
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if already an admin
    let adminUser = await getAdminUser(user.id);

    // If not admin, try seeding from ADMIN_EMAILS
    if (!adminUser) {
      adminUser = await seedInitialAdmin(user.id, user.email);
    }

    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ adminUser });
  } catch (err) {
    console.error("Admin auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

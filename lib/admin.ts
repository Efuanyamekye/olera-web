import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/types";

/**
 * Creates a Supabase client with service role key (bypasses RLS).
 * Only use server-side in API routes.
 */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return createClient(url, serviceKey);
}

/**
 * Get the authenticated user from cookies.
 * Returns null if not authenticated.
 */
export async function getAuthUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Look up admin_users row for a given auth user ID.
 */
export async function getAdminUser(userId: string): Promise<AdminUser | null> {
  const db = getServiceClient();
  const { data } = await db
    .from("admin_users")
    .select("*")
    .eq("user_id", userId)
    .single();
  return (data as AdminUser) ?? null;
}

/**
 * Check if a user is any type of admin.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const admin = await getAdminUser(userId);
  return admin !== null;
}

/**
 * Check if a user is a master admin.
 */
export async function isMasterAdmin(userId: string): Promise<boolean> {
  const admin = await getAdminUser(userId);
  return admin?.role === "master_admin";
}

/**
 * Seed initial admin from ADMIN_EMAILS env variable.
 * Only creates if the admin_users table is empty and the user's email
 * matches one in the comma-separated ADMIN_EMAILS list.
 */
export async function seedInitialAdmin(
  userId: string,
  email: string
): Promise<AdminUser | null> {
  const adminEmails = process.env.ADMIN_EMAILS;
  if (!adminEmails) return null;

  const allowedEmails = adminEmails.split(",").map((e) => e.trim().toLowerCase());
  if (!allowedEmails.includes(email.toLowerCase())) return null;

  const db = getServiceClient();

  // Check if any admins exist
  const { count } = await db
    .from("admin_users")
    .select("*", { count: "exact", head: true });

  // If admins already exist, only seed if this email isn't already an admin
  if (count && count > 0) {
    const { data: existing } = await db
      .from("admin_users")
      .select("*")
      .eq("user_id", userId)
      .single();
    return (existing as AdminUser) ?? null;
  }

  // No admins exist — seed as master_admin
  const { data: newAdmin, error } = await db
    .from("admin_users")
    .insert({
      user_id: userId,
      email: email.toLowerCase(),
      role: "master_admin",
    })
    .select()
    .single();

  if (error) {
    // Handle race condition
    if (error.code === "23505") {
      const { data: existing } = await db
        .from("admin_users")
        .select("*")
        .eq("user_id", userId)
        .single();
      return (existing as AdminUser) ?? null;
    }
    console.error("Failed to seed admin:", error);
    return null;
  }

  return newAdmin as AdminUser;
}

/**
 * Log an admin action to the audit_log table.
 */
export async function logAuditAction(params: {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}) {
  const db = getServiceClient();
  const { error } = await db.from("audit_log").insert({
    admin_user_id: params.adminUserId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    details: params.details ?? {},
  });

  if (error) {
    console.error("Failed to log audit action:", error);
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/medjobs/toggle-visibility
 *
 * Toggle a student's profile visibility (is_active).
 * Students can pause their profile to hide from providers,
 * or unpause to become visible again.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { visible } = body as { visible: boolean };

    if (typeof visible !== "boolean") {
      return NextResponse.json({ error: "visible must be a boolean" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Get account
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Get student profile
    const { data: student } = await admin
      .from("business_profiles")
      .select("id, metadata")
      .eq("account_id", account.id)
      .eq("type", "student")
      .single();
    if (!student) {
      return NextResponse.json({ error: "Student profile not found" }, { status: 404 });
    }

    const meta = (student.metadata ?? {}) as Record<string, unknown>;

    // Only allow toggling if they've completed the application at least once
    if (!meta.application_completed && visible) {
      return NextResponse.json(
        { error: "Must complete Go Live process first" },
        { status: 400 }
      );
    }

    // Update visibility
    const { error: updateError } = await admin
      .from("business_profiles")
      .update({
        is_active: visible,
        updated_at: new Date().toISOString(),
      })
      .eq("id", student.id);

    if (updateError) {
      console.error("Failed to toggle visibility:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true, is_active: visible });
  } catch (err) {
    console.error("toggle-visibility error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

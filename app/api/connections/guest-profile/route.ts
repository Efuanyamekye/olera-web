import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/connections/guest-profile
 *
 * Looks up a placeholder profile by claim token.
 * Used by guests to access their inbox before claiming their account.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { claimToken } = body as { claimToken: string };

    if (!claimToken) {
      return NextResponse.json(
        { error: "Missing claim token" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(claimToken)) {
      return NextResponse.json(
        { error: "Invalid claim token" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const db = createClient(url, serviceKey);

    // Look up the placeholder profile by claim token
    const { data: profile, error } = await db
      .from("business_profiles")
      .select("id, email, display_name")
      .eq("claim_token", claimToken)
      .is("account_id", null) // Only unclaimed profiles
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      profileId: profile.id,
      email: profile.email,
      displayName: profile.display_name,
    });
  } catch (err) {
    console.error("Guest profile lookup error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

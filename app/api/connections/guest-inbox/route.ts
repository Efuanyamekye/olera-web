import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/connections/guest-inbox
 *
 * Fetches connections for a guest user using their claim token.
 * Bypasses RLS using service role since guests aren't authenticated.
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
    const { data: profile, error: profileError } = await db
      .from("business_profiles")
      .select("id")
      .eq("claim_token", claimToken)
      .is("account_id", null)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // Fetch connections where this profile is the sender
    const { data: connections, error: connError } = await db
      .from("connections")
      .select(`
        id,
        type,
        status,
        message,
        metadata,
        created_at,
        updated_at,
        to_profile:to_profile_id (
          id,
          display_name,
          slug,
          image_url,
          type,
          category,
          city,
          state,
          source_provider_id
        )
      `)
      .eq("from_profile_id", profile.id)
      .in("type", ["inquiry", "request"])
      .order("updated_at", { ascending: false });

    if (connError) {
      console.error("Failed to fetch guest connections:", connError);
      return NextResponse.json(
        { error: "Failed to fetch connections" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      profileId: profile.id,
      connections: connections || [],
    });
  } catch (err) {
    console.error("Guest inbox error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

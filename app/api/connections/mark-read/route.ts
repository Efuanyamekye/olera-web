import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";

/**
 * POST /api/connections/mark-read
 *
 * Mark a connection as read by the current user's profile.
 * Stores read timestamp in metadata.read_by[profileId].
 *
 * Body: { connectionId: string, profileId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { connectionId, profileId: requestedProfileId } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Get user's account first (accounts.user_id → auth.users.id)
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Get user's profile IDs (business_profiles.account_id → accounts.id)
    const { data: profiles } = await db
      .from("business_profiles")
      .select("id")
      .eq("account_id", account.id);

    const profileIds = (profiles || []).map((p) => p.id);

    if (profileIds.length === 0) {
      return NextResponse.json({ error: "No profiles found" }, { status: 404 });
    }

    // Fetch the connection
    const { data: connection, error: fetchError } = await db
      .from("connections")
      .select("id, from_profile_id, to_profile_id, metadata")
      .eq("id", connectionId)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Verify user is a participant (either from or to profile must belong to user)
    const isParticipant =
      profileIds.includes(connection.from_profile_id) ||
      profileIds.includes(connection.to_profile_id);

    if (!isParticipant) {
      return NextResponse.json(
        { error: "Not authorized to mark this connection as read" },
        { status: 403 }
      );
    }

    // Determine which profile to mark as having read
    // Use the provided profileId if valid, otherwise fall back to detection
    let readerProfileId: string;

    if (requestedProfileId && profileIds.includes(requestedProfileId)) {
      // Use the explicitly provided profile ID (verified to belong to user)
      const isValidParticipant =
        requestedProfileId === connection.from_profile_id ||
        requestedProfileId === connection.to_profile_id;

      if (isValidParticipant) {
        readerProfileId = requestedProfileId;
      } else {
        return NextResponse.json(
          { error: "Provided profileId is not a participant in this connection" },
          { status: 403 }
        );
      }
    } else {
      // Fallback: detect which of the user's profiles is a participant
      readerProfileId = profileIds.includes(connection.from_profile_id)
        ? connection.from_profile_id
        : connection.to_profile_id;
    }

    // Update metadata.read_by
    const existingMeta =
      (connection.metadata as Record<string, unknown>) || {};
    const existingReadBy =
      (existingMeta.read_by as Record<string, string>) || {};

    const updatedReadBy = {
      ...existingReadBy,
      [readerProfileId]: new Date().toISOString(),
    };

    const { error: updateError } = await db
      .from("connections")
      .update({
        metadata: { ...existingMeta, read_by: updatedReadBy },
      })
      .eq("id", connectionId);

    if (updateError) {
      console.error("[mark-read] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to mark as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, profileId: readerProfileId });
  } catch (err) {
    console.error("[mark-read] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

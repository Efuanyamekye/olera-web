import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { buildIntroMessage } from "@/lib/build-intro-message";

interface ThreadMessage {
  from_profile_id: string;
  text: string;
  created_at: string;
  type?: string;
}

/**
 * PATCH /api/connections/update-intent
 *
 * Updates the care request fields in connections.message and regenerates auto_intro.
 * Only the sender (from_profile_id) can update. Connection must be pending or accepted.
 *
 * Supports both authenticated users and guests with claim tokens.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const { connectionId, careType, careRecipient, urgency, additionalNotes, claimToken } = body as {
      connectionId?: string;
      careType?: string;
      careRecipient?: string;
      urgency?: string;
      additionalNotes?: string;
      claimToken?: string;
    };

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 400 }
      );
    }

    // Need admin client for RLS bypass (guest flow)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey);

    // Determine profile ID — from authenticated user or claim token
    let profileId: string | null = null;

    if (user) {
      // Authenticated user: get active profile
      const { data: account } = await admin
        .from("accounts")
        .select("active_profile_id")
        .eq("user_id", user.id)
        .single();

      profileId = account?.active_profile_id || null;
    } else if (claimToken) {
      // Guest: validate claim token
      const { data: guestProfile } = await admin
        .from("business_profiles")
        .select("id")
        .eq("claim_token", claimToken)
        .is("account_id", null)
        .single();

      profileId = guestProfile?.id || null;
    }

    if (!profileId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Fetch the connection (using admin client for RLS bypass)
    const { data: connection, error: fetchError } = await admin
      .from("connections")
      .select("id, from_profile_id, to_profile_id, status, message, metadata")
      .eq("id", connectionId)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Only the sender can edit the care request
    if (connection.from_profile_id !== profileId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Can only edit on active connections
    if (connection.status !== "pending" && connection.status !== "accepted") {
      return NextResponse.json(
        { error: "Cannot edit this connection" },
        { status: 400 }
      );
    }

    // Parse existing message JSON
    let existingMessage: Record<string, unknown> = {};
    if (connection.message) {
      try {
        existingMessage = JSON.parse(connection.message as string);
      } catch {
        existingMessage = {};
      }
    }

    // Merge updated fields (only override if explicitly provided)
    if (careType !== undefined) existingMessage.care_type = careType;
    if (careRecipient !== undefined) existingMessage.care_recipient = careRecipient;
    if (urgency !== undefined) existingMessage.urgency = urgency;
    if (additionalNotes !== undefined) existingMessage.additional_notes = additionalNotes;

    // Regenerate auto_intro with updated intent data
    const newAutoIntro = buildIntroMessage(
      [], // no profile care types needed — intent values take precedence
      [],
      undefined,
      undefined,
      (existingMessage.care_type as string) || null,
      (existingMessage.care_recipient as string) || null,
      (existingMessage.urgency as string) || null,
    );

    // Build updated metadata
    const existingMeta =
      (connection.metadata as Record<string, unknown>) || {};
    const existingThread = (existingMeta.thread as ThreadMessage[]) || [];

    const systemMessage: ThreadMessage = {
      from_profile_id: profileId,
      text: "Care request updated",
      created_at: new Date().toISOString(),
      type: "system",
    };

    const updatedThread = [...existingThread, systemMessage];
    const updatedMetadata = {
      ...existingMeta,
      auto_intro: newAutoIntro,
      thread: updatedThread,
    };

    const updatedMessageStr = JSON.stringify(existingMessage);

    // Persist (use admin client for RLS bypass in guest flow)
    const { error: updateError } = await admin
      .from("connections")
      .update({
        message: updatedMessageStr,
        metadata: updatedMetadata,
      })
      .eq("id", connectionId);

    if (updateError) {
      console.error("[update-intent] update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update care request" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: updatedMessageStr,
      metadata: updatedMetadata,
    });
  } catch (err) {
    console.error("[update-intent] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

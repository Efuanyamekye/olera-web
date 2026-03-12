import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/claim-profiles
 *
 * Handles placeholder profiles for a newly authenticated user.
 * This is called automatically after sign-in to:
 * 1. Find placeholder profiles matching the claim token or user's email
 * 2. Move their connections to the user's main family profile
 * 3. Delete the placeholders (NOT claim them as additional family profiles)
 *
 * Business rule: Each account should have exactly ONE family profile.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { claimToken } = body as { claimToken?: string };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const db = createClient(url, serviceKey);

    // Get the user's account
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ processed: 0 }); // Account not ready yet
    }

    // Find placeholder profiles to process
    const placeholderIds: string[] = [];

    // 1. Find by token (if provided)
    if (claimToken) {
      const { data: tokenProfile } = await db
        .from("business_profiles")
        .select("id")
        .eq("claim_token", claimToken)
        .is("account_id", null)
        .single();

      if (tokenProfile) {
        placeholderIds.push(tokenProfile.id);
      }
    }

    // 2. Find by email match
    if (user.email) {
      const { data: emailProfiles } = await db
        .from("business_profiles")
        .select("id")
        .eq("email", user.email.toLowerCase())
        .is("account_id", null)
        .eq("type", "family");

      if (emailProfiles?.length) {
        for (const profile of emailProfiles) {
          if (!placeholderIds.includes(profile.id)) {
            placeholderIds.push(profile.id);
          }
        }
      }
    }

    // If no placeholders found, nothing to do
    if (placeholderIds.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    // Find the user's main family profile
    const { data: mainFamily } = await db
      .from("business_profiles")
      .select("id")
      .eq("account_id", account.id)
      .eq("type", "family")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!mainFamily) {
      // Edge case: no family profile yet. The first placeholder becomes the main one.
      const firstPlaceholder = placeholderIds[0];
      await db
        .from("business_profiles")
        .update({
          account_id: account.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", firstPlaceholder);

      // Move connections from other placeholders to this one, then delete them
      for (let i = 1; i < placeholderIds.length; i++) {
        const otherId = placeholderIds[i];
        await db
          .from("connections")
          .update({ from_profile_id: firstPlaceholder })
          .eq("from_profile_id", otherId);

        await db.from("business_profiles").delete().eq("id", otherId);
      }

      return NextResponse.json({
        processed: placeholderIds.length,
        mainProfileId: firstPlaceholder,
      });
    }

    // Move connections from all placeholders to main family profile, then delete placeholders
    for (const placeholderId of placeholderIds) {
      if (placeholderId === mainFamily.id) continue;

      // Move outbound connections
      await db
        .from("connections")
        .update({ from_profile_id: mainFamily.id })
        .eq("from_profile_id", placeholderId);

      // Delete the placeholder (don't claim it as a second family profile)
      await db.from("business_profiles").delete().eq("id", placeholderId);
    }

    return NextResponse.json({
      processed: placeholderIds.length,
      mainProfileId: mainFamily.id,
    });
  } catch (err) {
    console.error("Claim profiles error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

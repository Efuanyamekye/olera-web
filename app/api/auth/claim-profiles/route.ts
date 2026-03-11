import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/claim-profiles
 *
 * Claims placeholder profiles for a newly authenticated user.
 * This is called automatically after sign-in to:
 * 1. Claim any placeholder profile matching the claim token from localStorage
 * 2. Claim any placeholder profiles matching the user's email
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
      return NextResponse.json({ claimed: 0 }); // Account not ready yet
    }

    let claimedCount = 0;
    const claimedProfileIds: string[] = [];

    // 1. Claim by token (if provided)
    if (claimToken) {
      const { data: tokenProfile } = await db
        .from("business_profiles")
        .select("id")
        .eq("claim_token", claimToken)
        .is("account_id", null)
        .single();

      if (tokenProfile) {
        const { error: claimError } = await db
          .from("business_profiles")
          .update({
            account_id: account.id,
            claimed_at: new Date().toISOString(),
          })
          .eq("id", tokenProfile.id);

        if (!claimError) {
          claimedCount++;
          claimedProfileIds.push(tokenProfile.id);
        }
      }
    }

    // 2. Claim by email match
    if (user.email) {
      const { data: emailProfiles } = await db
        .from("business_profiles")
        .select("id")
        .eq("email", user.email.toLowerCase())
        .is("account_id", null)
        .eq("type", "family");

      if (emailProfiles?.length) {
        for (const profile of emailProfiles) {
          // Skip if already claimed above
          if (claimedProfileIds.includes(profile.id)) continue;

          const { error: claimError } = await db
            .from("business_profiles")
            .update({
              account_id: account.id,
              claimed_at: new Date().toISOString(),
            })
            .eq("id", profile.id);

          if (!claimError) {
            claimedCount++;
            claimedProfileIds.push(profile.id);
          }
        }
      }
    }

    // 3. If we claimed any profiles, merge their connections to the user's main family profile
    if (claimedProfileIds.length > 0) {
      // Find the user's main family profile (the one that was created when they signed up)
      const { data: mainFamily } = await db
        .from("business_profiles")
        .select("id")
        .eq("account_id", account.id)
        .eq("type", "family")
        .is("claimed_at", null) // Not a claimed placeholder
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      // If there's a main family profile, reassign connections from claimed placeholders
      if (mainFamily) {
        for (const claimedId of claimedProfileIds) {
          if (claimedId === mainFamily.id) continue;

          // Move outbound connections
          await db
            .from("connections")
            .update({ from_profile_id: mainFamily.id })
            .eq("from_profile_id", claimedId);

          // Note: inbound connections stay pointed at the original profile
          // since providers already have a reference to it
        }
      }
    }

    return NextResponse.json({
      claimed: claimedCount,
      profileIds: claimedProfileIds,
    });
  } catch (err) {
    console.error("Claim profiles error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

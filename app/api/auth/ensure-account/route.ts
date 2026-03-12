import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { Account } from "@/lib/types";
import { sendLoopsEvent } from "@/lib/loops";

/**
 * Creates a Supabase admin client with service role key.
 * This bypasses RLS and should only be used server-side.
 * Returns null if service role key is not configured.
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not configured - falling back to authenticated client");
    return null;
  }
  return createClient(url, serviceKey);
}

/**
 * POST /api/auth/ensure-account
 *
 * Ensures the authenticated user has an account row in the database.
 * Creates one if it doesn't exist. This handles the edge case where
 * the database trigger didn't fire during auth.
 *
 * Request body (optional):
 * - display_name: string - Name to use if creating a new account
 *
 * Returns:
 * - 200: { account: Account } - The account (existing or newly created)
 * - 401: User not authenticated
 * - 500: Server error
 */
export async function POST(request: Request) {
  try {
    // Get the authenticated user from cookies
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Parse optional body
    let displayName = "";
    let markOnboardingComplete = false;
    try {
      const body = await request.json();
      displayName = body.display_name || "";
      markOnboardingComplete = body.mark_onboarding_complete === true;
    } catch {
      // No body or invalid JSON - that's fine
    }

    // Use auth metadata for display name if available
    // Google OAuth: full_name or name
    // Email signup: display_name
    const authName = user.user_metadata?.display_name
      || user.user_metadata?.full_name
      || user.user_metadata?.name
      || "";
    if (!displayName && authName) {
      displayName = authName;
    }

    // Try admin client first (bypasses RLS), fall back to authenticated client
    const adminClient = getAdminClient();
    const dbClient = adminClient || supabase;

    // Check if account already exists
    const { data: existingAccount, error: selectError } = await dbClient
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (existingAccount) {
      // Account exists — also ensure a baseline family profile exists
      const acctId = (existingAccount as Account).id;
      const { data: existingFamilyProfile } = await dbClient
        .from("business_profiles")
        .select("id")
        .eq("account_id", acctId)
        .eq("type", "family")
        .limit(1)
        .maybeSingle();

      if (!existingFamilyProfile) {
        const name = (existingAccount as Account).display_name || user.email?.split("@")[0] || "My Family";
        const { data: newFamilyProfile, error: profileError } = await dbClient.from("business_profiles").insert({
          account_id: acctId,
          slug: `family-${acctId.slice(0, 8)}`,
          type: "family",
          display_name: name,
          care_types: [],
          claim_state: "claimed",
          verification_state: "unverified",
          source: "user_created",
          is_active: true,
          metadata: {},
        }).select("id").single();
        if (profileError) {
          console.error("Error creating family profile (existing account):", profileError.message, profileError.code);
        }

        // Set active profile so user can send messages
        if (newFamilyProfile && !(existingAccount as Account).active_profile_id) {
          await dbClient.from("accounts").update({
            active_profile_id: newFamilyProfile.id,
          }).eq("id", acctId);
        }

        // Send welcome email for fresh signups where DB trigger created the account
        // No family profile = first time seeing this account = fresh signup
        try {
          const fullName = (existingAccount as Account).display_name
            || user.user_metadata?.full_name
            || user.user_metadata?.name
            || "";
          const nameParts = fullName.trim().split(/\s+/);
          await sendLoopsEvent({
            email: user.email || "",
            eventName: "user_signup",
            audience: "seeker",
            eventProperties: { source: "web_v2" },
            contactProperties: {
              firstName: nameParts[0] || "",
              lastName: nameParts.slice(1).join(" ") || "",
            },
          });
        } catch {
          // Non-blocking
        }
      }

      // If requested, mark onboarding as complete (used when skipping popup for users with deferred actions or existing profiles)
      if (markOnboardingComplete && !(existingAccount as Account).onboarding_completed) {
        await dbClient
          .from("accounts")
          .update({ onboarding_completed: true })
          .eq("id", acctId);
        return NextResponse.json({ account: { ...existingAccount, onboarding_completed: true } as Account });
      }

      return NextResponse.json({ account: existingAccount as Account });
    }

    // Account doesn't exist - create it
    // Note: selectError will be PGRST116 (no rows) if account doesn't exist
    if (selectError && selectError.code !== "PGRST116") {
      console.error("Error checking for account:", selectError.message, selectError.code);
      // Don't fail - try to create the account anyway
    }

    // Create the account
    const { data: newAccount, error: insertError } = await dbClient
      .from("accounts")
      .insert({
        user_id: user.id,
        display_name: displayName || user.email?.split("@")[0] || "",
        onboarding_completed: markOnboardingComplete,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating account:", insertError.message, insertError.code);

      // Handle race condition - another request might have created it
      if (insertError.code === "23505") { // unique_violation
        const { data: raceAccount } = await dbClient
          .from("accounts")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (raceAccount) {
          return NextResponse.json({ account: raceAccount as Account });
        }
      }

      // If insert failed due to RLS, provide a more helpful error
      if (insertError.code === "42501") { // insufficient_privilege
        return NextResponse.json(
          { error: "Database permissions issue. Please contact support." },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: `Failed to create account: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Loops: new account created (fire-and-forget)
    try {
      const fullName = displayName || user.user_metadata?.full_name || user.user_metadata?.name || "";
      const nameParts = fullName.trim().split(/\s+/);
      await sendLoopsEvent({
        email: user.email || "",
        eventName: "user_signup",
        audience: "seeker",
        eventProperties: { source: "web_v2" },
        contactProperties: {
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
        },
      });
    } catch {
      // Non-blocking
    }

    // Also ensure a baseline family profile exists so the Family Portal
    // is always accessible. Every authenticated user gets a family profile.
    const accountId = (newAccount as Account).id;
    const { data: existingFamily } = await dbClient
      .from("business_profiles")
      .select("id")
      .eq("account_id", accountId)
      .eq("type", "family")
      .limit(1)
      .maybeSingle();

    if (!existingFamily) {
      const familyDisplayName = displayName || user.email?.split("@")[0] || "My Family";
      const { data: newFamilyProfile, error: profileError } = await dbClient.from("business_profiles").insert({
        account_id: accountId,
        slug: `family-${accountId.slice(0, 8)}`,
        type: "family",
        display_name: familyDisplayName,
        care_types: [],
        claim_state: "claimed",
        verification_state: "unverified",
        source: "user_created",
        is_active: true,
        metadata: {},
      }).select("id").single();
      if (profileError) {
        console.error("Error creating family profile (new account):", profileError.message, profileError.code);
      }

      // Set active profile so user can send messages
      if (newFamilyProfile) {
        await dbClient.from("accounts").update({
          active_profile_id: newFamilyProfile.id,
        }).eq("id", accountId);
      }
    }

    return NextResponse.json({ account: newAccount as Account });
  } catch (err) {
    console.error("Ensure account error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

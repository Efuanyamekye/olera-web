import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { Account, Profile, ProfileCategory, Membership } from "@/lib/types";

/**
 * Creates a Supabase admin client with service role key.
 * Bypasses RLS — only use server-side.
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not configured — falling back to authenticated client");
    return null;
  }
  return createClient(url, serviceKey);
}

function generateSlug(name: string, city: string, state: string): string {
  const parts = [name, city, state].filter(Boolean);
  const slug = parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`;
}

/**
 * POST /api/auth/create-profile
 *
 * Creates a business profile for the authenticated user.
 * Uses admin client to bypass RLS policies on business_profiles.
 *
 * Request body:
 * - intent: "family" | "provider"
 * - providerType?: "organization" | "caregiver" | null
 * - displayName: string
 * - orgName?: string
 * - city?: string
 * - state?: string
 * - zip?: string
 * - careTypes?: string[]
 * - category?: string | null
 * - description?: string
 * - phone?: string
 * - visibleToFamilies?: boolean
 * - visibleToProviders?: boolean
 * - claimedProfileId?: string | null
 * - careNeeds?: string[]
 * - isAddingProfile?: boolean
 *
 * Returns:
 * - 200: { profileId: string }
 * - 401: Not authenticated
 * - 400: Validation error
 * - 500: Server error
 */
export async function POST(request: Request) {
  try {
    // Authenticate the user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const {
      intent,
      providerType,
      displayName,
      orgName,
      city,
      state,
      zip,
      careTypes = [],
      category,
      description,
      phone,
      visibleToFamilies,
      visibleToProviders,
      claimedProfileId,
      careNeeds,
      isAddingProfile = false,
    } = body;

    // Validate required fields
    if (!intent || !displayName?.trim()) {
      return NextResponse.json(
        { error: "Intent and display name are required." },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS, fall back to authenticated client
    const adminClient = getAdminClient();
    const db = adminClient || supabase;

    // Resolve the account for this user
    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select("id, display_name")
      .eq("user_id", user.id)
      .single<Pick<Account, "id" | "display_name">>();

    if (accountErr || !account) {
      return NextResponse.json(
        { error: "Account not found. Please try again." },
        { status: 400 }
      );
    }

    const accountId = account.id;
    let profileId: string;

    if (intent === "provider") {
      const profileType = providerType === "caregiver" ? "caregiver" : "organization";

      if (claimedProfileId) {
        // Claiming an existing seeded profile
        const { data: existing } = await db
          .from("business_profiles")
          .select("display_name, city, state, zip, care_types, description, phone")
          .eq("id", claimedProfileId)
          .single<Profile>();

        const claimUpdate: Record<string, unknown> = {
          account_id: accountId,
          claim_state: "pending",
        };

        if (!existing?.display_name?.trim() && (orgName || displayName))
          claimUpdate.display_name = orgName || displayName;
        if (!existing?.city && city) claimUpdate.city = city;
        if (!existing?.state && state) claimUpdate.state = state;
        if (!existing?.zip && zip) claimUpdate.zip = zip;
        if ((!existing?.care_types || existing.care_types.length === 0) && careTypes.length > 0)
          claimUpdate.care_types = careTypes;
        if (!existing?.description?.trim() && description) claimUpdate.description = description;
        if (!existing?.phone && phone) claimUpdate.phone = phone;

        const { error: claimErr } = await db
          .from("business_profiles")
          .update(claimUpdate)
          .eq("id", claimedProfileId);

        if (claimErr) {
          console.error("Claim profile error:", claimErr);
          return NextResponse.json(
            { error: `Failed to claim profile: ${claimErr.message}` },
            { status: 500 }
          );
        }

        profileId = claimedProfileId;
      } else {
        // Create new provider profile
        const name = providerType === "organization" ? (orgName || displayName) : displayName;
        const slug = generateSlug(name, city || "", state || "");

        const { data: newProfile, error: insertErr } = await db
          .from("business_profiles")
          .insert({
            account_id: accountId,
            slug,
            type: profileType,
            category: (category as ProfileCategory) || null,
            display_name: name,
            description: description || null,
            phone: phone || null,
            city: city || null,
            state: state || null,
            zip: zip || null,
            care_types: careTypes,
            claim_state: "pending",
            verification_state: "unverified",
            source: "user_created",
            is_active: true,
            metadata: {
              visible_to_families: visibleToFamilies ?? true,
              visible_to_providers: visibleToProviders ?? true,
            },
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("Create provider profile error:", insertErr);
          return NextResponse.json(
            { error: `Failed to create profile: ${insertErr.message}` },
            { status: 500 }
          );
        }

        profileId = newProfile.id;
      }

      // Create membership for providers (check first — no unique constraint on account_id)
      const { data: existingMembership } = await db
        .from("memberships")
        .select("id")
        .eq("account_id", accountId)
        .limit(1);

      if (!existingMembership || existingMembership.length === 0) {
        await db.from("memberships").insert({
          account_id: accountId,
          plan: "free",
          status: "free",
        });
      }
    } else {
      // Create family profile
      const slug = generateSlug(displayName, city || "", state || "");

      const { data: newProfile, error: insertErr } = await db
        .from("business_profiles")
        .insert({
          account_id: accountId,
          slug,
          type: "family",
          display_name: displayName,
          city: city || null,
          state: state || null,
          zip: zip || null,
          care_types: careNeeds || careTypes || [],
          claim_state: "claimed",
          verification_state: "unverified",
          source: "user_created",
          is_active: true,
          metadata: {
            visible_to_families: visibleToFamilies ?? true,
            visible_to_providers: visibleToProviders ?? true,
          },
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("Create family profile error:", insertErr);
        return NextResponse.json(
          { error: `Failed to create profile: ${insertErr.message}` },
          { status: 500 }
        );
      }

      profileId = newProfile.id;
    }

    // Update account: mark onboarding complete + set active profile
    const accountUpdate: Record<string, unknown> = {
      onboarding_completed: true,
    };
    if (!account.display_name) {
      accountUpdate.display_name = displayName;
    }
    if (!isAddingProfile) {
      accountUpdate.active_profile_id = profileId;
    }

    const { error: updateErr } = await db
      .from("accounts")
      .update(accountUpdate)
      .eq("id", accountId);

    if (updateErr) {
      console.error("Update account error:", updateErr);
      // Profile was created — don't fail the whole request
    }

    return NextResponse.json({ profileId });
  } catch (err) {
    console.error("Create profile error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { actingProfileIds } from "@/lib/auth/profile-access.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAdminClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Resolve a provider ID to a business_profiles UUID.
 * If the provider is an iOS slug (not a UUID), looks up or creates
 * a business_profiles record.
 */
async function resolveProviderId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  providerId: string,
  providerName?: string,
  providerSlug?: string
): Promise<string | null> {
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      providerId
    );

  if (isUUID) {
    return providerId;
  }

  // Look up by slug first (most common case after our save key fix)
  const { data: bySlug } = await db
    .from("business_profiles")
    .select("id")
    .eq("slug", providerId)
    .limit(1)
    .single();

  if (bySlug) return bySlug.id;

  // Fall back to source_provider_id lookup (for iOS provider IDs)
  const { data: existing } = await db
    .from("business_profiles")
    .select("id")
    .eq("source_provider_id", providerId)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Create a business_profiles record from olera-providers data
  let city: string | null = null;
  let state: string | null = null;
  let phone: string | null = null;
  let category: string | null = null;
  let careTypes: string[] = [];
  let name = providerName || "Unknown Provider";

  const { data: iosProvider } = await db
    .from("olera-providers")
    .select("provider_name, provider_category, main_category, city, state, phone")
    .eq("provider_id", providerId)
    .single();

  if (iosProvider) {
    name = iosProvider.provider_name || name;
    city = iosProvider.city;
    state = iosProvider.state;
    phone = iosProvider.phone;
    category = iosProvider.provider_category;
    careTypes = [iosProvider.provider_category];
    if (iosProvider.main_category && iosProvider.main_category !== iosProvider.provider_category) {
      careTypes.push(iosProvider.main_category);
    }
  }

  const { data: newProfile, error } = await db
    .from("business_profiles")
    .insert({
      source_provider_id: providerId,
      slug: providerSlug || providerId,
      type: "organization",
      category,
      display_name: name,
      phone,
      city,
      state,
      care_types: careTypes,
      claim_state: "unclaimed",
      verification_state: "unverified",
      source: "seeded",
      is_active: true,
      metadata: {},
    })
    .select("id")
    .single();

  if (error) {
    // Race condition — another request created it
    if (error.code === "23505") {
      const { data: race } = await db
        .from("business_profiles")
        .select("id")
        .eq("source_provider_id", providerId)
        .limit(1)
        .single();
      return race?.id || null;
    }
    console.error("Failed to create provider profile:", error);
    return null;
  }

  return newProfile.id;
}

/**
 * POST /api/connections/save — Save a provider
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { providerId, providerName, providerSlug, providerMeta } = body as {
      providerId: string;
      providerName: string;
      providerSlug: string;
      providerMeta?: {
        location?: string;
        careTypes?: string[];
        image?: string | null;
        rating?: number;
      };
    };

    if (!providerId) {
      return NextResponse.json({ error: "Missing providerId" }, { status: 400 });
    }

    const admin = getAdminClient();
    const db = admin || supabase;

    // Ensure user has a family profile
    const { data: account } = await db
      .from("accounts")
      .select("id, active_profile_id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let fromProfileId: string;
    const { data: family } = await db
      .from("business_profiles")
      .select("id")
      .eq("account_id", account.id)
      .eq("type", "family")
      .limit(1)
      .single();

    if (family) {
      fromProfileId = family.id;
    } else {
      // Provider accounts stay provider-only. Without this, a provider who
      // taps the heart on a listing (usually their own) gets a family profile
      // attached to their account, family nudge emails start, and the navbar
      // shows "Switch to family". Agency team members count too.
      const providerIds = await actingProfileIds(db, user, { types: ["organization", "caregiver", "student"] });

      if (providerIds.length > 0) {
        return NextResponse.json(
          {
            error: "You're signed in to a provider account. To save providers, sign out and use a family account.",
            code: "PROVIDER_ACCOUNT",
          },
          { status: 409 }
        );
      }

      const displayName = user.email?.split("@")[0] || "Family";
      const slug = await generateUniqueSlugFromName(db, displayName);
      const { data: newProfile, error: profileError } = await db
        .from("business_profiles")
        .insert({
          account_id: account.id,
          slug,
          type: "family",
          display_name: displayName,
          email: user.email || null, // Store email for admin visibility
          care_types: [],
          claim_state: "claimed",
          verification_state: "unverified",
          source: "user_created",
          metadata: {},
        })
        .select("id")
        .single();

      if (profileError) {
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }
      fromProfileId = newProfile.id;

      if (!account.active_profile_id) {
        await db
          .from("accounts")
          .update({ active_profile_id: newProfile.id, onboarding_completed: true })
          .eq("id", account.id);
      }
    }

    // Resolve provider to business_profiles UUID
    const toProfileId = await resolveProviderId(db, providerId, providerName, providerSlug);
    if (!toProfileId) {
      return NextResponse.json({ error: "Failed to resolve provider" }, { status: 500 });
    }

    // Insert save connection
    const { error: insertError } = await db.from("connections").insert({
      from_profile_id: fromProfileId,
      to_profile_id: toProfileId,
      type: "save",
      status: "pending",
      message: JSON.stringify({
        name: providerName,
        slug: providerSlug || providerId,
        location: providerMeta?.location || "",
        careTypes: providerMeta?.careTypes || [],
        image: providerMeta?.image || null,
        rating: providerMeta?.rating || undefined,
        originalProviderId: providerId,
      }),
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ status: "already_saved", toProfileId });
      }
      console.error("Save insert error:", insertError);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ status: "saved", toProfileId });
  } catch (err) {
    console.error("Save error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/connections/save — Unsave a provider
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { providerId } = body as { providerId: string };

    if (!providerId) {
      return NextResponse.json({ error: "Missing providerId" }, { status: 400 });
    }

    const admin = getAdminClient();
    const db = admin || supabase;

    // Get user's family profile
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: family } = await db
      .from("business_profiles")
      .select("id")
      .eq("account_id", account.id)
      .eq("type", "family")
      .limit(1)
      .single();

    if (!family) {
      return NextResponse.json({ status: "ok" }); // No profile = nothing to unsave
    }

    // Resolve provider ID
    const toProfileId = await resolveProviderId(db, providerId);
    if (!toProfileId) {
      return NextResponse.json({ status: "ok" }); // Provider doesn't exist = nothing to unsave
    }

    await db
      .from("connections")
      .delete()
      .eq("from_profile_id", family.id)
      .eq("to_profile_id", toProfileId)
      .eq("type", "save");

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Unsave error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

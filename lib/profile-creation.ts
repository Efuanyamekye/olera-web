import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Profile, ProfileCategory, Account } from "@/lib/types";

// ============================================================
// Types
// ============================================================

export interface ProfileCreationData {
  intent: "family" | "provider";
  providerType?: "organization" | "caregiver" | null;
  displayName: string;
  orgName?: string;
  city: string;
  state: string;
  zip?: string;
  careTypes: string[];
  category?: ProfileCategory | null;
  description?: string;
  phone?: string;
  visibleToFamilies?: boolean;
  visibleToProviders?: boolean;
  // Claim data
  claimedProfileId?: string | null;
  claimedProfile?: Profile | null;
  // Family-specific
  careRecipientName?: string;
  careRecipientRelation?: string;
  careNeeds?: string[];
  timeline?: string;
  relationshipToRecipient?: string;
}

// ============================================================
// Main function
// ============================================================

/**
 * Creates a profile after authentication completes.
 * Extracted from AuthFlowModal.handleComplete(), createProviderProfile(),
 * and createFamilyProfile() to eliminate duplication.
 *
 * Returns the created/claimed profile ID.
 */
export async function createProfileAfterAuth(
  data: ProfileCreationData,
  accountId: string,
  isAddingProfile: boolean
): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error("Backend not configured.");
  }

  const supabase = createClient();
  let profileId: string;

  if (data.intent === "provider") {
    profileId = await createProviderProfile(supabase, accountId, data);
  } else {
    profileId = await createFamilyProfile(supabase, accountId, data);
  }

  // Update account
  const displayName = data.displayName || data.orgName || "";
  const accountUpdate: Record<string, unknown> = {
    onboarding_completed: true,
  };
  // Only set display_name if account doesn't have one yet
  // (we'll read current account to check)
  const { data: currentAccount } = await supabase
    .from("accounts")
    .select("display_name")
    .eq("id", accountId)
    .single<Pick<Account, "display_name">>();

  if (!currentAccount?.display_name) {
    accountUpdate.display_name = displayName;
  }
  if (!isAddingProfile) {
    accountUpdate.active_profile_id = profileId;
  }

  const { error: accountErr } = await supabase
    .from("accounts")
    .update(accountUpdate)
    .eq("id", accountId);
  if (accountErr) throw accountErr;

  // Create membership for providers
  if (data.intent === "provider") {
    await supabase.from("memberships").upsert(
      { account_id: accountId, plan: "free", status: "free" },
      { onConflict: "account_id" }
    );
  }

  return profileId;
}

// ============================================================
// Internal helpers
// ============================================================

async function createProviderProfile(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  data: ProfileCreationData
): Promise<string> {
  const profileType = data.providerType === "caregiver" ? "caregiver" : "organization";

  if (data.claimedProfileId && data.claimedProfile) {
    // Claiming an existing seeded profile
    const s = data.claimedProfile;
    const claimUpdate: Record<string, unknown> = {
      account_id: accountId,
      claim_state: "pending",
    };

    if (!s.display_name?.trim() && (data.orgName || data.displayName))
      claimUpdate.display_name = data.orgName || data.displayName;
    if (!s.city && data.city) claimUpdate.city = data.city;
    if (!s.state && data.state) claimUpdate.state = data.state;
    if (!s.zip && data.zip) claimUpdate.zip = data.zip;
    if ((!s.care_types || s.care_types.length === 0) && data.careTypes.length > 0) {
      claimUpdate.care_types = data.careTypes;
    }
    if (!s.description?.trim() && data.description) claimUpdate.description = data.description;
    if (!s.phone && data.phone) claimUpdate.phone = data.phone;

    const { error: claimErr } = await supabase
      .from("business_profiles")
      .update(claimUpdate)
      .eq("id", data.claimedProfileId);
    if (claimErr) throw claimErr;

    return data.claimedProfileId;
  }

  // Create new profile
  const displayName = data.providerType === "organization"
    ? (data.orgName || data.displayName)
    : data.displayName;
  const slug = generateSlug(displayName, data.city, data.state);

  const { data: newProfile, error: profileErr } = await supabase
    .from("business_profiles")
    .insert({
      account_id: accountId,
      slug,
      type: profileType,
      category: data.category || null,
      display_name: displayName,
      description: data.description || null,
      phone: data.phone || null,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      care_types: data.careTypes,
      claim_state: "pending",
      verification_state: "unverified",
      source: "user_created",
      is_active: true,
      metadata: {
        visible_to_families: data.visibleToFamilies ?? true,
        visible_to_providers: data.visibleToProviders ?? true,
      },
    })
    .select("id")
    .single();

  if (profileErr) throw profileErr;
  return newProfile.id;
}

async function createFamilyProfile(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  data: ProfileCreationData
): Promise<string> {
  const slug = generateSlug(data.displayName, data.city, data.state);

  const { data: newProfile, error: profileErr } = await supabase
    .from("business_profiles")
    .insert({
      account_id: accountId,
      slug,
      type: "family",
      display_name: data.displayName,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      care_types: data.careNeeds || data.careTypes || [],
      claim_state: "claimed",
      verification_state: "unverified",
      source: "user_created",
      is_active: true,
      metadata: {
        care_recipient_name: data.careRecipientName || null,
        care_recipient_relation: data.careRecipientRelation || null,
        timeline: data.timeline || undefined,
        relationship_to_recipient: data.relationshipToRecipient || undefined,
      },
    })
    .select("id")
    .single();

  if (profileErr) throw profileErr;
  return newProfile.id;
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

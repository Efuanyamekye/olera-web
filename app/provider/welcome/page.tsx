import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/admin";
import { validateClaimToken } from "@/lib/claim-tokens";
import ProviderWelcomeClient from "@/components/provider-welcome/ProviderWelcomeClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome | Olera for Providers",
  description: "View and respond to families looking for care.",
};

export type ActionType = "lead" | "question" | "review" | "message" | "match" | "campaign";

interface ProviderWelcomePageProps {
  searchParams: Promise<{
    action?: ActionType;
    id?: string;
    token?: string;
    // Campaign-specific params for dynamic content
    headline?: string;
    message?: string;
  }>;
}

// Token validation result passed to client
export interface TokenValidationInfo {
  isValid: boolean;
  providerId?: string;
  providerSlug?: string;
  providerName?: string;
  emailHint?: string;
  error?: string;
}

interface ProviderAuthInfo {
  profile: {
    id: string;
    display_name: string;
    image_url: string | null;
    city: string | null;
    state: string | null;
    slug: string | null;
  } | null;
  email: string | null;
  // For unclaimed providers: data needed for claim flow
  isClaimed: boolean;
  sourceProviderId: string | null;
  providerEmail: string | null; // Contact email from business_profiles or ios_provider_profiles
}

/**
 * Helper to get provider info for unauthenticated users
 * - State 2 (claimed + expired magic link): Returns profile + auth email
 * - State 3 (unclaimed): Returns profile + contact email for verification
 */
async function getProviderInfoForAuth(
  action: ActionType,
  actionId: string | undefined
): Promise<ProviderAuthInfo> {
  const nullResult: ProviderAuthInfo = {
    profile: null,
    email: null,
    isClaimed: false,
    sourceProviderId: null,
    providerEmail: null
  };

  if (!actionId) return nullResult;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return nullResult;

  const adminDb = createAdminClient(url, serviceKey);

  let providerProfileId: string | null = null;

  // Step 1: Get provider profile ID from action data
  switch (action) {
    case "lead":
    case "match":
    case "message": {
      const { data: connection } = await adminDb
        .from("connections")
        .select("to_profile_id")
        .eq("id", actionId)
        .single();
      providerProfileId = connection?.to_profile_id || null;
      break;
    }
    case "question": {
      // Questions store provider_id as slug (e.g., "effys-home-care")
      const { data: question } = await adminDb
        .from("provider_questions")
        .select("provider_id")
        .eq("id", actionId)
        .single();
      if (question?.provider_id) {
        // Try lookup by slug first
        let { data: profile } = await adminDb
          .from("business_profiles")
          .select("id")
          .eq("slug", question.provider_id)
          .single();

        // Fallback: try source_provider_id (for iOS-imported providers)
        if (!profile) {
          const { data: fallbackProfile } = await adminDb
            .from("business_profiles")
            .select("id")
            .eq("source_provider_id", question.provider_id)
            .single();
          profile = fallbackProfile;
        }

        // Last fallback: try as UUID directly
        if (!profile) {
          const { data: uuidProfile } = await adminDb
            .from("business_profiles")
            .select("id")
            .eq("id", question.provider_id)
            .single();
          profile = uuidProfile;
        }

        providerProfileId = profile?.id || null;
      }
      break;
    }
    case "review": {
      // Reviews store provider_id as slug (e.g., "test-effy-s-homecare")
      const { data: review } = await adminDb
        .from("reviews")
        .select("provider_id")
        .eq("id", actionId)
        .single();
      if (review?.provider_id) {
        // Try lookup by slug first
        let { data: profile } = await adminDb
          .from("business_profiles")
          .select("id")
          .eq("slug", review.provider_id)
          .single();

        // Fallback: try source_provider_id (for iOS-imported providers)
        if (!profile) {
          const { data: fallbackProfile } = await adminDb
            .from("business_profiles")
            .select("id")
            .eq("source_provider_id", review.provider_id)
            .single();
          profile = fallbackProfile;
        }

        // Last fallback: try as UUID directly
        if (!profile) {
          const { data: uuidProfile } = await adminDb
            .from("business_profiles")
            .select("id")
            .eq("id", review.provider_id)
            .single();
          profile = uuidProfile;
        }

        providerProfileId = profile?.id || null;
      }
      break;
    }
  }

  if (!providerProfileId) return nullResult;

  // Step 2: Get provider profile details (including claim data)
  const { data: profile } = await adminDb
    .from("business_profiles")
    .select("id, display_name, image_url, city, state, slug, account_id, source_provider_id, email, claim_state")
    .eq("id", providerProfileId)
    .single();

  if (!profile) return nullResult;

  const profileData = {
    id: profile.id,
    display_name: profile.display_name,
    image_url: profile.image_url,
    city: profile.city,
    state: profile.state,
    slug: profile.slug,
  };

  // Check if claimed (has account_id AND claim_state is claimed)
  const isClaimed = !!profile.account_id && profile.claim_state === "claimed";

  // For CLAIMED providers: get auth user email (State 2)
  if (isClaimed && profile.account_id) {
    const { data: account } = await adminDb
      .from("accounts")
      .select("user_id")
      .eq("id", profile.account_id)
      .single();

    if (account?.user_id) {
      const { data: { user: authUser } } = await adminDb.auth.admin.getUserById(account.user_id);
      const email = authUser?.email || null;

      return {
        profile: profileData,
        email,
        isClaimed: true,
        sourceProviderId: profile.source_provider_id,
        providerEmail: null,
      };
    }
  }

  // For UNCLAIMED providers: get contact email for verification (State 3)
  let providerEmail = profile.email || null;

  // Fallback to ios_provider_profiles if no email on business_profile
  if (!providerEmail && profile.source_provider_id) {
    const { data: ios } = await adminDb
      .from("ios_provider_profiles")
      .select("email")
      .eq("provider_id", profile.id)
      .single();
    providerEmail = ios?.email || null;
  }

  // Last fallback to olera-providers table
  if (!providerEmail && profile.source_provider_id) {
    const { data: sourceProvider } = await adminDb
      .from("olera-providers")
      .select("email")
      .eq("provider_id", profile.source_provider_id)
      .single();
    providerEmail = sourceProvider?.email || null;
  }

  return {
    profile: profileData,
    email: null, // No auth email for unclaimed
    isClaimed: false,
    sourceProviderId: profile.source_provider_id,
    providerEmail,
  };
}

/**
 * Validate token server-side for campaign emails.
 * If valid, returns provider info so client can skip verification.
 */
async function validateTokenServerSide(token: string): Promise<TokenValidationInfo> {
  const result = validateClaimToken(token);

  if (!result.valid) {
    return { isValid: false, error: result.error };
  }

  const { providerId, email } = result;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { isValid: false, error: "Server configuration error" };
  }

  const adminDb = createAdminClient(url, serviceKey);

  // Verify provider exists and email matches
  const { data: provider, error: providerErr } = await adminDb
    .from("olera-providers")
    .select("email, provider_name, slug, provider_id")
    .eq("provider_id", providerId)
    .single();

  if (providerErr || !provider) {
    return { isValid: false, error: "Provider not found" };
  }

  if (provider.email?.toLowerCase() !== email.toLowerCase()) {
    return { isValid: false, error: "Provider email has changed" };
  }

  // Check if already claimed
  const { data: existingProfile } = await adminDb
    .from("business_profiles")
    .select("claim_state, account_id")
    .eq("source_provider_id", providerId)
    .maybeSingle();

  if (existingProfile?.claim_state === "claimed" && existingProfile?.account_id) {
    return { isValid: false, error: "This listing has already been claimed" };
  }

  // Mask email for display
  const [local, domain] = email.split("@");
  const maskedLocal = local.length <= 2
    ? "*".repeat(local.length)
    : local[0] + "***" + local[local.length - 1];
  const emailHint = `${maskedLocal}@${domain}`;

  return {
    isValid: true,
    providerId,
    providerSlug: provider.slug || providerId,
    providerName: provider.provider_name,
    emailHint,
  };
}

/**
 * Get provider info for campaign action (from token).
 * Similar to getProviderInfoForAuth but uses token-derived data.
 */
async function getProviderInfoFromToken(tokenInfo: TokenValidationInfo): Promise<ProviderAuthInfo> {
  if (!tokenInfo.isValid || !tokenInfo.providerId) {
    return {
      profile: null,
      email: null,
      isClaimed: false,
      sourceProviderId: null,
      providerEmail: null,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return {
      profile: null,
      email: null,
      isClaimed: false,
      sourceProviderId: null,
      providerEmail: null,
    };
  }

  const adminDb = createAdminClient(url, serviceKey);

  // Get business_profile for this provider
  const { data: bp } = await adminDb
    .from("business_profiles")
    .select("id, display_name, image_url, city, state, slug, source_provider_id, email")
    .eq("source_provider_id", tokenInfo.providerId)
    .maybeSingle();

  // Get provider email from olera-providers if not on business_profile
  let providerEmail = bp?.email || null;
  if (!providerEmail) {
    const { data: oleraProvider } = await adminDb
      .from("olera-providers")
      .select("email")
      .eq("provider_id", tokenInfo.providerId)
      .single();
    providerEmail = oleraProvider?.email || null;
  }

  if (bp) {
    return {
      profile: {
        id: bp.id,
        display_name: bp.display_name || tokenInfo.providerName || "Your Business",
        image_url: bp.image_url,
        city: bp.city,
        state: bp.state,
        slug: bp.slug,
      },
      email: null,
      isClaimed: false,
      sourceProviderId: bp.source_provider_id,
      providerEmail,
    };
  }

  // No business_profile yet - return minimal info from token
  return {
    profile: {
      id: tokenInfo.providerId,
      display_name: tokenInfo.providerName || "Your Business",
      image_url: null,
      city: null,
      state: null,
      slug: tokenInfo.providerSlug || null,
    },
    email: null,
    isClaimed: false,
    sourceProviderId: tokenInfo.providerId,
    providerEmail,
  };
}

export default async function ProviderWelcomePage({ searchParams }: ProviderWelcomePageProps) {
  const params = await searchParams;
  const action = params.action || "lead";
  const actionId = params.id;
  const token = params.token;
  const campaignHeadline = params.headline;
  const campaignMessage = params.message;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Token validation for campaign emails
  let tokenInfo: TokenValidationInfo | null = null;

  // Validate token if provided (campaign emails)
  if (token) {
    tokenInfo = await validateTokenServerSide(token);
  }

  // Fetch provider profile for the authenticated user
  let providerProfile = null;
  let providerStats = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let actionData: any = null;
  // For unauthenticated users (State 2: expired magic link, State 3: unclaimed)
  let providerForAuth: ProviderAuthInfo | null = null;

  if (user) {
    // Get the user's account and active profile
    const { data: account } = await supabase
      .from("accounts")
      .select("id, display_name, active_profile_id")
      .eq("user_id", user.id)
      .single();

    if (account?.active_profile_id) {
      // Get the provider profile
      const { data: profile } = await supabase
        .from("business_profiles")
        .select("id, display_name, type, slug, image_url, city, state, source_provider_id")
        .eq("id", account.active_profile_id)
        .single();

      if (profile && (profile.type === "organization" || profile.type === "caregiver")) {
        providerProfile = profile;

        // Build list of possible provider_id values for question lookups
        const providerIdVariants = [profile.slug, profile.id];
        if (profile.source_provider_id) {
          providerIdVariants.push(profile.source_provider_id);
        }

        // Use service client for operations that need RLS bypass
        const db = getServiceClient();

        // Fetch stats for the provider
        const [leadsResult, questionsResult, reviewsResult, messagesResult] = await Promise.all([
          // Leads (connections where this provider is the recipient)
          supabase
            .from("connections")
            .select("id", { count: "exact", head: true })
            .eq("to_profile_id", profile.id)
            .eq("status", "pending"),
          // Unanswered questions - check multiple provider_id formats
          db
            .from("provider_questions")
            .select("id", { count: "exact", head: true })
            .in("provider_id", providerIdVariants)
            .is("answer", null),
          // Total reviews
          supabase
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("provider_id", profile.id),
          // Unread messages (connections with unread messages)
          supabase
            .from("connections")
            .select("id", { count: "exact", head: true })
            .or(`to_profile_id.eq.${profile.id},from_profile_id.eq.${profile.id}`)
            .gt("metadata->unread_count", 0),
        ]);

        providerStats = {
          leads: leadsResult.count || 0,
          questions: questionsResult.count || 0,
          reviews: reviewsResult.count || 0,
          messages: messagesResult.count || 0,
        };

        // Fetch action-specific data if we have an ID
        if (actionId) {
          switch (action) {
            case "lead":
            case "match": {
              const { data: connection } = await supabase
                .from("connections")
                .select(`
                  id,
                  created_at,
                  metadata,
                  from_profile:from_profile_id (
                    id,
                    display_name,
                    city,
                    state,
                    image_url
                  )
                `)
                .eq("id", actionId)
                .single();
              // Supabase returns joined relations, normalize the shape
              if (connection) {
                actionData = {
                  ...connection,
                  from_profile: Array.isArray(connection.from_profile)
                    ? connection.from_profile[0]
                    : connection.from_profile,
                };
              }
              break;
            }
            case "question": {
              // Use service client to bypass RLS for question lookup
              const { data: question } = await db
                .from("provider_questions")
                .select("id, question, asker_name, created_at")
                .eq("id", actionId)
                .single();
              actionData = question;
              break;
            }
            case "review": {
              const { data: review } = await supabase
                .from("reviews")
                .select("id, rating, comment, reviewer_name, created_at")
                .eq("id", actionId)
                .single();
              actionData = review;
              break;
            }
            case "message": {
              const { data: connection } = await supabase
                .from("connections")
                .select(`
                  id,
                  metadata,
                  from_profile:from_profile_id (
                    id,
                    display_name,
                    image_url
                  ),
                  to_profile:to_profile_id (
                    id,
                    display_name,
                    image_url
                  )
                `)
                .eq("id", actionId)
                .single();
              // Supabase returns joined relations, normalize the shape
              if (connection) {
                actionData = {
                  ...connection,
                  from_profile: Array.isArray(connection.from_profile)
                    ? connection.from_profile[0]
                    : connection.from_profile,
                  to_profile: Array.isArray(connection.to_profile)
                    ? connection.to_profile[0]
                    : connection.to_profile,
                };
              }
              break;
            }
          }
        }
      }
    }
  } else {
    // User not authenticated — fetch provider info for State 2/3
    // For campaign action with token, use token-derived provider info
    if (action === "campaign" && tokenInfo?.isValid) {
      providerForAuth = await getProviderInfoFromToken(tokenInfo);
    } else {
      providerForAuth = await getProviderInfoForAuth(action, actionId);
    }

    // Also fetch action data for unauthenticated users (to show context in State 2/3)
    if (actionId && providerForAuth?.profile) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && serviceKey) {
        const adminDb = createAdminClient(url, serviceKey);

        switch (action) {
          case "lead":
          case "match": {
            const { data: connection } = await adminDb
              .from("connections")
              .select(`
                id,
                created_at,
                metadata,
                from_profile:from_profile_id (
                  id,
                  display_name,
                  city,
                  state,
                  image_url
                )
              `)
              .eq("id", actionId)
              .single();
            if (connection) {
              actionData = {
                ...connection,
                from_profile: Array.isArray(connection.from_profile)
                  ? connection.from_profile[0]
                  : connection.from_profile,
              };
            }
            break;
          }
          case "question": {
            const { data: question } = await adminDb
              .from("provider_questions")
              .select("id, question, asker_name, created_at")
              .eq("id", actionId)
              .single();
            actionData = question;
            break;
          }
          case "review": {
            const { data: review } = await adminDb
              .from("reviews")
              .select("id, rating, comment, reviewer_name, created_at")
              .eq("id", actionId)
              .single();
            actionData = review;
            break;
          }
          case "message": {
            const { data: connection } = await adminDb
              .from("connections")
              .select(`
                id,
                metadata,
                from_profile:from_profile_id (
                  id,
                  display_name,
                  image_url
                ),
                to_profile:to_profile_id (
                  id,
                  display_name,
                  image_url
                )
              `)
              .eq("id", actionId)
              .single();
            if (connection) {
              actionData = {
                ...connection,
                from_profile: Array.isArray(connection.from_profile)
                  ? connection.from_profile[0]
                  : connection.from_profile,
                to_profile: Array.isArray(connection.to_profile)
                  ? connection.to_profile[0]
                  : connection.to_profile,
              };
            }
            break;
          }
        }
      }
    }
  }

  return (
    <ProviderWelcomeClient
      user={user}
      providerProfile={providerProfile}
      providerStats={providerStats}
      action={action}
      actionId={actionId}
      actionData={actionData}
      providerForAuth={providerForAuth}
      tokenInfo={tokenInfo}
      campaignHeadline={campaignHeadline}
      campaignMessage={campaignMessage}
    />
  );
}

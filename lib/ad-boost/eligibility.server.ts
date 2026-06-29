import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import type { ExtendedMetadata } from "@/lib/profile-completeness";
import type { Profile } from "@/lib/types";
import {
  evaluateAdBoostEligibility,
  type AdBoostEligibility,
} from "./eligibility";

/**
 * Server-side ad-boost eligibility loader.
 *
 * Resolves the authenticated caller's provider profile and assembles the same
 * reviews + response-rate inputs the dashboard endpoint uses
 * (`app/api/provider/dashboard/route.ts`), then evaluates eligibility. This is
 * the AUTHORITATIVE check — the request API calls it before persisting so a
 * client can't bypass the gate by posting directly. Kept lean (only the
 * queries the score needs) rather than reusing the heavier dashboard payload.
 */

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// Completeness-relevant fields only (scorer reads display_name, category,
// address/city/state, image_url, care_types, description + metadata).
// Also fetch verification_state to gate ads behind verification.
const PROFILE_SELECT =
  "id, slug, source_provider_id, display_name, category, description, image_url, address, city, state, care_types, metadata, verification_state";

// The completeness-relevant subset of a provider's business_profiles row.
interface ProfileRow {
  id: string;
  slug: string | null;
  source_provider_id: string | null;
  display_name: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  care_types: string[] | null;
  metadata: Record<string, unknown> | null;
  verification_state: string | null;
}

export type AdBoostEligibilityResult =
  | {
      ok: true;
      profileId: string;
      slug: string;
      displayName: string | null;
      city: string | null;
      state: string | null;
      category: string | null;
      eligibility: AdBoostEligibility;
      /** True if provider is verified or verification not required (high-trust). */
      isVerified: boolean;
    }
  | { ok: false; status: number; error: string };

export async function loadAdBoostEligibility(): Promise<AdBoostEligibilityResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, active_profile_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return { ok: false, status: 400, error: "No account found" };
  }

  // Prefer the account's active_profile_id (accounts may hold more than one
  // provider profile); fall back to limit(1) for legacy accounts. Mirrors the
  // dashboard endpoint so eligibility is scored against the same profile the
  // provider sees.
  let profileRow: ProfileRow | null = null;

  if (account.active_profile_id) {
    const { data } = await supabase
      .from("business_profiles")
      .select(PROFILE_SELECT)
      .eq("id", account.active_profile_id)
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .maybeSingle();
    profileRow = (data as unknown as ProfileRow | null) ?? null;
  }

  if (!profileRow) {
    const { data } = await supabase
      .from("business_profiles")
      .select(PROFILE_SELECT)
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .limit(1);
    profileRow = (data?.[0] as unknown as ProfileRow | undefined) ?? null;
  }

  if (!profileRow?.slug) {
    return { ok: false, status: 400, error: "No provider profile found" };
  }

  const profile = profileRow as unknown as Profile;
  const metadata = (profileRow.metadata ?? {}) as ExtendedMetadata;

  const db = getServiceClient();
  const providerIdVariants = [profileRow.slug, profileRow.id];
  if (profileRow.source_provider_id)
    providerIdVariants.push(profileRow.source_provider_id);

  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  const [oleraReviewsRes, googleReviewsRes, questionsRes] = await Promise.all([
    db
      .from("reviews")
      .select("rating")
      .in("provider_id", providerIdVariants)
      .eq("status", "published")
      .limit(500),

    profileRow.source_provider_id
      ? db
          .from("olera-providers")
          .select("google_reviews_data, google_rating, provider_images, provider_logo")
          .eq("provider_id", profileRow.source_provider_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    db
      .from("provider_questions")
      .select("answer, created_at")
      .in("provider_id", providerIdVariants)
      .gte("created_at", ninetyDaysAgo.toISOString())
      .limit(500),
  ]);

  // ── Reviews summary (combined Olera + Google), weighted by count ──
  const oleraReviews = (oleraReviewsRes.data ?? []) as Array<{ rating: number }>;
  const oleraCount = oleraReviews.length;
  const oleraAvg =
    oleraCount > 0
      ? oleraReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / oleraCount
      : null;

  const googleData = (
    googleReviewsRes as {
      data: {
        google_reviews_data: { rating?: number | null; review_count?: number | null } | null;
        google_rating: number | null;
        provider_images: string | null;
        provider_logo: string | null;
      } | null;
    }
  ).data;
  const googleRating =
    googleData?.google_reviews_data?.rating ?? googleData?.google_rating ?? null;
  const googleCount = googleData?.google_reviews_data?.review_count ?? 0;

  const totalCount = oleraCount + googleCount;
  let combinedAvg: number | null = null;
  if (oleraAvg !== null && googleRating !== null && totalCount > 0) {
    combinedAvg = (oleraAvg * oleraCount + googleRating * googleCount) / totalCount;
  } else if (oleraAvg !== null) {
    combinedAvg = oleraAvg;
  } else if (googleRating !== null) {
    combinedAvg = googleRating;
  }

  const reviews = {
    count: totalCount,
    avgRating: combinedAvg !== null ? Math.round(combinedAvg * 10) / 10 : null,
  };

  // ── Response rate (90d): answered / received ──
  const questions = (questionsRes.data ?? []) as Array<{ answer: string | null }>;
  const responseRate = {
    totalQuestions: questions.length,
    answeredCount: questions.filter((q) => !!q.answer?.trim()).length,
  };

  // Score the gallery against the EFFECTIVE images families see, not just the
  // raw metadata.images — the provider's page (and the dashboard score) backfill
  // from iOS provider_images/logo when the provider hasn't uploaded their own.
  // Without this, the boost gate said "add gallery photos" while the dashboard +
  // the live page already showed a full gallery (same logic as
  // useProviderDashboardData). Keeps the gate scoring what's actually displayed.
  const baseImages = Array.isArray(metadata.images) ? metadata.images : [];
  let effectiveImages = baseImages;
  if (baseImages.length === 0 && googleData) {
    const iosImages =
      typeof googleData.provider_images === "string"
        ? googleData.provider_images.split(" | ").map((s) => s.trim()).filter(Boolean)
        : [];
    effectiveImages = googleData.provider_logo
      ? [googleData.provider_logo, ...iosImages]
      : iosImages;
  }
  const enrichedMetadata = { ...metadata, images: effectiveImages };

  const eligibility = evaluateAdBoostEligibility(
    profile,
    enrichedMetadata,
    reviews,
    responseRate,
  );

  // Verified if state is "verified" or "not_required" (high-trust providers)
  const isVerified =
    profileRow.verification_state === "verified" ||
    profileRow.verification_state === "not_required";

  return {
    ok: true,
    profileId: profileRow.id,
    slug: profileRow.slug,
    displayName: profileRow.display_name,
    city: profileRow.city,
    state: profileRow.state,
    category: profileRow.category,
    eligibility,
    isVerified,
  };
}

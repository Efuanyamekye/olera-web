import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPowerPageUrlForDeletedProvider } from "@/lib/power-pages";
import type { Provider as IOSProvider } from "@/lib/types/provider";
import type { Profile, ClaimState, VerificationState } from "@/lib/types";
import { directoryRowToProvider, accountRowToProvider } from "./adapters";
import type { ResolveResult } from "./types";

/**
 * THE front door for resolving a provider by slug-or-id.
 *
 * Resolution order (parity with the original inline logic in
 * `app/provider/[slug]/page.tsx`):
 *   1. directory (`olera-providers`) by `slug`, then by `provider_id`
 *   2. claimed account (`business_profiles`) by `slug` (active org/caregiver)
 *   3. soft-deleted directory row → reason-aware redirect / gone
 *   4. not-found
 *
 * Pass the caller's Supabase client so RLS visibility (anon vs service-role
 * vs SSR) matches the call site — the resolver never picks its own client.
 *
 * Returns data only. The caller maps the result to `notFound()` /
 * `permanentRedirect()`, keeping those control-flow throws at the page boundary.
 */
export async function resolveProvider(
  slugOrId: string,
  db: SupabaseClient,
): Promise<ResolveResult> {
  // 1. Directory (olera-providers) — slug first, then legacy provider_id.
  //    BUT: if the directory row has been claimed, prefer the business_profiles
  //    record since that's where provider edits live.
  try {
    const { data: bySlug } = await db
      .from("olera-providers")
      .select("*")
      .eq("slug", slugOrId)
      .not("deleted", "is", true)
      .single<IOSProvider>();
    if (bySlug) {
      // Check if this directory row has been claimed
      const { data: claimedProfile } = await db
        .from("business_profiles")
        .select("*")
        .eq("source_provider_id", bySlug.provider_id)
        .eq("is_active", true)
        .maybeSingle<Profile>();
      // Return claimed profile if:
      // 1. It exists
      // 2. claim_state is "claimed" (not unclaimed, pending, rejected, archived)
      // 3. verification_state is "verified" or "not_required" OR badge_approved
      // Unverified/pending/rejected providers' edits don't show — use directory data
      if (claimedProfile && claimedProfile.claim_state === "claimed") {
        const metadata = claimedProfile.metadata as Record<string, unknown> | null;
        const badgeApproved = metadata?.badge_approved === true;
        const isVerifiedClaim =
          claimedProfile.verification_state === "verified" ||
          claimedProfile.verification_state === "not_required" ||
          badgeApproved;
        if (isVerifiedClaim) {
          return { kind: "active", provider: accountRowToProvider(claimedProfile) };
        }
      }
      return { kind: "active", provider: directoryRowToProvider(bySlug) };
    }

    const { data: byId } = await db
      .from("olera-providers")
      .select("*")
      .eq("provider_id", slugOrId)
      .not("deleted", "is", true)
      .single<IOSProvider>();
    if (byId) {
      // Check if this directory row has been claimed
      const { data: claimedProfile } = await db
        .from("business_profiles")
        .select("*")
        .eq("source_provider_id", byId.provider_id)
        .eq("is_active", true)
        .maybeSingle<Profile>();
      // Return claimed profile if:
      // 1. It exists
      // 2. claim_state is "claimed" (not unclaimed, pending, rejected, archived)
      // 3. verification_state is "verified" or "not_required" OR badge_approved
      // Unverified/pending/rejected providers' edits don't show — use directory data
      if (claimedProfile && claimedProfile.claim_state === "claimed") {
        const metadata = claimedProfile.metadata as Record<string, unknown> | null;
        const badgeApproved = metadata?.badge_approved === true;
        const isVerifiedClaim =
          claimedProfile.verification_state === "verified" ||
          claimedProfile.verification_state === "not_required" ||
          badgeApproved;
        if (isVerifiedClaim) {
          return { kind: "active", provider: accountRowToProvider(claimedProfile) };
        }
      }
      return { kind: "active", provider: directoryRowToProvider(byId) };
    }
  } catch {
    // iOS Supabase not configured / not found — fall through.
  }

  // 2. Claimed account (business_profiles).
  try {
    const { data } = await db
      .from("business_profiles")
      .select("*")
      .eq("slug", slugOrId)
      .eq("is_active", true)
      .in("type", ["organization", "caregiver"])
      .single<Profile>();

    if (data) {
      // If this is a directory-claimed profile, enforce verification gate.
      // Unverified providers' edits should not be publicly visible — fall back
      // to the original directory data until they complete verification.
      // badge_approved is an admin override that grants verified status.
      if (data.source_provider_id) {
        const metadata = data.metadata as Record<string, unknown> | null;
        const badgeApproved = metadata?.badge_approved === true;
        const isVerifiedClaim =
          data.claim_state === "claimed" &&
          (data.verification_state === "verified" ||
           data.verification_state === "not_required" ||
           badgeApproved);

        if (!isVerifiedClaim) {
          // Fetch original directory data
          const { data: dirRow } = await db
            .from("olera-providers")
            .select("*")
            .eq("provider_id", data.source_provider_id)
            .not("deleted", "is", true)
            .single<IOSProvider>();

          if (dirRow) {
            return { kind: "active", provider: directoryRowToProvider(dirRow) };
          }
          // If directory row is deleted/missing, fall through to show profile
          // (edge case: provider claimed then directory was purged)
        }
      }
      // Native profiles (no source_provider_id) or verified claims: show as-is
      return { kind: "active", provider: accountRowToProvider(data) };
    }
  } catch {
    // fall through
  }

  // 3. Reason-aware response for soft-deleted directory rows (migration 081).
  //    Runs AFTER both active lookups so a claimed account whose underlying
  //    directory row was soft-deleted still wins above.
  try {
    const { data: deletedRow } = await db
      .from("olera-providers")
      .select("provider_category, state, city, deletion_reason")
      .or(`slug.eq.${slugOrId},provider_id.eq.${slugOrId}`)
      .eq("deleted", true)
      .limit(1)
      .maybeSingle<{
        provider_category: string | null;
        state: string | null;
        city: string | null;
        deletion_reason: IOSProvider["deletion_reason"];
      }>();

    if (deletedRow) {
      if (deletedRow.deletion_reason === "provider_request") return { kind: "gone" };
      const to = buildPowerPageUrlForDeletedProvider({
        category: deletedRow.provider_category,
        state: deletedRow.state,
        city: deletedRow.city,
      });
      // A null url means no power page to land on → fall through to not-found,
      // matching the original `if (deletedRedirect) permanentRedirect(...)`.
      if (to) return { kind: "redirect", to };
    }
  } catch {
    // Supabase unreachable — fall through to not-found.
  }

  return { kind: "not-found" };
}

/**
 * Batch directory email lookup: given a set of `olera-providers.provider_id`s,
 * return a `provider_id → email` map for the rows that have an email and aren't
 * soft-deleted. The lean projection (`provider_id, email`) is deliberate — this
 * powers email-fallback resolution (admin leads), NOT display, so it never pulls
 * the heavy JSONB columns a full `ProviderView` would.
 *
 * Centralizing this here keeps the `.from("olera-providers")` read behind the
 * front door (the eslint guard later bans raw `.from(...)` outside this module).
 * Chunks the id set so a large batch can't blow past PostgREST URL limits.
 */
export async function getProviderEmailsByIds(
  ids: string[],
  db: SupabaseClient,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;

  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    try {
      const { data } = await db
        .from("olera-providers")
        .select("provider_id, email")
        .in("provider_id", slice)
        .not("deleted", "is", true);
      for (const row of (data as { provider_id: string; email: string | null }[] | null) ?? []) {
        if (row.email) out.set(row.provider_id, row.email);
      }
    } catch {
      // Supabase unreachable for this chunk — skip; partial map degrades gracefully.
    }
  }
  return out;
}

export interface ProviderDimensions {
  city: string | null;
  state: string | null;
  category: string | null;
}

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resolve city/state/category for a set of provider URL identifiers.
 *
 * A `/provider/[slug]` identifier resolves against `olera-providers.slug`
 * (modern), then `olera-providers.provider_id` (legacy alphanumeric IDs), then
 * `business_profiles.slug` (claimed) — all three, in that order, so legacy URLs
 * aren't dropped. Chunked to keep the `.in()` filter under URL-length limits.
 * Relocated from the aggregate-provider-views cron's `fetchProviderDimensions`.
 */
export async function getProviderDimensionsByIdentifiers(
  ids: string[],
  db: SupabaseClient,
): Promise<Map<string, ProviderDimensions>> {
  const result = new Map<string, ProviderDimensions>();
  if (ids.length === 0) return result;

  for (const chunk of chunkIds(ids, 200)) {
    // 1. olera-providers by slug (most common — modern providers).
    const { data: oleraBySlug } = await db
      .from("olera-providers")
      .select("slug, city, state, provider_category")
      .in("slug", chunk);
    for (const row of oleraBySlug ?? []) {
      if (row.slug && !result.has(row.slug)) {
        result.set(row.slug, {
          city: row.city ?? null,
          state: row.state ?? null,
          category: row.provider_category ?? null,
        });
      }
    }

    // 2. Legacy fallback: olera-providers by provider_id (URLs that use the
    // alphanumeric ID instead of a slug).
    let missing = chunk.filter((id) => !result.has(id));
    if (missing.length > 0) {
      const { data: oleraById } = await db
        .from("olera-providers")
        .select("provider_id, city, state, provider_category")
        .in("provider_id", missing);
      for (const row of oleraById ?? []) {
        if (row.provider_id && !result.has(row.provider_id)) {
          result.set(row.provider_id, {
            city: row.city ?? null,
            state: row.state ?? null,
            category: row.provider_category ?? null,
          });
        }
      }
      missing = chunk.filter((id) => !result.has(id));
    }

    // 3. business_profiles by slug (claimed providers without olera-providers row).
    if (missing.length > 0) {
      const { data: bps } = await db
        .from("business_profiles")
        .select("slug, city, state, category")
        .in("slug", missing);
      for (const bp of bps ?? []) {
        if (bp.slug && !result.has(bp.slug)) {
          result.set(bp.slug, {
            city: bp.city ?? null,
            state: bp.state ?? null,
            category: bp.category ?? null,
          });
        }
      }
    }
  }

  return result;
}

/**
 * The claimed-account fields a directory provider needs to know its real claim
 * state (the directory row always reads "unclaimed"). `metadata` is left as
 * `unknown` so the caller casts it to whatever metadata shape it expects.
 */
export interface ClaimedAccount {
  claim_state: ClaimState;
  account_id: string | null;
  metadata: unknown;
  verification_state: VerificationState | null;
}

/**
 * Directory → account linkage: given an `olera-providers.provider_id`, fetch the
 * claimed `business_profiles` row linked via `source_provider_id`, if any.
 */
export async function getClaimedAccount(
  sourceProviderId: string,
  db: SupabaseClient,
): Promise<ClaimedAccount | null> {
  try {
    const { data } = await db
      .from("business_profiles")
      .select("claim_state, account_id, metadata, verification_state")
      .eq("source_provider_id", sourceProviderId)
      .maybeSingle();
    return (data as ClaimedAccount | null) ?? null;
  } catch {
    return null;
  }
}

/** Lighter projection used for SEO metadata (no full row, no side-channels). */
export interface ProviderMeta {
  provider_name: string | null;
  provider_category: string | null;
  city: string | null;
  state: string | null;
  provider_description: string | null;
  provider_images: string | null;
  provider_logo: string | null;
}

/**
 * Resolve only the fields needed for `generateMetadata`. Mirrors
 * `resolveProvider`'s source order (directory by slug/id, then account),
 * mapping account columns onto the directory-shaped meta keys.
 */
export async function resolveProviderForMeta(
  slugOrId: string,
  db: SupabaseClient,
): Promise<ProviderMeta | null> {
  const COLS = "provider_name, provider_category, city, state, provider_description, provider_images, provider_logo";
  const PROFILE_COLS = "display_name, category, city, state, description, image_url, claim_state, verification_state, metadata";

  // Helper to convert business_profiles row to ProviderMeta
  const profileToMeta = (d: {
    display_name: string | null;
    category: string | null;
    city: string | null;
    state: string | null;
    description: string | null;
    image_url: string | null;
  }): ProviderMeta => ({
    provider_name: d.display_name,
    provider_category: d.category,
    city: d.city,
    state: d.state,
    provider_description: d.description,
    provider_images: null,
    provider_logo: d.image_url,
  });

  try {
    const { data: bySlug } = await db
      .from("olera-providers")
      .select(`${COLS}, provider_id`)
      .eq("slug", slugOrId)
      .not("deleted", "is", true)
      .single();
    if (bySlug) {
      // Check if actively claimed (claim_state = "claimed" and not rejected)
      const { data: claimedProfile } = await db
        .from("business_profiles")
        .select(PROFILE_COLS)
        .eq("source_provider_id", (bySlug as { provider_id: string }).provider_id)
        .eq("is_active", true)
        .maybeSingle();
      const cp = claimedProfile as { claim_state: string; verification_state: string; metadata: Record<string, unknown> | null } | null;
      if (cp && cp.claim_state === "claimed") {
        const badgeApproved = cp.metadata?.badge_approved === true;
        const isVerifiedClaim =
          cp.verification_state === "verified" ||
          cp.verification_state === "not_required" ||
          badgeApproved;
        if (isVerifiedClaim) {
          return profileToMeta(claimedProfile as Parameters<typeof profileToMeta>[0]);
        }
      }
      return bySlug as unknown as ProviderMeta;
    }

    const { data: byId } = await db
      .from("olera-providers")
      .select(`${COLS}, provider_id`)
      .eq("provider_id", slugOrId)
      .not("deleted", "is", true)
      .single();
    if (byId) {
      // Check if verified claim (claim_state = "claimed" and verified/not_required)
      const { data: claimedProfile } = await db
        .from("business_profiles")
        .select(PROFILE_COLS)
        .eq("source_provider_id", (byId as { provider_id: string }).provider_id)
        .eq("is_active", true)
        .maybeSingle();
      const cp = claimedProfile as { claim_state: string; verification_state: string; metadata: Record<string, unknown> | null } | null;
      if (cp && cp.claim_state === "claimed") {
        const badgeApproved = cp.metadata?.badge_approved === true;
        const isVerifiedClaim =
          cp.verification_state === "verified" ||
          cp.verification_state === "not_required" ||
          badgeApproved;
        if (isVerifiedClaim) {
          return profileToMeta(claimedProfile as Parameters<typeof profileToMeta>[0]);
        }
      }
      return byId as unknown as ProviderMeta;
    }
  } catch {
    // fall through
  }

  try {
    const { data } = await db
      .from("business_profiles")
      .select("display_name, category, city, state, description, image_url, source_provider_id, claim_state, verification_state, metadata")
      .eq("slug", slugOrId)
      .eq("is_active", true)
      .in("type", ["organization", "caregiver"])
      .single();

    if (data) {
      const profile = data as {
        display_name: string | null;
        category: string | null;
        city: string | null;
        state: string | null;
        description: string | null;
        image_url: string | null;
        source_provider_id: string | null;
        claim_state: string | null;
        verification_state: string | null;
        metadata: Record<string, unknown> | null;
      };

      // If this is a directory-claimed profile, enforce verification gate.
      // Matches the gate logic in step 1 (claim_state + verification_state + badge_approved).
      if (profile.source_provider_id) {
        const badgeApproved = profile.metadata?.badge_approved === true;
        const isVerifiedClaim =
          profile.claim_state === "claimed" &&
          (profile.verification_state === "verified" ||
           profile.verification_state === "not_required" ||
           badgeApproved);

        if (!isVerifiedClaim) {
          // Fetch original directory data for meta
          const { data: dirRow } = await db
            .from("olera-providers")
            .select(COLS)
            .eq("provider_id", profile.source_provider_id)
            .not("deleted", "is", true)
            .single();

          if (dirRow) {
            return dirRow as unknown as ProviderMeta;
          }
        }
      }
      return profileToMeta(profile);
    }
  } catch {
    // fall through
  }

  return null;
}

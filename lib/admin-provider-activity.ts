import type { SupabaseClient } from "@supabase/supabase-js";

export const MEANINGFUL_PROVIDER_ACTIONS = [
  "lead_opened",
  "contact_revealed",
  "phone_clicked",
  "email_link_clicked",
  "continue_in_inbox",
  "ad_family_taken",
  "ad_family_passed",
  "question_responded",
  "review_viewed",
  "reviews_cta_clicked",
  "provider_profile_edited",
  "provider_saved",
  "matches_card_clicked",
  "matches_message_generated",
  "matches_outreach_sent",
  "market_outreach_status_updated",
  "referral_source_viewed",
  "referral_call_clicked",
  "managed_ads_cta_clicked",
  "managed_ads_requested",
  "your_market_playbook_clicked",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MeaningfulProviderActivityRow = {
  profile_id: string | null;
  provider_id: string | null;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ProviderIdentityProfile = {
  id: string;
  slug: string | null;
  source_provider_id: string | null;
};

export type CanonicalProviderActivity = {
  providerId: string;
  createdAt: string;
};

export async function fetchMeaningfulProviderActivity(
  db: SupabaseClient,
  from: string | null,
  to: string | null,
): Promise<{ data: MeaningfulProviderActivityRow[]; error: Error | null; truncated: boolean }> {
  const pageSize = 1000;
  const maxRows = 100000;
  const data: MeaningfulProviderActivityRow[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let query = db
      .from("provider_activity")
      .select("profile_id, provider_id, event_type, metadata, created_at")
      .in("event_type", [...MEANINGFUL_PROVIDER_ACTIONS])
      .order("created_at", { ascending: true });
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);

    const result = await query.range(offset, offset + pageSize - 1);
    if (result.error) {
      return { data: [], error: new Error(result.error.message), truncated: false };
    }

    const page = (result.data ?? []) as MeaningfulProviderActivityRow[];
    data.push(...page);
    if (page.length < pageSize) return { data, error: null, truncated: false };
  }

  return { data, error: null, truncated: true };
}

export async function canonicalizeMeaningfulProviderActivity(
  db: SupabaseClient,
  rows: MeaningfulProviderActivityRow[],
): Promise<{ data: CanonicalProviderActivity[]; error: Error | null }> {
  const meaningfulRows = rows.filter(isMeaningfulProviderAction);
  const aliases = [
    ...new Set(
      meaningfulRows
        .flatMap((row) => [row.profile_id, row.provider_id])
        .filter((providerId): providerId is string => Boolean(providerId)),
    ),
  ];
  const canonicalByAlias = new Map<string, string>();
  const batchSize = 100;

  for (let index = 0; index < aliases.length; index += batchSize) {
    const batch = aliases.slice(index, index + batchSize);
    const profileIds = batch.filter((providerId) => UUID_PATTERN.test(providerId));
    const [byId, bySlug, bySourceId] = await Promise.all([
      profileIds.length > 0
        ? db.from("business_profiles").select("id, slug, source_provider_id").in("id", profileIds)
        : Promise.resolve({ data: [] as ProviderIdentityProfile[], error: null }),
      db.from("business_profiles").select("id, slug, source_provider_id").in("slug", batch),
      db.from("business_profiles").select("id, slug, source_provider_id").in("source_provider_id", batch),
    ]);
    const error = byId.error ?? bySlug.error ?? bySourceId.error;
    if (error) return { data: [], error: new Error(error.message) };

    const profiles = [
      ...(byId.data ?? []),
      ...(bySlug.data ?? []),
      ...(bySourceId.data ?? []),
    ] as ProviderIdentityProfile[];
    for (const profile of profiles) {
      canonicalByAlias.set(profile.id, profile.id);
      if (profile.slug) canonicalByAlias.set(profile.slug, profile.id);
      if (profile.source_provider_id) canonicalByAlias.set(profile.source_provider_id, profile.id);
    }
  }

  const data: CanonicalProviderActivity[] = [];
  for (const row of meaningfulRows) {
    const rawId = row.profile_id ?? row.provider_id;
    if (!rawId) continue;
    data.push({
      providerId: canonicalByAlias.get(rawId) ?? rawId,
      createdAt: row.created_at,
    });
  }
  return { data, error: null };
}

export async function countCanonicalProviders(
  db: SupabaseClient,
  rows: MeaningfulProviderActivityRow[],
): Promise<{ count: number; error: Error | null }> {
  const canonical = await canonicalizeMeaningfulProviderActivity(db, rows);
  if (canonical.error) return { count: 0, error: canonical.error };
  return {
    count: new Set(canonical.data.map((row) => row.providerId)).size,
    error: null,
  };
}

function isMeaningfulProviderAction(row: MeaningfulProviderActivityRow): boolean {
  if (row.event_type !== "lead_opened") return true;
  return Boolean(row.metadata?.connection_id || row.metadata?.lead_id);
}

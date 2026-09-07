/**
 * Resolve a provider's set of known ID variants.
 *
 * `email_log.provider_id` and `provider_activity.provider_id` are both TEXT
 * columns whose callers write either `olera-providers.provider_id` (e.g.
 * "north-lauderdale-fl-0040", "QX76ebM") OR `business_profiles.id` (UUID)
 * depending on which the call site has handy. Empirically (sampled 20 rows
 * of email_log) ~80% are BP UUIDs, ~20% are OP provider_ids. Activity also uses BP slugs.
 *
 * Meanwhile, admin pages link to /admin/directory/[providerId] with FOUR
 * possible input shapes:
 *
 *   - `olera-providers.provider_id` — directory list of scraped rows
 *   - `olera-providers.slug` — analytics top-providers + latest-events tables
 *   - `business_profiles.id` (UUID) — directory list of user-created rows
 *   - `business_profiles.slug` — analytics leads table for BP-anchored providers
 *
 * Querying email_log/provider_activity with just the URL input silently drops
 * rows when the input shape doesn't match the storage shape. This helper does
 * up to four lookups to expand any input into the union of variants written
 * under that provider, so `.in("provider_id", allVariants)` matches everything.
 *
 * Usage:
 *
 *     const { allVariants } = await resolveProviderIdVariants(db, urlParam);
 *     const { data } = await db
 *       .from("email_log")
 *       .select("...")
 *       .in("provider_id", allVariants);
 *
 * Cost: up to 4 indexed lookups per call. Cheap enough for admin endpoints; don't
 * bother caching unless we see it hot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProviderIdVariants {
  /** Canonical identifier — `olera-providers.provider_id` when resolvable, otherwise the raw input. */
  slug: string;
  /** First business_profiles.id (UUID) found, if any. Null if no BP rows link to this provider. */
  businessProfileId: string | null;
  /** Union of every variant to match against. Use in `.in("provider_id", allVariants)`. */
  allVariants: string[];
}

export async function resolveProviderIdVariants(
  db: SupabaseClient,
  input: string,
): Promise<ProviderIdVariants> {
  // Always include the raw input — covers the case where it already matches
  // the storage shape (op.provider_id or bp.id).
  const variants = new Set<string>([input]);
  let canonical = input;
  let businessProfileId: string | null = null;

  try {
    // (a) If input is an olera-providers.slug, resolve the canonical provider_id.
    {
      const { data, error } = await db
        .from("olera-providers")
        .select("provider_id")
        .eq("slug", input)
        .maybeSingle();
      if (!error && data?.provider_id) {
        canonical = data.provider_id;
        variants.add(canonical);
      }
    }

    // (b) Resolve BP slugs and UUIDs, including self-registered profiles.
    {
      const uuidInput = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
      const { data, error } = await db
        .from("business_profiles")
        .select("id, slug, source_provider_id")
        .eq(uuidInput ? "id" : "slug", input)
        .maybeSingle();
      if (!error && data?.id) {
        variants.add(data.id);
        if (data.slug) variants.add(data.slug);
        businessProfileId = data.id;
        if (data.source_provider_id) {
          canonical = data.source_provider_id;
          variants.add(canonical);
        }
      }
    }

    // (c) Every BP whose source_provider_id matches the canonical OP id — picks
    //     up UUIDs of all claim-linked BPs (no UNIQUE on source_provider_id, so
    //     multiple rows can share). Cap at 10 defensively.
    {
      const { data, error } = await db
        .from("business_profiles")
        .select("id, slug")
        .eq("source_provider_id", canonical)
        .limit(10);
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<{ id: string | null; slug: string | null }>) {
          if (row.slug) variants.add(row.slug);
          if (row.id && !variants.has(row.id)) {
            variants.add(row.id);
            if (businessProfileId === null) businessProfileId = row.id;
          }
        }
      }
    }

    // (d) Add the directory slug for the resolved provider_id. Question rows
    // historically used either form, so readers need both even when the input
    // was a claimed business-profile slug.
    {
      const { data, error } = await db
        .from("olera-providers")
        .select("slug")
        .eq("provider_id", canonical)
        .maybeSingle();
      if (!error && data?.slug) variants.add(data.slug);
    }
  } catch (err) {
    // Best-effort — fall back to whatever we accumulated. Worst case is the
    // raw input only, which is the same failure mode as the pre-helper baseline.
    console.error("[provider-id-variants] lookup failed:", err);
  }

  return { slug: canonical, businessProfileId, allVariants: Array.from(variants) };
}

/**
 * Reverse direction of resolveProviderIdVariants: given a bag of raw IDs
 * (mix of olera-providers.provider_id short codes and business_profiles.id
 * UUIDs, as stored in email_log.provider_id), return a Map of rawId → slug.
 *
 * Used by /api/admin/analytics/summary so the Provider Comms Funnel can
 * intersect clicked-providers (email_log, raw id) with downstream-activity
 * providers (provider_activity, slug-only). Without canonicalization the two
 * sets live in disjoint namespaces and the intersection is always ~empty.
 *
 * IDs already in slug form (or unresolvable) are absent from the returned
 * map — callers should fall back to the raw value with `map.get(raw) ?? raw`.
 *
 * Two bulk `IN` lookups regardless of input size, partitioned by id shape.
 */
export async function resolveSlugsForRawIds(
  db: SupabaseClient,
  rawIds: Iterable<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set([...rawIds])].filter((s) => typeof s === "string" && s.length > 0);
  if (ids.length === 0) return map;

  const uuidLike: string[] = [];
  const codeLike: string[] = [];
  for (const id of ids) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      uuidLike.push(id);
    } else {
      codeLike.push(id);
    }
  }

  try {
    if (codeLike.length > 0) {
      const { data } = await db
        .from("olera-providers")
        .select("provider_id, slug")
        .in("provider_id", codeLike);
      for (const r of (data ?? []) as Array<{ provider_id: string | null; slug: string | null }>) {
        if (r.provider_id && r.slug) map.set(r.provider_id, r.slug);
      }
    }
    if (uuidLike.length > 0) {
      const { data } = await db
        .from("business_profiles")
        .select("id, slug")
        .in("id", uuidLike);
      for (const r of (data ?? []) as Array<{ id: string | null; slug: string | null }>) {
        if (r.id && r.slug) map.set(r.id, r.slug);
      }
    }
  } catch (err) {
    console.error("[provider-id-variants] reverse lookup failed:", err);
  }
  return map;
}

/**
 * Canonicalize a bag of raw provider ids to ONE stable key:
 * `olera-providers.slug`.
 *
 * `resolveSlugsForRawIds` only normalizes the click side (email_log) and
 * maps a UUID to `business_profiles.slug` — which for claimed providers is
 * the random-suffixed slug (e.g. "arya-home-healthcare-burke-va-2kgh").
 * Dashboard-origin events (provider_picker_clicked, provider_profile_edited)
 * also write that suffixed business_profiles.slug, while digest/email_log
 * and question_responded sit in the un-suffixed olera-providers.slug space.
 * The Provider Comms Funnel intersects those sets, so "Clicked dashboard"
 * and "Edited profile" were structurally ~0 for any claimed provider whose
 * BP slug differs from their OP slug.
 *
 * This collapses every shape to the OP slug:
 *   - business_profiles.id (UUID)  → bp.source_provider_id → op.slug
 *   - business_profiles.slug       → bp.source_provider_id → op.slug
 *   - olera-providers.provider_id  → op.slug
 *   - olera-providers.slug / page slug / unresolvable → ABSENT
 *     (caller does `map.get(raw) ?? raw`, so these stay themselves —
 *      keeping the already-correct columns idempotent)
 *
 * Apply to BOTH sides of the intersection so they share one namespace.
 * Up to four bulk IN lookups regardless of input size.
 */
export async function resolveCanonicalProviderKeys(
  db: SupabaseClient,
  rawIds: Iterable<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set([...rawIds])].filter((s) => typeof s === "string" && s.length > 0);
  if (ids.length === 0) return map;

  const uuidLike: string[] = [];
  const codeLike: string[] = [];
  for (const id of ids) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      uuidLike.push(id);
    } else {
      codeLike.push(id);
    }
  }

  try {
    // Direct: olera-providers.provider_id → slug (already-canonical owners).
    const opSlugByProviderId = new Map<string, string>();
    if (codeLike.length > 0) {
      const { data } = await db
        .from("olera-providers")
        .select("provider_id, slug")
        .in("provider_id", codeLike);
      for (const r of (data ?? []) as Array<{ provider_id: string | null; slug: string | null }>) {
        if (r.provider_id && r.slug) {
          opSlugByProviderId.set(r.provider_id, r.slug);
          map.set(r.provider_id, r.slug);
        }
      }
    }

    // business_profiles → source_provider_id, by UUID id and by slug.
    const bpRows: Array<{ key: string; source_provider_id: string | null }> = [];
    if (uuidLike.length > 0) {
      const { data } = await db
        .from("business_profiles")
        .select("id, source_provider_id")
        .in("id", uuidLike);
      for (const r of (data ?? []) as Array<{ id: string | null; source_provider_id: string | null }>) {
        if (r.id) bpRows.push({ key: r.id, source_provider_id: r.source_provider_id });
      }
    }
    if (codeLike.length > 0) {
      const { data } = await db
        .from("business_profiles")
        .select("slug, source_provider_id")
        .in("slug", codeLike);
      for (const r of (data ?? []) as Array<{ slug: string | null; source_provider_id: string | null }>) {
        if (r.slug) bpRows.push({ key: r.slug, source_provider_id: r.source_provider_id });
      }
    }

    // Resolve any not-yet-known source_provider_ids → op.slug, then map the
    // BP keys (UUID / bp.slug) through to the canonical OP slug.
    const needSpids = [
      ...new Set(
        bpRows
          .map((b) => b.source_provider_id)
          .filter((s): s is string => !!s && !opSlugByProviderId.has(s)),
      ),
    ];
    if (needSpids.length > 0) {
      const { data } = await db
        .from("olera-providers")
        .select("provider_id, slug")
        .in("provider_id", needSpids);
      for (const r of (data ?? []) as Array<{ provider_id: string | null; slug: string | null }>) {
        if (r.provider_id && r.slug) opSlugByProviderId.set(r.provider_id, r.slug);
      }
    }
    for (const b of bpRows) {
      if (b.source_provider_id) {
        const op = opSlugByProviderId.get(b.source_provider_id);
        if (op && !map.has(b.key)) map.set(b.key, op);
      }
    }
  } catch (err) {
    console.error("[provider-id-variants] canonical resolve failed:", err);
  }
  return map;
}

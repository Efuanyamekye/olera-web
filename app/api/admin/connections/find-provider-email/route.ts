import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { findEmail, type ProviderContext } from "@/lib/medjobs/outreach-enrichment";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Update enrichment stats in metadata
 * Returns updated stats object (does not write to DB)
 */
function updateEnrichmentStats(
  currentMetadata: unknown,
  update: {
    wasHit: boolean;
    hadEmail: boolean;
    source: string | null;
    adminUserId: string;
  }
) {
  const metadata = (currentMetadata || {}) as Record<string, unknown>;
  const existingStats = (metadata.email_enrichment_stats || {}) as Record<string, unknown>;

  return {
    total_attempts: ((existingStats.total_attempts as number) || 0) + 1,
    cache_hits: ((existingStats.cache_hits as number) || 0) + (update.wasHit ? 1 : 0),
    cache_misses: ((existingStats.cache_misses as number) || 0) + (update.wasHit ? 0 : 1),
    enrichment_successes: ((existingStats.enrichment_successes as number) || 0) + (!update.wasHit && update.hadEmail ? 1 : 0),
    scrape_count: ((existingStats.scrape_count as number) || 0) + (update.source === "scrape" ? 1 : 0),
    perplexity_count: ((existingStats.perplexity_count as number) || 0) + (update.source === "perplexity" ? 1 : 0),
    last_attempted_at: new Date().toISOString(),
    last_attempted_by: `admin:${update.adminUserId}`,
  };
}

/**
 * POST /api/admin/connections/find-provider-email
 *
 * Body: { providerId: string }
 *
 * Finds email address for a provider using web scraping + AI.
 * This is adapted from the MedJobs enrichment system but tailored
 * for the connections page (uses business_profiles instead of student_outreach).
 *
 * Flow:
 * 1. Fetch provider from business_profiles
 * 2. Fall back to olera-providers for website/place_id if needed
 * 3. Call findEmail() which tries:
 *    - Web scraping (free, primary method)
 *    - Perplexity AI (fallback, ~$0.008 per call)
 * 4. Return email + source + all candidates (ranked)
 *
 * Returns:
 * {
 *   email: "contact@provider.com" | null,
 *   source: "scrape" | "perplexity" | null,
 *   candidates: ["contact@provider.com", "info@provider.com"]
 * }
 *
 * Read-only operation - does not modify any data.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = await getAdminUser(user.id);
    if (!admin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = (await request.json()) as { providerId?: string; forceRefresh?: boolean };
    const providerId = body.providerId?.trim();
    const forceRefresh = body.forceRefresh || false;

    if (!providerId) {
      return NextResponse.json(
        { error: "providerId is required" },
        { status: 400 }
      );
    }

    const db = getServiceClient();
    const adminUserId = admin.id;

    // Check if providerId is a UUID or a slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId);

    // Fetch provider from business_profiles (by UUID or slug depending on format)
    let provider: {
      id: string;
      display_name: string | null;
      website: string | null;
      city: string | null;
      state: string | null;
      source_provider_id: string | null;
      metadata: unknown;
    } | null = null;

    if (isUuid) {
      // Query by UUID
      const { data: providerById } = await db
        .from("business_profiles")
        .select("id, display_name, website, city, state, source_provider_id, metadata")
        .eq("id", providerId)
        .maybeSingle();

      provider = providerById;
    } else {
      // Query by slug
      const { data: providerBySlug } = await db
        .from("business_profiles")
        .select("id, display_name, website, city, state, source_provider_id, metadata")
        .eq("slug", providerId)
        .maybeSingle();

      provider = providerBySlug;
    }

    if (!provider) {
      // Try olera-providers directly as final fallback (by slug first, then provider_id)
      let iosProvider: {
        provider_id: string | null;
        provider_name: string | null;
        website: string | null;
        place_id: string | null;
        city: string | null;
        state: string | null;
      } | null = null;

      // Try by slug first
      const { data: iosBySlug } = await db
        .from("olera-providers")
        .select("provider_id, provider_name, website, place_id, city, state")
        .eq("slug", providerId)
        .not("deleted", "is", true)
        .maybeSingle();

      if (iosBySlug) {
        iosProvider = iosBySlug;
      } else {
        // Try by provider_id (legacy format)
        const { data: iosByProviderId } = await db
          .from("olera-providers")
          .select("provider_id, provider_name, website, place_id, city, state")
          .eq("provider_id", providerId)
          .not("deleted", "is", true)
          .maybeSingle();

        iosProvider = iosByProviderId;
      }

      if (iosProvider) {
        // Build context directly from olera-providers
        const ctx: ProviderContext = {
          name: iosProvider.provider_name || providerId,
          website: iosProvider.website || null,
          place_id: iosProvider.place_id || null,
          city: iosProvider.city || null,
          state: iosProvider.state || null,
        };

        let result;
        try {
          result = await findEmail(ctx);
        } catch (enrichmentError) {
          console.error("[find-provider-email] Enrichment failed (ios fallback):", enrichmentError);
          return NextResponse.json({
            error: "Email enrichment failed. The provider's website may be inaccessible.",
            email: null,
            source: null,
            candidates: [],
          });
        }

        return NextResponse.json({
          email: result.email,
          source: result.source,
          foundUrl: result.foundUrl || null,
          candidates: result.candidates || [],
          candidatesWithUrls: result.candidatesWithUrls || [],
          cached: false,
        });
      }

      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // Build initial context
    let website = provider.website || null;
    let placeId: string | null = null;
    let city = provider.city || null;
    let state = provider.state || null;

    // Fall back to olera-providers for website/place_id if needed
    if ((!website || !placeId) && provider.source_provider_id) {
      const { data: iosProvider } = await db
        .from("olera-providers")
        .select("website, place_id, city, state")
        .eq("provider_id", provider.source_provider_id)
        .maybeSingle();

      if (iosProvider) {
        website = website || (iosProvider.website as string) || null;
        placeId = (iosProvider.place_id as string) || null;
        city = city || (iosProvider.city as string) || null;
        state = state || (iosProvider.state as string) || null;
      }
    }

    const ctx: ProviderContext = {
      name: provider.display_name || null,
      website,
      place_id: placeId,
      city,
      state,
    };

    // Validate provider has minimal data for enrichment
    if (!ctx.name && !ctx.website && !ctx.place_id) {
      return NextResponse.json({
        error: "Provider has insufficient data for email lookup (no name, website, or place_id)",
        email: null,
        source: null,
        candidates: [],
      }, { status: 200 }); // 200 because it's not a client error, just no data available
    }

    // Create context hash for cache invalidation
    const contextHash = JSON.stringify({
      name: ctx.name || "",
      website: ctx.website || "",
      place_id: ctx.place_id || "",
      city: ctx.city || "",
      state: ctx.state || "",
    });

    // Check cache (unless force refresh requested)
    if (!forceRefresh) {
      const metadata = (provider.metadata || {}) as Record<string, unknown>;
      const cachedData = metadata.email_enrichment_data as Record<string, unknown> | undefined;

      if (cachedData && cachedData.enriched_at) {
        const enrichedAt = new Date(cachedData.enriched_at as string);
        const timestamp = enrichedAt.getTime();

        // Skip cache if timestamp is invalid
        if (!isNaN(timestamp)) {
          const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);

          // Validate cache: must be fresh AND context must match
          const cachedContextHash = cachedData.context_hash as string | undefined;
          const contextMatches = cachedContextHash === contextHash;

          if (ageInDays < 30 && ageInDays >= 0 && contextMatches) {
          // Update stats for cache hit (fire and forget)
          const updatedStats = updateEnrichmentStats(provider.metadata, {
            wasHit: true,
            hadEmail: !!cachedData.email,
            source: cachedData.source as string | null,
            adminUserId,
          });

          const updatedMetadata = {
            ...metadata,
            email_enrichment_stats: updatedStats,
          };

          db.from("business_profiles")
            .update({ metadata: updatedMetadata })
            .eq("id", providerId)
            .then(({ error }) => {
              if (error) {
                console.error("[find-provider-email] Failed to update cache hit stats:", error);
              }
            });

            return NextResponse.json({
              email: cachedData.email || null,
              source: cachedData.source || null,
              foundUrl: cachedData.foundUrl || null,
              candidates: (cachedData.candidates as string[]) || [],
              candidatesWithUrls: cachedData.candidatesWithUrls || [],
              cached: true,
              enriched_at: cachedData.enriched_at,
            });
          }
        }
      }
    }

    // Call the email finder (tries scraping first, then Perplexity AI)
    let result;
    try {
      result = await findEmail(ctx);
    } catch (enrichmentError) {
      console.error("[find-provider-email] Enrichment failed:", enrichmentError);

      // Return graceful error
      return NextResponse.json({
        error: "Email enrichment failed. The provider's website may be inaccessible or the service may be experiencing issues.",
        email: null,
        source: null,
        candidates: [],
        details: enrichmentError instanceof Error ? enrichmentError.message : "Unknown error",
      }, { status: 500 });
    }

    // Update both cache and stats in single metadata write (fire and forget)
    const metadata = (provider.metadata || {}) as Record<string, unknown>;
    const updatedStats = updateEnrichmentStats(provider.metadata, {
      wasHit: false,
      hadEmail: !!result.email,
      source: result.source,
      adminUserId,
    });

    const updatedMetadata = {
      ...metadata,
      email_enrichment_data: {
        email: result.email,
        source: result.source,
        foundUrl: result.foundUrl || null,
        candidates: result.candidates || [],
        candidatesWithUrls: result.candidatesWithUrls || [],
        enriched_at: new Date().toISOString(),
        context_hash: contextHash,
      },
      email_enrichment_stats: updatedStats,
    };

    // Single write for both cache and stats (fire and forget)
    db.from("business_profiles")
      .update({ metadata: updatedMetadata })
      .eq("id", providerId)
      .then(({ error }) => {
        if (error) {
          console.error("[find-provider-email] Failed to cache result and update stats:", error);
        }
      });

    return NextResponse.json({
      email: result.email,
      source: result.source,
      foundUrl: result.foundUrl || null,
      candidates: result.candidates || [],
      candidatesWithUrls: result.candidatesWithUrls || [],
      cached: false,
    });
  } catch (e) {
    console.error("[find-provider-email] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Email lookup failed" },
      { status: 500 }
    );
  }
}

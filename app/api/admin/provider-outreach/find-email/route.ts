import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { findEmail, type ProviderContext } from "@/lib/medjobs/outreach-enrichment";

/**
 * POST /api/admin/provider-outreach/find-email
 *
 * Body: { provider_id: string }
 *
 * Finds email address for an unclaimed provider (olera-providers).
 * Uses web scraping + Perplexity AI fallback.
 *
 * Returns:
 * {
 *   email: "contact@provider.com" | null,
 *   source: "scrape" | "perplexity" | null,
 *   candidates: ["contact@provider.com", "info@provider.com"],
 *   candidatesWithUrls: [{ email: "...", url: "..." }]
 * }
 *
 * Read-only operation - does not modify any data.
 * The caller is responsible for saving the email if desired.
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

    const body = (await request.json()) as { provider_id?: string };
    const providerId = body.provider_id?.trim();

    if (!providerId) {
      return NextResponse.json(
        { error: "provider_id is required" },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Fetch provider from olera-providers
    const { data: provider, error: provError } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, website, place_id, city, state, email")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (provError) {
      console.error("[provider-outreach/find-email] Provider query error:", provError);
      return NextResponse.json({ error: "Failed to fetch provider" }, { status: 500 });
    }

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // If provider already has an email, return it immediately
    if (provider.email) {
      return NextResponse.json({
        email: provider.email,
        source: "existing",
        candidates: [provider.email],
        candidatesWithUrls: [{ email: provider.email, url: null }],
        cached: true,
      });
    }

    // Build context for email lookup
    const ctx: ProviderContext = {
      name: provider.provider_name || null,
      website: provider.website || null,
      place_id: provider.place_id || null,
      city: provider.city || null,
      state: provider.state || null,
    };

    // Validate provider has minimal data for enrichment
    if (!ctx.name && !ctx.website && !ctx.place_id) {
      return NextResponse.json({
        error: "Provider has insufficient data for email lookup (no name, website, or place_id)",
        email: null,
        source: null,
        candidates: [],
      });
    }

    // Call the email finder (tries scraping first, then Perplexity AI)
    let result;
    try {
      result = await findEmail(ctx);
    } catch (enrichmentError) {
      console.error("[provider-outreach/find-email] Enrichment failed:", enrichmentError);
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
    });
  } catch (e) {
    console.error("[provider-outreach/find-email] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Email lookup failed" },
      { status: 500 }
    );
  }
}

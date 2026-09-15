import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { getRichContextData, getTrackingById, type RichContextData } from "@/lib/provider-growth/queries";
import { createHash } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BriefingResponse {
  theOneFix: string;
  whatWeOweThem: string | null;
  openWith: string[];
  getThese: string[];
  offer: string;
  logAfterCall: string;
  tags: string[]; // Computed from backend data, not AI-generated
}

interface BriefingCache {
  briefing: BriefingResponse;
  generatedAt: string;
  dataHash: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BRIEFING_MODEL = "claude-haiku-4-5";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REGENERATE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

const SYSTEM_PROMPT = `You are a sales prep assistant for Olera, a senior care marketplace. Generate a concise briefing for a rep about to call a provider.

Return ONLY valid JSON with this structure:
{
  "theOneFix": "Single most impactful action (1-2 sentences)",
  "whatWeOweThem": "Unfulfilled obligations, or null if none",
  "openWith": ["Script 1", "Script 2", "Script 3"],
  "getThese": ["Question 1", "Question 2", "Question 3"],
  "offer": "Tactical proposal based on their stage",
  "logAfterCall": "What to record after the call"
}

Rules:
- THE ONE FIX must be specific and achievable in one call
- WHAT WE OWE THEM is null unless there's a real unfulfilled promise in the touchpoint history
- OPEN WITH scripts must reference their ACTUAL data (use exact dates, numbers, names from the data provided)
- GET THESE are specific pieces of info to capture
- Be direct and actionable, no hedging
- Do NOT make up information - only use what is provided in the data`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function anthropic(): Anthropic {
  return new Anthropic();
}

/**
 * Extract the first balanced JSON object from a model response.
 */
function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function parseJson<T>(raw: string): T | null {
  const slice = firstJsonObject(raw);
  if (!slice) return null;
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

/** Concatenate the text blocks of a Messages response. */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Create a hash of the input data for cache invalidation.
 */
function hashData(data: RichContextData): string {
  const key = JSON.stringify({
    touchCount: data.touchCount,
    leadCount: data.leadCount,
    daysOverdue: data.daysOverdue,
    emailStats: data.emailStats,
    pipelineStage: data.pipelineStage,
    adsStatus: data.adsStatus,
    medjobsStatus: data.medjobsStatus,
    googleRating: data.googleRating,
    googleReviewCount: data.googleReviewCount,
    photoCount: data.photoCount,
    adSpendCents: data.adSpendCents,
  });
  return createHash("md5").update(key).digest("hex");
}

/**
 * Build the user prompt with all provider context.
 */
function buildUserPrompt(data: RichContextData): string {
  const parts: string[] = [];

  // Provider info
  parts.push(`PROVIDER: ${data.provider.displayName}`);
  parts.push(`Location: ${data.provider.city}, ${data.provider.state}`);
  parts.push(`Care Types: ${data.provider.careTypes.join(", ") || "Unknown"}`);
  if (data.provider.contactName) {
    parts.push(`Contact: ${data.provider.contactName}`);
  }

  // Metrics
  parts.push("");
  parts.push("METRICS:");
  const reviewInfo = data.googleRating !== null
    ? `${data.googleRating} (${data.googleReviewCount ?? 0} reviews)`
    : "Not recorded";
  parts.push(`- Google Rating: ${reviewInfo}`);
  parts.push(`- Photos on Olera: ${data.photoCount}`);
  const spendInfo = data.adSpendCents !== null
    ? `$${(data.adSpendCents / 100).toFixed(0)}`
    : "Not recorded (campaigns may exist but spend not entered)";
  parts.push(`- Our Ad Spend: ${spendInfo}`);
  parts.push(`- Leads Received: ${data.leadCount}`);
  parts.push(`- Total Touches: ${data.touchCount}`);
  parts.push(`- Days Since Last Activity: ${data.daysOverdue}`);

  // Email engagement
  parts.push("");
  parts.push("EMAIL ENGAGEMENT (30 days):");
  parts.push(`- Sent: ${data.emailStats.sent}, Opened: ${data.emailStats.opened}, Clicked: ${data.emailStats.clicked}`);

  // Pipeline status
  parts.push("");
  parts.push("STATUS:");
  parts.push(`- Pipeline Stage: ${data.pipelineStage}`);
  parts.push(`- Verification: ${data.provider.verificationState || "unknown"}`);
  parts.push(`- Ads Status: ${data.adsStatus}`);
  parts.push(`- MedJobs Status: ${data.medjobsStatus}`);
  if (data.claimedAt) {
    const claimedDate = new Date(data.claimedAt).toLocaleDateString();
    parts.push(`- Claimed: ${claimedDate}`);
  }

  // Recent leads
  if (data.leads.length > 0) {
    parts.push("");
    parts.push("RECENT LEADS:");
    for (const lead of data.leads.slice(0, 3)) {
      const date = new Date(lead.created_at).toLocaleDateString();
      const msg = lead.message ? `: "${lead.message.slice(0, 100)}..."` : "";
      parts.push(`- ${date}${msg}`);
    }
  }

  // Recent touchpoints
  if (data.touchpoints.length > 0) {
    parts.push("");
    parts.push("RECENT ACTIVITY:");
    for (const tp of data.touchpoints.slice(0, 5)) {
      const date = new Date(tp.created_at).toLocaleDateString();
      const notes = tp.notes ? `: ${tp.notes.slice(0, 50)}` : "";
      parts.push(`- ${date} - ${tp.type}${notes}`);
    }
  }

  return parts.join("\n");
}

interface AIBriefingResponse {
  theOneFix: string;
  whatWeOweThem: string | null;
  openWith: string[];
  getThese: string[];
  offer: string;
  logAfterCall: string;
}

/**
 * Generate a new briefing using Claude.
 * Tags are computed from backend data, not AI-generated.
 */
async function generateBriefing(data: RichContextData): Promise<BriefingResponse> {
  const client = anthropic();

  const message = await client.messages.create({
    model: BRIEFING_MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(data) }],
  });

  const parsed = parseJson<AIBriefingResponse>(textOf(message));

  if (!parsed) {
    throw new Error("Failed to parse briefing response");
  }

  // Validate required fields
  if (
    typeof parsed.theOneFix !== "string" ||
    !Array.isArray(parsed.openWith) ||
    !Array.isArray(parsed.getThese) ||
    typeof parsed.offer !== "string" ||
    typeof parsed.logAfterCall !== "string"
  ) {
    throw new Error("Invalid briefing response structure");
  }

  // Handle edge case where model returns string "null" instead of actual null
  const whatWeOweThem = parsed.whatWeOweThem;
  const normalizedWhatWeOweThem =
    whatWeOweThem === null ||
    whatWeOweThem === "null" ||
    whatWeOweThem === "" ||
    whatWeOweThem === "none" ||
    whatWeOweThem === "None"
      ? null
      : whatWeOweThem;

  return {
    theOneFix: parsed.theOneFix,
    whatWeOweThem: normalizedWhatWeOweThem,
    openWith: parsed.openWith.slice(0, 3),
    getThese: parsed.getThese.slice(0, 3),
    offer: parsed.offer,
    logAfterCall: parsed.logAfterCall,
    // Use backend-computed tags, not AI-generated
    tags: data.computedTags,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/provider-growth/[id]/briefing
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id } = await context.params;
    const forceRegenerate = request.nextUrl.searchParams.get("regenerate") === "true";

    // Get tracking record
    const tracking = await getTrackingById(id);
    if (!tracking) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Get rich context data
    const contextData = await getRichContextData(id, tracking.business_profile_id);
    const currentHash = hashData(contextData);

    // Check cache in metadata
    const db = getServiceClient();
    const { data: trackingWithMeta } = await db
      .from("provider_growth_tracking")
      .select("metadata")
      .eq("id", id)
      .single();

    const metadata = (trackingWithMeta?.metadata || {}) as Record<string, unknown>;
    const cache = metadata.briefing_cache as BriefingCache | undefined;

    // Check if cache is valid
    if (cache) {
      const cacheAge = Date.now() - new Date(cache.generatedAt).getTime();
      const isFresh = cacheAge < CACHE_TTL_MS;
      const isValid = cache.dataHash === currentHash;

      // Rate limit regeneration requests (max once per 10 minutes)
      if (forceRegenerate && cacheAge < REGENERATE_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((REGENERATE_COOLDOWN_MS - cacheAge) / 1000);
        return NextResponse.json(
          { error: `Please wait ${waitSeconds} seconds before regenerating` },
          { status: 429 }
        );
      }

      if (!forceRegenerate && isFresh && isValid) {
        return NextResponse.json({
          briefing: cache.briefing,
          generatedAt: cache.generatedAt,
          cached: true,
          metrics: {
            googleRating: contextData.googleRating,
            googleReviewCount: contextData.googleReviewCount,
            photoCount: contextData.photoCount,
            adSpendCents: contextData.adSpendCents,
          },
        });
      }
    }

    // Generate new briefing
    const briefing = await generateBriefing(contextData);
    const generatedAt = new Date().toISOString();

    // Save to cache
    const newCache: BriefingCache = {
      briefing,
      generatedAt,
      dataHash: currentHash,
    };

    await db
      .from("provider_growth_tracking")
      .update({
        metadata: {
          ...metadata,
          briefing_cache: newCache,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      briefing,
      generatedAt,
      cached: false,
      metrics: {
        googleRating: contextData.googleRating,
        googleReviewCount: contextData.googleReviewCount,
        photoCount: contextData.photoCount,
        adSpendCents: contextData.adSpendCents,
      },
    });
  } catch (e) {
    console.error("[provider-growth] Briefing error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

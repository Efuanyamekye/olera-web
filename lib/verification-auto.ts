import Anthropic from "@anthropic-ai/sdk";

export type VerificationConfidence = "high" | "medium" | "low";

export interface VerificationInput {
  /** The person's name from the verification form */
  claimedName: string;
  /** Their claimed role (owner, administrator, etc.) */
  claimedRole: string;
  /** The business name from the directory */
  businessName: string;
  /** LinkedIn profile URL (optional) */
  linkedinUrl?: string | null;
  /** Business website URL showing their name (optional) */
  businessWebsiteUrl?: string | null;
  /** If true, user couldn't provide LinkedIn/website */
  manualReviewRequested?: boolean;
}

export interface VerificationResult {
  confidence: VerificationConfidence;
  reason: string;
  /** Whether auto-verification was attempted */
  autoVerified: boolean;
  /** Raw page content fetched (for debugging) */
  fetchedContent?: string;
}

const SYSTEM_PROMPT = `You are verifying whether a person claiming to represent a senior care business is legitimate.

You will be given:
1. The person's claimed name and role
2. The business name they're claiming
3. Content from either their LinkedIn profile OR the business website

Your task: Determine if there's evidence that this person works at this business.

Return ONLY a JSON object (no prose, no markdown fences):
{"confidence":"high"|"medium"|"low","reason":"<one short sentence>"}

Scoring:
- high — Clear evidence the person works at this business:
  - LinkedIn shows them as current employee/owner of this business
  - Business website lists them as staff/owner/administrator
  - Name matches and job title/role aligns

- medium — Some evidence but not conclusive:
  - Name appears on the page but role is unclear
  - Business name is mentioned but connection is indirect
  - Profile exists but employment history is incomplete

- low — No clear evidence or contradictory information:
  - Person's name doesn't appear on the page
  - Different company is listed as current employer
  - Page content doesn't mention the business at all
  - Profile appears to be for a different person

Important:
- Focus on whether the CURRENT employment shows this business
- Minor spelling variations in names are OK (Bob vs Robert, etc.)
- Franchise operators often list the parent brand name
- If the page failed to load or is empty, return low confidence`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Fetch URL content with timeout and basic error handling.
 * Returns null if fetch fails (LinkedIn blocks, timeout, etc.)
 */
async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Use a standard browser user agent to avoid blocks
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[verification-auto] Fetch failed for ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract text content from HTML (basic approach)
    // Remove script/style tags and extract text
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Limit content length for LLM context
    return textContent.slice(0, 15000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[verification-auto] Fetch error for ${url}:`, message);
    return null;
  }
}

function buildUserMessage(input: VerificationInput, pageContent: string | null): string {
  const lines = [
    `Claimed name: ${input.claimedName}`,
    `Claimed role: ${input.claimedRole}`,
    `Business name: ${input.businessName}`,
    "",
  ];

  if (input.linkedinUrl) {
    lines.push(`LinkedIn URL: ${input.linkedinUrl}`);
  }
  if (input.businessWebsiteUrl) {
    lines.push(`Business website URL: ${input.businessWebsiteUrl}`);
  }

  lines.push("");

  if (pageContent) {
    lines.push("--- Page content ---");
    lines.push(pageContent);
  } else {
    lines.push("--- Page content ---");
    lines.push("(Failed to fetch page content)");
  }

  return lines.join("\n");
}

function parseResponse(raw: string): { confidence: VerificationConfidence; reason: string } | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as { confidence?: string; reason?: string };
    if (
      parsed &&
      (parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low") &&
      typeof parsed.reason === "string" &&
      parsed.reason.length > 0
    ) {
      return { confidence: parsed.confidence, reason: parsed.reason };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Automatically verify a provider's claimed connection to a business.
 *
 * Process:
 * 1. If manual review requested, skip auto-verification
 * 2. Fetch LinkedIn or business website content
 * 3. Send to Claude for analysis
 * 4. Return confidence level
 *
 * On any error, defaults to low confidence (routes to manual review).
 */
export async function autoVerifyProvider(
  input: VerificationInput
): Promise<VerificationResult> {
  // If user requested manual review (no LinkedIn/website), skip auto-verification
  if (input.manualReviewRequested) {
    return {
      confidence: "low",
      reason: "Manual review requested — no LinkedIn or website provided.",
      autoVerified: false,
    };
  }

  // Must have at least one URL to verify
  const urlToFetch = input.linkedinUrl || input.businessWebsiteUrl;
  if (!urlToFetch) {
    return {
      confidence: "low",
      reason: "No verification URL provided.",
      autoVerified: false,
    };
  }

  // Fetch page content
  const pageContent = await fetchUrlContent(urlToFetch);

  // If fetch failed (LinkedIn blocked, timeout, etc.), route to manual review
  if (!pageContent) {
    return {
      confidence: "low",
      reason: "Could not fetch page content — routing to manual review.",
      autoVerified: false,
      fetchedContent: undefined,
    };
  }

  // Send to Claude for verification
  try {
    const response = await Promise.race<Anthropic.Messages.Message>([
      getClient().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildUserMessage(input, pageContent),
          },
        ],
      }),
      new Promise<Anthropic.Messages.Message>((_, reject) =>
        setTimeout(() => reject(new Error("llm_timeout")), 15000)
      ),
    ]);

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text : "";
    const parsed = parseResponse(raw);

    if (!parsed) {
      console.error("[verification-auto] Unparseable LLM response:", raw);
      return {
        confidence: "low",
        reason: "Verification check inconclusive — routing to manual review.",
        autoVerified: false,
        fetchedContent: pageContent.slice(0, 500),
      };
    }

    return {
      confidence: parsed.confidence,
      reason: parsed.reason,
      autoVerified: true,
      fetchedContent: pageContent.slice(0, 500),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[verification-auto] LLM call failed:", message);
    return {
      confidence: "low",
      reason: "Verification check unavailable — routing to manual review.",
      autoVerified: false,
    };
  }
}

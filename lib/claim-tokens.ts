/**
 * Claim Token Utilities
 *
 * Generates and validates signed tokens for email campaign claim links.
 * Tokens are self-validating using HMAC-SHA256 signatures.
 *
 * Token format: base64url({ providerId, email, expiresAt, signature })
 */

import { createHmac } from "crypto";

const TOKEN_SECRET = process.env.CLAIM_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";
const TOKEN_EXPIRY_HOURS = 72; // 3 days for email campaign links

interface TokenPayload {
  providerId: string;
  email: string;
  expiresAt: number;
}

interface TokenData extends TokenPayload {
  signature: string;
}

/**
 * Generate signature for token payload
 */
function generateSignature(payload: TokenPayload): string {
  const data = `${payload.providerId}:${payload.email}:${payload.expiresAt}`;
  return createHmac("sha256", TOKEN_SECRET).update(data).digest("hex").slice(0, 32);
}

/**
 * Generate a claim token for email campaigns
 */
export function generateClaimToken(providerId: string, email: string): string {
  const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

  const payload: TokenPayload = { providerId, email, expiresAt };
  const signature = generateSignature(payload);

  const tokenData: TokenData = { ...payload, signature };
  const jsonString = JSON.stringify(tokenData);

  // Base64url encode
  return Buffer.from(jsonString)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Validate and decode a claim token
 *
 * Returns partial data (providerId, email) even when validation fails,
 * allowing callers to redirect to appropriate fallback pages.
 */
export function validateClaimToken(
  token: string
):
  | { valid: true; providerId: string; email: string }
  | { valid: false; error: string; providerId?: string; email?: string } {
  try {
    // Base64url decode
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const jsonString = Buffer.from(base64, "base64").toString("utf-8");
    const tokenData: TokenData = JSON.parse(jsonString);

    const { providerId, email, expiresAt, signature } = tokenData;

    // Check required fields
    if (!providerId || !email || !expiresAt || !signature) {
      return { valid: false, error: "Invalid token format", providerId, email };
    }

    // Check expiry - still return providerId/email for fallback redirects
    if (Date.now() > expiresAt) {
      return { valid: false, error: "Token has expired", providerId, email };
    }

    // Verify signature - still return providerId/email for fallback redirects
    const expectedSignature = generateSignature({ providerId, email, expiresAt });
    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid token signature", providerId, email };
    }

    return { valid: true, providerId, email };
  } catch {
    return { valid: false, error: "Failed to parse token" };
  }
}

/**
 * Generate a claim URL for email campaigns
 * Routes to the provider onboard page which handles the full claim flow
 */
export function generateClaimUrl(
  providerId: string,
  providerSlug: string,
  email: string,
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || "https://olera.care",
  options?: {
    headline?: string;
    message?: string;
  }
): string {
  const token = generateClaimToken(providerId, email);
  const url = new URL(`${baseUrl}/provider/${providerSlug}/onboard`);
  url.searchParams.set("action", "campaign");
  url.searchParams.set("otk", token);
  if (options?.headline) {
    url.searchParams.set("headline", options.headline);
  }
  if (options?.message) {
    url.searchParams.set("message", options.message);
  }
  return url.toString();
}

/**
 * Generate a notification URL with embedded claim token.
 * Used for lead/question/review email links — enables one-click access.
 */
export function generateNotificationUrl(
  providerSlug: string,
  email: string,
  action: "lead" | "question" | "review",
  actionId: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"
): string {
  const token = generateClaimToken(providerSlug, email);
  const url = new URL(`${baseUrl}/provider/${providerSlug}/onboard`);
  url.searchParams.set("action", action);
  url.searchParams.set("actionId", actionId);
  url.searchParams.set("otk", token);
  return url.toString();
}

/**
 * Generate a provider portal URL with embedded claim token.
 * Used for email footer links (manage listing, settings) — enables one-click sign-in.
 *
 * @param providerSlug - Provider's slug or ID
 * @param email - Provider's email for token generation
 * @param destination - Portal destination: "manage" (dashboard), "settings", "market", "leads", "ads", or "matches"
 *   ("market" lands on the Your Market diagnostic; "leads" lands on the Find Families
 *   connections inbox; "ads" lands on /provider/boost — the managed-ads pitch + setup;
 *   "matches" lands on /provider/matches — the Find Families nearby-seeker leads view)
 * @param baseUrl - Base URL (defaults to NEXT_PUBLIC_SITE_URL)
 */
export function generateProviderPortalUrl(
  providerSlug: string,
  email: string,
  destination: "manage" | "settings" | "market" | "leads" | "ads" | "matches",
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"
): string {
  const token = generateClaimToken(providerSlug, email);
  const url = new URL(`${baseUrl}/provider/${providerSlug}/onboard`);
  url.searchParams.set("action", destination);
  url.searchParams.set("otk", token);
  return url.toString();
}

/**
 * Generate a profile-completion one-click URL for the weekly digest's
 * "sell the output" variant (claimed-but-thin providers).
 *
 * Routes to /api/claim-complete, which authenticates the provider server-side
 * (same flow as /api/claim-lead) and redirects to the dashboard with the given
 * edit section already open (`/provider?edit=<section>`). Server-side auth means
 * no client-side race and no login wall.
 *
 * @param providerSlug - Provider's slug or ID (used for token + profile lookup)
 * @param email - Provider's email for token generation + the email-match check
 * @param section - Editable section to open on arrival (e.g. "owner", "gallery")
 * @param baseUrl - Base URL (defaults to NEXT_PUBLIC_SITE_URL)
 */
export function generateCompletionUrl(
  providerSlug: string,
  email: string,
  section: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"
): string {
  const token = generateClaimToken(providerSlug, email);
  const url = new URL(`${baseUrl}/api/claim-complete`);
  url.searchParams.set("otk", token);
  url.searchParams.set("section", section);
  return url.toString();
}

/**
 * Generate a MedJobs notification URL with embedded claim token.
 * Used for interview email links — routes to the one-click claim handler
 * which authenticates the provider and redirects to their calendar in a
 * single server response (no client-side auth race).
 *
 * Note: `providerSlug` is kept in the API surface for backward compatibility
 * with existing callers; it's included in the token payload but the
 * destination route is the same for all MedJobs interview links.
 */
export function generateMedJobsNotificationUrl(
  providerSlug: string,
  email: string,
  action: "interview",
  actionId: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"
): string {
  const token = generateClaimToken(providerSlug, email);
  const url = new URL(`${baseUrl}/api/medjobs/claim-${action}`);
  url.searchParams.set("interviewId", actionId);
  url.searchParams.set("otk", token);
  return url.toString();
}

/**
 * Generate a STUDENT-side one-click interview link. Mirror of
 * generateMedJobsNotificationUrl but routes to the student claim handler, which
 * authenticates the (already-registered) student and redirects to their portal
 * interviews tab with ?newInterview=<id>. The token's id field is opaque here —
 * the route re-derives the student from the interview and verifies the email.
 */
export function generateMedJobsStudentInterviewUrl(
  email: string,
  interviewId: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"
): string {
  const token = generateClaimToken("student", email);
  const url = new URL(`${baseUrl}/api/medjobs/claim-interview-student`);
  url.searchParams.set("interviewId", interviewId);
  url.searchParams.set("otk", token);
  return url.toString();
}

/**
 * Generate a lead claim URL with embedded claim token.
 * Routes to /api/claim-lead which handles server-side authentication
 * and redirects directly to /provider/connections.
 *
 * This is the preferred method for lead notification emails as it:
 * - Skips the onboard page entirely
 * - Authenticates server-side (no client-side auth race)
 * - Redirects directly to the leads page
 * - Reduces friction → higher view rates
 *
 * @param providerSlug - Provider's slug or ID (used for token + profile lookup)
 * @param email - Provider's email for token generation
 * @param connectionId - Optional. If provided, redirects to that specific lead.
 *                       If omitted, redirects to the connections list view.
 * @param baseUrl - Base URL (defaults to NEXT_PUBLIC_SITE_URL)
 */
export function generateLeadClaimUrl(
  providerSlug: string,
  email: string,
  connectionId?: string | null,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"
): string {
  const token = generateClaimToken(providerSlug, email);
  const url = new URL(`${baseUrl}/api/claim-lead`);
  url.searchParams.set("otk", token);
  if (connectionId) {
    url.searchParams.set("connectionId", connectionId);
  }
  return url.toString();
}

/**
 * Generate a family inbox URL with embedded claim token.
 * Routes to /api/claim-family which handles server-side authentication
 * and redirects to the family's inbox.
 *
 * This gives families the same 72-hour link expiry as providers (vs 1-hour
 * Supabase magic link default). Used for all family connection emails:
 * - Message notifications
 * - Unread reminders
 * - Provider silent/still-silent
 * - Family never engaged
 * - Stale conversations
 *
 * @param email - Family's email for token generation
 * @param destination - Where to redirect after auth (e.g., "/portal/inbox?id=123")
 * @param baseUrl - Base URL (defaults to NEXT_PUBLIC_SITE_URL)
 */
export function generateFamilyInboxUrl(
  email: string,
  destination: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"
): string {
  // Use "family" as the providerId for family tokens (not used for lookup, just for token structure)
  const token = generateClaimToken("family", email);
  const url = new URL(`${baseUrl}/api/claim-family`);
  url.searchParams.set("otk", token);
  url.searchParams.set("next", destination);
  return url.toString();
}

/**
 * ── One-tap intro tokens (B2) ────────────────────────────────────────────────
 *
 * Authorizes a single family→provider inquiry created from an email link (a GET
 * write). Signs the whole payload — family, target provider, the source inquiry
 * whose intent we carry forward, and the family's email — so none of it can be
 * tampered in the URL. Same HMAC-SHA256 + base64url + 72h-expiry scheme as the
 * claim tokens above, but a distinct signature domain ("intro:") so an intro
 * token can never be replayed as a claim token or vice versa.
 */
interface IntroTokenPayload {
  /** The family's business_profiles id — from_profile_id of the new inquiry. */
  familyProfileId: string;
  /** The alternative provider's business_profiles id — to_profile_id. */
  targetProviderId: string;
  /** The original inquiry we carry care-type/intent forward from. */
  sourceConnectionId: string;
  /** The family's email — for rate limiting + post-write one-click auth. */
  email: string;
  expiresAt: number;
}

interface IntroTokenData extends IntroTokenPayload {
  signature: string;
}

function generateIntroSignature(p: IntroTokenPayload): string {
  const data = `intro:${p.familyProfileId}:${p.targetProviderId}:${p.sourceConnectionId}:${p.email}:${p.expiresAt}`;
  return createHmac("sha256", TOKEN_SECRET).update(data).digest("hex").slice(0, 32);
}

export function generateIntroToken(
  familyProfileId: string,
  targetProviderId: string,
  sourceConnectionId: string,
  email: string,
): string {
  const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload: IntroTokenPayload = { familyProfileId, targetProviderId, sourceConnectionId, email, expiresAt };
  const tokenData: IntroTokenData = { ...payload, signature: generateIntroSignature(payload) };
  return Buffer.from(JSON.stringify(tokenData))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function validateIntroToken(
  token: string,
):
  | { valid: true; familyProfileId: string; targetProviderId: string; sourceConnectionId: string; email: string }
  | { valid: false; error: string } {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const tokenData: IntroTokenData = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    const { familyProfileId, targetProviderId, sourceConnectionId, email, expiresAt, signature } = tokenData;
    if (!familyProfileId || !targetProviderId || !sourceConnectionId || !email || !expiresAt || !signature) {
      return { valid: false, error: "Invalid token format" };
    }
    if (Date.now() > expiresAt) return { valid: false, error: "Token has expired" };
    const expected = generateIntroSignature({ familyProfileId, targetProviderId, sourceConnectionId, email, expiresAt });
    if (signature !== expected) return { valid: false, error: "Invalid token signature" };
    return { valid: true, familyProfileId, targetProviderId, sourceConnectionId, email };
  } catch {
    return { valid: false, error: "Failed to parse token" };
  }
}

/**
 * Build a one-tap intro URL for an email compare card. Clicking it creates the
 * inquiry to `targetProviderId` (carrying the source inquiry's intent), notifies
 * the provider, signs the family in, and lands them on the confirmation screen.
 */
export function generateIntroUrl(
  familyProfileId: string,
  targetProviderId: string,
  sourceConnectionId: string,
  email: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care",
): string {
  const token = generateIntroToken(familyProfileId, targetProviderId, sourceConnectionId, email);
  const url = new URL(`${baseUrl}/api/family-intro`);
  url.searchParams.set("tok", token);
  return url.toString();
}

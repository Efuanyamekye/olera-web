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
// Every secret a token may have been signed with. New tokens always sign with
// TOKEN_SECRET; validation accepts any candidate so that setting a dedicated
// CLAIM_TOKEN_SECRET (or rotating the service-role key) doesn't invalidate
// links already sitting in provider inboxes.
const CANDIDATE_SECRETS = [
  TOKEN_SECRET,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  "fallback-secret",
].filter((s, i, arr): s is string => !!s && arr.indexOf(s) === i);

function hmacSignature(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex").slice(0, 32);
}

function signatureMatches(data: string, signature: string): boolean {
  return CANDIDATE_SECRETS.some((secret) => hmacSignature(data, secret) === signature);
}
// Token expiry: configurable via env var, default 360 hours (15 days)
// Must cover the full 7-day cold outreach sequence (Day 0, 3, 5, 7) plus buffer
// since SmartLead uses the same claim_url for all emails in the sequence
const TOKEN_EXPIRY_HOURS = parseInt(process.env.CLAIM_TOKEN_EXPIRY_HOURS || "360", 10);

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
  return hmacSignature(data, TOKEN_SECRET);
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
    if (!signatureMatches(`${providerId}:${email}:${expiresAt}`, signature)) {
      return { valid: false, error: "Invalid token signature", providerId, email };
    }

    return { valid: true, providerId, email };
  } catch {
    return { valid: false, error: "Failed to parse token" };
  }
}

/**
 * Decode + verify a claim token's signature while TOLERATING expiry.
 * Used by the resend-link recovery flow: an expired link is legitimate proof
 * the caller received one of our emails, but a forged payload is not — so the
 * signature must still match. Never use this to grant access; it only gates
 * whether we'll email a fresh link to the provider's on-file address.
 */
export function decodeClaimTokenAllowExpired(
  token: string
): { ok: true; providerId: string; email: string; expired: boolean } | { ok: false } {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const tokenData: TokenData = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    const { providerId, email, expiresAt, signature } = tokenData;
    if (!providerId || !email || !expiresAt || !signature) return { ok: false };
    if (!signatureMatches(`${providerId}:${email}:${expiresAt}`, signature)) return { ok: false };
    return { ok: true, providerId, email, expired: Date.now() > expiresAt };
  } catch {
    return { ok: false };
  }
}

/**
 * Generate a claim URL for email campaigns (provider cold outreach).
 * Routes to /api/claim-campaign which handles server-side authentication:
 *   - Validates token, creates/resolves auth user
 *   - Establishes session via magic link (server-side)
 *   - Links profile to account
 *   - Tracks events and sends Slack notifications
 *   - Redirects to /provider dashboard
 *
 * This ensures one-click access for providers clicking any cold outreach email.
 *
 * @param source - Optional claim source for analytics (e.g., "city_broadcast", "cold_outreach").
 *                 Defaults to "cold_outreach" if not specified.
 */
export function generateClaimUrl(
  providerId: string,
  _providerSlug: string,
  email: string,
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || "https://olera.care",
  source?: string
): string {
  const token = generateClaimToken(providerId, email);
  const url = new URL(`${baseUrl}/api/claim-campaign`);
  url.searchParams.set("otk", token);
  if (source) {
    url.searchParams.set("src", source);
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
 * @param destination - Portal destination: "manage" (dashboard), "settings", "market", "leads", "ads", "matches",
 *   "notifications" (notification preferences), or "profile" (the public listing)
 *   ("market" lands on the Your Market diagnostic; "leads" lands on the Find Families
 *   connections inbox; "ads" lands on /provider/boost — the managed-ads pitch + setup;
 *   "matches" lands on /provider/matches — the Find Families nearby-seeker leads view)
 * @param baseUrl - Base URL (defaults to NEXT_PUBLIC_SITE_URL)
 */
export function generateProviderPortalUrl(
  providerSlug: string,
  email: string,
  destination: "manage" | "settings" | "market" | "leads" | "ads" | "matches" | "profile" | "notifications" | "verify",
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

function introSignatureData(p: IntroTokenPayload): string {
  return `intro:${p.familyProfileId}:${p.targetProviderId}:${p.sourceConnectionId}:${p.email}:${p.expiresAt}`;
}

function generateIntroSignature(p: IntroTokenPayload): string {
  return hmacSignature(introSignatureData(p), TOKEN_SECRET);
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
    if (!signatureMatches(introSignatureData({ familyProfileId, targetProviderId, sourceConnectionId, email, expiresAt }), signature)) {
      return { valid: false, error: "Invalid token signature" };
    }
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

/**
 * ── In-email micro-quiz tokens ───────────────────────────────────────────────
 *
 * Authorizes a single quiz-answer write from an email link (a GET write): one
 * benefits-intake fact (Medicaid status / veteran status / age band) stamped
 * onto the family's profile. The whole payload is signed — family, question,
 * answer, email — so a chip URL can't be tampered into writing a different
 * answer or a different family. Same HMAC-SHA256 + base64url + 72h-expiry
 * scheme as the claim/intro tokens, distinct "quiz:" signature domain.
 */

export type QuizQuestion = "path" | "medicaid" | "veteran" | "age" | "archetype";

interface QuizTokenPayload {
  familyProfileId: string;
  question: QuizQuestion;
  answer: string;
  email: string;
  expiresAt: number;
}

interface QuizTokenData extends QuizTokenPayload {
  signature: string;
}

function quizSignatureData(p: QuizTokenPayload): string {
  return `quiz:${p.familyProfileId}:${p.question}:${p.answer}:${p.email}:${p.expiresAt}`;
}

function generateQuizSignature(p: QuizTokenPayload): string {
  return hmacSignature(quizSignatureData(p), TOKEN_SECRET);
}

export function generateQuizToken(
  familyProfileId: string,
  question: QuizQuestion,
  answer: string,
  email: string,
): string {
  const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload: QuizTokenPayload = { familyProfileId, question, answer, email, expiresAt };
  const tokenData: QuizTokenData = { ...payload, signature: generateQuizSignature(payload) };
  return Buffer.from(JSON.stringify(tokenData))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function validateQuizToken(
  token: string,
):
  | { valid: true; familyProfileId: string; question: QuizQuestion; answer: string; email: string }
  | { valid: false; error: string } {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const tokenData: QuizTokenData = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    const { familyProfileId, question, answer, email, expiresAt, signature } = tokenData;
    if (!familyProfileId || !question || !answer || !email || !expiresAt || !signature) {
      return { valid: false, error: "Invalid token format" };
    }
    if (Date.now() > expiresAt) return { valid: false, error: "Token has expired" };
    if (!signatureMatches(quizSignatureData({ familyProfileId, question, answer, email, expiresAt }), signature)) {
      return { valid: false, error: "Invalid token signature" };
    }
    return { valid: true, familyProfileId, question, answer, email };
  } catch {
    return { valid: false, error: "Failed to parse token" };
  }
}

// NOTE: there is deliberately no URL builder pointing chips at /api/family-quiz.
// Chips link to /family/quiz-answer (through claim-family), and the PAGE posts
// the token — a GET that writes would let email link-scanners, which follow
// every href, overwrite the family's real answer with the last chip scanned.

/**
 * ── Benefits-outcome tokens ──────────────────────────────────────────────────
 *
 * Carries the family + their check-in answer from the benefits check-in email
 * chips to /benefits-outcome, which records it via a client-side POST (the
 * quiz-answer pattern — a GET that writes would let email link-scanners, which
 * follow every href, record the last chip they crawled). Same HMAC scheme,
 * distinct "boutcome:" domain.
 *
 * Expiry is 30 days (not TOKEN_EXPIRY_HOURS): the check-in lands ~day 5-6 and
 * families act on benefits email late — a 72h window would dead-link most
 * real taps.
 */

export type BenefitsOutcomeTokenValue = "moving" | "wants_help" | "wrong_program";

const BENEFITS_OUTCOME_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface BenefitsOutcomeTokenPayload {
  familyProfileId: string;
  value: BenefitsOutcomeTokenValue;
  email: string;
  expiresAt: number;
}

function benefitsOutcomeSignatureData(p: BenefitsOutcomeTokenPayload): string {
  return `boutcome:${p.familyProfileId}:${p.value}:${p.email}:${p.expiresAt}`;
}

function generateBenefitsOutcomeSignature(p: BenefitsOutcomeTokenPayload): string {
  return hmacSignature(benefitsOutcomeSignatureData(p), TOKEN_SECRET);
}

export function generateBenefitsOutcomeToken(
  familyProfileId: string,
  value: BenefitsOutcomeTokenValue,
  email: string,
): string {
  const expiresAt = Date.now() + BENEFITS_OUTCOME_EXPIRY_MS;
  const payload: BenefitsOutcomeTokenPayload = { familyProfileId, value, email, expiresAt };
  const tokenData = { ...payload, signature: generateBenefitsOutcomeSignature(payload) };
  return Buffer.from(JSON.stringify(tokenData))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function validateBenefitsOutcomeToken(
  token: string,
):
  | { valid: true; familyProfileId: string; value: BenefitsOutcomeTokenValue; email: string }
  | { valid: false; error: string } {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const tokenData = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as BenefitsOutcomeTokenPayload & {
      signature: string;
    };
    const { familyProfileId, value, email, expiresAt, signature } = tokenData;
    if (!familyProfileId || !value || !email || !expiresAt || !signature) {
      return { valid: false, error: "Invalid token format" };
    }
    if (!["moving", "wants_help", "wrong_program"].includes(value)) {
      return { valid: false, error: "Invalid outcome value" };
    }
    if (Date.now() > expiresAt) return { valid: false, error: "Token has expired" };
    if (!signatureMatches(benefitsOutcomeSignatureData({ familyProfileId, value, email, expiresAt }), signature)) {
      return { valid: false, error: "Invalid token signature" };
    }
    return { valid: true, familyProfileId, value, email };
  } catch {
    return { valid: false, error: "Failed to parse token" };
  }
}

/**
 * ── Program-brief tokens ─────────────────────────────────────────────────────
 *
 * Carries family context (id + email) to /family/program/[pid] so the brief can
 * personalize its eligibility checklist and mint quiz chips. READ-ONLY grant:
 * the brief page writes nothing with it; writes still go through quiz tokens.
 * Same HMAC scheme, distinct "brief:" domain.
 */
interface BriefTokenPayload {
  familyProfileId: string;
  email: string;
  expiresAt: number;
}

function briefSignatureData(p: BriefTokenPayload): string {
  return `brief:${p.familyProfileId}:${p.email}:${p.expiresAt}`;
}

function generateBriefSignature(p: BriefTokenPayload): string {
  return hmacSignature(briefSignatureData(p), TOKEN_SECRET);
}

export function generateBriefToken(familyProfileId: string, email: string): string {
  const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload: BriefTokenPayload = { familyProfileId, email, expiresAt };
  const tokenData = { ...payload, signature: generateBriefSignature(payload) };
  return Buffer.from(JSON.stringify(tokenData))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function validateBriefToken(
  token: string,
): { valid: true; familyProfileId: string; email: string } | { valid: false; error: string } {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const tokenData = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as BriefTokenPayload & { signature: string };
    const { familyProfileId, email, expiresAt, signature } = tokenData;
    if (!familyProfileId || !email || !expiresAt || !signature) return { valid: false, error: "Invalid token format" };
    if (Date.now() > expiresAt) return { valid: false, error: "Token has expired" };
    if (!signatureMatches(briefSignatureData({ familyProfileId, email, expiresAt }), signature)) return { valid: false, error: "Invalid token signature" };
    return { valid: true, familyProfileId, email };
  } catch {
    return { valid: false, error: "Failed to parse token" };
  }
}

/**
 * ── Provider connection status tokens ─────────────────────────────────────────
 *
 * Authorizes a provider self-report of connection status from email buttons.
 * Used for follow-up emails (Day 3, Day 5, stale conversation) where the
 * provider can report "Yes, I connected", "Not a good fit", or "No capacity".
 * Same HMAC scheme, distinct "connstat:" domain.
 *
 * NOTE: Unlike quiz tokens, these URLs are POSTed on mount (scanner-safe) —
 * the landing page renders immediately and fires a client-side POST.
 */

export type ConnectionStatusValue = "connected" | "not_a_fit" | "no_capacity";

interface ConnectionStatusTokenPayload {
  connectionId: string;
  value: ConnectionStatusValue;
  expiresAt: number;
}

function connectionStatusSignatureData(p: ConnectionStatusTokenPayload): string {
  return `connstat:${p.connectionId}:${p.value}:${p.expiresAt}`;
}

function generateConnectionStatusSignature(p: ConnectionStatusTokenPayload): string {
  return hmacSignature(connectionStatusSignatureData(p), TOKEN_SECRET);
}

export function generateConnectionStatusToken(
  connectionId: string,
  value: ConnectionStatusValue,
): string {
  const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload: ConnectionStatusTokenPayload = { connectionId, value, expiresAt };
  const tokenData = { ...payload, signature: generateConnectionStatusSignature(payload) };
  return Buffer.from(JSON.stringify(tokenData))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function validateConnectionStatusToken(
  token: string,
):
  | { valid: true; connectionId: string; value: ConnectionStatusValue }
  | { valid: false; error: string } {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const tokenData = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as ConnectionStatusTokenPayload & {
      signature: string;
    };
    const { connectionId, value, expiresAt, signature } = tokenData;
    if (!connectionId || !value || !expiresAt || !signature) {
      return { valid: false, error: "Invalid token format" };
    }
    if (!["connected", "not_a_fit", "no_capacity"].includes(value)) {
      return { valid: false, error: "Invalid status value" };
    }
    if (Date.now() > expiresAt) return { valid: false, error: "Token has expired" };
    if (!signatureMatches(connectionStatusSignatureData({ connectionId, value, expiresAt }), signature)) {
      return { valid: false, error: "Invalid token signature" };
    }
    return { valid: true, connectionId, value };
  } catch {
    return { valid: false, error: "Failed to parse token" };
  }
}

/**
 * Generate URLs for provider connection status self-report buttons.
 * Returns URLs for all three status options (connected, not_a_fit, no_capacity).
 *
 * @param connectionId - The connection ID to report status for
 * @param baseUrl - Base URL (defaults to NEXT_PUBLIC_SITE_URL)
 */
export function generateProviderConnectionStatusUrls(
  connectionId: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care",
): {
  connected: string;
  notAFit: string;
  noCapacity: string;
} {
  const values: ConnectionStatusValue[] = ["connected", "not_a_fit", "no_capacity"];
  const urls: Record<string, string> = {};

  for (const value of values) {
    const token = generateConnectionStatusToken(connectionId, value);
    const url = new URL(`${baseUrl}/provider/connection-status`);
    url.searchParams.set("tok", token);
    urls[value] = url.toString();
  }

  return {
    connected: urls.connected,
    notAFit: urls.not_a_fit,
    noCapacity: urls.no_capacity,
  };
}

// ============================================================
// City lead offer tokens (lib/city-ads)
// ============================================================
//
// A provider receives an offer by email and text. The link in both opens
// /p/offer/{token}, which shows the request and two buttons; the buttons POST
// (an email link never writes). Compact on purpose so it fits in a text:
// `{offerId}.{sig}`. No expiry inside the token: the offer row's own state
// decides what the page shows, and a late click on a taken lead should still
// land on an honest "already taken" screen rather than a dead link.

function cityOfferSignatureData(offerId: string): string {
  return `cityoffer:${offerId}`;
}

export function generateCityOfferToken(offerId: string): string {
  return `${offerId}.${hmacSignature(cityOfferSignatureData(offerId), TOKEN_SECRET)}`;
}

export function validateCityOfferToken(token: string): { valid: true; offerId: string } | { valid: false; error: string } {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { valid: false, error: "Invalid token format" };
  const offerId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(offerId) || !/^[0-9a-f]{32}$/i.test(signature)) return { valid: false, error: "Invalid token format" };
  if (!signatureMatches(cityOfferSignatureData(offerId), signature)) return { valid: false, error: "Invalid token signature" };
  return { valid: true, offerId };
}

export function generateCityOfferUrl(offerId: string, baseUrl?: string): string {
  const base = (baseUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care").replace(/\/$/, "");
  return `${base}/p/offer/${generateCityOfferToken(offerId)}`;
}

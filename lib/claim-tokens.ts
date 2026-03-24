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
 */
export function validateClaimToken(
  token: string
): { valid: true; providerId: string; email: string } | { valid: false; error: string } {
  try {
    // Base64url decode
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const jsonString = Buffer.from(base64, "base64").toString("utf-8");
    const tokenData: TokenData = JSON.parse(jsonString);

    const { providerId, email, expiresAt, signature } = tokenData;

    // Check required fields
    if (!providerId || !email || !expiresAt || !signature) {
      return { valid: false, error: "Invalid token format" };
    }

    // Check expiry
    if (Date.now() > expiresAt) {
      return { valid: false, error: "Token has expired" };
    }

    // Verify signature
    const expectedSignature = generateSignature({ providerId, email, expiresAt });
    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid token signature" };
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
  url.searchParams.set("token", token);
  if (options?.headline) {
    url.searchParams.set("headline", options.headline);
  }
  if (options?.message) {
    url.searchParams.set("message", options.message);
  }
  return url.toString();
}

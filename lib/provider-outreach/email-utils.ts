/**
 * Provider Outreach Email Utilities
 *
 * Handles email rendering, variable substitution, and signature composition
 * for provider outreach emails.
 *
 * Uses a polished email template matching the Olera email gallery style:
 * - Olera logo header in teal
 * - Category label (e.g., "CLAIM YOUR PAGE")
 * - Clean body text with proper typography
 * - Teal CTA buttons
 * - Professional footer with Dr. Logan's signature
 */

import {
  type TemplateContext,
  type ProviderOutreachTemplateKey,
  getTemplate,
  substituteVars,
  buildVars,
  loganSignatureHtml,
} from "./templates";
import {
  generateClaimUrl,
  generateProviderPortalUrl,
} from "../claim-tokens";

// ── Brand Constants ────────────────────────────────────────────────────────

const BRAND_COLOR = "#198087";
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

// ── Polished Email Layout ──────────────────────────────────────────────────

/**
 * Hidden inbox-preview text (preheader) for email clients.
 */
function preheaderHtml(text: string): string {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n+/g, " ")
    .trim();
  const spacer = "&zwnj;&nbsp;".repeat(80);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f9fafb;opacity:0;">${escaped}${spacer}</div>`;
}

/**
 * Polished email layout wrapper matching Olera email gallery style.
 * Exported for use by SmartLead bridge to ensure consistent styling.
 * NOTE: Minimal whitespace to avoid rendering issues in email clients.
 */
export function polishedLayout(
  body: string,
  footer: string,
  opts?: { preheader?: string; categoryLabel?: string }
): string {
  const categoryHtml = opts?.categoryLabel
    ? `<p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">${opts.categoryLabel}</p>`
    : "";

  const preheader = preheaderHtml(opts?.preheader ?? "");
  const year = new Date().getFullYear();

  // Build HTML without extra whitespace between elements
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:${FONT_STACK};">${preheader}<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:520px;width:100%;"><tr><td style="padding:24px 32px 16px;"><span style="font-size:18px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.3px;">Olera</span></td></tr><tr><td style="padding:0 32px 24px;">${categoryHtml}${body}</td></tr><tr><td style="padding:0 32px 32px;">${footer}</td></tr><tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;"><p style="font-size:12px;color:#9ca3af;margin:0;">&copy; ${year} Olera &middot; <a href="${BASE_URL}" style="color:#9ca3af;">olera.care</a></p></td></tr></table></td></tr></table></body></html>`;
}

/**
 * SmartLead-compatible branded layout.
 *
 * SmartLead strips <!DOCTYPE>, <html>, <head>, and <body> tags from emails.
 * This function creates the branded Olera layout using ONLY table structure,
 * which SmartLead preserves. The result is the same visual appearance as
 * polishedLayout() but compatible with SmartLead's email processing.
 *
 * Used by the SmartLead bridge instead of polishedLayout().
 */
export function smartleadBrandedLayout(
  body: string,
  footer: string,
  opts?: { categoryLabel?: string }
): string {
  const categoryHtml = opts?.categoryLabel
    ? `<p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">${opts.categoryLabel}</p>`
    : "";

  const year = new Date().getFullYear();

  // Table structure only - no DOCTYPE/html/head/body tags
  // SmartLead will wrap this in its own document structure
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;font-family:${FONT_STACK};"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:520px;width:100%;"><tr><td style="padding:24px 32px 16px;"><span style="font-size:18px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.3px;">Olera</span></td></tr><tr><td style="padding:0 32px 24px;">${categoryHtml}${body}</td></tr><tr><td style="padding:0 32px 32px;">${footer}</td></tr><tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;"><p style="font-size:12px;color:#9ca3af;margin:0;">&copy; ${year} Olera &middot; <a href="${BASE_URL}" style="color:#9ca3af;">olera.care</a></p></td></tr></table></td></tr></table>`;
}

/**
 * Check if a link label indicates it's a CTA (call-to-action).
 * CTAs are rendered as prominent teal buttons instead of inline links.
 *
 * Detected by:
 *   - Arrow (→) in the label (e.g., "Review your page →")
 *   - "claim" keyword (e.g., "Claim your page")
 *   - "2 minutes" phrase (e.g., "about 2 minutes")
 */
function isCtaLink(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    label.includes("→") ||
    lower.includes("claim") ||
    lower.includes("2 minutes")
  );
}

/**
 * Render a CTA button block (standalone, not inside a paragraph).
 * NOTE: No leading/trailing newlines to avoid extra whitespace in email clients.
 * Compact spacing: 12px top/bottom margin (was 24px).
 */
function renderCtaButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:12px 0;"><tr><td style="background:${BRAND_COLOR};border-radius:8px;"><a href="${href}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${label}</a></td></tr></table>`;
}

/**
 * Render an inline link (inside a paragraph).
 */
function renderInlineLink(label: string, href: string): string {
  return `<a href="${href}" style="color:${BRAND_COLOR};font-weight:500;text-decoration:underline;">${label}</a>`;
}

/**
 * Convert body text with markdown markers to polished HTML.
 *
 * Handles:
 *   **text**       → <strong>text</strong>
 *   [label](url)   → styled button (if CTA) or inline link
 *
 * CTA detection: Links with arrows (→), "claim", or "2 minutes"
 * are rendered as teal buttons. CTAs on their own line become
 * standalone button blocks; inline CTAs stay as inline links.
 */
function bodyToPolishedHtml(text: string): string {
  // 1) HTML-escape first
  let s = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2) **text** → <strong> with emphasis styling (18px to stand out without being overwhelming)
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => `<strong style="font-size:18px;font-weight:700;color:#111827;line-height:1.5;">${inner}</strong>`);

  // 3) Split into paragraphs and process each
  const paragraphs = s.split(/\n{2,}/);
  const outputBlocks: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Check if this paragraph is ONLY a link (standalone CTA pattern)
    const standaloneMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

    if (standaloneMatch) {
      const [, label, href] = standaloneMatch;
      if (isCtaLink(label)) {
        // Standalone CTA → render as button block (no <p> wrapper)
        outputBlocks.push(renderCtaButton(label, href));
      } else {
        // Standalone non-CTA link → wrap in paragraph
        outputBlocks.push(
          `<p style="font-size:15px;line-height:1.5;color:#374151;margin:0 0 8px;">${renderInlineLink(label, href)}</p>`
        );
      }
    } else {
      // Normal paragraph: process inline links
      const processed = trimmed.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_m, label: string, href: string) => renderInlineLink(label, href)
      );

      // Convert single newlines to <br>
      const withBreaks = processed.replace(/\n/g, "<br>");

      outputBlocks.push(
        `<p style="font-size:15px;line-height:1.5;color:#374151;margin:0 0 8px;">${withBreaks}</p>`
      );
    }
  }

  // Join without newlines to avoid extra whitespace in email clients
  return outputBlocks.join("");
}

/**
 * Re-export bodyToHtml for backward compatibility
 * @deprecated Use bodyToPolishedHtml for new templates
 */
export function bodyToHtml(text: string): string {
  return bodyToPolishedHtml(text);
}

// ── Email Sending Configuration ───────────────────────────────────────────────

/**
 * Email type for provider outreach sequence (Day 0/3/5/7).
 * Registered in PROVIDER_NOTIFY_FROM_TYPES (lib/email.ts) so these emails:
 *   - Route through oleracare.com (isolated domain for cold mail)
 *   - Get verify-on-send treatment (ZeroBounce check)
 *   - Respect suppression for bounced/invalid addresses
 */
export const PROVIDER_OUTREACH_EMAIL_TYPE = "provider_outreach_sequence";

/**
 * From address for provider outreach emails.
 * Uses oleracare.com (the cold-mail domain) with Dr. Logan DuBose as sender.
 * Matches the established cold-mail pattern (noreply@oleracare.com).
 * Override via env var PROVIDER_OUTREACH_FROM if needed.
 */
export const PROVIDER_OUTREACH_FROM =
  process.env.PROVIDER_OUTREACH_FROM ??
  "Dr. Logan DuBose · Olera <noreply@oleracare.com>";

/**
 * Reply-To address for provider outreach emails.
 * Routes replies to the shared inbox so the team can respond.
 */
export const PROVIDER_OUTREACH_REPLY_TO =
  process.env.PROVIDER_OUTREACH_REPLY_TO ?? "hello@olera.care";

/**
 * Rendered email ready for sending
 */
export interface RenderedEmail {
  subject: string;
  preheader?: string;
  html: string;
  text: string;
}

/**
 * Get category label for the email header based on template type.
 * Exported for use by SmartLead bridge.
 */
export function getCategoryLabel(templateKey: ProviderOutreachTemplateKey): string {
  switch (templateKey) {
    case "intro":
      return "Your Olera Listing";
    case "followup":
      return "Your Profile";
    case "demand_loss":
      return "Why It's Free";
    case "final":
      return "Get Verified";
    case "nudge":
      return "Your Free Profile";
    default:
      return "Olera";
  }
}

/**
 * Compose the polished email footer HTML with Dr. Logan's signature.
 * Uses the shared loganSignatureHtml() from templates.ts for consistency.
 * NOTE: Single-line HTML to avoid extra whitespace in email clients.
 */
function composePolishedFooterHtml(vars: Record<string, string>): string {
  // Compact spacing: 8px margins (matches SmartLead path)
  return `<div style="margin-top:8px;"><p style="font-size:14px;color:#374151;margin:0 0 4px;">Best,</p><p style="font-size:14px;color:#374151;margin:0;">Logan</p>${loganSignatureHtml()}</div><div style="margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;"><p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Questions? Just reply — it goes straight to our team.</p><p style="font-size:12px;color:#9ca3af;margin:0;"><a href="${vars.manage_url}" style="color:#9ca3af;text-decoration:underline;">Manage listing</a> · <a href="${vars.remove_url}" style="color:#9ca3af;text-decoration:underline;">Remove listing</a> · <a href="${vars.unsubscribe_url}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p><p style="font-size:11px;color:#d1d5db;margin:8px 0 0;">Olera · ${vars.mailing_address}</p></div>`;
}

/**
 * Compose plain text footer.
 */
function composePolishedFooterPlainText(vars: Record<string, string>): string {
  return [
    "",
    "Best,",
    "Logan",
    "",
    "Olera is built by Dr. Logan DuBose, a physician-researcher funded by NIH SBIR, and TJ Falohun, a PhD researcher in biomedical engineering. We're working to make senior care easier to understand and compare.",
    "",
    "LinkedIn: https://www.linkedin.com/in/logan-dubose/",
    "",
    "---",
    "Questions? Just reply — it goes straight to our team.",
    "",
    `Manage listing: ${vars.manage_url}`,
    `Remove listing: ${vars.remove_url}`,
    `Unsubscribe: ${vars.unsubscribe_url}`,
    "",
    `Olera · ${vars.mailing_address}`,
  ].join("\n");
}

/**
 * Render a provider outreach email with full HTML and plain text versions.
 * Uses the polished Olera email template style.
 *
 * @param templateKey - Which template to use (intro, followup, final)
 * @param context - Provider context for variable substitution
 * @returns Rendered email with subject, HTML body, and plain text body
 */
export function renderEmail(
  templateKey: ProviderOutreachTemplateKey,
  context: TemplateContext
): RenderedEmail {
  // Get the template
  const template = getTemplate(templateKey, context);

  // Build substitution variables
  const vars = buildVars(context);

  // Substitute variables in subject, preheader, and body
  const subject = substituteVars(template.subject, vars);
  const preheader = template.preheader ? substituteVars(template.preheader, vars) : undefined;
  const body = substituteVars(template.body, vars);

  // Convert body to polished HTML
  const bodyHtml = bodyToPolishedHtml(body);
  const footerHtml = composePolishedFooterHtml(vars);

  // Wrap in polished layout
  const html = polishedLayout(bodyHtml, footerHtml, {
    preheader,
    categoryLabel: getCategoryLabel(templateKey),
  });

  // Build plain text version
  const text = body + composePolishedFooterPlainText(vars);

  return { subject, preheader, html, text };
}

/**
 * Render a variant email with full HTML layout.
 *
 * Used by auto-send-executor when sending Day 0 variant emails.
 * Takes pre-substituted subject/body and wraps with proper Olera branding.
 *
 * @param variantDraft - Already-substituted subject and body
 * @param context - Provider context for footer links
 * @returns Rendered email with full HTML layout
 */
export function renderVariantEmail(
  variantDraft: { subject: string; body: string },
  context: TemplateContext
): RenderedEmail {
  // Build substitution variables for footer
  const vars = buildVars(context);

  // Convert body markdown to polished HTML
  const bodyHtml = bodyToPolishedHtml(variantDraft.body);
  const footerHtml = composePolishedFooterHtml(vars);

  // Wrap in polished layout with Day 0 category label
  const html = polishedLayout(bodyHtml, footerHtml, {
    categoryLabel: getCategoryLabel("intro"),
  });

  // Build plain text version
  const text = variantDraft.body + composePolishedFooterPlainText(vars);

  return {
    subject: variantDraft.subject,
    html,
    text,
  };
}

/**
 * Preview an email without sending.
 * Returns the rendered email plus metadata for admin review.
 *
 * @param templateKey - Which template to use
 * @param context - Provider context
 * @returns Rendered email plus preview metadata
 */
export function previewEmail(
  templateKey: ProviderOutreachTemplateKey,
  context: TemplateContext
): RenderedEmail & {
  templateKey: ProviderOutreachTemplateKey;
  context: TemplateContext;
  rawBody: string;
} {
  const rendered = renderEmail(templateKey, context);
  const template = getTemplate(templateKey, context);
  const vars = buildVars(context);
  const rawBody = substituteVars(template.body, vars);

  return {
    ...rendered,
    templateKey,
    context,
    rawBody,
  };
}

/**
 * Default mailing address for CAN-SPAM compliance
 */
const DEFAULT_MAILING_ADDRESS = "340 S Lemon Ave #1439, Walnut, CA 91789";

/**
 * Build the context object from provider data.
 * Used to transform raw provider data into the template context format.
 *
 * IMPORTANT: The `email` field is required to generate magic link tokens.
 * Without it, the claim/manage URLs won't auto-authenticate the provider.
 *
 * @param provider - Provider data from olera-providers table (must include email for magic links)
 * @param options - Optional overrides for URLs and ranking data
 */
export function buildContextFromProvider(
  provider: {
    provider_id: string;
    name: string;
    email: string; // Required for magic link token generation
    city?: string | null;
    state?: string | null;
    category?: string | null;
    slug: string;
  },
  options?: {
    baseUrl?: string;
    rank?: number;
    total?: number;
    // Override URLs (if provided, these take precedence over generated magic links)
    claimUrl?: string;
    manageUrl?: string;
    removeUrl?: string;
    unsubscribeUrl?: string;
    mailingAddress?: string;
    // Profile gaps (computed via getProviderGaps + formatGapList)
    gap_list?: string;
    // City demand metric (total unique views for city+category in last 30 days)
    city_views?: number;
    // Decision-maker data (from Apollo contact) for personalized greetings
    decision_maker?: {
      first_name: string | null;
      last_name: string | null;
      title: string | null;
    };
  }
): TemplateContext {
  const baseUrl = options?.baseUrl || "https://olera.care";
  const slug = provider.slug;

  // Generate magic link URLs with signed tokens
  const claimUrl = options?.claimUrl || generateClaimUrl(
    provider.provider_id,
    slug,
    provider.email,
    baseUrl
  );

  const manageUrl = options?.manageUrl || generateProviderPortalUrl(
    slug,
    provider.email,
    "manage",
    baseUrl
  );

  // Remove URL: points to removal request page
  const removeUrl = options?.removeUrl || `${baseUrl}/for-providers/removal-request/${slug}`;

  // Unsubscribe URL: points to unsubscribe page with cold_outreach type
  // This will add them to do_not_contact list
  const unsubscribeUrl = options?.unsubscribeUrl || `${baseUrl}/unsubscribe/${slug}?type=cold_outreach`;

  return {
    provider_name: provider.name,
    city: provider.city || provider.state || "your area",
    state: provider.state || "",
    category: normalizeCategory(provider.category),
    rank: options?.rank,
    total: options?.total,
    // Profile URL is the public listing page (no auth needed)
    profile_url: `${baseUrl}/provider/${slug}`,
    claim_url: claimUrl,
    manage_url: manageUrl,
    remove_url: removeUrl,
    unsubscribe_url: unsubscribeUrl,
    mailing_address: options?.mailingAddress || DEFAULT_MAILING_ADDRESS,
    gap_list: options?.gap_list,
    city_views: options?.city_views,
    // Decision-maker data for personalized greetings ("Hi John," vs "Hi Sunrise Senior Living,")
    decision_maker: options?.decision_maker,
  };
}

/**
 * Normalize provider category to a friendly display string.
 * Handles the actual category values from olera-providers table.
 */
function normalizeCategory(category: string | null | undefined): string {
  if (!category) return "care provider";

  // Map actual olera-providers categories to friendly email-safe names
  // These are the real values from the provider_category column
  const categoryMap: Record<string, string> = {
    // Exact matches from olera-providers
    "home care (non-medical)": "home care provider",
    "home health care": "home health agency",
    "assisted living": "assisted living facility",
    "independent living": "independent living community",
    "memory care": "memory care facility",
    "nursing home": "nursing home",
    "hospice": "hospice provider",
    // Combined categories
    "assisted living | independent living": "assisted living facility",
    "memory care | assisted living": "memory care facility",
    // Legacy/alternate formats (for safety)
    "home-care": "home care provider",
    "home_care": "home care provider",
    "home-health": "home health agency",
    "home_health": "home health agency",
  };

  const normalized = category.toLowerCase().trim();
  return categoryMap[normalized] || normalized;
}

/**
 * Validate that a provider has sufficient data for outreach.
 * Returns validation errors if any required fields are missing.
 */
export function validateProviderForOutreach(provider: {
  provider_id?: string | null;
  name?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  slug?: string | null;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!provider.provider_id) {
    errors.push("Provider ID is required");
  }

  if (!provider.name) {
    errors.push("Provider name is required");
  }

  if (!provider.email) {
    errors.push("Provider email is required for outreach");
  }

  if (!provider.slug) {
    errors.push("Provider slug is required");
  }

  // City and state are optional but recommended
  if (!provider.city && !provider.state) {
    // This is a warning, not an error
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ── Profile Gap Detection ─────────────────────────────────────────────────

/**
 * Provider data shape for gap detection.
 * Matches fields from the olera-providers table.
 */
export interface ProviderGapData {
  lower_price?: number | null;
  upper_price?: number | null;
  contact_for_price?: string | null; // "True" or "False"
  provider_images?: string | null; // Pipe-separated URLs
  hero_image_url?: string | null;
  phone?: string | null;
  provider_description?: string | null;
}

/**
 * Human-readable gap labels for email templates.
 * These are phrased to fit naturally in a sentence like:
 * "Right now, it shows {gap_list}."
 */
const GAP_LABELS = {
  pricing: "no starting price",
  photos: "no photos",
  contact: "no way to ask you a question",
  description: "no description of your services",
} as const;

/**
 * Priority order for gaps - most impactful to families first.
 * Matches what families care about when comparing providers.
 */
const GAP_PRIORITY: (keyof typeof GAP_LABELS)[] = [
  "pricing",
  "photos",
  "contact",
  "description",
];

/**
 * Detect which profile fields are missing for an unclaimed provider.
 * Returns an array of human-readable gap descriptions.
 *
 * @param provider - Provider data from olera-providers table
 * @param maxGaps - Maximum number of gaps to return (default: 3)
 * @returns Array of gap strings like ["no starting price", "no photos"]
 */
export function getProviderGaps(
  provider: ProviderGapData,
  maxGaps = 3
): string[] {
  const gaps: string[] = [];

  for (const key of GAP_PRIORITY) {
    if (gaps.length >= maxGaps) break;

    switch (key) {
      case "pricing":
        // Missing if no price range AND not explicitly "contact for pricing"
        // Normalize to lowercase for safety (database might have "True", "true", etc.)
        if (
          provider.lower_price == null &&
          provider.upper_price == null &&
          provider.contact_for_price?.toLowerCase() !== "true"
        ) {
          gaps.push(GAP_LABELS.pricing);
        }
        break;

      case "photos":
        // Missing if no images at all
        if (!provider.provider_images?.trim() && !provider.hero_image_url) {
          gaps.push(GAP_LABELS.photos);
        }
        break;

      case "contact":
        // Missing if no phone (email is for outreach, website is indirect)
        if (!provider.phone?.trim()) {
          gaps.push(GAP_LABELS.contact);
        }
        break;

      case "description": {
        // Missing if no description or very short
        const desc = provider.provider_description?.trim();
        if (!desc || desc.length < 50) {
          gaps.push(GAP_LABELS.description);
        }
        break;
      }
    }
  }

  return gaps;
}

/**
 * Format an array of gaps into a grammatically correct sentence fragment.
 *
 * Examples:
 *   ["no photos"] → "no photos"
 *   ["no starting price", "no photos"] → "no starting price and no photos"
 *   ["no starting price", "no photos", "no way to ask you a question"]
 *     → "no starting price, no photos, and no way to ask you a question"
 *   [] → fallback (default: "only what we could gather publicly")
 *
 * @param gaps - Array of gap strings from getProviderGaps()
 * @param fallback - String to return if gaps is empty (for unclaimed providers, there's always something missing)
 * @returns Formatted string for use in templates
 */
export function formatGapList(
  gaps: string[],
  fallback = "only what we could gather publicly"
): string {
  if (gaps.length === 0) return fallback;
  if (gaps.length === 1) return gaps[0];
  if (gaps.length === 2) return `${gaps[0]} and ${gaps[1]}`;
  // Oxford comma for 3+
  return `${gaps.slice(0, -1).join(", ")}, and ${gaps[gaps.length - 1]}`;
}

// ── City Demand Metrics ────────────────────────────────────────────────────

/**
 * Fetch the total unique page views for a city+category over the last 30 days.
 *
 * Data source: provider_page_view_stats table (populated by the nightly
 * aggregate-provider-views cron job).
 *
 * @param city - Provider's city
 * @param category - Provider's normalized category (from olera-providers.provider_category)
 * @param db - Supabase client (service role)
 * @returns Total unique views, or 0 if no data
 */
export async function getCityViews(
  city: string | null | undefined,
  category: string | null | undefined,
  db: ReturnType<typeof import("@/lib/admin").getServiceClient>
): Promise<number> {
  if (!city) return 0;

  // Calculate date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateThreshold = thirtyDaysAgo.toISOString().split("T")[0];

  // Build query - sum unique views for this city (and optionally category)
  let query = db
    .from("provider_page_view_stats")
    .select("unique_view_count")
    .eq("city", city)
    .gte("date", dateThreshold);

  // If category is provided, filter by it too
  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getCityViews] Query failed:", error);
    return 0;
  }

  if (!data || data.length === 0) {
    return 0;
  }

  // Sum all unique_view_count values
  return data.reduce((sum, row) => sum + (row.unique_view_count || 0), 0);
}

/**
 * Batch-fetch city views for multiple city+category pairs.
 * More efficient than calling getCityViews() in a loop.
 *
 * @param pairs - Array of { city, category } pairs
 * @param db - Supabase client (service role)
 * @returns Map of "city|category" → total views
 */
export async function getCityViewsBatch(
  pairs: Array<{ city: string | null; category: string | null }>,
  db: ReturnType<typeof import("@/lib/admin").getServiceClient>
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // Filter out null cities
  const validPairs = pairs.filter((p) => p.city);
  if (validPairs.length === 0) return result;

  // Get unique cities
  const uniqueCities = [...new Set(validPairs.map((p) => p.city!))];

  // Calculate date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateThreshold = thirtyDaysAgo.toISOString().split("T")[0];

  // Fetch all rows for these cities in one query
  const { data, error } = await db
    .from("provider_page_view_stats")
    .select("city, category, unique_view_count")
    .in("city", uniqueCities)
    .gte("date", dateThreshold);

  if (error) {
    console.error("[getCityViewsBatch] Query failed:", error);
    return result;
  }

  if (!data) return result;

  // Aggregate by city|category
  const aggregated = new Map<string, number>();
  for (const row of data) {
    const key = `${row.city}|${row.category || ""}`;
    aggregated.set(key, (aggregated.get(key) || 0) + (row.unique_view_count || 0));
  }

  // Build result map for requested pairs
  for (const pair of validPairs) {
    const key = `${pair.city}|${pair.category || ""}`;
    result.set(key, aggregated.get(key) || 0);
  }

  return result;
}


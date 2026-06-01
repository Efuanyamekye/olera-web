/**
 * Olera email templates — plain HTML strings with inline styles.
 * Each template returns an HTML string ready for `sendEmail({ html })`.
 *
 * Design: clean, minimal, system font stack. Matches Olera brand colors.
 */

const BRAND_COLOR = "#198087";
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

// ── Layout helpers ──────────────────────────────────────────────

/**
 * Hidden inbox-preview text that appears after the subject line in
 * Gmail/Outlook/Apple Mail. Without this, clients show a random
 * fragment of the body (often header text or whitespace).
 *
 * Pattern: visually hidden span + zero-width-joiner spacer to push
 * body content out of the preview window. Standard across MailChimp,
 * SendGrid, Postmark templates.
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
  // 80 zero-width joiners after the preheader — pushes body chars out
  // of the preview window so inboxes don't append e.g. "Olera ..." to it.
  const spacer = "&zwnj;&nbsp;".repeat(80);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f9fafb;opacity:0;">${escaped}${spacer}</div>`;
}

function layout(body: string, preheader?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:${FONT_STACK};">
  ${preheaderHtml(preheader ?? "")}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:24px 32px 16px;">
          <span style="font-size:18px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.3px;">Olera</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 32px 32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">
            &copy; ${new Date().getFullYear()} Olera &middot;
            <a href="${BASE_URL}" style="color:#9ca3af;">olera.care</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>`;
}

/**
 * Escape HTML special characters to prevent XSS and layout issues.
 * Use this for any user-generated content inserted into email HTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Extract first name for email personalization.
 * "Maria Johnson" → "Maria"
 * Placeholder names (anonymous, careseeker, etc.) → fallback
 *
 * @param name - Full name to extract first name from
 * @param fallback - What to return for placeholder names (default: "Someone")
 *                   Use "there" for greetings: "Hi there"
 *                   Use "Someone" for subjects: "Someone sent you a message"
 */
export function firstName(name: string, fallback = "Someone"): string {
  const first = name.trim().split(/\s+/)[0];
  const lower = first.toLowerCase();

  // Placeholder names or single characters → use fallback
  const placeholders = ["anonymous", "careseeker", "care", "a", "family", "guest", "user"];
  if (!first || lower.length <= 1 || placeholders.includes(lower)) {
    return fallback;
  }

  return first;
}

function secondaryLink(label: string, href: string): string {
  return `<a href="${href}" style="color:#9ca3af;text-decoration:underline;font-size:13px;">${label}</a>`;
}

/** Prominent text link for secondary CTAs — email-client safe (no borders) */
function ctaLink(label: string, href: string): string {
  return `<a href="${href}" style="color:${BRAND_COLOR};text-decoration:underline;font-size:14px;font-weight:600;">${label}</a>`;
}

function trustIntro(): string {
  return `<p style="font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.6;">Olera is an NIH-backed platform helping families find quality senior care providers like you. Families in your area are actively researching care options on your profile.</p>`;
}

function offRampBlock(providerSlug?: string): string {
  const removalUrl = providerSlug
    ? `${BASE_URL}/for-providers/removal-request/${providerSlug}`
    : `mailto:support@olera.care?subject=Listing%20inquiry`;
  const unsubscribeUrl = providerSlug
    ? `${BASE_URL}/unsubscribe/${providerSlug}`
    : null;
  return `
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;line-height:1.5;">Not the right contact? Please forward this to the appropriate person on your team.</p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">${secondaryLink("Manage your listing", removalUrl)}${unsubscribeUrl ? ` &middot; ${secondaryLink("Unsubscribe from leads", unsubscribeUrl)}` : ""}</p>
    </div>`;
}

// ── Templates ───────────────────────────────────────────────────

/** Verification code email for provider claims (existing flow) */
export function verificationCodeEmail(
  providerName: string,
  code: string
): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your organization</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Someone is trying to claim the page for <strong>${providerName}</strong> on Olera.
      Use this code to complete verification:
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827;">${code}</span>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
    </p>
  `);
}

/** Verification OTP email for email verification method */
export function verificationOtpEmail(opts: {
  recipientName: string;
  code: string;
  businessName: string;
  expiresInMinutes: number;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${firstName(opts.recipientName, "there")}, use this code to verify your connection to <strong>${escapeHtml(opts.businessName)}</strong> on Olera:
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827;">${opts.code}</span>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      This code expires in ${opts.expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email.
    </p>
  `);
}

/** Email to provider when a family sends a connection request */
export function connectionRequestEmail(opts: {
  providerName: string;
  familyName: string;
  careType: string | null;
  message: string | null;
  viewUrl: string;
  providerSlug?: string;
}): string {
  const careLine = opts.careType
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 20px;"><strong>Care type:</strong> ${escapeHtml(opts.careType)}</p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family is looking for care from ${escapeHtml(opts.providerName)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      <strong>${firstName(opts.familyName)}</strong> is actively searching for care and chose to reach out to your organization.
    </p>
    ${careLine}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">A timely response makes all the difference for families navigating care decisions. Log in to view the full inquiry and respond.</p>
    <div>${button("View care inquiry", opts.viewUrl)}</div>
    ${offRampBlock(opts.providerSlug)}
  `);
}

/** Confirmation email to family after they send a connection request */
export function connectionSentEmail(opts: {
  familyName: string;
  providerName: string;
  careType: string | null;
  viewUrl: string;
}): string {
  const careLine = opts.careType
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 20px;"><strong>Care type:</strong> ${escapeHtml(opts.careType)}</p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your message is on its way</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your inquiry to <strong>${escapeHtml(opts.providerName)}</strong> has been delivered. We'll notify you as soon as they respond.
    </p>
    ${careLine}
    <div style="margin:0 0 24px;">${button("View your inbox", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email.
    </p>
  `, "We'll notify you when they respond.");
}

/**
 * Combined email for guest connections — serves as both confirmation AND magic link.
 * Single email reduces confusion and improves conversion.
 */
export function guestConnectionEmail(opts: {
  familyName: string;
  providerName: string;
  careType: string | null;
  magicLinkUrl: string;
}): string {
  const careLine = opts.careType
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 20px;"><strong>Care type:</strong> ${escapeHtml(opts.careType)}</p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your message is on its way</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your inquiry to <strong>${escapeHtml(opts.providerName)}</strong> has been delivered. We'll notify you as soon as they respond.
    </p>
    ${careLine}
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;">Click below to view your inbox — you'll be signed in automatically.</p>
    <div style="margin:0 0 24px;">${button("View your inbox", opts.magicLinkUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      This link expires in 1 hour. Questions? Just reply to this email.
    </p>
  `, "We'll notify you when they respond.");
}

/** Email to verify email address after instant account creation */
export function verifyEmailEmail(opts: {
  familyName: string;
  providerName: string;
  verifyUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, you're connected with <strong>${escapeHtml(opts.providerName)}</strong> on Olera.
      Verify your email to sign in from any device and keep your account secure.
    </p>
    <div style="margin:24px 0;">${button("Verify Email", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      You can continue using Olera without verifying, but we recommend it for account security.
    </p>
  `);
}

/** Email to family when a provider responds (accept/decline) */
export function connectionResponseEmail(opts: {
  familyName: string;
  providerName: string;
  accepted: boolean;
  viewUrl: string;
}): string {
  if (opts.accepted) {
    return layout(`
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Good news</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
        Hi ${firstName(opts.familyName, "there")}, <strong>${escapeHtml(opts.providerName)}</strong> is interested in helping you. View their response and continue the conversation.
      </p>
      <div style="margin:0 0 24px;">${button("View conversation", opts.viewUrl)}</div>
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
        Questions? Just reply to this email.
      </p>
    `, "They're interested in connecting with you.");
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">We're still here to help</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, <strong>${escapeHtml(opts.providerName)}</strong> isn't able to take new clients right now — but there are other great providers in your area.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Finding the right care takes time. Keep exploring — we'll help you find the right fit.
    </p>
    <div style="margin:0 0 24px;">${button("Browse other providers", `${BASE_URL}/browse`)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email.
    </p>
  `, "We're here to help you find the right care.");
}

/** Email when a new message is sent in a connection thread */
export function newMessageEmail(opts: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  const safeSenderName = firstName(opts.senderName, "Someone");
  const safePreview = escapeHtml(opts.messagePreview);
  // Preheader uses raw text (preheaderHtml handles its own escaping)
  const preheaderSnippet = opts.messagePreview.length > 60
    ? opts.messagePreview.slice(0, 60) + "..."
    : opts.messagePreview;

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.recipientName, "there")},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      <strong>${safeSenderName}</strong> sent you a message:
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${safePreview}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("Reply", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email.
    </p>
  `, `"${preheaderSnippet}"`);
}

/** Reminder email to family when provider responded but family hasn't engaged */
export function unreadReminderEmail(opts: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  const safeSenderName = firstName(opts.senderName, "A provider");
  const safePreview = escapeHtml(opts.messagePreview);
  // Preheader uses raw text (preheaderHtml handles its own escaping)
  const preheaderSnippet = opts.messagePreview.length > 50
    ? opts.messagePreview.slice(0, 50) + "..."
    : opts.messagePreview;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You have an unread response</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.recipientName, "there")}, <strong>${safeSenderName}</strong> responded to your care inquiry, but we haven't heard back from you yet.
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${safePreview}"</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Providers are more likely to help families who respond promptly.
    </p>
    <div style="margin:0 0 24px;">${button("View their response", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email.
    </p>
  `, `They responded to your inquiry — "${preheaderSnippet}"`);
}

/** Email to admin when a provider claims their page */
export function claimNotificationEmail(opts: {
  providerName: string;
  providerSlug: string;
  claimedByEmail: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Provider claimed</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 8px;line-height:1.5;">
      <strong>${escapeHtml(opts.providerName)}</strong> was just claimed on Olera.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
      <strong>Claimed by:</strong> ${escapeHtml(opts.claimedByEmail)}
    </p>
    <div>${button("View listing", `${BASE_URL}/provider/${opts.providerSlug}`)}</div>
  `);
}

/** Email to provider when their claim is approved or rejected */
export function claimDecisionEmail(opts: {
  providerName: string;
  approved: boolean;
  listingUrl: string;
}): string {
  if (opts.approved) {
    return layout(`
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your listing is live!</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Congratulations — <strong>${escapeHtml(opts.providerName)}</strong> has been verified and is now live on Olera.
        Families in your area can find you and reach out directly.
      </p>
      <div>${button("View your listing", opts.listingUrl)}</div>
    `);
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your claim needs attention</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      We were unable to verify the claim for <strong>${escapeHtml(opts.providerName)}</strong>.
      This is usually due to missing or mismatched information. Please reach out so we can help resolve it.
    </p>
    <div>${button("Contact support", "mailto:support@olera.care")}</div>
  `);
}

/** Email to provider when their identity verification is approved or rejected */
export function verificationDecisionEmail(opts: {
  providerName: string;
  recipientName: string;
  approved: boolean;
  dashboardUrl: string;
}): string {
  if (opts.approved) {
    return layout(`
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td align="center">
          <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;">
            <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">✓</td></tr>
          </table>
        </td></tr>
      </table>
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">You're verified</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
        ${firstName(opts.recipientName, "Hi")}, your connection to <strong>${escapeHtml(opts.providerName)}</strong> has been verified. You now have full access to your dashboard.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">With verification complete, you can:</p>
      <ul style="font-size:14px;color:#6b7280;margin:0 0 24px;padding-left:20px;line-height:1.8;">
        <li>Edit your listing with photos & pricing</li>
        <li>Respond to family inquiries</li>
        <li>Hire caregivers</li>
        <li>View your profile analytics</li>
      </ul>
      <div style="text-align:center;">${button("Go to Dashboard", opts.dashboardUrl)}</div>
    `);
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verification needs attention</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      We were unable to verify the identity documents submitted for <strong>${escapeHtml(opts.providerName)}</strong>.
      This may be due to unclear images or mismatched information.
    </p>
    <div style="text-align:center;">${button("Resubmit Verification", opts.dashboardUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;text-align:center;">
      Need help? <a href="mailto:support@olera.care" style="color:#199087;text-decoration:none;">Contact support</a>
    </p>
  `);
}

/** Email to provider when they receive a new review */
export function newReviewEmail(opts: {
  providerName: string;
  reviewerName: string;
  rating: number;
  comment: string;
  viewUrl: string;
  providerSlug?: string;
}): string {
  // Generate star rating display
  const stars = "★".repeat(opts.rating) + "☆".repeat(5 - opts.rating);

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${firstName(opts.reviewerName)} left a review for ${escapeHtml(opts.providerName)}</h1>
    ${trustIntro()}
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 20px;">
      <p style="font-size:20px;color:#f59e0b;margin:0 0 12px;letter-spacing:2px;">${stars}</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6;">"${escapeHtml(opts.comment)}"</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">Reviews help families make confident decisions about care — and yours is getting noticed.</p>
    <div>${button("View your review", opts.viewUrl)}</div>
    ${offRampBlock(opts.providerSlug)}
  `);
}

// ── question_received A/B test ────────────────────────────────────────
//
// Variant A (control): exact production state as of 2026-04-27.
//   Subject: "A family has a question about {Provider}"
//   Preheader: none — inbox shows whatever body fragment the client picks.
//
// Variant B: real question as subject (truncated, quote-wrapped) +
// neutral Olera-attributed preheader.
//   Subject: "{Question excerpt}"
//   Preheader: "From a family on Olera · {Provider}"
//
// Question content can rarely contain identifying health detail; B falls
// back to a non-question subject when keywords like "dementia",
// "Alzheimer's", "Parkinson's", etc. are present. Marketing-urgency words
// hurt opens (research: opens drop below 36%; 69% of decision-makers find
// urgency-marketing copy annoying), so B leans into "real-question / from
// a colleague" feel rather than stakes pressure.
//
// Variant assignment happens once at send time; the chosen variant is
// persisted to email_log.metadata.variant so the admin funnel tile can
// split open / click / sign-in / answer rates by arm.

const QA_PHI_KEYWORDS = /\b(dementi|alzheim|parkinson|cancer|stroke|hospice|als|multiple sclerosis|diabet|copd|hypertens|chemo|dialysis|oxygen tank|ventilator|catheter|depress|anxiet|schizo|bipolar|psychos|incontinen|bedridden|immobile|terminal|palliative|end-of-life|end of life)\b/i;

function questionMentionsPHI(text: string): boolean {
  return QA_PHI_KEYWORDS.test(text);
}

/**
 * Truncate a question for use directly in the subject line. Mobile inboxes
 * typically clip at ~40-50 chars before the ellipsis; quote chars consume
 * 2 of those, so we aim for ≤48 visible question chars.
 */
function truncateForSubject(text: string, max = 48): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + "…";
}

export type QaEmailVariant = "A" | "B";

/**
 * Random 50/50 assignment for the question_received A/B test. Call once
 * per email send and pass the result to both questionReceivedInbox() and
 * sendEmail's metadata so the funnel can later attribute opens correctly.
 */
export function assignQuestionVariant(): QaEmailVariant {
  return Math.random() < 0.5 ? "A" : "B";
}

/**
 * Build the inbox-visible parts (subject + preheader) of a question_received
 * email for the given variant. Centralizes A/B copy so all 3 send sites stay
 * in sync.
 *
 * `phiFiltered` is true when variant B fell back to a non-question subject
 * because the question text contained health-condition keywords. Persist
 * this in email_log.metadata so we can audit the rate later.
 */
export function questionReceivedInbox(opts: {
  providerName: string;
  question: string;
  variant: QaEmailVariant;
}): { subject: string; preheader: string; phiFiltered: boolean } {
  if (opts.variant === "A") {
    return {
      subject: `A family has a question about ${opts.providerName}`,
      preheader: "",
      phiFiltered: false,
    };
  }
  // B
  const phi = questionMentionsPHI(opts.question);
  if (phi) {
    return {
      subject: `A new family question for ${opts.providerName}`,
      preheader: `From a family on Olera · Posted today`,
      phiFiltered: true,
    };
  }
  const truncated = truncateForSubject(opts.question);
  return {
    subject: `"${truncated}"`,
    preheader: `From a family on Olera · ${opts.providerName}`,
    phiFiltered: false,
  };
}

/** Email to provider when someone asks a question on their page */
export function questionReceivedEmail(opts: {
  providerName: string;
  askerName: string;
  question: string;
  providerUrl: string;
  providerSlug?: string;
  /** Optional preheader for inbox preview. Pass from questionReceivedInbox(). */
  preheader?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family has a question about ${escapeHtml(opts.providerName)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      <strong>${firstName(opts.askerName)}</strong> is researching care options and asked:
    </p>
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:15px;color:#111827;margin:0;line-height:1.5;font-style:italic;">&ldquo;${escapeHtml(opts.question)}&rdquo;</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">A thoughtful answer helps families see your expertise and builds trust with people actively looking for care.</p>
    <div>${button("View and respond", opts.providerUrl)}</div>
    ${offRampBlock(opts.providerSlug)}
  `, opts.preheader);
}

/** Email to asker when their question is answered */
export function questionAnsweredEmail(opts: {
  askerName: string;
  providerName: string;
  question: string;
  answer: string;
  providerUrl: string;
}): string {
  // Preheader shows answer preview
  const preheaderSnippet = opts.answer.length > 50
    ? opts.answer.slice(0, 50) + "..."
    : opts.answer;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${firstName(opts.providerName, "A provider")} answered your question</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.askerName, "there")}, <strong>${escapeHtml(opts.providerName)}</strong> responded to your question:
    </p>
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your question</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.question)}"</p>
    </div>
    <div style="background:#f0fdfa;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:13px;color:${BRAND_COLOR};margin:0 0 6px;font-weight:600;">Their answer</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.answer)}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("See the full answer", opts.providerUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email.
    </p>
  `, `"${preheaderSnippet}"`);
}

/** Confirmation email to guest after they enrich a Q&A question with their email */
export function questionConfirmationEmail(opts: {
  askerName: string;
  providerName: string;
  question: string;
  providerUrl: string;
  /** Optional list of similar providers nearby. When provided, the email
   *  ends with a "While you wait" block listing them with name + city + a
   *  link to each. Used by the qa_email_capture variant to deliver on the
   *  enrichment-prompt promise ("we'll send 3 similar providers in [City]
   *  in case they don't reply fast"). Pass [] (empty array) or omit to
   *  fall back to the original single-CTA email. */
  alternatives?: Array<{ name: string; city: string | null; url: string }>;
  /** City of the original provider, used in the alternatives header copy.
   *  When omitted, the header drops the city qualifier. */
  city?: string | null;
}): string {
  const alternativesBlock =
    opts.alternatives && opts.alternatives.length > 0
      ? `
    <p style="font-size:15px;color:#6b7280;margin:24px 0 12px;line-height:1.5;">
      While you wait for <strong>${escapeHtml(opts.providerName)}</strong> to reply, here ${opts.alternatives.length === 1 ? "is" : "are"} ${opts.alternatives.length} similar
      provider${opts.alternatives.length === 1 ? "" : "s"}${opts.city ? ` in ${escapeHtml(opts.city)}` : " nearby"} to compare:
    </p>
    <div style="margin:0 0 24px;">
      ${opts.alternatives
        .map(
          (a) => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin:0 0 8px;">
          <a href="${a.url}" style="font-size:15px;font-weight:600;color:#111827;text-decoration:none;">${escapeHtml(a.name)}</a>
          ${a.city ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(a.city)}</div>` : ""}
        </div>`,
        )
        .join("")}
    </div>
  `
      : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your question is on its way</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.askerName, "there")}, your question to <strong>${escapeHtml(opts.providerName)}</strong> has been delivered. We'll notify you as soon as they respond.
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.question)}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("View on Olera", opts.providerUrl)}</div>
    ${alternativesBlock}
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email.
    </p>
  `, "We'll notify you when they respond.");
}

/** Welcome email for new users from multi_provider Q&A variants */
export function questionWelcomeEmail(opts: {
  displayName: string;
  providerName: string | null;
  questionText: string | null;
  portalUrl: string;
}): string {
  const questionBlock = opts.questionText
    ? `
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your question</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.questionText)}"</p>
    </div>
  `
    : "";

  const providerContext = opts.providerName
    ? `Your question to <strong>${escapeHtml(opts.providerName)}</strong> has been delivered. Most providers respond within 24 hours — we'll email you the moment they do.`
    : `Your question has been delivered. Most providers respond within 24 hours — we'll email you the moment they do.`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You're all set</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.displayName, "there")}, ${providerContext}
    </p>
    ${questionBlock}
    <div style="margin:0 0 24px;">${button("View your inbox", opts.portalUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email.
    </p>
  `, "Your question has been delivered.");
}

/** Email to family when their Matches profile goes live */
export function matchesLiveEmail(opts: {
  familyName: string;
  city: string;
  matchesUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your Matches profile is live!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, great news — qualified care providers in ${escapeHtml(opts.city)} can now find you on Olera.
      We'll email you the moment someone reaches out.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      You're in control. When a provider contacts you, you decide whether to respond.
    </p>
    <div>${button("View your Profile", opts.matchesUrl)}</div>
  `);
}

/** Email to family when a provider sends a reach-out (Matches F2) */
export function providerReachOutEmail(opts: {
  familyName: string;
  providerName: string;
  city: string;
  message: string | null;
  matchesUrl: string;
}): string {
  const messageLine = opts.message
    ? `<div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.message)}"</p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A provider in ${escapeHtml(opts.city)} is interested</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, <strong>${escapeHtml(opts.providerName)}</strong> in ${escapeHtml(opts.city)} saw your care profile and wants to connect.
    </p>
    ${messageLine}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      You're in control — review their profile and decide if you'd like to start a conversation.
    </p>
    <div>${button("View Message", opts.matchesUrl)}</div>
  `);
}

/** Email to family when they have unanswered messages and Matches is not active (F3) */
export function matchesNudgeEmail(opts: {
  familyName: string;
  unansweredCount: number;
  matchesUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Still waiting to hear back? There's a better way.</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, you've reached out to ${opts.unansweredCount} providers but haven't heard back yet.
    </p>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      With Matches, providers come to you. Share what you're looking for once, and qualified providers in your area will reach out directly.
    </p>
    <div>${button("Try Matches", opts.matchesUrl)}</div>
  `);
}

/** Email to provider when their profile is still incomplete 48hrs after signup (P1) */
export function providerIncompleteProfileEmail(opts: {
  providerName: string;
  city: string;
  profileUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are searching in ${escapeHtml(opts.city)}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${firstName(opts.providerName, "there")}, families in ${escapeHtml(opts.city)} are looking for care providers on Olera — but your profile isn't ready yet.
      Complete it so families can find and connect with you.
    </p>
    <div>${button("Complete your profile", opts.profileUrl)}</div>
  `);
}

/** Email to provider when a family accepts their reach-out (P2) */
export function reachOutAcceptedEmail(opts: {
  providerName: string;
  familyName: string;
  viewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You're connected!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      <strong>${firstName(opts.familyName, "A family")}</strong> accepted your reach-out on Olera. You can now message each other directly.
    </p>
    <div>${button("View conversation", opts.viewUrl)}</div>
  `);
}

/** Email to provider when a family closes their profile (auto-decline pending reach-outs) */
export function reachOutAutoDeclinedEmail(opts: {
  providerName: string;
  familyCity: string;
  viewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family closed their profile</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.providerName, "there")}, a family in ${escapeHtml(opts.familyCity)} that you reached out to has closed their care profile on Olera.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      This sometimes happens when families find care or their needs change. Keep reaching out to other families — new care seekers join every day.
    </p>
    <div>${button("Find Families", opts.viewUrl)}</div>
  `);
}

/** Document checklist email for benefits applications */
export function checklistEmail(opts: {
  programName: string;
  programShortName: string;
  stateName: string;
  checked: string[];
}): string {
  const categories = [
    {
      name: "Identity & Personal",
      items: [
        "Government-issued photo ID",
        "Social Security card",
        "Birth certificate",
        "Marriage certificate (if applicable)",
        "Passport-size photo",
      ],
    },
    {
      name: "Medical & Health",
      items: [
        "Medical records or doctor's statement",
        "Diagnosis or disability documentation",
        "Current medication list",
        "Health insurance card (Medicare/Medicaid)",
      ],
    },
    {
      name: "Financial & Income",
      items: [
        "Proof of income (pay stubs, tax return, SSI letter)",
        "Bank statements (last 3 months)",
        "Proof of assets (property, investments)",
        "Proof of expenses (rent, utilities, medical bills)",
      ],
    },
    {
      name: "Residency & Housing",
      items: [
        "Proof of state residency (utility bill, lease)",
        "Current living arrangement documentation",
        "Proof of U.S. citizenship or immigration status",
      ],
    },
  ];

  const checkedSet = new Set(opts.checked);
  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
  const checkedCount = opts.checked.length;

  const categoriesHtml = categories
    .map((cat) => {
      const itemsHtml = cat.items
        .map((item) => {
          const done = checkedSet.has(item);
          const icon = done ? "&#9745;" : "&#9744;";
          const style = done
            ? "color:#9ca3af;text-decoration:line-through;"
            : "color:#374151;";
          return `<tr><td style="padding:4px 0;font-size:14px;${style}">${icon}&nbsp; ${item}</td></tr>`;
        })
        .join("");

      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr><td style="font-size:15px;font-weight:600;color:#111827;padding:0 0 8px;border-bottom:1px solid #f3f4f6;">
            ${cat.name}
          </td></tr>
          ${itemsHtml}
        </table>`;
    })
    .join("");

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your Document Checklist</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 4px;line-height:1.5;">
      For <strong>${escapeHtml(opts.programName)}</strong> in ${escapeHtml(opts.stateName)}
    </p>
    <p style="font-size:14px;color:${BRAND_COLOR};font-weight:600;margin:0 0 24px;">
      ${checkedCount} of ${totalItems} documents gathered
    </p>
    ${categoriesHtml}
    <div style="background:#f0fdfa;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Next step:</strong> Once you've gathered all documents, visit the ${escapeHtml(opts.programShortName)} page on Olera to start your application.
      </p>
    </div>
    <div>${button("View program details", `${BASE_URL}/senior-benefits`)}</div>
  `);
}

// ── Care Seeker Notification Emails ──────────────────────────────

/** Welcome email for new signups (Google OAuth / email OTP — NOT guest connections) */
export function welcomeEmail(opts: {
  familyName: string;
  browseUrl: string;
  profileUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">We're here to help</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, finding care for someone you love isn't easy — and you don't have to figure it out alone.
    </p>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Olera helps you compare trusted providers, ask questions directly, and make informed decisions at your own pace.
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;">When you're ready, start by browsing providers in your area.</p>
    <div style="margin:0 0 24px;">${button("See providers near you", opts.browseUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Want providers to reach out to you? ${ctaLink("Complete your profile", opts.profileUrl)} and let them find you.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? Just reply to this email — a real person will get back to you.
    </p>
  `, "You don't have to figure this out alone.");
}

// ── Provider card helper for email templates ──

interface EmailProviderCard {
  name: string;
  category: string;
  slug: string;
  rating: number;
  reviewCount: number;
  reviewSnippet?: string | null;
  city: string;
  state: string;
}

function providerCardRow(provider: EmailProviderCard, showSnippet = false): string {
  const snippetHtml = showSnippet && provider.reviewSnippet
    ? `<p style="font-size:13px;color:#6b7280;margin:6px 0 0;line-height:1.4;font-style:italic;">&ldquo;${provider.reviewSnippet.slice(0, 120)}${provider.reviewSnippet.length > 120 ? "..." : ""}&rdquo;</p>`
    : "";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:12px 16px;">
        <a href="${BASE_URL}/provider/${provider.slug}" style="font-size:15px;font-weight:600;color:#111827;text-decoration:none;">${provider.name}</a>
        <p style="font-size:13px;color:#6b7280;margin:2px 0 0;">${provider.category} &middot; ${provider.city}, ${provider.state}</p>
        <p style="font-size:13px;color:#d97706;margin:4px 0 0;">&starf; ${provider.rating.toFixed(1)} (${provider.reviewCount.toLocaleString()} reviews) on Google</p>
        ${snippetHtml}
      </td></tr>
    </table>`;
}

function providerCardsBlock(providers: EmailProviderCard[], showSnippets = false): string {
  if (providers.length === 0) return "";
  return `<div style="margin:0 0 24px;">${providers.map((p) => providerCardRow(p, showSnippets)).join("")}</div>`;
}

/** Go-live reminder — shows nearby provider count + top providers */
export function goLiveReminderEmail(opts: {
  familyName: string;
  matchesUrl: string;
  city?: string;
  providerCount?: number;
  topProviders?: EmailProviderCard[];
}): string {
  const cityText = opts.city || "your area";
  const countText = opts.providerCount ? `${opts.providerCount} care` : "Care";
  const providersHtml = opts.topProviders?.length ? providerCardsBlock(opts.topProviders) : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${countText} providers in ${escapeHtml(cityText)} are looking for families like yours</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your care profile is looking great. Activate Matches and let providers in your area reach out to you directly.
    </p>
    ${providersHtml}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      You're always in control — you decide which providers to respond to.
    </p>
    <div>${button("Go Live", opts.matchesUrl)}</div>
  `);
}

/** Profile incomplete reminder — specific about what's missing */
export function familyProfileIncompleteEmail(opts: {
  familyName: string;
  welcomeUrl: string;
  missingCareTypes?: boolean;
  missingLocation?: boolean;
  providerCount?: number;
  state?: string;
}): string {
  let headline: string;
  let body: string;

  if (opts.missingCareTypes && !opts.missingLocation) {
    headline = "Tell us what you're looking for";
    body = `We'd love to help you find the right care. Tell us what type of care you need and we'll show you providers that match.`;
  } else if (!opts.missingCareTypes && opts.missingLocation) {
    const countText = opts.providerCount ? ` the ${opts.providerCount}` : "";
    headline = "Add your location to see providers near you";
    body = `Add your city so we can show you${countText} providers near you. It only takes a moment.`;
  } else {
    const stateText = opts.state ? ` in ${opts.state}` : "";
    headline = `Unlock care options${stateText}`;
    body = `A few quick details — your care needs and location — will unlock personalized provider matches${stateText}.`;
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${headline}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${body}
    </p>
    <div>${button("Complete your profile", opts.welcomeUrl)}</div>
  `);
}

/** Provider recommendation — shows top providers matching family's needs */
export function providerRecommendationEmail(opts: {
  familyName: string;
  city: string;
  providers: EmailProviderCard[];
  browseUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Top-rated providers in ${escapeHtml(opts.city)} for you</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, we found some highly-rated care providers in ${escapeHtml(opts.city)} that match what you're looking for.
    </p>
    ${providerCardsBlock(opts.providers, true)}
    <div>${button("Browse all providers near you", opts.browseUrl)}</div>
  `);
}

/** Post-connection follow-up — asks about experience, builds review system */
export function postConnectionFollowupEmail(opts: {
  familyName: string;
  providerName: string;
  providerSlug: string;
  reviewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">How was your experience with ${escapeHtml(opts.providerName)}?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, you connected with ${escapeHtml(opts.providerName)} on Olera about a month ago. We'd love to hear how it went.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your feedback helps other families make informed decisions — and helps great providers get the recognition they deserve.
    </p>
    <div>${button("Share your experience", opts.reviewUrl)}</div>
  `);
}

/** Dormant re-engagement — social proof with popular providers */
export function dormantReengagementEmail(opts: {
  familyName: string;
  state: string;
  providers: EmailProviderCard[];
  browseUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families in ${escapeHtml(opts.state)} are finding care on Olera</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, finding the right care takes time — and we're here when you're ready. Here are some providers other families are connecting with:
    </p>
    ${providerCardsBlock(opts.providers)}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Whenever you're ready, Olera makes it easy to compare providers, read reviews, and connect directly.
    </p>
    <div>${button("Browse providers near you", opts.browseUrl)}</div>
  `);
}

// ── Profile Completion Sequence (4 active + 1 maintenance) ──────────

/** Completion Nudge #1 (Same day): What's missing, why it matters */
export function completionNudge1Email(opts: {
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providerCount?: number;
  city?: string;
}): string {
  const percent = opts.completionPercent ?? 0;
  const missing = opts.missingFields ?? [];
  const missingSummary = missing.length <= 3
    ? missing.join(", ")
    : `${missing.slice(0, 3).join(", ")}, and ${missing.length - 3} more`;
  const locationText = opts.city || "your area";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Complete your profile to connect with providers</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your profile is ${percent}% complete. A few more details will help providers in ${escapeHtml(locationText)} understand your needs.
    </p>
    ${missing.length > 0 ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Missing information:</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">${missingSummary}</p>
    </div>
    ` : ""}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      ${opts.providerCount ? `${opts.providerCount} providers are looking for families like yours.` : "Complete profiles get faster responses from providers."}
    </p>
    <div>${button("Complete Your Profile", opts.welcomeUrl)}</div>
  `);
}

/** Completion Nudge #2 (Day 2): Progress encouragement, provider count */
export function completionNudge2Email(opts: {
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providerCount?: number;
  city?: string;
  state?: string;
}): string {
  const percent = opts.completionPercent ?? 0;
  const missing = opts.missingFields ?? [];
  const missingSummary = missing.length <= 3
    ? missing.join(", ")
    : `${missing.slice(0, 3).join(", ")}, and ${missing.length - 3} more`;
  const locationText = opts.city || opts.state || "your area";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You're ${percent}% there — let's finish your profile</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${opts.providerCount ? `${opts.providerCount} providers in ${escapeHtml(locationText)} are looking for families like yours.` : `providers in ${escapeHtml(locationText)} are waiting to hear from you.`}
    </p>
    ${missing.length > 0 ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Still needed:</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">${missingSummary}</p>
    </div>
    ` : ""}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Complete profiles stand out — providers are more likely to reach out when they can see your full situation.
    </p>
    <div>${button("Complete Your Profile", opts.welcomeUrl)}</div>
  `);
}

/** Completion Nudge #3 (Day 6): Social proof, urgency */
export function completionNudge3Email(opts: {
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providerCount?: number;
  city?: string;
  state?: string;
}): string {
  const percent = opts.completionPercent ?? 0;
  const missing = opts.missingFields ?? [];
  const missingSummary = missing.length <= 3
    ? missing.join(", ")
    : `${missing.slice(0, 3).join(", ")}, and ${missing.length - 3} more`;
  const locationText = opts.city || opts.state || "your area";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families with complete profiles hear back 3x faster</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your profile is ${percent}% complete. ${opts.providerCount ? `${opts.providerCount} providers in ${escapeHtml(locationText)} are actively looking for new clients.` : `Providers in ${escapeHtml(locationText)} are actively looking for new clients.`}
    </p>
    ${missing.length > 0 ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Quick wins to complete:</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">${missingSummary}</p>
    </div>
    ` : ""}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A complete profile helps providers understand exactly how they can help you.
    </p>
    <div>${button("Complete Your Profile", opts.welcomeUrl)}</div>
  `);
}

/** Completion Nudge #4 (Day 13): Final push with specific providers */
export function completionNudge4Email(opts: {
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providers?: EmailProviderCard[];
  city?: string;
  state?: string;
}): string {
  const percent = opts.completionPercent ?? 0;
  const missing = opts.missingFields ?? [];
  const missingSummary = missing.length <= 3
    ? missing.join(", ")
    : `${missing.slice(0, 3).join(", ")}, and ${missing.length - 3} more`;
  const locationText = opts.city || opts.state || "your area";
  const providersHtml = opts.providers?.length ? providerCardsBlock(opts.providers) : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Top providers in ${escapeHtml(locationText)} are ready to help</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your profile is ${percent}% complete. Here are some highly-rated providers near you:
    </p>
    ${providersHtml}
    ${missing.length > 0 ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">To connect with these providers, add:</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">${missingSummary}</p>
    </div>
    ` : ""}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Complete your profile so these providers can understand your needs and reach out directly.
    </p>
    <div>${button("Complete Your Profile", opts.welcomeUrl)}</div>
  `);
}

// ── Profile Publish Sequence (4 active + 1 maintenance) ──────────

/** Publish Nudge #1 (Day 1 after complete): Benefits of publishing */
export function publishNudge1Email(opts: {
  familyName: string;
  matchesUrl: string;
  providerCount?: number;
  city?: string;
}): string {
  const cityText = opts.city || "your area";
  const countText = opts.providerCount ? `${opts.providerCount} ` : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Go live — let providers find you</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your profile looks great! ${countText}providers in ${escapeHtml(cityText)} are looking for families like yours.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.5;"><strong>When you go live:</strong></p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 24px;padding-left:20px;line-height:1.8;">
      <li>Providers can see your care needs and reach out directly</li>
      <li>You stay in control — respond only to providers you're interested in</li>
      <li>Get matched faster than searching on your own</li>
    </ul>
    <div>${button("Go Live Now", opts.matchesUrl)}</div>
  `);
}

/** Publish Nudge #2 (Day 5): Provider count, top rated */
export function publishNudge2Email(opts: {
  familyName: string;
  matchesUrl: string;
  providerCount?: number;
  providers?: EmailProviderCard[];
  city?: string;
}): string {
  const cityText = opts.city || "your area";
  const countText = opts.providerCount ? `${opts.providerCount} ` : "";
  const providersHtml = opts.providers?.length ? providerCardsBlock(opts.providers.slice(0, 3)) : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${countText}providers in ${escapeHtml(cityText)} are looking</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, providers are actively searching for families in ${escapeHtml(cityText)}. Here are a few who might reach out:
    </p>
    ${providersHtml}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Publish your profile to let them know you're looking for care.
    </p>
    <div>${button("Publish Your Profile", opts.matchesUrl)}</div>
  `);
}

/** Publish Nudge #3 (Day 6): Social proof with real connection stats */
export function publishNudge3Email(opts: {
  familyName: string;
  matchesUrl: string;
  familiesThisWeek?: number;
  familiesThisMonth?: number;
  providerCount?: number;
  city?: string;
  state?: string;
}): string {
  const locationText = opts.city || opts.state || "your area";

  // Build social proof line with real data
  let socialProof: string;
  if (opts.familiesThisWeek && opts.familiesThisWeek >= 5) {
    socialProof = `${opts.familiesThisWeek} families connected with providers this week on Olera.`;
  } else if (opts.familiesThisMonth && opts.familiesThisMonth >= 10) {
    socialProof = `${opts.familiesThisMonth} families found care this month on Olera.`;
  } else {
    socialProof = "Families like yours are connecting with care providers every day on Olera.";
  }

  const providerLine = opts.providerCount
    ? `${opts.providerCount} providers in ${locationText} are ready to help.`
    : `Providers in ${locationText} are waiting to hear from you.`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are finding care — you can too</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${socialProof}
    </p>
    <div style="background:#f0fdfa;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Your profile is complete.</strong> ${escapeHtml(providerLine)} The sooner you publish, the sooner you can start conversations.
      </p>
    </div>
    <div>${button("Publish and Start Connecting", opts.matchesUrl)}</div>
  `);
}

/** Publish Nudge #4 (Day 15): Soft touch, no pressure */
export function publishNudge4Email(opts: {
  familyName: string;
  matchesUrl: string;
  city?: string;
}): string {
  const cityText = opts.city || "your area";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">We're here when you're ready</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, we know finding care is a big decision. Take your time — your profile is ready and waiting whenever you are.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Providers in ${escapeHtml(cityText)} are still looking for families. When you're ready to connect, just click below.
    </p>
    <div>${button("Go Live When Ready", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? Reply to this email — we're happy to help.
    </p>
  `);
}

// ── Maintenance Phase (monthly, fresh content) ──────────

/** Maintenance email for incomplete profiles — new providers added */
export function completionMaintenanceEmail(opts: {
  familyName: string;
  welcomeUrl: string;
  providers?: EmailProviderCard[];
  newProviderCount?: number;
  missingFields?: string[];
  completionPercent?: number;
  city?: string;
  state?: string;
}): string {
  const percent = opts.completionPercent ?? 0;
  const missing = opts.missingFields ?? [];
  const missingSummary = missing.length <= 3
    ? missing.join(", ")
    : `${missing.slice(0, 3).join(", ")}, and ${missing.length - 3} more`;
  const locationText = opts.city || opts.state || "your area";
  const newText = opts.newProviderCount
    ? `${opts.newProviderCount} new providers joined Olera in ${locationText} this month.`
    : `New providers have joined Olera in ${locationText}.`;
  const providersHtml = opts.providers?.length ? providerCardsBlock(opts.providers) : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">New providers in ${escapeHtml(locationText)}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${escapeHtml(newText)} Your profile is ${percent}% complete — finish it to connect.
    </p>
    ${missing.length > 0 ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Still needed:</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">${missingSummary}</p>
    </div>
    ` : ""}
    ${providersHtml}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Complete your profile to see all available providers and start connecting.
    </p>
    <div>${button("Complete Your Profile", opts.welcomeUrl)}</div>
  `);
}

/** Maintenance email for unpublished profiles — updated stats */
export function publishMaintenanceEmail(opts: {
  familyName: string;
  matchesUrl: string;
  providerCount?: number;
  familiesConnectedThisMonth?: number;
  city?: string;
  state?: string;
}): string {
  const locationText = opts.city || opts.state || "your area";
  const statsLine = opts.familiesConnectedThisMonth
    ? `${opts.familiesConnectedThisMonth} families found care in ${locationText} this month.`
    : `Families are connecting with providers in ${locationText} every day.`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Still looking for care?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${escapeHtml(statsLine)}
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your profile is ready — publish it to let providers know you're looking.${opts.providerCount ? ` There are ${opts.providerCount} providers in ${escapeHtml(locationText)} waiting to connect.` : ""}
    </p>
    <div>${button("Publish Your Profile", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      No longer looking for care? <a href="${BASE_URL}/portal/settings" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from updates</a>
    </p>
  `);
}

/** Email sent to clients requesting they leave a review for a provider */
export function reviewRequestEmail(opts: {
  clientName: string;
  providerName: string;
  customMessage: string;
  reviewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${escapeHtml(opts.providerName)} would love your feedback</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.clientName, "there")},
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.customMessage)}</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Sharing your experience helps other families find quality care — and only takes a couple of minutes.
    </p>
    <div>${button("Write a review", opts.reviewUrl)}</div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      This email was sent on behalf of ${escapeHtml(opts.providerName)} via Olera.
    </p>
  `);
}

/** Care report email — sent to families after connection request (the anti-APFM differentiator) */
export function careReportEmail(opts: {
  seekerFirstName: string;
  providerName: string;
  providerSlug: string;
  careTypeLabel: string | null;
  pricingRange: string | null;
  pricingDescription: string | null;
  city: string | null;
  state: string | null;
  fundingOptions: { label: string; savings: string | null }[];
  similarProviders: { name: string; slug: string; priceRange: string | null }[];
}): string {
  const greeting = `Hi ${firstName(opts.seekerFirstName || "", "there")}`;

  const locationStr = [opts.city, opts.state].filter(Boolean).join(", ");
  const careLabel = opts.careTypeLabel || "senior care";

  const pricingSection = opts.pricingRange
    ? `
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Typical range for ${careLabel}${locationStr ? ` in ${locationStr}` : ""}</p>
      <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">${opts.pricingRange}</p>
      ${opts.pricingDescription ? `<p style="font-size:13px;color:#6b7280;margin:0;line-height:1.5;">${opts.pricingDescription}</p>` : ""}
      <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Actual costs vary based on care level and services needed.</p>
    </div>`
    : "";

  const fundingSection = opts.fundingOptions.length > 0
    ? `
    <div style="margin:20px 0;">
      <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 8px;">Ways to pay for care</p>
      ${opts.fundingOptions.map((f) => `
        <p style="font-size:13px;color:#374151;margin:0 0 4px;line-height:1.5;">
          &bull; <strong>${f.label}</strong>${f.savings ? ` <span style="color:#6b7280;">(saves ${f.savings}/mo)</span>` : ""}
        </p>
      `).join("")}
      <div style="margin:12px 0 0;">${button("Check your eligibility", `${BASE_URL}/benefits/finder`)}</div>
    </div>`
    : "";

  const similarSection = opts.similarProviders.length > 0
    ? `
    <div style="margin:24px 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 12px;">Similar providers${locationStr ? ` in ${locationStr}` : ""}</p>
      ${opts.similarProviders.map((p) => `
        <div style="margin:0 0 8px;">
          <a href="${BASE_URL}/provider/${p.slug}" style="font-size:14px;color:${BRAND_COLOR};font-weight:500;text-decoration:none;">${p.name}</a>
          ${p.priceRange ? `<span style="font-size:12px;color:#6b7280;margin-left:8px;">${p.priceRange}</span>` : ""}
        </div>
      `).join("")}
    </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Here's what we found</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      ${greeting}, we've sent your request to <strong>${escapeHtml(opts.providerName)}</strong>. In the meantime, here's some information to help you get started.
    </p>
    ${pricingSection}
    ${fundingSection}
    ${similarSection}
    <div style="margin:24px 0 0;">${button("View your inbox", `${BASE_URL}/portal/inbox`)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;line-height:1.5;">
      Questions? Just reply to this email — a real person will get back to you.
    </p>
  `, "We found pricing and funding options to help you.");
}

// ── MedJobs Interview Emails ──────────────────────────────────────

/** Confirmation email sent to provider after scheduling an interview (unauthenticated flow) */
export function interviewRequestEmail(opts: {
  providerName: string;
  studentName: string;
  interviewType: string;
  dateTime: string;
  notes: string | null;
  magicLinkUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your interview request was sent</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${firstName(opts.providerName, "there")}, your interview request to <strong>${escapeHtml(opts.studentName)}</strong> has been delivered. You'll be notified when they respond.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;">Interview Details</p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>Format:</strong> ${escapeHtml(opts.interviewType)}
      </p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>When:</strong> ${escapeHtml(opts.dateTime)}
      </p>
      ${opts.notes ? `<p style="font-size:14px;color:#374151;margin:0;line-height:1.5;"><strong>Notes:</strong> ${escapeHtml(opts.notes)}</p>` : ""}
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Click below to manage your interview and complete your profile on Olera MedJobs.
    </p>
    <div style="margin:24px 0;">${button("View Interview", opts.magicLinkUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      This link expires in 72 hours. If you have any questions, just reply to this email.
    </p>
  `);
}
/** Email to provider when they request to claim an existing listing */
export function claimVerificationEmail(opts: {
  providerName: string;
  verifyUrl: string;
  providerSlug?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email to manage ${escapeHtml(opts.providerName)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      Click the button below to verify your email and start managing your listing on Olera.
    </p>
    <div style="margin:0 0 24px;">${button("Manage Your Listing", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      This link expires in 72 hours. If you didn't request this, you can safely ignore this email.
    </p>
    ${offRampBlock(opts.providerSlug)}
  `);
}

/** Email to provider when they create a new organization on Olera */
export function signupVerificationEmail(opts: {
  orgName: string;
  verifyUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email to set up ${escapeHtml(opts.orgName)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      You're one step away from setting up your organization on Olera and connecting with families looking for care.
    </p>
    <div style="margin:0 0 24px;">${button("Set Up Your Page", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      This link expires in 72 hours. If you didn't request this, you can safely ignore this email.
    </p>
  `);
}

// ── Provider weekly analytics digest ────────────────────────────
// Phase 1D of the provider analytics initiative. Tier-aware copy; warm,
// restrained voice. The return path that makes analytics a habit rather
// than a moment.

interface DigestOpts {
  providerName: string;
  providerSlug: string;
  tier: "low" | "medium" | "high";
  viewsThisWeek: number;
  viewsPriorWeek: number;
  deltaPct: number | null;
  localDemand: number | null;
  city: string | null;
  category: string | null;
  ctaClicks: number;
  leadsReceived: number;
  questionsReceived: number;
  topSource: string | null;
  /**
   * When present, the digest leads with this unanswered question + a one-click
   * answer button. Pass alongside `answerUrl`. Set both to switch the email
   * into the demand-led variant; leave both null/omitted for the analytics-only
   * variant (existing behavior, unchanged).
   */
  unansweredQuestion?: { id: string; question: string; totalCount: number } | null;
  /** Pre-built one-click answer URL from generateNotificationUrl(). Required when unansweredQuestion is set. */
  answerUrl?: string | null;
  /** City+state-level page-view count this week (category-agnostic). Powers the
   *  demand-led email's no-views fallback line. Null when unknown. */
  areaDemand?: number | null;
}


function humanCategoryLabel(category: string | null): string {
  if (!category) return "care";
  const map: Record<string, string> = {
    assisted_living: "assisted living",
    memory_care: "memory care",
    nursing_home: "nursing homes",
    home_care_agency: "home care",
    home_health_care: "home health care",
    independent_living: "independent living",
  };
  return map[category] ?? category.replace(/_/g, " ");
}

function digestHeadline(opts: DigestOpts): string {
  const n = opts.viewsThisWeek;
  if (opts.tier === "low") {
    if (opts.localDemand && opts.localDemand > 0) {
      return `${opts.localDemand} ${opts.localDemand === 1 ? "family" : "families"} searched your area this week`;
    }
    if (n > 0) {
      return `${n} ${n === 1 ? "family" : "families"} viewed your page this week`;
    }
    return `Your page on Olera this week`;
  }
  return `${n} ${n === 1 ? "family" : "families"} viewed your page this week`;
}

function digestLead(opts: DigestOpts): string {
  const parts: string[] = [];
  if (opts.deltaPct !== null && Number.isFinite(opts.deltaPct)) {
    if (opts.deltaPct > 0) parts.push(`Up ${opts.deltaPct}% vs. last week.`);
    else if (opts.deltaPct < 0) parts.push(`Down ${Math.abs(opts.deltaPct)}% vs. last week.`);
    else parts.push(`Flat vs. last week.`);
  }
  if (opts.tier === "high" && opts.topSource) {
    parts.push(`Top source: ${opts.topSource}.`);
  } else if (opts.tier === "low" && opts.localDemand && opts.localDemand > opts.viewsThisWeek) {
    const cat = humanCategoryLabel(opts.category);
    const where = opts.city ? ` near ${opts.city}` : " in your area";
    parts.push(`${opts.localDemand.toLocaleString()} families searched for ${cat}${where}.`);
  }
  return parts.join(" ");
}

/**
 * Demand-led variant of the weekly digest. Leads with the newest unanswered
 * question + a one-click answer button. Optional page-views line below when
 * the provider has real traffic this week (never deflates -- below the bar,
 * we just don't mention views).
 */
function providerDemandDigestEmail(
  opts: DigestOpts,
  q: { id: string; question: string; totalCount: number },
  answerUrl: string,
): string {
  const analyticsUnsubUrl = `${BASE_URL}/unsubscribe/${opts.providerSlug}?type=analytics_digest`;
  const safeQuestion = escapeHtml(q.question);
  const safeCity = opts.city ? escapeHtml(opts.city) : null;
  const leadStyle = `font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;`;

  // The lead line in priority order. View number never deflates -- below the
  // bar worth mentioning we use the area signal; with neither, the question
  // itself carries the email. AREA_BAR keeps "2 families looked at care in
  // Smalltown" out -- below it, fall to the plain city anchor.
  const AREA_BAR = 5;
  let viewLead: string;
  if (opts.viewsThisWeek > 0) {
    viewLead = `<p style="${leadStyle}">Your page got ${opts.viewsThisWeek.toLocaleString()} ${opts.viewsThisWeek === 1 ? "visit" : "visits"} this week, and a family asked you this:</p>`;
  } else if (opts.areaDemand && opts.areaDemand >= AREA_BAR) {
    const where = safeCity ? ` in ${safeCity}` : "";
    viewLead = `<p style="${leadStyle}">${opts.areaDemand.toLocaleString()} families looked at senior care${where} this week. One of them asked you this:</p>`;
  } else if (safeCity) {
    viewLead = `<p style="${leadStyle}">A family looking at care near ${safeCity} asked you this:</p>`;
  } else {
    viewLead = `<p style="${leadStyle}">A family on Olera asked you this:</p>`;
  }

  const moreCount = q.totalCount - 1;
  const moreCountLine =
    moreCount > 0
      ? `<p style="font-size:13px;color:#9ca3af;margin:0 0 24px;line-height:1.5;">${moreCount} more ${moreCount === 1 ? "question is" : "questions are"} also waiting on your page.</p>`
      : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 12px;line-height:1.3;">A family has a question about ${escapeHtml(opts.providerName)}</h1>
    ${viewLead}
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:15px;color:#111827;margin:0;line-height:1.5;font-style:italic;">&ldquo;${safeQuestion}&rdquo;</p>
    </div>
    ${moreCountLine}
    <div>${button("View and respond", answerUrl)}</div>
    <p style="font-size:13px;color:#6b7280;margin:24px 0 0;line-height:1.5;">Answering helps families see your expertise and builds trust with people actively looking for care.</p>
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">${secondaryLink("Stop these weekly digests", analyticsUnsubUrl)}</p>
    </div>
  `);
}

/**
 * Provider weekly digest — Monday morning return path.
 *
 * Two variants share this entry point:
 *   1. Demand-led (when `unansweredQuestion` + `answerUrl` are set): leads
 *      with the newest open question and a one-click answer button. This
 *      is the audience-expansion path -- ~2,700 providers with backlog.
 *   2. Analytics-only (default): the original tier-aware analytics digest.
 */
export function providerWeeklyDigestEmail(opts: DigestOpts): string {
  if (opts.unansweredQuestion && opts.answerUrl) {
    return providerDemandDigestEmail(opts, opts.unansweredQuestion, opts.answerUrl);
  }

  const headline = digestHeadline(opts);
  const lead = digestLead(opts);
  const dashboardUrl = `${BASE_URL}/provider`;
  const analyticsUnsubUrl = `${BASE_URL}/unsubscribe/${opts.providerSlug}?type=analytics_digest`;

  // Micro-stats row: only include cells with non-zero values to keep it warm.
  const microStats: string[] = [];
  if (opts.viewsThisWeek > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.viewsThisWeek.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">Page views</div></div>`,
    );
  }
  if (opts.ctaClicks > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.ctaClicks.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">CTA clicks</div></div>`,
    );
  }
  if (opts.questionsReceived > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.questionsReceived.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">Questions</div></div>`,
    );
  }
  if (opts.leadsReceived > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.leadsReceived.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">Leads</div></div>`,
    );
  }

  const microStatsBlock =
    microStats.length > 0
      ? `<div style="display:flex;gap:12px;background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 24px;">${microStats.join("")}</div>`
      : "";

  return layout(`
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Your week on Olera</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">${headline}</h1>
    ${lead ? `<p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">${lead}</p>` : ""}
    ${microStatsBlock}
    <div>${button("See your full analytics", dashboardUrl)}</div>
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">${secondaryLink("Stop these weekly digests", analyticsUnsubUrl)}</p>
    </div>
  `);
}

// ── Provider Verification Emails ──────────────────────────────────

/** Email sent when provider verification is approved (auto or manual) */
export function verificationApprovedEmail(opts: {
  providerName: string;
  recipientName: string;
  dashboardUrl: string;
  autoApproved?: boolean;
}): string {
  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;">
          <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">✓</td></tr>
        </table>
      </td></tr>
    </table>
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">You're verified</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
      ${firstName(opts.recipientName, "Hi")}, your connection to <strong>${escapeHtml(opts.providerName)}</strong> has been verified. You now have full access to your dashboard.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">With verification complete, you can:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 24px;padding-left:20px;line-height:1.8;">
      <li>Edit your listing with photos & pricing</li>
      <li>Respond to family inquiries</li>
      <li>Hire caregivers</li>
      <li>View your profile analytics</li>
    </ul>
    <div style="text-align:center;">${button("Go to Dashboard", opts.dashboardUrl)}</div>
  `);
}

/** Email sent when verification is submitted and routed to manual review */
export function verificationPendingReviewEmail(opts: {
  providerName: string;
  recipientName: string;
  dashboardUrl: string;
}): string {
  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#fef3c7;border-radius:50%;">
          <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">👀</td></tr>
        </table>
      </td></tr>
    </table>
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">We're reviewing your verification</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
      ${firstName(opts.recipientName, "Hi")}, thanks for submitting your verification for <strong>${escapeHtml(opts.providerName)}</strong>.
    </p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#92400e;margin:0;line-height:1.5;">
        <strong>What happens next:</strong> Our team will review your submission and get back to you within 3 hours during business hours (Mon–Fri, 9am–6pm ET).
      </p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      In the meantime, you can still access your dashboard — some features may be limited until verification is complete.
    </p>
    <div style="text-align:center;">${button("View Dashboard", opts.dashboardUrl)}</div>
  `);
}

/** Email sent 7 days after claim if provider hasn't verified */
export function verificationReminder7DayEmail(opts: {
  providerName: string;
  recipientName: string;
  verifyUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are looking for ${escapeHtml(opts.providerName)}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${firstName(opts.recipientName, "there")}, you claimed ${escapeHtml(opts.providerName)} on Olera a week ago but haven't completed verification yet.
    </p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#92400e;margin:0;line-height:1.5;">
        <strong>Why verify?</strong> Verified providers can respond to family inquiries, update their listing, and access full analytics.
      </p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Verification takes less than 2 minutes — just provide your LinkedIn profile or business website.
    </p>
    <div style="text-align:center;">${button("Complete Verification", opts.verifyUrl)}</div>
  `);
}

/** Email sent 21 days after claim if provider still hasn't verified (final warning) */
export function verificationReminder21DayEmail(opts: {
  providerName: string;
  recipientName: string;
  verifyUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Final reminder: Verify ${escapeHtml(opts.providerName)}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${firstName(opts.recipientName, "there")}, this is a final reminder to complete verification for ${escapeHtml(opts.providerName)}.
    </p>
    <div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#991b1b;margin:0;line-height:1.5;">
        <strong>Action required:</strong> Unverified claims may be released after 30 days so others can claim the listing.
      </p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Complete verification now to keep your claim and unlock full access to your provider dashboard.
    </p>
    <div style="text-align:center;">${button("Verify Now", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;text-align:center;">
      Questions? Reply to this email or contact <a href="mailto:support@olera.care" style="color:${BRAND_COLOR};">support@olera.care</a>
    </p>
  `);
}

/** Email sent when verification is rejected with reason */
export function verificationRejectedEmail(opts: {
  providerName: string;
  recipientName: string;
  reason: string;
  resubmitUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verification needs more info</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      ${firstName(opts.recipientName, "Hi")}, we couldn't verify your connection to <strong>${escapeHtml(opts.providerName)}</strong> with the information provided.
    </p>
    <div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#991b1b;margin:0 0 4px;font-weight:600;">Reason:</p>
      <p style="font-size:14px;color:#7f1d1d;margin:0;line-height:1.5;">${escapeHtml(opts.reason)}</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Please resubmit with updated information. Make sure your LinkedIn profile or business website clearly shows your connection to the organization.
    </p>
    <div>${button("Resubmit Verification", opts.resubmitUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Questions? Reply to this email or contact <a href="mailto:support@olera.care" style="color:${BRAND_COLOR};">support@olera.care</a>
    </p>
  `);
}

/**
 * Nudge email sent by admin to remind a provider about an unanswered lead.
 * Similar to connectionRequestEmail but framed as a reminder.
 */
export function providerNudgeEmail(opts: {
  providerName: string;
  familyName: string;
  messagePreview: string | null;
  daysSinceInquiry: number;
  viewUrl: string;
  providerSlug?: string;
}): string {
  const daysText =
    opts.daysSinceInquiry === 1
      ? "1 day"
      : opts.daysSinceInquiry < 1
        ? "less than a day"
        : `${opts.daysSinceInquiry} days`;

  const messageBlock = opts.messagePreview
    ? `<div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.messagePreview)}"</p>
      </div>`
    : "";

  return layout(
    `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family is waiting to hear from you</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      <strong>${firstName(opts.familyName)}</strong> reached out to ${escapeHtml(opts.providerName)} ${daysText} ago and hasn't received a response yet.
    </p>
    ${messageBlock}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A timely response makes all the difference for families navigating care decisions. Even a brief acknowledgment helps families feel supported.
    </p>
    <div>${button("View & Respond", opts.viewUrl)}</div>
    ${offRampBlock(opts.providerSlug)}
  `,
    `${firstName(opts.familyName)} is waiting for a response from ${escapeHtml(opts.providerName)}`
  );
}

/**
 * Consolidated nudge email for providers with multiple waiting leads.
 * Lists all families waiting for a response in a single email.
 */
export function providerMultiLeadNudgeEmail(opts: {
  providerName: string;
  leads: Array<{
    familyName: string;
    daysSinceInquiry: number;
  }>;
  viewUrl: string;
  providerSlug?: string;
}): string {
  const leadCount = opts.leads.length;
  const headline =
    leadCount === 1
      ? "A family is waiting to hear from you"
      : `${leadCount} families are waiting to hear from you`;

  const leadsHtml = opts.leads
    .map((lead) => {
      const daysText =
        lead.daysSinceInquiry === 1
          ? "1 day ago"
          : lead.daysSinceInquiry < 1
            ? "today"
            : `${lead.daysSinceInquiry} days ago`;
      return `<li style="margin:0 0 8px;padding:0;"><strong>${firstName(lead.familyName)}</strong> <span style="color:#9ca3af;">· reached out ${daysText}</span></li>`;
    })
    .join("");

  return layout(
    `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${headline}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      The following ${leadCount === 1 ? "family has" : "families have"} reached out to ${escapeHtml(opts.providerName)} and ${leadCount === 1 ? "hasn't" : "haven't"} received a response yet:
    </p>
    <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
      ${leadsHtml}
    </ul>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A timely response makes all the difference for families navigating care decisions. Even a brief acknowledgment helps families feel supported.
    </p>
    <div>${button("View & Respond", opts.viewUrl)}</div>
    ${offRampBlock(opts.providerSlug)}
  `,
    `${leadCount} ${leadCount === 1 ? "family is" : "families are"} waiting for a response from ${escapeHtml(opts.providerName)}`
  );
}

/**
 * Nudge email sent by admin to encourage a family to complete their profile.
 * Explains that a complete profile helps providers respond better.
 */
export function familyNudgeEmail(opts: {
  familyName: string;
  providerName: string;
  missingFields: string[];
  completionPercent: number;
  profileUrl: string;
}): string {
  const missingSummary =
    opts.missingFields.length <= 3
      ? opts.missingFields.join(", ")
      : `${opts.missingFields.slice(0, 3).join(", ")}, and ${opts.missingFields.length - 3} more`;

  return layout(
    `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Help ${escapeHtml(opts.providerName)} serve you better</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, you recently reached out to <strong>${escapeHtml(opts.providerName)}</strong> about care options.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      To help them respond with the most relevant information, we recommend completing your profile. Right now it's ${opts.completionPercent}% complete.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Missing information:</p>
      <p style="font-size:14px;color:#6b7280;margin:0;">${missingSummary}</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A complete profile helps providers understand your needs and give you personalized recommendations.
    </p>
    <div>${button("Complete Your Profile", opts.profileUrl)}</div>
  `,
    `Complete your profile to help ${escapeHtml(opts.providerName)} respond to your inquiry`
  );
}

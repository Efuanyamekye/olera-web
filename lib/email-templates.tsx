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

function layout(body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:${FONT_STACK};">
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

/** Email to provider when a family sends a connection request */
export function connectionRequestEmail(opts: {
  providerName: string;
  familyName: string;
  careType: string | null;
  message: string | null;
  viewUrl: string;
}): string {
  const careLine = opts.careType
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 8px;"><strong>Care type:</strong> ${opts.careType}</p>`
    : "";
  const messageLine = opts.message
    ? `<div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">${opts.message}</p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">New care inquiry</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      <strong>${opts.familyName}</strong> is looking for care and reached out to <strong>${opts.providerName}</strong> on Olera.
    </p>
    ${careLine}
    ${messageLine}
    <div style="margin:24px 0 0;">${button("View request", opts.viewUrl)}</div>
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
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 24px;"><strong>Care type:</strong> ${opts.careType}</p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your inquiry was sent</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, your care inquiry to <strong>${opts.providerName}</strong> has been delivered. You'll be notified when they respond.
    </p>
    ${careLine}
    <div>${button("View your inbox", opts.viewUrl)}</div>
  `);
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
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 8px;"><strong>Care type:</strong> ${opts.careType}</p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You're connected with ${opts.providerName}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, your care inquiry has been delivered. Click below to view your inbox and continue the conversation.
    </p>
    ${careLine}
    <div style="margin:24px 0;">${button("View Inbox & Sign In", opts.magicLinkUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      You'll be signed in automatically when you click the button. This link expires in 1 hour.
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
  const statusText = opts.accepted
    ? `Great news — <strong>${opts.providerName}</strong> has accepted your care inquiry.`
    : `<strong>${opts.providerName}</strong> is unable to take on new clients at this time.`;

  const ctaLabel = opts.accepted ? "View conversation" : "Browse other providers";
  const ctaUrl = opts.accepted ? opts.viewUrl : `${BASE_URL}/browse`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Update on your inquiry</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${opts.familyName}, ${statusText}
    </p>
    <div>${button(ctaLabel, ctaUrl)}</div>
  `);
}

/** Email when a new message is sent in a connection thread */
export function newMessageEmail(opts: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">New message</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      <strong>${opts.senderName}</strong> sent you a message on Olera.
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">${opts.messagePreview}</p>
    </div>
    <div>${button("Reply", opts.viewUrl)}</div>
  `);
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
      <strong>${opts.providerName}</strong> was just claimed on Olera.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
      <strong>Claimed by:</strong> ${opts.claimedByEmail}
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
        Congratulations — <strong>${opts.providerName}</strong> has been verified and is now live on Olera.
        Families in your area can find you and reach out directly.
      </p>
      <div>${button("View your listing", opts.listingUrl)}</div>
    `);
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your claim needs attention</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      We were unable to verify the claim for <strong>${opts.providerName}</strong>.
      This is usually due to missing or mismatched information. Please reach out so we can help resolve it.
    </p>
    <div>${button("Contact support", "mailto:support@olera.care")}</div>
  `);
}

/** Email to provider when their identity verification is approved or rejected */
export function verificationDecisionEmail(opts: {
  providerName: string;
  approved: boolean;
  listingUrl: string;
}): string {
  if (opts.approved) {
    return layout(`
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your profile is now verified!</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Great news — <strong>${opts.providerName}</strong> has been verified on Olera.
        Your profile now displays a verified badge, helping families trust your listing.
      </p>
      <div>${button("View your profile", opts.listingUrl)}</div>
    `);
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verification needs attention</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      We were unable to verify the identity documents submitted for <strong>${opts.providerName}</strong>.
      This may be due to unclear images or mismatched information. Please resubmit your documents or reach out for help.
    </p>
    <div>${button("Contact support", "mailto:support@olera.care")}</div>
  `);
}

/** Email to provider when they receive a new review */
export function newReviewEmail(opts: {
  providerName: string;
  reviewerName: string;
  rating: number;
  comment: string;
  viewUrl: string;
}): string {
  // Generate star rating display
  const stars = "★".repeat(opts.rating) + "☆".repeat(5 - opts.rating);

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You received a new review!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      <strong>${opts.reviewerName}</strong> left a review for <strong>${opts.providerName}</strong> on Olera.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="font-size:20px;color:#f59e0b;margin:0 0 12px;letter-spacing:2px;">${stars}</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6;">"${opts.comment}"</p>
    </div>
    <div>${button("View review", opts.viewUrl)}</div>
  `);
}

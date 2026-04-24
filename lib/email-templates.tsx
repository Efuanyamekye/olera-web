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

/** "Maria Johnson" → "Maria" / "Anonymous" → "Someone" / "A family" → "A family" */
function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first.toLowerCase() === "anonymous" ? "Someone" : first;
}

function secondaryLink(label: string, href: string): string {
  return `<a href="${href}" style="color:#9ca3af;text-decoration:underline;font-size:13px;">${label}</a>`;
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
      Hi ${opts.recipientName}, use this code to verify your connection to <strong>${opts.businessName}</strong> on Olera:
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
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 20px;"><strong>Care type:</strong> ${opts.careType}</p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family is looking for care from ${opts.providerName}</h1>
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

/** Email to verify email address after instant account creation */
export function verifyEmailEmail(opts: {
  familyName: string;
  providerName: string;
  verifyUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, you're connected with <strong>${opts.providerName}</strong> on Olera.
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
  providerSlug?: string;
}): string {
  // Generate star rating display
  const stars = "★".repeat(opts.rating) + "☆".repeat(5 - opts.rating);

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${firstName(opts.reviewerName)} left a review for ${opts.providerName}</h1>
    ${trustIntro()}
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 20px;">
      <p style="font-size:20px;color:#f59e0b;margin:0 0 12px;letter-spacing:2px;">${stars}</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6;">"${opts.comment}"</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">Reviews help families make confident decisions about care — and yours is getting noticed.</p>
    <div>${button("View your review", opts.viewUrl)}</div>
    ${offRampBlock(opts.providerSlug)}
  `);
}

/** Email to provider when someone asks a question on their page */
export function questionReceivedEmail(opts: {
  providerName: string;
  askerName: string;
  question: string;
  providerUrl: string;
  providerSlug?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family has a question about ${opts.providerName}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      <strong>${firstName(opts.askerName)}</strong> is researching care options and asked:
    </p>
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:15px;color:#111827;margin:0;line-height:1.5;font-style:italic;">&ldquo;${opts.question}&rdquo;</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">A thoughtful answer helps families see your expertise and builds trust with people actively looking for care.</p>
    <div>${button("View and respond", opts.providerUrl)}</div>
    ${offRampBlock(opts.providerSlug)}
  `);
}

/** Email to asker when their question is answered */
export function questionAnsweredEmail(opts: {
  askerName: string;
  providerName: string;
  question: string;
  answer: string;
  providerUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${opts.providerName} responded</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.askerName}, your question on Olera has been answered.
    </p>
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your question</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">${opts.question}</p>
    </div>
    <div style="background:#f0fdfa;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:13px;color:${BRAND_COLOR};margin:0 0 6px;font-weight:600;">${opts.providerName}</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">${opts.answer}</p>
    </div>
    <div>${button("View on Olera", opts.providerUrl)}</div>
  `);
}

/** Confirmation email to guest after they enrich a Q&A question with their email */
export function questionConfirmationEmail(opts: {
  askerName: string;
  providerName: string;
  question: string;
  providerUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your question was posted</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.askerName}, your question to <strong>${opts.providerName}</strong> is live on Olera. We'll email you when they respond.
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">${opts.question}</p>
    </div>
    <div>${button("View on Olera", opts.providerUrl)}</div>
  `);
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
      Hi ${opts.familyName}, great news — qualified care providers in ${opts.city} can now find you on Olera.
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
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${opts.message}"</p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A provider in ${opts.city} is interested</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, <strong>${opts.providerName}</strong> in ${opts.city} saw your care profile and wants to connect.
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
      Hi ${opts.familyName}, you've reached out to ${opts.unansweredCount} providers but haven't heard back yet.
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are searching in ${opts.city}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${opts.providerName}, families in ${opts.city} are looking for care providers on Olera — but your profile isn't ready yet.
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
      <strong>${opts.familyName}</strong> accepted your reach-out on Olera. You can now message each other directly.
    </p>
    <div>${button("View conversation", opts.viewUrl)}</div>
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
      For <strong>${opts.programName}</strong> in ${opts.stateName}
    </p>
    <p style="font-size:14px;color:${BRAND_COLOR};font-weight:600;margin:0 0 24px;">
      ${checkedCount} of ${totalItems} documents gathered
    </p>
    ${categoriesHtml}
    <div style="background:#f0fdfa;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Next step:</strong> Once you've gathered all documents, visit the ${opts.programShortName} page on Olera to start your application.
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
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome to Olera</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, thanks for joining Olera — where families find trusted senior care providers.
    </p>
    <p style="font-size:15px;color:#6b7280;margin:0 0 8px;line-height:1.5;">Here's what you can do:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 24px;padding-left:20px;line-height:1.8;">
      <li><strong>Browse providers</strong> in your area</li>
      <li><strong>Complete your profile</strong> so providers can reach out to you</li>
      <li><strong>Go live on Matches</strong> and let qualified providers come to you</li>
    </ul>
    <div>${button("Browse care providers", opts.browseUrl)}</div>
  `);
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${countText} providers in ${cityText} are looking for families like yours</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, your care profile is looking great. Activate Matches and let providers in your area reach out to you directly.
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
      Hi ${opts.familyName}, ${body}
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Top-rated providers in ${opts.city} for you</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, we found some highly-rated care providers in ${opts.city} that match what you're looking for.
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">How was your experience with ${opts.providerName}?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, you connected with ${opts.providerName} on Olera about a month ago. We'd love to hear how it went.
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families in ${opts.state} are finding care on Olera</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.familyName}, finding the right care takes time — and we're here when you're ready. Here are some providers other families are connecting with:
    </p>
    ${providerCardsBlock(opts.providers)}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Whenever you're ready, Olera makes it easy to compare providers, read reviews, and connect directly.
    </p>
    <div>${button("Browse providers near you", opts.browseUrl)}</div>
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${opts.providerName} would love your feedback</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.clientName)},
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6;white-space:pre-wrap;">${opts.customMessage}</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Sharing your experience helps other families find quality care — and only takes a couple of minutes.
    </p>
    <div>${button("Write a review", opts.reviewUrl)}</div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      This email was sent on behalf of ${opts.providerName} via Olera.
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
  const greeting = opts.seekerFirstName
    ? `Hi ${firstName(opts.seekerFirstName)}`
    : "Hi there";

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
    <p style="font-size:16px;font-weight:600;color:#111827;margin:0 0 8px;">${greeting},</p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
      We've sent your request to <strong>${opts.providerName}</strong>. Here's what we found to help you get started:
    </p>
    ${pricingSection}
    ${fundingSection}
    ${similarSection}
    <div style="margin:24px 0 0;">${button("View your inbox", `${BASE_URL}/portal/inbox`)}</div>
    <p style="font-size:13px;color:#6b7280;margin:16px 0 0;line-height:1.5;">
      Have questions? Just reply to this email — a real person will get back to you.
    </p>
  `);
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
      Hi ${opts.providerName}, your interview request to <strong>${opts.studentName}</strong> has been delivered. You'll be notified when they respond.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;">Interview Details</p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>Format:</strong> ${opts.interviewType}
      </p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>When:</strong> ${opts.dateTime}
      </p>
      ${opts.notes ? `<p style="font-size:14px;color:#374151;margin:0;line-height:1.5;"><strong>Notes:</strong> ${opts.notes}</p>` : ""}
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email to manage ${opts.providerName}</h1>
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email to set up ${opts.orgName}</h1>
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
 * Provider weekly analytics digest — Monday morning return path.
 */
export function providerWeeklyDigestEmail(opts: DigestOpts): string {
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
      ${opts.recipientName}, your connection to <strong>${opts.providerName}</strong> has been verified. You now have full access to your dashboard.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">With verification complete, you can:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 24px;padding-left:20px;line-height:1.8;">
      <li>Respond to family inquiries</li>
      <li>View your profile analytics</li>
      <li>Update your listing information</li>
      <li>Manage your team members</li>
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
      ${opts.recipientName}, thanks for submitting your verification for <strong>${opts.providerName}</strong>.
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are looking for ${opts.providerName}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${opts.recipientName}, you claimed ${opts.providerName} on Olera a week ago but haven't completed verification yet.
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
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Final reminder: Verify ${opts.providerName}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${opts.recipientName}, this is a final reminder to complete verification for ${opts.providerName}.
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
      ${opts.recipientName}, we couldn't verify your connection to <strong>${opts.providerName}</strong> with the information provided.
    </p>
    <div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#991b1b;margin:0 0 4px;font-weight:600;">Reason:</p>
      <p style="font-size:14px;color:#7f1d1d;margin:0;line-height:1.5;">${opts.reason}</p>
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

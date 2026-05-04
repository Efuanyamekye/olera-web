/**
 * Staffing Outreach email templates — plain HTML strings.
 *
 * Two templates ship in PR 2:
 *   - preCallEmail        admin team's permission ask, before the call
 *   - postConsentStep1    Logan's full pitch, fired on "Add & Send"
 *
 * Logan-voice: short, direct, no marketing language. Subjects are plain.
 *
 * Steps 2-5, the welcome email, and the new-student trigger email
 * land in PR 3 with the sequence engine.
 */

const BRAND_COLOR = "#198087";
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

// ── Sender display names (display name only — actual address is noreply) ──

export const SENDER_OLERA_TEAM = "Olera Team <noreply@olera.care>";
export const SENDER_LOGAN = "Dr. Logan DuBose <noreply@olera.care>";

// ── Layout helpers (mirrors lib/email-templates.tsx style) ───────────────

function preheader(text: string): string {
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

function layout(body: string, preheaderText?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:${FONT_STACK};">
  ${preheader(preheaderText ?? "")}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:520px;width:100%;">
        <tr><td style="padding:24px 32px 8px;">
          <span style="font-size:18px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.3px;">Olera</span>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;color:#111827;font-size:15px;line-height:1.6;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">
            &copy; ${new Date().getFullYear()} Olera, Inc. &middot;
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
  return `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;padding:12px 24px;background:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a></p>`;
}

function videoEmbed(youtubeUrl: string, label = "Watch the 90-second program overview"): string {
  // Extract video ID from common YouTube URL formats
  const match = youtubeUrl.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&?\s]{6,})/,
  );
  const videoId = match?.[1];
  if (!videoId) {
    return `<p style="margin:16px 0;"><a href="${youtubeUrl}" style="color:${BRAND_COLOR};font-weight:600;">${label} →</a></p>`;
  }
  const thumb = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  return `
    <p style="margin:20px 0;">
      <a href="${youtubeUrl}" style="display:block;text-decoration:none;">
        <img src="${thumb}" alt="${label}" width="456" style="display:block;width:100%;max-width:456px;border-radius:8px;border:1px solid #e5e7eb;" />
        <span style="display:inline-block;margin-top:8px;color:${BRAND_COLOR};font-size:14px;font-weight:600;">${label} →</span>
      </a>
    </p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Templates ────────────────────────────────────────────────────────────

/**
 * Pre-call email — fired by admin "Send pre-call email" button before
 * any call attempt. From the admin team. Permission ask only.
 */
export function preCallEmail(opts: {
  providerName: string;
  adminFirstName: string;
  universityName: string;
  demoVideoUrl?: string;
}): { subject: string; html: string } {
  // Keep subject under ~60 chars for email client previews
  const subject = "Student caregiver program — quick question";
  const body = `
    <p>Hi,</p>
    <p>I work with Dr. Logan DuBose at Olera. He's running a free pilot connecting pre-nursing and pre-medical students from ${escapeHtml(opts.universityName)} to PRN shifts at home care agencies, and would like to share the details with whoever handles hiring at ${escapeHtml(opts.providerName)}.</p>
    ${opts.demoVideoUrl ? videoEmbed(opts.demoVideoUrl, "Watch the 90-second program overview") : ""}
    <p>Could you point me to the right person or email? I'll follow up by phone shortly.</p>
    <p style="margin:20px 0;">
      <a href="${BASE_URL}" style="color:${BRAND_COLOR};font-weight:600;">Learn more at olera.care →</a>
    </p>
    <p style="margin:20px 0 0;">Thanks,<br/>${escapeHtml(opts.adminFirstName)}, Olera</p>
  `;
  return {
    subject,
    html: layout(body, `${opts.universityName} student caregiver pilot — permission ask`),
  };
}

/**
 * Follow-up reminder email — sent after 5 business days if the provider
 * hasn't responded to the initial pre-call email. Brief and direct.
 */
export function followUpReminderEmail(opts: {
  providerName: string;
  adminFirstName: string;
  universityName: string;
}): { subject: string; html: string } {
  // Keep subject under ~60 chars for email client previews
  const subject = "Following up — student caregiver program";
  const body = `
    <p>Hi,</p>
    <p>Just following up on my email from last week about Dr. Logan DuBose's student caregiver program at ${escapeHtml(opts.universityName)}.</p>
    <p>We're connecting pre-nursing and pre-med students with home care agencies like ${escapeHtml(opts.providerName)} for PRN shifts. The pilot is free — happy to share more details if you can point me to the right person.</p>
    <p style="margin:20px 0 0;">Thanks,<br/>${escapeHtml(opts.adminFirstName)}, Olera</p>
  `;
  return {
    subject,
    html: layout(body, `Following up — ${opts.universityName} student caregiver pilot`),
  };
}

/**
 * Post-consent Step 1 — fired by admin "Add & Send" after a connected
 * call where the provider gave consent. From Logan. Includes the demo
 * video and (when env var is set) the pilot service agreement PDF.
 */
export function postConsentStep1Email(opts: {
  contactFirstName: string;
  providerName: string;
  universityName: string;
  activationUrl: string;
  demoVideoUrl: string;
}): { subject: string; html: string } {
  const subject = "Olera Student Caregiver Pilot";
  const body = `
    <p>Hi ${escapeHtml(opts.contactFirstName)},</p>
    <p>Thanks for talking with my team. Here's the program in 90 seconds:</p>
    ${videoEmbed(opts.demoVideoUrl)}
    <p>Pre-nursing and pre-med students from ${escapeHtml(opts.universityName)} pick up PRN shifts at agencies like ${escapeHtml(opts.providerName)}. We screen them, you interview them, they show up.</p>
    ${button("Activate Free Trial", opts.activationUrl)}
    <p>Trial details attached. Feel free to reach out with any questions. If you're interested, I'd love to meet to talk more about the program.</p>
    <p style="margin:20px 0 0;">— Logan</p>
  `;
  return {
    subject,
    html: layout(body, "Free three-month pilot — student caregivers for your agency"),
  };
}

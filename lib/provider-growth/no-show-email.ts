/**
 * No-Show Reschedule Email Template for Provider Growth
 *
 * Sent when a provider misses a scheduled meeting.
 * Provides a link to reschedule.
 */

export interface NoShowEmailParams {
  providerName: string;
  originalMeetingDate: Date;
  calendlyLink: string;
}

/**
 * Escape HTML special characters to prevent XSS/broken rendering.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format meeting date for display in email (Eastern Time - Logan's timezone).
 */
function formatMeetingDate(date: Date): { dateStr: string; timeStr: string } {
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  }) + " ET";
  return { dateStr, timeStr };
}

/**
 * Generate subject line for no-show reschedule email.
 */
export function generateNoShowSubject(): string {
  return "Let's reschedule our call — Olera";
}

/**
 * Generate HTML for no-show reschedule email.
 */
export function generateNoShowEmailHtml(params: NoShowEmailParams): string {
  const safeName = escapeHtml(params.providerName);
  const { dateStr, timeStr } = formatMeetingDate(params.originalMeetingDate);
  const safeCalendlyLink = escapeHtml(params.calendlyLink);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px;">
              <img src="https://olera.care/olera-logo-email.png" alt="Olera" width="100" style="display: block;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #111827;">
                Hi ${safeName},
              </h1>

              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #4b5563;">
                We missed you on our scheduled call on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #4b5563;">
                No worries — things come up! I'd still love to connect and share some tips on optimizing your Olera profile and reaching more families.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td>
                    <a href="${safeCalendlyLink}" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #0d9488; border-radius: 8px; text-decoration: none;">
                      Reschedule Your Call
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                Just click the button above to pick a new time that works for you.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                The Olera Team<br>
                <a href="https://olera.care" style="color: #0d9488; text-decoration: none;">olera.care</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

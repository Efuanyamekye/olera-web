/**
 * Meeting Reminder Email Templates for Provider Growth
 *
 * Sends reminders to providers about upcoming meetings.
 * - 2 days before: First reminder
 * - 1 day before: Final reminder
 */

export interface MeetingReminderParams {
  providerName: string;
  meetingDate: Date;
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
 * Generate subject line for reminder email.
 */
export function generateReminderSubject(
  params: MeetingReminderParams,
  reminderType: "2d" | "1d"
): string {
  const { dateStr } = formatMeetingDate(params.meetingDate);

  if (reminderType === "1d") {
    return `Reminder: Your call with Olera is tomorrow`;
  }
  return `Reminder: Your call with Olera on ${dateStr}`;
}

/**
 * Generate HTML for meeting reminder email.
 */
export function generateReminderEmailHtml(
  params: MeetingReminderParams,
  reminderType: "2d" | "1d"
): string {
  const safeName = escapeHtml(params.providerName);
  const { dateStr, timeStr } = formatMeetingDate(params.meetingDate);

  const urgencyText =
    reminderType === "1d"
      ? "Just a quick reminder that our call is <strong>tomorrow</strong>!"
      : "Just a friendly reminder about our upcoming call.";

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
                ${urgencyText}
              </p>

              <!-- Meeting Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; background-color: #f0fdfa; border-radius: 8px; border: 1px solid #99f6e4;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #0d9488; text-transform: uppercase; letter-spacing: 0.5px;">
                      Your Call Details
                    </p>
                    <p style="margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #111827;">
                      ${dateStr}
                    </p>
                    <p style="margin: 0; font-size: 16px; color: #4b5563;">
                      ${timeStr}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                During our call, we'll discuss:
              </p>

              <ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 14px; line-height: 22px; color: #6b7280;">
                <li>How to optimize your profile to stand out</li>
                <li>Tips for converting family inquiries</li>
                <li>Options to boost your visibility</li>
              </ul>

              <p style="margin: 0; font-size: 16px; line-height: 24px; color: #4b5563;">
                Looking forward to speaking with you!
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

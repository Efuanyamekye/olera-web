/**
 * POST /api/admin/provider-growth/send-booking-link
 *
 * Send a Calendly booking link to a provider via email.
 * This invites them to pick a meeting time that works for them.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { generateBookingUrl } from "@/lib/provider-growth/calendly";
import { createTouchpoint } from "@/lib/provider-growth/queries";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { tracking_id } = body;

    if (!tracking_id) {
      return NextResponse.json({ error: "tracking_id is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Get tracking record
    const { data: tracking, error: trackingError } = await db
      .from("provider_growth_tracking")
      .select("id, business_profile_id")
      .eq("id", tracking_id)
      .single();

    if (trackingError || !tracking) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Get provider profile
    const { data: profile, error: profileError } = await db
      .from("business_profiles")
      .select("display_name, email, phone")
      .eq("id", tracking.business_profile_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });
    }

    if (!profile.email) {
      return NextResponse.json(
        { error: "Provider has no email on file" },
        { status: 400 }
      );
    }

    const providerName = profile.display_name || "there";
    const providerEmail = profile.email;

    // Generate the booking URL
    const bookingUrl = generateBookingUrl({
      trackingId: tracking_id,
      contactName: profile.display_name || undefined,
      contactEmail: providerEmail,
    });

    // Send the email
    const emailResult = await sendEmail({
      to: providerEmail,
      subject: "Let's schedule a quick call - Olera",
      emailType: "provider_growth_booking_link",
      html: generateBookingEmailHtml({
        providerName,
        bookingUrl,
      }),
    });

    if (!emailResult.success) {
      console.error("[send-booking-link] Email failed:", emailResult.error);
      return NextResponse.json(
        { error: emailResult.error || "Failed to send email" },
        { status: 500 }
      );
    }

    // Log touchpoint
    await createTouchpoint({
      tracking_id,
      business_profile_id: tracking.business_profile_id,
      touchpoint_type: "note_added",
      details: {
        note: `Booking link sent to ${providerEmail}`,
        booking_url: bookingUrl,
        email_log_id: emailResult.emailLogId,
      },
      admin_user_id: adminUser.id,
    });

    // Update last_activity_at
    await db
      .from("provider_growth_tracking")
      .update({
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tracking_id);

    return NextResponse.json({
      success: true,
      email_sent_to: providerEmail,
      booking_url: bookingUrl,
    });
  } catch (e) {
    console.error("[send-booking-link] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
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
 * Generate HTML for the booking link email.
 */
function generateBookingEmailHtml({
  providerName,
  bookingUrl,
}: {
  providerName: string;
  bookingUrl: string;
}): string {
  const safeName = escapeHtml(providerName);
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
                Thanks for claiming your Olera profile! I'd love to chat briefly about how we can help you connect with more families and grow your business.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #4b5563;">
                Pick a time that works for you:
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td style="background-color: #0d9488; border-radius: 6px;">
                    <a href="${bookingUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Schedule a Call
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                The call takes about 15 minutes. We'll cover:
              </p>

              <ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 14px; line-height: 22px; color: #6b7280;">
                <li>How to optimize your profile to stand out</li>
                <li>Tips for converting family inquiries</li>
                <li>Options to boost your visibility (if you're interested)</li>
              </ul>

              <p style="margin: 0; font-size: 16px; line-height: 24px; color: #4b5563;">
                Looking forward to connecting!
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

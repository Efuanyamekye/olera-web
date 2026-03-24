import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

/**
 * POST /api/provider/send-magic-link
 *
 * Sends a magic link email to a provider for the provider welcome page.
 * Used when a provider's original magic link has expired (State 2).
 *
 * Request body:
 * - email: Provider's email address
 * - action: The action type (lead, question, review, message, match)
 * - actionId: The ID of the action item
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, action, actionId } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      console.error("Missing Supabase service role key");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const adminClient = createClient(url, serviceKey);
    const siteUrl = getSiteUrl();

    // Build the redirect URL with action params
    let redirectPath = "/provider/welcome";
    if (action && actionId) {
      redirectPath = `/provider/welcome?action=${action}&id=${actionId}`;
    }

    // Generate magic link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(redirectPath)}`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Failed to generate magic link:", linkError);
      return NextResponse.json({ error: "Failed to generate sign-in link" }, { status: 500 });
    }

    // Send the email
    const actionLabels: Record<string, string> = {
      lead: "care inquiry",
      match: "connection request",
      question: "question",
      review: "review",
      message: "message",
    };
    const actionLabel = actionLabels[action] || "notification";

    await sendEmail({
      to: email,
      subject: "Sign in to Olera",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.5; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <img src="${siteUrl}/images/olera-logo.png" alt="Olera" width="48" height="48" style="display: inline-block;">
          </div>

          <h1 style="font-size: 24px; font-weight: 600; color: #111827; margin: 0 0 16px; text-align: center;">
            Sign in to Olera
          </h1>

          <p style="font-size: 16px; color: #6b7280; margin: 0 0 24px; text-align: center;">
            Click the button below to sign in and respond to your ${actionLabel}.
          </p>

          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${linkData.properties.action_link}" style="display: inline-block; background-color: #198087; color: white; font-size: 16px; font-weight: 500; text-decoration: none; padding: 14px 32px; border-radius: 12px;">
              Sign in to Olera
            </a>
          </div>

          <p style="font-size: 14px; color: #9ca3af; margin: 0; text-align: center;">
            This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
        </body>
        </html>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send magic link error:", error);
    return NextResponse.json({ error: "Failed to send sign-in link" }, { status: 500 });
  }
}

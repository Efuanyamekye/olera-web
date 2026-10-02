import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser } from "@/lib/admin";
import { createGmailOAuthState } from "@/lib/support-email/oauth-state.server";
import { SLACK_USER_AUTH_PATH, slackUserAuthUrl } from "@/lib/war-room/slack-user-token.server";

/**
 * Authorize Cortex as the founder in Slack, once: his DMs for the daily
 * "what you owe" read, and replies he approves posted as him. Opened in the
 * browser by an admin; Slack sends him back to ./callback.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in to Olera as an admin first, then open this link again." }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "SLACK_CLIENT_ID is not set" }, { status: 500 });
  try {
    return NextResponse.redirect(slackUserAuthUrl({
      clientId,
      redirectUri: new URL(SLACK_USER_AUTH_PATH, request.nextUrl.origin).toString(),
      // The same signed, ten-minute state the Gmail and calendar connections use.
      state: createGmailOAuthState(user.id),
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Slack authorization is not configured" }, { status: 500 });
  }
}

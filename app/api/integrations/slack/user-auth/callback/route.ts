import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { verifyGmailOAuthState } from "@/lib/support-email/oauth-state.server";
import { exchangeSlackUserCode, isFounderEmail, saveSlackUserToken, SLACK_USER_AUTH_PATH, SLACK_USER_SCOPES } from "@/lib/war-room/slack-user-token.server";

/** A plain page that says what happened, as the calendar connection does. */
function done(ok: boolean, message: string) {
  const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cortex and Slack</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px"><h1 style="font-size:20px">${ok ? "Slack connected" : "Slack not connected"}</h1><p>${escape(message)}</p>${ok ? "" : '<p><a href="/api/integrations/slack/user-auth">Try again</a></p>'}</body>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return done(false, "Sign in to Olera as an admin, then try again.");
  const admin = await getAdminUser(user.id);
  if (!admin) return done(false, "Admin access is required.");
  if (!isFounderEmail(admin.email ?? user.email)) return done(false, "Only the founder connects Slack to Cortex, because replies post under the connected name.");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const declined = request.nextUrl.searchParams.get("error");
  if (declined) return done(false, `Slack declined: ${declined}`);
  if (!code || !state || !verifyGmailOAuthState(state, user.id)) {
    return done(false, "The authorization expired or could not be verified.");
  }
  try {
    const token = await exchangeSlackUserCode(code, new URL(SLACK_USER_AUTH_PATH, request.nextUrl.origin).toString());
    await saveSlackUserToken(getServiceClient(), { ...token, connectedBy: admin.email ?? user.email ?? user.id });
    const missing = SLACK_USER_SCOPES.filter((scope) => !token.scopes.includes(scope));
    return done(true, missing.length
      ? `Connected, but Slack did not grant ${missing.join(", ")}. The daily read will say what it can't see.`
      : "Cortex can now read your DMs for the daily read, and replies you approve will post as you. Revoke it any time in Slack under your account's connected apps.");
  } catch (err) {
    console.error("[cortex] Slack user authorization failed:", err);
    return done(false, err instanceof Error ? err.message : "Slack authorization failed.");
  }
}

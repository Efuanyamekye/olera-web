import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser } from "@/lib/admin";
import { gmailOAuthRedirectUri } from "@/lib/support-email/gmail.server";
import { createGmailOAuthState } from "@/lib/support-email/oauth-state.server";
import { calendarOAuthUrl } from "@/lib/war-room/calendar.server";

/**
 * Connect the founder's calendar to Cortex, read-only. Opened once in the
 * browser by an admin; Google sends him back through the support-email OAuth
 * callback, which hands a "cal." state to lib/war-room/calendar.server.ts.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    return NextResponse.redirect(calendarOAuthUrl({
      redirectUri: gmailOAuthRedirectUri(request.nextUrl.origin),
      state: createGmailOAuthState(user.id),
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Google OAuth is not configured" }, { status: 500 });
  }
}

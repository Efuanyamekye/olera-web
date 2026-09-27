import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { encryptGmailToken } from "@/lib/support-email/crypto.server";
import { exchangeGmailCode, getGmailProfile, gmailOAuthRedirectUri, watchGmail } from "@/lib/support-email/gmail.server";
import { verifyGmailOAuthState } from "@/lib/support-email/oauth-state.server";
import { CALENDAR_STATE_PREFIX, saveCalendarConnection } from "@/lib/war-room/calendar.server";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/support-email", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return back(request, { error: "Sign in again before connecting Gmail." });
  const admin = await getAdminUser(user.id);
  if (!admin) return back(request, { error: "Admin access is required." });
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  // Cortex's calendar connection shares this registered callback; its state
  // carries a "cal." prefix (lib/war-room/calendar.server.ts).
  if (state?.startsWith(CALENDAR_STATE_PREFIX)) {
    // A plain page that says what happened. The War Room page does not read
    // query params, so a redirect there would hide both success and failure.
    const done = (params: { calendar_connected?: string; calendar_error?: string }) => {
      const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
      const ok = Boolean(params.calendar_connected);
      const message = ok
        ? `Cortex can now read ${escape(params.calendar_connected ?? "")}'s calendar (read-only). Ask it "what's on my plate this week?"`
        : `The calendar did not connect: ${escape(params.calendar_error ?? "unknown error")}`;
      const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cortex calendar</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px"><h1 style="font-size:20px">${ok ? "Calendar connected" : "Calendar not connected"}</h1><p>${message}</p>${ok ? "" : '<p><a href="/api/admin/war-room/calendar/connect">Try again</a></p>'}</body>`;
      return new NextResponse(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    };
    if (oauthError) return done({ calendar_error: `Google declined: ${oauthError}` });
    if (!code || !verifyGmailOAuthState(state.slice(CALENDAR_STATE_PREFIX.length), user.id)) {
      return done({ calendar_error: "The calendar connection expired or could not be verified. Try again." });
    }
    try {
      const token = await exchangeGmailCode(code, gmailOAuthRedirectUri(request.nextUrl.origin));
      const { email } = await saveCalendarConnection(getServiceClient(), token, admin.email);
      return done({ calendar_connected: email });
    } catch (err) {
      console.error("[war-room] calendar connection failed:", err);
      return done({ calendar_error: err instanceof Error ? err.message : "Calendar connection failed." });
    }
  }

  if (oauthError) return back(request, { error: `Google declined the connection: ${oauthError}` });
  if (!code || !state || !verifyGmailOAuthState(state, user.id)) {
    return back(request, { error: "The Gmail connection expired or could not be verified." });
  }

  try {
    const redirectUri = gmailOAuthRedirectUri(request.nextUrl.origin);
    const token = await exchangeGmailCode(code, redirectUri);
    if (!token.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve mailbox access.");
    const profile = await getGmailProfile(token.access_token);
    const db = getServiceClient();
    const { data: existing } = await db
      .from("support_mailboxes")
      .select("id, gmail_history_id")
      .eq("email", profile.emailAddress.toLowerCase())
      .maybeSingle();
    const now = new Date().toISOString();
    const base = {
      email: profile.emailAddress.toLowerCase(),
      encrypted_refresh_token: encryptGmailToken(token.refresh_token),
      oauth_scopes: (token.scope ?? "").split(" ").filter(Boolean),
      sync_status: existing ? "connected" : "backfilling",
      gmail_history_id: existing?.gmail_history_id ?? profile.historyId,
      connected_by: admin.email,
      last_error: null,
      updated_at: now,
    };
    let mailboxId: string;
    if (existing) {
      const { error } = await db.from("support_mailboxes").update(base).eq("id", existing.id);
      if (error) throw error;
      mailboxId = String(existing.id);
    } else {
      const { data, error } = await db.from("support_mailboxes").insert(base).select("id").single();
      if (error || !data) throw error ?? new Error("Could not create support mailbox");
      mailboxId = String(data.id);
    }

    const topic = process.env.GMAIL_PUBSUB_TOPIC;
    if (topic) {
      try {
        const watch = await watchGmail(token.access_token, topic);
        const watchUpdate: Record<string, unknown> = {
          watch_expiration: new Date(Number(watch.expiration)).toISOString(),
        };
        // A watch response is a new notification baseline, not proof that an
        // already-connected mailbox has consumed everything before it. Preserve
        // the existing cursor so the next sync closes that interval safely.
        if (!existing?.gmail_history_id) watchUpdate.gmail_history_id = watch.historyId;
        const { error } = await db.from("support_mailboxes").update(watchUpdate).eq("id", mailboxId);
        if (error) throw error;
      } catch (err) {
        console.error("[support-email] Gmail connected but watch failed:", err);
        await db.from("support_mailboxes").update({
          last_error: "Gmail connected; push watch is unavailable, so polling will keep it synchronized.",
        }).eq("id", mailboxId);
      }
    }
    return back(request, { connected: profile.emailAddress });
  } catch (err) {
    console.error("[support-email] OAuth callback failed:", err);
    return back(request, { error: err instanceof Error ? err.message : "Gmail connection failed." });
  }
}

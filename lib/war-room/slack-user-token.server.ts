import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptGmailToken, encryptGmailToken } from "@/lib/support-email/crypto.server";

/**
 * The founder's Slack user token: his DMs, and replies posted as him.
 *
 * TJ, 2026-10-02, on what the daily Slack read should cover: channels and his
 * DMs, and replies he approves should go out as him. A bot can do neither, so
 * he authorizes Cortex as himself once (app/api/integrations/slack/user-auth).
 * The token is encrypted with the support mailbox's AES-256-GCM helper and key
 * (GMAIL_TOKEN_ENCRYPTION_KEY); the helper is generic despite its name.
 */

/** What Cortex asks Slack for as him. Reads for the owed-replies scan, chat:write to answer. */
export const SLACK_USER_SCOPES = [
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "im:read",
  "mpim:read",
  "channels:read",
  "groups:read",
  "users:read",
  "chat:write",
];

export const SLACK_USER_AUTH_PATH = "/api/integrations/slack/user-auth/callback";

export function slackUserAuthUrl(args: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", args.clientId);
  // No bot scopes: the bot install is unchanged. Only his user token is asked for.
  url.searchParams.set("scope", "");
  url.searchParams.set("user_scope", SLACK_USER_SCOPES.join(","));
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  return url.toString();
}

type OAuthAccess = {
  ok?: boolean;
  error?: string;
  team?: { id?: string };
  authed_user?: { id?: string; scope?: string; access_token?: string; token_type?: string };
};

/** Exchange the code for his user token. Throws with Slack's reason. */
export async function exchangeSlackUserCode(code: string, redirectUri: string): Promise<{ userId: string; teamId: string | null; scopes: string[]; accessToken: string }> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("SLACK_CLIENT_ID and SLACK_CLIENT_SECRET are not set");
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as OAuthAccess;
  if (!payload.ok) throw new Error(`Slack declined: ${payload.error ?? `HTTP ${response.status}`}`);
  const user = payload.authed_user;
  if (!user?.id || !user.access_token) throw new Error("Slack returned no user token. Approve the access it asks for as yourself.");
  return {
    userId: user.id,
    teamId: payload.team?.id ?? null,
    scopes: (user.scope ?? "").split(",").map((scope) => scope.trim()).filter(Boolean),
    accessToken: user.access_token,
  };
}

export async function saveSlackUserToken(db: SupabaseClient, args: { userId: string; teamId: string | null; scopes: string[]; accessToken: string; connectedBy: string }) {
  const now = new Date().toISOString();
  const { error } = await db.from("cortex_slack_user_tokens").upsert({
    slack_user_id: args.userId,
    team_id: args.teamId,
    scopes: args.scopes,
    encrypted_access_token: encryptGmailToken(args.accessToken),
    connected_by: args.connectedBy,
    updated_at: now,
    revoked_at: null,
  }, { onConflict: "slack_user_id" });
  if (error) throw new Error(error.code === "42P01" ? "the Slack token table isn't there yet (migration 269)" : error.message);
}

export type SlackUserToken = { token: string; userId: string; scopes: string[] };

/**
 * His live token, or null when none is connected (or the table is missing).
 * The newest unrevoked row wins: there is one founder.
 */
export async function loadSlackUserToken(db: SupabaseClient): Promise<SlackUserToken | null> {
  const { data, error } = await db.from("cortex_slack_user_tokens")
    .select("slack_user_id, scopes, encrypted_access_token")
    .is("revoked_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { slack_user_id: string; scopes: string[] | null; encrypted_access_token: string };
  try {
    return { token: decryptGmailToken(row.encrypted_access_token), userId: row.slack_user_id, scopes: row.scopes ?? [] };
  } catch (err) {
    console.error("[cortex] Slack user token could not be decrypted:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Slack said the token is dead: stop using it until he reconnects. */
export async function markSlackUserTokenRevoked(db: SupabaseClient, userId: string) {
  await db.from("cortex_slack_user_tokens").update({ revoked_at: new Date().toISOString() }).eq("slack_user_id", userId);
}

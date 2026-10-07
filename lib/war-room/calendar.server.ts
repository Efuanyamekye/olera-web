import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptGmailToken, encryptGmailToken } from "@/lib/support-email/crypto.server";
import { gmailAccessToken } from "@/lib/support-email/gmail.server";

/**
 * The founder's calendar (tj@olera.care), read-only, for Cortex.
 *
 * So "before your call with Robbie on Wednesday" is grounded in the calendar,
 * and Cortex knows what is already booked before suggesting a meeting. It
 * reuses the Google OAuth client support@ already connects with (and its
 * registered callback, told apart by a "cal." state prefix), asking only for
 * calendar.readonly. Cortex can never create, change or delete an event.
 *
 * The connection lives in war_room_source_state ('google_calendar'), with the
 * refresh token encrypted the same way the support mailbox's is.
 */

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const STATE_KEY = "google_calendar";
export const CALENDAR_STATE_PREFIX = "cal.";

/** The Google sign-in URL: read-only calendar, offline, for tj@olera.care. */
export function calendarOAuthUrl(opts: { redirectUri: string; state: string }): string {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_GMAIL_CLIENT_ID is not configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("login_hint", process.env.CORTEX_CALENDAR_EMAIL?.trim() || "tj@olera.care");
  // Not include_granted_scopes: this token should carry calendar read and nothing else.
  url.searchParams.set("state", `${CALENDAR_STATE_PREFIX}${opts.state}`);
  return url.toString();
}

/** After Google's callback: find whose calendar it is, and store the token encrypted. */
export async function saveCalendarConnection(db: SupabaseClient, token: { access_token: string; refresh_token?: string; scope?: string }, connectedBy: string) {
  if (!token.refresh_token) throw new Error("Google did not return a refresh token. Connect again and approve calendar access.");
  const scopes = (token.scope ?? "").split(" ").filter(Boolean);
  if (!scopes.includes(CALENDAR_SCOPE)) throw new Error("Calendar access was not granted. Connect again and tick the calendar box.");
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json() as { id?: string; error?: { message?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.message ?? `Calendar returned ${res.status}`);
  const now = new Date().toISOString();
  const { error } = await db.from("war_room_source_state").upsert({
    source_key: STATE_KEY,
    last_synced_at: now,
    last_success_at: now,
    last_error: null,
    metadata: { email: body.id, encrypted_refresh_token: encryptGmailToken(token.refresh_token), scopes, connected_by: connectedBy, connected_at: now },
    updated_at: now,
  }, { onConflict: "source_key" });
  if (error) throw error;
  return { email: body.id };
}

export type GoogleEvent = {
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ displayName?: string; email?: string; self?: boolean; responseStatus?: string; resource?: boolean }>;
  organizer?: { displayName?: string; email?: string; self?: boolean };
  hangoutLink?: string;
  conferenceData?: unknown;
  location?: string;
};

/**
 * Raw upcoming events WITH attendee emails, for server-side lookups only
 * (meeting prep matches attendees to providers and support threads). Never
 * hand these to a model or a page as-is; shapeEvents is the outward form.
 */
export async function loadCalendarEvents(db: SupabaseClient, fromIso: string, toIso: string): Promise<{ events: Array<GoogleEvent & { id?: string }> } | { unavailable: string }> {
  const { data } = await db.from("war_room_source_state").select("metadata").eq("source_key", STATE_KEY).maybeSingle();
  const meta = (data?.metadata ?? null) as { encrypted_refresh_token?: string } | null;
  if (!meta?.encrypted_refresh_token) return { unavailable: "calendar not connected" };
  try {
    const accessToken = await gmailAccessToken(decryptGmailToken(meta.encrypted_refresh_token));
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", fromIso);
    url.searchParams.set("timeMax", toIso);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "50");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
    const body = await res.json() as { items?: Array<GoogleEvent & { id?: string }>; error?: { message?: string } };
    if (!res.ok) return { unavailable: body.error?.message ?? `Calendar returned ${res.status}` };
    return { events: body.items ?? [] };
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

/** A person's name without their email: the display name, else the address before the @. */
function personName(person: { displayName?: string; email?: string }) {
  return person.displayName?.trim() || (person.email ?? "").split("@")[0].replace(/[._]/g, " ") || "someone";
}

export function shapeEvents(events: GoogleEvent[]) {
  return events
    .filter((event) => event.status !== "cancelled")
    .map((event) => ({
      title: event.summary?.trim() || "(no title)",
      // Timed events carry dateTime (converted to ET by the lookup layer);
      // all-day events carry a plain date.
      start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null,
      allDay: Boolean(event.start?.date && !event.start?.dateTime),
      with: (event.attendees ?? [])
        .filter((a) => !a.self && !a.resource)
        .map((a) => `${personName(a)}${a.responseStatus === "declined" ? " (declined)" : ""}`),
      organizer: event.organizer?.self ? "you" : event.organizer ? personName(event.organizer) : null,
      video: Boolean(event.hangoutLink || event.conferenceData),
    }));
}

/**
 * The founder's calendar from `daysBack` ago to `daysAhead` from now. Always
 * resolves: not connected, or a refused read, comes back as a reason.
 */
export async function loadCalendar(db: SupabaseClient, opts: { daysAhead?: number; daysBack?: number; query?: string } = {}) {
  const { data } = await db.from("war_room_source_state").select("metadata").eq("source_key", STATE_KEY).maybeSingle();
  const meta = (data?.metadata ?? null) as { email?: string; encrypted_refresh_token?: string } | null;
  if (!meta?.encrypted_refresh_token) {
    return { unavailable: "The founder's calendar is not connected. He connects it once at /api/admin/war-room/calendar/connect." };
  }
  try {
    const accessToken = await gmailAccessToken(decryptGmailToken(meta.encrypted_refresh_token));
    const now = Date.now();
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", new Date(now - (opts.daysBack ?? 3) * 86_400_000).toISOString());
    url.searchParams.set("timeMax", new Date(now + (opts.daysAhead ?? 14) * 86_400_000).toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "100");
    if (opts.query) url.searchParams.set("q", opts.query);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
    const body = await res.json() as { items?: GoogleEvent[]; error?: { message?: string } };
    if (!res.ok) throw new Error(body.error?.message ?? `Calendar returned ${res.status}`);
    return {
      calendar: meta.email,
      note: "Read live from the founder's Google Calendar. Times are ET. Attendees are names only.",
      events: shapeEvents(body.items ?? []),
    };
  } catch (error) {
    return { unavailable: `The calendar could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

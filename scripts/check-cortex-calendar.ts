/**
 * Checks for Cortex reading the founder's calendar.
 *
 *   npx tsx --env-file=.env.local scripts/check-cortex-calendar.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { CALENDAR_SCOPE, CALENDAR_STATE_PREFIX, calendarOAuthUrl, loadCalendar, shapeEvents } from "../lib/war-room/calendar.server";

// --- Events: names, never emails; cancelled ones gone; all-day kept as a date.
const events = shapeEvents([
  {
    summary: "Robbie / TJ: North Texas",
    start: { dateTime: "2026-09-30T14:00:00Z" }, end: { dateTime: "2026-09-30T14:30:00Z" },
    attendees: [{ email: "tj@olera.care", self: true }, { displayName: "Robbie McCullough", email: "rmccullough@assistinghands.com" }, { email: "ces.chavez@olera.care", responseStatus: "declined" }, { email: "room-1@resource.calendar.google.com", resource: true }],
    organizer: { self: true }, hangoutLink: "https://meet.google.com/x",
  },
  { summary: "Cancelled thing", status: "cancelled", start: { dateTime: "2026-09-29T14:00:00Z" } },
  { summary: "Hoop Cares renewal", start: { date: "2026-10-15" }, end: { date: "2026-10-16" }, organizer: { displayName: "Ces" } },
]);
assert.equal(events.length, 2, "cancelled dropped");
assert.deepEqual(events[0].with, ["Robbie McCullough", "ces chavez (declined)"], "names only, self and rooms left out");
assert.ok(!JSON.stringify(events).includes("@"), "no email addresses anywhere");
assert.equal(events[0].organizer, "you");
assert.equal(events[0].video, true);
assert.equal(events[1].allDay, true);
assert.equal(events[1].start, "2026-10-15");
console.log("event shaping checks passed");

// --- The sign-in asks for read-only calendar and nothing else.
process.env.GOOGLE_GMAIL_CLIENT_ID ??= "test-client";
const url = new URL(calendarOAuthUrl({ redirectUri: "https://olera.care/api/admin/support-email/oauth/callback", state: "abc.sig" }));
assert.equal(url.searchParams.get("scope"), CALENDAR_SCOPE);
assert.equal(url.searchParams.get("include_granted_scopes"), null, "no piggy-backed Gmail scope");
assert.equal(url.searchParams.get("state"), `${CALENDAR_STATE_PREFIX}abc.sig`);
assert.equal(url.searchParams.get("access_type"), "offline");
console.log("sign-in URL checks passed");

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await loadCalendar(db);
  if ("unavailable" in result) console.log(`not connected yet (expected before TJ connects): ${result.unavailable}`);
  else console.log(`connected: ${result.calendar}, ${result.events.length} events`);
})();

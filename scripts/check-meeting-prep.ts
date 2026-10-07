/**
 * Deterministic checks for meeting prep (lib/war-room/meeting-prep.ts).
 *
 *   npx tsx scripts/check-meeting-prep.ts
 */
import assert from "node:assert/strict";
import { externalAttendees, isInternal, needsPrep, prepKey, whenText } from "../lib/war-room/meeting-prep";

const now = new Date("2026-10-08T02:15:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const robbie = { email: "Robbie@AssistingHands.example", displayName: "Robbie McCullough" };

// Who counts as outside.
assert.ok(isInternal("tj@olera.care"));
assert.ok(isInternal("ces@joinolera.care"));
assert.ok(isInternal("abc123@resource.calendar.google.com"));
assert.ok(!isInternal("robbie@assistinghands.example"));

// Attendees: us, rooms, decliners and duplicates are dropped; emails lower-cased.
const people = externalAttendees({ attendees: [
  { email: "tj@olera.care", self: true },
  robbie,
  { email: "robbie@assistinghands.example" },
  { email: "room@resource.calendar.google.com", resource: true },
  { email: "no@else.example", responseStatus: "declined" },
] });
assert.deepEqual(people, [{ email: "robbie@assistinghands.example", domain: "assistinghands.example", name: "Robbie McCullough" }]);

// The window: timed, upcoming, within six hours, someone outside.
const ev = (start: string | null, attendees = [robbie], extra = {}) => ({ id: "e1", summary: "Call", start: start ? { dateTime: start } : { date: "2026-10-08" }, attendees, ...extra });
assert.ok(needsPrep(ev(at(2)), now));
assert.ok(needsPrep(ev(at(5.9)), now));
assert.ok(!needsPrep(ev(at(6.5)), now), "beyond the window waits for the next tick");
assert.ok(!needsPrep(ev(at(-0.1)), now), "already started");
assert.ok(!needsPrep(ev(null), now), "all-day");
assert.ok(!needsPrep(ev(at(2), [{ email: "ces@joinolera.care" }]), now), "internal only");
assert.ok(!needsPrep(ev(at(2), [robbie], { status: "cancelled" }), now));

// One key per occurrence.
assert.equal(prepKey(ev(at(2))), `meetprep:e1:${at(2)}`);
assert.notEqual(prepKey(ev(at(2))), prepKey(ev(at(26))));

// His time zone.
assert.equal(whenText("2026-10-08T03:00:00Z"), "Thu 8 Oct, 10:00 Bangkok");

console.log("meeting prep checks passed");

/**
 * Deterministic checks for meeting prep (lib/war-room/meeting-prep.ts),
 * against the real meeting titles on TJ's calendar on 7 Oct 2026.
 *
 *   npx tsx scripts/check-meeting-prep.ts
 */
import assert from "node:assert/strict";
import { attendeesOf, externalAttendees, isTeam, needsPrep, prepKey, routeMeeting, whenText } from "../lib/war-room/meeting-prep";

const now = new Date("2026-10-08T02:15:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const me = { email: "tj@olera.care", self: true };
const esther = { email: "uiuxesther@gmail.com", displayName: "Esther Nyamekye" };
const ces = { email: "cecille.chavez05@gmail.com" };
const logan = { email: "logan@olera.care", displayName: "Logan DuBose" };
const chantel = { email: "chantel@olera.care" };
const robbie = { email: "rmccullough@assistinghands.com", displayName: "Robbie Mccullough" };
const david = { email: "david@trustedinnovationpartners.com" };
const ev = (summary: string, attendees: object[], start: string | null = at(2), extra = {}) => ({ id: "e1", summary, start: start ? { dateTime: start } : { date: "2026-10-08" }, attendees: [me, ...attendees], ...extra });
const to = (summary: string, attendees: object[]) => routeMeeting(ev(summary, attendees)).channel?.name ?? routeMeeting(ev(summary, attendees)).reason;

// The team, including personal addresses.
assert.ok(isTeam("uiuxesther@gmail.com"));
assert.ok(isTeam("cecille.chavez05@gmail.com"));
assert.ok(isTeam("graize@olera.care"));
assert.ok(!isTeam("rmccullough@assistinghands.com"));
assert.deepEqual(externalAttendees(ev("x", [esther, robbie])).map((p) => p.email), ["rmccullough@assistinghands.com"]);
assert.equal(attendeesOf(ev("x", [{ email: "graize@olera.care", responseStatus: "declined" }])).length, 0, "decliners dropped");

// Routing, from the real titles.
assert.equal(to("Care seeker and provider support (Managed Ads)", [ces]), "#careseeker-support");
assert.equal(to("Esther <> TJ Product Development Check In", [esther]), "#product-development");
assert.equal(to("Olera × Assisting Hands: North Texas partnership", [logan, robbie]), "#provider-support");
assert.equal(to("Olera × Colorado CareAssist: first families + next campaign", [{ email: "jacob@coloradocareassist.com" }]), "#provider-support");
assert.equal(to("Provider Demo - Olera   Discovery between TJ Falohun and Karen Bailey", [{ email: "info@atlantahousecares.com" }]), "#provider-support");
assert.equal(to("David x TJ x Logan - Check In", [logan, david]), "#grants");
assert.equal(to("CRP Drafting Updates", [logan]), "#grants");
assert.equal(to("Phase IIB Engineering Plan", [logan]), "#care-nav-study-team");
assert.equal(to("Medjobs & Managed Ads - KPIs, Obstacles, & Progress so Far", [chantel, logan, esther, ces]), "#provider-support", "Managed Ads keeps a mixed meeting in, with the provider team");
assert.equal(to("Weekly sync", [ces]), "#careseeker-support", "a meeting with only Ces is care seeker support");
assert.equal(to("MedJobs RTL", [chantel, logan]), "MedJobs, staffing or HR");
assert.equal(to(" RTL MedJobs", [chantel]), "MedJobs, staffing or HR");
assert.equal(to("Human Resources ", [logan]), "MedJobs, staffing or HR");
assert.equal(to("Founder Check In: governence during conflict, incentives, and compensation", [logan]), "MedJobs, staffing or HR");
assert.equal(to("Graize Scope Check In", [logan, { email: "graize@olera.care" }]), "MedJobs, staffing or HR");
assert.equal(to("Huddle - Big Picture This Week", [logan]), "no channel matched; #cortex");

// The window and the skip.
assert.ok(needsPrep(ev("Esther <> TJ Product Development Check In", [esther]), now));
assert.ok(!needsPrep(ev("MedJobs RTL", [logan]), now), "skipped kinds never prep");
assert.ok(!needsPrep(ev("Solo reminder", [], at(2)), now), "nobody else on it");
assert.ok(!needsPrep(ev("Call", [esther], at(6.5)), now), "beyond the window");
assert.ok(!needsPrep(ev("Call", [esther], at(-0.1)), now), "already started");
assert.ok(!needsPrep(ev("Call", [esther], null), now), "all-day");
assert.ok(!needsPrep(ev("Call", [esther], at(2), { status: "cancelled" }), now));

// Keys and times.
assert.equal(prepKey(ev("x", [esther])), `meetprep:e1:${at(2)}`);
assert.equal(whenText("2026-10-08T11:45:00Z"), "Thu 8 Oct, 18:45 Bangkok · 06:45 Chicago");

console.log("meeting prep checks passed");

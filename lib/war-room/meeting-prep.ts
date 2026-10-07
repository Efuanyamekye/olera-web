/**
 * Meeting prep, the pure part: which calendar events get a note, where the
 * note goes, who on them is outside the company, and when it is due. The
 * server side is meeting-prep.server.ts; scripts/check-meeting-prep.ts checks
 * this file. Slice 5 of docs/cortex/ACTIVITIES.md.
 *
 * TJ, 7 Oct 2026: "in the channels I'm in when the meeting is relevant ...
 * the care seeker support stuff, not staffing, not medjobs. The one with
 * Esther, for sure, on AI stuff ... Basically, everything except medjobs that
 * I'm involved in ... it's not just to orient me, but to prep everyone else."
 *
 * Routing is by meeting title first (the team names meetings consistently),
 * then by who is on it. Channel ids are the ones in Olera's Slack on 7 Oct
 * 2026; a private channel Cortex is not in falls back to #cortex with a note.
 */

/** Olera people, including those who use personal addresses. */
export const TEAM_EMAILS = [
  "tj@olera.care", "tfalohun@gmail.com", "logan@olera.care", "chantel@olera.care", "sara@olera.care",
  "graize@olera.care", "uiuxesther@gmail.com", "cecille.chavez05@gmail.com",
];
const TEAM_DOMAINS = ["olera.care", "joinolera.care", "findmedjobs.co"];
const CES = "cecille.chavez05@gmail.com";
const ESTHER = "uiuxesther@gmail.com";
const DAVID_DOMAIN = "trustedinnovationpartners.com";

export const CHANNELS = {
  careseeker: { id: "C05TN1C48BE", name: "#careseeker-support" },
  provider: { id: "C0A33MNLCSH", name: "#provider-support" },
  product: { id: "C0A91BA205T", name: "#product-development" },
  ai: { id: "C07TH1Z4N7K", name: "#ai-agents" },
  grants: { id: "C071PHRQX9R", name: "#grants" },
  study: { id: "C09N33RQGTH", name: "#care-nav-study-team" },
  benefits: { id: "C08L0H8CADB", name: "#senior-benefits-planner" },
} as const;

/**
 * The tick runs every three hours, so a note is prepared for any meeting
 * starting in the next six: it arrives between three and six hours ahead,
 * never after the meeting has started.
 */
export const PREP_WINDOW_HOURS = 6;

export type CalendarAttendee = { email?: string; displayName?: string; self?: boolean; resource?: boolean; responseStatus?: string; optionalAttendee?: boolean };
export type CalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: CalendarAttendee[];
  organizer?: { email?: string; self?: boolean };
};

export type Person = { email: string; name: string; domain: string; team: boolean };
export type Route = { channel: { id: string; name: string } | null; reason: string };

export function domainOf(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase().trim();
}

export function isTeam(email: string): boolean {
  const e = email.toLowerCase().trim();
  return TEAM_EMAILS.includes(e) || TEAM_DOMAINS.includes(domainOf(e));
}

/** Everyone on the invite except TJ, rooms and people who declined, team flagged. */
export function attendeesOf(event: CalendarEvent): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const a of event.attendees ?? []) {
    const email = (a.email ?? "").toLowerCase().trim();
    if (!email || a.self || a.resource || a.responseStatus === "declined" || email.endsWith(".calendar.google.com") || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, domain: domainOf(email), team: isTeam(email), name: a.displayName?.trim() || email.split("@")[0].replace(/[._]/g, " ").replace(/\d+$/, "") });
  }
  return out;
}

export function externalAttendees(event: CalendarEvent): Person[] {
  return attendeesOf(event).filter((p) => !p.team);
}

const SKIP = /\b(med\s*jobs|medjobs|rtl|staffing|human resources|payroll|compensation|governance|governence|scope check)\b/i;

/** Where a meeting's prep goes, or null with the reason it is skipped. */
export function routeMeeting(event: CalendarEvent): Route {
  const title = (event.summary ?? "").trim();
  const people = attendeesOf(event);
  const emails = people.map((p) => p.email);
  const external = people.filter((p) => !p.team);
  // MedJobs and staffing are someone else's; a meeting that is also about
  // Managed Ads is still TJ's and goes to the provider channel.
  if (SKIP.test(title) && !/managed ads/i.test(title)) return { channel: null, reason: "MedJobs, staffing or HR" };
  // Titles first: the team names meetings by what they are about.
  if (/care ?seeker|\bsupport\b/i.test(title)) return { channel: CHANNELS.careseeker, reason: "care seeker support" };
  if (/phase ii|carenav|care nav|study|research/i.test(title)) return { channel: CHANNELS.study, reason: "CareNav study" };
  if (/\bcrp\b|grant|nih|sbir/i.test(title)) return { channel: CHANNELS.grants, reason: "grants" };
  if (/benefit/i.test(title)) return { channel: CHANNELS.benefits, reason: "benefits" };
  if (/\bai\b|agent|cortex|muse|automation/i.test(title)) return { channel: CHANNELS.ai, reason: "AI" };
  if (/product|design|\bux\b/i.test(title)) return { channel: CHANNELS.product, reason: "product development" };
  if (/managed ads|provider|partner|demo|discovery|olera ×|olera x\b/i.test(title)) return { channel: CHANNELS.provider, reason: "provider" };
  // Then who is on it.
  if (emails.some((e) => domainOf(e) === DAVID_DOMAIN)) return { channel: CHANNELS.grants, reason: "grants" };
  if (external.length) return { channel: CHANNELS.provider, reason: "provider" };
  if (emails.length === 1 && emails[0] === CES) return { channel: CHANNELS.careseeker, reason: "care seeker support" };
  if (emails.length === 1 && emails[0] === ESTHER) return { channel: CHANNELS.product, reason: "product development" };
  return { channel: null, reason: "no channel matched; #cortex" };
}

/**
 * Worth a note: timed, not cancelled, starting within the window and not yet
 * started, at least one other person on it, and not a skipped kind.
 */
export function needsPrep(event: CalendarEvent, now: Date, windowHours = PREP_WINDOW_HOURS): boolean {
  if (event.status === "cancelled") return false;
  const start = event.start?.dateTime;
  if (!start) return false;
  const t = Date.parse(start);
  if (!Number.isFinite(t) || t <= now.getTime() || t > now.getTime() + windowHours * 3_600_000) return false;
  if (!attendeesOf(event).length) return false;
  return routeMeeting(event).reason !== "MedJobs, staffing or HR";
}

/** One note per event occurrence, whatever the number of ticks that see it. */
export function prepKey(event: CalendarEvent): string {
  return `meetprep:${event.id ?? event.summary ?? "event"}:${event.start?.dateTime ?? ""}`;
}

/**
 * Is this Notion note from this meeting? The words that make the title
 * distinctive (not "meeting", "check", "in", "sync", "olera", "tj") must
 * mostly appear in the note's title. On 7 Oct 2026 a search for "Esther <> TJ
 * Product Development Check In" returned "Olera Product Development Meeting"
 * from a month earlier, and the prep presented its action items as last time's.
 */
const GENERIC = new Set(["meeting", "check", "in", "sync", "olera", "tj", "and", "the", "with", "x", "call", "weekly", "update", "updates", "so", "far"]);
export function titleWords(title: string): string[] {
  return title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !GENERIC.has(w));
}
export function noteMatchesMeeting(meetingTitle: string, noteTitle: string, noteEditedAt: string, now: Date, maxAgeDays = 45): boolean {
  const want = titleWords(meetingTitle);
  if (!want.length) return false;
  const have = new Set(titleWords(noteTitle));
  const hit = want.filter((w) => have.has(w)).length;
  const fresh = Date.parse(noteEditedAt) >= now.getTime() - maxAgeDays * 86_400_000;
  return fresh && hit / want.length >= 0.75;
}

/** "Thu 8 Oct, 10:00 Bangkok · 22:00 Chicago": TJ's time and the team's. */
export function whenText(iso: string): string {
  const d = new Date(iso);
  const fmt = (timeZone: string) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
  return `${day}, ${fmt("Asia/Bangkok")} Bangkok · ${fmt("America/Chicago")} Chicago`;
}

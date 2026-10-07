/**
 * Meeting prep, the pure part: which calendar events get a note, who on them
 * is outside the company, and when a note is due. The server side is
 * meeting-prep.server.ts; scripts/check-meeting-prep.ts checks this file.
 * Slice 5 of docs/cortex/ACTIVITIES.md.
 *
 * TJ, 7 Oct 2026: "let's first keep it to me since I'm in, so we don't blast
 * everybody." Notes go to the founder by direct message only, never to
 * #cortex.
 */

/** Addresses on these domains are us; a meeting with only them needs no prep. */
export const INTERNAL_DOMAINS = ["olera.care", "joinolera.care", "findmedjobs.co"];

/**
 * The tick runs every three hours, so a note is prepared for any meeting
 * starting in the next six: it arrives between three and six hours ahead,
 * never after the meeting has started.
 */
export const PREP_WINDOW_HOURS = 6;

export type CalendarAttendee = { email?: string; displayName?: string; self?: boolean; resource?: boolean; responseStatus?: string };
export type CalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: CalendarAttendee[];
  organizer?: { email?: string; self?: boolean };
};

export type ExternalPerson = { email: string; name: string; domain: string };

export function domainOf(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase().trim();
}

export function isInternal(email: string, extra: string[] = []): boolean {
  const d = domainOf(email);
  return !d || [...INTERNAL_DOMAINS, ...extra].includes(d) || d.endsWith(".calendar.google.com");
}

/** People on the invite who are not us, not rooms, and did not decline. */
export function externalAttendees(event: CalendarEvent): ExternalPerson[] {
  const seen = new Set<string>();
  const out: ExternalPerson[] = [];
  for (const a of event.attendees ?? []) {
    const email = (a.email ?? "").toLowerCase().trim();
    if (!email || a.self || a.resource || a.responseStatus === "declined" || isInternal(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, domain: domainOf(email), name: a.displayName?.trim() || email.split("@")[0].replace(/[._]/g, " ") });
  }
  return out;
}

/**
 * Worth a note: timed (not all-day), not cancelled, starting within the
 * window and not yet started, and someone outside the company on it.
 */
export function needsPrep(event: CalendarEvent, now: Date, windowHours = PREP_WINDOW_HOURS): boolean {
  if (event.status === "cancelled") return false;
  const start = event.start?.dateTime;
  if (!start) return false;
  const t = Date.parse(start);
  if (!Number.isFinite(t) || t <= now.getTime() || t > now.getTime() + windowHours * 3_600_000) return false;
  return externalAttendees(event).length > 0;
}

/** One note per event occurrence, whatever the number of ticks that see it. */
export function prepKey(event: CalendarEvent): string {
  return `meetprep:${event.id ?? event.summary ?? "event"}:${event.start?.dateTime ?? ""}`;
}

/** "Thu 9 Oct, 10:00 Bangkok" in the founder's own time zone. */
export function whenText(iso: string, timeZone = "Asia/Bangkok"): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  return `${day}, ${time} ${timeZone === "Asia/Bangkok" ? "Bangkok" : timeZone}`;
}

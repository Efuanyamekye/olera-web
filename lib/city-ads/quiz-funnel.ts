import { classifyCityTraffic } from "./config";
import { type ReferrerClass } from "../analytics/referrer";

const PAID_ENTRY_REFERRERS: readonly ReferrerClass[] = ["search", "social", "other"];

// Confirmed production deployment of the provider-card fix, not midnight that day.
export const QUIZ_CLEAN_START = "2026-09-10T07:22:00.000Z";
export interface QuizEvent {
  anonymous_id: string | null;
  visit_id: string | null;
  page_path: string;
  occurred_at: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
}
export interface QuizLead {
  slug: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  gclid: string | null;
  fbclid: string | null;
  is_test: boolean | null;
}
export interface QuizRow {
  slug: string;
  channel: string;
  visitors: number;
  visits: number;
  starts: number;
  contacts: number;
  submissions: number;
}
export interface QuizFunnel {
  rows: QuizRow[];
  excludedLandings: number;
  ambiguousVisits: number;
  unmatchedEvents: number;
  lastEventAt: string | null;
}
const text = (v: unknown) => typeof v === "string" ? v : null;
function channel(m: Record<string, unknown>) {
  const c = classifyCityTraffic({ source: text(m.utm_source), medium: text(m.utm_medium),
    gclid: m.gclid ? "present" : null, fbclid: m.fbclid ? "present" : null });
  return c.paid && c.channel ? c.channel.toLowerCase() : null;
}
const visitKey = (e: QuizEvent) => e.anonymous_id && e.visit_id
  ? JSON.stringify([e.anonymous_id, e.visit_id, e.page_path]) : null;

/** Inputs are bounded by the same UTC reporting window. Only landings set attribution. */
export function buildQuizFunnel(events: QuizEvent[], leads: QuizLead[], campaigns: { slug: string; channel: string }[]): QuizFunnel {
  const rows = new Map<string, QuizRow>();
  const sets = new Map<string, { visitors: Set<string>; starts: Set<string>; contacts: Set<string> }>();
  const getRow = (slug: string, ch: string) => {
    const k = JSON.stringify([slug, ch]);
    if (!rows.has(k)) {
      rows.set(k, { slug, channel: ch, visitors: 0, visits: 0, starts: 0, contacts: 0, submissions: 0 });
      sets.set(k, { visitors: new Set(), starts: new Set(), contacts: new Set() });
    }
    return { row: rows.get(k)!, ids: sets.get(k)! };
  };
  campaigns.forEach(c => getRow(c.slug, c.channel));
  const visits = new Map<string, { entry: QuizEvent; channel: string; conflict: boolean }>();
  let excludedLandings = 0;
  for (const e of [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))) {
    if (e.event_type !== "page_landed") continue;
    const m = e.metadata ?? {};
    const key = visitKey(e);
    const ch = channel(m);
    // Tagged direct entries and internal reloads are not proven external ad visits.
    if (!key || !ch || !PAID_ENTRY_REFERRERS.includes(m.referrer_class as ReferrerClass) || m.is_test === true || m.is_preview === true) {
      excludedLandings++; continue;
    }
    const existing = visits.get(key);
    if (existing) existing.conflict ||= existing.channel !== ch;
    else visits.set(key, { entry: e, channel: ch, conflict: false });
  }
  let ambiguousVisits = 0;
  for (const v of visits.values()) {
    if (v.conflict) { ambiguousVisits++; continue; }
    const { row, ids } = getRow(v.entry.page_path.replace(/^\/care\//, ""), v.channel);
    row.visits++;
    ids.visitors.add(v.entry.anonymous_id!);
  }
  let unmatchedEvents = 0;
  for (const e of events) {
    if (!["cta_engaged", "lead_started"].includes(e.event_type)) continue;
    const key = visitKey(e);
    const v = key ? visits.get(key) : undefined;
    if (!v || v.conflict || Date.parse(e.occurred_at) < Date.parse(v.entry.occurred_at)) { unmatchedEvents++; continue; }
    const { ids } = getRow(e.page_path.replace(/^\/care\//, ""), v.channel);
    (e.event_type === "cta_engaged" ? ids.starts : ids.contacts).add(e.anonymous_id!);
  }
  for (const l of leads) {
    if (l.is_test !== false || !l.slug) continue;
    const ch = classifyCityTraffic({ source: l.utm_source, medium: l.utm_medium, gclid: l.gclid, fbclid: l.fbclid });
    // Submissions are authoritative date-window totals, not inferred from analytics.
    getRow(l.slug, ch.paid && ch.channel ? ch.channel.toLowerCase() : "unattributed").row.submissions++;
  }
  for (const [key, row] of rows) {
    const ids = sets.get(key)!;
    row.visitors = ids.visitors.size; row.starts = ids.starts.size; row.contacts = ids.contacts.size;
  }
  return { rows: [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug) || a.channel.localeCompare(b.channel)),
    excludedLandings, ambiguousVisits, unmatchedEvents,
    lastEventAt: events.map(e => e.occurred_at).sort().pop() ?? null };
}

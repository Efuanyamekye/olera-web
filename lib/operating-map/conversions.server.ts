import type { SupabaseClient } from "@supabase/supabase-js";
import { cityFilterFromSlug, providerKeysInCity } from "@/lib/providers";

/**
 * CR6 — the actions a care recipient takes, not the pages they read.
 *
 * Three ways of asking us for something, and their sum:
 *
 *   CR6a  questions            provider_question_asks
 *   CR6b  connections          provider_activity lead_received
 *   CR6c  benefits assessment  seeker_activity   benefits_completed
 *
 * Questions read `provider_question_asks` rather than the `question_asked`
 * row the same submission also writes to seeker_activity. That is the table
 * network-health counts, and two admin surfaces disagreeing about how many
 * questions were asked would be worse than the duplication.
 *
 * CITY. None of these carry visitor geo — they are form submissions written
 * through three different routes — so the city here is the city the action
 * is ABOUT, which is the reading that matters for a marketplace:
 *
 *   questions and connections   the provider's city; the ask is about them
 *   benefits assessments        the care recipient's own city; no provider
 *                               is involved at all
 *
 * Provider-keyed rows are matched against both the directory id and the slug
 * (see `providerKeysInCity`) because a question is recorded against whatever
 * the page URL said.
 *
 * The two "sent" figures are separate from the three counts and deliberately
 * so: an ask is not a delivery. They count the notification actually leaving
 * for the provider's inbox, which is the step that can silently fail.
 *
 * They are NOT a subset of the asks above them, and can exceed them. A
 * provider whose email address we only discover later gets their whole
 * backlog flushed at once (see lib/admin/send-deferred-notifications.ts), so
 * sends land in a window whose asks belong to earlier ones. There is no
 * reliable join back the other way — the immediate send path does not stamp
 * the question, only the deferred one does — so this is counted as what it
 * is, a flow of sends, and the tooltip says so rather than implying a
 * funnel step that the data cannot support.
 */

const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;

export interface Conversions {
  /** CR2 — distinct families we contacted in this range. */
  familiesInOutreach: number;
  questions: number;
  connections: number;
  benefitsAssessments: number;
  /** CR6's total: the three CTA types beneath it. */
  ctasTotal: number;
  /** Question notifications that reached a provider's inbox. */
  questionsSent: number;
  /** Connection requests that reached a provider's inbox. */
  connectionsSent: number;
}

type Range = { from: string | null; to: string | null };
type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

function inRange(query: Query, range: Range): Query {
  let q = query;
  if (range.from) q = q.gte("created_at", range.from);
  if (range.to) q = q.lt("created_at", range.to);
  return q;
}

/** Fast path: nothing to intersect, so the database does the counting. */
async function countAll(
  db: SupabaseClient,
  table: string,
  range: Range,
  narrow: (q: Query) => Query = (q) => q,
): Promise<number> {
  const query = inRange(
    narrow(db.from(table).select("id", { count: "exact", head: true })),
    range,
  );
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Rows in the window whose key falls inside a set.
 *
 * The set is resolved once by the caller and tested here rather than pushed
 * into the query, because PostgREST carries filters in the URL and a city
 * can hold thousands of providers. These event tables are small next to page
 * views, so reading the window and filtering in memory is the cheaper half
 * of that trade.
 */
async function countKeyed(
  db: SupabaseClient,
  table: string,
  keyField: string,
  range: Range,
  keys: Set<string>,
  narrow: (q: Query) => Query = (q) => q,
): Promise<number> {
  let matched = 0;
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    const query = inRange(narrow(db.from(table).select(`${keyField}, created_at`)), range);
    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const key = row[keyField];
      // A row with no key cannot be placed in a city. It is not counted,
      // rather than counted somewhere it might not belong.
      if (typeof key === "string" && keys.has(key)) matched += 1;
    }

    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  return matched;
}

/** Care recipient profile ids in one city — what benefits events hang off. */
async function familyProfileIdsInCity(
  db: SupabaseClient,
  citySlug: string,
): Promise<Set<string>> {
  const filter = cityFilterFromSlug(citySlug);
  if (!filter) return new Set();

  const ids = new Set<string>();
  let scanned = 0;
  for (;;) {
    if (scanned >= MAX_ROWS) break;
    const { data, error } = await db
      .from("business_profiles")
      .select("id")
      .eq("type", "family")
      .in("city", filter.names)
      .eq("state", filter.state)
      .range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { id: string }[];
    if (rows.length === 0) break;
    for (const r of rows) ids.add(r.id);
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }
  return ids;
}

/** The email types that carry an ask to a provider. */
const QUESTION_EMAIL = "question_received";
const CONNECTION_EMAIL = "connection_request";

/** Only a send that came back successful counts as having reached anyone. */
const narrowSent = (emailType: string) => (q: Query) =>
  q.eq("email_type", emailType).eq("recipient_type", "provider").eq("status", "sent");

/**
 * CR2 — families in outreach, the mirror of CP2 and CW2.
 *
 * Counted as distinct recipient addresses rather than rows: twenty emails to
 * one family is one family. Family mail is keyed by address, not by a profile
 * id — plenty of it goes to people who never made a profile — so the address
 * is the only identity available and is the right one anyway.
 */
async function countFamiliesInOutreach(
  db: SupabaseClient,
  range: Range,
): Promise<number> {
  const recipients = new Set<string>();
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    let query = db
      .from("email_log")
      .select("recipient")
      // Both names are in use for the same audience; the newer routes write
      // "family", older ones "seeker".
      .in("recipient_type", ["family", "seeker"]);
    if (range.from) query = query.gte("created_at", range.from);
    if (range.to) query = query.lt("created_at", range.to);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { recipient: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.recipient) recipients.add(r.recipient.trim().toLowerCase());
    }
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  return recipients.size;
}

export async function getConversions(
  db: SupabaseClient,
  range: Range,
  citySlug: string | null = null,
): Promise<Conversions> {
  // Both key sets are resolved once, then shared by every count that needs
  // them, rather than re-read per node.
  const [providerKeys, familyIds] = citySlug
    ? await Promise.all([
        providerKeysInCity(db, citySlug),
        familyProfileIdsInCity(db, citySlug),
      ])
    : [null, null];

  const leadReceived = (q: Query) => q.eq("event_type", "lead_received");
  const benefitsCompleted = (q: Query) => q.eq("event_type", "benefits_completed");

  const [
    questions,
    connections,
    benefitsAssessments,
    questionsSent,
    connectionsSent,
    familiesInOutreach,
  ] = await Promise.all([
    providerKeys
      ? countKeyed(db, "provider_question_asks", "provider_id", range, providerKeys)
      : countAll(db, "provider_question_asks", range),
    providerKeys
      ? countKeyed(db, "provider_activity", "provider_id", range, providerKeys, leadReceived)
      : countAll(db, "provider_activity", range, leadReceived),
    familyIds
      ? countKeyed(db, "seeker_activity", "profile_id", range, familyIds, benefitsCompleted)
      : countAll(db, "seeker_activity", range, benefitsCompleted),
    providerKeys
      ? countKeyed(db, "email_log", "provider_id", range, providerKeys, narrowSent(QUESTION_EMAIL))
      : countAll(db, "email_log", range, narrowSent(QUESTION_EMAIL)),
    providerKeys
      ? countKeyed(db, "email_log", "provider_id", range, providerKeys, narrowSent(CONNECTION_EMAIL))
      : countAll(db, "email_log", range, narrowSent(CONNECTION_EMAIL)),
    countFamiliesInOutreach(db, range),
  ]);

  return {
    familiesInOutreach,
    questions,
    connections,
    benefitsAssessments,
    ctasTotal: questions + connections + benefitsAssessments,
    questionsSent,
    connectionsSent,
  };
}

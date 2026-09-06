import type { SupabaseClient } from "@supabase/supabase-js";

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
 * None of these carry visitor geo. It is recorded on page views, and these
 * are form submissions written through three different routes — so CR6 is an
 * all-cities figure and the caller has to say so when a city is selected.
 */

export interface Conversions {
  questions: number;
  connections: number;
  benefitsAssessments: number;
  /** CR6's total: the three CTA types beneath it. */
  ctasTotal: number;
}

type Range = { from: string | null; to: string | null };

async function countEvents(
  db: SupabaseClient,
  table: string,
  range: Range,
  eventType?: string,
): Promise<number> {
  let query = db.from(table).select("id", { count: "exact", head: true });
  if (eventType) query = query.eq("event_type", eventType);
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lt("created_at", range.to);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getConversions(
  db: SupabaseClient,
  range: Range,
): Promise<Conversions> {
  const [questions, connections, benefitsAssessments] = await Promise.all([
    countEvents(db, "provider_question_asks", range),
    countEvents(db, "provider_activity", range, "lead_received"),
    countEvents(db, "seeker_activity", range, "benefits_completed"),
  ]);

  return {
    questions,
    connections,
    benefitsAssessments,
    ctasTotal: questions + connections + benefitsAssessments,
  };
}

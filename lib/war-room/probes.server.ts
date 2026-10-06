import type { SupabaseClient } from "@supabase/supabase-js";
import { directoryHealthSummary } from "@/lib/providers/directory-health.server";

/**
 * Read-only investigation probes.
 *
 * War Room could always *design* the next probe for an open investigation and
 * never run it, so cause confidence never rose, nothing ever became
 * decision-ready, and every scan re-derived the same unknowns from the same
 * frozen evidence pack. This module is the missing half: a fixed menu of
 * bounded, read-only queries the investigation loop can actually execute.
 *
 * Deliberate constraints:
 * - The model picks a probe by id from an enum. It never writes a query.
 * - Every probe is read-only, row-capped, and window-bounded.
 * - Results are appended to the investigation event trail as `probe_completed`
 *   and summarized into the next scan's evidence, so a probe answers a question
 *   once instead of being re-asked forever.
 */

export const WAR_ROOM_PROBE_IDS = [
  "question_to_claim_conversion",
  "question_inventory_health",
  "provider_contactability",
  "traffic_by_page_family",
  "revenue_by_product",
  "support_backlog_composition",
  "benefits_finder_weekly",
  "directory_health",
  "none",
] as const;

export type WarRoomProbeId = (typeof WAR_ROOM_PROBE_IDS)[number];

/**
 * Probes that run every scan whether or not an open investigation asked.
 *
 * The others run only when a condition names them, which is right for an
 * investigation and wrong for a priority: nothing ever asked about the
 * Benefits Finder, so its line in the brief read "No measured number moved"
 * through a week of shipped Benefits work (TJ, 2026-10-05: "This is wrong").
 * A standing probe is the brief's own reading of a priority, taken daily.
 */
export const STANDING_PROBE_IDS: ReadonlyArray<Exclude<WarRoomProbeId, "none">> = ["benefits_finder_weekly", "directory_health"];

export type WarRoomProbeResult = {
  probeId: WarRoomProbeId;
  headline: string;
  detail: string;
  rows: Array<Record<string, string | number>>;
  caveat: string | null;
  measuredAt: string;
};

type ProbeRunner = (db: SupabaseClient) => Promise<Omit<WarRoomProbeResult, "probeId" | "measuredAt">>;

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const MAX_SCAN_ROWS = 60_000;
const CHUNK = 200;

function since(days = WINDOW_DAYS) {
  return new Date(Date.now() - days * DAY).toISOString();
}

/**
 * Page through a bounded select without ever loading an unbounded table.
 *
 * Callers must apply a stable total order (`.order("id")`). Range pagination
 * without one lets Postgres return rows in a different order per page, which
 * silently skips and duplicates rows. That is not hypothetical: an unordered
 * scan of the provider directory undercounted it by a third while building this.
 */
async function page<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  cap = MAX_SCAN_ROWS,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < cap; from += 1_000) {
    const { data, error } = await build(from, Math.min(from + 999, cap - 1));
    if (error) throw new Error(`war_room_probe_query_failed:${error.message}`);
    if (!data?.length) return { rows, truncated: false };
    rows.push(...data);
    if (data.length < 1_000) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * `provider_questions.provider_id` stores the directory *slug*, while
 * `provider_activity.provider_id` stores the canonical provider id. Nothing
 * else in War Room translated between them, which is why the question funnel
 * was invisible to it. Chunked so a 2,000-provider set never builds one URL.
 */
async function resolveSlugsToProviderIds(db: SupabaseClient, slugs: string[]) {
  const map = new Map<string, string>();
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const { data, error } = await db.from("olera-providers")
      .select("provider_id, slug, deleted")
      .in("slug", chunk);
    if (error) throw new Error(`war_room_probe_query_failed:${error.message}`);
    for (const row of (data ?? []) as Array<{ provider_id: string; slug: string; deleted: boolean | null }>) {
      if (row.slug && row.provider_id && !row.deleted) map.set(row.slug, row.provider_id);
    }
  }
  return map;
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${((100 * part) / whole).toFixed(2)}%` : "n/a";
}

/**
 * Counts inside headline and detail prose.
 *
 * The brief renders a probe's headline directly above its own rows, and the
 * rows are separator-formatted at render time. A raw interpolation puts "1408"
 * three lines above "1,408" and makes one measurement look like two.
 */
function n(value: number) {
  return value.toLocaleString("en-US");
}

/** Dollar amounts from cent-denominated columns, separated the same way. */
function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RUNNERS: Record<Exclude<WarRoomProbeId, "none">, ProbeRunner> = {
  /**
   * Does unanswered question volume actually pull providers into claiming?
   * This is the core monetization loop: question -> provider notified -> claim
   * -> revenue. It was previously unmeasurable because of the slug/id split.
   */
  question_to_claim_conversion: async (db) => {
    const from = since();
    const questions = await page<{ provider_id: string | null; created_at: string }>((lo, hi) =>
      db.from("provider_questions").select("provider_id, created_at")
        .gte("created_at", from).order("id", { ascending: true }).range(lo, hi));
    const claims = await page<{ provider_id: string | null; created_at: string }>((lo, hi) =>
      db.from("provider_activity").select("provider_id, created_at")
        .eq("event_type", "claim_completed").gte("created_at", from)
        .order("id", { ascending: true }).range(lo, hi));

    const slugs = [...new Set(questions.rows.map((q) => q.provider_id).filter((v): v is string => Boolean(v)))];
    const slugToId = await resolveSlugsToProviderIds(db, slugs);

    const questionProviders = new Map<string, { count: number; first: string }>();
    let unresolved = 0;
    for (const question of questions.rows) {
      if (!question.provider_id) continue;
      const id = slugToId.get(question.provider_id);
      if (!id) { unresolved += 1; continue; }
      const existing = questionProviders.get(id);
      if (!existing) questionProviders.set(id, { count: 1, first: question.created_at });
      else {
        existing.count += 1;
        if (question.created_at < existing.first) existing.first = question.created_at;
      }
    }
    const claimFirst = new Map<string, string>();
    for (const claim of claims.rows) {
      if (!claim.provider_id) continue;
      const current = claimFirst.get(claim.provider_id);
      if (!current || claim.created_at < current) claimFirst.set(claim.provider_id, claim.created_at);
    }

    const withQuestions = [...questionProviders.keys()];
    const converted = withQuestions.filter((id) => claimFirst.has(id));
    const questionFirst = converted.filter((id) => questionProviders.get(id)!.first < claimFirst.get(id)!);

    const { count: directorySize } = await db.from("olera-providers")
      .select("provider_id", { count: "exact", head: true })
      .or("deleted.is.null,deleted.eq.false");
    const withoutQuestions = Math.max(0, (directorySize ?? 0) - withQuestions.length);
    const claimsWithoutQuestions = [...claimFirst.keys()].filter((id) => !questionProviders.has(id)).length;

    const buckets: Array<[string, number, number]> = [["1", 1, 1], ["2-4", 2, 4], ["5-9", 5, 9], ["10+", 10, Infinity]];
    const rows = buckets.map(([label, lo, hi]) => {
      const group = withQuestions.filter((id) => {
        const asked = questionProviders.get(id)!.count;
        return asked >= lo && asked <= hi;
      });
      const claimed = group.filter((id) => claimFirst.has(id)).length;
      return { questions_on_page: label, providers: group.length, claimed, claim_rate: pct(claimed, group.length) };
    });
    rows.push({
      questions_on_page: "none",
      providers: withoutQuestions,
      claimed: claimsWithoutQuestions,
      claim_rate: pct(claimsWithoutQuestions, withoutQuestions),
    });

    const withRate = converted.length / Math.max(1, withQuestions.length);
    const withoutRate = claimsWithoutQuestions / Math.max(1, withoutQuestions);
    const lift = withoutRate > 0 ? (withRate / withoutRate).toFixed(1) : "n/a";

    return {
      headline: `Providers with questions claim at ${pct(converted.length, withQuestions.length)} versus ${pct(claimsWithoutQuestions, withoutQuestions)} without, a ${lift}x difference over ${WINDOW_DAYS} days.`,
      detail: `${n(questions.rows.length)} questions across ${n(withQuestions.length)} resolvable providers; ${n(converted.length)} of those providers claimed, and ${n(questionFirst.length)} of the ${n(converted.length)} received their first question before claiming. ${n(unresolved)} question rows (${pct(unresolved, questions.rows.length)}) could not be resolved to a live directory provider.`,
      rows,
      caveat: "Association, not proof of cause. Providers with more questions also tend to have more page traffic, and traffic may independently drive claiming. Treat the dose-response shape as suggestive until a traffic-matched comparison runs.",
    };
  },

  /** Is the question inventory actually usable as provider-acquisition bait? */
  question_inventory_health: async (db) => {
    const from = since(30);
    const total = await db.from("provider_questions").select("id", { count: "exact", head: true }).gte("created_at", from);
    const withEmail = await db.from("provider_questions").select("id", { count: "exact", head: true })
      .gte("created_at", from).not("asker_email", "is", null);
    const answered = await db.from("provider_questions").select("id", { count: "exact", head: true })
      .gte("created_at", from).not("answer", "is", null).not("answered_at", "is", null);
    const onClaimed = await db.from("provider_questions").select("id", { count: "exact", head: true })
      .gte("created_at", from).not("business_profile_id", "is", null);

    const questions = await page<{ provider_id: string | null }>((lo, hi) =>
      db.from("provider_questions").select("provider_id")
        .gte("created_at", from).order("id", { ascending: true }).range(lo, hi));
    const slugs = [...new Set(questions.rows.map((q) => q.provider_id).filter((v): v is string => Boolean(v)))];
    const resolved = await resolveSlugsToProviderIds(db, slugs);
    const orphaned = slugs.length - resolved.size;

    const count = total.count ?? 0;
    return {
      headline: `${n(count)} questions in 30 days; ${n(orphaned)} of ${n(slugs.length)} distinct provider pages holding them do not resolve to a live directory row.`,
      detail: `Only ${n(withEmail.count ?? 0)} askers (${pct(withEmail.count ?? 0, count)}) left an email, so answering is not a way to reach the family. ${n(onClaimed.count ?? 0)} (${pct(onClaimed.count ?? 0, count)}) sit on already-claimed providers, where they cannot pull a new claim. ${n(answered.count ?? 0)} were answered.`,
      rows: [
        { measure: "questions (30d)", value: count },
        { measure: "asker left an email", value: withEmail.count ?? 0 },
        { measure: "answered", value: answered.count ?? 0 },
        { measure: "on an already-claimed provider", value: onClaimed.count ?? 0 },
        { measure: "distinct provider pages", value: slugs.length },
        { measure: "pages not resolving to directory", value: orphaned },
      ],
      caveat: orphaned > 0
        ? "Unresolvable pages hold demand that cannot currently convert a provider. Confirm whether they are renamed, merged, or deleted before treating the count as lost inventory."
        : null,
    };
  },

  /** Can Olera even reach the providers holding unanswered demand? */
  provider_contactability: async (db) => {
    const from = since(30);
    const questions = await page<{ provider_id: string | null }>((lo, hi) =>
      db.from("provider_questions").select("provider_id").gte("created_at", from)
        .is("answer", null).order("id", { ascending: true }).range(lo, hi));
    const slugs = [...new Set(questions.rows.map((q) => q.provider_id).filter((v): v is string => Boolean(v)))];

    let reachable = 0;
    let unreachable = 0;
    const missing: string[] = [];
    for (let i = 0; i < slugs.length; i += CHUNK) {
      const { data, error } = await db.from("olera-providers")
        .select("slug, email, deleted").in("slug", slugs.slice(i, i + CHUNK));
      if (error) throw new Error(`war_room_probe_query_failed:${error.message}`);
      for (const row of (data ?? []) as Array<{ slug: string; email: string | null; deleted: boolean | null }>) {
        if (row.deleted) continue;
        if (row.email && row.email.includes("@")) reachable += 1;
        else { unreachable += 1; if (missing.length < 10) missing.push(row.slug); }
      }
    }
    return {
      headline: `${n(unreachable)} of ${n(reachable + unreachable)} provider pages holding unanswered questions have no usable email on file.`,
      detail: `Unanswered questions on an unreachable provider cannot be used to prompt a claim, so that share of demand inventory is inert until contact data is repaired. Examples: ${missing.slice(0, 5).join(", ") || "none"}.`,
      rows: [
        { measure: "pages with unanswered questions", value: reachable + unreachable },
        { measure: "reachable by email", value: reachable },
        { measure: "no usable email", value: unreachable },
      ],
      caveat: "Presence of an email address is not proof of deliverability. A bounce-verified count would be stronger.",
    };
  },

  /** Where did organic reach actually move, by page family? */
  traffic_by_page_family: async (db) => {
    const from = since(84).slice(0, 10);
    // This used to be a bare .limit(5_000) with no ORDER BY, against 17,979
    // matching rows. Postgres was free to return any 5,000 of them in any
    // order, so every family total was an arbitrary sample and the headline
    // reported +131.8% for a page family measured at -43% by the canonical
    // pipeline. Use the same paged, stably-ordered read the other probes use.
    const scan = await page<{
      page_category: string | null; organic_sessions: number | null;
      search_clicks: number | null; search_impressions: number | null; week_start: string;
    }>((lo, hi) => db.from("growth_page_metrics")
      .select("page_category, organic_sessions, search_clicks, search_impressions, week_start")
      .gte("week_start", from)
      .order("id", { ascending: true })
      .range(lo, hi));
    const rowsIn = scan.rows;
    if (!rowsIn.length) {
      return {
        headline: "No page-level growth metrics are recorded for the last twelve weeks.",
        detail: "growth_page_metrics is empty for this window, so the traffic movement cannot be attributed to a page family yet.",
        rows: [],
        caveat: "Run the weekly metrics collection before relying on this probe.",
      };
    }
    const allWeeks = [...new Set(rowsIn.map((r) => r.week_start))].sort();
    // Halves must hold the same number of weeks. weeks[floor(n/2)] as the
    // boundary put 3 weeks in the early half and 4 in the late half of a
    // 7-week window, a 33% bias that inflates every change upward. Drop the
    // oldest week when the count is odd rather than compare unequal periods.
    const weeks = allWeeks.length % 2 === 1 ? allWeeks.slice(1) : allWeeks;
    const midpoint = weeks[weeks.length / 2];
    const agg = new Map<string, { early: number; late: number }>();
    for (const row of rowsIn) {
      if (row.week_start < weeks[0]) continue;
      const key = row.page_category || "uncategorized";
      const bucket = agg.get(key) ?? { early: 0, late: 0 };
      const sessions = row.organic_sessions ?? 0;
      if (row.week_start < midpoint) bucket.early += sessions; else bucket.late += sessions;
      agg.set(key, bucket);
    }
    const rows = [...agg.entries()]
      .map(([family, v]) => ({
        page_family: family,
        earlier_half: v.early,
        later_half: v.late,
        change: v.early > 0 ? `${(((v.late - v.early) / v.early) * 100).toFixed(1)}%` : "n/a",
      }))
      .sort((a, b) => b.later_half - a.later_half);
    const worst = [...rows].filter((r) => r.change !== "n/a")
      .sort((a, b) => parseFloat(a.change) - parseFloat(b.change))[0];
    const direction = worst && parseFloat(worst.change) < 0 ? "fell most" : "rose least";
    const half = weeks.length / 2;
    return {
      headline: worst
        // Plain words: this headline is quoted to the founder in Slack, and
        // "the provider family" and "half-window" are not words he uses.
        ? `Organic sessions ${direction} on ${worst.page_family} pages at ${worst.change}, comparing the last ${half} weeks against the ${half} before them.`
        : "Organic sessions by page type are recorded but none shows a comparable change.",
      detail: `Comparing the last ${half} weeks against the ${half} before them, split at ${midpoint}, across ${rows.length} page types.`,
      rows,
      caveat: scan.truncated
        ? "Row cap reached: this read is incomplete and the totals understate every page type."
        : "Two equal blocks of weeks, not a seasonal trend. One unusual week can swing a small page type.",
    };
  },

  /** Is there any revenue motion at all, and where does the funnel stop? */
  revenue_by_product: async (db) => {
    const from = since(180);
    const { data, error } = await db.from("ad_campaign_requests")
      .select("status, ad_spend_cents, ad_budget_cents, created_at, ended_at, ended_reason, provider_reported_outcome")
      .gte("created_at", from).is("deleted_at", null).limit(1_000);
    if (error) throw new Error(`war_room_probe_query_failed:${error.message}`);
    const campaigns = (data ?? []) as Array<{
      status: string | null; ad_spend_cents: number | null; ended_at: string | null;
      ended_reason: string | null; provider_reported_outcome: string | null;
    }>;
    const byStatus = new Map<string, number>();
    let spend = 0;
    let reportedOutcomes = 0;
    for (const c of campaigns) {
      byStatus.set(c.status ?? "unknown", (byStatus.get(c.status ?? "unknown") ?? 0) + 1);
      spend += c.ad_spend_cents ?? 0;
      if (c.provider_reported_outcome) reportedOutcomes += 1;
    }
    return {
      headline: `${n(campaigns.length)} Ad Boost campaigns in 180 days, $${usd(spend)} of tracked ad spend, ${n(reportedOutcomes)} with a provider-reported outcome.`,
      detail: `Status mix: ${[...byStatus.entries()].map(([status, count]) => `${status} ${n(count)}`).join(", ") || "none"}. Ad Boost is the only consolidated revenue line, so this does not describe company-wide revenue.`,
      rows: [...byStatus.entries()].map(([status, count]) => ({ status, campaigns: count })),
      caveat: "Ad spend is what the campaign reports, not Olera revenue. Subscription and other lines are not consolidated here.",
    };
  },

  /** What is actually sitting in the support backlog? */
  support_backlog_composition: async (db) => {
    const { data, error } = await db.from("support_email_threads")
      .select("state, priority, category, last_message_at, handled_at")
      .neq("state", "handled").limit(2_000);
    if (error) throw new Error(`war_room_probe_query_failed:${error.message}`);
    const threads = (data ?? []) as Array<{
      state: string | null; priority: string | null; category: string | null; last_message_at: string | null;
    }>;
    const byCategory = new Map<string, number>();
    const byPriority = new Map<string, number>();
    let stale = 0;
    const cutoff = since(30);
    for (const t of threads) {
      byCategory.set(t.category ?? "uncategorized", (byCategory.get(t.category ?? "uncategorized") ?? 0) + 1);
      byPriority.set(t.priority ?? "none", (byPriority.get(t.priority ?? "none") ?? 0) + 1);
      if (t.last_message_at && t.last_message_at < cutoff) stale += 1;
    }
    return {
      headline: `${n(threads.length)} unhandled support threads, ${n(stale)} with no message in the last 30 days.`,
      detail: `Priority mix: ${[...byPriority.entries()].map(([priority, count]) => `${priority} ${n(count)}`).join(", ") || "none"}. A thread untouched for a month is unlikely to still be a live customer conversation, so the headline backlog probably overstates live obligation.`,
      rows: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([category, count]) => ({ category, threads: count })),
      caveat: "Capped at 2,000 threads. The mailbox source has been backfilling, so duplicates are possible.",
    };
  },

  /**
   * The Benefits Finder, measured on outcomes: families who finished it, and
   * what the Care Navigator sent them. Last 7 days against the 7 before, so
   * the headline's first figure is the one the brief compares day to day.
   *
   * A completion is a results token (`benefits_results_tokens`): the row
   * `/api/benefits/save-results` writes once the finder has enough to render
   * a results page. One family can finish it more than once, so families are
   * distinct profiles and runs are rows. Letters are the cascade's own email
   * log types; the text companion is `family_answer_jobs` with status `sent`.
   */
  benefits_finder_weekly: async (db) => {
    const weekAgo = since(7);
    const twoWeeksAgo = since(14);
    const fail = (error: { message: string }) => new Error(`war_room_probe_query_failed:${error.message}`);

    const tokens = async (from: string, to: string | null) => {
      let query = db.from("benefits_results_tokens").select("profile_id, created_at").gte("created_at", from).limit(5_000);
      if (to) query = query.lt("created_at", to);
      const { data, error } = await query;
      if (error) throw fail(error);
      const rows = (data ?? []) as Array<{ profile_id: string | null }>;
      return { runs: rows.length, families: new Set(rows.map((row) => row.profile_id).filter(Boolean)).size };
    };
    const emails = async (type: string, from: string, to: string | null) => {
      let query = db.from("email_log").select("id", { count: "exact", head: true }).eq("email_type", type).gte("created_at", from);
      if (to) query = query.lt("created_at", to);
      const { count, error } = await query;
      if (error) throw fail(error);
      return count ?? 0;
    };
    const texts = async (from: string, to: string | null) => {
      let query = db.from("family_answer_jobs").select("id", { count: "exact", head: true }).eq("status", "sent").gte("created_at", from);
      if (to) query = query.lt("created_at", to);
      const { count, error } = await query;
      if (error) throw fail(error);
      return count ?? 0;
    };

    const [now, prior, firstStep, firstStepPrior, checkIn, checkInPrior, firstStepSms, checkInSms, companion, companionPrior] = await Promise.all([
      tokens(weekAgo, null), tokens(twoWeeksAgo, weekAgo),
      emails("benefits_first_step", weekAgo, null), emails("benefits_first_step", twoWeeksAgo, weekAgo),
      emails("benefits_check_in", weekAgo, null), emails("benefits_check_in", twoWeeksAgo, weekAgo),
      emails("benefits_first_step_sms", weekAgo, null), emails("benefits_check_in_sms", weekAgo, null),
      texts(weekAgo, null), texts(twoWeeksAgo, weekAgo),
    ]);

    return {
      headline: `${n(now.families)} families finished the Benefits Finder in the last 7 days, ${n(prior.families)} the week before. ${n(firstStep)} first-step letters and ${n(checkIn)} check-ins went out.`,
      detail: `${n(now.runs)} finder runs this week (${n(prior.runs)} prior); a family can finish it more than once. Letters the week before: ${n(firstStepPrior)} first-step, ${n(checkInPrior)} check-ins. By text: ${n(firstStepSms)} first-step and ${n(checkInSms)} check-in messages this week, and ${n(companion)} text-companion answers (${n(companionPrior)} prior). A finish is a results page the family could open; it says nothing about whether they applied for anything.`,
      rows: [
        { measure: "Families finished", this_week: now.families, prior_week: prior.families },
        { measure: "Finder runs", this_week: now.runs, prior_week: prior.runs },
        { measure: "First-step letters", this_week: firstStep, prior_week: firstStepPrior },
        { measure: "Check-ins", this_week: checkIn, prior_week: checkInPrior },
        { measure: "Text-companion answers", this_week: companion, prior_week: companionPrior },
      ],
      caveat: "Counts what Olera sent, not what families did with it. Nothing here measures an application started or an award received.",
    };
  },

  /**
   * The directory's own ledger (provider_health_actions, migration 272): what
   * the system did to listings this week and how much of the directory it has
   * checked against Google. A quiet week reads as loudly as a busy one, and a
   * stalled cron reads as "no action in N days", which is the whole reason the
   * ledger exists (TJ, 6 Oct 2026: earlier plans "just disappear").
   */
  directory_health: async (db) => {
    const s = await directoryHealthSummary(db, 7);
    const archived = s.byKind.closed_archived ?? 0;
    const renamed = s.byKind.rename_applied ?? 0;
    const flagged = (s.byKind.closed_temporarily ?? 0) + (s.byKind.rename_flagged ?? 0) + (s.byKind.website_dead ?? 0) + (s.byKind.category_flagged ?? 0) + (s.byKind.duplicate_flagged ?? 0);
    const total = s.checked + s.unchecked;
    const coverage = total ? Math.round((s.checked / total) * 100) : 0;
    const sinceLast = s.lastActionAt ? Math.floor((Date.now() - Date.parse(s.lastActionAt)) / DAY) : null;
    const quiet = sinceLast === null ? "The system has never acted on the directory." : sinceLast > 7 ? ` Last action ${n(sinceLast)} days ago.` : "";
    return {
      headline: `${n(archived)} closed providers archived and ${n(renamed)} renamed this week, ${n(s.openFlags)} flags waiting. ${n(coverage)}% of the directory checked against Google.${sinceLast === null ? "" : quiet}`,
      detail: `${n(s.checked)} providers have a Google status read; ${n(s.unchecked)} with a Place ID never have; ${n(s.deadWebsites)} with a dead website are first in line for the next free check${s.deadNoGoogle ? ` and ${n(s.deadNoGoogle)} with a dead website have no Google listing, so a person decides` : ""}. This week's ledger: ${Object.entries(s.byKind).map(([k, v]) => `${k.replace(/_/g, " ")} ${n(v)}`).join(", ") || "nothing"}. Archives and cosmetic renames apply themselves and can be undone from /admin/directory/health; temporary closures and substantive renames wait there for a person.${sinceLast === null ? ` ${quiet}` : ""}`,
      rows: Object.entries(s.byKind).map(([kind, count]) => ({ action: kind.replace(/_/g, " "), this_week: count })),
      caveat: "Google status is read on 10,000 providers a month at $0 (the free Pro tier plus the review refresh), so coverage grows about 13 points a month. A provider Google marks closed is archived on Google's word; the undo is one click.",
    };
  },
};

export function warRoomProbeMenu() {
  return [
    { id: "question_to_claim_conversion", question: "Does unanswered question volume actually drive provider claims?" },
    { id: "question_inventory_health", question: "Is the question inventory usable as provider-acquisition demand?" },
    { id: "provider_contactability", question: "Can Olera reach the providers holding unanswered questions?" },
    { id: "traffic_by_page_family", question: "Which page family gained or lost organic reach?" },
    { id: "revenue_by_product", question: "Where does the Ad Boost revenue funnel stop?" },
    { id: "support_backlog_composition", question: "What is actually in the support backlog?" },
    { id: "benefits_finder_weekly", question: "How many families finished the Benefits Finder this week, and what did the Navigator send them?" },
    { id: "directory_health", question: "What did the system do to the provider directory this week, and how much of it has been checked against Google?" },
    { id: "none", question: "No probe in the menu can advance this condition." },
  ] as const;
}

export function isWarRoomProbeId(value: unknown): value is WarRoomProbeId {
  return typeof value === "string" && (WAR_ROOM_PROBE_IDS as readonly string[]).includes(value);
}

export async function runWarRoomProbe(db: SupabaseClient, probeId: WarRoomProbeId): Promise<WarRoomProbeResult> {
  if (probeId === "none") throw new Error("war_room_probe_not_runnable:none");
  const runner = RUNNERS[probeId];
  if (!runner) throw new Error(`war_room_unknown_probe:${probeId}`);
  const result = await runner(db);
  return { ...result, probeId, measuredAt: new Date().toISOString() };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WarRoomDiscoveryRun,
  WarRoomProbeReading,
  WarRoomScanCost,
} from "@/lib/war-room/types";

/**
 * The founder-facing half of the investigation loop.
 *
 * War Room spends most of its compute deciding that nothing is decision-ready,
 * which is correct and also means the interruption gate is not where its value
 * lives. The value is the probe answers: bounded, read-only measurements of the
 * business that nobody had that morning. `probes.server.ts` writes them to the
 * investigation event trail so the *next scan* can reason over them. This module
 * reads the same rows so a *person* can.
 *
 * Nothing here re-measures anything. A brief is only ever as fresh as the last
 * scan, and it says so.
 */

const PROBE_LABELS: Record<string, { label: string; question: string }> = {
  question_to_claim_conversion: {
    label: "Question to claim",
    question: "Does question volume on a page actually pull that provider into claiming?",
  },
  question_inventory_health: {
    label: "Question inventory",
    question: "Is the question inventory usable as provider-acquisition demand?",
  },
  provider_contactability: {
    label: "Provider reachability",
    question: "Can Olera reach the providers holding unanswered questions?",
  },
  benefits_finder_weekly: {
    label: "Benefits Finder",
    question: "How many families finished the Benefits Finder this week, and what did the Navigator send them?",
  },
  traffic_by_page_family: {
    label: "Organic traffic",
    question: "Which page family gained or lost organic reach?",
  },
  revenue_by_product: {
    label: "Revenue",
    question: "Where does the Ad Boost funnel stop?",
  },
  support_backlog_composition: {
    label: "Support backlog",
    question: "What is actually in the support backlog?",
  },
};

type ProbeEventRow = { details: Record<string, unknown> | null; created_at: string };

function humanizeProbeId(probeId: string) {
  return probeId.replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function readRows(value: unknown): Array<Record<string, string | number>> {
  if (!Array.isArray(value)) return [];
  const rows: Array<Record<string, string | number>> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row: Record<string, string | number> = {};
    for (const [key, cell] of Object.entries(entry as Record<string, unknown>)) {
      if (typeof cell === "string" || typeof cell === "number") row[key] = cell;
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows.slice(0, 12);
}

/**
 * Latest answer per probe, newest first.
 *
 * Deduplicated by probe id: the same probe re-run tomorrow supersedes today's
 * answer rather than stacking beside it, so the brief stays a current reading of
 * the business instead of a log.
 */
export async function loadWarRoomBriefing(db: SupabaseClient): Promise<WarRoomProbeReading[]> {
  // A brief is a bonus surface on a page that must still load. A missing
  // migration 179 or a dropped connection should cost the reader the brief,
  // not the proposal queue -- and the two failures arrive differently: a query
  // error comes back on `error`, a transport failure rejects. Catching only the
  // first would let a network blip 500 the whole dashboard.
  let data: ProbeEventRow[] = [];
  try {
    const result = await db.from("war_room_investigation_events")
      .select("details, created_at")
      .eq("event_type", "probe_completed")
      .order("created_at", { ascending: false })
      .limit(60);
    if (result.error) return [];
    data = (result.data ?? []) as ProbeEventRow[];
  } catch {
    return [];
  }

  /**
   * Did this number actually move?
   *
   * Compared on a threshold, never on equality. Probe headlines carry counts
   * that tick on their own -- a question total going 1,658 to 1,662 -- and a
   * string comparison calls that a change every single morning. That is the
   * defect that made every stalled condition report progress for thirty-six
   * days, and reproducing it here would refill the brief with the same noise
   * by a different route.
   *
   * Ten percent on any figure in the headline. Below that it is drift.
   */
  const MOVEMENT_THRESHOLD = 0.1;
  const figuresIn = (headline: string): number[] =>
    (headline.match(/-?[\d,]+\.?\d*/g) ?? [])
      .map((raw) => Number(raw.replace(/,/g, "")))
      .filter((n) => Number.isFinite(n));

  const movementOf = (current: string, previous: string | null): "new" | "moved" | "steady" => {
    if (!previous) return "new";
    const now = figuresIn(current);
    const before = figuresIn(previous);
    // Different shape of sentence, not just different digits: something
    // structural changed and it is worth reading.
    if (now.length !== before.length) return "moved";
    if (!now.length) return current.trim() === previous.trim() ? "steady" : "moved";
    return now.some((value, i) => {
      const prior = before[i];
      if (prior === 0) return value !== 0;
      return Math.abs(value - prior) / Math.abs(prior) >= MOVEMENT_THRESHOLD;
    }) ? "moved" : "steady";
  };

  const seen = new Set<string>();
  const readings: WarRoomProbeReading[] = [];
  for (const row of data) {
    const details = row.details ?? {};
    const probeId = typeof details.probe_id === "string" ? details.probe_id : null;
    const headline = typeof details.headline === "string" ? details.headline : null;
    if (!probeId || !headline || probeId === "none" || seen.has(probeId)) continue;
    seen.add(probeId);
    // The same fetch already holds this probe's earlier readings, newest first,
    // so the comparison costs nothing extra.
    const previousHeadline = data
      .filter((other) => (other.details ?? {}).probe_id === probeId && other !== row)
      .map((other) => (other.details ?? {}).headline)
      .find((value): value is string => typeof value === "string" && Boolean(value)) ?? null;
    const known = PROBE_LABELS[probeId];
    readings.push({
      probeId,
      label: known?.label ?? humanizeProbeId(probeId),
      question: known?.question ?? "",
      headline,
      detail: typeof details.detail === "string" ? details.detail : "",
      rows: readRows(details.rows),
      caveat: typeof details.caveat === "string" && details.caveat ? details.caveat : null,
      measuredAt: typeof details.measured_at === "string" ? details.measured_at : row.created_at,
      movement: movementOf(headline, previousHeadline),
      previousHeadline,
    });
  }
  return readings;
}

/**
 * Published list price per million tokens.
 *
 * Deliberately a small table rather than a live lookup: an unknown model
 * reports its token counts with a null price instead of guessing a number the
 * founder might act on.
 */
const MODEL_PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  // $2/$10, not $3/$15. The introductory price announced at launch became the
  // standard price; the scheduled September increase never happened. The stale
  // row overstated every Sonnet pass by half.
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // The dated id is what the API is actually called with, and it is what the
  // cost ledger records. Without this row a Haiku pass prices as unknown and
  // silently drops out of the total.
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

/**
 * What the last scan cost.
 *
 * The run row already records tokens; nothing here measures anything new. This
 * only prices them, because a daily cron that buys a full reasoning pass should
 * not be an unknown number on the founder's own dashboard.
 */
export function warRoomScanCost(run: WarRoomDiscoveryRun | null): WarRoomScanCost | null {
  if (!run) return null;
  const inputTokens = run.input_tokens ?? 0;
  const outputTokens = run.output_tokens ?? 0;
  if (!inputTokens && !outputTokens) return null;
  // Price per call when the ledger is there, because passes no longer share a
  // model. Pricing a mixed run at the run's single `model` column overstates
  // every scan where a pass ran on something cheaper -- the brief would report
  // a saving it had not made, which is worse than reporting nothing.
  const ledger = (run.source_summary as { cost_ledger?: unknown } | null)?.cost_ledger;
  if (Array.isArray(ledger) && ledger.length) {
    const entries = ledger as Array<{ model?: string; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheCreationTokens?: number }>;
    let usd = 0;
    let priced = true;
    for (const entry of entries) {
      const entryPrice = MODEL_PRICE_PER_MTOK[entry.model ?? ""];
      if (!entryPrice) { priced = false; break; }
      // Cached tokens are not in inputTokens. Reads bill at a tenth of the
      // input price, writes at 1.25x; leaving them out would understate a
      // cached scan and report a saving bigger than the real one.
      usd += ((entry.inputTokens ?? 0) * entryPrice.input
        + (entry.cacheReadTokens ?? 0) * entryPrice.input * 0.1
        + (entry.cacheCreationTokens ?? 0) * entryPrice.input * 1.25
        + (entry.outputTokens ?? 0) * entryPrice.output) / 1_000_000;
    }
    const models = [...new Set(entries.map((entry) => entry.model).filter(Boolean))] as string[];
    if (priced) {
      return {
        model: models.length === 1 ? models[0] : models.join(" + "),
        inputTokens,
        outputTokens,
        usd,
      };
    }
  }

  const price = MODEL_PRICE_PER_MTOK[run.model];
  return {
    model: run.model,
    inputTokens,
    outputTokens,
    usd: price
      ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000
      : null,
  };
}

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectPageMetricsForRanges } from "@/lib/growth/collector.server";
import type { GrowthPageMetric } from "@/lib/growth/types";

/**
 * Cortex's daily organic read.
 *
 * TJ, 2026-10-02: "Organic traffic: it would be good to do a daily scan and
 * suggest actions ... What's going on? What's broken? How can we improve?
 * What's going well? What are some out-of-the-box things? Really push it
 * here. Don't just give me cookie-cutter summaries ... It should get better
 * over time itself."
 *
 * Numbers come first and are computed here, not by the model: live GA4
 * Organic Search and Search Console per page, the last 28 days ending 3 days
 * ago (Search Console's lag) against the 28 before, classified provider,
 * benefit and editorial exactly as growth_page_metrics is. The model gets
 * those findings, its own last reads with whether their target number moved,
 * and the list of what is already fixed, and writes the read and one action.
 * The report's numbers are rendered from the findings, so the model cannot
 * misquote them. Report and propose only: an approved action becomes a
 * handoff brief; nothing here changes the site.
 */

export type OrganicAction = { title: string; why: string; metric: string; brief: string };
export type OrganicRead = { synopsis: string[]; section: string; action: OrganicAction | null; costUsd: number };

type Category = "provider" | "benefit" | "editorial";
const CATEGORIES: Category[] = ["provider", "benefit", "editorial"];
const DAY = 86_400_000;
const MODEL = () => process.env.CORTEX_ORGANIC_MODEL || "claude-sonnet-5";
const PRICE = { input: 2, output: 10 }; // per million tokens, as briefing.server.ts prices Sonnet 5
const COMPETITOR_REFRESH_DAYS = 7;
const COMPETITORS = ["A Place for Mom (aplaceformom.com)", "Caring.com", "SeniorAdvisor.com / Seniorly.com"];

// ---------------------------------------------------------------------------
// Windows

export type OrganicWindows = { start: string; end: string; prevStart: string; prevEnd: string };

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Last 28 days ending 3 days before today (UTC), and the 28 before that. */
export function organicWindows(now = new Date()): OrganicWindows {
  const today = Date.parse(iso(now.getTime()));
  const end = today - 3 * DAY;
  const start = end - 27 * DAY;
  const prevEnd = start - DAY;
  const prevStart = prevEnd - 27 * DAY;
  return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd) };
}

// ---------------------------------------------------------------------------
// Deterministic findings

export type PageRow = { path: string; category: Category; sessions: number; clicks: number; impressions: number; position: number | null };
export type PageDelta = {
  path: string;
  category: Category;
  sessions: [number, number];
  clicks: [number, number];
  impressions: [number, number];
  ctr: [number, number];
  position: [number | null, number | null];
};
export type CategoryTotals = { sessions: [number, number]; clicks: [number, number]; impressions: [number, number]; pages: number };
export type OrganicFindings = {
  windows: OrganicWindows;
  totals: CategoryTotals;
  categories: Record<Category, CategoryTotals>;
  losers: PageDelta[];
  gainers: PageDelta[];
  ctrCollapses: PageDelta[];
  positionDrops: PageDelta[];
  impressionLosses: PageDelta[];
  /** How concentrated the provider-page change is: the top 10 provider URLs' share of it, and the rest. */
  providerAttribution: { totalDelta: number; top10Delta: number; residual: number; pagesDown: number; pagesUp: number };
};

const toRow = (metric: GrowthPageMetric): PageRow => ({
  path: metric.page_path,
  category: metric.page_category as Category,
  sessions: metric.organic_sessions,
  clicks: metric.search_clicks,
  impressions: metric.search_impressions,
  position: metric.search_position,
});

const ctrOf = (clicks: number, impressions: number) => (impressions > 0 ? clicks / impressions : 0);
const pct = (now: number, before: number) => (before > 0 ? (now - before) / before : now > 0 ? 1 : 0);

/** Pure: compare two windows of page rows. A page missing from a window counts as zero there. */
export function analyzeOrganic(current: PageRow[], previous: PageRow[], windows: OrganicWindows): OrganicFindings {
  const paths = new Set([...current.map((row) => row.path), ...previous.map((row) => row.path)]);
  const cur = new Map(current.map((row) => [row.path, row]));
  const prev = new Map(previous.map((row) => [row.path, row]));
  const deltas: PageDelta[] = [...paths].map((path) => {
    const a = cur.get(path);
    const b = prev.get(path);
    const category = (a ?? b)!.category;
    return {
      path,
      category,
      sessions: [a?.sessions ?? 0, b?.sessions ?? 0],
      clicks: [a?.clicks ?? 0, b?.clicks ?? 0],
      impressions: [a?.impressions ?? 0, b?.impressions ?? 0],
      ctr: [ctrOf(a?.clicks ?? 0, a?.impressions ?? 0), ctrOf(b?.clicks ?? 0, b?.impressions ?? 0)],
      position: [a?.position ?? null, b?.position ?? null],
    };
  });

  const sum = (rows: PageDelta[]): CategoryTotals => ({
    sessions: [rows.reduce((s, r) => s + r.sessions[0], 0), rows.reduce((s, r) => s + r.sessions[1], 0)],
    clicks: [rows.reduce((s, r) => s + r.clicks[0], 0), rows.reduce((s, r) => s + r.clicks[1], 0)],
    impressions: [rows.reduce((s, r) => s + r.impressions[0], 0), rows.reduce((s, r) => s + r.impressions[1], 0)],
    pages: rows.length,
  });
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, sum(deltas.filter((d) => d.category === c))])) as Record<Category, CategoryTotals>;

  const sessionDelta = (d: PageDelta) => d.sessions[0] - d.sessions[1];
  const clickDelta = (d: PageDelta) => d.clicks[0] - d.clicks[1];
  // Rank by the larger of the two signals, sessions (GA4) and clicks (Search Console).
  const movement = (d: PageDelta) => (Math.abs(sessionDelta(d)) >= Math.abs(clickDelta(d)) ? sessionDelta(d) : clickDelta(d));
  const top = (rows: PageDelta[], by: (d: PageDelta) => number, n = 8) => [...rows].sort((x, y) => by(y) - by(x)).slice(0, n);

  const losers = top(deltas.filter((d) => movement(d) <= -5 && Math.max(d.sessions[1], d.clicks[1]) >= 10), (d) => -movement(d));
  const gainers = top(deltas.filter((d) => movement(d) >= 5), movement);

  // Search still shows the page about as often, at about the same rank, but
  // fewer people click: the result lost something on the page of results.
  const ctrCollapses = top(deltas.filter((d) => {
    const [ia, ib] = d.impressions;
    const [pa, pb] = d.position;
    return ib >= 200 && ia >= ib * 0.85 && pa !== null && pb !== null && Math.abs(pa - pb) <= 1.5
      && d.ctr[1] > 0 && d.ctr[0] <= d.ctr[1] * 0.7 && clickDelta(d) <= -5;
  }), (d) => -clickDelta(d));

  // Position numbers grow as rank worsens.
  const positionDrops = top(deltas.filter((d) => {
    const [pa, pb] = d.position;
    return d.impressions[1] >= 200 && pa !== null && pb !== null && pa - pb >= 3;
  }), (d) => (d.position[0] ?? 0) - (d.position[1] ?? 0));

  const impressionLosses = top(deltas.filter((d) => d.impressions[1] >= 300 && d.impressions[0] <= d.impressions[1] * 0.6), (d) => d.impressions[1] - d.impressions[0]);

  const providerRows = deltas.filter((d) => d.category === "provider");
  const providerTotal = providerRows.reduce((s, d) => s + sessionDelta(d), 0);
  // The ten URLs moving most in the same direction as the total.
  const sameWay = [...providerRows].sort((x, y) => (providerTotal < 0 ? sessionDelta(x) - sessionDelta(y) : sessionDelta(y) - sessionDelta(x))).slice(0, 10);
  const top10 = sameWay.reduce((s, d) => s + sessionDelta(d), 0);

  return {
    windows,
    totals: sum(deltas),
    categories,
    losers,
    gainers,
    ctrCollapses,
    positionDrops,
    impressionLosses,
    providerAttribution: {
      totalDelta: providerTotal,
      top10Delta: top10,
      residual: providerTotal - top10,
      pagesDown: providerRows.filter((d) => sessionDelta(d) < 0).length,
      pagesUp: providerRows.filter((d) => sessionDelta(d) > 0).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Target metrics: what an action should move, read again on later days

export type TargetSpec = { scope: "page" | "category" | "total"; key: string; measure: "organic_sessions" | "search_clicks" | "search_impressions" | "search_ctr" | "search_position" };

export function targetString(spec: TargetSpec): string {
  return `${spec.scope}:${spec.key}:${spec.measure}`;
}

export function parseTarget(value: string | null | undefined): TargetSpec | null {
  const match = value?.match(/^(page|category|total):(.*):(organic_sessions|search_clicks|search_impressions|search_ctr|search_position)$/);
  return match ? { scope: match[1] as TargetSpec["scope"], key: match[2], measure: match[3] as TargetSpec["measure"] } : null;
}

/** The current-window value of a target, from the page rows. Null when the page isn't in the data. */
export function readTarget(spec: TargetSpec, rows: PageRow[]): number | null {
  const scoped = spec.scope === "page" ? rows.filter((r) => r.path === spec.key) : spec.scope === "category" ? rows.filter((r) => r.category === spec.key) : rows;
  if (!scoped.length) return spec.scope === "page" ? null : 0;
  const clicks = scoped.reduce((s, r) => s + r.clicks, 0);
  const impressions = scoped.reduce((s, r) => s + r.impressions, 0);
  switch (spec.measure) {
    case "organic_sessions": return scoped.reduce((s, r) => s + r.sessions, 0);
    case "search_clicks": return clicks;
    case "search_impressions": return impressions;
    case "search_ctr": return impressions > 0 ? clicks / impressions : 0;
    case "search_position": {
      const weighted = scoped.filter((r) => r.position !== null && r.impressions > 0);
      const w = weighted.reduce((s, r) => s + r.impressions, 0);
      return w > 0 ? weighted.reduce((s, r) => s + (r.position as number) * r.impressions, 0) / w : null;
    }
  }
}

function describeTarget(spec: TargetSpec, value: number | null): string {
  const measure = { organic_sessions: "organic sessions", search_clicks: "search clicks", search_impressions: "search impressions", search_ctr: "search CTR", search_position: "average position" }[spec.measure];
  const where = spec.scope === "page" ? spec.key : spec.scope === "category" ? `all ${spec.key} pages` : "all classified pages";
  return `${measure} on ${where} (28 days): ${formatMeasure(spec.measure, value)}`;
}

function formatMeasure(measure: TargetSpec["measure"], value: number | null): string {
  if (value === null) return "not in the data";
  if (measure === "search_ctr") return `${(value * 100).toFixed(1)}%`;
  if (measure === "search_position") return value.toFixed(1);
  return Math.round(value).toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Memory (cortex_organic_reads, migration 268). Missing table: read still runs.

type PastRead = {
  read_date: string;
  synopsis: string[] | null;
  action: (OrganicAction & { target?: string }) | null;
  target_metric: string | null;
  target_baseline: number | null;
  competitor_notes: string | null;
  competitor_checked_at: string | null;
};

const tableMissing = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "")));

async function pastReads(db: SupabaseClient): Promise<{ rows: PastRead[]; available: boolean }> {
  const { data, error } = await db.from("cortex_organic_reads")
    .select("read_date, synopsis, action, target_metric, target_baseline, competitor_notes, competitor_checked_at")
    .order("read_date", { ascending: false })
    .limit(10);
  if (error) {
    if (!tableMissing(error)) console.error("[cortex] organic memory read failed:", error.message);
    return { rows: [], available: false };
  }
  return { rows: (data ?? []) as PastRead[], available: true };
}

// ---------------------------------------------------------------------------
// Competitors: one Perplexity call at most every 7 days, cached in memory.

async function competitorNotes(past: PastRead[], now: Date): Promise<{ notes: string | null; checkedAt: string | null; costUsd: number; fresh: boolean }> {
  const last = past.find((row) => row.competitor_checked_at && row.competitor_notes);
  if (last && now.getTime() - Date.parse(last.competitor_checked_at!) < COMPETITOR_REFRESH_DAYS * DAY) {
    return { notes: last.competitor_notes, checkedAt: last.competitor_checked_at, costUsd: 0, fresh: false };
  }
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { notes: last?.competitor_notes ?? null, checkedAt: last?.competitor_checked_at ?? null, costUsd: 0, fresh: false };
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        temperature: 0,
        max_tokens: 900,
        messages: [
          { role: "system", content: "You track SEO and content moves by senior-care directories for a competitor. Report only things you can source, each with its URL and date. No speculation, no em dashes. Plain bullets." },
          { role: "user", content: `Today is ${iso(now.getTime())}. In the last 30 days, what have these sites changed or launched that affects Google search: new page types or sections, city or provider page changes, content campaigns, schema or reviews changes, notable ranking gains or losses reported publicly? ${COMPETITORS.join("; ")}. At most 4 bullets per site; say "nothing found" for a site with nothing sourced.` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Perplexity answered ${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const notes = noDashes(body.choices?.[0]?.message?.content?.trim() ?? "") || null;
    // sonar: $1 per million tokens each way plus about $0.005 a request.
    const costUsd = 0.005 + ((body.usage?.prompt_tokens ?? 0) + (body.usage?.completion_tokens ?? 0)) / 1_000_000;
    return { notes, checkedAt: now.toISOString(), costUsd, fresh: true };
  } catch (error) {
    console.error("[cortex] competitor check failed:", error instanceof Error ? error.message : String(error));
    return { notes: last?.competitor_notes ?? null, checkedAt: last?.competitor_checked_at ?? null, costUsd: 0, fresh: false };
  }
}

// ---------------------------------------------------------------------------
// The model's read

const KNOWN_FIXED = [
  "Google's secondary crawler was blocked by Olera's own firewall; crawling fell 70% in late August. Fixed (TJ, #marketing-team, 7 Sep).",
  "16,000 providers pointed at dead image hosts, making about 7% of Google's visits errors. Fixed.",
  "50 city pages rendered empty while in the sitemap, hiding 1,334 providers. Fixed.",
  "19 brand hub pages added, covering 4,026 franchise locations. Shipped.",
  "Search Console's 12,280 404s (Chantel, 7 Sep): of 1,000 exportable URLs, 225 were Next.js build chunks (ignorable) and 761 were /provider/ pages. Already reported.",
];

const RULES = [
  "Never use or quote GA4 total users: about 42% of mid-2026 GA4 traffic is bot traffic from one AWS datacentre in Boardman, Oregon.",
  "Never use provider_activity page_view counts: they are bot-inclusive server events, not organic reach.",
  "Never use the benefits_intake CTA on provider pages: the module does not render; about 43,000 of 50,000 rows are phantom.",
  "Use only the numbers in FINDINGS. Do not invent a number, a percentage, a date or a URL.",
  "Name specific URLs from FINDINGS, not page types, whenever you make a claim about a page.",
  "No em dashes or en dashes anywhere. Use commas, periods or colons.",
];

const SYSTEM = `You are the chief marketing officer for Olera (olera.care), a senior-care marketplace: families find care providers; Olera also runs a large free senior-benefits guide. Organic search is the main acquisition channel. You write a daily read for the founder, TJ, who explicitly rejected cookie-cutter summaries: push hard, be specific, look around the corner, and get better every day by checking whether your past recommendations moved their numbers.

Answer five questions from the data: what's going on, what's broken, how to improve, what's going well, and one out-of-the-box play nobody on the team would think of. Then propose exactly one action TJ can approve today. An approved action becomes a brief for an engineer or content session; it must be concrete enough to execute without asking, and it must name the single number it should move.

Never repeat a recommendation that a past read already made unless its number has not moved and you say why it is worth pushing again. Never re-flag anything on the ALREADY FIXED list. If a past recommendation worked, say so in "going well".

Rules:
${RULES.map((rule) => `- ${rule}`).join("\n")}

Reply with JSON only, no code fence:
{
  "synopsis": ["up to 3 lines for a phone, each under 140 characters, numbers and named URLs"],
  "going_on": "2 to 4 sentences",
  "broken": ["specific problems, each with a URL or a number"],
  "improve": ["specific moves, each tied to a URL or a number"],
  "going_well": ["specific wins"],
  "out_of_the_box": "one unconventional play, 2 to 3 sentences",
  "action": {
    "title": "imperative, under 80 characters",
    "why": "1 to 2 sentences with the number",
    "target": { "scope": "page" | "category" | "total", "key": "<page path, or provider|benefit|editorial, or all>", "measure": "organic_sessions" | "search_clicks" | "search_impressions" | "search_ctr" | "search_position" },
    "brief": "markdown brief for the session that will do it: what to change, where (file or URL), why, how to tell it worked"
  }
}`;

type ModelRead = {
  synopsis?: string[];
  going_on?: string;
  broken?: string[];
  improve?: string[];
  going_well?: string[];
  out_of_the_box?: string;
  action?: { title?: string; why?: string; target?: TargetSpec; brief?: string } | null;
};

function noDashes(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ");
}

/** The pages the model sees: compact, numbers only, capped. */
function findingsForModel(findings: OrganicFindings) {
  const page = (d: PageDelta) => ({
    url: d.path,
    type: d.category,
    sessions: `${d.sessions[1]} -> ${d.sessions[0]}`,
    clicks: `${d.clicks[1]} -> ${d.clicks[0]}`,
    impressions: `${d.impressions[1]} -> ${d.impressions[0]}`,
    ctr: `${(d.ctr[1] * 100).toFixed(1)}% -> ${(d.ctr[0] * 100).toFixed(1)}%`,
    position: `${d.position[1]?.toFixed(1) ?? "n/a"} -> ${d.position[0]?.toFixed(1) ?? "n/a"}`,
  });
  return {
    windows: `previous ${findings.windows.prevStart}..${findings.windows.prevEnd} vs current ${findings.windows.start}..${findings.windows.end}`,
    by_type: Object.fromEntries(CATEGORIES.map((c) => {
      const t = findings.categories[c];
      return [c, { sessions: `${t.sessions[1]} -> ${t.sessions[0]} (${signedPct(t.sessions[0], t.sessions[1])})`, clicks: `${t.clicks[1]} -> ${t.clicks[0]} (${signedPct(t.clicks[0], t.clicks[1])})`, impressions: `${t.impressions[1]} -> ${t.impressions[0]} (${signedPct(t.impressions[0], t.impressions[1])})`, pages: t.pages }];
    })),
    // Named for what it is: how concentrated the change is across URLs. The
    // first live run read "top10Delta" as "tied to rank changes", which it isn't.
    provider_sessions_change_by_url_concentration: {
      all_provider_pages: findings.providerAttribution.totalDelta,
      from_the_10_provider_urls_that_moved_most: findings.providerAttribution.top10Delta,
      spread_across_every_other_provider_url: findings.providerAttribution.residual,
      provider_pages_down: findings.providerAttribution.pagesDown,
      provider_pages_up: findings.providerAttribution.pagesUp,
    },
    biggest_losers: findings.losers.map(page),
    biggest_gainers: findings.gainers.map(page),
    ctr_collapses_same_rank_same_impressions: findings.ctrCollapses.map(page),
    rank_drops_of_3_or_more: findings.positionDrops.map(page),
    impression_losses_over_40pct: findings.impressionLosses.map(page),
  };
}

function signedPct(now: number, before: number): string {
  if (before === 0) return now > 0 ? "new" : "0%";
  const value = pct(now, before) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

async function askModel(findings: OrganicFindings, history: string, competitors: string | null): Promise<{ read: ModelRead | null; costUsd: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { read: null, costUsd: 0 };
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const user = [
    `FINDINGS (GA4 Organic Search sessions and Search Console, per page):\n${JSON.stringify(findingsForModel(findings), null, 1)}`,
    `PAST READS (newest first, with whether each action's number moved):\n${history || "(none yet: this is the first read)"}`,
    `ALREADY FIXED (never re-flag):\n${KNOWN_FIXED.map((line) => `- ${line}`).join("\n")}`,
    `COMPETITORS (A Place for Mom, Caring.com, SeniorAdvisor/Seniorly; sourced notes, may be a few days old):\n${competitors ?? "(no notes)"}`,
  ].join("\n\n");
  try {
    const reply = await anthropic.messages.create({
      model: MODEL(),
      // Room for thinking plus a long JSON answer: at 4,000 the first live
      // run on 2 Oct was cut off mid-object and nothing parsed.
      max_tokens: 16_000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }, { timeout: 120_000, maxRetries: 1 });
    const raw = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
    const costUsd = (reply.usage.input_tokens * PRICE.input + reply.usage.output_tokens * PRICE.output) / 1_000_000;
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    try {
      return { read: JSON.parse(json) as ModelRead, costUsd };
    } catch {
      console.error(`[cortex] organic read unparseable (stop: ${reply.stop_reason}, ${raw.length} chars, ${reply.usage.output_tokens} output tokens)`);
      return { read: null, costUsd };
    }
  } catch (error) {
    console.error("[cortex] organic read model failed:", error instanceof Error ? error.message : String(error));
    return { read: null, costUsd: 0 };
  }
}

// ---------------------------------------------------------------------------
// Rendering

const bullets = (items: string[] | undefined) => (items?.length ? items.map((item) => `- ${noDashes(item)}`).join("\n") : "- Nothing to report.");

function pageLine(d: PageDelta): string {
  return `- \`${d.path}\` (${d.category}): sessions ${d.sessions[1]} to ${d.sessions[0]}, clicks ${d.clicks[1]} to ${d.clicks[0]}, impressions ${d.impressions[1]} to ${d.impressions[0]}, CTR ${(d.ctr[1] * 100).toFixed(1)}% to ${(d.ctr[0] * 100).toFixed(1)}%, position ${d.position[1]?.toFixed(1) ?? "n/a"} to ${d.position[0]?.toFixed(1) ?? "n/a"}`;
}

/** The numbers block of the report: rendered from findings, never from the model. */
export function renderFindings(findings: OrganicFindings): string {
  const row = (label: string, t: CategoryTotals) =>
    `| ${label} | ${t.sessions[1].toLocaleString("en-US")} | ${t.sessions[0].toLocaleString("en-US")} | ${signedPct(t.sessions[0], t.sessions[1])} | ${t.clicks[1].toLocaleString("en-US")} | ${t.clicks[0].toLocaleString("en-US")} | ${signedPct(t.clicks[0], t.clicks[1])} |`;
  const a = findings.providerAttribution;
  const list = (title: string, rows: PageDelta[]) => (rows.length ? `**${title}**\n${rows.map(pageLine).join("\n")}` : "");
  return [
    `Previous ${findings.windows.prevStart} to ${findings.windows.prevEnd} against current ${findings.windows.start} to ${findings.windows.end}. GA4 Organic Search sessions; Search Console clicks.`,
    "",
    "| Pages | Sessions before | Sessions now | Change | Clicks before | Clicks now | Change |",
    "|---|---|---|---|---|---|---|",
    ...CATEGORIES.map((c) => row(c, findings.categories[c])),
    row("all", findings.totals),
    "",
    `Provider pages: ${a.totalDelta >= 0 ? "+" : ""}${a.totalDelta.toLocaleString("en-US")} sessions overall; the 10 URLs moving most account for ${a.top10Delta.toLocaleString("en-US")}, leaving ${a.residual.toLocaleString("en-US")} unattributed across the rest. ${a.pagesDown.toLocaleString("en-US")} provider pages went down, ${a.pagesUp.toLocaleString("en-US")} went up.`,
    "",
    [
      list("Biggest losers", findings.losers),
      list("Biggest gainers", findings.gainers),
      list("Clicks fell at the same rank and impressions (the search result itself lost appeal)", findings.ctrCollapses),
      list("Rank dropped 3 or more places", findings.positionDrops),
      list("Impressions fell 40% or more", findings.impressionLosses),
    ].filter(Boolean).join("\n\n"),
  ].join("\n");
}

function fallbackSynopsis(findings: OrganicFindings): string[] {
  const line = (c: Category) => `${c} ${signedPct(findings.categories[c].sessions[0], findings.categories[c].sessions[1])} sessions`;
  const loser = findings.losers[0];
  return [
    `Organic, 28 days vs prior: ${CATEGORIES.map(line).join(", ")}.`,
    ...(loser ? [`Biggest loss: ${loser.path}, sessions ${loser.sessions[1]} to ${loser.sessions[0]}.`] : []),
  ];
}

// ---------------------------------------------------------------------------
// Public

/** Built by buildOrganicRead and stored by rememberOrganicRead; kept off the public type. */
const pending = new WeakMap<OrganicRead, { findings: OrganicFindings; windows: OrganicWindows; target: TargetSpec | null; baseline: number | null; competitors: { notes: string | null; checkedAt: string | null } }>();

export async function buildOrganicRead(db: SupabaseClient, now = new Date()): Promise<OrganicRead> {
  const windows = organicWindows(now);
  const [current, previous] = await collectPageMetricsForRanges([
    { start: windows.start, end: windows.end },
    { start: windows.prevStart, end: windows.prevEnd },
  ]);
  const curRows = current.map(toRow);
  const findings = analyzeOrganic(curRows, previous.map(toRow), windows);

  const { rows: past } = await pastReads(db);
  const history = past.map((row) => {
    const spec = parseTarget(row.target_metric);
    const nowValue = spec ? readTarget(spec, curRows) : null;
    const moved = spec && row.target_baseline !== null && nowValue !== null
      ? `${formatMeasure(spec.measure, row.target_baseline)} then, ${formatMeasure(spec.measure, nowValue)} now`
      : "not measurable";
    return `- ${row.read_date}: ${(row.synopsis ?? []).join(" ")}${row.action ? ` ACTION: "${row.action.title}" targeting ${row.target_metric ?? "?"}: ${moved}.` : ""}`;
  }).join("\n");

  const competitors = await competitorNotes(past, now);
  const { read, costUsd } = await askModel(findings, history, competitors.notes);

  let action: OrganicAction | null = null;
  let target: TargetSpec | null = null;
  let baseline: number | null = null;
  const proposed = read?.action;
  const spec = proposed?.target ? parseTarget(targetString(proposed.target)) : null;
  if (proposed?.title && proposed.brief && spec) {
    target = spec;
    baseline = readTarget(spec, curRows);
    const metric = describeTarget(spec, baseline);
    action = {
      title: noDashes(proposed.title).slice(0, 120),
      why: noDashes(proposed.why ?? ""),
      metric,
      brief: `${noDashes(proposed.brief).trim()}\n\n## The number\n\n${metric}. Raised by Cortex's organic read of ${iso(now.getTime())} (${windows.start} to ${windows.end} against ${windows.prevStart} to ${windows.prevEnd}); the read checks this number again each day.\n`,
    };
  }

  const synopsis = (read?.synopsis?.length ? read.synopsis : fallbackSynopsis(findings))
    .slice(0, 3)
    .map((line) => noDashes(line).slice(0, 180));

  const section = [
    "## Organic",
    "",
    read
      ? [
        `**What's going on.** ${noDashes(read.going_on ?? "")}`,
        "",
        "**What's broken**",
        bullets(read.broken),
        "",
        "**How to improve**",
        bullets(read.improve),
        "",
        "**What's going well**",
        bullets(read.going_well),
        "",
        `**Out of the box.** ${noDashes(read.out_of_the_box ?? "")}`,
      ].join("\n")
      : "_The model read failed today; the numbers below are complete._",
    "",
    action ? `**Proposed action: ${action.title}.** ${action.why} Moves: ${action.metric}.` : "",
    "",
    "### The numbers",
    "",
    renderFindings(findings),
    competitors.notes ? `\n### Competitors (checked ${competitors.checkedAt?.slice(0, 10) ?? "?"})\n\n${competitors.notes}` : "",
  ].filter((part, i, all) => !(part === "" && all[i - 1] === "")).join("\n");

  const result: OrganicRead = { synopsis, section, action, costUsd: costUsd + competitors.costUsd };
  pending.set(result, { findings, windows, target, baseline, competitors: { notes: competitors.notes, checkedAt: competitors.checkedAt } });
  return result;
}

/** Store today's read as tomorrow's memory. Missing table or failed write: logged, never thrown. */
export async function rememberOrganicRead(db: SupabaseClient, read: OrganicRead, now = new Date()): Promise<void> {
  const extra = pending.get(read);
  const windows = extra?.windows ?? organicWindows(now);
  const { error } = await db.from("cortex_organic_reads").upsert({
    read_date: iso(now.getTime()),
    window_start: windows.start,
    window_end: windows.end,
    prev_start: windows.prevStart,
    prev_end: windows.prevEnd,
    findings: extra?.findings ?? {},
    synopsis: read.synopsis,
    read: read.section,
    action: read.action,
    target_metric: extra?.target ? targetString(extra.target) : null,
    target_baseline: extra?.baseline ?? null,
    competitor_notes: extra?.competitors.notes ?? null,
    competitor_checked_at: extra?.competitors.checkedAt ?? null,
    cost_usd: Number(read.costUsd.toFixed(4)),
  }, { onConflict: "read_date" });
  if (error) console.error(`[cortex] organic read not remembered${tableMissing(error) ? " (migration 268 not applied)" : ""}:`, error.message);
}

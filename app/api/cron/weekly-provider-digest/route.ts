import { NextRequest, NextResponse, after } from "next/server";
import { getServiceClient, getAuthUser, getAdminUser } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { providerWeeklyDigestEmail, coldProviderRankEmail, providerProfileCompletionEmail, providerLeadDigestEmail } from "@/lib/email-templates";
import { classifyTier } from "@/lib/analytics/triage";
import { generateNotificationUrl, generateProviderPortalUrl, generateCompletionUrl } from "@/lib/claim-tokens";
import { withCronRun } from "@/lib/crons/run";
import { getRow, isFresh, normalizeKey, type DiagRow } from "@/lib/market-diagnostic/cache";
import { resolveSelfRank, type RankedEntry } from "@/lib/market-diagnostic/self-rank";
import { normCareType } from "@/lib/market-diagnostic/resolve";
import { warmCity } from "@/lib/market-diagnostic/warm";

export const maxDuration = 300;

// ── Question recency decay (2026-06-09) ──
// The family_question rung used to fire for ANY open question, top priority, every week. Because
// the recipient pool is dominated by open-question providers (~3,450, 64% with a question older
// than a month), that meant ~99.7% of digests were "a family has a question" — re-flogging the
// same stale, ignored question weekly and starving every other nudge (leads/completion/rank).
// Fix: a question only LEADS the digest when it's fresh, or on a quarterly resurface. Once stale
// it steps out of the cascade entirely (unansweredQuestion left null), so the provider flows to
// the next applicable rung — or goes quiet if none applies, instead of getting the dead nudge.
const QUESTION_FRESH_DAYS = 30; // ≤ this old → still leads (≈4 weekly nudges before demotion)
const QUESTION_RESURFACE_DAYS = 90; // demoted questions resurface ~once per quarter
const RUN_INTERVAL_DAYS = 7; // weekly cadence — the look-back for the resurface-boundary crossing
const DAY_MS = 24 * 60 * 60 * 1000;

// Through-the-week cadence: each provider is assigned a fixed weekday (Mon–Fri) by hashing their id,
// so the digest distributes across the work-week instead of a single Monday blast. Deterministic +
// stateless — the same provider always lands on the same day, which keeps the per-provider cadence
// weekly (preserving the decay/resurface math) while spreading send volume to protect deliverability.
const SEND_WEEKDAYS = 5; // Mon–Fri
// Proactive market warming: the referral teaser should be gated by product/audience fit, not by
// whether a provider happened to discover Find Families first. Each run scans a bounded slice of
// email-reachable directory providers and warms a small number of missing city×care markets. The
// monthly cache budget still lives in warmCity/cache; this cap just keeps one digest run from
// monopolizing the 300s background window.
const MARKET_PREWARM_SCAN_LIMIT = 5000;
const MARKET_PREWARM_SCAN_PAGES = 15; // 15 × 5k ≈ the current 75k-provider directory.
const MARKET_PREWARM_TARGET_LIMIT = 6;
function providerSendBucket(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % SEND_WEEKDAYS; // 0 = Mon … 4 = Fri
}

/**
 * Should this run lead with the provider's open question?
 * True when the question is fresh (≤ QUESTION_FRESH_DAYS), or when its age crosses a
 * QUESTION_RESURFACE_DAYS boundary since the previous weekly run (one resurface per ~quarter).
 * Stateless — derived purely from the question's age, so no per-send tracking table is needed.
 */
function shouldLeadWithQuestion(ageDays: number): boolean {
  if (ageDays <= QUESTION_FRESH_DAYS) return true;
  const crossedBoundary =
    Math.floor(ageDays / QUESTION_RESURFACE_DAYS) >
    Math.floor((ageDays - RUN_INTERVAL_DAYS) / QUESTION_RESURFACE_DAYS);
  return crossedBoundary;
}

/**
 * GET /api/cron/weekly-provider-digest
 *
 * Runs weekdays (Mon–Fri) 8 AM ET / 13:00 UTC. Each provider is assigned a fixed weekday by a hash
 * of their id, and a normal run only processes that day's bucket — so the audience is distributed
 * across the work-week (~1/5 per day) rather than one Monday blast, while each provider still gets at
 * most one digest per week. `?all_days=true` processes the full audience (manual catch-up).
 * The provider-side return-path email.
 *
 * Audience (2026-05-11 expansion): two recipient sources, unioned and
 * de-duped by email:
 *   1. Providers with provider_activity events in the last 14 days
 *      (page_view, cta_click_public, lead_received, question_received,
 *      review_received) -- the original ~20-provider audience.
 *   2. Providers with at least one open question (provider_questions
 *      WHERE answered_at IS NULL AND status NOT IN archived/rejected)
 *      -- the ~2,700-provider expansion. Resolves to email via
 *      business_profiles (slug, source_provider_id) then olera-providers
 *      (slug, provider_id), mirroring app/api/admin/questions/add-email
 *      strategies 1-3.
 *
 * Ordering: send-worthy providers first (we'll lead with their fresh/resurfaced question, OR
 * they have activity signal, OR they're rank-enrolled), then likely-skippers (stale question,
 * nothing else) last; within each group, freshest question DESC then views DESC. This keeps
 * `?limit=N` deterministic AND ensures the cap is spent on providers who'll actually get an email
 * — without it, the ~3,450 open-question providers (most with a stale question) would consume the
 * whole 2,000 cap and starve the activity/rank audience. The Vercel (Monday) cron uses limit=2000.
 *
 * Email variant:
 *   - Question present  -> demand-led: leads with the newest open
 *     question + a one-click answer URL (generateNotificationUrl).
 *     Page-views line appears below the question only when non-zero.
 *   - No question       -> analytics-only (original behavior).
 *
 * Skip reasons honor: no business_profile + no olera-providers match,
 * no email on file, analytics_digest_unsubscribed=true, no signal,
 * duplicate recipient (same email across two ID formats).
 *
 * Query params (for ops):
 *   ?dry_run=true — do everything except sending + writing email_logs
 *   ?limit=N      — cap provider count processed (default 2000, max 5000)
 *
 * Auth: either `Bearer ${CRON_SECRET}` (the Vercel cron injects this
 * automatically) or a logged-in admin session. The admin path exists so
 * the digest can be dry-run and fired from a browser URL — the Vercel
 * firewall's bot challenge blocks plain curl but is transparent to real
 * browsers.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const hasCronSecret =
    !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  let triggeredBy = "cron";
  if (!hasCronSecret) {
    let admin = null;
    let userEmail: string | null = null;
    try {
      const user = await getAuthUser();
      userEmail = user?.email ?? null;
      admin = user ? await getAdminUser(user.id) : null;
    } catch {
      admin = null;
    }
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    triggeredBy = userEmail ? `admin:${userEmail}` : "admin";
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dry_run") === "true";
  // Through-the-week cadence: by default only today's weekday bucket is processed (see below).
  // `?all_days=true` bypasses bucketing to process the full audience — for a manual catch-up run.
  const allDays = searchParams.get("all_days") === "true";
  const maxProviders = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "2000", 10) || 2000, 1),
    5000,
  );

  return withCronRun(
    "weekly-provider-digest",
    async () => {
      const db = getServiceClient();

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // ── 1. Find providers with recent activity ──
    const { data: activity, error: activityErr } = await db
      .from("provider_activity")
      .select("provider_id, event_type, created_at, metadata")
      .gte("created_at", twoWeeksAgo.toISOString())
      .in("event_type", [
        "page_view",
        "cta_click_public",
        "lead_received",
        "question_received",
        "review_received",
        "market_diagnostic_viewed_no_leads",
        "market_outreach_status_updated",
      ])
      .limit(100000);

    if (activityErr) {
      console.error("[weekly-provider-digest] activity query failed:", activityErr);
      throw new Error("Failed to load activity");
    }

    const events = activity ?? [];

    // ── 1a. Pre-fetch emails opted out of the analytics digest ──
    // Claimed providers' opt-out lives at business_profiles.metadata; this
    // table (migration 084) covers unclaimed providers, who have no
    // business_profiles row and whose canonical record (olera-providers)
    // has no metadata column. The per-send filter ORs membership in this
    // set with the existing metadata check so a single unsubscribe stops
    // the email no matter which path resolved the recipient.
    const { data: unsubRows, error: unsubErr } = await db
      .from("provider_unsubscribes")
      .select("email")
      .eq("channel", "analytics_digest")
      // Explicit high cap — the Supabase client defaults to 1000 rows, and a
      // silently truncated opt-out set would let truncated-off providers keep
      // getting emailed (the exact leak this table exists to close).
      .limit(100000);

    if (unsubErr) {
      console.error("[weekly-provider-digest] unsubscribes query failed:", unsubErr);
      throw new Error("Failed to load unsubscribes");
    }

    const unsubscribedEmails = new Set<string>();
    for (const row of (unsubRows ?? []) as Array<{ email: string | null }>) {
      if (row.email) unsubscribedEmails.add(row.email.toLowerCase());
    }

    // ── 1b. Find providers with live unanswered questions ──
    // Recipient source #2: every provider with at least one open question
    // (answered_at IS NULL, status NOT IN archived/rejected). This is the
    // ~2,700-provider audience -- a 10x expansion past activity-only.
    // Tracks the newest unanswered question per provider for the email lead.
    const { data: openQuestions, error: questionsErr } = await db
      .from("provider_questions")
      .select("id, provider_id, question, created_at, asker_name")
      .is("answered_at", null)
      .not("status", "in", "(archived,rejected)")
      .order("created_at", { ascending: false })
      .limit(50000);

    if (questionsErr) {
      console.error("[weekly-provider-digest] questions query failed:", questionsErr);
      throw new Error("Failed to load questions");
    }

    type OpenQuestion = {
      newest: { id: string; question: string; created_at: string };
      count: number;
    };
    const openQuestionsByProvider = new Map<string, OpenQuestion>();
    for (const q of (openQuestions ?? []) as Array<{
      id: string;
      provider_id: string;
      question: string;
      created_at: string;
    }>) {
      const key = String(q.provider_id);
      const existing = openQuestionsByProvider.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        // Rows arrive newest-first, so the first one per provider IS the newest.
        openQuestionsByProvider.set(key, {
          newest: { id: q.id, question: q.question, created_at: q.created_at },
          count: 1,
        });
      }
    }

    // Group events per provider.
    type ProviderBucket = {
      viewsThisWeek: number;
      viewsPriorWeek: number;
      ctaClicks: number;
      leads: number;
      questions: number;
      marketViews: number;
      marketActions: number;
      sources: Record<string, number>;
    };
    const buckets = new Map<string, ProviderBucket>();
    const ensureBucket = (id: string): ProviderBucket => {
      const existing = buckets.get(id);
      if (existing) return existing;
      const fresh: ProviderBucket = {
        viewsThisWeek: 0,
        viewsPriorWeek: 0,
        ctaClicks: 0,
        leads: 0,
        questions: 0,
        marketViews: 0,
        marketActions: 0,
        sources: { direct: 0, search: 0, internal: 0, other: 0 },
      };
      buckets.set(id, fresh);
      return fresh;
    };

    for (const e of events) {
      const t = new Date(e.created_at);
      const isThisWeek = t >= weekAgo;
      const isPriorWeek = t >= twoWeeksAgo && t < weekAgo;
      const bucket = ensureBucket(String(e.provider_id));
      const meta = (e.metadata as Record<string, unknown> | null) || {};
      const isAnonymousView =
        e.event_type === "page_view" &&
        typeof meta.session_id === "string" &&
        (meta.session_id as string).length > 0;

      if (isAnonymousView) {
        if (isThisWeek) {
          bucket.viewsThisWeek += 1;
          const src = classifySourceRef(meta.referrer as string | null);
          bucket.sources[src] += 1;
        } else if (isPriorWeek) bucket.viewsPriorWeek += 1;
      } else if (isThisWeek) {
        if (e.event_type === "cta_click_public") bucket.ctaClicks += 1;
        else if (e.event_type === "lead_received") bucket.leads += 1;
        else if (e.event_type === "question_received") bucket.questions += 1;
        else if (e.event_type === "market_diagnostic_viewed_no_leads") bucket.marketViews += 1;
        else if (e.event_type === "market_outreach_status_updated") bucket.marketActions += 1;
      }
    }

    // Ensure a bucket exists for every provider with an open question, even
    // those with no recent activity events. These providers ride the question
    // through to delivery; views (if any) become a personalization line.
    for (const id of openQuestionsByProvider.keys()) {
      ensureBucket(id);
    }

    // ── 1c. Rank-eligible providers (Market Intel cold/quiet expansion) ──
    // A third recipient source: providers whose place_id sits in the TOP 5 of an
    // ALREADY-CACHED city×care-type diagnostic — even with zero weekly activity. Their rank
    // comes straight from the shared cache (exact place_id match, no Places / Anthropic /
    // warming), so this adds reach at zero marginal external cost, bounded to cities we've
    // already computed. Enrollment caps at rank<=5 so the "you're #N" hook is always
    // flattering (product call 2026-06-08); widen to top-half later if it converts.
    const rankEligible = new Set<string>();
    const preRank = new Map<string, DigestMarketSnapshot>();
    const proactiveWarmTargets: { city: string; state: string; careType: string | null }[] = [];
    {
      const RANK_CHUNK = 200;
      const TOP_RANK_FOR_ENROLLMENT = 5;
      const { data: readyDiags, error: diagErr } = await db
        .from("market_diagnostics")
        .select("id, city, state, care_type, status, data, error, attempts, cost_estimate, generated_at, claimed_at")
        .eq("status", "ready")
        .limit(20000);
      if (diagErr) {
        console.error("[weekly-provider-digest] ready-diagnostics query failed:", diagErr);
      }
      const freshMarketKeys = new Set<string>();
      for (const d of (readyDiags ?? []) as DiagRow[]) {
        if (isFresh(d)) freshMarketKeys.add(`${d.city}|${d.state}|${d.care_type}`);
      }

      // Proactively warm markets for email-reachable providers instead of waiting for someone to
      // open Find Families first. This does NOT enroll the scanned provider directly. It just makes
      // their city×care market available so a later digest can truthfully send the rank/referral
      // hook to whichever local providers resolve as send-worthy.
      const prewarmScanPage = Math.floor(now.getTime() / DAY_MS) % MARKET_PREWARM_SCAN_PAGES;
      const prewarmScanFrom = prewarmScanPage * MARKET_PREWARM_SCAN_LIMIT;
      const { data: warmCandidates, error: warmCandidateErr } = await db
        .from("olera-providers")
        .select("provider_id, city, state, provider_category")
        .not("email", "is", null)
        .not("place_id", "is", null)
        .not("city", "is", null)
        .not("state", "is", null)
        .or("deleted.is.null,deleted.eq.false")
        .order("provider_id", { ascending: true })
        .range(prewarmScanFrom, prewarmScanFrom + MARKET_PREWARM_SCAN_LIMIT - 1);
      if (warmCandidateErr) {
        console.error("[weekly-provider-digest] market prewarm candidate query failed:", warmCandidateErr);
      }
      const seenPrewarmKeys = new Set<string>();
      for (const p of (warmCandidates ?? []) as Array<{
        provider_id: string;
        city: string | null;
        state: string | null;
        provider_category: string | null;
      }>) {
        if (!p.city || !p.state) continue;
        const key = normalizeKey(p.city, p.state, p.provider_category);
        const keyString = `${key.city}|${key.state}|${key.careType}`;
        if (freshMarketKeys.has(keyString) || seenPrewarmKeys.has(keyString)) continue;
        seenPrewarmKeys.add(keyString);
        proactiveWarmTargets.push({ city: p.city, state: p.state, careType: p.provider_category });
        if (proactiveWarmTargets.length >= MARKET_PREWARM_TARGET_LIMIT) break;
      }

      // place_id → its rank in the cached diagnostic (first/best diagnostic wins on collision).
      const placeRank = new Map<string, DigestMarketSnapshot>();
      for (const d of (readyDiags ?? []) as DiagRow[]) {
        const data = d.data as { meta?: { city?: string }; competitorLandscape?: { ranked?: RankedEntry[] } } | null;
        const ranked = data?.competitorLandscape?.ranked ?? [];
        const careLabel = d.care_type === "assisted_living" ? "assisted living" : "home care";
        const cityLabel = data?.meta?.city ?? d.city;
        for (let i = 0; i < Math.min(ranked.length, TOP_RANK_FOR_ENROLLMENT); i++) {
          const pid = ranked[i]?.id;
          if (!pid || placeRank.has(pid)) continue;
          placeRank.set(pid, {
            rank: { rank: i + 1, outOf: ranked.length, cityLabel, careLabel, flattering: true },
            referralTargets: extractReferralTargets(data),
            totalReferralSources: totalReferralSources(data),
          });
        }
      }
      // Map those top-5 place_ids → Olera providers with an email. Keyed by provider_id so the
      // existing bp resolution (§2/§2b) routes claimed rows through business_profiles (preserving
      // the metadata opt-out) and unclaimed rows through olera-providers.
      const placeIdList = [...placeRank.keys()];
      for (let i = 0; i < placeIdList.length; i += RANK_CHUNK) {
        const chunk = placeIdList.slice(i, i + RANK_CHUNK);
        const { data: provs, error: provErr } = await db
          .from("olera-providers")
          .select("provider_id, slug, place_id, email")
          .in("place_id", chunk)
          .not("deleted", "is", true);
        if (provErr) {
          console.error("[weekly-provider-digest] rank-eligible provider query failed:", provErr);
          continue;
        }
        for (const p of (provs ?? []) as Array<{ provider_id: string; slug: string | null; place_id: string | null; email: string | null }>) {
          if (!p.email || !p.place_id) continue;
          const snapshot = placeRank.get(p.place_id);
          if (!snapshot) continue;
          // Merge onto the provider's SLUG key when they're ALREADY in the audience via activity or a
          // question (this block runs after §1/§1b). Otherwise a rank-eligible provider who also has
          // activity would sit in `buckets` under TWO keys (slug + legacy provider_id) → two different
          // send-day buckets → two digests/week, since the per-run sentEmails dedup only catches it when
          // both keys run together (no longer the case under weekday cadence). Pure rank-eligible
          // providers (no other signal) keep the legacy provider_id key, which §2 resolves to their
          // business_profiles row via source_provider_id — preserving correct claimed-vs-cold treatment
          // (slug-keying them would mis-resolve the ~16% whose bp.slug holds a legacy id).
          const slugKey = p.slug ? String(p.slug) : null;
          const id = slugKey && buckets.has(slugKey) ? slugKey : String(p.provider_id);
          ensureBucket(id);
          rankEligible.add(id);
          preRank.set(id, snapshot);
        }
      }
    }

    // Order recipients so the `maxProviders` cap is spent on providers we'll actually email.
    // CRITICAL interaction with question decay: there are ~3,450 open-question providers but the
    // cap is 2,000, so before decay the slice was ENTIRELY question providers (newest-first) and
    // the activity/rank audience was never reached — which is exactly why the digest was ~99.7%
    // family_question. Now that stale questions are demoted (and, with no other signal, skipped),
    // a stale-question provider we're going to skip must not consume a cap slot ahead of an
    // activity/rank provider who'd get a real nudge (leads/completion/rank). So: rank send-worthy
    // providers first (we'll lead with their fresh/resurfaced question, OR they have activity
    // signal, OR they're rank-enrolled), likely-skippers last. Within each group keep the existing
    // freshest-question-DESC then views-DESC order, so `?limit=N` stays deterministic.
    const willLeadQuestion = (id: string): boolean => {
      const oq = openQuestionsByProvider.get(id);
      if (!oq) return false;
      return shouldLeadWithQuestion((now.getTime() - Date.parse(oq.newest.created_at)) / DAY_MS);
    };
    const sendWorthy = (id: string): boolean => {
      if (willLeadQuestion(id)) return true;
      const b = buckets.get(id);
      if (b && (
        b.viewsThisWeek > 0 ||
        b.ctaClicks > 0 ||
        b.leads > 0 ||
        b.questions > 0 ||
        b.marketViews > 0 ||
        b.marketActions > 0
      )) return true;
      return rankEligible.has(id);
    };
    // Through-the-week cadence: each provider has a deterministic weekday (Mon–Fri) from a hash of
    // their id, and a normal run only processes TODAY's bucket — so ~1/5 of the audience goes out
    // each weekday instead of one Monday blast. Each provider still gets at most one digest per week
    // (their day), so the decay/resurface math (which assumes a weekly per-provider interval) is
    // unchanged, the per-day slice is smaller (eases the maxProviders cap), and olera.care's send
    // volume is smoothed. `?all_days=true` processes everyone (manual catch-up). On a weekend run
    // (no weekday bucket) the filter yields nobody — the Vercel cron is Mon–Fri, so this only affects
    // off-hours manual triggers, which should pass `?all_days=true`.
    const dow = now.getUTCDay(); // 0=Sun … 6=Sat
    const todayBucket = dow >= 1 && dow <= 5 ? dow - 1 : -1; // Mon→0 … Fri→4; weekend → -1
    const allIds = [...buckets.keys()];
    const candidateIds = allDays ? allIds : allIds.filter((id) => providerSendBucket(id) === todayBucket);
    candidateIds.sort((a, b) => {
      const sa = sendWorthy(a) ? 0 : 1;
      const sb = sendWorthy(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const qa = openQuestionsByProvider.get(a)?.newest.created_at ?? "";
      const qb = openQuestionsByProvider.get(b)?.newest.created_at ?? "";
      if (qa !== qb) return qb.localeCompare(qa);
      const va = buckets.get(a)?.viewsThisWeek ?? 0;
      const vb = buckets.get(b)?.viewsThisWeek ?? 0;
      return vb - va;
    });
    const providerIds = candidateIds.slice(0, maxProviders);

    if (providerIds.length === 0) {
      const reason = !allDays && todayBucket === -1 ? "off_day_weekend" : "no_active_providers";
      return { ok: true, processed: 0, sent: 0, skipped: 0, dayBucket: todayBucket, reason };
    }

    // ── 2. Resolve business_profiles for these slugs ──
    type BP = {
      id: string;
      slug: string | null;
      source_provider_id: string | null;
      display_name: string | null;
      email: string | null;
      city: string | null;
      state: string | null;
      category: string | null;
      metadata: Record<string, unknown> | null;
      account_id: string | null; // non-null = a claimed/owned listing → keep the punchy digest, not the cold note
      claim_state: string | null; // 'claimed' gates the completion ("sell the output") variant
    };
    // Resolve business_profiles by slug first, then fall back to
    // source_provider_id for legacy URLs whose event provider_id is the
    // olera-providers alphanumeric ID rather than a slug. Same resolution
    // chain as app/provider/[slug]/page.tsx and the aggregation cron.
    const bps: BP[] = [];
    const chunkSize = 200;
    const bpByKey = new Map<string, BP>();
    for (let i = 0; i < providerIds.length; i += chunkSize) {
      const chunk = providerIds.slice(i, i + chunkSize);

      const { data: bySlug } = await db
        .from("business_profiles")
        .select("id, slug, source_provider_id, display_name, email, city, state, category, metadata, account_id, claim_state")
        .in("slug", chunk)
        .in("type", ["organization", "caregiver"]);
      for (const b of (bySlug ?? []) as BP[]) {
        bps.push(b);
        if (b.slug) bpByKey.set(b.slug, b);
      }

      const stillMissing = chunk.filter((id) => !bpByKey.has(id));
      if (stillMissing.length === 0) continue;

      const { data: bySourceId } = await db
        .from("business_profiles")
        .select("id, slug, source_provider_id, display_name, email, city, state, category, metadata, account_id, claim_state")
        .in("source_provider_id", stillMissing)
        .in("type", ["organization", "caregiver"]);
      for (const b of (bySourceId ?? []) as BP[]) {
        bps.push(b);
        if (b.source_provider_id) bpByKey.set(b.source_provider_id, b);
      }
    }

    // ── 2b. Fallback: synthesize BP from olera-providers for unclaimed rows ──
    // Most providers in the unanswered-question audience are unclaimed
    // (no business_profiles row) -- their canonical email lives on
    // olera-providers. Mirrors strategies 1-3 in
    // app/api/admin/questions/add-email/route.ts:
    //   - olera-providers.slug = providerId
    //   - olera-providers.provider_id = providerId (legacy alphanumeric)
    // NOTE: olera-providers has no `metadata` column, so synthesized rows
    // carry metadata: null. The per-provider opt-out for unclaimed providers
    // lives in the sibling provider_unsubscribes table (migration 084) and is
    // applied in the send loop via unsubscribedEmails. Errors here are
    // surfaced explicitly -- a bad column silently empties the result set,
    // which is exactly how the missing-metadata bug shipped once.
    type IosProvider = {
      provider_id: string;
      slug: string | null;
      email: string | null;
      provider_name: string | null;
      city: string | null;
      state: string | null;
    };
    const iosSelect = "provider_id, slug, email, provider_name, city, state";
    const unresolved = providerIds.filter((id) => !bpByKey.has(id));
    if (unresolved.length > 0) {
      for (let i = 0; i < unresolved.length; i += chunkSize) {
        const chunk = unresolved.slice(i, i + chunkSize);

        const { data: bySlugIos, error: bySlugErr } = await db
          .from("olera-providers")
          .select(iosSelect)
          .in("slug", chunk)
          .not("deleted", "is", true);
        if (bySlugErr) {
          console.error("[weekly-provider-digest] olera-providers by-slug query failed:", bySlugErr);
        }
        for (const ip of (bySlugIos ?? []) as IosProvider[]) {
          if (!ip.slug) continue;
          bpByKey.set(ip.slug, {
            id: ip.provider_id,
            slug: ip.slug,
            source_provider_id: ip.provider_id,
            display_name: ip.provider_name,
            email: ip.email,
            city: ip.city,
            state: ip.state,
            category: null,
            metadata: null,
            account_id: null,
            claim_state: null,
          });
        }

        const stillUnresolved = chunk.filter((id) => !bpByKey.has(id));
        if (stillUnresolved.length === 0) continue;

        const { data: byIdIos, error: byIdErr } = await db
          .from("olera-providers")
          .select(iosSelect)
          .in("provider_id", stillUnresolved)
          .not("deleted", "is", true);
        if (byIdErr) {
          console.error("[weekly-provider-digest] olera-providers by-id query failed:", byIdErr);
        }
        for (const ip of (byIdIos ?? []) as IosProvider[]) {
          // Use the legacy alphanumeric ID as the URL slug when olera-providers.slug
          // is null. The /provider/[slug]/onboard route resolves both formats, so
          // the answer link works either way.
          bpByKey.set(ip.provider_id, {
            id: ip.provider_id,
            slug: ip.slug ?? ip.provider_id,
            source_provider_id: ip.provider_id,
            display_name: ip.provider_name,
            email: ip.email,
            city: ip.city,
            state: ip.state,
            category: null,
            metadata: null,
            account_id: null,
            claim_state: null,
          });
        }
      }
    }

    const bpBySlug = bpByKey;

    // ── 2c. Existing referral-market work state ──
    // Keep the first ask curiosity-led, but if a provider has already touched
    // the call sheet, acknowledge that momentum quietly in the teaser.
    type OutreachRow = { provider_id: string; target_id: string; status: string; updated_at: string };
    type OutreachSummary = {
      statusByTarget: Map<string, string>;
      workedCount: number;
      respondedCount: number;
      referringCount: number;
    };
    const outreachByProfile = new Map<string, OutreachSummary>();
    const profileIdsForOutreach = Array.from(
      new Set(providerIds.map((id) => bpBySlug.get(id)?.id).filter(Boolean) as string[]),
    );
    if (profileIdsForOutreach.length > 0) {
      for (let i = 0; i < profileIdsForOutreach.length; i += chunkSize) {
        const chunk = profileIdsForOutreach.slice(i, i + chunkSize);
        const { data: rows, error } = await db
          .from("market_referral_outreach")
          .select("provider_id, target_id, status, updated_at")
          .in("provider_id", chunk)
          .order("updated_at", { ascending: false })
          .limit(10000);
        if (error) {
          console.error("[weekly-provider-digest] market outreach query failed:", error);
          continue;
        }
        for (const row of (rows ?? []) as OutreachRow[]) {
          const summary = outreachByProfile.get(row.provider_id) ?? {
            statusByTarget: new Map<string, string>(),
            workedCount: 0,
            respondedCount: 0,
            referringCount: 0,
          };
          summary.statusByTarget.set(row.target_id, row.status);
          if (row.status === "contacted" || row.status === "responded" || row.status === "referring") summary.workedCount += 1;
          if (row.status === "responded") summary.respondedCount += 1;
          if (row.status === "referring") summary.referringCount += 1;
          outreachByProfile.set(row.provider_id, summary);
        }
      }
    }

    // ── 3. Cohort benchmarks for "local demand" signal ──
    // Pull this week's provider_page_view_stats to sum unique demand per cohort.
    const weekStartDate = weekAgo.toISOString().slice(0, 10);
    const { data: cohortRows } = await db
      .from("provider_page_view_stats")
      .select("provider_id, unique_view_count, city, state, category")
      .gte("date", weekStartDate);

    type CohortKey = string;
    const cohortDemand = new Map<CohortKey, number>();
    const cohortKey = (city: string | null, state: string | null, category: string | null) =>
      `${city ?? ""}\x1f${state ?? ""}\x1f${category ?? ""}`;
    // Also aggregate at the city+state level (category-agnostic) for the
    // demand-led email's no-views fallback line. Synthesized unclaimed rows
    // carry category: null, so the category-keyed cohortDemand misses them --
    // the area signal is what those providers get instead.
    const areaDemand = new Map<string, number>();
    const areaKey = (city: string | null, state: string | null) => `${city ?? ""}\x1f${state ?? ""}`;
    for (const row of (cohortRows ?? []) as Array<{ city: string | null; state: string | null; category: string | null; unique_view_count: number | null }>) {
      const views = row.unique_view_count ?? 0;
      cohortDemand.set(cohortKey(row.city, row.state, row.category), (cohortDemand.get(cohortKey(row.city, row.state, row.category)) ?? 0) + views);
      if (row.city) areaDemand.set(areaKey(row.city, row.state), (areaDemand.get(areaKey(row.city, row.state)) ?? 0) + views);
    }

    // ── 4. For each provider: gate + compose + send ──
    let sent = 0;
    let marketHeroCount = 0;
    let referralTeaserCount = 0;
    let marketRankMissingReferralTargets = 0;
    let coldRankSent = 0; // sends to the §1c cold/quiet rank-eligible audience (no weekly activity)
    let completionCount = 0; // sends of the completion ("sell the output") variant
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    // Cities whose diagnostic wasn't cached when a no-question provider needed it — warmed in
    // the background after the response so next week's digest can show their rank.
    const warmTargets: { city: string; state: string; careType: string | null }[] = [];
    const bumpSkip = (r: string) => {
      skipReasons[r] = (skipReasons[r] ?? 0) + 1;
      skipped += 1;
    };
    // Dedupe across ID formats: a provider with an activity bucket under
    // their slug AND a question bucket under their legacy alphanumeric ID
    // will resolve to the same email; we should only send once per address.
    const sentEmails = new Set<string>();

    for (const providerId of providerIds) {
      const bucket = buckets.get(providerId)!;
      const bp = bpBySlug.get(providerId);

      if (!bp) {
        bumpSkip("unclaimed_or_missing_profile");
        continue;
      }
      if (!bp.email) {
        bumpSkip("no_email");
        continue;
      }

      const emailKey = bp.email.toLowerCase();
      if (sentEmails.has(emailKey)) {
        bumpSkip("duplicate_recipient");
        continue;
      }

      const meta = (bp.metadata as Record<string, unknown> | null) || {};
      if (meta.analytics_digest_unsubscribed === true || unsubscribedEmails.has(emailKey)) {
        // Mark this email as handled so a second bucket-key for the same
        // physical provider (e.g. slug vs legacy ID) can't bypass the opt-out
        // by resolving to a different record without the flag.
        sentEmails.add(emailKey);
        bumpSkip("unsubscribed");
        continue;
      }

      // Skip if provider is admin-archived (no emails sent to them)
      if (meta.admin_archived === true) {
        sentEmails.add(emailKey);
        bumpSkip("admin_archived");
        continue;
      }

      const openQ = openQuestionsByProvider.get(providerId);

      // Signal gate: views, CTA clicks, leads, this-week questions, OR a live
      // unanswered question. The question-only case is the new audience --
      // unclaimed providers with backlog who never appear in provider_activity.
      const hasSignal =
        bucket.viewsThisWeek > 0 ||
        bucket.ctaClicks > 0 ||
        bucket.leads > 0 ||
        bucket.questions > 0 ||
        bucket.marketViews > 0 ||
        bucket.marketActions > 0 ||
        !!openQ ||
        rankEligible.has(providerId);
      if (!hasSignal) {
        bumpSkip("no_signal");
        continue;
      }

      const tier = classifyTier(bucket.viewsThisWeek);
      const deltaPct = computeDeltaPct(bucket.viewsThisWeek, bucket.viewsPriorWeek);
      const localDemand = cohortDemand.get(cohortKey(bp.city, bp.state, bp.category)) ?? null;
      const areaDemandCount = bp.city ? areaDemand.get(areaKey(bp.city, bp.state)) ?? null : null;
      const topSource = findTopSource(bucket.sources);
      const providerSlug = bp.slug ?? providerId;
      // Drop the slug fallback: for unclaimed rows synthesized from olera-providers,
      // bp.slug can be a UUID, which would render as "A family has a question about
      // abc123-..." in the subject. "your business" is the cleaner fallback.
      const displayName = bp.display_name ?? "your business";

      // Question recency decay: lead with the question only when it's fresh or on a quarterly
      // resurface (shouldLeadWithQuestion). A stale, repeatedly-ignored question is demoted —
      // unansweredQuestion stays null, so every downstream rung (leads/completion/rank), which
      // already gates on !unansweredQuestion, gets its turn instead of being smothered.
      const questionAgeDays = openQ
        ? (now.getTime() - Date.parse(openQ.newest.created_at)) / DAY_MS
        : Infinity;
      const leadWithQuestion = !!openQ && shouldLeadWithQuestion(questionAgeDays);
      // A provider whose only signal was a question we chose NOT to lead with this week. Used below
      // to keep rank resolution cache-only for them (never queue a paid warm for a demoted question).
      const demotedQuestionOnly = !!openQ && !leadWithQuestion;

      // Mint the one-click answer URL only when leading with the question.
      // Failure here is non-fatal: the provider still gets the analytics email
      // if they have other signal, otherwise they're skipped.
      let answerUrl: string | null = null;
      let unansweredQuestion: { id: string; question: string; totalCount: number } | null = null;
      if (openQ && leadWithQuestion) {
        try {
          answerUrl = generateNotificationUrl(
            providerSlug,
            bp.email,
            "question",
            openQ.newest.id,
          );
          unansweredQuestion = {
            id: openQ.newest.id,
            question: openQ.newest.question,
            totalCount: openQ.count,
          };
        } catch (err) {
          console.error(`[weekly-provider-digest] otk generation failed for ${providerSlug}:`, err);
        }
      }

      // Leads recap variant — providers who received one or more new family inquiries this week.
      // Highest-value weekly signal (a family actively asked to connect, ~10x a passive view), so
      // it outranks everything except a live unanswered question. Sending the dedicated recap also
      // short-circuits the completion nudge and the market-rank resolve below — both gated on
      // !hasLead — so a hot lead is never buried under "finish your profile", and we never spend a
      // Places call resolving rank for a provider who's getting the leads email anyway. The CTA is
      // a one-click magic link to their connections inbox. Goal action: opening the lead.
      const hasLead = !unansweredQuestion && bucket.leads > 0;
      let leadsUrl: string | null = null;
      if (hasLead) {
        try {
          leadsUrl = generateProviderPortalUrl(providerSlug, bp.email, "leads");
        } catch (err) {
          console.error(`[weekly-provider-digest] leads url failed for ${providerSlug}:`, err);
        }
      }

      // Completion ("sell the output") variant — CLAIMED providers who haven't
      // added their owner story yet. Ranks ABOVE the market-rank hero in the
      // next-rung router (question > leads > completion > cold-rank > rank > analytics):
      // a thin profile is a more actionable rung than a rank they can't quickly
      // move. Owner story isn't in the completeness score, so we check
      // metadata.staff directly — the highest-emotional-impact gap, cheapest to
      // detect. Claimed-only (claim_state='claimed'), so it never collides with
      // the cold-first-contact note below (that path requires !account_id). MVP:
      // owner-story gap only; other gaps + a dedicated dormant-claimer source
      // are tracked follow-ups (see plans/completion-carrot-plan.md).
      let completionUrl: string | null = null;
      if (!unansweredQuestion && !hasLead && bp.claim_state === "claimed") {
        const hasOwnerStory = !!(meta.staff as { name?: string } | undefined)?.name;
        if (!hasOwnerStory) {
          try {
            completionUrl = generateCompletionUrl(providerSlug, bp.email, "owner");
          } catch (err) {
            console.error(`[weekly-provider-digest] completion url failed for ${providerSlug}:`, err);
          }
        }
      }

      // Market Intelligence hero — for any send not leading with a question/lead/completion. That
      // now includes demoted-question providers (their question was set aside this week), which is
      // how a stale-question provider can pick up a rank nudge instead. Resolves the provider's
      // rank from their cached city×care-type diagnostic; collects a warm target when it's not
      // cached yet (suppressed for demoted questions — see below). Non-fatal: a failure just
      // falls back to the analytics email.
      // Rank-eligible (cold/quiet) providers carry a precomputed rank from §1c — used directly,
      // so they cost zero Places/warming calls and can never queue a warm.
      // Skipped when a completion nudge is showing (it takes priority).
      let marketRank: DigestMarketRank | null = null;
      let referralTargets: DigestReferralTarget[] = [];
      let totalReferralSources = 0;
      if (!unansweredQuestion && !hasLead && !completionUrl) {
        const pre = preRank.get(providerId);
        if (pre) {
          marketRank = pre.rank;
          referralTargets = pre.referralTargets;
          totalReferralSources = pre.totalReferralSources;
        } else {
          try {
            const mr = await resolveProviderMarketRank(bp, db);
            marketRank = mr.rank;
            referralTargets = mr.referralTargets;
            totalReferralSources = mr.totalReferralSources;
            // Demoting stale questions newly routes ~2,200 question-providers into this block. A
            // cache READ (resolveProviderMarketRank) is cheap, but queuing a warm spends Places +
            // Anthropic. For a demoted-question provider, use only an already-cached rank — never
            // pay to warm a city for an unclaimed provider whose question we just set aside.
            if (mr.warmTarget && !demotedQuestionOnly) warmTargets.push(mr.warmTarget);
          } catch (err) {
            console.error(`[weekly-provider-digest] market-rank resolve failed for ${providerSlug}:`, err);
          }
        }
      }

      // If the only signal was a question we couldn't mint a URL for — or a rank that didn't
      // resolve — skip rather than ship a blank email to a provider with no traffic.
      const hasNonQuestionSignal =
        bucket.viewsThisWeek > 0 ||
        bucket.ctaClicks > 0 ||
        bucket.leads > 0 ||
        bucket.questions > 0 ||
        bucket.marketViews > 0 ||
        bucket.marketActions > 0;
      if (!unansweredQuestion && !hasNonQuestionSignal && !marketRank && !completionUrl) {
        // Distinguish the new common case: a provider whose only signal was a stale question we
        // demoted this week, with no other rung to fall to → intentionally goes quiet (the whole
        // point of decay) rather than getting the dead nudge. Kept separate from the genuine
        // failure modes so ops can see decay working vs. a rank/URL problem.
        bumpSkip(
          demotedQuestionOnly
            ? "question_demoted_no_other_signal"
            : rankEligible.has(providerId)
              ? "rank_unresolved"
              : "question_url_mint_failed",
        );
        continue;
      }

      // Cold first-contact: a §1c rank-enrolled provider with no weekly activity, no question,
      // and no claimed account → they've never engaged with Olera, so the trust-forward note
      // (who/legit/permission/cost) earns the read before the rank. Claimed-but-quiet and any
      // provider with weekly signal keep the punchy digest.
      const isColdFirstContact =
        !!marketRank &&
        preRank.has(providerId) &&
        !hasNonQuestionSignal &&
        !unansweredQuestion &&
        !bp.account_id;

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
      const referralTeaser = marketRank
        ? buildReferralTeaser(
            referralTargets,
            totalReferralSources,
            outreachByProfile.get(bp.id) ?? null,
          )
        : null;
      const marketUrl = generateProviderPortalUrl(providerSlug, bp.email, "market");
      const html = isColdFirstContact
        ? coldProviderRankEmail({
            rank: marketRank!.rank,
            outOf: marketRank!.outOf,
            cityLabel: marketRank!.cityLabel,
            careLabel: marketRank!.careLabel,
            // One-click "market" magic link → invisibly authenticates onto /provider/matches.
            ctaUrl: generateProviderPortalUrl(providerSlug, bp.email, "market"),
            manageUrl: generateProviderPortalUrl(providerSlug, bp.email, "manage"),
            removeUrl: `${siteUrl}/for-providers/removal-request/${providerSlug}`,
            unsubscribeUrl: `${siteUrl}/unsubscribe/${providerSlug}`,
          })
        : leadsUrl
        ? providerLeadDigestEmail({
            providerName: displayName,
            providerSlug,
            leadCount: bucket.leads,
            ctaUrl: leadsUrl,
            manageUrl: generateProviderPortalUrl(providerSlug, bp.email, "manage"),
            unsubscribeUrl: `${siteUrl}/unsubscribe/${providerSlug}`,
          })
        : completionUrl
        ? providerProfileCompletionEmail({
            providerName: displayName,
            providerSlug,
            ctaUrl: completionUrl,
          })
        : providerWeeklyDigestEmail({
            providerName: displayName,
            providerSlug,
            tier,
            viewsThisWeek: bucket.viewsThisWeek,
            viewsPriorWeek: bucket.viewsPriorWeek,
            deltaPct,
            localDemand,
            areaDemand: areaDemandCount,
            city: bp.city,
            category: bp.category,
            ctaClicks: bucket.ctaClicks,
            leadsReceived: bucket.leads,
            questionsReceived: bucket.questions,
            topSource,
            unansweredQuestion,
            answerUrl,
            marketRank,
            referralTeaser,
            marketUrl,
          });

      const subject = unansweredQuestion
        ? `A family has a question about ${displayName}`
        : leadsUrl
        ? bucket.leads > 1
          ? `${bucket.leads} families reached out about ${displayName} this week`
          : `A family reached out about ${displayName} this week`
        : completionUrl
        ? `See what families see on ${displayName}`
        : isColdFirstContact
          // Cold first-contact: attribute the rank to families up front (these strangers have
          // never heard from us), matching the note's family-led opening.
          ? `Families in ${marketRank!.cityLabel} rank you #${marketRank!.rank} of ${marketRank!.outOf}`
          : referralTeaser
            ? referralTeaser.targets.length > 0
              ? `${referralTeaser.targets.length} ${marketRank!.cityLabel}-area places families may ask about care`
              : `See who families may ask in ${marketRank!.cityLabel}`
          : marketRank
            ? marketRank.flattering
              ? `You're #${marketRank.rank} of ${marketRank.outOf} ${marketRank.careLabel} agencies in ${marketRank.cityLabel}`
              : `See where you rank in ${marketRank.cityLabel}`
            : bucket.viewsThisWeek > 0
              ? `${bucket.viewsThisWeek} ${bucket.viewsThisWeek === 1 ? "family" : "families"} viewed your page this week`
              : `Your week on Olera`;

      // Tag the email_log row with which digest variant this send is. Market-rank
      // digest is separated from the plain weekly digest so the automation view
      // can attribute its conversion to call-sheet work, not just portal revisits.
      // Order mirrors the html render priority above (question > cold-first-contact
      // > completion > analytics), so the tag matches the email sent.
      const variant = unansweredQuestion
        ? "family_question"
        : leadsUrl
          ? "leads"
          : isColdFirstContact
            ? "cold_rank"
            : completionUrl
              ? "completion"
              : referralTeaser
                ? "referral_teaser"
              : marketRank
                ? "market_rank"
                : "weekly_digest";
      const variantMeta = { variant, ledWithRank: !!marketRank };

      if (dryRun) {
        sent += 1;
        if (marketRank) marketHeroCount += 1;
        if (variant === "referral_teaser") referralTeaserCount += 1;
        if (variant === "market_rank" && marketRank && referralTargets.length === 0) {
          marketRankMissingReferralTargets += 1;
        }
        if (preRank.has(providerId)) coldRankSent += 1;
        if (completionUrl) completionCount += 1;
        sentEmails.add(emailKey);
        continue;
      }

      try {
        await sendEmail({
          to: bp.email,
          subject,
          html,
          emailType: "weekly_analytics_digest",
          recipientType: "provider",
          // Stamp the email_log row with the same id the answer endpoint
          // writes to provider_activity.provider_id (question.provider_id ==
          // this loop's providerId). Without it every digest row logs
          // provider_id=null and the Provider Comms Funnel's weekly_digest
          // column (answered / edited / signed-in) is structurally zero.
          providerId,
          metadata: variantMeta,
        });
        sent += 1;
        if (marketRank) marketHeroCount += 1;
        if (variant === "referral_teaser") referralTeaserCount += 1;
        if (variant === "market_rank" && marketRank && referralTargets.length === 0) {
          marketRankMissingReferralTargets += 1;
        }
        if (preRank.has(providerId)) coldRankSent += 1;
        if (completionUrl) completionCount += 1;
        sentEmails.add(emailKey);
      } catch (err) {
        console.error(`[weekly-provider-digest] send failed for ${providerSlug}:`, err);
        bumpSkip("send_error");
      }
    }

      // Warm any uncached city×care-type diagnostics in the background (after the response is
      // sent, within maxDuration) so next week's digest can show those providers' rank. Skipped
      // on dry runs. warmCity self-guards (monthly budget circuit-breaker + claim dedup), so a
      // big miss list can't run away on cost.
      const proactiveWarmKeys = new Set(
        proactiveWarmTargets.map((t) => `${t.city}|${t.state}|${t.careType ?? ""}`),
      );
      const uniqueWarm = Array.from(
        new Map([...warmTargets, ...proactiveWarmTargets].map((t) => [`${t.city}|${t.state}|${t.careType ?? ""}`, t])).values(),
      );
      const proactiveWarmQueued = uniqueWarm.filter((t) =>
        proactiveWarmKeys.has(`${t.city}|${t.state}|${t.careType ?? ""}`),
      ).length;
      if (!dryRun && uniqueWarm.length > 0) {
        after(async () => {
          for (const t of uniqueWarm) {
            try {
              await warmCity(t.city, t.state, t.careType);
            } catch (err) {
              console.error(`[weekly-provider-digest] warm failed ${t.city},${t.state}:`, (err as Error).message);
            }
          }
        });
      }

      console.log(
        `[weekly-provider-digest] dayBucket=${allDays ? "all" : todayBucket} processed=${providerIds.length} sent=${sent} marketHero=${marketHeroCount} referralTeaser=${referralTeaserCount} marketRankMissingReferralTargets=${marketRankMissingReferralTargets} coldRank=${coldRankSent} completion=${completionCount} rankEnrolled=${rankEligible.size} skipped=${skipped} warmQueued=${uniqueWarm.length} proactiveWarmQueued=${proactiveWarmQueued} reasons=${JSON.stringify(skipReasons)}`,
      );

      return {
        ok: true,
        // Which weekday bucket ran (0=Mon … 4=Fri), or "all" for a ?all_days catch-up run.
        dayBucket: allDays ? "all" : todayBucket,
        processed: providerIds.length,
        sent,
        marketHeroSent: marketHeroCount,
        referralTeaserSent: referralTeaserCount,
        marketRankMissingReferralTargets,
        // §1c cold/quiet expansion: providers enrolled by a top-5 cached rank, and how many got sent.
        rankEligibleEnrolled: rankEligible.size,
        coldRankSent,
        completionSent: completionCount,
        skipped,
        skipReasons,
        warmQueued: uniqueWarm.length,
        proactiveWarmQueued,
        // The exact city×care-type list to pre-warm (so a dry_run shows what to warm before the
        // real send to expand THIS week's hero reach, not just next week's).
        warmCities: uniqueWarm.map((t) => `${t.city}, ${t.state} (${normCareType(t.careType)})`),
        dry_run: dryRun,
      };
    },
    { triggeredBy },
  );
}

type DigestMarketRank = { rank: number; outOf: number; cityLabel: string; careLabel: string; flattering: boolean };
type DigestReferralTarget = { id: string; name: string; category: string; distanceMiles: number | null };
type DigestReferralTeaser = {
  totalSources: number;
  starterTotal: number;
  workedCount: number;
  respondedCount: number;
  referringCount: number;
  targets: Array<{ name: string; category: string; distanceMiles: number | null }>;
};
type DigestMarketSnapshot = {
  rank: DigestMarketRank;
  referralTargets: DigestReferralTarget[];
  totalReferralSources: number;
};

/**
 * Resolve a no-question provider's rank in their local market for the digest Market-Intel hero.
 * place_id comes from metadata.google_metadata first, else the linked olera-providers row; it's
 * then matched against the cached city×care-type diagnostic via resolveSelfRank (the same path
 * the Find Families page uses, so the email matches what they'll see on the page).
 *
 * Returns the rank when it resolves. When the diagnostic isn't cached yet, returns a `warmTarget`
 * (the city to warm in the background) instead — so reach grows week over week, no separate cron.
 * `flattering` (top-5 or top-quartile) drives the page-vs-push framing in the template + subject.
 */
async function resolveProviderMarketRank(
  bp: { metadata: Record<string, unknown> | null; source_provider_id: string | null; city: string | null; state: string | null; category: string | null },
  db: ReturnType<typeof getServiceClient>,
): Promise<{
  rank: DigestMarketRank | null;
  referralTargets: DigestReferralTarget[];
  totalReferralSources: number;
  warmTarget: { city: string; state: string; careType: string | null } | null;
}> {
  if (!bp.city) return { rank: null, referralTargets: [], totalReferralSources: 0, warmTarget: null };
  let placeId =
    (bp.metadata as { google_metadata?: { place_id?: string } } | null)?.google_metadata?.place_id ?? null;
  if (!placeId && bp.source_provider_id) {
    const { data } = await db
      .from("olera-providers")
      .select("place_id")
      .eq("provider_id", bp.source_provider_id)
      .maybeSingle();
    placeId = (data as { place_id?: string | null } | null)?.place_id ?? null;
  }
  if (!placeId) return { rank: null, referralTargets: [], totalReferralSources: 0, warmTarget: null }; // no key to match — skip, don't warm

  const key = normalizeKey(bp.city, bp.state ?? "", bp.category);
  const row = await getRow(key, db);
  if (!(row && row.status === "ready" && row.data)) {
    // Diagnostic not cached → warm it in the background for next week.
    return { rank: null, referralTargets: [], totalReferralSources: 0, warmTarget: { city: bp.city, state: bp.state ?? "", careType: bp.category } };
  }
  const refreshTarget = isFresh(row)
    ? null
    : { city: bp.city, state: bp.state ?? "", careType: bp.category };

  const data = row.data as {
    competitorLandscape?: { ranked?: RankedEntry[]; totalReviewsInMarket?: number };
    referralGraph?: { totalViableSources?: number; prioritizedTargets?: unknown[] };
  };
  const cl = data.competitorLandscape;
  const referralTargets = extractReferralTargets(data);
  const totalSources = totalReferralSources(data);
  const self = await resolveSelfRank({
    ranked: cl?.ranked,
    totalReviewsInMarket: cl?.totalReviewsInMarket ?? 0,
    placeId,
  });
  if (!self) return { rank: null, referralTargets, totalReferralSources: totalSources, warmTarget: refreshTarget };

  const careLabel = normCareType(bp.category) === "assisted_living" ? "assisted living" : "home care";
  return {
    rank: {
      rank: self.rank,
      outOf: self.outOf,
      cityLabel: bp.city,
      careLabel,
      flattering: self.rank <= 5 || self.rank <= Math.ceil(self.outOf / 4),
    },
    referralTargets,
    totalReferralSources: totalSources,
    warmTarget: refreshTarget,
  };
}

function extractReferralTargets(data: unknown): DigestReferralTarget[] {
  const targets = (data as { referralGraph?: { prioritizedTargets?: unknown[] } } | null)
    ?.referralGraph?.prioritizedTargets;
  if (!Array.isArray(targets)) return [];
  return targets
    .map((target) => {
      const t = target as {
        id?: unknown;
        name?: unknown;
        cat?: unknown;
        distanceMiles?: unknown;
      };
      if (typeof t.name !== "string" || !t.name.trim()) return null;
      return {
        id: typeof t.id === "string" && t.id.trim() ? t.id : t.name,
        name: t.name.trim(),
        category: typeof t.cat === "string" ? t.cat : "referral_source",
        distanceMiles: typeof t.distanceMiles === "number" ? t.distanceMiles : null,
      };
    })
    .filter((target): target is DigestReferralTarget => !!target)
    .slice(0, 8);
}

function totalReferralSources(data: unknown): number {
  const graph = (data as { referralGraph?: { totalViableSources?: unknown; prioritizedTargets?: unknown[] } } | null)
    ?.referralGraph;
  return typeof graph?.totalViableSources === "number"
    ? graph.totalViableSources
    : Array.isArray(graph?.prioritizedTargets)
      ? graph.prioritizedTargets.length
      : 0;
}

function buildReferralTeaser(
  targets: DigestReferralTarget[],
  totalSources: number,
  outreach: { statusByTarget: Map<string, string>; workedCount: number; respondedCount: number; referringCount: number } | null,
): DigestReferralTeaser | null {
  if (targets.length === 0) return null;
  const statusByTarget = outreach?.statusByTarget ?? new Map<string, string>();
  const freshTargets = targets.filter((target) => {
    const status = statusByTarget.get(target.id);
    return status !== "dismissed" && status !== "referring";
  });
  const selected = (freshTargets.length > 0 ? freshTargets : targets).slice(0, 3);
  if (selected.length === 0) return null;
  return {
    totalSources: Math.max(totalSources, targets.length),
    starterTotal: Math.min(5, targets.length),
    workedCount: outreach?.workedCount ?? 0,
    respondedCount: outreach?.respondedCount ?? 0,
    referringCount: outreach?.referringCount ?? 0,
    targets: selected.map((target) => ({
      name: target.name,
      category: target.category,
      distanceMiles: target.distanceMiles,
    })),
  };
}

function computeDeltaPct(current: number, prior: number): number | null {
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function classifySourceRef(referrer: string | null): "direct" | "search" | "internal" | "other" {
  if (!referrer || referrer === "") return "direct";
  if (referrer.startsWith("internal:")) return "internal";
  const host = referrer.toLowerCase();
  if (
    host.includes("google") ||
    host.includes("bing") ||
    host.includes("duckduckgo") ||
    host.includes("yahoo") ||
    host.includes("ecosia")
  ) {
    return "search";
  }
  return "other";
}

function findTopSource(sources: Record<string, number>): string | null {
  const entries = Object.entries(sources).filter(([k]) => k !== "direct" && k !== "internal");
  entries.sort((a, b) => b[1] - a[1]);
  const [name, count] = entries[0] ?? [null, 0];
  if (!name || count === 0) return null;
  const labels: Record<string, string> = {
    search: "Google search",
    other: "external sites",
  };
  return labels[name] ?? name;
}

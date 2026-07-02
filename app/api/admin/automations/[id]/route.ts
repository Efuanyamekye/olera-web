import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { getCronJob, isEmailJob } from "@/lib/crons/registry";
import { variantsForCron } from "@/lib/email-samples";

/**
 * GET /api/admin/automations/[id]
 *
 * Detail payload for one automation, for /admin/automations/[id]:
 *   - the registry entry (+ isEmail), pause state, the 30-day email rollup
 *   - the full recent run history (last 100)
 *   - a 4-week trend (sends / delivered / opened / clicked per ISO week) for email jobs
 *   - `previewTypes` — email_type(s) for which a rendered email body exists in email_log
 *
 * cron_runs / cron_config may be absent (migration 082 not applied) — fail soft.
 */

const ALLOWED_WINDOWS = [7, 30, 90];
const TREND_MS = 28 * 24 * 60 * 60 * 1000;

function isoWeek(d: Date): string {
  // YYYY-Www (Monday-start). Good enough for a 4-bar trend.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  t.setUTCDate(t.getUTCDate() - day);
  return t.toISOString().slice(0, 10);
}

// ── Per-variant breakdown (weekly digest sends three distinct templates under one email_type) ──
const VARIANT_LABELS: Record<string, string> = {
  family_question: "Family question",
  leads: "Leads recap",
  find_families: "Find Families",
  managed_ads: "Managed ads",
  referral_teaser: "Referral teaser",
  market_rank: "Market rank",
  weekly_digest: "Weekly digest",
  completion: "Completion nudge",
  cold_rank: "Cold rank note",
};
const VARIANT_ORDER = ["family_question", "leads", "find_families", "managed_ads", "referral_teaser", "market_rank", "weekly_digest", "completion", "cold_rank"];

// ── Per-variant downstream CONVERSION ──
// Each variant maps to the one provider_activity event that means "this email worked".
// Because the cron router sends exactly ONE variant per provider per run, most conversion
// events are naturally unambiguous. The market-rank and referral-teaser variants deliberately
// share the same "worked market" event, so attribution is last-touch across both variants.
// weekly_digest is the soft one — a portal re-visit (one_click_access), re-engagement not a
// hard conversion, by design (it's the recurring engine, not a one-time ask).
const CONVERSION_EVENT: Record<string, string> = {
  family_question: "question_responded",
  leads: "lead_opened",
  find_families: "matches_outreach_sent",
  managed_ads: "managed_ads_boost_viewed",
  referral_teaser: "market_outreach_status_updated",
  market_rank: "market_outreach_status_updated",
  completion: "profile_published",
  cold_rank: "claim_completed",
  weekly_digest: "one_click_access",
};
const CONVERSION_LABEL: Record<string, string> = {
  family_question: "Answered",
  leads: "Lead opened",
  find_families: "Reached out",
  managed_ads: "Viewed managed ads",
  referral_teaser: "Worked market",
  market_rank: "Worked market",
  completion: "Profile published",
  cold_rank: "Listing claimed",
  weekly_digest: "Re-visited portal",
};
const MARKET_OUTREACH_CONVERSION_STATUSES = new Set(["contacted", "responded", "referring"]);
// Last-touch attribution window: an action counts as driven by a send if it happens within
// 14 days AFTER that send. Last-touch (most recent preceding send wins) so the weekly cadence
// can't double-count a single action across two consecutive sends.
const ATTRIBUTION_DAYS = 14;

type VRow = {
  email_type: string; created_at: string; delivered_at: string | null; first_opened_at: string | null;
  first_clicked_at: string | null; bounced_at: string | null; complained_at: string | null;
  html_body: string | null; metadata: Record<string, unknown> | null; subject: string | null;
  provider_id: string | null;
};
type Send = { providerId: string | null; sentAt: number; delivered: boolean };
/**
 * Count delivered sends that converted, under last-touch N-day attribution across variants.
 * When two variants share the same downstream event (market rank and referral teaser both convert
 * on market work), one provider action should credit only the most recent preceding send.
 */
function countConvertedByVariant(
  sendsByVariant: Record<string, Send[]>,
  eventTimesByType: Map<string, Map<string, number[]>>,
  windowMs: number,
): Map<string, number> {
  const converted = new Map<string, number>();
  const credited = new Set<string>();
  const variantsByEvent = new Map<string, string[]>();
  for (const variant of VARIANT_ORDER) {
    const eventType = CONVERSION_EVENT[variant];
    if (!eventType) continue;
    const arr = variantsByEvent.get(eventType) ?? [];
    arr.push(variant);
    variantsByEvent.set(eventType, arr);
  }

  for (const [eventType, variants] of variantsByEvent) {
    const eventTimesByProvider = eventTimesByType.get(eventType);
    if (!eventTimesByProvider) continue;
    const sendsByProvider = new Map<string, Array<{ variant: string; index: number; sentAt: number }>>();
    for (const variant of variants) {
      for (const [index, send] of (sendsByVariant[variant] ?? []).entries()) {
        if (!send.delivered || !send.providerId) continue;
        const arr = sendsByProvider.get(send.providerId) ?? [];
        arr.push({ variant, index, sentAt: send.sentAt });
        sendsByProvider.set(send.providerId, arr);
      }
    }
    for (const [providerId, sends] of sendsByProvider) {
      const eventTimes = eventTimesByProvider.get(providerId);
      if (!eventTimes || eventTimes.length === 0) continue;
      sends.sort((a, b) => a.sentAt - b.sentAt);
      for (const eventAt of eventTimes) {
        let best: { variant: string; index: number; sentAt: number } | null = null;
        for (const send of sends) {
          if (send.sentAt >= eventAt) break;
          best = send;
        }
        if (!best || eventAt - best.sentAt > windowMs) continue;
        const key = `${best.variant}:${best.index}`;
        if (credited.has(key)) continue;
        credited.add(key);
        converted.set(best.variant, (converted.get(best.variant) ?? 0) + 1);
      }
    }
  }
  return converted;
}
type VStat = { sent: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number };
const emptyVStat = (): VStat => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 });
function accVStat(s: VStat, e: VRow) {
  s.sent += 1;
  if (e.delivered_at) s.delivered += 1;
  if (e.first_opened_at) s.opened += 1;
  if (e.first_clicked_at) s.clicked += 1;
  if (e.bounced_at) s.bounced += 1;
  if (e.complained_at) s.complained += 1;
}
/**
 * Which digest variant a send is. Prefers the stamped metadata.variant (new sends); falls back to
 * subject-pattern inference so the breakdown also covers rows sent before instrumentation landed.
 */
function classifyVariant(subject: string | null, metadata: Record<string, unknown> | null): { variant: string; ledWithRank: boolean } {
  const mv = metadata?.variant;
  if (mv === "weekly_digest" && metadata?.ledWithRank === true) {
    return { variant: "market_rank", ledWithRank: true };
  }
  if (mv === "family_question" || mv === "leads" || mv === "find_families" || mv === "managed_ads" || mv === "referral_teaser" || mv === "market_rank" || mv === "weekly_digest" || mv === "cold_rank" || mv === "completion") {
    return { variant: mv, ledWithRank: metadata?.ledWithRank === true };
  }
  const s = subject ?? "";
  if (/^A family has a question/i.test(s)) return { variant: "family_question", ledWithRank: false };
  if (/reached out about .+ this week$/i.test(s)) return { variant: "leads", ledWithRank: false };
  if (/near you (is|are) looking for care$/i.test(s)) return { variant: "find_families", ledWithRank: false };
  if (/searched for care .+ this week$/i.test(s) || /you're not reaching yet$/i.test(s)) return { variant: "managed_ads", ledWithRank: false };
  if (/^Families in .+ rank you/i.test(s)) return { variant: "cold_rank", ledWithRank: true };
  if (/^See what families see on /i.test(s)) return { variant: "completion", ledWithRank: false };
  if (/^\d+ (.+-area places families may ask (about care|who to call)|.+ teams families may ask about care|local teams families may ask about care|referral sources near )/i.test(s) || /^See (who families may ask|the referral map) /i.test(s)) return { variant: "referral_teaser", ledWithRank: true };
  if (/^You're #\d+ of /i.test(s) || /^See where you rank/i.test(s)) return { variant: "market_rank", ledWithRank: true };
  return { variant: "weekly_digest", ledWithRank: false };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const { id } = await params;
  const daysParam = parseInt(new URL(req.url).searchParams.get("days") || "30", 10);
  const windowDays = ALLOWED_WINDOWS.includes(daysParam) ? daysParam : 30;
  const job = getCronJob(id);
  if (!job) return NextResponse.json({ error: "Unknown automation" }, { status: 404 });
  const samplePreviewTypes = variantsForCron(id).map((v) => ({
    id: v.id,
    label: v.label,
    subject: v.subject,
    emailType: v.emailType,
  }));

  const db = getServiceClient();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const trendSince = new Date(Date.now() - TREND_MS).toISOString();

  // ── run history (fail soft) ──
  let runs: Array<{ id: string; started_at: string; finished_at: string | null; status: string; summary: Record<string, unknown> | null; error: string | null; triggered_by: string }> = [];
  try {
    const { data } = await db
      .from("cron_runs")
      .select("id, started_at, finished_at, status, summary, error, triggered_by")
      .eq("job_id", id)
      .order("started_at", { ascending: false })
      .limit(100);
    runs = data ?? [];
  } catch {
    /* table not yet created */
  }

  // ── pause state (fail soft) ──
  let pause: { reason: string | null; by: string | null; at: string | null; until: string | null } | null = null;
  let paused = false;
  try {
    const { data } = await db
      .from("cron_config")
      .select("enabled, paused_at, paused_by, paused_reason, paused_until")
      .eq("job_id", id)
      .maybeSingle();
    if (data && data.enabled === false && (!data.paused_until || new Date(data.paused_until).getTime() > Date.now())) {
      paused = true;
      pause = { reason: data.paused_reason, by: data.paused_by, at: data.paused_at, until: data.paused_until };
    }
  } catch {
    /* table not yet created */
  }

  // ── 30-day rollup + 4-week trend (email jobs only) ──
  let rollup30d: { sent: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number } | null = null;
  let trend: Array<{ week: string; sent: number; delivered: number; opened: number; clicked: number }> = [];
  const previewTypes: string[] = [];
  // Per-variant rollup (only meaningful when a job's one email_type fans out into templates, like
  // the weekly digest). `variants[].split` carries the rank-led vs plain breakdown for weekly_digest.
  // `converted`/`convRate`/`convEvent`/`convLabel` carry the downstream-conversion attribution.
  type VariantOut = VStat & {
    key: string; label: string; split?: { withRank: VStat; plain: VStat };
    converted?: number; convRate?: number; convEvent?: string; convLabel?: string;
  };
  let variants: VariantOut[] = [];
  if (job.emailTypes.length > 0) {
    rollup30d = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
    const weekMap = new Map<string, { sent: number; delivered: number; opened: number; clicked: number }>();
    const vAgg: Record<string, VStat> = {};
    const vSends: Record<string, Send[]> = {}; // per-variant delivered/undelivered sends for conversion attribution
    const wkWithRank = emptyVStat();
    const wkPlain = emptyVStat();
    const isDigestJob = id === "weekly-provider-digest";
    try {
      // Fetch the wider of (rollup window, trend window) so a short window (7d) doesn't starve the
      // fixed 4-week trend. The rollup + variants then gate to `since` per-row; the trend to trendSince.
      const fetchSince = since < trendSince ? since : trendSince;
      const { data } = await db
        .from("email_log")
        .select("email_type, created_at, delivered_at, first_opened_at, first_clicked_at, bounced_at, complained_at, html_body, metadata, subject, provider_id")
        .in("email_type", job.emailTypes)
        .gte("created_at", fetchSince)
        .order("created_at", { ascending: false })
        .limit(100000);
      const seenPreviewTypes = new Set<string>();
      for (const e of (data ?? []) as VRow[]) {
        const inWindow = e.created_at >= since;
        if (inWindow) {
          rollup30d.sent += 1;
          if (e.delivered_at) rollup30d.delivered += 1;
          if (e.first_opened_at) rollup30d.opened += 1;
          if (e.first_clicked_at) rollup30d.clicked += 1;
          if (e.bounced_at) rollup30d.bounced += 1;
          if (e.complained_at) rollup30d.complained += 1;
        }
        if (e.created_at >= trendSince) {
          const wk = isoWeek(new Date(e.created_at));
          const w = weekMap.get(wk) ?? { sent: 0, delivered: 0, opened: 0, clicked: 0 };
          w.sent += 1;
          if (e.delivered_at) w.delivered += 1;
          if (e.first_opened_at) w.opened += 1;
          if (e.first_clicked_at) w.clicked += 1;
          weekMap.set(wk, w);
        }
        // Variant breakdown — only the weekly digest fans one email_type into multiple templates,
        // so classifyVariant's digest-specific patterns only make sense there. For any other job
        // the subjects wouldn't match and would all collapse into a bogus "weekly_digest" bucket.
        if (inWindow && isDigestJob) {
          const { variant, ledWithRank } = classifyVariant(e.subject, e.metadata);
          (vAgg[variant] ??= emptyVStat());
          accVStat(vAgg[variant], e);
          (vSends[variant] ??= []).push({ providerId: e.provider_id, sentAt: Date.parse(e.created_at), delivered: !!e.delivered_at });
          if (variant === "weekly_digest") accVStat(ledWithRank ? wkWithRank : wkPlain, e);
        }
        if (inWindow && e.html_body && !seenPreviewTypes.has(e.email_type)) seenPreviewTypes.add(e.email_type);
      }
      previewTypes.push(...seenPreviewTypes);
      // Show the full digest taxonomy (all three templates + the weekly-digest rank split), even
      // variants with no sends in this window — so the breakdown reflects what the digest *can*
      // send, not just what happened to fire. Empty ones render muted on the page.
      if (isDigestJob) {
        // Downstream conversion: fetch the mapped provider_activity events over the rollup window
        // (every event that could attribute to an in-window send falls at or after `since`), then
        // last-touch-attribute each to a send within the 14-day window. Fail-soft: if the table or
        // columns are absent, variants render without conversion (the page falls back gracefully).
        const eventTimesByType = new Map<string, Map<string, number[]>>(); // eventType -> providerId -> times
        try {
          const { data: acts } = await db
            .from("provider_activity")
            .select("provider_id, event_type, created_at, metadata")
            .in("event_type", Object.values(CONVERSION_EVENT))
            .gte("created_at", since)
            .limit(100000);
          for (const a of (acts ?? []) as Array<{ provider_id: string | null; event_type: string; created_at: string; metadata: Record<string, unknown> | null }>) {
            if (!a.provider_id) continue;
            if (a.event_type === "market_outreach_status_updated") {
              const status = typeof a.metadata?.status === "string" ? a.metadata.status : null;
              if (!status || !MARKET_OUTREACH_CONVERSION_STATUSES.has(status)) continue;
            }
            const byProv = eventTimesByType.get(a.event_type) ?? new Map<string, number[]>();
            const arr = byProv.get(a.provider_id);
            if (arr) arr.push(Date.parse(a.created_at));
            else byProv.set(a.provider_id, [Date.parse(a.created_at)]);
            eventTimesByType.set(a.event_type, byProv);
          }
        } catch {
          /* provider_activity unavailable — skip conversion */
        }
        const windowMs = ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000;
        const convertedByVariant = countConvertedByVariant(vSends, eventTimesByType, windowMs);
        variants = VARIANT_ORDER.map((k) => {
          const stat = vAgg[k] ?? emptyVStat();
          const evType = CONVERSION_EVENT[k];
          const converted = convertedByVariant.get(k) ?? 0;
          return {
            key: k,
            label: VARIANT_LABELS[k],
            ...stat,
            ...(k === "weekly_digest" ? { split: { withRank: wkWithRank, plain: wkPlain } } : {}),
            converted,
            convRate: stat.delivered > 0 ? converted / stat.delivered : 0,
            convEvent: evType,
            convLabel: CONVERSION_LABEL[k],
          };
        });
      }
    } catch {
      rollup30d = null;
    }
    trend = [...weekMap.entries()].map(([week, v]) => ({ week, ...v })).sort((a, b) => a.week.localeCompare(b.week));
  }

  return NextResponse.json({
    job: {
      ...job,
      isEmail: isEmailJob(job),
    },
    paused,
    pause,
    rollup30d,
    trend,
    variants,
    previewTypes,
    samplePreviewTypes,
    runs,
    windowDays,
  });
}

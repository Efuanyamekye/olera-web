import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { correctionLines, loadCorrections } from "@/lib/war-room/corrections.server";
import { loadReactionSummary, recordMove, resolveReactions } from "@/lib/war-room/moves.server";
import { loadProviderMoments } from "@/lib/war-room/provider-moments.server";
import { loadPaidRenewal } from "@/lib/war-room/renewals.server";

/**
 * Cortex speaks first, on moments, not on a schedule.
 *
 * Cortex only ever spoke in the daily brief or when asked, so a partnership
 * email, a fresh lead or a renewal at risk waited for tomorrow's brief. Jade
 * got better once it was allowed to lead (TJ: "be on the offense") with a log
 * of what landed. This is that for Cortex: every few hours code finds the real
 * moments, a model decides whether one is worth interrupting him for and words
 * it, and it usually says nothing. At most two a day, never at night in
 * Bangkok, never the same subject twice in three days, never one he has
 * ignored twice. Each one is logged in cortex_moves and judged there.
 *
 * Once a week it also asks him to rate its messages, and the score is stored
 * as a correction (moves.server.ts).
 */

export const MAX_PINGS_PER_DAY = 2;
const REPEAT_WINDOW_MS = 3 * 86_400_000;
const LEAD_WINDOW_MS = 6 * 3_600_000;
const STALE_APPROVED_DAYS = 3;

export type Moment = { subjectKey: string; priority: number; kind: string; facts: string };

/** The founder's local clock. He lives in Bangkok. */
export function bangkokClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", hour: "numeric", hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour);
  // Midnight Bangkok, as an instant, for "pings today".
  const dayStart = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+07:00`).toISOString();
  return { hour, weekday: parts.weekday as string, dayStart };
}

/** 08:00 to 22:00 Bangkok. Outside that, nothing unprompted. */
export function inWakingHours(now = new Date()) {
  const { hour } = bangkokClock(now);
  return hour >= 8 && hour < 22;
}

/** The candidates, from live tables. Highest priority first. */
export async function findMoments(db: SupabaseClient, now = Date.now()): Promise<Moment[]> {
  const moments: Moment[] = [];

  // A provider wrote and nobody has answered: partnerships first.
  const emails = await loadProviderMoments(db).catch(() => []);
  for (const email of emails) {
    if (email.reply || !email.lastInboundAt || now - Date.parse(email.lastInboundAt) > 24 * 3_600_000) continue;
    moments.push({
      subjectKey: `moment:${email.threadId}`,
      priority: email.kind === "partnership" ? 100 : 60,
      kind: email.kind === "partnership" ? "partnership signal, unanswered" : "provider email, unanswered",
      facts: JSON.stringify({ provider: email.provider, subject: email.subject, summary: email.summary, theirUnanswered: email.unanswered.map((m) => m.text.slice(0, 400)), yourLastReply: email.earlierReply?.text.slice(0, 300) ?? null }),
    });
  }

  // The paying provider's renewal is close.
  const renewal = await loadPaidRenewal(db).catch(() => null);
  if (renewal?.daysUntilRenewal !== null && renewal?.daysUntilRenewal !== undefined && renewal.daysUntilRenewal <= 7) {
    moments.push({
      subjectKey: `renewal:${renewal.name}`,
      priority: 90,
      kind: "paying provider renews within a week",
      facts: JSON.stringify(renewal),
    });
  }

  // A new ad lead for a provider's own campaign, in the last few hours.
  const { data: leads } = await db.from("city_leads")
    .select("id, slug, status, care_recipient, care_type, zip, created_at, qualification_verdict_category, handed_at")
    .gte("created_at", new Date(now - LEAD_WINDOW_MS).toISOString())
    .or("is_test.is.null,is_test.eq.false")
    .limit(20);
  const leadRows = (leads ?? []) as Array<{ id: string; slug: string; status: string | null; care_recipient: string | null; care_type: string | null; zip: string | null; created_at: string; qualification_verdict_category: string | null; handed_at: string | null }>;
  if (leadRows.length) {
    const { data: campaigns } = await db.from("city_campaigns")
      .select("slug, channel, request_id")
      .in("slug", [...new Set(leadRows.map((lead) => lead.slug))])
      .not("request_id", "is", null);
    const requestIds = [...new Set(((campaigns ?? []) as Array<{ request_id: string }>).map((c) => c.request_id))];
    const { data: requests } = requestIds.length
      ? await db.from("ad_campaign_requests").select("id, display_name, plan_status").in("id", requestIds)
      : { data: [] };
    const bySlug = new Map(((campaigns ?? []) as Array<{ slug: string; request_id: string }>).map((c) => [c.slug, c.request_id]));
    const byRequest = new Map(((requests ?? []) as Array<{ id: string; display_name: string | null; plan_status: string | null }>).map((r) => [r.id, r]));
    for (const lead of leadRows) {
      const request = byRequest.get(bySlug.get(lead.slug) ?? "");
      if (!request || lead.qualification_verdict_category === "looking_for_work") continue;
      const paying = ["active", "past_due"].includes(request.plan_status ?? "");
      moments.push({
        subjectKey: `lead:${lead.id}`,
        priority: paying ? 80 : 50,
        kind: paying ? "new ad lead for the paying provider" : "new ad lead for a provider campaign",
        facts: JSON.stringify({ provider: request.display_name, careFor: lead.care_recipient, careType: lead.care_type, zip: lead.zip, arrived: lead.created_at, status: lead.status, handedToProvider: Boolean(lead.handed_at) }),
      });
    }
  }

  // Work he approved that nobody has started.
  const { data: approved } = await db.from("war_room_proposals")
    .select("id, title, approved_at, assigned_owner, action_kind")
    .eq("status", "approved")
    .neq("action_kind", "code")
    .lt("approved_at", new Date(now - STALE_APPROVED_DAYS * 86_400_000).toISOString())
    .limit(3);
  for (const row of (approved ?? []) as Array<{ id: string; title: string; approved_at: string; assigned_owner: string | null }>) {
    moments.push({
      subjectKey: `proposal:${row.id}`,
      priority: 40,
      kind: "approved work not started",
      facts: JSON.stringify({ title: row.title, approvedAt: row.approved_at, owner: row.assigned_owner }),
    });
  }

  return moments.sort((a, b) => b.priority - a.priority);
}

const PING_SYSTEM = `You are Cortex, Olera's thinking partner. You may message the founder first, on Telegram, but only when it is worth interrupting him: he is busy, and a message he ignores costs trust. You are given one moment found in Olera's data, his standing corrections, and how he reacted to your recent messages.

Decide: is this worth a message right now? Say no when it is routine, when he clearly already knows, when a recent message on the same thing was ignored, or when there is nothing he can do about it today.

If yes, write the message: two or three short sentences, blunt and warm, the way a sharp cofounder texts. Say what happened with the one fact that matters, and the one move for him. Name people and providers. No greeting, no sign-off, no em dashes, no markdown headers, at most one question. Talk to him as "you".

Reply with JSON only: {"send": true, "message": "..."} or {"send": false, "why": "..."}.`;

export async function wordPing(moment: Moment, context: { corrections: string[]; reactions: string[] }): Promise<{ send: boolean; message?: string; why?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { send: false, why: "no model key" };
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const reply = await anthropic.messages.create({
    model: process.env.CORTEX_TICK_MODEL || "claude-sonnet-5",
    max_tokens: 1_500,
    system: PING_SYSTEM,
    messages: [{
      role: "user",
      content: JSON.stringify({
        moment: { kind: moment.kind, facts: moment.facts },
        yourStandingCorrections: context.corrections,
        howHeReactedToYourRecentMessages: context.reactions,
        nowUtc: new Date().toISOString(),
      }),
    }],
  }, { timeout: 45_000, maxRetries: 0 });
  const text = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
  try {
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { send?: boolean; message?: string; why?: string };
    const message = typeof parsed.message === "string" ? parsed.message.replace(/\s*[—–]\s*/g, ", ").trim() : "";
    return parsed.send && message.length > 10 ? { send: true, message } : { send: false, why: parsed.why ?? "model chose silence" };
  } catch {
    return { send: false, why: "unparseable reply" };
  }
}

export const RATE_ME_TEXT = "Quick one, once a week: rate my messages from the last seven days, 1 to 10, and tell me the one thing to change. Just the number is fine.";

/** Sunday evening Bangkok, once a week, and only after a week with something to rate. */
export function rateMeDue(now: Date, lastRateMe: string | null, cortexMessagesThisWeek: number) {
  const { weekday, hour } = bangkokClock(now);
  if (weekday !== "Sun" || hour < 18 || hour >= 22) return false;
  if (lastRateMe && now.getTime() - Date.parse(lastRateMe) < 6 * 86_400_000) return false;
  return cortexMessagesThisWeek >= 3;
}

export type TickDeps = {
  db: SupabaseClient;
  chatId: string;
  send: (chatId: string, text: string) => Promise<{ success: boolean; error?: string }>;
  remember: (text: string, kind: "ping") => Promise<unknown>;
  word?: typeof wordPing;
  now?: Date;
};

export type TickResult =
  | { spoke: false; reason: string; considered?: number }
  | { spoke: true; kind: "ping" | "rate_me"; subjectKey: string; message: string };

export async function runJudgmentTick(deps: TickDeps): Promise<TickResult> {
  const now = deps.now ?? new Date();
  if (!inWakingHours(now)) return { spoke: false, reason: "outside 08:00-22:00 Bangkok" };
  await resolveReactions(deps.db, now.getTime()).catch(() => undefined);
  const { dayStart } = bangkokClock(now);
  const reactions = await loadReactionSummary(deps.db, now.getTime(), dayStart);

  // The weekly rating, which does not count against the daily cap.
  const { count: cortexMessages } = await deps.db.from("cortex_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "cortex")
    .gte("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString());
  if (rateMeDue(now, reactions.lastRateMe, cortexMessages ?? 0)) {
    const sent = await deps.send(deps.chatId, RATE_ME_TEXT);
    if (sent.success) {
      await recordMove(deps.db, { kind: "rate_me", subjectKey: `rate_me:${dayStart.slice(0, 10)}`, text: RATE_ME_TEXT });
      await deps.remember(RATE_ME_TEXT, "ping");
      return { spoke: true, kind: "rate_me", subjectKey: `rate_me:${dayStart.slice(0, 10)}`, message: RATE_ME_TEXT };
    }
  }

  if (reactions.pingsToday >= MAX_PINGS_PER_DAY) return { spoke: false, reason: `already ${reactions.pingsToday} messages today` };

  const { data: recentPings } = await deps.db.from("cortex_moves")
    .select("subject_key")
    .gte("sent_at", new Date(now.getTime() - REPEAT_WINDOW_MS).toISOString());
  const recent = new Set(((recentPings ?? []) as Array<{ subject_key: string }>).map((row) => row.subject_key));
  const candidates = (await findMoments(deps.db, now.getTime()))
    .filter((moment) => !recent.has(moment.subjectKey) && !reactions.ignoredTwice.has(moment.subjectKey));
  if (!candidates.length) return { spoke: false, reason: "no new moment", considered: 0 };

  const corrections = correctionLines(await loadCorrections(deps.db).catch(() => []));
  // The top one only. Two borderline moments are not worth two interruptions.
  const moment = candidates[0];
  const worded = await (deps.word ?? wordPing)(moment, { corrections, reactions: reactions.lines });
  if (!worded.send || !worded.message) return { spoke: false, reason: `chose silence: ${worded.why ?? ""}`, considered: candidates.length };
  const sent = await deps.send(deps.chatId, worded.message);
  if (!sent.success) return { spoke: false, reason: `send failed: ${sent.error ?? ""}` };
  await recordMove(deps.db, { kind: "ping", subjectKey: moment.subjectKey, text: worded.message });
  await deps.remember(worded.message, "ping");
  return { spoke: true, kind: "ping", subjectKey: moment.subjectKey, message: worded.message };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { postAsCortex } from "@/lib/war-room/team-messages.server";
import { directoryHealthSummary, listHealthActions, type HealthActionRow } from "@/lib/providers/directory-health.server";

/**
 * Cortex speaking for itself in Slack.
 *
 * TJ, 6 Oct 2026: plans "just disappear" because time-based automations have
 * no voice. The answer is one channel (#cortex), one thread per initiative,
 * and a morning post that says what the agent did overnight, what it wants
 * decided, and, just as loudly, when nothing happened. Every post is keyed in
 * cortex_posts (migration 273) so a retried cron never repeats itself and a
 * later post can thread under the initiative it belongs to.
 */

export const CORTEX_CHANNEL = () => process.env.CORTEX_SLACK_CHANNEL || "#cortex";
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

export type PostOutcome = { posted: boolean; key: string; error?: string; skipped?: "already_posted" | "nothing_to_say" };

/** Post once per key. A second call with the same key is a no-op. */
export async function postOnce(
  db: SupabaseClient,
  args: { kind: string; key: string; text: string; threadTs?: string | null; channel?: string },
): Promise<PostOutcome> {
  const channel = args.channel ?? CORTEX_CHANNEL();
  const { data: existing } = await db.from("cortex_posts").select("id, slack_ts").eq("key", args.key).maybeSingle();
  if (existing?.slack_ts) return { posted: false, key: args.key, skipped: "already_posted" };
  const result = await postAsCortex(channel, args.text, { threadTs: args.threadTs ?? undefined });
  const row = {
    kind: args.kind, key: args.key, channel, text: args.text,
    thread_ts: args.threadTs ?? null,
    slack_ts: result.ok ? result.ts : null,
    error: result.ok ? null : result.error,
  };
  if (existing) await db.from("cortex_posts").update(row).eq("id", existing.id);
  else await db.from("cortex_posts").insert(row);
  return result.ok ? { posted: true, key: args.key } : { posted: false, key: args.key, error: result.error };
}

/**
 * The standing thread for an initiative ("directory", "meetings", "product").
 * Created on first use with a one-line header; everything after threads
 * under it so the channel stays one post per initiative per day at most.
 */
export async function initiativeThread(db: SupabaseClient, initiative: string, header: string): Promise<string | null> {
  const key = `thread:${initiative}`;
  const { data } = await db.from("cortex_posts").select("slack_ts").eq("key", key).maybeSingle();
  if (data?.slack_ts) return data.slack_ts as string;
  const out = await postOnce(db, { kind: "thread", key, text: header });
  if (!out.posted) return null;
  const { data: created } = await db.from("cortex_posts").select("slack_ts").eq("key", key).maybeSingle();
  return (created?.slack_ts as string | null) ?? null;
}

const KIND_WORDS: Record<string, string> = {
  closed_archived: "archived as permanently closed",
  rename_applied: "renamed to match Google",
  closed_temporarily: "marked temporarily closed by Google",
  rename_flagged: "named differently on Google",
  website_dead: "website unreachable",
  category_flagged: "category looks wrong",
  duplicate_flagged: "possible duplicate",
};

function providerLink(a: HealthActionRow): string {
  const name = a.provider_name ?? a.provider_id;
  return a.slug ? `<${SITE()}/provider/${a.slug}|${name}>` : name;
}

/**
 * What the directory system did since `since`, in Cortex's voice. Null when
 * nothing happened and nothing is waiting, so a quiet day posts nothing
 * (the weekly state post is where quiet gets said out loud).
 */
export async function directoryDigestText(db: SupabaseClient, since: Date): Promise<string | null> {
  const rows = (await listHealthActions(db, { open: false, limit: 300 })).filter((a) => Date.parse(a.created_at) >= since.getTime());
  const applied = rows.filter((a) => a.applied_at && !a.undone_at);
  const flagged = rows.filter((a) => !a.applied_at && !a.resolved_at);
  if (!applied.length && !flagged.length) return null;
  const group = (list: HealthActionRow[]) => {
    const by = new Map<string, HealthActionRow[]>();
    for (const a of list) by.set(a.kind, [...(by.get(a.kind) ?? []), a]);
    return [...by.entries()];
  };
  const lines: string[] = [];
  if (applied.length) {
    lines.push("*Directory, overnight.* What I did:");
    for (const [kind, list] of group(applied)) {
      const shown = list.slice(0, 5).map(providerLink).join(", ");
      lines.push(`• ${list.length} ${KIND_WORDS[kind] ?? kind.replace(/_/g, " ")}: ${shown}${list.length > 5 ? `, +${list.length - 5} more` : ""}`);
    }
    lines.push(`Undo any of these at <${SITE()}/admin/directory/health|admin › Directory health>.`);
  }
  if (flagged.length) {
    lines.push(applied.length ? "What I want a person to decide:" : "*Directory.* Waiting on a person:");
    for (const [kind, list] of group(flagged)) {
      const shown = list.slice(0, 5).map(providerLink).join(", ");
      lines.push(`• ${list.length} ${KIND_WORDS[kind] ?? kind.replace(/_/g, " ")}: ${shown}${list.length > 5 ? `, +${list.length - 5} more` : ""}`);
    }
    if (!applied.length) lines.push(`Done or Open on each at <${SITE()}/admin/directory/health|admin › Directory health>.`);
  }
  return lines.join("\n");
}

/** The weekly state of the directory, said even when nothing moved. */
export async function directoryWeeklyText(db: SupabaseClient): Promise<string> {
  const s = await directoryHealthSummary(db, 7);
  const total = s.checked + s.unchecked;
  const coverage = total ? Math.round((s.checked / total) * 100) : 0;
  const did = Object.entries(s.byKind).map(([k, v]) => `${v} ${KIND_WORDS[k] ?? k.replace(/_/g, " ")}`).join(", ");
  const sinceLast = s.lastActionAt ? Math.floor((Date.now() - Date.parse(s.lastActionAt)) / 86_400_000) : null;
  const quiet = sinceLast === null ? "I have not acted on the directory yet." : sinceLast > 7 ? `My last action was ${sinceLast} days ago; something is stuck.` : "";
  return [
    `*Directory, this week.* ${did || "Nothing changed."} ${s.openFlags} flag${s.openFlags === 1 ? "" : "s"} waiting on a person.`,
    `${coverage}% of the directory checked against Google (${s.checked.toLocaleString()} of ${total.toLocaleString()}); about 10,000 more each month at $0.`,
    quiet,
  ].filter(Boolean).join("\n");
}

/**
 * Pull requests the Mac runner opened from approved briefs and nobody has
 * looked at: said every morning until they are merged or dropped.
 */
export async function handoffsWaitingText(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("cortex_handoffs")
    .select("id, title, status, result, closed_at")
    .in("status", ["done", "partial"])
    .not("result", "is", null)
    .order("closed_at", { ascending: false })
    .limit(20);
  const waiting = (data ?? []).filter((h) => /github\.com\/.+\/pull\/\d+/.test(String(h.result)));
  if (!waiting.length) return null;
  const open: string[] = [];
  for (const h of waiting) {
    const url = String(h.result).match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/)?.[0];
    if (!url) continue;
    const state = await prState(url);
    if (state === "OPEN") open.push(`• <${url}|${h.title}>${h.status === "partial" ? " (partial)" : ""}`);
  }
  if (!open.length) return null;
  return [`*Pull requests waiting for your look* (built from briefs you approved):`, ...open, "Reply here with yes to merge, or what to change."].join("\n");
}

async function prState(url: string): Promise<"OPEN" | "MERGED" | "CLOSED" | "UNKNOWN"> {
  const token = process.env.WAR_ROOM_GITHUB_TOKEN;
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!token || !m) return "UNKNOWN";
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/pulls/${m[3]}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return "UNKNOWN";
    const pr = (await res.json()) as { state?: string; merged?: boolean };
    return pr.merged ? "MERGED" : pr.state === "open" ? "OPEN" : "CLOSED";
  } catch {
    return "UNKNOWN";
  }
}

/** The morning: directory digest (daily, only when something happened), weekly state on Mondays, PRs waiting. */
export async function speakMorning(db: SupabaseClient, now: Date = new Date()): Promise<Record<string, PostOutcome>> {
  const day = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const out: Record<string, PostOutcome> = {};

  const directoryThread = await initiativeThread(db, "directory", "*Directory health.* I check listings against Google and our own signals, archive what is closed, apply trivial renames, and flag the rest. Daily what I did is in this thread; undo is one click in admin.");
  const digest = await directoryDigestText(db, since);
  out.directory = digest
    ? await postOnce(db, { kind: "directory_digest", key: `directory:${day}`, text: digest, threadTs: directoryThread })
    : { posted: false, key: `directory:${day}`, skipped: "nothing_to_say" };
  if (now.getUTCDay() === 1) {
    out.weekly = await postOnce(db, { kind: "directory_weekly", key: `directory-week:${day}`, text: await directoryWeeklyText(db), threadTs: directoryThread });
  }

  const prs = await handoffsWaitingText(db);
  out.handoffs = prs
    ? await postOnce(db, { kind: "handoff_update", key: `handoffs:${day}`, text: prs })
    : { posted: false, key: `handoffs:${day}`, skipped: "nothing_to_say" };
  return out;
}

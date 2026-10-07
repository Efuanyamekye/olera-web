import type { SupabaseClient } from "@supabase/supabase-js";
import { postAsCortex } from "@/lib/war-room/team-messages.server";
import { directoryHealthSummary, type HealthActionRow } from "@/lib/providers/directory-health.server";
import { loadTuning } from "@/lib/war-room/tuning.server";
import { providerTractionText } from "@/lib/war-room/provider-traction.server";
import { providerGapsText } from "@/lib/war-room/provider-gaps.server";
import { shouldSpeakDaily, shouldSpeakWeekly } from "@/lib/war-room/tuning";

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
  closed_flagged: "marked permanently closed by Google (archive waits for you)",
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
export async function directoryDigestText(db: SupabaseClient, since: Date, period: "overnight" | "this week" = "overnight"): Promise<string | null> {
  // Read the window directly: the queue's 300-row page truncated a day the
  // website sweep wrote 1,996 rows, and the digest said "300".
  const { data } = await db.from("provider_health_actions")
    .select("id, provider_id, kind, source, evidence, applied_at, resolved_at, undone_at, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(5_000);
  const base = (data ?? []) as Array<Omit<HealthActionRow, "provider_name" | "slug">>;
  const appliedBase = base.filter((a) => a.applied_at && !a.undone_at);
  // A dead website is a signal, not a decision for a person: it moves the
  // provider to the front of the next free Google check. Said as a count.
  const deadSites = base.filter((a) => a.kind === "website_dead" && !a.resolved_at);
  const flaggedBase = base.filter((a) => a.kind !== "website_dead" && !a.applied_at && !a.resolved_at);
  if (!appliedBase.length && !flaggedBase.length && !deadSites.length) return null;
  // Names only for what will be shown. Looking up "the first 400 ids of the
  // day" missed Stinvil Home Care on a day the sweep wrote 2,966 rows, and
  // the digest printed its id instead.
  const shownIds = [...new Set([...appliedBase, ...flaggedBase].map((a) => a.provider_id))].slice(0, 400);
  const names = new Map<string, { provider_name: string | null; slug: string | null }>();
  for (let i = 0; i < shownIds.length; i += 200) {
    const { data: providers } = await db.from("olera-providers").select("provider_id, provider_name, slug").in("provider_id", shownIds.slice(i, i + 200));
    for (const p of providers ?? []) names.set(p.provider_id as string, { provider_name: (p.provider_name as string | null) ?? null, slug: (p.slug as string | null) ?? null });
  }
  const named = (a: Omit<HealthActionRow, "provider_name" | "slug">): HealthActionRow => ({ ...a, provider_name: names.get(a.provider_id)?.provider_name ?? null, slug: names.get(a.provider_id)?.slug ?? null });
  const applied = appliedBase.map(named);
  const flagged = flaggedBase.map(named);
  const group = (list: HealthActionRow[]) => {
    const by = new Map<string, HealthActionRow[]>();
    for (const a of list) by.set(a.kind, [...(by.get(a.kind) ?? []), a]);
    return [...by.entries()];
  };
  const lines: string[] = [];
  if (applied.length) {
    lines.push(`*Directory, ${period}.* What I did:`);
    for (const [kind, list] of group(applied)) {
      const shown = list.slice(0, 5).map(providerLink).join(", ");
      lines.push(`• ${list.length.toLocaleString("en-US")} ${KIND_WORDS[kind] ?? kind.replace(/_/g, " ")}: ${shown}${list.length > 5 ? `, +${(list.length - 5).toLocaleString("en-US")} more` : ""}`);
    }
    lines.push(`Undo any of these at <${SITE()}/admin/directory/health|admin › Directory health>.`);
  }
  if (deadSites.length) {
    const checkable = await countWithPlaceId(db, deadSites.map((a) => a.provider_id));
    const noGoogle = deadSites.length - checkable;
    lines.push(`${applied.length ? "" : "*Directory.* "}${deadSites.length.toLocaleString("en-US")} provider website${deadSites.length === 1 ? "" : "s"} came back dead. Not a verdict on its own; ${checkable.toLocaleString("en-US")} of them go first in the next free Google check, which archives the closed ones and clears the rest.${noGoogle ? ` ${noGoogle.toLocaleString("en-US")} have no Google listing to check and wait in <${SITE()}/admin/directory/health|admin › Directory health>.` : ""}`);
  }
  if (flagged.length) {
    lines.push(applied.length || deadSites.length ? "What I want a person to decide:" : "*Directory.* Waiting on a person:");
    for (const [kind, list] of group(flagged)) {
      const shown = list.slice(0, 5).map(providerLink).join(", ");
      lines.push(`• ${list.length.toLocaleString("en-US")} ${KIND_WORDS[kind] ?? kind.replace(/_/g, " ")}: ${shown}${list.length > 5 ? `, +${(list.length - 5).toLocaleString("en-US")} more` : ""}`);
    }
    if (!applied.length) lines.push(`Done or Open on each at <${SITE()}/admin/directory/health|admin › Directory health>.`);
  }
  return lines.join("\n");
}

/** How many of these providers have a Place ID, i.e. can be asked about on Google. */
async function countWithPlaceId(db: SupabaseClient, providerIds: string[]): Promise<number> {
  const ids = [...new Set(providerIds)];
  let n = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const { count } = await db.from("olera-providers").select("provider_id", { count: "exact", head: true }).in("provider_id", ids.slice(i, i + 500)).not("place_id", "is", null);
    n += count ?? 0;
  }
  return n;
}

/** The weekly state of the directory, said even when nothing moved. */
export async function directoryWeeklyText(db: SupabaseClient): Promise<string> {
  const s = await directoryHealthSummary(db, 7);
  const total = s.checked + s.unchecked;
  const coverage = total ? Math.round((s.checked / total) * 100) : 0;
  const did = Object.entries(s.byKind).filter(([k]) => k !== "website_dead").map(([k, v]) => `${v.toLocaleString("en-US")} ${KIND_WORDS[k] ?? k.replace(/_/g, " ")}`).join(", ");
  const dead = s.deadWebsites ? ` ${s.deadWebsites.toLocaleString("en-US")} dead websites are queued for their Google check${s.deadNoGoogle ? `; ${s.deadNoGoogle.toLocaleString("en-US")} more have no Google listing and wait for a person` : ""}.` : "";
  const sinceLast = s.lastActionAt ? Math.floor((Date.now() - Date.parse(s.lastActionAt)) / 86_400_000) : null;
  const quiet = sinceLast === null ? "I have not acted on the directory yet." : sinceLast > 7 ? `My last action was ${sinceLast} days ago; something is stuck.` : "";
  return [
    `*Directory, this week.* ${did ? `${did}.` : "Nothing changed."} ${s.openFlags.toLocaleString("en-US")} flag${s.openFlags === 1 ? "" : "s"} waiting on a person.${dead}`,
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
  const waiting = (data ?? []).filter((h) => /github\.com\/.+\/pull\/\d+/.test(String(h.result))).slice(0, 10);
  if (!waiting.length) return null;
  // In parallel and capped at ten: twenty serial GitHub calls at a ten-second
  // timeout each would outlast the cron's two minutes.
  const states = await Promise.all(waiting.map(async (h) => {
    const url = String(h.result).match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/)?.[0];
    return { h, url, state: url ? await prState(url) : "UNKNOWN" as const };
  }));
  const open = states.filter((s) => s.url && s.state === "OPEN").map(({ h, url }) => `• <${url}|${h.title}>${h.status === "partial" ? " (partial)" : ""}`);
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

  // How often the directory speaks is tuned from its own thread ("weekly,
  // not daily"); the Monday state post survives everything but "off".
  const tuning = await loadTuning(db, "directory");
  const directoryThread = await initiativeThread(db, "directory", "*Directory health.* I check listings against Google and our own signals, archive what is closed, apply trivial renames, and flag the rest. Daily what I did is in this thread; undo is one click in admin. Reply here to tune me: \"weekly, not daily\", \"ask me first on renames\", or a rule I should keep.");
  // The thread already exists in production, so the header's "reply here to
  // tune me" never shows; say it once, in the thread, the first morning this ships.
  if (directoryThread) await postOnce(db, { kind: "note", key: "thread:directory:tune", threadTs: directoryThread, text: "You can tune me in this thread. \"Weekly, not daily\" moves the digest to Mondays. \"Ask me first on renames\" or \"don't archive on your own\" makes me flag instead of act. A rule you state here, I keep. I answer with the way back each time." });
  const digest = shouldSpeakDaily(tuning.cadence, now)
    ? await directoryDigestText(db, tuning.cadence === "weekly" ? new Date(now.getTime() - 7 * 24 * 3_600_000) : since, tuning.cadence === "weekly" ? "this week" : "overnight")
    : null;
  out.directory = digest
    ? await postOnce(db, { kind: "directory_digest", key: `directory:${day}`, text: digest, threadTs: directoryThread })
    : { posted: false, key: `directory:${day}`, skipped: "nothing_to_say" };
  if (now.getUTCDay() === 1 && shouldSpeakWeekly(tuning.cadence)) {
    out.weekly = await postOnce(db, { kind: "directory_weekly", key: `directory-week:${day}`, text: await directoryWeeklyText(db), threadTs: directoryThread });
  }

  // Providers families acted on that the providers did not: Mondays, in
  // their own thread, unless the thread has been tuned otherwise.
  const providersTuning = await loadTuning(db, "providers");
  if (shouldSpeakDaily(providersTuning.cadence, now)) {
    const providersThread = await initiativeThread(db, "providers", "*Providers with traction.* Each Monday I list the providers families asked about or wrote to in the last 28 days who did not act: claimed owners who went quiet, and unclaimed listings with demand. Reply here with a name and I will pull up what I know; nothing is sent to anyone without a person. Reply here to tune me, too.");
    const traction = await providerTractionText(db, now).catch((err) => { console.error("[cortex-voice] traction", err); return null; });
    out.providers = traction
      ? await postOnce(db, { kind: "providers_traction", key: `providers:${day}`, text: traction, threadTs: providersThread })
      : { posted: false, key: `providers:${day}`, skipped: "nothing_to_say" };
    // Claimed pages families open that are missing things (slice 3), same thread.
    const gaps = await providerGapsText(db, now).catch((err) => { console.error("[cortex-voice] gaps", err); return null; });
    out.providerGaps = gaps
      ? await postOnce(db, { kind: "providers_gaps", key: `providers:gaps:${day}`, text: gaps, threadTs: providersThread })
      : { posted: false, key: `providers:gaps:${day}`, skipped: "nothing_to_say" };
  }

  const prs = await handoffsWaitingText(db);
  out.handoffs = prs
    ? await postOnce(db, { kind: "handoff_update", key: `handoffs:${day}`, text: prs })
    : { posted: false, key: `handoffs:${day}`, skipped: "nothing_to_say" };
  return out;
}

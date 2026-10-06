/**
 * Website sweep: is each provider's website still there, and does it link a
 * Facebook page?
 *
 * A dead domain is the strongest closure signal that costs nothing, and we
 * already store a website for 57,985 of 76,555 active providers (6 Oct 2026).
 * This runs from a Mac, not Vercel: 58K requests at 40 concurrent is about an
 * hour. Results go to the same ledger the Google pass writes
 * (provider_health_actions, kind website_dead, flag only, never an archive:
 * a site can be down while the business is open) and a Facebook link found
 * on the homepage goes to olera-providers.facebook_url.
 *
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/sweep-provider-websites.ts --dry-run --limit 200
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/sweep-provider-websites.ts --limit 5000
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/sweep-provider-websites.ts            # everything, resumable
 *
 * Resumable: a checkpoint of provider ids already checked is kept in
 * ~/Library/Application Support/cortex-runner/website-sweep.json. Pass
 * --restart to forget it.
 *
 * Dead means the domain does not resolve or refuses connections, after one
 * retry. Nothing else: a 404, 410 or TLS error is "unknown" and not flagged.
 * The first run (6 Oct 2026) flagged 404/410/TLS too, and a spot check found
 * bot-blocks answering 404 or 410 to the crawler and 403 to a browser, and
 * deep links (a community's page on a group site) gone while the business
 * stood. --reverify re-fetches every open website_dead flag with the
 * tightened rule and resolves the ones that no longer qualify.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const DRY = flag("--dry-run");
const REVERIFY = flag("--reverify");
const LIMIT = Number(opt("--limit") ?? 0) || Infinity;
const CONCURRENCY = Number(opt("--concurrency") ?? 40);
const TIMEOUT_MS = 10_000;
const STATE_DIR = join(homedir(), "Library", "Application Support", "cortex-runner");
const CHECKPOINT = join(STATE_DIR, "website-sweep.json");

type Row = { provider_id: string; provider_name: string | null; website: string; facebook_url?: string | null };
type Verdict = { status: "ok" | "dead" | "unknown"; code: number | null; error: string | null; facebook: string | null };

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function loadDone(): Set<string> {
  if (flag("--restart") || !existsSync(CHECKPOINT)) return new Set();
  try { return new Set(JSON.parse(readFileSync(CHECKPOINT, "utf8")) as string[]); } catch { return new Set(); }
}
function saveDone(done: Set<string>) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(CHECKPOINT, JSON.stringify([...done]));
}

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { return new URL(withScheme).toString(); } catch { return null; }
}

const FB_RE = /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(?!sharer|share\.php|plugins|dialog|login|tr\b|policies|help)([A-Za-z0-9._\-/]+)/i;

async function probe(url: string, attempt = 0): Promise<Verdict> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", Accept: "text/html,*/*;q=0.8" } });
    clearTimeout(timer);
    let facebook: string | null = null;
    if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
      const html = (await res.text().catch(() => "")).slice(0, 400_000);
      const m = html.match(FB_RE);
      if (m) facebook = `https://www.facebook.com/${m[1].replace(/\/+$/, "").split("?")[0]}`;
    }
    // The server answered. Whatever it said, something is there: a 404 is a
    // moved page or a bot-block, not a closed business.
    return { status: res.ok || res.status < 500 ? "ok" : "unknown", code: res.status, error: null, facebook };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? `${(err as NodeJS.ErrnoException).cause ? String((err as { cause?: { code?: string } }).cause?.code ?? "") : ""} ${err.name}: ${err.message}`.trim() : String(err);
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(msg)) {
      if (attempt === 0) return probe(url, 1);
      return { status: "dead", code: null, error: msg.slice(0, 160), facebook: null };
    }
    if (attempt === 0) return probe(url, 1);
    return { status: "unknown", code: null, error: msg.slice(0, 160), facebook: null };
  }
}

async function candidates(): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("olera-providers")
      .select("provider_id, provider_name, website, facebook_url")
      .eq("deleted", false)
      .not("website", "is", null)
      .neq("website", "")
      .order("provider_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function openFlags(): Promise<Set<string>> {
  const { data } = await db.from("provider_health_actions").select("provider_id").eq("kind", "website_dead").is("resolved_at", null).limit(50_000);
  return new Set((data ?? []).map((r) => (r as { provider_id: string }).provider_id));
}

/** Re-fetch every open website_dead flag under the tightened rule; resolve what no longer qualifies. */
async function reverify() {
  const { data, error } = await db.from("provider_health_actions").select("id, provider_id, evidence").eq("kind", "website_dead").is("resolved_at", null).is("undone_at", null).limit(50_000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; provider_id: string; evidence: { url?: string } }>;
  console.log(`open website_dead flags: ${rows.length}; ${DRY ? "dry run" : "resolving the reachable"}`);
  const stats = { kept: 0, resolved: 0, unknown: 0 };
  let i = 0;
  const worker = async () => {
    while (i < rows.length) {
      const row = rows[i++];
      const url = normalizeUrl(row.evidence?.url ?? "");
      const v = url ? await probe(url) : { status: "unknown" as const, code: null, error: "no url", facebook: null };
      if (v.status === "dead") { stats.kept += 1; continue; }
      if (v.status === "unknown") stats.unknown += 1; else stats.resolved += 1;
      if (!DRY) await db.from("provider_health_actions").update({ resolved_at: new Date().toISOString(), resolved_by: `sweep:reverify (${v.status}${v.code ? ` ${v.code}` : ""})` }).eq("id", row.id);
      if ((stats.kept + stats.resolved + stats.unknown) % 200 === 0) console.log(JSON.stringify(stats));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`reverify done ${JSON.stringify(stats)}`);
}

async function main() {
  if (REVERIFY) return reverify();
  const done = loadDone();
  const [rows, flagged] = await Promise.all([candidates(), openFlags()]);
  const todo = rows.filter((r) => !done.has(r.provider_id)).slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`providers with a website: ${rows.length}; already checked: ${done.size}; this run: ${todo.length}; ${DRY ? "dry run" : "writing"}`);
  const stats = { ok: 0, dead: 0, unknown: 0, flagged: 0, facebook: 0, badUrl: 0 };
  let i = 0;
  const started = Date.now();
  const worker = async () => {
    while (i < todo.length) {
      const row = todo[i++];
      const url = normalizeUrl(row.website);
      if (!url) { stats.badUrl += 1; done.add(row.provider_id); continue; }
      const v = await probe(url);
      stats[v.status] += 1;
      if (!DRY) {
        if (v.status === "dead" && !flagged.has(row.provider_id)) {
          const { error } = await db.from("provider_health_actions").insert({ provider_id: row.provider_id, kind: "website_dead", source: "website_head", evidence: { url, code: v.code, error: v.error, provider_name: row.provider_name } });
          if (!error) { stats.flagged += 1; flagged.add(row.provider_id); }
        }
        if (v.facebook && v.facebook !== row.facebook_url) {
          const { error } = await db.from("olera-providers").update({ facebook_url: v.facebook }).eq("provider_id", row.provider_id);
          if (!error) stats.facebook += 1;
        }
      } else if (v.facebook) stats.facebook += 1;
      done.add(row.provider_id);
      if (done.size % 200 === 0) { saveDone(done); console.log(`${done.size}/${rows.length} ${JSON.stringify(stats)} ${Math.round((Date.now() - started) / 1000)}s`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveDone(done);
  console.log(`done ${JSON.stringify(stats)} in ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });

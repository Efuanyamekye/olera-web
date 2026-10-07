/**
 * The Mac runner: builds approved Cortex briefs into pull requests overnight.
 *
 *   npx tsx --env-file=<olera-web>/.env.local scripts/cortex-runner.ts            build the next brief(s)
 *   npx tsx --env-file=<olera-web>/.env.local scripts/cortex-runner.ts --dry-run  say what it would build
 *
 * Started by launchd (scripts/cortex-runner.plist). For each open brief in
 * `cortex_handoffs`, oldest first, it makes a fresh worktree off staging, runs
 * one headless Claude Code session with the /handoff rules (pre-test before
 * the PR, a review page after it, saved to ~/cortex-runner/review for the
 * session TJ reviews in to publish), and closes the
 * brief with the PR URL or what is left. Cortex reads the result back and the
 * morning post lists the PR.
 *
 * The fence (docs/cortex/POLICY.md), enforced here rather than trusted:
 * - Only briefs TJ handed off. Inbox reports and briefs noted "backlog" are skipped.
 * - The session ends at a pull request to staging. Merging, promoting, running
 *   migrations, and messaging anyone are refused at the tool level.
 * - Each session runs in auto mode, so its own safety checks still apply.
 * - At most CORTEX_RUNNER_MAX briefs a night (default 2), one at a time, each
 *   capped at CORTEX_RUNNER_MINUTES (default 90). This spends TJ's Claude plan,
 *   not dollars.
 * - Off switch: create ~/cortex-runner/STOP. Nothing runs while it exists.
 *
 * Worktrees live under ~/cortex-runner, off the Desktop, so the build tools
 * are not reading through iCloud.
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const ROOT = join(HOME, "cortex-runner");
const CLONE = join(ROOT, "olera-web");
const LOG = join(ROOT, "runner.log");
const STOP = join(ROOT, "STOP");
const REPO_URL = "https://github.com/olera-care/olera-web.git";
const ENV_FILE = process.env.CORTEX_RUNNER_ENV_FILE ?? join(HOME, "Desktop", "olera-web", ".env.local");
const MAX_RUNS = Number(process.env.CORTEX_RUNNER_MAX ?? 2) || 2;
const MINUTES = Number(process.env.CORTEX_RUNNER_MINUTES ?? 90) || 90;
const DRY = process.argv.includes("--dry-run");

// Refused inside every session, whatever the brief says.
const DENIED_TOOLS = [
  "Bash(gh pr merge:*)",
  "Bash(gh api*merge*)",
  "Bash(git push origin staging*)",
  "Bash(git push origin main*)",
  "Bash(git push --force*)",
  "Bash(git push -f*)",
  "Bash(supabase db push*)",
  "Bash(npx supabase*)",
  "Bash(psql*)",
  "Bash(vercel*)",
  "Bash(npx vercel*)",
  "mcp__claude_ai_Supabase__apply_migration",
  "mcp__claude_ai_Supabase__execute_sql",
  "mcp__claude_ai_Slack__slack_send_message",
  "mcp__claude_ai_Slack__slack_schedule_message",
  "mcp__claude_ai_Gmail__send_message",
  "mcp__claude_ai_Gmail__reply",
  "mcp__claude_ai_Gmail__forward",
  "mcp__claude_ai_Vercel__update_firewall_config",
  "mcp__claude_ai_Vercel__put_firewall_config",
];

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function log(line: string) {
  const stamped = `${new Date().toISOString()}  ${line}`;
  console.log(stamped);
  if (!DRY) appendFileSync(LOG, `${stamped}\n`);
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

type Brief = { id: string; title: string; body: string; note: string | null; status: string; repo: string };

/** Briefs a person approved for building: not the daily inbox digest, not parked. */
export function buildable(rows: Brief[]): Brief[] {
  return rows.filter((row) =>
    row.repo === "olera-web"
    && !/^inbox report/i.test(row.title)
    && !/\bbacklog\b/i.test(row.note ?? ""));
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "brief";
}

function prompt(brief: Brief, branch: string) {
  return [
    `You are building one brief that Cortex, Olera's operations agent, handed off and TJ approved. No person is watching this session; finish it or stop at a clean partial.`,
    ``,
    `Rules (from the /handoff skill and docs/cortex/POLICY.md):`,
    `- Read CLAUDE.md and the files the brief points to first. Anything the brief marks decided is decided.`,
    `- You are on branch ${branch}, made from origin/staging. Commit there, push it, and open ONE pull request against staging with gh pr create. Never merge, promote, or push to staging or main.`,
    `- Write a migration file if the work needs one, but never run it; say in the PR body that TJ runs it.`,
    `- Do not message anyone, send email, or post to Slack. The PR is the only output.`,
    `- No em dashes in copy. Match the surrounding code.`,
    `- Check your work before the PR: npx --no-install tsc --noEmit on what you touched, and any check script the area has.`,
    `- Before opening the PR, run the pre-test skill on your diff. Fix every FIX finding and re-run the checks. Put the ASK and NOTE findings in the PR body under "Pre-test".`,
    `- After opening the PR, use the visualize skill to build one review page for TJ: what the PR changes (before and after where it shows), the pre-test findings, and what he has to decide. Headless sessions cannot publish artifacts, so write it as HTML to ${join(ROOT, "review")}/<PR number>.html and name that path in the PR body; the session TJ reviews in publishes it.`,
    `- If the brief needs a decision only TJ can make, build everything that does not depend on it and list the decision first in the PR body.`,
    `- End your final message with one line, exactly one of:`,
    `  RESULT: done <PR URL>`,
    `  RESULT: partial <PR URL or "no PR"> <what is left, one sentence>`,
    ``,
    `Brief ${brief.id} — ${brief.title}${brief.note ? `\nTJ's note: ${brief.note}` : ""}`,
    ``,
    brief.body,
  ].join("\n");
}

/** The session's final message, from the stream-json log (falls back to raw text). */
export function finalText(log: string): string {
  for (const line of log.split("\n").reverse()) {
    if (!line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "result" && typeof event.result === "string") return event.result;
    } catch { /* a partial line; keep looking */ }
  }
  return log;
}

/** Pulls the RESULT line the session ends with. */
export function parseResult(output: string): { status: "done" | "partial"; result: string } {
  const line = output.split("\n").map((l) => l.replace(/[*`_]/g, "").trim()).reverse().find((l) => l.startsWith("RESULT:"));
  const pr = output.match(/https:\/\/github\.com\/olera-care\/olera-web\/pull\/\d+/g)?.pop();
  if (!line) return { status: "partial", result: pr ? `${pr} (session ended without a result line)` : "runner: session ended without a PR or a result line" };
  const rest = line.slice("RESULT:".length).trim();
  if (rest.startsWith("done") && pr) return { status: "done", result: pr };
  return { status: "partial", result: rest.replace(/^(done|partial)\s*/, "") || "no detail" };
}

function ensureClone() {
  mkdirSync(join(ROOT, "worktrees"), { recursive: true });
  mkdirSync(join(ROOT, "review"), { recursive: true });
  if (!existsSync(join(CLONE, ".git"))) {
    log(`cloning ${REPO_URL} into ${CLONE}`);
    execFileSync("git", ["clone", "--quiet", REPO_URL, CLONE], { stdio: "inherit" });
  }
  git(CLONE, "fetch", "--quiet", "origin", "staging");
  git(CLONE, "checkout", "--quiet", "--detach", "origin/staging");
  // One install, shared by every worktree through a symlink. Refreshed when the lockfile moves.
  const lock = readFileSync(join(CLONE, "package-lock.json"), "utf8");
  const stamp = join(CLONE, "node_modules", ".runner-lock");
  if (!existsSync(stamp) || readFileSync(stamp, "utf8") !== lock) {
    log("installing dependencies");
    execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: CLONE, stdio: "inherit" });
    execFileSync("cp", [join(CLONE, "package-lock.json"), stamp]);
  }
}

function runSession(cwd: string, text: string): Promise<string> {
  return new Promise((resolve) => {
    // stream-json keeps every tool call in the log, not only the final message,
    // so a night's run can be audited for what it actually did.
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "auto", "--disallowedTools", ...DENIED_TOOLS, "--", text];
    const child = spawn("claude", args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { out += chunk; });
    const timer = setTimeout(() => { out += `\nrunner: stopped after ${MINUTES} minutes`; child.kill("SIGTERM"); }, MINUTES * 60_000);
    child.on("close", () => { clearTimeout(timer); resolve(out); });
  });
}

async function build(brief: Brief) {
  const branch = `cortex/${slug(brief.title)}-${brief.id.slice(0, 6)}`;
  const dir = join(ROOT, "worktrees", branch.replace("/", "-"));
  log(`building ${brief.id.slice(0, 8)} "${brief.title}" on ${branch}`);
  git(CLONE, "worktree", "prune");
  if (!existsSync(dir)) git(CLONE, "worktree", "add", "--quiet", "-B", branch, dir, "origin/staging");
  if (!existsSync(join(dir, "node_modules"))) symlinkSync(join(CLONE, "node_modules"), join(dir, "node_modules"));
  if (existsSync(ENV_FILE) && !existsSync(join(dir, ".env.local"))) symlinkSync(ENV_FILE, join(dir, ".env.local"));

  const output = await runSession(dir, prompt(brief, branch));
  appendFileSync(join(ROOT, `${branch.replace("/", "-")}.log`), output);
  const { status, result } = parseResult(finalText(output));
  const { error } = await db.from("cortex_handoffs")
    .update({ status, result: `runner: ${result}`, closed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", brief.id);
  log(`${brief.id.slice(0, 8)} ${status}: ${result}${error ? ` (could not write back: ${error.message})` : ""}`);
}

(async () => {
  if (existsSync(STOP)) return log(`STOP file present at ${STOP}; nothing run`);
  const { data, error } = await db.from("cortex_handoffs")
    .select("id, title, body, note, status, repo")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const queue = buildable((data ?? []) as Brief[]).slice(0, MAX_RUNS);
  if (!queue.length) return log("no approved briefs to build");
  if (DRY) {
    for (const brief of queue) console.log(`would build ${brief.id.slice(0, 8)}  ${brief.title}`);
    return;
  }
  ensureClone();
  for (const brief of queue) {
    if (existsSync(STOP)) return log("STOP file appeared; ending early");
    await build(brief);
  }
})().catch((error) => {
  log(`runner failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

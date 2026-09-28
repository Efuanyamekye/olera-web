import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { sendSlackAlert } from "@/lib/slack";
import {
  composeNavigatorDraft,
  pickSnapshot,
  readBenefitsNavigator,
} from "@/lib/family-comms/benefits-navigator.server";
import { benefitsCompletedAt, readBenefitsCascade } from "@/lib/family-comms/benefits-cascade.server";

/**
 * GET /api/cron/benefits-navigator-compose
 *
 * Writes the first-step letter for every benefits family 48 hours after
 * intake. It used to be a rung inside family-comms-coordinator, and that is
 * why about one family in five never got a letter (found 2026-09-27):
 *
 *   - The coordinator runs once a day over ~2,300 families and only composed
 *     while `Date.now() - runStart < 180s`. Its whole run takes 3-4 minutes,
 *     so most days the guard was spent before the loop reached many benefits
 *     families. It wrote 1-11 letters a day against ~10 intakes a day.
 *   - The band closed at 10 days, so a family skipped for a week aged out
 *     permanently and silently. 62 families from 28 Aug-24 Sep had no letter.
 *   - A family with no usable first-step program returned null, set nothing,
 *     and was retried first every day, spending the budget again.
 *
 * This route does one thing, hourly, newest intake first so a fresh family
 * never waits behind a backlog. It never sends: the packet builder judges the
 * letter and the scheduler's autopilot sends clean ones, exactly as before.
 *
 * The band runs to 30 days so the families who aged out under the old rung
 * get their letter. The composer already words the timing from the intake
 * date ("on Thursday", "a few weeks ago"), and the autopilot's staleness
 * check reads the letter's age, not the intake's.
 */

export const maxDuration = 300;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Opens 48h after intake, same as the old rung. */
const BAND_START = 48 * HOUR;
/** Was 10 days in the coordinator. Wide enough to reach the families it dropped. */
const BAND_END = 30 * DAY;
/** Each compose is one Opus call (seconds). Wall-clock budget, not throughput. */
const MAX_PER_RUN = 12;
/** Stop starting new composes past this, so the run finishes what it began. */
const TIME_GUARD_MS = 200_000;
/** A family with no usable program is retried once a day, at most this often. */
const MAX_NO_PICK_ATTEMPTS = 5;
const RETRY_AFTER = 20 * HOUR;
/** Watchdog: a family this old with no letter is a failure worth a Slack line. */
const OVERDUE_AFTER = 72 * HOUR;
/** The daily summary rides the run at this UTC hour (10am ET). */
const SUMMARY_HOUR_UTC = 14;

interface AttemptMeta {
  last_at?: string;
  count?: number;
  result?: "no_pick" | "failed";
}

function readAttempt(meta: Record<string, unknown>): AttemptMeta {
  const raw = meta.benefits_navigator_attempt;
  return raw && typeof raw === "object" ? (raw as AttemptMeta) : {};
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get("dry_run") === "true";

  return withCronRun("benefits-navigator-compose", async () => {
    const db = getServiceClient();
    const siteUrl = getSiteUrl();
    const startedAt = Date.now();
    const bandStartIso = new Date(startedAt - BAND_END).toISOString();

    const { data: rows, error } = await db
      .from("business_profiles")
      .select("id, display_name, state, city, care_types, account_id, metadata")
      .eq("type", "family")
      .not("account_id", "is", null)
      .gte("metadata->benefits_results->>completed_at", bandStartIso)
      .is("metadata->benefits_navigator->>composed_at", null)
      .limit(1000);
    if (error) throw error;

    type Row = NonNullable<typeof rows>[number];
    const candidates: { row: Row; meta: Record<string, unknown>; intakeAt: string; age: number }[] = [];
    let noPickExhausted = 0;
    let waitingRetry = 0;
    for (const row of rows ?? []) {
      const meta = (row.metadata as Record<string, unknown>) || {};
      const intakeAt = benefitsCompletedAt(meta);
      if (!intakeAt || !row.account_id) continue;
      const age = startedAt - new Date(intakeAt).getTime();
      if (age < BAND_START || age > BAND_END) continue;
      if (meta.nudges_unsubscribed === true) continue;
      if (readBenefitsCascade(meta).first_step_sent_at) continue;
      if (readBenefitsNavigator(meta).composed_at) continue;
      const attempt = readAttempt(meta);
      if (attempt.result === "no_pick" && (attempt.count ?? 0) >= MAX_NO_PICK_ATTEMPTS) {
        noPickExhausted++;
        continue;
      }
      if (attempt.last_at && startedAt - new Date(attempt.last_at).getTime() < RETRY_AFTER) {
        waitingRetry++;
        continue;
      }
      candidates.push({ row, meta, intakeAt, age });
    }
    // Newest first: a family that just crossed 48h is the one whose need is
    // still live. The backlog drains behind it within a few hourly runs.
    candidates.sort((a, b) => a.age - b.age);

    const counts = {
      dry_run: dryRun,
      candidates: candidates.length,
      composed: 0,
      no_pick: 0,
      failed: 0,
      waiting_retry: waitingRetry,
      no_pick_exhausted: noPickExhausted,
      left_for_next_run: 0,
    };

    if (dryRun) {
      return {
        ...counts,
        families: candidates.map((c) => ({
          id: c.row.id,
          state: c.row.state,
          days_since_intake: Math.round((c.age / DAY) * 10) / 10,
        })),
      };
    }

    const stampAttempt = async (id: string, meta: Record<string, unknown>, result: AttemptMeta["result"]) => {
      const prev = readAttempt(meta);
      const { data: fresh } = await db.from("business_profiles").select("metadata").eq("id", id).maybeSingle();
      const freshMeta = (fresh?.metadata as Record<string, unknown> | null) || meta;
      freshMeta.benefits_navigator_attempt = {
        last_at: new Date().toISOString(),
        count: (prev.count ?? 0) + 1,
        result,
      };
      await db.from("business_profiles").update({ metadata: { ...freshMeta } }).eq("id", id);
    };

    let processed = 0;
    for (const c of candidates) {
      if (processed >= MAX_PER_RUN || Date.now() - startedAt > TIME_GUARD_MS) break;
      processed++;
      const { row, meta, intakeAt } = c;
      try {
        const draft = await composeNavigatorDraft(db, {
          profileId: row.id,
          accountId: row.account_id as string,
          displayName: row.display_name || null,
          state: row.state || null,
          city: row.city || null,
          careTypes: (row.care_types as string[] | null) || [],
          intakeAt,
          profileMeta: meta,
          factsRow: row,
        });
        if (!draft) {
          counts.no_pick++;
          await stampAttempt(row.id, meta, "no_pick");
          continue;
        }
        const navStamp = {
          status: "pending",
          composed_at: new Date().toISOString(),
          subject: draft.subject,
          body: draft.body,
          sms: draft.sms,
          model: "claude-opus-5",
          pick: pickSnapshot(draft.pick),
          provider_count: draft.providerCount,
        };
        // Composition took seconds; re-read so a fact the family added on /m
        // mid-run is not overwritten by a stale copy.
        const { data: fresh } = await db.from("business_profiles").select("metadata").eq("id", row.id).maybeSingle();
        const freshMeta = (fresh?.metadata as Record<string, unknown> | null) || meta;
        if (readBenefitsNavigator(freshMeta).composed_at) continue;
        freshMeta.benefits_navigator = navStamp;
        delete freshMeta.benefits_navigator_attempt;
        await db.from("business_profiles").update({ metadata: { ...freshMeta } }).eq("id", row.id);
        counts.composed++;
      } catch (err) {
        console.error("[benefits-navigator-compose] compose failed:", row.id, err);
        counts.failed++;
        await stampAttempt(row.id, meta, "failed").catch(() => {});
      }
    }
    counts.left_for_next_run = Math.max(0, candidates.length - processed);

    // Daily watchdog. Letters now send themselves, so nobody is looking at the
    // queue to notice a family that never got one. Once a day, say so.
    if (new Date(startedAt).getUTCHours() === SUMMARY_HOUR_UTC) {
      const overdue = candidates.filter((c) => c.age > OVERDUE_AFTER).length - counts.composed;
      const lines = [
        `✉️ Benefits letters: ${counts.composed} written this run, ${Math.max(0, counts.left_for_next_run)} queued for the next.`,
      ];
      if (overdue > 0) {
        lines.push(`⚠️ ${overdue} famil${overdue === 1 ? "y is" : "ies are"} past 72h with no letter.`);
      }
      if (noPickExhausted > 0) {
        lines.push(
          `${noPickExhausted} famil${noPickExhausted === 1 ? "y has" : "ies have"} no program we can give a first step for (no phone or documents on file). They get nothing until the data is fixed.`,
        );
      }
      if (overdue > 0 || noPickExhausted > 0 || counts.composed > 0) {
        try {
          await sendSlackAlert(`${lines.join("\n")}\n${siteUrl}/admin/benefits`);
        } catch (err) {
          console.error("[benefits-navigator-compose] Slack summary failed:", err);
        }
      }
    }

    return { ok: true, ...counts };
  });
}

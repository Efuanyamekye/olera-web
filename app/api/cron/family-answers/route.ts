import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { buildAnswerPacket } from "@/lib/family-answers/engine.server";
import { packetNeedsAttention } from "@/lib/family-answers/types";
import {
  familyAnswerCategoryAutoCloses,
  familyAnswerCategoryNeedsDraft,
} from "@/lib/sms/inbound-intent";

/**
 * GET /api/cron/family-answers
 *
 * Drains pending rows in `family_answer_jobs` — the questions families texted
 * us — and writes a review packet for each. Runs every 5 minutes.
 *
 * This route NEVER SENDS ANYTHING. It researches, drafts, attacks its own
 * draft with an independent model, answers the objections, and stores the
 * result for a human to approve. The only automated message in this subsystem
 * is the acknowledgement, which the Twilio webhook already sent seconds after
 * the family texted.
 *
 * Why a cron rather than doing this in the webhook: the pipeline makes five
 * model calls including web search and takes minutes. Twilio wants a response
 * in well under a second.
 *
 * Volume is roughly one question a day, so the batch size is small on purpose.
 * If the queue ever backs up that is a signal worth looking at, not a throughput
 * problem to solve by raising the limit.
 */

export const maxDuration = 300;

/** Jobs per run. Low by design — see the note above. */
const DEFAULT_BATCH = 3;

/** A job stuck in `running` longer than this was almost certainly killed mid-flight. */
const STUCK_MS = 20 * 60 * 1000;

interface JobRow {
  id: string;
  phone_last10: string;
  profile_id: string | null;
  body: string;
  twilio_sid: string | null;
  attempts: number;
}

/** Three strikes, then it waits for a human rather than burning tokens forever. */
const MAX_ATTEMPTS = 3;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const limit = Math.min(10, parseInt(searchParams.get("limit") || String(DEFAULT_BATCH), 10));

  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("family-answers", async () => {
    const db = getServiceClient();
    const result = { considered: 0, drafted: 0, skipped: 0, crisis: 0, failed: 0, requeued: 0, abandoned: 0 };

    // Release anything a previous invocation claimed and never finished. Vercel
    // kills a function at its maxDuration, which leaves the row in `running`
    // with nobody working it.
    const stuckBefore = new Date(Date.now() - STUCK_MS).toISOString();

    // Two branches, and the second one matters. Releasing every stuck job back
    // to `pending` regardless of attempts creates a silent stall: the fetch
    // below filters on attempts < MAX_ATTEMPTS, so a job killed three times
    // sits in `pending` forever, never picked up again and never surfaced as
    // failed. It disappears from both the work queue and the failure list,
    // which for a family means their question quietly never gets an answer.
    const { data: retryable } = await db
      .from("family_answer_jobs")
      .update({ status: "pending" })
      .eq("status", "running")
      .lt("started_at", stuckBefore)
      .lt("attempts", MAX_ATTEMPTS)
      .select("id");
    result.requeued = retryable?.length ?? 0;

    const { data: exhausted } = await db
      .from("family_answer_jobs")
      .update({
        status: "failed",
        last_error: `killed mid-run ${MAX_ATTEMPTS} times (likely maxDuration)`,
        completed_at: new Date().toISOString(),
      })
      .eq("status", "running")
      .lt("started_at", stuckBefore)
      .gte("attempts", MAX_ATTEMPTS)
      .select("id");
    result.abandoned = exhausted?.length ?? 0;

    const { data: jobs, error } = await db
      .from("family_answer_jobs")
      .select("id, phone_last10, profile_id, body, twilio_sid, attempts")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[family-answers] Job fetch failed:", error);
      return { ...result, error: error.message };
    }
    result.considered = jobs?.length ?? 0;
    if (!jobs?.length) return result;
    if (dryRun) return { ...result, dryRun: true, ids: jobs.map((j) => j.id) };

    for (const job of jobs as JobRow[]) {
      // Claim it first. Two overlapping cron invocations must not research the
      // same question twice.
      const { data: claimed } = await db
        .from("family_answer_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          attempts: (job.attempts ?? 0) + 1,
        })
        .eq("id", job.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue;

      try {
        const packet = await buildAnswerPacket({
          inbound: job.body,
          profileId: job.profile_id,
        });

        const needsDraft = familyAnswerCategoryNeedsDraft(packet.triage.category);
        if (packet.triage.isCrisis) {
          result.crisis++;
          try {
            const { sendSlackAlert } = await import("@/lib/slack");
            await sendSlackAlert(
              `🚨 URGENT — the answer engine read a crisis in a text from ${job.phone_last10}: ` +
                `"${job.body.slice(0, 240)}" (${packet.triage.crisisReason ?? "no reason given"})` +
                `${packet.triage.disagreedWithRegex ? " [the keyword check DISAGREED — one of the two layers has a gap]" : ""}. ` +
                `No draft was written. Respond from /admin/inbox.`,
            );
            // And to the founder's phone, now, as the webhook's keyword check does.
            const { founderChatId, isTelegramConfigured, sendTelegramMessage } = await import("@/lib/telegram.server");
            const chatId = founderChatId();
            if (isTelegramConfigured() && chatId) {
              await sendTelegramMessage(chatId, `🚨 The answer engine read a crisis in a text ending ${job.phone_last10.slice(-4)}: "${job.body.slice(0, 240)}" (${packet.triage.crisisReason ?? "no reason given"}). No draft was written. Answer it in the inbox: https://olera.care/admin/inbox`);
            }
          } catch (err) {
            console.error("[family-answers] Crisis page failed:", err);
          }
        } else if (needsDraft) {
          result.drafted++;
        } else {
          result.skipped++;
        }

        // A packet that owes a draft and has none did not finish, it broke.
        // On 2026-08-31 the draft stage took a 529 Overloaded from the API and
        // the job was still stamped `ready` with an empty draft, so the thread
        // showed "Drafted answer ready" over nothing and the family got no
        // reply. Sending it back to `pending` lets the existing attempts
        // mechanism retry it, which is what should have happened at the time:
        // the failure was transient and a second call would very likely have
        // worked. No bespoke 529 handling needed, just an honest status.
        const draftFailed = needsDraft && !packet.triage.isCrisis && !packet.draft.trim();
        const retriable = draftFailed && (job.attempts ?? 0) < MAX_ATTEMPTS;
        if (draftFailed) {
          result.drafted--;
          if (retriable) result.requeued++;
          else result.failed++;
        }

        const { data: finalizedJobs, error: finalizeError } = await db
          .from("family_answer_jobs")
          .update({
            status: draftFailed
              ? retriable
                ? "pending"
                : "failed"
              : packet.triage.isCrisis || needsDraft
                ? "ready"
                : "skipped",
            // Keep the partial packet either way. Its triage, facts and claims
            // are still worth reading, and on the final attempt they are all a
            // human has to work from.
            packet,
            completed_at: new Date().toISOString(),
            last_error: packet.errors?.join("; ") ?? null,
          })
          // An admin can dismiss a running job. Do not resurrect it as ready
          // when this model call finishes a moment later.
          .eq("id", job.id)
          .eq("status", "running")
          .select("id");

        if (finalizeError) {
          throw finalizeError;
        }

        // An admin may have handled the thread while the model was working.
        // In that case the job is already skipped; do not perform follow-up
        // work from this now-stale packet.
        if (!finalizedJobs?.length) {
          continue;
        }

        // Only a true conversational close may leave the human queue
        // automatically. "Unrelated" is too broad to hide: it may be a model
        // miss or a non-benefits need that still deserves a person.
        if (familyAnswerCategoryAutoCloses(packet.triage.category) && job.twilio_sid) {
          await db
            .from("sms_inbound")
            .update({
              handled_at: new Date().toISOString(),
              handled_by: `family-answers:${packet.triage.category}`,
            })
            .eq("twilio_sid", job.twilio_sid)
            .is("handled_at", null);
        }

        if (needsDraft && packetNeedsAttention(packet) && !packet.triage.isCrisis) {
          console.log(`[family-answers] Job ${job.id} needs attention before sending.`);
        }
      } catch (err) {
        result.failed++;
        const message = err instanceof Error ? err.message : "unknown error";
        console.error(`[family-answers] Job ${job.id} threw:`, message);
        const attempts = (job.attempts ?? 0) + 1;
        await db
          .from("family_answer_jobs")
          .update({
            // Give it back to the queue unless it has already burned its
            // attempts, in which case a human should look rather than us
            // paying for the same failure a fourth time.
            status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            last_error: message,
            completed_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null,
          })
          .eq("id", job.id)
          .eq("status", "running");
      }
    }

    return result;
  });
}

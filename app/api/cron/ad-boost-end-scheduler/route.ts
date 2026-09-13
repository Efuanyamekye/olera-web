import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { sendSlackAlert } from "@/lib/slack";
import { sendAdBoostLifecycleEmail } from "@/lib/ad-boost/lifecycle-notifications.server";
import { etCalendarDate, nextBusinessSlotEt } from "@/lib/send-window";

/**
 * GET /api/cron/ad-boost-end-scheduler
 *
 * Closes out Ad Boost flights without anyone having to remember to. Two rungs,
 * hourly:
 *
 *   1. AUTO-END — a `live` campaign whose flight_end_date has passed flips to
 *      `ended`, stamped `ended_reason: "flight_end"`. flight_end_date is the
 *      LAST SERVING DAY (migration 150), so the flip waits until the Eastern
 *      calendar has rolled past it: a flight ending Aug 3 ends on Aug 4, with
 *      a complete final day of metrics behind it.
 *
 *   2. SEND — the promo-complete wrap-up (demand receipt + subscribe ask)
 *      goes out once its scheduled slot is due. Rung 1 parks that slot at the
 *      next 10:15 AM ET business morning rather than firing on the spot,
 *      because "the cron noticed" is 3 AM as often as it's a decent hour, and
 *      this is the one email in the Ad Boost journey that asks for money.
 *
 * Campaigns with no flight_end_date never auto-end — the date is concierge-
 * entered and its absence means the flight window isn't known. The Slack
 * summary counts those so the gap stays visible.
 *
 * The send reuses sendAdBoostLifecycleEmail, whose promo_complete_email_sent_at
 * reservation is atomic, so this can never double-email even if an admin flips
 * the same campaign by hand mid-run. Permanent skips (no provider email,
 * unsubscribed) clear the schedule and ping Slack instead of retrying into the
 * same wall hourly; transport failures keep it and retry next run.
 */

export const maxDuration = 300;

const MAX_ENDS_PER_RUN = 25;
const MAX_SENDS_PER_RUN = 20;

/**
 * Skip reasons that clear on their own, so the schedule is kept and retried.
 * Everything else sendEmail can report (preference_disabled, do_not_contact,
 * suppressed) is a standing state that hourly retries would only re-hit.
 *
 * `nudge_cap` is a rolling 7-day per-provider ceiling. ad_boost_promo_complete
 * isn't in NUDGE_EMAIL_TYPES today, but lib/email-governance.ts says that
 * catalog is being expanded — and a wrap-up dropped for good because the
 * provider got three digests that week is the subscribe ask silently lost.
 */
const RETRYABLE_SKIPS = new Set(["send_failed", "reservation_failed", "nudge_cap"]);

const SEND_ROW_SELECT =
  "id, provider_id, provider_slug, display_name, requested_setup_week, flight_start_date, channel, campaign_tag, intended_monthly_budget, ad_spend_cents, ad_clicks, ad_impressions, metrics_source, created_at";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("ad-boost-end-scheduler", async () => {
    const db = getServiceClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayEt = etCalendarDate(now);

    const counts = { ended: 0, due: 0, sent: 0, blocked: 0, live_without_end_date: 0 };
    const endedLines: string[] = [];
    const blockedLines: string[] = [];

    // ── Rung 1: auto-end flights whose last serving day has passed ────────
    const { data: expired, error: expiredError } = await db
      .from("ad_campaign_requests")
      .select("id, display_name, provider_slug, flight_end_date, promo_complete_email_sent_at")
      .eq("status", "live")
      .is("deleted_at", null)
      .not("flight_end_date", "is", null)
      .lt("flight_end_date", todayEt)
      .limit(MAX_ENDS_PER_RUN);
    if (expiredError) throw expiredError;

    for (const row of expired ?? []) {
      const name = row.display_name || row.provider_slug || row.id;
      const update: Record<string, unknown> = {
        status: "ended",
        ended_at: nowIso,
        ended_reason: "flight_end",
        updated_at: nowIso,
      };
      // Don't schedule a wrap-up that already went out (an admin can have sent
      // it early). The flip still happens — the status is the point.
      if (!row.promo_complete_email_sent_at) {
        update.promo_complete_email_scheduled_at = nextBusinessSlotEt(now);
      }

      // Guard the write on status still being `live`: an admin saving the
      // detail page in the same minute must win, not get overwritten.
      const { data: flipped, error: flipError } = await db
        .from("ad_campaign_requests")
        .update(update)
        .eq("id", row.id)
        .eq("status", "live")
        .select("id")
        .maybeSingle();
      if (flipError) {
        console.error("[ad-boost-end-scheduler] flip failed:", row.id, flipError);
        blockedLines.push(`${name}: end flip failed (will retry)`);
        continue;
      }
      if (!flipped) continue; // status moved under us — nothing to do

      counts.ended++;
      endedLines.push(`${name} (flight ended ${row.flight_end_date})`);
    }

    // ── Rung 2: send wrap-ups whose slot is due ───────────────────────────
    const { data: due, error: dueError } = await db
      .from("ad_campaign_requests")
      .select(SEND_ROW_SELECT)
      .eq("status", "ended")
      .is("deleted_at", null)
      .is("promo_complete_email_sent_at", null)
      .not("promo_complete_email_scheduled_at", "is", null)
      .lte("promo_complete_email_scheduled_at", nowIso)
      .limit(MAX_SENDS_PER_RUN);
    if (dueError) throw dueError;

    counts.due = due?.length ?? 0;

    for (const row of due ?? []) {
      const name = row.display_name || row.provider_slug || row.id;

      // Re-check right before sending — an admin can un-end the campaign or
      // cancel the schedule while this run is mid-loop, and a stale list row
      // must not fire. Same guard as the launch scheduler.
      const { data: fresh } = await db
        .from("ad_campaign_requests")
        .select(
          "status, deleted_at, promo_complete_email_sent_at, promo_complete_email_scheduled_at",
        )
        .eq("id", row.id)
        .maybeSingle();
      // Epoch comparison, not string: Postgres returns "+00:00"-suffixed
      // timestamps while nowIso is Z-format, and mixed-format lexicographic
      // comparison misjudges boundary rows.
      if (
        !fresh ||
        fresh.status !== "ended" ||
        fresh.deleted_at != null ||
        fresh.promo_complete_email_sent_at != null ||
        fresh.promo_complete_email_scheduled_at == null ||
        new Date(fresh.promo_complete_email_scheduled_at).getTime() > Date.now()
      ) {
        continue;
      }

      try {
        const result = await sendAdBoostLifecycleEmail({ request: row, kind: "promo_complete" });
        if (result.sent || result.skipped === "already_sent") {
          if (result.sent) counts.sent++;
          await db
            .from("ad_campaign_requests")
            .update({ promo_complete_email_scheduled_at: null })
            .eq("id", row.id);
        } else if (result.skipped && RETRYABLE_SKIPS.has(result.skipped)) {
          // Transient — the sent-marker was rolled back (or never set), so
          // keeping the schedule retries next hour.
          counts.blocked++;
          blockedLines.push(`${name}: ${result.skipped} (will retry)`);
        } else {
          // Permanent (missing_email, provider_unsubscribed, suppression):
          // clear the schedule so it surfaces once instead of failing hourly.
          counts.blocked++;
          await db
            .from("ad_campaign_requests")
            .update({ promo_complete_email_scheduled_at: null })
            .eq("id", row.id);
          blockedLines.push(`${name}: ${result.skipped}`);
        }
      } catch (err) {
        counts.blocked++;
        console.error("[ad-boost-end-scheduler] send threw:", row.id, err);
        blockedLines.push(`${name}: transport error (will retry)`);
      }
    }

    // Live campaigns with no end date can't auto-end. Counted every run, but
    // only reported when Slack is already being posted — a standing gap
    // shouldn't generate its own hourly ping.
    const { count: undated } = await db
      .from("ad_campaign_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "live")
      .is("deleted_at", null)
      .is("flight_end_date", null);
    counts.live_without_end_date = undated ?? 0;

    if (counts.ended > 0 || counts.sent > 0 || blockedLines.length > 0) {
      try {
        const siteUrl = getSiteUrl();
        const parts: string[] = [];
        if (counts.ended > 0)
          parts.push(
            `🏁 ${counts.ended} Ad Boost campaign${counts.ended === 1 ? "" : "s"} auto-ended: ${endedLines.join("; ")}`,
          );
        if (counts.sent > 0)
          parts.push(
            `📬 ${counts.sent} wrap-up email${counts.sent === 1 ? "" : "s"} sent`,
          );
        if (blockedLines.length > 0)
          parts.push(`⚠️ ${blockedLines.length} blocked: ${blockedLines.join("; ")}`);
        if (counts.live_without_end_date > 0)
          parts.push(
            `ℹ️ ${counts.live_without_end_date} live campaign${counts.live_without_end_date === 1 ? "" : "s"} still missing a flight end date (won't auto-end)`,
          );
        await sendSlackAlert(`${parts.join(" · ")} → ${siteUrl}/admin/ad-boost`);
      } catch (err) {
        console.error("[ad-boost-end-scheduler] Slack ping failed:", err);
      }
    }

    return counts;
  });
}

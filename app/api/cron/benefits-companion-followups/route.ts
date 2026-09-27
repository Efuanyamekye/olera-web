import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { sendSMS } from "@/lib/twilio";
import { stateToTimezone } from "@/lib/sms/quiet-hours";
import { readBenefitsCascade } from "@/lib/family-comms/benefits-cascade.server";
import { isBenefitsAutomationHeld, readBenefitsHold } from "@/lib/family-comms/benefits-automation";
import { getBenefitsCompanionSettings } from "@/lib/analytics/benefits-companion-settings";
import {
  companionActive,
  readBenefitsCompanion,
  morningCheckSms,
  day14Sms,
  COMPANION_FOLLOWUP_TYPE,
} from "@/lib/family-comms/benefits-companion.server";

/**
 * GET /api/cron/benefits-companion-followups
 *
 * Part 3 of the benefits text companion test. Two texts, both scheduled to a
 * real moment in the family's day, never a clock tick:
 *
 *   Next morning (companion arm only). 12-48 hours after the opener, between
 *   8 and 10am their time, if they have not written back and have not told
 *   us they called: "Did you get through?" The answers (CALLED / NO ANSWER /
 *   STUCK) are the existing keywords, so they land in the plan like any other.
 *
 *   Day 14 (BOTH arms, identical words). The test's primary measure: "Were
 *   you able to get through to them? Reply 1 or 2." Control families are
 *   asked too, because otherwise the companion's own next-morning question
 *   would make it look better just for asking (TJ approved, 2026-09-27).
 *   Sent between 10am and 6pm their time, from day 14 to day 21.
 *
 * Nothing sends unless the switch in /admin/analytics is on Live. The day-14
 * text keeps going after the switch moves back, because it only reaches
 * families already in the test and it is the measure.
 */

export const maxDuration = 120;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_PER_RUN = 60;

/** Families with no state on file are read in Eastern time. */
const FALLBACK_TZ = "America/New_York";

function localHour(state: string | null, now: Date, fallback = false): number | null {
  const tz = stateToTimezone(state) ?? (fallback ? FALLBACK_TZ : null);
  if (!tz) return null;
  const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now);
  const n = parseInt(h, 10);
  return Number.isFinite(n) ? n % 24 : null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;
  if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dryRun = request.nextUrl.searchParams.get("dry_run") === "true";

  return withCronRun("benefits-companion-followups", async () => {
    const db = getServiceClient();
    const settings = await getBenefitsCompanionSettings();
    const now = new Date();
    const t = now.getTime();

    const { data: rows, error } = await db
      .from("business_profiles")
      .select("id, phone, phone_validity, state, metadata")
      .eq("type", "family")
      .not("metadata->benefits_companion", "is", null)
      .limit(2000);
    if (error) throw error;

    const counts = { dry_run: dryRun, families: rows?.length ?? 0, morning: 0, day14: 0, failed: 0, would_send: [] as string[] };
    let sent = 0;

    for (const row of rows ?? []) {
      if (sent >= MAX_PER_RUN) break;
      const meta = (row.metadata as Record<string, unknown>) || {};
      const c = readBenefitsCompanion(meta);
      if (!c || !row.phone || row.phone_validity === "opted_out" || !meta.sms_consent) continue;
      const hold = readBenefitsHold(meta);
      const hardStop =
        isBenefitsAutomationHeld(meta) && (hold?.reason === "deceased" || hold?.reason === "sms_opt_out");
      if (hardStop) continue;
      const hour = localHour(row.state, now);
      const followups = c.followups ?? {};

      // Next morning, companion arm only.
      if (
        companionActive(meta, settings, t) &&
        c.opener_sent_at &&
        !followups.morning_at &&
        hour !== null && hour >= 8 && hour < 10 &&
        !isBenefitsAutomationHeld(meta) &&
        !readBenefitsCascade(meta).first_step_done_at
      ) {
        const since = t - new Date(c.opener_sent_at).getTime();
        const inbound = Array.isArray(meta.sms_inbound) ? (meta.sms_inbound as { at?: string }[]) : [];
        const repliedSinceOpener = inbound.some((m) => m.at && m.at > (c.opener_sent_at as string));
        if (since >= 12 * HOUR && since <= 48 * HOUR && !repliedSinceOpener && c.program_short_name) {
          const body = morningCheckSms({ shortName: c.program_short_name, phone: c.program_phone ?? null });
          if (dryRun) {
            counts.would_send.push(`${row.id} morning`);
          } else {
            const res = await sendSMS({
              to: row.phone,
              body,
              emailType: COMPANION_FOLLOWUP_TYPE,
              recipientType: "family",
              recipientLogProfileId: row.id,
              metadata: { companion_arm: c.arm, companion_kind: "morning" },
            });
            if (res.success) {
              counts.morning++;
              sent++;
              await stamp(db, row.id, { followups: { ...followups, morning_at: now.toISOString() } });
            } else {
              counts.failed++;
            }
          }
          continue;
        }
      }

      // Day 14, both arms, identical words. A family with no state on file
      // is still asked (dropping them would skew the measure), inside a
      // narrower Eastern window that is daytime across the lower 48.
      const age = t - new Date(c.assigned_at).getTime();
      const knownTz = !!stateToTimezone(row.state);
      const day14Hour = localHour(row.state, now, true);
      const inDay14Window =
        day14Hour !== null && (knownTz ? day14Hour >= 10 && day14Hour < 18 : day14Hour >= 12 && day14Hour < 18);
      if (
        !followups.day14_at &&
        !c.day14 &&
        age >= 14 * DAY &&
        age <= 21 * DAY &&
        inDay14Window
      ) {
        const body = day14Sms({ shortName: c.program_short_name ?? null });
        if (dryRun) {
          counts.would_send.push(`${row.id} day14 (${c.arm})`);
          continue;
        }
        const res = await sendSMS({
          to: row.phone,
          body,
          emailType: COMPANION_FOLLOWUP_TYPE,
          recipientType: "family",
          recipientLogProfileId: row.id,
          metadata: { companion_arm: c.arm, companion_kind: "day14" },
        });
        if (res.success) {
          counts.day14++;
          sent++;
          await stamp(db, row.id, {
            followups: { ...followups, day14_at: now.toISOString() },
            open_question: { kind: "day14", asked_at: now.toISOString() },
          });
        } else {
          counts.failed++;
          // Stamp anyway so a number that fails is not retried every hour.
          await stamp(db, row.id, { followups: { ...followups, day14_at: now.toISOString() }, day14_failed: true });
        }
      }
    }

    return { ok: true, ...counts, would_send: counts.would_send.slice(0, 100) };
  });
}

/** Merge a patch into metadata.benefits_companion, reading fresh first. */
async function stamp(db: ReturnType<typeof getServiceClient>, id: string, patch: Record<string, unknown>) {
  const { data } = await db.from("business_profiles").select("metadata").eq("id", id).maybeSingle();
  const meta = (data?.metadata as Record<string, unknown> | null) || {};
  const current = (meta.benefits_companion as Record<string, unknown> | undefined) || {};
  await db
    .from("business_profiles")
    .update({ metadata: { ...meta, benefits_companion: { ...current, ...patch } } })
    .eq("id", id);
}

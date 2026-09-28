import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { sendSlackAlert } from "@/lib/slack";

/**
 * GET /api/cron/benefits-texts-digest
 *
 * One Slack post twice a day instead of one per family text (TJ, 2026-09-27:
 * "let's not drown the Slack notifications channel with every single
 * response"). It replaces three per-message posts: "Family texted back", the
 * companion's automatic answers, and each drafted research answer.
 *
 * What still posts immediately, on purpose: urgent answers (🚨), STUCK and
 * other help requests (🆘), crisis language and death reports. Those need a
 * person the same day.
 *
 * Runs at the same hours as Cortex's Telegram inbox pass, which carries the
 * drafted replies themselves for approval.
 */

export const maxDuration = 60;

const WINDOW_MS = 12 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;
  if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dryRun = request.nextUrl.searchParams.get("dry_run") === "true";

  return withCronRun("benefits-texts-digest", async () => {
    const db = getServiceClient();
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const [inbound, companion, drafted, waiting] = await Promise.all([
      db
        .from("sms_inbound")
        .select("profile_id, handled_at")
        .eq("profile_type", "family")
        .is("keyword", null)
        .gte("created_at", since),
      db
        .from("email_log")
        .select("metadata")
        .eq("email_type", "benefits_companion_reply")
        .gte("created_at", since),
      db
        .from("family_answer_jobs")
        .select("status, sent_by, packet")
        .gte("completed_at", since),
      // Recent ones only: a draft nobody sent weeks ago is not "waiting", and
      // counting it would make this post twice a day forever.
      db
        .from("family_answer_jobs")
        .select("id")
        .eq("status", "ready")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const texts = inbound.data ?? [];
    const families = new Set(texts.map((t) => t.profile_id).filter(Boolean)).size;
    const kinds = (companion.data ?? []).map((r) => String((r.metadata as { companion_kind?: string } | null)?.companion_kind ?? ""));
    const autoAnswered = kinds.filter((k) => k.startsWith("auto_")).length;
    const toPerson = kinds.filter((k) => k === "escalate").length;
    const urgent = kinds.filter((k) => k === "urgent" || k === "urgency_yes").length;
    const jobs = drafted.data ?? [];
    const autoSent = jobs.filter((j) => j.sent_by === "auto:family-answers").length;
    const draftedReady = jobs.filter((j) => j.status === "ready").length;
    const reasons = new Map<string, number>();
    for (const j of jobs) {
      const r = (j.packet as { autoSend?: { reasons?: string[] } } | null)?.autoSend?.reasons ?? [];
      for (const x of r) reasons.set(x, (reasons.get(x) ?? 0) + 1);
    }
    const waitingNow = waiting.data?.length ?? 0;

    const counts = { texts: texts.length, families, autoAnswered, toPerson, urgent, autoSent, draftedReady, waitingNow };
    const quiet = texts.length === 0 && kinds.length === 0 && jobs.length === 0 && waitingNow === 0;
    if (quiet) return { ok: true, posted: false, ...counts };

    const lines = [
      `📬 Benefits texts, last 12 hours: ${texts.length} text${texts.length === 1 ? "" : "s"} from ${families} famil${families === 1 ? "y" : "ies"}.`,
    ];
    if (autoAnswered || toPerson || urgent) {
      lines.push(
        `Companion: answered ${autoAnswered} on its own, handed ${toPerson} to a person${urgent ? `, ${urgent} urgent (already alerted)` : ""}.`,
      );
    }
    if (jobs.length) {
      const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `${r} (${n})`).join(", ");
      lines.push(
        `Researched answers: ${jobs.length} drafted, ${autoSent} sent automatically, ${draftedReady} waiting for a person${top ? `. Why a person: ${top}` : ""}.`,
      );
    }
    lines.push(
      waitingNow
        ? `${waitingNow} drafted repl${waitingNow === 1 ? "y is" : "ies are"} waiting. They're in Cortex's Telegram list, or reply from ${getSiteUrl()}/admin/inbox`
        : "Nothing is waiting on a person.",
    );

    if (!dryRun) {
      try {
        await sendSlackAlert(lines.join("\n"));
      } catch (err) {
        console.error("[benefits-texts-digest] Slack post failed:", err);
      }
    }
    return { ok: true, posted: !dryRun, message: lines.join("\n"), ...counts };
  });
}

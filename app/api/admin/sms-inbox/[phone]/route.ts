import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { createTwilioClient } from "@/lib/twilio";
import { quietHoursCheck } from "@/lib/sms/quiet-hours";
import { familyIdByPhone, markSmsThreadHandled, MAX_SMS_BODY, replyToSmsThread, threadIsCrisis, toE164 } from "@/lib/sms/inbox-actions.server";
import { readCareAge, AGE_BAND_LABELS } from "@/lib/benefits/age";

/**
 * One SMS conversation, and the ability to answer it.
 *
 * GET  /api/admin/sms-inbox/[phone]  — full thread, both directions, plus any saved draft
 * POST /api/admin/sms-inbox/[phone]  — { action: "reply", body } | { action: "mark_handled" }
 *                                    | { action: "save_draft", body } | { action: "discard_draft" }
 *                                    | { action: "cancel_scheduled" }
 *
 * A reply sent outside the recipient's quiet-hours window is QUEUED rather than
 * refused, and the bookkeeping an immediate send does moves to delivery time.
 * See `scheduleReply` below.
 *
 * Twilio remains the complete history when available. Durable sms_inbound and
 * email_log rows form the fallback so an outage cannot hide logged outbound
 * messages or make an outbound-only conversation open to a blank pane.
 *
 * `phone` in the path is the last 10 digits (the thread key used everywhere:
 * sms_inbound.phone_last10 and do_not_contact.phone).
 */

const MAX_THREAD = 200;

/** Matches the reply box and the sms_drafts CHECK — one limit, three places. */
const MAX_BODY = MAX_SMS_BODY;

/** Twilio addresses US numbers in E.164; the thread helpers live in lib/sms/inbox-actions.server.ts. */

/**
 * The standing facts about a care seeker, for the rail beside the conversation.
 *
 * Reviewers were opening a thread and seeing only texts: no idea whether the
 * person writing was the one who needs care or a daughter three states away, no
 * location below the state, no sense of how long they had been waiting. Every
 * reply on 2026-09-01 needed a database query before it could be written, and
 * the rail meanwhile showed a display name that is the literal string "Care
 * Seeker" for every family, next to the phone number already in the header.
 *
 * Deliberately NOT a summary. A sentence like "60-year-old cancer patient in
 * Marion County" reads as established when the age came from a form, and that
 * is precisely how a wrong fact gets acted on — the engine asserted an
 * age-gated program at someone who was not that age on 2026-08-18, and invented
 * a name out of a two-character text on 2026-09-01. So each fact is rendered
 * next to where it came from, and anything we would have to infer is left out.
 *
 * `verified` means they told us in the thread. Everything else came off a form
 * and is often right and sometimes badly wrong.
 */
interface SeekerFact {
  label: string;
  value: string;
  verified: boolean;
}

/**
 * Turn a stored answer into something a person reads.
 *
 * These values are form keys, not language: `under1500`, `personalCare`,
 * `mobilityHelp`. Rendered raw they make the panel look like a database dump,
 * and a reviewer has to translate every line before it means anything.
 */
const INCOME_LABELS: Record<string, string> = {
  under1500: "Under $1,500/mo",
  "1500to3000": "$1,500 – $3,000/mo",
  "3000to5000": "$3,000 – $5,000/mo",
  over5000: "Over $5,000/mo",
};

function humanize(raw: string): string {
  if (INCOME_LABELS[raw]) return INCOME_LABELS[raw];
  const spaced = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The programs matched to this family and saved to their plan.
 *
 * Answers the question a reviewer actually opens the panel with: what is this
 * person here for. saved_programs keys on the auth user rather than the profile
 * or the account, so it takes two hops to reach; without them the panel can say
 * how many messages someone sent and nothing about what they need.
 *
 * Deduplicated because the matcher writes overlapping rows for the same
 * program: one family carries both "SNAP" and "SNAP Food Benefits", and both
 * "LIHEAP" and "LIHEAP Energy Assistance".
 */
async function fetchSavedPrograms(
  db: ReturnType<typeof getServiceClient>,
  accountId: string | null,
): Promise<string[]> {
  if (!accountId) return [];
  try {
    const { data: account } = await db
      .from("accounts")
      .select("user_id")
      .eq("id", accountId)
      .maybeSingle();
    if (!account?.user_id) return [];
    const { data: rows } = await db
      .from("saved_programs")
      .select("name, short_name, created_at")
      .eq("user_id", account.user_id)
      .order("created_at", { ascending: true });

    // Some short_names are stored truncated mid-parenthesis — "SHINE (Serving
    // Health", "Primary Home Care (Community" — so an unclosed bracket is cut
    // rather than rendered as a dangling fragment.
    const clean = (raw: string) => {
      const t = raw.trim();
      const open = t.lastIndexOf("(");
      return (open > 0 && !t.includes(")", open) ? t.slice(0, open) : t).trim();
    };
    const key = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, "");

    const labels = ((rows ?? []) as { name: string | null; short_name: string | null }[])
      .map((r) => clean(r.short_name || r.name || ""))
      .filter(Boolean);

    // Keep the shortest form of each program. The matcher writes both "SNAP"
    // and "SNAP Food Benefits", "LIHEAP" and "LIHEAP Energy Assistance",
    // "STAR+PLUS" and "STAR+PLUS Waiver" — the same door twice, and the bare
    // name is the one a family would recognise on the phone. A prefix test,
    // not a truncated-key match: the short form is often under ten characters,
    // so comparing fixed-length slices leaves both rows standing.
    const keys = labels.map(key);
    const out: string[] = [];
    const taken = new Set<string>();
    labels.forEach((label, i) => {
      const k = keys[i];
      if (taken.has(k)) return;
      const shadowed = keys.some((other, j) => j !== i && other.length < k.length && k.startsWith(other));
      if (shadowed) return;
      taken.add(k);
      out.push(label);
    });
    return out;
  } catch (err) {
    console.error("[admin/sms-inbox/phone] saved programs load failed:", err);
    return [];
  }
}

function buildSeekerContext(
  profile: {
    email: string | null;
    city: string | null;
    state: string | null;
    metadata: Record<string, unknown> | null;
  } | null,
  inboundRows: { created_at: string; handled_at: string | null }[],
  outboundCount: number,
  savedPrograms: string[],
) {
  const meta = (profile?.metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const facts: SeekerFact[] = [];
  const push = (label: string, value: string | null, verified = false) => {
    if (value) facts.push({ label, value, verified });
  };

  const list = (v: unknown) =>
    Array.isArray(v)
      ? (v as unknown[]).filter((x): x is string => typeof x === "string").map(humanize).join(", ") || null
      : null;

  const careAge = readCareAge(meta);
  push("Age", careAge.exact != null ? String(careAge.exact) : careAge.band ? AGE_BAND_LABELS[careAge.band] : null);
  push("Household income", str(meta.income_range) ? humanize(str(meta.income_range)!) : null);
  push("Timeline", str(meta.timeline) ? humanize(str(meta.timeline)!) : null);
  push("Coverage", list(meta.payment_methods));
  push("Care needs", list(meta.care_needs));

  // The program they are mid-flight on, straight off the cascade rather than
  // guessed from what we happened to say in the thread.
  const cascade = (meta.benefits_cascade ?? {}) as Record<string, unknown>;
  const program = str(cascade.first_step_program_name)
    ? {
        name: str(cascade.first_step_program_name)!,
        firstStepAt: str(cascade.first_step_sms_at) ?? str(cascade.first_step_sent_at),
        lastReply: str(cascade.last_sms_reply),
        status: str(cascade.application_status),
      }
    : null;

  // county is stored as "Marion, Florida" on some profiles and "Marion" on
  // others, so appending the state code blindly yields "Marion, Florida, FL".
  const place = str(meta.county) ?? profile?.city ?? null;
  const stateCode = profile?.state ?? null;
  const alreadyNamesState =
    place && stateCode ? place.toLowerCase().includes(stateCode.toLowerCase()) : false;
  const location = place
    ? alreadyNamesState || !stateCode
      ? place
      : `${place}, ${stateCode}`
    : stateCode;

  const sorted = [...inboundRows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const oldestUnhandled = sorted.find((r) => !r.handled_at)?.created_at ?? null;

  return {
    // The one identity signal we actually hold. display_name is "Care Seeker"
    // for every family, and guessing a name out of an email address is the same
    // class of inference that produced a reply addressed to the wrong person.
    email: profile?.email ?? null,
    /** Who is writing, relative to whoever needs care. Changes how you reply. */
    relationship: str(meta.relationship_to_recipient),
    location,
    facts,
    program,
    savedPrograms,
    /** What they said they were here for, when the finder recorded it. */
    lookingFor: str((meta.benefits_results as Record<string, unknown> | undefined)?.answers &&
      ((meta.benefits_results as { answers?: Record<string, unknown> }).answers?.careNeed as string))
      ? humanize(
          (meta.benefits_results as { answers: { careNeed: string } }).answers.careNeed,
        )
      : null,
    firstSeenAt: sorted[0]?.created_at ?? null,
    waitingSince: oldestUnhandled,
    counts: { them: inboundRows.length, us: outboundCount },
  };
}

function normalizeLast10(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { phone } = await params;
    const last10 = normalizeLast10(phone);
    if (!last10) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });

    const db = getServiceClient();
    const e164 = toE164(last10);

    const [inboundRes, dncRes, draftRes, packetRes, outboundLogRes, scheduledRes, crisisExempt] =
      await Promise.all([
      db
        .from("sms_inbound")
        .select("id, from_phone, body, keyword, profile_id, profile_type, display_name, handled_at, created_at")
        .eq("phone_last10", last10)
        .order("created_at", { ascending: true }),
      db.from("do_not_contact").select("id, reason, note").eq("phone", last10).limit(1).maybeSingle(),
      db.from("sms_drafts").select("body, updated_by, updated_at").eq("phone_last10", last10).maybeSingle(),
      // The most recent researched answer waiting on a human. Only `ready`
      // rows are surfaced: `pending`/`running` have nothing to show yet, and
      // `sent` is already answered.
      db
        .from("family_answer_jobs")
        .select("id, packet, created_at")
        .eq("phone_last10", last10)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Durable fallback for outbound-only conversations and for the moments
      // when Twilio history is unavailable. Benefits, navigator, acknowledgments,
      // and human admin replies all pass an emailType and therefore land here.
      db
        .from("email_log")
        .select(
          "id, resend_id, html_body, status, error_message, created_at, delivered_at, bounced_at, provider_id, recipient_type",
        )
        .eq("channel", "sms")
        .eq("recipient", e164)
        .order("created_at", { ascending: true })
        .limit(MAX_THREAD),
      // A reply already written and waiting for the recipient's window to open.
      // The thread reads as handled while one of these exists, so the UI has to
      // be able to say WHY, and to offer a way back out of it.
      db
        .from("sms_queue")
        .select("id, body, send_after, queued_by, created_at")
        .eq("phone_last10", last10)
        .eq("origin", "admin_reply")
        .eq("status", "pending")
        .order("send_after", { ascending: true })
        .limit(1)
        .maybeSingle(),
      // Same read the reply action uses, so the button's label and the
      // button's behaviour can never disagree. In the parallel batch rather
      // than awaited after it: this runs on every thread open, and a serial
      // round trip here is latency paid on the page's hot path for nothing.
      threadIsCrisis(db, last10),
    ]);
    if (inboundRes.error) {
      console.error("[admin/sms-inbox/phone] inbound load failed:", inboundRes.error);
      return NextResponse.json({ error: inboundRes.error.message }, { status: 500 });
    }
    const inboundRows = inboundRes.data ?? [];
    const outboundLogRows = outboundLogRes.error ? [] : (outboundLogRes.data ?? []);
    if (outboundLogRes.error) {
      console.error("[admin/sms-inbox/phone] outbound log load failed:", outboundLogRes.error);
    }

    // Identity: take the most recent non-null resolution we have on file.
    const identified = [...inboundRows].reverse().find((r) => r.display_name || r.profile_type);
    const latestOutbound = outboundLogRows.at(-1);
    let resolvedProfileId: string | null = identified?.profile_id ?? latestOutbound?.provider_id ?? null;
    // A conversation started from here has no inbound row and, for a city
    // lead, no provider_id on its sends. Find the family by number so the
    // header names them and quiet hours use their state.
    if (!resolvedProfileId) resolvedProfileId = await familyIdByPhone(db, last10);
    let resolvedDisplayName = identified?.display_name ?? null;
    let resolvedProfileType = identified?.profile_type ?? latestOutbound?.recipient_type ?? null;
    // Quiet hours are evaluated in the RECIPIENT's timezone, so the state is
    // needed on every load, not only when the display name is missing.
    let recipientState: string | null = null;
    let seekerAccountId: string | null = null;
    let seekerProfile: {
      email: string | null;
      city: string | null;
      state: string | null;
      metadata: Record<string, unknown> | null;
    } | null = null;
    if (resolvedProfileId) {
      const { data: profile, error: profileError } = await db
        .from("business_profiles")
        .select("display_name, type, state, city, email, metadata, account_id")
        .eq("id", resolvedProfileId)
        .maybeSingle();
      if (profileError) {
        console.error("[admin/sms-inbox/phone] profile identity load failed:", profileError);
      } else if (profile) {
        recipientState = profile.state ?? null;
        resolvedDisplayName ||= profile.display_name ?? null;
        resolvedProfileType ||= profile.type ?? null;
        seekerAccountId = (profile.account_id as string | null) ?? null;
        seekerProfile = {
          email: profile.email ?? null,
          city: profile.city ?? null,
          state: profile.state ?? null,
          metadata: (profile.metadata as Record<string, unknown> | null) ?? null,
        };
      }
    }

    // After the profile resolves, because it is keyed off the account we just
    // read. One query, and only when we actually matched someone.
    const savedPrograms = await fetchSavedPrograms(db, seekerAccountId);

    const storedMessages = [
      ...inboundRows.map((row) => ({
        sid: `inbound:${row.id}`,
        direction: "in" as const,
        body: row.body,
        at: row.created_at,
        status: "received",
        errorCode: null,
      })),
      ...outboundLogRows.map((row) => ({
        sid: row.resend_id || `outbound:${row.id}`,
        direction: "out" as const,
        body: row.html_body || "SMS sent",
        at: row.created_at,
        status: row.delivered_at
          ? "delivered"
          : row.bounced_at || row.status === "failed"
            ? "failed"
            : row.status,
        errorCode: null,
      })),
    ].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

    const client = createTwilioClient();
    let messages: {
      sid: string;
      direction: "in" | "out";
      body: string;
      at: string | null;
      status: string;
      errorCode: number | null;
    }[] = [];
    let twilioError: string | null = null;

    if (client) {
      try {
        // Twilio has no OR filter, so each direction is its own query.
        const [outbound, inbound] = await Promise.all([
          client.messages.list({ to: e164, limit: MAX_THREAD }),
          client.messages.list({ from: e164, limit: MAX_THREAD }),
        ]);
        messages = [
          ...outbound.map((m) => ({
            sid: m.sid,
            direction: "out" as const,
            body: m.body || "",
            at: m.dateSent ? new Date(m.dateSent).toISOString() : null,
            status: m.status,
            errorCode: m.errorCode ?? null,
          })),
          ...inbound.map((m) => ({
            sid: m.sid,
            direction: "in" as const,
            body: m.body || "",
            at: m.dateSent ? new Date(m.dateSent).toISOString() : null,
            status: m.status,
            errorCode: m.errorCode ?? null,
          })),
        ].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
        // A logged send can briefly precede Twilio's history visibility. Never
        // turn that propagation delay into an empty outbound-only thread.
        if (messages.length === 0 && storedMessages.length > 0) messages = storedMessages;
      } catch (err) {
        // A Twilio outage must not blank the page — we still have our own
        // inbound rows to show.
        console.error("[admin/sms-inbox/phone] Twilio history failed:", err);
        twilioError = "Twilio history is unavailable right now.";
        messages = storedMessages;
      }
    } else {
      twilioError = "Twilio is not configured.";
      messages = storedMessages;
    }

    return NextResponse.json({
      phone_last10: last10,
      e164,
      display_name: resolvedDisplayName,
      profile_type: resolvedProfileType,
      profile_id: resolvedProfileId,
      suppressed: Boolean(dncRes.data),
      suppression: dncRes.data ? { reason: dncRes.data.reason, note: dncRes.data.note } : null,
      unhandled: inboundRows.filter((r) => !r.handled_at).length,
      seeker: buildSeekerContext(seekerProfile, inboundRows, outboundLogRows.length, savedPrograms),
      // Quiet hours, evaluated for THIS recipient so the reply box can say what
      // pressing the button will actually do before it is pressed.
      quietHours: (() => {
        const q = quietHoursCheck({ state: recipientState });
        // A crisis reply is never held, so offering to schedule one would be
        // offering the wrong thing. Collapse the choice back to a single Send.
        return {
          allowed: q.allowed || crisisExempt,
          crisisExempt,
          tz: q.tz,
          sendAfter: q.sendAfter ? q.sendAfter.toISOString() : null,
          /** Recipient-local clock at load, so the UI can say WHY it is holding. */
          recipientNow: new Date().toLocaleString("en-US", {
            timeZone: q.tz,
            hour: "numeric",
            minute: "2-digit",
          }),
        };
      })(),
      scheduled:
        scheduledRes.error || !scheduledRes.data
          ? null
          : {
              id: scheduledRes.data.id,
              body: scheduledRes.data.body,
              send_after: scheduledRes.data.send_after,
              queued_by: scheduledRes.data.queued_by,
            },
      // Our stored copy — the durable record, and the only source if Twilio errors.
      inbound: inboundRows,
      messages,
      twilioError,
      // A draft read failure must never blank the conversation — the thread is
      // the point of the page, the unsent reply is an extra.
      draft: draftRes.error
        ? null
        : draftRes.data
          ? {
              body: draftRes.data.body,
              updated_by: draftRes.data.updated_by,
              updated_at: draftRes.data.updated_at,
            }
          : null,
      // Same rule as the draft: a packet read failure must not blank the
      // conversation. The researched answer is an aid, not the page.
      answerPacket:
        packetRes.error || !packetRes.data?.packet
          ? null
          : { jobId: packetRes.data.id, packet: packetRes.data.packet },
    });
  } catch (err) {
    console.error("[admin/sms-inbox/phone] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { phone } = await params;
    const last10 = normalizeLast10(phone);
    if (!last10) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const db = getServiceClient();

    if (action === "mark_handled") {
      const result = await markSmsThreadHandled(db, last10, user.email ?? admin.id);
      return NextResponse.json(result.json, { status: result.status });
    }

    // Park an unsent reply against the thread. Autosaved from the inbox as you
    // type, so this is deliberately cheap: upsert, no audit row (a keystroke
    // trail would bury real admin actions), and no effect on handled state —
    // writing a draft is not answering anyone.
    if (action === "save_draft") {
      const text = typeof body?.body === "string" ? body.body : "";
      // An empty draft is the absence of a draft, not a row holding "".
      if (!text.trim()) {
        const { error } = await db.from("sms_drafts").delete().eq("phone_last10", last10);
        if (error) {
          console.error("[admin/sms-inbox/phone] draft clear failed:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, draft: null });
      }
      if (text.length > MAX_BODY) {
        return NextResponse.json(
          { error: `Draft is too long (${MAX_BODY} characters max)` },
          { status: 400 },
        );
      }

      const updatedAt = new Date().toISOString();
      const { error } = await db.from("sms_drafts").upsert(
        {
          phone_last10: last10,
          body: text,
          updated_by: user.email ?? admin.id,
          updated_at: updatedAt,
        },
        { onConflict: "phone_last10" },
      );
      if (error) {
        console.error("[admin/sms-inbox/phone] draft save failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        draft: { body: text, updated_by: user.email ?? admin.id, updated_at: updatedAt },
      });
    }

    if (action === "discard_draft") {
      const { error } = await db.from("sms_drafts").delete().eq("phone_last10", last10);
      if (error) {
        console.error("[admin/sms-inbox/phone] draft discard failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, draft: null });
    }

    // Undo a scheduled send. The reply goes back to the draft box rather than
    // being thrown away: cancelling usually means "I want to change it", not "I
    // never meant to say that", and making someone retype 400 characters to
    // edit one phone number is the kind of small tax that stops people editing.
    if (action === "cancel_scheduled") {
      const { data: pending } = await db
        .from("sms_queue")
        .select("id, body, answer_job_id, created_at")
        .eq("phone_last10", last10)
        .eq("origin", "admin_reply")
        .eq("status", "pending")
        .order("send_after", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!pending) {
        return NextResponse.json({ error: "Nothing is scheduled for this thread." }, { status: 409 });
      }

      const { error } = await db
        .from("sms_queue")
        .update({ status: "canceled", last_error: `canceled by ${user.email ?? admin.id}` })
        .eq("id", pending.id)
        // Guard against the flush having delivered it between the read above
        // and this write: an hourly cron and a human can genuinely collide, and
        // "canceled" stamped over "sent" would claim a delivered message never
        // went out.
        .eq("status", "pending");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await Promise.all([
        // Scoped to what scheduling handled, not the whole thread — earlier
        // exchanges on this number were answered and must stay answered.
        db
          .from("sms_inbound")
          .update({ handled_at: null, handled_by: null })
          .eq("phone_last10", last10)
          .gte("handled_at", pending.created_at),
        db.from("sms_drafts").upsert(
          {
            phone_last10: last10,
            body: pending.body,
            updated_by: user.email ?? admin.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone_last10" },
        ),
        pending.answer_job_id
          ? db
              .from("family_answer_jobs")
              .update({ status: "ready", sent_body: null, sent_by: null })
              .eq("id", pending.answer_job_id)
          : Promise.resolve(),
      ]);

      await logAuditAction({
        adminUserId: admin.id,
        action: "sms_reply_schedule_canceled",
        targetType: "phone",
        targetId: last10,
        details: {},
      });

      return NextResponse.json({ success: true, draft: { body: pending.body } });
    }

    if (action === "reply") {
      const result = await replyToSmsThread(db, {
        last10,
        body: body?.body,
        actor: user.email ?? admin.id,
        adminUserId: admin.id,
        sendNow: body?.sendNow === true,
      });
      return NextResponse.json(result.json, { status: result.status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[admin/sms-inbox/phone] Unexpected error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

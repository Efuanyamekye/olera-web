// Smartlead webhook receiver — Supabase Edge Function (Deno). [D2]
//
// Routes Smartlead lifecycle events (sent / open / click / reply / bounce /
// unsubscribe) into the MedJobs CRM as touchpoints + row metadata, so a
// provider who replies to a cold campaign surfaces in the In-Basket Replies
// tab and a bounce surfaces as bounce_fix — the same operational state a
// manually-logged event produces.
//
// WHY an Edge Function (not a Vercel route): Vercel's Bot Protection edge
// layer 403s provider-origin webhook POSTs (the Resend + Stripe lesson;
// see supabase/functions/resend-webhook). Smartlead's webhooks hit the same
// wall, so this lives off Vercel.
//
// ── EVENT MAPPING ─────────────────────────────────────────────────────────
//   EMAIL_SENT       → email_sent touchpoint (contact_id from custom_fields)
//   EMAIL_REPLY      → email_replied touchpoint + status=engaged transition
//                       (if pre-engagement), reopen_at cleared on resurrection
//   EMAIL_BOUNCE     → email_bounced touchpoint
//   EMAIL_UNSUBSCRIBE → email_complained touchpoint + status=do_not_contact
//                       (compliance: cannot continue cadence — mirrors Resend)
//   EMAIL_OPEN       → UPDATE matching email_sent touchpoint payload
//                       (open_count, last_opened_at, first_opened_at) +
//                       legacy row-level aggregate (research_data.smartlead.
//                       engagement). NO new touchpoint — Apple Mail Privacy
//                       Protection inflates open counts; per-event timeline
//                       noise would be unhelpful. Per-touchpoint granularity
//                       lets the timeline render engagement chips per email
//                       day (Day 0 vs Day 3 vs Day 7 attribution).
//   EMAIL_CLICK      → UPDATE matching email_sent touchpoint payload
//                       (click_count, last_clicked_at, first_clicked_at,
//                       clicked_ctas[]) + legacy row-level aggregate.
//
// ── ARCHITECTURE NOTE — narrow, deliberate G4 exception ──────────────────
// The Operational Brief's G4 rule is "all mutations through route.ts action
// handlers." The original D2 plan was to have this webhook call
// log_email_replied / log_email_bounced. That isn't viable: the very reason
// this must be an Edge Function (Vercel WAF blocks external POSTs) also blocks
// an Edge→Vercel callback, and the admin route needs a session this has no way
// to mint. So this function writes via the service role directly — the ONLY
// non-route.ts writer of student_outreach state. It is kept faithful + minimal
// by leaning on the derived-state model (Brief §2.3): it replicates exactly
// what insertTouchpoint + handleLogReply/handleLogTouch do.
//
// ── INERT until activated ────────────────────────────────────────────────
// No SMARTLEAD_WEBHOOK_SECRET set → every request is a logged no-op (200).
// Nothing happens until the secret is set AND Smartlead is configured to POST
// here. Payload field names follow Smartlead's documented webhook shape and
// are parsed defensively — VERIFY against current Smartlead webhook docs before
// activating (harmless until then, since it's a no-op).
//
// ── IDEMPOTENCY ──────────────────────────────────────────────────────────
// Smartlead may retry on transient failures. Sent/reply/bounce/unsubscribe
// events are dedup'd by `payload->>smartlead_event_id` on the destination
// touchpoint type — if a touchpoint already exists for the same event id +
// type, this is a no-op. Open/click events update aggregated counters; we
// dedupe by event_id stored in research_data.smartlead.engagement so retries
// don't double-count.
//
// Environment (auto-injected by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Environment (set via `supabase secrets set`): SMARTLEAD_WEBHOOK_SECRET
//
// Deploy: see ./README.md

import { createClient } from "jsr:@supabase/supabase-js@2";

const webhookSecret = Deno.env.get("SMARTLEAD_WEBHOOK_SECRET") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Statuses from which a reply promotes the row to engaged (mirrors
// handleLogReply in app/api/admin/student-outreach/[id]/route.ts).
const PROMOTE_ON_REPLY = new Set([
  "outreach_sent",
  "researched",
  "prospect",
  "no_response_closed",
]);

type Kind = "sent" | "open" | "click" | "reply" | "bounce" | "unsubscribe" | "ignore";

/** Map a Smartlead event payload to our coarse kind. Smartlead uses event_type
 *  values like EMAIL_SENT / EMAIL_REPLY / EMAIL_BOUNCE / EMAIL_OPEN /
 *  EMAIL_CLICK / EMAIL_UNSUBSCRIBE; we accept aliases defensively since the
 *  exact casing/name should be re-verified before launch. */
function classify(raw: unknown): Kind {
  const ev = String(
    (raw as { event_type?: unknown; event?: unknown })?.event_type ??
      (raw as { event?: unknown })?.event ??
      "",
  ).toUpperCase();
  // Order matters: REPLY/BOUNCE/UNSUBSCRIBE/CLICK/OPEN/SENT — REPLY can contain
  // "SENT" in some Smartlead variants, and BOUNCE matches before generic SENT.
  if (ev.includes("UNSUBSCRIBE") || ev.includes("COMPLAIN")) return "unsubscribe";
  if (ev.includes("REPLY") || ev.includes("REPLIED")) return "reply";
  if (ev.includes("BOUNCE")) return "bounce";
  if (ev.includes("CLICK")) return "click";
  if (ev.includes("OPEN")) return "open";
  if (ev.includes("SENT") || ev.includes("DELIVER")) return "sent";
  return "ignore";
}

interface LeadExtract {
  outreachId?: string;
  email?: string;
  /** Smartlead campaign id from the event payload. Present on reply/open/click
   *  events (which carry no custom_fields). Diagnostic aid for unmatched events. */
  campaignId?: number;
  contactId?: string | null;
  recipientKind?: string;
  role?: string;
  sequenceStep?: number;
  eventId?: string;
  eventAt?: string;
  /** For click events only: the URL the recipient clicked. Stored in the
   *  email_sent touchpoint's clicked_ctas[] for timeline rendering ("clicked:
   *  Review {campus} student caregivers"). */
  clickUrl?: string;
  /** For reply events: the provider's actual reply, surfaced in the Email
   *  drawer so the admin answers what they said. reply_body is HTML;
   *  preview_text is the plain-text snippet. */
  replyBody?: string;
  replyPreview?: string;
  replySubject?: string;
  /** The address the reply came FROM (the provider) — may differ from the
   *  lead email if they replied from a different mailbox. */
  fromEmail?: string;
}

/** Pull our CRM join keys (custom_fields.outreach_id, contact_id, etc.) out of
 *  the lead, however Smartlead nests it; fall back to the lead email for a
 *  research_data lookup.
 *
 *  CRITICAL — reply events differ in shape: Smartlead's EMAIL_REPLY payload
 *  carries NO `lead` object and NO `custom_fields` (so no outreach_id). The
 *  canonical lead address is `sl_lead_email` (the campaign lead) — correct even
 *  when the provider replies from a DIFFERENT mailbox, in which case
 *  `to_email`/`from_email` hold that other mailbox, not our prospect. So for
 *  replies resolve off sl_lead_email; never off from_email. `kind` drives this. */
function extractLead(raw: unknown, kind: Kind): LeadExtract {
  const r = raw as Record<string, unknown>;
  const lead = (r.lead ?? r.lead_data ?? r) as Record<string, unknown>;
  const cf = (lead.custom_fields ?? r.custom_fields ?? {}) as Record<string, unknown>;

  const outreachId = cf.outreach_id != null ? String(cf.outreach_id) : undefined;
  const contactIdRaw = cf.contact_id != null ? String(cf.contact_id) : "";
  // Empty string custom_field = General Contact (synthetic, contact_id=null
  // on touchpoint); non-empty = Named Contact (use as touchpoint.contact_id).
  const contactId = contactIdRaw ? contactIdRaw : null;
  const recipientKind = cf.recipient_kind != null ? String(cf.recipient_kind) : undefined;
  const role = cf.role != null ? String(cf.role) : undefined;

  // The LEAD/prospect email used to resolve the CRM row. Replies put the
  // canonical lead in sl_lead_email; other events carry it on the lead object
  // / to_email. Never resolve a row off from_email (the reply sender).
  const email = (
    kind === "reply"
      ? String((r.sl_lead_email ?? r.to_email ?? r.to ?? "") as string)
      : String(
          (lead.email ?? r.sl_lead_email ?? r.to_email ?? r.to ?? lead.to_email ?? "") as string,
        )
  )
    .trim()
    .toLowerCase();

  const campaignIdRaw =
    r.campaign_id ?? (r.campaign as Record<string, unknown> | undefined)?.id;
  const campaignId =
    campaignIdRaw != null && !Number.isNaN(Number(campaignIdRaw))
      ? Number(campaignIdRaw)
      : undefined;

  const sequenceStepRaw =
    (r.sequence_step ?? r.step ?? r.seq_number ?? (r.sequence as Record<string, unknown> | undefined)?.step) as
      | number
      | string
      | undefined;
  const sequenceStep =
    sequenceStepRaw != null && !Number.isNaN(Number(sequenceStepRaw))
      ? Number(sequenceStepRaw)
      : undefined;

  const eventIdRaw = r.id ?? r.event_id ?? r.message_id ?? r.smartlead_event_id;
  const eventId = eventIdRaw != null ? String(eventIdRaw) : undefined;

  const eventAtRaw = r.timestamp ?? r.event_timestamp ?? r.occurred_at ?? r.time;
  const eventAt = eventAtRaw != null ? String(eventAtRaw) : new Date().toISOString();

  // Click URL — only present on EMAIL_CLICK events. Field name varies across
  // Smartlead webhook versions; we accept the common aliases defensively.
  const clickUrlRaw =
    r.link_url ??
    r.clicked_url ??
    r.url ??
    (r.link as Record<string, unknown> | undefined)?.url;
  const clickUrl = clickUrlRaw != null ? String(clickUrlRaw) : undefined;

  // Reply payload — field names vary across Smartlead webhook versions; accept
  // the common aliases defensively (verify against current docs before launch).
  const reply = (r.reply ?? {}) as Record<string, unknown>;
  const replyBodyRaw =
    r.reply_body ??
    r.sent_message_body ?? // Smartlead's live EMAIL_REPLY body field (HTML)
    r.reply_message ??
    r.email_body ??
    r.body_html ??
    reply.body ??
    reply.html;
  const replyBody = replyBodyRaw != null ? String(replyBodyRaw) : undefined;
  const replyPreviewRaw =
    r.preview_text ?? r.sent_message ?? r.reply_preview ?? r.snippet ?? reply.preview_text;
  const replyPreview = replyPreviewRaw != null ? String(replyPreviewRaw) : undefined;
  const replySubjectRaw = r.subject ?? r.reply_subject ?? reply.subject;
  const replySubject = replySubjectRaw != null ? String(replySubjectRaw) : undefined;
  const fromEmailRaw = r.from_email ?? r.from ?? reply.from_email ?? reply.from;
  const fromEmail =
    fromEmailRaw != null ? String(fromEmailRaw).trim().toLowerCase() : undefined;

  return {
    outreachId,
    email: email || undefined,
    campaignId,
    contactId,
    recipientKind,
    role,
    sequenceStep,
    eventId,
    eventAt,
    clickUrl,
    replyBody,
    replyPreview,
    replySubject,
    fromEmail,
  };
}

interface ResolvedRow {
  id: string;
  status: string;
  research_data: Record<string, unknown> | null;
}

/** Resolve the student_outreach row id + current status from the join key or
 *  email. Returns null if we can't map the event to a row.
 *
 *  Resolution order, most → least reliable:
 *    1. custom_fields.outreach_id (sent/open/click carry it; replies do NOT).
 *    2. lead email against the COLD linkage (research_data.smartlead.lead_email).
 *    3. lead email against the ACTIVATION linkage
 *       (research_data.smartlead_activation.lead_email) — an engaged provider
 *       replying to the activation cadence has a different campaign than cold.
 *
 *  Email matches are case-insensitive (ilike) since the stored lead_email's
 *  casing isn't guaranteed to match the payload's. */
async function resolveRow(
  outreachId: string | undefined,
  email: string | undefined,
): Promise<ResolvedRow | null> {
  if (outreachId) {
    const { data } = await supabase
      .from("student_outreach")
      .select("id, status, research_data")
      .eq("id", outreachId)
      .maybeSingle();
    if (data) {
      return {
        id: data.id as string,
        status: data.status as string,
        research_data: (data.research_data as Record<string, unknown> | null) ?? null,
      };
    }
  }
  if (email) {
    // Match by the lead email stored in any smartlead linkage — cold, then
    // activation, then partner-welcome. All three store the prospect's address
    // as `lead_email`. (Welcome was previously omitted, so welcome-cadence
    // replies never resolved.)
    for (const path of [
      "research_data->smartlead->>lead_email",
      "research_data->smartlead_activation->>lead_email",
      "research_data->smartlead_welcome->>lead_email",
      "research_data->smartlead_custom->>lead_email",
    ]) {
      const { data } = await supabase
        .from("student_outreach")
        .select("id, status, research_data")
        .ilike(path, email)
        .limit(1);
      const row = (data ?? [])[0] as
        | { id: string; status: string; research_data: Record<string, unknown> | null }
        | undefined;
      if (row) {
        return { id: row.id, status: row.status, research_data: row.research_data ?? null };
      }
    }
    // Fan-out rows enroll multiple addresses but store only the first as
    // lead_email; match the reply against the full enrolled-emails array
    // (stored lowercased) so a reply from any recipient still resolves.
    const { data: arr } = await supabase
      .from("student_outreach")
      .select("id, status, research_data")
      .filter("research_data->smartlead->lead_emails", "cs", JSON.stringify([email]))
      .limit(1);
    const arrRow = (arr ?? [])[0] as
      | { id: string; status: string; research_data: Record<string, unknown> | null }
      | undefined;
    if (arrRow) {
      return { id: arrRow.id, status: arrRow.status, research_data: arrRow.research_data ?? null };
    }
  }
  return null;
}

/** Attribute a no-custom_fields event (reply/bounce/unsubscribe carry no
 *  contact_id) to the right CRM contact by matching the enrolled lead address
 *  against the row's Specific Contacts. Returns the named contact's id + role
 *  when it matches one; null when it's the general contact or unmatched (leave
 *  the touchpoint attributed to the General Contact). */
async function resolveContactByEmail(
  outreachId: string,
  email: string | undefined,
): Promise<{ contactId: string; role: string | null } | null> {
  if (!email) return null;
  const { data } = await supabase
    .from("student_outreach_contacts")
    .select("id, role, title")
    .eq("outreach_id", outreachId)
    .ilike("email", email)
    .limit(1);
  const c = (data ?? [])[0] as
    | { id: string; role: string | null; title: string | null }
    | undefined;
  if (!c) return null;
  return { contactId: c.id, role: c.role ?? c.title ?? null };
}

/** Check whether a touchpoint of `type` already exists for this row with the
 *  same Smartlead event id. Smartlead retries are rare but the dedupe guard
 *  keeps the timeline clean and prevents double status transitions. */
async function alreadyProcessed(
  outreachId: string,
  type: "email_sent" | "email_replied" | "email_bounced" | "email_complained",
  eventId: string | undefined,
): Promise<boolean> {
  if (!eventId) return false;
  const { data } = await supabase
    .from("student_outreach_touchpoints")
    .select("id")
    .eq("outreach_id", outreachId)
    .eq("touchpoint_type", type)
    .filter("payload->>smartlead_event_id", "eq", eventId)
    .limit(1);
  return (data ?? []).length > 0;
}

/** Insert a touchpoint — mirrors insertTouchpoint(auto-send-executor.ts) +
 *  resets viewed_at on reply/bounce/complain so the row resurfaces in the
 *  admin's inbox. */
async function insertTouchpoint(
  outreachId: string,
  type: "email_sent" | "email_replied" | "email_bounced" | "email_complained",
  contactId: string | null,
  payload: Record<string, unknown>,
  options: { resetViewedAt?: boolean } = {},
) {
  await supabase.from("student_outreach_touchpoints").insert({
    outreach_id: outreachId,
    contact_id: contactId,
    touchpoint_type: type,
    channel: "email",
    outcome: type === "email_sent" ? "sent" : null,
    notes: null,
    payload,
    created_by: null, // system / webhook origin
  });
  if (options.resetViewedAt) {
    await supabase.from("student_outreach").update({ viewed_at: null }).eq("id", outreachId);
  }
}

async function handleSent(row: ResolvedRow, extract: LeadExtract) {
  if (await alreadyProcessed(row.id, "email_sent", extract.eventId)) return;
  await insertTouchpoint(row.id, "email_sent", extract.contactId ?? null, {
    source: "smartlead",
    smartlead_event_id: extract.eventId ?? null,
    recipient_email: extract.email ?? null,
    recipient_kind: extract.recipientKind === "named" ? "specific" : "general",
    role: extract.role ?? null,
    sequence_step: extract.sequenceStep ?? null,
    occurred_at: extract.eventAt,
    outcome: "sent",
    success: true,
  });
}

async function handleReply(row: ResolvedRow, extract: LeadExtract) {
  if (await alreadyProcessed(row.id, "email_replied", extract.eventId)) return;
  await insertTouchpoint(row.id, "email_replied", extract.contactId ?? null, {
    source: "smartlead",
    smartlead_event_id: extract.eventId ?? null,
    recipient_email: extract.email ?? null,
    recipient_kind: extract.recipientKind === "named" ? "specific" : "general",
    role: extract.role ?? null,
    sequence_step: extract.sequenceStep ?? null,
    occurred_at: extract.eventAt,
    // The actual reply — surfaced in the Email drawer so the admin answers
    // what the provider said (Phase 4 reply import).
    reply_body: extract.replyBody ?? null,
    preview_text: extract.replyPreview ?? null,
    reply_subject: extract.replySubject ?? null,
    from_email: extract.fromEmail ?? extract.email ?? null,
  }, { resetViewedAt: true });

  // They responded — stop any queued CALL cards so we don't ring someone who
  // already wrote back. One query covers cold AND activation calls (both are
  // outreach_followup_call). Smartlead already auto-pauses the email drip, and
  // there are no CRM email-send tasks for Smartlead rows; outreach_email_send is
  // included only to cover any legacy/non-Smartlead rows.
  await supabase
    .from("student_outreach_tasks")
    .update({ status: "superseded", completed_at: new Date().toISOString() })
    .eq("outreach_id", row.id)
    .eq("status", "pending")
    .in("task_type", ["outreach_followup_call", "outreach_email_send"]);

  if (PROMOTE_ON_REPLY.has(row.status)) {
    const patch: Record<string, unknown> = { status: "engaged" };
    // Clear reopen_at when reviving a row that was archived (no_response_closed).
    if (row.status === "no_response_closed") patch.reopen_at = null;
    await supabase.from("student_outreach").update(patch).eq("id", row.id);
  }
}

async function handleBounce(row: ResolvedRow, extract: LeadExtract) {
  if (await alreadyProcessed(row.id, "email_bounced", extract.eventId)) return;
  await insertTouchpoint(row.id, "email_bounced", extract.contactId ?? null, {
    source: "smartlead",
    smartlead_event_id: extract.eventId ?? null,
    recipient_email: extract.email ?? null,
    recipient_kind: extract.recipientKind === "named" ? "specific" : "general",
    role: extract.role ?? null,
    sequence_step: extract.sequenceStep ?? null,
    occurred_at: extract.eventAt,
  }, { resetViewedAt: true });
  // No pending-task cancellation: Smartlead owns the email cadence, so there
  // are no outreach_email_send tasks in the CRM to cancel for Smartlead rows
  // (the engine branch in schedule_sequence queues only call tasks).
}

/** Compliance: an unsubscribe / complaint MUST stop the cadence — set the row
 *  to do_not_contact to mirror the Resend `complained` path. Emits an
 *  email_complained touchpoint (existing enum value, G1-compliant). */
async function handleUnsubscribe(row: ResolvedRow, extract: LeadExtract) {
  if (await alreadyProcessed(row.id, "email_complained", extract.eventId)) return;
  await insertTouchpoint(row.id, "email_complained", extract.contactId ?? null, {
    source: "smartlead",
    smartlead_event_id: extract.eventId ?? null,
    recipient_email: extract.email ?? null,
    recipient_kind: extract.recipientKind === "named" ? "specific" : "general",
    role: extract.role ?? null,
    sequence_step: extract.sequenceStep ?? null,
    occurred_at: extract.eventAt,
    reason: "unsubscribe",
  }, { resetViewedAt: true });
  // Compliance: cannot continue any cadence — set the row to do_not_contact.
  if (row.status !== "do_not_contact") {
    await supabase.from("student_outreach").update({ status: "do_not_contact" }).eq("id", row.id);
  }
}

/** Open and click events update TWO places (Phase 1 Bullet 3, 2026-06-04):
 *
 *   1. The matching email_sent touchpoint's payload (NEW) — so the outreach
 *      timeline can render engagement chips per email day ("Day 0 email · 3
 *      opens · 1 click on Review CTA"). Matched by outreach_id + sequence_step.
 *
 *   2. The legacy row-level aggregate at research_data.smartlead.engagement
 *      (PRESERVED) — kept for backward compatibility with any read paths that
 *      already key off the aggregate counters. Same fields as before.
 *
 * Dedup is enforced at BOTH layers (touchpoint payload's seen_engagement_events
 * + row engagement's seen_event_ids) so retries never double-count, regardless
 * of which path read state at request time. */
async function handleEngagement(
  row: ResolvedRow,
  type: "open" | "click",
  extract: LeadExtract,
) {
  // Layer 1 dedup: row-level (covers retries that miss the touchpoint match).
  const research = (row.research_data ?? {}) as Record<string, unknown>;
  const smartlead = (research.smartlead ?? {}) as Record<string, unknown>;
  const engagement = (smartlead.engagement ?? {}) as Record<string, unknown>;
  const seen = (engagement.seen_event_ids as string[] | undefined) ?? [];

  if (extract.eventId && seen.includes(extract.eventId)) {
    return; // Already counted this retry.
  }

  // Layer A: update the matching email_sent touchpoint payload (best-effort —
  // false return falls through to the row-level aggregate below).
  await updateMatchingEmailSentPayload(row.id, type, extract);

  // Layer B: update the legacy row-level aggregate.
  const opens = Number(engagement.opens ?? 0);
  const clicks = Number(engagement.clicks ?? 0);
  const nextEngagement: Record<string, unknown> = {
    ...engagement,
    opens: type === "open" ? opens + 1 : opens,
    clicks: type === "click" ? clicks + 1 : clicks,
    [type === "open" ? "last_opened_at" : "last_clicked_at"]: extract.eventAt,
    // Cap the dedupe ring so research_data doesn't grow unbounded. 200 ids
    // covers a campaign's lifetime of opens; older retries are unlikely.
    seen_event_ids: extract.eventId
      ? [extract.eventId, ...seen].slice(0, 200)
      : seen,
  };

  await supabase
    .from("student_outreach")
    .update({
      research_data: {
        ...research,
        smartlead: { ...smartlead, engagement: nextEngagement },
      },
    })
    .eq("id", row.id);
}

/** Find the email_sent touchpoint that an engagement event targets, and
 *  update its payload with per-email open/click counters. Matched by
 *  (outreach_id + sequence_step) — each cadence step has exactly one send
 *  per recipient. Falls back to the most recent email_sent when sequence_step
 *  is absent. Returns true on a successful update, false when no match. */
async function updateMatchingEmailSentPayload(
  outreachId: string,
  type: "open" | "click",
  extract: LeadExtract,
): Promise<boolean> {
  let query = supabase
    .from("student_outreach_touchpoints")
    .select("id, payload")
    .eq("outreach_id", outreachId)
    .eq("touchpoint_type", "email_sent");

  if (extract.sequenceStep != null) {
    query = query.filter(
      "payload->>sequence_step",
      "eq",
      String(extract.sequenceStep),
    );
  }

  const { data } = await query.order("created_at", { ascending: false }).limit(1);
  const touchpoint = (data ?? [])[0] as
    | { id: string; payload: Record<string, unknown> | null }
    | undefined;
  if (!touchpoint) return false;

  const payload = (touchpoint.payload ?? {}) as Record<string, unknown>;

  // Per-touchpoint dedup (catches the case where two engagement events for
  // the same email arrive but happen to hit different sequence_steps via
  // upstream confusion — defense in depth).
  const seenHere = (payload.seen_engagement_events as string[] | undefined) ?? [];
  if (extract.eventId && seenHere.includes(extract.eventId)) {
    return true; // No-op but counts as handled.
  }

  let patch: Record<string, unknown>;
  if (type === "open") {
    const openCount = Number(payload.open_count ?? 0);
    patch = {
      ...payload,
      open_count: openCount + 1,
      last_opened_at: extract.eventAt,
      first_opened_at: payload.first_opened_at ?? extract.eventAt,
    };
  } else {
    const clickCount = Number(payload.click_count ?? 0);
    const prevCtas = (payload.clicked_ctas as string[] | undefined) ?? [];
    const nextCtas = extract.clickUrl
      ? [...prevCtas, extract.clickUrl].slice(-10)
      : prevCtas;
    patch = {
      ...payload,
      click_count: clickCount + 1,
      last_clicked_at: extract.eventAt,
      first_clicked_at: payload.first_clicked_at ?? extract.eventAt,
      clicked_ctas: nextCtas,
    };
  }

  patch.seen_engagement_events = extract.eventId
    ? [...seenHere, extract.eventId].slice(-100)
    : seenHere;

  await supabase
    .from("student_outreach_touchpoints")
    .update({ payload: patch })
    .eq("id", touchpoint.id);

  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Inert until configured: no secret set → logged no-op so a stray/test POST
  // can never mutate the CRM before we intend it to.
  if (!webhookSecret) {
    console.log("[smartlead-webhook] no SMARTLEAD_WEBHOOK_SECRET set — ignoring (inert).");
    return new Response("ok (inert)", { status: 200 });
  }

  // Shared-secret check (header or ?secret= query param).
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-smartlead-secret") ?? url.searchParams.get("secret") ?? "";
  if (provided !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // From here on, always return 200 even on internal failure so Smartlead
  // doesn't retry forever (the resend-webhook convention).
  try {
    const kind = classify(raw);

    // Field-shape probe — Smartlead's payload differs per event type (replies
    // carry no lead/custom_fields and put the canonical lead in sl_lead_email).
    // Logging the top-level keys + the email-ish fields makes any future shape
    // drift diagnosable from the function logs. Bodies are omitted.
    const rr = raw as Record<string, unknown>;
    console.log("[smartlead-webhook] received", {
      kind,
      event: rr?.event_type ?? rr?.event ?? null,
      keys: raw && typeof raw === "object" ? Object.keys(rr) : typeof raw,
      sl_lead_email: rr?.sl_lead_email ?? null,
      to_email: rr?.to_email ?? null,
      from_email: rr?.from_email ?? null,
      campaign_id: rr?.campaign_id ?? null,
    });

    if (kind === "ignore") return new Response("ok (ignored)", { status: 200 });

    const extract = extractLead(raw, kind);
    let row = await resolveRow(extract.outreachId, extract.email);

    // Reply-resolution fallback (defense in depth). EMAIL_REPLY carries no
    // custom_fields, so it resolves purely by matching the LEAD address against
    // stored lead_email(s). If Smartlead's payload doesn't populate the field we
    // read as the lead (`sl_lead_email`), the primary lookup above misses. On a
    // reply, though, `from_email` IS the prospect — so retry against it. This is
    // SAFE because resolveRow only matches known-enrolled addresses (the stored
    // lead_email paths + the lead_emails array), never an arbitrary mailbox.
    if (
      !row &&
      kind === "reply" &&
      extract.fromEmail &&
      extract.fromEmail !== extract.email
    ) {
      row = await resolveRow(undefined, extract.fromEmail);
      if (row) {
        // Attribute/annotate off the address that actually matched.
        extract.email = extract.fromEmail;
      }
    }

    if (!row) {
      console.warn("[smartlead-webhook] could not map event to a row", {
        outreachId: extract.outreachId,
        email: extract.email,
        fromEmail: extract.fromEmail,
        campaignId: extract.campaignId,
        kind,
      });
      return new Response("ok (unmatched)", { status: 200 });
    }

    // Reply/bounce/unsubscribe events carry no custom_fields, so contact_id is
    // null even when a specific Named Contact (e.g. a decision maker on a
    // provider with no general email) is the one who replied. Attribute the
    // event to that contact by matching the enrolled lead address, so the
    // Emails-tab card + timeline show the real recipient, not the org.
    if (!extract.contactId && extract.email) {
      const named = await resolveContactByEmail(row.id, extract.email);
      if (named) {
        extract.contactId = named.contactId;
        extract.recipientKind = "named";
        if (named.role && !extract.role) extract.role = named.role;
      }
    }

    switch (kind) {
      case "sent":
        await handleSent(row, extract);
        break;
      case "reply":
        await handleReply(row, extract);
        break;
      case "bounce":
        await handleBounce(row, extract);
        break;
      case "unsubscribe":
        await handleUnsubscribe(row, extract);
        break;
      case "open":
      case "click":
        await handleEngagement(row, kind, extract);
        break;
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[smartlead-webhook] handler error:", err instanceof Error ? err.message : err);
    return new Response("ok (error logged)", { status: 200 });
  }
});

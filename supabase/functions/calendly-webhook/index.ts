// Calendly webhook receiver — Supabase Edge Function (Deno).
//
// Routes Calendly invitee lifecycle events into:
// 1. MedJobs CRM (student_outreach) — providers who book via outreach emails
// 2. Provider Growth (provider_growth_tracking) — claimed providers scheduling calls
//
// WHY an Edge Function (not a Vercel route): same WAF wall as the
// Smartlead webhook (Vercel Bot Protection 403s provider-origin POSTs).
// Same narrow G4 exception: writes via the service role directly,
// replicating mark_meeting_scheduled / flag_wants_meeting handlers
// inline (see app/api/admin/student-outreach/[id]/route.ts).
//
// ── ROUTING LOGIC ─────────────────────────────────────────────────────────
// Both MedJobs and Provider Growth use utm_content to carry tracking IDs.
// We try MedJobs first (student_outreach), then Provider Growth
// (provider_growth_tracking). First match wins.
//
// ── EVENT MAPPING (MedJobs) ───────────────────────────────────────────────
//   invitee.created
//     → match invitee.email → outreach row (case-insensitive against
//        research_data.general_contact.email,
//        research_data.decision_maker.email,
//        provider_business_profile.email)
//     → if matched: dispatch the mark_meeting_scheduled effect inline
//        (set replies_state=mid_cadence + insert note_added{reason:
//        meeting_in_flight} touchpoint + meeting_scheduled touchpoint
//        with the start_time)
//     → if unmatched: log + 200 no-op. Admin sees the booking natively
//        in Calendly's UI. (Unmatched tray deferred — would need a new
//        table; G3 discipline.)
//
//   invitee.canceled
//     → if matched AND there's a paired invitee.created within 60s for
//        the same outreach: treat as reschedule pending; emit
//        note_added{reason: calendly_reschedule_pending}. Pair logic is
//        admin-readable from timeline.
//     → otherwise: emit meeting_no_show touchpoint with reason=canceled,
//        keep replies_state as-is.
//
//   invitee.rescheduled
//     → Calendly emits canceled + created together for reschedules; we
//        treat the new created as the active meeting. The 60s pair window
//        in canceled handler emits the reschedule note.
//
// ── EVENT MAPPING (Provider Growth) ───────────────────────────────────────
//   invitee.created
//     → Check conversion status (ads_status/medjobs_status)
//     → If Converted (free_intro or in_pilot): move to 'upgrade_meeting' stage
//     → If not Converted: move to 'meeting_scheduled' stage
//     → Create meeting_scheduled touchpoint
//
//   invitee.canceled
//     → Create meeting_cancelled touchpoint
//     → Clear meeting fields but keep stage (admin decides next step)
//
// ── INERT until activated ────────────────────────────────────────────────
// No CALENDLY_WEBHOOK_SECRET set → every request is a logged no-op (200).
// Nothing happens until the secret is set AND Calendly is configured to
// POST here. Calendly's signature scheme is HMAC-SHA256 over
// `timestamp.body` with the shared signing key.
//
// Environment (auto-injected by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Environment (set via `supabase secrets set`): CALENDLY_WEBHOOK_SECRET

import { createClient } from "jsr:@supabase/supabase-js@2";

const webhookSecret = Deno.env.get("CALENDLY_WEBHOOK_SECRET") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Calendly emits these event names on the v2 webhook API.
type Kind = "created" | "canceled" | "rescheduled" | "ignore";

function classify(raw: unknown): Kind {
  const ev = String(
    (raw as { event?: unknown })?.event ?? "",
  ).toLowerCase();
  // Order matters: rescheduled is a discrete event in some Calendly API
  // versions; in others it appears as canceled+created in quick succession.
  // We accept either form.
  if (ev.includes("rescheduled")) return "rescheduled";
  if (ev.includes("created")) return "created";
  if (ev.includes("canceled") || ev.includes("cancelled")) return "canceled";
  return "ignore";
}

interface InviteeExtract {
  invitee_email: string | null;
  invitee_name: string | null;
  /** ISO timestamp of the scheduled meeting. Always set for created. */
  start_time: string | null;
  /** Calendly invitee URI — stable id for dedup + pairing. */
  invitee_uri: string | null;
  /** Calendly scheduled-event URI — stable id for the parent event. */
  event_uri: string | null;
  /** Event arrival time (for the canceled+created reschedule pairing). */
  event_at: string;
  /** tracking.utm_content — carries the outreach_id when the provider booked
   *  via a Calendly link from our emails (deterministic match). */
  utm_content: string | null;
}

function extractInvitee(raw: unknown): InviteeExtract {
  const r = raw as Record<string, unknown>;
  const payload = (r.payload ?? r) as Record<string, unknown>;
  const scheduledEvent = (payload.scheduled_event ?? {}) as Record<string, unknown>;

  const email =
    typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : null;
  const name =
    typeof payload.name === "string" ? (payload.name as string) : null;
  const startTime =
    typeof scheduledEvent.start_time === "string"
      ? (scheduledEvent.start_time as string)
      : null;
  const inviteeUri =
    typeof payload.uri === "string" ? (payload.uri as string) : null;
  const eventUri =
    typeof scheduledEvent.uri === "string"
      ? (scheduledEvent.uri as string)
      : null;
  const eventAtRaw =
    r.created_at ?? r.timestamp ?? new Date().toISOString();
  const eventAt = String(eventAtRaw);

  const tracking = (payload.tracking ?? {}) as Record<string, unknown>;
  const utmContent =
    typeof tracking.utm_content === "string" && tracking.utm_content.trim()
      ? tracking.utm_content.trim()
      : null;

  return {
    invitee_email: email,
    invitee_name: name,
    start_time: startTime,
    invitee_uri: inviteeUri,
    event_uri: eventUri,
    event_at: eventAt,
    utm_content: utmContent,
  };
}

/** Deterministic match: the Calendly link in our emails carries
 *  ?utm_content={{outreach_id}}, which Calendly returns in tracking. */
async function resolveRowByOutreachId(
  outreachId: string,
): Promise<ResolvedRow | null> {
  const { data } = await supabase
    .from("student_outreach")
    .select("id, status")
    .eq("id", outreachId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    status: data.status as string,
  };
}

interface ResolvedRow {
  id: string;
  status: string;
}

/** Match invitee email against the outreach population via the canonical
 *  email surfaces. Tries general_contact.email first (most reliable cold-
 *  outreach surface), then decision_maker.email, then provider_business_
 *  profile.email. Returns the first single match found; null when zero
 *  matches or ambiguous (>1 match in any layer). */
async function resolveRow(email: string | null): Promise<ResolvedRow | null> {
  if (!email) return null;
  const lc = email.toLowerCase();
  const excluded = ["not_interested", "no_response_closed", "do_not_contact"];

  // Layer 0: Smartlead lead email (cold + activation). This is the exact
  // surface the reply webhook resolves rows on, and it's proven to match the
  // +tagged prospect addresses. For cold rows it equals general_contact.email,
  // but keying off it first sidesteps any drift between the contact record and
  // the enrolled lead address.
  for (const path of [
    "research_data->smartlead->>lead_email",
    "research_data->smartlead_activation->>lead_email",
  ]) {
    const { data: d0 } = await supabase
      .from("student_outreach")
      .select("id, status")
      .ilike(path, lc)
      .not("status", "in", `(${excluded.map((s) => `"${s}"`).join(",")})`)
      .limit(2);
    const r0 = (d0 ?? []) as Array<ResolvedRow>;
    if (r0.length === 1) return r0[0];
    if (r0.length > 1) return null; // ambiguous
  }

  // Layer 1: general_contact.email (case-insensitive)
  let { data } = await supabase
    .from("student_outreach")
    .select("id, status")
    .ilike("research_data->general_contact->>email", lc)
    .not("status", "in", `(${excluded.map((s) => `"${s}"`).join(",")})`)
    .limit(2);
  let rows = (data ?? []) as Array<ResolvedRow>;
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) return null; // ambiguous

  // Layer 2: decision_maker.email (case-insensitive)
  ({ data } = await supabase
    .from("student_outreach")
    .select("id, status")
    .ilike("research_data->decision_maker->>email", lc)
    .not("status", "in", `(${excluded.map((s) => `"${s}"`).join(",")})`)
    .limit(2));
  rows = (data ?? []) as Array<ResolvedRow>;
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) return null;

  // Layer 3: linked business_profile.email (legacy).
  ({ data } = await supabase
    .from("student_outreach")
    .select("id, status, provider_business_profile_id")
    .not("status", "in", `(${excluded.map((s) => `"${s}"`).join(",")})`)
    .not("provider_business_profile_id", "is", null));
  const candidateBpIds = ((data ?? []) as Array<{
    id: string;
    status: string;
    provider_business_profile_id: string;
  }>).map((r) => r.provider_business_profile_id);
  if (candidateBpIds.length === 0) return null;
  const { data: bpRows } = await supabase
    .from("business_profiles")
    .select("id, email")
    .in("id", candidateBpIds);
  const matchingBpIds = ((bpRows ?? []) as Array<{ id: string; email: string | null }>)
    .filter((b) => (b.email ?? "").toLowerCase() === lc)
    .map((b) => b.id);
  if (matchingBpIds.length === 0) return null;
  const matchingRows = ((data ?? []) as Array<{
    id: string;
    status: string;
    provider_business_profile_id: string;
  }>).filter((r) => matchingBpIds.includes(r.provider_business_profile_id));
  if (matchingRows.length === 1) {
    return {
      id: matchingRows[0].id,
      status: matchingRows[0].status,
    };
  }
  return null;
}

/** Dedup: has this Calendly invitee URI been processed for this row already? */
async function alreadyProcessed(
  outreachId: string,
  inviteeUri: string | null,
): Promise<boolean> {
  if (!inviteeUri) return false;
  const { data } = await supabase
    .from("student_outreach_touchpoints")
    .select("id")
    .eq("outreach_id", outreachId)
    .in("touchpoint_type", ["meeting_scheduled", "meeting_no_show", "note_added"])
    .filter("payload->>calendly_invitee_uri", "eq", inviteeUri)
    .limit(1);
  return (data ?? []).length > 0;
}

async function insertTouchpoint(
  outreachId: string,
  type: "meeting_scheduled" | "meeting_no_show" | "note_added",
  payload: Record<string, unknown>,
  notes: string | null = null,
) {
  await supabase.from("student_outreach_touchpoints").insert({
    outreach_id: outreachId,
    contact_id: null,
    touchpoint_type: type,
    // The touchpoints CHECK constraint only allows
    // email/phone/ig_dm/contact_form/meeting/system — "calendly" is NOT valid
    // and silently fails the insert. These are meeting-channel events; the
    // Calendly origin is recorded in payload.source instead.
    channel: "meeting",
    outcome: null,
    notes,
    payload,
    created_by: null, // system / webhook origin
  });
}

async function handleCreated(row: ResolvedRow, extract: InviteeExtract) {
  if (await alreadyProcessed(row.id, extract.invitee_uri)) return;

  // Replicate the mark_meeting_scheduled effect inline (matches the
  // route.ts handler: emit meeting_scheduled touchpoint with meeting_at;
  // surface the meeting in the In-Basket Meetings tab via the existing
  // queue endpoint's meeting_state derivation).
  await insertTouchpoint(row.id, "meeting_scheduled", {
    source: "calendly",
    calendly_invitee_uri: extract.invitee_uri,
    calendly_event_uri: extract.event_uri,
    meeting_at: extract.start_time,
    invitee_email: extract.invitee_email,
    invitee_name: extract.invitee_name,
    occurred_at: extract.event_at,
  }, `Calendly booking · ${extract.invitee_name ?? extract.invitee_email ?? "invitee"}`);

  // A booked meeting supersedes the chase — cancel pending cadence tasks so
  // neither the cold cadence NOR the activation cadence (its calls are
  // outreach_followup_call tasks) keeps firing at a provider who just booked.
  // Mirrors handleMarkMeetingScheduled's supersedePending* calls in route.ts.
  await supabase
    .from("student_outreach_tasks")
    .update({ status: "superseded", completed_at: new Date().toISOString() })
    .eq("outreach_id", row.id)
    .eq("status", "pending")
    .in("task_type", ["outreach_email_send", "outreach_followup_call", "outreach_day_0"]);

  // Promote pre-engaged rows to engaged (mirrors mark_meeting_scheduled) and
  // reset viewed_at so the row resurfaces in admin's Meetings tab immediately.
  const patch: Record<string, unknown> = { viewed_at: null };
  if (["outreach_sent", "researched", "prospect", "no_response_closed"].includes(row.status)) {
    patch.status = "engaged";
    if (row.status === "no_response_closed") patch.reopen_at = null;
  }
  await supabase.from("student_outreach").update(patch).eq("id", row.id);
}

async function handleCanceled(row: ResolvedRow, extract: InviteeExtract) {
  if (await alreadyProcessed(row.id, extract.invitee_uri)) return;

  // Check for a paired invitee.created within the last 60s — if present,
  // this canceled event is the OLD half of a reschedule. Emit a note
  // ("Calendly reschedule pending") and let the upcoming/recently-arrived
  // created event set the new time.
  const sixtySecAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await supabase
    .from("student_outreach_touchpoints")
    .select("id, payload, created_at")
    .eq("outreach_id", row.id)
    .eq("touchpoint_type", "meeting_scheduled")
    .gte("created_at", sixtySecAgo)
    .order("created_at", { ascending: false })
    .limit(1);
  const pairedCreated = (recent ?? []).length > 0;

  if (pairedCreated) {
    await insertTouchpoint(row.id, "note_added", {
      source: "calendly",
      reason: "calendly_reschedule_pending",
      calendly_invitee_uri: extract.invitee_uri,
      calendly_event_uri: extract.event_uri,
      invitee_email: extract.invitee_email,
      occurred_at: extract.event_at,
    }, "Calendly reschedule in progress (old slot canceled).");
    return;
  }

  // Standalone cancellation. Emit meeting_no_show with reason=canceled so
  // the Meetings tab surfaces it under No-show / Reschedule.
  await insertTouchpoint(row.id, "meeting_no_show", {
    source: "calendly",
    reason: "canceled",
    calendly_invitee_uri: extract.invitee_uri,
    calendly_event_uri: extract.event_uri,
    invitee_email: extract.invitee_email,
    occurred_at: extract.event_at,
  }, "Calendly meeting canceled.");

  await supabase
    .from("student_outreach")
    .update({ viewed_at: null })
    .eq("id", row.id);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER GROWTH HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

interface ResolvedProviderGrowthRow {
  id: string;
  business_profile_id: string;
  pipeline_stage: string;
  ads_status: string;
  medjobs_status: string;
}

/** Check if utm_content matches a Provider Growth tracking ID. */
async function resolveProviderGrowthTracking(
  trackingId: string,
): Promise<ResolvedProviderGrowthRow | null> {
  const { data } = await supabase
    .from("provider_growth_tracking")
    .select("id, business_profile_id, pipeline_stage, ads_status, medjobs_status")
    .eq("id", trackingId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    business_profile_id: data.business_profile_id as string,
    pipeline_stage: data.pipeline_stage as string,
    ads_status: data.ads_status as string,
    medjobs_status: data.medjobs_status as string,
  };
}

/** Dedup: has this Calendly invitee URI been processed for this tracking already? */
async function alreadyProcessedProviderGrowth(
  trackingId: string,
  inviteeUri: string | null,
): Promise<boolean> {
  if (!inviteeUri) return false;
  const { data } = await supabase
    .from("provider_growth_touchpoints")
    .select("id")
    .eq("tracking_id", trackingId)
    .in("touchpoint_type", ["meeting_scheduled", "meeting_cancelled", "note_added"])
    .filter("details->>calendly_invitee_uri", "eq", inviteeUri)
    .limit(1);
  return (data ?? []).length > 0;
}

async function insertProviderGrowthTouchpoint(
  trackingId: string,
  businessProfileId: string,
  type: "meeting_scheduled" | "meeting_cancelled" | "note_added",
  details: Record<string, unknown>,
) {
  await supabase.from("provider_growth_touchpoints").insert({
    tracking_id: trackingId,
    business_profile_id: businessProfileId,
    touchpoint_type: type,
    details,
  });
}

async function handleProviderGrowthCreated(
  row: ResolvedProviderGrowthRow,
  extract: InviteeExtract,
) {
  if (await alreadyProcessedProviderGrowth(row.id, extract.invitee_uri)) return;

  const now = new Date().toISOString();

  // Determine the target stage based on conversion status:
  // - Converted providers (free trial) → upgrade_meeting
  // - Non-converted providers → meeting_scheduled
  const isConverted =
    row.ads_status === "free_intro" || row.medjobs_status === "in_pilot";
  const targetStage = isConverted ? "upgrade_meeting" : "meeting_scheduled";

  // Update tracking to the appropriate stage
  await supabase
    .from("provider_growth_tracking")
    .update({
      pipeline_stage: targetStage,
      pipeline_stage_changed_at: now,
      meeting_scheduled_at: extract.start_time,
      calendly_event_id: extract.event_uri?.split("/").pop() ?? null,
      last_activity_at: now,
      updated_at: now,
    })
    .eq("id", row.id);

  // Create touchpoint
  await insertProviderGrowthTouchpoint(row.id, row.business_profile_id, "meeting_scheduled", {
    source: "calendly",
    calendly_invitee_uri: extract.invitee_uri,
    calendly_event_uri: extract.event_uri,
    invitee_name: extract.invitee_name,
    invitee_email: extract.invitee_email,
    scheduled_at: extract.start_time,
    method: "calendly_webhook",
    target_stage: targetStage,
  });

  console.log(`[calendly-webhook] Provider Growth ${targetStage}:`, row.id, {
    isConverted,
    ads_status: row.ads_status,
    medjobs_status: row.medjobs_status,
  });
}

async function handleProviderGrowthCanceled(
  row: ResolvedProviderGrowthRow,
  extract: InviteeExtract,
) {
  if (await alreadyProcessedProviderGrowth(row.id, extract.invitee_uri)) return;

  const now = new Date().toISOString();

  // Create cancellation touchpoint
  await insertProviderGrowthTouchpoint(row.id, row.business_profile_id, "meeting_cancelled", {
    source: "calendly",
    calendly_invitee_uri: extract.invitee_uri,
    calendly_event_uri: extract.event_uri,
    invitee_name: extract.invitee_name,
    scheduled_at: extract.start_time,
    canceled_at: now,
  });

  // Clear meeting fields but keep stage (admin decides next step)
  await supabase
    .from("provider_growth_tracking")
    .update({
      meeting_scheduled_at: null,
      calendly_event_id: null,
      last_activity_at: now,
      updated_at: now,
    })
    .eq("id", row.id);

  console.log("[calendly-webhook] Provider Growth meeting canceled:", row.id);
}

/** Verify Calendly's HMAC-SHA256 signature. Signature scheme:
 *
 *   Header: Calendly-Webhook-Signature: t=<timestamp>,v1=<signature>
 *   signature = HMAC-SHA256(secret, timestamp + "." + rawBody)
 *
 * Returns true on valid signature + non-stale timestamp (<5min skew). */
async function verifyCalendlySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").reduce(
    (acc, p) => {
      const [k, v] = p.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    },
    {} as Record<string, string>,
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;

  // Replay protection: reject signatures older than 5 minutes.
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60_000) {
    return false;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${timestamp}.${rawBody}`),
  );
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison.
  if (computed.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Inert until configured.
  if (!webhookSecret) {
    console.log(
      "[calendly-webhook] no CALENDLY_WEBHOOK_SECRET set — ignoring (inert).",
    );
    return new Response("ok (inert)", { status: 200 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("calendly-webhook-signature");
  const valid = await verifyCalendlySignature(rawBody, sigHeader, webhookSecret);
  if (!valid) {
    // Fallback: allow ?secret=<value> query for manual testing (mirrors
    // the Smartlead webhook's optional shared-secret query path).
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret");
    if (querySecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Always 200 even on internal failure so Calendly doesn't retry
  // forever (mirrors the resend/smartlead-webhook convention).
  try {
    const kind = classify(raw);

    // Field-shape probe — surfaces exactly what Calendly sends so a non-match
    // is diagnosable from the logs (the Smartlead lesson). The two things that
    // decide a match are tracking.utm_content (the outreach_id baked into the
    // booking link) and the invitee email; log both plus the payload keys.
    const rr = raw as Record<string, unknown>;
    const rp = (rr.payload ?? {}) as Record<string, unknown>;
    const rt = (rp.tracking ?? {}) as Record<string, unknown>;
    console.log("[calendly-webhook] received", {
      kind,
      event: rr?.event ?? null,
      payload_keys: rp && typeof rp === "object" ? Object.keys(rp) : null,
      invitee_email: typeof rp.email === "string" ? rp.email : null,
      utm_content: rt?.utm_content ?? null,
      tracking_keys: rt && typeof rt === "object" ? Object.keys(rt) : null,
    });

    if (kind === "ignore") return new Response("ok (ignored)", { status: 200 });

    const extract = extractInvitee(raw);

    // ── ROUTING ───────────────────────────────────────────────────────────
    // If utm_content is provided, it's a deterministic booking link.
    // Try both ID lookups first (MedJobs, then Provider Growth).
    // Email fallback ONLY when no utm_content (organic/direct booking).

    if (extract.utm_content) {
      // Deterministic: booking link carried a tracking ID

      // 1a. Try MedJobs by ID
      const medjobsRow = await resolveRowByOutreachId(extract.utm_content);
      if (medjobsRow) {
        console.log("[calendly-webhook] matched MedJobs row by ID:", medjobsRow.id);
        switch (kind) {
          case "created":
          case "rescheduled":
            await handleCreated(medjobsRow, extract);
            break;
          case "canceled":
            await handleCanceled(medjobsRow, extract);
            break;
        }
        return new Response("ok (medjobs)", { status: 200 });
      }

      // 1b. Try Provider Growth by ID
      const providerGrowthRow = await resolveProviderGrowthTracking(extract.utm_content);
      if (providerGrowthRow) {
        console.log("[calendly-webhook] matched Provider Growth row by ID:", providerGrowthRow.id);
        switch (kind) {
          case "created":
          case "rescheduled":
            await handleProviderGrowthCreated(providerGrowthRow, extract);
            break;
          case "canceled":
            await handleProviderGrowthCanceled(providerGrowthRow, extract);
            break;
        }
        return new Response("ok (provider-growth)", { status: 200 });
      }

      // utm_content provided but didn't match either table
      console.warn("[calendly-webhook] utm_content didn't match any tracking ID", {
        utm_content: extract.utm_content,
        email: extract.invitee_email,
        kind,
      });
      return new Response("ok (unmatched-id)", { status: 200 });
    }

    // 2. No utm_content — try email fallback for MedJobs (organic booking)
    const medjobsRowByEmail = await resolveRow(extract.invitee_email);
    if (medjobsRowByEmail) {
      console.log("[calendly-webhook] matched MedJobs row by email:", medjobsRowByEmail.id);
      switch (kind) {
        case "created":
        case "rescheduled":
          await handleCreated(medjobsRowByEmail, extract);
          break;
        case "canceled":
          await handleCanceled(medjobsRowByEmail, extract);
          break;
      }
      return new Response("ok (medjobs-email)", { status: 200 });
    }

    // 3. No match found
    console.warn("[calendly-webhook] could not map event to any row", {
      utm_content: extract.utm_content,
      email: extract.invitee_email,
      kind,
    });
    return new Response("ok (unmatched)", { status: 200 });
  } catch (err) {
    console.error(
      "[calendly-webhook] handler error:",
      err instanceof Error ? err.message : err,
    );
    return new Response("ok (error logged)", { status: 200 });
  }
});

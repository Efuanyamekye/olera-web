/**
 * GET    /api/admin/staffing-outreach/[id]   — drawer detail
 * POST   /api/admin/staffing-outreach/[id]   — actions, dispatched on body.action
 *
 * Actions supported:
 *   claim                    hold the row for 60 min
 *   release                  drop the claim
 *   update_research          set research_data fields, optional notes
 *   mark_pre_call_complete   advance status queued→pre_call_outreach
 *   send_pre_call            fire pre-call email + log touchpoint
 *   send_follow_up           fire follow-up reminder email (after 5 business days)
 *   log_email_sent           log email touchpoint only (Gmail flow, no email send)
 *   log_contact_form         log a contact_form_submitted touchpoint
 *   disposition              log a call disposition + state transition
 *   add_contact_and_send     capture verified contact + fire Step 1 email
 *   revert_to_queued         move back to queued status (initial contact tab)
 *   reopen                   reopen a closed provider (DNC/wrong_number → calling)
 *   resend_enrollment_email  resend Step 1 email to an activated provider
 *
 * Mutations always insert a touchpoint and update outreach.updated_at.
 * Response shape mirrors the GET payload (refreshed DrawerContext) so
 * the client can re-render without a follow-up fetch.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import {
  preCallEmail,
  followUpReminderEmail,
  postConsentStep1Email,
  SENDER_OLERA_TEAM,
  SENDER_LOGAN,
} from "@/lib/staffing-outreach/email-templates";
import { buildStaffingPilotActivationUrl } from "@/lib/staffing-outreach/tokens";
import type {
  DrawerContext,
  ResearchData,
  StaffingOutreachRow,
  StaffingStatus,
  TouchpointType,
} from "@/lib/staffing-outreach/types";

const CLAIM_TTL_MIN = 60;
const DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=ParY1tGaiew";
const PILOT_AGREEMENT_URL = process.env.PILOT_AGREEMENT_PDF_URL ?? "";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

// ── GET: drawer context ──────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const ctx = await loadDrawerContext(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ctx);
}

// ── POST: actions ────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const action = body.action as string;

  const db = getServiceClient();
  const { data: outreach, error: fetchErr } = await db
    .from("staffing_outreach")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !outreach) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    switch (action) {
      case "claim":
        await handleClaim(id, user.id);
        break;
      case "release":
        await handleRelease(id, user.id);
        break;
      case "update_research":
        await handleUpdateResearch(outreach, body, user.id);
        break;
      case "mark_pre_call_complete":
        await handleMarkPreCallComplete(outreach, user.id);
        break;
      case "send_pre_call":
        await handleSendPreCall(outreach, body, user.id, admin);
        break;
      case "send_follow_up":
        await handleSendFollowUp(outreach, body, user.id, admin);
        break;
      case "log_email_sent":
        await handleLogEmailSent(outreach, body, user.id);
        break;
      case "log_contact_form":
        await handleLogContactForm(outreach, body, user.id);
        break;
      case "disposition":
        await handleDisposition(outreach, body, user.id);
        break;
      case "add_contact_and_send":
        await handleAddContactAndSend(outreach, body, user.id);
        break;
      case "revert_to_queued":
        await handleRevertToQueued(outreach, user.id);
        break;
      case "reopen":
        await handleReopen(outreach, user.id);
        break;
      case "resend_enrollment_email":
        await handleResendEnrollmentEmail(outreach, body, user.id);
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const refreshed = await loadDrawerContext(id);
  return NextResponse.json(refreshed);
}

// ── Loaders ──────────────────────────────────────────────────────────────

async function loadDrawerContext(outreachId: string): Promise<DrawerContext | null> {
  const db = getServiceClient();

  const { data: outreach } = await db
    .from("staffing_outreach")
    .select("*")
    .eq("id", outreachId)
    .single();
  if (!outreach) return null;

  const [{ data: batch }, { data: provider }, { data: contacts }, { data: touchpoints }] =
    await Promise.all([
      db.from("staffing_batches").select("*").eq("id", outreach.batch_id).single(),
      db
        .from("olera-providers")
        .select(
          "provider_id, provider_name, provider_category, phone, email, website, address, city, state, slug",
        )
        .eq("provider_id", outreach.provider_id)
        .single(),
      db
        .from("staffing_contacts")
        .select("*")
        .eq("outreach_id", outreachId)
        .order("created_at", { ascending: false }),
      db
        .from("staffing_touchpoints")
        .select("*")
        .eq("outreach_id", outreachId)
        .order("created_at", { ascending: false }),
    ]);

  if (!batch || !provider) return null;

  return {
    outreach,
    batch,
    provider,
    contacts: contacts ?? [],
    touchpoints: touchpoints ?? [],
  };
}

// ── Action handlers ──────────────────────────────────────────────────────

async function handleClaim(outreachId: string, userId: string) {
  const db = getServiceClient();
  const claimedUntil = new Date(Date.now() + CLAIM_TTL_MIN * 60_000).toISOString();
  await db
    .from("staffing_outreach")
    .update({ claimed_by: userId, claimed_until: claimedUntil, updated_at: new Date().toISOString() })
    .eq("id", outreachId);
}

async function handleRelease(outreachId: string, userId: string) {
  const db = getServiceClient();
  await db
    .from("staffing_outreach")
    .update({ claimed_by: null, claimed_until: null, updated_at: new Date().toISOString() })
    .eq("id", outreachId)
    .eq("claimed_by", userId);
}

async function handleUpdateResearch(
  outreach: StaffingOutreachRow,
  body: { research?: ResearchData; notes?: string },
  userId: string,
) {
  const db = getServiceClient();
  const merged = { ...outreach.research_data, ...(body.research ?? {}) };
  await db
    .from("staffing_outreach")
    .update({
      research_data: merged,
      notes: body.notes ?? outreach.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outreach.id);
  await insertTouchpoint(outreach.id, "research_completed", userId, body.notes ?? null, {
    fields_updated: Object.keys(body.research ?? {}),
  });
}

async function handleMarkPreCallComplete(outreach: StaffingOutreachRow, userId: string) {
  const db = getServiceClient();
  // Pre-call complete → ready to call immediately (no overnight wait per spec)
  await db
    .from("staffing_outreach")
    .update({
      status: "pre_call_outreach",
      next_action_due_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", outreach.id);
  await insertTouchpoint(outreach.id, "research_completed", userId, "Pre-call complete", {
    transition: "queued→pre_call_outreach",
  });
}

async function handleSendPreCall(
  outreach: StaffingOutreachRow,
  body: { recipientEmail?: string; adminFirstName?: string },
  userId: string,
  admin: { email: string },
) {
  const db = getServiceClient();
  const recipient = (body.recipientEmail ?? outreach.research_data.general_email ?? "").trim();
  if (!recipient) throw new Error("No recipient email — set research_data.general_email first");

  const [{ data: provider }, { data: batch }] = await Promise.all([
    db.from("olera-providers")
      .select("provider_name, provider_id")
      .eq("provider_id", outreach.provider_id)
      .single(),
    db.from("staffing_batches")
      .select("university_name")
      .eq("id", outreach.batch_id)
      .single(),
  ]);
  if (!provider) throw new Error("Provider not found");
  if (!batch) throw new Error("Batch not found");

  const adminFirstName =
    body.adminFirstName?.trim() ||
    admin.email?.split("@")[0] ||
    "Olera";

  const { subject, html } = preCallEmail({
    providerName: provider.provider_name,
    adminFirstName,
    universityName: batch.university_name,
    demoVideoUrl: DEMO_VIDEO_URL,
  });

  const send = await sendEmail({
    to: recipient,
    from: SENDER_OLERA_TEAM,
    subject,
    html,
    emailType: "staffing_pre_call",
    recipientType: "provider",
    providerId: provider.provider_id,
    metadata: { outreach_id: outreach.id, batch_id: outreach.batch_id },
  });

  await insertTouchpoint(outreach.id, "pre_call_email_sent", userId, null, {
    recipient,
    email_log_id: send.emailLogId,
    success: send.success,
    error: send.error,
  });
}

async function handleSendFollowUp(
  outreach: StaffingOutreachRow,
  body: { recipientEmail?: string; adminFirstName?: string },
  userId: string,
  admin: { email: string },
) {
  const db = getServiceClient();
  const recipient = (body.recipientEmail ?? outreach.research_data.general_email ?? "").trim();
  if (!recipient) throw new Error("No recipient email — set research_data.general_email first");

  const [{ data: provider }, { data: batch }] = await Promise.all([
    db.from("olera-providers")
      .select("provider_name, provider_id")
      .eq("provider_id", outreach.provider_id)
      .single(),
    db.from("staffing_batches")
      .select("university_name")
      .eq("id", outreach.batch_id)
      .single(),
  ]);
  if (!provider) throw new Error("Provider not found");
  if (!batch) throw new Error("Batch not found");

  const adminFirstName =
    body.adminFirstName?.trim() ||
    admin.email?.split("@")[0] ||
    "Olera";

  const { subject, html } = followUpReminderEmail({
    providerName: provider.provider_name,
    adminFirstName,
    universityName: batch.university_name,
  });

  const send = await sendEmail({
    to: recipient,
    from: SENDER_OLERA_TEAM,
    subject,
    html,
    emailType: "staffing_follow_up",
    recipientType: "provider",
    providerId: provider.provider_id,
    metadata: { outreach_id: outreach.id, batch_id: outreach.batch_id },
  });

  await insertTouchpoint(outreach.id, "follow_up_email_sent", userId, null, {
    recipient,
    email_log_id: send.emailLogId,
    success: send.success,
    error: send.error,
  });
}

async function handleLogContactForm(
  outreach: StaffingOutreachRow,
  body: { url?: string; notes?: string },
  userId: string,
) {
  await insertTouchpoint(outreach.id, "contact_form_submitted", userId, body.notes ?? null, {
    url: body.url ?? outreach.research_data.contact_form_url ?? null,
  });
}

/**
 * Log email sent touchpoint without actually sending an email.
 * Used for the "Open in Gmail" flow where the user sends via Gmail
 * and then marks it as sent in our system.
 *
 * When initial email is sent:
 * - Status changes from queued → pre_call_outreach (moves to Nurturing tab)
 * - Schedules follow-up in 5 days
 */
async function handleLogEmailSent(
  outreach: StaffingOutreachRow,
  body: { emailType: "initial" | "follow_up"; recipientEmail?: string },
  userId: string,
) {
  const db = getServiceClient();
  const recipient = body.recipientEmail?.trim() || outreach.research_data.general_email || "";

  const touchpointType: TouchpointType =
    body.emailType === "follow_up" ? "follow_up_email_sent" : "pre_call_email_sent";

  await insertTouchpoint(outreach.id, touchpointType, userId, null, {
    recipient,
    sent_via: "gmail",
  });

  if (body.emailType === "initial") {
    // Move from New → Nurturing tab and schedule follow-up (3 business days ≈ 5 calendar days)
    const nextDue = new Date(Date.now() + 5 * 86400_000).toISOString();
    await db
      .from("staffing_outreach")
      .update({
        status: "pre_call_outreach",
        next_action_due_at: nextDue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", outreach.id);
  } else {
    // Follow-up sent - schedule next action in 3 days
    const nextDue = new Date(Date.now() + 3 * 86400_000).toISOString();
    await db
      .from("staffing_outreach")
      .update({
        next_action_due_at: nextDue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", outreach.id);
  }
}

async function handleDisposition(
  outreach: StaffingOutreachRow,
  body: { type?: string; notes?: string },
  userId: string,
) {
  const type = body.type as TouchpointType;
  const validCallTypes: TouchpointType[] = [
    "call_no_answer",
    "call_voicemail",
    "call_wrong_number",
    "call_connected_no_consent",
    "call_not_interested",
    "manual_dnc",
  ];
  if (!validCallTypes.includes(type)) {
    throw new Error(`Invalid disposition type: ${type}`);
  }

  const transition = computeCallTransition(outreach, type);
  const db = getServiceClient();
  await db
    .from("staffing_outreach")
    .update({
      status: transition.status,
      next_action_due_at: transition.nextDueAt,
      attempts_count: outreach.attempts_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outreach.id);

  await insertTouchpoint(outreach.id, type, userId, body.notes ?? null, {
    transition: `${outreach.status}→${transition.status}`,
    attempts_after: outreach.attempts_count + 1,
  });
}

async function handleAddContactAndSend(
  outreach: StaffingOutreachRow,
  body: { name?: string; role?: string; email?: string; phone?: string; notes?: string },
  userId: string,
) {
  const name = body.name?.trim();
  const email = body.email?.trim();
  if (!name || !email) throw new Error("name and email are required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");

  const db = getServiceClient();

  const { data: provider } = await db
    .from("olera-providers")
    .select("provider_name, provider_id, city, state")
    .eq("provider_id", outreach.provider_id)
    .single();
  if (!provider) throw new Error("Provider not found");

  const { data: batch } = await db
    .from("staffing_batches")
    .select("university_name")
    .eq("id", outreach.batch_id)
    .single();
  if (!batch) throw new Error("Batch not found");

  // Insert verified contact
  const { data: contact, error: contactErr } = await db
    .from("staffing_contacts")
    .insert({
      outreach_id: outreach.id,
      provider_id: outreach.provider_id,
      name,
      role: body.role ?? null,
      email,
      phone: body.phone ?? null,
      consent_source: "call",
      consent_notes: body.notes ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (contactErr || !contact) throw new Error(contactErr?.message ?? "Contact insert failed");

  // Log the connected_consent call disposition
  await insertTouchpoint(outreach.id, "call_connected_consent", userId, body.notes ?? null, {
    contact_id: contact.id,
  });

  // Build activation magic link (the route handler ships in PR 4 — link is final)
  const activationUrl = buildStaffingPilotActivationUrl(
    { oid: outreach.id, cid: contact.id, pid: outreach.provider_id },
    BASE_URL,
  );

  const { subject, html } = postConsentStep1Email({
    contactFirstName: name.split(/\s+/)[0],
    providerName: provider.provider_name,
    universityName: batch.university_name,
    activationUrl,
    demoVideoUrl: DEMO_VIDEO_URL,
  });

  // Attach the pilot agreement PDF if uploaded; otherwise send without
  let attachments:
    | Array<{ filename: string; content: string; encoding?: string; type?: string }>
    | undefined;
  if (PILOT_AGREEMENT_URL) {
    try {
      const res = await fetch(PILOT_AGREEMENT_URL);
      if (res.ok) {
        const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
        attachments = [
          {
            filename: "olera-student-caregiver-pilot-agreement.pdf",
            content: base64,
            encoding: "base64",
            type: "application/pdf",
          },
        ];
      }
    } catch {
      // Fail open — send the email without the PDF rather than blocking
    }
  }

  const send = await sendEmail({
    to: email,
    from: SENDER_LOGAN,
    subject,
    html,
    emailType: "staffing_post_consent_step1",
    recipientType: "provider",
    providerId: provider.provider_id,
    metadata: {
      outreach_id: outreach.id,
      batch_id: outreach.batch_id,
      contact_id: contact.id,
      university: batch.university_name,
    },
    attachments,
  });

  await insertTouchpoint(outreach.id, "email_post_consent_step1_sent", userId, null, {
    recipient: email,
    contact_id: contact.id,
    email_log_id: send.emailLogId,
    activation_url: activationUrl,
    pdf_attached: Boolean(attachments),
    success: send.success,
    error: send.error,
  });

  // Status: consented; next call attempt in +3 days (confirmation call)
  const next = new Date(Date.now() + 3 * 86400_000).toISOString();
  await db
    .from("staffing_outreach")
    .update({
      status: "consented",
      next_action_due_at: next,
      attempts_count: outreach.attempts_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outreach.id);
}

/**
 * Revert a provider back to queued status (Initial Contact tab).
 * Used when initial email was sent by mistake.
 */
async function handleRevertToQueued(outreach: StaffingOutreachRow, userId: string) {
  const db = getServiceClient();

  // Log touchpoint for audit trail
  await insertTouchpoint(outreach.id, "status_reverted", userId, "User marked as sent by mistake", {
    from_status: outreach.status,
    to_status: "queued",
    reason: "Sent by mistake - moved back to Initial Contact",
  });

  // Revert status to queued (Initial Contact tab)
  await db
    .from("staffing_outreach")
    .update({
      status: "queued",
      next_action_due_at: new Date().toISOString(), // Due now so it's ready for action
      updated_at: new Date().toISOString(),
    })
    .eq("id", outreach.id);
}

/**
 * Reopen a closed provider (do_not_contact or wrong_number) back to nurturing.
 */
async function handleReopen(outreach: StaffingOutreachRow, userId: string) {
  const db = getServiceClient();

  // Only allow reopening closed statuses
  if (outreach.status !== "do_not_contact" && outreach.status !== "wrong_number") {
    throw new Error("Can only reopen providers that are closed (DNC or wrong number)");
  }

  // Log touchpoint for audit trail
  await insertTouchpoint(outreach.id, "status_reverted", userId, "Provider reopened for outreach", {
    from_status: outreach.status,
    to_status: "calling",
    reason: "Manually reopened by admin",
  });

  // Move back to calling status (nurturing tab)
  const nextDue = new Date(Date.now() + 1 * 86400_000).toISOString(); // Due tomorrow
  await db
    .from("staffing_outreach")
    .update({
      status: "calling",
      next_action_due_at: nextDue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outreach.id);
}

/**
 * Resend the enrollment email to a consented or activated provider.
 * Used when they haven't completed T&C acceptance yet.
 */
async function handleResendEnrollmentEmail(
  outreach: StaffingOutreachRow,
  body: { contactId?: string },
  userId: string,
) {
  const db = getServiceClient();

  // Only allow for consented or activated status (waiting for enrollment)
  if (outreach.status !== "consented" && outreach.status !== "activated") {
    throw new Error("Can only resend enrollment email to consented or activated providers");
  }

  // Get the contact to send to
  const contactId = body.contactId;
  if (!contactId) throw new Error("contactId is required");

  const { data: contact } = await db
    .from("staffing_contacts")
    .select("*")
    .eq("id", contactId)
    .eq("outreach_id", outreach.id)
    .single();
  if (!contact) throw new Error("Contact not found");

  // Get provider and batch info
  const [{ data: provider }, { data: batch }] = await Promise.all([
    db.from("olera-providers")
      .select("provider_name, provider_id, city, state")
      .eq("provider_id", outreach.provider_id)
      .single(),
    db.from("staffing_batches")
      .select("university_name")
      .eq("id", outreach.batch_id)
      .single(),
  ]);
  if (!provider) throw new Error("Provider not found");
  if (!batch) throw new Error("Batch not found");

  // Build activation magic link
  const activationUrl = buildStaffingPilotActivationUrl(
    { oid: outreach.id, cid: contact.id, pid: outreach.provider_id },
    BASE_URL,
  );

  const { subject, html } = postConsentStep1Email({
    contactFirstName: contact.name.split(/\s+/)[0],
    providerName: provider.provider_name,
    universityName: batch.university_name,
    activationUrl,
    demoVideoUrl: DEMO_VIDEO_URL,
  });

  // Attach the pilot agreement PDF if uploaded
  let attachments:
    | Array<{ filename: string; content: string; encoding?: string; type?: string }>
    | undefined;
  if (PILOT_AGREEMENT_URL) {
    try {
      const res = await fetch(PILOT_AGREEMENT_URL);
      if (res.ok) {
        const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
        attachments = [
          {
            filename: "olera-student-caregiver-pilot-agreement.pdf",
            content: base64,
            encoding: "base64",
            type: "application/pdf",
          },
        ];
      }
    } catch {
      // Fail open — send without PDF
    }
  }

  const send = await sendEmail({
    to: contact.email,
    from: SENDER_LOGAN,
    subject,
    html,
    emailType: "staffing_post_consent_step1",
    recipientType: "provider",
    providerId: provider.provider_id,
    metadata: {
      outreach_id: outreach.id,
      batch_id: outreach.batch_id,
      contact_id: contact.id,
      university: batch.university_name,
      is_resend: true,
    },
    attachments,
  });

  await insertTouchpoint(outreach.id, "email_post_consent_step1_sent", userId, "Resent enrollment email", {
    recipient: contact.email,
    contact_id: contact.id,
    email_log_id: send.emailLogId,
    activation_url: activationUrl,
    pdf_attached: Boolean(attachments),
    success: send.success,
    error: send.error,
    is_resend: true,
  });
}

// ── State machine ───────────────────────────────────────────────────────

const MAX_CALL_ATTEMPTS = 6;

function computeCallTransition(
  outreach: StaffingOutreachRow,
  type: TouchpointType,
): { status: StaffingStatus; nextDueAt: string | null } {
  const newAttempts = outreach.attempts_count + 1;

  if (type === "call_wrong_number") {
    return { status: "wrong_number", nextDueAt: null };
  }

  if (type === "call_not_interested" || type === "manual_dnc") {
    return { status: "do_not_contact", nextDueAt: null };
  }

  if (type === "call_connected_no_consent") {
    return {
      status: "connected_no_consent",
      nextDueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    };
  }

  // No answer / voicemail — follow up after 5 business days (~7 calendar days)
  if (newAttempts >= MAX_CALL_ATTEMPTS) {
    return { status: "do_not_contact", nextDueAt: null };
  }

  return {
    status: outreach.status === "queued" ? "pre_call_outreach" : outreach.status,
    nextDueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
  };
}

async function insertTouchpoint(
  outreachId: string,
  type: TouchpointType,
  createdBy: string | null,
  notes: string | null,
  payload: Record<string, unknown>,
) {
  const db = getServiceClient();
  await db.from("staffing_touchpoints").insert({
    outreach_id: outreachId,
    type,
    notes,
    payload,
    created_by: createdBy,
  });
}

import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { shouldSendNotification, isControllableNotification, getPrefKeyForEmailType } from "./notification-prefs";
import { isUndeliverable, verifyAndCache, effectiveStatus } from "./email-verification";
import { NUDGE_EMAIL_TYPES, NUDGE_WEEKLY_CAP, NUDGE_WINDOW_DAYS, isGovernedNudge, FAMILY_NUDGE_EMAIL_TYPES, FAMILY_NUDGE_WEEKLY_CAP, isGovernedFamilyNudge } from "./email-governance";
import { isEmailDoNotContact } from "./do-not-contact";

const FROM_ADDRESS = "Olera <noreply@olera.care>";

/**
 * Cold provider-directed mail that ring-fences to PROVIDER_NOTIFY_FROM when set.
 * These go to provider addresses sourced from the directory (often unverified /
 * scraped), which bounce far above Resend's 4% threshold and would otherwise
 * degrade olera.care's reputation — the same domain our families, students, and
 * auth mail depend on.
 *
 * When PROVIDER_NOTIFY_FROM is set, these send from that isolated domain instead
 * of the default olera.care address, ring-fencing provider-acquisition
 * reputation away from the crown jewel. Until the env var is set, behavior is
 * unchanged. An explicit `from` passed by the caller always wins.
 *
 * weekly_analytics_digest is NOT in this set, but the choice is now per-recipient,
 * not per-type. The digest goes to a mix of claimed/engaged providers (0% bounce,
 * brand-positive, keep on olera.care) and unclaimed directory addresses (the same
 * high-bounce pool as question_received). The cron passes an explicit
 * PROVIDER_NOTIFY_FROM `from` for the unclaimed slice only, so the cold half
 * ring-fences to the cousin domain while the warm half keeps the crown jewel.
 * Verification, separately, applies to the WHOLE digest (see VERIFY_ON_SEND_TYPES).
 */
const PROVIDER_NOTIFY_FROM_TYPES = new Set<string>([
  "ad_boost_profile_reminder",
  "ad_boost_lead_delivered",
  "ad_boost_campaign_launched",
  "ad_boost_traction",
  "ad_boost_promo_complete",
  "connection_request",
  "first_lead_celebration",
  "question_received",
  "provider_nudge",
  "profile_incomplete_nudge",
  "provider_incomplete_profile",
  "claim_notification",
  "provider_recommendation",
  "provider_reach_out",
  "new_review",
  "new_candidate_alert",
  // MedJobs provider-acquisition notifications (cold/mixed catchment audience):
  // a student requested an interview with an unclaimed provider, and the
  // catchment-wide "candidate ready" alert. Both reach scraped directory
  // addresses, so they ring-fence to the isolated domain like other cold mail.
  "medjobs_student_interest",
  "medjobs_candidate_ready",
]);

/**
 * Types that verify-on-send: on a cache miss they call ZeroBounce, cache the
 * verdict, and suppress confirmed-invalid before sending — the proactive lane
 * for mail to scraped / team-fetched directory addresses. Decoupled from the
 * domain override above because the two levers don't align 1:1: the weekly
 * digest needs verification across ALL its recipients (its cold variants bounce
 * 9-14% sending blind), but only ring-fences the unclaimed slice's domain.
 * Every other (transactional) type stays cache-only and never makes a network
 * call on the send path. All checks fail OPEN (verify error → not suppressed).
 */
// MedJobs email types are intentionally EXCLUDED from verify-on-send. Per the
// MedJobs flow decision (Task 3), email verification must never block or flag a
// medjobs send — admins decide reachability. ZeroBounce stays for every other
// cold/mixed type (provider nudges, digests). These types keep their domain
// ring-fencing (they're still in PROVIDER_NOTIFY_FROM_TYPES); only the
// suppression lever is removed for them.
const MEDJOBS_NO_VERIFY_TYPES = new Set<string>([
  "medjobs_student_interest",
  "medjobs_candidate_ready",
]);

const VERIFY_ON_SEND_TYPES = new Set<string>(
  [...PROVIDER_NOTIFY_FROM_TYPES, "weekly_analytics_digest"].filter(
    (t) => !MEDJOBS_NO_VERIFY_TYPES.has(t),
  ),
);

/**
 * Resolve the From address. Precedence: explicit caller value > cold provider-
 * notification override (PROVIDER_NOTIFY_FROM, when set) > default olera.care.
 */
export function resolveFromAddress(explicitFrom: string | undefined, emailType: string): string {
  if (explicitFrom) return explicitFrom;
  if (PROVIDER_NOTIFY_FROM_TYPES.has(emailType) && process.env.PROVIDER_NOTIFY_FROM) {
    return process.env.PROVIDER_NOTIFY_FROM;
  }
  return FROM_ADDRESS;
}

/**
 * Append email tracking query params to a URL path or full URL.
 * Used to tag links embedded in provider emails so clicks can be tracked.
 *
 * Example: appendTrackingParams("/provider/connections", "abc-123")
 *   → "/provider/connections?ref=email&eid=abc-123"
 */
export function appendTrackingParams(
  url: string,
  emailLogId: string | null | undefined
): string {
  if (!emailLogId) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}ref=email&eid=${emailLogId}`;
}

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  /** Email type for audit log (e.g. 'connection_request', 'welcome') */
  emailType?: string;
  /** Recipient type: 'provider', 'family', 'student', 'admin' */
  recipientType?: string;
  /** Associated provider ID if applicable */
  providerId?: string;
  /** Extra context for audit log (connection_id, question_id, etc.) */
  metadata?: Record<string, unknown>;
  /** Pre-reserved email_log ID (from reserveEmailLogId). If set, updates that row instead of creating a new one. */
  emailLogId?: string;
  /** File attachments (e.g. .ics calendar invites) */
  attachments?: Array<{ filename: string; content: string; encoding?: string; type?: string }>;
  /** Reply-To header. If provided, replies route here instead of the From address. */
  replyTo?: string;
  /** Recipient's profile ID for checking notification preferences. If provided, controllable notifications will respect user preferences. */
  recipientProfileId?: string;
  /** When set, adds a List-Unsubscribe header pointing at this URL (deliverability + inbox one-click affordance). Family lifecycle/nudge sends pass the care-unsubscribe URL. */
  listUnsubscribeUrl?: string;
}

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Email types that MUST always send, even to a previously-bounced address.
 * These are auth / verification / account-critical flows the recipient
 * actively triggered (and may have since fixed a typo'd or full mailbox).
 * Suppressing them risks locking a real user out — far worse than the
 * marginal reputation cost of one retry. Everything NOT in this set is
 * subject to the bounce/complaint suppression check below.
 */
const SUPPRESSION_EXEMPT_TYPES = new Set<string>([
  "verify_email",
  "verification_otp",
  "verification_code",
  "verification_approved",
  "verification_decision",
  "verification_rejected",
  "verification_pending_review",
  "student_activation",
  "student_account_created",
]);

// Resend AUP deliverability thresholds live in a dependency-free module so client
// components (e.g. the admin cockpit) can import them too. Re-exported here for
// callers already reaching into lib/email.
export {
  RESEND_COMPLAINT_LIMIT,
  RESEND_COMPLAINT_WARN,
  RESEND_BOUNCE_LIMIT,
  RESEND_BOUNCE_WARN,
} from "./email-thresholds";

/**
 * Returns true if we've previously recorded a hard bounce or spam complaint
 * for this exact recipient. Used to suppress non-critical sends so we stop
 * re-mailing dead/hostile addresses — every repeat bounce/complaint counts
 * against Resend's <4% bounce and <0.08% complaint thresholds, beyond which
 * the account can be suspended without warning.
 *
 * Fails OPEN: any error returns false (send proceeds), so a transient DB
 * issue can never silently block email.
 */
export async function isSuppressedRecipient(email: string): Promise<boolean> {
  try {
    const db = getServiceDb();
    if (!db) return false;
    const { data } = await db
      .from("email_log")
      .select("id")
      .eq("recipient", email)
      .or("bounced_at.not.is.null,complained_at.not.is.null")
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error("[email] Suppression check failed (sending anyway):", err);
    return false;
  }
}

/**
 * Returns true if an address is on the human-trust allowlist (email_overrides).
 * Such an address is "send anyway": it bypasses BOTH suppression signals — the
 * reactive bounce/complaint check above AND the proactive verification verdict
 * (isUndeliverable / verifyAndCache). Added when a human has higher-quality
 * evidence the inbox is real (QA phoned the provider, pulled it off their
 * official website, or it's a claimed account's confirmed inbox) than the
 * automated checker, which has been over-aggressively blocking valid mail.
 *
 * Fails OPEN inverted: any error returns false (NOT trusted → normal gating
 * applies), so a transient DB issue can't accidentally punch mail through.
 */
export async function isTrustedRecipient(email: string): Promise<boolean> {
  try {
    const db = getServiceDb();
    if (!db) return false;
    const { data } = await db
      .from("email_overrides")
      .select("email")
      .eq("email", email.trim().toLowerCase())
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error("[email] Trust check failed (not trusting):", err);
    return false;
  }
}

/**
 * Add an address to the human-trust allowlist so future sends bypass
 * suppression. Best-effort; never throws. Returns true on a confirmed write.
 */
export async function markEmailTrusted(
  email: string,
  opts: { reason?: "phone_verified" | "official_website" | "claimed_account" | "admin"; note?: string; createdBy?: string } = {}
): Promise<boolean> {
  try {
    const db = getServiceDb();
    if (!db) return false;
    const { error } = await db.from("email_overrides").upsert(
      {
        email: email.trim().toLowerCase(),
        reason: opts.reason ?? "admin",
        note: opts.note ?? null,
        created_by: opts.createdBy ?? null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );
    return !error;
  } catch (err) {
    console.error("[email] Failed to mark email trusted:", err);
    return false;
  }
}

/**
 * Pre-create an email_log row before sending. Returns the row ID
 * so callers can embed it in tracking links (e.g. ?eid={id}).
 * Returns null if logging fails — callers should still send the email.
 */
async function preLogEmail(params: {
  recipient: string;
  sender: string;
  subject: string;
  emailType: string;
  recipientType?: string;
  providerId?: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const db = getServiceDb();
    if (!db) return null;

    const { data } = await db
      .from("email_log")
      .insert({
        recipient: params.recipient,
        sender: params.sender,
        subject: params.subject,
        email_type: params.emailType,
        recipient_type: params.recipientType ?? null,
        provider_id: params.providerId ?? null,
        status: "pending",
        metadata: params.metadata ?? {},
      })
      .select("id")
      .single();

    return data?.id ?? null;
  } catch (err) {
    console.error("[email] Failed to pre-log email:", err);
    return null;
  }
}

/**
 * Update an existing email_log row after send attempt.
 * Fire-and-forget — never blocks or throws.
 */
async function updateEmailLog(
  logId: string,
  params: {
    resendId?: string;
    status: "sent" | "failed";
    errorMessage?: string;
    htmlBody?: string;
  }
) {
  try {
    const db = getServiceDb();
    if (!db) return;

    await db
      .from("email_log")
      .update({
        resend_id: params.resendId ?? null,
        status: params.status,
        error_message: params.errorMessage ?? null,
        html_body: params.htmlBody ?? null,
      })
      .eq("id", logId);
  } catch (err) {
    console.error("[email] Failed to update email log:", err);
  }
}

/**
 * Reserve an email_log ID before generating the email HTML.
 * Use this when you need the log ID for tracking links embedded
 * in the email body itself.
 *
 * Call flow: reserveEmailLogId() → build HTML with eid → sendEmail({ emailLogId })
 */
export async function reserveEmailLogId(options: {
  to: string | string[];
  subject: string;
  emailType?: string;
  recipientType?: string;
  providerId?: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const recipient = Array.isArray(options.to)
    ? options.to.join(", ")
    : options.to;

  return preLogEmail({
    recipient,
    // Log the address the send will actually use, so analytics-by-sender stays
    // accurate when provider notifications are routed off olera.care.
    sender: resolveFromAddress(undefined, options.emailType ?? "unknown"),
    subject: options.subject,
    emailType: options.emailType ?? "unknown",
    recipientType: options.recipientType,
    providerId: options.providerId,
    metadata: options.metadata,
  });
}

/**
 * Send an email via Resend. Fire-and-forget safe — logs errors
 * but never throws so callers can wrap in try/catch without
 * breaking their main flow.
 *
 * If `emailLogId` is provided (from reserveEmailLogId), updates
 * that row instead of creating a new one.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; error?: string; emailLogId?: string; skipped?: boolean; skipReason?: string }> {
  const resend = getResend();
  if (!resend) {
    console.error("[email] RESEND_API_KEY not configured");
    return { success: false, error: "Email service not configured" };
  }

  const {
    to,
    subject,
    html,
    from: explicitFrom,
    emailType = "unknown",
    recipientType,
    providerId,
    metadata,
    emailLogId: existingLogId,
    recipientProfileId,
  } = options;

  // Resolve sender: explicit caller value wins; otherwise provider-directed
  // notifications route to the isolated PROVIDER_NOTIFY_FROM domain when set.
  const from = resolveFromAddress(explicitFrom, emailType);

  // Check notification preferences for controllable (activity-based) notifications
  // Marketing and transactional emails bypass this check and always send
  if (recipientProfileId && emailType && isControllableNotification(emailType, recipientType)) {
    const prefKey = getPrefKeyForEmailType(emailType, recipientType);
    if (prefKey) {
      const shouldSend = await shouldSendNotification(recipientProfileId, prefKey, "email");
      if (!shouldSend) {
        console.log(`[email] Skipped ${emailType} to ${Array.isArray(to) ? to.join(", ") : to} - user preference disabled`);
        // Update pre-reserved log entry if exists
        // Using status "failed" with explanatory message since schema only supports sent/failed
        // This prevents the log from staying "pending" forever
        if (existingLogId) {
          updateEmailLog(existingLogId, { status: "failed", errorMessage: "Skipped: user notification preference disabled" });
        }
        return { success: true, skipped: true, skipReason: "preference_disabled", emailLogId: existingLogId ?? undefined };
      }
    }
  }

  const recipient = Array.isArray(to) ? to.join(", ") : to;

  // Suppress non-critical sends to addresses we know we shouldn't hit, for two
  // reasons: a prior hard bounce / spam complaint (reactive — reads email_log),
  // or a cached verification verdict of 'invalid' (proactive — reads
  // email_verifications, populated by scripts/verify-emails.js). Both protect
  // domain reputation against Resend's <4% bounce / <0.08% complaint suspension
  // thresholds. Auth/verification mail (SUPPRESSION_EXEMPT_TYPES) bypasses this.
  // Addresses on the human-trust allowlist (email_overrides) also bypass it: a
  // human confirmed the inbox is real, which supersedes a stale bounce or a
  // predictive verification guess. Multi-recipient sends are skipped here since
  // one bad address shouldn't drop mail to the others. All checks fail open.
  const soleRecipient = Array.isArray(to)
    ? to.length === 1
      ? to[0]
      : null
    : to;
  if (soleRecipient && emailType && !SUPPRESSION_EXEMPT_TYPES.has(emailType)) {
    // Cold lane = mail to scraped / unclaimed directory addresses (the high-bounce
    // pool). Two signals: a cold provider-notification type, OR a send whose From
    // resolved to the isolated PROVIDER_NOTIFY_FROM domain — the weekly digest's
    // unclaimed slice passes that From explicitly, while its CLAIMED slice keeps
    // olera.care, so this correctly excludes the warm half of the digest. Used
    // below to suppress catch-all only where the reach loss is acceptable.
    const isColdLane =
      PROVIDER_NOTIFY_FROM_TYPES.has(emailType) ||
      (!!process.env.PROVIDER_NOTIFY_FROM && from === process.env.PROVIDER_NOTIFY_FROM);
    let suppressReason: string | null = null;
    // Do-Not-Contact kill switch (admin-managed, cross-channel HARD suppression).
    // Checked FIRST and NOT overridable by the email_overrides trust allowlist
    // below — a recipient who demanded "remove me from everything" outranks any
    // send-anyway signal. Auth/verification mail is already excluded by the
    // SUPPRESSION_EXEMPT_TYPES guard on this whole block. Fails open.
    if (await isEmailDoNotContact(soleRecipient)) {
      console.log(`[email] Suppressed ${emailType} to ${soleRecipient} — on do-not-contact list`);
      if (existingLogId) {
        updateEmailLog(existingLogId, { status: "failed", errorMessage: "Suppressed: do-not-contact list" });
      }
      return { success: true, skipped: true, skipReason: "do_not_contact", emailLogId: existingLogId ?? undefined };
    }
    if (await isSuppressedRecipient(soleRecipient)) {
      suppressReason = "prior bounce/complaint on record";
    } else if (VERIFY_ON_SEND_TYPES.has(emailType)) {
      // Cold provider-directed mail (the high-bounce lane sent to scraped /
      // team-fetched directory addresses) verifies ON THE SPOT: verifyAndCache
      // returns a fresh cached verdict, or on a miss/stale calls ZeroBounce,
      // caches it, and returns it. This closes the gap where a freshly-added
      // address would send blind on its first auto-notification and bounce.
      // Fails OPEN: a verification error → 'unknown' → not suppressed → still sent.
      const verdict = await verifyAndCache(soleRecipient);
      // Reclassify ZeroBounce's over-aggressive role-address flag: a deliverable
      // role inbox (info@, admissions@) reported as 'do_not_mail'/invalid becomes
      // sendable, while role-at-catch-all becomes 'risky' (still cold-suppressed).
      // EXCEPTION: the bulk weekly digest keeps the raw verdict so it doesn't
      // expand its cohort onto olera.care before the cold-lane split
      // (PROVIDER_NOTIFY_FROM) is live — the loosening guardrail in
      // plans/email-hygiene-rework-plan.md. All other cold types (question_received,
      // connection_request, provider_reach_out…) get the corrected verdict.
      const status =
        emailType === "weekly_analytics_digest"
          ? verdict.status
          : effectiveStatus(verdict.status, verdict.subStatus);
      if (status === "invalid") {
        suppressReason = "verified undeliverable";
      } else if (status === "risky" && isColdLane) {
        // Catch-all domains accept everything at the door, so the specific inbox
        // can't be confirmed and they bounce ~15% — too hot for the cold lane.
        // Suppress here, but keep sending on the warm lane (digest's claimed
        // slice), where a catch-all is more likely a real small-provider inbox.
        suppressReason = "catch-all (risky) on cold lane";
      }
    } else if (await isUndeliverable(soleRecipient)) {
      // Every other (transactional) type stays cache-only (isUndeliverable) so the
      // transactional path never makes a network call. Also fails OPEN.
      suppressReason = "verified undeliverable";
    }
    // A human-trusted address (email_overrides) supersedes ANY suppression
    // signal above — a person confirmed the inbox is real, which beats a stale
    // bounce or a predictive verdict. Only pay for this lookup when we'd
    // otherwise drop the send (rare), never on the hot path of every send.
    if (suppressReason && (await isTrustedRecipient(soleRecipient))) {
      console.log(`[email] Trusted override — sending ${emailType} to ${soleRecipient} despite: ${suppressReason}`);
      suppressReason = null;
    }
    if (suppressReason) {
      console.log(`[email] Suppressed ${emailType} to ${soleRecipient} — ${suppressReason}`);
      if (existingLogId) {
        updateEmailLog(existingLogId, {
          status: "failed",
          errorMessage: `Suppressed: ${suppressReason}`,
        });
      }
      return { success: true, skipped: true, skipReason: "suppressed", emailLogId: existingLogId ?? undefined };
    }
  }

  // Provider-comms frequency gate: cap PROACTIVE NUDGES (digest / reminders / re-engagement) per
  // provider over a rolling window, so the ~27 independent provider-email senders can't collectively
  // over-mail one provider (reputation risk). Transactional / real-time mail isn't a governed nudge,
  // so it's never gated here. Counts only status='sent' nudge rows — reserved rows are 'pending' (so
  // the in-flight send's own row can't self-count) and suppressed sends are 'failed'. Fails OPEN on
  // any query error (a missed cap is far better than wrongly dropping a provider's mail). The cap is
  // keyed on providerId, which every nudge sender now stamps in the canonical slug space. See
  // lib/email-governance.ts + plans/provider-comms-gate.md.
  if (recipientType === "provider" && providerId && isGovernedNudge(emailType)) {
    const db = getServiceDb();
    if (db) {
      const windowStart = new Date(Date.now() - NUDGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { count, error: capErr } = await db
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("status", "sent")
        .in("email_type", [...NUDGE_EMAIL_TYPES])
        .gte("created_at", windowStart);
      if (!capErr && typeof count === "number" && count >= NUDGE_WEEKLY_CAP) {
        console.log(
          `[email] Nudge cap reached for provider ${providerId} (${count} in ${NUDGE_WINDOW_DAYS}d) — skipping ${emailType}`,
        );
        if (existingLogId) {
          updateEmailLog(existingLogId, { status: "failed", errorMessage: "nudge_cap" });
        }
        return { success: true, skipped: true, skipReason: "nudge_cap", emailLogId: existingLogId ?? undefined };
      }
    }
  }

  // Family-comms frequency gate: the family-side mirror of the provider gate above. The 7 family
  // crons (outcome-check, provider-silent, never-engaged, day-10-awaiting, family-nudges,
  // matches-family-nudge, lead-family-nudge) had no global coordination — same firehose risk.
  // Families have no stable providerId, so the cap is keyed on the recipient email + recipient_type.
  // Transactional/real-time family mail isn't a governed family nudge, so it's never gated here.
  // Counts only status='sent' family-nudge rows in the rolling window. Fails OPEN on any query
  // error. See lib/email-governance.ts + plans/family-comms-system.md.
  if (recipientType === "family" && recipient && isGovernedFamilyNudge(emailType)) {
    const db = getServiceDb();
    if (db) {
      const windowStart = new Date(Date.now() - NUDGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { count, error: capErr } = await db
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("recipient", recipient)
        .eq("recipient_type", "family")
        .eq("status", "sent")
        .in("email_type", [...FAMILY_NUDGE_EMAIL_TYPES])
        .gte("created_at", windowStart);
      if (!capErr && typeof count === "number" && count >= FAMILY_NUDGE_WEEKLY_CAP) {
        console.log(
          `[email] Family nudge cap reached for ${recipient} (${count} in ${NUDGE_WINDOW_DAYS}d) — skipping ${emailType}`,
        );
        if (existingLogId) {
          updateEmailLog(existingLogId, { status: "failed", errorMessage: "family_nudge_cap" });
        }
        return { success: true, skipped: true, skipReason: "family_nudge_cap", emailLogId: existingLogId ?? undefined };
      }
    }
  }

  // If no pre-reserved log ID, create one now
  const logId =
    existingLogId ??
    (await preLogEmail({
      recipient,
      sender: from,
      subject,
      emailType,
      recipientType,
      providerId,
      metadata,
    }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendPayload: any = { from, to, subject, html };
  if (options.attachments?.length) {
    sendPayload.attachments = options.attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, (a.encoding as BufferEncoding) || "utf-8"),
      contentType: a.type,
    }));
  }
  // Reply-To: explicit caller value wins. Otherwise, if this send was routed to
  // the provider-notification domain, point replies at PROVIDER_NOTIFY_REPLY_TO
  // (when set) so they don't land on an unmonitored mailbox on the new domain.
  const replyTo =
    options.replyTo ??
    (from === process.env.PROVIDER_NOTIFY_FROM
      ? process.env.PROVIDER_NOTIFY_REPLY_TO
      : undefined);
  if (replyTo) {
    sendPayload.replyTo = replyTo;
  }
  // List-Unsubscribe: points at the care-seeker unsubscribe page, which auto-POSTs
  // the opt-out on mount (effectively one-click for a human, scanner-safe since a
  // plain GET runs no JS). Improves deliverability and gives Gmail/Apple Mail the
  // native unsubscribe affordance. We intentionally omit List-Unsubscribe-Post
  // (RFC 8058 one-click) until the endpoint accepts that POST shape.
  if (options.listUnsubscribeUrl) {
    sendPayload.headers = {
      ...(sendPayload.headers || {}),
      "List-Unsubscribe": `<${options.listUnsubscribeUrl}>`,
    };
  }
  const { data, error } = await resend.emails.send(sendPayload);

  // Update the log row with send result
  if (logId) {
    updateEmailLog(logId, {
      resendId: data?.id,
      status: error ? "failed" : "sent",
      errorMessage: error?.message,
      htmlBody: html,
    });
  }

  if (error) {
    console.error("[email] Send failed:", error);
    return { success: false, error: error.message, emailLogId: logId ?? undefined };
  }

  return { success: true, emailLogId: logId ?? undefined };
}

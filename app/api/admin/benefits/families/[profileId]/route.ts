import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  readBenefitsCascade,
  readBenefitsCase,
  type BenefitsCaseMeta,
} from "@/lib/family-comms/benefits-cascade.server";
import {
  readBenefitsNavigator,
  renderNavigatorEmail,
} from "@/lib/family-comms/benefits-navigator.server";
import {
  withHoldCleared,
  holdNeedsExplicitResume,
  readBenefitsHold,
  type BenefitsHelpCase,
} from "@/lib/family-comms/benefits-automation";
import { sendEmail } from "@/lib/email";
import { careUnsubscribeUrl } from "@/lib/email-templates";
import { getSiteUrl } from "@/lib/site-url";
import { pipelineDrafts } from "@/data/pipeline-drafts";
import { getStateAbbrev } from "@/lib/program-data";

/** Attach the live pipeline `lastVerifiedDate` to a navigator's pick snapshot.
 *  Read-only enrichment: the stored snapshot is left untouched, so nothing the
 *  letter promised can shift underneath it. */
function withLiveVerifiedDate<T extends { pick?: { programId?: string; stateId?: string | null } | null }>(
  navigator: T,
): T {
  const pick = navigator?.pick;
  if (!pick?.programId || !pick.stateId) return navigator;
  const abbrev = getStateAbbrev(pick.stateId);
  const program = pipelineDrafts[abbrev]?.programs?.find((p) => p.id === pick.programId);
  if (!program) return navigator;
  return {
    ...navigator,
    pick: { ...pick, lastVerifiedDate: program.lastVerifiedDate ?? null },
  };
}
import { sendNavigatorLetter } from "@/lib/family-comms/benefits-navigator-send.server";
import { recomposeNavigatorLetter } from "@/lib/family-comms/benefits-navigator-autopilot.server";
import { buildNavigatorPacket } from "@/lib/benefits/navigator-packet.server";

/**
 * Per-family case endpoints for the Benefits caseload view
 * (plans/benefits-case-management.md).
 *
 * GET  → the case timeline: every touch in chronological order, assembled
 *        from data that already exists (seeker_activity, email_log, the
 *        benefits_cascade stamps, results-page views, case actions). The
 *        story of one family, and where it stopped.
 * POST → case actions: { action: "note", text } | { action: "contacted" } |
 *        { action: "resolved" } | { action: "reopen" }. Stored on
 *        metadata.benefits_case so casework leaves a record Cess can inherit.
 */

interface TimelineEvent {
  at: string;
  kind: string;
  label: string;
  detail?: string;
}

const BENEFITS_REPLY_LABELS: Record<string, string> = {
  CALLED: "Reported: called the program",
  NOANSWER: "Reported: no answer",
  NEEDDOCS: "Reported: needs documents",
  APPLIED: "Reported: application submitted",
  WAITING: "Reported: waiting on the agency",
  NOTELIGIBLE: "Reported: program was not eligible",
  APPROVED: "Reported: approved",
  STUCK: "Asked Olera for help",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { profileId } = await params;
    const db = getServiceClient();

    const { data: profile } = await db
      .from("business_profiles")
      .select("id, email, metadata")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const meta = (profile.metadata as Record<string, unknown>) || {};
    const cascade = readBenefitsCascade(meta);
    const caseMeta = readBenefitsCase(meta);
    const events: TimelineEvent[] = [];
    const push = (at: string | null | undefined, kind: string, label: string, detail?: string) => {
      if (at) events.push({ at, kind, label, detail });
    };

    // Activity events
    const { data: acts } = await db
      .from("seeker_activity")
      .select("event_type, created_at, metadata")
      .eq("profile_id", profileId)
      .in("event_type", ["benefits_completed", "profile_enriched", "benefits_outcome_reported"])
      .order("created_at");
    for (const a of acts ?? []) {
      const m = (a.metadata as Record<string, unknown>) || {};
      if (a.event_type === "benefits_completed") {
        push(a.created_at, "intake", "Completed benefits intake", `${m.match_count ?? "?"} programs matched · ${m.entry_source || "direct"}`);
      } else if (a.event_type === "profile_enriched") {
        const FIELD_LABELS: Record<string, string> = {
          relationship: "relationship",
          timeline: "timeline",
          payment_method: "payment",
          payment_unsure: "unsure how to pay",
          phone: "phone",
          age: "age",
          medicaid_status: "Medicaid",
          income_range: "income",
        };
        const fields = Array.isArray(m.enriched_fields)
          ? (m.enriched_fields as string[]).map((f) => FIELD_LABELS[f] || f).join(", ")
          : "";
        push(a.created_at, "enriched", "Answered follow-up questions", fields + (m.sms_sent ? " · results texted" : ""));
      } else {
        push(a.created_at, "outcome", `Check-in answer: ${String(m.value || "?").replace(/_/g, " ")}`);
      }
    }

    // Cascade emails + engagement
    if (profile.email) {
      const { data: logs } = await db
        .from("email_log")
        .select("email_type, created_at, first_opened_at, first_clicked_at, status")
        .eq("recipient", profile.email)
        .in("email_type", ["benefits_results_saved", "benefits_first_step", "benefits_check_in"])
        .order("created_at");
      const LABELS: Record<string, string> = {
        benefits_results_saved: "Results email",
        benefits_first_step: "First-step email",
        benefits_check_in: "Progress-check email",
      };
      for (const l of logs ?? []) {
        push(l.created_at, "email", `${LABELS[l.email_type] || l.email_type} sent`);
        push(l.first_opened_at, "email_open", `${LABELS[l.email_type] || l.email_type} opened`);
        push(l.first_clicked_at, "email_click", `${LABELS[l.email_type] || l.email_type} clicked`);
      }
    }

    // Cascade stamps (SMS mirrors + journey acts)
    push(cascade.first_step_sms_at, "sms", "First-step text sent");
    push(
      cascade.first_step_sms_queued_for,
      "sms",
      "First-step text queued for the morning (quiet hours)",
    );
    push(cascade.check_sms_at, "sms", "Check-in text sent");
    push(
      cascade.check_sms_queued_for,
      "sms",
      "Check-in text queued for the morning (quiet hours)",
    );

    // Outbound texts from the send ledger (TJ QA 2026-07-29: the instant
    // results text was invisible here — only a suffix on the enriched row).
    // SMS ledger rows carry provider_id = the family profile, so this catches
    // texts the metadata stamps don't cover. Mirror types are skipped (their
    // stamps above already render them); rows predating the ledger (before
    // 2026-07-29) never got logged, so old families won't show these.
    {
      const { data: smsLogs } = await db
        .from("email_log")
        .select("email_type, created_at, status")
        .eq("channel", "sms")
        .eq("provider_id", profileId)
        .eq("status", "sent")
        .order("created_at");
      for (const l of smsLogs ?? []) {
        if (l.email_type === "benefits_results_sms") {
          push(l.created_at, "sms", "Results link texted");
        } else if (
          // Mirror types are skipped only when their metadata stamp already
          // renders them — a quiet-hours-queued companion text delivers via
          // sms-queue-flush with no first_step_sms_at stamp, and must not
          // vanish from the timeline.
          (l.email_type === "benefits_first_step_sms" && cascade.first_step_sms_at) ||
          (l.email_type === "benefits_check_in_sms" && cascade.check_sms_at)
        ) {
          // stamped mirrors — already rendered above
        } else {
          push(l.created_at, "sms", `Text sent (${l.email_type})`);
        }
      }
    }

    // Inbound texts (webhook persists every reply — metadata.sms_inbound)
    const inbound = Array.isArray(meta.sms_inbound)
      ? (meta.sms_inbound as { at?: string; body?: string; keyword?: string | null }[])
      : [];
    for (const m of inbound) {
      const keyword = m.keyword?.toUpperCase() ?? null;
      push(
        m.at,
        "sms_in",
        keyword ? BENEFITS_REPLY_LABELS[keyword] ?? `Texted ${keyword}` : "Texted us back",
        keyword ? undefined : m.body,
      );
    }
    push(
      cascade.first_step_done_at,
      "acted",
      "Marked the call done on their plan",
      cascade.first_step_program_name || undefined,
    );

    // Plan views + checklist
    const { data: tokens } = await db
      .from("benefits_results_tokens")
      .select("last_viewed_at")
      .eq("profile_id", profileId);
    let latestView: string | null = null;
    for (const t of tokens ?? []) {
      push(t.last_viewed_at, "viewed", "Viewed their plan page (latest)");
      if (t.last_viewed_at && (!latestView || t.last_viewed_at > latestView)) latestView = t.last_viewed_at;
    }
    if (cascade.docs_checked?.length) {
      // docs_checked carries no per-doc timestamps; anchor to the best-known
      // moment they were on the page (call-done, else latest view) so the
      // entry doesn't re-date itself to "today" on every load.
      const docsAt = cascade.first_step_done_at || latestView;
      if (docsAt) {
        events.push({
          at: docsAt,
          kind: "docs",
          label: `Checked ${cascade.docs_checked.length} document${cascade.docs_checked.length === 1 ? "" : "s"} on their checklist`,
          detail: cascade.docs_checked.join("; "),
        });
      }
    }

    // Case actions
    for (const n of caseMeta.notes ?? []) push(n.at, "note", `Note by ${n.by}`, n.text);
    push(caseMeta.contacted_at, "case", "Marked contacted");
    push(caseMeta.resolved_at, "case", "Marked resolved");
    // Help-case ownership and the reply hold (lib/family-comms/benefits-automation.ts).
    const helpCase = caseMeta as BenefitsHelpCase;
    push(
      helpCase.help_opened_at,
      "case",
      `Help case opened${helpCase.help_owner ? `, owner ${helpCase.help_owner}` : ""}`,
      helpCase.help_due_at
        ? `${helpCase.help_reason === "stuck" ? "Texted STUCK" : "Asked for a person"}. Due ${new Date(helpCase.help_due_at).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric" })} ET`
        : undefined,
    );
    push(helpCase.help_escalated_at, "case", "Help case overdue, escalated in Slack");
    const hold = readBenefitsHold(meta);
    if (hold) {
      push(
        hold.held_at,
        "case",
        hold.reason === "deceased"
          ? "Reply suggests someone died: automation paused, nudges suppressed"
          : hold.reason === "sms_opt_out"
            ? "Texted STOP: automated benefits emails paused too"
            : `Family replied by ${hold.channel === "email" ? "email" : "text"}: automation paused`,
        hold.excerpt ? `"${hold.excerpt}"` : undefined,
      );
      push(hold.cleared_at, "case", `Automation resumed${hold.cleared_by ? ` by ${hold.cleared_by}` : ""}`);
    }
    const emailReply = (meta as { benefits_email_reply?: { at?: string; subject?: string } }).benefits_email_reply;
    if (emailReply?.at && emailReply.at !== hold?.held_at) {
      push(emailReply.at, "case", "Replied by email", emailReply.subject);
    }

    // Navigator guidance lifecycle
    const navigator = readBenefitsNavigator(meta);
    push(navigator.composed_at, "navigator", "Navigator guidance drafted", navigator.pick?.shortName);
    push(
      navigator.edited_at,
      "navigator",
      `Draft edits saved${navigator.edited_by ? ` by ${navigator.edited_by}` : ""}`,
    );
    push(
      navigator.schedule_failed_at,
      "navigator",
      "Scheduled send blocked",
      navigator.schedule_failed_reason,
    );
    push(
      navigator.sent_at,
      "navigator",
      `${
        navigator.sent_sms && !navigator.sent_subject
          ? "Navigator text sent"
          : navigator.sent_sms
            ? "Navigator email + text sent"
            : "Navigator email sent"
      } ${
        navigator.sent_via === "scheduler"
          ? "(scheduled)"
          : navigator.sent_via === "auto"
            ? "(automatic, verdict was clean)"
            : "by TJ"
      }`,
    );
    push(navigator.dismissed_at, "navigator", "Navigator draft dismissed");

    events.sort((a, b) => a.at.localeCompare(b.at));
    // The stored pick is a compose-time snapshot. Attach the LIVE
    // lastVerifiedDate so the fact-check export can skip programs already
    // verified recently instead of paying a full round to re-audit them.
    return NextResponse.json({
      events,
      caseMeta,
      navigator: withLiveVerifiedDate(navigator),
    });
  } catch (err) {
    console.error("Admin benefits timeline error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE — remove a family entirely (profile, account, auth user, tokens,
 * saved programs, activity). Built for test-data cleanup during heavy QA;
 * irreversible, so the UI requires typing "delete". Admin-only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { profileId } = await params;
    const db = getServiceClient();
    const { data: profile } = await db
      .from("business_profiles")
      .select("id, type, account_id")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (profile.type !== "family") {
      return NextResponse.json({ error: "Only family profiles can be deleted here" }, { status: 400 });
    }

    let userId: string | null = null;
    if (profile.account_id) {
      const { data: acct } = await db
        .from("accounts")
        .select("user_id")
        .eq("id", profile.account_id)
        .maybeSingle();
      userId = acct?.user_id ?? null;
    }

    const errors: string[] = [];
    const del = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await p;
      if (error) errors.push(`${label}: ${error.message}`);
    };
    await del("activity", db.from("seeker_activity").delete().eq("profile_id", profileId));
    await del("tokens", db.from("benefits_results_tokens").delete().eq("profile_id", profileId));
    if (userId) await del("saved_programs", db.from("saved_programs").delete().eq("user_id", userId));
    await del("profile", db.from("business_profiles").delete().eq("id", profileId));

    // Only remove the account + auth user when NO other profile hangs off the
    // account — an auth user can own several profiles, and deleting it would
    // kill their sign-in for everything else they have.
    if (profile.account_id && errors.length === 0) {
      const { data: siblings } = await db
        .from("business_profiles")
        .select("id")
        .eq("account_id", profile.account_id)
        .limit(1);
      if (!siblings || siblings.length === 0) {
        await del("account", db.from("accounts").delete().eq("id", profile.account_id));
        if (userId) {
          const { error: authErr } = await db.auth.admin.deleteUser(userId);
          if (authErr) errors.push(`auth user: ${authErr.message}`);
        }
      }
    }

    if (errors.length) {
      console.error("[benefits delete] partial:", errors);
      return NextResponse.json({ success: false, errors }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin benefits delete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { profileId } = await params;
    const body = await request.json();
    const action: string = body.action || "";
    if (
      ![
        "note",
        "contacted",
        "resolved",
        "reopen",
        "navigator_send",
        "navigator_dismiss",
        "navigator_test",
        "navigator_recompose",
        "navigator_build_packet",
        "navigator_save",
        "navigator_schedule",
        "navigator_unschedule",
        "hold_clear",
      ].includes(action)
    ) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const db = getServiceClient();
    const { data: profile } = await db
      .from("business_profiles")
      .select("id, email, phone, phone_validity, metadata, account_id, display_name, state, city, care_types")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const meta = (profile.metadata as Record<string, unknown>) || {};

    // ── Save: persist TJ's in-drawer edits so they survive collapsing the
    //    row, filter changes, and refreshes. Edits live in edited_* fields
    //    BESIDE the AI originals — the diff is the concierge learning signal.
    //    Send and the AI-review exports prefer saved edits; recompose clears
    //    them (the letter they edited no longer exists).
    if (action === "navigator_save") {
      const navigator = readBenefitsNavigator(meta);
      if (navigator.status !== "pending" || !navigator.body) {
        return NextResponse.json({ error: "No pending draft for this family" }, { status: 409 });
      }
      const editedBody =
        typeof body.body === "string" && body.body.trim().length >= 40 ? body.body.trim() : null;
      if (!editedBody) {
        return NextResponse.json({ error: "Letter is too short to save" }, { status: 400 });
      }
      const editedSubject =
        typeof body.subject === "string" && body.subject.trim()
          ? body.subject.trim().slice(0, 150)
          : navigator.subject;
      const editedSms =
        typeof body.sms === "string" && body.sms.trim() ? body.sms.trim().slice(0, 400) : null;

      // Fresh-read merge: a coordinator run or a family tapping /m gap chips
      // mid-edit must not be clobbered by the request-start metadata copy.
      const { data: freshRow } = await db
        .from("business_profiles")
        .select("metadata")
        .eq("id", profileId)
        .maybeSingle();
      const freshMeta = (freshRow?.metadata as Record<string, unknown> | null) || meta;
      const freshNav = readBenefitsNavigator(freshMeta);
      if (freshNav.status !== "pending") {
        return NextResponse.json(
          { error: "This draft was sent or dismissed elsewhere. Refresh to see its state." },
          { status: 409 },
        );
      }
      const next = {
        ...freshNav,
        edited_subject: editedSubject,
        edited_body: editedBody,
        edited_sms: editedSms,
        edited_at: new Date().toISOString(),
        edited_by: adminUser.display_name || user.email || "admin",
      };
      const { error: saveErr } = await db
        .from("business_profiles")
        .update({ metadata: { ...freshMeta, benefits_navigator: next } })
        .eq("id", profileId);
      if (saveErr) {
        return NextResponse.json({ error: "Couldn't save the draft" }, { status: 500 });
      }
      return NextResponse.json({ success: true, navigator: next });
    }

    // ── Recompose: re-draft a pending letter from current program data.
    //    Exists for the fact-check loop — after data corrections deploy,
    //    stale pending drafts re-draft instead of being hand-edited. Sent
    //    and dismissed stay terminal; TJ's in-drawer edits are discarded
    //    (the client confirms before calling).
    if (action === "navigator_recompose") {
      // Shared with the autopilot (lib/family-comms/benefits-navigator-autopilot.server.ts)
      // so the exclude-the-ruled-out-program rule cannot drift between them.
      const result = await recomposeNavigatorLetter(db, profileId, { trigger: "admin" });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ success: true, navigator: result.navigator });
    }

    // ── Build this letter's routing verdict, on demand ──────────────────────
    //
    // The packet cron can do the whole queue, but it needs an env var, a
    // redeploy and a secret pasted into a URL. That is not a thing TJ can do
    // from the admin, which meant the only way to see a verdict was a terminal.
    // This is the same builder, one letter, behind the admin session he is
    // already holding.
    if (action === "navigator_build_packet") {
      const navigator = readBenefitsNavigator(meta);
      if (navigator.status !== "pending" || !navigator.body) {
        return NextResponse.json({ error: "No pending draft for this family" }, { status: 409 });
      }
      // careNeed lives on the benefits_completed event, not the profile.
      const { data: intake } = await db
        .from("seeker_activity")
        .select("metadata")
        .eq("profile_id", profileId)
        .eq("event_type", "benefits_completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // The event stores it as care_need (snake case); careNeed never matched.
      const careNeed =
        ((intake?.metadata as { care_need?: unknown } | null)?.care_need as string | null) ??
        ((meta as { benefits_results?: { answers?: { careNeed?: string } } }).benefits_results
          ?.answers?.careNeed ?? null);

      let packet;
      try {
        packet = await buildNavigatorPacket(
          {
            care_types: (profile.care_types as string[] | null) ?? null,
            state: (profile.state as string | null) ?? null,
            metadata: meta,
            careNeed,
            intakeEvent: (intake?.metadata as Record<string, unknown> | null) ?? null,
          },
          navigator,
        );
      } catch (err) {
        return NextResponse.json(
          { error: `Couldn't build the verdict: ${err instanceof Error ? err.message : "unknown"}` },
          { status: 502 },
        );
      }

      // The build takes tens of seconds. Re-read and refuse to write a verdict
      // describing text that changed underneath it — same guard as the cron.
      const { data: fresh } = await db
        .from("business_profiles")
        .select("metadata")
        .eq("id", profileId)
        .maybeSingle();
      const freshMeta = (fresh?.metadata as Record<string, unknown> | null) ?? meta;
      const freshNav = readBenefitsNavigator(freshMeta);
      if (freshNav.status !== "pending") {
        return NextResponse.json(
          { error: "This draft was sent or dismissed while the verdict was building." },
          { status: 409 },
        );
      }
      if (freshNav.edited_at !== navigator.edited_at || freshNav.recomposed_at !== navigator.recomposed_at) {
        return NextResponse.json(
          { error: "The letter changed while the verdict was building. Try again." },
          { status: 409 },
        );
      }
      const { error: pErr } = await db
        .from("business_profiles")
        .update({ metadata: { ...freshMeta, benefits_navigator: { ...freshNav, packet } } })
        .eq("id", profileId);
      if (pErr) return NextResponse.json({ error: "Couldn't save the verdict" }, { status: 500 });
      return NextResponse.json({ success: true, packet });
    }

    // ── Navigator actions: send (through governance), test-send, or dismiss ──
    if (
      action === "navigator_send" ||
      action === "navigator_dismiss" ||
      action === "navigator_test"
    ) {
      const navigator = readBenefitsNavigator(meta);
      if (navigator.status !== "pending" || !navigator.body) {
        return NextResponse.json({ error: "No pending draft for this family" }, { status: 409 });
      }
      const now = new Date().toISOString();

      if (action === "navigator_dismiss") {
        const next = { ...navigator, status: "dismissed" as const, dismissed_at: now };
        const { error: dErr } = await db
          .from("business_profiles")
          .update({ metadata: { ...meta, benefits_navigator: next } })
          .eq("id", profileId);
        if (dErr) return NextResponse.json({ error: "Save failed" }, { status: 500 });
        return NextResponse.json({ success: true, navigator: next });
      }

      // Both send paths honor TJ's drawer edits: what the request carries
      // first, then saved edits, then the AI original.
      const subject =
        typeof body.subject === "string" && body.subject.trim()
          ? body.subject.trim().slice(0, 150)
          : navigator.edited_subject || navigator.subject || "Your first step";
      const letter =
        typeof body.body === "string" && body.body.trim().length >= 40
          ? body.body.trim()
          : navigator.edited_body || navigator.body;

      const siteUrl = getSiteUrl();
      const { data: tokenRow } = await db
        .from("benefits_results_tokens")
        .select("token")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const planPath = tokenRow?.token
        ? `/m/${tokenRow.token}`
        : navigator.pick?.programPath || "/benefits";

      // navigator_test — the exact email, delivered to a reviewer's inbox.
      // Consumes nothing: no cascade stamps, no navigator status change, no
      // SMS, no governed email type (so no cap slot). The plan link is the
      // DIRECT token URL, not the signed-in-arrival wrapper — a magic link
      // that signs the reviewer in as the family has no business in a test
      // inbox. Defaults to the signed-in admin's own email.
      if (action === "navigator_test") {
        const testEmail =
          typeof body.testEmail === "string" && /^\S+@\S+\.\S+$/.test(body.testEmail.trim())
            ? body.testEmail.trim()
            : user.email || null;
        if (!testEmail) {
          return NextResponse.json({ error: "No test email to send to" }, { status: 400 });
        }
        const testHtml = renderNavigatorEmail({
          body: letter,
          planUrl: `${siteUrl}${planPath}${tokenRow?.token ? "#call-script" : ""}`,
          unsubscribeUrl: careUnsubscribeUrl(profileId),
          call: navigator.pick?.contactPhone ? { phone: navigator.pick.contactPhone } : null,
        });
        const testResult = await sendEmail({
          to: testEmail,
          subject: `[Test] ${subject}`,
          html: testHtml,
          emailType: "navigator_test",
          recipientType: "admin",
          metadata: { navigator_test: true, family_profile_id: profileId },
        });
        if (!testResult.success || testResult.skipped) {
          return NextResponse.json(
            { error: `Test send failed: ${testResult.skipReason || testResult.error || "unknown"}` },
            { status: 502 },
          );
        }
        return NextResponse.json({ success: true, sentTo: testEmail });
      }

      // navigator_send — the real thing, through the shared send path (the
      // scheduler cron runs the same function; see
      // lib/family-comms/benefits-navigator-send.server.ts).
      const sendResult = await sendNavigatorLetter(db, {
        profileId,
        subject: typeof body.subject === "string" ? body.subject : null,
        body: typeof body.body === "string" ? body.body : null,
        sms: typeof body.sms === "string" ? body.sms : null,
        trigger: "admin",
        // Set only when the drawer's second confirmation was accepted. The
        // scheduler has no equivalent and never overrides.
        overridePacket: body.overridePacket === true,
      });
      if (!sendResult.ok) {
        return NextResponse.json(
          { error: sendResult.conflict ? sendResult.error : `Send blocked: ${sendResult.error}` },
          { status: 409 },
        );
      }
      return NextResponse.json({
        success: true,
        navigator: sendResult.navigator,
        deferred: sendResult.deferred ?? false,
      });
    }

    // ── Schedule: park the letter (with TJ's edits) for the hourly
    //    benefits-navigator-scheduler cron to send at/after the chosen time.
    //    Scheduling SAVES the edits atomically — the scheduled letter is
    //    exactly what's on screen when TJ clicks, not a stale copy. ──
    if (action === "navigator_schedule") {
      const navigator = readBenefitsNavigator(meta);
      if (navigator.status !== "pending" || !navigator.body) {
        return NextResponse.json({ error: "No pending draft for this family" }, { status: 409 });
      }
      const scheduledAt =
        typeof body.scheduledAt === "string" ? new Date(body.scheduledAt) : null;
      if (!scheduledAt || isNaN(scheduledAt.getTime())) {
        return NextResponse.json({ error: "Pick a valid date and time" }, { status: 400 });
      }
      const nowMs = Date.now();
      if (scheduledAt.getTime() < nowMs - 60_000) {
        return NextResponse.json({ error: "That time is in the past" }, { status: 400 });
      }
      if (scheduledAt.getTime() > nowMs + 30 * 86400e3) {
        return NextResponse.json(
          { error: "Schedule within 30 days — further out, the letter goes stale" },
          { status: 400 },
        );
      }
      const editedBody =
        typeof body.body === "string" && body.body.trim().length >= 40 ? body.body.trim() : null;
      if (!editedBody) {
        return NextResponse.json({ error: "Letter is too short to schedule" }, { status: 400 });
      }
      // Fresh-read merge, same as navigator_save.
      const { data: freshRow } = await db
        .from("business_profiles")
        .select("metadata")
        .eq("id", profileId)
        .maybeSingle();
      const freshMeta = (freshRow?.metadata as Record<string, unknown> | null) || meta;
      const freshNav = readBenefitsNavigator(freshMeta);
      if (freshNav.status !== "pending") {
        return NextResponse.json(
          { error: "This draft was sent or dismissed elsewhere. Refresh to see its state." },
          { status: 409 },
        );
      }
      const next = {
        ...freshNav,
        edited_subject:
          typeof body.subject === "string" && body.subject.trim()
            ? body.subject.trim().slice(0, 150)
            : freshNav.subject,
        edited_body: editedBody,
        edited_sms:
          typeof body.sms === "string" && body.sms.trim() ? body.sms.trim().slice(0, 400) : null,
        edited_at: new Date().toISOString(),
        edited_by: adminUser.display_name || user.email || "admin",
        scheduled_at: scheduledAt.toISOString(),
        scheduled_by: adminUser.display_name || user.email || "admin",
        schedule_failed_at: undefined,
        schedule_failed_reason: undefined,
      };
      const { error: schErr } = await db
        .from("business_profiles")
        .update({ metadata: { ...freshMeta, benefits_navigator: next } })
        .eq("id", profileId);
      if (schErr) return NextResponse.json({ error: "Couldn't save the schedule" }, { status: 500 });
      return NextResponse.json({ success: true, navigator: next });
    }

    if (action === "navigator_unschedule") {
      const { data: freshRow } = await db
        .from("business_profiles")
        .select("metadata")
        .eq("id", profileId)
        .maybeSingle();
      const freshMeta = (freshRow?.metadata as Record<string, unknown> | null) || meta;
      const freshNav = readBenefitsNavigator(freshMeta);
      if (freshNav.status !== "pending" || !freshNav.scheduled_at) {
        return NextResponse.json({ error: "Nothing scheduled for this family" }, { status: 409 });
      }
      const next = {
        ...freshNav,
        scheduled_at: undefined,
        schedule_failed_at: undefined,
        schedule_failed_reason: undefined,
      };
      const { error: unErr } = await db
        .from("business_profiles")
        .update({ metadata: { ...freshMeta, benefits_navigator: next } })
        .eq("id", profileId);
      if (unErr) return NextResponse.json({ error: "Couldn't cancel the schedule" }, { status: 500 });
      return NextResponse.json({ success: true, navigator: next });
    }
    const caseMeta = readBenefitsCase(meta);
    const now = new Date().toISOString();
    const by = adminUser.display_name || user.email || "admin";
    let next: BenefitsCaseMeta = caseMeta;

    // ── Resume automation after a family reply. The reply hold
    //    (lib/family-comms/benefits-automation.ts) stops the check-in, the
    //    scheduler and the autopilot until a person has read what they said.
    //    Logging a contact or resolving the case below clears it too, since
    //    both mean a person has dealt with the reply.
    if (action === "hold_clear") {
      if (!readBenefitsHold(meta)) {
        return NextResponse.json({ error: "Automation is not paused for this family" }, { status: 409 });
      }
      const cleared = withHoldCleared(meta, by, now);
      const { error: holdErr } = await db
        .from("business_profiles")
        .update({ metadata: cleared })
        .eq("id", profileId);
      if (holdErr) return NextResponse.json({ error: "Save failed" }, { status: 500 });
      return NextResponse.json({ success: true, hold: cleared.benefits_automation_hold ?? null });
    }

    if (action === "note") {
      const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
      if (!text) return NextResponse.json({ error: "Note text required" }, { status: 400 });
      next = { ...caseMeta, notes: [...(caseMeta.notes ?? []), { at: now, by, text }].slice(-20) };
    } else if (action === "contacted") {
      next = { ...caseMeta, contacted_at: now };
    } else if (action === "resolved") {
      next = { ...caseMeta, resolved_at: now };
    } else {
      next = { ...caseMeta, resolved_at: undefined, contacted_at: undefined };
    }

    // A logged contact or a resolution means a person has handled the
    // family's reply, so the automation hold lifts with it. Not a death
    // report: a condolence call is not a signal to resume "How is it going?"
    // and re-enable nudges, and a STOP is not undone by a logged call. Those
    // take the explicit "Resume automation" button, the same rule
    // resumeAfterHumanReply follows.
    const liftsHold =
      (action === "contacted" || action === "resolved") && !holdNeedsExplicitResume(meta);
    const baseMeta = liftsHold ? withHoldCleared(meta, by, now) : meta;
    const { error: updErr } = await db
      .from("business_profiles")
      .update({ metadata: { ...baseMeta, benefits_case: next } })
      .eq("id", profileId);
    if (updErr) {
      console.error("Admin benefits case update failed:", updErr);
      return NextResponse.json({ error: "Save failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, caseMeta: next });
  } catch (err) {
    console.error("Admin benefits case error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

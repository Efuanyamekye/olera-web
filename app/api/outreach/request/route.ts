import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { sendSlackAlert, slackOutreachRequestSubmitted } from "@/lib/slack";

/**
 * POST /api/outreach/request
 *
 * Family submits a Wizard-of-Oz outreach request from the AgentOutreachModule
 * (the H1 demand-test surface). Records intent, fires a Slack alert with full
 * fulfillment context for TJ. No automation in v0 — TJ does the outreach
 * manually from the Slack alert with Claude Code, 24h SLA.
 *
 * Body: {
 *   asker_email: string;
 *   source_provider_id: string;
 *   source_provider_name: string;
 *   city: string;
 *   state: string;
 *   category: string;
 *   target_providers: { id: string; name: string; slug: string; address: string }[];
 *   question_id?: string | null;
 *   question_text?: string | null;
 *   session_id?: string;
 *   honeypot?: string;
 * }
 *
 * See plans/agent-outreach-cta-workbook.md for the full spec.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 3;
const VALID_RELATIONSHIPS = new Set(["my-parent", "my-spouse", "myself", "other-family"]);

interface TargetProvider {
  id: string;
  name: string;
  slug: string;
  address: string;
}

function isValidTargetProvider(t: unknown): t is TargetProvider {
  if (!t || typeof t !== "object") return false;
  const o = t as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.slug === "string" &&
    typeof o.address === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      asker_email,
      source_provider_id,
      source_provider_name,
      city,
      state,
      category,
      relationship,
      target_providers,
      question_id,
      question_text,
      session_id,
      honeypot,
    } = body ?? {};

    // Sanitize relationship: only accept the known enum values; anything else
    // gets dropped silently. Optional field — null is the no-answer signal.
    const normalizedRelationship: string | null =
      typeof relationship === "string" && VALID_RELATIONSHIPS.has(relationship)
        ? relationship
        : null;

    // Honeypot: bots fill hidden fields. Pretend success and skip everything
    // else — never reveal the filter to the bot population.
    if (honeypot) {
      return NextResponse.json({ ok: true, id: "ok" }, { status: 201 });
    }

    if (typeof asker_email !== "string" || !EMAIL_REGEX.test(asker_email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (typeof source_provider_id !== "string" || !source_provider_id) {
      return NextResponse.json({ error: "source_provider_id required" }, { status: 400 });
    }
    if (!Array.isArray(target_providers) || target_providers.length === 0) {
      return NextResponse.json({ error: "target_providers required" }, { status: 400 });
    }
    if (!target_providers.every(isValidTargetProvider)) {
      return NextResponse.json({ error: "invalid target_providers shape" }, { status: 400 });
    }

    const normalizedEmail = asker_email.trim().toLowerCase();
    const targets = target_providers as TargetProvider[];

    const db = getServiceClient();

    // Rate limit: 3 requests per email per rolling hour. Mirrors the question
    // route pattern. Loose-enough that legitimate retries/refreshes don't trip;
    // tight enough that a single email can't spam the queue.
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { data: recent, error: recentErr } = await db
      .from("agent_outreach_requests")
      .select("id")
      .eq("seeker_email", normalizedEmail)
      .gte("created_at", oneHourAgo);
    if (recentErr) {
      console.error("[outreach/request] rate-limit lookup failed:", recentErr);
    } else if (recent && recent.length >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    // Attach seeker_user_id when authenticated. Guests are first-class — most
    // submitters won't be signed in. seeker_email is the canonical identifier.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const seekerUserId = user?.id ?? null;

    const { data: inserted, error: insertErr } = await db
      .from("agent_outreach_requests")
      .insert({
        seeker_user_id: seekerUserId,
        seeker_email: normalizedEmail,
        source_provider_id,
        city: typeof city === "string" ? city : null,
        state: typeof state === "string" ? state : null,
        category: typeof category === "string" ? category : null,
        question_id: typeof question_id === "string" ? question_id : null,
        question_text: typeof question_text === "string" ? question_text : null,
        target_provider_ids: targets.map((t) => t.id),
        status: "queued",
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("[outreach/request] insert failed:", insertErr);
      return NextResponse.json({ error: "Failed to record request" }, { status: 500 });
    }

    // Activity event + Slack alert. Both are awaited — fire-and-forget gets
    // killed by Vercel's serverless runtime once the response is sent, which
    // is exactly how the missing-Slack-alert symptom showed up the first
    // time. Run them in parallel via Promise.allSettled so neither blocks
    // the other and neither failing aborts the response (the canonical
    // agent_outreach_requests row is already in the DB at this point).
    const slackPayload = slackOutreachRequestSubmitted({
      requestId: inserted.id,
      askerEmail: normalizedEmail,
      sourceProviderName: typeof source_provider_name === "string" ? source_provider_name : source_provider_id,
      sourceProviderSlug: source_provider_id,
      city: typeof city === "string" ? city : "",
      state: typeof state === "string" ? state : "",
      category: typeof category === "string" ? category : "",
      relationship: normalizedRelationship,
      questionText: typeof question_text === "string" ? question_text : null,
      targetProviders: targets.map((t) => ({ name: t.name, slug: t.slug, address: t.address })),
    });

    const [activityResult, slackResult] = await Promise.allSettled([
      db.from("seeker_activity").insert({
        profile_id: null,
        event_type: "outreach_request_submitted",
        related_provider_id: source_provider_id,
        metadata: {
          request_id: inserted.id,
          session_id: typeof session_id === "string" ? session_id : null,
          target_provider_ids: targets.map((t) => t.id),
          city,
          state,
          category,
          relationship: normalizedRelationship,
          had_question: Boolean(question_text),
        },
      }),
      sendSlackAlert(slackPayload.text, slackPayload.blocks),
    ]);

    if (activityResult.status === "rejected") {
      console.error("[seeker_activity] outreach_request_submitted threw:", activityResult.reason);
    } else if (activityResult.value.error) {
      console.error("[seeker_activity] outreach_request_submitted failed:", activityResult.value.error);
    }

    if (slackResult.status === "rejected") {
      console.error("[outreach/request] Slack alert threw:", slackResult.reason);
    } else if (!slackResult.value.success) {
      console.error("[outreach/request] Slack alert failed:", slackResult.value.error);
    }

    return NextResponse.json({ ok: true, id: inserted.id }, { status: 201 });
  } catch (err) {
    console.error("[outreach/request] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

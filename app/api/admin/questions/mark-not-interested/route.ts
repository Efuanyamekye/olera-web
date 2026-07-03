import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";

/**
 * Mark a PROVIDER as "not interested" in Questions (soft reject).
 *
 * Unlike archive (which changes question status and stops everything), this is
 * a soft marking that:
 *   1. Marks all existing open questions for the provider with provider_not_interested
 *   2. Questions appear in "Not Interested" tab but status stays pending/approved
 *   3. No question emails are sent to this provider
 *   4. Reversible: provider can be unmarked and questions resume normal flow
 *
 * This is the Q&A equivalent of the connections page "Mark Not Interested" action.
 *
 * POST body: { providerId, reason, notes?, unmark? }
 */

const NOT_INTERESTED_REASONS = [
  "Provider declined via phone",
  "Provider requested no questions",
  "Not accepting new clients",
  "Not a good fit",
  "Duplicate/spam questions",
  "Other",
] as const;

async function handle(params: {
  providerId?: string | null;
  reason?: string | null;
  notes?: string | null;
  unmark?: boolean;
  adminEmail: string;
  adminUserId: string;
}) {
  const providerId = params.providerId?.trim() || null;
  const reason = params.reason?.trim() || null;
  const notes = params.notes?.trim() || null;
  const { unmark, adminEmail, adminUserId } = params;

  if (!providerId) {
    return NextResponse.json({ error: "Provide a providerId" }, { status: 400 });
  }

  if (!unmark && !reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  if (reason === "Other" && !notes?.trim()) {
    return NextResponse.json({ error: "Notes required when reason is 'Other'" }, { status: 400 });
  }

  const db = getServiceClient();

  // Resolve provider variants (same pattern as archive-provider)
  const variantSet = new Set<string>([providerId]);
  let providerName: string | null = null;

  // Strategy 1: business_profiles by slug
  const bp = await db
    .from("business_profiles")
    .select("display_name, slug, source_provider_id")
    .eq("slug", providerId)
    .maybeSingle()
    .then((r) => r.data);

  if (bp) {
    providerName = bp.display_name ?? null;
    if (bp.slug) variantSet.add(bp.slug);
    if (bp.source_provider_id) variantSet.add(bp.source_provider_id);
  } else {
    // Strategy 2/3: olera-providers by slug, then by legacy provider_id
    let ios = await db
      .from("olera-providers")
      .select("provider_id, provider_name, slug")
      .eq("slug", providerId)
      .maybeSingle()
      .then((r) => r.data);
    if (!ios) {
      ios = await db
        .from("olera-providers")
        .select("provider_id, provider_name, slug")
        .eq("provider_id", providerId)
        .maybeSingle()
        .then((r) => r.data);
    }
    if (ios) {
      providerName = ios.provider_name ?? null;
      if (ios.provider_id) variantSet.add(ios.provider_id);
      if (ios.slug) variantSet.add(ios.slug);
      // Linked business_profile, if any
      const linked = await db
        .from("business_profiles")
        .select("display_name, slug, source_provider_id")
        .eq("source_provider_id", ios.provider_id)
        .maybeSingle()
        .then((r) => r.data);
      if (linked) {
        providerName = providerName || linked.display_name || null;
        if (linked.slug) variantSet.add(linked.slug);
        if (linked.source_provider_id) variantSet.add(linked.source_provider_id);
      }
    }
  }

  const variants = Array.from(variantSet);

  // ── Unmark: remove not_interested from questions ──
  if (unmark) {
    // Find all questions marked as not interested for this provider
    const { data: markedQuestions, error: fetchErr } = await db
      .from("provider_questions")
      .select("id, metadata")
      .in("provider_id", variants);

    if (fetchErr) {
      console.error("Mark-not-interested fetch error:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
    }

    let questionsUnmarked = 0;
    for (const q of markedQuestions ?? []) {
      const meta = (q.metadata as Record<string, unknown> | null) || {};
      if (meta.provider_not_interested) {
        delete meta.provider_not_interested;
        delete meta.not_interested_reason;
        delete meta.not_interested_notes;
        delete meta.not_interested_at;
        delete meta.not_interested_by;
        const { error: updateErr } = await db
          .from("provider_questions")
          .update({ metadata: meta })
          .eq("id", q.id);
        if (!updateErr) questionsUnmarked++;
      }
    }

    await logAuditAction({
      adminUserId,
      action: "questions_unmark_not_interested",
      targetType: "provider",
      targetId: providerId,
      details: { provider_id: providerId, provider_name: providerName, variants, questions_unmarked: questionsUnmarked },
    });

    return NextResponse.json({
      success: true,
      action: "unmark",
      providerId,
      providerName,
      variants,
      questionsUnmarked,
      message: `Unmarked ${providerName || providerId} as not interested. ${questionsUnmarked} question(s) will return to normal queue.`,
    });
  }

  // ── Mark as not interested ──
  const nowIso = new Date().toISOString();

  // Fetch open questions for this provider
  const { data: openQuestions, error: fetchErr } = await db
    .from("provider_questions")
    .select("id, metadata")
    .in("provider_id", variants)
    .in("status", ["pending", "approved", "flagged"]);

  if (fetchErr) {
    console.error("Mark-not-interested fetch error:", fetchErr);
    return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
  }

  let questionsMarked = 0;
  for (const q of openQuestions ?? []) {
    const meta = (q.metadata as Record<string, unknown> | null) || {};
    meta.provider_not_interested = true;
    meta.not_interested_reason = reason;
    meta.not_interested_notes = notes || null;
    meta.not_interested_at = nowIso;
    meta.not_interested_by = adminEmail;
    // Clear email-related flags so questions don't appear in multiple tabs
    // (e.g., both "Needs Email" and "Not Interested")
    delete meta.needs_provider_email;
    delete meta.email_dead;

    const { error: updateErr } = await db
      .from("provider_questions")
      .update({ metadata: meta })
      .eq("id", q.id);
    if (!updateErr) questionsMarked++;
  }

  await logAuditAction({
    adminUserId,
    action: "questions_mark_not_interested",
    targetType: "provider",
    targetId: providerId,
    details: {
      provider_id: providerId,
      provider_name: providerName,
      variants,
      reason,
      notes,
      questions_marked: questionsMarked,
    },
  });

  return NextResponse.json({
    success: true,
    action: "mark",
    providerId,
    providerName,
    variants,
    questionsMarked,
    message: `Marked ${providerName || providerId} as not interested. ${questionsMarked} question(s) moved to Not Interested tab.`,
  });
}

async function authed() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { adminUser, adminEmail: user.email ?? adminUser.id };
}

export async function POST(request: NextRequest) {
  try {
    const a = await authed();
    if (a.error) return a.error;
    const body = await request.json().catch(() => ({}));
    return await handle({
      providerId: body.providerId ?? body.providerSlug ?? null,
      reason: body.reason ?? null,
      notes: body.notes ?? null,
      unmark: body.unmark === true,
      adminEmail: a.adminEmail,
      adminUserId: a.adminUser.id,
    });
  } catch (err) {
    console.error("Mark-not-interested error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

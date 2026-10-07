import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { readBenefitsCascade, type BenefitsCascadeMeta } from "@/lib/family-comms/benefits-cascade.server";

/**
 * Journey writes for the /m/{token} living page (plans/benefits-living-journey.md).
 *
 * Auth: the results token itself — same grant that shows the matches lets the
 * family record their own progress. Metadata-only writes into
 * business_profiles.metadata.benefits_cascade (no new seeker_activity event
 * types — the CHECK-constraint lesson); the admin queue and coordinator read
 * the same object.
 *
 * POST /api/families/benefits-journey
 *   { token, action: "call_made", programId? }
 *   { token, action: "doc_toggle", doc, checked }
 *   { token, action: "applied", programId?, stateId? } — submitted Social
 *     Security's Extra Help form through the apply-along, which also starts
 *     the state's Medicare Savings application (lib/benefits/apply-along.ts)
 *
 * `call_made` deliberately does NOT set cascade.outcome — that field stays the
 * family's check-in self-report; first_step_done_at is the page-observed act.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token: string = body.token || "";
    const action: string = body.action || "";

    if (!/^[A-Za-z0-9_-]{16}$/.test(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    if (!["call_made", "doc_toggle", "applied"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const db = getServiceClient();
    const { data: tokenRow } = await db
      .from("benefits_results_tokens")
      .select("profile_id")
      .eq("token", token)
      .maybeSingle();
    if (!tokenRow?.profile_id) {
      return NextResponse.json({ error: "Unknown token" }, { status: 404 });
    }

    const { data: profile } = await db
      .from("business_profiles")
      .select("id, metadata")
      .eq("id", tokenRow.profile_id)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: "Unknown profile" }, { status: 404 });

    const meta = (profile.metadata as Record<string, unknown>) || {};
    const cascade = readBenefitsCascade(meta);
    const now = new Date().toISOString();
    let next: BenefitsCascadeMeta = cascade;

    if (action === "call_made") {
      next = {
        ...cascade,
        first_step_done_at: cascade.first_step_done_at || now,
        first_step_done_program_id:
          cascade.first_step_done_program_id ||
          (typeof body.programId === "string" ? body.programId : cascade.first_step_program_id),
        application_status: "called",
        application_status_at: now,
      };
    } else if (action === "applied") {
      const programId = typeof body.programId === "string" ? body.programId.slice(0, 120) : cascade.first_step_program_id;
      const stateId = typeof body.stateId === "string" ? body.stateId.slice(0, 40) : cascade.first_step_state_id;
      next = {
        ...cascade,
        first_step_done_at: cascade.first_step_done_at || now,
        first_step_done_program_id: cascade.first_step_done_program_id || programId,
        application_status: "applied",
        application_status_at: now,
        // The first submission is the one the check-ins count from.
        applied: cascade.applied || { at: now, route: "ssa_extra_help", program_id: programId, state_id: stateId },
      };
    } else {
      const doc = typeof body.doc === "string" ? body.doc.slice(0, 200) : "";
      if (!doc) return NextResponse.json({ error: "doc required" }, { status: 400 });
      const set = new Set(cascade.docs_checked || []);
      if (body.checked) set.add(doc);
      else set.delete(doc);
      next = { ...cascade, docs_checked: [...set].slice(0, 30) };
    }

    const { error: updErr } = await db
      .from("business_profiles")
      .update({ metadata: { ...meta, benefits_cascade: next } })
      .eq("id", profile.id);
    if (updErr) {
      console.error("[benefits-journey] update failed:", updErr);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      firstStepDoneAt: next.first_step_done_at || null,
      docsChecked: next.docs_checked || [],
    });
  } catch (err) {
    console.error("[benefits-journey] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

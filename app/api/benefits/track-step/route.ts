import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyOrganicPage } from "@/lib/analytics/content-pages";
import { isProgramCardFlow } from "@/lib/analytics/program-card-variant";
import { isSplitArm } from "@/lib/benefits/finder-split";

// Per-step funnel events for the embedded benefits intake on provider pages.
// Mirrors /api/benefits/track-start (sibling route): writes to provider_activity
// keyed on providerSlug, gated on providerSlug && sessionId, fire-and-forget.
//
// Three event types:
//   - benefits_entry_viewed  → fires once when BenefitsDiscoveryModule mounts
//   - benefits_step_viewed   → fires on each step mount (step_number, step_name)
//   - benefits_step_completed → fires on each step submit (+ time_on_step_ms)
//
// Deliberately NO Slack alert — these would flood #ai-product-development.
// benefits_started keeps its alert as the "real" signal.

type StepEvent = "benefits_entry_viewed" | "benefits_step_viewed" | "benefits_step_completed";

const VALID_EVENTS: ReadonlySet<StepEvent> = new Set([
  "benefits_entry_viewed",
  "benefits_step_viewed",
  "benefits_step_completed",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getServiceDb(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event: string = body.event;
    if (!VALID_EVENTS.has(event as StepEvent)) {
      // Unknown event type — swallow rather than 4xx; analytics must never block UX.
      return NextResponse.json({ ok: true });
    }

    const sessionId: string | null = body.sessionId || null;
    const visitId: string | null = body.visitId || sessionId;
    const entrySource: string | null = body.entrySource || null;
    const stateCode: string | null = body.stateCode || null;
    const stateName: string | null = body.stateName || null;
    const providerName: string | null = body.providerName || null;
    const providerSlug: string | null = body.providerSlug || null;
    const stepNumber: number | null = typeof body.stepNumber === "number" ? body.stepNumber : null;
    const stepName: string | null = body.stepName || null;
    const timeOnStepMs: number | null = typeof body.timeOnStepMs === "number" ? body.timeOnStepMs : null;
    const variant: string | null = body.variant || null;
    // V3 per-card pickup tracking — only present on benefits_step_completed
    // for stepName === "care-need". Lets the admin funnel break out which of
    // the four cards is actually pulling clicks.
    const careNeedSelected: string | null = body.careNeedSelected || null;
    // Program-card flow experiment arm. Validated against the arm list so a
    // client can't write an arbitrary string into the dashboards.
    const cardFlow: string | null = isProgramCardFlow(body.cardFlow) ? body.cardFlow : null;
    const splitArm: string | null = isSplitArm(body.splitArm) ? body.splitArm : null;

    const db = getServiceDb();
    const writes: Array<PromiseLike<unknown>> = [];
    if (db && providerSlug && sessionId) {
      writes.push(db.from("provider_activity").insert({
        provider_id: providerSlug,
        profile_id: null,
        event_type: event,
        metadata: {
          session_id: sessionId,
          state: stateCode,
          state_name: stateName,
          provider_name: providerName,
          step_number: stepNumber,
          step_name: stepName,
          time_on_step_ms: timeOnStepMs,
          variant,
          care_need_selected: careNeedSelected,
          card_flow: cardFlow,
          split_arm: splitArm,
          entry_source: entrySource,
          visit_id: visitId,
        },
      }));
    }

    const pagePath = entrySource || (providerSlug ? `/provider/${providerSlug}` : null);
    const pageCategory = pagePath ? classifyOrganicPage(pagePath) : null;
    const growthEvent = event === "benefits_entry_viewed"
      ? "cta_visible"
      : event === "benefits_step_completed" && stepName === "contact"
        ? "lead_started"
        : event === "benefits_step_completed" && (stepName === "care-need" || stepName === "empathic_single_submitted")
          ? "cta_engaged"
          : null;
    if (db && sessionId && visitId && pagePath && pageCategory && growthEvent) {
      writes.push(db.from("growth_attribution_events").insert({
        anonymous_id: sessionId,
        visit_id: visitId,
        event_type: growthEvent,
        page_path: pagePath,
        page_category: pageCategory,
        cta_id: "benefits_intake",
        cta_surface: pageCategory === "editorial" ? "editorial_embed" : pageCategory === "benefit" ? "program_page" : "provider_page",
        metadata: {
          state: stateCode,
          step_number: stepNumber,
          step_name: stepName,
          variant,
          care_need_selected: careNeedSelected,
          card_flow: cardFlow,
        },
      }));
    }
    const results = await Promise.allSettled(writes);
    for (const result of results) {
      if (result.status === "fulfilled") {
        const value = result.value as { error?: { message?: string } | null };
        if (value?.error) console.error(`[track-step] ${event} insert failed:`, value.error);
      } else {
        console.error(`[track-step] ${event} insert rejected:`, result.reason);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[track-step] Error:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

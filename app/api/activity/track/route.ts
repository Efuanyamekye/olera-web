import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isBotRequest, incrementBotReject } from "@/lib/analytics/bot-filter";
import {
  classifyReferrer,
  sanitizeReferrer,
} from "@/lib/analytics/referrer";

const PROVIDER_EVENT_TYPES = [
  "email_click",
  "page_view",
  "lead_opened",
  "question_received",
  "question_responded",
  "review_viewed",
  "one_click_access",
  "contact_revealed",
  "reviews_cta_clicked",
  "analytics_teaser_impression",
  "analytics_teaser_cta_clicked",
  "provider_profile_edited",
  "provider_picker_impression",
  "provider_picker_clicked",
  "dashboard_arrival",
  "provider_saved",
] as const;

const FAMILY_EVENT_TYPES = [
  "connection_sent",
  "profile_enriched",
  "email_click",
  "question_asked",
  "matches_activated",
  "save_nudge_shown",
  "save_nudge_signup_clicked",
  "save_nudge_dismissed",
  "save_nudge_converted",
  "outreach_module_impression",
  "outreach_card_clicked",
  "outreach_request_submitted",
  "qa_email_capture_impression",
  "question_email_enriched",
] as const;

// Anonymous events are care-seeker-driven but lack a known profile_id.
// They write to provider_activity (not seeker_activity) keyed on the
// related provider's slug; session_id (in metadata) enables nightly dedup.
//
// New events here MUST also be added to provider_activity_event_type_check
// in a migration — otherwise inserts silently fail at the DB layer
// (fire-and-forget tracker swallows the rejection). See migration 077.
const ANONYMOUS_EVENT_TYPES = [
  "page_view",
  "search_click",
  "cta_click_public",
  "benefits_started",
  // multi_provider variant A/B test events. Names mirror what
  // MultiProviderCard + QASectionWithVariant actually fire.
  //   _viewed       — wrapper mount in arm (impression denominator)
  //   _card_shown   — card stack rendered after a question (started)
  //   _asked        — user sent question to a provider in the stack
  //   _skipped      — user skipped a card
  //   _converted    — email captured at end of flow (saved)
  //   _save_all     — secondary save action (logged-in flow)
  "multi_provider_viewed",
  "multi_provider_card_shown",
  "multi_provider_asked",
  "multi_provider_skipped",
  "multi_provider_converted",
  "multi_provider_flow_completed",  // logged-in users only (engagement, not conversion)
  "multi_provider_save_all",
  // CTA variant A/B test events — provider page CTA impressions and clicks
  "cta_variant_impression",
  "cta_variant_clicked",
] as const;

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

function classifyUserAgent(ua: string | null): "mobile" | "tablet" | "desktop" | "other" {
  if (!ua) return "other";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobile|iPhone|Android/i.test(ua)) return "mobile";
  if (/Mozilla|Chrome|Safari|Firefox|Edg/i.test(ua)) return "desktop";
  return "other";
}

/**
 * POST /api/activity/track
 *
 * Log an engagement event. Supports three actor types:
 *
 * actor_type="provider" (default): provider email clicks → provider_activity
 *   Required: provider_id, event_type
 *
 * actor_type="family": care seeker engagement (authenticated) → seeker_activity
 *   Required: profile_id, event_type
 *   Optional: related_provider_id, email_log_id, email_type, metadata
 *
 * actor_type="anonymous": unauthenticated care-seeker engagement → provider_activity
 *   Required: related_provider_id (slug), event_type, session_id
 *   Bot-filtered server-side; rejected requests return 204 (no leak of filter).
 *   Referrer is sanitized to domain-only for non-Olera referrers.
 *   No raw User-Agent stored — only ua_class.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      actor_type = "provider",
      provider_id,
      profile_id,
      event_type,
      email_log_id,
      email_type,
      related_provider_id,
      session_id,
      metadata,
    } = body;

    const db = getServiceDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // --- Anonymous events → provider_activity (no profile_id) ---
    if (actor_type === "anonymous") {
      const userAgent = request.headers.get("user-agent");

      if (isBotRequest(userAgent)) {
        incrementBotReject();
        // Silent — don't reveal the filter to bots.
        return new NextResponse(null, { status: 204 });
      }

      if (!related_provider_id || !event_type || !session_id) {
        return NextResponse.json(
          { error: "related_provider_id, event_type, and session_id are required for anonymous events" },
          { status: 400 }
        );
      }

      if (!(ANONYMOUS_EVENT_TYPES as readonly string[]).includes(event_type)) {
        return NextResponse.json(
          { error: `Invalid event_type for anonymous. Must be one of: ${ANONYMOUS_EVENT_TYPES.join(", ")}` },
          { status: 400 }
        );
      }

      const enrichedMetadata = {
        ...(metadata || {}),
        session_id,
        ua_class: classifyUserAgent(userAgent),
        referrer: sanitizeReferrer(metadata?.referrer),
        // referrer_class buckets traffic source into a small enum
        // (ai_chat / search / social / olera_internal / direct / other)
        // so we can measure the rise of LLM-originated visits without
        // hand-rolling host matchers in admin queries.
        referrer_class: classifyReferrer(metadata?.referrer),
      };

      const { error } = await db.from("provider_activity").insert({
        provider_id: related_provider_id,
        profile_id: null,
        event_type,
        metadata: enrichedMetadata,
      });

      if (error) {
        console.error("[activity/track] Anonymous insert failed:", error);
        return NextResponse.json(
          { error: "Failed to log activity" },
          { status: 500 }
        );
      }

      // Send Slack alert for multi_provider conversions. Awaited so the
      // Vercel serverless runtime doesn't kill the pending Promise after
      // the response returns (see feedback_serverless_fire_and_forget.md).
      if (event_type === "multi_provider_converted") {
        try {
          const { sendSlackAlert, slackVariantConverted } = await import("@/lib/slack");
          const meta = (metadata as Record<string, unknown>) || {};
          // Read variant from metadata (V2 events have "multi_provider_v2", V1 events may be undefined)
          const variantFromMeta = meta.variant === "multi_provider_v2" ? "multi_provider_v2" : "multi_provider";
          const alert = slackVariantConverted({
            variant: variantFromMeta,
            email: (meta.email as string) || "unknown",
            providerName: (meta.provider_name as string) || related_provider_id,
            questionText: meta.question_text as string | undefined,
            sentCount: typeof meta.sent_count === "number" ? meta.sent_count : undefined,
            providerSlug: related_provider_id,
          });
          await sendSlackAlert(alert.text, alert.blocks);
        } catch {
          // Non-critical — activity already logged
        }
      }

      return NextResponse.json({ success: true });
    }

    // --- Family events → seeker_activity ---
    if (actor_type === "family") {
      // Save nudge + outreach module events fire for GUESTS who don't have
      // a profile yet (most provider-page visitors are unauthenticated).
      const profileOptionalEvents = [
        "save_nudge_shown",
        "save_nudge_signup_clicked",
        "save_nudge_dismissed",
        "save_nudge_converted",
        "outreach_module_impression",
        "outreach_card_clicked",
        "outreach_request_submitted",
        "qa_email_capture_impression",
        "question_email_enriched",
      ];
      const requiresProfile = !profileOptionalEvents.includes(event_type);

      if (requiresProfile && !profile_id) {
        return NextResponse.json(
          { error: "profile_id is required for this family event" },
          { status: 400 }
        );
      }

      if (!event_type) {
        return NextResponse.json(
          { error: "event_type is required for family events" },
          { status: 400 }
        );
      }

      if (!(FAMILY_EVENT_TYPES as readonly string[]).includes(event_type)) {
        return NextResponse.json(
          { error: `Invalid event_type for family. Must be one of: ${FAMILY_EVENT_TYPES.join(", ")}` },
          { status: 400 }
        );
      }

      const { error } = await db.from("seeker_activity").insert({
        profile_id: profile_id || null,
        event_type,
        email_log_id: email_log_id || null,
        email_type: email_type || null,
        related_provider_id: related_provider_id || null,
        metadata: metadata || {},
      });

      if (error) {
        console.error("[activity/track] Family insert failed:", error);
        return NextResponse.json(
          { error: "Failed to log activity" },
          { status: 500 }
        );
      }

      // Send Slack alert for save nudge → signup conversions
      if (event_type === "save_nudge_converted") {
        try {
          const { sendSlackAlert, slackSaveNudgeConverted } = await import("@/lib/slack");
          const meta = (metadata as Record<string, unknown>) || {};
          const alert = slackSaveNudgeConverted({
            familyName: (meta.user_name as string) || "Unknown",
            email: (meta.user_email as string) || "unknown",
            savedCount: typeof meta.saved_count === "number" ? meta.saved_count : 0,
            savedProviderNames: Array.isArray(meta.saved_provider_names)
              ? (meta.saved_provider_names as string[])
              : [],
          });
          await sendSlackAlert(alert.text, alert.blocks);
        } catch {
          // Non-critical — activity already logged
        }
      }

      return NextResponse.json({ success: true });
    }

    // --- Provider events → provider_activity (existing behavior) ---
    if (!provider_id || !event_type) {
      return NextResponse.json(
        { error: "provider_id and event_type are required" },
        { status: 400 }
      );
    }

    if (!(PROVIDER_EVENT_TYPES as readonly string[]).includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type. Must be one of: ${PROVIDER_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const { error } = await db.from("provider_activity").insert({
      provider_id,
      profile_id: profile_id || null,
      event_type,
      email_log_id: email_log_id || null,
      email_type: email_type || null,
      metadata: metadata || {},
    });

    if (error) {
      console.error("[activity/track] Insert failed:", error);
      return NextResponse.json(
        { error: "Failed to log activity" },
        { status: 500 }
      );
    }

    // Send Slack alert for one-click token access (observability for PII exposure)
    if (event_type === "one_click_access") {
      try {
        const { sendSlackAlert, slackOneClickAccess } = await import("@/lib/slack");
        const meta = (metadata as Record<string, string>) || {};
        const trustLevel = ["high", "medium", "low"].includes(meta.trust_level)
          ? (meta.trust_level as "high" | "medium" | "low")
          : null;
        const alert = slackOneClickAccess({
          providerName: meta.provider_name || provider_id,
          providerEmail: meta.email || "unknown",
          providerSlug: provider_id,
          action: meta.action || "unknown",
          actionId: meta.action_id,
          trustLevel,
          trustReason: meta.trust_reason || null,
        });
        await sendSlackAlert(alert.text, alert.blocks);
      } catch {
        // Non-critical — activity already logged
      }
    }

    // Send Slack alert when a provider clicks the reviews CTA
    if (event_type === "reviews_cta_clicked") {
      try {
        const { sendSlackAlert, slackReviewsCtaClicked } = await import("@/lib/slack");
        const meta = metadata as Record<string, string> || {};
        const alert = slackReviewsCtaClicked({
          providerName: meta.provider_name || provider_id,
          providerSlug: provider_id,
          source: meta.source || "onboard",
        });
        await sendSlackAlert(alert.text, alert.blocks);
      } catch {
        // Non-critical — activity already logged
      }
    }

    // Send Slack alert when a provider clicks the analytics teaser CTA —
    // this is the Phase 2 conversion signal: provider saw the teaser on the
    // onboard page and chose to go to the dashboard. Impressions stay in DB
    // only (too noisy for Slack); clicks get the alert.
    if (event_type === "analytics_teaser_cta_clicked") {
      try {
        const { sendSlackAlert, slackAnalyticsTeaserCtaClicked } = await import("@/lib/slack");
        const meta = (metadata as Record<string, unknown>) || {};
        const alert = slackAnalyticsTeaserCtaClicked({
          providerName: (meta.provider_name as string) || provider_id,
          providerSlug: provider_id,
          teaserCase: (meta.case as string) || "unknown",
          viewsThisPeriod: typeof meta.views_this_period === "number" ? meta.views_this_period : 0,
          cohortSize: typeof meta.cohort_size === "number" ? meta.cohort_size : null,
          tier: (meta.tier as string) || "unknown",
        });
        await sendSlackAlert(alert.text, alert.blocks);
      } catch {
        // Non-critical — activity already logged
      }
    }

    // Post-answer engagement chain Slack alerts. These three events fill
    // the new "Arrived (qa-success)", "Clicked dashboard", "Edited profile"
    // funnel columns on /admin/analytics. Pushing them to Slack gives real-
    // time visibility into whether the redirect → hero → action pipeline
    // is converting providers, alongside the dashboard view of aggregates.

    // 🎯 Provider arrived at /provider via the post-answer redirect. Filter
    // to source="qa-success" so future redirect sources opt in explicitly
    // rather than alerting on every ?from=… URL.
    if (event_type === "dashboard_arrival") {
      const meta = (metadata as Record<string, unknown>) || {};
      if (meta.source === "qa-success") {
        try {
          const { sendSlackAlert, slackDashboardArrival } = await import("@/lib/slack");
          const alert = slackDashboardArrival({
            providerSlug: provider_id,
            source: meta.source as string,
          });
          await sendSlackAlert(alert.text, alert.blocks);
        } catch {
          // Non-critical — activity already logged
        }
      }
    }

    // ✋ Provider clicked the dashboard hero's completion-tier CTA. Filter
    // to source="hero" — picker_qa_success was deprecated in PR #679, but
    // belt-and-suspenders in case other surfaces ever fire this event.
    if (event_type === "provider_picker_clicked") {
      const meta = (metadata as Record<string, unknown>) || {};
      if (meta.source === "hero") {
        try {
          const { sendSlackAlert, slackHeroCtaClicked } = await import("@/lib/slack");
          // Two shapes feed this alert: completion-tier clicks carry a
          // section (modal-opening); engagement-tier clicks carry a tier +
          // destination (leads / questions, Link navigation). slackHeroCtaClicked
          // renders the right fields based on which is present.
          const alert = slackHeroCtaClicked({
            providerSlug: provider_id,
            section: typeof meta.section === "string" ? meta.section : undefined,
            tier: typeof meta.tier === "string" ? meta.tier : undefined,
            destination: typeof meta.destination === "string" ? meta.destination : undefined,
          });
          await sendSlackAlert(alert.text, alert.blocks);
        } catch {
          // Non-critical — activity already logged
        }
      }
    }

    // ✅ Provider saved edits to a profile section. Conversion outcome —
    // fires for every save (post-answer flow OR routine housekeeping), not
    // scoped to qa-success sessions. Cleanest signal that activation is
    // happening.
    if (event_type === "provider_profile_edited") {
      try {
        const { sendSlackAlert, slackProfileEdited } = await import("@/lib/slack");
        const meta = (metadata as Record<string, unknown>) || {};
        const alert = slackProfileEdited({
          providerSlug: provider_id,
          section: (meta.section as string) || "unknown",
        });
        await sendSlackAlert(alert.text, alert.blocks);
      } catch {
        // Non-critical — activity already logged
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[activity/track] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { resolveProviderIdVariants } from "@/lib/provider-id-variants";

/**
 * GET /api/admin/directory/[providerId]/comms-timeline
 *
 * Unified comms timeline for ONE provider — interleaves every automated email
 * sent to them with every meaningful on-Olera activity event they produced.
 * The "CRM contact card" view that answers "what is this provider experiencing?"
 *
 * email_log + provider_activity are queried in parallel against ALL known
 * ID variants for this provider (see lib/provider-id-variants.ts) so we
 * catch rows written under either the slug or the business_profiles UUID —
 * a real data-shape inconsistency the existing /api/admin/emails surface
 * still suffers from.
 *
 * Query params:
 *   - limit (optional, default 50, max 200) — total events returned across both sources
 *
 * Returns:
 *   {
 *     events: TimelineEvent[],        // merged + time-sorted, sliced to `limit`
 *     totalEmails: number,            // true count from count-only query (not capped)
 *     totalActivity: number,          // true count from count-only query (not capped)
 *     fetchedEmails: number,          // emails actually fetched (capped at perSourceCap)
 *     fetchedActivity: number,        // activity actually fetched (capped at perSourceCap)
 *     idVariants: string[],           // which IDs we matched against, for debugging
 *     businessProfileId: string|null, // first business_profiles.id if claimed
 *   }
 */

// Activity event types we surface on the timeline. Anything not in this list
// is dropped (e.g. page_view is too noisy to be useful here). Order doesn't
// matter — it's a membership check.
const TIMELINE_ACTIVITY_EVENTS = [
  "one_click_access",
  "question_responded",
  "provider_profile_edited",
  "notification_settings_viewed",
  "notification_preference_saved",
  "provider_picker_clicked",
  "analytics_teaser_cta_clicked",
  "claim_completed",
  "dashboard_arrival",
  "contact_revealed",
  "phone_clicked",
  "email_link_clicked",
  "reviews_cta_clicked",
  "lead_opened",
  "review_viewed",
  "market_outreach_status_updated",
] as const;

type EmailEvent = {
  id: string;
  at: string;
  kind: "email";
  email: {
    log_id: string;
    email_type: string;
    subject: string;
    status: string;
    delivered_at: string | null;
    first_opened_at: string | null;
    first_clicked_at: string | null;
    bounced_at: string | null;
    complained_at: string | null;
    error_message: string | null;
  };
};

type ActivityEvent = {
  id: string;
  at: string;
  kind: "activity";
  activity: {
    event_type: string;
    summary: string;
    metadata: Record<string, unknown> | null;
  };
};

type TimelineEvent = EmailEvent | ActivityEvent;

// Turn an activity row's event_type + metadata into a one-line label for the
// UI. Conservative on first pass — better to ship a flat label than to over-
// interpret metadata fields whose shapes might surprise us. Polish later
// once we see real data.
function summarizeActivity(eventType: string, metadata: Record<string, unknown> | null): string {
  const m = metadata ?? {};
  switch (eventType) {
    case "one_click_access": {
      const action = typeof m.action === "string" ? m.action : null;
      if (action === "question") return "Signed in via Q&A email (one-click)";
      if (action === "lead") return "Signed in via lead email (one-click)";
      if (action === "review") return "Signed in via review email (one-click)";
      return "Signed in via email (one-click)";
    }
    case "question_responded":
      return "Answered a question";
    case "notification_settings_viewed":
      return "Opened notification settings";
    case "notification_preference_saved":
      return "Saved notification preferences";
    case "provider_profile_edited": {
      const section = typeof m.section_id === "string" ? m.section_id : null;
      return section ? `Edited profile section: ${section}` : "Edited profile";
    }
    case "provider_picker_clicked": {
      const source = typeof m.source === "string" ? m.source : null;
      return source ? `Clicked dashboard CTA (${source})` : "Clicked dashboard CTA";
    }
    case "analytics_teaser_cta_clicked":
      return "Clicked analytics teaser";
    case "claim_completed": {
      const source = typeof m.source === "string" ? m.source : null;
      return source ? `Claimed listing (${source})` : "Claimed listing";
    }
    case "dashboard_arrival": {
      const source = typeof m.source === "string" ? m.source : null;
      return source ? `Arrived at dashboard (from ${source})` : "Arrived at dashboard";
    }
    case "contact_revealed":
      return "Copied contact info";
    case "phone_clicked":
      return "Clicked to call family";
    case "email_link_clicked":
      return "Clicked to email family";
    case "reviews_cta_clicked":
      return "Clicked reviews CTA";
    case "lead_opened":
      return "Opened a lead";
    case "review_viewed":
      return "Viewed a review";
    case "market_outreach_status_updated": {
      const target = typeof m.target_name === "string" ? m.target_name : "referral target";
      const status = typeof m.status === "string" ? m.status.replace(/_/g, " ") : null;
      return status ? `Updated ${target} to ${status}` : `Updated ${target}`;
    }
    default:
      return eventType;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { providerId: slug } = await params;
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;

    const db = getServiceClient();

    const { allVariants, businessProfileId } = await resolveProviderIdVariants(db, slug);

    // Pull more from each source than the final cap so the merged sort has
    // breathing room — the merged list gets sliced to `limit` after sorting.
    const perSourceCap = Math.min(200, limit * 4);

    // recipient_type filter: 'provider' or NULL — the latter catches legacy
    // rows from callers that didn't pass recipientType (email_log columns
    // default it to null). Matches the looser behavior of the existing
    // /api/admin/emails surface so the timeline isn't a behavioral regression.
    // Excludes recipient_type='admin' (admin notifications ABOUT this provider)
    // and 'family' (family-bound emails that happen to reference the provider).
    const [emailRes, activityRes, emailCountRes, activityCountRes] = await Promise.all([
      db
        .from("email_log")
        .select(
          "id, email_type, subject, status, created_at, delivered_at, first_opened_at, first_clicked_at, bounced_at, complained_at, last_event_type, error_message",
        )
        .in("provider_id", allVariants)
        .or("recipient_type.is.null,recipient_type.eq.provider")
        .order("created_at", { ascending: false })
        .limit(perSourceCap),
      db
        .from("provider_activity")
        .select("id, event_type, metadata, created_at")
        .in("provider_id", allVariants)
        .in("event_type", [...TIMELINE_ACTIVITY_EVENTS])
        .order("created_at", { ascending: false })
        .limit(perSourceCap),
      // True totals — count-only queries so the UI doesn't lie about how many
      // events exist when the fetched count is capped at perSourceCap.
      db
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .in("provider_id", allVariants)
        .or("recipient_type.is.null,recipient_type.eq.provider"),
      db
        .from("provider_activity")
        .select("id", { count: "exact", head: true })
        .in("provider_id", allVariants)
        .in("event_type", [...TIMELINE_ACTIVITY_EVENTS]),
    ]);

    if (emailRes.error) {
      console.error("[comms-timeline] email_log query failed:", emailRes.error);
      return NextResponse.json({ error: "Failed to load emails" }, { status: 500 });
    }
    if (activityRes.error) {
      console.error("[comms-timeline] provider_activity query failed:", activityRes.error);
      return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
    }
    // Count query errors are non-fatal — fall back to the fetched length.

    const emailRows = (emailRes.data ?? []) as Array<{
      id: string;
      email_type: string;
      subject: string;
      status: string;
      created_at: string;
      delivered_at: string | null;
      first_opened_at: string | null;
      first_clicked_at: string | null;
      bounced_at: string | null;
      complained_at: string | null;
      last_event_type: string | null;
      error_message: string | null;
    }>;
    const activityRows = (activityRes.data ?? []) as Array<{
      id: string;
      event_type: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>;

    const emailEvents: EmailEvent[] = emailRows.map((r) => ({
      id: `email:${r.id}`,
      at: r.created_at,
      kind: "email",
      email: {
        log_id: r.id,
        email_type: r.email_type,
        subject: r.subject,
        status: r.status,
        delivered_at: r.delivered_at,
        first_opened_at: r.first_opened_at,
        first_clicked_at: r.first_clicked_at,
        bounced_at: r.bounced_at,
        complained_at: r.complained_at,
        error_message: r.error_message,
      },
    }));

    const activityEvents: ActivityEvent[] = activityRows.map((r) => ({
      id: `activity:${r.id}`,
      at: r.created_at,
      kind: "activity",
      activity: {
        event_type: r.event_type,
        summary: summarizeActivity(r.event_type, r.metadata),
        metadata: r.metadata,
      },
    }));

    // Merge + sort desc by timestamp. ISO 8601 strings sort lexically.
    const merged: TimelineEvent[] = [...emailEvents, ...activityEvents]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);

    return NextResponse.json({
      events: merged,
      // True totals from the count-only queries; fall back to fetched length
      // if those queries errored. The UI uses these for honest "N of M" copy.
      totalEmails: emailCountRes.count ?? emailEvents.length,
      totalActivity: activityCountRes.count ?? activityEvents.length,
      fetchedEmails: emailEvents.length,
      fetchedActivity: activityEvents.length,
      idVariants: allVariants,
      businessProfileId,
    });
  } catch (err) {
    console.error("[comms-timeline] fatal:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

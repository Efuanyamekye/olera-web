import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { countDeliveredByCampaign, countAdLandingsByCampaign, listLeadsByCampaign, getCampaignStats, getCampaignQuestions } from "@/lib/ad-boost/delivered.server";
import { getCampaignReceipt } from "@/lib/ad-boost/receipts.server";
import { sendAdBoostLifecycleEmail } from "@/lib/ad-boost/lifecycle-notifications.server";
import { sendAdBoostPhotoEmail } from "@/lib/ad-boost/photo-notifications.server";
import { nextBusinessSlotEt } from "@/lib/send-window";

/**
 * Admin concierge queue for Provider Ad Boost (managed lead-gen).
 *
 * GET    — list all campaign requests, newest first, for the /admin/ad-boost queue.
 * POST   — update one request: status lifecycle + campaign_tag / channel / note /
 *          setup week. Moving a request to `live` without a campaign_tag auto-sets
 *          it to the request id, so there's always a stable UTM tag to attribute
 *          delivered families against (Phase 3 ROI). The live flip emails the
 *          provider immediately unless launched_email_scheduled_at is set —
 *          then the hourly ad-boost-launch-scheduler cron owns the send
 *          (send_launch_email: true fires it now and clears the schedule).
 *          The flip to `ended` works the other way round: the promo-complete
 *          wrap-up is ALWAYS parked at the next 10:15 AM ET business morning
 *          (send_promo_complete_email: true fires it now), because that email
 *          carries the subscribe ask and shouldn't land at whatever hour the
 *          concierge happened to close the flight. Campaigns the
 *          ad-boost-end-scheduler cron ends automatically take the same path.
 * DELETE — hard-delete one request by id (?id= or JSON body). Used to clear out
 *          test runs from the queue; real campaigns should be `cancelled`/`ended`
 *          via POST instead, but this is a deliberate scrub.
 *
 * Auth: admin only.
 */

const VALID_STATUSES = ["pending_profile", "requested", "scheduled", "live", "ended", "cancelled"];
const VALID_CHANNELS = ["google", "meta", "both", "nextdoor"];
const VALID_BUDGET_TYPES = ["daily", "lifetime"];
const VALID_PHOTO_READINESS = ["unreviewed", "update_requested", "review_requested", "ready"];
const AD_BOOST_EMAIL_TYPES = [
  "ad_boost_queued",
  "ad_boost_requested",
  "ad_boost_profile_reminder",
  "ad_boost_ready",
  "ad_boost_photo_update",
  "ad_boost_photo_reminder",
  "ad_boost_photos_ready",
  "ad_boost_campaign_launched",
  "ad_boost_lead_delivered",
  "ad_boost_traction",
  "ad_boost_lead_outcome_check",
  "ad_boost_promo_complete",
];

const ROW_SELECT =
  "id, provider_id, provider_slug, display_name, requested_setup_week, completeness_at_submit, status, channel, intended_monthly_budget, campaign_tag, admin_note, created_at, updated_at, deleted_at, ended_at, ended_reason, ad_budget_cents, ad_budget_type, ad_spend_cents, ad_clicks, ad_impressions, metrics_updated_at, metrics_source, platform_campaign_id, flight_start_date, flight_end_date, queued_email_sent_at, requested_email_sent_at, profile_reminder_email_sent_at, promotion_email_sent_at, launched_email_sent_at, launched_email_scheduled_at, traction_email_sent_at, promo_complete_email_sent_at, promo_complete_email_scheduled_at, provider_reported_outcome, provider_reported_outcome_at, plan_status, plan_value, stripe_customer_id, stripe_subscription_id, subscribed_at, photo_readiness_status, photo_review_note, photo_reviewed_at, photo_reviewed_by, photo_update_requested_at, photo_update_submitted_at, photo_nudge_email_sent_at, photo_reminder_email_sent_at, photo_ready_email_sent_at, provider_comms_paused_at, provider_comms_paused_reason";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const db = getServiceClient();

  // Current Ad Boost cohort for the admin Overview card. Count providers, not
  // request rows, because a provider can run more than one campaign over time.
  // A paid plan remains part of the program even if its introductory campaign
  // row has already moved to `ended`.
  if (params.get("program_count_only") === "true") {
    const { data: rows, error: programErr } = await db
      .from("ad_campaign_requests")
      .select("provider_id")
      .is("deleted_at", null)
      .or(
        "status.in.(pending_profile,requested,scheduled,live),plan_status.in.(active,past_due)",
      );
    if (programErr) {
      console.error("[admin/ad-boost] program count failed:", programErr);
      return NextResponse.json({ error: programErr.message }, { status: 500 });
    }
    const providers = new Set((rows ?? []).map((row) => row.provider_id)).size;
    return NextResponse.json({ providers });
  }

  // Revenue summary for admin surfaces that need subscription detail: paying
  // campaigns (active + past_due — past_due still bills while Stripe duns it)
  // and their combined monthly value.
  if (params.get("revenue_only") === "true") {
    const { data: rows, error: revErr } = await db
      .from("ad_campaign_requests")
      .select("plan_status, plan_value")
      .in("plan_status", ["active", "past_due"])
      .is("deleted_at", null);
    if (revErr) {
      console.error("[admin/ad-boost] revenue summary failed:", revErr);
      return NextResponse.json({ error: revErr.message }, { status: 500 });
    }
    const paying = rows?.length ?? 0;
    const mrr = (rows ?? []).reduce((sum, r) => sum + (r.plan_value ?? 0), 0);
    return NextResponse.json({ paying, mrr });
  }

  // Single-record fetch (?id=) for the detail page. Returns the one request with
  // its delivered count, regardless of archived state.
  const id = params.get("id");
  if (id) {
    const { data: row, error: rowErr } = await db
      .from("ad_campaign_requests")
      .select(ROW_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (rowErr) {
      console.error("[admin/ad-boost] fetch one failed:", rowErr);
      return NextResponse.json({ error: rowErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // The detail page is campaign-scoped for editing, but provider continuity
    // belongs here too. Fetch every request for the same provider (including
    // archived rows) so operators can move between current and past campaigns
    // without returning to the queue.
    const { data: providerCampaignRows, error: providerCampaignError } = await db
      .from("ad_campaign_requests")
      .select(ROW_SELECT)
      .eq("provider_id", row.provider_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (providerCampaignError) {
      console.error("[admin/ad-boost] provider campaign history failed:", providerCampaignError);
      return NextResponse.json({ error: providerCampaignError.message }, { status: 500 });
    }

    const providerCampaigns = providerCampaignRows?.length ? providerCampaignRows : [row];
    const campaignTags = providerCampaigns.map(
      (campaign) => campaign.campaign_tag || campaign.id,
    );
    const tag = row.campaign_tag || row.id;
    const [delivered, adLandings, leads, receipt, communicationResult, profileResult] = await Promise.all([
      countDeliveredByCampaign(db, campaignTags),
      countAdLandingsByCampaign(db, campaignTags),
      listLeadsByCampaign(db, tag),
      getCampaignReceipt(db, row),
      db
        .from("email_log")
        .select("id, email_type, subject, status, created_at, delivered_at, bounced_at, error_message, metadata")
        .in("email_type", AD_BOOST_EMAIL_TYPES)
        .filter("metadata->>request_id", "eq", row.id)
        .order("created_at", { ascending: true })
        .limit(500),
      db
        .from("business_profiles")
        .select("image_url, metadata, source_provider_id")
        .eq("id", row.provider_id)
        .maybeSingle(),
    ]);

    if (communicationResult.error) {
      console.error("[admin/ad-boost] communication history failed:", communicationResult.error);
      return NextResponse.json({ error: communicationResult.error.message }, { status: 500 });
    }
    if (profileResult.error) {
      console.error("[admin/ad-boost] provider photo lookup failed:", profileResult.error);
      return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
    }

    const profile = profileResult.data as {
      image_url: string | null;
      metadata: Record<string, unknown> | null;
      source_provider_id: string | null;
    } | null;
    const profileMetadataImages = Array.isArray(profile?.metadata?.images)
      ? (profile.metadata.images as unknown[]).filter((value): value is string => typeof value === "string" && !!value.trim())
      : [];
    let sourceImages: string[] = [];
    if (profileMetadataImages.length === 0 && profile?.source_provider_id) {
      const { data: source, error: sourceError } = await db
        .from("olera-providers")
        .select("provider_logo, provider_images")
        .eq("provider_id", profile.source_provider_id)
        .maybeSingle();
      if (sourceError) {
        console.error("[admin/ad-boost] source photo lookup failed:", sourceError);
        return NextResponse.json({ error: sourceError.message }, { status: 500 });
      }
      sourceImages = [
        source?.provider_logo ?? "",
        ...((source?.provider_images ?? "") as string).split(" | "),
      ].map((value) => value.trim()).filter(Boolean);
    }
    const profileImages = [...new Set([
      profile?.image_url ?? "",
      ...(profileMetadataImages.length > 0 ? profileMetadataImages : sourceImages),
    ].filter(Boolean))];

    // Parity with the provider's own /provider/boost live view: the SAME real
    // visitors + leads + questions numbers Hilda sees, computed from the same
    // readers, so the admin queue mirrors the provider's signed-in view (not
    // the legacy benefits-only `delivered` count). Null until the campaign is
    // live or ended (ended keeps stats — the wrap-up leads with them).
    let campaignStats:
      | { visitors: number; leads: number; questions: { received: number; unanswered: number }; since: string }
      | null = null;
    if (row.status === "live" || row.status === "ended") {
      const since = new Date(
        row.flight_start_date || row.requested_setup_week || row.created_at,
      ).toISOString();
      const providerIdVariants = [row.provider_slug, row.provider_id];
      const [stats, questions] = await Promise.all([
        getCampaignStats(db, { providerIdVariants, since }),
        getCampaignQuestions(db, {
          providerIdVariants,
          since,
          campaignTag: row.campaign_tag || row.id,
        }),
      ]);
      campaignStats = { ...stats, questions, since };
    }

    return NextResponse.json({
      request: {
        ...row,
        delivered: delivered[tag] ?? 0,
        ad_landings: adLandings[tag] ?? 0,
      },
      leads,
      communications: communicationResult.data ?? [],
      campaignStats,
      receipt: {
        google: receipt.google,
        engagement: receipt.engagement,
        outcomes: receipt.outcomes,
        expectedLeads: receipt.expectedLeads,
        week: receipt.week,
      },
      profileImages,
      providerCampaigns: providerCampaigns.map((campaign) => {
        const campaignTag = campaign.campaign_tag || campaign.id;
        return {
          ...campaign,
          delivered: delivered[campaignTag] ?? 0,
          ad_landings: adLandings[campaignTag] ?? 0,
        };
      }),
    });
  }

  // Default view = the live queue (not archived). `?archived=1` returns only the
  // soft-deleted rows so the admin can review / restore / permanently delete them.
  // Sorted by setup week ascending so the soonest-due work surfaces first.
  const archived = params.get("archived") === "1";

  let query = db
    .from("ad_campaign_requests")
    .select(ROW_SELECT)
    .order("requested_setup_week", { ascending: true })
    .limit(500);
  query = archived
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  const { data, error } = await query;

  if (error) {
    console.error("[admin/ad-boost] list failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requests = data ?? [];

  // Queue rows need enough communication truth to say what happens next
  // without opening each campaign. Batch successful sends by request_id so
  // legacy/missing marker columns can fall back to the canonical email log.
  type QueueCommunicationRow = {
    email_type: string;
    subject: string | null;
    status: string;
    created_at: string;
    delivered_at: string | null;
    bounced_at: string | null;
    metadata: Record<string, unknown> | null;
  };
  const communicationSummaryByRequest = new Map<
    string,
    {
      by_type: Record<string, { count: number; last_sent_at: string; last_subject: string | null }>;
      last: { email_type: string; subject: string | null; sent_at: string } | null;
    }
  >();
  if (requests.length > 0) {
    const requestIds = new Set(requests.map((row: { id: string }) => row.id));
    const { data: communicationRows, error: communicationError } = await db
      .from("email_log")
      .select("email_type, subject, status, created_at, delivered_at, bounced_at, metadata")
      .in("email_type", AD_BOOST_EMAIL_TYPES)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (communicationError) {
      console.error("[admin/ad-boost] queue communication summary failed:", communicationError);
    }
    for (const communication of ([...(communicationRows ?? [])].reverse()) as QueueCommunicationRow[]) {
      const requestId = communication.metadata?.request_id;
      if (
        typeof requestId !== "string" ||
        !requestIds.has(requestId) ||
        communication.bounced_at ||
        (communication.status !== "sent" && !communication.delivered_at)
      ) {
        continue;
      }
      const sentAt = communication.delivered_at ?? communication.created_at;
      const summary = communicationSummaryByRequest.get(requestId) ?? { by_type: {}, last: null };
      const existing = summary.by_type[communication.email_type];
      summary.by_type[communication.email_type] = {
        count: (existing?.count ?? 0) + 1,
        last_sent_at: sentAt,
        last_subject: communication.subject,
      };
      summary.last = {
        email_type: communication.email_type,
        subject: communication.subject,
        sent_at: sentAt,
      };
      communicationSummaryByRequest.set(requestId, summary);
    }
  }

  // Attach the ROI signal: families delivered per campaign (benefits_completed
  // events tagged with the campaign's utm_campaign). The effective tag is
  // `campaign_tag || id` — the same value the copy-URL and ad links use — so
  // counting stays correct even before a campaign_tag is explicitly persisted.
  const tags = requests.map(
    (r: { id: string; campaign_tag: string | null }) => r.campaign_tag || r.id,
  );
  const [delivered, adLandings] = await Promise.all([
    countDeliveredByCampaign(db, tags),
    countAdLandingsByCampaign(db, tags),
  ]);

  // Questions per campaign for the queue rows — same since-launch window the
  // provider-facing counter uses, batched as ONE query across all campaigns
  // (per-row getCampaignQuestions would be N round-trips). Pre-launch rows
  // read 0 and the UI renders a dash.
  const questionsByRequestId: Record<string, number> = {};
  const questionTopicsByRequestId: Record<string, Set<string>> = {};
  {
    type ListRow = {
      id: string;
      provider_id: string | null;
      provider_slug: string | null;
      status: string;
      requested_setup_week: string | null;
      flight_start_date: string | null;
      created_at: string;
      campaign_tag: string | null;
    };
    const launched = (requests as ListRow[]).filter(
      (r) => r.status === "live" || r.status === "ended",
    );
    if (launched.length > 0) {
      const sinceByRequest = new Map(
        launched.map((r) => [
          r.id,
          new Date(r.flight_start_date || r.requested_setup_week || r.created_at).toISOString(),
        ]),
      );
      const tagByRequest = new Map(
        launched.map((r) => [r.id, r.campaign_tag || r.id]),
      );
      const variantToRequestIds = new Map<string, string[]>();
      for (const r of launched) {
        for (const v of [r.provider_slug, r.provider_id]) {
          if (!v) continue;
          const list = variantToRequestIds.get(v) ?? [];
          list.push(r.id);
          variantToRequestIds.set(v, list);
        }
      }
      const minSince = [...sinceByRequest.values()].sort()[0];
      const { data: qRows } = await db
        .from("provider_question_asks")
        .select("provider_id, question_id, utm_source, utm_campaign, created_at")
        .in("provider_id", [...variantToRequestIds.keys()])
        .gte("created_at", minSince)
        .limit(5000);
      type AskRow = {
        provider_id: string | null;
        question_id: string;
        utm_source: string | null;
        utm_campaign: string | null;
        created_at: string;
      };
      const rawAsks = (qRows ?? []) as AskRow[];
      const questionIds = [...new Set(rawAsks.map((ask) => ask.question_id))];
      const { data: topicRows } = questionIds.length > 0
        ? await db.from("provider_questions").select("id, status").in("id", questionIds)
        : { data: [] as Array<{ id: string; status: string }> };
      const manageableQuestionIds = new Set(
        (topicRows ?? [])
          .filter((topic) => topic.status !== "archived" && topic.status !== "rejected")
          .map((topic) => topic.id),
      );
      const asksByRequest = new Map<string, AskRow[]>();
      for (const q of rawAsks) {
        if (!q.provider_id) continue;
        if (!manageableQuestionIds.has(q.question_id)) continue;
        // Compare as epochs, not strings — Postgres returns "+00:00"-suffixed
        // timestamps while `since` is Z-format, and mixed-format lexicographic
        // comparison misjudges boundary rows.
        const qAt = new Date(q.created_at).getTime();
        for (const requestId of variantToRequestIds.get(q.provider_id) ?? []) {
          const since = sinceByRequest.get(requestId);
          if (since && qAt >= new Date(since).getTime()) {
            const asks = asksByRequest.get(requestId) ?? [];
            asks.push(q);
            asksByRequest.set(requestId, asks);
          }
        }
      }
      for (const request of launched) {
        const asks = asksByRequest.get(request.id) ?? [];
        const campaignTag = tagByRequest.get(request.id);
        const tagged = asks.filter(
          (ask) => ask.utm_source === "olera_managed" && ask.utm_campaign === campaignTag,
        );
        const attributed = tagged.length > 0 ? tagged : asks;
        questionsByRequestId[request.id] = attributed.length;
        questionTopicsByRequestId[request.id] = new Set(
          attributed.map((ask) => ask.question_id),
        );
      }
    }
  }

  const withRoi = requests.map((r: { id: string; campaign_tag: string | null }) => ({
    ...r,
    delivered: delivered[r.campaign_tag || r.id] ?? 0,
    ad_landings: adLandings[r.campaign_tag || r.id] ?? 0,
    questions_received: questionsByRequestId[r.id] ?? 0,
    question_topics: questionTopicsByRequestId[r.id]?.size ?? 0,
    communication_summary: communicationSummaryByRequest.get(r.id) ?? { by_type: {}, last: null },
  }));

  // Tab counts (active vs archived) so both tabs show a number regardless of
  // which view is loaded. Cheap head-only count queries.
  const [{ count: activeCount }, { count: archivedCount }] = await Promise.all([
    db.from("ad_campaign_requests").select("*", { count: "exact", head: true }).is("deleted_at", null),
    db.from("ad_campaign_requests").select("*", { count: "exact", head: true }).not("deleted_at", "is", null),
  ]);

  return NextResponse.json({
    requests: withRoi,
    counts: { active: activeCount ?? 0, archived: archivedCount ?? 0 },
  });
}

/**
 * Validate an admin-supplied send time. The UI collects these as US Eastern
 * wall-clock and converts to UTC before posting (lib/eastern-time.ts), so what
 * arrives here is a plain UTC ISO string. `null` clears the schedule.
 *
 * The 30-day ceiling is a typo guard — a mis-keyed year would otherwise park
 * an email past the heat death of the campaign.
 */
function parseScheduleAt(
  value: unknown,
  label: string,
): { iso: string | null } | { error: string } {
  if (value === null) return { iso: null };
  if (typeof value !== "string") return { error: `${label} must be an ISO timestamp or null` };
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return { error: `${label} is not a valid timestamp` };
  // 60s of slack: the operator's clock and ours can disagree by a few seconds.
  if (at.getTime() < Date.now() - 60_000) {
    return { error: `${label} is in the past. Pick a future US Eastern time.` };
  }
  if (at.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
    return { error: `${label} is more than 30 days out` };
  }
  return { iso: at.toISOString() };
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  let body: {
    id?: unknown;
    status?: unknown;
    campaign_tag?: unknown;
    channel?: unknown;
    admin_note?: unknown;
    requested_setup_week?: unknown;
    archived?: unknown;
    ad_spend_cents?: unknown;
    ad_clicks?: unknown;
    ad_impressions?: unknown;
    platform_campaign_id?: unknown;
    ad_budget_cents?: unknown;
    ad_budget_type?: unknown;
    flight_start_date?: unknown;
    flight_end_date?: unknown;
    launched_email_scheduled_at?: unknown;
    send_launch_email?: unknown;
    promo_complete_email_scheduled_at?: unknown;
    send_promo_complete_email?: unknown;
    photo_readiness_status?: unknown;
    photo_review_note?: unknown;
    send_photo_email?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    update.status = body.status;
  }

  if (body.channel !== undefined) {
    if (body.channel === null) {
      update.channel = null;
    } else if (typeof body.channel !== "string" || !VALID_CHANNELS.includes(body.channel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${VALID_CHANNELS.join(", ")}` },
        { status: 400 },
      );
    } else {
      update.channel = body.channel;
    }
  }

  if (body.campaign_tag !== undefined) {
    update.campaign_tag =
      typeof body.campaign_tag === "string" && body.campaign_tag.trim()
        ? body.campaign_tag.trim()
        : null;
  }

  // The Google campaign id this flight maps to. The hourly sync joins on this
  // and ONLY this -- it refuses to match on campaign name, because attaching one
  // provider's spend to another provider's row is the worst thing that endpoint
  // could do. So an unmapped flight silently syncs nothing, which is how a live
  // campaign ends up with hand-typed figures the provider-facing gate then
  // withholds. Until now the column was settable only by raw SQL: migration 226
  // backfilled 17 by hand and every new flight needs another.
  /** Set when this request assigns a NEW mapping; checked for collisions below,
   *  once the db client exists. */
  let pendingPlatformId: string | null = null;
  if (body.platform_campaign_id !== undefined) {
    const raw =
      typeof body.platform_campaign_id === "string" ? body.platform_campaign_id.trim() : "";
    if (body.platform_campaign_id === null || raw === "") {
      update.platform_campaign_id = null;
    } else if (!/^\d{6,25}$/.test(raw)) {
      // Platform campaign ids are numeric on all three networks. Rejecting
      // anything else catches the obvious paste error -- a campaign NAME, or a
      // whole dashboard URL -- before it becomes a mapping that silently
      // matches nothing forever.
      return NextResponse.json(
        { error: "platform_campaign_id must be the numeric campaign id from the ad platform, or empty to clear" },
        { status: 400 },
      );
    } else {
      update.platform_campaign_id = raw;
      pendingPlatformId = raw;
    }
  }

  if (body.admin_note !== undefined) {
    update.admin_note =
      typeof body.admin_note === "string" ? body.admin_note : null;
  }

  if (body.photo_readiness_status !== undefined) {
    if (
      typeof body.photo_readiness_status !== "string" ||
      !VALID_PHOTO_READINESS.includes(body.photo_readiness_status)
    ) {
      return NextResponse.json(
        { error: `photo_readiness_status must be one of: ${VALID_PHOTO_READINESS.join(", ")}` },
        { status: 400 },
      );
    }
    // `review_requested` belongs to the provider after they save new photos.
    // Admins can request an update, clear it, or reset the review; they should
    // not impersonate that provider signal.
    if (body.photo_readiness_status === "review_requested") {
      return NextResponse.json(
        { error: "review_requested is set by the provider after they update their gallery" },
        { status: 400 },
      );
    }
    update.photo_readiness_status = body.photo_readiness_status;
  }

  if (body.photo_review_note !== undefined) {
    update.photo_review_note =
      typeof body.photo_review_note === "string" && body.photo_review_note.trim()
        ? body.photo_review_note.trim()
        : null;
  }

  if (body.flight_end_date !== undefined) {
    if (body.flight_end_date === null) {
      update.flight_end_date = null;
    } else if (
      typeof body.flight_end_date !== "string" ||
      Number.isNaN(new Date(body.flight_end_date).getTime())
    ) {
      return NextResponse.json({ error: "flight_end_date must be a date string or null" }, { status: 400 });
    } else {
      update.flight_end_date = body.flight_end_date.slice(0, 10);
    }
  }

  if (body.flight_start_date !== undefined) {
    if (body.flight_start_date === null) {
      update.flight_start_date = null;
    } else if (
      typeof body.flight_start_date !== "string" ||
      Number.isNaN(new Date(body.flight_start_date).getTime())
    ) {
      return NextResponse.json({ error: "flight_start_date must be a date string or null" }, { status: 400 });
    } else {
      update.flight_start_date = body.flight_start_date.slice(0, 10);
    }
  }

  if (body.ad_budget_cents !== undefined) {
    if (body.ad_budget_cents === null) {
      update.ad_budget_cents = null;
    } else if (
      typeof body.ad_budget_cents !== "number" ||
      !Number.isInteger(body.ad_budget_cents) ||
      body.ad_budget_cents <= 0
    ) {
      return NextResponse.json(
        { error: "ad_budget_cents must be a positive integer or null" },
        { status: 400 },
      );
    } else {
      update.ad_budget_cents = body.ad_budget_cents;
    }
  }

  if (body.ad_budget_type !== undefined) {
    if (body.ad_budget_type === null) {
      update.ad_budget_type = null;
    } else if (
      typeof body.ad_budget_type !== "string" ||
      !VALID_BUDGET_TYPES.includes(body.ad_budget_type)
    ) {
      return NextResponse.json(
        { error: `ad_budget_type must be one of: ${VALID_BUDGET_TYPES.join(", ")}` },
        { status: 400 },
      );
    } else {
      update.ad_budget_type = body.ad_budget_type;
    }
  }

  if (body.requested_setup_week !== undefined) {
    if (typeof body.requested_setup_week !== "string") {
      return NextResponse.json({ error: "requested_setup_week must be a date string" }, { status: 400 });
    }
    const parsed = new Date(body.requested_setup_week);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "requested_setup_week is not a valid date" }, { status: 400 });
    }
    update.requested_setup_week = body.requested_setup_week.slice(0, 10);
  }

  // Manual performance entry (spend in cents, click count, impressions). Any
  // may be null to clear it; otherwise must be a non-negative integer.
  for (const field of ["ad_spend_cents", "ad_clicks", "ad_impressions"] as const) {
    if (body[field] !== undefined) {
      const v = body[field];
      if (v === null) {
        update[field] = null;
      } else if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
        return NextResponse.json(
          { error: `${field} must be a non-negative integer or null` },
          { status: 400 },
        );
      } else {
        update[field] = v;
      }
    }
  }
  // Any metric touched — including cleared back to null — is a fresh reading of
  // the ad dashboard, so it re-dates all three. Without this the figures have
  // no age and a week-old snapshot is indistinguishable from this morning's.
  if (
    body.ad_spend_cents !== undefined ||
    body.ad_clicks !== undefined ||
    body.ad_impressions !== undefined
  ) {
    update.metrics_updated_at = new Date().toISOString();
    // ...and stamps them `verified`: an admin read them off the ad platform
    // just now and entered them deliberately. That is what earns them the
    // provenance gate on the receipt and the dashboard hero, which otherwise
    // withhold anything not machine-synced.
    //
    // This ALSO closes a laundering hole. Until now this branch re-dated the
    // figures but never touched `metrics_source`, so typing over a row the
    // script had synced left it still claiming `script` -- hand-entered numbers
    // wearing the sync's credibility, with nothing in the record to say so.
    // Now every manual entry says what it is.
    //
    // The historical `typed` rows stay `typed` and stay withheld. They are the
    // reason the gate exists (Edmonds Villa's August flight read $0.00 / 4
    // impressions against a real $43.52 / 391) and nobody has re-checked them.
    // Re-entering one here is exactly how it gets released.
    update.metrics_source = "verified";
  }

  // Launch-email schedule (UTC ISO; the admin UI collects it as US Eastern).
  // A set time makes the live flip store the schedule instead of emailing the
  // provider immediately — the hourly ad-boost-launch-scheduler cron delivers
  // it once due. Null clears the schedule (the email then only goes out via
  // an explicit send_launch_email).
  if (body.launched_email_scheduled_at !== undefined) {
    const parsed = parseScheduleAt(body.launched_email_scheduled_at, "Launch email time");
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update.launched_email_scheduled_at = parsed.iso;
  }

  // Wrap-up (promo-complete) email schedule. Unlike the launch email this one
  // is normally set for you — the flip to `ended` parks it at the next
  // business morning — but the admin can re-time it to any US Eastern moment,
  // or null it out to cancel the send entirely.
  if (body.promo_complete_email_scheduled_at !== undefined) {
    const parsed = parseScheduleAt(body.promo_complete_email_scheduled_at, "Wrap-up email time");
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update.promo_complete_email_scheduled_at = parsed.iso;
  }

  if (body.send_launch_email !== undefined && body.send_launch_email !== true) {
    return NextResponse.json({ error: "send_launch_email must be true when present" }, { status: 400 });
  }

  if (body.send_promo_complete_email !== undefined && body.send_promo_complete_email !== true) {
    return NextResponse.json(
      { error: "send_promo_complete_email must be true when present" },
      { status: 400 },
    );
  }

  if (
    body.send_photo_email !== undefined &&
    body.send_photo_email !== "update_requested" &&
    body.send_photo_email !== "ready"
  ) {
    return NextResponse.json(
      { error: "send_photo_email must be update_requested or ready" },
      { status: 400 },
    );
  }

  // Soft delete (archive) / restore. `archived: true` sets deleted_at = now() so
  // the request drops out of the default queue but the record is kept; `false`
  // clears it (restore). Hard delete is the separate DELETE handler.
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
    }
    update.deleted_at = body.archived ? new Date().toISOString() : null;
  }

  const db = getServiceClient();

  // NO TWO ROWS MAY SHARE A PLATFORM CAMPAIGN ID. The ingest updates by
  // platform_campaign_id with no limit, so a duplicate means one campaign's
  // figures get written onto two flights at once. Not hypothetical: HomeWell
  // Oak Ridge is one Google campaign behind two Olera flights, and migration
  // 226 worked around it by deliberately leaving the second flight unmapped.
  // Catch it at entry rather than in a provider's receipt.
  if (pendingPlatformId) {
    const [{ data: dupProvider }, { data: dupCity }] = await Promise.all([
      db
        .from("ad_campaign_requests")
        .select("id, display_name, campaign_tag")
        .eq("platform_campaign_id", pendingPlatformId)
        .is("deleted_at", null)
        .neq("id", body.id)
        .limit(1),
      db
        .from("city_campaigns")
        .select("id, slug")
        .eq("platform_campaign_id", pendingPlatformId)
        .limit(1),
    ]);
    const clash = dupProvider?.[0] ?? dupCity?.[0];
    if (clash) {
      const who =
        "display_name" in clash
          ? `${clash.display_name} (${clash.campaign_tag || clash.id})`
          : `city campaign ${(clash as { slug: string }).slug}`;
      return NextResponse.json(
        {
          error: `Campaign ${pendingPlatformId} is already mapped to ${who}. One ad-platform campaign cannot back two flights -- the sync would write its figures onto both. Enter this flight's figures by hand instead: they are stamped verified and the sync leaves them alone.`,
        },
        { status: 409 },
      );
    }
  }

  const { data: current, error: currentError } = await db
    .from("ad_campaign_requests")
    .select(ROW_SELECT)
    .eq("id", body.id)
    .maybeSingle();
  if (currentError) {
    console.error("[admin/ad-boost] current fetch failed:", currentError);
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const effectiveFlightStart =
    update.flight_start_date === undefined
      ? current.flight_start_date
      : (update.flight_start_date as string | null);
  const effectiveFlightEnd =
    update.flight_end_date === undefined
      ? current.flight_end_date
      : (update.flight_end_date as string | null);
  if (
    effectiveFlightStart &&
    effectiveFlightEnd &&
    effectiveFlightStart > effectiveFlightEnd
  ) {
    return NextResponse.json(
      { error: "Flight end must be on or after flight start" },
      { status: 400 },
    );
  }
  const effectiveBudgetCents =
    update.ad_budget_cents === undefined
      ? current.ad_budget_cents
      : (update.ad_budget_cents as number | null);
  const effectiveBudgetType =
    update.ad_budget_type === undefined
      ? current.ad_budget_type
      : (update.ad_budget_type as string | null);
  if ((effectiveBudgetCents == null) !== (effectiveBudgetType == null)) {
    return NextResponse.json(
      { error: "Ad-platform budget amount and control must be set or cleared together" },
      { status: 400 },
    );
  }

  const changingPhotoStatus =
    typeof update.photo_readiness_status === "string" &&
    update.photo_readiness_status !== current.photo_readiness_status;
  if (changingPhotoStatus) {
    update.photo_reviewed_at = new Date().toISOString();
    update.photo_reviewed_by = adminUser.id;
    if (update.photo_readiness_status === "update_requested") {
      update.photo_update_requested_at = new Date().toISOString();
      update.photo_update_submitted_at = null;
      // A provider can make a sincere update that still needs one more pass.
      // Each new HUMAN review cycle gets one initial email + one reminder;
      // nothing loops automatically. Clear the prior cycle even when an admin
      // first reopened `ready` to `unreviewed`, then requested another update.
      update.photo_nudge_email_sent_at = null;
      update.photo_reminder_email_sent_at = null;
      update.photo_ready_email_sent_at = null;
    }
  }

  // Paid traffic cannot be scheduled or launched until a concierge has
  // reviewed the effective landing-page photos. Existing live/ended rows are
  // left alone; this guard applies only when an admin advances a campaign.
  const effectivePhotoReadiness =
    (update.photo_readiness_status as string | undefined) ?? current.photo_readiness_status;
  if (
    typeof update.status === "string" &&
    update.status !== current.status &&
    ["scheduled", "live"].includes(update.status) &&
    !["live", "ended"].includes(current.status) &&
    effectivePhotoReadiness !== "ready"
  ) {
    return NextResponse.json(
      { error: "Review and approve the campaign photos before scheduling or launching" },
      { status: 409 },
    );
  }
  if (
    body.send_photo_email === "update_requested" &&
    effectivePhotoReadiness !== "update_requested"
  ) {
    return NextResponse.json({ error: "Campaign is not waiting on a photo update" }, { status: 409 });
  }
  if (body.send_photo_email === "ready" && effectivePhotoReadiness !== "ready") {
    return NextResponse.json({ error: "Campaign photos are not marked ready" }, { status: 409 });
  }

  // Scheduling and send-now only make sense while the launch email is unsent.
  // The idempotency marker would make a stray schedule harmless (the cron
  // filters on launched_email_sent_at IS NULL), but reject it here so the UI
  // can't show a scheduled time that will never fire.
  if (current.launched_email_sent_at) {
    if (typeof update.launched_email_scheduled_at === "string") {
      return NextResponse.json(
        { error: "Launch email already sent — nothing to schedule" },
        { status: 400 },
      );
    }
    if (body.send_launch_email === true) {
      return NextResponse.json({ error: "Launch email already sent" }, { status: 400 });
    }
  }

  const effectiveStatus = (update.status as string | undefined) ?? current.status;
  if (body.send_launch_email === true) {
    if (effectiveStatus !== "live") {
      return NextResponse.json(
        { error: "Campaign must be live to send the launch email" },
        { status: 400 },
      );
    }
    // Sending now supersedes any stored schedule.
    update.launched_email_scheduled_at = null;
  }

  // Same two guards for the wrap-up: nothing to schedule or send once it's out.
  if (current.promo_complete_email_sent_at) {
    if (typeof update.promo_complete_email_scheduled_at === "string") {
      return NextResponse.json(
        { error: "Wrap-up email already sent — nothing to schedule" },
        { status: 400 },
      );
    }
    if (body.send_promo_complete_email === true) {
      return NextResponse.json({ error: "Wrap-up email already sent" }, { status: 400 });
    }
  }

  if (body.send_promo_complete_email === true) {
    if (effectiveStatus !== "ended") {
      return NextResponse.json(
        { error: "Campaign must be ended to send the wrap-up email" },
        { status: 400 },
      );
    }
    // Sending now supersedes any stored schedule.
    update.promo_complete_email_scheduled_at = null;
  }

  // Ending the campaign by hand. The wrap-up isn't fired here — it's parked at
  // the next 10:15 AM ET business morning, the same slot the auto-end cron
  // uses, so a flight closed out at midnight from Bangkok still reaches the
  // provider over their coffee. "Send now" (above) is the override.
  const endingNow = update.status === "ended" && current.status !== "ended";
  if (endingNow) {
    update.ended_at = new Date().toISOString();
    update.ended_reason = "admin";
    if (
      !current.promo_complete_email_sent_at &&
      body.send_promo_complete_email !== true &&
      update.promo_complete_email_scheduled_at === undefined
    ) {
      update.promo_complete_email_scheduled_at = nextBusinessSlotEt();
    }
  }

  // Un-ending a campaign (reopened, or ended by mistake) retracts the whole
  // ending: the stamps go away and any pending wrap-up is cancelled rather
  // than left to fire against a campaign that is live again.
  if (update.status !== undefined && update.status !== "ended" && current.status === "ended") {
    update.ended_at = null;
    update.ended_reason = null;
    update.promo_complete_email_scheduled_at = null;
  }

  // When launching (status -> live) with no tag yet, default the campaign_tag to
  // the request id so attribution always has a stable, persisted key. The admin
  // page always sends campaign_tag (null when the field is empty), so we resolve
  // the *effective* tag — what it'll be after this update, or the current value
  // if untouched — and only default when that's still empty.
  if (update.status === "live") {
    let effectiveTag = update.campaign_tag as string | null | undefined;
    if (effectiveTag === undefined) {
      effectiveTag = current?.campaign_tag ?? null;
    }
    if (!effectiveTag) {
      update.campaign_tag = body.id;
    }
  }

  const { data, error } = await db
    .from("ad_campaign_requests")
    .update(update)
    .eq("id", body.id)
    .select(ROW_SELECT)
    .single();

  if (error || !data) {
    console.error("[admin/ad-boost] update failed:", error);
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  const metricsWereSaved =
    body.ad_spend_cents !== undefined ||
    body.ad_clicks !== undefined ||
    body.ad_impressions !== undefined;
  // "Getting activity" should mean observable campaign activity, not merely
  // that an operator opened the metrics form and saved zero/partial values.
  // Impressions alone are not shown in the traction email; spend or clicks are.
  //
  // Measured landings count too, and they are the signal that does not go
  // stale. Operator-entered figures are a snapshot of whenever someone last
  // opened the ad dashboard: Rosemonte and Edmonds both had 0 typed on Aug 14
  // and then took 10 and 3 real ad-driven landings over the following days,
  // which under a typed-only gate is indistinguishable from a dead campaign.
  //
  // Evaluated lazily — countAdLandingsByCampaign scans the managed-traffic
  // slice of provider_activity, and this PATCH also serves status flips, notes
  // and photo review, none of which need it.
  const typedTraction = (data.ad_spend_cents ?? 0) > 0 || (data.ad_clicks ?? 0) > 0;
  const tractionEmailDue =
    data.status === "live" &&
    metricsWereSaved &&
    (typedTraction ||
      ((await countAdLandingsByCampaign(db, [data.campaign_tag || data.id]))[
        data.campaign_tag || data.id
      ] ?? 0) > 0);
  const lifecycleSends: Array<Promise<unknown>> = [];

  if (
    data.photo_readiness_status === "update_requested" &&
    (current.photo_readiness_status !== "update_requested" || body.send_photo_email === "update_requested")
  ) {
    lifecycleSends.push(sendAdBoostPhotoEmail({ request: data, kind: "update_requested" }));
  }

  if (
    data.photo_readiness_status === "ready" &&
    (["update_requested", "review_requested"].includes(current.photo_readiness_status) ||
      body.send_photo_email === "ready")
  ) {
    lifecycleSends.push(sendAdBoostPhotoEmail({ request: data, kind: "ready" }));
  }

  // Going live emails the provider immediately UNLESS a launch-email time is
  // in play (set in this save or already stored) — then the hourly cron owns
  // the send. `send_launch_email: true` is the explicit fire-now override.
  const launchEmailScheduled = data.launched_email_scheduled_at != null;
  const wentLive = data.status === "live" && current.status !== "live";
  if ((wentLive && !launchEmailScheduled) || body.send_launch_email === true) {
    lifecycleSends.push(sendAdBoostLifecycleEmail({ request: data, kind: "launched" }));
  }

  if (tractionEmailDue) {
    lifecycleSends.push(sendAdBoostLifecycleEmail({ request: data, kind: "traction" }));
  }

  // The wrap-up only fires inline on the explicit Send-now override. An
  // ordinary flip to `ended` leaves it to the hourly ad-boost-end-scheduler
  // cron at the scheduled slot — see the endingNow block above.
  if (body.send_promo_complete_email === true) {
    lifecycleSends.push(sendAdBoostLifecycleEmail({ request: data, kind: "promo_complete" }));
  }

  if (lifecycleSends.length > 0) {
    await Promise.all(lifecycleSends);
  }

  return NextResponse.json({ request: data });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  // Accept the id from the query string (?id=) or a JSON body, so this works
  // from the admin UI fetch as well as a manual browser/cURL scrub.
  let id = new URL(request.url).searchParams.get("id");
  if (!id) {
    try {
      const body = await request.json();
      if (typeof body?.id === "string") id = body.id;
    } catch {
      /* no body — fall through to the missing-id error */
    }
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db.from("ad_campaign_requests").delete().eq("id", id);

  if (error) {
    console.error("[admin/ad-boost] delete failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

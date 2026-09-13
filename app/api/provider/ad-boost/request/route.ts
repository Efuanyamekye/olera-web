import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { loadAdBoostEligibility } from "@/lib/ad-boost/eligibility.server";
import { countDeliveredByCampaign, getCampaignStats, getCampaignQuestions } from "@/lib/ad-boost/delivered.server";
import { getCampaignReceipt } from "@/lib/ad-boost/receipts.server";
import { sendAdBoostRequestEmail } from "@/lib/ad-boost/notifications.server";
import { sendSlackAlert, slackAdBoostRequested } from "@/lib/slack";
import { BUDGET_VALUES } from "@/lib/ad-boost/estimate";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";

/**
 * Provider Paid Ad Boost (Managed Lead-Gen, concierge v1) — campaign request.
 *
 * POST: an eligibility-cleared provider submits a request to have us run a paid
 *   external ad campaign (Google/Meta) to their Olera page, choosing a setup
 *   week. Gated server-side on profile completeness (>=70%) so a client can't
 *   bypass the gate. Persists to `ad_campaign_requests` and pings the concierge
 *   team in Slack.
 * GET: returns the caller's current eligibility + their latest request (if any),
 *   so the Boost surface can render the gate / picker / "requested" state.
 *
 * Auth: authenticated provider only (handled by loadAdBoostEligibility).
 */

// Truly in-motion (concierge is working it). pending_profile is queued-but-not-
// yet-actionable and is handled separately (it can still block a duplicate and
// it auto-promotes when the provider crosses the completeness threshold).
const OPEN_STATUSES = ["requested", "scheduled", "live"];
const VALID_CHANNELS = ["google", "meta", "both"];
const DEMAND_WINDOW_DAYS = 7;
// The intro's value event: the wrap-up ask arms at this many delivered leads.
const WRAPUP_LEADS_THRESHOLD = 3;
const REQUEST_RETURN_SELECT =
  "id, status, requested_setup_week, channel, intended_monthly_budget, campaign_tag, created_at, plan_status, plan_value, promo_complete_email_sent_at, flight_start_date, flight_end_date, ad_budget_cents, ad_budget_type, ad_impressions, ad_clicks, ad_spend_cents, metrics_source, provider_reported_outcome, photo_readiness_status, photo_update_requested_at, photo_update_submitted_at";

export async function GET() {
  const elig = await loadAdBoostEligibility();
  if (!elig.ok) {
    return NextResponse.json({ error: elig.error }, { status: elig.status });
  }

  const db = getServiceClient();
  const demand = await loadDemandSignal(db, {
    city: elig.city,
    state: elig.state,
    category: elig.category,
  });

  let { data: latest } = await db
    .from("ad_campaign_requests")
    .select(REQUEST_RETURN_SELECT)
    .eq("provider_id", elig.profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Standing-order release: a campaign queued under 70% (or unverified) auto-
  // promotes the moment the provider crosses the threshold AND verifies. We
  // re-check on every boost-page load (profile saves are client-direct with no
  // server hook, so this is the promotion point), flip pending_profile ->
  // requested, and page the concierge now — not at submit — so the queue only
  // ever holds actionable work.
  if (latest && latest.status === "pending_profile" && elig.eligibility.eligible && elig.isVerified) {
    const { data: promoted } = await db
      .from("ad_campaign_requests")
      .update({
        status: "requested",
        completeness_at_submit: elig.eligibility.overall,
        updated_at: new Date().toISOString(),
      })
      .eq("id", latest.id)
      .eq("status", "pending_profile") // guard against a double-promote race
      .select(REQUEST_RETURN_SELECT)
      .maybeSingle();

    if (promoted) {
      latest = promoted;
      const alert = slackAdBoostRequested({
        requestId: promoted.id,
        providerName: elig.displayName ?? elig.slug,
        providerSlug: elig.slug,
        city: elig.city,
        state: elig.state,
        category: elig.category,
        completeness: elig.eligibility.overall,
        setupWeek: promoted.requested_setup_week,
        channel: promoted.channel,
        budget: promoted.intended_monthly_budget,
        launchReady: true,
      });
      await sendSlackAlert(alert.text, alert.blocks);
      await sendAdBoostRequestEmail({
        requestId: promoted.id,
        kind: "promotion",
        providerName: elig.displayName ?? elig.slug,
        providerSlug: elig.slug,
        providerEmail: elig.email,
        setupWeek: promoted.requested_setup_week,
        channel: promoted.channel,
        intendedMonthlyBudget: promoted.intended_monthly_budget,
        completeness: elig.eligibility.overall,
        eligibility: elig.eligibility,
        isVerified: elig.isVerified,
        recipientProfileId: elig.profileId,
      });
    }
  }

  // Families delivered so far by this provider's campaign (ROI for the
  // "we're on it" state). Effective tag is `campaign_tag || id` — matching the
  // ad links — so the count is correct whether or not a tag was set explicitly.
  let delivered = 0;
  if (latest) {
    const tag = latest.campaign_tag || latest.id;
    const counts = await countDeliveredByCampaign(db, [tag]);
    delivered = counts[tag] ?? 0;
  }

  // Real campaign performance for the live panel: visitors + leads on this
  // provider's page since launch. Only meaningful once the campaign is live and
  // actually driving traffic; pre-live it's null and the UI shows a "numbers
  // arrive once live" state. Launch anchor = the actual platform start when
  // present, then the requested setup week for legacy rows.
  let campaignStats:
    | { visitors: number; leads: number; questions: { received: number; unanswered: number }; since: string }
    | null = null;
  let receipt: Awaited<ReturnType<typeof getCampaignReceipt>> | null = null;
  // Ended campaigns keep their stats too — the wrap-up moment leads with them.
  if (latest && (latest.status === "live" || latest.status === "ended")) {
    const since = new Date(
      latest.flight_start_date || latest.requested_setup_week || latest.created_at,
    ).toISOString();
    const providerIdVariants = [elig.slug, elig.profileId];
    // Questions are campaign engagement too — counted the same since-launch way
    // as visitors/leads. Parallel with the page-traffic query. The receipt
    // (demand + outcomes) is composed from the same readers, so every surface
    // shows one set of numbers.
    const [stats, questions, fullReceipt] = await Promise.all([
      getCampaignStats(db, { providerIdVariants, since }),
      getCampaignQuestions(db, {
        providerIdVariants,
        since,
        campaignTag: latest.campaign_tag || latest.id,
      }),
      getCampaignReceipt(db, {
        id: latest.id,
        provider_id: elig.profileId,
        provider_slug: elig.slug,
        campaign_tag: latest.campaign_tag,
        requested_setup_week: latest.requested_setup_week,
        flight_start_date: latest.flight_start_date,
        created_at: latest.created_at,
        ad_impressions: latest.ad_impressions ?? null,
        ad_clicks: latest.ad_clicks ?? null,
        ad_spend_cents: latest.ad_spend_cents ?? null,
        // Without this the receipt cannot tell a synced figure from one a human
        // typed, and this payload goes to the provider's own screen.
        metrics_source: latest.metrics_source ?? null,
        provider_reported_outcome: latest.provider_reported_outcome ?? null,
      }),
    ]);
    campaignStats = { ...stats, questions, since };
    // Providers see their leads on /provider/connections — the receipt payload
    // carries only the rollups.
    receipt = { ...fullReceipt, leads: [] };
  }

  // The wrap-up payment moment (Phase 2) arms on a VALUE EVENT, never a
  // calendar: the intro delivered its 3rd inquiry, or the concierge marked the
  // promo complete (promo_complete_email_sent_at). Only for campaigns that ran
  // and have no plan yet. Live campaigns also expose the same plan chooser;
  // this flag controls the featured results-led payment moment.
  // Never re-arm for an active plan OR a past_due one — past_due means Stripe
  // is dunning the existing subscription; showing the ask again would let the
  // provider create a second subscription on top of it.
  const wrapupReady = !!(
    latest &&
    (latest.status === "live" || latest.status === "ended") &&
    (latest.plan_status == null || latest.plan_status === "canceled") &&
    (latest.promo_complete_email_sent_at != null ||
      (campaignStats?.leads ?? 0) >= WRAPUP_LEADS_THRESHOLD)
  );

  return NextResponse.json({
    eligibility: elig.eligibility,
    isVerified: elig.isVerified,
    provider: {
      slug: elig.slug,
      displayName: elig.displayName,
      city: elig.city,
      state: elig.state,
      category: elig.category,
    },
    demand,
    request: latest ?? null,
    delivered,
    campaignStats,
    wrapupReady,
    receipt: receipt
      ? {
          google: receipt.google,
          engagement: receipt.engagement,
          outcomes: receipt.outcomes,
          expectedLeads: receipt.expectedLeads,
          week: receipt.week,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const elig = await loadAdBoostEligibility();
  if (!elig.ok) {
    return NextResponse.json({ error: elig.error }, { status: elig.status });
  }

  // Standing-order model: a provider can queue a campaign at any completeness.
  // Under 70% it lands as `pending_profile` (queued, concierge NOT paged); it
  // auto-promotes to `requested` the moment they cross the threshold AND verify
  // (see GET). Both completeness AND verification gate the *launch*, not entry.
  // No 403; commitment-first is the whole point.
  const queued = !elig.eligibility.eligible || !elig.isVerified;

  let body: { setupWeek?: unknown; channel?: unknown; intendedMonthlyBudget?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate setup week ──
  if (typeof body.setupWeek !== "string" || !body.setupWeek.trim()) {
    return NextResponse.json({ error: "setupWeek is required" }, { status: 400 });
  }
  const parsed = new Date(body.setupWeek);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "setupWeek is not a valid date" }, { status: 400 });
  }
  // Must not be in the past (compare on the date, ignoring time-of-day).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed < today) {
    return NextResponse.json({ error: "setupWeek cannot be in the past" }, { status: 400 });
  }
  const setupWeek = parsed.toISOString().slice(0, 10); // YYYY-MM-DD for the DATE column

  // ── Validate optional channel ──
  let channel: string | null = null;
  if (body.channel != null) {
    if (typeof body.channel !== "string" || !VALID_CHANNELS.includes(body.channel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${VALID_CHANNELS.join(", ")}` },
        { status: 400 },
      );
    }
    channel = body.channel;
  }

  // ── Validate optional intended budget ── (non-binding; seeds the concierge
  // conversation, NOT a charge). Allowlisted to the budget stops so the value is
  // always concrete — an arbitrary number can't sneak in.
  let intendedMonthlyBudget: number | null = null;
  if (body.intendedMonthlyBudget != null) {
    if (
      typeof body.intendedMonthlyBudget !== "number" ||
      !BUDGET_VALUES.includes(body.intendedMonthlyBudget)
    ) {
      return NextResponse.json(
        { error: `intendedMonthlyBudget must be one of: ${BUDGET_VALUES.join(", ")}` },
        { status: 400 },
      );
    }
    intendedMonthlyBudget = body.intendedMonthlyBudget;
  }

  const db = getServiceClient();

  // ── Enforce the one-time introductory campaign ──────────────────────────
  // The offer and terms promise one free intro per provider. Checking only
  // active statuses created a race after auto-end: until the buffered wrap-up
  // email was sent, the page fell back to Apply and POST accepted another $50
  // request. Any prior intro row now blocks at the API boundary too,
  // so a stale client or direct request cannot mint a second free flight.
  // A cancelled request is reopened by the concierge when appropriate rather
  // than minting another intro row. Hard-deleted test records are absent, while
  // archived real records still correctly count as the provider's one intro.
  const { data: previousRequests, error: historyError } = await db
    .from("ad_campaign_requests")
    .select(REQUEST_RETURN_SELECT)
    .eq("provider_id", elig.profileId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (historyError) {
    console.error("[ad-boost/request] intro history lookup failed:", historyError);
    return NextResponse.json({ error: "Could not verify campaign history" }, { status: 500 });
  }

  const existing = previousRequests?.[0] ?? null;

  if (existing) {
    const inProgress =
      existing.status === "pending_profile" || OPEN_STATUSES.includes(existing.status);
    return NextResponse.json(
      {
        error: inProgress
          ? "You already have an active campaign request"
          : "Your free introductory campaign has already been used. Choose a plan from your campaign results to continue.",
        request: existing,
        introUsed: !inProgress,
      },
      { status: 409 },
    );
  }

  // ── Insert the request ──
  const { data: inserted, error: insertError } = await db
    .from("ad_campaign_requests")
    .insert({
      provider_id: elig.profileId,
      provider_slug: elig.slug,
      display_name: elig.displayName,
      requested_setup_week: setupWeek,
      completeness_at_submit: elig.eligibility.overall,
      channel,
      intended_monthly_budget: intendedMonthlyBudget,
      status: queued ? "pending_profile" : "requested",
    })
    .select(REQUEST_RETURN_SELECT)
    .single();

  if (insertError || !inserted) {
    console.error("[ad-boost/request] insert failed:", insertError);
    return NextResponse.json({ error: "Failed to save request" }, { status: 500 });
  }

  // ── Instant sync to provider_growth_tracking ──
  // This ensures the provider appears in Provider Growth immediately, not after the hourly cron.
  try {
    const nowIso = new Date().toISOString();

    // Check if tracking record exists
    const { data: existingTracking } = await db
      .from("provider_growth_tracking")
      .select("id, ads_status")
      .eq("business_profile_id", elig.profileId)
      .maybeSingle();

    if (existingTracking) {
      // Update existing tracking record if ads_status is 'none'
      if (existingTracking.ads_status === "none") {
        await db
          .from("provider_growth_tracking")
          .update({
            ads_status: "free_intro",
            ads_free_intro_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", existingTracking.id);

        // Create touchpoint for audit trail
        await db.from("provider_growth_touchpoints").insert({
          tracking_id: existingTracking.id,
          business_profile_id: elig.profileId,
          touchpoint_type: "ads_converted",
          details: {
            ads_status: "free_intro",
            campaign_id: inserted.id,
            source: "ad_boost_request",
            instant_sync: true,
          },
        });
      }
    } else {
      // Create new tracking record for this provider
      const medjobsEligibility = detectMedjobsCatchment(elig.city, elig.state);

      // Fetch the actual claim date from business_profiles
      const { data: profile } = await db
        .from("business_profiles")
        .select("created_at, source")
        .eq("id", elig.profileId)
        .single();

      const claimedAt = profile?.created_at || nowIso;
      const claimSource = profile?.source === "new_org_signup" ? "new_org_signup" : "email";

      const { data: newTracking } = await db
        .from("provider_growth_tracking")
        .insert({
          business_profile_id: elig.profileId,
          claim_source: claimSource,
          claimed_at: claimedAt,
          pipeline_stage: "new_claim",
          pipeline_stage_changed_at: claimedAt,
          ads_status: "free_intro",
          ads_free_intro_at: nowIso,
          medjobs_eligible: medjobsEligibility.eligible,
          medjobs_catchment_university: medjobsEligibility.university,
        })
        .select("id")
        .single();

      if (newTracking) {
        // Create touchpoint for audit trail
        await db.from("provider_growth_touchpoints").insert({
          tracking_id: newTracking.id,
          business_profile_id: elig.profileId,
          touchpoint_type: "ads_converted",
          details: {
            ads_status: "free_intro",
            campaign_id: inserted.id,
            source: "ad_boost_request",
            instant_sync: true,
            tracking_created: true,
          },
        });
      }
    }
  } catch (syncErr) {
    // Non-blocking - don't fail the Ad Boost request if sync fails
    console.error("[ad-boost/request] provider_growth_tracking sync failed:", syncErr);
  }

  // ── Notify the concierge team — only for actionable (eligible) requests. ──
  // A pending_profile campaign is intentionally quiet: the team is paged when
  // it auto-promotes (GET), so the queue never fills with un-runnable work.
  // Awaited when sent: Vercel kills pending promises after the response returns
  // (memory feedback_serverless_fire_and_forget).
  if (!queued) {
    const alert = slackAdBoostRequested({
      requestId: inserted.id,
      providerName: elig.displayName ?? elig.slug,
      providerSlug: elig.slug,
      city: elig.city,
      state: elig.state,
      category: elig.category,
      completeness: elig.eligibility.overall,
      setupWeek,
      channel,
      budget: intendedMonthlyBudget,
    });
    await sendSlackAlert(alert.text, alert.blocks);
  }

  await sendAdBoostRequestEmail({
    requestId: inserted.id,
    kind: queued ? "queued" : "requested",
    providerName: elig.displayName ?? elig.slug,
    providerSlug: elig.slug,
    providerEmail: elig.email,
    setupWeek,
    channel,
    intendedMonthlyBudget,
    completeness: elig.eligibility.overall,
    eligibility: elig.eligibility,
    isVerified: elig.isVerified,
    recipientProfileId: elig.profileId,
  });

  return NextResponse.json({ ok: true, request: inserted, queued });
}

async function loadDemandSignal(
  db: ReturnType<typeof getServiceClient>,
  opts: { city: string | null; state: string | null; category: string | null },
): Promise<{
  count: number;
  scope: "city" | "state" | null;
  city: string | null;
  state: string | null;
  category: string | null;
  windowDays: number;
}> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - DEMAND_WINDOW_DAYS);
  const startDate = windowStart.toISOString().slice(0, 10);

  if (!opts.state || !opts.category) {
    return {
      count: 0,
      scope: null,
      city: opts.city,
      state: opts.state,
      category: opts.category,
      windowDays: DEMAND_WINDOW_DAYS,
    };
  }

  if (opts.city) {
    const cityCount = await sumPageViewDemand(db, {
      city: opts.city,
      state: opts.state,
      categories: demandCategoryVariants(opts.category),
      startDate,
    });
    if (cityCount >= 5) {
      return {
        count: cityCount,
        scope: "city",
        city: opts.city,
        state: opts.state,
        category: opts.category,
        windowDays: DEMAND_WINDOW_DAYS,
      };
    }
  }

  const stateCount = await sumPageViewDemand(db, {
    state: opts.state,
    categories: demandCategoryVariants(opts.category),
    startDate,
  });
  return {
    count: stateCount,
    scope: stateCount > 0 ? "state" : null,
    city: opts.city,
    state: opts.state,
    category: opts.category,
    windowDays: DEMAND_WINDOW_DAYS,
  };
}

async function sumPageViewDemand(
  db: ReturnType<typeof getServiceClient>,
  filter: {
    city?: string;
    state: string;
    categories: string[];
    startDate: string;
  },
): Promise<number> {
  let query = db
    .from("provider_page_view_stats")
    .select("unique_view_count")
    .eq("state", filter.state)
    .gte("date", filter.startDate)
    .limit(5000);

  if (filter.city) query = query.eq("city", filter.city);
  if (filter.categories.length === 1) {
    query = query.eq("category", filter.categories[0]);
  } else {
    query = query.in("category", filter.categories);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[ad-boost/request] demand signal failed:", error);
    return 0;
  }

  return ((data ?? []) as Array<{ unique_view_count: number | null }>).reduce(
    (sum, row) => sum + (row.unique_view_count ?? 0),
    0,
  );
}

function demandCategoryVariants(category: string): string[] {
  const map: Record<string, string[]> = {
    assisted_living: ["assisted_living", "Assisted Living"],
    memory_care: ["memory_care", "Memory Care"],
    nursing_home: ["nursing_home", "Nursing Home"],
    independent_living: ["independent_living", "Independent Living"],
    home_care_agency: ["home_care_agency", "Home Care (Non-medical)", "Home Care"],
    home_health_agency: ["home_health_agency", "Home Health Care", "Home Health"],
  };
  return map[category] ?? [category];
}

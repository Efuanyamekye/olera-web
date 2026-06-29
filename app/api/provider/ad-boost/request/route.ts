import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { loadAdBoostEligibility } from "@/lib/ad-boost/eligibility.server";
import { countDeliveredByCampaign, getCampaignStats, getCampaignQuestions } from "@/lib/ad-boost/delivered.server";
import { sendSlackAlert, slackAdBoostRequested } from "@/lib/slack";
import { BUDGET_VALUES } from "@/lib/ad-boost/estimate";

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
// Anything that should stop a provider from queueing a *second* campaign.
const ACTIVE_OR_PENDING = ["pending_profile", "requested", "scheduled", "live"];
const VALID_CHANNELS = ["google", "meta", "both"];
const DEMAND_WINDOW_DAYS = 7;

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
    .select("id, status, requested_setup_week, channel, intended_monthly_budget, campaign_tag, created_at")
    .eq("provider_id", elig.profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Standing-order release: a campaign queued under 70% auto-promotes the moment
  // the provider crosses the threshold. We re-check on every boost-page load
  // (profile saves are client-direct with no server hook, so this is the
  // promotion point), flip pending_profile -> requested, and page the concierge
  // now — not at submit — so the queue only ever holds actionable work.
  if (latest && latest.status === "pending_profile" && elig.eligibility.eligible) {
    const { data: promoted } = await db
      .from("ad_campaign_requests")
      .update({
        status: "requested",
        completeness_at_submit: elig.eligibility.overall,
        updated_at: new Date().toISOString(),
      })
      .eq("id", latest.id)
      .eq("status", "pending_profile") // guard against a double-promote race
      .select("id, status, requested_setup_week, channel, intended_monthly_budget, campaign_tag, created_at")
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
  // arrive once live" state. Launch anchor = the requested setup week (when the
  // ads start), falling back to created_at for older rows with no week.
  let campaignStats:
    | { visitors: number; leads: number; questions: { received: number; unanswered: number }; since: string }
    | null = null;
  if (latest && latest.status === "live") {
    const since = new Date(
      latest.requested_setup_week || latest.created_at,
    ).toISOString();
    const providerIdVariants = [elig.slug, elig.profileId];
    // Questions are campaign engagement too — counted the same since-launch way
    // as visitors/leads. Parallel with the page-traffic query.
    const [stats, questions] = await Promise.all([
      getCampaignStats(db, { providerIdVariants, since }),
      getCampaignQuestions(db, { providerIdVariants, since }),
    ]);
    campaignStats = { ...stats, questions, since };
  }

  return NextResponse.json({
    eligibility: elig.eligibility,
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
  });
}

export async function POST(request: NextRequest) {
  const elig = await loadAdBoostEligibility();
  if (!elig.ok) {
    return NextResponse.json({ error: elig.error }, { status: elig.status });
  }

  // Standing-order model: a provider can queue a campaign at any completeness.
  // Under 70% it lands as `pending_profile` (queued, concierge NOT paged); it
  // auto-promotes to `requested` the moment they cross the threshold (see GET).
  // The completeness gate still protects ad ROI — it just guards the *launch*,
  // not entry. No 403; commitment-first is the whole point.
  const queued = !elig.eligibility.eligible;

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

  // ── Block a duplicate campaign (active OR already queued under-profile) ──
  const { data: existing } = await db
    .from("ad_campaign_requests")
    .select("id, status, requested_setup_week, channel, intended_monthly_budget, campaign_tag, created_at")
    .eq("provider_id", elig.profileId)
    .in("status", ACTIVE_OR_PENDING)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "You already have an active campaign request", request: existing },
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
    .select("id, status, requested_setup_week, channel, intended_monthly_budget, campaign_tag, created_at")
    .single();

  if (insertError || !inserted) {
    console.error("[ad-boost/request] insert failed:", insertError);
    return NextResponse.json({ error: "Failed to save request" }, { status: 500 });
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

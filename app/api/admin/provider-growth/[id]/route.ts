import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  getTrackingById,
  updateTracking,
  getTouchpoints,
  createTouchpoint,
  type UpdateTrackingInput,
} from "@/lib/provider-growth/queries";
import {
  PIPELINE_STAGES,
  ADS_STATUSES,
  MEDJOBS_STATUSES,
  INTEREST_LEVELS,
  TOUCHPOINT_TYPES,
  canTransitionTo,
  type PipelineStage,
  type AdsStatus,
  type MedjobsStatus,
  type InterestLevel,
  type TouchpointType,
} from "@/lib/provider-growth/stages";

// ─────────────────────────────────────────────────────────────────────────────
// Provider Context Types
// ─────────────────────────────────────────────────────────────────────────────

interface ClaimerInfo {
  name: string;
  position?: string;
  email: string;
}

interface EmailEngagement {
  total_sent: number;
  opened: number;
  clicked: number;
  last_clicked_at: string | null;
}

interface ProviderContext {
  claimer: ClaimerInfo | null;
  emailEngagement: EmailEngagement | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Context Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get information about who claimed the provider's page.
 * Priority fallback: staff.name -> accounts.display_name -> "Unknown"
 *
 * @param accountId - The account_id from business_profiles (pre-fetched)
 * @param metadata - The metadata from business_profiles (pre-fetched)
 */
async function getClaimerInfo(
  accountId: string | null,
  metadata: Record<string, unknown> | null
): Promise<ClaimerInfo | null> {
  if (!accountId) return null;

  const db = getServiceClient();

  try {
    // Get account
    const { data: account } = await db
      .from("accounts")
      .select("user_id, display_name")
      .eq("id", accountId)
      .single();

    if (!account?.user_id) return null;

    // Get email from auth
    const { data: authUser } = await db.auth.admin.getUserById(account.user_id);

    // Extract staff info from metadata
    const meta = metadata || {};
    const staff = meta.staff as { name?: string; position?: string } | undefined;

    return {
      name: staff?.name || account.display_name || "Unknown",
      position: staff?.position,
      email: authUser?.user?.email || "",
    };
  } catch (e) {
    console.error("[provider-growth] Failed to fetch claimer info:", e);
    return null;
  }
}

/**
 * Get email engagement stats for a provider (last 30 days).
 */
async function getEmailEngagement(providerEmail: string): Promise<EmailEngagement | null> {
  if (!providerEmail) return null;

  const db = getServiceClient();

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await db
      .from("email_log")
      .select("id, delivered_at, first_opened_at, first_clicked_at")
      .eq("recipient", providerEmail)
      .eq("recipient_type", "provider")
      .gte("created_at", thirtyDaysAgo);

    if (error || !data) return null;

    return {
      total_sent: data.length,
      opened: data.filter((e) => e.first_opened_at).length,
      clicked: data.filter((e) => e.first_clicked_at).length,
      last_clicked_at:
        data
          .filter((e) => e.first_clicked_at)
          .sort((a, b) => b.first_clicked_at!.localeCompare(a.first_clicked_at!))[0]
          ?.first_clicked_at || null,
    };
  } catch (e) {
    console.error("[provider-growth] Failed to fetch email engagement:", e);
    return null;
  }
}

/**
 * Fetch provider context for the drawer.
 * Includes claimer identity and email engagement stats.
 *
 * @param profileData - Pre-fetched business_profile data (account_id, metadata, email)
 */
async function getProviderContext(profileData: {
  account_id: string | null;
  metadata: Record<string, unknown> | null;
  email: string | null;
}): Promise<ProviderContext> {
  const [claimer, emailEngagement] = await Promise.all([
    getClaimerInfo(profileData.account_id, profileData.metadata),
    profileData.email ? getEmailEngagement(profileData.email) : Promise.resolve(null),
  ]);

  return { claimer, emailEngagement };
}

/**
 * Fetch engagement metrics for a provider (questions and leads counts).
 * This gives admins talking points for sales conversations.
 */
async function getEngagementMetrics(businessProfileId: string): Promise<{
  questions_count: number;
  leads_count: number;
  provider_slug: string | null;
}> {
  const db = getServiceClient();

  try {
    // First get the provider slug from business_profiles (needed for questions query)
    const { data: profile } = await db
      .from("business_profiles")
      .select("slug, source_provider_id")
      .eq("id", businessProfileId)
      .single();

    const slug = profile?.slug || null;
    const sourceProviderId = profile?.source_provider_id || null;

    // Query questions count - check both slug and source_provider_id since either could be used
    let questionsCount = 0;
    const providerIds = [slug, sourceProviderId].filter(Boolean) as string[];

    if (providerIds.length > 0) {
      const { count } = await db
        .from("provider_questions")
        .select("id", { count: "exact", head: true })
        .in("provider_id", providerIds)
        .is("canonical_question_id", null); // Only count original questions, not duplicates
      questionsCount = count || 0;
    }

    // Query leads count (connections where type='inquiry' and to_profile_id = this provider)
    const { count: leadsCount } = await db
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("to_profile_id", businessProfileId)
      .eq("type", "inquiry");

    return {
      questions_count: questionsCount,
      leads_count: leadsCount || 0,
      provider_slug: slug || sourceProviderId,
    };
  } catch (e) {
    // Degrade gracefully - don't fail the whole drawer if engagement queries fail
    console.error("[provider-growth] Failed to fetch engagement metrics:", e);
    return {
      questions_count: 0,
      leads_count: 0,
      provider_slug: null,
    };
  }
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/provider-growth/[id]
 *
 * Get a single tracking record with touchpoints.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id } = await context.params;
    const tracking = await getTrackingById(id);

    if (!tracking) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Fetch business_profile data needed for context queries (single query)
    const db = getServiceClient();
    const { data: profile } = await db
      .from("business_profiles")
      .select("email, account_id, metadata")
      .eq("id", tracking.business_profile_id)
      .single();

    const profileData = {
      email: profile?.email || null,
      account_id: profile?.account_id || null,
      metadata: (profile?.metadata as Record<string, unknown>) || null,
    };

    // Fetch touchpoints, engagement metrics, and provider context in parallel
    const [touchpoints, engagement, providerContext] = await Promise.all([
      getTouchpoints(id),
      getEngagementMetrics(tracking.business_profile_id),
      getProviderContext(profileData),
    ]);

    return NextResponse.json({ tracking, touchpoints, engagement, context: providerContext });
  } catch (e) {
    console.error("[provider-growth] GET [id] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/provider-growth/[id]
 *
 * Update a tracking record. Supports:
 * - pipeline_stage transitions
 * - Meeting scheduling/completion
 * - Pitch logging
 * - Ads/MedJobs status updates
 * - Notes
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();

    // Validate touchpoint_type early if provided
    if (body.touchpoint_type && !TOUCHPOINT_TYPES.includes(body.touchpoint_type)) {
      return NextResponse.json(
        { error: `Invalid touchpoint_type: ${body.touchpoint_type}` },
        { status: 400 }
      );
    }

    // Get current tracking record
    const current = await getTrackingById(id);
    if (!current) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Build update input with validation
    const input: UpdateTrackingInput = {};

    // Pipeline stage transition
    if (body.pipeline_stage !== undefined) {
      if (!PIPELINE_STAGES.includes(body.pipeline_stage)) {
        return NextResponse.json(
          { error: `Invalid pipeline_stage: ${body.pipeline_stage}` },
          { status: 400 }
        );
      }
      if (
        body.pipeline_stage !== current.pipeline_stage &&
        !canTransitionTo(current.pipeline_stage, body.pipeline_stage)
      ) {
        return NextResponse.json(
          {
            error: `Invalid transition from ${current.pipeline_stage} to ${body.pipeline_stage}`,
          },
          { status: 400 }
        );
      }
      input.pipeline_stage = body.pipeline_stage as PipelineStage;
    }

    // Meeting fields
    if (body.calendly_event_id !== undefined) {
      input.calendly_event_id = body.calendly_event_id;
    }
    if (body.meeting_scheduled_at !== undefined) {
      input.meeting_scheduled_at = body.meeting_scheduled_at;
    }
    if (body.meeting_completed_at !== undefined) {
      input.meeting_completed_at = body.meeting_completed_at;
    }

    // Pitch fields
    if (body.pitched_at !== undefined) {
      input.pitched_at = body.pitched_at;
    }
    if (body.pitched_ads !== undefined) {
      input.pitched_ads = body.pitched_ads;
    }
    if (body.pitched_medjobs !== undefined) {
      input.pitched_medjobs = body.pitched_medjobs;
    }
    if (body.pitch_notes !== undefined) {
      input.pitch_notes = body.pitch_notes;
    }
    if (body.pitch_interest_level !== undefined) {
      if (body.pitch_interest_level !== null && !INTEREST_LEVELS.includes(body.pitch_interest_level)) {
        return NextResponse.json(
          { error: `Invalid pitch_interest_level: ${body.pitch_interest_level}` },
          { status: 400 }
        );
      }
      input.pitch_interest_level = body.pitch_interest_level as InterestLevel;
    }

    // Ads status
    if (body.ads_status !== undefined) {
      if (!ADS_STATUSES.includes(body.ads_status)) {
        return NextResponse.json(
          { error: `Invalid ads_status: ${body.ads_status}` },
          { status: 400 }
        );
      }
      input.ads_status = body.ads_status as AdsStatus;

      // Auto-set timestamps
      if (body.ads_status === "free_intro" && !current.ads_free_intro_at) {
        input.ads_free_intro_at = new Date().toISOString();
      }
      if (body.ads_status === "subscribed" && !current.ads_subscribed_at) {
        input.ads_subscribed_at = new Date().toISOString();
      }
    }

    // MedJobs status
    if (body.medjobs_status !== undefined) {
      if (!MEDJOBS_STATUSES.includes(body.medjobs_status)) {
        return NextResponse.json(
          { error: `Invalid medjobs_status: ${body.medjobs_status}` },
          { status: 400 }
        );
      }
      input.medjobs_status = body.medjobs_status as MedjobsStatus;

      // Auto-set timestamps
      if (body.medjobs_status === "in_pilot" && !current.medjobs_pilot_started_at) {
        input.medjobs_pilot_started_at = new Date().toISOString();
      }
      if (body.medjobs_status === "subscribed" && !current.medjobs_subscribed_at) {
        input.medjobs_subscribed_at = new Date().toISOString();
      }
    }

    // Not interested
    if (body.not_interested_at !== undefined) {
      input.not_interested_at = body.not_interested_at;
    }
    if (body.not_interested_reason !== undefined) {
      input.not_interested_reason = body.not_interested_reason;
    }

    // Assignment and notes
    if (body.assigned_to !== undefined) {
      input.assigned_to = body.assigned_to;
    }
    if (body.notes !== undefined) {
      input.notes = body.notes;
    }

    // Perform update
    const updated = await updateTracking(id, input, adminUser.id);

    // Log automatic touchpoints for significant changes
    const touchpointsToLog: Array<{ type: TouchpointType; details: Record<string, unknown> }> = [];

    // Notes update
    if (body.notes !== undefined && body.notes !== current.notes) {
      touchpointsToLog.push({
        type: "note_added",
        details: { note: body.notes },
      });
    }

    // Assignment change
    if (body.assigned_to !== undefined && body.assigned_to !== current.assigned_to) {
      touchpointsToLog.push({
        type: "assigned",
        details: { assigned_to: body.assigned_to },
      });
    }

    // Ads status conversion
    if (body.ads_status && body.ads_status !== current.ads_status) {
      if (body.ads_status === "free_intro" && current.ads_status === "none") {
        touchpointsToLog.push({
          type: "ads_converted",
          details: { from: current.ads_status, to: body.ads_status },
        });
      } else if (body.ads_status === "subscribed") {
        touchpointsToLog.push({
          type: "ads_upgraded",
          details: { from: current.ads_status, to: body.ads_status },
        });
      }
    }

    // MedJobs status conversion
    if (body.medjobs_status && body.medjobs_status !== current.medjobs_status) {
      if (body.medjobs_status === "in_pilot" && current.medjobs_status === "none") {
        touchpointsToLog.push({
          type: "medjobs_converted",
          details: { from: current.medjobs_status, to: body.medjobs_status },
        });
      } else if (body.medjobs_status === "subscribed") {
        touchpointsToLog.push({
          type: "medjobs_upgraded",
          details: { from: current.medjobs_status, to: body.medjobs_status },
        });
      }
    }

    // Log all automatic touchpoints
    for (const tp of touchpointsToLog) {
      await createTouchpoint({
        tracking_id: id,
        business_profile_id: current.business_profile_id,
        touchpoint_type: tp.type,
        details: tp.details,
        admin_user_id: adminUser.id,
      });
    }

    // Log additional custom touchpoint if specified (already validated above)
    if (body.touchpoint_type) {
      await createTouchpoint({
        tracking_id: id,
        business_profile_id: current.business_profile_id,
        touchpoint_type: body.touchpoint_type as TouchpointType,
        details: body.touchpoint_details || {},
        admin_user_id: adminUser.id,
      });
    }

    return NextResponse.json({ tracking: updated });
  } catch (e) {
    console.error("[provider-growth] PATCH [id] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getRichContextData, getTrackingById, type RichContextData } from "@/lib/provider-growth/queries";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data-driven briefing response.
 * All fields are computed from real database records - NO AI generation.
 */
export interface BriefingResponse {
  // Legacy fields (for backward compatibility with existing UI)
  theOneFix: string;
  whatWeOweThem: string | null;
  openWith: string[];
  getThese: string[];
  offer: string;
  logAfterCall: string;
  tags: string[];

  // NEW: Rich data-driven fields
  questions: {
    received: number;
    answered: number;
    unanswered: number;
    recentQuestions: Array<{
      question: string;
      created_at: string;
      answered: boolean;
    }>;
  };

  leads: {
    count: number;
    recentLeads: Array<{
      familyName: string | null;
      message: string | null;
      created_at: string;
    }>;
  };

  engagement: {
    lastDashboardVisit: string | null;
    dashboardVisits30d: number;
    lastProfileEdit: string | null;
    profileEdits30d: number;
    sectionsEdited: string[];
    lastLogin: string | null;
    leadsOpened: number;
    leadOpenRate: number;
    contactsRevealed: number;
  };

  photos: {
    count: number;
    hasHeroImage: boolean;
    urls: string[];
  };

  reviews: {
    rating: number | null;
    count: number | null;
    opportunityLevel: "none" | "mild" | "strong";
    opportunityReason: string | null;
    hasUsedReviewRequests: boolean;
    reviewRequestsSent: number;
  };

  emailAssessment: {
    isGeneric: boolean;
    genericReason: string | null;
  };

  profileCompleteness: {
    percentage: number;
    missingSections: string[];
    hasDescription: boolean;
    hasPricing: boolean;
    hasStaffInfo: boolean;
    hasHours: boolean;
  };

  adBoost: {
    hasAnyCampaign: boolean;
    activeCampaign: boolean;
    totalCampaigns: number;
    lastCampaignStatus: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled" | null;
    totalLeadsFromAds: number;
    // Detailed campaign performance
    campaign: {
      status: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled" | null;
      channel: "google" | "meta" | "both" | null;
      budgetCents: number | null;
      spendCents: number | null;
      impressions: number | null;
      clicks: number | null;
      landings: number | null;
      delivered: number | null;
      flightStartDate: string | null;
      flightEndDate: string | null;
      photoReadiness: "unreviewed" | "update_requested" | "review_requested" | "ready" | null;
    } | null;
  };

  medjobs: {
    status: "none" | "in_pilot" | "pilot_expired" | "subscribed";
    eligible: boolean;
    pilotStartedAt: string | null;
    subscribedAt: string | null;
    opportunityLevel: "none" | "pitch" | "convert" | "renew";
    opportunityReason: string | null;
  };

  featureEngagement: {
    adBoostViews: number;
    adBoostLastViewed: string | null;
    adBoostApplyStarted: boolean;
    reviewsCtaClicked: boolean;
    reviewsCtaLastClicked: string | null;
    marketViewCount: number;
    marketLastViewed: string | null;
    warmLeadSignals: string[];
  };

  flags: Array<{
    type: "warning" | "info" | "opportunity";
    label: string;
    detail: string;
  }>;

  recommendedAction: {
    priority: number;
    action: string;
    rationale: string;
    pitchAngle: string;
  };

  openingScript: string;

  captureChecklist: Array<{
    item: string;
    reason: string;
  }>;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the briefing response from rich context data.
 * This is deterministic - same input always produces same output.
 * NO AI generation, NO randomness, NO external API calls.
 */
function buildBriefing(data: RichContextData): BriefingResponse {
  // Build legacy "offer" field based on situation
  let offer = "";
  if (data.adBoost.activeCampaign) {
    offer = "Check in on their active Ad Boost campaign performance";
  } else if (data.adBoost.hasAnyCampaign && data.adBoost.totalLeadsFromAds > 0) {
    offer = `Their previous campaign delivered ${data.adBoost.totalLeadsFromAds} leads - offer another flight`;
  } else if (data.leadCount > 5 && data.adsStatus === "none") {
    offer = "They're getting organic leads - Ad Boost could multiply their reach";
  } else if (data.profileCompleteness.percentage < 70) {
    offer = "Help complete their profile to attract more families";
  } else {
    offer = "General check-in - see if they need any support";
  }

  // Build legacy "logAfterCall" field
  const logItems = data.captureChecklist.map(c => c.item).join(", ");
  const logAfterCall = logItems || "Call outcome, interest level, any follow-up needed";

  return {
    // Legacy fields (mapped from new data structure)
    theOneFix: data.recommendedAction.action,
    whatWeOweThem: null, // No longer AI-generated guesses
    openWith: [data.openingScript],
    getThese: data.captureChecklist.slice(0, 3).map(c => c.item),
    offer,
    logAfterCall,
    tags: data.computedTags,

    // New structured fields
    questions: data.questions,
    leads: {
      count: data.leadCount,
      recentLeads: data.leads.map(l => ({
        familyName: l.familyName,
        message: l.message,
        created_at: l.created_at,
      })),
    },
    engagement: data.engagement,
    photos: data.photos,
    reviews: data.reviews,
    emailAssessment: data.emailAssessment,
    profileCompleteness: data.profileCompleteness,
    adBoost: data.adBoost,
    medjobs: data.medjobs,
    featureEngagement: data.featureEngagement,
    flags: data.flags,
    recommendedAction: data.recommendedAction,
    openingScript: data.openingScript,
    captureChecklist: data.captureChecklist,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/provider-growth/[id]/briefing
// ─────────────────────────────────────────────────────────────────────────────

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

    // Get tracking record
    const tracking = await getTrackingById(id);
    if (!tracking) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Get rich context data (all queries happen here)
    const contextData = await getRichContextData(id, tracking.business_profile_id);

    // Build briefing from data (no AI, instant)
    const briefing = buildBriefing(contextData);

    // Return response with all data
    return NextResponse.json({
      briefing,
      generatedAt: new Date().toISOString(),
      cached: false, // No caching needed - it's instant now
      metrics: {
        googleRating: contextData.googleRating,
        googleReviewCount: contextData.googleReviewCount,
        photoCount: contextData.photoCount,
        adSpendCents: contextData.adSpendCents,
        leadCount: contextData.leadCount,
        questionsUnanswered: contextData.questions.unanswered,
        profileCompleteness: contextData.profileCompleteness.percentage,
        leadOpenRate: contextData.engagement.leadOpenRate,
      },
      // Include raw context for debugging/advanced UI
      context: {
        provider: contextData.provider,
        pipelineStage: contextData.pipelineStage,
        adsStatus: contextData.adsStatus,
        medjobsStatus: contextData.medjobsStatus,
        claimedAt: contextData.claimedAt,
        claimSource: tracking.claim_source,
        daysOverdue: contextData.daysOverdue,
        emailStats: contextData.emailStats,
      },
    });
  } catch (e) {
    console.error("[provider-growth] Briefing error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

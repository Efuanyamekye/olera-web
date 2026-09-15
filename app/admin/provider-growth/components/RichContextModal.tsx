"use client";

/**
 * RichContextModal - Clean, minimal sales briefing
 *
 * Apple/Airbnb-inspired design: white space, typography hierarchy, minimal color.
 */

import { useState, useEffect, useCallback } from "react";
import { CLAIM_SOURCE_CONTEXT_LABELS, type ClaimSource } from "@/lib/provider-growth/stages";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BriefingResponse {
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
    totalLeadsFromAds: number;
    lastCampaignStatus: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled" | null;
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
  captureChecklist: Array<{ item: string; reason: string }>;
}

interface BriefingData {
  briefing: BriefingResponse;
  metrics?: {
    googleRating: number | null;
    googleReviewCount: number | null;
    photoCount: number;
    adSpendCents: number | null;
    leadCount: number;
    profileCompleteness: number;
    leadOpenRate: number;
  };
  context?: {
    provider?: {
      displayName: string;
      contactName: string | null;
      email: string | null;
    };
    adsStatus: string;
    claimedAt: string | null;
    claimSource: string | null;
    emailStats?: {
      sent: number;
      opened: number;
      clicked: number;
    };
  };
}

interface RichContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackingId: string;
  providerName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function RichContextModal({
  isOpen,
  onClose,
  trackingId,
  providerName,
}: RichContextModalProps) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadsExpanded, setLeadsExpanded] = useState(false);
  const [questionsExpanded, setQuestionsExpanded] = useState(false);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/provider-growth/${trackingId}/briefing`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [trackingId]);

  useEffect(() => {
    if (isOpen && !data && !loading) fetchBriefing();
  }, [isOpen, data, loading, fetchBriefing]);

  useEffect(() => {
    setData(null);
    setError(null);
    setLoading(false);
    setLeadsExpanded(false);
    setQuestionsExpanded(false);
  }, [trackingId]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const b = data?.briefing;
  const m = data?.metrics;
  const adsStatus = data?.context?.adsStatus;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{providerName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">Sales Briefing</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 overflow-y-auto max-h-[calc(85vh-100px)]">
            {loading && <LoadingState />}
            {error && <ErrorState error={error} onRetry={fetchBriefing} />}

            {b && m && (
              <div className="space-y-6">
                {/* Claim Context - who claimed, when, how */}
                {data?.context && (
                  <div className="text-sm text-gray-600 space-y-1">
                    {data.context.provider?.contactName && (
                      <div>
                        <span className="text-gray-500">Claimed by </span>
                        <span className="text-gray-900 font-medium">{data.context.provider.contactName}</span>
                        {data.context.claimSource && (
                          <span className="text-gray-500">
                            {" "}via {CLAIM_SOURCE_CONTEXT_LABELS[data.context.claimSource as ClaimSource] || data.context.claimSource}
                          </span>
                        )}
                      </div>
                    )}
                    {data.context.claimedAt && (
                      <div className="text-gray-500">
                        {formatRelative(data.context.claimedAt)}
                      </div>
                    )}
                    {data.context.emailStats && data.context.emailStats.sent > 0 && (
                      <div className="text-gray-500">
                        {data.context.emailStats.sent} emails sent, {data.context.emailStats.opened} opened, {data.context.emailStats.clicked} clicked
                      </div>
                    )}
                  </div>
                )}

                {/* Key Numbers - simple row */}
                <div className="flex items-baseline gap-8 text-sm">
                  <Stat label="Rating" value={m.googleRating?.toFixed(1) ?? "—"} />
                  <Stat label="Leads" value={m.leadCount} />
                  <Stat label="Questions" value={b.questions.received} alert={b.questions.unanswered > 0} />
                  <Stat label="Profile" value={`${m.profileCompleteness}%`} />
                  <Stat label="Photos" value={m.photoCount} />
                </div>

                {/* Priority Action - the ONE thing to focus on */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Focus of this call
                  </p>
                  <p className="text-base font-medium text-gray-900">{b.recommendedAction.action}</p>
                  <p className="text-sm text-gray-600 mt-1">{b.recommendedAction.rationale}</p>
                  {b.recommendedAction.pitchAngle && (
                    <p className="text-sm text-blue-700 mt-2 font-medium">
                      {b.recommendedAction.pitchAngle}
                    </p>
                  )}
                </div>

                {/* Opening Line */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Opening line
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    &ldquo;{b.openingScript}&rdquo;
                  </p>
                </div>

                {/* Issues - simple list, no colored boxes */}
                {b.flags.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Things to address
                    </p>
                    <ul className="space-y-1.5">
                      {b.flags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-gray-400 mt-0.5">
                            {flag.type === "warning" ? "•" : "○"}
                          </span>
                          <span className={flag.type === "warning" ? "text-gray-900" : "text-gray-600"}>
                            {flag.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* What to capture */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Capture during call
                  </p>
                  <ul className="space-y-1.5">
                    {b.captureChecklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-gray-300 mt-0.5">☐</span>
                        <span className="text-gray-700">{item.item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recent Leads - collapsible */}
                {(b.leads?.count ?? 0) > 0 && (
                  <CollapsibleSection
                    title="Leads"
                    summary={`${b.leads.count} total${b.leads.recentLeads?.[0] ? ` · newest: ${parseLeadName(b.leads.recentLeads[0])}` : ""}`}
                    expanded={leadsExpanded}
                    onToggle={() => setLeadsExpanded(!leadsExpanded)}
                  >
                    <div className="space-y-2 pt-2">
                      {b.leads.recentLeads?.map((lead, i) => {
                        const parsed = parseLeadMessage(lead.message);
                        return (
                          <div key={i} className="flex justify-between items-start text-sm">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-gray-900">
                                {lead.familyName || parsed.name || "Family"}
                              </span>
                              {parsed.email && (
                                <span className="text-gray-500 ml-2">{parsed.email}</span>
                              )}
                              {parsed.message && (
                                <p className="text-gray-600 text-xs mt-0.5 truncate">{parsed.message}</p>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                              {formatRelative(lead.created_at)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Recent Questions - collapsible */}
                {b.questions.received > 0 && (
                  <CollapsibleSection
                    title="Questions"
                    summary={`${b.questions.received} total${b.questions.unanswered > 0 ? ` · ${b.questions.unanswered} unanswered` : ""}`}
                    expanded={questionsExpanded}
                    onToggle={() => setQuestionsExpanded(!questionsExpanded)}
                    alert={b.questions.unanswered > 0}
                  >
                    <div className="space-y-2 pt-2">
                      {b.questions.recentQuestions.map((q, i) => (
                        <div key={i} className="flex justify-between items-start gap-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-700">{q.question}</p>
                            <span className="text-xs text-gray-400">{formatRelative(q.created_at)}</span>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                            q.answered
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {q.answered ? "Answered" : "Unanswered"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Grouped details - organized by category */}
                <div className="pt-4 border-t border-gray-100 space-y-4">
                  {/* Products */}
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                      Products
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Ad Boost</span>
                        <span className="text-gray-900">
                          {b.adBoost.campaign?.status === "live" ? (
                            <span className="text-green-600">
                              Live{b.adBoost.campaign.delivered ? ` (${b.adBoost.campaign.delivered} families)` : ""}
                            </span>
                          ) : b.adBoost.campaign?.status === "ended" ? (
                            <span>Ended{b.adBoost.campaign.delivered ? ` (${b.adBoost.campaign.delivered} families)` : ""}</span>
                          ) : b.adBoost.campaign?.status === "pending_profile" ? (
                            <span className="text-amber-600">Pending profile</span>
                          ) : b.adBoost.campaign?.status === "requested" ? (
                            <span className="text-amber-600">Requested</span>
                          ) : b.adBoost.campaign?.status === "scheduled" ? (
                            <span className="text-blue-600">Scheduled</span>
                          ) : adsStatus === "subscribed" ? (
                            "Paying"
                          ) : adsStatus === "free_intro" ? (
                            "Trial"
                          ) : (
                            "None"
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">MedJobs</span>
                        <span className="text-gray-900">
                          {b.medjobs.status === "subscribed" ? (
                            <span className="text-green-600">Subscribed</span>
                          ) : b.medjobs.status === "in_pilot" ? (
                            <span className="text-blue-600">In pilot</span>
                          ) : b.medjobs.status === "pilot_expired" ? (
                            <span className="text-amber-600">Pilot expired</span>
                          ) : b.medjobs.eligible ? (
                            "Eligible"
                          ) : (
                            "—"
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Activity */}
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                      Activity
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last login</span>
                        <span className="text-gray-900">
                          {b.engagement.lastLogin ? formatRelative(b.engagement.lastLogin) : "Never"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Dashboard visits</span>
                        <span className="text-gray-900">{b.engagement.dashboardVisits30d} (30d)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Leads opened</span>
                        <span className="text-gray-900">{b.engagement.leadOpenRate}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Opportunities - only show if there are any */}
                  {(b.reviews.opportunityLevel !== "none" ||
                    b.emailAssessment.isGeneric ||
                    b.featureEngagement.warmLeadSignals.length > 0) && (
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                        Opportunities
                      </p>
                      <div className="space-y-1.5 text-sm">
                        {b.reviews.opportunityLevel !== "none" && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Reviews</span>
                            <span className={b.reviews.opportunityLevel === "strong" ? "text-amber-600" : "text-gray-600"}>
                              {b.reviews.opportunityLevel === "strong" ? "Needs reviews" : "Could use more"}
                            </span>
                          </div>
                        )}
                        {b.emailAssessment.isGeneric && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Email</span>
                            <span className="text-amber-600">Generic address</span>
                          </div>
                        )}
                        {b.featureEngagement.warmLeadSignals.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Interest shown</span>
                            <span className="text-blue-600">
                              {b.featureEngagement.warmLeadSignals.slice(0, 2).join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Parse the JSON message field from connections to extract useful info */
function parseLeadMessage(message: string | null): { name?: string; email?: string; message?: string } {
  if (!message) return {};
  try {
    // Try parsing as JSON
    const parsed = JSON.parse(message);
    return {
      name: parsed.seeker_name || (parsed.seeker_first_name && parsed.seeker_last_name
        ? `${parsed.seeker_first_name} ${parsed.seeker_last_name}`
        : parsed.seeker_first_name),
      email: parsed.seeker_email,
      message: parsed.message || parsed.inquiry_message,
    };
  } catch {
    // Not JSON - might be plain text message
    return { message: message.length > 100 ? message.slice(0, 100) + "..." : message };
  }
}

/** Get display name for a lead (from familyName or parsed message) */
function parseLeadName(lead: { familyName: string | null; message: string | null }): string {
  if (lead.familyName) return lead.familyName;
  const parsed = parseLeadMessage(lead.message);
  return parsed.name || "Family";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  summary,
  expanded,
  onToggle,
  alert,
  children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-gray-100 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${alert ? "text-amber-700" : "text-gray-900"}`}>
            {title}
          </span>
          <span className="text-xs text-gray-500">{summary}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-semibold ${alert ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-8">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-6 w-8 bg-gray-100 rounded" />
            <div className="h-3 w-12 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="h-24 bg-gray-50 rounded-xl" />
      <div className="space-y-2">
        <div className="h-3 w-20 bg-gray-100 rounded" />
        <div className="h-4 w-full bg-gray-50 rounded" />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-gray-600 mb-3">{error}</p>
      <button
        onClick={onRetry}
        className="text-sm font-medium text-gray-900 hover:underline"
      >
        Try again
      </button>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

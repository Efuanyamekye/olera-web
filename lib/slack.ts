const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface SlackBlock {
  type: string;
  block_id?: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: { type: string; text: string }[];
  elements?: SlackElement[];
  accessory?: SlackElement;
}

interface SlackElement {
  type: string;
  text?: string | { type: string; text: string; emoji?: boolean };
  action_id?: string;
  value?: string;
  style?: "primary" | "danger";
  url?: string;
}

/**
 * Send an alert to Slack via incoming webhook.
 * Fire-and-forget safe — logs errors but never throws.
 */
export async function sendSlackAlert(
  text: string,
  blocks?: SlackBlock[]
): Promise<{ success: boolean; error?: string }> {
  if (!WEBHOOK_URL) {
    console.warn("[slack] SLACK_WEBHOOK_URL not configured, skipping alert");
    return { success: false, error: "Slack not configured" };
  }

  try {
    const body: Record<string, unknown> = { text };
    if (blocks) body.blocks = blocks;

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const msg = await res.text();
      console.error("[slack] Webhook error:", res.status, msg);
      return { success: false, error: msg };
    }

    return { success: true };
  } catch (err) {
    console.error("[slack] Send failed:", err);
    return { success: false, error: String(err) };
  }
}

// ── Pre-built alert helpers ─────────────────────────────────────

export function slackNewLead(opts: {
  familyName: string;
  providerName: string;
  careType: string | null;
}): { text: string; blocks: SlackBlock[] } {
  return {
    text: `New lead: ${opts.familyName} → ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔔 New Care Inquiry", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Family:*\n${opts.familyName}` },
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          ...(opts.careType
            ? [{ type: "mrkdwn", text: `*Care Type:*\n${opts.careType}` }]
            : []),
        ],
      },
    ],
  };
}

export function slackProviderClaimed(opts: {
  providerName: string;
  claimedByEmail: string;
  providerSlug: string;
  /** Optional: where the claim originated from (e.g., "lead_email", "question_email", "instant_claim") */
  claimSource?: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  // Build the fields array, conditionally adding source if provided
  const fields: { type: "mrkdwn"; text: string }[] = [
    { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
    { type: "mrkdwn", text: `*Claimed by:*\n${opts.claimedByEmail}` },
  ];
  if (opts.claimSource) {
    fields.push({ type: "mrkdwn", text: `*Source:*\n${opts.claimSource}` });
  }

  return {
    text: `Provider claimed: ${opts.providerName} by ${opts.claimedByEmail}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "✅ Provider Claimed", emoji: true },
      },
      {
        type: "section",
        fields,
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View listing>` },
        ],
      },
    ],
  };
}

export function slackSuspiciousClaim(opts: {
  providerName: string;
  providerSlug: string;
  claimedByEmail: string;
  trustLevel: "high" | "medium" | "low";
  trustReason: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  return {
    text: `Suspicious claim: ${opts.providerName} by ${opts.claimedByEmail} (${opts.trustLevel})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚩 Suspicious Claim — Review", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Claimed by:*\n${opts.claimedByEmail}` },
          { type: "mrkdwn", text: `*Trust level:*\n${opts.trustLevel}` },
          { type: "mrkdwn", text: `*Reason:*\n${opts.trustReason}` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?tab=providers&filter=suspicious_claim|Admin queue>`,
          },
        ],
      },
    ],
  };
}

export function slackDispute(opts: {
  providerName: string;
  reportedBy: string;
  reason: string;
}): { text: string; blocks: SlackBlock[] } {
  return {
    text: `Dispute reported: ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "⚠️ Content Dispute", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Reported by:*\n${opts.reportedBy}` },
          { type: "mrkdwn", text: `*Reason:*\n${opts.reason}` },
        ],
      },
    ],
  };
}

export function slackRemovalRequest(opts: {
  providerName: string;
  providerSlug: string;
  fullName: string;
  email: string;
  phone: string;
  action: string;
  reason: string;
  details?: string;
}): { text: string; blocks: SlackBlock[] } {
  const detailLine = opts.details ? `\n*Details:*\n${opts.details}` : "";
  return {
    text: `🚨 Page removal request: ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚨 Page Removal Request", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Action:*\n${opts.action}` },
          { type: "mrkdwn", text: `*Reason:*\n${opts.reason}` },
          { type: "mrkdwn", text: `*Submitted by:*\n${opts.fullName}` },
          { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
          { type: "mrkdwn", text: `*Phone:*\n${opts.phone}` },
        ],
      },
      ...(detailLine
        ? [
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: detailLine },
            },
          ]
        : []),
    ],
  };
}

export function slackMissingEmail(opts: {
  familyName: string;
  providerName: string;
  providerId: string;
  careType: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  return {
    text: `Missing email: ${opts.providerName} — new lead from ${opts.familyName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📧 Missing Provider Email", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Family:*\n${opts.familyName}` },
          ...(opts.careType
            ? [{ type: "mrkdwn", text: `*Care Type:*\n${opts.careType}` }]
            : []),
          { type: "mrkdwn", text: `*Action:*\nAdd email to send lead notification` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/admin/directory/${opts.providerId}|Add email in admin>` },
        ],
      },
    ],
  };
}

export function slackQuestionAsked(opts: {
  askerName: string;
  providerName: string;
  question: string;
  providerSlug: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const truncated = opts.question.length > 150 ? opts.question.slice(0, 147) + "..." : opts.question;
  return {
    text: `New question on ${opts.providerName} from ${opts.askerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "❓ New Question Asked", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Asked by:*\n${opts.askerName}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Question:*\n${truncated}` },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View provider page>` },
        ],
      },
    ],
  };
}

export function slackQuestionMissingEmail(opts: {
  askerName: string;
  providerName: string;
  providerId: string;
  question: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const truncated = opts.question.length > 150 ? opts.question.slice(0, 147) + "..." : opts.question;
  return {
    text: `Question asked on ${opts.providerName} but provider has no email`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📧 Question Asked — No Provider Email", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Asked by:*\n${opts.askerName}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Question:*\n${truncated}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Action:*\nAdd email so provider can be notified` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/admin/directory/${opts.providerId}|Add email in admin>` },
        ],
      },
    ],
  };
}

export function slackQuestionAnswered(opts: {
  providerName: string;
  providerSlug: string;
  askerName: string;
  question: string;
  answer: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const truncQ = opts.question.length > 100 ? opts.question.slice(0, 97) + "..." : opts.question;
  const truncA = opts.answer.length > 150 ? opts.answer.slice(0, 147) + "..." : opts.answer;
  return {
    text: `${opts.providerName} answered a question from ${opts.askerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "💬 Provider Answered a Question", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Asked by:*\n${opts.askerName}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Q:* ${truncQ}\n*A:* ${truncA}` },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View provider page>` },
        ],
      },
    ],
  };
}

// ── One-click access alerts ───────────────────────────────────

export function slackOneClickAccess(opts: {
  providerName: string;
  providerEmail: string;
  providerSlug: string;
  action: string;
  actionId?: string;
  trustLevel?: "high" | "medium" | "low" | null;
  trustReason?: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const actionLabels: Record<string, string> = {
    lead: "Viewed lead",
    question: "Viewed question",
    review: "Viewed review",
    campaign: "Campaign click",
  };
  const trustIcon =
    opts.trustLevel === "high"
      ? "🟢"
      : opts.trustLevel === "medium"
        ? "🟡"
        : opts.trustLevel === "low"
          ? "🔴"
          : "";
  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
    { type: "mrkdwn", text: `*Email:*\n${opts.providerEmail}` },
    { type: "mrkdwn", text: `*Action:*\n${actionLabels[opts.action] || opts.action}` },
    { type: "mrkdwn", text: `*Listing:*\n<${siteUrl}/provider/${opts.providerSlug}|View>` },
  ];
  if (opts.trustLevel) {
    fields.push({
      type: "mrkdwn",
      text: `*Trust:*\n${trustIcon} ${opts.trustLevel}${opts.trustReason ? `\n_${opts.trustReason}_` : ""}`,
    });
  }
  return {
    text: `One-click access: ${opts.providerName} (${opts.action})${opts.trustLevel ? ` — trust: ${opts.trustLevel}` : ""}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔓 One-Click Provider Access", emoji: true },
      },
      {
        type: "section",
        fields,
      },
    ],
  };
}

/**
 * 🔗💥 A magic-link sign-in failed — a provider clicked an email link and the
 * one-click pipeline broke somewhere. Counterpart to slackOneClickAccess.
 * Fired from lib/one-click-telemetry.ts (server stages) and
 * /api/activity/track (client stages).
 */
export function slackOneClickFailed(opts: {
  providerSlug: string;
  stage: string;
  reason?: string | null;
  action?: string | null;
  emailMasked?: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const stageLabels: Record<string, string> = {
    validate_token: "Bad or expired token",
    auto_sign_in: "Sign-in refused",
    finalize: "Claim failed",
    client_auto_sign_in_http: "Sign-in request error",
    client_verify_otp: "Session verify failed",
    client_finalize_http: "Claim request error",
    client_exception: "Browser error",
    claim_lead: "Lead link fallback",
    claim_campaign: "Outreach link fallback",
    claim_complete: "Digest link fallback",
  };
  const stageLabel = stageLabels[opts.stage] || opts.stage;
  const reason = (opts.reason || "").slice(0, 120);
  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Provider:*\n<${siteUrl}/provider/${opts.providerSlug}|${opts.providerSlug}>` },
    { type: "mrkdwn", text: `*Stage:*\n${stageLabel}` },
  ];
  if (reason) fields.push({ type: "mrkdwn", text: `*Reason:*\n${reason}` });
  if (opts.action) fields.push({ type: "mrkdwn", text: `*From email:*\n${opts.action}` });
  if (opts.emailMasked) fields.push({ type: "mrkdwn", text: `*Recipient:*\n${opts.emailMasked}` });
  return {
    text: `Magic link sign-in failed: ${opts.providerSlug} (${stageLabel})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔗 Magic Link Sign-In Failed", emoji: true },
      },
      {
        type: "section",
        fields,
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${siteUrl}/admin/activity?actor=providers&category=flags|All failures in the Activity Center>`,
          },
        ],
      },
    ],
  };
}

export function slackReviewsCtaClicked(opts: {
  providerName: string;
  providerSlug: string;
  source: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  return {
    text: `Reviews CTA clicked: ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "⭐ Provider Clicked Reviews CTA", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Source:*\n${opts.source}` },
          { type: "mrkdwn", text: `*Listing:*\n<${siteUrl}/provider/${opts.providerSlug}|View>` },
        ],
      },
    ],
  };
}

export function slackAnalyticsTeaserCtaClicked(opts: {
  providerName: string;
  providerSlug: string;
  teaserCase: "has_cohort" | "views_only" | "zero_views" | string;
  viewsThisPeriod: number;
  cohortSize: number | null;
  tier: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const caseLabel =
    opts.teaserCase === "has_cohort"
      ? "Has cohort"
      : opts.teaserCase === "views_only"
        ? "Views only"
        : opts.teaserCase === "zero_views"
          ? "Zero views"
          : opts.teaserCase;
  const cohortText = opts.cohortSize !== null ? opts.cohortSize.toLocaleString() : "—";
  return {
    text: `Analytics teaser CTA clicked: ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📈 Provider Clicked Analytics Teaser", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Case:*\n${caseLabel}` },
          { type: "mrkdwn", text: `*Views this month:*\n${opts.viewsThisPeriod.toLocaleString()}` },
          { type: "mrkdwn", text: `*Cohort size:*\n${cohortText}` },
          { type: "mrkdwn", text: `*Tier:*\n${opts.tier}` },
          { type: "mrkdwn", text: `*Listing:*\n<${siteUrl}/provider/${opts.providerSlug}|View>` },
        ],
      },
    ],
  };
}

/**
 * 🏙️ Provider with NO local leads viewed "Growth" — the market
 * diagnostic that defaults the Find Families tab when a provider's city has
 * no registered families yet. This is the ~99% default state, so it doubles
 * as the canonical "a provider is looking at the market product" signal.
 * Fires on every such visit. The market product is gated/rolled out via
 * lib/market-gate.ts; once flipped on, this surfaces real provider interest.
 */
export function slackMarketDiagnosticNoLeads(opts: {
  providerName: string;
  providerSlug: string;
  city: string | null;
  state: string | null;
  email: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const where = [opts.city, opts.state].filter(Boolean).join(", ") || "unknown location";
  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
    { type: "mrkdwn", text: `*Market:*\n${where}` },
  ];
  if (opts.email) {
    fields.push({ type: "mrkdwn", text: `*Email:*\n${opts.email}` });
  }
  return {
    text: `Saw managed-ads pitch: ${opts.providerName} — ${where}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📣 Provider Saw the Managed-Ads Pitch", emoji: true },
      },
      {
        type: "section",
        fields,
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?actor=providers&event_type=market_diagnostic_viewed_no_leads|Activity Center>`,
          },
        ],
      },
    ],
  };
}

// ── Managed Ads funnel + Growth alerts (migration 105) ──────
// Real-time visibility into the reworked provider funnel: who's clicking
// toward managed ads, who's viewing the boost page + their market. Mirrors
// slackMarketDiagnosticNoLeads. The conversion (campaign requested) pings via
// slackAdBoostRequested at the request route, not here.

const ADS_CTA_SOURCE_LABELS: Record<string, string> = {
  dashboard_card: "dashboard card",
  post_edit: "post-edit nudge",
  ff_pitch: "Find Families pitch",
  ff_banner: "Find Families banner",
  your_market_playbook: "Growth playbook",
};

/** 📣 Provider tapped a CTA toward managed ads (/provider/boost). */
export function slackManagedAdsCtaClicked(opts: {
  providerName: string;
  providerSlug: string;
  source: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const sourceLabel = ADS_CTA_SOURCE_LABELS[opts.source] || opts.source;
  return {
    text: `Managed Ads CTA: ${opts.providerName} — from ${sourceLabel}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📣 Provider Tapped Managed Ads", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*From:*\n${sourceLabel}` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?actor=providers&event_type=managed_ads_cta_clicked|Activity Center>` },
        ],
      },
    ],
  };
}

/** 🚀 Provider viewed the managed-ads page (gate / picker / in-motion). */
export function slackBoostViewed(opts: {
  providerName: string;
  providerSlug: string;
  state: string;
  completeness: number | null;
  city?: string | null;
  region?: string | null;
  localDemand?: number | null;
  demandScope?: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const stateLabel =
    opts.state === "gate" ? "below completeness gate"
    : opts.state === "apply" ? "eligible — picking a week"
    : opts.state === "queued" ? "campaign queued"
    : opts.state === "in_motion" ? "campaign in motion"
    : opts.state;
  const where = [opts.city, opts.region].filter(Boolean).join(", ");
  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
    { type: "mrkdwn", text: `*State:*\n${stateLabel}` },
  ];
  if (opts.completeness != null) {
    fields.push({ type: "mrkdwn", text: `*Completeness:*\n${opts.completeness}%` });
  }
  if (where) {
    fields.push({ type: "mrkdwn", text: `*Market:*\n${where}` });
  }
  if (opts.localDemand != null && opts.localDemand > 0) {
    const scope = opts.demandScope === "city" ? "local" : opts.demandScope === "state" ? "statewide" : "market";
    fields.push({
      type: "mrkdwn",
      text: `*7d demand:*\n${opts.localDemand.toLocaleString()} ${scope} views`,
    });
  }
  return {
    text: `Managed Ads page view: ${opts.providerName} — ${stateLabel}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚀 Provider Viewed Managed Ads", emoji: true } },
      { type: "section", fields },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?actor=providers&event_type=managed_ads_boost_viewed|Activity Center>` },
        ],
      },
    ],
  };
}

/** 🏙️ Provider viewed their Growth diagnostic. */
export function slackYourMarketViewed(opts: {
  providerName: string;
  providerSlug: string;
  city: string | null;
  state: string | null;
  covered: boolean;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const where = [opts.city, opts.state].filter(Boolean).join(", ") || "unknown location";
  return {
    text: `Growth view: ${opts.providerName} — ${where}${opts.covered ? "" : " (uncovered)"}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🏙️ Provider Viewed Growth", emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Market:*\n${where}${opts.covered ? "" : " _(not yet covered)_"}` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?actor=providers&event_type=your_market_viewed|Activity Center>` },
        ],
      },
    ],
  };
}

/** 📋 Provider tapped a Growth playbook step. */
export function slackYourMarketPlaybookClicked(opts: {
  providerName: string;
  providerSlug: string;
  item: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  return {
    text: `Growth playbook: ${opts.providerName} — ${opts.item}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📋 Provider Worked Their Playbook", emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Step:*\n${opts.item}` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?actor=providers&event_type=your_market_playbook_clicked|Activity Center>` },
        ],
      },
    ],
  };
}

/** 👀 Provider opened the Find Families section. Fires on every visit (TJ's
 *  call) — the impression matters even when they don't act, because "showed up
 *  and bounced" is signal at our scale. `tab` is which sub-view they landed on. */
export function slackMatchesPageViewed(opts: {
  providerName: string;
  providerSlug: string;
  city: string | null;
  state: string | null;
  tab: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const where = [opts.city, opts.state].filter(Boolean).join(", ") || "unknown location";
  const fields = [
    { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
    { type: "mrkdwn", text: `*Where:*\n${where}` },
  ];
  if (opts.tab) fields.push({ type: "mrkdwn", text: `*Tab:*\n${opts.tab}` });
  return {
    text: `Find Families view: ${opts.providerName} — ${where}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "👀 Provider Opened Find Families", emoji: true } },
      { type: "section", fields },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?actor=providers&event_type=matches_page_viewed|Activity Center>` },
        ],
      },
    ],
  };
}

/** 📨 Provider sent outreach to a family from Find Families — the conversion
 *  moment. Family kept to an opaque id only (no name/PHI in the alert). */
export function slackMatchesOutreachSent(opts: {
  providerName: string;
  providerSlug: string;
  city: string | null;
  state: string | null;
  usedAi: boolean;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const where = [opts.city, opts.state].filter(Boolean).join(", ") || "unknown location";
  return {
    text: `Find Families outreach sent: ${opts.providerName} — ${where}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📨 Provider Reached Out to a Family", emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Where:*\n${where}` },
          { type: "mrkdwn", text: `*Message:*\n${opts.usedAi ? "AI-assisted" : "Written manually"}` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View listing> • <${siteUrl}/admin/activity?actor=providers&event_type=matches_outreach_sent|Activity Center>` },
        ],
      },
    ],
  };
}

// ── Post-answer engagement chain alerts ──────────────────────────
// These three fire across the redirect → hero → action flow that ships
// providers from the question email into profile activation. Real-time
// signal that the funnel is converting; complements the /admin/analytics
// Q&A funnel card which shows the same events in aggregate.
//
// Section keys map to the modal IDs the picker can land on; the labels
// are the human-readable card titles on the dashboard.

const HERO_SECTION_LABELS: Record<string, string> = {
  gallery: "Gallery",
  about: "About",
  pricing: "Pricing",
  services: "Care Services",
  screening: "Staff Screening",
  payment: "Accepted Payments",
  overview: "Profile Overview",
  owner: "Owner Info",
};

function humanizeHeroSection(section: string): string {
  return HERO_SECTION_LABELS[section] || section;
}

/**
 * 🎯 Provider arrived at /provider via the post-answer redirect.
 * Fires when /provider mounts with `?from=qa-success`. Diagnostic for
 * the redirect mechanic separately from whether the hero nudges them
 * into action — see `slackHeroCtaClicked` and `slackProfileEdited`
 * for the downstream signals.
 */
export function slackDashboardArrival(opts: {
  providerSlug: string;
  source: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const sourceLabel = opts.source === "qa-success" ? "After answering a question" : opts.source;
  return {
    text: `Provider arrived at dashboard: ${opts.providerSlug} (${sourceLabel})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🎯 Provider Arrived at Dashboard", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerSlug}` },
          { type: "mrkdwn", text: `*From:*\n${sourceLabel}` },
          { type: "mrkdwn", text: `*Listing:*\n<${siteUrl}/provider/${opts.providerSlug}|View>` },
        ],
      },
    ],
  };
}

const HERO_TIER_LABELS: Record<string, string> = {
  leads: "Inquiries",
  questions: "Q&A",
  completion: "Profile completion",
};

/**
 * ✋ Provider clicked the dashboard hero's CTA. Covers both completion-tier
 * picks (section provided — opens an edit modal) and engagement-tier
 * navigations (tier provided — Link to /provider/connections, /provider/qna,
 * etc.). Renders the right field shape based on which is present.
 */
export function slackHeroCtaClicked(opts: {
  providerSlug: string;
  /** Set when provider clicked a completion-tier CTA (modal-opening). */
  section?: string;
  /** Set when provider clicked an engagement-tier CTA (leads / questions). */
  tier?: string;
  /** Where the engagement-tier CTA navigated to. */
  destination?: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  // Completion-tier shape: "Opening section: Gallery"
  if (opts.section) {
    const sectionLabel = humanizeHeroSection(opts.section);
    return {
      text: `Provider clicked hero CTA: ${opts.providerSlug} → ${sectionLabel}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "✋ Provider Clicked Hero CTA", emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Provider:*\n${opts.providerSlug}` },
            { type: "mrkdwn", text: `*Opening section:*\n${sectionLabel}` },
            { type: "mrkdwn", text: `*Listing:*\n<${siteUrl}/provider/${opts.providerSlug}|View>` },
          ],
        },
      ],
    };
  }

  // Engagement-tier shape: "Going to: Inquiries (/provider/connections)"
  const tierLabel = opts.tier ? (HERO_TIER_LABELS[opts.tier] || opts.tier) : "unknown";
  const destination = opts.destination || "—";
  return {
    text: `Provider clicked hero CTA: ${opts.providerSlug} → ${tierLabel}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "✋ Provider Clicked Hero CTA", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerSlug}` },
          { type: "mrkdwn", text: `*Going to:*\n${tierLabel} (${destination})` },
          { type: "mrkdwn", text: `*Listing:*\n<${siteUrl}/provider/${opts.providerSlug}|View>` },
        ],
      },
    ],
  };
}

/**
 * ✅ Provider saved an edit to a profile section. Conversion outcome —
 * the activation we're trying to drive. Fires for every save (post-answer
 * flow OR routine housekeeping), not scoped to qa-success sessions.
 */
export function slackProfileEdited(opts: {
  providerSlug: string;
  section: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const sectionLabel = humanizeHeroSection(opts.section);
  return {
    text: `Provider edited profile: ${opts.providerSlug} → ${sectionLabel}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "✅ Provider Edited Profile", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerSlug}` },
          { type: "mrkdwn", text: `*Section saved:*\n${sectionLabel}` },
          { type: "mrkdwn", text: `*Listing:*\n<${siteUrl}/provider/${opts.providerSlug}|View>` },
        ],
      },
    ],
  };
}

// ── MedJobs alerts ────────────────────────────────────────────

export function slackMedJobsNewStudent(opts: {
  studentName: string;
  university: string;
  programTrack: string;
  location: string;
}): { text: string; blocks: SlackBlock[] } {
  return {
    text: `MedJobs: New student ${opts.studentName} (${opts.university})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🎓 New MedJobs Student", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Student:*\n${opts.studentName}` },
          { type: "mrkdwn", text: `*University:*\n${opts.university}` },
          { type: "mrkdwn", text: `*Track:*\n${opts.programTrack}` },
          { type: "mrkdwn", text: `*Location:*\n${opts.location}` },
        ],
      },
    ],
  };
}

export function slackMedJobsApplication(opts: {
  studentName: string;
  providerName: string;
  university: string;
}): { text: string; blocks: SlackBlock[] } {
  return {
    text: `MedJobs Application: ${opts.studentName} → ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📋 MedJobs Application", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Student:*\n${opts.studentName}` },
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*University:*\n${opts.university}` },
        ],
      },
    ],
  };
}

export function slackProviderAction(opts: {
  providerName: string;
  action: "approved" | "rejected";
  adminEmail: string;
}): { text: string; blocks: SlackBlock[] } {
  const emoji = opts.action === "approved" ? "👍" : "👎";
  return {
    text: `Provider ${opts.action}: ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} Provider ${opts.action.charAt(0).toUpperCase() + opts.action.slice(1)}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*By:*\n${opts.adminEmail}` },
        ],
      },
    ],
  };
}

export function slackBenefitsStarted(opts: {
  careNeedLabel: string;
  stateCode: string | null;
  stateName: string | null;
  providerName: string | null;
  providerSlug: string | null;
  /** Path of the page that mounted the module. Editorial articles pass
   *  `/caregiver-support/{slug}`; provider mounts leave undefined. When
   *  set to an editorial path, the source line renders "On article: …"
   *  with a clickable link instead of the "On provider page: …" default. */
  entrySource?: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const isEditorialSource = !!opts.entrySource && opts.entrySource.startsWith("/caregiver-support/");

  // Source line — editorial mounts get an "On article" link to the actual
  // article slug; provider mounts (or unknown) keep the original "On
  // provider page" framing. Falls through to "unknown" when neither is set.
  let sourceLine: string;
  if (isEditorialSource) {
    const slug = opts.entrySource!.slice("/caregiver-support/".length);
    sourceLine = `*On article:* <${siteUrl}${opts.entrySource}|${slug}>`;
  } else {
    const providerLine = opts.providerName && opts.providerSlug
      ? `<${siteUrl}/provider/${opts.providerSlug}|${opts.providerName}>`
      : opts.providerName || "unknown provider";
    sourceLine = `*On provider page:* ${providerLine}`;
  }

  return {
    text: `Benefits intake started: ${opts.careNeedLabel}${opts.stateCode ? ` (${opts.stateCode})` : ""}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "👀 Benefits Intake Started", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Care need:*\n${opts.careNeedLabel}` },
          ...(opts.stateName || opts.stateCode
            ? [{ type: "mrkdwn", text: `*State:*\n${opts.stateName || opts.stateCode}` }]
            : []),
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: sourceLine },
      },
    ],
  };
}

export function slackVerificationReview(opts: {
  providerName: string;
  providerSlug: string;
  profileId: string;
  claimerName: string;
  claimerEmail: string;
  claimerRole: string;
  linkedinUrl?: string | null;
  businessWebsiteUrl?: string | null;
  manualReviewRequested?: boolean;
  autoVerifyReason?: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const adminUrl = `${siteUrl}/admin/verification`;

  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
    { type: "mrkdwn", text: `*Claimer:*\n${opts.claimerName}` },
    { type: "mrkdwn", text: `*Email:*\n${opts.claimerEmail}` },
    { type: "mrkdwn", text: `*Role:*\n${opts.claimerRole}` },
  ];

  const links: string[] = [];
  if (opts.linkedinUrl) {
    links.push(`<${opts.linkedinUrl}|LinkedIn>`);
  }
  if (opts.businessWebsiteUrl) {
    links.push(`<${opts.businessWebsiteUrl}|Website>`);
  }
  if (opts.manualReviewRequested) {
    links.push("_No verification URLs provided_");
  }

  // Action value encodes verification data as JSON (pipe delimiter breaks on names with |)
  const actionValue = JSON.stringify({
    profileId: opts.profileId,
    email: opts.claimerEmail,
    name: opts.providerName,
  });

  return {
    text: `Verification review needed: ${opts.providerName} claimed by ${opts.claimerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔍 Verification Review Needed", emoji: true },
      },
      {
        type: "section",
        fields,
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Verification links:*\n${links.length > 0 ? links.join(" • ") : "None provided"}`,
        },
      },
      ...(opts.autoVerifyReason
        ? [
            {
              type: "section" as const,
              text: {
                type: "mrkdwn" as const,
                text: `*Auto-verify result:*\n_${opts.autoVerifyReason}_`,
              },
            },
          ]
        : []),
      {
        type: "actions",
        block_id: `verification_${opts.profileId}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✓ Approve", emoji: true },
            style: "primary",
            action_id: "verification_approve",
            value: actionValue,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "✗ Reject", emoji: true },
            style: "danger",
            action_id: "verification_reject",
            value: actionValue,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "View Profile", emoji: true },
            action_id: "verification_view",
            url: `${siteUrl}/provider/${opts.providerSlug}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${adminUrl}|Open Admin Panel>`,
          },
        ],
      },
    ],
  };
}

export function slackBenefitsCompleted(opts: {
  familyName: string;
  email: string;
  stateCode: string | null;
  careNeedLabel: string | null;
  age: number | null;
  medicaidStatus: string | null;
  incomeRange: string | null;
  matchCount: number;
  /** Rows actually written to saved_programs this request. Differs from
   *  matchCount for returning users (upsert ignores duplicates). */
  programsSaved?: number | null;
  topProgramName: string | null;
  topSavings: string | null;
  isNewUser: boolean;
  /** Page path the intake was submitted from (e.g.
   *  `/benefits/texas/liheap`). Program pages + editorial mounts set this. */
  entrySource?: string | null;
  /** Provider slug, when the intake came from a provider page. */
  providerSlug?: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  // Attribution — where did this lead come from? Humanize the last path
  // segment into a readable label and link to the page. Falls back to the
  // provider page, then to "Direct" when we have no source signal.
  const sourceLine = (() => {
    if (opts.entrySource) {
      const segs = opts.entrySource.split("/").filter(Boolean);
      const last = segs[segs.length - 1] || opts.entrySource;
      const label = last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const kind =
        opts.entrySource.startsWith("/benefits") || opts.entrySource.startsWith("/senior-benefits")
          ? "Benefits page"
          : opts.entrySource.startsWith("/caregiver-support")
            ? "Article"
            : "Page";
      return `<${siteUrl}${opts.entrySource}|${label}> · ${kind}`;
    }
    if (opts.providerSlug) {
      return `<${siteUrl}/provider/${opts.providerSlug}|${opts.providerSlug}> · Provider page`;
    }
    return "Direct (no source page)";
  })();

  // Build the situation line — humanize the numbers
  const situationParts: string[] = [];
  if (opts.age) situationParts.push(`age ${opts.age}`);
  if (opts.medicaidStatus === "alreadyHas") situationParts.push("on Medicaid");
  else if (opts.medicaidStatus === "doesNotHave") situationParts.push("not on Medicaid");
  else if (opts.medicaidStatus === "applying") situationParts.push("applying for Medicaid");
  if (opts.incomeRange && opts.incomeRange !== "preferNotToSay") {
    const incomeLabels: Record<string, string> = {
      under1500: "under $1,500/mo",
      under2500: "$1,500–$2,500/mo",
      under4000: "$2,500–$4,000/mo",
      over4000: "over $4,000/mo",
    };
    const label = incomeLabels[opts.incomeRange];
    if (label) situationParts.push(label);
  }
  const situation = situationParts.length > 0 ? situationParts.join(", ") : "situation details unknown";

  // Match summary — "matched" is the keyword-filter count; "saved" is rows
  // actually written (returning users often re-save 0).
  const programWord = opts.matchCount === 1 ? "program" : "programs";
  const savedNote =
    opts.programsSaved != null && opts.programsSaved !== opts.matchCount
      ? ` (${opts.programsSaved} newly saved)`
      : "";
  const matchLine = opts.topProgramName && opts.topSavings
    ? `${opts.matchCount} ${programWord} matched${savedNote} • Top: *${opts.topProgramName}* (${opts.topSavings})`
    : `${opts.matchCount} ${programWord} matched${savedNote}`;

  return {
    text: `Benefits intake completed: ${opts.familyName} (${opts.matchCount} ${opts.matchCount === 1 ? "match" : "matches"})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🎯 Benefits Intake Completed", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Family:*\n${opts.familyName}${opts.isNewUser ? " (new user)" : ""}` },
          { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
          ...(opts.stateCode
            ? [{ type: "mrkdwn", text: `*State:*\n${opts.stateCode}` }]
            : []),
          ...(opts.careNeedLabel
            ? [{ type: "mrkdwn", text: `*Care need:*\n${opts.careNeedLabel}` }]
            : []),
          { type: "mrkdwn", text: `*Source:*\n${sourceLine}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Situation:* ${situation}\n*Matches:* ${matchLine}`,
        },
      },
      {
        type: "context",
        elements: [
          // NOTE: the Activity Center page reads `category`, not `event_type`
          // — `category=benefits` is the param that actually filters.
          { type: "mrkdwn", text: `<${siteUrl}/admin/activity?actor=families&category=benefits|View in Activity Center> · <${siteUrl}/admin/benefits|Benefits Families>` },
        ],
      },
    ],
  };
}

/**
 * Benefits Cascade escalation — a family tapped "I want help" on the check-in
 * email. This is the cascade trigger: the family floats to the top of the
 * /admin/benefits Families queue and TJ (the concierge rung) follows up
 * personally. PHI note: name + email are fine in this team-restricted
 * channel; keep them out of `text` (notification preview).
 */
export function slackBenefitsWantsHelp(opts: {
  familyName: string;
  email: string | null;
  stateCode: string | null;
  programName: string | null;
  profileId: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  return {
    text: "Benefits cascade: a family asked for help with their application",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🙋 Benefits: family wants help", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Family:*\n${opts.familyName}` },
          { type: "mrkdwn", text: `*Contact:*\n${opts.email || "(no email on file)"}` },
          ...(opts.stateCode ? [{ type: "mrkdwn", text: `*State:*\n${opts.stateCode}` }] : []),
          ...(opts.programName ? [{ type: "mrkdwn", text: `*Program:*\n${opts.programName}` }] : []),
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "They tapped *I want help with this* on the benefits check-in. The check-in email promised a real person will follow up.",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${siteUrl}/admin/care-seekers/${opts.profileId}|Open family record> · <${siteUrl}/admin/benefits|Benefits Families queue>`,
          },
        ],
      },
    ],
  };
}

/**
 * Agent outreach request submitted — primary fulfillment surface for the
 * H1 Wizard-of-Oz outreach module. TJ acts directly from this alert in
 * Claude Code; the alert must be self-contained.
 *
 * Includes:
 *  - Asker email (the To: address)
 *  - Full question text (NO truncation — TJ needs full context to draft)
 *  - Source provider page link
 *  - 3 target providers with name, city, link to Olera detail page
 *  - City + category metadata
 *
 * PHI note: question text + email together is fine in this team-restricted
 * channel. Never put either in `text` (notification preview) — that field
 * surfaces in push notifications and server logs (see
 * feedback_phi_in_subject_lines.md).
 */
/** Display label for the relationship enum. Optional — many submitters skip. */
function formatRelationshipForSlack(rel: string | null): string | null {
  switch (rel) {
    case "my-parent": return "for their parent";
    case "my-spouse": return "for their spouse";
    case "myself": return "for themselves";
    case "other-family": return "for a family member";
    default: return null;
  }
}

export function slackOutreachRequestSubmitted(opts: {
  requestId: string;
  askerEmail: string;
  sourceProviderName: string;
  sourceProviderSlug: string;
  city: string;
  state: string;
  category: string;
  relationship: string | null;
  questionText: string | null;
  targetProviders: Array<{ name: string; slug: string; address: string }>;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const targetCount = opts.targetProviders.length;

  const targetList = opts.targetProviders
    .map((p) => `• <${siteUrl}/provider/${p.slug}|${p.name}> — ${p.address}`)
    .join("\n");

  const relLabel = formatRelationshipForSlack(opts.relationship);

  // First section's fields. Two columns; we pad with the relationship row only
  // when the family told us — keeps the alert dense when they didn't.
  const summaryFields = [
    { type: "mrkdwn", text: `*Reply to:*\n${opts.askerEmail}` },
    { type: "mrkdwn", text: `*Source page:*\n<${siteUrl}/provider/${opts.sourceProviderSlug}|${opts.sourceProviderName}>` },
    { type: "mrkdwn", text: `*Where:*\n${opts.city}, ${opts.state}` },
    { type: "mrkdwn", text: `*Category:*\n${opts.category}` },
  ];
  if (relLabel) {
    summaryFields.push({ type: "mrkdwn", text: `*Care is:*\n${relLabel}` });
  }

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🤝 Outreach Request — needs fulfillment", emoji: true },
    },
    {
      type: "section",
      fields: summaryFields,
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Contact these ${targetCount}:*\n${targetList}`,
      },
    },
  ];

  if (opts.questionText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Asker's question:*\n${opts.questionText}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `Request \`${opts.requestId}\` · reply in thread when handled` },
    ],
  });

  return {
    // No PHI in `text` — this is the notification preview shown in pushes/sidebar.
    text: `Outreach request: ${targetCount} ${opts.category} provider${targetCount === 1 ? "" : "s"} in ${opts.city}, ${opts.state}`,
    blocks,
  };
}

/**
 * Provider requested a managed ad campaign (Ad Boost — concierge v1). Fires
 * when an eligibility-cleared provider submits a campaign request + setup week
 * from the Boost surface. Routes to the concierge team to schedule the
 * campaign the chosen week. No PHI — provider-business data only.
 */
export function slackAdBoostRequested(opts: {
  requestId: string;
  providerName: string;
  providerSlug: string;
  city: string | null;
  state: string | null;
  category: string | null;
  completeness: number;
  setupWeek: string; // ISO date (Monday of the chosen week)
  channel?: string | null;
  /** Provider's intended monthly ad budget in whole USD (non-binding — concierge
   *  confirms before spend). Null when not chosen. */
  budget?: number | null;
  /** True when this request was queued under 70% and JUST auto-promoted after
   *  the provider crossed the completeness threshold (the standing-order
   *  release). Changes the header so the concierge knows it's a fresh,
   *  now-actionable launch — not a brand-new submission. */
  launchReady?: boolean;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const where = [opts.city, opts.state].filter(Boolean).join(", ") || "—";

  const fields = [
    { type: "mrkdwn", text: `*Provider:*\n<${siteUrl}/provider/${opts.providerSlug}|${opts.providerName}>` },
    { type: "mrkdwn", text: `*Where:*\n${where}` },
    { type: "mrkdwn", text: `*Category:*\n${opts.category ?? "—"}` },
    { type: "mrkdwn", text: `*Completeness:*\n${opts.completeness}%` },
    { type: "mrkdwn", text: `*Setup week:*\n${opts.setupWeek}` },
  ];
  if (opts.channel) fields.push({ type: "mrkdwn", text: `*Channel:*\n${opts.channel}` });
  fields.push({
    type: "mrkdwn",
    text: `*Intended budget:*\n${opts.budget != null ? `$${opts.budget}/mo (confirm before spend)` : "—"}`,
  });

  const header = opts.launchReady
    ? "🚀 Ad Boost now LAUNCH-READY — provider just cleared 70%"
    : "📣 Ad Boost request — schedule setup";
  const contextNote = opts.launchReady
    ? `Request \`${opts.requestId}\` · queued earlier, profile now ready · launch the week of ${opts.setupWeek}`
    : `Request \`${opts.requestId}\` · set up the campaign the week of ${opts.setupWeek}`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: header, emoji: true },
    },
    { type: "section", fields },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: contextNote }],
    },
  ];

  return {
    text: `${opts.launchReady ? "Ad Boost LAUNCH-READY" : "Ad Boost request"}: ${opts.providerName} (${where}) — setup week ${opts.setupWeek}`,
    blocks,
  };
}

/**
 * Email captured via the qa_email_capture variant — fires when a guest who
 * just asked a question on a provider page submits their email through the
 * post-submit enrichment prompt. This is the conversion event for the 5th
 * arm of the SBF intake A/B (since 2026-05-05) and the canonical signal that
 * the experiment is working.
 *
 * Pattern mirrors slackOutreachRequestSubmitted: arm-specific header, summary
 * fields with reply-to + source page + location + category, the alternatives
 * we sent (full provider links), the asker's question, and a question_id
 * footer for traceability. Notification preview text is PHI-free per
 * feedback_phi_in_subject_lines.md.
 */
export function slackQuestionEmailEnriched(opts: {
  questionId: string;
  askerEmail: string;
  questionText: string;
  sourceProviderName: string;
  sourceProviderSlug: string;
  city: string | null;
  state: string | null;
  /** Display-ready category label (e.g., "Memory Care", "Home Care").
   *  May be null when the source provider's category isn't resolvable. */
  category: string | null;
  /** The 3 alternative providers we emailed to the family. Each has the
   *  full URL ready (computed from siteUrl + slug at the call site) so
   *  this helper doesn't need to know the routing convention. The `city`
   *  field carries the alternative's address string (named to match the
   *  shape of `questionConfirmationEmail.alternatives`). */
  alternatives: Array<{ name: string; city: string | null; url: string }>;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const altCount = opts.alternatives.length;

  const altList = opts.alternatives
    .map(
      (a) =>
        `• <${a.url}|${a.name}>${a.city ? ` — ${a.city}` : ""}`,
    )
    .join("\n");

  const summaryFields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Reply to:*\n${opts.askerEmail}` },
    {
      type: "mrkdwn",
      text: `*Source page:*\n<${siteUrl}/provider/${opts.sourceProviderSlug}|${opts.sourceProviderName}>`,
    },
  ];
  if (opts.city || opts.state) {
    const where = [opts.city, opts.state].filter(Boolean).join(", ");
    summaryFields.push({ type: "mrkdwn", text: `*Where:*\n${where}` });
  }
  if (opts.category) {
    summaryFields.push({ type: "mrkdwn", text: `*Category:*\n${opts.category}` });
  }

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "✉️ Q&A Email Captured — qa_email_capture",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: summaryFields,
    },
  ];

  if (altCount > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*We sent ${altCount} alternative${altCount === 1 ? "" : "s"}:*\n${altList}`,
      },
    });
  }

  if (opts.questionText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Their question:*\n${opts.questionText}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Question \`${opts.questionId}\` · email captured via qa_email_capture arm`,
      },
    ],
  });

  // PHI-free preview — no asker email, no question text, no source provider
  // name. Just the surface count + category + city.
  const noun = opts.category || "providers";
  const wherePreview = opts.city
    ? `${opts.city}${opts.state ? `, ${opts.state}` : ""}`
    : "their area";
  const previewText =
    altCount > 0
      ? `Q&A capture: ${altCount} ${noun} in ${wherePreview}`
      : `Q&A capture: question + email in ${wherePreview}`;

  return { text: previewText, blocks };
}

export function slackSaveNudgeConverted(opts: {
  familyName: string;
  email: string;
  savedCount: number;
  savedProviderNames: string[];
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  const providerWord = opts.savedCount === 1 ? "provider" : "providers";
  const providerList = opts.savedProviderNames
    .slice(0, 5)
    .map((n) => `• ${n}`)
    .join("\n");
  const moreText =
    opts.savedProviderNames.length > 5
      ? `\n_+${opts.savedProviderNames.length - 5} more_`
      : "";

  return {
    text: `Save → Signup: ${opts.familyName} signed up after saving ${opts.savedCount} ${providerWord}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "💚 Save → Signup Conversion", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Family:*\n${opts.familyName}` },
          { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
          { type: "mrkdwn", text: `*Providers Saved:*\n${opts.savedCount}` },
          { type: "mrkdwn", text: `*Source:*\nNudge Toast` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Saved:*\n${providerList}${moreText}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/admin/activity?actor=families|View Activity>` },
        ],
      },
    ],
  };
}

export function slackVariantConverted(opts: {
  variant: "multi_provider" | "multi_provider_v2";
  email: string;
  providerName: string;
  questionText?: string;
  sentCount?: number;
  providerSlug?: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  const variantLabel = opts.variant === "multi_provider_v2" ? "Multi-Provider V2" : "Multi-Provider";
  const emoji = "🔀";

  const headerText = opts.sentCount && opts.sentCount > 1
    ? `${emoji} Q&A Conversion: ${opts.sentCount} providers`
    : `${emoji} Q&A Conversion: ${variantLabel}`;

  const fields: SlackBlock["fields"] = [
    { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
    { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
    { type: "mrkdwn", text: `*Variant:*\n${variantLabel}` },
  ];

  if (opts.sentCount && opts.sentCount > 1) {
    fields.push({ type: "mrkdwn", text: `*Providers Asked:*\n${opts.sentCount}` });
  }

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      fields,
    },
  ];

  if (opts.questionText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Question:*\n_"${opts.questionText}"_`,
      },
    });
  }

  if (opts.providerSlug) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `<${siteUrl}/provider/${opts.providerSlug}|View Provider>` },
      ],
    });
  }

  return {
    text: `Q&A ${variantLabel} Conversion: ${opts.email} asked ${opts.providerName}`,
    blocks,
  };
}

/**
 * Compare CTA conversion — fires when a guest user enters their email
 * in the Compare overlay/bottom sheet and we create an account for them.
 * This is the conversion event for the Compare CTA variant.
 */
export function slackCompareCtaConverted(opts: {
  email: string;
  providerCount: number;
  providerNames: string[];
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  const providerWord = opts.providerCount === 1 ? "provider" : "providers";
  const providerList = opts.providerNames
    .slice(0, 5)
    .map((n) => `• ${n}`)
    .join("\n");
  const moreText =
    opts.providerNames.length > 5
      ? `\n_+${opts.providerNames.length - 5} more_`
      : "";

  return {
    text: `Compare CTA Conversion: ${opts.email} signed up comparing ${opts.providerCount} ${providerWord}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔄 Compare CTA Conversion", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
          { type: "mrkdwn", text: `*Providers Compared:*\n${opts.providerCount}` },
          { type: "mrkdwn", text: `*Source:*\nCompare CTA` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Comparing:*\n${providerList}${moreText}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${siteUrl}/admin/activity?actor=families|View Activity>` },
        ],
      },
    ],
  };
}

/**
 * Guide CTA conversion — fires when a guest user enters their email
 * to download the senior care guide PDF. Single provider focus.
 * This is the conversion event for the Guide CTA variant.
 */
export function slackGuideCtaConverted(opts: {
  email: string;
  providerName: string;
  providerSlug?: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  return {
    text: `Guide CTA Conversion: ${opts.email} downloaded guide on ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📄 Guide CTA Conversion", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Source:*\nGuide CTA` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: opts.providerSlug
              ? `<${siteUrl}/provider/${opts.providerSlug}|View Provider> • <${siteUrl}/admin/activity?actor=families|View Activity>`
              : `<${siteUrl}/admin/activity?actor=families|View Activity>`,
          },
        ],
      },
    ],
  };
}

/**
 * Lead Capture conversion — fires when a guest user submits the lead capture
 * form (Get a Custom Quote, Book a Consultation, Message Staff).
 * This is the conversion event for inline lead capture actions.
 */
export function slackLeadCaptureConverted(opts: {
  email: string;
  providerName: string;
  providerSlug?: string;
  entryPoint: "custom_quote" | "book_consultation" | "message_host" | string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  const entryPointLabels: Record<string, string> = {
    custom_quote: "Get a Custom Quote",
    book_consultation: "Book a Consultation",
    message_host: "Message Staff",
  };
  const entryLabel = entryPointLabels[opts.entryPoint] || opts.entryPoint;

  return {
    text: `Lead Capture Conversion: ${opts.email} via "${entryLabel}" on ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "💬 Lead Capture Conversion", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
          { type: "mrkdwn", text: `*Entry Point:*\n${entryLabel}` },
        ],
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: opts.providerSlug
              ? `<${siteUrl}/provider/${opts.providerSlug}|View Provider> • <${siteUrl}/admin/activity?actor=families|View Activity>`
              : `<${siteUrl}/admin/activity?actor=families|View Activity>`,
          },
        ],
      },
    ],
  };
}

/**
 * Legacy Connect conversion — fires when a guest user submits the legacy
 * connection card (desktop sidebar or mobile sticky bar).
 */
export function slackLegacyConnectConverted(opts: {
  email: string;
  providerName: string;
  providerSlug?: string;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

  return {
    text: `Legacy Connect Conversion: ${opts.email} connected with ${opts.providerName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔗 Legacy Connect Conversion", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Email:*\n${opts.email}` },
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: opts.providerSlug
              ? `<${siteUrl}/provider/${opts.providerSlug}|View Provider> • <${siteUrl}/admin/activity?actor=families|View Activity>`
              : `<${siteUrl}/admin/activity?actor=families|View Activity>`,
          },
        ],
      },
    ],
  };
}

/**
 * A family submitted a request on an Olera city landing page.
 *
 * The headline distinguishes a lead the ads PAID for from one that arrived any
 * other way, because those are different events: the first says the campaign is
 * working and money is converting, the second is a bonus. A paid lead is the
 * moment the whole city pilot exists to produce, so it gets the loud treatment.
 */
export function slackCityLead(opts: {
  city: string;
  firstName: string;
  phone: string;
  careLabel: string;
  recipientLabel: string;
  urgencyLabel: string;
  zip?: string | null;
  channel: string | null;
  campaignTag?: string | null;
  paid: boolean;
  /** Concierge city: no provider chain, a human must call. */
  concierge?: boolean;
  nextStep: string;
  adminUrl: string;
}): { text: string; blocks: SlackBlock[] } {
  const headline = opts.concierge
    ? `📞 Call this family · ${opts.city}${opts.paid && opts.channel ? ` (${opts.channel})` : ""}`
    : opts.paid
      ? `💸 Paid lead · ${opts.city}${opts.channel ? ` (${opts.channel})` : ""}`
      : `🆕 Lead · ${opts.city}`;
  return {
    text: `${headline} — ${opts.firstName}, ${opts.careLabel}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Family:*\n${opts.firstName} · ${opts.phone}` },
          { type: "mrkdwn", text: `*Needs:*\n${opts.careLabel} for ${opts.recipientLabel}` },
          { type: "mrkdwn", text: `*Starting:*\n${opts.urgencyLabel}` },
          {
            type: "mrkdwn",
            text: `*Source:*\n${opts.paid ? opts.channel ?? "paid" : "direct, no campaign"}${opts.zip ? ` · ZIP ${opts.zip}` : ""}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${opts.nextStep}${opts.campaignTag ? ` · \`${opts.campaignTag}\`` : ""} · <${opts.adminUrl}|Open the queue>`,
          },
        ],
      },
    ],
  };
}

/**
 * Someone began the /care/{city} form but has not submitted it.
 *
 * There are no contact details at this point and there never will be unless
 * they finish, so this alert exists to say "a real person is in the form right
 * now" — not to be acted on directly. In a concierge city TJ calls every family
 * himself, so knowing a start happened (and, when they drop, that it happened
 * at all) is the difference between a silent flight and a readable one.
 *
 * Deliberately quieter than slackCityLead: no header block, one context line.
 * A start is not a lead and must not look like one in the channel.
 */
export function slackCityQuizStarted(opts: {
  city: string;
  recipientLabel: string | null;
  /** What kind of help. Every landing arm captures this; only one captures
   *  the recipient, which is why the headline leads with care type. */
  careLabel?: string | null;
  /** Which landing-page arm they are on, so whoever calls knows what they saw. */
  arm?: string | null;
  channel: string | null;
  campaignTag?: string | null;
  paid: boolean;
  adminUrl: string;
}): { text: string; blocks: SlackBlock[] } {
  const source = opts.paid ? opts.channel ?? "paid" : "direct, no campaign";
  // Care type first because all three arms have it; recipient only when the
  // arm actually asked for it.
  const what = opts.careLabel ? ` · ${opts.careLabel}` : "";
  const caring = opts.recipientLabel ? ` · for ${opts.recipientLabel}` : "";
  const text = `✍️ Reached the contact step · ${opts.city} (${source})${what}${caring}`;
  return {
    text,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${text}*` },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `No contact details yet — nothing to act on unless they finish.${opts.arm ? ` · page \`${opts.arm}\`` : ""}${opts.campaignTag ? ` · \`${opts.campaignTag}\`` : ""} · <${opts.adminUrl}|Open the queue>`,
          },
        ],
      },
    ],
  };
}

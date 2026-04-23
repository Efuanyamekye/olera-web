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
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  return {
    text: `Provider claimed: ${opts.providerName} by ${opts.claimedByEmail}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "✅ Provider Claimed", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Provider:*\n${opts.providerName}` },
          { type: "mrkdwn", text: `*Claimed by:*\n${opts.claimedByEmail}` },
        ],
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
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const providerLine = opts.providerName && opts.providerSlug
    ? `<${siteUrl}/provider/${opts.providerSlug}|${opts.providerName}>`
    : opts.providerName || "unknown provider";

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
        text: { type: "mrkdwn", text: `*On provider page:* ${providerLine}` },
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
  topProgramName: string | null;
  topSavings: string | null;
  isNewUser: boolean;
}): { text: string; blocks: SlackBlock[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

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

  // Match summary
  const programWord = opts.matchCount === 1 ? "program" : "programs";
  const matchLine = opts.topProgramName && opts.topSavings
    ? `${opts.matchCount} ${programWord} saved • Top: *${opts.topProgramName}* (${opts.topSavings})`
    : `${opts.matchCount} ${programWord} saved`;

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
          { type: "mrkdwn", text: `<${siteUrl}/admin/activity?actor=families&event_type=benefits_completed|View in Activity Center>` },
        ],
      },
    ],
  };
}

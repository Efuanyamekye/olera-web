/**
 * Provider Outreach Email Templates
 *
 * Cold outreach templates for unclaimed providers in the Olera directory.
 * Goal: get providers to claim their profile and add their contact information.
 *
 * Tone principles:
 *   - professional, direct, value-focused
 *   - no em-dashes
 *   - no marketing fluff
 *   - relationship-oriented, not transactional
 *
 * Structure:
 *   - Body is plain text with markdown markers:
 *       **text**       → <strong>text</strong> in HTML
 *       [label](url)   → <a href="url">label</a> in HTML
 *   - Footer (Logan signature + links) is composed separately.
 *
 * Variables (substituted by substituteVars):
 *   {provider_name}      provider organization name
 *   {city}               provider city
 *   {state}              provider state
 *   {category}           provider care type (e.g., "home care")
 *   {rank}               provider's ranking in market (number)
 *   {total}              total providers in market
 *   {ordinal}            ordinal form of rank ("1st", "2nd", etc.)
 *   {profile_url}        link to their Olera profile page (no sign-in)
 *   {claim_url}          magic link to claim/verify their profile
 *   {manage_url}         magic link to manage listing
 *   {remove_url}         link to request listing removal
 *   {unsubscribe_url}    link to unsubscribe from emails
 *   {mailing_address}    physical mailing address (CAN-SPAM)
 *   {gap_list}           formatted list of missing profile fields (Day 3 only)
 */

export interface EmailDraft {
  subject: string;
  preheader?: string;
  body: string;
}

export interface TemplateContext {
  provider_name: string;
  city: string;
  state: string;
  category?: string;
  // Ranking data (optional - if missing, use fallback opener)
  rank?: number;
  total?: number;
  // URLs
  profile_url: string;
  claim_url: string;
  manage_url: string;
  remove_url: string;
  unsubscribe_url: string;
  // Compliance
  mailing_address: string;
  // Profile gaps (Day 3 template)
  gap_list?: string;
  // City demand metric (Day 5 template)
  // Total unique page views for this city+category in the last 30 days
  city_views?: number;
  // Decision-maker data (from Apollo contact)
  // Used for personalized greetings: "Hi John," vs "Hi Sunrise Senior Living,"
  decision_maker?: {
    first_name: string | null;
    last_name: string | null;
    title: string | null;
  };
}

// Template keys for the cadence system
// Cadence emails: intro (Day 0), followup (Day 3), demand_loss (Day 5), final (Day 7)
// Standalone: nudge (Follow Up resend action)
export type ProviderOutreachTemplateKey = "intro" | "followup" | "demand_loss" | "final" | "nudge";

// Placeholders for variable substitution
const PLACEHOLDER = {
  greetingName: "{greeting_name}",  // For personalized greeting: first name if decision-maker, else org name
  providerName: "{provider_name}",
  city: "{city}",
  state: "{state}",
  category: "{category}",
  rank: "{rank}",
  total: "{total}",
  ordinal: "{ordinal}",
  profileUrl: "{profile_url}",
  claimUrl: "{claim_url}",
  manageUrl: "{manage_url}",
  removeUrl: "{remove_url}",
  unsubscribeUrl: "{unsubscribe_url}",
  mailingAddress: "{mailing_address}",
  gapList: "{gap_list}",
  cityViews: "{city_views}",
};


/**
 * Convert number to ordinal string (1 → "1st", 2 → "2nd", etc.)
 */
export function toOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Get a template by key
 */
export function getTemplate(
  key: ProviderOutreachTemplateKey,
  ctx: TemplateContext
): EmailDraft {
  // Minimum threshold for showing specific view counts in demand-loss email
  // Below this, we use generic "families are searching" language
  const CITY_VIEWS_THRESHOLD = 10;
  const hasDemandData = ctx.city_views != null && ctx.city_views >= CITY_VIEWS_THRESHOLD;

  switch (key) {
    case "intro":
      return introEmail();
    case "followup":
      return followupEmail();
    case "demand_loss":
      return demandLossEmail(hasDemandData);
    case "final":
      return finalEmail();
    case "nudge":
      return nudgeEmail();
  }
}

/**
 * Substitute variables in subject and body
 */
export function substituteVars(
  text: string,
  vars: Record<string, string>
): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

/**
 * Build the variables object from context
 */
export function buildVars(ctx: TemplateContext): Record<string, string> {
  // Use decision-maker's first name for greeting if available,
  // otherwise fall back to provider/organization name
  const greetingName = ctx.decision_maker?.first_name?.trim() || ctx.provider_name;

  return {
    greeting_name: greetingName,
    provider_name: ctx.provider_name,
    city: ctx.city || ctx.state || "your area",
    state: ctx.state,
    category: ctx.category || "care providers",
    rank: ctx.rank?.toString() || "",
    total: ctx.total?.toString() || "",
    ordinal: ctx.rank ? toOrdinal(ctx.rank) : "",
    profile_url: ctx.profile_url,
    claim_url: ctx.claim_url,
    manage_url: ctx.manage_url,
    remove_url: ctx.remove_url,
    unsubscribe_url: ctx.unsubscribe_url,
    mailing_address: ctx.mailing_address,
    gap_list: ctx.gap_list || "",
    city_views: ctx.city_views?.toLocaleString() || "0",
  };
}

// ── Templates ────────────────────────────────────────────────────────────

/**
 * Day 0: Introduction email
 *
 * First touch. Direct value prop: families can see you but can't reach you.
 * Shorter, more urgent, location-specific.
 *
 * Style: Direct, concise, action-oriented.
 * Each array element is a paragraph. Empty strings create paragraph breaks.
 * Single newlines within elements become <br> tags.
 */
function introEmail(): EmailDraft {
  return {
    subject: `Families in ${PLACEHOLDER.city} can see ${PLACEHOLDER.providerName} on Olera`,
    body: [
      `Hi ${PLACEHOLDER.greetingName},`,
      ``,
      `Families in ${PLACEHOLDER.city} searching for ${PLACEHOLDER.category} can already see the page we built for ${PLACEHOLDER.providerName} from public information. But if one of them reached out today, no one at ${PLACEHOLDER.providerName} would see the message.`,
      ``,
      `Olera is free for providers: no contracts, no referral or per-lead fees. Taking over your page takes about two minutes.`,
      ``,
      `[Activate your page →](${PLACEHOLDER.claimUrl})`,
      ``,
      `Questions? Just reply to this email or call +1 (979) 243-9801. A real person answers both.`,
    ].join("\n"),
  };
}

/**
 * Day 3: Follow-up email
 *
 * Control angle: who updates/owns the page? Information gets stale
 * and no one at the facility can fix it.
 *
 * Style: Direct, concise, action-oriented.
 */
function followupEmail(): EmailDraft {
  return {
    subject: `Who updates ${PLACEHOLDER.providerName}'s page?`,
    body: [
      `Hi ${PLACEHOLDER.greetingName},`,
      ``,
      `${PLACEHOLDER.providerName}'s page on Olera shows what we could find publicly. But things change. Pricing, availability, staff, photos. Right now, no one at ${PLACEHOLDER.providerName} can update any of it.`,
      ``,
      `Taking over your page puts it in your hands. Two minutes, free: no contracts, no referral or per-lead fees.`,
      ``,
      `[Activate your page →](${PLACEHOLDER.claimUrl})`,
      ``,
      `Questions? Just reply to this email or call +1 (979) 243-9801. A real person answers both.`,
    ].join("\n"),
  };
}

/**
 * Day 5: Demand loss email
 *
 * FOMO angle: other providers are getting questions/leads.
 * Shortest template - pure urgency.
 *
 * Style: Direct, urgent, minimal.
 */
function demandLossEmail(_hasDemandData: boolean): EmailDraft {
  // Note: hasDemandData parameter kept for backward compatibility but no longer used
  return {
    subject: `Families' questions are going to other providers`,
    body: [
      `Hi ${PLACEHOLDER.greetingName},`,
      ``,
      `Families on Olera sent providers questions and leads this week. If any came to ${PLACEHOLDER.providerName}, no one could answer them. No one has taken over your page yet.`,
      ``,
      `Two minutes and it's yours, free: [Activate your page →](${PLACEHOLDER.claimUrl})`,
      ``,
      `Questions? Just reply to this email or call +1 (979) 243-9801. A real person answers both.`,
    ].join("\n"),
  };
}

/**
 * Day 7: Final email
 *
 * Incentive angle: free ad offer. Different closing - asks if
 * wrong contact to encourage forwarding.
 *
 * Style: Direct, value-add offer.
 */
function finalEmail(): EmailDraft {
  return {
    subject: `We'll run ${PLACEHOLDER.providerName}'s first ad on us`,
    body: [
      `Hi ${PLACEHOLDER.greetingName},`,
      ``,
      `One last thing you should know. We'll set up and run ${PLACEHOLDER.providerName}'s first ad, on us, so more families in ${PLACEHOLDER.city} find you. It starts with taking over your page. Two minutes, free, no contracts or per-lead fees.`,
      ``,
      `[Activate your page →](${PLACEHOLDER.claimUrl})`,
      ``,
      `If I've been writing to the wrong person, just reply with the right name and I'll take it from there.`,
    ].join("\n"),
  };
}

/**
 * Standalone: Nudge email
 *
 * NOT part of the cadence. Used by:
 *   - "Send Claim Link" action from Ready tab / Not Interested stage
 *   - Future re-engagement triggers
 *
 * Short and direct - just delivers the link.
 *
 * Style: Minimal, transactional.
 */
function nudgeEmail(): EmailDraft {
  return {
    subject: `The link for ${PLACEHOLDER.providerName}'s page`,
    body: [
      `Hi ${PLACEHOLDER.greetingName},`,
      ``,
      `Here's the link to take over ${PLACEHOLDER.providerName}'s page on Olera:`,
      ``,
      `[Activate your page →](${PLACEHOLDER.claimUrl})`,
      ``,
      `Two minutes, free: no contracts, no referral or per-lead fees. If anything gets in the way, just reply or call +1 (979) 243-9801.`,
    ].join("\n"),
  };
}

// ── Signature ────────────────────────────────────────────────────────────

/**
 * Logan photo URL (Supabase-hosted for email compatibility)
 */
export const LOGAN_PHOTO_URL =
  "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/team/logan.jpg";

/** Brand color for links */
const BRAND_COLOR = "#198087";

/** LinkedIn profile URLs */
const LINKEDIN_LOGAN = "https://www.linkedin.com/in/logan-dubose/";
const LINKEDIN_TJ = "https://www.linkedin.com/in/tfalohun/";

/**
 * Logan signature block HTML.
 * Photo + bio with LinkedIn links for both Logan and TJ.
 * Matches the polished style used in weekly digest emails.
 * NOTE: No leading newline to avoid extra whitespace when concatenated.
 */
export function loganSignatureHtml(): string {
  // NOTE: margin-top reduced from 24px to 8px to avoid huge gaps while maintaining
  // reasonable spacing for both SmartLead and Resend email paths.
  // - SmartLead: "Logan" has 8px bottom margin + 8px top = 16px gap (good)
  // - Resend: "Logan" has 0px bottom margin + 8px top = 8px gap (good)
  return `<table cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td style="vertical-align:top;padding-right:16px;"><img src="${LOGAN_PHOTO_URL}" alt="Dr. Logan DuBose" width="64" height="64" style="border-radius:50%;display:block;" /></td><td style="vertical-align:top;font-size:13px;line-height:1.5;color:#6b7280;font-family:Inter,Arial,sans-serif;"><p style="margin:0;">Olera is built by <a href="${LINKEDIN_LOGAN}" style="color:${BRAND_COLOR};text-decoration:underline;">Dr. Logan DuBose</a>, a physician-researcher funded by NIH SBIR, and <a href="${LINKEDIN_TJ}" style="color:${BRAND_COLOR};text-decoration:underline;">TJ Falohun</a>, a PhD researcher in biomedical engineering. We&rsquo;re working to make senior care easier to understand and compare.</p></td></tr></table>`;
}



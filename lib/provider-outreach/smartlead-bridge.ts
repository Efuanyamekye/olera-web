/**
 * Provider Outreach SmartLead Bridge
 *
 * Maps provider outreach data → SmartLead leads, builds the email sequence
 * from provider templates, and handles campaign enrollment.
 *
 * Architecture mirrors lib/medjobs/smartlead-bridge.ts but adapted for
 * provider outreach:
 *   - No Named Contact fan-out (providers have single contact email)
 *   - 4-step sequence: Day 0, 3, 5, 7
 *   - Custom fields: tracking_id, provider_id, claim_url, profile_url, etc.
 *   - Per-state campaign organization
 *
 * SmartLead owns EMAIL scheduling + sending. No more cron-based sends.
 * Webhook receives reply/bounce/open events back into CRM.
 */

import {
  addLeads,
  attachEmailAccounts,
  createCampaign,
  ensureCampaignWebhook,
  buildSmartleadWebhookUrl,
  getLeadByEmail,
  listEmailAccounts,
  resumeLeadInCampaign,
  saveSequence,
  setCampaignSchedule,
  setCampaignStatus,
  type SmartleadLead,
  type SmartleadSequenceStep,
} from "@/lib/smartlead";
import {
  PROVIDER_OUTREACH_CADENCE,
  type CadenceStep,
} from "./cadence";
import {
  getTemplate,
  type ProviderOutreachTemplateKey,
  type TemplateContext,
} from "./templates";
// Note: bodyToHtml, smartleadBrandedLayout, getCategoryLabel, loganSignatureHtml removed -
// SmartLead path now uses inline smartleadBodyToHtml and text-only signature (no image)

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProviderBridgeRow {
  /** provider_outreach_tracking.id */
  tracking_id: string;
  /** olera-providers.provider_id */
  provider_id: string;
  provider_name: string;
  email: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  slug: string | null;
  /** Already enrolled in SmartLead for this cycle */
  already_enrolled?: boolean;
  /** On shared suppression list */
  suppressed?: boolean;
  /** Profile gaps formatted for Day 3 email */
  gap_list?: string;
  /** City views for Day 5 email */
  city_views?: number;
  /** URLs pre-generated for this provider */
  claim_url: string;
  profile_url: string;
  manage_url: string;
  remove_url: string;
  unsubscribe_url: string;
  /** Decision-maker first name (from Apollo) for personalized greeting */
  decision_maker_first_name?: string | null;
}

export type ProviderSkipReason =
  | "no_email"
  | "already_enrolled"
  | "suppressed"
  | "invalid_data";

export interface ProviderSelectionResult {
  eligible: ProviderBridgeRow[];
  skipped: { tracking_id: string; provider_id: string; reason: ProviderSkipReason }[];
}

export interface ProviderSmartleadData {
  campaign_id: number;
  lead_id?: number;
  lead_email: string;
  enrolled_at: string;
  campaign_name?: string;
}

// ── Selection & Filtering ─────────────────────────────────────────────────

/**
 * Filter provider rows for SmartLead enrollment eligibility.
 *
 * Skip reasons:
 *   - no_email: Provider has no contact email
 *   - already_enrolled: Already has smartlead_data for this cycle
 *   - suppressed: On bounce/complaint suppression list
 *   - invalid_data: Missing required fields (slug, name)
 */
export function selectEligibleProviders(
  rows: ProviderBridgeRow[]
): ProviderSelectionResult {
  const eligible: ProviderBridgeRow[] = [];
  const skipped: { tracking_id: string; provider_id: string; reason: ProviderSkipReason }[] = [];

  for (const row of rows) {
    let reason: ProviderSkipReason | null = null;

    if (!row.email?.trim()) {
      reason = "no_email";
    } else if (row.already_enrolled) {
      reason = "already_enrolled";
    } else if (row.suppressed) {
      reason = "suppressed";
    } else if (!row.slug || !row.provider_name) {
      reason = "invalid_data";
    }

    if (reason) {
      skipped.push({ tracking_id: row.tracking_id, provider_id: row.provider_id, reason });
    } else {
      eligible.push(row);
    }
  }

  return { eligible, skipped };
}

// ── Lead Mapping ──────────────────────────────────────────────────────────

/**
 * Map a provider to a SmartLead lead with custom fields for merge tags.
 *
 * Custom fields:
 *   - tracking_id: For webhook attribution back to CRM
 *   - provider_id: Join key for provider data
 *   - claim_url: Per-provider magic link (CTA)
 *   - profile_url: Public listing URL
 *   - city, state, category: For merge tags
 *   - gap_list: For Day 3 email
 *   - city_views: For Day 5 email
 *   - greeting_name: For personalized greeting (first name if decision-maker, else org name)
 */
export function providerToLead(row: ProviderBridgeRow): SmartleadLead {
  // Use decision-maker's first name for greeting if available, else org name
  const greetingName = row.decision_maker_first_name?.trim() || row.provider_name;

  return {
    email: row.email!.trim(),
    first_name: "", // Providers don't have a first name, we use company_name
    company_name: row.provider_name,
    custom_fields: {
      tracking_id: row.tracking_id,
      provider_id: row.provider_id,
      claim_url: row.claim_url,
      profile_url: row.profile_url,
      manage_url: row.manage_url,
      remove_url: row.remove_url,
      unsubscribe_url: row.unsubscribe_url,
      city: row.city || row.state || "your area",
      state: row.state ?? "",
      category: row.category ?? "care providers",
      gap_list: row.gap_list ?? "",
      city_views: String(row.city_views ?? 0),
      greeting_name: greetingName,
    },
  };
}

/**
 * Map multiple providers to leads with cross-batch deduplication.
 * First occurrence wins (by email, case-insensitive).
 */
export function providersToLeads(rows: ProviderBridgeRow[]): {
  leads: SmartleadLead[];
  duplicates: { tracking_id: string; provider_id: string; email: string }[];
} {
  const seen = new Set<string>();
  const leads: SmartleadLead[] = [];
  const duplicates: { tracking_id: string; provider_id: string; email: string }[] = [];

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email) continue;

    if (seen.has(email)) {
      duplicates.push({ tracking_id: row.tracking_id, provider_id: row.provider_id, email });
      continue;
    }

    seen.add(email);
    leads.push(providerToLead(row));
  }

  return { leads, duplicates };
}

// ── Sequence Building ─────────────────────────────────────────────────────

/**
 * SmartLead merge tags that replace template variables.
 * These are filled per-lead at send time by SmartLead.
 */
const MERGE_TAGS = {
  greetingName: "{{greeting_name}}",  // For personalized greeting: first name if decision-maker, else org name
  providerName: "{{company_name}}",
  claimUrl: "{{claim_url}}",
  profileUrl: "{{profile_url}}",
  manageUrl: "{{manage_url}}",
  removeUrl: "{{remove_url}}",
  unsubscribeUrl: "{{unsubscribe_url}}",
  city: "{{city}}",
  state: "{{state}}",
  category: "{{category}}",
  gapList: "{{gap_list}}",
  cityViews: "{{city_views}}",
} as const;

/**
 * Physical mailing address for CAN-SPAM compliance.
 * Must match DEFAULT_MAILING_ADDRESS in email-utils.ts for consistency.
 */
const MAILING_ADDRESS = "340 S Lemon Ave #1439, Walnut, CA 91789";

/**
 * Convert provider template variables to SmartLead merge tags.
 *
 * Template tokens → SmartLead merge tags:
 *   {greeting_name} → {{greeting_name}}
 *   {provider_name} → {{company_name}}
 *   {claim_url} → {{claim_url}}
 *   {profile_url} → {{profile_url}}
 *   {city} → {{city}}
 *   {gap_list} → {{gap_list}}
 *   {city_views} → {{city_views}}
 *   etc.
 */
function convertToSmartleadTokens(text: string): string {
  return text
    .replace(/\{greeting_name\}/g, MERGE_TAGS.greetingName)
    .replace(/\{provider_name\}/g, MERGE_TAGS.providerName)
    .replace(/\{claim_url\}/g, MERGE_TAGS.claimUrl)
    .replace(/\{profile_url\}/g, MERGE_TAGS.profileUrl)
    .replace(/\{manage_url\}/g, MERGE_TAGS.manageUrl)
    .replace(/\{remove_url\}/g, MERGE_TAGS.removeUrl)
    .replace(/\{unsubscribe_url\}/g, MERGE_TAGS.unsubscribeUrl)
    .replace(/\{city\}/g, MERGE_TAGS.city)
    .replace(/\{state\}/g, MERGE_TAGS.state)
    .replace(/\{category\}/g, MERGE_TAGS.category)
    .replace(/\{gap_list\}/g, MERGE_TAGS.gapList)
    .replace(/\{city_views\}/g, MERGE_TAGS.cityViews)
    .replace(/\{mailing_address\}/g, MAILING_ADDRESS)
    // Remove rank/ordinal/total placeholders (not used in SmartLead version)
    .replace(/\{rank\}/g, "")
    .replace(/\{ordinal\}/g, "")
    .replace(/\{total\}/g, "");
}

// ── SmartLead-specific body rendering ─────────────────────────────────────
// Follows the MedJobs pattern exactly: single <div>, <br><br> for paragraphs,
// simple <a> tags for links (no table-based buttons). This structure renders
// reliably in SmartLead without spacing issues.

const SMARTLEAD_BRAND_COLOR = "#198087";
const SMARTLEAD_LINK_COLOR = "#059669";

/**
 * SmartLead body renderer matching MedJobs pattern.
 *
 * Key differences from Resend bodyToPolishedHtml:
 * - Single <div> container (not multiple <p> tags)
 * - Paragraphs separated by <br><br> (not margin-based)
 * - CTAs are styled <a> links (not table-based buttons)
 * - This structure is proven to work with SmartLead
 */
function smartleadBodyToHtml(text: string): string {
  // 1) HTML-escape
  let s = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2) [label](url) → <a href>
  // CTAs (containing → or "claim" or "review") get bold green styling
  // Regular links get standard green styling
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label: string, href: string) => {
      const isCta = label.includes("→") ||
                    label.toLowerCase().includes("claim") ||
                    label.toLowerCase().includes("review");
      if (isCta) {
        return `<a href="${href}" style="color:${SMARTLEAD_BRAND_COLOR};font-weight:600;text-decoration:none;">${label}</a>`;
      }
      return `<a href="${href}" style="color:${SMARTLEAD_LINK_COLOR};font-weight:500;text-decoration:underline;">${label}</a>`;
    }
  );

  // 3) **text** → <strong>
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => `<strong>${inner}</strong>`);

  // 4) Single-div body: paragraphs joined by <br><br>
  // This prevents Gmail's auto-trim and keeps consistent spacing
  // Line-height 1.5 for better readability (matches email-utils.ts)
  const paragraphs = s.split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br>"));
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${paragraphs.join("<br><br>")}</div>`;
}

/**
 * Build the SmartLead footer HTML with Logan signature + compliance links.
 * Uses SmartLead merge tags for dynamic URLs.
 * NOTE: Text-only signature (no image) for better SmartLead compatibility.
 * NOTE: Join with empty string to avoid extra whitespace in email clients.
 */
function buildSmartleadFooterHtml(): string {
  // NOTE: Compact spacing to match email-utils.ts (8px/12px pattern).
  // SmartLead path uses text-only signature (no image) for cleaner rendering.
  // Footer links use &nbsp; to stay on one line in all email clients.
  return [
    // Sign-off - 8px gap from body content (compact)
    `<p style="margin:8px 0 4px;font-size:14px;line-height:1.5;color:#374151;font-family:Inter,Arial,sans-serif;">Best,</p>`,
    `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#374151;font-family:Inter,Arial,sans-serif;">Logan</p>`,
    // Text-only signature (no image for SmartLead compatibility)
    `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;font-family:Inter,Arial,sans-serif;">Olera is built by <a href="https://www.linkedin.com/in/logan-dubose/" style="color:#198087;text-decoration:underline;">Dr. Logan DuBose</a>, a physician-researcher funded by NIH SBIR, and <a href="https://www.linkedin.com/in/tfalohun/" style="color:#198087;text-decoration:underline;">TJ Falohun</a>, a PhD researcher in biomedical engineering. We're working to make senior care easier to understand and compare.</p>`,
    // Footer links with merge tags - compact margin, inline links with &nbsp;
    `<div style="margin:8px 0 0;padding:8px 0 0;border-top:1px solid #e5e7eb;">`,
    `<p style="font-size:12px;color:#6b7280;margin:0 0 8px;font-family:Inter,Arial,sans-serif;">Questions? Just reply — it goes straight to our team.</p>`,
    `<p style="font-size:12px;color:#9ca3af;margin:0;font-family:Inter,Arial,sans-serif;white-space:nowrap;">`,
    `<a href="${MERGE_TAGS.manageUrl}" style="color:#9ca3af;text-decoration:underline;">Manage your listing</a>&nbsp;·&nbsp;`,
    `<a href="${MERGE_TAGS.removeUrl}" style="color:#9ca3af;text-decoration:underline;">Remove my listing</a>&nbsp;·&nbsp;`,
    `<a href="${MERGE_TAGS.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>`,
    `</p>`,
    // Mailing address (CAN-SPAM)
    `<p style="font-size:11px;color:#d1d5db;margin:8px 0 0;font-family:Inter,Arial,sans-serif;">Olera · ${MAILING_ADDRESS}</p>`,
    `</div>`,
  ].join("");
}

/**
 * Render a template body to SmartLead HTML with merge tags.
 *
 * Follows the MedJobs pattern: bodyHtml + footerHtml, NO outer wrapper.
 * SmartLead strips complex HTML structures, so we keep it simple:
 * - Single <div> for body (smartleadBodyToHtml)
 * - Text-only signature (no image for cleaner SmartLead rendering)
 * - Simple footer links
 *
 * This pattern is proven to render correctly in SmartLead → Gmail.
 */
function toSmartleadHtml(body: string, _templateKey: ProviderOutreachTemplateKey): string {
  const convertedBody = convertToSmartleadTokens(body);
  const bodyHtml = smartleadBodyToHtml(convertedBody);
  const footerHtml = buildSmartleadFooterHtml();
  // MedJobs pattern: just body + footer, no wrapper
  return bodyHtml + footerHtml;
}

/**
 * Build the SmartLead email sequence from provider cadence.
 *
 * Sequence delays (relative to previous step):
 *   - Day 0 → delay 0
 *   - Day 3 → delay 3 (from Day 0)
 *   - Day 5 → delay 2 (from Day 3)
 *   - Day 7 → delay 2 (from Day 5)
 *
 * One sequence covers all leads: merge tags handle per-provider personalization.
 *
 * @param variantOverride - Optional variant to use for Day 0 (subject/body).
 *   NOTE: SmartLead uses a shared sequence for all leads in a campaign, so
 *   variant testing with SmartLead would require separate campaigns per variant.
 *   Currently, variant testing is only fully supported with the Resend path.
 *   This parameter is provided for future extensibility.
 */
export function buildProviderEmailSequence(
  variantOverride?: { subject: string; body: string }
): SmartleadSequenceStep[] {
  const steps: SmartleadSequenceStep[] = [];
  let prevDay = 0;

  for (let i = 0; i < PROVIDER_OUTREACH_CADENCE.length; i++) {
    const cadenceStep = PROVIDER_OUTREACH_CADENCE[i];

    // Get template with placeholder context (merge tags will replace at send time)
    const placeholderContext: TemplateContext = {
      provider_name: MERGE_TAGS.providerName,
      city: MERGE_TAGS.city,
      state: MERGE_TAGS.state,
      category: MERGE_TAGS.category,
      profile_url: MERGE_TAGS.profileUrl,
      claim_url: MERGE_TAGS.claimUrl,
      manage_url: MERGE_TAGS.manageUrl,
      remove_url: MERGE_TAGS.removeUrl,
      unsubscribe_url: MERGE_TAGS.unsubscribeUrl,
      mailing_address: MAILING_ADDRESS,
      gap_list: MERGE_TAGS.gapList,
      // Use value below threshold (10) to trigger generic fallback text.
      // SmartLead can't conditionally change email body per-lead, so we use
      // "Families are searching..." instead of showing specific view counts
      // that might be weak for low-traffic cities.
      city_views: 5
    };

    // Use variant override for Day 0 if provided
    let draft;
    if (cadenceStep.templateKey === "intro" && variantOverride) {
      draft = {
        subject: variantOverride.subject,
        body: variantOverride.body,
      };
    } else {
      draft = getTemplate(cadenceStep.templateKey, placeholderContext);
    }

    // Calculate relative delay
    const delay = i === 0 ? 0 : cadenceStep.day - prevDay;

    steps.push({
      seq_number: i + 1,
      seq_delay_details: { delay_in_days: delay },
      subject: convertToSmartleadTokens(draft.subject),
      email_body: toSmartleadHtml(draft.body, cadenceStep.templateKey),
    });

    prevDay = cadenceStep.day;
  }

  return steps;
}

/**
 * Render any template as SmartLead HTML (for preview purposes).
 *
 * This is used for templates not in the cadence (like "nudge") that still
 * need SmartLead-style preview in the admin panel.
 *
 * @param templateKey - Template to render
 * @param context - Context with substituted values (not merge tags)
 * @returns SmartLead-formatted HTML
 */
export function renderTemplateAsSmartleadHtml(
  templateKey: ProviderOutreachTemplateKey,
  context: TemplateContext
): { html: string; subject: string } {
  const draft = getTemplate(templateKey, context);

  // Substitute actual values into template variables
  let body = draft.body;
  let subject = draft.subject;

  // Use decision-maker's first name for greeting if available, else org name
  const greetingName = context.decision_maker?.first_name?.trim() || context.provider_name;

  const substitutions: Record<string, string> = {
    "{greeting_name}": greetingName,
    "{provider_name}": context.provider_name,
    "{city}": context.city,
    "{state}": context.state,
    "{category}": context.category || "care providers",
    "{profile_url}": context.profile_url,
    "{claim_url}": context.claim_url,
    "{manage_url}": context.manage_url,
    "{remove_url}": context.remove_url,
    "{unsubscribe_url}": context.unsubscribe_url,
    "{mailing_address}": context.mailing_address,
    "{gap_list}": context.gap_list || "",
    "{city_views}": String(context.city_views || 0),
  };

  for (const [token, value] of Object.entries(substitutions)) {
    const regex = new RegExp(token.replace(/[{}]/g, "\\$&"), "g");
    body = body.replace(regex, value);
    subject = subject.replace(regex, value);
  }

  // Render to SmartLead HTML format
  const bodyHtml = smartleadBodyToHtml(body);
  const footerHtml = buildSmartleadFooterHtml();

  // Substitute SmartLead merge tags in footer for preview
  // Footer uses {{manage_url}} format which needs to be replaced with actual values
  let html = bodyHtml + footerHtml;
  const mergeTagSubstitutions: Record<string, string> = {
    "{{greeting_name}}": greetingName,
    "{{company_name}}": context.provider_name,
    "{{city}}": context.city,
    "{{state}}": context.state,
    "{{category}}": context.category || "care providers",
    "{{profile_url}}": context.profile_url,
    "{{claim_url}}": context.claim_url,
    "{{manage_url}}": context.manage_url,
    "{{remove_url}}": context.remove_url,
    "{{unsubscribe_url}}": context.unsubscribe_url,
    "{{gap_list}}": context.gap_list || "",
    "{{city_views}}": String(context.city_views || 0),
  };

  for (const [tag, value] of Object.entries(mergeTagSubstitutions)) {
    html = html.replace(new RegExp(tag.replace(/[{}]/g, "\\$&"), "g"), value);
  }

  return { html, subject };
}

// ── Orchestration ─────────────────────────────────────────────────────────

/**
 * Sender emails for provider outreach (from env).
 * Primary: partnerships@findmedjobs.co
 * Backup: logan@findmedjobs.co
 */
function getProviderSenderEmails(): string[] {
  const envSenders = process.env.PROVIDER_OUTREACH_SMARTLEAD_SENDERS ?? "";
  if (envSenders.trim()) {
    return envSenders.split(",").map((s) => s.trim()).filter(Boolean);
  }
  // Fallback to general SmartLead senders
  const generalSenders = process.env.SMARTLEAD_SENDER_EMAILS ?? "";
  return generalSenders.split(",").map((s) => s.trim()).filter(Boolean);
}

export interface MailboxPool {
  ids: number[];
  warnings: string[];
}

/**
 * Resolve warmed mailbox pool for provider outreach campaigns.
 */
export async function resolveProviderMailboxPool(): Promise<{
  ok: boolean;
  pool: MailboxPool;
  error?: string;
}> {
  const res = await listEmailAccounts();
  if (!res.ok || !res.data) {
    return { ok: false, pool: { ids: [], warnings: [] }, error: res.error ?? "listEmailAccounts failed" };
  }

  const allow = getProviderSenderEmails().map((e) => e.toLowerCase());
  const accounts = res.data;
  const selected = allow.length
    ? accounts.filter((a) => allow.includes((a.from_email ?? "").toLowerCase()))
    : accounts;

  const warnings: string[] = [];
  if (!allow.length) {
    warnings.push(`No PROVIDER_OUTREACH_SMARTLEAD_SENDERS set; using all ${accounts.length} connected mailbox(es).`);
  }
  for (const a of selected) {
    const status = a.warmup_details?.status;
    if (status !== "ACTIVE") {
      warnings.push(`Mailbox ${a.from_email} warmup status is ${status ?? "unknown"} (not ACTIVE).`);
    }
  }

  if (!selected.length) {
    return { ok: false, pool: { ids: [], warnings }, error: "No mailboxes matched the sender allowlist." };
  }
  return { ok: true, pool: { ids: selected.map((a) => a.id), warnings } };
}

export interface LaunchProviderCampaignInput {
  /** Campaign name, e.g. "Provider Outreach — TX — 2026-07" */
  campaignName: string;
  /** Eligible provider rows to enroll */
  providers: ProviderBridgeRow[];
  /** Optional schedule config */
  schedule?: Record<string, unknown>;
}

export interface LaunchProviderCampaignReport {
  ok: boolean;
  campaign_id?: number;
  enrolled: number;
  enrolled_tracking_ids: string[];
  skipped: { tracking_id: string; provider_id: string; reason: ProviderSkipReason | "over_cap" }[];
  mailbox_warnings: string[];
  errors: { stage: string; message: string }[];
}

function defaultSchedule(): Record<string, unknown> {
  return {
    timezone: "America/Chicago",
    days_of_the_week: [1, 2, 3, 4, 5], // Weekdays only
    start_hour: "09:00",
    end_hour: "17:00",
    min_time_btw_emails: 10,
    max_new_leads_per_day: 20,
  };
}

/** SmartLead Base plan contact cap */
const SMARTLEAD_CONTACT_CAP = 2000;

/** SmartLead batch size limit */
const LEAD_BATCH_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resume paused leads in a campaign.
 *
 * When a provider is "Reset to Ready", their SmartLead lead is paused via
 * pauseLeadInCampaign(). If they're later re-launched, addLeads() returns
 * already_added_to_campaign > 0 but the lead remains paused.
 *
 * This function looks up each lead by email and resumes them.
 * Resuming an active lead is a no-op, so this is safe to call for all leads.
 *
 * @param campaignId - SmartLead campaign ID
 * @param leads - Array of leads that may need resuming
 * @returns Number of leads successfully resumed
 */
async function resumePausedLeads(
  campaignId: number,
  leads: SmartleadLead[]
): Promise<{ resumed: number; failed: number; errors: string[] }> {
  let resumed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    try {
      // Look up lead by email to get SmartLead lead_id
      const lookup = await getLeadByEmail(lead.email);
      if (!lookup.ok || !lookup.data?.id) {
        // Lead not found - this is fine, they may not have been added before
        continue;
      }

      const leadId = lookup.data.id;

      // Resume the lead (no-op if already active)
      const resumeResult = await resumeLeadInCampaign(campaignId, leadId);
      if (resumeResult.ok) {
        resumed++;
        console.log(`[provider-smartlead-bridge] Resumed lead ${leadId} (${lead.email}) in campaign ${campaignId}`);
      } else {
        failed++;
        errors.push(`Failed to resume ${lead.email}: ${resumeResult.error}`);
      }
    } catch (err) {
      failed++;
      errors.push(`Error resuming ${lead.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { resumed, failed, errors };
}

/**
 * Whether to auto-start campaigns (default: PAUSED for warmup sign-off).
 */
function autoStartEnabled(): boolean {
  const v = (process.env.SMARTLEAD_AUTO_START_CAMPAIGNS ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Launch a new SmartLead campaign for provider outreach.
 *
 * Steps:
 *   1. Resolve warmed mailbox pool
 *   2. Filter eligible providers
 *   3. Create campaign
 *   4. Attach mailboxes + save sequence
 *   5. Register webhook
 *   6. Push leads in batches
 *   7. Set schedule + status
 *
 * Returns report with campaign_id and enrolled tracking_ids for CRM update.
 */
export async function launchProviderCampaign(
  input: LaunchProviderCampaignInput
): Promise<LaunchProviderCampaignReport> {
  const report: LaunchProviderCampaignReport = {
    ok: false,
    enrolled: 0,
    enrolled_tracking_ids: [],
    skipped: [],
    mailbox_warnings: [],
    errors: [],
  };

  // 1. Resolve mailbox pool
  const mb = await resolveProviderMailboxPool();
  report.mailbox_warnings = mb.pool.warnings;
  if (!mb.ok) {
    report.errors.push({ stage: "resolveMailboxPool", message: mb.error ?? "no mailboxes" });
    return report;
  }

  // 2. Filter eligible providers
  const { eligible, skipped } = selectEligibleProviders(input.providers);
  report.skipped = skipped.map((s) => ({ ...s, reason: s.reason }));

  if (!eligible.length) {
    report.errors.push({ stage: "select", message: "No eligible providers to enroll." });
    return report;
  }

  // 3. Create campaign
  const created = await createCampaign(input.campaignName);
  if (!created.ok || !created.data) {
    report.errors.push({ stage: "createCampaign", message: created.error ?? "no campaign id" });
    return report;
  }
  const campaignId = created.data.id;
  report.campaign_id = campaignId;

  // 4. Attach mailboxes + save sequence
  const attached = await attachEmailAccounts(campaignId, mb.pool.ids);
  if (!attached.ok) {
    report.errors.push({ stage: "attachEmailAccounts", message: attached.error ?? "attach failed" });
  }

  const steps = buildProviderEmailSequence();
  const saved = await saveSequence(campaignId, steps);
  if (!saved.ok) {
    report.errors.push({ stage: "saveSequence", message: saved.error ?? "save failed" });
  }

  // 5. Register webhook
  const webhookSecret = (process.env.SMARTLEAD_WEBHOOK_SECRET ?? "").trim();
  const webhookUrl = buildSmartleadWebhookUrl(webhookSecret);
  if (webhookUrl) {
    // Use the provider-specific webhook endpoint
    const providerWebhookUrl = webhookUrl.replace("smartlead-webhook", "provider-smartlead-webhook");
    try {
      await ensureCampaignWebhook(campaignId, providerWebhookUrl);
    } catch (e) {
      console.warn(`[provider-smartlead-bridge] webhook registration failed:`, e);
    }
  }

  // 6. Push leads in batches
  const { leads, duplicates } = providersToLeads(eligible);
  for (const dup of duplicates) {
    report.skipped.push({ ...dup, reason: "already_enrolled" as ProviderSkipReason });
  }

  const chunks = chunk(leads, LEAD_BATCH_SIZE);
  const successfulTrackingIds = new Set<string>();

  for (const group of chunks) {
    const res = await addLeads(campaignId, group);
    if (res.ok) {
      report.enrolled += res.data?.upload_count ?? group.length;
      // Extract tracking_ids from the leads we just pushed
      for (const lead of group) {
        const trackingId = lead.custom_fields?.tracking_id;
        if (trackingId) successfulTrackingIds.add(trackingId);
      }

      // Resume any paused leads (from previous "Reset to Ready" actions)
      // addLeads returns already_added_to_campaign when leads exist but may be paused
      const alreadyAdded = res.data?.already_added_to_campaign ?? 0;
      if (alreadyAdded > 0) {
        console.log(`[provider-smartlead-bridge] ${alreadyAdded} lead(s) already in campaign, attempting resume...`);
        const resumeResult = await resumePausedLeads(campaignId, group);
        if (resumeResult.resumed > 0) {
          console.log(`[provider-smartlead-bridge] Resumed ${resumeResult.resumed} paused lead(s)`);
        }
        if (resumeResult.errors.length > 0) {
          for (const err of resumeResult.errors) {
            console.warn(`[provider-smartlead-bridge] Resume warning: ${err}`);
          }
        }
      }
    } else {
      report.errors.push({ stage: `addLeads[${group.length}]`, message: res.error ?? "addLeads failed" });
    }
  }
  report.enrolled_tracking_ids = [...successfulTrackingIds];

  // 7. Set schedule + status
  const schedRes = await setCampaignSchedule(campaignId, input.schedule ?? defaultSchedule());
  if (!schedRes.ok) {
    report.errors.push({ stage: "setCampaignSchedule", message: schedRes.error ?? "schedule failed" });
  }

  const desiredStatus = autoStartEnabled() ? "START" : "PAUSED";
  const statusRes = await setCampaignStatus(campaignId, desiredStatus);
  if (!statusRes.ok) {
    report.errors.push({ stage: "setCampaignStatus", message: statusRes.error ?? "status failed" });
  }

  report.ok = report.errors.length === 0;
  return report;
}

export interface EnrollProviderInput {
  /** Single provider to enroll */
  provider: ProviderBridgeRow;
  /** Campaign name for new campaign (if needed) */
  campaignName: string;
  /** Existing campaign IDs for this state (to reuse) */
  existingCampaignIds?: number[];
  schedule?: Record<string, unknown>;
}

export interface EnrollProviderResult {
  ok: boolean;
  campaign_id?: number;
  /** True when this call created a new campaign */
  created: boolean;
  enrolled: boolean;
  skipped_reason?: ProviderSkipReason;
  mailbox_warnings: string[];
  errors: { stage: string; message: string }[];
}

/**
 * Enroll a single provider into an existing campaign (or create new if needed).
 *
 * Used for incremental enrollment when adding providers to an existing state campaign.
 */
export async function enrollProviderIntoCampaign(
  input: EnrollProviderInput
): Promise<EnrollProviderResult> {
  const result: EnrollProviderResult = {
    ok: false,
    created: false,
    enrolled: false,
    mailbox_warnings: [],
    errors: [],
  };

  // Single-provider eligibility check
  const { eligible, skipped } = selectEligibleProviders([input.provider]);
  if (!eligible.length) {
    result.skipped_reason = skipped[0]?.reason;
    return result;
  }

  const lead = providerToLead(input.provider);

  // Try existing campaigns first
  const existingIds = input.existingCampaignIds ?? [];
  for (const campaignId of existingIds) {
    const added = await addLeads(campaignId, [lead]);
    if (added.ok) {
      result.campaign_id = campaignId;
      result.enrolled = true;
      result.ok = true;

      // Resume if lead was previously paused (from "Reset to Ready")
      const alreadyAdded = added.data?.already_added_to_campaign ?? 0;
      if (alreadyAdded > 0) {
        console.log(`[provider-smartlead-bridge] Lead already in campaign ${campaignId}, attempting resume...`);
        const resumeResult = await resumePausedLeads(campaignId, [lead]);
        if (resumeResult.resumed > 0) {
          console.log(`[provider-smartlead-bridge] Resumed paused lead for ${lead.email}`);
        }
      }

      return result;
    }
    // 404 means campaign was deleted, try next
    if (added.status !== 404) {
      result.errors.push({ stage: "addLeads", message: added.error ?? "addLeads failed" });
      return result;
    }
  }

  // No existing campaign, create new one
  const mb = await resolveProviderMailboxPool();
  result.mailbox_warnings = mb.pool.warnings;
  if (!mb.ok) {
    result.errors.push({ stage: "resolveMailboxPool", message: mb.error ?? "no mailboxes" });
    return result;
  }

  const created = await createCampaign(input.campaignName);
  if (!created.ok || !created.data) {
    result.errors.push({ stage: "createCampaign", message: created.error ?? "no campaign id" });
    return result;
  }
  const campaignId = created.data.id;
  result.campaign_id = campaignId;
  result.created = true;

  // Attach mailboxes + sequence
  const attached = await attachEmailAccounts(campaignId, mb.pool.ids);
  if (!attached.ok) {
    result.errors.push({ stage: "attachEmailAccounts", message: attached.error ?? "attach failed" });
  }

  const steps = buildProviderEmailSequence();
  const saved = await saveSequence(campaignId, steps);
  if (!saved.ok) {
    result.errors.push({ stage: "saveSequence", message: saved.error ?? "save failed" });
  }

  // Register webhook
  const webhookSecret = (process.env.SMARTLEAD_WEBHOOK_SECRET ?? "").trim();
  const webhookUrl = buildSmartleadWebhookUrl(webhookSecret);
  if (webhookUrl) {
    const providerWebhookUrl = webhookUrl.replace("smartlead-webhook", "provider-smartlead-webhook");
    try {
      await ensureCampaignWebhook(campaignId, providerWebhookUrl);
    } catch (e) {
      console.warn(`[provider-smartlead-bridge] webhook registration failed:`, e);
    }
  }

  // Add lead
  const added = await addLeads(campaignId, [lead]);
  if (!added.ok) {
    result.errors.push({ stage: "addLeads", message: added.error ?? "addLeads failed" });
    return result;
  }
  result.enrolled = true;

  // Resume if lead was previously paused (edge case: new campaign but lead exists globally)
  const alreadyAdded = added.data?.already_added_to_campaign ?? 0;
  if (alreadyAdded > 0) {
    console.log(`[provider-smartlead-bridge] Lead already added to new campaign ${campaignId}, attempting resume...`);
    const resumeResult = await resumePausedLeads(campaignId, [lead]);
    if (resumeResult.resumed > 0) {
      console.log(`[provider-smartlead-bridge] Resumed paused lead for ${lead.email}`);
    }
  }

  // Finalize
  const schedRes = await setCampaignSchedule(campaignId, input.schedule ?? defaultSchedule());
  if (!schedRes.ok) {
    result.errors.push({ stage: "setCampaignSchedule", message: schedRes.error ?? "schedule failed" });
  }

  const desiredStatus = autoStartEnabled() ? "START" : "PAUSED";
  const statusRes = await setCampaignStatus(campaignId, desiredStatus);
  if (!statusRes.ok) {
    result.errors.push({ stage: "setCampaignStatus", message: statusRes.error ?? "status failed" });
  }

  result.ok = result.errors.length === 0;
  return result;
}

// ── Preview ───────────────────────────────────────────────────────────────

export interface SmartleadPreviewStep {
  seq_number: number;
  delay_in_days: number;
  cadence_day: number;
  subject_template: string;
  subject_preview: string;
  body_html_template: string;
  body_html_preview: string;
}

export interface ProviderSmartleadPreview {
  campaign_name: string;
  provider: {
    provider_id: string;
    provider_name: string;
    email: string;
  };
  steps: SmartleadPreviewStep[];
  sender_pool: string[];
}

/**
 * Sample substitution for admin preview (replaces merge tags with sample values).
 */
function substitutePreviewSample(
  text: string,
  sample: { provider_name: string; city: string; state: string; category: string; gap_list: string; city_views: string; greeting_name: string }
): string {
  return text
    .replace(/\{\{greeting_name\}\}/g, sample.greeting_name)
    .replace(/\{\{company_name\}\}/g, sample.provider_name)
    .replace(/\{\{city\}\}/g, sample.city)
    .replace(/\{\{state\}\}/g, sample.state)
    .replace(/\{\{category\}\}/g, sample.category)
    .replace(/\{\{gap_list\}\}/g, sample.gap_list)
    .replace(/\{\{city_views\}\}/g, sample.city_views)
    .replace(/\{\{claim_url\}\}/g, "https://olera.care/claim/sample")
    .replace(/\{\{profile_url\}\}/g, "https://olera.care/provider/sample")
    .replace(/\{\{manage_url\}\}/g, "https://olera.care/manage/sample")
    .replace(/\{\{remove_url\}\}/g, "https://olera.care/remove/sample")
    .replace(/\{\{unsubscribe_url\}\}/g, "https://olera.care/unsubscribe/sample");
}

/**
 * Build a preview of what the SmartLead sequence will look like for a provider.
 */
export function buildProviderSmartleadPreview(input: {
  provider: ProviderBridgeRow;
  campaignName: string;
}): ProviderSmartleadPreview {
  // Use decision-maker's first name for greeting if available, else org name
  const greetingName = input.provider.decision_maker_first_name?.trim() || input.provider.provider_name;

  const sample = {
    provider_name: input.provider.provider_name,
    city: input.provider.city ?? "Austin",
    state: input.provider.state ?? "TX",
    category: input.provider.category ?? "care providers",
    gap_list: input.provider.gap_list ?? "no pricing, no photos, and no description",
    city_views: String(input.provider.city_views ?? 42),
    greeting_name: greetingName,
  };

  const sequence = buildProviderEmailSequence();
  let runningDay = 0;

  const steps: SmartleadPreviewStep[] = sequence.map((step, i) => {
    const cadenceDay = PROVIDER_OUTREACH_CADENCE[i]?.day ?? runningDay;
    runningDay = cadenceDay;

    return {
      seq_number: step.seq_number,
      delay_in_days: step.seq_delay_details.delay_in_days,
      cadence_day: cadenceDay,
      subject_template: step.subject,
      subject_preview: substitutePreviewSample(step.subject, sample),
      body_html_template: step.email_body,
      body_html_preview: substitutePreviewSample(step.email_body, sample),
    };
  });

  return {
    campaign_name: input.campaignName,
    provider: {
      provider_id: input.provider.provider_id,
      provider_name: input.provider.provider_name,
      email: input.provider.email ?? "",
    },
    steps,
    sender_pool: getProviderSenderEmails(),
  };
}

// ── Campaign Naming ───────────────────────────────────────────────────────

/**
 * Generate campaign name for a state/month.
 * Format: "Provider Outreach — {State} — {YYYY-MM}"
 */
export function generateCampaignName(state: string, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `Provider Outreach — ${state} — ${year}-${month}`;
}

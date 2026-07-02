/**
 * Olera email templates — plain HTML strings with inline styles.
 * Each template returns an HTML string ready for `sendEmail({ html })`.
 *
 * Design: clean, minimal, system font stack. Matches Olera brand colors.
 */

const BRAND_COLOR = "#198087";
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

/**
 * Footer unsubscribe link for care-seeker (family) lifecycle + nudge emails.
 *
 * Links to the public, no-login unsubscribe page keyed by the family profile id
 * (business_profiles.id). Care-seekers arrive as guests with no session, so the
 * old `/portal/settings` link was a dead end for them — it sat behind auth and
 * never set the `nudges_unsubscribed` flag the nudge crons actually check.
 *
 * Falls back to the account settings page when the id is unknown, preserving the
 * prior behavior for any call site that hasn't been wired to pass an id.
 */
export function careUnsubscribeUrl(unsubscribeId?: string): string {
  return unsubscribeId
    ? `${BASE_URL}/unsubscribe/care?id=${encodeURIComponent(unsubscribeId)}`
    : `${BASE_URL}/account/settings`;
}

/**
 * Shared care-seeker unsubscribe footer for lifecycle / nudge emails. Every
 * family nudge needs a visible opt-out (CAN-SPAM) — the coordinator compare-
 * cascade rungs (outcome-check, provider-silent, never-engaged, day-10,
 * pending-reach-out, stale) were missing it while the completion/publish
 * sequences had one. Readable gray (#9ca3af), not the near-invisible #d1d5db.
 */
function careUnsubscribeFooter(unsubscribeId?: string): string {
  return `<div style="height:1px;background:#eef1f0;margin:28px 0 0;"></div>
    <p style="font-size:12px;color:#9ca3af;margin:14px 0 0;line-height:1.5;">You're getting this because you reached out for care on Olera. <a href="${careUnsubscribeUrl(unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> from care-search updates.</p>`;
}

// ── Layout helpers ──────────────────────────────────────────────

/**
 * Hidden inbox-preview text that appears after the subject line in
 * Gmail/Outlook/Apple Mail. Without this, clients show a random
 * fragment of the body (often header text or whitespace).
 *
 * Pattern: visually hidden span + zero-width-joiner spacer to push
 * body content out of the preview window. Standard across MailChimp,
 * SendGrid, Postmark templates.
 */
function preheaderHtml(text: string): string {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n+/g, " ")
    .trim();
  // 80 zero-width joiners after the preheader — pushes body chars out
  // of the preview window so inboxes don't append e.g. "Olera ..." to it.
  const spacer = "&zwnj;&nbsp;".repeat(80);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f9fafb;opacity:0;">${escaped}${spacer}</div>`;
}

function layout(body: string, preheader?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:${FONT_STACK};">
  ${preheaderHtml(preheader ?? "")}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:24px 32px 16px;">
          <span style="font-size:18px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.3px;">Olera</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 32px 32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">
            &copy; ${new Date().getFullYear()} Olera &middot;
            <a href="${BASE_URL}" style="color:#9ca3af;">olera.care</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>`;
}

// "Explore more" browse CTA — a calm teal text link with a trailing arrow, in the
// same restrained register as the per-card "Introduce me" links (no heavy pill
// competing with the content). Center it in a block for a clean "see more" footer.
// (Distinct from the muted-gray secondaryLink and underlined ctaLink defined below.)
function browseLink(label: string, href: string): string {
  return `<a href="${href}" style="color:${BRAND_COLOR};font-size:14px;font-weight:600;text-decoration:none;">${label}&nbsp;&rarr;</a>`;
}

/**
 * Profile-completion ("sell the output") email — the weekly-digest variant for
 * CLAIMED providers who haven't added their owner story yet. Instead of a
 * "your profile is N% complete" nag, it shows the magical thing they're missing:
 * a ghosted "Facility manager" card (silhouette + faded story + dimmed
 * "Message you" button) captioned "Right now, this is blank" — then deep-links
 * straight into the owner editor. Aspirational + gentle loss-aversion, no
 * progress bar. Deliberately no fabricated "+X% messages" stat — we haven't
 * measured the lift yet (the canonical-id resolver now lets us, later).
 */
export function providerProfileCompletionEmail(opts: {
  providerName: string;
  providerSlug: string;
  ctaUrl: string;
}): string {
  const name = escapeHtml(opts.providerName);
  const unsubUrl = `${BASE_URL}/unsubscribe/${opts.providerSlug}?type=analytics_digest`;
  const ghostBg = "#f3f4f6";
  const ghostText = "#d1d5db";

  // Ghosted facility-manager card — the aspirational blank they don't have yet.
  const ghostCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;margin:0 0 8px;">
      <tr><td style="padding:24px;text-align:center;">
        <div style="width:72px;height:72px;border-radius:50%;background:${ghostBg};margin:0 auto 14px;"></div>
        <div style="height:12px;width:120px;background:${ghostBg};border-radius:4px;margin:0 auto 8px;"></div>
        <div style="height:10px;width:88px;background:${ghostBg};border-radius:4px;margin:0 auto 16px;"></div>
        <p style="font-size:13px;font-style:italic;color:${ghostText};margin:0 0 16px;line-height:1.5;">&ldquo;Your story &mdash; why you do this work&hellip;&rdquo;</p>
        <span style="display:inline-block;padding:9px 20px;background:${ghostBg};color:${ghostText};font-size:13px;font-weight:600;border-radius:8px;">Message you</span>
      </td></tr>
    </table>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0 0 24px;">Right now, this is blank.</p>`;

  return layout(
    `
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Your Olera page</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">This is what families see on ${name}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">Families choose people, not listings. The owner&rsquo;s story is the first thing they look for when deciding who to trust with their parent &mdash; and yours is empty.</p>
    ${ghostCard}
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">Add your photo and a few sentences about why you do this work. It takes two minutes, and it&rsquo;s the difference between a listing and a person a family wants to call.</p>
    <div>${button("Add your story →", opts.ctaUrl)}</div>
    ${authorBylineBlock({ topBorder: true })}
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;"><a href="${unsubUrl}" style="color:#9ca3af;">Stop these weekly digests</a></p>
    </div>`,
    `Families choose people, not listings - add your story to ${opts.providerName}.`,
  );
}

/**
 * Managed Ads digest email — the weekly nudge for the no-leads cohort (~99%).
 *
 * Diagnosis-led, not offer-led: it opens with a TRUE local-demand fact about the
 * reader's own market (`localDemand` = unique provider-page viewers in their
 * city+category this week, the same number the weekly digest already uses) and
 * lets that visible gap motivate the paid ads, rather than pitching the product
 * cold. Three deliberate moves separate it from the lead-gen vendors providers
 * distrust: (1) reader-first hook, not "we run ads"; (2) an explicit anti-broker
 * line — they fund their own campaign, the families are theirs, no per-lead
 * charge, no resale (honest that it's PAID; we do NOT claim it's free or that
 * there's "nothing to set up"); (3) Dr. Logan's trust signature, same as the
 * cold-rank email. One-click magic link (action="ads") auth-lands them on
 * /provider/boost; the CTA stays honest about that page's 70% completeness gate
 * ("See how it works") instead of promising zero setup.
 */
export function providerManagedAdsEmail(opts: {
  providerName: string;
  providerSlug: string;
  ctaUrl: string;
  city?: string | null;
  category?: string | null;
  /** Unique provider-page viewers in the city+category cohort this week. Real
   *  number from provider_page_view_stats; below the floor (<5) → qualitative
   *  fallback, so a thin "1 family" number never undersells the pitch. */
  localDemand?: number | null;
}): string {
  const unsubUrl = `${BASE_URL}/unsubscribe/${opts.providerSlug}?type=analytics_digest`;
  const where = opts.city ? ` near ${escapeHtml(opts.city)}` : " in your area";
  const cat = humanCategoryLabel(opts.category ?? null);
  const demand = opts.localDemand && opts.localDemand >= 5 ? opts.localDemand : null;

  // Lead with the real number when we have it; degrade gracefully when we don't.
  const headline = demand
    ? `${demand.toLocaleString()} ${demand === 1 ? "family" : "families"} searched for ${cat}${where} this week.`
    : `Families${where} are searching for care right now.`;
  // The "where most demand goes" line — non-accusatory (no "your page isn't one
  // of them"); just describes how families actually search and stall.
  const elsewhere = demand
    ? `That&rsquo;s only the demand we saw on Olera. Many more search Google, ask in Facebook groups, check Nextdoor, call an agency or two, and stop.`
    : `They search Google, ask in Facebook groups, check Nextdoor, call an agency or two, and stop &mdash; most never reach a directory at all.`;

  return layout(
    `
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Your local market</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 16px;line-height:1.3;">${headline}</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">${elsewhere}</p>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">We&rsquo;re testing a simple way to help local agencies show up earlier. You fund a small local campaign, Olera runs it, sends interested families straight to your Olera page, and shows you exactly what happened.</p>
    <div style="margin:0 0 22px;">
      <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 6px;line-height:1.5;">No per-lead fee.</p>
      <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 6px;line-height:1.5;">No resold inquiries.</p>
      <p style="font-size:15px;font-weight:600;color:#111827;margin:0;line-height:1.5;">No bidding against other agencies for the same family.</p>
    </div>
    <p style="font-size:15px;color:#374151;margin:0 0 28px;line-height:1.65;">Just your own campaign, pointed at your own page.</p>
    <div>${button("Get my launch plan →", opts.ctaUrl)}</div>
    ${authorBylineBlock()}
    <div style="margin:30px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;"><a href="${unsubUrl}" style="color:#9ca3af;">Stop these weekly digests</a></p>
    </div>`,
    demand
      ? `${demand.toLocaleString()} families searched for ${cat}${where} this week`
      : `Families${opts.city ? ` near ${escapeHtml(opts.city)}` : ""} are searching for care right now.`,
  );
}

export function adBoostQueuedEmail(opts: {
  providerName: string;
  ctaUrl: string;
  setupWeek: string;
  completeness: number;
  threshold: number;
  missingSectionLabel?: string | null;
  needsVerification?: boolean;
}): string {
  const nextStep = opts.needsVerification
    ? "finish verification"
    : opts.missingSectionLabel
      ? `finish ${escapeHtml(opts.missingSectionLabel.toLowerCase())}`
      : "finish your profile";
  const launchWeek = formatEmailDate(opts.setupWeek);

  return layout(
    `
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Ad Boost request received</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 16px;line-height:1.3;">We saved your Ad Boost launch plan</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">Thanks for requesting managed ads. Your preferred setup week is <strong>${launchWeek}</strong>, and your campaign is queued while your Olera page gets ready for paid traffic.</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 20px;">
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;"><strong>Current readiness:</strong> ${opts.completeness}% complete</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;"><strong>Launch threshold:</strong> ${opts.threshold}% complete and verified</p>
    </div>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">The next best step is to ${nextStep}. Once your page clears the launch threshold, we&rsquo;ll move the request into setup and email you before the campaign goes live.</p>
    <p style="font-size:15px;color:#374151;margin:0 0 26px;line-height:1.65;">We will not send paid traffic to a thin page. That protects your first $50 promotional test and gives families a better reason to contact you.</p>
    <div>${button("Finish launch setup", opts.ctaUrl)}</div>
    ${adBoostAuthorBylineBlock({ topBorder: true })}
    <div style="margin:26px 0 0;padding:14px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">More details: <a href="${BASE_URL}/managed-ads-terms" style="color:#9ca3af;text-decoration:underline;">Managed Ads terms</a></p>
    </div>`,
    "Your Ad Boost request is queued while your page gets ready.",
  );
}

export function adBoostRequestedEmail(opts: {
  providerName: string;
  ctaUrl: string;
  setupWeek: string;
  channel?: string | null;
}): string {
  const launchWeek = formatEmailDate(opts.setupWeek);
  const channel = formatAdBoostChannel(opts.channel);

  return layout(
    `
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Ad Boost setup</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 16px;line-height:1.3;">Your Ad Boost request is ready for setup</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">Your managed-ads request came through, and your Olera page has enough detail for us to start setting up the campaign.</p>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">Here&rsquo;s how it works: we run a local ${channel} campaign for families searching for care, send them straight to your Olera page, and any who reach out land directly in your dashboard.</p>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">To get started, the first $50 of ad spend is on us. That is enough to get the campaign live and let you see the flow end to end. After that, you choose the monthly budget and we run the campaign.</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;"><strong>Requested setup week:</strong> ${launchWeek}</p>
    </div>
    <div>${button("View Ad Boost", opts.ctaUrl)}</div>
    ${adBoostAuthorBylineBlock({ topBorder: true })}
    <div style="margin:26px 0 0;padding:14px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">More details: <a href="${BASE_URL}/managed-ads-terms" style="color:#9ca3af;text-decoration:underline;">Managed Ads terms</a></p>
    </div>`,
    "Your Ad Boost request is ready for setup.",
  );
}

export function adBoostReadyEmail(opts: {
  providerName: string;
  ctaUrl: string;
  setupWeek: string;
  channel?: string | null;
}): string {
  const launchWeek = formatEmailDate(opts.setupWeek);
  const channel = formatAdBoostChannel(opts.channel);

  return layout(
    `
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Ad Boost now launch-ready</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 16px;line-height:1.3;">Your Ad Boost request is now launch-ready</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">Good news: your Olera page now has enough detail for us to start setting up the campaign, so your queued Ad Boost request has moved into the setup queue.</p>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">We&rsquo;ll use your Olera page as the landing page for the ${channel} campaign, with families who reach out appearing in your dashboard.</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;"><strong>Requested setup week:</strong> ${launchWeek}</p>
    </div>
    <p style="font-size:15px;color:#374151;margin:0 0 26px;line-height:1.65;">The first $50 promotional test is still on us. Once it is complete, we can review the results together and talk through the right monthly budget.</p>
    <div>${button("View Ad Boost", opts.ctaUrl)}</div>
    ${adBoostAuthorBylineBlock({ topBorder: true })}
    <div style="margin:26px 0 0;padding:14px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">More details: <a href="${BASE_URL}/managed-ads-terms" style="color:#9ca3af;text-decoration:underline;">Managed Ads terms</a></p>
    </div>`,
    "Your Ad Boost request is now ready for setup.",
  );
}

/**
 * Find Families digest variant — a provider with a real published care-seeker
 * within ~50mi (the scarce, high-intent signal). Distinct from the managed-ads
 * pitch (no-leads cohort): this fires only when there's an actual nearby family,
 * so the copy is concrete and warm, not a sales pitch. The CTA is a one-click
 * "matches" magic link straight to /provider/matches. Goal action: reaching out
 * (provider_activity matches_outreach_sent). No PHI — town + care need only,
 * never the family's name (subject + body), matching the page's framing.
 */
export function providerFindFamiliesDigestEmail(opts: {
  providerName: string;
  providerSlug: string;
  ctaUrl: string;          // one-click magic link → /provider/matches
  nearbyCount: number;
  nearestTown?: string | null;
  careNeed?: string | null;
  timeline?: string | null;
}): string {
  const unsubUrl = `${BASE_URL}/unsubscribe/${opts.providerSlug}?type=analytics_digest`;
  const many = opts.nearbyCount > 1;

  const TIMELINE_PHRASE: Record<string, string> = {
    immediate: "and needs care right away",
    within_1_month: "within the next month",
    within_3_months: "within the next few months",
    exploring: "and is exploring options",
  };
  const prettyCare = opts.careNeed
    ? escapeHtml(opts.careNeed.replace(/[_-]+/g, " ").trim().toLowerCase())
    : null;
  const town = opts.nearestTown ? escapeHtml(opts.nearestTown) : null;
  const timelinePhrase = opts.timeline ? TIMELINE_PHRASE[opts.timeline] ?? "" : "";

  const heading = many
    ? `${opts.nearbyCount} families near you are looking for care`
    : "A family near you is looking for care";

  // One concrete line about the nearest family — town + care need + timing when we
  // have them, gracefully degrading to a plain line when we don't.
  const lead = town
    ? `A family in ${town} is looking for ${prettyCare ?? "care"} ${timelinePhrase}`.trim() + "."
    : `A family within driving distance is looking for ${prettyCare ?? "care"} ${timelinePhrase}`.trim() + ".";
  const detail = many
    ? `${lead} ${opts.nearbyCount - 1} more ${opts.nearbyCount - 1 === 1 ? "family is" : "families are"} searching nearby too.`
    : lead;

  return layout(
    `
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Find Families</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">${heading}.</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">${detail}</p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.65;"><strong>The first provider to reach out is 3&times; more likely to connect.</strong> They&rsquo;re comparing their options now &mdash; a short, warm note from you goes a long way.</p>
    <div>${button(many ? "See the families →" : "See the family →", opts.ctaUrl)}</div>
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;"><a href="${unsubUrl}" style="color:#9ca3af;">Stop these weekly digests</a></p>
    </div>`,
    many
      ? `${opts.nearbyCount} families near ${opts.providerName} are looking for care right now.`
      : `A family near ${opts.providerName} is looking for care right now.`,
  );
}

/**
 * Escape HTML special characters to prevent XSS and layout issues.
 * Use this for any user-generated content inserted into email HTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Extract first name for email personalization.
 * "Maria Johnson" → "Maria"
 * Placeholder names (anonymous, careseeker, etc.) → fallback
 *
 * @param name - Full name to extract first name from
 * @param fallback - What to return for placeholder names (default: "Someone")
 *                   Use "there" for greetings: "Hi there"
 *                   Use "Someone" for subjects: "Someone sent you a message"
 */
export function firstName(name: string, fallback = "Someone"): string {
  const first = name.trim().split(/\s+/)[0];
  const lower = first.toLowerCase();

  // Placeholder names or single characters → use fallback
  const placeholders = ["anonymous", "careseeker", "care", "a", "family", "guest", "user"];
  if (!first || lower.length <= 1 || placeholders.includes(lower)) {
    return fallback;
  }

  return first;
}

function secondaryLink(label: string, href: string): string {
  return `<a href="${href}" style="color:#9ca3af;text-decoration:underline;font-size:13px;">${label}</a>`;
}

/** Prominent text link for secondary CTAs — email-client safe (no borders) */
function ctaLink(label: string, href: string): string {
  return `<a href="${href}" style="color:${BRAND_COLOR};text-decoration:underline;font-size:14px;font-weight:600;">${label}</a>`;
}

function trustIntro(): string {
  return `<p style="font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.6;">Olera is an NIH-backed platform helping families find quality senior care providers like you. Families in your area are actively researching care options on your profile.</p>`;
}

function offRampBlock(providerSlug?: string): string {
  const removalUrl = providerSlug
    ? `${BASE_URL}/for-providers/removal-request/${providerSlug}`
    : `${BASE_URL}/contact`;
  const unsubscribeUrl = providerSlug
    ? `${BASE_URL}/unsubscribe/${providerSlug}`
    : null;
  return `
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;line-height:1.5;">Not the right contact? Please forward this to the appropriate person on your team.</p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">${secondaryLink("Manage your listing", removalUrl)}${unsubscribeUrl ? ` &middot; ${secondaryLink("Unsubscribe from leads", unsubscribeUrl)}` : ""}</p>
    </div>`;
}

/**
 * Dr. Logan's signature block with photo for lead notification emails.
 * Includes intro paragraph and credentials.
 */
function loganLeadSignature(): string {
  const photoUrl = "https://olera.care/images/for-providers/team/logan.jpg";
  return `
    <div style="margin:24px 0 0;">
      <p style="font-size:14px;color:#374151;margin:0 0 20px;line-height:1.6;">
        I'm Dr. Logan DuBose, Olera's Chief Research Officer (CRO). We're a National Institute of Health (NIH)-backed senior care directory built by a team with backgrounds in academia and engineering. With the NIH's help, we made Olera as a directory for families and providers to match based on senior care needs and offerings. We do NOT charge for matching. In other words, this is NOT a fee-for-lead directory. You can connect with families on Olera for free. Families reach out to a few providers with their care needs, scheduling request, and urgency. Even a short reply from you means a lot to them and could be helpful for you in establishing a new client.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:0;">
        <tr>
          <td style="vertical-align:top;padding-right:12px;">
            <img src="${photoUrl}" alt="Dr. Logan DuBose" width="48" height="48" style="border-radius:50%;display:block;" />
          </td>
          <td style="vertical-align:middle;font-size:13px;line-height:1.4;color:#374151;">
            <p style="margin:0;font-weight:600;color:#111827;">— Dr. Logan DuBose</p>
            <p style="margin:2px 0 0;color:#6b7280;">CRO, Olera · Researcher funded by NIH Small Business Innovation Research (SBIR) Program</p>
          </td>
        </tr>
      </table>
    </div>`;
}

/**
 * "About the authors" trust byline — the canonical photo + "Olera is built by
 * Dr. Logan DuBose … and TJ Falohun …" partnership block that grounds every
 * provider digest in real, NIH-backed people (not a lead broker). Shared across
 * all weekly-digest variants so the trust signal reads identically everywhere.
 *
 * The photo MUST be Supabase-hosted — olera.care/images/* is WAF-challenged for
 * email image proxies and renders blank.
 *
 * @param topBorder - hairline divider above the block (use when it directly
 *   follows body content; omit when it already sits below a divider/button).
 * @param heading  - optional bold lead-in (e.g. "Why Olera maps this").
 * @param tail     - optional muted context line below the byline.
 */
function authorBylineBlock(opts: { topBorder?: boolean; heading?: string; tail?: string } = {}): string {
  const photoUrl =
    "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/team/logan.jpg";
  const wrapStyle = opts.topBorder
    ? "margin:24px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;"
    : "margin:24px 0 0;";
  const heading = opts.heading
    ? `<p style="margin:0 0 4px;font-weight:600;color:#111827;">${opts.heading}</p>`
    : "";
  const byline = `<p style="margin:${opts.tail ? "0 0 6px" : "0"};">Olera is built by <a href="https://www.linkedin.com/in/logan-dubose/" style="color:${BRAND_COLOR};text-decoration:underline;">Dr. Logan DuBose</a>, a physician-researcher funded by NIH SBIR, and <a href="https://www.linkedin.com/in/tfalohun/" style="color:${BRAND_COLOR};text-decoration:underline;">TJ Falohun</a>, a PhD researcher in biomedical engineering. We&rsquo;re working to make senior care easier to understand and compare.</p>`;
  const tail = opts.tail
    ? `<p style="margin:0;color:#9ca3af;">${opts.tail}</p>`
    : "";
  return `
    <div style="${wrapStyle}">
      <table cellpadding="0" cellspacing="0" style="margin:0;">
        <tr>
          <td style="vertical-align:top;padding-right:12px;">
            <img src="${photoUrl}" alt="Dr. Logan DuBose" width="48" height="48" style="border-radius:50%;display:block;" />
          </td>
          <td style="vertical-align:top;font-size:13px;line-height:1.5;color:#6b7280;">${heading}${byline}${tail}</td>
        </tr>
      </table>
    </div>`;
}

function adBoostAuthorBylineBlock(opts: { topBorder?: boolean } = {}): string {
  const photoUrl =
    "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/team/tj.jpg";
  const wrapStyle = opts.topBorder
    ? "margin:24px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;"
    : "margin:24px 0 0;";

  return `
    <div style="${wrapStyle}">
      <table cellpadding="0" cellspacing="0" style="margin:0;">
        <tr>
          <td style="vertical-align:top;padding-right:12px;">
            <img src="${photoUrl}" alt="TJ Falohun" width="48" height="48" style="border-radius:50%;display:block;" />
          </td>
          <td style="vertical-align:top;font-size:13px;line-height:1.5;color:#6b7280;">
            <p style="margin:0;">Olera is built by <a href="https://www.linkedin.com/in/tfalohun/" style="color:${BRAND_COLOR};text-decoration:underline;">TJ Falohun</a>, a PhD researcher in biomedical engineering, and <a href="https://www.linkedin.com/in/logan-dubose/" style="color:${BRAND_COLOR};text-decoration:underline;">Dr. Logan DuBose</a>, co-founder and physician-researcher funded by NIH SBIR. We&rsquo;re working to make senior care easier to understand and compare.</p>
          </td>
        </tr>
      </table>
    </div>`;
}

// ── Shared family-creative helpers (the R6 design-system) ─────────
// Extracted from familyNudgeEmail so every family completion/nudge email
// inherits the same de-boxed ask, momentum framing, and signature — and so a
// fix to the pattern lands everywhere at once instead of email-by-email.

// Internal completeness labels (lib/admin/profile-completeness.ts) are data-model
// strings — "Payment Methods", "Real Name", "Timeline". Surfaced raw in a warm
// family email they read like a form ("Adding your Real Name…"), and the array's
// natural order isn't the order that helps matching. This maps the labels worth
// asking for to warm family phrases. "Payment Methods" → "how you'd like to pay"
// (not "budget" — families often don't know a number yet, and it reads transactional).
const FIELD_PHRASES: Record<string, string> = {
  Timeline: "care timeline",
  "Payment Methods": "how you'd like to pay",
  "Care Types": "the type of care you need",
  "Care Needs": "your care needs",
  Relationship: "who needs care",
  "Situation Description": "a little about your situation",
  Phone: "a phone number",
  "Care Recipient Age": "their age",
  "Schedule Preference": "your schedule",
  Location: "your location",
};
// Don't ask for these in a warm matching email — name/photo are data-quality, not
// care-fit, and "Real Name" reads almost like a fraud check.
const FIELD_ASK_SKIP = new Set(["Name", "Real Name", "Photo", "Email", "Contact Preference"]);
// Matching-relevance order — the details that most sharpen a match come first, so
// a 3-field cap surfaces timeline + how they'll pay before anything peripheral.
const FIELD_ASK_PRIORITY = [
  "Timeline", "Payment Methods", "Care Types", "Care Needs", "Relationship",
  "Situation Description", "Phone", "Care Recipient Age", "Schedule Preference", "Location",
];

/**
 * Turn raw completeness labels into the warm, matching-relevant phrases worth
 * asking for: drops the peripheral ones, orders by what sharpens a match, maps to
 * family language, caps at `max`. Unknown labels pass through lowercased so new
 * fields (and fixtures) still render. Shared by every family ask line.
 */
function humanizeFields(missingFields: string[], max = 3): string[] {
  return missingFields
    .filter((f) => !FIELD_ASK_SKIP.has(f))
    .sort((a, b) => {
      const ia = FIELD_ASK_PRIORITY.indexOf(a);
      const ib = FIELD_ASK_PRIORITY.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .slice(0, max)
    .map((f) => FIELD_PHRASES[f] ?? f.toLowerCase());
}

/**
 * De-boxed "ask" line — the missing profile fields read as ONE warm sentence
 * with the field names emphasized inline, never a gray SaaS callout box.
 * Humanized + matching-prioritized via humanizeFields, grammatical join, capped at
 * the 3 most useful. `lead` opens the sentence and `tail` closes it (e.g.
 * lead="Sharing your ", tail=" sharpens your matches.").
 * Returns "" when there's nothing worth asking for, so callers can drop it in unguarded.
 */
function fieldAskLine(missingFields: string[], lead: string, tail: string): string {
  const bold = humanizeFields(missingFields)
    .map((f) => `<strong style="font-weight:600;color:#374151;">${escapeHtml(f)}</strong>`);
  if (bold.length === 0) return "";
  const phrase =
    bold.length === 1
      ? bold[0]
      : bold.length === 2
        ? `${bold[0]} and ${bold[1]}`
        : `${bold[0]}, ${bold[1]}, and ${bold[2]}`;
  return `<p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">${lead}${phrase}${tail}</p>`;
}

/**
 * Momentum line — progress is only motivating when they're genuinely far along;
 * below ~half it reads as work-remaining, so we only show it from 50%+ (and never
 * at 100%, where it's noise). Returns "" otherwise.
 */
function completionProgressLine(percent: number): string {
  return percent >= 50 && percent < 100
    ? `<p style="font-size:14px;font-weight:600;color:#374151;margin:0 0 20px;line-height:1.6;">You&rsquo;re already ${Math.round(percent)}% done.</p>`
    : "";
}

/**
 * Single source of truth for completion-sequence inbox subjects. Pure (no URL),
 * so the family-nudges send path can call it for the pre-send log reservation
 * BEFORE the magic link exists, while the templates below re-emit it in their
 * returned `subject` — same string in the inbox, the preview drawer, and the log.
 * This is what kills the subject-drift class of bug (the send path and the
 * preview metadata used to define subjects independently and silently diverge).
 */
export function completionNudgeSubject(
  n: number,
  opts: { providerCount?: number; city?: string; state?: string } = {},
): string {
  const locationText = opts.city || opts.state || "your area";
  switch (n) {
    case 1:
      return "Want a hand with your care search?";
    case 2:
      return opts.providerCount
        ? `${opts.providerCount} providers near ${locationText}, ready when you are`
        : `Providers near ${locationText}, ready when you are`;
    case 3:
      return "Want to hear back faster?";
    case 4:
    default:
      return `A few providers near ${locationText} worth a look`;
  }
}

function referralTeaserTrustBlock(): string {
  return authorBylineBlock({
    topBorder: true,
    heading: "Why Olera maps this",
    tail: "This map is one way to show the local relationships that can shape where families call first.",
  });
}

/**
 * Cold / quiet-week provider rank email — the §1c Market-Intelligence expansion audience.
 *
 * A trust-forward first-contact note from Dr. DuBose for providers who rank top-5 in their
 * local market but have no weekly activity (never engaged with Olera). The copy answers the
 * four questions a stranger asks — who is Olera, are they legit, did I sign up, do they charge —
 * before the rank lands, with NIH (backing + an SBIR-funded researcher) + a physician CRO doing the trust
 * work. The CTA is a one-click "market" magic link that invisibly authenticates them onto their
 * Find Families rank view. Photo is Supabase-hosted (olera.care assets are WAF-challenged for
 * email image proxies and render blank).
 */
export function coldProviderRankEmail(opts: {
  rank: number;
  outOf: number;
  cityLabel: string;
  careLabel: string;      // "home care" | "assisted living"
  ctaUrl: string;         // one-click market magic link (auth → /provider/growth)
  manageUrl: string;
  removeUrl: string;
  unsubscribeUrl: string;
}): string {
  const { rank, outOf, cityLabel, careLabel, ctaUrl, manageUrl, removeUrl, unsubscribeUrl } = opts;
  const ORDINAL_WORDS = ["", "first", "second", "third", "fourth", "fifth"];
  const rankWord = ORDINAL_WORDS[rank] ?? `#${rank}`;
  const photoUrl =
    "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/team/logan.jpg";
  const care = escapeHtml(careLabel);
  const city = escapeHtml(cityLabel);
  const body = `
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">Families comparing ${care} in ${city} see ${outOf} agencies. Yours ranks <strong style="color:${BRAND_COLOR};">${rankWord}</strong>, by the Google reviews they actually read.</p>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">I'm Dr. Logan DuBose, Olera's Chief Research Officer (CRO). We built Olera with <strong>NIH funding</strong> so families can find trustworthy care directly, without a broker taking a cut. There's nothing to buy here, and we don't sell your leads. Your agency is already listed, and families nearby are already comparing it to the others.</p>
    <p style="font-size:15px;color:#374151;margin:0 0 26px;line-height:1.65;">I thought you'd want to see where you stand, and to make the page yours.</p>
    <div style="margin:0 0 30px;">${button("See where you rank", ctaUrl)}</div>
    <table cellpadding="0" cellspacing="0" style="margin:0;"><tr>
      <td style="vertical-align:top;padding-right:12px;"><img src="${photoUrl}" alt="Dr. Logan DuBose" width="48" height="48" style="border-radius:50%;display:block;" /></td>
      <td style="vertical-align:middle;font-size:13px;line-height:1.4;color:#374151;"><p style="margin:0;font-weight:600;color:#111827;">Dr. Logan DuBose</p><p style="margin:2px 0 0;color:#6b7280;">CRO, Olera &middot; Researcher funded by NIH Small Business Innovation Research (SBIR) Program</p></td>
    </tr></table>
    <div style="margin:30px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;"><p style="font-size:13px;color:#9ca3af;margin:0;">${secondaryLink("Manage your listing", manageUrl)} &middot; ${secondaryLink("Remove it", removeUrl)} &middot; ${secondaryLink("Unsubscribe", unsubscribeUrl)}</p></div>`;
  return layout(body, `You rank ${rankWord} of ${outOf} ${careLabel} agencies in ${cityLabel}`);
}

/**
 * Weekly lead-recap variant — providers who received one or more new family inquiries in the
 * past week. Distinct from the real-time connectionRequestEmail (sent the moment a lead lands):
 * this is the Monday recap that nudges providers who haven't responded yet. Warm and specific,
 * no NIH trust wall (they've already received leads, they know us). The CTA is a one-click magic
 * link straight to their Find Families connections inbox. Goal action: opening / responding to
 * the lead (provider_activity lead_opened).
 */
export function providerLeadDigestEmail(opts: {
  providerName: string;
  providerSlug: string;
  leadCount: number;
  ctaUrl: string;          // one-click magic link → /provider/connections
  manageUrl: string;
  unsubscribeUrl: string;
}): string {
  const { leadCount, ctaUrl, manageUrl, unsubscribeUrl } = opts;
  const name = escapeHtml(opts.providerName);
  const many = leadCount > 1;
  const who = many ? `${leadCount} families` : "A family";
  const heading = many ? `${leadCount} families reached out about you` : "A family reached out about you";
  const body = `
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">New on Olera</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">${heading}</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 18px;line-height:1.65;">This past week, ${many ? who : "a family"} asked to connect with ${name} on Olera. They shared what kind of care they&rsquo;re looking for and when they need it.</p>
    <p style="font-size:15px;color:#374151;margin:0 0 26px;line-height:1.65;">Families usually reach out to a few providers at once, so the first thoughtful reply tends to win the conversation. It takes a minute, and there&rsquo;s no fee to respond.</p>
    <div style="margin:0 0 30px;">${button(many ? "See who reached out →" : "See their request →", ctaUrl)}</div>
    ${authorBylineBlock({ topBorder: true })}
    <div style="margin:30px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;"><p style="font-size:13px;color:#9ca3af;margin:0;">${secondaryLink("Manage your listing", manageUrl)} &middot; ${secondaryLink("Unsubscribe", unsubscribeUrl)}</p></div>`;
  return layout(body, `${who} asked to connect with ${name} on Olera.`);
}

/**
 * Provider-specific off-ramp block with magic link URLs for managing listing and settings.
 * @param manageListingUrl - Magic link URL to provider dashboard
 * @param settingsUrl - Magic link URL to provider settings (lead preferences)
 */
function providerOffRampBlock(manageListingUrl: string, settingsUrl: string): string {
  return `
    <div style="margin:28px 0 0;padding:16px 0 0;border-top:1px solid #e5e7eb;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 8px;line-height:1.5;">
        Not the right person? Forward this to whoever handles new inquiries.
      </p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">
        ${secondaryLink("Manage your listing", manageListingUrl)} &middot;
        ${secondaryLink("Update lead preferences", settingsUrl)} &middot;
        ${secondaryLink("Contact us", `${BASE_URL}/contact`)}
      </p>
    </div>`;
}

// ── Templates ───────────────────────────────────────────────────

/** Verification code email for provider claims (existing flow) */
export function verificationCodeEmail(
  providerName: string,
  code: string
): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your organization</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Someone is trying to claim the page for <strong>${escapeHtml(providerName)}</strong> on Olera.
      Use this code to complete verification:
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827;">${code}</span>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
    </p>
  `, "Your verification code for Olera");
}

/** Verification OTP email for email verification method */
export function verificationOtpEmail(opts: {
  recipientName: string;
  code: string;
  businessName: string;
  expiresInMinutes: number;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.recipientName, "there"))}, use this code to verify your connection to <strong>${escapeHtml(opts.businessName)}</strong> on Olera:
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827;">${opts.code}</span>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      This code expires in ${opts.expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email.
    </p>
  `, "Your verification code for Olera");
}

/**
 * Email to provider when a family sends a connection request.
 *
 * Includes Dr. Logan's signature and smart fallbacks for missing data.
 * Footer links use magic link tokens for frictionless sign-in.
 *
 * @param opts.providerName - Provider's display name (for greeting)
 * @param opts.familyName - Family's name (for personalization)
 * @param opts.careType - Type of care being sought (e.g., "Assisted Living")
 * @param opts.city - City where care is needed (usually provider's city)
 * @param opts.careRecipient - Who the care is for (e.g., "their parent")
 * @param opts.viewUrl - Magic link URL to view the lead
 * @param opts.manageListingUrl - Magic link URL to provider dashboard (optional, uses legacy footer if not provided)
 * @param opts.settingsUrl - Magic link URL to provider settings (optional)
 * @param opts.providerSlug - Provider's slug for legacy unsubscribe link (optional, used if manageListingUrl not provided)
 */
export function connectionRequestEmail(opts: {
  providerName: string;
  familyName: string;
  careType: string | null;
  city?: string | null;
  careRecipient?: string | null;
  viewUrl: string;
  manageListingUrl?: string;
  settingsUrl?: string;
  providerSlug?: string;
}): string {
  // Extract first name, fallback to null if placeholder
  const safeFamilyName = firstName(opts.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!opts.city;
  const hasCareType = !!opts.careType;
  const hasCareRecipient = !!opts.careRecipient;

  // Determine pronoun based on care recipient (defaults to "their" if unknown)
  // "her mother" → "her", "his father" → "his", otherwise "their"
  let pronoun = "their";
  let possessivePronoun = "their";
  if (hasCareRecipient) {
    const recipientLower = opts.careRecipient!.toLowerCase();
    if (recipientLower.includes("mother") || recipientLower.includes("mom") ||
        recipientLower.includes("grandmother") || recipientLower.includes("wife") ||
        recipientLower.includes("sister") || recipientLower.includes("aunt")) {
      pronoun = "her";
      possessivePronoun = "her";
    } else if (recipientLower.includes("father") || recipientLower.includes("dad") ||
               recipientLower.includes("grandfather") || recipientLower.includes("husband") ||
               recipientLower.includes("brother") || recipientLower.includes("uncle")) {
      pronoun = "him";
      possessivePronoun = "his";
    }
  }

  // Build subject line with fallbacks
  // Full: "Margaret in Bryan is looking for assisted living"
  // No name: "A family in Bryan is looking for assisted living"
  // No city: "Margaret is looking for assisted living"
  // Minimal: "A family is looking for care"
  let subject: string;
  if (hasName && hasCity && hasCareType) {
    subject = `${safeFamilyName} in ${opts.city} is looking for ${opts.careType!.toLowerCase()}`;
  } else if (!hasName && hasCity && hasCareType) {
    subject = `A family in ${opts.city} is looking for ${opts.careType!.toLowerCase()}`;
  } else if (hasName && !hasCity && hasCareType) {
    subject = `${safeFamilyName} is looking for ${opts.careType!.toLowerCase()}`;
  } else if (hasName && hasCity && !hasCareType) {
    subject = `${safeFamilyName} in ${opts.city} is looking for care`;
  } else if (hasName) {
    subject = `${safeFamilyName} is looking for care`;
  } else if (hasCity) {
    subject = `A family in ${opts.city} is looking for care`;
  } else {
    subject = "A family is looking for care";
  }

  // Build preheader with pronoun fallback
  const preheader = hasName
    ? `See ${possessivePronoun} full request and message ${pronoun} directly.`
    : "See their full request and message them directly.";

  // Build greeting line
  const greeting = `Hi ${escapeHtml(opts.providerName)},`;

  // Build main body line with smart fallbacks
  // Full: "Margaret is looking for assisted living for her mother in Bryan — and chose your team."
  // No recipient: "Margaret is looking for assisted living in Bryan — and chose your team."
  // No city: "Margaret is looking for assisted living — and chose your team."
  // No care type: "Margaret is looking for care in Bryan — and chose your team."
  // Minimal: "A family is looking for care — and chose your team."
  let bodyLine: string;
  const familyRef = hasName ? safeFamilyName : "A family";
  const careTypeRef = hasCareType ? opts.careType!.toLowerCase() : "care";

  if (hasCareRecipient && hasCity) {
    bodyLine = `${familyRef} is looking for ${careTypeRef} for ${opts.careRecipient} in ${opts.city} — and chose your team.`;
  } else if (hasCareRecipient && !hasCity) {
    bodyLine = `${familyRef} is looking for ${careTypeRef} for ${opts.careRecipient} — and chose your team.`;
  } else if (hasCity) {
    bodyLine = `${familyRef} in ${opts.city} is looking for ${careTypeRef} — and chose your team.`;
  } else {
    bodyLine = `${familyRef} is looking for ${careTypeRef} — and chose your team.`;
  }

  // Build CTA explanation with pronoun fallback
  const ctaExplanation = hasName
    ? `Open ${possessivePronoun} request and you'll see ${possessivePronoun} full contact details, and you can message ${pronoun} directly through Olera. There's no fee, and we never sell your information.`
    : "Open their request and you'll see their contact details, and you can message them directly through Olera. There's no fee, and we never sell your information.";

  // Button text with name fallback (escape for HTML safety)
  const buttonText = hasName ? `See ${escapeHtml(safeFamilyName)}'s request →` : "See the family's request →";

  // Use new footer with magic links if URLs provided, otherwise fall back to legacy footer
  const footerBlock = opts.manageListingUrl && opts.settingsUrl
    ? providerOffRampBlock(opts.manageListingUrl, opts.settingsUrl)
    : offRampBlock(opts.providerSlug);

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      ${escapeHtml(bodyLine)}
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.6;">
      ${ctaExplanation}
    </p>
    <div style="margin:0 0 24px;">${button(buttonText, opts.viewUrl)}</div>
    ${loganLeadSignature()}
    ${footerBlock}
  `, preheader);
}

/** Confirmation email to family after they send a connection request */
export function connectionSentEmail(opts: {
  familyName: string;
  providerName: string;
  careType: string | null;
  viewUrl: string;
}): string {
  const careLine = opts.careType
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 20px;"><strong>Care type:</strong> ${escapeHtml(opts.careType)}</p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your message is on its way</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your inquiry to <strong>${escapeHtml(opts.providerName)}</strong> has been delivered. We'll notify you as soon as they respond.
    </p>
    ${careLine}
    <div style="margin:0 0 24px;">${button("View your inbox", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "We'll notify you when they respond.");
}

/** Email to verify email address after instant account creation */
export function verifyEmailEmail(opts: {
  familyName: string;
  providerName: string;
  verifyUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, you're connected with <strong>${escapeHtml(opts.providerName)}</strong> on Olera.
      Verify your email to sign in from any device and keep your account secure.
    </p>
    <div style="margin:24px 0;">${button("Verify Email", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      You can continue using Olera without verifying, but we recommend it for account security.
    </p>
  `);
}

/** Email to family when a provider responds (accept/decline) */
export function connectionResponseEmail(opts: {
  familyName: string;
  providerName: string;
  accepted: boolean;
  viewUrl: string;
}): string {
  if (opts.accepted) {
    return layout(`
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Good news</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
        Hi ${firstName(opts.familyName, "there")}, <strong>${escapeHtml(opts.providerName)}</strong> is interested in helping you. View their response and continue the conversation.
      </p>
      <div style="margin:0 0 24px;">${button("View conversation", opts.viewUrl)}</div>
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
        Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
      </p>
    `, "They're interested in connecting with you.");
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">We're still here to help</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, <strong>${escapeHtml(opts.providerName)}</strong> isn't able to take new clients right now — but there are other great providers in your area.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Finding the right care takes time. Keep exploring — we'll help you find the right fit.
    </p>
    <div style="margin:0 0 24px;">${button("Browse other providers", `${BASE_URL}/browse`)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "We're here to help you find the right care.");
}

/** Email when a new message is sent in a connection thread */
/**
 * Email for when someone sends their FIRST message in a thread (initiating contact).
 * Shows the message preview and says "sent you a message" not "got back to you".
 */
/**
 * First message email to FAMILY (when a PROVIDER sends them a message for the first time).
 * Greeting: Family's first name or "Hi there,"
 * Sender: Provider's full name
 */
export function firstMessageEmailForFamily(opts: {
  familyName: string;
  providerName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  const providerFullName = escapeHtml(opts.providerName || "A provider");
  const familyGreeting = opts.familyName && opts.familyName.trim()
    ? escapeHtml(firstName(opts.familyName, "there"))
    : "there";
  const safePreview = escapeHtml(opts.messagePreview);

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${familyGreeting},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      <strong>${providerFullName}</strong> sent you a message:
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${safePreview}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("Read their message", opts.viewUrl)}</div>
    <div style="border-top:1px solid #e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      That's a real person on the other end, ready to help. Reply whenever you're ready — there's no rush, and the conversation stays right in your inbox, just between the two of you.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Not sure what to say? Even a quick note about who needs care and when is a great start.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:24px 0 0;line-height:1.5;">
      Questions, or want help knowing what to ask? A real person is here — <a href="${BASE_URL}/contact" style="color:#6b7280;text-decoration:underline;">contact us anytime</a>.
    </p>
    <p style="font-size:14px;color:#374151;margin:16px 0 0;line-height:1.5;">
      Warmly,<br>The Olera team
    </p>
  `, "Read their message and reply whenever you're ready.");
}

/**
 * First message email to PROVIDER (when a FAMILY sends them a message for the first time).
 * Greeting: Provider's full name (business name)
 * Sender: Family's first name or "A family"
 */
export function firstMessageEmailForProvider(opts: {
  providerName: string;
  familyName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  const providerGreeting = escapeHtml(opts.providerName || "there");
  const safeFamilyName = firstName(opts.familyName, "");
  const familyRef = safeFamilyName ? escapeHtml(safeFamilyName) : "A family";
  const safePreview = escapeHtml(opts.messagePreview);

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${providerGreeting},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      <strong>${familyRef}</strong> sent you a message:
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${safePreview}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("Read their message", opts.viewUrl)}</div>
    <div style="border-top:1px solid #e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Families appreciate a quick, personal response — it can make all the difference in their decision.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:24px 0 0;line-height:1.5;">
      Questions? We're here to help — <a href="${BASE_URL}/contact" style="color:#6b7280;text-decoration:underline;">contact us anytime</a>.
    </p>
    <p style="font-size:14px;color:#374151;margin:16px 0 0;line-height:1.5;">
      Warmly,<br>The Olera team
    </p>
  `, "A family sent you a message — read and respond.");
}

/**
 * Email to FAMILY when a PROVIDER replies in an ongoing conversation.
 * Greeting: Family's first name or "Hi there,"
 * Sender: Provider's full name
 */
export function newMessageEmailForFamily(opts: {
  familyName: string;
  providerName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  // Family greeting: first name or "there"
  const familyGreeting = opts.familyName && opts.familyName.trim()
    ? escapeHtml(firstName(opts.familyName, "there"))
    : "there";
  // Provider: use full name, fallback to "A provider"
  const providerFullName = escapeHtml(opts.providerName || "A provider");
  const safePreview = escapeHtml(opts.messagePreview);

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${familyGreeting},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Good news — <strong>${providerFullName}</strong> just got back to you:
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${safePreview}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("Read their reply", opts.viewUrl)}</div>
    <div style="border-top:1px solid #e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      That's a real person on the other end, ready to help. Reply whenever you're ready — there's no rush, and the conversation stays right in your inbox, just between the two of you.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Not sure what to say? Even a quick note about who needs care and when is a great start.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:24px 0 0;line-height:1.5;">
      Questions, or want help knowing what to ask? A real person is here — <a href="${BASE_URL}/contact" style="color:#6b7280;text-decoration:underline;">contact us anytime</a>.
    </p>
    <p style="font-size:14px;color:#374151;margin:16px 0 0;line-height:1.5;">
      Warmly,<br>The Olera team
    </p>
  `, "Read their message and reply whenever you're ready.");
}

/**
 * Email to PROVIDER when a FAMILY replies in an ongoing conversation.
 * Greeting: Provider's full name (business name)
 * Sender: Family's first name or "A family"
 */
export function newMessageEmailForProvider(opts: {
  providerName: string;
  familyName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  // Provider greeting: full business name
  const providerGreeting = escapeHtml(opts.providerName || "there");
  // Family: first name if available, otherwise "A family"
  const safeFamilyName = firstName(opts.familyName, "");
  const familyRef = safeFamilyName ? escapeHtml(safeFamilyName) : "A family";
  const safePreview = escapeHtml(opts.messagePreview);

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${providerGreeting},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      <strong>${familyRef}</strong> just replied:
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${safePreview}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("Read their message", opts.viewUrl)}</div>
    <div style="border-top:1px solid #e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Families appreciate a quick, personal response — it can make all the difference in their decision.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:24px 0 0;line-height:1.5;">
      Questions? We're here to help — <a href="${BASE_URL}/contact" style="color:#6b7280;text-decoration:underline;">contact us anytime</a>.
    </p>
    <p style="font-size:14px;color:#374151;margin:16px 0 0;line-height:1.5;">
      Warmly,<br>The Olera team
    </p>
  `, "A family replied — read their message and respond.");
}

/** Reminder email to family when provider responded but family hasn't engaged */
export function unreadReminderEmail(opts: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  viewUrl: string;
}): string {
  const recipientFirstName = firstName(opts.recipientName, "there");
  // Use full provider name (not shortened)
  const providerFullName = opts.senderName || "A provider";
  const safePreview = escapeHtml(opts.messagePreview);

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(recipientFirstName)},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      <strong>${escapeHtml(providerFullName)}</strong> got back to you recently, and their message is still waiting whenever you'd like to read it:
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${safePreview}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("Read their reply", opts.viewUrl)}</div>
    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      Reaching out about care can feel like a big step, and it's okay to take your time. When you're ready, even a short note is enough to get things going — you don't have to have it all figured out.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      It stays private — just you and them, no one else.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      Here whenever you need us — <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:none;">contact us anytime</a>.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 4px;line-height:1.5;">
      Warmly,
    </p>
    <p style="font-size:15px;color:#374151;margin:0;line-height:1.5;">
      The Olera team
    </p>
  `, `There's no rush — they're still there whenever you're ready.`);
}

/** Email to family when provider is silent for ~4 days OR actively declines - offer alternative providers */
/**
 * Outcome-check email — the dating-app "Did you meet this person?" pattern.
 *
 * Sent ~48-72h after a family sends an inquiry. The real outcome (did the
 * provider call/email them back?) happens off-platform and is invisible to us,
 * so we just ask. The answer is our ground-truth connection signal AND the
 * trigger for the help cascade: a "no"/"not yet" routes the family to the
 * landing page's alternative-provider + benefits mini-cascade.
 *
 * Buttons point at the public, no-login /connection-outcome page keyed by the
 * connection id. The page records the answer via a client-side POST (so email
 * scanners, which issue GETs and don't run JS, can't false-trigger an outcome).
 */
export function connectionOutcomeCheckEmail(opts: {
  familyName: string;
  providerName: string;
  yesUrl: string;
  notYetUrl: string;
  noUrl: string;
  unsubscribeUrl?: string;
}): string {
  const familyFirstName = firstName(opts.familyName, "there");
  const provider = escapeHtml(opts.providerName);

  // Local button variants so "Yes" reads as the affirmative/primary action and
  // the other two are calmer, equal-weight neutrals (no false urgency).
  const primaryBtn = (label: string, href: string) =>
    `<a href="${href}" style="display:block;text-align:center;padding:13px 24px;background:${BRAND_COLOR};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>`;
  const neutralBtn = (label: string, href: string) =>
    `<a href="${href}" style="display:block;text-align:center;padding:13px 24px;background:#ffffff;color:#374151;font-size:15px;font-weight:600;text-decoration:none;border:1px solid #d1d5db;border-radius:8px;">${label}</a>`;

  const footer = opts.unsubscribeUrl
    ? `<p style="font-size:12px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">You're getting this because you reached out to a provider on Olera. <a href="${opts.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> from care-search updates.</p>`
    : "";

  return layout(
    `
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(familyFirstName)},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      A couple of days ago you reached out to <strong>${provider}</strong> through Olera.
      Quick check-in: <strong>did they get back to you?</strong>
    </p>
    <div style="margin:0 0 12px;">${primaryBtn("Yes, we connected", opts.yesUrl)}</div>
    <div style="margin:0 0 12px;">${neutralBtn("Not yet", opts.notYetUrl)}</div>
    <div style="margin:0 0 24px;">${neutralBtn("No, I haven't heard back", opts.noUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:0;line-height:1.5;">
      One tap is all it takes. It helps us make sure you actually get the care you're looking for.
      If a provider's gone quiet, we'll show you others nearby who are ready to help.
    </p>
    ${footer}
  `,
    `Did ${opts.providerName} get back to you? One tap to let us know.`,
  );
}

/**
 * Light, secondary "see what you may qualify for" block — the benefits CLOSER in
 * the compare-led flywheel. Links the personalized benefits quiz (/benefits/finder),
 * which both gives the family results AND captures profile "fuel" for sharper
 * matches. Renders nothing when no url is supplied (older/transactional callers).
 * Intentionally a text link, not a button — it rides alongside compare, never leads.
 */
function benefitsQuizModule(url?: string | null): string {
  if (!url) return "";
  return `
    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;line-height:1.5;">
      It also helps to know what you can afford.
      <a href="${url}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">See programs you may qualify for</a>. It takes about 2 minutes and can show what may help lower the cost of care.
    </p>
  `;
}

/** A compare-card row: facility photo + name + a scannable trust line (rating · distance) + price. */
export interface CompareCardItem {
  name: string;
  viewUrl: string;
  priceRange: string | null;
  /** Enhancement fields — the coordinator supplies all; legacy callers may omit them. */
  imageUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  distanceMi?: number | null;
  /** Short honest "why we picked this" line (e.g. "Highly Rated · State Licensed").
   *  Built from verified signals upstream; omitted when there's nothing to stand
   *  behind. Never a response-time claim. */
  reason?: string | null;
  /** One-tap "introduce me" write link (B2). When set, the card gets an
   *  "Introduce me" button that creates a real inquiry to this provider —
   *  per-provider consent ("ask this one"), never a blast-all. Omitted →
   *  the card stays a plain view link (legacy/transactional callers). */
  introUrl?: string | null;
  /** Tolerated (some callers build cards with a slug); not rendered. */
  slug?: string;
}

function compareCardRow(p: CompareCardItem): string {
  // One muted meta line — rating · distance · price — instead of three stacked
  // lines. Fewer lines = a calmer, Airbnb-style listing row.
  const stars =
    p.rating != null ? `★&nbsp;${p.rating.toFixed(1)}${p.reviewCount ? ` (${p.reviewCount})` : ""}` : "";
  const dist =
    p.distanceMi != null
      ? `${p.distanceMi < 10 ? p.distanceMi.toFixed(1) : Math.round(p.distanceMi)} mi`
      : "";
  const price = p.priceRange ? escapeHtml(p.priceRange) : "";
  const metaLine = [stars, dist, price].filter(Boolean).join("&nbsp;&nbsp;·&nbsp;&nbsp;");
  const meta = metaLine
    ? `<p style="font-size:13px;color:#6b7280;margin:3px 0 0;line-height:1.4;">${metaLine}</p>`
    : "";
  // The "why we picked this" line — the curated-shortlist differentiator, in a
  // confident green under the name.
  const reason = p.reason
    ? `<p style="font-size:13px;color:#047857;font-weight:500;margin:3px 0 0;line-height:1.4;">${escapeHtml(p.reason)}</p>`
    : "";
  // Image is an enhancement layer — the text carries the row with images off.
  // Top-aligned: a standard listing row where the content is a touch taller than
  // the thumbnail.
  const imageCol = p.imageUrl
    ? `<td width="64" style="vertical-align:top;padding-right:14px;">
          <img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" width="64" height="64" style="width:64px;height:64px;border-radius:10px;object-fit:cover;display:block;background:#eef1f0;border:0;" />
        </td>`
    : "";
  // One-tap "introduce me" — a calm teal text link as the last line of the
  // content, not a pill on a lower row. Its own anchor (never nested inside the
  // card's view link), and no fixed width to clip on mobile. Airbnb-style: airy,
  // a clear affordance, one accent.
  const introLink = p.introUrl
    ? `<a href="${p.introUrl}" style="display:inline-block;margin:8px 0 0;color:${BRAND_COLOR};font-size:14px;font-weight:600;text-decoration:none;">Introduce me&nbsp;&rarr;</a>`
    : "";
  return `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:0;"><tr>
      ${imageCol}
      <td style="vertical-align:top;">
        <a href="${p.viewUrl}" style="text-decoration:none;">
          <p style="font-size:16px;color:${BRAND_COLOR};font-weight:600;margin:0;line-height:1.3;">${escapeHtml(p.name)}</p>
          ${reason}
          ${meta}
        </a>
        ${introLink}
      </td>
    </tr></table>`;
}

/** Stacked compare cards with hairline separators (Zillow/Airbnb listing rhythm). */
function compareCardsBlock(providers: CompareCardItem[]): string {
  return providers
    .map((p, i) => (i > 0 ? `<div style="height:1px;background:#eef1f0;margin:14px 0;"></div>` : "") + compareCardRow(p))
    .join("");
}

export function providerSilentEmail(opts: {
  familyName: string;
  providerName: string;
  providerPassed: boolean; // true if provider actively declined, false if just silent
  declineMessage?: string | null; // Provider's custom message when declining (only shown if providerPassed is true)
  recommendedProviders: CompareCardItem[];
  browseUrl: string;
  city: string | null;
  /** Care type the family inquired about (friendly label, e.g. "memory care"),
   *  used for the entry-bridge opening sentence. Optional — degrades cleanly. */
  careType?: string | null;
  /** Benefits quiz deep-link (the closer). Omitted by transactional callers. */
  benefitsQuizUrl?: string | null;
  /** Family profile id for the unsubscribe footer. */
  unsubscribeId?: string;
}): string {
  const familyFirstName = firstName(opts.familyName, "there");
  // Entry-bridge sentence: name their actual situation (care type + city) so the
  // email reads as "Olera is helping me with THIS", not a generic blast. Only
  // when we have the context; degrades to nothing otherwise.
  const bridgeContext = [
    opts.careType ? `about ${escapeHtml(opts.careType.toLowerCase())}` : "",
    opts.city ? `in ${escapeHtml(opts.city)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const bridge = bridgeContext
    ? `You reached out to <strong>${escapeHtml(opts.providerName)}</strong> ${bridgeContext}. `
    : "";
  const hasDeclineMessage = opts.providerPassed && opts.declineMessage?.trim();
  const hasRecommendedProviders = opts.recommendedProviders.length > 0;

  // Different copy for explicit decline vs silence
  // Adjust based on whether we have recommendations to show
  let openingLine: string;
  if (opts.providerPassed) {
    if (hasDeclineMessage) {
      openingLine = `<strong>${escapeHtml(opts.providerName)}</strong> isn't able to take new families right now and left you a message:`;
    } else if (hasRecommendedProviders) {
      openingLine = `<strong>${escapeHtml(opts.providerName)}</strong> isn't able to take new families right now, but you've got other strong options nearby worth comparing:`;
    } else {
      openingLine = `<strong>${escapeHtml(opts.providerName)}</strong> isn't able to take new families right now, but there are other providers in your area worth a look.`;
    }
  } else if (bridge) {
    openingLine = `${bridge}They haven't gotten back to you yet, and the good thing about Olera is you're never limited to just one.${hasRecommendedProviders ? " Here are a few others worth comparing:" : ""}`;
  } else {
    openingLine = `<strong>${escapeHtml(opts.providerName)}</strong> hasn't gotten back to you yet, and the good thing about Olera is you're never limited to just one.${hasRecommendedProviders ? " Here are a few other providers near you worth comparing:" : ""}`;
  }

  // Adjust closing line based on whether we showed recommendations
  const closingLine = opts.providerPassed
    ? (hasRecommendedProviders
        ? `You can reach out to any of them the same way, directly in your inbox, with no forms and no flood of calls. Message as many as you'd like, or just one. It's your call.`
        : `You can browse providers and reach out the same way, directly in your inbox, with no forms and no flood of calls. It's your call.`)
    : (hasRecommendedProviders
        ? `You can reach out to any of them the same way, directly in your inbox, with no forms and no flood of calls. Message as many as you'd like, or just one. It's your call.<br><br>And if ${escapeHtml(opts.providerName)} does get back to you, that conversation will still be right there waiting.`
        : `You can browse providers and reach out the same way, directly in your inbox, with no forms and no flood of calls.<br><br>And if ${escapeHtml(opts.providerName)} does get back to you, that conversation will still be right there waiting.`);

  // Show provider's decline message if present (similar to message preview style)
  // Only say "plenty of other options" if we actually have recommendations
  const declineMessageSection = hasDeclineMessage
    ? `<div style="background:#f9fafb;border-left:3px solid #9ca3af;padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.declineMessage!.trim())}"</p>
      </div>
      ${hasRecommendedProviders
        ? `<p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">But you've got other strong options nearby worth comparing:</p>`
        : `<p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">There are other providers in your area worth a look:</p>`
      }`
    : "";

  // Render recommended providers prominently (high up, visible on mobile)
  // Each provider gets a magic link for one-click viewing
  const providersSection = hasRecommendedProviders ? compareCardsBlock(opts.recommendedProviders) : "";

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(familyFirstName)},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 ${hasDeclineMessage ? "20px" : "24px"};line-height:1.5;">
      ${openingLine}
    </p>
    ${declineMessageSection}
    ${hasRecommendedProviders ? `<div style="margin:0 0 24px;">${providersSection}</div>` : ""}
    <div style="margin:8px 0 24px;text-align:center;">${browseLink("Compare more providers near you", opts.browseUrl)}</div>
    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      ${closingLine}
    </p>
    ${benefitsQuizModule(opts.benefitsQuizUrl)}
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      Questions, or want a hand choosing? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:none;">Contact us anytime</a>.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 4px;line-height:1.5;">
      Warmly,
    </p>
    <p style="font-size:15px;color:#374151;margin:0;line-height:1.5;">
      The Olera team
    </p>
    ${authorBylineBlock({ topBorder: true })}
    ${careUnsubscribeFooter(opts.unsubscribeId)}
  `, `You're never limited to one. Here are others worth comparing.`);
}

/** Email #6: Email to family when provider is STILL silent after 7+ days - trust recovery with intervention */
export function providerStillSilentEmail(opts: {
  familyName: string;
  providerName: string;
  recommendedProviders: { name: string; slug: string; priceRange: string | null; viewUrl: string }[];
  browseUrl: string;
}): string {
  const familyFirstName = firstName(opts.familyName, "there");

  // Render recommended providers prominently (high up, visible on mobile)
  // Each provider gets a magic link for one-click viewing
  const providersSection = opts.recommendedProviders.map((p) => `
    <div style="margin:0 0 12px;">
      <a href="${p.viewUrl}" style="font-size:16px;color:${BRAND_COLOR};font-weight:600;text-decoration:none;display:block;margin-bottom:4px;">${escapeHtml(p.name)}</a>
      ${p.priceRange ? `<p style="font-size:13px;color:#6b7280;margin:0;">${escapeHtml(p.priceRange)}</p>` : ""}
    </div>
  `).join("");

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(familyFirstName)},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      It's been over a week, and <strong>${escapeHtml(opts.providerName)}</strong> still hasn't gotten back to you. That's on them, not you — and you deserve better than waiting. Here are providers near you who are ready to help right now:
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:0 0 24px;">
      ${providersSection}
    </div>
    <div style="margin:0 0 24px;">${button("See providers ready to help", opts.browseUrl)}</div>
    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      Or, if you'd rather not do this alone, a real person on our team will personally help you find care that fits — <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">contact us here</a>, and we'll take it from here.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      You came here looking for care, and that shouldn't end in silence. We're not going to let it.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 4px;line-height:1.5;">
      Warmly,
    </p>
    <p style="font-size:15px;color:#374151;margin:0;line-height:1.5;">
      The Olera team
    </p>
  `, `You shouldn't have to wait this long — here are providers who'll respond.`);
}

/**
 * Email to a family who never engaged after sending a lead. Compare-led when we
 * have alternatives to show (≥3 from the coordinator); falls back to the gentle
 * guide-led version when we don't. Benefits quiz rides alongside as the closer.
 */
/**
 * Single source of truth for the R3 never-engaged inbox subject — mirrors
 * completionNudgeSubject so the coordinator's pre-send log reservation and the
 * preview drawer can't drift from what the template implies. `hasAlts` is the
 * same branch the template uses to pick compare-led vs guide-fallback.
 */
export function familyNeverEngagedSubject(hasAlts: boolean): string {
  return hasAlts
    ? "A few care options near you worth a look"
    : "What could help you pay for care";
}

export function familyNeverEngagedEmail(opts: {
  familyName: string;
  providerName: string;
  guideUrl: string;
  inboxUrl: string;
  /** When present (≥1), the email leads with these to compare. */
  recommendedProviders?: CompareCardItem[];
  /** Pre-filtered browse "see more" link (paired with recommendedProviders). */
  browseUrl?: string | null;
  /** Benefits quiz deep-link (the closer). */
  benefitsQuizUrl?: string | null;
  /** Family profile id for the unsubscribe footer. */
  unsubscribeId?: string;
}): string {
  const familyFirstName = firstName(opts.familyName, "there");
  const hasRecs = !!opts.recommendedProviders?.length;

  const providersSection = hasRecs ? compareCardsBlock(opts.recommendedProviders!) : "";

  // Compare-led body (we have options to show) — confident, compare-HERO angle.
  // Matches the completion_nudge_4 bar: h1 headline + de-boxed photo/hairline
  // cards as the hero (compareCardsBlock carries its own separators, so no gray
  // wrapper box), benefits as the soft closer, founder byline.
  if (hasRecs) {
    return layout(`
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">You have real choices nearby</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Hi ${escapeHtml(familyFirstName)}, finding the right care is a big decision, and you&rsquo;ve got real options. Here are a few providers near you worth comparing side by side:
    </p>
    ${providersSection}
    ${opts.browseUrl ? `<div style="margin:24px 0 0;text-align:center;">${browseLink("Compare more providers near you", opts.browseUrl)}</div>` : ""}
    ${benefitsQuizModule(opts.benefitsQuizUrl)}
    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.6;">
      And <strong>${escapeHtml(opts.providerName)}</strong> is still there whenever you&rsquo;re ready. Message them anytime from <a href="${opts.inboxUrl}" style="color:${BRAND_COLOR};text-decoration:none;">your inbox</a>, with no forms and no calls you didn&rsquo;t ask for. New to all this? Our <a href="${opts.guideUrl}" style="color:${BRAND_COLOR};text-decoration:none;">free guide</a> walks through what to look for.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 0;line-height:1.6;">
      Want a hand choosing? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    ${careUnsubscribeFooter(opts.unsubscribeId)}
  `, `A few real options near you, worth a look. No rush.`);
  }

  // Fallback (no alternatives to show — the thinnest hand). Lead with RECOGNITION,
  // not presumption: care searches stall for everyone, usually on two questions —
  // who's good, and how to pay. We make the second one (the real paralyzer, and our
  // strongest free asset) the hero; the guide drops to a soft inline link; the human
  // offer routes to /contact, never "reply" (From is noreply@). One reassurance line.
  const hasQuiz = !!opts.benefitsQuizUrl;
  const heroCta = hasQuiz
    ? button("See what could help with the cost", opts.benefitsQuizUrl!)
    : button("Get the free guide", opts.guideUrl);
  return layout(`
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.3;">Choosing care for someone you love is a lot to carry</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.6;">
      Hi ${escapeHtml(familyFirstName)}, you&rsquo;re weighing options, cost, trust, and timing all at once, trying to make a call you won&rsquo;t second-guess. It&rsquo;s completely normal for a search like that to stall for a while. So take it at your pace.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
      ${hasQuiz
        ? "When you&rsquo;re ready, the heaviest part is usually the cost, and that&rsquo;s the one we can help lift first. A quick look shows which programs and benefits could help cover it. Most families are surprised by what they qualify for."
        : "When you&rsquo;re ready, here&rsquo;s a free guide that walks through what to look for, what to ask, and how families actually pay for care."}
    </p>
    <div style="margin:0 0 24px;">${heroCta}</div>
    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.6;">
      And whenever you&rsquo;re ready, <strong>${escapeHtml(opts.providerName)}</strong> is still there. Message them anytime from <a href="${opts.inboxUrl}" style="color:${BRAND_COLOR};text-decoration:none;">your inbox</a>, with no forms and no calls you didn&rsquo;t ask for.${hasQuiz ? ` New to all this? Our <a href="${opts.guideUrl}" style="color:${BRAND_COLOR};text-decoration:none;">free guide</a> covers what to look for and what to ask.` : ""}
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 0;line-height:1.6;">
      No rush. The conversation will be here when you&rsquo;re ready. And if you&rsquo;d rather talk it through with a real person, you can <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    ${careUnsubscribeFooter(opts.unsubscribeId)}
  `, `When you're ready, a little help with the heaviest part: the cost.`);
}

/** Email to admin when a provider claims their page */
export function claimNotificationEmail(opts: {
  providerName: string;
  providerSlug: string;
  claimedByEmail: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Provider claimed</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 8px;line-height:1.5;">
      <strong>${escapeHtml(opts.providerName)}</strong> was just claimed on Olera.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
      <strong>Claimed by:</strong> ${escapeHtml(opts.claimedByEmail)}
    </p>
    <div>${button("View listing", `${BASE_URL}/provider/${opts.providerSlug}`)}</div>
  `, `${opts.providerName} claimed by ${opts.claimedByEmail}`);
}

/** Email to provider when their claim is approved or rejected */
export function claimDecisionEmail(opts: {
  providerName: string;
  approved: boolean;
  listingUrl: string;
}): string {
  if (opts.approved) {
    return layout(`
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your listing is live!</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Congratulations — <strong>${escapeHtml(opts.providerName)}</strong> has been verified and is now live on Olera.
        Families in your area can find you and reach out directly.
      </p>
      <div style="margin:0 0 24px;">${button("View your listing", opts.listingUrl)}</div>
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
        Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
      </p>
    `, "Your listing is now live on Olera");
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your claim needs attention</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      We were unable to verify the claim for <strong>${escapeHtml(opts.providerName)}</strong>.
      This is usually due to missing or mismatched information. Please reach out so we can help resolve it.
    </p>
    <div style="margin:0 0 24px;">${button("Contact support", `${BASE_URL}/contact`)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "We need more information to verify your claim");
}

/** Email to provider when their identity verification is approved or rejected (from admin panel) */
export function verificationDecisionEmail(opts: {
  providerName: string;
  recipientName: string;
  approved: boolean;
  dashboardUrl: string;
}): string {
  const name = firstName(opts.recipientName, "there");

  if (opts.approved) {
    return layout(`
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td align="center">
          <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);border-radius:50%;">
            <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">✓</td></tr>
          </table>
        </td></tr>
      </table>
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">You're all set!</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
        Great news, ${escapeHtml(name)}! Our team has reviewed and verified your connection to <strong>${escapeHtml(opts.providerName)}</strong>.
      </p>
      <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="font-size:14px;color:#166534;margin:0 0 12px;font-weight:600;">Here's what you can do now:</p>
        <ul style="font-size:14px;color:#166534;margin:0;padding-left:20px;line-height:1.8;">
          <li>Respond to family inquiries and answer questions</li>
          <li>Customize your listing with photos and business details</li>
          <li>Reach out to families looking for care</li>
          <li>Hire caregivers</li>
        </ul>
      </div>
      <div style="text-align:center;margin:0 0 24px;">${button("Go to Your Dashboard", opts.dashboardUrl)}</div>
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">
        We're excited to have you on Olera! Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">We're here to help</a>
      </p>
    `, "You're verified — your dashboard is ready");
  }

  // Rejection case
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Let's get you verified</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(name)}, we reviewed your verification for <strong>${escapeHtml(opts.providerName)}</strong> but need a bit more information to confirm your connection.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.5;">
      Don't worry — there are several ways to verify. Here's what works best:
    </p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li><strong style="color:#111827;">Work email</strong> — Use an email with your company's domain (e.g., you@company.com)</li>
      <li><strong style="color:#111827;">LinkedIn</strong> — Make sure your profile shows this organization as your current employer</li>
      <li><strong style="color:#111827;">Business website</strong> — Link to a page that lists you as staff (About Us, Team page)</li>
      <li><strong style="color:#111827;">Document</strong> — Upload a business license, ID badge, or official letterhead</li>
    </ul>
    <div style="margin:0 0 24px;">${button("Try Again", opts.dashboardUrl)}</div>
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Need help?</strong> Our team is happy to assist — <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">contact us here</a> and we'll sort this out together.
      </p>
    </div>
  `, "Let's try another way to verify your connection");
}

/** Email to provider when they receive a new review */
export function newReviewEmail(opts: {
  providerName: string;
  reviewerName: string;
  rating: number;
  comment: string;
  viewUrl: string;
  providerSlug?: string;
}): string {
  // Generate star rating display
  const stars = "★".repeat(opts.rating) + "☆".repeat(5 - opts.rating);
  const safeReviewerName = firstName(opts.reviewerName);

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${escapeHtml(safeReviewerName)} left a review for ${escapeHtml(opts.providerName)}</h1>
    ${trustIntro()}
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 20px;">
      <p style="font-size:20px;color:#f59e0b;margin:0 0 12px;letter-spacing:2px;">${stars}</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6;">"${escapeHtml(opts.comment)}"</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">Reviews help families make confident decisions about care — and yours is getting noticed.</p>
    <div style="margin:0 0 24px;">${button("View your review", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `, `${safeReviewerName} gave you ${opts.rating} stars on Olera`);
}

// ── question_received A/B test ────────────────────────────────────────
//
// Variant A (control): exact production state as of 2026-04-27.
//   Subject: "A family has a question about {Provider}"
//   Preheader: none — inbox shows whatever body fragment the client picks.
//
// Variant B: real question as subject (truncated, quote-wrapped) +
// neutral Olera-attributed preheader.
//   Subject: "{Question excerpt}"
//   Preheader: "From a family on Olera · {Provider}"
//
// Question content can rarely contain identifying health detail; B falls
// back to a non-question subject when keywords like "dementia",
// "Alzheimer's", "Parkinson's", etc. are present. Marketing-urgency words
// hurt opens (research: opens drop below 36%; 69% of decision-makers find
// urgency-marketing copy annoying), so B leans into "real-question / from
// a colleague" feel rather than stakes pressure.
//
// Variant assignment happens once at send time; the chosen variant is
// persisted to email_log.metadata.variant so the admin funnel tile can
// split open / click / sign-in / answer rates by arm.

const QA_PHI_KEYWORDS = /\b(dementi|alzheim|parkinson|cancer|stroke|hospice|als|multiple sclerosis|diabet|copd|hypertens|chemo|dialysis|oxygen tank|ventilator|catheter|depress|anxiet|schizo|bipolar|psychos|incontinen|bedridden|immobile|terminal|palliative|end-of-life|end of life)\b/i;

function questionMentionsPHI(text: string): boolean {
  return QA_PHI_KEYWORDS.test(text);
}

/**
 * Truncate a question for use directly in the subject line. Mobile inboxes
 * typically clip at ~40-50 chars before the ellipsis; quote chars consume
 * 2 of those, so we aim for ≤48 visible question chars.
 */
function truncateForSubject(text: string, max = 48): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + "…";
}

export type QaEmailVariant = "A" | "B";

/**
 * Random 50/50 assignment for the question_received A/B test. Call once
 * per email send and pass the result to both questionReceivedInbox() and
 * sendEmail's metadata so the funnel can later attribute opens correctly.
 */
export function assignQuestionVariant(): QaEmailVariant {
  return Math.random() < 0.5 ? "A" : "B";
}

/**
 * Build the inbox-visible parts (subject + preheader) of a question_received
 * email for the given variant. Centralizes A/B copy so all 3 send sites stay
 * in sync.
 *
 * `phiFiltered` is true when variant B fell back to a non-question subject
 * because the question text contained health-condition keywords. Persist
 * this in email_log.metadata so we can audit the rate later.
 */
export function questionReceivedInbox(opts: {
  providerName: string;
  question: string;
  variant: QaEmailVariant;
}): { subject: string; preheader: string; phiFiltered: boolean } {
  if (opts.variant === "A") {
    return {
      subject: `A family has a question about ${opts.providerName}`,
      preheader: "",
      phiFiltered: false,
    };
  }
  // B
  const phi = questionMentionsPHI(opts.question);
  if (phi) {
    return {
      subject: `A new family question for ${opts.providerName}`,
      preheader: `From a family on Olera · Posted today`,
      phiFiltered: true,
    };
  }
  const truncated = truncateForSubject(opts.question);
  return {
    subject: `"${truncated}"`,
    preheader: `From a family on Olera · ${opts.providerName}`,
    phiFiltered: false,
  };
}

/** Email to provider when someone asks a question on their page */
export function questionReceivedEmail(opts: {
  providerName: string;
  askerName: string;
  question: string;
  providerUrl: string;
  providerSlug?: string;
  /** Optional preheader for inbox preview. Pass from questionReceivedInbox(). */
  preheader?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family has a question about ${escapeHtml(opts.providerName)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      <strong>${escapeHtml(firstName(opts.askerName))}</strong> is researching care options and asked:
    </p>
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:15px;color:#111827;margin:0;line-height:1.5;font-style:italic;">&ldquo;${escapeHtml(opts.question)}&rdquo;</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">A thoughtful answer helps families see your expertise and builds trust with people actively looking for care.</p>
    <div style="margin:0 0 24px;">${button("View and respond", opts.providerUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `, opts.preheader);
}

/** Email to asker when their question is answered */
export function questionAnsweredEmail(opts: {
  askerName: string;
  providerName: string;
  question: string;
  answer: string;
  providerUrl: string;
}): string {
  // Preheader shows answer preview
  const preheaderSnippet = opts.answer.length > 50
    ? opts.answer.slice(0, 50) + "..."
    : opts.answer;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${opts.providerName ? escapeHtml(opts.providerName) : "A provider"} answered your question</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.askerName, "there"))}, <strong>${escapeHtml(opts.providerName)}</strong> responded to your question:
    </p>
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your question</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.question)}"</p>
    </div>
    <div style="background:#f0fdfa;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:13px;color:${BRAND_COLOR};margin:0 0 6px;font-weight:600;">Their answer</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.answer)}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("See the full answer", opts.providerUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `"${preheaderSnippet}"`);
}

/** Confirmation email to guest after they enrich a Q&A question with their email */
export function questionConfirmationEmail(opts: {
  askerName: string;
  providerName: string;
  question: string;
  providerUrl: string;
  /** Optional list of similar providers nearby. When provided, the email
   *  ends with a "While you wait" block listing them with name + city + a
   *  link to each. Used by the qa_email_capture variant to deliver on the
   *  enrichment-prompt promise ("we'll send 3 similar providers in [City]
   *  in case they don't reply fast"). Pass [] (empty array) or omit to
   *  fall back to the original single-CTA email. */
  alternatives?: Array<{ name: string; city: string | null; url: string }>;
  /** City of the original provider, used in the alternatives header copy.
   *  When omitted, the header drops the city qualifier. */
  city?: string | null;
}): string {
  const alternativesBlock =
    opts.alternatives && opts.alternatives.length > 0
      ? `
    <p style="font-size:15px;color:#6b7280;margin:24px 0 12px;line-height:1.5;">
      While you wait for <strong>${escapeHtml(opts.providerName)}</strong> to reply, here ${opts.alternatives.length === 1 ? "is" : "are"} ${opts.alternatives.length} similar
      provider${opts.alternatives.length === 1 ? "" : "s"}${opts.city ? ` in ${escapeHtml(opts.city)}` : " nearby"} to compare:
    </p>
    <div style="margin:0 0 24px;">
      ${opts.alternatives
        .map(
          (a) => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin:0 0 8px;">
          <a href="${a.url}" style="font-size:15px;font-weight:600;color:#111827;text-decoration:none;">${escapeHtml(a.name)}</a>
          ${a.city ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(a.city)}</div>` : ""}
        </div>`,
        )
        .join("")}
    </div>
  `
      : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your question is on its way</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.askerName, "there"))}, your question to <strong>${escapeHtml(opts.providerName)}</strong> has been delivered. We'll notify you as soon as they respond.
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.question)}"</p>
    </div>
    <div style="margin:0 0 24px;">${button("View on Olera", opts.providerUrl)}</div>
    ${alternativesBlock}
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "We'll notify you when they respond.");
}

/** Welcome email for new users from multi_provider Q&A variants */
export function questionWelcomeEmail(opts: {
  displayName: string;
  providerName: string | null;
  questionText: string | null;
  portalUrl: string;
}): string {
  const questionBlock = opts.questionText
    ? `
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your question</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.questionText)}"</p>
    </div>
  `
    : "";

  const providerContext = opts.providerName
    ? `Your question to <strong>${escapeHtml(opts.providerName)}</strong> has been delivered. Most providers respond within 24 hours — we'll email you the moment they do.`
    : `Your question has been delivered. Most providers respond within 24 hours — we'll email you the moment they do.`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You're all set</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.displayName, "there"))}, ${providerContext}
    </p>
    ${questionBlock}
    <div style="margin:0 0 24px;">${button("View your inbox", opts.portalUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "Your question has been delivered.");
}

/** Email to family when their Matches profile goes live */
export function matchesLiveEmail(opts: {
  familyName: string;
  city: string;
  matchesUrl: string;
}): string {
  const preheader = `Providers in ${opts.city} can now see your care needs and reach out to you`;
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your care profile is live</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, providers in ${escapeHtml(opts.city)} can now see your care needs on Olera.
    </p>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      <strong>What happens next?</strong> When a provider wants to help, they'll send you a message — not a phone call. You can read it on your own time and decide who's worth responding to.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      You're in control.
    </p>
    <div style="margin:0 0 24px;">${button("View Your Profile", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Have questions? Just reply to this email — we're here to help.
    </p>
  `, preheader);
}

/** Email to family when a provider sends a reach-out (Matches F2) */
export function providerReachOutEmail(opts: {
  familyName: string;
  providerName: string;
  city: string;
  message: string | null;
  matchesUrl: string;
}): string {
  const preheader = `${opts.providerName} saw your care needs and sent you a message`;
  const messageLine = opts.message
    ? `<div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.message)}"</p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${escapeHtml(opts.providerName)} wants to connect</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.familyName, "there"))}, <strong>${escapeHtml(opts.providerName)}</strong> in ${escapeHtml(opts.city)} saw your care needs and reached out to you.
    </p>
    ${messageLine}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Not a phone call — just a message you can read on your own time. Review their profile and decide if they're worth responding to.
    </p>
    <div style="margin:0 0 24px;">${button("View Their Message", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, preheader);
}

/** Email to family when they have unanswered messages and Matches is not active (F3) */
export function matchesNudgeEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  unansweredCount: number;
  matchesUrl: string;
}): string {
  const preheader = "Let providers come to you instead";
  const providerWord = opts.unansweredCount === 1 ? "provider" : "providers";
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Still waiting to hear back?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.familyName, "there"))}, you've reached out to ${opts.unansweredCount} ${providerWord} but haven't heard back yet. That's frustrating, but there's a better way.
    </p>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Instead of chasing providers one by one, let them come to you. Share your care needs once, and qualified providers will reach out directly.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Not phone calls. Messages you can read on your own time. You decide who's worth talking to.
    </p>
    <div style="margin:0 0 24px;">${button("Let Providers Reach Out", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    <p style="font-size:12px;color:#d1d5db;margin:12px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `, preheader);
}

/** Email to provider when their profile is still incomplete 48hrs after signup (P1) */
export function providerIncompleteProfileEmail(opts: {
  providerName: string;
  city: string;
  profileUrl: string;
  providerSlug?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are searching in ${escapeHtml(opts.city)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${opts.providerName ? escapeHtml(opts.providerName) : "there"}, families in ${escapeHtml(opts.city)} are looking for care providers on Olera — but your profile isn't ready yet.
      Complete it so families can find and connect with you.
    </p>
    <div style="margin:0 0 24px;">${button("Complete your profile", opts.profileUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `, "Complete your profile to connect with families");
}

/** Email to provider when a family accepts their reach-out (P2) */
export function reachOutAcceptedEmail(opts: {
  providerName: string;
  familyName: string;
  viewUrl: string;
}): string {
  const safeFamilyName = firstName(opts.familyName, "A family");
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You're connected!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      <strong>${escapeHtml(safeFamilyName)}</strong> accepted your reach-out on Olera. You can now message each other directly.
    </p>
    <div style="margin:0 0 24px;">${button("View conversation", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `${safeFamilyName} wants to connect — start the conversation`);
}

/** Email to provider when a family closes their profile (auto-decline pending reach-outs) */
export function reachOutAutoDeclinedEmail(opts: {
  providerName: string;
  familyCity: string;
  viewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family closed their profile</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${opts.providerName ? escapeHtml(opts.providerName) : "there"}, a family in ${escapeHtml(opts.familyCity)} that you reached out to has closed their care profile on Olera.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      This sometimes happens when families find care or their needs change. Keep reaching out to other families — new care seekers join every day.
    </p>
    <div style="margin:0 0 24px;">${button("Find Families", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "Keep reaching out — new families join every day");
}

/** Document checklist email for benefits applications */
export function checklistEmail(opts: {
  programName: string;
  programShortName: string;
  stateName: string;
  checked: string[];
}): string {
  const categories = [
    {
      name: "Identity & Personal",
      items: [
        "Government-issued photo ID",
        "Social Security card",
        "Birth certificate",
        "Marriage certificate (if applicable)",
        "Passport-size photo",
      ],
    },
    {
      name: "Medical & Health",
      items: [
        "Medical records or doctor's statement",
        "Diagnosis or disability documentation",
        "Current medication list",
        "Health insurance card (Medicare/Medicaid)",
      ],
    },
    {
      name: "Financial & Income",
      items: [
        "Proof of income (pay stubs, tax return, SSI letter)",
        "Bank statements (last 3 months)",
        "Proof of assets (property, investments)",
        "Proof of expenses (rent, utilities, medical bills)",
      ],
    },
    {
      name: "Residency & Housing",
      items: [
        "Proof of state residency (utility bill, lease)",
        "Current living arrangement documentation",
        "Proof of U.S. citizenship or immigration status",
      ],
    },
  ];

  const checkedSet = new Set(opts.checked);
  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
  const checkedCount = opts.checked.length;

  const categoriesHtml = categories
    .map((cat) => {
      const itemsHtml = cat.items
        .map((item) => {
          const done = checkedSet.has(item);
          const icon = done ? "&#9745;" : "&#9744;";
          const style = done
            ? "color:#9ca3af;text-decoration:line-through;"
            : "color:#374151;";
          return `<tr><td style="padding:4px 0;font-size:14px;${style}">${icon}&nbsp; ${item}</td></tr>`;
        })
        .join("");

      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr><td style="font-size:15px;font-weight:600;color:#111827;padding:0 0 8px;border-bottom:1px solid #f3f4f6;">
            ${cat.name}
          </td></tr>
          ${itemsHtml}
        </table>`;
    })
    .join("");

  const preheader = `${checkedCount} of ${totalItems} documents ready for ${opts.programShortName}`;
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your Document Checklist</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 4px;line-height:1.5;">
      For <strong>${escapeHtml(opts.programName)}</strong> in ${escapeHtml(opts.stateName)}
    </p>
    <p style="font-size:14px;color:${BRAND_COLOR};font-weight:600;margin:0 0 24px;">
      ${checkedCount} of ${totalItems} documents gathered
    </p>
    ${categoriesHtml}
    <div style="background:#f0fdfa;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Next step:</strong> Once you've gathered all documents, visit the ${escapeHtml(opts.programShortName)} page on Olera to start your application.
      </p>
    </div>
    <div>${button("View program details", `${BASE_URL}/senior-benefits`)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a> — we're here to help.
    </p>
  `, preheader);
}

// ── Care Seeker Notification Emails ──────────────────────────────

/** Welcome email for new signups (Google OAuth / email OTP — NOT guest connections) */
export function welcomeEmail(opts: {
  familyName: string;
  browseUrl: string;
  profileUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">We're here to help</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, finding care for someone you love isn't easy — and you don't have to figure it out alone.
    </p>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Olera helps you compare trusted providers, ask questions directly, and make informed decisions at your own pace.
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;">When you're ready, start by browsing providers in your area.</p>
    <div style="margin:0 0 24px;">${button("See providers near you", opts.browseUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Want providers to reach out to you? ${ctaLink("Complete your profile", opts.profileUrl)} and let them find you.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a> — a real person will get back to you.
    </p>
  `, "You don't have to figure this out alone.");
}

// ── Provider card helper for email templates ──

export interface EmailProviderCard {
  name: string;
  category: string;
  slug: string;
  rating: number;
  reviewCount: number;
  reviewSnippet?: string | null;
  city: string;
  state: string;
  /** Price range for display (e.g., "$2,500–4,000/mo" or "Contact for pricing") */
  priceRange?: string | null;
}

function providerCardRow(provider: EmailProviderCard, showSnippet = false): string {
  const snippetHtml = showSnippet && provider.reviewSnippet
    ? `<p style="font-size:13px;color:#6b7280;margin:6px 0 0;line-height:1.4;font-style:italic;">&ldquo;${escapeHtml(provider.reviewSnippet.slice(0, 120))}${provider.reviewSnippet.length > 120 ? "..." : ""}&rdquo;</p>`
    : "";
  const priceHtml = provider.priceRange
    ? `<p style="font-size:13px;color:#059669;margin:4px 0 0;font-weight:500;">${escapeHtml(provider.priceRange)}</p>`
    : "";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:12px 16px;">
        <a href="${BASE_URL}/provider/${provider.slug}" style="font-size:15px;font-weight:600;color:#111827;text-decoration:none;">${escapeHtml(provider.name)}</a>
        <p style="font-size:13px;color:#6b7280;margin:2px 0 0;">${escapeHtml(provider.category)} &middot; ${escapeHtml(provider.city)}, ${escapeHtml(provider.state)}</p>
        <p style="font-size:13px;color:#d97706;margin:4px 0 0;">&starf; ${provider.rating.toFixed(1)} (${provider.reviewCount.toLocaleString()} reviews)</p>
        ${priceHtml}
        ${snippetHtml}
      </td></tr>
    </table>`;
}

function providerCardsBlock(providers: EmailProviderCard[], showSnippets = false): string {
  if (providers.length === 0) return "";
  return `<div style="margin:0 0 24px;">${providers.map((p) => providerCardRow(p, showSnippets)).join("")}</div>`;
}

/** Go-live reminder — shows nearby provider count + top providers */
export function goLiveReminderEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  matchesUrl: string;
  city?: string;
  providerCount?: number;
  topProviders?: EmailProviderCard[];
}): string {
  const cityText = opts.city || "your area";
  const countText = opts.providerCount ? `${opts.providerCount} care` : "Care";
  const providersHtml = opts.topProviders?.length ? providerCardsBlock(opts.topProviders) : "";
  const preheader = `${countText} providers in ${cityText} are ready to help. Let them reach out to you.`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${countText} providers in ${escapeHtml(cityText)} are looking for families like yours</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, your care profile is looking great. Activate Matches and let providers in your area reach out to you directly.
    </p>
    ${providersHtml}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      You're always in control. You decide which providers to respond to.
    </p>
    <div>${button("Let Providers Reach Out", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us anytime</a>, we're here to help.
    </p>
    <p style="font-size:12px;color:#d1d5db;margin:12px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `, preheader);
}

/** Post-connection follow-up — asks about experience, builds review system */
export function postConnectionFollowupEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  providerName: string;
  providerSlug: string;
  reviewUrl: string;
}): string {
  const preheader = `Your feedback helps other families find great care. Tell us about ${opts.providerName}`;
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">How was your experience with ${escapeHtml(opts.providerName)}?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, you connected with ${escapeHtml(opts.providerName)} on Olera about a month ago. We'd love to hear how it went.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your feedback helps other families make informed decisions, and helps great providers get the recognition they deserve.
    </p>
    <div>${button("Share your experience", opts.reviewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us anytime</a>, we're here to help.
    </p>
    <p style="font-size:12px;color:#d1d5db;margin:12px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from follow-up emails</a>
    </p>
  `, preheader);
}

// ── Profile Completion Sequence (4 active + 1 maintenance) ──────────

/** Completion Nudge #1 (Day 0, 4h after signup): Helpful onboarding */
export function completionNudge1Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providerCount?: number;
  city?: string;
}): { subject: string; html: string } {
  const locationText = opts.city || "your area";
  // R6 playbook: value-FIRST (what the family gets: fit + a way to pay), not
  // provider-serving. The de-boxed ask names the 1-3 most useful missing details
  // inline; momentum only shows once they're genuinely far along (≥50%).
  const askLine = fieldAskLine(
    opts.missingFields ?? [],
    "Adding your ",
    " helps us get those matches right.",
  );
  const progressLine = completionProgressLine(opts.completionPercent ?? 0);

  return {
    subject: completionNudgeSubject(1, { city: opts.city, providerCount: opts.providerCount }),
    html: layout(
      `
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">Care is hard to figure out. Cost is harder.</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 12px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, you started a care search on Olera, and we can help with both: finding the right fit, and figuring out how to pay for it.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Whenever you&rsquo;re ready, tell us a little more and we&rsquo;ll point you to providers near ${escapeHtml(locationText)} that actually fit.
    </p>
    ${progressLine}
    ${askLine}
    <div>${button("Get better matches", opts.welcomeUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Questions, or want a hand choosing? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `,
      // Preheader (inbox preview after the subject) — the subject is the warm
      // opener, so this carries the substance: the cost help. Plain apostrophe on
      // purpose: preheaderHtml escapes &, so an &rsquo; entity would render literally.
      `Plus a look at any programs that can help with the cost.`,
    ),
  };
}

/** Completion Nudge #2 (Day 2): Progress encouragement, provider count */
export function completionNudge2Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providerCount?: number;
  city?: string;
  state?: string;
}): { subject: string; html: string } {
  const locationText = opts.city || opts.state || "your area";
  // Day-2 angle: social proof — real providers near them — but framed as THEIR
  // options, not providers "hunting families". Same shared system as nudge_1.
  const countClause = opts.providerCount
    ? `${opts.providerCount} providers near ${escapeHtml(locationText)}`
    : `providers near ${escapeHtml(locationText)}`;
  const askLine = fieldAskLine(
    opts.missingFields ?? [],
    "Adding your ",
    " helps us point you to the right ones.",
  );
  const progressLine = completionProgressLine(opts.completionPercent ?? 0);

  return {
    subject: completionNudgeSubject(2, { providerCount: opts.providerCount, city: opts.city, state: opts.state }),
    html: layout(
      `
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">There&rsquo;s more help near you than you might think</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 12px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, since you started looking, here&rsquo;s the good news: there really are ${countClause} who can help.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      The hard part is knowing which ones fit your situation. Tell us a little more and we&rsquo;ll narrow it down for you.
    </p>
    ${progressLine}
    ${askLine}
    <div>${button("Get better matches", opts.welcomeUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Questions, or want a hand choosing? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `,
      // Subject carries the count; preheader carries the next step.
      `A couple details and we'll point you to the ones that fit.`,
    ),
  };
}

/** Completion Nudge #3 (Day 5): Social proof */
export function completionNudge3Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providerCount?: number;
  city?: string;
  state?: string;
}): { subject: string; html: string } {
  // Day-6 angle: the payoff of finishing — you hear back faster, with real answers
  // instead of "tell me more". Friend-voice, same shared system as nudge_1/2.
  const askLine = fieldAskLine(
    opts.missingFields ?? [],
    "Adding your ",
    " is usually all it takes.",
  );
  const progressLine = completionProgressLine(opts.completionPercent ?? 0);

  return {
    subject: completionNudgeSubject(3, { city: opts.city, state: opts.state }),
    html: layout(
      `
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">A little more, and providers can actually help</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, here&rsquo;s something we&rsquo;ve noticed: when providers can see what you&rsquo;re looking for, they can reply faster, with real answers instead of &ldquo;can you tell me more?&rdquo;
    </p>
    ${progressLine}
    ${askLine}
    <div>${button("Get better matches", opts.welcomeUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Questions, or want a hand choosing? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `,
      // Subject is the warm hook; preheader carries the mechanism.
      `When providers can see the basics, they reply with real answers.`,
    ),
  };
}

/** Completion Nudge #4 (Day 7): Show specific providers */
export function completionNudge4Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  welcomeUrl: string;
  missingFields?: string[];
  completionPercent?: number;
  providers?: CompareCardItem[];
  providerCount?: number;
  city?: string;
  state?: string;
}): { subject: string; html: string } {
  const locationText = opts.city || opts.state || "your area";
  // Photo + hairline cards (the matches-email style), not the boxed text cards.
  const providersHtml = opts.providers?.length ? compareCardsBlock(opts.providers) : "";
  const remainingCount = (opts.providerCount ?? 0) - (opts.providers?.length ?? 0);
  // Day-13 final touch: make it concrete — actual providers near them, as cards —
  // and keep it warm and low-pressure. Same shared system; the cards are the hero.
  const askLine = fieldAskLine(
    opts.missingFields ?? [],
    "Adding your ",
    " helps us match you to the right ones.",
  );
  const progressLine = completionProgressLine(opts.completionPercent ?? 0);

  return {
    subject: completionNudgeSubject(4, { city: opts.city, state: opts.state }),
    html: layout(
      `
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">A few providers near you who could help</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, you started a care search a little while back, so here are a few highly-rated providers near ${escapeHtml(locationText)} to give you a real starting point:
    </p>
    ${providersHtml}
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      ${remainingCount > 0 ? `There are ${remainingCount} more near you. ` : ""}Whenever you&rsquo;re ready, tell us a little more and the ones that fit can reach out to you directly, already knowing your situation.
    </p>
    ${progressLine}
    ${askLine}
    <div>${button("Get better matches", opts.welcomeUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Questions, or want a hand choosing? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `,
      // Subject lists the providers; preheader carries the low-pressure tone.
      `Real options near you. No rush.`,
    ),
  };
}

// ── Profile Publish Sequence (4 active + 1 maintenance) ──────────

/**
 * Single source of truth for the publish-sequence inbox subjects — mirrors
 * completionNudgeSubject / familyNeverEngagedSubject so the family-nudges send
 * path and the preview drawer can't drift from each other.
 */
export function publishNudgeSubject(n: number): string {
  switch (n) {
    case 1:
      return "Let providers come to you";
    case 2:
      return "These providers want to help families like yours";
    case 3:
      return "Skip the phone tag";
    case 4:
    default:
      return "Your care search on Olera is still here";
  }
}

/** Publish Nudge #1 (Day 0 after complete): The Flip, let providers come to you */
export function publishNudge1Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  matchesUrl: string;
  providerCount?: number;
  city?: string;
}): string {
  const cityText = opts.city || "your area";
  const providerText = opts.providerCount
    ? `${opts.providerCount} providers in ${escapeHtml(cityText)} are ready to help`
    : `Providers in ${escapeHtml(cityText)} are ready to help`;

  const preheader = "No more calling around. Let them reach out to you.";

  return layout(`
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">Let providers come to you</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, instead of calling provider after provider, let them reach out to you.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 8px;line-height:1.6;"><strong>Here's how it works:</strong></p>
    <ul style="font-size:15px;color:#374151;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>${providerText}. They can see your care needs and send you a message.</li>
      <li>Not a phone call. A message you can read on your own time.</li>
      <li>You decide who's worth responding to.</li>
    </ul>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
      No pressure. You're in control.
    </p>
    <div>${button("See how it works", opts.matchesUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Questions about how it works? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `, preheader);
}

/** Publish Nudge #2 (Day 2): Show concrete providers who could reach out */
export function publishNudge2Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  matchesUrl: string;
  providerCount?: number;
  /** Photo + hairline compare cards (the matches-email / completion_nudge_4 style). */
  providers?: CompareCardItem[];
  city?: string;
}): string {
  const cityText = opts.city || "your area";
  const hasProviders = opts.providers && opts.providers.length > 0;
  const providersHtml = hasProviders ? compareCardsBlock(opts.providers!.slice(0, 3)) : "";
  const remainingCount = (opts.providerCount ?? 0) - (opts.providers?.length ?? 0);

  // Adjust headline and intro based on whether we have providers to show
  const headline = hasProviders
    ? "These providers want to help families like yours"
    : `Providers in ${escapeHtml(cityText)} want to help families like yours`;
  const intro = hasProviders
    ? `Here are a few highly-rated providers in ${escapeHtml(cityText)} who could help:`
    : `Providers in ${escapeHtml(cityText)} are looking for families to help.`;

  const preheader = hasProviders
    ? "These providers help families like yours"
    : "Providers are looking for families to help";

  return layout(`
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">${headline}</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, when you started your care search on Olera, you saved what you're looking for. ${intro}
    </p>
    ${providersHtml}
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
      ${remainingCount > 0 ? `These providers (and ${remainingCount} others) are looking for families to help. ` : ""}When you publish, they can see your needs and reach out. No forms to fill out, no calls to make. They do the work, and you choose who to talk to.
    </p>
    <div>${button("Let providers reach out", opts.matchesUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Questions about how it works? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `, preheader);
}

/** Publish Nudge #3 (Day 6): Social proof + contrast with the old way */
export function publishNudge3Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  matchesUrl: string;
  familiesThisWeek?: number;
  familiesThisMonth?: number;
  providerCount?: number;
  city?: string;
  state?: string;
}): string {
  const locationText = opts.city || opts.state || "your area";

  // Build social proof line with real data
  let socialProof: string;
  if (opts.familiesThisWeek && opts.familiesThisWeek >= 5) {
    socialProof = `${opts.familiesThisWeek} families got responses this week, without making a single call.`;
  } else if (opts.familiesThisMonth && opts.familiesThisMonth >= 10) {
    socialProof = `${opts.familiesThisMonth} families heard back from providers this month, without making a single call.`;
  } else {
    socialProof = "Families on Olera are hearing back from providers, without making a single call.";
  }

  const preheader = "No more phone tag. Let providers come to you.";

  return layout(`
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">Skip the phone tag</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, when you started your care search on Olera, you saved a profile with the care you need. From there, most families take it the hard way: hours calling providers, leaving voicemails, waiting for callbacks.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Families on Olera do it differently: they publish what they need, and providers reach out with real answers.
    </p>
    <p style="font-size:16px;font-weight:600;color:${BRAND_COLOR};margin:0 0 24px;line-height:1.5;">
      ${escapeHtml(socialProof)}
    </p>
    <div>${button("Let providers come to you", opts.matchesUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Questions about how it works? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `, preheader);
}

/** Publish Nudge #4 (Day 13): Soft touch + invitation to reply */
export function publishNudge4Email(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  matchesUrl: string;
  city?: string;
}): string {
  const cityText = opts.city || "your area";

  const preheader = "A quick reminder of where your care search left off.";

  return layout(`
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.3;">Your care profile is ready when you are</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, a little while ago you started a care search on Olera and saved a profile with the kind of care you're looking for. It's still here, no rush.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      There's just one step left: making your profile visible to care providers near you in ${escapeHtml(cityText)}. Once it's visible, they can see what you need and reach out to you directly, so you're not the one calling around.
    </p>
    <div>${button("Let providers reach out to me", opts.matchesUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Not sure how it works, or have questions? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a> and we're happy to explain.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `, preheader);
}

// ── Maintenance Phase (monthly, fresh content) ──────────

/** Maintenance email for incomplete profiles — new or top providers */
export function completionMaintenanceEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  welcomeUrl: string;
  providers?: EmailProviderCard[];
  /** Count of new providers this month (0 = show top providers instead) */
  newProviderCount?: number;
  missingFields?: string[];
  completionPercent?: number;
  city?: string;
  state?: string;
}): string {
  const percent = opts.completionPercent ?? 0;
  const locationText = opts.city || opts.state || "your area";
  const hasNewProviders = (opts.newProviderCount ?? 0) > 0;
  const providersHtml = opts.providers?.length ? providerCardsBlock(opts.providers) : "";

  // Dynamic headline and intro based on whether there are actually new providers
  const headline = hasNewProviders
    ? `${opts.newProviderCount} new providers joined in ${escapeHtml(locationText)}`
    : `Top providers in ${escapeHtml(locationText)} you might have missed`;

  const introText = hasNewProviders
    ? `${opts.newProviderCount} new providers joined Olera in ${escapeHtml(locationText)} this month. Here are a few:`
    : `Here are some highly-rated providers in ${escapeHtml(locationText)}:`;

  const preheader = hasNewProviders
    ? `Including some highly-rated options`
    : `Highly-rated care options near you`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${headline}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${introText}
    </p>
    ${providersHtml}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your profile is ${percent}% complete. When you're ready to connect with providers like these, we're here.
    </p>
    <div>${button("Continue Your Profile", opts.welcomeUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;text-align:center;">
      No longer looking for care? <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from updates</a>
    </p>
  `, preheader);
}

/** Maintenance email for unpublished profiles — fresh providers + the value prop */
export function publishMaintenanceEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  matchesUrl: string;
  providerCount?: number;
  newProviderCount?: number;
  providers?: EmailProviderCard[];
  city?: string;
  state?: string;
}): string {
  const locationText = opts.city || opts.state || "your area";
  const hasNewProviders = (opts.newProviderCount ?? 0) > 0;
  const providersHtml = opts.providers?.length ? providerCardsBlock(opts.providers.slice(0, 3)) : "";

  // Dynamic headline based on new providers
  const headline = hasNewProviders
    ? `${opts.newProviderCount} new providers joined in ${escapeHtml(locationText)}`
    : `Providers in ${escapeHtml(locationText)} are still looking`;

  const preheader = hasNewProviders
    ? "New care options near you"
    : "Your profile is ready — let them reach out";

  // Build intro text based on whether we have providers to show
  const hasProviders = opts.providers && opts.providers.length > 0;
  const introText = hasProviders
    ? (hasNewProviders ? "here are some providers who recently joined Olera:" : "here are some highly-rated providers near you:")
    : "providers are still looking for families to help.";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${headline}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${introText}
    </p>
    ${providersHtml}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your profile is ready. When you publish, providers${hasProviders ? " like these" : ""} can see your care needs and reach out — no calls to make, no forms to fill. They do the work, you choose who to talk to.
    </p>
    <div>${button("Let Providers Reach Out", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? Just reply to this email — we're here to help.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:12px 0 0;line-height:1.5;text-align:center;">
      No longer looking for care? <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from updates</a>
    </p>
  `, preheader);
}

// ── Gap Emails (Completion Celebration, Re-engagement, Saved Updates, Recommendations) ──

/** Completion celebration — sent once when profile reaches 100% (unpublished users only) */
export function completionCelebrationEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  profileUrl: string;
  city?: string;
}): string {
  const cityText = opts.city || "your area";
  const preheader = `Providers in ${cityText} can now understand exactly what you need`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your care profile is complete</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, you did it — your profile is complete and ready to publish.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.5;"><strong>When you publish:</strong></p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>Providers in ${escapeHtml(cityText)} can see your care needs</li>
      <li>They can reach out to you directly</li>
      <li>You decide who to respond to — no pressure</li>
    </ul>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      No calls to make, no forms to fill. Providers do the outreach — you stay in control.
    </p>
    <div>${button("Let Providers Reach Out", opts.profileUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? Just reply to this email — we're here to help.
    </p>
    <p style="font-size:12px;color:#d1d5db;margin:12px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from care search updates</a>
    </p>
  `, preheader);
}

/** Inactivity re-engagement — sent to families who haven't been active for 30+ days */
export function inactivityReengagementEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  profileUrl: string;
  inboxUrl: string;
  providers?: EmailProviderCard[];
  completionPercent?: number;
  isPublished: boolean;
  city?: string;
  state?: string;
}): string {
  const locationText = opts.city || opts.state || "your area";
  const providersHtml = opts.providers?.length ? providerCardsBlock(opts.providers.slice(0, 3)) : "";
  const preheader = "Highly-rated providers are ready to help when you are";

  // Determine CTA based on profile state
  let ctaHtml: string;
  if (opts.isPublished) {
    ctaHtml = `
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Providers can already find you — check your inbox for any messages you may have missed.
    </p>
    <div>${button("Check Your Inbox", opts.inboxUrl)}</div>`;
  } else if ((opts.completionPercent ?? 0) >= 60) {
    ctaHtml = `
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your profile is ready. When you publish, providers like these can see your needs and reach out directly.
    </p>
    <div>${button("Let Providers Reach Out", opts.profileUrl)}</div>`;
  } else {
    const percent = opts.completionPercent ?? 0;
    ctaHtml = `
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your profile is ${percent}% complete. When you're ready to connect, we're here.
    </p>
    <div>${button("Continue Your Profile", opts.profileUrl)}</div>`;
  }

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Still searching for care in ${escapeHtml(locationText)}?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, finding the right care takes time — and we're here when you're ready.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Here are some highly-rated providers near you:
    </p>
    ${providersHtml}
    ${ctaHtml}
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? Just reply to this email — we're here to help.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:12px 0 0;line-height:1.5;text-align:center;">
      No longer looking for care? <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from updates</a>
    </p>
  `, preheader);
}

/** Saved provider update — describes what's new */
export interface SavedProviderUpdate {
  name: string;
  slug: string;
  updateType: "new_reviews" | "profile_updated" | "price_updated";
  newRating?: number;
  newReviewCount?: number;
}

/** Weekly digest for families with saved providers — updates + recommendations */
export function savedProviderDigestEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  savedUrl: string;
  updates?: SavedProviderUpdate[];
  /** The primary saved provider to base recommendations on */
  primarySavedProvider?: EmailProviderCard;
  recommendations?: EmailProviderCard[];
  city?: string;
}): string {
  const hasUpdates = opts.updates && opts.updates.length > 0;
  const hasRecommendations = opts.recommendations && opts.recommendations.length > 0;
  const cityText = opts.city || "your area";

  // Build updates section
  let updatesHtml = "";
  if (hasUpdates) {
    const updateLines = opts.updates!.map((u) => {
      if (u.updateType === "new_reviews" && u.newRating && u.newReviewCount) {
        return `<li><a href="${BASE_URL}/provider/${u.slug}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">${escapeHtml(u.name)}</a> — new reviews (now ${u.newRating.toFixed(1)}★ from ${u.newReviewCount} reviews)</li>`;
      } else if (u.updateType === "profile_updated") {
        return `<li><a href="${BASE_URL}/provider/${u.slug}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">${escapeHtml(u.name)}</a> — updated their profile</li>`;
      } else if (u.updateType === "price_updated") {
        return `<li><a href="${BASE_URL}/provider/${u.slug}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">${escapeHtml(u.name)}</a> — updated pricing information</li>`;
      }
      return `<li><a href="${BASE_URL}/provider/${u.slug}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">${escapeHtml(u.name)}</a></li>`;
    }).join("");

    updatesHtml = `
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">Updates this week:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 24px;padding-left:20px;line-height:1.8;">
      ${updateLines}
    </ul>`;
  }

  // Build recommendations section
  let recommendationsHtml = "";
  if (hasRecommendations) {
    const basedOnText = opts.primarySavedProvider
      ? `Based on ${escapeHtml(opts.primarySavedProvider.name)}, families also connected with:`
      : `Providers in ${escapeHtml(cityText)} you might like:`;

    recommendationsHtml = `
    <div style="border-top:1px solid #e5e7eb;padding-top:20px;margin-top:8px;">
      <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">Similar providers you might like</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">${basedOnText}</p>
      ${providerCardsBlock(opts.recommendations!.slice(0, 2))}
    </div>`;
  }

  // Dynamic headline and preheader
  const headline = hasUpdates
    ? "Updates on providers you're considering"
    : "Providers similar to ones you saved";
  const preheader = hasUpdates
    ? "New reviews and similar providers you might like"
    : "Highly-rated providers near you";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${headline}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, here's what's happening with the providers you're considering:
    </p>
    ${updatesHtml}
    ${recommendationsHtml}
    <div style="margin-top:24px;">${button("View All Your Saves", opts.savedUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? Just reply to this email — we're here to help.
    </p>
    <p style="font-size:12px;color:#d1d5db;margin:12px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Manage your email preferences</a>
    </p>
  `, preheader);
}

/** Monthly provider recommendations — new providers + top recommendations */
export function monthlyProviderRecommendationsEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  profileUrl: string;
  inboxUrl: string;
  providers?: EmailProviderCard[];
  newProviderCount?: number;
  isPublished: boolean;
  city?: string;
  state?: string;
}): string {
  const locationText = opts.city || opts.state || "your area";
  const hasNewProviders = (opts.newProviderCount ?? 0) > 0;
  const providersHtml = opts.providers?.length ? providerCardsBlock(opts.providers.slice(0, 3)) : "";

  // Dynamic headline based on new providers
  const headline = hasNewProviders
    ? `${opts.newProviderCount} providers in ${escapeHtml(locationText)} match your search`
    : `Highly-rated providers in ${escapeHtml(locationText)}`;

  const preheader = hasNewProviders
    ? "Including some top-rated options near you"
    : "Top-rated care options you might have missed";

  // Intro text
  const introText = hasNewProviders
    ? `here are some providers who recently joined Olera:`
    : `here are some top-rated providers you might have missed:`;

  // CTA based on publish state
  const ctaHtml = opts.isPublished
    ? `
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      These providers can already see your profile. Check your inbox for messages.
    </p>
    <div>${button("Check Your Inbox", opts.inboxUrl)}</div>`
    : `
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your profile is ready. When you publish, providers like these can see your care needs and reach out — no calls to make, no forms to fill.
    </p>
    <div>${button("Let Providers Reach Out", opts.profileUrl)}</div>`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${headline}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Hi ${firstName(opts.familyName, "there")}, ${introText}
    </p>
    ${providersHtml}
    ${ctaHtml}
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Have questions? Just reply to this email — we're here to help.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:12px 0 0;line-height:1.5;text-align:center;">
      No longer looking for care? <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from updates</a>
    </p>
  `, preheader);
}

/** Email sent to clients requesting they leave a review for a provider */
export function reviewRequestEmail(opts: {
  clientName: string;
  providerName: string;
  customMessage: string;
  reviewUrl: string;
}): string {
  const preheader = `${opts.providerName} sent you a personal message`;
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${escapeHtml(opts.providerName)} would love your feedback</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${firstName(opts.clientName, "there")},
    </p>
    <div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.customMessage)}</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Sharing your experience helps other families find quality care — and only takes a couple of minutes.
    </p>
    <div>${button("Write a review", opts.reviewUrl)}</div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      This email was sent on behalf of ${escapeHtml(opts.providerName)} via Olera. Don't want to receive these? Reply directly to let them know.
    </p>
  `, preheader);
}

/** Care report email — sent to families after connection request (the anti-APFM differentiator) */
/**
 * Consolidated care report email sent to families after they send a lead.
 * This email includes:
 * - Confirmation that request was sent
 * - Magic link button to message provider (with auto-sign in)
 * - Olera value proposition
 * - Dynamic pricing info for the provider's care type and location
 * - Funding options with savings amounts
 * - Similar providers in the area
 *
 * IMPORTANT: magicLinkUrl is a REQUIRED parameter. If this function is called
 * from other places in the codebase, those calls will need to be updated to
 * include a magic link or fallback URL.
 */
export function careReportEmail(opts: {
  seekerFirstName: string;
  providerName: string;
  providerSlug: string;
  careTypeLabel: string | null;
  pricingRange: string | null;
  pricingDescription: string | null;
  city: string | null;
  state: string | null;
  fundingOptions: { label: string; savings: string | null }[];
  similarProviders: { name: string; slug: string; priceRange: string | null; viewUrl: string }[];
  magicLinkUrl: string;
}): string {
  const greeting = `Hi ${firstName(opts.seekerFirstName || "", "there")}`;

  const locationStr = [opts.city, opts.state].filter(Boolean).join(", ");
  const careLabel = opts.careTypeLabel || "senior care";

  const pricingSection = opts.pricingRange
    ? `
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Typical range for ${careLabel}${locationStr ? ` in ${locationStr}` : ""}</p>
      <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">${opts.pricingRange}</p>
      ${opts.pricingDescription ? `<p style="font-size:13px;color:#6b7280;margin:0;line-height:1.5;">${opts.pricingDescription}</p>` : ""}
      <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Actual costs vary based on care level and services needed.</p>
    </div>`
    : "";

  // Pricing section with intro text (only show if pricing exists)
  const pricingWithIntro = opts.pricingRange
    ? `
    <p style="font-size:15px;color:#374151;margin:0 0 12px;line-height:1.5;">
      When it helps, here's what to expect on cost — most families don't pay the full amount:
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Typical range for ${careLabel}${locationStr ? ` in ${locationStr}` : ""}</p>
      <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">${opts.pricingRange}</p>
      ${opts.pricingDescription ? `<p style="font-size:13px;color:#6b7280;margin:0;line-height:1.5;">${opts.pricingDescription}</p>` : ""}
      <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Actual costs vary based on care level and services needed.</p>
    </div>`
    : "";

  // Funding section with intro text (only show if funding options exist)
  const fundingWithIntro = opts.fundingOptions.length > 0
    ? `
    <p style="font-size:14px;color:#374151;margin:16px 0 8px;line-height:1.5;">
      Depending on your situation, these can bring it down a lot:
    </p>
    <div style="margin:20px 0;">
      <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 8px;">Ways to pay for care</p>
      ${opts.fundingOptions.map((f) => `
        <p style="font-size:13px;color:#374151;margin:0 0 4px;line-height:1.5;">
          &bull; <strong>${f.label}</strong>${f.savings ? ` <span style="color:#6b7280;">(saves ${f.savings}/mo)</span>` : ""}
        </p>
      `).join("")}
      <div style="margin:12px 0 0;">${button("Check your eligibility", `${BASE_URL}/benefits/finder`)}</div>
    </div>`
    : "";

  const similarSection = opts.similarProviders.length > 0
    ? `
    <div style="margin:24px 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:14px;font-weight:600;color:#111827;margin:0 0 12px;">Similar providers${locationStr ? ` in ${locationStr}` : ""}</p>
      ${opts.similarProviders.map((p) => `
        <div style="margin:0 0 8px;">
          <a href="${p.viewUrl}" style="font-size:14px;color:${BRAND_COLOR};font-weight:500;text-decoration:none;">${escapeHtml(p.name)}</a>
          ${p.priceRange ? `<span style="font-size:12px;color:#6b7280;margin-left:8px;">${escapeHtml(p.priceRange)}</span>` : ""}
        </div>
      `).join("")}
    </div>`
    : "";

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      ${greeting},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Your request reached <strong>${escapeHtml(opts.providerName)}</strong>. You can reach them directly, right here:
    </p>
    <div style="margin:0 0 24px;">${button("Message provider", opts.magicLinkUrl)}</div>
    <div style="border-top:1px solid #e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      That's the whole idea behind Olera: you're in control. You chose them, you reach out when you're ready, and no one else will be flooding your phone. We never sell your information — it's just you and the people you choose. (A free service, backed by the National Institutes of Health.)
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Looking into senior care is a big, often emotional step. There's no rush — we'll let you know the moment they reply.
    </p>
    ${pricingWithIntro}
    ${fundingWithIntro}
    ${similarSection}
    <p style="font-size:14px;color:#6b7280;margin:24px 0 0;line-height:1.5;">
      Questions, or just want to talk it through? A real person is here — <a href="${BASE_URL}/contact" style="color:#6b7280;text-decoration:underline;">contact us anytime</a>.
    </p>
    <p style="font-size:14px;color:#374151;margin:16px 0 0;line-height:1.5;">
      Warmly,<br>The Olera team
    </p>
  `, "No forms, no flood of calls — just you and the provider you chose.");
}

// ── MedJobs Interview Emails ──────────────────────────────────────

/** Confirmation email sent to provider after scheduling an interview (unauthenticated flow) */
export function interviewRequestEmail(opts: {
  providerName: string;
  studentName: string;
  interviewType: string;
  dateTime: string;
  notes: string | null;
  magicLinkUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your interview request was sent</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${opts.providerName ? escapeHtml(opts.providerName) : "there"}, your interview request to <strong>${escapeHtml(opts.studentName)}</strong> has been delivered. You'll be notified when they respond.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;">Interview Details</p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>Format:</strong> ${escapeHtml(opts.interviewType)}
      </p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>When:</strong> ${escapeHtml(opts.dateTime)}
      </p>
      ${opts.notes ? `<p style="font-size:14px;color:#374151;margin:0;line-height:1.5;"><strong>Notes:</strong> ${escapeHtml(opts.notes)}</p>` : ""}
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Click below to manage your interview and complete your profile on Olera MedJobs.
    </p>
    <div style="margin:24px 0;">${button("View Interview", opts.magicLinkUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      This link expires in 72 hours. Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `Your interview request to ${opts.studentName} was sent`);
}

/** Email sent to recipient when someone proposes an interview */
export function interviewProposedEmail(opts: {
  proposerName: string;
  interviewType: string;
  proposedTime: string;
  alternativeTime?: string | null;
  notes: string | null;
  viewUrl: string;
}): string {
  const safeProposerName = escapeHtml(opts.proposerName);

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">You have an interview request</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      <strong>${safeProposerName}</strong> would like to schedule a ${escapeHtml(opts.interviewType.toLowerCase())} interview with you.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;">Interview Details</p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>Format:</strong> ${escapeHtml(opts.interviewType)}
      </p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>Proposed time:</strong> ${escapeHtml(opts.proposedTime)}
      </p>
      ${opts.alternativeTime ? `<p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;"><strong>Alternative time:</strong> ${escapeHtml(opts.alternativeTime)}</p>` : ""}
      ${opts.notes ? `<p style="font-size:14px;color:#374151;margin:0;line-height:1.5;"><strong>Notes:</strong> ${escapeHtml(opts.notes)}</p>` : ""}
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Review the details and respond to let them know if you're available.
    </p>
    <div style="margin:0 0 24px;">${button("Review Request", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `${opts.proposerName} wants to schedule an interview with you`);
}

/** Email sent to both parties when an interview is confirmed */
export function interviewConfirmedEmail(opts: {
  otherName: string;
  interviewType: string;
  confirmedTime: string;
  durationMinutes: number;
  location: string | null;
  viewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Interview Confirmed!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Your ${escapeHtml(opts.interviewType.toLowerCase())} interview with <strong>${escapeHtml(opts.otherName)}</strong> is confirmed.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;">Interview Details</p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>Format:</strong> ${escapeHtml(opts.interviewType)}
      </p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;line-height:1.5;">
        <strong>When:</strong> ${escapeHtml(opts.confirmedTime)}
      </p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Duration:</strong> ${opts.durationMinutes} minutes
      </p>
      ${opts.location ? `<p style="font-size:14px;color:#374151;margin:8px 0 0;line-height:1.5;"><strong>Where:</strong> ${escapeHtml(opts.location)}</p>` : ""}
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A calendar invite is attached to this email.
    </p>
    <div style="margin:0 0 24px;">${button("View on Olera", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `Your interview with ${opts.otherName} is confirmed`);
}

/** Email sent when an interview is cancelled */
export function interviewCancelledEmail(opts: {
  otherName: string;
  viewUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Interview Cancelled</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      The interview with <strong>${escapeHtml(opts.otherName)}</strong> has been cancelled.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      These things happen — you can schedule new interviews anytime.
    </p>
    <div style="margin:0 0 24px;">${button("View Interviews", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `Your interview with ${opts.otherName} has been cancelled`);
}

/** Email to provider when they request to claim an existing listing */
export function claimVerificationEmail(opts: {
  providerName: string;
  verifyUrl: string;
  providerSlug?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email to manage ${escapeHtml(opts.providerName)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      Click the button below to verify your email and start managing your listing on Olera.
    </p>
    <div style="margin:0 0 24px;">${button("Manage Your Listing", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      This link expires in 72 hours. If you didn't request this, you can safely ignore this email.
    </p>
    ${offRampBlock(opts.providerSlug)}
  `, "Verify your email to manage your listing");
}

/** Email to provider when they create a new organization on Olera */
export function signupVerificationEmail(opts: {
  orgName: string;
  verifyUrl: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email to set up ${escapeHtml(opts.orgName)}</h1>
    ${trustIntro()}
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      You're one step away from setting up your organization on Olera and connecting with families looking for care.
    </p>
    <div style="margin:0 0 24px;">${button("Set Up Your Page", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      This link expires in 72 hours. If you didn't request this, you can safely ignore this email.
    </p>
  `, "Verify your email to set up your organization");
}

// ── Provider weekly analytics digest ────────────────────────────
// Phase 1D of the provider analytics initiative. Tier-aware copy; warm,
// restrained voice. The return path that makes analytics a habit rather
// than a moment.

interface DigestOpts {
  providerName: string;
  providerSlug: string;
  tier: "low" | "medium" | "high";
  viewsThisWeek: number;
  viewsPriorWeek: number;
  deltaPct: number | null;
  localDemand: number | null;
  city: string | null;
  category: string | null;
  ctaClicks: number;
  leadsReceived: number;
  questionsReceived: number;
  topSource: string | null;
  /**
   * When present, the digest leads with this unanswered question + a one-click
   * answer button. Pass alongside `answerUrl`. Set both to switch the email
   * into the demand-led variant; leave both null/omitted for the analytics-only
   * variant (existing behavior, unchanged).
   */
  unansweredQuestion?: { id: string; question: string; totalCount: number } | null;
  /** Pre-built one-click answer URL from generateNotificationUrl(). Required when unansweredQuestion is set. */
  answerUrl?: string | null;
  /** City+state-level page-view count this week (category-agnostic). Powers the
   *  demand-led email's no-views fallback line. Null when unknown. */
  areaDemand?: number | null;
  /**
   * Market Intelligence hook for no-question providers (the analytics-only branch). When set,
   * the email leads with where the provider ranks in their local market and deep-links to the
   * Find Families market view, instead of the bland "Your week on Olera" recap. `flattering`
   * (top-5 or top-quartile) gates the page-vs-push framing: lead with the rank when it's good,
   * lead with curiosity ("see where you rank") when it isn't — the bad number never goes in the
   * subject. Only attached when the city×care-type diagnostic is cached and the rank resolves.
   */
  marketRank?: {
    rank: number;
    outOf: number;
    cityLabel: string;
    careLabel: string;
    flattering: boolean;
  } | null;
  /**
   * Referral Market teaser for the Market Intelligence branch. This keeps the
   * first ask curiosity-led ("see who could send families") instead of
   * homework-led ("work these targets"). Progress is shown only when the
   * provider has already taken market actions.
   */
  referralTeaser?: {
    totalSources: number;
    starterTotal: number;
    workedCount: number;
    respondedCount: number;
    referringCount: number;
    targets: Array<{ name: string; category: string; distanceMiles: number | null }>;
  } | null;
  marketUrl?: string | null;
}


function humanCategoryLabel(category: string | null): string {
  if (!category) return "care";
  const map: Record<string, string> = {
    assisted_living: "assisted living",
    memory_care: "memory care",
    nursing_home: "nursing homes",
    home_care_agency: "home care",
    home_health_care: "home health care",
    independent_living: "independent living",
  };
  return map[category] ?? category.replace(/_/g, " ");
}

function formatAdBoostChannel(channel: string | null | undefined): string {
  if (channel === "google") return "Google";
  if (channel === "meta") return "Meta";
  if (channel === "both") return "Google and Meta";
  return "Google";
}

function formatEmailDate(value: string): string {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date =
    year && month && day
      ? new Date(Date.UTC(year, month - 1, day))
      : new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function digestHeadline(opts: DigestOpts): string {
  const n = opts.viewsThisWeek;
  if (opts.tier === "low") {
    if (opts.localDemand && opts.localDemand > 0) {
      return `${opts.localDemand} ${opts.localDemand === 1 ? "family" : "families"} searched your area this week`;
    }
    if (n > 0) {
      return `${n} ${n === 1 ? "family" : "families"} viewed your page this week`;
    }
    return `Your page on Olera this week`;
  }
  return `${n} ${n === 1 ? "family" : "families"} viewed your page this week`;
}

function digestLead(opts: DigestOpts): string {
  const parts: string[] = [];
  if (opts.deltaPct !== null && Number.isFinite(opts.deltaPct)) {
    if (opts.deltaPct > 0) parts.push(`Up ${opts.deltaPct}% vs. last week.`);
    else if (opts.deltaPct < 0) parts.push(`Down ${Math.abs(opts.deltaPct)}% vs. last week.`);
    else parts.push(`Flat vs. last week.`);
  }
  if (opts.tier === "high" && opts.topSource) {
    parts.push(`Top source: ${escapeHtml(opts.topSource)}.`);
  } else if (opts.tier === "low" && opts.localDemand && opts.localDemand > opts.viewsThisWeek) {
    const cat = humanCategoryLabel(opts.category);
    const where = opts.city ? ` near ${escapeHtml(opts.city)}` : " in your area";
    parts.push(`${opts.localDemand.toLocaleString()} families searched for ${cat}${where}.`);
  }
  return parts.join(" ");
}

const REFERRAL_CATEGORY_LABELS: Record<string, string> = {
  hospital: "Hospital / discharge",
  skilled_nursing: "Skilled nursing / rehab",
  hospice: "Hospice",
  assisted_living: "Assisted living",
  elder_law: "Elder law",
  senior_resource: "Senior resource",
  home_health: "Home health",
  financial: "Financial",
  faith: "Faith community",
};

function referralCategoryLabel(cat: string): string {
  return REFERRAL_CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ");
}

/**
 * Demand-led variant of the weekly digest. Leads with the newest unanswered
 * question + a one-click answer button. Optional page-views line below when
 * the provider has real traffic this week (never deflates -- below the bar,
 * we just don't mention views).
 */
function providerDemandDigestEmail(
  opts: DigestOpts,
  q: { id: string; question: string; totalCount: number },
  answerUrl: string,
): string {
  const analyticsUnsubUrl = `${BASE_URL}/unsubscribe/${opts.providerSlug}?type=analytics_digest`;
  const safeQuestion = escapeHtml(q.question);
  const safeCity = opts.city ? escapeHtml(opts.city) : null;
  const leadStyle = `font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;`;

  // The lead line in priority order. View number never deflates -- below the
  // bar worth mentioning we use the area signal; with neither, the question
  // itself carries the email. AREA_BAR keeps "2 families looked at care in
  // Smalltown" out -- below it, fall to the plain city anchor.
  const AREA_BAR = 5;
  let viewLead: string;
  if (opts.viewsThisWeek > 0) {
    viewLead = `<p style="${leadStyle}">Your page got ${opts.viewsThisWeek.toLocaleString()} ${opts.viewsThisWeek === 1 ? "visit" : "visits"} this week, and a family asked you this:</p>`;
  } else if (opts.areaDemand && opts.areaDemand >= AREA_BAR) {
    const where = safeCity ? ` in ${safeCity}` : "";
    viewLead = `<p style="${leadStyle}">${opts.areaDemand.toLocaleString()} families looked at senior care${where} this week. One of them asked you this:</p>`;
  } else if (safeCity) {
    viewLead = `<p style="${leadStyle}">A family looking at care near ${safeCity} asked you this:</p>`;
  } else {
    viewLead = `<p style="${leadStyle}">A family on Olera asked you this:</p>`;
  }

  const moreCount = q.totalCount - 1;
  const moreCountLine =
    moreCount > 0
      ? `<p style="font-size:13px;color:#9ca3af;margin:0 0 24px;line-height:1.5;">${moreCount} more ${moreCount === 1 ? "question is" : "questions are"} also waiting on your page.</p>`
      : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 12px;line-height:1.3;">A family has a question about ${escapeHtml(opts.providerName)}</h1>
    ${viewLead}
    <div style="background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;">
      <p style="font-size:15px;color:#111827;margin:0;line-height:1.5;font-style:italic;">&ldquo;${safeQuestion}&rdquo;</p>
    </div>
    ${moreCountLine}
    <div>${button("View and respond", answerUrl)}</div>
    <p style="font-size:13px;color:#6b7280;margin:24px 0 0;line-height:1.5;">Answering helps families see your expertise and builds trust with people actively looking for care.</p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;line-height:1.5;">Not the right contact? Please forward this to the appropriate person on your team.</p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">${secondaryLink("Manage your listing", `${BASE_URL}/for-providers/removal-request/${opts.providerSlug}`)} &middot; ${secondaryLink("Stop these weekly digests", analyticsUnsubUrl)}</p>
    </div>
  `, `A family asked about ${opts.providerName} — respond to connect`);
}

/**
 * Provider weekly digest — Monday morning return path.
 *
 * Two variants share this entry point:
 *   1. Demand-led (when `unansweredQuestion` + `answerUrl` are set): leads
 *      with the newest open question and a one-click answer button. This
 *      is the audience-expansion path -- ~2,700 providers with backlog.
 *   2. Analytics-only (default): the original tier-aware analytics digest.
 */
export function providerWeeklyDigestEmail(opts: DigestOpts): string {
  if (opts.unansweredQuestion && opts.answerUrl) {
    return providerDemandDigestEmail(opts, opts.unansweredQuestion, opts.answerUrl);
  }

  const headline = digestHeadline(opts);
  const lead = digestLead(opts);
  const dashboardUrl = `${BASE_URL}/provider`;
  const analyticsUnsubUrl = `${BASE_URL}/unsubscribe/${opts.providerSlug}?type=analytics_digest`;

  // Micro-stats row: only include cells with non-zero values to keep it warm.
  const microStats: string[] = [];
  if (opts.viewsThisWeek > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.viewsThisWeek.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">Page views</div></div>`,
    );
  }
  if (opts.ctaClicks > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.ctaClicks.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">CTA clicks</div></div>`,
    );
  }
  if (opts.questionsReceived > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.questionsReceived.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">Questions</div></div>`,
    );
  }
  if (opts.leadsReceived > 0) {
    microStats.push(
      `<div style="flex:1;min-width:0;"><div style="font-size:22px;font-weight:700;color:#111827;">${opts.leadsReceived.toLocaleString()}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">Leads</div></div>`,
    );
  }

  const microStatsBlock =
    microStats.length > 0 && !opts.referralTeaser
      ? `<div style="display:flex;gap:12px;background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 24px;">${microStats.join("")}</div>`
      : "";

  // Market Intelligence hero (no-question providers with a resolved rank) replaces the bland
  // "Your week on Olera" recap. Lead with the rank when flattering, with curiosity otherwise.
  const m = opts.marketRank;
  const r = opts.referralTeaser;
  const marketArea = m?.cityLabel ? escapeHtml(m.cityLabel) : "your area";
  const marketAreaAdjective = m?.cityLabel ? `${escapeHtml(m.cityLabel)}-area` : "nearby";
  const eyebrowText = m ? `Your growth · ${escapeHtml(m.cityLabel)}` : "Your week on Olera";
  const headlineHtml = m
    ? r
      ? `Families in ${marketArea} ask these places who provides care.`
      : m.flattering
      ? `You're <span style="color:${BRAND_COLOR};">#${m.rank}</span> of ${m.outOf} ${escapeHtml(m.careLabel)} agencies in ${escapeHtml(m.cityLabel)}.`
      : `See where you rank among ${m.outOf} ${escapeHtml(m.careLabel)} agencies in ${escapeHtml(m.cityLabel)}.`
    : headline;
  const leadHtml = m
    ? r
      ? `When someone near ${marketArea} needs home care after a hospital stay, rehab, or a new senior-care need, they often ask a trusted local team which providers to call. We found ${r.totalSources.toLocaleString()} nearby organizations that may shape where those families go next.`
      : m.flattering
      ? `Share of voice — who owns the reviews families read on Google — is the currency of local trust. Here's exactly where you stand, and the fastest ways to climb.`
      : `We mapped your local market: your competitors by share of voice, your best referral sources, and the ZIPs worth your marketing time.`
    : lead;
  const ctaLabel = r ? `See the ${marketArea} map` : m ? "See your growth" : "See your full analytics";
  const ctaUrl = m
    ? (opts.marketUrl || `${BASE_URL}/provider/growth?utm_source=weekly_digest&utm_medium=email&utm_campaign=${r ? "referral_teaser" : "market_rank"}`)
    : dashboardUrl;
  const referralRows = r?.targets.slice(0, 3).map((target) => {
    const distance = target.distanceMiles == null ? "" : ` · ${Number(target.distanceMiles).toFixed(1)} mi`;
    return `
      <tr>
        <td style="padding:12px 0;border-top:1px solid #f3f4f6;">
          <div style="font-size:14px;font-weight:600;color:#111827;line-height:1.35;">${escapeHtml(target.name)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:3px;line-height:1.35;">${escapeHtml(referralCategoryLabel(target.category))}${distance}</div>
        </td>
      </tr>`;
  }).join("") ?? "";
  const hasMarketProgress = !!r && (r.workedCount > 0 || r.respondedCount > 0 || r.referringCount > 0);
  const progressLine = r && hasMarketProgress
    ? r.referringCount > 0
      ? `${r.referringCount} referral ${r.referringCount === 1 ? "source is" : "sources are"} already marked as referring.`
      : r.respondedCount > 0
        ? `${r.respondedCount} referral ${r.respondedCount === 1 ? "source has" : "sources have"} responded so far.`
        : `${r.workedCount} referral ${r.workedCount === 1 ? "source is" : "sources are"} already in motion.`
    : null;
  const referralBlock = r && referralRows
    ? `
    <div style="background:#f9fafb;border-radius:12px;padding:16px;margin:0 0 24px;">
      <div style="font-size:12px;font-weight:700;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.4px;margin:0 0 2px;">First 3 of ${r.totalSources.toLocaleString()} ${marketAreaAdjective} places</div>
      <div style="font-size:13px;color:#9ca3af;margin:0 0 10px;line-height:1.5;">Open the full map when you want the rest.</div>
      <table width="100%" cellpadding="0" cellspacing="0">${referralRows}</table>
    </div>
    ${progressLine ? `<p style="font-size:13px;color:#6b7280;margin:-8px 0 24px;line-height:1.5;">${escapeHtml(progressLine)}</p>` : ""}`
      : "";
  const preheader = r
    ? `Hospitals, rehab centers, and senior resources near ${m?.cityLabel ?? "you"} can shape which care providers families call.`
    : m
      ? `See where ${opts.providerName} stands in ${m.cityLabel}.`
      : headline;
  const trustBlock = r ? referralTeaserTrustBlock() : authorBylineBlock({ topBorder: true });

  return layout(`
    <p style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">${eyebrowText}</p>
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">${headlineHtml}</h1>
    ${leadHtml ? `<p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">${leadHtml}</p>` : ""}
    ${referralBlock}
    ${microStatsBlock}
    <div>${button(ctaLabel, ctaUrl)}</div>
    ${trustBlock}
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    <div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #f3f4f6;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;line-height:1.5;">Not the right contact? Please forward this to the appropriate person on your team.</p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">${secondaryLink("Manage your listing", `${BASE_URL}/for-providers/removal-request/${opts.providerSlug}`)} &middot; ${secondaryLink("Stop these weekly digests", analyticsUnsubUrl)}</p>
    </div>
  `, preheader);
}

// ── Provider Verification Emails ──────────────────────────────────

/** Email sent when provider verification is approved (auto or manual) */
export function verificationApprovedEmail(opts: {
  providerName: string;
  recipientName: string;
  dashboardUrl: string;
  autoApproved?: boolean;
}): string {
  const name = firstName(opts.recipientName, "there");

  // Different messaging for auto vs manual approval
  const greeting = opts.autoApproved
    ? `Great news, ${escapeHtml(name)}! Your connection to <strong>${escapeHtml(opts.providerName)}</strong> has been verified.`
    : `Great news, ${escapeHtml(name)}! Our team has reviewed and verified your connection to <strong>${escapeHtml(opts.providerName)}</strong>.`;

  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);border-radius:50%;">
          <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">✓</td></tr>
        </table>
      </td></tr>
    </table>
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">You're all set!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
      ${greeting}
    </p>
    <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="font-size:14px;color:#166534;margin:0 0 12px;font-weight:600;">Here's what you can do now:</p>
      <ul style="font-size:14px;color:#166534;margin:0;padding-left:20px;line-height:1.8;">
        <li>Respond to family inquiries and answer questions</li>
        <li>Customize your listing with photos and business details</li>
        <li>Reach out to families looking for care</li>
        <li>Hire caregivers</li>
      </ul>
    </div>
    <div style="text-align:center;margin:0 0 24px;">${button("Go to Your Dashboard", opts.dashboardUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">
      We're excited to have you on Olera! Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">We're here to help</a>
    </p>
  `, "You're verified — your dashboard is ready");
}

/** Email sent when verification is submitted and routed to manual review */
export function verificationPendingReviewEmail(opts: {
  providerName: string;
  recipientName: string;
  dashboardUrl: string;
}): string {
  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#fef3c7;border-radius:50%;">
          <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">👀</td></tr>
        </table>
      </td></tr>
    </table>
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">We're reviewing your verification</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
      ${escapeHtml(firstName(opts.recipientName, "Hi"))}, thanks for submitting your verification for <strong>${escapeHtml(opts.providerName)}</strong>.
    </p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#92400e;margin:0;line-height:1.5;">
        <strong>What happens next:</strong> Our team will review your submission and get back to you within 3 hours during business hours (Mon–Fri, 9am–6pm ET).
      </p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      In the meantime, you can still access your dashboard — some features may be limited until verification is complete.
    </p>
    <div style="text-align:center;margin:0 0 24px;">${button("View Dashboard", opts.dashboardUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "We're reviewing your verification — usually within 3 hours");
}

/** Email sent 7 days after claim if provider hasn't verified */
export function verificationReminder7DayEmail(opts: {
  providerName: string;
  recipientName: string;
  verifyUrl: string;
  providerSlug?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are looking for ${escapeHtml(opts.providerName)}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.recipientName, "there"))}, you claimed ${escapeHtml(opts.providerName)} on Olera a week ago but haven't completed verification yet.
    </p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="font-size:14px;color:#92400e;margin:0;line-height:1.5;">
        <strong>Why verify?</strong> Verified providers can respond to family inquiries, update their listing, and access full analytics.
      </p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Verification takes less than 2 minutes — just provide your LinkedIn profile or business website.
    </p>
    <div style="text-align:center;margin:0 0 24px;">${button("Complete Verification", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;text-align:center;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `, "Complete verification to connect with families");
}

/** Email sent 21 days after claim if provider still hasn't verified (final warning) */
export function verificationReminder21DayEmail(opts: {
  providerName: string;
  recipientName: string;
  verifyUrl: string;
  providerSlug?: string;
}): string {
  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Final reminder: Verify ${escapeHtml(opts.providerName)}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.recipientName, "there"))}, this is a final reminder to complete verification for ${escapeHtml(opts.providerName)}.
    </p>
    <div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#991b1b;margin:0;line-height:1.5;">
        <strong>Action required:</strong> Unverified claims may be released after 30 days so others can claim the listing.
      </p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Complete verification now to keep your claim and unlock full access to your provider dashboard.
    </p>
    <div style="text-align:center;margin:0 0 24px;">${button("Verify Now", opts.verifyUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;text-align:center;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `, "Final reminder — verify before your claim expires");
}

/** Email sent when verification is rejected with reason (admin rejection) */
export function verificationRejectedEmail(opts: {
  providerName: string;
  recipientName: string;
  reason: string;
  resubmitUrl: string;
}): string {
  const name = firstName(opts.recipientName, "there");

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Let's get you verified</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(name)}, we reviewed your verification for <strong>${escapeHtml(opts.providerName)}</strong> but need a bit more information to confirm your connection.
    </p>
    <div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#92400e;margin:0 0 4px;font-weight:600;">What we found:</p>
      <p style="font-size:14px;color:#78350f;margin:0;line-height:1.5;">${escapeHtml(opts.reason)}</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.5;">
      Don't worry — there are several ways to verify. Here's what works best:
    </p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li><strong style="color:#111827;">Work email</strong> — Use an email with your company's domain (e.g., you@company.com)</li>
      <li><strong style="color:#111827;">LinkedIn</strong> — Make sure your profile shows this organization as your current employer</li>
      <li><strong style="color:#111827;">Business website</strong> — Link to a page that lists you as staff (About Us, Team page)</li>
      <li><strong style="color:#111827;">Document</strong> — Upload a business license, ID badge, or official letterhead</li>
    </ul>
    <div style="margin:0 0 24px;">${button("Try Again", opts.resubmitUrl)}</div>
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Need help?</strong> Our team is happy to assist — <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">contact us here</a> and we'll sort this out together.
      </p>
    </div>
  `, "Let's try another way to verify your connection");
}

/**
 * Email sent when a self-verification attempt fails.
 * Method-specific messaging with warm, encouraging tone.
 * Lists other verification methods they can try.
 */
export function verificationMethodFailedEmail(opts: {
  providerName: string;
  recipientName: string;
  method: "email" | "linkedin" | "website" | "document";
  reason: string;
  attemptNumber: number;
  verifyUrl: string;
}): string {
  const name = firstName(opts.recipientName, "there");

  // Method-specific explanations and what they can try
  const methodInfo: Record<string, { label: string; explanation: string; tip: string }> = {
    email: {
      label: "work email",
      explanation: "We couldn't match your email domain to the business on file.",
      tip: "Use an email address with a domain that matches the business (e.g., name@yourbusiness.com).",
    },
    linkedin: {
      label: "LinkedIn profile",
      explanation: "We couldn't confirm your current employment from your LinkedIn profile.",
      tip: "Make sure your LinkedIn shows this organization as your current employer in your Experience section.",
    },
    website: {
      label: "business website",
      explanation: "We couldn't find your name listed on the website you provided.",
      tip: "Link to a page that shows your name as staff (About Us, Team page, or staff directory).",
    },
    document: {
      label: "uploaded document",
      explanation: "We couldn't verify your connection from the document provided.",
      tip: "Upload a clear photo of your business license, ID badge, or official letterhead showing your name.",
    },
  };

  const current = methodInfo[opts.method];
  const otherMethods = Object.entries(methodInfo)
    .filter(([key]) => key !== opts.method)
    .map(([, info]) => info);

  // Progressive warmth based on attempt number
  let greeting: string;
  let encouragement: string;

  if (opts.attemptNumber === 1) {
    greeting = `Hi ${escapeHtml(name)}, thank you for starting the verification process for <strong>${escapeHtml(opts.providerName)}</strong>.`;
    encouragement = "Don't worry — there are several ways to verify, and we're here to help you through it.";
  } else if (opts.attemptNumber === 2) {
    greeting = `Hi ${escapeHtml(name)}, we appreciate you trying again to verify your connection to <strong>${escapeHtml(opts.providerName)}</strong>.`;
    encouragement = "We know this can be frustrating, but you're almost there. Let's try a different approach.";
  } else if (opts.attemptNumber === 3) {
    greeting = `Hi ${escapeHtml(name)}, thank you for your patience in verifying <strong>${escapeHtml(opts.providerName)}</strong>.`;
    encouragement = "We really want to get you verified. Here's one more option that might work better for your situation.";
  } else {
    greeting = `Hi ${escapeHtml(name)}, we can see you've been working hard to verify <strong>${escapeHtml(opts.providerName)}</strong>.`;
    encouragement = "We're committed to helping you get verified. Please reach out to our support team and we'll sort this out together.";
  }

  // Build alternative methods section
  const alternativesHtml = otherMethods.map((m) => `
    <li style="margin:0 0 12px;padding:0;">
      <strong style="color:#111827;">${m.label.charAt(0).toUpperCase() + m.label.slice(1)}</strong>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;line-height:1.4;">${m.tip}</p>
    </li>
  `).join("");

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Let's try another way</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      ${greeting}
    </p>
    <div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
      <p style="font-size:14px;color:#92400e;margin:0 0 4px;font-weight:600;">What happened with your ${current.label}:</p>
      <p style="font-size:14px;color:#78350f;margin:0;line-height:1.5;">${current.explanation}</p>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      <strong style="color:#111827;">Tip:</strong> ${current.tip}
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.5;">
      ${encouragement}
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 8px;font-weight:600;">Other ways to verify:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 24px;padding-left:20px;line-height:1.6;">
      ${alternativesHtml}
    </ul>
    <div style="margin:0 0 24px;">${button("Try Another Method", opts.verifyUrl)}</div>
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        <strong>Need help?</strong> Our team is happy to assist — <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">contact us here</a> and we'll get you sorted.
      </p>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Once verified, you'll have full access to respond to family inquiries and manage your listing.
    </p>
  `, `We couldn't verify via ${current.label} — here are other options`);
}

/**
 * Nudge email sent by admin to remind a provider about an unanswered lead.
 * Similar to connectionRequestEmail but framed as a reminder.
 */
export function providerNudgeEmail(opts: {
  providerName: string;
  familyName: string;
  messagePreview: string | null;
  daysSinceInquiry: number;
  viewUrl: string;
  providerSlug?: string;
}): string {
  const daysText =
    opts.daysSinceInquiry === 1
      ? "1 day"
      : opts.daysSinceInquiry < 1
        ? "less than a day"
        : `${opts.daysSinceInquiry} days`;

  const messageBlock = opts.messagePreview
    ? `<div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.messagePreview)}"</p>
      </div>`
    : "";

  return layout(
    `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">A family is waiting to hear from you</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      <strong>${escapeHtml(firstName(opts.familyName))}</strong> reached out to ${escapeHtml(opts.providerName)} ${daysText} ago and hasn't received a response yet.
    </p>
    ${messageBlock}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A timely response makes all the difference for families navigating care decisions. Even a brief acknowledgment helps families feel supported.
    </p>
    <div style="margin:0 0 24px;">${button("View & Respond", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `,
    `${firstName(opts.familyName)} is waiting for a response from ${opts.providerName}`
  );
}

/**
 * Manual nudge email for "Needs Follow-up" providers
 *
 * Hybrid approach: Platform claiming benefits + urgency from waiting families.
 * Sent by admin for providers in "Needs Follow-up" status who have gone through
 * the full automated sequence (Day 0, 1, 3, 5) with no response after 10+ days.
 *
 * Rationale: If 4+ family-specific nudges failed, problem isn't awareness of leads—
 * it's lack of platform engagement. This nudge emphasizes claiming benefits while
 * mentioning waiting families for urgency.
 */
export function providerManualNudgeEmail(opts: {
  providerName: string;
  familyName: string;
  city: string | null;
  leadCount: number; // Total pending leads for this provider
  viewUrl: string; // HMAC-signed magic link with one-click access
  providerSlug?: string;
}): string {
  // Extract first name with fallback for placeholder names (matches existing pattern)
  const safeFamilyName = firstName(opts.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!opts.city;
  const leadCount = opts.leadCount || 1; // Fallback to 1 if not provided

  // Build family mention with proper fallbacks (singular vs plural)
  let familyMention: string;
  if (leadCount === 1) {
    // Single lead
    familyMention = hasName
      ? `<strong>${escapeHtml(safeFamilyName)}</strong> reached out recently looking for care`
      : "A family reached out recently looking for care";
  } else if (leadCount === 2) {
    // Two leads
    familyMention = hasName
      ? `<strong>${escapeHtml(safeFamilyName)} and 1 other family</strong> reached out recently`
      : "2 families reached out recently";
  } else {
    // Multiple leads (3+)
    familyMention = hasName
      ? `<strong>${escapeHtml(safeFamilyName)} and ${leadCount - 1} other families</strong> reached out recently`
      : `${leadCount} families reached out recently`;
  }

  // City mention in body ("in San Diego" or just "")
  const cityText = hasCity ? ` in ${escapeHtml(opts.city!)}` : "";

  // Reminder for CTA line (singular vs plural)
  const ctaReminder = leadCount === 1
    ? (hasName ? `where ${escapeHtml(safeFamilyName)} is waiting` : "where they're waiting")
    : `where ${hasName ? escapeHtml(safeFamilyName) + " and the others are" : "they're"} waiting`;

  // Button text
  const buttonText = "Claim your free account & respond →";

  // Preheader
  const preheader = "One click to get in. No password, no sign-up.";

  // Subject line (dynamic based on lead count)
  const subject = leadCount === 1
    ? (hasName ? `Quick check-in about ${safeFamilyName}` : "Quick check-in: a family is waiting")
    : "Quick check-in: your Olera page + families waiting";

  return layout(
    `
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(opts.providerName)},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      We know you're busy, so we'll get right to it. ${familyMention}${cityText} — and ${leadCount === 1 ? "they're" : "they're all"} still waiting to hear back. But here's the thing: your team already has a page on Olera, and it's ready for you to claim whenever you are.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      Here's what's worth knowing: families come to Olera, search their area, and reach out to providers like you directly — no middleman, no agencies in between. And leads are only one piece of it. Once you claim it, you manage everything yourself, right from your account:
    </p>
    <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:15px;line-height:1.8;">
      <li style="margin:0 0 8px;padding:0;"><strong>See families${cityText} looking for care right now</strong> (including the ${leadCount === 1 ? "one" : "ones"} waiting for you)</li>
      <li style="margin:0 0 8px;padding:0;">Message them directly and answer their questions</li>
      <li style="margin:0 0 8px;padding:0;">Keep your profile and details up to date so you show up the way you want</li>
      <li style="margin:0 0 8px;padding:0;">Rank higher${cityText} so more families find you first</li>
      <li style="margin:0 0 8px;padding:0;">Collect reviews from the families you've helped</li>
      <li style="margin:0 0 8px;padding:0;">Hire staff for your team</li>
    </ul>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      It takes one click to get in — no password, no sign-up, nothing to log into. The button below drops you right into your account ${ctaReminder}.
    </p>
    <div style="margin:0 0 32px;">${button(buttonText, opts.viewUrl)}</div>
    ${loganHeavySignature()}
    ${offRampBlock(opts.providerSlug)}
  `,
    preheader
  );
}

/**
 * Consolidated nudge email for providers with multiple waiting leads.
 * Lists all families waiting for a response in a single email.
 */
export function providerMultiLeadNudgeEmail(opts: {
  providerName: string;
  leads: Array<{
    familyName: string;
    daysSinceInquiry: number;
  }>;
  viewUrl: string;
  providerSlug?: string;
}): string {
  const leadCount = opts.leads.length;
  const headline =
    leadCount === 1
      ? "A family is waiting to hear from you"
      : `${leadCount} families are waiting to hear from you`;

  const leadsHtml = opts.leads
    .map((lead) => {
      const daysText =
        lead.daysSinceInquiry === 1
          ? "1 day ago"
          : lead.daysSinceInquiry < 1
            ? "today"
            : `${lead.daysSinceInquiry} days ago`;
      return `<li style="margin:0 0 8px;padding:0;"><strong>${escapeHtml(firstName(lead.familyName))}</strong> <span style="color:#9ca3af;">· reached out ${daysText}</span></li>`;
    })
    .join("");

  return layout(
    `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${headline}</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      The following ${leadCount === 1 ? "family has" : "families have"} reached out to ${escapeHtml(opts.providerName)} and ${leadCount === 1 ? "hasn't" : "haven't"} received a response yet:
    </p>
    <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
      ${leadsHtml}
    </ul>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A timely response makes all the difference for families navigating care decisions. Even a brief acknowledgment helps families feel supported.
    </p>
    <div style="margin:0 0 24px;">${button("View & Respond", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `,
    `${leadCount} ${leadCount === 1 ? "family is" : "families are"} waiting for a response from ${opts.providerName}`
  );
}

// ── Provider Lead Follow-up Sequence Emails ──────────────────────────────

/**
 * Shared interface for follow-up email options.
 * Supports consolidated emails for multiple leads per provider.
 */
interface FollowupEmailOpts {
  providerName: string;
  leads: Array<{
    familyName: string;
    daysSinceInquiry: number;
    careType?: string | null;
    city?: string | null;
    careRecipient?: string | null;
  }>;
  viewUrl: string;
  providerSlug?: string;
  /** Magic link URL to provider dashboard (enables one-click access) */
  manageListingUrl?: string;
  /** Magic link URL to provider settings/lead preferences */
  settingsUrl?: string;
}

/**
 * Helper to build the appropriate footer for follow-up emails.
 * Uses magic link footer if URLs provided, otherwise legacy footer.
 */
function followupFooterBlock(opts: FollowupEmailOpts): string {
  return opts.manageListingUrl && opts.settingsUrl
    ? providerOffRampBlock(opts.manageListingUrl, opts.settingsUrl)
    : offRampBlock(opts.providerSlug);
}

/**
 * Helper to determine pronouns from care recipient.
 * "her mother" → { pronoun: "she", possessive: "her", object: "her" }
 * "his father" → { pronoun: "he", possessive: "his", object: "him" }
 * Default: they/their/them
 */
function getPronounsFromCareRecipient(careRecipient?: string | null): {
  pronoun: string;       // Subject: "She/He/They"
  pronounLower: string;  // Subject lowercase: "she/he/they"
  possessive: string;    // Possessive: "her/his/their"
  object: string;        // Object: "her/him/them"
} {
  if (!careRecipient) {
    return { pronoun: "They", pronounLower: "they", possessive: "their", object: "them" };
  }

  const lower = careRecipient.toLowerCase();
  const femaleKeywords = ["mother", "mom", "grandmother", "wife", "sister", "aunt", "daughter"];
  const maleKeywords = ["father", "dad", "grandfather", "husband", "brother", "uncle", "son"];

  if (femaleKeywords.some(kw => lower.includes(kw))) {
    return { pronoun: "She", pronounLower: "she", possessive: "her", object: "her" };
  }
  if (maleKeywords.some(kw => lower.includes(kw))) {
    return { pronoun: "He", pronounLower: "he", possessive: "his", object: "him" };
  }

  return { pronoun: "They", pronounLower: "they", possessive: "their", object: "them" };
}

/**
 * Light signature block for follow-up emails (Days 1, 3, 7, 11).
 * Simple sign-off without photo or detailed credentials.
 */
function loganLightSignature(): string {
  return `
    <div style="margin:24px 0 0;">
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">
        — Dr. Logan DuBose<br/>
        <span style="color:#6b7280;">CRO, Olera · Researcher funded by NIH SBIR Program</span>
      </p>
    </div>`;
}

/**
 * Heavy signature block for Day 5 follow-up email.
 * Shorter intro (reminder about free matching) + photo and credentials.
 */
function loganHeavySignature(): string {
  const photoUrl = "https://olera.care/images/for-providers/team/logan.jpg";
  return `
    <div style="margin:24px 0 0;">
      <p style="font-size:14px;color:#374151;margin:0 0 16px;line-height:1.6;">
        Quick reminder: Olera is free for providers. We do NOT charge for matching — this is NOT a fee-for-lead directory. You can connect with families on Olera for free.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:0;">
        <tr>
          <td style="vertical-align:top;padding-right:12px;">
            <img src="${photoUrl}" alt="Dr. Logan DuBose" width="48" height="48" style="border-radius:50%;display:block;" />
          </td>
          <td style="vertical-align:middle;font-size:13px;line-height:1.4;color:#374151;">
            <p style="margin:0;font-weight:600;color:#111827;">— Dr. Logan DuBose</p>
            <p style="margin:2px 0 0;color:#6b7280;">CRO, Olera · Researcher funded by NIH Small Business Innovation Research (SBIR) Program</p>
          </td>
        </tr>
      </table>
    </div>`;
}

/**
 * Day 1 Follow-up: "In case it got buried"
 * Light signature. Sent 1 day after initial email.
 */
/**
 * Day 1 Follow-up: Scenario A - Provider has NOT viewed the lead yet
 * Subject: "[Name] picked your team"
 * Gentle reminder that the request is waiting.
 */
export function providerFollowupDay1NotViewedEmail(opts: FollowupEmailOpts): string {
  const lead = opts.leads[0];
  const leadCount = opts.leads.length;
  const isMultiple = leadCount > 1;

  // Extract first name, fallback for placeholder names
  const safeFamilyName = firstName(lead.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!lead.city;
  const hasCareType = !!lead.careType;

  const pronouns = getPronounsFromCareRecipient(lead.careRecipient);

  // Build pronoun contractions ("She's", "He's", "They're" - NOT "They's")
  const pronounContraction = pronouns.pronoun === "They"
    ? "They're"
    : `${pronouns.pronoun}'s`;

  const pronounContractionLower = pronouns.pronounLower === "they"
    ? "they're"
    : `${pronouns.pronounLower}'s`;

  // Build preheader - factual, informative (same pattern as existing)
  let preheader: string;
  if (isMultiple) {
    preheader = `${leadCount} families are looking for care.`;
  } else if (hasCareType && lead.careRecipient && hasCity) {
    preheader = `${pronounContraction} looking for ${lead.careType!.toLowerCase()} for ${lead.careRecipient} in ${lead.city}.`;
  } else if (hasCareType && hasCity) {
    preheader = `${pronounContraction} looking for ${lead.careType!.toLowerCase()} in ${lead.city}.`;
  } else if (hasCareType) {
    preheader = `${pronounContraction} looking for ${lead.careType!.toLowerCase()}.`;
  } else {
    preheader = `${pronounContraction} looking for care in your area.`;
  }

  // Build greeting
  const greeting = `Hi ${escapeHtml(opts.providerName || "there")},`;

  // Build body
  let bodyHtml: string;
  if (isMultiple) {
    // Multiple leads
    const leadsListHtml = opts.leads.map((l) => {
      const name = firstName(l.familyName, "A family");
      const careInfo = l.careType ? escapeHtml(l.careType.toLowerCase()) : "care";
      const cityInfo = l.city ? ` in ${escapeHtml(l.city)}` : "";
      return `<li style="margin:0 0 8px;padding:0;"><strong>${escapeHtml(name)}</strong> — ${careInfo}${cityInfo}</li>`;
    }).join("");

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        ${leadCount} families reached out in the past day looking for care, and out of every option nearby, they chose your team. Their requests are waiting for you.
      </p>
      <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
        ${leadsListHtml}
      </ul>`;
  } else {
    // Single lead - new copy
    const familyRef = hasName ? safeFamilyName : "A family";
    const careTypeRef = hasCareType ? escapeHtml(lead.careType!.toLowerCase()) : "care";
    const recipientRef = lead.careRecipient ? ` for ${escapeHtml(lead.careRecipient)}` : "";
    const cityRef = hasCity ? ` in ${escapeHtml(lead.city!)}` : "";

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        ${escapeHtml(familyRef)} reached out yesterday — ${pronounContractionLower} looking for ${careTypeRef}${recipientRef}${cityRef}, and out of every option nearby, ${pronouns.pronounLower} chose you. ${pronouns.possessive.charAt(0).toUpperCase() + pronouns.possessive.slice(1)} request is waiting for you.
      </p>`;
  }

  // Build button text
  const buttonText = isMultiple
    ? "See all requests →"
    : (hasName ? `See ${escapeHtml(safeFamilyName)}'s request →` : "See the request →");

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
    ${bodyHtml}
    <div style="margin:0 0 24px;">${button(buttonText, opts.viewUrl)}</div>
    ${loganLightSignature()}
    ${followupFooterBlock(opts)}
  `, preheader);
}

/**
 * Day 1 Follow-up: Scenario B - Provider HAS viewed the lead
 * Subject: "Still deciding on [Name]?"
 * Pushes for binary decision: MESSAGE or DECLINE.
 *
 * Note: viewedCount can be passed via metadata to adjust copy for partial viewing.
 * If not provided, assumes all leads were viewed.
 */
export function providerFollowupDay1ViewedEmail(
  opts: FollowupEmailOpts & { viewedCount?: number }
): string {
  const lead = opts.leads[0];
  const leadCount = opts.leads.length;
  const isMultiple = leadCount > 1;
  const viewedCount = opts.viewedCount ?? leadCount; // Default: assume all viewed

  // Extract first name, fallback for placeholder names
  const safeFamilyName = firstName(lead.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!lead.city;
  const hasCareType = !!lead.careType;

  const pronouns = getPronounsFromCareRecipient(lead.careRecipient);

  // Build pronoun contraction for body text ("she's", "he's", "they're" - NOT "they's")
  const pronounContractionLower = pronouns.pronounLower === "they"
    ? "they're"
    : `${pronouns.pronounLower}'s`;

  // Build preheader - action-oriented, decision push
  const preheader = isMultiple
    ? "Message them, or decline — either one takes a second."
    : `Message ${pronouns.object}, or decline — either one takes a second.`;

  // Build greeting
  const greeting = `Hi ${escapeHtml(opts.providerName || "there")},`;

  // Build body
  let bodyHtml: string;
  if (isMultiple) {
    // Multiple leads - viewed scenario
    const leadsListHtml = opts.leads.map((l) => {
      const name = firstName(l.familyName, "A family");
      const careInfo = l.careType ? escapeHtml(l.careType.toLowerCase()) : "care";
      const cityInfo = l.city ? ` in ${escapeHtml(l.city)}` : "";
      return `<li style="margin:0 0 8px;padding:0;"><strong>${escapeHtml(name)}</strong> — ${careInfo}${cityInfo}</li>`;
    }).join("");

    // Adjust copy based on how many were actually viewed
    const openedText = viewedCount === leadCount
      ? "You opened these requests earlier"
      : viewedCount === 1
        ? "You opened one of these requests earlier"
        : `You opened ${viewedCount} of these requests earlier`;

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        ${openedText} — ${leadCount} families are looking for care. From here it's one of two clicks:
      </p>
      <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
        ${leadsListHtml}
      </ul>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Message them if they're a good fit. And if they're not, a quick decline lets them know to keep looking — so they're not left waiting and wondering.
      </p>`;
  } else {
    // Single lead - viewed scenario with decision push
    const familyRef = hasName ? safeFamilyName : "the family";
    const careTypeRef = hasCareType ? escapeHtml(lead.careType!.toLowerCase()) : "care";
    const recipientRef = lead.careRecipient ? ` for ${escapeHtml(lead.careRecipient)}` : "";
    const cityRef = hasCity ? ` in ${escapeHtml(lead.city!)}` : "";

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        You opened ${escapeHtml(familyRef)}'s request earlier — ${pronounContractionLower} looking for ${careTypeRef}${recipientRef}${cityRef}. From here it's one of two clicks:
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Message ${pronouns.object} if ${pronounContractionLower} a good fit. And if ${pronounContractionLower} not, a quick decline lets ${pronouns.object} know to keep looking — so ${pronounContractionLower} not left waiting and wondering.
      </p>`;
  }

  // Build buttons - both route to same URL, different labels
  const messageButtonText = isMultiple
    ? "Message families →"
    : (hasName ? `Message ${escapeHtml(safeFamilyName)} →` : "Message the family →");

  const declineButtonText = isMultiple
    ? "Decline leads →"
    : "Decline lead →";

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
    ${bodyHtml}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding-right:12px;">${button(messageButtonText, opts.viewUrl)}</td>
        <td>${button(declineButtonText, opts.viewUrl)}</td>
      </tr>
    </table>
    ${loganLightSignature()}
    ${followupFooterBlock(opts)}
  `, preheader);
}

/** @deprecated Use providerFollowupDay1NotViewedEmail or providerFollowupDay1ViewedEmail instead */
export function providerFollowupDay1Email(opts: FollowupEmailOpts): string {
  // Default to not-viewed variant for backward compatibility
  return providerFollowupDay1NotViewedEmail(opts);
}

/**
 * Day 3 Follow-up: "Still waiting, replying is effortless"
 * Light signature. Sent 3 days after initial email.
 */
export function providerFollowupDay3Email(opts: FollowupEmailOpts): string {
  const lead = opts.leads[0];
  const leadCount = opts.leads.length;
  const isMultiple = leadCount > 1;

  const safeFamilyName = firstName(lead.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!lead.city;
  const hasCareType = !!lead.careType;

  const pronouns = getPronounsFromCareRecipient(lead.careRecipient);

  // Build pronoun contraction ("She's", "He's", "They're" - NOT "They's")
  const pronounContraction = pronouns.pronoun === "They"
    ? "They're"
    : `${pronouns.pronoun}'s`;

  // Build preheader
  const preheader = "A quick reply is all it takes.";

  // Build greeting - use full provider name (not firstName) since most are businesses
  const greeting = `Hi ${escapeHtml(opts.providerName || "there")},`;

  let bodyHtml: string;
  if (isMultiple) {
    const leadsListHtml = opts.leads.map((l) => {
      const name = firstName(l.familyName, "A family");
      const daysText = l.daysSinceInquiry === 1 ? "1 day ago" : `${l.daysSinceInquiry} days ago`;
      return `<li style="margin:0 0 8px;padding:0;"><strong>${escapeHtml(name)}</strong> <span style="color:#9ca3af;">· reached out ${daysText}</span></li>`;
    }).join("");

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        A few days ago, these families reached out looking for care. They haven't heard back yet:
      </p>
      <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
        ${leadsListHtml}
      </ul>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Getting in touch is quick — open their requests and you can message them directly from your dashboard in under a minute. No forms, no fees. They're real families hoping someone gets back to them.
      </p>`;
  } else {
    // Single lead - new copy
    const familyRef = hasName ? safeFamilyName : "A family";
    const careTypeRef = hasCareType ? escapeHtml(lead.careType!.toLowerCase()) : "care";
    const recipientRef = lead.careRecipient ? ` for ${escapeHtml(lead.careRecipient)}` : "";
    const cityRef = hasCity ? ` in ${escapeHtml(lead.city!)}` : "";

    // Line 2: Simple, consistent copy for everyone (no complex detection needed)
    const familyRefLower = hasName ? escapeHtml(familyRef) : escapeHtml(familyRef.toLowerCase());
    const line2 = `That's really all this is — ${familyRefLower} trying to find the right care, hoping the people ${pronouns.pronounLower} contacted will get back to ${pronouns.object}. No middleman, no fee, just ${pronouns.object} and you.`;

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        A few days ago, ${escapeHtml(familyRef)} reached out about ${careTypeRef}${recipientRef}${cityRef}, and out of everyone nearby, ${pronouns.pronounLower} chose you.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
        ${line2}
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Whenever you have a moment: if it feels like a fit, send ${pronouns.object} a message. And if it's not, a quick decline lets ${pronouns.object} know, so ${pronouns.pronounLower} can keep looking without wondering. Either one is a real help to ${pronouns.object}.
      </p>`;
  }

  // Build buttons - both route to same URL (auto-login magic link)
  const messageButtonText = isMultiple
    ? "Message families →"
    : (hasName ? `Message ${escapeHtml(safeFamilyName)} →` : "Message the family →");

  const declineButtonText = isMultiple
    ? "Decline leads →"
    : "Decline lead →";

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
    ${bodyHtml}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding-right:12px;">${button(messageButtonText, opts.viewUrl)}</td>
        <td>${button(declineButtonText, opts.viewUrl)}</td>
      </tr>
    </table>
    ${loganLightSignature()}
    ${followupFooterBlock(opts)}
  `, preheader);
}

/**
 * Day 5 Follow-up (formerly Day 6): "One last note" - Final outreach
 * HEAVY signature with photo. Last chance before sequence ends.
 */
export function providerFollowupDay6Email(opts: FollowupEmailOpts): string {
  const lead = opts.leads[0];
  const leadCount = opts.leads.length;
  const isMultiple = leadCount > 1;

  const safeFamilyName = firstName(lead.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!lead.city;
  const hasCareType = !!lead.careType;

  const pronouns = getPronounsFromCareRecipient(lead.careRecipient);

  // Build pronoun contraction ("she's", "he's", "they're" - NOT "they's")
  const pronounContractionLower = pronouns.pronounLower === "they"
    ? "they're"
    : `${pronouns.pronounLower}'s`;

  // Build preheader - dynamic pronoun
  const preheader = `Message ${pronouns.object} if it's a fit, or decline if it's not.`;

  // Build greeting
  const greeting = `Hi ${escapeHtml(opts.providerName || "there")},`;

  // Reference for family name (used multiple times)
  const familyRef = hasName ? safeFamilyName : "the family";

  let bodyHtml: string;
  if (isMultiple) {
    // Multiple leads - keep simpler copy
    const leadsListHtml = opts.leads.map((l) => {
      const name = firstName(l.familyName, "A family");
      const careInfo = l.careType ? escapeHtml(l.careType.toLowerCase()) : "care";
      const cityInfo = l.city ? ` in ${escapeHtml(l.city)}` : "";
      return `<li style="margin:0 0 8px;padding:0;"><strong>${escapeHtml(name)}</strong> — ${careInfo}${cityInfo}</li>`;
    }).join("");

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        We'll keep this short — it's the last time we'll reach out about these requests.
      </p>
      <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
        ${leadsListHtml}
      </ul>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
        They reached out about a week ago and haven't heard back yet. If you've been meaning to get to it, there's still time. A quick message from you could be just what they're hoping for.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
        And if it's not a fit, no problem at all. Just decline the leads and let us know why — we'll share that with them so they can keep looking.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Either way, thanks for taking a look.
      </p>`;
  } else {
    // Single lead - new copy
    const careTypeRef = hasCareType ? escapeHtml(lead.careType!.toLowerCase()) : "care";
    const recipientRef = lead.careRecipient ? ` for ${escapeHtml(lead.careRecipient)}` : "";
    const cityRef = hasCity ? ` in ${escapeHtml(lead.city!)}` : "";

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        We'll keep this short — it's the last time we'll reach out about ${escapeHtml(familyRef)}.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
        ${pronouns.pronoun} reached out about a week ago, looking for ${careTypeRef}${recipientRef}${cityRef}, and hasn't heard back yet. If you've been meaning to get to it, there's still time. A quick message from you could be just what ${pronounContractionLower} hoping for.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
        And if it's not a fit, no problem at all. Just decline the lead and let us know why — we'll share that with ${escapeHtml(familyRef)} so ${pronouns.pronounLower} can keep looking.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Either way, thanks for taking a look.
      </p>`;
  }

  // Build buttons - both route to same URL (auto-login magic link)
  const messageButtonText = isMultiple
    ? "Message families →"
    : (hasName ? `Message ${escapeHtml(safeFamilyName)} →` : "Message the family →");

  const declineButtonText = isMultiple
    ? "Decline leads →"
    : "Decline lead →";

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
    ${bodyHtml}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding-right:12px;">${button(messageButtonText, opts.viewUrl)}</td>
        <td>${button(declineButtonText, opts.viewUrl)}</td>
      </tr>
    </table>
    ${loganHeavySignature()}
    ${followupFooterBlock(opts)}
  `, preheader);
}

/**
 * Day 10 Follow-up: "Graceful last call, relationship not threat"
 * Light signature. Final outreach before marking as stuck.
 */
export function providerFollowupDay10Email(opts: FollowupEmailOpts): string {
  const lead = opts.leads[0];
  const leadCount = opts.leads.length;
  const isMultiple = leadCount > 1;

  const safeFamilyName = firstName(lead.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!lead.city;
  const hasCareType = !!lead.careType;

  const pronouns = getPronounsFromCareRecipient(lead.careRecipient);

  // Build preheader
  const preheader = "And we'll keep bringing you families looking for your care.";

  // Build greeting - use full provider name (not firstName) since most are businesses
  const greeting = `Hi ${escapeHtml(opts.providerName || "there")},`;

  let bodyHtml: string;
  if (isMultiple) {
    const leadsListHtml = opts.leads.map((l) => {
      const name = firstName(l.familyName, "A family");
      return `<li style="margin:0 0 8px;padding:0;"><strong>${escapeHtml(name)}</strong></li>`;
    }).join("");

    // Pick city/careType from first lead that has them for the closing line
    const cityForClosing = opts.leads.find(l => l.city)?.city;
    const careTypeForClosing = opts.leads.find(l => l.careType)?.careType?.toLowerCase() || "care";

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        We'll be closing out these introductions soon, since it's been a couple of weeks:
      </p>
      <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
        ${leadsListHtml}
      </ul>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        If you'd still like to reach them, here's one last link:
      </p>`;
    // Note: button is added after bodyHtml in the return statement below
    // The "timing wasn't right" paragraph comes after the button

    const closingParagraph = `
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        If the timing wasn't right, no problem at all. Families${cityForClosing ? ` in ${escapeHtml(cityForClosing)}` : ""} search for ${escapeHtml(careTypeForClosing)} all the time, and when they choose your team, we'll bring them straight to you — free, and directly. We're glad you're listed with us.
      </p>`;

    const buttonText = "See all requests →";

    return layout(`
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
      ${bodyHtml}
      <div style="margin:0 0 24px;">${button(buttonText, opts.viewUrl)}</div>
      ${closingParagraph}
      ${loganLightSignature()}
      ${followupFooterBlock(opts)}
    `, preheader);
  } else {
    const familyRef = hasName ? safeFamilyName : "this family";
    const careTypeRef = hasCareType ? escapeHtml(lead.careType!.toLowerCase()) : "care";
    const cityRef = hasCity ? ` in ${escapeHtml(lead.city!)}` : "";

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        We'll be closing out ${hasName ? escapeHtml(safeFamilyName) + "'s" : "this"} introduction soon, since it's been a couple of weeks. If you'd still like to reach ${pronouns.object}, here's one last link:
      </p>
      <div style="margin:0 0 24px;">${button(hasName ? `See ${escapeHtml(safeFamilyName)}'s request →` : "See the request →", opts.viewUrl)}</div>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        If the timing wasn't right, no problem at all. Families${cityRef} search for ${careTypeRef} all the time, and when they choose your team, we'll bring them straight to you — free, and directly. We're glad you're listed with us.
      </p>`;

    return layout(`
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
      ${bodyHtml}
      ${loganLightSignature()}
      ${followupFooterBlock(opts)}
    `, preheader);
  }
}

/**
 * Day 17 Follow-up: "One last note" — Re-engagement email for stuck providers.
 * Light signature. Final automated outreach before marking as needs_call.
 * Tone: Graceful, no pressure, "we'll close this out quietly."
 */
export function providerFollowupDay17Email(opts: FollowupEmailOpts): string {
  const lead = opts.leads[0];
  const leadCount = opts.leads.length;
  const isMultiple = leadCount > 1;

  const safeFamilyName = firstName(lead.familyName, "");
  const hasName = safeFamilyName.length > 0;
  const hasCity = !!lead.city;
  const hasCareType = !!lead.careType;

  // Build preheader
  const preheader = "If the timing's not right, no problem at all.";

  // Build greeting - use full provider name (not firstName) since most are businesses
  const greeting = `Hi ${escapeHtml(opts.providerName || "there")},`;

  let bodyHtml: string;
  if (isMultiple) {
    const leadsListHtml = opts.leads.map((l) => {
      const name = firstName(l.familyName, "A family");
      const careInfo = l.careType ? escapeHtml(l.careType.toLowerCase()) : "care";
      return `<li style="margin:0 0 8px;padding:0;"><strong>${escapeHtml(name)}</strong> — ${careInfo}</li>`;
    }).join("");

    // Pick city/careType from first lead that has them for the closing line
    const cityForClosing = opts.leads.find(l => l.city)?.city;
    const careTypeForClosing = opts.leads.find(l => l.careType)?.careType?.toLowerCase() || "care";

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        These families reached out a little while ago, and their requests are still open on your end:
      </p>
      <ul style="margin:0 0 20px;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
        ${leadsListHtml}
      </ul>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
        If you're not taking new families right now, no worries at all — we'll quietly close out these requests.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        But if there's any chance they're a fit, this is the last time we'll nudge you about them:
      </p>`;

    const buttonText = "See all requests →";

    const closingParagraph = `
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Either way, thank you for the work you do — families come to you at some of the hardest moments of their lives. Whenever one${cityForClosing ? ` near ${escapeHtml(cityForClosing)}` : ""} is looking for ${escapeHtml(careTypeForClosing)}, we'll keep bringing them to you.
      </p>`;

    return layout(`
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
      ${bodyHtml}
      <div style="margin:0 0 24px;">${button(buttonText, opts.viewUrl)}</div>
      ${closingParagraph}
      ${loganLightSignature()}
      ${followupFooterBlock(opts)}
    `, preheader);
  } else {
    const familyRef = hasName ? safeFamilyName : "A family";
    const careTypeRef = hasCareType ? escapeHtml(lead.careType!.toLowerCase()) : "care";
    const cityRef = hasCity ? ` near ${escapeHtml(lead.city!)}` : "";

    // Body paragraph with fallbacks
    // Full: "Margaret reached out a little while ago about assisted living, and that request is still open on your end."
    // No name: "A family near Bryan reached out a little while ago about assisted living, and that request is still open on your end."
    let openingLine: string;
    if (hasName) {
      openingLine = `${escapeHtml(safeFamilyName)} reached out a little while ago about ${careTypeRef}, and that request is still open on your end.`;
    } else if (hasCity) {
      openingLine = `A family${cityRef} reached out a little while ago about ${careTypeRef}, and that request is still open on your end.`;
    } else {
      openingLine = `A family reached out a little while ago about ${careTypeRef}, and that request is still open on your end.`;
    }

    bodyHtml = `
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
        ${openingLine} If you're not taking new families right now, no worries at all — we'll quietly close out this request.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        But if there's any chance it's a fit, this is the last time we'll nudge you about this one:
      </p>`;

    const buttonText = hasName ? `See ${escapeHtml(safeFamilyName)}'s request →` : "See the request →";

    // Closing paragraph with fallbacks
    // Full: "Whenever one near Bryan is looking for assisted living, we'll keep bringing them to you."
    // No city: "Whenever one is looking for assisted living, we'll keep bringing them to you."
    const closingCityRef = hasCity ? ` near ${escapeHtml(lead.city!)}` : "";
    const closingParagraph = `
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
        Either way, thank you for the work you do — families come to you at some of the hardest moments of their lives. Whenever one${closingCityRef} is looking for ${careTypeRef}, we'll keep bringing them to you.
      </p>`;

    return layout(`
      <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">${greeting}</p>
      ${bodyHtml}
      <div style="margin:0 0 24px;">${button(buttonText, opts.viewUrl)}</div>
      ${closingParagraph}
      ${loganLightSignature()}
      ${followupFooterBlock(opts)}
    `, preheader);
  }
}

/**
 * Nudge email sent by admin to encourage a family to complete their profile.
 * Explains that a complete profile helps providers respond better.
 */
export function familyNudgeEmail(opts: {
  /** Family profile id (business_profiles.id) for the no-login unsubscribe link. */
  unsubscribeId?: string;
  familyName: string;
  providerName: string;
  missingFields: string[];
  completionPercent: number;
  profileUrl: string;
  /** Benefits quiz deep-link — the value-exchange hero when present. */
  benefitsQuizUrl?: string | null;
}): string {
  // De-boxed ask (shared helper): the missing fields read as one warm line with
  // the field names emphasized inline — never a gray SaaS callout.
  const askLine = fieldAskLine(
    opts.missingFields,
    "Sharing your ",
    " would sharpen these matches the most.",
  );

  // The quiz is the hero when we have it (it both sharpens matches AND surfaces
  // benefits — completion as value-exchange, never a naked profile-nag). Falls
  // back to the plain profile link for callers that don't pass a quiz url.
  const primaryUrl = opts.benefitsQuizUrl || opts.profileUrl;
  // CTA is the outcome of the ask above ("...would sharpen these matches"): you
  // share a detail and get better matches — not a ready list to "view" (the old
  // dissonance). ("benefits" also reads as employment benefits, so it's out.)
  const primaryLabel = opts.benefitsQuizUrl ? "Get better matches" : "Add my details";

  // Weave in the provider they reached out to (guarded — a generic version reads
  // fine when it's absent).
  const providerClause = opts.providerName
    ? ` and reached out to ${escapeHtml(opts.providerName)}`
    : "";
  // Momentum line (shared helper): only shown from 50%+ — below that it reads as
  // work-remaining rather than progress.
  const progressLine = completionProgressLine(opts.completionPercent);

  return layout(
    `
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 10px;line-height:1.25;">Let&rsquo;s find care that fits</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 12px;line-height:1.6;">
      Hi ${firstName(opts.familyName, "there")}, you started a care search on Olera${providerClause}. Finding the right fit is a big decision, and it's normal to need time to compare options.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Share a couple more details and we'll show you better-matched providers near you, plus the programs that may help cover the cost.
    </p>
    ${progressLine}
    ${askLine}
    <div>${button(primaryLabel, primaryUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:18px 0 0;line-height:1.6;">
      Cost is often the first question families have, and this same step shows what financial help you may qualify for.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:12px 0 0;line-height:1.6;">
      Questions, or want a hand choosing? A real person is here. <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};text-decoration:underline;">Contact us anytime</a>.
    </p>
    ${authorBylineBlock({ topBorder: true })}
    <p style="font-size:12px;color:#d1d5db;margin:20px 0 0;line-height:1.5;text-align:center;">
      <a href="${careUnsubscribeUrl(opts.unsubscribeId)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from these updates</a>
    </p>
  `,
    // Preheader (inbox preview text, after the subject) — NOT the subject, which
    // the caller sets. Carries the cost hook that doesn't fit in the subject, so
    // the inbox row reads "A few more care options near you · Plus the programs…".
    `Plus the programs that can help cover the cost.`
  );
}

// ── Provider Lifecycle Emails (Phase 9) ──────────────────────────────

/**
 * Welcome email sent 24h after provider verification approved.
 * Warm onboarding, sets expectations for getting leads.
 */
export function providerWelcomeEmail(opts: {
  providerName: string;
  recipientName: string;
  slug: string;
  profileCompleteness: number;
  dashboardUrl: string;
  profileUrl: string;
}): string {
  const completenessLine = opts.profileCompleteness < 100
    ? `<p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
        Your profile is ${opts.profileCompleteness}% complete. Providers with complete profiles get more inquiries from families.
      </p>`
    : "";

  const completeProfileCta = opts.profileCompleteness < 100
    ? `<p style="font-size:14px;color:#6b7280;margin:16px 0 0;line-height:1.5;">
        Want to stand out? ${ctaLink("Complete your profile", opts.profileUrl)} to attract more families.
      </p>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome to Olera</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.recipientName, "there"))}, you're all set up and ready to connect with families looking for care from <strong>${escapeHtml(opts.providerName)}</strong>.
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">Here's what happens next:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>Families browsing Olera will find your listing and can reach out directly</li>
      <li>You'll get an email notification for each new inquiry</li>
      <li>Respond promptly — families appreciate timely replies</li>
    </ul>
    ${completenessLine}
    <div style="margin:0 0 24px;">${button("View Your Dashboard", opts.dashboardUrl)}</div>
    ${completeProfileCta}
    <p style="font-size:13px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a> — we're here to help you succeed.
    </p>
  `, "You're verified and ready to connect with families");
}

/**
 * Celebration email sent when provider receives their FIRST ever lead.
 * Reinforces value, tips for responding.
 */
export function firstLeadCelebrationEmail(opts: {
  providerName: string;
  recipientName: string;
  familyName: string;
  connectionId: string;
  viewUrl: string;
}): string {
  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#fef3c7;border-radius:50%;">
          <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">🎉</td></tr>
        </table>
      </td></tr>
    </table>
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">You got your first lead!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;text-align:center;">
      Congratulations, ${escapeHtml(firstName(opts.recipientName, "there"))}! <strong>${escapeHtml(firstName(opts.familyName, "A family"))}</strong> is interested in care from ${escapeHtml(opts.providerName)}.
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">Tips for a great first response:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>Respond within 24 hours — families appreciate promptness</li>
      <li>Acknowledge their specific needs if they shared any</li>
      <li>Share what makes your organization a great fit</li>
    </ul>
    <div style="text-align:center;margin:0 0 24px;">${button("View & Respond", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `${firstName(opts.familyName, "A family")} reached out — your first lead on Olera!`);
}

/**
 * Confirmation email sent when provider sends their FIRST message in a thread.
 * Reinforces good behavior.
 */
export function firstResponseConfirmationEmail(opts: {
  providerName: string;
  recipientName: string;
  familyName: string;
  responseTimeHours: number;
  viewUrl: string;
}): string {
  const timeText = opts.responseTimeHours < 1
    ? "less than an hour"
    : opts.responseTimeHours === 1
      ? "1 hour"
      : opts.responseTimeHours < 24
        ? `${opts.responseTimeHours} hours`
        : opts.responseTimeHours < 48
          ? "1 day"
          : `${Math.floor(opts.responseTimeHours / 24)} days`;

  const fastResponseBonus = opts.responseTimeHours <= 4
    ? `<div style="background:#ecfdf5;border-radius:8px;padding:16px;margin:0 0 20px;">
        <p style="font-size:14px;color:#065f46;margin:0;line-height:1.5;">
          <strong>Fast responder!</strong> You replied in ${timeText}. Families love prompt responses — keep it up!
        </p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Great job reaching out!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      ${escapeHtml(firstName(opts.recipientName, "Hi"))}, you just sent your first response to <strong>${escapeHtml(firstName(opts.familyName, "a family"))}</strong> on Olera.
    </p>
    ${fastResponseBonus}
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">What happens next:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>The family will get a notification about your message</li>
      <li>Continue the conversation through your inbox</li>
      <li>You'll get an email when they reply</li>
    </ul>
    <div style="margin:0 0 24px;">${button("View Conversation", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "Your message was delivered — nice work!");
}

/**
 * Celebration email sent when provider profile reaches 100% completeness.
 * Celebrates milestone, explains what's next.
 */
export function profileCompleteEmail(opts: {
  providerName: string;
  recipientName: string;
  slug: string;
  dashboardUrl: string;
  profileUrl: string;
}): string {
  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;">
          <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">✓</td></tr>
        </table>
      </td></tr>
    </table>
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">Your profile is complete!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;text-align:center;">
      ${escapeHtml(firstName(opts.recipientName, "Hi"))}, ${escapeHtml(opts.providerName)} now has a complete profile on Olera. This helps families find you and understand what you offer.
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">Complete profiles get:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>Higher visibility in family searches</li>
      <li>More qualified leads from families who understand your services</li>
      <li>Better engagement from families who've read your full listing</li>
    </ul>
    <div style="text-align:center;margin:0 0 24px;">${button("View Your Listing", opts.profileUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "Your profile is now 100% complete");
}

/**
 * Re-engagement email sent to providers inactive for 30+ days.
 * "We miss you" + new families in their area.
 */
export function dormantReengagementEmail(opts: {
  providerName: string;
  recipientName: string;
  slug: string;
  daysSinceActivity: number;
  newFamiliesCount?: number;
  city?: string;
  dashboardUrl: string;
  providerSlug?: string;
}): string {
  const locationText = opts.city ? ` in ${escapeHtml(opts.city)}` : "";
  const familiesLine = opts.newFamiliesCount && opts.newFamiliesCount > 0
    ? `<div style="background:#f0fdfa;border-radius:8px;padding:16px;margin:0 0 20px;">
        <p style="font-size:14px;color:#065f46;margin:0;line-height:1.5;">
          <strong>${opts.newFamiliesCount} new ${opts.newFamiliesCount === 1 ? "family" : "families"}</strong> ${opts.newFamiliesCount === 1 ? "has" : "have"} searched for care${locationText} this month.
        </p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Families are still looking for you</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.recipientName, "there"))}, it's been a while since you've been active on Olera. Families${locationText} are still searching for care providers like ${escapeHtml(opts.providerName)}.
    </p>
    ${familiesLine}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      Log in to check for any new inquiries, update your listing, and make sure families can find you.
    </p>
    <div style="margin:0 0 24px;">${button("Go to Dashboard", opts.dashboardUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${offRampBlock(opts.providerSlug)}
  `, `Families${locationText} are looking for care — don't miss out`);
}

/**
 * Anniversary/milestone email for providers.
 * Celebrates 1-year anniversary OR connection milestones (10, 50, 100).
 */
export function anniversaryMilestoneEmail(opts: {
  providerName: string;
  recipientName: string;
  slug: string;
  milestoneType: "anniversary" | "connections";
  /** Years on platform (for anniversary) */
  yearsOnPlatform?: number;
  /** Total connections count (for connections milestone) */
  totalConnections?: number;
  /** The specific milestone reached: 10, 50, 100 (for connections) */
  connectionMilestone?: number;
  dashboardUrl: string;
}): string {
  if (opts.milestoneType === "anniversary") {
    const yearsText = opts.yearsOnPlatform === 1 ? "1 year" : `${opts.yearsOnPlatform} years`;
    return layout(`
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td align="center">
          <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#fef3c7;border-radius:50%;">
            <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">🎂</td></tr>
          </table>
        </td></tr>
      </table>
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">Happy ${yearsText} on Olera!</h1>
      <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;text-align:center;">
        ${escapeHtml(firstName(opts.recipientName, "Hi"))}, ${yearsText} ago ${escapeHtml(opts.providerName)} joined Olera. Thank you for being part of our community and helping families find quality care.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
        We're grateful to have you as a partner in connecting families with the care they need.
      </p>
      <div style="text-align:center;margin:0 0 24px;">${button("View Your Dashboard", opts.dashboardUrl)}</div>
      <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">
        Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
      </p>
    `, `Celebrating ${yearsText} of connecting families with care`);
  }

  // Connection milestone
  const milestoneText = opts.connectionMilestone === 10
    ? "10th"
    : opts.connectionMilestone === 50
      ? "50th"
      : opts.connectionMilestone === 100
        ? "100th"
        : `${opts.connectionMilestone}th`;

  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="width:56px;height:56px;background:#ecfdf5;border-radius:50%;">
          <tr><td align="center" valign="middle" style="font-size:28px;line-height:56px;">🏆</td></tr>
        </table>
      </td></tr>
    </table>
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;text-align:center;">Milestone: ${milestoneText} connection!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;text-align:center;">
      ${escapeHtml(firstName(opts.recipientName, "Hi"))}, ${escapeHtml(opts.providerName)} just reached ${opts.totalConnections?.toLocaleString()} connections with families on Olera!
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;text-align:center;">
      Each connection represents a family you've helped on their care journey. Thank you for your commitment to providing quality care.
    </p>
    <div style="text-align:center;margin:0 0 24px;">${button("View Your Dashboard", opts.dashboardUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;text-align:center;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `Celebrating ${opts.totalConnections?.toLocaleString()} families connected through Olera`);
}

/**
 * Confirmation email to provider after they reach out to a family via Matches.
 * Includes competitive urgency if other providers have also reached out.
 */
export function providerReachOutConfirmationEmail(opts: {
  providerName: string;
  familyName: string;
  city: string;
  competitorCount: number;
  viewUrl: string;
}): string {
  const safeFamilyName = firstName(opts.familyName, "the family");

  // Competitive urgency block (only shown when there's competition)
  const competitionBlock = opts.competitorCount > 0
    ? `<div style="background:#fef3c7;border-radius:8px;padding:16px;margin:0 0 20px;">
        <p style="font-size:14px;color:#92400e;margin:0;line-height:1.5;">
          <strong>Heads up:</strong> ${opts.competitorCount} other provider${opts.competitorCount === 1 ? " has" : "s have"} also reached out to this family. When they respond, reply quickly — families often go with providers who are most responsive.
        </p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Your message was sent!</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(opts.providerName || "there")}, your reach-out to <strong>${escapeHtml(safeFamilyName)}</strong> in ${escapeHtml(opts.city)} was delivered.
    </p>
    ${competitionBlock}
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">What happens next:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>The family will get a notification about your message</li>
      <li>Most families respond within 24-48 hours</li>
      <li>You'll get an email when they reply</li>
    </ul>
    <div style="margin:0 0 24px;">${button("View Conversation", opts.viewUrl)}</div>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      While you wait, <a href="${BASE_URL}/provider/matches" style="color:${BRAND_COLOR};text-decoration:underline;">browse other families</a> who might be a good fit.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `Your reach-out to ${safeFamilyName} was delivered`);
}

/**
 * Email encouraging providers to use Matches (proactive outreach) after their first lead response.
 * Only sent to providers who have never used Matches before.
 */
export function matchesEncouragementEmail(opts: {
  providerName: string;
  recipientName: string;
  familyName: string;
  matchesUrl: string;
}): string {
  const safeFamilyName = firstName(opts.familyName, "a family");

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Did you know you can reach out first?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      ${escapeHtml(firstName(opts.recipientName, "Hi"))}, you just responded to ${escapeHtml(safeFamilyName)} — nice work! But waiting for families to find you isn't your only option.
    </p>
    <div style="background:#f0fdfa;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:14px;color:#0d9488;margin:0;line-height:1.5;">
        <strong>With Matches, you can browse families looking for care and reach out to them directly.</strong> No waiting for inquiries — just find families who need what you offer.
      </p>
    </div>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.5;font-weight:600;">How it works:</p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li>Browse families who've shared their care needs</li>
      <li>Filter by location, care type, and timeline</li>
      <li>Send a personalized message introducing yourself</li>
      <li>Families get notified and can respond directly</li>
    </ul>
    <div style="margin:0 0 24px;">${button("Browse Families", opts.matchesUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "Reach out to families looking for care — they're waiting to hear from you");
}

/**
 * Nudge email to family when a provider reached out but family hasn't responded.
 * Sent 3+ days after reach-out with 7-day cooldown.
 */
export function familyPendingReachOutNudgeEmail(opts: {
  familyName: string;
  providerName: string;
  providerCity: string;
  messagePreview: string | null;
  daysSinceReachOut: number;
  viewUrl: string;
  /** Family profile id for the unsubscribe footer. */
  unsubscribeId?: string;
}): string {
  const safeProviderName = escapeHtml(opts.providerName);
  const daysText = opts.daysSinceReachOut === 1 ? "1 day" : `${opts.daysSinceReachOut} days`;

  const messageBlock = opts.messagePreview
    ? `<div style="background:#f9fafb;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;margin:0 0 20px;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5;">"${escapeHtml(opts.messagePreview.length > 150 ? opts.messagePreview.slice(0, 150) + "..." : opts.messagePreview)}"</p>
      </div>`
    : "";

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">${safeProviderName} is waiting to hear from you</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.familyName, "there"))}, <strong>${safeProviderName}</strong> in ${escapeHtml(opts.providerCity)} reached out to you ${daysText} ago.
    </p>
    ${messageBlock}
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      They took the time to reach out, and a quick response helps them know if you're still looking for care. Even a "not interested" is helpful so they can assist other families.
    </p>
    <div style="margin:0 0 24px;">${button("View and Respond", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${careUnsubscribeFooter(opts.unsubscribeId)}
  `, `${opts.providerName} is still waiting for your response`);
}

/**
 * Nudge email to provider when conversation with family has gone stale.
 * Sent when both parties have been silent for 5+ days after conversation started.
 */
export function staleConversationProviderEmail(opts: {
  providerName: string;
  recipientName: string;
  familyName: string;
  daysSinceLastMessage: number;
  viewUrl: string;
}): string {
  const safeFamilyName = firstName(opts.familyName, "a family");
  const daysText = opts.daysSinceLastMessage === 1 ? "1 day" : `${opts.daysSinceLastMessage} days`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Continue your conversation?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      ${escapeHtml(firstName(opts.recipientName, "Hi"))}, your conversation with <strong>${escapeHtml(safeFamilyName)}</strong> has been quiet for ${daysText}.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      A quick follow-up can restart the conversation. Even a simple "Any updates on your care search?" shows you're still interested in helping.
    </p>
    <div style="margin:0 0 24px;">${button("Send a Follow-up", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `Your conversation with ${safeFamilyName} went quiet. Send a follow-up`);
}

/**
 * Nudge email to family when conversation with provider has gone stale.
 * Sent when both parties have been silent for 5+ days after conversation started.
 */
export function staleConversationFamilyEmail(opts: {
  familyName: string;
  providerName: string;
  daysSinceLastMessage: number;
  viewUrl: string;
  /** Family profile id for the unsubscribe footer. */
  unsubscribeId?: string;
}): string {
  const safeProviderName = escapeHtml(opts.providerName);
  const daysText = opts.daysSinceLastMessage === 1 ? "1 day" : `${opts.daysSinceLastMessage} days`;

  return layout(`
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Still looking for care?</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(firstName(opts.familyName, "there"))}, your conversation with <strong>${safeProviderName}</strong> has been quiet for ${daysText}.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;">
      If you're still exploring care options, they'd love to hear from you. And if you've moved on, letting them know helps them assist other families.
    </p>
    <div style="margin:0 0 24px;">${button("Continue the Conversation", opts.viewUrl)}</div>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
    ${careUnsubscribeFooter(opts.unsubscribeId)}
  `, `${opts.providerName} is still here to help. Continue the conversation`);
}

/**
 * Day 10 AWAITING email - warm hand for families frozen at the finish line.
 * Offers human support and alternatives, not another "reply" nudge.
 * Sent ~10 days after provider responds if family still hasn't replied.
 */
export function day10AwaitingEmail(opts: {
  familyName: string;
  providerName: string;
  inboxUrl: string;
  supportUrl: string;
  alternativesUrl: string;
  /** A couple of others to compare against the one who responded. */
  recommendedProviders?: CompareCardItem[];
  /** Benefits quiz deep-link (the closer). */
  benefitsQuizUrl?: string | null;
  /** Family profile id for the unsubscribe footer. */
  unsubscribeId?: string;
}): string {
  const familyFirstName = firstName(opts.familyName, "there");
  const safeProviderName = escapeHtml(opts.providerName);
  const hasRecs = !!opts.recommendedProviders?.length;

  const providersSection = hasRecs ? compareCardsBlock(opts.recommendedProviders!) : "";

  return layout(`
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Hi ${escapeHtml(familyFirstName)},
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      You heard back from <strong>${safeProviderName}</strong>, and that's a good place to be. If you've been meaning to reply but haven't found the moment, that's completely normal; there's a lot to weigh, and there's no wrong pace.
    </p>
    ${hasRecs ? `
    <p style="font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;">
      One thing that helps before you decide: seeing how they stack up against a couple of others nearby.
    </p>
    <div style="margin:0 0 24px;">${providersSection}</div>
    <div style="margin:0 0 24px;${hasRecs ? "text-align:center;" : ""}">${hasRecs ? browseLink("Compare your options", opts.alternativesUrl) : button("Compare your options", opts.alternativesUrl)}</div>
    ` : ""}
    ${benefitsQuizModule(opts.benefitsQuizUrl)}
    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.5;">
      Ready to keep going? <a href="${opts.inboxUrl}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">Pick up right where you left off</a> with ${safeProviderName}. And if you'd rather not weigh it alone, a real person on our team is glad to help you think it through. <a href="${opts.supportUrl}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">Just reach out</a>.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.5;">
      We're not going anywhere.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 4px;line-height:1.5;">
      Warmly,
    </p>
    <p style="font-size:15px;color:#374151;margin:0;line-height:1.5;">
      The Olera team
    </p>
    ${authorBylineBlock({ topBorder: true })}
    ${careUnsubscribeFooter(opts.unsubscribeId)}
  `, `You heard back from ${opts.providerName}. Here's how to weigh your options.`);
}

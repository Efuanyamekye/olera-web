/**
 * MedJobs email templates — follows the same pattern as lib/email-templates.tsx.
 * Kept separate for modularity (design constraint #3).
 */

import { escapeHtml, firstName } from "./email-templates";

const BRAND_COLOR = "#198087";
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

/** Hidden preheader text for inbox preview */
function preheaderHtml(text: string): string {
  const escaped = escapeHtml(text);
  return `<div style="display:none;font-size:1px;color:#f9fafb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escaped}</div>`;
}

function layout(body: string, preheader?: string): string {
  const preheaderBlock = preheader ? preheaderHtml(preheader) : "";
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:${FONT_STACK};">
  ${preheaderBlock}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:24px 32px 16px;">
          <span style="font-size:18px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.3px;">Olera MedJobs</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 32px 32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">
            &copy; ${new Date().getFullYear()} Olera &middot;
            <a href="${BASE_URL}/medjobs" style="color:#9ca3af;">Olera MedJobs</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;background:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>`;
}

/**
 * Human signature block for the program's relationship-driven mail (the
 * bidirectional "ready" notifications + the cold student-interest note). These
 * are sent by Graize on Dr. DuBose's behalf, so they sign as a person rather
 * than as a faceless product — matching the cold-outreach voice providers and
 * students already know from the campaign.
 */
function graizeSignature(): string {
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0 0;border-top:1px solid #f3f4f6;">
      <tr><td style="padding:16px 0 0;">
        <p style="font-size:14px;color:#111827;font-weight:600;margin:0;">Graize Belandres</p>
        <p style="font-size:13px;color:#6b7280;margin:2px 0 0;">Olera MedJobs</p>
        <p style="font-size:12px;color:#9ca3af;margin:10px 0 0;font-style:italic;">Message approved by Dr. Logan DuBose, MD, MBA</p>
      </td></tr>
    </table>`;
}

// ── Bidirectional "ready" notifications (Graize-signed) ───────────────

/**
 * Cold provider notification: a real student requested to interview with a
 * provider who hasn't claimed their account yet. Treated like cold outreach
 * (Graize voice, isolated sending domain via the "medjobs_student_interest"
 * type) rather than a transactional interview email. The claim link signs the
 * provider in and drops them on the interview.
 */
export function studentInterestColdEmail({
  providerName,
  campus,
  claimUrl,
}: {
  providerName?: string | null;
  campus?: string | null;
  claimUrl: string;
}): string {
  const safeProvider = providerName ? escapeHtml(firstName(providerName, "there")) : "there";
  const studentDesc = campus ? `A ${escapeHtml(campus)} student` : "A local pre-health student";
  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">
      ${studentDesc} is interested in working with you
    </h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${safeProvider}, ${studentDesc.charAt(0).toLowerCase()}${studentDesc.slice(1)} caregiver candidate found your
      agency on Olera and asked to set up an interview for a paid caregiver role. These are
      pre-health students (pre-med, nursing, PA) looking for hands-on caregiving experience.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.6;">
      Review the request and pick a time — it only takes a minute.
    </p>
    <p style="margin:0;">${button("Review the request", claimUrl)}</p>
    ${graizeSignature()}
  `, `${studentDesc} wants to interview with you`);
}

/**
 * Provider notification (catchment-wide): a new student caregiver just went
 * live near the provider. Sent to both claimed and cold providers in the
 * catchment, so it carries the Graize voice and a one-click link to the
 * candidate's profile.
 */
export function candidateReadyEmail({
  providerName,
  campus,
  candidateName,
  viewUrl,
}: {
  providerName?: string | null;
  campus?: string | null;
  candidateName?: string | null;
  viewUrl: string;
}): string {
  const safeProvider = providerName ? escapeHtml(firstName(providerName, "there")) : "there";
  const where = campus ? `near ${escapeHtml(campus)}` : "near you";
  const who = candidateName ? escapeHtml(candidateName) : "A new student caregiver";
  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">
      Ready for interview: a student caregiver candidate ${where}
    </h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${safeProvider}, ${who} is now available to interview for a paid caregiver role ${where}.
      Take a look at their profile and schedule an interview if they're a fit.
    </p>
    <p style="margin:0;">${button("View candidate", viewUrl)}</p>
    ${graizeSignature()}
  `, `A student caregiver candidate is ready to interview ${where}`);
}

/**
 * Student notification (catchment-wide): a provider near the student's campus
 * just opened a caregiver opportunity (accepted the program terms). Sent to
 * live students on the warm olera.care domain, Graize-signed, with a one-click
 * link to the provider's opportunity page.
 */
export function jobReadyEmail({
  studentName,
  campus,
  providerName,
  viewUrl,
}: {
  studentName?: string | null;
  campus?: string | null;
  providerName?: string | null;
  viewUrl: string;
}): string {
  const safeStudent = studentName ? escapeHtml(firstName(studentName, "there")) : "there";
  const where = campus ? `near ${escapeHtml(campus)}` : "near you";
  const who = providerName ? escapeHtml(providerName) : "A care provider";
  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">
      A caregiver job ${where} is open
    </h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${safeStudent}, ${who} ${where} is hiring student caregivers and ready to interview.
      This is a paid role with flexible hours — a great way to build hands-on caregiving experience.
    </p>
    <p style="margin:0;">${button("See the opportunity", viewUrl)}</p>
    ${graizeSignature()}
  `, `A caregiver job ${where} just opened`);
}

// ── Student Templates ────────────────────────────────────────────

export function studentWelcomeEmail({
  studentName,
  university,
  profileSlug,
  magicLink,
}: {
  studentName: string;
  university: string;
  profileSlug: string;
  magicLink?: string;
}): string {
  const completeProfileUrl = magicLink || `${BASE_URL}/portal/medjobs`;

  const universityBlock = university
    ? `<table cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:0 0 16px;">
      <tr><td>
        <p style="font-size:13px;color:#6b7280;margin:0 0 4px;">University</p>
        <p style="font-size:15px;color:#111827;font-weight:600;margin:0;">${university}</p>
      </td></tr>
    </table>`
    : "";

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome to MedJobs, ${studentName}!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Your account has been created. Your profile is <strong>not yet visible</strong> to providers.
      Complete the steps below to activate it.
    </p>
    ${universityBlock}
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.6;">
      <strong>To activate your profile:</strong>
    </p>
    <ol style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      <li><strong>Complete your application</strong></li>
      <li><strong>Submit your intro video</strong></li>
      <li><strong>Upload driver&apos;s license</strong></li>
      <li><strong>Upload car insurance</strong></li>
    </ol>
    <p style="margin:0 0 16px;">
      ${button("Complete Your Profile", completeProfileUrl)}
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:16px;width:100%;margin:0 0 4px;">
      <tr><td>
        <p style="font-size:13px;font-weight:600;color:#166534;margin:0 0 6px;">What happens next?</p>
        <ol style="font-size:13px;color:#166534;margin:0;padding-left:16px;line-height:1.8;">
          <li>Complete the steps above to activate your profile</li>
          <li>Providers in your area will be able to view your profile</li>
          <li>You&apos;ll receive an email when a provider is interested</li>
        </ol>
      </td></tr>
    </table>
  `);
}

/**
 * Sent immediately when Step 1 of onboarding creates an account (partial creation).
 * Purpose: orient the user, explain MedJobs, drive them back to complete their profile.
 */
export function studentAccountCreatedEmail({
  studentName,
  city,
}: {
  studentName: string;
  city?: string;
}): string {
  const firstName = studentName.split(" ")[0];
  const locationLine = city ? ` in ${city}` : "";

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome to MedJobs, ${firstName}!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Your account has been created. You&rsquo;re one step closer to connecting with healthcare providers${locationLine} who are actively hiring student caregivers.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:0 0 16px;">
      <tr><td>
        <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 8px;">What is MedJobs?</p>
        <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.6;">
          MedJobs connects pre-health students with home care agencies and healthcare providers who need reliable caregivers. A complete, verified profile is how providers find and reach out to you.
        </p>
      </td></tr>
    </table>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.6;">
      <strong>Complete your profile to get started.</strong> It takes about 10 minutes and includes a short video, availability, and a few questions that show providers you&rsquo;re serious.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.6;">
      Providers reviewing candidates prioritize complete profiles. The more thorough your profile, the more likely you are to hear from hiring providers.
    </p>
    <p style="margin:0 0 16px;">
      ${button("Complete My Profile", `${BASE_URL}/portal/medjobs`)}
    </p>
  `);
}

/**
 * Sent when a student's profile reaches 100% completeness.
 * Celebrates, tells them they're live, encourages proactive outreach.
 */
export function studentActivationEmail({
  studentName,
  city,
  profileUrl,
  magicLink,
}: {
  studentName: string;
  city?: string;
  profileUrl: string;
  magicLink?: string;
}): string {
  const safeName = escapeHtml(firstName(studentName, "there"));
  const locationLine = city ? ` in ${escapeHtml(city)}` : "";
  const dashboardUrl = magicLink || `${BASE_URL}/medjobs/providers`;
  const safeProfileUrl = escapeHtml(profileUrl);

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Your profile is live, ${safeName}!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Congratulations — your MedJobs profile is 100% complete and verified. Providers${locationLine} can now find you and reach out via the platform, email, or phone.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:16px;width:100%;margin:0 0 16px;">
      <tr><td>
        <p style="font-size:13px;font-weight:600;color:#166534;margin:0 0 8px;">What happens now?</p>
        <ol style="font-size:13px;color:#166534;margin:0;padding-left:16px;line-height:1.8;">
          <li>Providers can view your profile and reach out to you</li>
          <li>You can browse providers hiring near you and ask to be introduced</li>
          <li>Reaching out directly often leads to conversations faster</li>
        </ol>
      </td></tr>
    </table>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.6;">
      <strong>Your profile link:</strong>
    </p>
    <p style="font-size:13px;margin:0 0 20px;">
      <a href="${safeProfileUrl}" style="color:${BRAND_COLOR};">${safeProfileUrl}</a>
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.6;">
      Share this link when reaching out — it shows your video, availability, and background at a glance.
    </p>
    <p style="margin:0 0 16px;">
      ${button("See providers hiring near you", dashboardUrl)}
    </p>
  `);
}

export function studentReturningEmail({
  studentName,
  profileSlug,
  magicLink,
}: {
  studentName: string;
  profileSlug: string;
  magicLink?: string;
}): string {
  const completeProfileUrl = magicLink || `${BASE_URL}/portal/medjobs`;

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome back, ${studentName}!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Looks like you already started an application. Your profile is still waiting for you &mdash; pick up where you left off.
    </p>
    <p style="margin:0 0 16px;">
      ${button("Continue Your Profile", completeProfileUrl)}
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.6;">
      If you didn&apos;t request this, you can safely ignore this email.
    </p>
  `);
}

export function applicationReceivedEmail({
  providerName,
  studentName,
  university,
  programTrack,
  profileSlug,
}: {
  providerName: string;
  studentName: string;
  university: string;
  programTrack: string;
  profileSlug: string;
}): string {
  const studentFirst = firstName(studentName);

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">New Student Application</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${providerName ? escapeHtml(providerName) : "there"}, a student has applied to work with you through Olera MedJobs.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:0 0 16px;">
      <tr><td>
        <p style="font-size:15px;color:#111827;font-weight:600;margin:0 0 8px;">${escapeHtml(studentName)}</p>
        <p style="font-size:13px;color:#6b7280;margin:0 0 4px;">${escapeHtml(university)}</p>
        <p style="font-size:13px;color:#6b7280;margin:0;">${escapeHtml(programTrack)}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;">
      ${button("View Candidate", `${BASE_URL}/medjobs/candidates/${profileSlug}`)}
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `${studentFirst} applied to work with you`);
}

export function applicationSentEmail({
  studentName,
  providerName,
}: {
  studentName: string;
  providerName: string;
}): string {
  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Application Sent!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${studentName}, your application to <strong>${providerName}</strong> has been sent.
      They&apos;ll receive your profile and can reach out if interested.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      In the meantime, make sure your profile is complete &mdash; students with resumes
      and video intros get 3x more responses.
    </p>
    <p style="margin:0;">
      ${button("View Your Profile", `${BASE_URL}/portal/medjobs`)}
    </p>
  `);
}

export function applicationResponseEmail({
  studentName,
  providerName,
  accepted,
}: {
  studentName: string;
  providerName: string;
  accepted: boolean;
}): string {
  const statusText = accepted ? "accepted" : "declined";
  const statusColor = accepted ? "#059669" : "#dc2626";

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Application Update</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${studentName}, <strong>${providerName}</strong> has
      <span style="color:${statusColor};font-weight:600;">${statusText}</span>
      your application.
    </p>
    ${accepted ? `
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      They may reach out to you directly to discuss next steps. Check your email and phone for messages.
    </p>
    ` : `
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Don&apos;t be discouraged &mdash; there are many providers looking for student caregivers.
      Keep your profile updated and keep applying.
    </p>
    `}
    <p style="margin:0;">
      ${button("Browse More Opportunities", `${BASE_URL}/medjobs`)}
    </p>
  `);
}

export function newCandidateAlertEmail({
  providerName,
  candidates,
}: {
  providerName: string;
  candidates: Array<{
    name: string;
    university: string;
    programTrack: string;
    slug: string;
  }>;
}): string {
  const candidateRows = candidates
    .map(
      (c) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
        <p style="font-size:14px;color:#111827;font-weight:600;margin:0;">${escapeHtml(c.name)}</p>
        <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">${escapeHtml(c.university)} &middot; ${escapeHtml(c.programTrack)}</p>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:right;">
        <a href="${escapeHtml(`${BASE_URL}/medjobs/candidates/${c.slug}`)}" style="font-size:13px;color:${BRAND_COLOR};text-decoration:none;font-weight:600;">View</a>
      </td>
    </tr>`
    )
    .join("");

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">New Candidates This Week</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${providerName ? escapeHtml(providerName) : "there"}, here are the newest student caregivers near you on Olera MedJobs.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;">
      ${candidateRows}
    </table>
    <p style="margin:20px 0 0;">
      ${button("Browse All Candidates", `${BASE_URL}/medjobs/candidates`)}
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `${candidates.length} new student candidates near you`);
}

export function profileIncompleteNudgeEmail({
  studentName,
  completeness,
  missingItems,
  magicLink,
}: {
  studentName: string;
  completeness: number;
  missingItems: string[];
  magicLink?: string;
}): string {
  const completeProfileUrl = magicLink || `${BASE_URL}/portal/medjobs/profile`;
  const safeName = escapeHtml(firstName(studentName, "there"));
  const itemsList = missingItems
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Complete Your Profile</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${safeName}, your MedJobs profile is ${completeness}% complete.
      Students with complete profiles get significantly more responses from providers.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px;font-weight:600;">
      Missing:
    </p>
    <ul style="font-size:14px;color:#6b7280;margin:0 0 20px;padding-left:20px;line-height:1.8;">
      ${itemsList}
    </ul>
    <p style="margin:0;">
      ${button("Complete Your Profile", completeProfileUrl)}
    </p>
  `);
}

// ── Provider Templates ────────────────────────────────────────────

/**
 * Sent when a provider successfully subscribes to MedJobs Pro ($49/mo).
 * Confirms their subscription and highlights what's now unlocked.
 */
export function providerSubscriptionConfirmationEmail({
  providerName,
}: {
  providerName: string;
}): string {
  const safeFirstName = escapeHtml(firstName(providerName, "there"));

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome to MedJobs Pro!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${safeFirstName}, thank you for subscribing to MedJobs Pro. Your subscription is now active.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:16px;width:100%;margin:0 0 16px;">
      <tr><td>
        <p style="font-size:13px;font-weight:600;color:#166534;margin:0 0 8px;">What&apos;s now unlocked:</p>
        <ul style="font-size:13px;color:#166534;margin:0;padding-left:16px;line-height:1.8;">
          <li><strong>Full candidate profiles</strong> &mdash; names, contact info, resumes</li>
          <li><strong>Unlimited interview scheduling</strong> &mdash; no credit limits</li>
          <li><strong>LinkedIn profiles</strong> &mdash; view candidate backgrounds</li>
          <li><strong>Unlimited review requests</strong> &mdash; grow your Google reviews</li>
        </ul>
      </td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:0 0 16px;">
      <tr><td>
        <p style="font-size:13px;color:#6b7280;margin:0 0 4px;">Your plan</p>
        <p style="font-size:15px;color:#111827;font-weight:600;margin:0;">MedJobs Pro &mdash; $49/month</p>
        <p style="font-size:12px;color:#9ca3af;margin:4px 0 0;">Cancel anytime from your account settings</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;">
      ${button("Browse Candidates", `${BASE_URL}/medjobs/candidates`)}
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, "Your MedJobs Pro subscription is now active");
}

// ── Invitation Templates ──────────────────────────────────────────

/**
 * Sent to the student when a provider invites them to apply for a job posting.
 */
export function invitationReceivedEmail({
  studentName,
  providerName,
  jobTitle,
  hoursLabel,
  payRange,
}: {
  studentName: string;
  providerName: string;
  jobTitle: string;
  hoursLabel: string;
  payRange: string;
}): string {
  const safeStudentName = escapeHtml(firstName(studentName, "there"));
  const safeProviderName = escapeHtml(providerName);
  const safeJobTitle = escapeHtml(jobTitle);

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">You've been invited to apply!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${safeStudentName}, <strong>${safeProviderName}</strong> thinks you'd be a great fit for a role and wants you to check it out.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;width:100%;margin:0 0 16px;">
      <tr><td style="padding:16px;">
        <p style="font-size:15px;color:#111827;font-weight:600;margin:0 0 4px;">${safeJobTitle}</p>
        <p style="font-size:13px;color:#6b7280;margin:0;">${escapeHtml(hoursLabel)} &middot; ${escapeHtml(payRange)}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;">
      ${button("View Invitation", `${BASE_URL}/medjobs/jobs`)}
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `${safeProviderName} invited you to apply for ${safeJobTitle}`);
}

/**
 * Confirmation sent to the provider after they invite a student.
 */
export function invitationSentEmail({
  providerName,
  studentName,
  jobTitle,
}: {
  providerName: string;
  studentName: string;
  jobTitle: string;
}): string {
  const safeProviderName = escapeHtml(firstName(providerName, "there"));
  const safeStudentName = escapeHtml(studentName);
  const safeJobTitle = escapeHtml(jobTitle);

  return layout(`
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px;">Invite Sent!</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      Hi ${safeProviderName}, your invitation to <strong>${safeStudentName}</strong> for
      <strong>${safeJobTitle}</strong> has been sent. They'll get an email with the details.
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
      If they're interested, they'll apply and show up in your hiring dashboard.
      You can also message them directly from your inbox.
    </p>
    <p style="margin:0 0 16px;">
      ${button("Browse More Candidates", `${BASE_URL}/medjobs/candidates`)}
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:0;line-height:1.5;">
      Questions? <a href="${BASE_URL}/contact" style="color:#9ca3af;text-decoration:underline;">Contact us</a>
    </p>
  `, `Your invite to ${safeStudentName} was sent`);
}

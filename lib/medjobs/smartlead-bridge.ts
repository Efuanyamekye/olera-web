/**
 * Smartlead Bridge — pure helpers (build-order step 1 of
 * docs/medjobs/SMARTLEAD_BRIDGE_SPEC.md).
 *
 * Maps MedJobs CRM rows → Smartlead leads, builds the email-only drip
 * sequence from the existing provider cadence, and filters the eligible
 * set (state / suppression / verification / dedupe).
 *
 * NO network, NO DB. The live orchestration (`launchCampaign`) and the
 * `schedule_sequence` integration are later, separately-revertable steps.
 * Everything here is pure so it can be exercised without the Smartlead key.
 *
 * Channel split (the load-bearing invariant): Smartlead owns the EMAIL
 * drip only. The provider cadence interleaves phone days (3, 5 under
 * v10 — was 0, 1, 5 pre-v10) which stay as CRM `outreach_followup_call`
 * tasks; only the email days (0 `provider_intro`, 3 `provider_followup`,
 * 7 `provider_final`) become Smartlead sequence steps.
 */

import {
  addLeads,
  attachEmailAccounts,
  createCampaign,
  ensureMedjobsCampaignWebhook,
  getLeadByEmail,
  listEmailAccounts,
  pauseLeadInCampaign,
  saveSequence,
  setCampaignSchedule,
  setCampaignStatus,
  type EnsureWebhookResult,
  type SmartleadLead,
  type SmartleadSequenceStep,
} from "@/lib/smartlead";
import { OUTREACH_DAYS_BY_TYPE, type CadenceKey } from "@/lib/student-outreach/cadence";
import { bodyToHtml } from "@/lib/student-outreach/email-markdown";
import { CALENDLY_URL, PROGRAM_URL, CANDIDATES_URL, partnerLandingUrl, isDoctorTitle, getTemplate, salutationFor } from "@/lib/student-outreach/templates";
import { buildWelcomeUrl, buildPartnerPortalUrl } from "@/lib/medjobs/welcome-token";
import { studentApplyUrl } from "@/lib/medjobs/apply-link";
import type { Status, StakeholderType } from "@/lib/student-outreach/types";

export type BridgeKind = "provider" | "student_org" | "advisor" | "dept_head" | "professor";

/**
 * A Specific (Named) Contact attached to an outreach row. Each named
 * contact becomes its OWN Smartlead lead alongside the General Contact —
 * the per-recipient fan-out the Resend path always did. Assembled by the
 * caller from `student_outreach_contacts`, filtered to active rows with a
 * usable email and excluding "General Office"/"General Inbox" (those are
 * the org-level General Contact, handled separately).
 */
export interface NamedContact {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  /** Formal title (e.g. "Dr.", "Prof."). Drives the `{{salutation}}` merge
   *  field for dept_head + professor stakeholder cadences — without it
   *  formal recipients still get "Dear <Last>," fallback, not "Hi <First>,". */
  title?: string | null;
  role: string | null;
  suppressed?: boolean;
}

/**
 * The minimal per-row data the bridge needs, assembled by the caller from
 * the DrawerContext. Decoupled from the full CRM row shape on purpose —
 * mirrors how `planSequence` takes a `SequencerInput`, not raw DB rows —
 * so these helpers stay pure and the coupling lives in the (later)
 * route.ts integration step.
 */
export interface BridgeRow {
  outreach_id: string;
  kind: BridgeKind;
  status: Status;
  organization_name: string;
  city: string | null;
  /** Effective General Contact email (override ?? directory fallback), resolved by the caller. */
  email: string | null;
  first_name: string | null;
  /** `research_data.smartlead.campaign_id` already set → already enrolled. */
  already_enrolled: boolean;
  /** In the shared bounce/complaint suppression set (same one Resend honors). */
  suppressed?: boolean;
  /** Specific Contacts attached to this outreach row. Each becomes an
   *  additional Smartlead lead with first_name/salutation per-lead and a
   *  contact_id in custom_fields for D2 webhook attribution. Optional;
   *  empty list = General Contact only (legacy behavior). */
  contacts?: NamedContact[];
}

export interface CampusContext {
  name: string;
  city: string | null;
  /** Campus slug — drives the campus-specific program PDF URL baked into
   *  the body (`/api/medjobs/program-pdf?university=<slug>`). Optional for
   *  callers that don't have it yet (the PDF link is omitted in that case). */
  slug?: string | null;
}

export type SkipReason =
  | "terminal_status"
  | "already_in_flight"
  | "already_enrolled"
  | "no_email"
  | "suppressed";

export interface SelectionResult {
  eligible: BridgeRow[];
  /** Every exclusion is reported — no silent drops (spec §4). */
  skipped: { outreach_id: string; reason: SkipReason }[];
}

const TERMINAL: ReadonlySet<Status> = new Set<Status>([
  "not_interested",
  "do_not_contact",
  "wrong_contact",
  "redirected",
]);

const IN_FLIGHT: ReadonlySet<Status> = new Set<Status>([
  "engaged",
  "meeting_scheduled",
  "active_partner",
]);

/**
 * Filter rows down to those safe to enroll into a cold campaign, with a
 * reason for every exclusion. Order matters: the first failing check wins,
 * so a terminal row is reported as `terminal_status` even if it also lacks
 * an email.
 *
 * `no_email` here means the row has NO General Contact email AND no
 * usable Specific Contact emails — i.e. nothing to send to. Lead-level
 * dedupe across the batch runs in `rowsToLeads` after fan-out, since it
 * needs to compare every produced email (General + Named) against every
 * other.
 */
export function selectEligibleRows(rows: BridgeRow[]): SelectionResult {
  const eligible: BridgeRow[] = [];
  const skipped: { outreach_id: string; reason: SkipReason }[] = [];

  for (const row of rows) {
    let reason: SkipReason | null = null;

    // NOTE: email verification is intentionally NOT a gate in the medjobs
    // flow. ZeroBounce verdicts still exist for non-medjobs uses (family /
    // provider nudges, digests) but never block cold/activation enrollment
    // here — admins decide reachability. There is no `unverified_email` skip.
    if (TERMINAL.has(row.status)) reason = "terminal_status";
    else if (IN_FLIGHT.has(row.status)) reason = "already_in_flight";
    else if (row.already_enrolled) reason = "already_enrolled";
    else if (!hasAnyUsableEmail(row)) reason = "no_email";
    else if (row.suppressed && !hasUsableNamedContact(row)) reason = "suppressed";

    if (reason) skipped.push({ outreach_id: row.outreach_id, reason });
    else eligible.push(row);
  }

  return { eligible, skipped };
}

function hasAnyUsableEmail(row: BridgeRow): boolean {
  if (row.email && row.email.trim()) return true;
  return hasUsableNamedContact(row);
}

function hasUsableNamedContact(row: BridgeRow): boolean {
  // No email_verdict gate — verification never blocks medjobs enrollment.
  return (row.contacts ?? []).some((c) => c.email && c.email.trim() && !c.suppressed);
}

/**
 * Recipient kind baked into each lead's custom_fields. Used by the D2
 * webhook to attribute reply/bounce events to the right CRM contact and
 * by analytics to slice send-volume by recipient type.
 */
export type RecipientKind = "general" | "named";

/**
 * A single fanned-out lead descriptor. `outreach_id` is the join key for
 * D2 events back to the CRM row; `contact_id` is null for the General
 * Contact lead and set to the `student_outreach_contacts.id` for each
 * Named Contact, so D2 can attribute to the exact contact when a Named
 * Contact replies. `salutation` is the per-lead merge field consumed by
 * the body template — "Hello" for general, "Hi {first_name}" for named.
 */
export interface FannedLead {
  outreach_id: string;
  contact_id: string | null;
  recipient_kind: RecipientKind;
  lead: SmartleadLead;
}

/**
 * Fan a single eligible row out into one lead per recipient: the General
 * Contact (when it has an email) plus each usable Specific Contact. Each
 * Named Contact carries its own `first_name` (so `{{first_name}}` and the
 * `{{salutation}}` merge tag personalize per-lead) and its `contact_id`
 * in custom_fields for D2 webhook attribution.
 *
 * Single-row helper — batch-level dedupe across produced leads happens
 * in `rowsToLeads`, since duplicates can appear across rows (the same
 * provider listed under two campuses) as well as within (e.g. the
 * General Contact email matches a Named Contact email on the same row).
 */
export function rowToLeads(row: BridgeRow, campus: CampusContext): FannedLead[] {
  const leads: FannedLead[] = [];

  // Formal cadences (dept_head + professor) use "Dear Dr. <Last>," via
  // salutationFor; informal cadences (provider + student_org + advisor)
  // use "Hi <First>," for named recipients and "Hello," for general.
  const isFormal = row.kind === "dept_head" || row.kind === "professor";

  // v10 Phase 2+3 Bullet 6 (2026-06-04): per-lead magic-link URL set as
  // a Smartlead custom field. Each recipient (General + Named) gets a
  // unique signed token (jti differs) pointing at the SAME outreach row.
  // When the magic-link secret isn't configured (dev / preview), fall
  // back to PROGRAM_URL — the email still has a working link.
  const magicLinkSecret = process.env.MEDJOBS_MAGIC_LINK_SECRET ?? "";
  // Chunk 6 env guard: a missing secret silently degrades every CTA to the
  // generic PROGRAM_URL (no auth, no campus filter). That's fine for dev but
  // a real misconfiguration in prod — warn loudly, once per launch, so it's
  // visible in logs rather than shipping broken magic links unnoticed.
  if (!magicLinkSecret) {
    console.warn(
      "[smartlead-bridge] MEDJOBS_MAGIC_LINK_SECRET unset — outreach CTAs will " +
        "fall back to PROGRAM_URL (no silent magic-link auth). Set it on this env.",
    );
  }
  const buildWelcomeFor = (email: string): string => {
    if (!magicLinkSecret) return PROGRAM_URL;
    try {
      // Partners (stakeholder rows) get the Recruitment Partner Portal link in
      // their cold email so they can learn more, share the flyer, add
      // colleagues, and self-activate. Providers get the provider magic link.
      return row.kind === "provider"
        ? buildWelcomeUrl({ outreach_id: row.outreach_id, email }, magicLinkSecret)
        : buildPartnerPortalUrl({ outreach_id: row.outreach_id, email }, magicLinkSecret);
    } catch (e) {
      console.error(
        "[smartlead-bridge] buildWelcomeUrl failed:",
        e instanceof Error ? e.message : e,
      );
      return PROGRAM_URL;
    }
  };

  // Per-row student apply link: campus pre-filled + attributed to THIS row's
  // outreach id, so applies that come through a partner's shared link count for
  // that partner. Same for both leads on the row.
  const applyUrl = studentApplyUrl({
    campusSlug: campus.slug ?? null,
    universityName: campus.name,
    partnerOutreachId: row.outreach_id,
    source: "partner_email",
  });

  const generalEmail = row.email?.trim();
  if (generalEmail && !row.suppressed) {
    leads.push({
      outreach_id: row.outreach_id,
      contact_id: null,
      recipient_kind: "general",
      lead: {
        email: generalEmail,
        first_name: row.first_name?.trim() || "",
        company_name: row.organization_name,
        custom_fields: {
          campus: campus.name,
          catchment_city: row.city ?? campus.city ?? "",
          outreach_id: row.outreach_id,
          recipient_kind: "general",
          contact_id: "",
          role: "",
          // General Contact is the org-level email (no person), so even for
          // formal cadences the greeting stays neutral.
          salutation: "Hello",
          welcome_url: buildWelcomeFor(generalEmail),
          apply_url: applyUrl,
        },
      },
    });
  }

  for (const c of row.contacts ?? []) {
    const email = c.email?.trim();
    if (!email) continue;
    if (c.suppressed) continue;
    const firstName = c.first_name?.trim() || "";
    const lastName = c.last_name?.trim() || "";
    const salutation = isFormal
      ? `Dear ${salutationFor(
          row.kind === "dept_head" ? "dept_head" : "professor",
          c.first_name,
          c.last_name,
          c.title ?? null,
        )}`
      : isDoctorTitle(c.title)
        ? lastName
          ? `Hello Dr. ${lastName}`
          : "Hello"
        : firstName
          ? `Hi ${firstName}`
          : "Hello";
    leads.push({
      outreach_id: row.outreach_id,
      contact_id: c.contact_id,
      recipient_kind: "named",
      lead: {
        email,
        first_name: firstName,
        company_name: row.organization_name,
        custom_fields: {
          campus: campus.name,
          catchment_city: row.city ?? campus.city ?? "",
          outreach_id: row.outreach_id,
          recipient_kind: "named",
          contact_id: c.contact_id,
          role: c.role ?? "",
          salutation,
          welcome_url: buildWelcomeFor(email),
          apply_url: applyUrl,
        },
      },
    });
  }

  return leads;
}

/**
 * Fan a batch of eligible rows out into per-recipient leads with
 * cross-row dedupe (the same email can appear on two different rows when
 * a provider is in multiple campuses, and even within one row when the
 * General Contact and a Named Contact share an inbox). First occurrence
 * wins — General Contact takes precedence over Named within a single row
 * because of insertion order in `rowToLeads`.
 */
export interface FanOutResult {
  leads: FannedLead[];
  duplicates: { outreach_id: string; email: string; contact_id: string | null }[];
}

export function rowsToLeads(rows: BridgeRow[], campus: CampusContext): FanOutResult {
  const seen = new Set<string>();
  const leads: FannedLead[] = [];
  const duplicates: { outreach_id: string; email: string; contact_id: string | null }[] = [];

  for (const row of rows) {
    for (const fanned of rowToLeads(row, campus)) {
      const key = fanned.lead.email.toLowerCase();
      if (seen.has(key)) {
        duplicates.push({
          outreach_id: fanned.outreach_id,
          email: fanned.lead.email,
          contact_id: fanned.contact_id,
        });
        continue;
      }
      seen.add(key);
      leads.push(fanned);
    }
  }

  return { leads, duplicates };
}

/**
 * Smartlead merge tags for the per-lead fields. We pass these AS the
 * `organization_name`/`campus_name` context values to `getTemplate`, so the
 * rendered body carries the tags verbatim for Smartlead to fill per lead.
 * `MERGE_SALUTATION` is the per-lead greeting custom field set in
 * `rowToLeads` — "Hello" for General Contact, "Hi <first>" for Named.
 */
const MERGE_COMPANY = "{{company_name}}";
const MERGE_CAMPUS = "{{campus}}";
const MERGE_SALUTATION = "{{salutation}}";

export interface SequenceOptions {
  /** Sender first name woven into the copy. Defaults to "Graize". */
  adminFirstName?: string;
  /** Campus slug — used to bake a campus-specific program PDF link into
   *  the body. Smartlead can't attach files to automated campaign sends
   *  (confirmed via API + help-center docs), so the PDF goes as a hosted
   *  link instead. Without a slug, the body's "attached information
   *  packet" phrasing is rewritten to a neutral fallback. */
  campusSlug?: string | null;
  /** Activation audience — partner (advisor) copy vs provider. */
  isPartner?: boolean;
  /** Row's real stakeholder type — drives per-type partner activation /
   *  welcome copy. Falls back to "student_org" when absent. Inert for cold
   *  stakeholder cadences (they pass the type as the cadenceKey itself). */
  stakeholderType?: StakeholderType | null;
}

/**
 * Build the Smartlead email sequence from a cadence's EMAIL days only.
 * Delays are relative to the previous email step (Smartlead's model), so
 * the provider cadence's email days 0/3/7 become delays 0/3/4.
 *
 * One sequence covers every lead in the campaign: campus + company arrive
 * as Smartlead merge tags, so there is no per-row body baking (unlike the
 * Resend per-recipient path).
 */
export function buildEmailSequence(
  cadenceKey: CadenceKey = "provider",
  opts: SequenceOptions = {},
): SmartleadSequenceStep[] {
  // For provider templates, stakeholder_type is inert (provider templates
  // branch on `variant`, not stakeholder_type). For stakeholder templates,
  // the type drives greeting formality — "Dear Dr. <Last>," for dept_head
  // and professor, "Hi <First>," for student_org and advisor. We pass the
  // actual cadence-derived type so each stakeholder cadence gets the right
  // greeting baked into the body before the per-lead {{salutation}}
  // substitution takes over.
  const ctxStakeholderType: StakeholderType =
    cadenceKey === "activation" || cadenceKey === "partner_welcome"
      ? opts.stakeholderType ?? "student_org"
      : cadenceKey === "provider"
        ? "student_org"
        : cadenceKey;
  const ctx = {
    stakeholder_type: ctxStakeholderType,
    organization_name: MERGE_COMPANY,
    campus_name: MERGE_CAMPUS,
    admin_first_name: opts.adminFirstName ?? "Graize",
    // We start from the GENERAL variant body so a single sequence works
    // for both General and Named recipients; the greeting is replaced
    // below by the per-lead `{{salutation}}` merge tag, which renders to
    // "Hello," for the General Contact and "Hi <first>," for a Named
    // Contact. The general-variant body is also semantically valid for
    // a Named recipient (it doesn't bake the recipient's name into the
    // body copy itself), so one sequence covers both per-lead salutations
    // without duplicating the campaign.
    variant: "general" as const,
    // Activation copy audience (partner vs provider). Inert for cold cadences.
    is_partner: opts.isPartner ?? false,
    contacts: [],
  };

  // Which program PDF this cadence links: provider cadences (cold provider +
  // non-partner activation) link the agency brochure; everything partner-facing
  // (stakeholder cold, partner activation, partner welcome) links the student
  // flyer that partners share with students.
  const pdfAudience: "provider" | "student" =
    cadenceKey === "provider" || (cadenceKey === "activation" && !(opts.isPartner ?? false))
      ? "provider"
      : "student";

  // Logan's signature "Student Caregiver Program" link follows the same
  // audience bucket as the body + flyer: provider cadences point to the
  // provider landing; student-side cadences point to the program/families page
  // (advisors/dept-heads/professors → the "For advisors, faculty & student
  // orgs" section, student orgs → the families page).
  const programLandingUrl =
    pdfAudience === "provider" ? PROGRAM_URL : partnerLandingUrl(ctxStakeholderType);

  const days = OUTREACH_DAYS_BY_TYPE[cadenceKey];
  const steps: SmartleadSequenceStep[] = [];
  let prevEmailDay = 0;
  let seq = 0;

  for (const day of days) {
    for (const step of day.steps) {
      if (step.channel !== "email" || !step.template) continue;
      seq += 1;
      const draft = getTemplate(step.template, ctx);
      const adminFirstName = opts.adminFirstName ?? "Graize";
      steps.push({
        seq_number: seq,
        seq_delay_details: { delay_in_days: seq === 1 ? 0 : day.day - prevEmailDay },
        subject: finalizeTokens(draft.subject, adminFirstName),
        email_body: toSmartleadHtml(draft.body, adminFirstName, opts.campusSlug ?? null, pdfAudience, programLandingUrl),
      });
      prevEmailDay = day.day;
    }
  }

  return steps;
}

/**
 * Resolve the template tokens. `getTemplate` returns copy with tokens
 * UNSUBSTITUTED ({organization_name}, {campus_name}, {first_name}, URLs) —
 * the Resend path fills them at send time via substituteVars. We do the
 * same here, but the per-lead fields become Smartlead merge tags instead of
 * concrete values, and the URLs/admin name resolve to constants.
 *
 * v9.x Named-Contact fan-out: the greeting line in the general-variant
 * body is "Hello," — we rewrite it to `{{salutation}},` so the same
 * sequence renders correctly for both General Contact ("Hello,") and
 * Named ("Hi Jamie,") recipients via the per-lead `salutation` custom
 * field set in `rowToLeads`. `{first_name}` falls back to a Smartlead tag
 * so any template emitting it (named-variant templates routed through
 * here) personalize per-lead.
 */
function finalizeTokens(text: string, adminFirstName: string): string {
  // Stakeholder templates emit "Hi {salutation}," (informal cadences) or
  // "Dear {salutation}," (formal cadences); provider templates emit a
  // literal "Hello,". The per-lead {{salutation}} custom field carries
  // the COMPLETE greeting form ("Hi Logan" / "Dear Dr. Jones" / "Hello").
  // Strip the body-baked "Hi "/"Dear " prefix before {salutation} so the
  // merge tag substitutes the whole greeting once, not twice. Order
  // matters: do the prefix-strip BEFORE replacing {salutation} with
  // {{salutation}}.
  return text
    .replace(/\{organization_name\}/g, MERGE_COMPANY)
    .replace(/\{campus_name\}/g, MERGE_CAMPUS)
    .replace(/\{admin_first_name\}/g, adminFirstName)
    // Carry the outreach_id on the Calendly link so a self-booked meeting
    // correlates deterministically in the Calendly webhook (tracking.utm_content
    // → outreach row); the {{outreach_id}} merge field is set per-lead.
    .replace(/\{calendly_url\}/g, `${CALENDLY_URL}?utm_content={{outreach_id}}`)
    .replace(/\{program_url\}/g, PROGRAM_URL)
    // v10 Phase 2+3 Bullet 6 (2026-06-04): per-lead welcome URL set in
    // rowToLeads as custom_fields.welcome_url. Smartlead substitutes
    // the {{welcome_url}} merge tag at send time.
    .replace(/\{welcome_url\}/g, "{{welcome_url}}")
    // Chunk 5: per-lead PUBLIC board link for the cold provider cadence. Carries
    // the row's outreach_id (already a custom field) + screener=1 so the landing
    // pre-locks the eligibility screener to the provider's own directory listing
    // — no auth token, so cold deliverability is unaffected.
    .replace(
      /\{board_url\}/g,
      `${CANDIDATES_URL}?outreach_id={{outreach_id}}&screener=1`,
    )
    // Per-lead application link (campus + that row's outreach id) set in
    // rowToLeads as custom_fields.apply_url. Lets a partner-shared link trace
    // applies back to the org that shared it.
    .replace(/\{apply_url\}/g, "{{apply_url}}")
    .replace(/\{first_name\}/g, "{{first_name}}")
    .replace(/(^|\n)(Hi|Dear) \{salutation\}/g, `$1{salutation}`)
    .replace(/\{salutation\}/g, MERGE_SALUTATION)
    // The provider general-variant body opens with a literal "Hello,". Rewrite
    // it to the salutation merge tag so the per-lead value drives the
    // greeting; the rest of the body stays neutral (no name-baked references)
    // so it reads naturally for both General Contact (Hello,) and Named
    // (Hi <First>, / Dear Dr. <Last>,) recipients.
    .replace(/(^|\n)Hello,/g, `$1${MERGE_SALUTATION},`);
}

// Email-client image hosts: olera.care/images/* is WAF-challenged (429) for
// non-browser fetches, so signature photos there silently fail to render in
// inboxes. Default to the Supabase public bucket (same host the Resend family
// templates use; both assets verified 200). Env overrides still win.
const LOGAN_PHOTO_URL =
  process.env.STUDENT_OUTREACH_LOGAN_PHOTO_URL ??
  "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/team/logan.jpg";
const GRAZIE_PHOTO_URL =
  process.env.STUDENT_OUTREACH_GRAZIE_PHOTO_URL ??
  "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/team/grazie.png";

/**
 * Smartlead-side outreach footer. Mirrors `email-send.ts:composeFooterHtml`
 * with two cold-channel adjustments:
 *
 *   - Grazie's signature email line removed (no graize@findmedjobs.co
 *     handle yet; when one exists, restore the line).
 *   - "Reply STOP" line removed. Smartlead injects its own native
 *     one-click unsubscribe link below the body which maps to the
 *     EMAIL_UNSUBSCRIBE webhook → status=do_not_contact (compliance).
 *
 * Structure: Best, → Graize block → divider → "Message Approved" → Logan
 * block. Matches the Resend ordering.
 */
function composeSmartleadFooterHtml(flyerUrl: string, programLandingUrl: string): string {
  return [
    `<p style="margin:16px 0 4px;font-size:13px;line-height:1.5;color:#374151;font-family:Inter,Arial,sans-serif;">Best,</p>`,
    `<p style="margin:0;font-size:13px;line-height:1.5;color:#374151;font-family:Inter,Arial,sans-serif;">Graize</p>`,
    grazieSignatureHtml(flyerUrl),
    `<hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />`,
    `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6b7280;font-family:Inter,Arial,sans-serif;">Message Approved by Dr. Logan DuBose, MD/MBA</p>`,
    loganSignatureHtml(programLandingUrl),
  ].join("\n");
}

function loganSignatureHtml(programLandingUrl: string): string {
  return `
<table cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr>
    <td style="vertical-align:top;padding-right:16px;">
      <img src="${LOGAN_PHOTO_URL}" alt="Dr. Logan DuBose" width="100" height="100" style="border-radius:8px;display:block;" />
    </td>
    <td style="vertical-align:top;font-size:13px;line-height:1.5;color:#374151;font-family:Inter,Arial,sans-serif;">
      <p style="margin:0 0 4px;font-weight:600;color:#111827;">Dr. Logan DuBose, MD, MBA</p>
      <p style="margin:0 0 2px;">Chief Research Officer (CRO), <a href="https://www.olera.care" style="color:#059669;">Olera</a></p>
      <p style="margin:0 0 2px;">Researcher funded by the National Institutes of Health Small Business Innovation Research (SBIR) Program</p>
      <p style="margin:0 0 2px;">Texas A&amp;M College of Medicine, Class of 2022</p>
      <p style="margin:0 0 2px;">General Practitioner, Fredericksburg Christian Health Clinic, Virginia</p>
      <p style="margin:0 0 8px;">Director, <a href="${programLandingUrl}" style="color:#059669;">Student Caregiver Program</a></p>
      <p style="margin:0;">
        <a href="${CALENDLY_URL}?utm_content={{outreach_id}}" style="color:#059669;font-weight:500;">Schedule a meeting with Dr. DuBose →</a>
      </p>
    </td>
  </tr>
</table>`;
}

function grazieSignatureHtml(flyerUrl: string): string {
  return `
<table cellpadding="0" cellspacing="0" style="margin-top:6px;">
  <tr>
    <td style="vertical-align:top;padding-right:16px;">
      <img src="${GRAZIE_PHOTO_URL}" alt="Graize Belandres" width="100" height="100" style="border-radius:8px;display:block;" />
    </td>
    <td style="vertical-align:top;font-size:13px;line-height:1.5;color:#374151;font-family:Inter,Arial,sans-serif;">
      <p style="margin:0 0 4px;font-weight:600;color:#111827;">Graize Belandres</p>
      <p style="margin:0 0 2px;">Assistant to Dr. Logan DuBose</p>
      <p style="margin:0;"><a href="${flyerUrl}" style="color:#059669;">Program flyer</a></p>
    </td>
  </tr>
</table>`;
}

/**
 * Markdown → HTML for the Smartlead body. Uses the SHARED renderer
 * (`email-markdown.ts:bodyToHtml`) so the cold channel produces body HTML
 * structurally identical to the Resend path.
 *
 * Two Smartlead-specific transforms before the shared renderer runs:
 *
 *   1. "Attached information packet" → "Program packet (linked below)".
 *      Smartlead's API does not support file attachments on automated
 *      campaign sends (verified against api.smartlead.ai/llms.txt + the
 *      Save Sequence reference + the Master Inbox attachments help
 *      article, which limits attachments to inbox REPLIES). The packet
 *      ships as a hosted-PDF link instead.
 *
 *   2. Append a "Program details (PDF): <campus-specific URL>" line
 *      after the body but before the signature so the recipient has
 *      a clear path to download. URL pattern matches the existing
 *      hosted endpoint at /api/medjobs/program-pdf?university=<slug>.
 *      When `campusSlug` is null (preview without a campus or fallback),
 *      the link line is omitted.
 */
function toSmartleadHtml(
  body: string,
  adminFirstName: string,
  campusSlug: string | null,
  pdfAudience: "provider" | "student" = "provider",
  programLandingUrl: string = PROGRAM_URL,
): string {
  // Partner/student-org/welcome emails link the STUDENT flyer (what partners
  // share with students); provider emails link the agency brochure.
  const pdfUrl = campusSlug
    ? `https://olera.care/api/medjobs/program-pdf?university=${campusSlug}&audience=${pdfAudience}`
    : PROGRAM_URL;
  // Templates that place the program PDF inline use the {program_pdf} token;
  // we fill it here (per-campaign slug). Stakeholder templates still say
  // "attached information packet" — rewrite that + append the link instead.
  const hasInlinePdf = /\{program_pdf\}/.test(body);
  // Only auto-append the PDF link for templates that actually reference the
  // packet (the "information packet" phrasing). Newer templates either inline
  // {program_pdf} where they want the flyer, or intentionally carry no flyer
  // (e.g. the one-line bump) — those must NOT get a packet link appended.
  const mentionsPacket = /information packet/i.test(body);
  let rewritten = body
    .replace(/\{program_pdf\}/g, pdfUrl)
    .replace(/The attached information packet/g, "The program packet (linked below)")
    .replace(/the attached information packet/g, "the program packet (linked below)");
  if (campusSlug && !hasInlinePdf && mentionsPacket) {
    rewritten += `\n\nProgram details (PDF): ${pdfUrl}`;
  }
  const bodyHtml = bodyToHtml(finalizeTokens(rewritten, adminFirstName));
  // Signatures: Graize's "Program flyer" → audience-aware PDF; Logan's
  // "Student Caregiver Program" → audience-aware landing page.
  return bodyHtml + composeSmartleadFooterHtml(pdfUrl, programLandingUrl);
}

// ── Server-side preview rendering (no network) ───────────────────────────

/**
 * Apply sample substitutions to a Smartlead-rendered string so the admin
 * sees what a real recipient will see — not raw merge tags. Sample values
 * come from the actual outreach row + campus + first Named Contact (or a
 * neutral fallback), so the preview reflects this row's data:
 *   {{salutation}}   → first contact's "Hi <First>" or "Hello"
 *   {{company_name}} → outreach row's organization_name
 *   {{campus}}       → campus.name
 *   {{first_name}}   → first Named Contact's first_name (or "there")
 */
function substituteSmartleadSample(
  text: string,
  sample: { salutation: string; company: string; campus: string; first_name: string },
): string {
  return text
    .replace(/\{\{\s*salutation\s*\}\}/g, sample.salutation)
    .replace(/\{\{\s*company_name\s*\}\}/g, sample.company)
    .replace(/\{\{\s*campus\s*\}\}/g, sample.campus)
    .replace(/\{\{\s*first_name\s*\}\}/g, sample.first_name);
}

export interface SmartleadPreviewRecipient {
  contact_id: string | null;
  recipient_kind: RecipientKind;
  name: string;
  email: string;
  role: string | null;
  /** Per-lead {{salutation}} value — "Hello" or "Hi <first>". */
  salutation: string;
}

export interface SmartleadPreviewStep {
  seq_number: number;
  /** Days from previous step (Smartlead's model). seq_number=1 is delay 0. */
  delay_in_days: number;
  /** Cadence day this step maps to (0/3/7 for provider). */
  cadence_day: number;
  /** Raw subject with `{{...}}` merge tags intact. */
  subject_template: string;
  /** Subject after sample substitution — what the recipient will see. */
  subject_preview: string;
  /** Raw HTML body with `{{...}}` merge tags intact. */
  body_html_template: string;
  /** Body HTML after sample substitution — what the recipient will see. */
  body_html_preview: string;
}

export interface SmartleadPreview {
  campaign_name: string;
  recipients: SmartleadPreviewRecipient[];
  steps: SmartleadPreviewStep[];
  /** Sample lead used to render the previews — surfaced so admin can see
   *  whose name is in the preview ("Hi Susan, …" vs "Hello, …"). */
  sample_used: {
    salutation: string;
    first_name: string;
    company: string;
    campus: string;
  };
  /** Sender pool that will rotate per Smartlead. Resolved from
   *  SMARTLEAD_SENDER_EMAILS at preview time. Empty when unset (the
   *  campaign will inherit whatever mailboxes are connected in the
   *  Smartlead account). */
  sender_pool: string[];
}

/**
 * Build a server-side Smartlead preview for the pre-flight modal. Pure
 * (no network, no DB) — caller assembles the BridgeRow + campus + named
 * contacts the same way `enrollRowIntoSmartlead` does, plus an admin name
 * + cadence + campaign-name pattern. The result is shipped to the client
 * via DrawerContext.smartlead_preview so the modal renders WHAT WILL BE
 * SENT, including per-recipient salutation and Day 0/3/7 schedule.
 */
export function buildSmartleadPreview(input: {
  row: BridgeRow;
  campus: CampusContext;
  campaignName: string;
  cadenceKey?: CadenceKey;
  adminFirstName?: string;
  senderEmails?: string[];
  /** Row's stakeholder type — needed so an ACTIVATION preview renders the
   *  correct partner landing (advisor/dept_head → families#help, student_org →
   *  families). Without it the preview defaults to student_org and shows the
   *  wrong link, even though the actual send is correct. */
  stakeholderType?: StakeholderType | null;
}): SmartleadPreview {
  const fanned = rowToLeads(input.row, input.campus);

  // Map contact_id → full Name (First Last) so the preview shows whole names
  // even though the Smartlead lead only carries first_name.
  const contactNameById = new Map<string, string>();
  for (const c of input.row.contacts ?? []) {
    const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    contactNameById.set(c.contact_id, full || c.email);
  }
  const recipients: SmartleadPreviewRecipient[] = fanned.map((f) => ({
    contact_id: f.contact_id,
    recipient_kind: f.recipient_kind,
    name:
      f.recipient_kind === "general"
        ? input.row.organization_name
        : (f.contact_id && contactNameById.get(f.contact_id)) || f.lead.email,
    email: f.lead.email,
    role: String(f.lead.custom_fields?.role ?? "") || null,
    salutation: String(f.lead.custom_fields?.salutation ?? "Hello"),
  }));

  // Sample for substitution: prefer the first Named Contact's first_name so
  // the preview reads as a "Hi Susan,…" — that's the more illustrative case
  // (a named-recipient send). Fall back to "there" + "Hello" if no named
  // contacts exist, so the preview still renders for General-Contact-only
  // rows.
  const firstNamed = fanned.find((f) => f.recipient_kind === "named");
  const sample = {
    salutation:
      firstNamed && firstNamed.lead.first_name ? `Hi ${firstNamed.lead.first_name}` : "Hello",
    first_name: firstNamed?.lead.first_name || "there",
    company: input.row.organization_name,
    campus: input.campus.name,
  };

  const seq = buildEmailSequence(input.cadenceKey ?? "provider", {
    adminFirstName: input.adminFirstName,
    campusSlug: input.campus.slug ?? null,
    // Partner rows (kind != provider) preview the student flyer link.
    isPartner: input.row.kind !== "provider",
    // Activation previews need the type to render the right partner landing.
    stakeholderType: input.stakeholderType ?? null,
  });
  const days = OUTREACH_DAYS_BY_TYPE[input.cadenceKey ?? "provider"];
  const emailDays = days.filter((d) => d.steps.some((s) => s.channel === "email"));

  const steps: SmartleadPreviewStep[] = seq.map((step, i) => ({
    seq_number: step.seq_number,
    delay_in_days: step.seq_delay_details.delay_in_days,
    cadence_day: emailDays[i]?.day ?? 0,
    subject_template: step.subject,
    subject_preview: substituteSmartleadSample(step.subject, sample),
    body_html_template: step.email_body,
    body_html_preview: substituteSmartleadSample(step.email_body, sample),
  }));

  return {
    campaign_name: input.campaignName,
    recipients,
    steps,
    sample_used: sample,
    sender_pool: input.senderEmails ?? envSenderEmails(),
  };
}

// ── Orchestration (network — drives lib/smartlead) ───────────────────────

/**
 * Smartlead Base plan TOTAL contact-storage cap. The real ceiling on how many
 * leads can live across all campaigns — not a send-rate limit. Lead admission
 * is budgeted against this so we never blow past it silently.
 */
export const SMARTLEAD_CONTACT_CAP = 2000;

/** Smartlead caps the per-request batch (~100); the caller must chunk. */
const LEAD_BATCH_SIZE = 100;

export interface MailboxPool {
  ids: number[];
  warnings: string[];
}

function envSenderEmails(): string[] {
  return (process.env.SMARTLEAD_SENDER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the warmed mailbox pool to attach to a campaign. Reads the live
 * account, filters to the configured sender allowlist (SMARTLEAD_SENDER_EMAILS,
 * comma-separated), and warns for any mailbox whose warmup isn't ACTIVE. IDs
 * are resolved at runtime — never hardcoded (they're account state).
 */
export async function resolveMailboxPool(
  senderEmails?: string[],
): Promise<{ ok: boolean; pool: MailboxPool; error?: string }> {
  const res = await listEmailAccounts();
  if (!res.ok || !res.data) {
    return { ok: false, pool: { ids: [], warnings: [] }, error: res.error ?? "listEmailAccounts failed" };
  }

  const allow = (senderEmails ?? envSenderEmails()).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const accounts = res.data;
  const selected = allow.length
    ? accounts.filter((a) => allow.includes((a.from_email ?? "").toLowerCase()))
    : accounts;

  const warnings: string[] = [];
  if (!allow.length) {
    warnings.push(`No SMARTLEAD_SENDER_EMAILS allowlist set; using all ${accounts.length} connected mailbox(es).`);
  }
  for (const a of selected) {
    const status = a.warmup_details?.status;
    if (status !== "ACTIVE") {
      warnings.push(`Mailbox ${a.from_email} warmup status is ${status ?? "unknown"} (not ACTIVE) — do not START until warm.`);
    }
  }

  if (!selected.length) {
    return { ok: false, pool: { ids: [], warnings }, error: "No mailboxes matched the sender allowlist." };
  }
  return { ok: true, pool: { ids: selected.map((a) => a.id), warnings } };
}

export interface LaunchInput {
  campaignName: string;
  campus: CampusContext;
  rows: BridgeRow[];
  cadenceKey?: CadenceKey;
  senderEmails?: string[];
  adminFirstName?: string;
  /** Existing total contacts already in the Smartlead account, for 2K-cap
   *  accounting. Caller supplies; defaults to 0. */
  existingContactCount?: number;
  /** Passed verbatim to setCampaignSchedule; defaults to weekday business hours. */
  schedule?: Record<string, unknown>;
}

export interface LaunchReport {
  ok: boolean;
  campaign_id?: number;
  enrolled: number;
  enrolled_outreach_ids: string[];
  skipped: { outreach_id: string; reason: SkipReason | "over_cap" }[];
  mailbox_warnings: string[];
  errors: { stage: string; message: string }[];
}

function defaultSchedule(): Record<string, unknown> {
  return {
    timezone: "America/Chicago",
    days_of_the_week: [1, 2, 3, 4, 5],
    start_hour: "09:00",
    end_hour: "17:00",
    min_time_btw_emails: 10,
    max_new_leads_per_day: 20,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type StageError = { stage: string; message: string };

/**
 * Provision a fresh campaign: create → attach mailboxes → save sequence.
 * Shared by the batch (`launchCampaign`) and per-row
 * (`enrollRowIntoCampusCampaign`) paths so campaign creation never diverges.
 * Returns the new id (or undefined if create failed) plus non-fatal errors.
 * Preserves the create→attach→saveSequence order validated against the live API.
 */
async function provisionCampaign(
  name: string,
  poolIds: number[],
  steps: SmartleadSequenceStep[],
): Promise<{ campaign_id?: number; errors: StageError[]; webhook?: EnsureWebhookResult }> {
  const errors: StageError[] = [];
  const created = await createCampaign(name);
  if (!created.ok || !created.data) {
    errors.push({ stage: "createCampaign", message: created.error ?? "no campaign id" });
    return { errors };
  }
  const campaignId = created.data.id;
  const attached = await attachEmailAccounts(campaignId, poolIds);
  if (!attached.ok) errors.push({ stage: "attachEmailAccounts", message: attached.error ?? "attach failed" });
  const saved = await saveSequence(campaignId, steps);
  if (!saved.ok) errors.push({ stage: "saveSequence", message: saved.error ?? "save failed" });

  // Wire the reply/open/bounce webhook at birth so events stream into the CRM
  // without a separate manual step (the missing link that left every campaign
  // "No Webhooks Yet"). STRICTLY best-effort: the result is returned in its own
  // channel and NEVER pushed onto `errors`, because callers gate `ok` on
  // `errors.length === 0` and route.ts THROWS on `!ok` — a webhook hiccup must
  // not fail an enrollment whose campaign + leads succeeded. Anything skipped
  // (env unset) or failed here is recoverable via the reconcile endpoint and by
  // the next campaign's provisioning.
  let webhook: EnsureWebhookResult | undefined;
  try {
    webhook = await ensureMedjobsCampaignWebhook(campaignId);
    if (!webhook.ok && webhook.status !== "skipped") {
      console.warn(
        `[smartlead-bridge] webhook registration for campaign ${campaignId} failed: ${webhook.error ?? "unknown"}`,
      );
    }
  } catch (e) {
    console.warn(
      `[smartlead-bridge] webhook registration threw for campaign ${campaignId}:`,
      e instanceof Error ? e.message : e,
    );
  }

  return { campaign_id: campaignId, errors, webhook };
}

/**
 * True when SMARTLEAD_AUTO_START_CAMPAIGNS opts into auto-starting campaigns.
 * Default OFF: with the flag unset, finalizeCampaign leaves campaigns PAUSED —
 * the original warmup/reputation guardrail (§8.1). Accepts "true"/"1" (any case).
 */
function autoStartEnabled(): boolean {
  const v = (process.env.SMARTLEAD_AUTO_START_CAMPAIGNS ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Finalize a freshly provisioned campaign: set schedule, then set status.
 *
 * Status is gated by SMARTLEAD_AUTO_START_CAMPAIGNS (§8.1 "blunter alternative"):
 *   - unset / false → PAUSED (default; a human starts it after warmup sign-off)
 *   - true          → START (campaign goes live the instant leads are enrolled)
 *
 * Called after leads are pushed (the validated order). WARNING: with the flag on,
 * a campaign can start before its mailbox pool is warm — the warmup check in
 * resolveMailboxPool only produces warnings, it does not block START.
 */
async function finalizeCampaign(
  campaignId: number,
  schedule: Record<string, unknown>,
): Promise<StageError[]> {
  const errors: StageError[] = [];
  const sched = await setCampaignSchedule(campaignId, schedule);
  if (!sched.ok) errors.push({ stage: "setCampaignSchedule", message: sched.error ?? "schedule failed" });
  const desiredStatus = autoStartEnabled() ? "START" : "PAUSED";
  const status = await setCampaignStatus(campaignId, desiredStatus);
  if (!status.ok) errors.push({ stage: "setCampaignStatus", message: status.error ?? "status failed" });
  return errors;
}

/**
 * Orchestrate a PAUSED Smartlead campaign from a batch of CRM rows.
 *
 * - Status is gated by SMARTLEAD_AUTO_START_CAMPAIGNS (default off → PAUSED, a
 *   human starts it after warmup + sign-off; on → auto-START on enrollment). See
 *   finalizeCampaign and §8.1.
 * - Does NOT write back to the CRM — that's the schedule_sequence integration
 *   (G4 single-writer).
 * - Aggregates errors into the report instead of throwing, so a partial
 *   failure is visible, not silent. The campaign id is captured before leads
 *   are pushed so a mid-flight failure leaves a recoverable PAUSED campaign.
 */
export async function launchCampaign(input: LaunchInput): Promise<LaunchReport> {
  const report: LaunchReport = {
    ok: false,
    enrolled: 0,
    enrolled_outreach_ids: [],
    skipped: [],
    mailbox_warnings: [],
    errors: [],
  };

  // 1. Resolve warmed mailboxes (fails closed if the key/account is unavailable).
  const mb = await resolveMailboxPool(input.senderEmails);
  report.mailbox_warnings = mb.pool.warnings;
  if (!mb.ok) {
    report.errors.push({ stage: "resolveMailboxPool", message: mb.error ?? "no mailboxes" });
    return report;
  }

  // 2. Filter eligible rows (reason for every exclusion).
  const { eligible, skipped } = selectEligibleRows(input.rows);
  report.skipped = [...skipped];

  // 3. Budget against the 2K storage cap — drop overflow and report it; no silent truncation.
  const available = Math.max(0, SMARTLEAD_CONTACT_CAP - (input.existingContactCount ?? 0));
  let admitted = eligible;
  if (eligible.length > available) {
    admitted = eligible.slice(0, available);
    for (const row of eligible.slice(available)) {
      report.skipped.push({ outreach_id: row.outreach_id, reason: "over_cap" });
    }
  }
  if (!admitted.length) {
    report.errors.push({ stage: "select", message: "No eligible rows to enroll (after filters + cap)." });
    return report;
  }

  // 4. Provision the campaign (create → attach → sequence); capture id immediately.
  const steps = buildEmailSequence(input.cadenceKey ?? "provider", {
    adminFirstName: input.adminFirstName,
    campusSlug: input.campus.slug ?? null,
  });
  const prov = await provisionCampaign(input.campaignName, mb.pool.ids, steps);
  report.errors.push(...prov.errors);
  if (!prov.campaign_id) return report;
  report.campaign_id = prov.campaign_id;
  const campaignId = prov.campaign_id;

  // 5. Fan-out → one lead per recipient (General Contact + each Named
  //    Contact), dedupe across the batch, then push in chunks of 100 (the
  //    engine doesn't chunk). A failed chunk is recorded; the outreach_ids
  //    of rows contributing leads to a successful chunk are recorded as
  //    enrolled even if some of their leads were dedup'd duplicates of
  //    earlier leads in the same batch.
  const fan = rowsToLeads(admitted, input.campus);
  // Group fanned leads back by outreach_id so a chunk failure reports
  // which rows are NOT enrolled.
  const chunks = chunk(fan.leads, LEAD_BATCH_SIZE);
  const successfulRowIds = new Set<string>();
  for (const group of chunks) {
    const leads = group.map((f) => f.lead);
    const res = await addLeads(campaignId, leads);
    if (res.ok) {
      report.enrolled += res.data?.upload_count ?? leads.length;
      for (const f of group) successfulRowIds.add(f.outreach_id);
    } else {
      report.errors.push({ stage: `addLeads[${group.length}]`, message: res.error ?? "addLeads failed" });
    }
  }
  report.enrolled_outreach_ids.push(...successfulRowIds);

  // 6. Schedule + set status per SMARTLEAD_AUTO_START_CAMPAIGNS (validated order: after leads).
  report.errors.push(...(await finalizeCampaign(campaignId, input.schedule ?? defaultSchedule())));

  report.ok = report.errors.length === 0;
  return report;
}

export interface EnrollInput {
  row: BridgeRow;
  campus: CampusContext;
  /** Used only when no campus campaign exists yet (this row is the first). */
  campaignName: string;
  /** The campus's existing Smartlead campaign id(s) for this audience, looked up
   *  by the caller from sibling rows' `research_data.smartlead.campaign_id`. The
   *  lead is added to the first one that STILL EXISTS in Smartlead; a fresh
   *  campaign is provisioned only when the list is empty or every candidate was
   *  deleted (all 404). */
  existingCampaignIds?: number[];
  cadenceKey?: CadenceKey;
  senderEmails?: string[];
  adminFirstName?: string;
  schedule?: Record<string, unknown>;
}

export interface EnrollResult {
  ok: boolean;
  campaign_id?: number;
  /** True when this call provisioned a new campus campaign (the first row). */
  created: boolean;
  enrolled: boolean;
  /** Set when the row was filtered out before any API call (distinct from an error). */
  skipped_reason?: SkipReason;
  mailbox_warnings: string[];
  errors: StageError[];
}

/**
 * Add leads to the first candidate campaign that STILL EXISTS in Smartlead.
 * Tries each id in order:
 *   - success → returns that campaign id (the live one to reuse).
 *   - 404 (campaign was deleted) → moves on to the next candidate.
 *   - any other error → stops and returns it (not a "deleted" case; retrying
 *     other campaigns could double-add).
 * Returns `campaignId: null` (no error) when the list is empty or every
 * candidate is gone — the caller then provisions a fresh campaign. This is what
 * makes reuse correct: one live campaign per (campus, audience), never a
 * duplicate spawned just because a stale id was listed first.
 */
async function addLeadsToExistingCampaign(
  campaignIds: number[],
  leads: SmartleadLead[],
): Promise<{ campaignId: number | null; error?: string }> {
  for (const id of campaignIds) {
    const added = await addLeads(id, leads);
    if (added.ok) return { campaignId: id };
    if (added.status !== 404) {
      return { campaignId: null, error: added.error ?? "addLeads failed" };
    }
    console.warn(
      `[smartlead-bridge] campaign ${id} not found (404) — trying next candidate / will provision fresh`,
    );
  }
  return { campaignId: null };
}

/**
 * Enroll ONE CRM row into its campus's Smartlead campaign — the per-row path
 * the `schedule_sequence` integration drives. If `existingCampaignIds` are given
 * (sibling rows already created the campus campaign), the lead is appended to the
 * first that still exists; otherwise a new PAUSED campaign is provisioned.
 *
 * Like `launchCampaign`: status follows SMARTLEAD_AUTO_START_CAMPAIGNS (default
 * PAUSED), never writes the CRM (the caller writes the linkage + touchpoint
 * through route.ts, G4), aggregates errors.
 */
export async function enrollRowIntoCampusCampaign(input: EnrollInput): Promise<EnrollResult> {
  const result: EnrollResult = { ok: false, created: false, enrolled: false, mailbox_warnings: [], errors: [] };

  // Single-row eligibility (reuses the same filters, incl. already-enrolled).
  const { eligible, skipped } = selectEligibleRows([input.row]);
  if (!eligible.length) {
    result.skipped_reason = skipped[0]?.reason;
    return result;
  }
  // Per-recipient fan-out (General Contact + each Named Contact).
  const fanned = rowToLeads(input.row, input.campus);
  if (!fanned.length) {
    result.skipped_reason = "no_email";
    return result;
  }
  const leads = fanned.map((f) => f.lead);

  // Reuse the campus's LIVE campaign for this audience. Add to the first
  // candidate that still exists; only if the list is empty or every candidate
  // was deleted (all 404) do we provision a fresh one below.
  const existingIds = input.existingCampaignIds ?? [];
  if (existingIds.length > 0) {
    const reuse = await addLeadsToExistingCampaign(existingIds, leads);
    if (reuse.error) {
      result.errors.push({ stage: "addLeads", message: reuse.error });
      return result;
    }
    if (reuse.campaignId != null) {
      result.campaign_id = reuse.campaignId;
      result.enrolled = true;
      result.ok = true;
      return result;
    }
    // every candidate was deleted → fall through to provision a fresh one
  }

  // No live campus campaign for this audience → provision a new PAUSED campaign.
  const mb = await resolveMailboxPool(input.senderEmails);
  result.mailbox_warnings = mb.pool.warnings;
  if (!mb.ok) {
    result.errors.push({ stage: "resolveMailboxPool", message: mb.error ?? "no mailboxes" });
    return result;
  }
  const steps = buildEmailSequence(input.cadenceKey ?? "provider", {
    adminFirstName: input.adminFirstName,
    campusSlug: input.campus.slug ?? null,
  });
  const prov = await provisionCampaign(input.campaignName, mb.pool.ids, steps);
  result.errors.push(...prov.errors);
  if (!prov.campaign_id) return result;
  result.campaign_id = prov.campaign_id;
  result.created = true;

  const added = await addLeads(prov.campaign_id, leads);
  if (!added.ok) {
    result.errors.push({ stage: "addLeads", message: added.error ?? "addLeads failed" });
    return result;
  }
  result.enrolled = true;

  result.errors.push(...(await finalizeCampaign(prov.campaign_id, input.schedule ?? defaultSchedule())));
  result.ok = result.errors.length === 0;
  return result;
}

export interface ActivationEnrollInput {
  outreach_id: string;
  organizationName: string;
  campus: CampusContext;
  /** Used only when no campus ACTIVATION campaign exists yet. */
  campaignName: string;
  /** The campus's existing activation campaign id(s) (from sibling rows'
   *  research_data.smartlead_activation.campaign_id). The lead is added to the
   *  first one that still exists; a fresh campaign is provisioned only when the
   *  list is empty or every candidate was deleted. */
  existingCampaignIds?: number[];
  /** Partner (stakeholder) rows get the Recruitment Partner Portal link as
   *  their welcome_url; providers get the provider magic link (DF-3b). */
  is_partner?: boolean;
  /** Row's real stakeholder type — drives per-type partner activation/welcome
   *  copy (advisor vs dept_head vs student_org). */
  stakeholder_type?: StakeholderType | null;
  /** Which single-lead email cadence to enroll into. Defaults to the
   *  "activation" sequence; the partner-welcome nurture passes
   *  "partner_welcome". Both are single-lead, separate-per-campus campaigns. */
  cadenceKey?: CadenceKey;
  /** The ONE engaged contact the activation cadence targets (not a fan-out). */
  recipient: {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    contact_id?: string | null;
  };
  senderEmails?: string[];
  adminFirstName?: string;
  schedule?: Record<string, unknown>;
}

/**
 * Enroll ONE engaged contact into the campus's ACTIVATION Smartlead campaign.
 *
 * Distinct from `enrollRowIntoCampusCampaign` (cold) on purpose:
 *   - NO eligibility filter: the row is `engaged` + already enrolled in the
 *     cold campaign — both of which the cold filter rejects, but both are
 *     EXPECTED here (the activation cadence is a deliberate warm follow-up).
 *   - Single lead (the engaged contact), not a General + Named fan-out.
 *   - The lead's welcome_url carries `?a=1` so the magic link auto-opens Terms.
 *   - Uses the `activation` sequence (canonical activation templates).
 *
 * Same path as the cold flow: status follows SMARTLEAD_AUTO_START_CAMPAIGNS
 * (default PAUSED for a human to start in Smartlead), never writes the CRM
 * (caller persists the linkage), aggregates errors. Inert when SMARTLEAD_API_KEY
 * is unset (addLeads/create return ok:false).
 */
export async function enrollActivationLead(input: ActivationEnrollInput): Promise<EnrollResult> {
  const result: EnrollResult = { ok: false, created: false, enrolled: false, mailbox_warnings: [], errors: [] };

  const email = input.recipient.email?.trim();
  if (!email) {
    result.skipped_reason = "no_email";
    return result;
  }

  // Per-lead magic link with the activate flag so it lands on Terms. Falls back
  // to PROGRAM_URL only when the secret is unset (dev/preview) — same posture
  // as rowToLeads.
  const magicLinkSecret = process.env.MEDJOBS_MAGIC_LINK_SECRET ?? "";
  const welcomeUrl = (() => {
    if (!magicLinkSecret) return PROGRAM_URL;
    try {
      // Partners → Recruitment Partner Portal (token self-activates there).
      // Providers → provider magic link with the activate flag (opens Terms).
      return input.is_partner
        ? buildPartnerPortalUrl({ outreach_id: input.outreach_id, email }, magicLinkSecret)
        : buildWelcomeUrl(
            { outreach_id: input.outreach_id, email, activate: true },
            magicLinkSecret,
          );
    } catch {
      return PROGRAM_URL;
    }
  })();

  const firstName = input.recipient.first_name?.trim() || "";
  const lead: SmartleadLead = {
    email,
    first_name: firstName,
    company_name: input.organizationName,
    custom_fields: {
      campus: input.campus.name,
      catchment_city: input.campus.city ?? "",
      outreach_id: input.outreach_id,
      recipient_kind: firstName ? "named" : "general",
      contact_id: input.recipient.contact_id ?? "",
      role: "",
      salutation: firstName ? `Hi ${firstName}` : "Hello",
      welcome_url: welcomeUrl,
    },
  };

  // Reuse the campus's LIVE activation campaign. Add to the first candidate
  // that still exists; only if the list is empty or every candidate was deleted
  // (all 404) do we provision a fresh one below.
  const existingIds = input.existingCampaignIds ?? [];
  if (existingIds.length > 0) {
    const reuse = await addLeadsToExistingCampaign(existingIds, [lead]);
    if (reuse.error) {
      result.errors.push({ stage: "addLeads", message: reuse.error });
      return result;
    }
    if (reuse.campaignId != null) {
      result.campaign_id = reuse.campaignId;
      result.enrolled = true;
      result.ok = true;
      return result;
    }
    // every candidate was deleted → fall through to provision a fresh one
  }

  // No live activation campaign for this campus (or all were deleted) →
  // provision a new PAUSED activation campaign.
  const mb = await resolveMailboxPool(input.senderEmails);
  result.mailbox_warnings = mb.pool.warnings;
  if (!mb.ok) {
    result.errors.push({ stage: "resolveMailboxPool", message: mb.error ?? "no mailboxes" });
    return result;
  }
  const steps = buildEmailSequence(input.cadenceKey ?? "activation", {
    adminFirstName: input.adminFirstName,
    campusSlug: input.campus.slug ?? null,
    isPartner: input.is_partner ?? false,
    stakeholderType: input.stakeholder_type ?? null,
  });
  const prov = await provisionCampaign(input.campaignName, mb.pool.ids, steps);
  result.errors.push(...prov.errors);
  if (!prov.campaign_id) return result;
  result.campaign_id = prov.campaign_id;
  result.created = true;

  const added = await addLeads(prov.campaign_id, [lead]);
  if (!added.ok) {
    result.errors.push({ stage: "addLeads", message: added.error ?? "addLeads failed" });
    return result;
  }
  result.enrolled = true;

  result.errors.push(...(await finalizeCampaign(prov.campaign_id, input.schedule ?? defaultSchedule())));
  result.ok = result.errors.length === 0;
  return result;
}

// ── Stop drips on conversion ─────────────────────────────────────────────

export interface PauseDripsResult {
  /** Lead/campaign pairs successfully paused. */
  paused: number;
  /** Pairs we attempted (campaign_id × email). */
  attempted: number;
  errors: string[];
}

/**
 * Pause a contact's drip across one or more Smartlead campaigns on conversion.
 *
 * When a row converts to Client / Partner we cancel the CRM tasks, but the cold
 * + activation EMAILS drip from Smartlead campaigns, which only auto-pause on a
 * detected reply. A conversion made on a call (no reply) would otherwise keep
 * emailing a now-converted contact. This resolves each email to its Smartlead
 * lead id once, then pauses that lead in each campaign it might still be in.
 *
 * Best-effort by design: never throws, and is inert when SMARTLEAD_API_KEY is
 * unset (the underlying calls return ok:false). The caller does not fail the
 * conversion on a pause error.
 */
export async function pauseLeadDrips(
  targets: Array<{ campaignId: number; email: string }>,
): Promise<PauseDripsResult> {
  const result: PauseDripsResult = { paused: 0, attempted: 0, errors: [] };

  // Dedup (campaign, email) pairs and resolve each email → lead id once.
  const seen = new Set<string>();
  const leadIdByEmail = new Map<string, number | null>();

  for (const { campaignId, email } of targets) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!campaignId || !normalizedEmail) continue;
    const key = `${campaignId}::${normalizedEmail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.attempted += 1;

    let leadId = leadIdByEmail.get(normalizedEmail);
    if (leadId === undefined) {
      const lookup = await getLeadByEmail(normalizedEmail);
      leadId = lookup.ok ? (lookup.data?.id ?? null) : null;
      if (!lookup.ok) {
        result.errors.push(`lookup ${normalizedEmail}: ${lookup.error}`);
      }
      leadIdByEmail.set(normalizedEmail, leadId);
    }
    if (leadId == null) continue; // not found / not configured — skip quietly

    const paused = await pauseLeadInCampaign(campaignId, leadId);
    if (paused.ok) {
      result.paused += 1;
    } else {
      result.errors.push(`pause ${normalizedEmail}@${campaignId}: ${paused.error}`);
    }
  }

  return result;
}

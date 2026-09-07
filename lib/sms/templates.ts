/**
 * SMS body templates — the single source of truth for every outbound text.
 *
 * Extracted from the send call sites so the admin SMS preview
 * (lib/sms-samples.ts → /admin/family-comms) always renders the LIVE copy —
 * the same guarantee the email gallery gets from lib/email-templates.
 *
 * Rules for bodies:
 *   - Keep ≤160 GSM-7 chars where possible (one segment).
 *   - Deep links must be STABLE (a sign-in path or guest token), never a
 *     short-lived magic link — quiet-hours queueing can deliver a text the
 *     next morning.
 *   - Family-facing proactive bodies carry "Reply STOP to opt out."
 */

/** Reply-alert: a provider proactively reached out about the family's care request. */
export function providerReachOutSms(p: { providerName: string; providerCity: string; url: string }): string {
  return `Olera: ${p.providerName} in ${p.providerCity} reached out about your care needs. Read & reply: ${p.url}`;
}

/** Reply-alert: a provider accepted/responded to the family's own inquiry. */
export function connectionResponseSms(p: { providerName: string; url: string }): string {
  return `Olera: ${p.providerName} responded to your care inquiry. Read & reply: ${p.url}`;
}

/** Provider alert: a family sent a new care inquiry (guest + authed paths). */
export function newInquirySms(p: { familyName?: string | null; url: string }): string {
  return `New care inquiry on Olera from ${p.familyName || "a family"}. View and respond: ${p.url}`;
}

/** Alert for a previously-pending connection released to the recipient's inbox. */
export function pendingInquirySms(p: { fromName: string; url: string }): string {
  return `New inquiry on Olera from ${p.fromName}. View and respond: ${p.url}`;
}

/** Stable labels written to email_log.metadata.copy_version. They let us
 * compare this full-cohort rollout with later copy without inferring versions
 * from message text. */
export const BENEFITS_RESULTS_SMS_COPY_VERSION = "continuity_question_v1_2026_08_19";
export const BENEFITS_RESULTS_ZERO_MATCH_SMS_COPY_VERSION = "zero_match_v1";
export const BENEFITS_HELP_REQUEST_SMS_COPY_VERSION = "help_request_v1_2026_08_19";

/** Benefits results text — match/no-match branch lives here, next to the copy. */
export function benefitsResultsSms(p: {
  matchCount: number;
  url: string;
  context?: "results" | "help_requested";
}): string {
  if (p.context === "help_requested") {
    return `Olera care team: We got your request. What should we help with first? Plan: ${p.url} We'll reply within 48h. STOP to opt out.`;
  }
  return p.matchCount > 0
    ? `Olera care team: We got your answers. Any questions about next steps? Plan: ${p.url} We'll reply within 48h. STOP to opt out.`
    : `Olera: We created your private Olera plan. No strong match yet; we'll keep checking. See it here: ${p.url} Reply STOP to opt out.`;
}

/** Benefits Cascade B1 — the ten-minute first step, texted. Mirrors the
 *  email; sent only with stored sms_consent. Direct URLs (no magic links —
 *  length budget). */
export function benefitsFirstStepSms(p: {
  programShortName: string;
  phone: string;
  topDocs: string[];
  url: string;
}): string {
  const docs = p.topDocs
    .slice(0, 2)
    .map((d) => d.toLowerCase().replace(/^(a|an|the)\s+/, ""))
    .join(" + ");
  const docLine = docs ? ` Have nearby: ${docs}.` : "";
  return `Olera: Your first step for ${p.programShortName}: call ${p.phone}.${docLine} Plan: ${p.url} Reply CALLED, NO ANSWER, or STUCK. Reply STOP to opt out.`;
}

/** Benefits Cascade B2 — the check-in, texted. Links to the family's living
 *  plan page (/m/{token}) where taps are captured. `done` = the family
 *  already marked the call made, so congratulate instead of asking. */
export function benefitsCheckInSms(p: {
  programShortName: string;
  url: string;
  done: boolean;
}): string {
  return p.done
    ? `Olera: You started ${p.programShortName}. What's happening now? Reply APPLIED, NEED DOCS, WAITING, or STUCK. Plan: ${p.url} Reply STOP to opt out.`
    : `Olera: Were you able to call ${p.programShortName}? Reply CALLED, NO ANSWER, or STUCK. Your plan: ${p.url} Reply STOP to opt out.`;
}

/** Provider alert: a MedJobs student applied. */
export function medjobsApplicationSms(p: { studentName: string; university?: string | null; url: string }): string {
  return `New MedJobs application from ${p.studentName} (${p.university || "student"}). View: ${p.url}`;
}

/** Claim-flow verification code (proves phone control). */
export function verificationCodeSms(code: string): string {
  return `Your Olera verification code is: ${code}. It expires in 10 minutes.`;
}

/** Auto-reply to an inbound HELP/INFO keyword (TwiML response body). */
export function smsHelpReply(): string {
  return "Olera: We text care-search updates and provider replies. Reply STOP to opt out. Help: olera.care/contact";
}

/**
 * Acknowledgement for a free-form question from a family. The ONLY message in
 * the Family Answers flow that goes out without a human reading it first, which
 * is why it makes no claims of any kind: it promises attention, not an answer.
 *
 * It also carries the disclaimer for the whole conversation. A per-message
 * legal line would eat the 480-char reply budget every time, but this text is
 * always the first thing a family hears back, so the caveat rides along once
 * and every later reply stays clean. Full terms live on the /m/{token} plan
 * page, which has no length limit.
 *
 * No "Reply STOP" line: this is transactional, sent in direct response to a
 * message the family just sent us, and STOP is already handled at the carrier
 * and in the webhook.
 */
/**
 * The 7-day outcome check for a researched answer we sent.
 *
 * Proactive, so it carries the STOP line. It names two keywords because the
 * answer has to be machine-readable: prose would create another message needing
 * a human, which is the cost this system exists to reduce. HELPED and NOTYET
 * are used rather than YES/NO because YES is a TCPA opt-in keyword handled
 * earlier in the webhook and STUCK belongs to the benefits cascade.
 *
 * It says why we are asking. People answer a question that has a visible point
 * more often than one that looks like a survey, and it happens to be true.
 */
export function familyAnswerFollowupSms(): string {
  return "Olera: Following up on the benefits help we sent last week. Did it get you anywhere? Reply HELPED if you got assistance, or NOTYET if you're still stuck. Either answer helps us do better for the next family. Reply STOP to opt out.";
}

export function familyAnswerAckSms(): string {
  return "Thanks for reaching out. We're looking into this and will get back to you with what we find. We share free resources and can get things wrong, so please confirm anything important with the agency.";
}

// ── Olera city campaigns (lib/city-ads) ─────────────────────────────────────
// Sequential offer chain: one provider at a time, no contact details until YES.
// Provider copy is plain and short (feedback_provider_comms_plain_not_hedged).

/** Offer to provider #N. No name, no number. */
export function cityOfferSms(p: { city: string; careLabel: string; recipientLabel: string; urgencyLabel: string; paymentLabel?: string | null; minutes: number }): string {
  const pay = p.paymentLabel ? `, ${p.paymentLabel}` : "";
  return `Olera: a family in ${p.city} needs ${p.careLabel} for ${p.recipientLabel}, ${p.urgencyLabel}${pay}. Reply YES in the next ${p.minutes} min to take it, or NO to pass.`;
}

/** Provider said YES: the family's details, and the expectation. */
export function cityAcceptedProviderSms(p: { firstName: string; phone: string; careLabel: string; recipientLabel: string; urgencyLabel: string; note?: string | null; callBy: string; providerPhone?: string }): string {
  const note = p.note ? ` Note: "${p.note.slice(0, 120)}"` : "";
  const told = p.providerPhone ? ` We told them to expect a call from ${p.providerPhone}.` : "";
  return `It is yours. ${p.firstName}, ${p.phone}. ${cap(p.careLabel)} for ${p.recipientLabel}, ${p.urgencyLabel}.${note} ${p.firstName} is expecting your call ${p.callBy}.${told} We will check with them tomorrow.`;
}

/** Provider said NO: one more question, one digit. */
export function cityDeclinedAskReasonSms(): string {
  return `Got it, passing it on. One thing: reply 1 no capacity, 2 outside your area, 3 payment, 4 needs medical care.`;
}

/** Provider's YES arrived after someone else took it. */
export function cityOfferGoneSms(): string {
  return `Thanks, that one was already taken. The next offer will come from this number.`;
}

/** Provider texted YES with no open offer. */
export function cityNoOpenOfferSms(): string {
  return `Olera: thanks. There is no open request for you right now; the next one will come from this number.`;
}

/** Family, right after submit, during staffed hours. */
export function cityFamilyConfirmSms(p: { firstName: string; city: string }): string {
  return `Olera: Thanks ${p.firstName}. We are asking a ${p.city} provider to take your request now. We will text you their name as soon as they confirm. Reply STOP to opt out.`;
}

/** Family, right after submit, outside staffed hours. */
export function cityFamilyConfirmMorningSms(p: { firstName: string; city: string }): string {
  return `Olera: Thanks ${p.firstName}. A ${p.city} provider will confirm in the morning and call you tomorrow. We will text you their name first. Reply STOP to opt out.`;
}

/** Family: a provider accepted. Names them and the number that will call. */
export function cityFamilyAcceptedSms(p: { providerName: string; city: string; providerPhone: string; callBy: string }): string {
  return `Olera: ${p.providerName} in ${p.city} has taken your request. Expect a call from ${p.providerPhone} ${p.callBy}. Save the number so you know it is them.`;
}

/** Family: three providers missed it; a human is on it. */
export function cityFamilyStillWorkingSms(p: { firstName: string; city: string }): string {
  return `Olera: Still working on your request, ${p.firstName}. We are lining up a ${p.city} provider by hand and will text you their name today.`;
}

/** Family, medical scope: honest redirect, not a lead. */
export function cityFamilyMedicalSms(p: { firstName: string }): string {
  return `Olera: Thanks ${p.firstName}. Olera arranges non-medical help at home and assisted living, not nursing care. For skilled nursing at home ask the discharge planner or doctor for a home health referral, which Medicare usually covers. Reply STOP to opt out.`;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── City campaign follow-ups ────────────────────────────────────────────────
// Two questions on a clock: did the provider call, and did it become a client.
// Both are one-digit replies so answering costs nothing.

/** Day 2, to the family. */
export function cityFamilyCheckSms(p: { firstName: string; providerName: string }): string {
  return `Olera: Hi ${p.firstName}, did ${p.providerName} reach you? Reply 1 yes, 2 not yet. Reply STOP to opt out.`;
}

/** Family said not yet: the provider's one nudge. */
export function cityProviderNudgeSms(p: { firstName: string; phone: string }): string {
  return `Olera: ${p.firstName} says they have not heard from you yet. ${p.phone}. If you cannot take it, reply NO and we will pass it on today.`;
}

/** Family said not yet and the provider still did not call: we move on. */
export function cityFamilyReofferSms(p: { firstName: string; city: string }): string {
  return `Olera: Sorry about that, ${p.firstName}. We are asking another ${p.city} provider now and will text you their name.`;
}

/** Day 7 and day 21, to the provider. */
export function cityOutcomePingSms(p: { firstName: string; city: string }): string {
  return `Olera: did ${p.firstName} in ${p.city} become a client? Reply 1 yes, 2 still talking, 3 no. One tap tells us whether this is working.`;
}

/** Receipt for a provider's outcome reply. */
export function cityOutcomeThanksSms(outcome: "client" | "talking" | "no"): string {
  if (outcome === "client") return `That is the number we needed. Thank you.`;
  if (outcome === "talking") return `Noted, we will check back. Thank you.`;
  return `Noted, thank you. It helps us send you better ones.`;
}

/** Concierge cities: a person from Olera calls, not a provider. Never promise a
 *  provider call in a city where no provider has agreed to take the request. */
export function cityFamilyConciergeSms(p: { firstName: string; city: string; today: boolean }): string {
  return p.today
    ? `Olera: Thanks ${p.firstName}. Someone from Olera will call you today about care in ${p.city}. Reply STOP to opt out.`
    : `Olera: Thanks ${p.firstName}. Someone from Olera will call you in the morning about care in ${p.city}. Reply STOP to opt out.`;
}

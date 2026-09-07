/**
 * Email variant registry — the single source of truth for "render every email
 * variant from canned, PII-free sample data." Powers:
 *   - the consolidated Email Gallery (/admin/emails/gallery)
 *   - the per-cron preview (/api/admin/automations/[id]/preview, ?variant=)
 *   - stable shareable per-variant links (/api/admin/emails/sample?id=…&raw=1)
 *
 * Subsumes the old hardcoded digestVariantSample() so provider + family + transactional
 * live in ONE place. See plans/email-gallery.md.
 *
 * Constraints: fixtures MUST be deterministic (no Date.now / Math.random / new Date)
 * and PII-free. Image URLs use the Supabase-hosted stock set (email-proxy safe).
 */
import { journeysForCron } from "@/lib/family-comms/journey";
import {
  // family · compare cascade (coordinator)
  connectionOutcomeCheckEmail,
  archetypeEmail,
  archetypeSubject,
  payingForCareEmail,
  payingForCareSubject,
  orientationIntroSubject,
  providerSilentEmail,
  familyNeverEngagedEmail,
  familyNeverEngagedSubject,
  day10AwaitingEmail,
  familyPendingReachOutNudgeEmail,
  familyNudgeEmail,
  providerStillSilentEmail,
  // family · benefits cascade (coordinator B1/B2)
  benefitsFirstStepEmail,
  benefitsFirstStepSubject,
  benefitsResultsSavedEmail,
  benefitsResultsSavedSubject,
  benefitsCheckInEmail,
  benefitsCheckInSubject,
  benefitsCheckInDoneEmail,
  benefitsCheckInDoneSubject,
  type CompareCardItem,
  // family · profile sequences (family-nudges / conversation-stale / lead-family-nudge / matches-nudge)
  completionNudge1Email,
  completionNudge2Email,
  completionNudge3Email,
  completionNudge4Email,
  completionNudgeSubject,
  completionMaintenanceEmail,
  publishNudge1Email,
  publishNudge2Email,
  publishNudge3Email,
  publishNudge4Email,
  publishNudgeSubject,
  publishMaintenanceEmail,
  matchesNudgeEmail,
  staleConversationFamilyEmail,
  staleConversationProviderEmail,
  postConnectionFollowupEmail,
  providerFollowupDay3Email,
  providerFollowupDay6Email,
  monthlyProviderRecommendationsEmail,
  inactivityReengagementEmail,
  type EmailProviderCard,
  // provider
  providerWeeklyDigestEmail,
  providerProfileCompletionEmail,
  providerWelcomeEmail,
  onboardingProfilePreviewEmail,
  onboardingNotificationsEmail,
  coldProviderRankEmail,
  providerLeadDigestEmail,
  providerManagedAdsEmail,
  providerFindFamiliesDigestEmail,
  adBoostQueuedEmail,
  adBoostProfileReminderEmail,
  adBoostRequestedEmail,
  adBoostReadyEmail,
  adBoostPhotoUpdateEmail,
  adBoostPhotosReadyEmail,
  adBoostLeadDeliveredEmail,
  adBoostCampaignLaunchedEmail,
  adBoostTractionEmail,
  adBoostPromoCompleteEmail,
  adBoostLeadOutcomeEmail,
} from "@/lib/email-templates";
import { renderEmail as renderProviderOutreachEmail } from "@/lib/provider-outreach/email-utils";

export interface EmailVariant {
  /** Stable slug — used in URLs and the automations ?variant= param. */
  id: string;
  audience: "family" | "provider" | "transactional";
  /** Display grouping in the gallery, e.g. "Family · Compare cascade". */
  group: string;
  label: string;
  /** Rendered subject line (gallery header). */
  subject: string;
  /** Underlying email_type — cross-refs /admin/emails + email_log. */
  emailType: string;
  /** Short, glanceable journey position shown beside the live preview. */
  timing?: string;
  /** One-sentence explanation of why this version sends at that moment. */
  situation?: string;
  /** Cron/registry id that sends it — links to /admin/automations/[id]. */
  cron?: string;
  /** Additional cron/registry ids that also send this exact message (e.g. the
   *  navigator scheduler fires the same B1 letter the coordinator drafts).
   *  Their detail pages preview it too, without duplicating the variant. */
  alsoCrons?: string[];
  /** Who receives this — the eligibility, in plain terms (for the "why this group" UI). */
  who?: string;
  /** Why we send it — the intent behind the copy (for the "why this group" UI). */
  why?: string;
  /** Renders the LIVE template with sample fixtures → full HTML. */
  render: () => string;
}

// ── Family fixtures ────────────────────────────────────────────────────────
const STOCK = "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/fallback";
const FAM_RECS: CompareCardItem[] = [
  { name: "Golden Years Home Care", viewUrl: "https://olera.care/provider/golden-years", introUrl: "https://olera.care/api/family-intro?tok=sample", imageUrl: `${STOCK}/home-care-1.jpg`, priceRange: "$25–30/hr", rating: 4.8, reviewCount: 42, distanceMi: 2.3, reason: "Highly Rated · State Licensed" },
  { name: "Comfort First Caregivers", viewUrl: "https://olera.care/provider/comfort-first", introUrl: "https://olera.care/api/family-intro?tok=sample", imageUrl: `${STOCK}/home-care-2.jpg`, priceRange: null, rating: 4.6, reviewCount: 18, distanceMi: 4.1, reason: "Well Reviewed" },
  { name: "Hill Country Home Aides", viewUrl: "https://olera.care/provider/hill-country", introUrl: "https://olera.care/api/family-intro?tok=sample", imageUrl: `${STOCK}/home-care-3.jpg`, priceRange: "from $24/hr", rating: null, reviewCount: null, distanceMi: 6.0, reason: null },
];
const F = {
  familyName: "Maria Garcia",
  providerName: "Evergreen Senior Care",
  quizUrl: "https://olera.care/benefits/finder",
  browseUrl: "https://olera.care/browse?type=home-care&location=Killeen%2C%20TX",
  inboxUrl: "https://olera.care/portal/inbox",
  guideUrl: "https://olera.care/olera-senior-care-guide-one-page.pdf",
  profileUrl: "https://olera.care/portal/profile",
  welcomeUrl: "https://olera.care/portal/welcome",
  matchesUrl: "https://olera.care/portal/matches",
};

// The one-tap micro-quiz fixture (pre-sort state: the self-sort is the pending
// question for any family without a financial_path). Chips point at the
// quiz-answer PAGE — the page records via client POST, never a GET that writes.
const F_SORT_QUIZ = {
  prompt: "Which sounds most like your situation?",
  chips: [
    { label: "We can cover it comfortably", url: "https://olera.care/family/quiz-answer?tok=sample" },
    { label: "Some savings, but not endless", url: "https://olera.care/family/quiz-answer?tok=sample" },
    { label: "Resources are very limited", url: "https://olera.care/family/quiz-answer?tok=sample" },
  ],
};
// The sorted state (path B): the tell-back line replaces the question.
const F_PATH_TELLBACK =
  "Since you mentioned you have some savings but not endless, we keep your cost guidance focused on bridge programs and planning ahead, so the money lasts as long as it needs to.";

// EmailProviderCard fixtures — the richer card shape used by the completion/publish
// sequences and go-live reminder (distinct from the compare-cascade CompareCardItem).
const FAM_CARDS: EmailProviderCard[] = [
  { name: "Golden Years Home Care", category: "home_care", slug: "golden-years", rating: 4.8, reviewCount: 42, reviewSnippet: "They treated my mom like family from day one.", city: "Killeen", state: "TX", priceRange: "$25–30/hr" },
  { name: "Comfort First Caregivers", category: "home_care", slug: "comfort-first", rating: 4.6, reviewCount: 18, reviewSnippet: null, city: "Killeen", state: "TX", priceRange: "Contact for pricing" },
  { name: "Hill Country Home Aides", category: "home_care", slug: "hill-country", rating: 4.5, reviewCount: 11, reviewSnippet: null, city: "Harker Heights", state: "TX", priceRange: "from $24/hr" },
];

// ── Provider fixtures (migrated verbatim from digestVariantSample) ──────────
const SAMPLE_BASE = {
  providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", tier: "low" as const,
  viewsPriorWeek: 6, deltaPct: 33, localDemand: 140, areaDemand: 210, city: "Austin", category: "home_care",
  topSource: "Google search",
};
const SAMPLE_LINK = "https://olera.care/provider/evergreen-home-care/onboard";

// ── Provider outreach fixtures (cold sequence Day 0/3/7/14) ──────────────────
const OUTREACH_CTX = {
  provider_name: "Sunrise Senior Care",
  city: "Austin",
  state: "TX",
  category: "home care",
  rank: 5,
  total: 23,
  city_views: 142,
  gap_list: "• Photos\n• Services offered\n• Pricing",
  profile_url: "https://olera.care/care/austin/home-care/sunrise-senior-care",
  claim_url: "https://olera.care/claim?tok=sample",
  manage_url: "https://olera.care/manage?tok=sample",
  remove_url: "https://olera.care/remove?tok=sample",
  unsubscribe_url: "https://olera.care/unsubscribe?tok=sample",
  mailing_address: "340 S Lemon Ave #1439, Walnut, CA 91789",
};

export const EMAIL_VARIANTS: EmailVariant[] = [
  // ─────────────── Family · Compare cascade (the coordinator) ───────────────
  {
    id: "family_archetype", audience: "family", group: "Family · Compare cascade",
    label: "First touch · Archetype (intent self-sort)", subject: archetypeSubject(),
    emailType: "family_archetype", cron: "family-comms-coordinator",
    who: "Any family with a recent inquiry, once ever (profile stamp). The guidance journey's opener, before the paying-for-care rung.",
    why: "The 'Have you heard back?' shape applied to intent — one question, three scenarios a family recognizes instantly, nothing else. Captures where they are (don't know where to start / avoid senior living / need help right away) so tone, cadence, and which help we lead with are all tailored. Replaces the busy financial self-sort as the first question; financial is demoted to a later, engagement-gated touch.",
    render: () => archetypeEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, careType: "memory care", city: "Killeen",
      chips: [
        { label: "I don't know where to start", url: "https://olera.care/family/quiz-answer?tok=sample" },
        { label: "I'd rather avoid senior living", url: "https://olera.care/family/quiz-answer?tok=sample" },
        { label: "We need help right away", url: "https://olera.care/family/quiz-answer?tok=sample" },
      ],
    }),
  },
  {
    id: "family_outcome_check", audience: "family", group: "Family · Compare cascade",
    label: "R1 · Outcome check (sensor)", subject: `Did ${F.providerName} get back to you?`,
    emailType: "family_outcome_check", cron: "family-comms-coordinator",
    who: "Inquiry sent 48–72h ago, the provider hasn't replied in-thread, and the family hasn't reported an outcome yet.",
    why: "Ground-truth sensor — asks \"Did they get back to you?\" to catch stalled connections early and trigger the help cascade.",
    render: () => connectionOutcomeCheckEmail({
      unsubscribeUrl: "https://olera.care/unsubscribe/care?id=sample-id",
      familyName: F.familyName, providerName: F.providerName,
      yesUrl: "https://olera.care/connection-outcome?v=yes",
      notYetUrl: "https://olera.care/connection-outcome?v=not_yet",
      noUrl: "https://olera.care/connection-outcome?v=no",
    }),
  },
  {
    id: "benefits_results_saved", audience: "family", group: "Family · Benefits cascade",
    label: "Day 0 · Program-aware results email", subject: benefitsResultsSavedSubject({ stateName: "Texas", requestedProgramName: "STAR+PLUS" }),
    emailType: "benefits_results_saved", cron: "benefits-results-texts",
    timing: "Day 0 · immediately after intake",
    situation: "Sent when a new family submits an email from a specific benefits page. It continues the exact program they were evaluating, explains what can and cannot be known yet, and links to its requirements and next step. Broad finder, provider, and editorial entries use the same live template's general plan-ready fallback.",
    who: "Every new family who finishes the benefits quiz with an email on file. Event-driven at intake; text-only intake is also supported.",
    why: "Preserves the promise made by the CTA. A family asking about one program should not receive a generic list that appears to replace it, and an email address alone should never be presented as an eligibility determination.",
    render: () => benefitsResultsSavedEmail({
      greetingName: "Maria",
      stateName: "Texas",
      careLabel: "memory and medical care",
      familyPhrase: "your mom",
      relatedPrograms: [
        { name: "Medicare Savings Programs", url: "https://olera.care/benefits/texas/medicare-savings-programs" },
        { name: "Area Agency on Aging Support", url: "https://olera.care/benefits/texas/area-agency-on-aging" },
      ],
      matchesUrl: "https://olera.care/m/sample",
      matchCount: 4,
      requestedProgram: {
        name: "STAR+PLUS Home and Community-Based Services Waiver",
        shortName: "STAR+PLUS",
        url: "https://olera.care/benefits/texas/star-plus-medicaid-hcbs",
        tagline: "Home and community-based care that may help an older adult remain at home instead of moving to a nursing facility.",
        eligibilityFactors: [
          "Medicaid eligibility",
          "Income and assets",
          "Need for a nursing-facility level of care",
        ],
        applicationSummary: "Home-care services can have a long interest list. Joining early may matter, even if you are still gathering information.",
      },
    }),
  },
  {
    id: "benefits_first_step", audience: "family", group: "Family · Benefits cascade",
    label: "B1 · Ten-minute first-step fallback", subject: benefitsFirstStepSubject("LIHEAP"),
    emailType: "benefits_first_step", cron: "family-comms-coordinator",
    timing: "B1 · after TJ approves the first step",
    situation: "Usually drafted 2–10 days after intake, then sent only when TJ approves it or at the scheduled hour. This is the fallback shape; live families normally receive the reviewed, personalized navigator email.",
    // The navigator scheduler fires the REAL sends now (TJ-approved AI letters);
    // this template is the shape/fallback. Its page previews it too.
    alsoCrons: ["benefits-navigator-scheduler"],
    who: "Eligible family 2–10 days after benefits intake. The coordinator drafts the message; nothing sends until TJ approves or schedules it.",
    why: "Nobody applies for government benefits alone — the base rate of solo completion is ~0. So instead of checking homework, we shrink the first step to ten minutes: ONE program, its start-here phone number, what to say, and three documents. Content comes from the state pipeline drafts (51 states).",
    render: () => benefitsFirstStepEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName,
      programName: "Low Income Home Energy Assistance Program (LIHEAP)",
      programShortName: "LIHEAP",
      savingsRange: "$300 – $1,000/year",
      contactLabel: "Texas LIHEAP Helpline (start here)",
      contactPhone: "1-877-399-8939",
      contactHours: "Mon–Fri, 8am–5pm",
      callScript: "Hi, I'm calling to ask about LIHEAP. I'd like to apply for my parent. Could you help me get started, or point me to the right person?",
      documents: [
        "A recent utility bill",
        "Proof of household income (Social Security award letter or pay stubs)",
        "ID for the person applying",
      ],
      tip: "Apply early in the month. Many local agencies release assistance funds monthly and they run out fast.",
      programUrl: "https://olera.care/benefits/texas/liheap",
      pickedFromEntryPage: true,
    }),
  },
  {
    id: "benefits_check_in", audience: "family", group: "Family · Benefits cascade",
    label: "B2 · The check that's an offer", subject: benefitsCheckInSubject("LIHEAP"),
    emailType: "benefits_check_in", cron: "family-comms-coordinator",
    timing: "B2 · 3–14 days after B1 is delivered",
    situation: "Sent once when the family has not reported an outcome. It asks what happened without grading them and turns every answer into a useful next path.",
    who: "First-step email sent 3–14 days ago, no outcome reported yet, once ever (profile stamp).",
    why: "The check-in that's an offer, not an audit: all three replies point forward (It's moving / I want help / This program isn't right for me). 'I want help' pages the queue owner and floats the family in /admin/benefits. Outcome data is the exhaust of helping.",
    render: () => benefitsCheckInEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName,
      programShortName: "LIHEAP",
      movingUrl: "https://olera.care/benefits-outcome?tok=sample-moving",
      helpUrl: "https://olera.care/benefits-outcome?tok=sample-help",
      wrongUrl: "https://olera.care/benefits-outcome?tok=sample-wrong",
    }),
  },
  {
    id: "benefits_check_in_done", audience: "family", group: "Family · Benefits cascade",
    label: "B2 · Check-in, retargeted (call already made)", subject: benefitsCheckInDoneSubject("LIHEAP"),
    emailType: "benefits_check_in", cron: "family-comms-coordinator",
    timing: "B2 · 3–14 days after B1, call already recorded",
    situation: "Used when the living plan already knows the family made the call. Olera acknowledges that progress and asks what happened next instead of repeating the first question.",
    who: "Same band as B2, but the family marked the call done on their /m plan page (benefits_cascade.first_step_done_at).",
    why: "The living journey saw the act, so the check-in congratulates instead of asking. Same three forward chips, reframed. Coherence: the system visibly remembers what the family did.",
    render: () => benefitsCheckInDoneEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName,
      programShortName: "LIHEAP",
      movingUrl: "https://olera.care/benefits-outcome?tok=sample-moving",
      helpUrl: "https://olera.care/benefits-outcome?tok=sample-help",
      wrongUrl: "https://olera.care/benefits-outcome?tok=sample-wrong",
    }),
  },
  {
    id: "paying_for_care", audience: "family", group: "Family · Compare cascade",
    label: "Paying for care + self-sort — retired", subject: payingForCareSubject("Texas", "memory care"),
    emailType: "paying_for_care", cron: "family-comms-coordinator",
    who: "RETIRED 2026-07-08. Previously: any family with an inquiry 72–96h old, once ever. History only — the row keeps its past sends; nothing emits it now.",
    why: "RETIRED — the archetype first-touch (\"Where are you in all this?\") replaced the financial self-sort as the guidance opener. The money/self-sort question now comes later, from the compare and awaiting rungs, once the family has engaged. Kept here so the historical sends still have a preview.",
    render: () => payingForCareEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, careType: "memory care", city: "Killeen", stateName: "Texas",
      programs: [
        { name: "Texas PACE Programs", savingsRange: "$15,000 – $35,000/year", blurb: "All-in-one medical care and daily support for seniors who want to stay at home.", url: "https://olera.care/family/program/sample" },
        { name: "Texas Respite Care Services", savingsRange: "up to $500/mo", blurb: "Short-term relief care that gives family caregivers a real break.", url: "https://olera.care/family/program/sample" },
        { name: "Meals on Wheels Texas", savingsRange: "$250 – $400/mo", blurb: "Home-delivered meals for seniors who have trouble shopping or cooking.", url: "https://olera.care/family/program/sample" },
      ],
      quiz: {
        prompt: "Which sounds most like your situation?",
        leads: true,
        chips: [
          { label: "We can cover it comfortably", url: "https://olera.care/family/quiz-answer?tok=sample" },
          { label: "Some savings, but not endless", url: "https://olera.care/family/quiz-answer?tok=sample" },
          { label: "Resources are very limited", url: "https://olera.care/family/quiz-answer?tok=sample" },
        ],
      },
      fullPictureUrl: F.quizUrl,
    }),
  },
  {
    id: "orientation_intro", audience: "family", group: "Family · Compare cascade",
    label: "Campaign · Orientation intro — retired", subject: orientationIntroSubject("memory care"),
    emailType: "orientation_intro", cron: undefined,
    who: "RETIRED 2026-07-08. Replaced by the archetype campaign (archetype_intro). Previously: one-time send to families with a 90-day inquiry and no financial_path.",
    why: "RETIRED — the one-time base send now asks the archetype scenario, not the financial self-sort. See the archetype intro campaign variant.",
    render: () => payingForCareEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, careType: "memory care", city: "Killeen", stateName: "Texas",
      opening: "A while back you reached out about memory care in Killeen. However that search is going, there's a part of it nobody hands you a guide for: how to pay for it.",
      programs: [
        { name: "Texas PACE Programs", savingsRange: "$15,000 – $35,000/year", blurb: "All-in-one medical care and daily support for seniors who want to stay at home.", url: "https://olera.care/family/program/sample" },
        { name: "Texas Respite Care Services", savingsRange: "up to $500/mo", blurb: "Short-term relief care that gives family caregivers a real break.", url: "https://olera.care/family/program/sample" },
        { name: "Meals on Wheels Texas", savingsRange: "$250 – $400/mo", blurb: "Home-delivered meals for seniors who have trouble shopping or cooking.", url: "https://olera.care/family/program/sample" },
      ],
      quiz: { ...F_SORT_QUIZ, leads: true },
      fullPictureUrl: F.quizUrl,
    }),
  },
  {
    id: "archetype_intro", audience: "family", group: "Family · Compare cascade",
    label: "Campaign · Archetype intro (one-time, existing base)", subject: archetypeSubject(),
    emailType: "archetype_intro", cron: undefined,
    who: "One-time admin-triggered campaign (/api/admin/orientation-campaign): families with a 90-day inquiry, no archetype yet, not self-reported connected, not unsubscribed. One-shot stamp; governed by the caps + kill switch.",
    why: "The archetype rung only reaches NEW inquiries aging through 72–96h; the existing base would never be asked. Same clean creative as the rung, with past-tense framing.",
    render: () => archetypeEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, careType: "memory care", city: "Killeen",
      opening: "A while back you reached out about memory care in Killeen. Wherever your search stands now, one quick question so we can point you the right way:",
      chips: [
        { label: "I don't know where to start", url: "https://olera.care/family/quiz-answer?tok=sample" },
        { label: "I'd rather avoid senior living", url: "https://olera.care/family/quiz-answer?tok=sample" },
        { label: "We need help right away", url: "https://olera.care/family/quiz-answer?tok=sample" },
      ],
    }),
  },
  {
    id: "family_provider_silent", audience: "family", group: "Family · Compare cascade",
    label: "R2 · Provider silent → compare", subject: "A few other providers near you",
    emailType: "family_provider_silent", cron: "family-comms-coordinator",
    who: "Engaged family (sent ≥1 message), 96–120h in, no provider has responded anywhere, and ≥3 responsive alternatives exist nearby.",
    why: "Compare-led hero — the provider went quiet, so show 2–3 responsive alternatives plus a benefits-quiz value-exchange. You're never limited to one.",
    render: () => providerSilentEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, providerPassed: false,
      recommendedProviders: FAM_RECS, browseUrl: F.browseUrl, city: "Killeen", careType: "memory care", quiz: F_SORT_QUIZ, fullPictureUrl: F.quizUrl,
    }),
  },
  {
    id: "family_provider_declined", audience: "family", group: "Family · Compare cascade",
    label: "R2 · Provider declined (with message)", subject: "A few other providers near you, while you wait",
    emailType: "family_provider_silent", cron: "family-comms-coordinator",
    who: "Same as R2, but the provider explicitly declined (left a message) rather than going silent.",
    why: "Soften the decline and immediately redirect to responsive alternatives — turn a 'no' into momentum.",
    render: () => providerSilentEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, providerPassed: true,
      declineMessage: "We're at capacity for new clients this month, so sorry.",
      recommendedProviders: FAM_RECS, browseUrl: F.browseUrl, city: "Killeen", quiz: F_SORT_QUIZ, fullPictureUrl: F.quizUrl,
    }),
  },
  {
    // Registered under the SYNTHETIC performance type (the wire email_type is
    // family_never_engaged — governed, no new type); the family-comms dashboard
    // splits this rung into its own row via metadata.coordinator_rung, so the
    // drawer looks up variants by that synthetic type.
    id: "family_provider_silent_guidance", audience: "family", group: "Family · Compare cascade",
    label: "R2 · Provider silent → guidance (thin market)", subject: familyNeverEngagedSubject(false),
    emailType: "family_provider_silent_guidance", cron: "family-comms-coordinator",
    who: "Engaged family (sent ≥1 message), 96–120h in, no provider has responded anywhere — and fewer than 3 responsive alternatives exist nearby (thin market).",
    why: "The switch flips Matchmaking → Guidance: with no honest shortlist to show, going silent here is the designed-away dead end. Lead with the cost/benefits unlock (the real paralyzer) plus the guide, and keep the original provider reachable.",
    render: () => familyNeverEngagedEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, guideUrl: F.guideUrl, inboxUrl: F.inboxUrl,
      quiz: F_SORT_QUIZ, fullPictureUrl: F.quizUrl,
    }),
  },
  {
    id: "family_never_engaged_compare", audience: "family", group: "Family · Compare cascade",
    label: "R3 · Never-engaged → compare", subject: familyNeverEngagedSubject(true),
    emailType: "family_never_engaged", cron: "family-comms-coordinator",
    who: "Family never sent a message on any connection, 120–144h in, no provider responded — and ≥3 nearby alternatives exist.",
    why: "Gentle resource nudge for families who stalled before reaching out. With alternatives available, lead with compare cards.",
    render: () => familyNeverEngagedEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, guideUrl: F.guideUrl, inboxUrl: F.inboxUrl,
      recommendedProviders: FAM_RECS, browseUrl: F.browseUrl, quiz: F_SORT_QUIZ, fullPictureUrl: F.quizUrl,
    }),
  },
  {
    id: "family_never_engaged_fallback", audience: "family", group: "Family · Compare cascade",
    label: "R3 · Never-engaged → guide fallback (<3 alts)", subject: familyNeverEngagedSubject(false),
    emailType: "family_never_engaged", cron: "family-comms-coordinator",
    who: "Same as R3, but fewer than 3 responsive alternatives are available nearby.",
    why: "When we can't honestly surface alternatives, fall back to a how-to-choose guide PDF rather than a thin compare list.",
    render: () => familyNeverEngagedEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, guideUrl: F.guideUrl, inboxUrl: F.inboxUrl,
      quiz: F_SORT_QUIZ, fullPictureUrl: F.quizUrl,
    }),
  },
  {
    id: "provider_still_silent", audience: "family", group: "Family · Compare cascade",
    label: "Day 7 · Provider still silent → trust recovery", subject: "Let's find you someone who's ready to help",
    emailType: "provider_still_silent", cron: "provider-still-silent",
    who: "Family's inquiry is ~7 days old, the provider still hasn't responded anywhere, and responsive alternatives exist nearby.",
    why: "Trust recovery — name the silence plainly (\"that's on them, not you\") and hand the family providers who are ready to help right now, before the platform loses them.",
    render: () => providerStillSilentEmail({
      familyName: F.familyName, providerName: F.providerName,
      recommendedProviders: [
        { name: "Golden Years Home Care", slug: "golden-years", priceRange: "$25–30/hr", viewUrl: "https://olera.care/provider/golden-years" },
        { name: "Comfort First Caregivers", slug: "comfort-first", priceRange: null, viewUrl: "https://olera.care/provider/comfort-first" },
        { name: "Hill Country Home Aides", slug: "hill-country", priceRange: "from $24/hr", viewUrl: "https://olera.care/provider/hill-country" },
      ],
      browseUrl: F.browseUrl,
    }),
  },
  {
    id: "day_10_awaiting", audience: "family", group: "Family · Compare cascade",
    label: "R4 · Provider responded → compare + choose", subject: `How does ${F.providerName} compare? A couple of others to weigh`,
    emailType: "day_10_awaiting", cron: "family-comms-coordinator",
    who: "A provider replied 9–11 days ago and the family hasn't replied back since that first response.",
    why: "Warm hand-off — help the family weigh this provider against 2 others and teach how to choose, so the thread doesn't stall.",
    render: () => day10AwaitingEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, inboxUrl: F.inboxUrl,
      supportUrl: "mailto:support@olera.care?subject=Help%20with%20next%20steps", alternativesUrl: F.browseUrl,
      recommendedProviders: FAM_RECS.slice(0, 2), pathTellBack: F_PATH_TELLBACK, fullPictureUrl: F.quizUrl,
    }),
  },
  {
    id: "family_reach_out_nudge", audience: "family", group: "Family · Compare cascade",
    label: "R5 · Pending reach-out", subject: `${F.providerName} is waiting to hear from you`,
    emailType: "family_reach_out_nudge", cron: "family-comms-coordinator",
    who: "A provider initiated the connection (inbound), it's been pending ≥3 days, and the family hasn't replied.",
    why: "Warm inbound lead — a provider is actively waiting; nudge the family to reply, with a preview of the provider's message.",
    render: () => familyPendingReachOutNudgeEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, providerCity: "Killeen, TX",
      messagePreview: "Hi! We'd love to help with care for your mother. When's a good time to talk?",
      daysSinceReachOut: 3, viewUrl: F.inboxUrl,
    }),
  },
  {
    id: "family_nudge", audience: "family", group: "Family · Compare cascade",
    label: "R6 · Stuck → completion as value-exchange", subject: "A few more care options near you",
    emailType: "family_nudge", cron: "family-comms-coordinator",
    who: "Inquiry ≥2 days old, profile under 60% complete, not currently in an active live thread.",
    why: "Completion as value-exchange — the quiz sharpens matches AND captures fuel; framed as \"sharper matches,\" never a naked \"finish your profile.\"",
    render: () => familyNudgeEmail({
      unsubscribeId: "sample-id", familyName: F.familyName, providerName: F.providerName,
      missingFields: ["Timeline", "Payment Methods", "Care Needs"], completionPercent: 65, profileUrl: F.profileUrl,
      benefitsQuizUrl: F.quizUrl,
    }),
  },

  // ─────────────── Family · Profile sequences (preserved engines) ───────────────
  // The completion/publish day-sequences (family-nudges), the dual-sided stale
  // nudge (conversation-stale, family side), the go-live reminder (lead-family-nudge),
  // and the matches/review nudges. These run alongside the coordinator, gated by the
  // 3/week family cap + the 20h coordinator standdown.
  {
    id: "completion_nudge_1", audience: "family", group: "Family · Profile sequences",
    label: "Completion · day 0", subject: completionNudgeSubject(1, { city: "Killeen", providerCount: 24 }),
    emailType: "completion_nudge_1", cron: "family-nudges",
    who: "Profile under 60% complete, first day (4h+ after signup).",
    why: "Open the completion sequence — value-first: better-fit care plus help covering the cost, in exchange for a couple details. (R6 redesign.)",
    render: () => completionNudge1Email({
      unsubscribeId: "sample-id", familyName: F.familyName, welcomeUrl: F.welcomeUrl,
      missingFields: ["Timeline", "Payment Methods"], completionPercent: 30, providerCount: 24, city: "Killeen",
    }).html,
  },
  {
    id: "completion_nudge_2", audience: "family", group: "Family · Profile sequences",
    label: "Completion · day 2", subject: completionNudgeSubject(2, { providerCount: 24, city: "Killeen", state: "TX" }),
    emailType: "completion_nudge_2", cron: "family-nudges",
    who: "Profile under 60% complete, ~day 2 of the sequence.",
    why: "Progress + provider-count social proof — show the market is active and waiting.",
    render: () => completionNudge2Email({
      unsubscribeId: "sample-id", familyName: F.familyName, welcomeUrl: F.welcomeUrl,
      missingFields: ["Timeline", "Payment Methods"], completionPercent: 45, providerCount: 24, city: "Killeen", state: "TX",
    }).html,
  },
  {
    id: "completion_nudge_3", audience: "family", group: "Family · Profile sequences",
    label: "Completion · day 6", subject: completionNudgeSubject(3, { city: "Killeen", state: "TX" }),
    emailType: "completion_nudge_3", cron: "family-nudges",
    who: "Profile under 60% complete, ~day 6 of the sequence.",
    why: "Social proof + gentle urgency — completeness correlates with faster provider responses.",
    render: () => completionNudge3Email({
      unsubscribeId: "sample-id", familyName: F.familyName, welcomeUrl: F.welcomeUrl,
      missingFields: ["Timeline", "Payment Methods"], completionPercent: 50, providerCount: 24, city: "Killeen", state: "TX",
    }).html,
  },
  {
    id: "completion_nudge_4", audience: "family", group: "Family · Profile sequences",
    label: "Completion · day 13 (last)", subject: completionNudgeSubject(4, { city: "Killeen", state: "TX" }),
    emailType: "completion_nudge_4", cron: "family-nudges",
    who: "Profile under 60% complete, ~day 13 — the final completion touch.",
    why: "Final push with up to 3 specific provider cards near them to make it concrete.",
    render: () => completionNudge4Email({
      unsubscribeId: "sample-id", familyName: F.familyName, welcomeUrl: F.welcomeUrl,
      missingFields: ["Timeline", "Payment Methods"], completionPercent: 55, providers: FAM_RECS, providerCount: 24, city: "Killeen", state: "TX",
    }).html,
  },
  {
    id: "completion_maintenance", audience: "family", group: "Family · Profile sequences",
    label: "Completion · monthly check-in", subject: "Top providers in Killeen you might have missed",
    emailType: "completion_maintenance", cron: "family-comms-coordinator",
    who: "Profile still under 60% complete after the day 0/2/6/13 sequence — monthly tail, capped at 6 touches, skipped for proven non-openers (ghost gate).",
    why: "Keep the door open with fresh provider value (new joiners or top-rated near them) rather than repeating the completion ask cold.",
    render: () => completionMaintenanceEmail({
      unsubscribeId: "sample-id", familyName: F.familyName, welcomeUrl: F.welcomeUrl,
      providers: FAM_CARDS, newProviderCount: 0,
      missingFields: ["Timeline", "Payment Methods"], completionPercent: 55, city: "Killeen", state: "TX",
    }),
  },
  {
    id: "publish_nudge_1", audience: "family", group: "Family · Profile sequences",
    label: "Publish · day 0", subject: publishNudgeSubject(1),
    emailType: "publish_nudge_1", cron: "family-nudges",
    who: "Profile ≥60% complete but not yet published — same day it crossed the threshold.",
    why: "Open the publish arc — pitch the inbound/passive flow of going live.",
    render: () => publishNudge1Email({
      unsubscribeId: "sample-id", familyName: F.familyName, matchesUrl: F.matchesUrl, providerCount: 24, city: "Killeen",
    }),
  },
  {
    id: "publish_nudge_2", audience: "family", group: "Family · Profile sequences",
    label: "Publish · day 2", subject: publishNudgeSubject(2),
    emailType: "publish_nudge_2", cron: "family-nudges",
    who: "Profile ≥60% complete, not published, ~day 2.",
    why: "Show a top-rated provider list — make the inbound opportunity tangible.",
    render: () => publishNudge2Email({
      unsubscribeId: "sample-id", familyName: F.familyName, matchesUrl: F.matchesUrl, providerCount: 24, providers: FAM_RECS, city: "Killeen",
    }),
  },
  {
    id: "publish_nudge_3", audience: "family", group: "Family · Profile sequences",
    label: "Publish · day 6", subject: publishNudgeSubject(3),
    emailType: "publish_nudge_3", cron: "family-nudges",
    who: "Profile ≥60% complete, not published, ~day 6.",
    why: "Platform-wide social proof (families this week/month), no-pressure tone.",
    render: () => publishNudge3Email({
      unsubscribeId: "sample-id", familyName: F.familyName, matchesUrl: F.matchesUrl,
      familiesThisWeek: 38, familiesThisMonth: 160, providerCount: 24, city: "Killeen", state: "TX",
    }),
  },
  {
    id: "publish_nudge_4", audience: "family", group: "Family · Profile sequences",
    label: "Publish · day 13 (last)", subject: publishNudgeSubject(4),
    emailType: "publish_nudge_4", cron: "family-nudges",
    who: "Profile ≥60% complete, not published, ~day 13 — final publish touch.",
    why: "Soft, no-pressure last word before the sequence goes quiet.",
    render: () => publishNudge4Email({
      unsubscribeId: "sample-id", familyName: F.familyName, matchesUrl: F.matchesUrl, city: "Killeen",
    }),
  },
  {
    id: "publish_maintenance", audience: "family", group: "Family · Profile sequences",
    label: "Publish · monthly check-in", subject: "3 new providers joined in Killeen",
    emailType: "publish_maintenance", cron: "family-nudges",
    who: "Profile ≥60% complete but still unpublished after the day 0/2/6/13 sequence — monthly tail, capped at 6 touches.",
    why: "Fresh providers as the hook — show the market kept moving while they sat unpublished, and re-pitch the inbound flow of going live.",
    render: () => publishMaintenanceEmail({
      unsubscribeId: "sample-id", familyName: F.familyName, matchesUrl: F.matchesUrl,
      providerCount: 24, newProviderCount: 3, providers: FAM_CARDS, city: "Killeen", state: "TX",
    }),
  },
  {
    id: "stale_conversation_family", audience: "family", group: "Family · Profile sequences",
    label: "Stale conversation (family side)", subject: `Still looking? ${F.providerName} is here when you're ready`,
    emailType: "stale_conversation", cron: "conversation-stale",
    who: "A thread with ≥2 human messages went quiet 5+ days ago. Sent to the family (the provider gets a mirror).",
    why: "Reactivate a stuck conversation before it dies — low-pressure re-open.",
    render: () => staleConversationFamilyEmail({
      unsubscribeId: "sample-id",
      familyName: F.familyName, providerName: F.providerName, daysSinceLastMessage: 6, viewUrl: F.inboxUrl,
    }),
  },
  {
    id: "matches_nudge", audience: "family", group: "Family · Profile sequences",
    label: "Matches nudge", subject: "You have matches waiting",
    emailType: "matches_nudge", cron: "matches-nudge",
    who: "Family has unanswered matches they haven't reviewed yet.",
    why: "Pull them back to act on matches already surfaced for them.",
    render: () => matchesNudgeEmail({
      unsubscribeId: "sample-id", familyName: F.familyName, unansweredCount: 3, matchesUrl: F.matchesUrl,
    }),
  },
  {
    id: "post_connection_followup", audience: "family", group: "Family · Profile sequences",
    label: "Post-connection follow-up", subject: `How was your experience with ${F.providerName}?`,
    emailType: "post_connection_followup", cron: "family-nudges",
    who: "≥30 days after a real two-way conversation with a provider.",
    why: "Ask for a review — builds UGC and gives us ground truth on how the connection went.",
    render: () => postConnectionFollowupEmail({
      unsubscribeId: "sample-id", familyName: F.familyName, providerName: F.providerName,
      providerSlug: "evergreen-senior-care", reviewUrl: "https://olera.care/provider/evergreen-senior-care?review=1",
    }),
  },
  {
    id: "monthly_recommendations", audience: "family", group: "Family · Profile sequences",
    label: "Monthly provider picks", subject: "2 providers in Killeen match your search",
    emailType: "monthly_recommendations", cron: "family-nudges",
    who: "Published family, still searching — every 30 days, up to 12 touches (one year), only when there are providers to recommend.",
    why: "Passive long-tail value — keep a slow search alive with a fresh shortlist instead of letting the published profile go quiet.",
    render: () => monthlyProviderRecommendationsEmail({
      unsubscribeId: "sample-id", familyName: F.familyName, profileUrl: F.profileUrl, inboxUrl: F.inboxUrl,
      providers: FAM_CARDS, newProviderCount: 2, isPublished: true, city: "Killeen", state: "TX",
    }),
  },
  {
    id: "inactivity_reengagement", audience: "family", group: "Family · Profile sequences",
    label: "Quiet for 30 days — re-engagement", subject: "Still searching for care in Killeen?",
    emailType: "inactivity_reengagement", cron: "family-nudges",
    who: "Family inactive for 30+ days with providers available near them — a limited number of re-engagement attempts.",
    why: "One honest check-in: are you still searching? CTA adapts to their state — inbox if published, publish if complete, finish profile otherwise.",
    render: () => inactivityReengagementEmail({
      unsubscribeId: "sample-id", familyName: F.familyName, profileUrl: F.profileUrl, inboxUrl: F.inboxUrl,
      providers: FAM_CARDS, completionPercent: 70, isPublished: false, city: "Killeen", state: "TX",
    }),
  },

  // ─────────────── Provider · Weekly digest (migrated) ───────────────
  {
    id: "provider_family_question", audience: "provider", group: "Provider · Weekly digest",
    label: "Digest · family question", subject: "A family has a question about Evergreen Home Care",
    emailType: "weekly_analytics_digest", cron: "weekly-provider-digest",
    render: () => providerWeeklyDigestEmail({
      ...SAMPLE_BASE, viewsThisWeek: 9, ctaClicks: 2, leadsReceived: 0, questionsReceived: 1,
      unansweredQuestion: { id: "sample", question: "Do you accept Medicaid, and is weekend care available for my mother?", totalCount: 1 },
      answerUrl: `${SAMPLE_LINK}?action=question`, marketRank: null,
    }),
  },
  {
    id: "provider_digest_rank", audience: "provider", group: "Provider · Weekly digest",
    label: "Digest · rank", subject: "You're #3 of 21 home care agencies in Austin",
    emailType: "weekly_analytics_digest", cron: "weekly-provider-digest",
    render: () => providerWeeklyDigestEmail({
      ...SAMPLE_BASE, viewsThisWeek: 12, ctaClicks: 3, leadsReceived: 1, questionsReceived: 0,
      marketRank: { rank: 3, outOf: 21, cityLabel: "Austin", careLabel: "home care", flattering: true },
    }),
  },
  {
    id: "provider_referral_teaser", audience: "provider", group: "Provider · Weekly digest",
    label: "Digest · referral teaser", subject: "3 Austin-area places families may ask about care",
    emailType: "weekly_analytics_digest", cron: "weekly-provider-digest",
    render: () => providerWeeklyDigestEmail({
      ...SAMPLE_BASE, viewsThisWeek: 4, ctaClicks: 1, leadsReceived: 0, questionsReceived: 0,
      marketRank: { rank: 3, outOf: 21, cityLabel: "Austin", careLabel: "home care", flattering: true },
      referralTeaser: {
        totalSources: 18, starterTotal: 5, workedCount: 0, respondedCount: 0, referringCount: 0,
        targets: [
          { name: "St. David's South Austin Medical Center", category: "hospital", distanceMiles: 2.4 },
          { name: "Austin Wellness & Rehabilitation", category: "skilled_nursing", distanceMiles: 3.1 },
          { name: "AGE of Central Texas", category: "senior_resource", distanceMiles: 4.8 },
        ],
      },
      marketUrl: `${SAMPLE_LINK}?action=market`,
    }),
  },
  {
    id: "provider_digest_plain", audience: "provider", group: "Provider · Weekly digest",
    label: "Digest · plain", subject: "9 families viewed your page this week",
    emailType: "weekly_analytics_digest", cron: "weekly-provider-digest",
    render: () => providerWeeklyDigestEmail({
      ...SAMPLE_BASE, viewsThisWeek: 9, ctaClicks: 2, leadsReceived: 0, questionsReceived: 0, marketRank: null,
    }),
  },
  {
    id: "provider_find_families", audience: "provider", group: "Provider · Weekly digest",
    label: "Digest · find families", subject: "3 families near you are looking for care",
    emailType: "weekly_analytics_digest", cron: "weekly-provider-digest",
    render: () => providerFindFamiliesDigestEmail({
      providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care",
      ctaUrl: `${SAMPLE_LINK}?action=matches`,
      nearbyCount: 3, nearestTown: "Round Rock", careNeed: "home care", timeline: "immediate",
    }),
  },
  {
    id: "provider_welcome_verified", audience: "provider", group: "Provider · Onboarding",
    label: "Welcome · no verification needed", subject: "Evergreen Home Care is now yours to manage",
    emailType: "provider_welcome", cron: "provider-welcome",
    timing: "Day 0 · first business-hours run after the claim",
    situation: "The provider just took ownership of their page and has full access already, so the email confirms the claim and points at the dashboard without adding a task.",
    who: "Claimed within the last 7 days, not yet welcomed, and verified or high-trust (verification not required). About 85% of claims land here.",
    why: "There is no provider-facing email at claim time otherwise. This is the first thing they hear from us after claiming.",
    render: () => providerWelcomeEmail({
      providerName: "Evergreen Home Care",
      providerSlug: "evergreen-home-care",
      dashboardUrl: `${SAMPLE_LINK}?action=manage`,
    }),
  },
  {
    id: "provider_welcome_unverified", audience: "provider", group: "Provider · Onboarding",
    label: "Welcome · verification still needed", subject: "Evergreen Home Care is now yours to manage",
    emailType: "provider_welcome", cron: "provider-welcome",
    timing: "Day 0 · first business-hours run after the claim",
    situation: "Same moment as the version above, but this provider cannot see family details or reply to inquiries until they verify, so the ask is folded into the welcome instead of promising access they do not have.",
    who: "Claimed within the last 7 days, not yet welcomed, and still unverified. About 11% of claims land here.",
    why: "Verification gates Matches and the portal inbox. Asking here beats a separate email a day later that most providers never need.",
    render: () => providerWelcomeEmail({
      providerName: "Evergreen Home Care",
      providerSlug: "evergreen-home-care",
      dashboardUrl: `${SAMPLE_LINK}?action=manage`,
      verifyUrl: `${SAMPLE_LINK}?action=settings`,
    }),
  },
  {
    id: "provider_profile_preview", audience: "provider", group: "Provider · Onboarding",
    label: "Profile preview", subject: "Families are searching in Austin",
    emailType: "profile_preview_nudge", cron: "profile-preview-nudge",
    timing: "Day 2 · 48h after the welcome email",
    situation: "The provider has taken ownership but the page is still thin. Leads with real local demand rather than a vanity prompt, then drops them on the page as a family sees it.",
    who: "Received the welcome email 48+ hours ago and has not been sent this yet.",
    why: "Replaces the retired provider_incomplete_profile email, which had the better opening line and mechanics that left it sending almost nothing.",
    render: () => onboardingProfilePreviewEmail({
      providerName: "Evergreen Home Care",
      providerSlug: "evergreen-home-care",
      city: "Austin",
      profileUrl: `${SAMPLE_LINK}?action=profile`,
    }),
  },
  {
    id: "provider_notification_setup", audience: "provider", group: "Provider · Onboarding",
    label: "Notification setup", subject: "Never miss a family inquiry",
    emailType: "notification_setup_nudge", cron: "notification-setup-nudge",
    timing: "72h after profile preview · next business-hour run",
    who: "Claimed organizations with a usable US phone and SMS not enabled.",
    why: "Help providers choose text alerts for new family inquiries.",
    render: () => onboardingNotificationsEmail({ providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", notificationsUrl: `${SAMPLE_LINK}?action=notifications` }),
  },
  {
    id: "provider_completion", audience: "provider", group: "Provider · Lifecycle",
    label: "Profile completion", subject: "See what families see on Evergreen Home Care",
    emailType: "provider_profile_completion",
    render: () => providerProfileCompletionEmail({ providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", ctaUrl: SAMPLE_LINK }),
  },
  {
    id: "provider_cold_rank", audience: "provider", group: "Provider · Lifecycle",
    label: "Cold rank (quiet week)", subject: "Families in Austin rank you #3 of 21",
    emailType: "cold_provider_rank",
    render: () => coldProviderRankEmail({ rank: 3, outOf: 21, cityLabel: "Austin", careLabel: "home care", ctaUrl: SAMPLE_LINK, manageUrl: SAMPLE_LINK, removeUrl: `${SAMPLE_LINK}/remove`, unsubscribeUrl: `${SAMPLE_LINK}/unsubscribe` }),
  },
  {
    id: "provider_leads", audience: "provider", group: "Provider · Lifecycle",
    label: "Lead digest", subject: "2 families reached out about Evergreen Home Care this week",
    emailType: "provider_lead_digest",
    render: () => providerLeadDigestEmail({ providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", leadCount: 2, ctaUrl: SAMPLE_LINK, manageUrl: SAMPLE_LINK, unsubscribeUrl: `${SAMPLE_LINK}/unsubscribe` }),
  },
  {
    id: "provider_managed_ads", audience: "provider", group: "Provider · Lifecycle",
    label: "Managed ads", subject: "140 families searched for care near Austin this week",
    emailType: "provider_managed_ads",
    render: () => providerManagedAdsEmail({ providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", ctaUrl: `${SAMPLE_LINK}?action=ads`, city: "Austin", category: "home_care_agency", localDemand: 140 }),
  },
  {
    id: "ad_boost_queued", audience: "provider", group: "Provider · Ad Boost",
    label: "Queued · profile needed", subject: "Your Ad Boost request is saved",
    emailType: "ad_boost_queued",
    cron: "ad-boost-emails",
    timing: "At request · when the provider is not launch-ready",
    situation: "Confirms the launch plan is safely recorded, explains the profile or verification gate, and gives the provider one concrete step to unblock setup.",
    who: "Provider submitted an Ad Boost launch plan while below the launch threshold or before verification.",
    why: "Confirm the request is saved, explain why it is queued, and point them to the next profile/verification step.",
    render: () => adBoostQueuedEmail({
      providerName: "Legacy Haven Senior Care",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      setupWeek: "2026-07-06",
      completeness: 48,
      threshold: 70,
      missingSectionLabel: "Photos",
      needsVerification: true,
    }),
  },
  {
    id: "ad_boost_requested", audience: "provider", group: "Provider · Ad Boost",
    label: "Requested · campaign review", subject: "We received your Ad Boost request",
    emailType: "ad_boost_requested",
    cron: "ad-boost-emails",
    timing: "At request · when the provider is already launch-ready",
    situation: "The immediate concierge handoff: Olera confirms the request is saved, restates the campaign shape, and sets expectations for family-facing page and photo review before setup.",
    who: "Provider submitted an Ad Boost request while complete enough and verified.",
    why: "Confirm the request without prematurely calling the campaign launch-ready; the first $50 promo is clear and photo review is the next internal gate.",
    render: () => adBoostRequestedEmail({
      providerName: "Miracle-Lightstar LLC",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      setupWeek: "2026-07-06",
      channel: "both",
    }),
  },
  {
    id: "ad_boost_profile_reminder", audience: "provider", group: "Provider · Ad Boost",
    label: "Reminder · finish profile", subject: "Finish your Ad Boost launch setup",
    emailType: "ad_boost_profile_reminder",
    cron: "ad-boost-profile-reminders",
    timing: "After 48 hours blocked · once",
    situation: "Sent only if the request is still waiting on profile or verification work. It is skipped when the provider clears the gate before the daily check.",
    who: "Provider submitted an Ad Boost launch plan, stayed queued for 48+ hours, and has not cleared the profile/verification launch threshold.",
    why: "Recover queued launch plans before they go cold, while explaining that the work protects the promotional ad test.",
    render: () => adBoostProfileReminderEmail({
      providerName: "Legacy Haven Senior Care",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      setupWeek: "2026-07-06",
      completeness: 48,
      threshold: 70,
      missingSectionLabel: "Photos",
      needsVerification: false,
    }),
  },
  {
    id: "ad_boost_ready", audience: "provider", group: "Provider · Ad Boost",
    label: "Promotion · review-ready", subject: "Your Ad Boost profile is ready for review",
    emailType: "ad_boost_ready",
    cron: "ad-boost-profile-reminders",
    timing: "When a previously blocked request clears the gate",
    situation: "Closes the loop without asking the provider to resubmit: their saved request automatically advances into the concierge setup queue.",
    who: "Provider had a queued Ad Boost request and later cleared completeness plus verification.",
    why: "Close the loop when queued work becomes actionable, without making the provider resubmit.",
    render: () => adBoostReadyEmail({
      providerName: "Legacy Haven Senior Care",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      setupWeek: "2026-07-06",
      channel: "google",
    }),
  },
  {
    id: "ad_boost_photo_update", audience: "provider", group: "Provider · Ad Boost",
    label: "Photo update requested", subject: "One photo update before we launch your Ad Boost",
    emailType: "ad_boost_photo_update",
    cron: "ad-boost-emails",
    timing: "After concierge photo review · if the gallery needs work",
    situation: "The campaign request is saved, but the effective landing-page gallery is mostly branding, text, close crops, or low-resolution images that may waste paid clicks.",
    who: "Provider with a pre-launch Ad Boost request whose photos were reviewed and marked as needing an update.",
    why: "Acknowledge the work already done, explain the campaign-performance risk without criticizing the provider, and give one direct path to stronger photos.",
    render: () => adBoostPhotoUpdateEmail({
      providerName: "Senior Services & Home Care",
      ctaUrl: "https://olera.care/provider?edit=gallery&ref=email&eid=sample",
    }),
  },
  {
    id: "ad_boost_photo_reminder", audience: "provider", group: "Provider · Ad Boost",
    label: "Reminder · update photos", subject: "Your Ad Boost request is waiting on photos",
    emailType: "ad_boost_photo_reminder",
    cron: "ad-boost-profile-reminders",
    timing: "After three business days without an update · once",
    situation: "The provider received the first photo request but has not saved a new gallery. The campaign remains safely held before spend begins.",
    who: "Provider whose Ad Boost request is still waiting on photos three business days after the initial request.",
    why: "Recover the campaign without creating an ongoing nag sequence; saving photos suppresses this reminder.",
    render: () => adBoostPhotoUpdateEmail({
      providerName: "Senior Services & Home Care",
      ctaUrl: "https://olera.care/provider?edit=gallery&ref=email&eid=sample",
      reminder: true,
    }),
  },
  {
    id: "ad_boost_photos_ready", audience: "provider", group: "Provider · Ad Boost",
    label: "Photos approved", subject: "Your photos are ready — campaign setup continues",
    emailType: "ad_boost_photos_ready",
    cron: "ad-boost-emails",
    timing: "When concierge approves the provider's updated gallery",
    situation: "Closes the photo-update loop and confirms that the original campaign request, timing, and preferences remain intact.",
    who: "Provider who received the Ad Boost photo request, updated their gallery, and passed concierge re-review.",
    why: "Restore momentum and make it explicit that no new request or extra submission is needed.",
    render: () => adBoostPhotosReadyEmail({
      providerName: "Senior Services & Home Care",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
    }),
  },
  {
    id: "ad_boost_lead_delivered", audience: "provider", group: "Provider · Ad Boost",
    label: "Lead delivered", subject: "Your Find Families campaign brought in a new family",
    emailType: "ad_boost_lead_delivered",
    cron: "ad-boost-emails",
    timing: "For every campaign-attributed family inquiry",
    situation: "Sent at the value moment, with one direct route to the new family. It is deduplicated by connection so the campaign does not create a second generic lead email.",
    who: "Provider with a live Ad Boost campaign receives a campaign-attributed family inquiry.",
    why: "Make the managed-ads value explicit at the moment a real family arrives, without sending a second generic lead email.",
    render: () => adBoostLeadDeliveredEmail({
      providerName: "Franchil LLC",
      familyName: "Hilda",
      careType: "Home Care",
      city: "Killeen",
      careRecipient: "their parent",
      viewUrl: "https://olera.care/provider/franchil-llc-killeen/onboard?action=lead&actionId=sample&ref=email&eid=sample",
    }),
  },
  {
    id: "ad_boost_campaign_launched", audience: "provider", group: "Provider · Ad Boost",
    label: "Campaign launched", subject: "Your Find Families campaign is live",
    emailType: "ad_boost_campaign_launched",
    cron: "ad-boost-launch-scheduler",
    alsoCrons: ["ad-boost-emails"],
    timing: "When the campaign goes live",
    situation: "Sends immediately when the live status is saved, or at the concierge-selected US Eastern time. It confirms where inquiries will arrive and what Olera will monitor.",
    who: "Provider campaign status is moved to live by the concierge team.",
    why: "Confirm the campaign has launched, set expectations for where leads arrive, and reinforce that the first $50 promo is being monitored.",
    render: () => adBoostCampaignLaunchedEmail({
      providerName: "Franchil LLC",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      channel: "both",
    }),
  },
  {
    id: "ad_boost_traction", audience: "provider", group: "Provider · Ad Boost",
    label: "Early traction", subject: "Your Find Families campaign is getting activity",
    emailType: "ad_boost_traction",
    cron: "ad-boost-emails",
    timing: "At the first real activity — measured ad landings, or entered clicks or spend · once",
    situation: "A proof-of-motion update before the starter campaign closes. When questions are waiting, it consolidates the signal into one actionable summary instead of adding another generic reminder. It fires on measured managed-UTM landings as well as typed metrics, so a campaign that is delivering still qualifies when the ad dashboard has not been copied over yet; in that case the ad clicks/spend/cost row is omitted rather than printed as zeros. A metric save with no activity of any kind does not trigger it, and later metric edits do not send it again.",
    who: "Concierge team saves metrics for a live campaign that has activity.",
    why: "Give the provider a concrete progress update before the starter promo wraps.",
    render: () => adBoostTractionEmail({
      providerName: "Graceful Homecare",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      questionsUrl: "https://olera.care/provider/qna?ref=email&eid=sample",
      visitors: 94,
      leads: 0,
      clicks: 101,
      spendCents: 3566,
      questionsReceived: 7,
      questionsUnanswered: 6,
      questionTopics: 3,
      unansweredQuestionTopics: 2,
    }),
  },
  {
    id: "ad_boost_promo_complete", audience: "provider", group: "Provider · Ad Boost",
    label: "Promo complete", subject: "Your starter campaign is complete",
    emailType: "ad_boost_promo_complete",
    cron: "ad-boost-end-scheduler",
    timing: "After the flight ends · next 10:15 AM ET business morning · once",
    situation: "Whether the flight ends automatically or the concierge closes it, the wrap-up waits for a provider-friendly business window before delivering the campaign receipt and next-step decision.",
    who: "A flight passes its end date (or the concierge ends it by hand) and the campaign produced inquiries through Olera.",
    why: "Close the loop on the $50 promotional test and invite a budget/results discussion, matching Franchil's requested next step.",
    render: () => adBoostPromoCompleteEmail({
      providerName: "Franchil LLC",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      visitors: 19,
      leads: 2,
      clicks: 5,
      spendCents: 5000,
      intendedMonthlyBudget: 300,
    }),
  },
  {
    id: "ad_boost_promo_complete_zero_lead", audience: "provider", group: "Provider · Ad Boost",
    label: "Promo complete (no inquiries via Olera)", subject: "Your starter campaign is complete",
    emailType: "ad_boost_promo_complete",
    cron: "ad-boost-end-scheduler",
    timing: "After the flight ends · next 10:15 AM ET business morning · zero Olera inquiries",
    situation: "Uses the same scheduled wrap-up window, but asks the provider whether a family contacted them another way instead of treating Olera's zero attributed inquiries as the whole truth.",
    who: "A flight ends without an inquiry recorded through Olera, so the provider is asked whether a family reached them another way.",
    why: "Our family count only sees people who contact the provider THROUGH Olera. Franchil's real paying client phoned the office directly and the platform reported zero, and the per-lead outcome sensor can never correct that (it needs a lead row to hang the question on). So a zero-lead wrap-up asks the provider directly instead of asserting a number we can't stand behind.",
    render: () => adBoostPromoCompleteEmail({
      providerName: "Abode Home Care",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      visitors: 14,
      leads: 0,
      clicks: 19,
      impressions: 4182,
      saves: 3,
      questionsReceived: 2,
      spendCents: 4149,
      intendedMonthlyBudget: 300,
      outcomeUrls: {
        client: "https://olera.care/provider/campaign-outcome?rid=sample&v=client&ref=email&eid=sample",
        talking: "https://olera.care/provider/campaign-outcome?rid=sample&v=talking&ref=email&eid=sample",
        no: "https://olera.care/provider/campaign-outcome?rid=sample&v=no&ref=email&eid=sample",
      },
    }),
  },
  {
    id: "ad_boost_lead_outcome_check", audience: "provider", group: "Provider · Ad Boost",
    label: "Lead outcome check", subject: "Did this family become a client?",
    emailType: "ad_boost_lead_outcome_check",
    cron: "ad-boost-profile-reminders",
    timing: "Around day 7, then day 21 if still unresolved",
    situation: "A one-tap follow-up for each attributed inquiry. A final client or no outcome stops the second check; still talking keeps the receipt open.",
    who: "Provider with a campaign-attributed inquiry that is about 7 days old, then again near day 21 when it is unanswered or still in conversation.",
    why: "Turn ad clicks and inquiries into an honest campaign receipt by capturing whether the family became a client.",
    render: () => adBoostLeadOutcomeEmail({
      providerName: "Franchil LLC",
      careNeed: "Home care",
      leadDate: "June 27",
      clientUrl: "https://olera.care/provider/lead-outcome?cid=sample&v=client",
      talkingUrl: "https://olera.care/provider/lead-outcome?cid=sample&v=talking",
      noUrl: "https://olera.care/provider/lead-outcome?cid=sample&v=no",
    }),
  },

  // ─────────────── Provider · Lead follow-up sequence ───────────────
  // Follow-up emails for providers who received leads through Olera but haven't
  // responded. Days 3 and 5 include self-report buttons for verified providers.
  {
    id: "provider_followup_day3",
    audience: "provider",
    group: "Provider · Lead follow-up sequence",
    label: "Day 3 · Still waiting",
    subject: "Maria is still hoping to hear from you",
    emailType: "provider_followup_day3",
    timing: "Day 3 · after lead received",
    cron: "lead-followup-sequence",
    who: "Provider received a family inquiry 3 days ago and hasn't responded (no message, phone/email click, or archive).",
    why: "Gentle nudge that replying is effortless and the family is waiting. Self-report buttons let verified providers tell us if they already connected outside Olera.",
    render: () => providerFollowupDay3Email({
      providerName: "Evergreen Home Care",
      leads: [{ familyName: "Maria Garcia", daysSinceInquiry: 3, careType: "home care", city: "Killeen", careRecipient: "her mother" }],
      viewUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=lead&actionId=sample",
      providerSlug: "evergreen-home-care",
      manageListingUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=manage",
      settingsUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=settings",
      connectionStatusUrls: {
        connected: "https://olera.care/provider/connection-status?tok=sample-connected",
        notAFit: "https://olera.care/provider/connection-status?tok=sample-not-a-fit",
        noCapacity: "https://olera.care/provider/connection-status?tok=sample-no-capacity",
      },
    }),
  },
  {
    id: "provider_followup_day3_no_buttons",
    audience: "provider",
    group: "Provider · Lead follow-up sequence",
    label: "Day 3 · Still waiting (unverified)",
    subject: "Maria is still hoping to hear from you",
    emailType: "provider_followup_day3",
    timing: "Day 3 · unverified provider",
    cron: "lead-followup-sequence",
    who: "Same as Day 3, but for unverified providers who see redacted PII — no self-report buttons since asking 'did you connect?' makes no sense.",
    why: "Nudge without self-report buttons. The provider must verify to see contact info and respond.",
    render: () => providerFollowupDay3Email({
      providerName: "Evergreen Home Care",
      leads: [{ familyName: "Maria Garcia", daysSinceInquiry: 3, careType: "home care", city: "Killeen", careRecipient: "her mother" }],
      viewUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=lead&actionId=sample",
      providerSlug: "evergreen-home-care",
      manageListingUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=manage",
      settingsUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=settings",
      // No connectionStatusUrls — unverified provider
    }),
  },
  {
    id: "provider_followup_day5",
    audience: "provider",
    group: "Provider · Lead follow-up sequence",
    label: "Day 5 · One last note (final)",
    subject: "One last note about Maria",
    emailType: "provider_followup_day6",
    timing: "Day 5 · final email",
    cron: "lead-followup-sequence",
    who: "Provider received a family inquiry ~5 days ago and still hasn't responded. This is the final automated follow-up.",
    why: "Last chance before sequence ends. Heavy signature (Logan's photo) to feel personal. Self-report buttons give providers an easy way to tell us the outcome.",
    render: () => providerFollowupDay6Email({
      providerName: "Evergreen Home Care",
      leads: [{ familyName: "Maria Garcia", daysSinceInquiry: 5, careType: "home care", city: "Killeen", careRecipient: "her mother" }],
      viewUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=lead&actionId=sample",
      providerSlug: "evergreen-home-care",
      manageListingUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=manage",
      settingsUrl: "https://olera.care/provider/evergreen-home-care/onboard?action=settings",
      connectionStatusUrls: {
        connected: "https://olera.care/provider/connection-status?tok=sample-connected",
        notAFit: "https://olera.care/provider/connection-status?tok=sample-not-a-fit",
        noCapacity: "https://olera.care/provider/connection-status?tok=sample-no-capacity",
      },
    }),
  },
  {
    id: "stale_conversation_provider",
    audience: "provider",
    group: "Provider · Lead follow-up sequence",
    label: "Stale conversation (provider side)",
    subject: "Continue your conversation with Maria?",
    emailType: "stale_conversation",
    timing: "5+ days after last message",
    cron: "conversation-stale",
    who: "A thread with ≥2 human messages went quiet 5+ days ago. Sent to the provider (the family gets a mirror).",
    why: "Reactivate a stuck conversation. Self-report buttons let verified providers tell us if they already connected or if it's not a fit, stopping future nudges.",
    render: () => staleConversationProviderEmail({
      providerName: "Evergreen Home Care",
      recipientName: "Evergreen Home Care",
      familyName: "Maria Garcia",
      daysSinceLastMessage: 6,
      viewUrl: "https://olera.care/portal/inbox?role=provider&id=sample",
      connectionStatusUrls: {
        connected: "https://olera.care/provider/connection-status?tok=sample-connected",
        notAFit: "https://olera.care/provider/connection-status?tok=sample-not-a-fit",
        noCapacity: "https://olera.care/provider/connection-status?tok=sample-no-capacity",
      },
    }),
  },
  {
    id: "stale_conversation_provider_no_buttons",
    audience: "provider",
    group: "Provider · Lead follow-up sequence",
    label: "Stale conversation (provider, unverified)",
    subject: "Continue your conversation with Maria?",
    emailType: "stale_conversation",
    timing: "5+ days after last message · unverified",
    cron: "conversation-stale",
    who: "Same as stale conversation, but for unverified providers — no self-report buttons.",
    why: "Reactivate without self-report buttons since unverified providers can't see family PII.",
    render: () => staleConversationProviderEmail({
      providerName: "Evergreen Home Care",
      recipientName: "Evergreen Home Care",
      familyName: "Maria Garcia",
      daysSinceLastMessage: 6,
      viewUrl: "https://olera.care/portal/inbox?role=provider&id=sample",
      // No connectionStatusUrls — unverified provider
    }),
  },

  // ─────────────── Provider · Outreach sequence (cold claim funnel) ───────────────
  {
    id: "provider_outreach_intro",
    audience: "provider",
    group: "Provider · Outreach sequence",
    label: "Day 0 · Visibility",
    subject: "Families in Austin can see Sunrise Senior Care on Olera",
    emailType: "provider_outreach_sequence",
    timing: "Day 0 · Provider enrolled",
    cron: "provider-outreach-send",
    who: "Unclaimed provider added to the outreach sequence.",
    why: "Families can see them but can't reach them — no one at the facility would see the message.",
    render: () => renderProviderOutreachEmail("intro", OUTREACH_CTX).html,
  },
  {
    id: "provider_outreach_followup",
    audience: "provider",
    group: "Provider · Outreach sequence",
    label: "Day 3 · Page Control",
    subject: "Who updates Sunrise Senior Care's page?",
    emailType: "provider_outreach_sequence",
    timing: "Day 3",
    cron: "provider-outreach-send",
    who: "Provider who hasn't claimed after the intro email.",
    why: "Page shows public info that gets stale — no one at the facility can update it.",
    render: () => renderProviderOutreachEmail("followup", OUTREACH_CTX).html,
  },
  {
    id: "provider_outreach_demand_loss",
    audience: "provider",
    group: "Provider · Outreach sequence",
    label: "Day 5 · FOMO",
    subject: "Families' questions are going to other providers",
    emailType: "provider_outreach_sequence",
    timing: "Day 5",
    cron: "provider-outreach-send",
    who: "Provider who hasn't claimed after the followup email.",
    why: "Other providers are getting questions and leads — create urgency.",
    render: () => renderProviderOutreachEmail("demand_loss", OUTREACH_CTX).html,
  },
  {
    id: "provider_outreach_final",
    audience: "provider",
    group: "Provider · Outreach sequence",
    label: "Day 7 · Free Ad",
    subject: "We'll run Sunrise Senior Care's first ad on us",
    emailType: "provider_outreach_sequence",
    timing: "Day 7",
    cron: "provider-outreach-send",
    who: "Provider who hasn't claimed after the demand loss email.",
    why: "Incentive offer — free ad to get more families to find them.",
    render: () => renderProviderOutreachEmail("final", OUTREACH_CTX).html,
  },
];

export function getVariant(id: string): EmailVariant | undefined {
  return EMAIL_VARIANTS.find((v) => v.id === id);
}

/** Variants sent by a given cron/registry id (for the per-job automations preview). */
export function variantsForCron(cronId: string): EmailVariant[] {
  return EMAIL_VARIANTS.filter((v) => v.cron === cronId || v.alsoCrons?.includes(cronId));
}

/** Does this cron send this variant? (primary owner or alsoCrons). */
export function variantBelongsToCron(v: EmailVariant, cronId: string): boolean {
  return v.cron === cronId || !!v.alsoCrons?.includes(cronId);
}

/**
 * ALL emails a page's journeys touch, in journey order — so an automation page
 * shows the family's full email sequence (first step → check-in), not just the
 * emails this one cron fires. Mirrors smsVariantsForJourneys; ownership is
 * carried per-chip by the detail API (`mine` / owner fields) so nothing is
 * misattributed. Falls back to the cron's own variants when it has no journeys.
 */
export function variantsForJourneys(cronId: string): EmailVariant[] {
  const journeys = journeysForCron(cronId);
  // Time-ordered journeys first so chips read in the order families get them.
  const ordered = [...journeys].sort((a, b) => (a.ordering === "time" ? 0 : 1) - (b.ordering === "time" ? 0 : 1));
  const types: string[] = [];
  for (const j of ordered) {
    for (const s of j.steps) {
      if (s.emailType && !types.includes(s.emailType)) types.push(s.emailType);
    }
  }
  const out: EmailVariant[] = [];
  for (const t of types) {
    for (const v of EMAIL_VARIANTS) {
      if (v.emailType === t && !out.includes(v)) out.push(v);
    }
  }
  for (const v of variantsForCron(cronId)) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** May this cron's detail page preview this variant? Own sends, plus emails a
 *  journey shown on this page names (rendered with "sent by" attribution). */
export function variantAllowedForCron(v: EmailVariant, cronId: string): boolean {
  if (variantBelongsToCron(v, cronId)) return true;
  return journeysForCron(cronId).some((j) => j.steps.some((s) => s.emailType === v.emailType));
}

/**
 * Variants for a given email_type (one type can have several copy variants, e.g.
 * provider-silent vs. provider-declined). Powers the Family Comms per-type drawer:
 * it keys on email_type (what email_log records) and surfaces every matching
 * rendered variant. Family audience only by default — the drawer is family-scoped.
 */
export function variantsForEmailType(emailType: string, audience?: EmailVariant["audience"]): EmailVariant[] {
  return EMAIL_VARIANTS.filter((v) => v.emailType === emailType && (!audience || v.audience === audience));
}

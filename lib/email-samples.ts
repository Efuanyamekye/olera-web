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
  postConnectionFollowupEmail,
  monthlyProviderRecommendationsEmail,
  inactivityReengagementEmail,
  type EmailProviderCard,
  // provider
  providerWeeklyDigestEmail,
  providerProfileCompletionEmail,
  coldProviderRankEmail,
  providerLeadDigestEmail,
  providerManagedAdsEmail,
  providerFindFamiliesDigestEmail,
  adBoostQueuedEmail,
  adBoostProfileReminderEmail,
  adBoostRequestedEmail,
  adBoostReadyEmail,
  adBoostLeadDeliveredEmail,
  adBoostCampaignLaunchedEmail,
  adBoostTractionEmail,
  adBoostPromoCompleteEmail,
} from "@/lib/email-templates";

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
  /** Cron/registry id that sends it — links to /admin/automations/[id]. */
  cron?: string;
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
    label: "Requested · launch-ready", subject: "Your Ad Boost request is ready for setup",
    emailType: "ad_boost_requested",
    cron: "ad-boost-emails",
    who: "Provider submitted an Ad Boost request while complete enough and verified.",
    why: "Automate the Franchil-style initial handoff: the page has enough detail to start setup, the first $50 promo is clear, and the provider can watch results in Ad Boost.",
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
    cron: "ad-boost-emails",
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
    label: "Promotion · now ready", subject: "Your Ad Boost request is now launch-ready",
    emailType: "ad_boost_ready",
    cron: "ad-boost-emails",
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
    id: "ad_boost_lead_delivered", audience: "provider", group: "Provider · Ad Boost",
    label: "Lead delivered", subject: "Your Find Families campaign brought in a new family",
    emailType: "ad_boost_lead_delivered",
    cron: "ad-boost-emails",
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
    cron: "ad-boost-emails",
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
    who: "Concierge team enters spend/click metrics for a live campaign.",
    why: "Give the provider a concrete progress update before the starter promo wraps.",
    render: () => adBoostTractionEmail({
      providerName: "Franchil LLC",
      ctaUrl: "https://olera.care/provider/boost?ref=email&eid=sample",
      visitors: 19,
      leads: 2,
      clicks: 5,
      spendCents: 1140,
    }),
  },
  {
    id: "ad_boost_promo_complete", audience: "provider", group: "Provider · Ad Boost",
    label: "Promo complete", subject: "Your starter campaign is complete",
    emailType: "ad_boost_promo_complete",
    cron: "ad-boost-emails",
    who: "Concierge team marks the starter campaign ended.",
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
];

export function getVariant(id: string): EmailVariant | undefined {
  return EMAIL_VARIANTS.find((v) => v.id === id);
}

/** Variants sent by a given cron/registry id (for the per-job automations preview). */
export function variantsForCron(cronId: string): EmailVariant[] {
  return EMAIL_VARIANTS.filter((v) => v.cron === cronId);
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

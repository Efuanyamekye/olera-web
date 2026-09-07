/**
 * Comms journeys — the declarative "which message comes before which" map that
 * /admin/automations/[id] renders as a sequence timeline.
 *
 * WHY THIS EXISTS: the benefits cascade is ONE family experience executed by
 * TWO crons — the daily coordinator composes B1 drafts and sends B2, while the
 * hourly navigator scheduler fires the TJ-approved letters — so no single cron
 * page can show the whole picture from its own registry entry. This module is
 * the journey-level source both pages share: each page highlights the steps it
 * owns and dims (and links) the ones another automation runs.
 *
 * DRIFT GUARD: timings and gates here are hand-authored mirrors of the real
 * entry + delivery paths in components/providers/BenefitsDiscoveryModule*,
 * components/waiver-library/ProgramBenefitsCard.tsx,
 * app/api/benefits/save-results/route.ts,
 * app/api/cron/family-comms-coordinator/route.ts, and
 * lib/family-comms/benefits-navigator-send.server.ts. If you change a gate,
 * CTA, time band, or rung order there, update the matching step here.
 *
 * Pure data + pure functions, client-safe (the detail page imports directly).
 */

export interface JourneyStep {
  key: string;
  /** Step name, e.g. "B1 · Letter sent (+ companion text)". */
  title: string;
  /** When it fires relative to the journey anchor, e.g. "Intake +2–10d". */
  timing: string;
  /** What happens, in plain terms. */
  description: string;
  /** email_log email_type(s) sent at this step — display string, may list several. */
  emailType?: string;
  /** Consent-gated text sent alongside (email_log channel='sms'), if any. */
  smsType?: string;
  /** Registry id of the automation that executes this step. Absent = event-driven. */
  ownedBy?: string;
  /** Shown instead of an owner link when the step isn't cron-driven. */
  ownerNote?: string;
  /** One-line gate note shown under the step. */
  gate?: string;
  /** Product phase used to group long journeys into scannable chapters. */
  phase?: string;
  /** Small, plain-language traits such as "Conditional" or "Repeats per lead". */
  traits?: string[];
  /** Exact email sample selected by the family-journey preview link. */
  emailSampleId?: string;
  /** Exact text sample selected by the family-journey preview link. */
  smsSampleId?: string;
  /** Public/admin experience that lets an operator inspect this non-message step. */
  experienceUrl?: string;
  /** CTA label for experienceUrl. Defaults to "View experience". */
  experienceLabel?: string;
}

export interface CommsJourney {
  key: string;
  title: string;
  /** "time" = a dated sequence; "priority" = a ladder where the highest
   *  matching rung wins each cycle (order = priority, not chronology). */
  ordering: "time" | "priority";
  description: string;
  /** Eyebrow label. Defaults to "Family journey" for time-ordered journeys. */
  audienceLabel?: string;
  steps: JourneyStep[];
}

const BENEFITS_CASCADE: CommsJourney = {
  key: "benefits_cascade",
  title: "Benefits cascade — the family's sequence",
  ordering: "time",
  description:
    "One guidance journey from the family's results CTA through the channels they choose: contact capture creates or updates their living plan, results arrive for a new family, the daily coordinator drafts B1 and sends B2, and the hourly scheduler (or TJ's button) fires the approved first step. Text replies update the same plan.",
  steps: [
    {
      key: "results_cta",
      title: "Results CTA submitted → contact captured",
      timing: "Day 0 · Immediately before results delivery",
      description:
        "After seeing a benefits prompt on a program, provider, or editorial page, the family enters an email and submits the surface's results CTA — for example, “Email me my matches,” “Save my matches,” or “Check my eligibility.” The shared save-results path stores their matches and creates or updates the private living plan that every later message points back to; a phone is an optional second channel on supported surfaces.",
      ownerNote: "Public benefits experience · funnel signals: cta_engaged + benefits_completed",
      gate: "A valid email is required for the results email; an optional phone only receives the companion text when entered with the SMS disclosure",
      traits: ["Conversion", "Contact capture"],
      experienceUrl: "/benefits/texas/star-plus-medicaid-hcbs",
      experienceLabel: "View example CTA",
    },
    {
      key: "intake_results",
      title: "Context-aware results email delivered (new email family)",
      timing: "Day 0 · Results CTA completed",
      description:
        "A new family submits one of the benefits capture surfaces with an email. A specific program-page entry continues with that exact program, its general requirements, and its guide; a broad finder, provider, or editorial entry receives an honest plan-ready receipt. Olera also saves the requested program separately from ranked suggestions so it is not lost or mislabeled as an eligibility match.",
      emailType: "benefits_results_saved",
      emailSampleId: "benefits_results_saved",
      ownedBy: "benefits-results-texts",
      gate: "New families with a valid email only; an email address never establishes eligibility. A returning account updates its plan without receiving a duplicate welcome-results email",
    },
    {
      key: "intake_results_sms",
      title: "Care-team question + plan texted (optional)",
      timing: "Day 0 · When a phone is provided",
      description:
        "A family who enters a phone under the SMS disclosure receives a bounded question from Olera's care team plus the same living /m plan link. New families can receive it with their initial results; a family on the program-page email path can also add a phone during post-submit enrichment. The care team promises to reply within 48 hours when the family responds, and stores sms_consent for the later navigator and check-in.",
      smsType: "benefits_results_sms",
      smsSampleId: "sms_benefits_match",
      ownedBy: "benefits-results-texts",
      gate: "Requires a valid phone entered with the SMS disclosure. Initial save-results delivery is new-family only; post-submit phone enrichment can send the same results text to a returning family",
    },
    {
      key: "b1_draft",
      title: "B1 · Navigator guidance drafted",
      timing: "Intake +2–10d",
      description:
        "The coordinator composes personal first-step guidance: an email when available and a reply-enabled text for consented families. It parks the draft in /admin/benefits for review.",
      ownedBy: "family-comms-coordinator",
      gate: "Draft only — nothing reaches the family until the care team approves it in the queue",
    },
    {
      key: "b1_send",
      title: "B1 · First step sent (email and/or text)",
      timing: "When the care team sends, or at the scheduled hour",
      description:
        "The care team's send button and the hourly scheduler run one shared send path. Email families receive the reviewed letter; consented text families receive the first step in the same thread. Text-only families keep moving without being forced into email.",
      emailType: "benefits_first_step",
      smsType: "benefits_first_step_sms",
      emailSampleId: "benefits_first_step",
      smsSampleId: "sms_benefits_first_step",
      ownedBy: "benefits-navigator-scheduler",
      gate: "At least one reachable consented channel is required; an after-hours companion text queues for morning, while a text-only B1 stays pending and reschedules to the next legal window",
    },
    {
      key: "b2",
      title: "B2 · Progress check (email and/or text)",
      timing: "First step +3–14d",
      description:
        "Three to fourteen days after B1, Olera asks what happened next. Email offers the existing outcome choices; text understands CALLED, NO ANSWER, APPLIED, NEED DOCS, WAITING, NOT ELIGIBLE, or STUCK and writes that status back to the living plan. Text-only families receive B2 by text.",
      emailType: "benefits_check_in",
      smsType: "benefits_check_in_sms",
      emailSampleId: "benefits_check_in",
      smsSampleId: "sms_benefits_check_in",
      ownedBy: "family-comms-coordinator",
      gate: "One-shot; skipped once an outcome is reported; STUCK alerts the Olera team without promising an unstaffed response time",
    },
    {
      key: "suppression",
      title: "Completion track paused",
      timing: "While the cascade is in flight (~21d)",
      description:
        "Benefits families are excluded from generic profile-completion nudges while their cascade is active. They rejoin after an outcome is recorded or the 21-day window ends; the window ending is not treated as proof the problem was resolved.",
      ownedBy: "family-comms-coordinator",
    },
  ],
};

const HELP_CASCADE_LADDER: CommsJourney = {
  key: "help_cascade_ladder",
  title: "Help-cascade ladder — how the daily pick works",
  ordering: "priority",
  description:
    "Each family gets at most ONE governed email per daily run; the first matching rung from the top wins. Global stops come first: unsubscribed, self-reported \"yes they got back to me\", or an active live thread means nothing sends.",
  steps: [
    {
      key: "r1",
      title: "R1 · Outcome check (sensor)",
      timing: "Inquiry 48–72h old, provider silent",
      description: "\"Did they get back to you?\" — the ground-truth sensor that catches stalled connections early.",
      emailType: "family_outcome_check",
      ownedBy: "family-comms-coordinator",
    },
    {
      key: "archetype",
      title: "First touch · Archetype (intent self-sort)",
      timing: "Any recent inquiry, once ever",
      description: "One question, three scenarios — captures where the family is so tone and cadence are tailored.",
      emailType: "family_archetype",
      ownedBy: "family-comms-coordinator",
    },
    {
      key: "r2",
      title: "R2 · Provider silent → alternatives",
      timing: "Provider still silent after the outcome check",
      description: "Compare-led rescue: responsive alternatives near them, one-tap introductions.",
      emailType: "family_provider_silent",
      ownedBy: "family-comms-coordinator",
    },
    {
      key: "r3",
      title: "R3 · Never engaged → compare / guide",
      timing: "Family never engaged with their inquiry",
      description: "Guide fallback when the market is thin (<3 alternatives), compare otherwise.",
      emailType: "family_never_engaged",
      ownedBy: "family-comms-coordinator",
    },
    {
      key: "r4",
      title: "R4 · Provider responded → compare + choose",
      timing: "~Day 10, family hasn't chosen",
      description: "The provider replied but the family stalled — help them compare and decide.",
      emailType: "day_10_awaiting",
      ownedBy: "family-comms-coordinator",
    },
    {
      key: "r5",
      title: "R5 · Pending reach-out",
      timing: "Reach-out delivered, family hasn't acted",
      description: "Nudges the family back to a provider's waiting reach-out message.",
      emailType: "family_reach_out_nudge",
      ownedBy: "family-comms-coordinator",
    },
    {
      key: "b1_draft",
      title: "B1 · Navigator draft (benefits cascade)",
      timing: "Benefits intake +2–10d",
      description: "Composes the reviewed first-step letter into the /admin/benefits queue — see the Benefits cascade sequence below for the full journey.",
      ownedBy: "family-comms-coordinator",
      gate: "Composes a draft; the send is care-team-gated and fired by the navigator scheduler",
    },
    {
      key: "b2",
      title: "B2 · Benefits check-in",
      timing: "First step +3–14d",
      description: "The forward-looking check-in, with its consent-gated mirror text.",
      emailType: "benefits_check_in",
      smsType: "benefits_check_in_sms",
      ownedBy: "family-comms-coordinator",
    },
    {
      key: "completion",
      title: "Completion track (Track 2)",
      timing: "Signup days 0/2/6/13, then monthly",
      description: "The single owner of the \"finish your profile\" ask, for any incomplete family the higher rungs didn't claim. Suppressed while a benefits cascade is in flight.",
      emailType: "completion_nudge_1–4, completion_maintenance",
      ownedBy: "family-comms-coordinator",
    },
  ],
};

/**
 * One provider experience, implemented by three different delivery paths:
 * request/lifecycle events, the daily readiness + outcome worker, and the
 * hourly launch scheduler. The admin should teach the experience first and
 * expose those engines as supporting operational detail.
 *
 * DRIFT GUARD: mirrors app/api/provider/ad-boost/request/route.ts,
 * app/api/admin/ad-boost/route.ts, app/api/cron/ad-boost-profile-reminders,
 * and lib/ad-boost/{lead,outcome,lifecycle}-notifications.server.ts.
 */
export const AD_BOOST_PROVIDER_JOURNEY: CommsJourney = {
  key: "ad_boost_provider_journey",
  title: "Ad Boost campaign — the provider journey",
  ordering: "time",
  audienceLabel: "Provider journey",
  description:
    "One campaign story across request, launch, live results, and outcome follow-up. Branches are conditional; lead delivery and outcome checks repeat for each attributed inquiry.",
  steps: [
    {
      key: "request_queued",
      phase: "Request",
      title: "Request saved · profile needed",
      timing: "At request · if not launch-ready",
      description:
        "Olera saves the provider's requested setup week and budget before their profile is ready, then points them to the missing profile or verification work.",
      emailType: "ad_boost_queued",
      ownedBy: "ad-boost-emails",
      emailSampleId: "ad_boost_queued",
      traits: ["Conditional", "One-time"],
      gate: "Only when the profile is below the launch threshold or verification is incomplete",
    },
    {
      key: "request_ready",
      phase: "Request",
      title: "Request received · campaign review next",
      timing: "At request · if launch-ready",
      description:
        "A complete, verified provider gets an immediate confirmation: the request is saved, the starter promotion is clear, and the family-facing page enters campaign review before setup.",
      emailType: "ad_boost_requested",
      ownedBy: "ad-boost-emails",
      emailSampleId: "ad_boost_requested",
      traits: ["Conditional", "One-time"],
      gate: "Mutually exclusive with the queued email",
    },
    {
      key: "profile_reminder",
      phase: "Prepare",
      title: "Finish-profile reminder",
      timing: "Queued for 48+ hours",
      description:
        "If the request is still blocked, the daily worker sends one focused reminder naming the next useful profile or verification step.",
      emailType: "ad_boost_profile_reminder",
      ownedBy: "ad-boost-profile-reminders",
      emailSampleId: "ad_boost_profile_reminder",
      traits: ["Conditional", "One-time"],
      gate: "Skipped when the provider becomes launch-ready before the reminder is due",
    },
    {
      key: "promotion_ready",
      phase: "Prepare",
      title: "Queued profile becomes review-ready",
      timing: "When eligibility is re-checked",
      description:
        "The saved request advances without a second submission. The provider gets a clear confirmation and the concierge team is notified that final campaign review can begin.",
      emailType: "ad_boost_ready",
      ownedBy: "ad-boost-profile-reminders",
      emailSampleId: "ad_boost_ready",
      traits: ["Conditional", "One-time"],
      gate: "Only for a request that started in the queued path",
    },
    {
      key: "photo_review",
      phase: "Prepare",
      title: "Review campaign photos",
      timing: "Before concierge setup",
      description:
        "The concierge reviews the effective gallery at landing-page size. This is separate from profile completeness: image URLs can fill a profile without being useful paid-traffic creative.",
      ownerNote: "Human-reviewed in the Ad Boost concierge queue",
      traits: ["Silent step", "Paid-traffic gate"],
      gate: "Every pre-launch campaign must be marked photo-ready before it can move to scheduled or live",
    },
    {
      key: "photo_update_requested",
      phase: "Prepare",
      title: "One photo update requested",
      timing: "After concierge photo review · if needed",
      description:
        "The provider's request remains saved while one supportive email explains why clearer real-world photos protect campaign spend and deep-links to the gallery editor.",
      emailType: "ad_boost_photo_update",
      ownedBy: "ad-boost-emails",
      emailSampleId: "ad_boost_photo_update",
      traits: ["Conditional", "One-time"],
      gate: "Only when the concierge marks the landing-page gallery as needing an update",
    },
    {
      key: "photo_update_reminder",
      phase: "Prepare",
      title: "Photo-update reminder",
      timing: "After 3 business days · once",
      description:
        "If no new gallery has been saved, the daily worker sends one concise reminder. Saving photos stops the reminder immediately; there is no ongoing nag sequence.",
      emailType: "ad_boost_photo_reminder",
      ownedBy: "ad-boost-profile-reminders",
      emailSampleId: "ad_boost_photo_reminder",
      traits: ["Conditional", "One-time"],
      gate: "Only while the campaign is still waiting on the provider's photo update",
    },
    {
      key: "photos_ready",
      phase: "Prepare",
      title: "Updated photos approved",
      timing: "When concierge clears the photo gate",
      description:
        "After the provider saves a new gallery, the concierge re-reviews it. Approval closes the loop by confirming that setup is continuing without another Ad Boost request.",
      emailType: "ad_boost_photos_ready",
      ownedBy: "ad-boost-emails",
      emailSampleId: "ad_boost_photos_ready",
      traits: ["Conditional", "One-time"],
      gate: "Only sends when a campaign that received the photo-update request is later approved",
    },
    {
      key: "concierge_setup",
      phase: "Prepare",
      title: "Concierge setup and scheduling",
      timing: "Requested → scheduled",
      description:
        "After the profile, verification, and photo gates are clear, the team prepares the campaign, confirms the channel and budget, and chooses the flight and launch-email timing. This is an operational state, not a provider message.",
      ownerNote: "Managed in the Ad Boost concierge queue",
      traits: ["Silent step"],
      gate: "Requires photo readiness; no email is sent merely because the internal status becomes scheduled",
    },
    {
      key: "campaign_launched",
      phase: "Run",
      title: "Campaign launched",
      timing: "When the campaign goes live",
      description:
        "The provider learns that Find Families is live and where new inquiries will arrive. It sends immediately or at the chosen US Eastern hour through one deduplicated path.",
      emailType: "ad_boost_campaign_launched",
      ownedBy: "ad-boost-launch-scheduler",
      emailSampleId: "ad_boost_campaign_launched",
      traits: ["One-time"],
      gate: "Missing email, unsubscribe, or suppression blocks the send; transport failures retry when scheduled",
    },
    {
      key: "traction",
      phase: "Run",
      title: "Early traction update",
      timing: "First meaningful live metrics",
      description:
        "Once real spend or clicks are recorded, the provider gets a concrete progress note with campaign activity before the starter promotion closes.",
      emailType: "ad_boost_traction",
      ownedBy: "ad-boost-emails",
      emailSampleId: "ad_boost_traction",
      traits: ["Conditional", "One-time"],
      gate: "Requires a live campaign and non-zero spend or clicks",
    },
    {
      key: "lead_delivered",
      phase: "Prove value",
      title: "A new family is delivered",
      timing: "For every attributed inquiry",
      description:
        "At the moment a managed-campaign inquiry arrives, the provider receives one campaign-specific lead email with a direct path to the family.",
      emailType: "ad_boost_lead_delivered",
      ownedBy: "ad-boost-emails",
      emailSampleId: "ad_boost_lead_delivered",
      traits: ["Repeats per lead"],
      gate: "Deduplicated by connection; only inquiries carrying the campaign's managed attribution qualify",
    },
    {
      key: "lead_outcome",
      phase: "Prove value",
      title: "Lead outcome check",
      timing: "~7d, then ~21d if unresolved",
      description:
        "A one-tap check asks whether the family became a client, is still talking, or did not work out. Answers update the living campaign receipt.",
      emailType: "ad_boost_lead_outcome_check",
      ownedBy: "ad-boost-profile-reminders",
      emailSampleId: "ad_boost_lead_outcome_check",
      traits: ["Repeats per lead", "Up to twice"],
      gate: "At most one outcome email per provider per daily run; the second check stops after a final outcome",
    },
    {
      key: "promo_complete",
      phase: "Prove value",
      title: "Starter campaign complete",
      timing: "After the flight ends · next 10:15 AM ET business morning",
      description:
        "The flight ends automatically after its final serving day, or when the concierge closes it. The wrap-up then brings spend, clicks, engagement, inquiries, and known outcomes into one receipt. If Olera recorded no inquiry, the provider gets a version that asks whether anyone contacted them another way.",
      emailType: "ad_boost_promo_complete",
      ownedBy: "ad-boost-end-scheduler",
      emailSampleId: "ad_boost_promo_complete",
      traits: ["One-time", "Two result variants"],
      gate: "Requires an ended campaign and a due wrap-up schedule; outcome checks may continue for unresolved leads",
    },
    {
      key: "plan_decision",
      phase: "Continue",
      title: "Continue or pause with proof in hand",
      timing: "After the 3rd lead or campaign wrap-up",
      description:
        "The provider's living results page opens the paid-plan decision after demonstrated value. Stripe owns the subscription state; this step does not add another email.",
      ownerNote: "Provider results page + Stripe",
      traits: ["Value-gated", "Silent step"],
    },
  ],
};

/**
 * Provider outreach journey — the claim funnel from enrollment through
 * follow-up channels to terminal states.
 *
 * DRIFT GUARD: mirrors the actual /admin/provider-outreach tabs:
 *   - Call & Confirm → In Sequence → Follow Up → Alternative Channels → Call
 *   - Terminal states: Claimed, Not Interested, Archived, Hidden
 *
 * The 4-email cadence is Day 0/3/5/7 via provider-outreach-send cron.
 * Follow Up offers multiple manual channels: resend link, fax, postcard, contact form.
 *
 * MINIMUM ATTEMPTS (documented in WorkflowGuideModal.tsx):
 *   - Call & Confirm: 3 calls minimum before confirming email
 *   - Follow Up: 2 calls minimum
 *   - Alternative Channels: 7-day wait
 *   - Call (final): 2 calls minimum
 *   - Total: 7+ calls minimum before marking Not Interested
 */
export const PROVIDER_OUTREACH_JOURNEY: CommsJourney = {
  key: "provider_outreach_journey",
  title: "Provider outreach — the claim journey",
  ordering: "time",
  audienceLabel: "Provider journey",
  description:
    "Full outreach journey from enrollment to claim. Providers start in Call & Confirm (Needs Email or Ready), " +
    "where admins find emails and verify them via phone (minimum 3 call attempts). After confirmation, " +
    "admin launches the 4-email sequence (Day 0/3/5/7). Non-claimers move to Follow Up for manual channels " +
    "(2 call attempts minimum). After fax/postcard/contact form, providers wait in Alternative Channels " +
    "(7-day wait), then move to Call tab for final attempts (2 calls minimum). " +
    "Total: 7+ calls before terminal. Terminal states: Claimed (success), Not Interested (soft exit), " +
    "Archived (hard exit), Hidden (admin-hidden, restorable).",
  steps: [
    // ── Call & Confirm ──────────────────────────────────────────────────
    // This phase combines the old "Needs Email" and "Ready" states. The goal is
    // to find an email, verify it via phone calls, and confirm before launching.
    {
      key: "needs_email",
      phase: "Call & Confirm",
      title: "Provider in Needs Email queue",
      timing: "Entry point · No email on file",
      description:
        "Provider is enrolled in outreach but has no email address. " +
        "Admin can find email via website scraping (auto-runs when drawer opens) or Apollo decision-maker lookup. " +
        "Once email is found and saved, provider moves to Ready within the same tab.",
      ownerNote: "Call & Confirm tab (Needs Email section) in /admin/provider-outreach",
      traits: ["Entry point"],
    },
    {
      key: "email_discovered",
      phase: "Call & Confirm",
      title: "Email discovered",
      timing: "Auto or manual · Scraping, Perplexity, or Apollo",
      description:
        "Admin finds provider's email via website scraping (generic org email), Perplexity AI analysis, " +
        "or Apollo lookup (decision-maker email). Apollo contacts show name, title, and LinkedIn. " +
        "Email source is tracked: 'organization' vs 'decision_maker' for conversion analysis. " +
        "Email verification badge shows deliverability status (valid/risky/invalid).",
      ownerNote: "Inline discovery in Call & Confirm tab",
      traits: ["Auto + Manual", "Discovery"],
    },
    {
      key: "provider_ready",
      phase: "Call & Confirm",
      title: "Provider in Ready queue",
      timing: "After email found",
      description:
        "Provider has email and is ready to receive outreach. Admin calls to verify the email is correct. " +
        "Call Script is available for phone outreach. Optionally upgrade to decision-maker via Apollo.",
      ownerNote: "Call & Confirm tab (Ready section) in /admin/provider-outreach",
      traits: ["Staging area"],
    },
    {
      key: "call_to_verify",
      phase: "Call & Confirm",
      title: "Call to verify email",
      timing: "Manual · Minimum 3 call attempts",
      description:
        "Admin calls provider to verify the email address is correct before launching sequence. " +
        "MINIMUM 3 CALL ATTEMPTS required before marking as confirmed. Each call is a conversion opportunity — " +
        "if speaking with a decision maker who shows high interest, send claim link immediately. " +
        "Take detailed notes on every call so anyone can pick up where you left off.",
      ownerNote: "Call workflow in Call & Confirm tab",
      traits: ["Manual", "Min 3 calls", "Notes required"],
      gate: "Requires 3 call attempts documented in notes before confirming",
    },
    {
      key: "admin_confirms",
      phase: "Call & Confirm",
      title: "Admin confirms email",
      timing: "Manual · After due diligence",
      description:
        "Admin clicks the blue checkmark to confirm the email is correct. Only confirm after proper due diligence — " +
        "notes should support the confirmation (3+ call attempts documented). This sets confirmed_at " +
        "and marks the provider ready for sequence launch. Unconfirm is available to reset.",
      ownerNote: "Confirm button in Call & Confirm tab",
      traits: ["Manual", "Checkpoint", "Notes-backed"],
    },
    {
      key: "sequence_launched",
      phase: "Call & Confirm",
      title: "Sequence launched",
      timing: "Manual · Batch select + Launch",
      description:
        "Admin selects confirmed providers and launches sequence via batch action. Preview shows exact emails. " +
        "Provider moves to In Sequence, 4 email tasks are scheduled (Day 0/3/5/7), " +
        "and SmartLead fires the emails automatically. Assignee is tracked for attribution.",
      ownerNote: "Batch launch via /api/admin/provider-outreach/launch-sequence",
      ownedBy: "provider-outreach-send",
      traits: ["Manual", "Batch", "Preview available"],
    },
    // ── Email Sequence (In Sequence) ────────────────────────────────────
    {
      key: "in_sequence_tracking",
      phase: "In Sequence",
      title: "Provider in automated sequence",
      timing: "Days 0-7 · Automated",
      description:
        "No action required — automated email sequence runs here. Provider receives 4 emails over 7 days. " +
        "Progress badge shows X/4. Admin can view email history, find Apollo decision-maker, " +
        "or reset to Ready with new email if needed.",
      ownerNote: "In Sequence tab in /admin/provider-outreach",
      traits: ["Automated", "Tracking"],
    },
    {
      key: "intro_email",
      phase: "In Sequence",
      title: "Day 0: Visibility email",
      timing: "Day 0 · Immediate",
      description:
        "First email: 'Families in [city] can see [provider] on Olera.' " +
        "Explains that families can find them but can't reach them yet.",
      emailType: "provider_outreach_sequence",
      emailSampleId: "provider_outreach_intro",
      ownedBy: "provider-outreach-send",
    },
    {
      key: "followup_email",
      phase: "In Sequence",
      title: "Day 3: Page Control email",
      timing: "Day 3",
      description:
        "Second email: 'Who updates [provider]'s page?' " +
        "Ownership angle — public info gets stale, no one can update pricing/photos.",
      emailType: "provider_outreach_sequence",
      emailSampleId: "provider_outreach_followup",
      ownedBy: "provider-outreach-send",
    },
    {
      key: "demand_loss_email",
      phase: "In Sequence",
      title: "Day 5: FOMO email",
      timing: "Day 5",
      description:
        "Third email: 'Families' questions are going to other providers.' " +
        "Urgency angle — families sent inquiries this week that went unanswered.",
      emailType: "provider_outreach_sequence",
      emailSampleId: "provider_outreach_demand_loss",
      ownedBy: "provider-outreach-send",
    },
    {
      key: "final_email",
      phase: "In Sequence",
      title: "Day 7: Free Ad email",
      timing: "Day 7 · Final automated email",
      description:
        "Fourth and final email: 'We'll run [provider]'s first ad on us.' " +
        "Incentive offer — free ad setup to drive more family views.",
      emailType: "provider_outreach_sequence",
      emailSampleId: "provider_outreach_final",
      ownedBy: "provider-outreach-send",
      traits: ["Final automated email"],
    },
    // ── Follow Up ───────────────────────────────────────────────────────
    {
      key: "sequence_exhausted",
      phase: "Follow Up",
      title: "Provider enters Follow Up queue",
      timing: "Day 7+ · No claim",
      description:
        "Sequence complete without a claim. Provider moves to Follow Up (needs_call stage) " +
        "with reason badge: Replied (hot lead), Clicked (engaged but didn't claim), " +
        "Sequence done (no engagement), Bounced (email failed). " +
        "Sorted by priority: Replied first, then Clicked, then others. Due date assigned.",
      ownedBy: "provider-outreach-sequence-check",
      gate: "Only if provider hasn't claimed by end of sequence",
    },
    {
      key: "follow_up_calls",
      phase: "Follow Up",
      title: "Follow-up call attempts",
      timing: "Manual · Minimum 2 call attempts",
      description:
        "Admin calls provider to convert them on the phone. Goal is to get provider to claim during the call. " +
        "MINIMUM 2 FOLLOW-UP ATTEMPTS required. Call Script available: 'Did you get the emails we sent? " +
        "Families in [city] are trying to reach you.' If provider prefers alternative channels, use them.",
      ownerNote: "Call workflow in Follow Up tab",
      traits: ["Manual", "Min 2 calls", "Conversion focus"],
    },
    {
      key: "resend_claim_link",
      phase: "Follow Up",
      title: "Resend Claim Link",
      timing: "Manual · Up to 2 times",
      description:
        "Admin clicks 'Resend Claim Link' to send the nudge email with a fresh claim URL. " +
        "Limited to 2 resends per provider. Uses the 'nudge' template via Resend (not SmartLead). " +
        "Provider moves to Alternative Channels after sending.",
      emailType: "provider_outreach_sequence",
      ownerNote: "Inline action in Follow Up tab; moves to Alternative Channels",
      traits: ["Manual", "Max 2 resends"],
    },
    {
      key: "contact_form_attempt",
      phase: "Follow Up",
      title: "Contact form submitted",
      timing: "Manual · When website has contact form",
      description:
        "Admin clicks 'Contact Form', system auto-finds the form URL on provider's website. " +
        "Admin copies the pre-written claim message, opens the form, submits manually, then confirms. " +
        "Submission count tracked in Activity. Provider moves to Alternative Channels.",
      ownerNote: "Manual submission through provider's website contact form",
      traits: ["Manual", "Conditional"],
      gate: "Requires provider website with discoverable contact form",
    },
    {
      key: "fax_attempt",
      phase: "Follow Up",
      title: "Fax sent",
      timing: "Manual · When fax number available",
      description:
        "Admin clicks 'Send Fax', system auto-finds fax number from website or admin enters manually. " +
        "Fax is sent via Telnyx with QR code for tracking. Provider moves to Alternative Channels.",
      ownerNote: "Inline send from Follow Up tab; tracked in Alternative Channels",
      traits: ["Manual", "Conditional", "Has cost"],
      gate: "Requires valid fax number (auto-discovered or manually entered)",
    },
    {
      key: "directmail_attempt",
      phase: "Follow Up",
      title: "Postcard sent",
      timing: "Manual · When address available",
      description:
        "Admin clicks 'Send Postcard', system auto-finds address or admin enters manually. " +
        "Postcard is sent via PostGrid. Provider moves to Alternative Channels for delivery tracking.",
      ownerNote: "Inline send from Follow Up tab; tracked in Alternative Channels",
      traits: ["Manual", "Conditional", "Has cost"],
      gate: "Requires valid mailing address",
    },
    {
      key: "fix_email",
      phase: "Follow Up",
      title: "Email fixed inline",
      timing: "Manual · When email bounced or wrong",
      description:
        "Admin updates a bounced or incorrect email address inline. If wrong email discovered during call, " +
        "change email and move back to Ready (Call & Confirm tab) for fresh sequence.",
      ownerNote: "Inline editing in Follow Up tab",
      traits: ["Manual", "Recovery"],
    },
    {
      key: "apollo_discovery",
      phase: "Follow Up",
      title: "Apollo decision-maker found",
      timing: "Manual · Find Apollo button",
      description:
        "Admin clicks 'Find Apollo' to discover decision-maker contact (name, title, email, LinkedIn). " +
        "If found, admin can use the decision-maker email and reset to Ready for a fresh sequence.",
      ownerNote: "Discovery tool in Follow Up tab",
      traits: ["Manual", "Discovery"],
    },
    {
      key: "linkedin_discovery",
      phase: "Follow Up",
      title: "LinkedIn discovered",
      timing: "Manual · Find LinkedIn button",
      description:
        "Admin clicks 'Find LinkedIn' to discover provider's LinkedIn page from their website. " +
        "LinkedIn is a discovery tool for manual outreach — admin messages directly on LinkedIn.",
      ownerNote: "Discovery tool in Follow Up tab; not an automated channel",
      traits: ["Manual", "Discovery"],
      gate: "Requires provider website; admins manually reach out via LinkedIn",
    },
    {
      key: "reset_to_ready",
      phase: "Follow Up",
      title: "Reset to Ready",
      timing: "Manual · After fixing email or finding Apollo",
      description:
        "Admin resets provider back to Ready (Call & Confirm tab), typically after finding a better email via Apollo. " +
        "Provider can then be enrolled in a fresh sequence with the new contact.",
      ownerNote: "Recovery action in Follow Up tab",
      traits: ["Manual", "Recovery"],
    },
    // ── Alternative Channels ────────────────────────────────────────────
    {
      key: "alternative_channels_tracking",
      phase: "Alternative Channels",
      title: "Delivery status tracking",
      timing: "After resend link/fax/postcard/contact form · 7-day wait",
      description:
        "Provider arrives here after any action from Follow Up: resend claim link, fax, postcard, or contact form. " +
        "Shows channel used (Fax/Contact Form/Direct Mail) and days waiting. " +
        "Delivery status tracking: Fax (queued → sent → delivered → QR scanned), Postcard (queued → sent). " +
        "WAIT 7 DAYS for response before moving to Call tab. Warning appears after 30 days.",
      ownerNote: "Alternative Channels tab; awaiting provider response",
      traits: ["Tracking", "7-day wait"],
      gate: "Wait 7 days before moving to Call tab",
    },
    {
      key: "move_to_call",
      phase: "Alternative Channels",
      title: "Move to Call tab",
      timing: "Automated · After 7-day wait",
      description:
        "After 7 days in Alternative Channels with no response, provider automatically moves to Call tab " +
        "via the daily lifecycle cron. Admins can also manually batch-move providers earlier if needed. " +
        "Claimed providers are excluded from auto-move.",
      ownedBy: "provider-outreach-channel-lifecycle",
      traits: ["Automated", "7-day trigger"],
    },
    // ── Call (Final Touch) ──────────────────────────────────────────────
    {
      key: "call_exhausted_entry",
      phase: "Call",
      title: "Provider enters Call queue",
      timing: "After Alternative Channels · 7-day wait completed",
      description:
        "Provider has completed email sequence, Follow Up attempts, and waited in Alternative Channels. " +
        "This is the final touch point. Admin makes final call attempts to convert or close out.",
      ownerNote: "Call tab in /admin/provider-outreach",
      traits: ["Final stage"],
    },
    {
      key: "final_call_attempts",
      phase: "Call",
      title: "Final call attempts",
      timing: "Manual · Minimum 2 call attempts",
      description:
        "Admin makes final call attempts. MINIMUM 2 FINAL CALL ATTEMPTS required. " +
        "Call Script available: 'We've reached out a few times about your Olera page — " +
        "[city] families are looking for [care type] and their messages aren't getting to you.' " +
        "Send claim link during call if speaking with decision maker. After attempts exhausted, " +
        "mark as Not Interested or Archive based on the situation.",
      ownerNote: "Final call workflow in Call tab",
      traits: ["Manual", "Min 2 calls", "Final"],
      gate: "After attempts: mark Not Interested (soft) or Archive (hard) based on response",
    },
    {
      key: "send_claim_link_call",
      phase: "Call",
      title: "Send Claim Link",
      timing: "Manual · During or after call",
      description:
        "Admin sends claim link email during the call when speaking with a decision maker. " +
        "Same as Follow Up resend but available in Call tab for final push.",
      emailType: "provider_outreach_sequence",
      ownerNote: "Inline action in Call tab",
      traits: ["Manual", "Conversion"],
    },
    // ── Terminal States ─────────────────────────────────────────────────
    {
      key: "provider_claimed",
      phase: "Done",
      title: "Provider claims listing",
      timing: "Any time · Provider clicks claim link",
      description:
        "Provider clicks claim link from any email, fax, or postcard. They complete onboarding " +
        "and gain access to their dashboard. Success state — outreach complete.",
      ownerNote: "Claimed sub-tab in Done tab",
      traits: ["Success", "Terminal"],
    },
    {
      key: "marked_not_interested",
      phase: "Done",
      title: "Marked Not Interested",
      timing: "Manual · After all attempts exhausted",
      description:
        "SOFT TERMINAL — stops cold outreach only. Provider can still receive family questions, leads, " +
        "and other engagement through the platform. Mark as Not Interested when: " +
        "(1) Provider explicitly declines (soft refusal), (2) Temporarily closed, " +
        "(3) All attempts exhausted with no claim (7+ calls total: 3 in Call & Confirm, 2 in Follow Up, " +
        "7-day Alternative Channels wait, 2 in Call). Notes must support the decision.",
      ownerNote: "Not Interested sub-tab in Done tab; soft terminal state",
      traits: ["Soft terminal", "Notes required"],
      gate: "Requires documented decline OR 7+ calls across all stages",
    },
    {
      key: "archived",
      phase: "Done",
      title: "Provider archived",
      timing: "Manual · For serious issues only",
      description:
        "HARD TERMINAL — complete system block. Provider stops receiving ALL communication: " +
        "emails, questions, leads, connections, everything. Archive ONLY when: " +
        "(1) Angry provider / threatening legal action, (2) Permanently closed / out of business, " +
        "(3) Invalid provider (doesn't offer senior care services). " +
        "Use with caution — this is irreversible in normal workflow. Unarchive requires admin confirmation.",
      ownerNote: "Archived sub-tab in Done tab; hard terminal state",
      traits: ["Hard terminal", "System-wide block", "Irreversible"],
      gate: "Only for angry/legal, permanently closed, or invalid providers",
    },
    {
      key: "hidden",
      phase: "Done",
      title: "Provider hidden",
      timing: "Manual · Admin hides from view",
      description:
        "Admin-hidden providers that don't fit other categories. Hidden providers are removed from " +
        "active queues but can be restored to Ready via the 'Unhide' action. " +
        "Use for temporary exclusions or data cleanup.",
      ownerNote: "Hidden sub-tab in Done tab; restorable",
      traits: ["Soft terminal", "Restorable"],
    },
  ],
};

export const PROVIDER_ONBOARDING_JOURNEY: CommsJourney = {
  key: "provider_onboarding",
  title: "Provider onboarding — after the claim",
  audienceLabel: "Provider journey",
  ordering: "time",
  description: "Welcome providers into their account, then help them see and improve their profile. Welcome, preview, and notification messages use provider business hours. The independent verification reminder runs daily at 14:00 UTC. Performance lives in Provider Comms.",
  steps: [
    { key: "welcome", title: "Welcome", timing: "After claim · next business-hour run",
      description: "Introduce the provider experience. The message adapts to verification state.",
      emailType: "provider_welcome", ownedBy: "provider-welcome", emailSampleId: "provider_welcome_verified",
      gate: "Claimed within seven days; not previously processed; contact restrictions apply.",
      experienceUrl: "/admin/provider-comms", experienceLabel: "View onboarding performance" },
    { key: "preview", title: "Profile preview", timing: "48 hours after welcome · next business-hour run",
      description: "Show the provider what families see and invite them to improve their profile.",
      emailType: "profile_preview_nudge", ownedBy: "profile-preview-nudge", emailSampleId: "provider_profile_preview",
      gate: "Claimed within 21 days; welcome timestamp exists; not previously processed. The weekly digest continues; its completion rung is suppressed for four days after welcome." },
    { key: "notifications", title: "Notifications", timing: "72 hours after profile preview · business hours",
      description: "Invite organizations to choose text alerts; track visits and successfully saved preferences.",
      emailType: "notification_setup_nudge", ownedBy: "notification-setup-nudge", emailSampleId: "provider_notification_setup",
      gate: "Claimed within 30 days, usable US phone, SMS not enabled, no prior attempt. Starts paused for QA.",
      experienceUrl: "/admin/provider-comms", experienceLabel: "View onboarding performance" },
    { key: "verification", title: "Verification reminder", timing: "21 days after claim · daily run",
      description: "Ask unverified providers to complete verification. Independent of the earlier messages.",
      emailType: "verification_reminder_21d", ownedBy: "verification-reminders", emailSampleId: "provider_verification_reminder",
      gate: "Unverified account holders; no previous attempt; defers after a same-day digest. Starts paused for review.",
      experienceUrl: "/admin/provider-comms", experienceLabel: "View onboarding performance" },
  ],
};

const COMMS_JOURNEYS: Record<string, CommsJourney> = {
  [PROVIDER_ONBOARDING_JOURNEY.key]: PROVIDER_ONBOARDING_JOURNEY,
  [BENEFITS_CASCADE.key]: BENEFITS_CASCADE,
  [HELP_CASCADE_LADDER.key]: HELP_CASCADE_LADDER,
  [AD_BOOST_PROVIDER_JOURNEY.key]: AD_BOOST_PROVIDER_JOURNEY,
  [PROVIDER_OUTREACH_JOURNEY.key]: PROVIDER_OUTREACH_JOURNEY,
};

/** Which journeys each automation page shows, in display order. */
const JOURNEYS_BY_CRON: Record<string, string[]> = {
  "verification-reminders": [PROVIDER_ONBOARDING_JOURNEY.key],
  "provider-welcome": [PROVIDER_ONBOARDING_JOURNEY.key],
  "profile-preview-nudge": [PROVIDER_ONBOARDING_JOURNEY.key],
  "notification-setup-nudge": [PROVIDER_ONBOARDING_JOURNEY.key],
  "family-comms-coordinator": [HELP_CASCADE_LADDER.key, BENEFITS_CASCADE.key],
  "benefits-navigator-scheduler": [BENEFITS_CASCADE.key],
  "benefits-results-texts": [BENEFITS_CASCADE.key],
  "ad-boost-profile-reminders": [AD_BOOST_PROVIDER_JOURNEY.key],
  "ad-boost-launch-scheduler": [AD_BOOST_PROVIDER_JOURNEY.key],
  "ad-boost-emails": [AD_BOOST_PROVIDER_JOURNEY.key],
  "provider-outreach-send": [PROVIDER_OUTREACH_JOURNEY.key],
  "provider-outreach-sequence-check": [PROVIDER_OUTREACH_JOURNEY.key],
  "provider-outreach-channel-lifecycle": [PROVIDER_OUTREACH_JOURNEY.key],
};

export function journeysForCron(cronId: string): CommsJourney[] {
  return (JOURNEYS_BY_CRON[cronId] ?? []).map((k) => COMMS_JOURNEYS[k]).filter(Boolean);
}

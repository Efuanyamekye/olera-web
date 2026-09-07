/**
 * Cron job registry — the source of truth the Automation Console renders.
 *
 * Every scheduled job in vercel.json -> app/api/cron/* should have an entry
 * here. The /admin/automations list (the cockpit) and /admin/automations/[id]
 * (the deep view) both read this; it joins to cron_runs for run history and to
 * email_log / email_events for the 30-day email rollup.
 *
 * `schedule` MUST match the corresponding entry in vercel.json. A CI check
 * (scripts/check-cron-registry.js, wired into prebuild) diffs the two.
 *
 * When you add a new cron: add it to vercel.json AND here, and wrap the route
 * handler in withCronRun() from lib/crons/run.ts so it shows up in run history.
 */

/** Top-level grouping in the Console — by who the automation touches. Scales to the Loops migration. */
export type CronAudience = "Providers" | "Care seekers" | "MedJobs" | "Students" | "Internal" | "Data & maintenance";

/** What kind of automation it is — shown as a chip; also tells us whether to expect an email rollup. */
export type CronFn = "nudge" | "alert" | "digest" | "outreach" | "event" | "refresh" | "maintenance";

export interface CronJob {
  /** Stable id. Matches the route folder name under app/api/cron/ and cron_runs.job_id. */
  id: string;
  /** Display name. */
  name: string;
  /** What it does. One or two sentences. */
  description: string;
  /** Who gets it (or "(no recipients ...)" for data/maintenance jobs). */
  recipientCohort: string;
  audience: CronAudience;
  fn: CronFn;
  /** Cron expression — MUST match vercel.json. */
  schedule: string;
  /** Human-readable schedule. */
  humanSchedule: string;
  /** Route path (also where a manual admin trigger hits). */
  path: string;
  /** email_log.email_type value(s) this job sends, for the 30-day rollup. Empty for non-email jobs. */
  emailTypes: string[];
  /**
   * Outbound channels. Absent → derived: send jobs are email, refresh/maintenance
   * are none. Set explicitly on SMS automations (and future multi-channel ones).
   */
  channels?: Array<"email" | "sms">;
  /**
   * email_log.email_type values this job's TEXTS log under (channel='sms'), for
   * the SMS sent-count rollup. Absent when the call site sends without logging —
   * Twilio (the Family Comms delivery panel) is then the only record.
   */
  smsTypes?: string[];
  /** What "working" looks like beyond raw sends — the server-confirmed action downstream. Descriptive for now. */
  successSignal?: string;
  /** Related admin queue/surface for this automation, if any. */
  relatedAdminPath?: string;
}

/** Email jobs are everything except data refreshes and pure maintenance. */
export function isEmailJob(job: CronJob): boolean {
  return job.fn !== "refresh" && job.fn !== "maintenance";
}

/** Outbound channels for a job — explicit `channels` wins; otherwise send jobs are email-only. */
export function jobChannels(job: CronJob): Array<"email" | "sms"> {
  return job.channels ?? (isEmailJob(job) ? ["email"] : []);
}

export const CRON_REGISTRY: CronJob[] = [
  // ── Providers ──────────────────────────────────────────────────────
  {
    id: "weekly-provider-digest",
    name: "Weekly provider digest",
    description:
      "Provider re-engagement digest that routes to the highest-value weekly hook: unanswered questions, fresh leads, profile completion, market/referral-source curiosity, then the plain analytics recap.",
    recipientCohort:
      "Every provider with a live unanswered question, plus any provider with recent page-view / lead / question activity (~2,700; ~1,300 with an email on file). Also proactively warms a small bounded set of email-reachable provider markets so future runs can send market/referral hooks without waiting for providers to discover Find Families first.",
    audience: "Providers",
    fn: "digest",
    schedule: "0 13 * * 1,2,3,4,5",
    humanSchedule: "Weekdays (Mon–Fri), 13:00 UTC (~8–9 AM ET) — each provider on a fixed weekday",
    path: "/api/cron/weekly-provider-digest",
    emailTypes: ["weekly_analytics_digest"],
    successSignal: "Provider answers a question, opens a lead, completes profile, works a referral target, or returns to the portal depending on the variant.",
    relatedAdminPath: "/admin/activity?actor=providers",
  },
  {
    id: "profile-preview-nudge",
    name: "Onboarding: Profile preview",
    description: "Onboarding Email 1. Sent 48h after the welcome email. Leads with local family demand and shows the provider their own public page so they can fill the gaps. Replaces the retired provider_incomplete_profile job.",
    recipientCohort: "Providers who received the welcome email 48+ hours ago and have not been sent this yet.",
    audience: "Providers",
    fn: "nudge",
    schedule: "0 * * * *",
    humanSchedule: "Hourly, on the hour (business hours only: Mon-Fri 9am-5pm provider local)",
    path: "/api/cron/profile-preview-nudge",
    emailTypes: ["profile_preview_nudge"],
    successSignal: "Provider opens their public page and fills a gap (photos, services, owner story).",
    relatedAdminPath: "/admin/verification",
  },
  {
    id: "notification-setup-nudge",
    name: "Onboarding: Notification setup",
    description: "Chantel's Email 3. Invites organizations to choose text alerts, 72 hours after profile preview. Does not enable preferences automatically. Failed or pending attempts require review before retry.",
    recipientCohort: "Organizations claimed within 30 days, with an email and usable US phone, previewed 72+ hours ago, without SMS enabled or a prior attempt.",
    audience: "Providers", fn: "nudge", schedule: "0 * * * *",
    humanSchedule: "Hourly (Mon–Fri, 9am–5pm provider local)",
    path: "/api/cron/notification-setup-nudge", emailTypes: ["notification_setup_nudge"],
    successSignal: "Provider opens notification settings and explicitly enables SMS. Saved preferences are tracked separately.",
    relatedAdminPath: "/admin/provider-comms",
  },
  {
    id: "verification-reminders",
    name: "Verification reminders",
    description: "One verification reminder at least 21 days after claim. Independent of the welcome sequence; defers when a digest was sent today. Starts paused for review.",
    recipientCohort: "Unverified organizations and caregivers with an account, a claim at least 21 days old, and no prior reminder attempt. Includes older claims.",
    audience: "Providers",
    fn: "nudge",
    schedule: "0 14 * * *",
    humanSchedule: "Daily, 14:00 UTC (~9–10 AM ET)",
    path: "/api/cron/verification-reminders",
    emailTypes: ["verification_reminder_7d", "verification_reminder_21d"],
    successSignal: "Provider completes verification.",
    relatedAdminPath: "/admin/verification",
  },
  {
    id: "ad-boost-profile-reminders",
    name: "Ad Boost readiness reminders + outcome pings",
    description:
      "Three rungs. 1: sends the one photo-update reminder after three business days. 2: nudges providers whose launch plan is queued because their profile is below the threshold (or promotes launch-ready requests). 3: asks providers ~7 and ~21 days after an attributed inquiry whether the family became a client.",
    recipientCohort:
      "Providers waiting three business days on requested photos, providers with a pending-profile Ad Boost request at least 48 hours old, and providers of live/ended campaigns with un-reported leads in the 7d/21d windows.",
    audience: "Providers",
    fn: "nudge",
    schedule: "30 14 * * *",
    humanSchedule: "Daily, 14:30 UTC (~9–10 AM ET)",
    path: "/api/cron/ad-boost-profile-reminders",
    emailTypes: ["ad_boost_photo_reminder", "ad_boost_profile_reminder", "ad_boost_ready", "ad_boost_lead_outcome_check"],
    successSignal:
      "Queued campaigns move into setup; providers one-tap report lead outcomes that appear on the campaign receipt.",
    relatedAdminPath: "/admin/ad-boost",
  },
  {
    id: "ad-boost-launch-scheduler",
    name: "Ad Boost — scheduled launch emails",
    description:
      "Fires the campaign-launched provider email at the US Eastern time the admin picked when flipping a campaign to live (hourly = 'within the hour'). Same idempotent send path as the immediate flip — launched_email_sent_at reserves the send, so it can never double-fire even alongside the Send-now button. Permanent blocks (no provider email, unsubscribed, suppression) clear the schedule and ping Slack; transport errors keep it and retry next hour.",
    recipientCohort:
      "Providers of live campaigns whose launch email is unsent and whose launched_email_scheduled_at is due.",
    audience: "Providers",
    fn: "nudge",
    schedule: "20 * * * *",
    humanSchedule: "Hourly, at :20",
    path: "/api/cron/ad-boost-launch-scheduler",
    emailTypes: ["ad_boost_campaign_launched"],
    successSignal:
      "Launch emails land in the provider's US morning even when the campaign is flipped live from another timezone.",
    relatedAdminPath: "/admin/ad-boost",
  },
  {
    id: "ad-boost-end-scheduler",
    name: "Ad Boost — auto-end + scheduled wrap-ups",
    description:
      "Two rungs. 1: auto-end — a live campaign whose flight_end_date has passed flips to `ended` (flight_end_date is the LAST serving day, so the flip waits until the Eastern calendar rolls past it) and its wrap-up email is parked at the next 10:15 AM ET business morning. 2: send — fires the promo-complete wrap-up (demand receipt + subscribe ask) once that slot is due, through the same idempotent path as the admin's Send-now, so it can never double-fire. Campaigns with no flight_end_date never auto-end; the Slack summary counts them so the gap stays visible.",
    recipientCohort:
      "Providers of ended campaigns whose wrap-up email is unsent and whose promo_complete_email_scheduled_at is due.",
    audience: "Providers",
    fn: "nudge",
    schedule: "40 * * * *",
    humanSchedule: "Hourly, at :40",
    path: "/api/cron/ad-boost-end-scheduler",
    emailTypes: ["ad_boost_promo_complete"],
    successSignal:
      "Flights close themselves on time and the subscribe ask lands in a business morning instead of whenever the flight happened to expire.",
    relatedAdminPath: "/admin/ad-boost",
  },
  {
    id: "city-lead-offers",
    name: "City ads — offer chain",
    description:
      "Runs the sequential lead relay for Olera-owned city campaigns (/care/{city}). Every five minutes: expires provider offers past their 30-minute window and advances to the next provider in the city pool; starts chains parked outside staffed hours (8am to 8pm local) once the morning opens; picks up any new lead the request path failed to start. After three misses a lead is marked unfilled and Slack is paged.",
    recipientCohort:
      "Providers in city_pool with enabled=true (offer texts); families with an open city lead (confirmation and status texts).",
    audience: "Providers",
    fn: "event",
    schedule: "*/5 * * * *",
    humanSchedule: "Every 5 minutes",
    path: "/api/cron/city-lead-offers",
    emailTypes: ["city_lead_offer", "city_lead_family_still_working"],
    successSignal:
      "No offer sits past its window, no parked lead is still parked after 8am local, and every unfilled lead has a Slack page behind it.",
    relatedAdminPath: "/admin/city-ads",
  },
  {
    id: "city-lead-followups",
    name: "City ads — follow-ups",
    description:
      "The measurement layer for Olera-owned city campaigns. Hourly, inside 9am-7pm in the city's timezone: asks the family ~20h after a provider took their request whether they were actually reached; on a \"not yet\" nudges that provider once; if the provider still has not called 24h later, releases the claim and offers the request to the next provider; and asks the provider at day 7 and day 21 whether the family became a client. Replies are one digit and land through the SMS webhook. Markers are stamped before each send and cleared on failure, so a crash can neither double-text nor silently skip.",
    recipientCohort:
      "Families with an accepted city lead (day-2 check), and the providers who took those leads (nudge + day-7/21 outcome).",
    audience: "Care seekers",
    fn: "nudge",
    schedule: "20 * * * *",
    humanSchedule: "Hourly, at :20",
    path: "/api/cron/city-lead-followups",
    emailTypes: ["city_lead_family_check", "city_lead_provider_nudge", "city_lead_family_reoffer", "city_lead_outcome_ping"],
    successSignal:
      "Every accepted lead gets asked whether the provider called, and every provider gets asked whether it became a client. Cost per accepted family and clients-per-city both become answerable.",
    relatedAdminPath: "/admin/city-ads",
  },
  {
    id: "ad-boost-emails",
    name: "Ad Boost lifecycle events",
    description:
      "Event-driven Ad Boost messages: request receipt, photo-review request/resolution, immediate campaign launch, campaign-attributed lead, and early traction. The starter-promo wrap-up appears here too, but only via the admin's explicit Send-now — a normal end schedules it for the hourly end-scheduler instead.",
    recipientCohort:
      "Providers who request, queue, launch, or receive activity from Find Families managed-ad campaigns.",
    audience: "Providers",
    fn: "event",
    schedule: "event-triggered",
    humanSchedule: "Event-triggered by Ad Boost requests, admin status changes, lead delivery, and meaningful metric saves",
    path: "/admin/ad-boost",
    emailTypes: [
      "ad_boost_queued",
      "ad_boost_requested",
      "ad_boost_photo_update",
      "ad_boost_photos_ready",
      "ad_boost_campaign_launched",
      "ad_boost_lead_delivered",
      "ad_boost_traction",
      "ad_boost_promo_complete",
    ],
    successSignal:
      "Provider completes setup, sees campaign progress, opens campaign-attributed leads, or replies to the promo wrap-up.",
    relatedAdminPath: "/admin/ad-boost",
  },
  {
    id: "provider-lead-alert-texts",
    name: "Provider lead-alert texts",
    description:
      "Speed-to-lead SMS to providers: a new care inquiry (guest and signed-in paths), a pending inquiry released to their inbox, or a MedJobs student application. Respects the provider's new_leads notification preference. Not logged to email_log — Twilio (the Family Comms delivery panel) is the record; directory-scraped fallback numbers account for most 'bad number' failures there.",
    recipientCohort:
      "Providers with a phone on file (business profile, falling back to the directory-scraped number) receiving a fresh family inquiry or student application.",
    audience: "Providers",
    fn: "event",
    schedule: "event-triggered",
    humanSchedule: "Event-triggered by new inquiries, pending-inquiry releases, and MedJobs applications",
    path: "/admin/family-comms",
    emailTypes: [],
    channels: ["sms"],
    successSignal: "The provider opens the inquiry and responds while the family is still actively searching.",
    relatedAdminPath: "/admin/family-comms",
  },
  {
    id: "provider-welcome",
    name: "Onboarding: Welcome",
    description: "Onboarding Email 0. Sent on the first business-hours run after a provider claims their page, with no verification required. Providers who are still unverified get the verification ask folded into the same email. Sets lifecycle_stage to 'onboarding'.",
    recipientCohort: "Providers who claimed within the last 7 days and have not been welcomed yet.",
    audience: "Providers",
    fn: "nudge",
    schedule: "0 * * * *",
    humanSchedule: "Hourly, on the hour (business hours only: Mon-Fri 9am-5pm provider local)",
    path: "/api/cron/provider-welcome",
    emailTypes: ["provider_welcome"],
    successSignal: "Provider visits their dashboard.",
    relatedAdminPath: "/admin/verification",
  },
  {
    id: "provider-dormant",
    name: "Provider dormant re-engagement",
    description: "Re-engagement email to providers inactive for 30+ days. Shows new families in their area and encourages them to return.",
    recipientCohort: "Verified providers with no activity in 30+ days who haven't received this email in the last 60 days.",
    audience: "Providers",
    fn: "nudge",
    schedule: "0 15 * * *",
    humanSchedule: "Daily, 15:00 UTC (~10–11 AM ET)",
    path: "/api/cron/provider-dormant",
    emailTypes: ["dormant_reengagement"],
    successSignal: "Provider returns and logs in.",
    relatedAdminPath: "/admin/analytics",
  },
  {
    id: "provider-anniversary",
    name: "Provider anniversary & milestones",
    description: "Celebrates provider anniversaries (1+ years on platform) and connection milestones (10, 50, 100 connections).",
    recipientCohort: "Verified providers with an anniversary today OR who just hit a connection milestone.",
    audience: "Providers",
    fn: "nudge",
    schedule: "0 14 * * *",
    humanSchedule: "Daily, 14:00 UTC (~9–10 AM ET)",
    path: "/api/cron/provider-anniversary",
    emailTypes: ["provider_anniversary", "provider_milestone"],
    successSignal: "Provider feels appreciated and engaged.",
    relatedAdminPath: "/admin/analytics",
  },
  {
    id: "staffing-send-email2",
    name: "Staffing outreach — follow-up email",
    description: "Sends Email 2 (follow-up) to providers in the staffing-outreach sequence whose Email 1 went out 3+ days ago.",
    recipientCohort: "Providers in the staffing-outreach sequence with email1_sent_at > 3 days ago and no email2 yet.",
    audience: "Providers",
    fn: "outreach",
    schedule: "0 * * * *",
    humanSchedule: "Hourly, on the hour",
    path: "/api/cron/staffing-send-email2",
    // sent via the staffing-outreach helper — email_type set there. Refine if the rollup reads short.
    emailTypes: [],
    successSignal: "Provider replies / books a call.",
    relatedAdminPath: "/admin/staffing-outreach",
  },
  {
    id: "staffing-sequence-check",
    name: "Staffing outreach — sequence advance",
    description: "Auto-transitions providers from 'sequencing' to 'needs_call' once their email sequence is complete, so non-responders move to the manual-calling queue.",
    recipientCohort: "(No recipients — a state-transition job.)",
    audience: "Providers",
    fn: "maintenance",
    schedule: "30 * * * *",
    humanSchedule: "Hourly, at :30",
    path: "/api/cron/staffing-sequence-check",
    emailTypes: [],
    relatedAdminPath: "/admin/staffing-outreach",
  },
  {
    id: "provider-outreach-send",
    name: "Provider outreach — scheduled sends",
    description: "Every 15 minutes: scans for due provider outreach email tasks (Day 0/3/5/7 cadence) and sends them via Resend through oleracare.com.",
    recipientCohort: "Unclaimed providers in the outreach sequence with a due email task.",
    audience: "Providers",
    fn: "outreach",
    schedule: "*/15 * * * *",
    humanSchedule: "Every 15 minutes",
    path: "/api/cron/provider-outreach-send",
    emailTypes: ["provider_outreach_sequence"],
    successSignal: "Provider claims their profile.",
    relatedAdminPath: "/admin/provider-outreach",
  },
  {
    id: "provider-outreach-sequence-check",
    name: "Provider outreach — sequence advance",
    description: "Hourly: auto-transitions providers from 'in_sequence' to 'needs_call' once their 4-email cadence is complete (Day 7 final email).",
    recipientCohort: "(No recipients — a state-transition job.)",
    audience: "Providers",
    fn: "maintenance",
    schedule: "45 * * * *",
    humanSchedule: "Hourly, at :45",
    path: "/api/cron/provider-outreach-sequence-check",
    emailTypes: [],
    relatedAdminPath: "/admin/provider-outreach",
  },
  {
    id: "provider-outreach-channel-lifecycle",
    name: "Provider outreach — channel lifecycle",
    description: "Daily: moves providers from Alternative Channels to Call tab after 7 days without claiming. Ensures providers don't get stuck in re_engage indefinitely.",
    recipientCohort: "(No recipients — a state-transition job.)",
    audience: "Providers",
    fn: "maintenance",
    schedule: "0 5 * * *",
    humanSchedule: "Daily at 5:00 AM UTC",
    path: "/api/cron/provider-outreach-channel-lifecycle",
    emailTypes: [],
    relatedAdminPath: "/admin/provider-outreach",
  },
  {
    id: "city-broadcasts",
    name: "City broadcasts",
    description:
      "Sends engagement emails to dormant providers when family activity (questions asked, profiles published) occurs in their city. Shows providers that families are actively looking for care in their area.",
    recipientCohort: "Dormant providers in cities with recent family activity — eligible if they have an email, haven't bounced, and haven't received a broadcast in 7 days.",
    audience: "Providers",
    fn: "outreach",
    schedule: "*/30 * * * *",
    humanSchedule: "Every 30 minutes",
    path: "/api/cron/city-broadcasts",
    emailTypes: ["city_broadcast_question", "city_broadcast_profile"],
    successSignal: "Provider claims their profile.",
    relatedAdminPath: "/admin/city-broadcasts",
  },
  // NOTE: lead-response-nudge has been replaced by lead-followup-sequence.
  // The old cron code remains at app/api/cron/lead-response-nudge/route.ts for rollback.
  {
    id: "lead-followup-sequence",
    name: "Lead follow-up sequence",
    description:
      "Multi-stage follow-up for unanswered leads. Day 1/3/5/7 emails; Day 10 marks as Stuck; Day 11 re-engagement; Day 14 Needs Call. Stops on engagement (lead_opened event). Replaces lead-response-nudge with staged cadence.",
    recipientCohort: "Providers with unviewed leads 1+ days old, not yet at final stage.",
    audience: "Providers",
    fn: "nudge",
    schedule: "0 14 * * *",
    humanSchedule: "Daily, 14:00 UTC (~9 AM ET)",
    path: "/api/cron/lead-followup-sequence",
    emailTypes: ["provider_followup_day1", "provider_followup_day3", "provider_followup_day6", "provider_followup_day10", "provider_followup_day17"],
    successSignal: "Provider opens the lead or responds.",
    relatedAdminPath: "/admin/connections",
  },
  {
    id: "conversation-stale",
    name: "Stale conversation nudge",
    description:
      "Daily nudge to both parties when a conversation has gone quiet for 5+ days after it started (2+ human messages exchanged). Encourages follow-up.",
    recipientCohort: "Both providers and families with stale conversations (5+ days since last message), not nudged in 14 days.",
    audience: "Care seekers",
    fn: "nudge",
    schedule: "0 16 * * *",
    humanSchedule: "Daily, 16:00 UTC (~11 AM ET)",
    path: "/api/cron/conversation-stale",
    emailTypes: ["stale_conversation"],
    successSignal: "One or both parties resume the conversation.",
    relatedAdminPath: "/admin/connections",
  },
  {
    id: "family-answers",
    name: "Family answers engine",
    description:
      "Researches the benefits questions families text us and writes a review packet for a human to approve. Five stages: triage, research over Olera's library then the web, draft, an adversarial check by an independent model, and a rebuttal round. Sends nothing — the only automated message in this flow is the acknowledgement the Twilio webhook already sent.",
    recipientCohort:
      "(no recipients — writes drafts for human review; families who texted a free-form question)",
    audience: "Care seekers",
    fn: "maintenance",
    schedule: "*/5 * * * *",
    humanSchedule: "Every 5 minutes",
    path: "/api/cron/family-answers",
    emailTypes: [],
    successSignal:
      "A packet a human can check: sourced claims, the drafter-vs-checker disagreements, and the unverified person-facts the draft leans on.",
    relatedAdminPath: "/admin/inbox",
  },
  {
    id: "family-answer-followup",
    name: "Family answer outcome check",
    description:
      "Seven days after we send a researched benefits answer, asks whether it got the family anywhere. HELPED or NOTYET, so the answer is machine-readable rather than another message needing a human. Skips families who already replied, threads with a question still in flight, and anyone opted out.",
    recipientCohort:
      "Families who received a researched answer 7+ days ago and have not replied since.",
    audience: "Care seekers",
    fn: "nudge",
    schedule: "0 14 * * *",
    humanSchedule: "Daily, 14:00 UTC (~10 AM ET)",
    path: "/api/cron/family-answer-followup",
    emailTypes: [],
    channels: ["sms"],
    smsTypes: ["family_answer_followup"],
    successSignal:
      "A recorded outcome. Without it the engine is outcome-blind and every quality judgement rests on how good the drafts look.",
    relatedAdminPath: "/admin/inbox",
  },

  // ── Care seekers ───────────────────────────────────────────────────
  {
    id: "family-nudges",
    name: "Family lifecycle nudges",
    description:
      "Publish/lifecycle waterfall for care-seeker profiles: publish nudges 1-4 (day 0/2/6/13) then monthly publish maintenance for publish-ready families, monthly provider recommendations for published families, inactivity re-engagement (30d+ idle, max 2), and post-connection follow-up. One email per family per run; stands down for any family the coordinator emailed in the last 20h. The completion track moved to family-comms-coordinator (Track 2).",
    recipientCohort: "Care-seeker profiles 24h+ old matching a lifecycle state above — one email per family per run.",
    audience: "Care seekers",
    fn: "nudge",
    // 18:00 = one hour AFTER the family-comms-coordinator (17:00) so this engine's
    // "stand down if the coordinator emailed in the last 20h" guard actually sees
    // today's coordinator send. At the old 15:00 slot the freshest stamp was ~22h
    // old and the guard never fired — the two engines double-sent the same day.
    schedule: "0 18 * * *",
    humanSchedule: "Daily, 18:00 UTC (~1–2 PM ET)",
    path: "/api/cron/family-nudges",
    // Match what the route ACTUALLY sends — the automations monitor groups email_log
    // by this list. The old list attributed provider-dormant's dormant_reengagement
    // (provider mail) and paused lead-family-nudge's go_live_reminder to this cron,
    // while missing every type it really emits.
    emailTypes: [
      "publish_nudge_1",
      "publish_nudge_2",
      "publish_nudge_3",
      "publish_nudge_4",
      "publish_maintenance",
      "monthly_recommendations",
      "inactivity_reengagement",
      "post_connection_followup",
    ],
    successSignal: "Family completes/lives their profile or initiates a connection.",
    relatedAdminPath: "/admin/care-seekers",
  },
  {
    id: "matches-nudge",
    name: "Matches nudge",
    description: "F3: nudges families with 2+ initiated conversations one of which is quiet 48h+, Matches not yet active (once only). The provider incomplete-profile job was retired 2026-09-01 — the onboarding profile-preview email owns that ask now.",
    recipientCohort: "Families with a quiet conversation and Matches inactive (F3).",
    audience: "Care seekers",
    fn: "nudge",
    schedule: "0 14 * * *",
    humanSchedule: "Daily, 14:00 UTC (~9–10 AM ET)",
    path: "/api/cron/matches-nudge",
    emailTypes: ["matches_nudge"],
    successSignal: "Family activates Matches.",
    relatedAdminPath: "/admin/activity?actor=families",
  },
  {
    id: "sms-queue-flush",
    name: "SMS queue flush",
    description: "Drains sms_queue — reactive care-seeker reply-alert texts AND human replies written from /admin/inbox, both held outside the recipient's 8am–8pm quiet-hours window. Re-checks opt-out at delivery (the daily throttle too, except for human replies, which an immediate send never consulted either). A canceled human reply reopens its thread in the inbox rather than disappearing.",
    recipientCohort: "Families with a deferred reply-alert SMS or a scheduled admin reply whose send window has opened.",
    audience: "Care seekers",
    fn: "alert",
    schedule: "0 * * * *",
    humanSchedule: "Hourly, on the hour",
    path: "/api/cron/sms-queue-flush",
    emailTypes: [],
    channels: ["sms"],
    successSignal: "Held reply-alert texts deliver at a civil hour without re-texting opted-out families.",
    relatedAdminPath: "/admin/family-comms",
  },
  {
    id: "family-reply-alert-texts",
    name: "Family reply-alert texts",
    description:
      "Reactive Tier-1 SMS: texts the family the moment a provider reaches out about their care request or accepts their inquiry. Transactional (the family started the thread) so cap-exempt; sends landing outside the recipient's 8am–8pm window queue for the SMS queue flush cron.",
    recipientCohort:
      "Families with a usable phone whose inquiry just got a provider reply. Skipped on opt-out (STOP), no phone, or past the 6-texts/day safety cap.",
    audience: "Care seekers",
    fn: "event",
    schedule: "event-triggered",
    humanSchedule: "Event-triggered by provider reach-outs and inquiry accepts",
    path: "/admin/family-comms",
    emailTypes: [],
    channels: ["sms"],
    smsTypes: ["provider_reach_out", "connection_response"],
    successSignal: "The family opens the inbox link and replies while the provider is still engaged.",
    relatedAdminPath: "/admin/family-comms",
  },
  {
    id: "benefits-results-texts",
    name: "Benefits results — email + text",
    description:
      "Fires when a new family finishes the benefits quiz. Email is sent when they supplied email; text is sent when they supplied a phone under the SMS disclosure; families who chose both receive both. Olera leads with the matches it identified and adds them to a private living plan instead of leading with 'saved.' The intake texting choice persists as sms_consent for B1/B2 continuity.",
    recipientCohort: "Every new family who completes the benefits quiz, on each contact channel they explicitly supplied.",
    audience: "Care seekers",
    fn: "event",
    schedule: "event-triggered",
    humanSchedule: "Event-triggered by benefits quiz completion",
    path: "/admin/family-comms",
    emailTypes: ["benefits_results_saved"],
    channels: ["email", "sms"],
    smsTypes: ["benefits_results_sms"],
    successSignal: "The family opens their results link and starts a program brief or provider search.",
    relatedAdminPath: "/admin/benefits",
  },
  {
    id: "matches-unread",
    name: "Matches unread-message alerts",
    description: "Hourly check for unread messages in Matches conversations (request type, provider-initiated) unread for 1h+ — alerts the recipient ('New message from …'). F4/P3.",
    recipientCohort: "Whoever has an unread message in a Matches conversation that's sat 1h+.",
    audience: "Care seekers",
    fn: "alert",
    schedule: "0 * * * *",
    humanSchedule: "Hourly, on the hour",
    path: "/api/cron/matches-unread",
    emailTypes: ["unread_reminder"],
    successSignal: "Recipient opens the thread and replies.",
    relatedAdminPath: "/admin/activity?actor=families",
  },
  {
    id: "unread-reminders",
    name: "Unread connection-message reminders",
    description: "Every 6 hours: finds connection threads with an unread message older than 24h (last message not from the recipient, no reply since) and reminds the recipient.",
    recipientCohort: "Whoever has an unread message in a connection thread that's sat 24h+.",
    audience: "Care seekers",
    fn: "alert",
    schedule: "0 */6 * * *",
    humanSchedule: "Every 6 hours",
    path: "/api/cron/unread-reminders",
    emailTypes: ["unread_reminder"],
    successSignal: "Recipient replies in the thread.",
    relatedAdminPath: "/admin/connections",
  },
  {
    id: "family-comms-coordinator",
    name: "Family comms coordinator — help-cascade arbiter",
    description:
      "The family-side arbitration brain. One daily cron picks the single highest-priority help message per family. In the benefits cascade it composes B1 into TJ's review queue, then sends B2 3–14 days after the approved first step. B2 email uses outcome choices; B2 text accepts structured progress replies and can send by itself to a consented text-only family. STUCK becomes a human alert. Generic completion asks stay suppressed while the benefits cascade is active.",
    recipientCohort:
      "Every family with an open inquiry/request connection PLUS every benefits-intake family (cascade rungs) PLUS incomplete profiles (completion track); at most one governed email per family per run, chosen by the ladder. SMS mirrors require stored phone + sms_consent.",
    audience: "Care seekers",
    fn: "nudge",
    schedule: "0 17 * * *",
    humanSchedule: "Daily, 17:00 UTC (~12 PM ET)",
    path: "/api/cron/family-comms-coordinator",
    emailTypes: [
      "family_outcome_check",
      "family_provider_silent",
      "family_never_engaged",
      "day_10_awaiting",
      "family_reach_out_nudge",
      "family_nudge",
      "go_live_reminder",
      "benefits_first_step",
      "benefits_check_in",
      "completion_nudge_1",
      "completion_nudge_2",
      "completion_nudge_3",
      "completion_nudge_4",
      "completion_maintenance",
    ],
    channels: ["email", "sms"],
    smsTypes: ["benefits_first_step_sms", "benefits_check_in_sms"],
    successSignal: "Family is meaningfully helped (responds, reaches an alternative, starts a benefits application, completes, or publishes).",
    relatedAdminPath: "/admin/benefits",
  },
  {
    id: "benefits-navigator-packets",
    name: "Benefits navigator — packet builder",
    description:
      "Builds the routing verdict for pending first-step letters, replacing the manual copy-paste review loop. Five gates in order: do we hold enough facts to pick at all, is the program the right FIRST call (judged by two independent models), does the letter break an honesty rail, is the program cleared, does the draft lint. Writes the verdict onto the draft and sends nothing. Rebuilds only when the letter itself changes, never on a clock — fit verdicts vary run to run, so a scheduled rebuild would silently reroute letters nobody touched.",
    recipientCohort:
      "(no recipients — writes verdicts for the review queue; every pending navigator draft whose letter changed since its last packet)",
    audience: "Care seekers",
    fn: "maintenance",
    schedule: "25 * * * *",
    humanSchedule: "Hourly at :25, but DORMANT until BENEFITS_PACKETS_ENABLED=1. Each packet is up to three model calls, so switching it on is a spend decision. Until then every run returns immediately without touching a model.",
    path: "/api/cron/benefits-navigator-packets",
    emailTypes: [],
    successSignal:
      "Every pending letter carries a current verdict, so the queue explains why each one is waiting and a clean letter is not held behind its batch.",
    relatedAdminPath: "/admin/benefits",
  },
  {
    id: "benefits-navigator-scheduler",
    name: "Benefits navigator — scheduled sends",
    description:
      "Fires navigator drafts TJ scheduled from /admin/benefits at/after their chosen time. It uses the same path as the manual button: email when available and a consent-gated first-step text, including text-only delivery. Both manual and scheduled texts respect the recipient's 8am–8pm window. A blocked fire clears the schedule and surfaces the reason; transport errors remain retryable.",
    recipientCohort:
      "Benefits families with a pending navigator draft whose metadata.benefits_navigator.scheduled_at is due.",
    audience: "Care seekers",
    fn: "nudge",
    schedule: "10 * * * *",
    humanSchedule: "Hourly, at :10",
    path: "/api/cron/benefits-navigator-scheduler",
    emailTypes: ["benefits_first_step"],
    channels: ["email", "sms"],
    smsTypes: ["benefits_first_step_sms"],
    successSignal: "Scheduled guidance reaches the family in the channels TJ reviewed; after-hours text-only sends remain visibly pending until the recipient's next legal window.",
    relatedAdminPath: "/admin/benefits",
  },
  {
    id: "provider-still-silent",
    name: "Provider STILL silent — trust recovery",
    description: "Daily: sends Email #6 when provider STILL hasn't responded after 7+ days. Trust recovery email — acknowledges failure, actively intervenes with responsive alternatives + personal support fallback. Family-level intelligence.",
    recipientCohort: "Families with 7-day-old connections where family engaged but provider STILL hasn't responded, and family has no active conversations elsewhere.",
    audience: "Care seekers",
    fn: "nudge",
    schedule: "0 17 * * *",
    humanSchedule: "Daily, 17:00 UTC (~12 PM ET)",
    path: "/api/cron/provider-still-silent",
    emailTypes: ["provider_still_silent"],
    successSignal: "Family reaches out to recommended responsive provider or contacts support.",
    relatedAdminPath: "/admin/connections",
  },

  // ── MedJobs (student talent marketplace) ───────────────────────────
  {
    id: "medjobs-nudge",
    name: "MedJobs student nudges",
    description: "Activation cadence for newly-signed-up MedJobs students — Day 1 / Day 3 / Day 5 nudges to complete their profile.",
    recipientCohort: "MedJobs students with an incomplete profile, at Day 1 / 3 / 5 post-signup.",
    audience: "MedJobs",
    fn: "nudge",
    schedule: "0 15 * * *",
    humanSchedule: "Daily, 15:00 UTC (~10 AM CT)",
    path: "/api/cron/medjobs-nudge",
    emailTypes: ["profile_incomplete_nudge", "student_activation"],
    successSignal: "Student completes their profile.",
    relatedAdminPath: "/admin/medjobs/candidates",
  },

  // ── Students (campus recruiting) ───────────────────────────────────
  {
    id: "student-outreach-send",
    name: "Student outreach — scheduled sends",
    description: "Every 15 minutes: scans for due student-outreach email tasks (campus stakeholder sequences) and sends them. Also triggerable manually with the cron secret.",
    recipientCohort: "Campus stakeholders with a due step in their outreach sequence.",
    audience: "Students",
    fn: "outreach",
    schedule: "*/15 * * * *",
    humanSchedule: "Every 15 minutes",
    path: "/api/cron/student-outreach-send",
    // email_type set in the outreach-send helper. Refine if the rollup reads short.
    emailTypes: [],
    successSignal: "Stakeholder replies / a campus partnership advances.",
    relatedAdminPath: "/admin/student-outreach/campuses",
  },

  // ── Internal ───────────────────────────────────────────────────────
  {
    id: "daily-digest",
    name: "Daily leadership digest",
    description: "Internal only: a 24h snapshot to Slack #notifications and ADMIN_NOTIFICATION_EMAIL — care-seeker + provider activity, with a 'Needs attention' block for anomalies. Metric semantics mirror /api/admin/analytics/summary.",
    recipientCohort: "Internal only — Slack #notifications + ADMIN_NOTIFICATION_EMAIL.",
    audience: "Internal",
    fn: "digest",
    schedule: "0 13 * * *",
    humanSchedule: "Daily, 13:00 UTC (~8 AM CT)",
    path: "/api/cron/daily-digest",
    emailTypes: ["daily_digest"],
    relatedAdminPath: "/admin/analytics",
  },
  {
    id: "transactional-texts",
    name: "Verification & keyword texts",
    description:
      "Utility SMS: the claim-flow phone-verification code (provider chose 'text me a code') and the TCPA HELP/INFO auto-reply from the inbound webhook. Compliance plumbing, not comms — the HELP copy is what carriers and 10DLC reviewers see as our help message.",
    recipientCohort: "Providers mid-claim who picked SMS verification; anyone who texts HELP or INFO to our number.",
    audience: "Internal",
    fn: "event",
    schedule: "event-triggered",
    humanSchedule: "Event-triggered by claim verification and inbound HELP keywords",
    path: "/admin/family-comms",
    emailTypes: [],
    channels: ["sms"],
    relatedAdminPath: "/admin/verification",
  },

  // ── Data & maintenance ─────────────────────────────────────────────
  {
    id: "deliverability-watch",
    name: "Deliverability watch (account risk)",
    description:
      "Recomputes the 30-day account-wide bounce and complaint rates and posts to Slack when either crosses a threshold — Resend's warning line, 87.5% of the hard limit, or back down again. Alerts on STATE CHANGE ONLY, never on a schedule, so the notifications channel does not learn to ignore it. Rate definitions match /api/admin/automations exactly (complaints over delivered, bounces over sent) so the alert and the panel can never disagree. Prior state is read from this job's own last cron_runs row, so there is no extra table. Never alerts by email: an email alert about email deliverability cannot arrive when it matters.",
    recipientCohort: "Internal only — Slack #notifications.",
    audience: "Internal",
    fn: "alert",
    schedule: "0 12 * * *",
    humanSchedule: "Daily, 12:00 UTC (~8:00 AM ET)",
    path: "/api/cron/deliverability-watch",
    emailTypes: [],
    // Sends nothing outbound — it posts to Slack. Without this, jobChannels()
    // derives ["email"] from fn:"alert" and the console would imply it mails people.
    channels: [],
    successSignal:
      "A threshold crossing reaches Slack within a day, and the run summary's alerted flag is true. alerted:false with a non-null alertError means the webhook is misconfigured and the account is unwatched.",
    relatedAdminPath: "/admin/automations",
  },
  {
    id: "enrich-question-providers",
    name: "Provider email top-up (unanswered questions)",
    description:
      "Finds a contact email for providers holding an unanswered question that Olera cannot email, then flushes the questions that were held BECAUSE the address was missing. Scrapes the provider's site first and only falls back to Perplexity on a miss; writes only addresses that pass verification, judged on effectiveStatus so deliverable role inboxes (info@, admissions@) are not discarded. Targets are ordered newest-question-first and capped per run, so each week works the roughly ten pages a day that newly enter the cohort rather than retrying the long tail that has no findable address. About 15% of attempts yield a usable email.",
    recipientCohort:
      "Providers whose address this run discovers — each gets up to 2 held question notifications, deduped by question text.",
    audience: "Providers",
    fn: "outreach",
    schedule: "10 15 * * 2",
    humanSchedule: "Weekly, Tuesdays 15:10 UTC (~11:10 AM ET)",
    path: "/api/cron/enrich-question-providers",
    emailTypes: ["question_received"],
    successSignal:
      "The War Room provider_contactability count stops drifting back up; a written address is followed by the provider claiming their page.",
    relatedAdminPath: "/admin/questions",
  },
  {
    id: "war-room-discovery",
    name: "War Room autonomous discovery",
    description:
      "Before the US workday, refreshes allowlisted Slack and Notion context, builds private company investigations, and allows at most one material decision through the founder-interruption gate. It never executes or changes external state; founder approval is a separate authorization.",
    recipientCohort: "(No recipients — read-only company observation and proposal generation.)",
    audience: "Data & maintenance",
    fn: "refresh",
    schedule: "30 10 * * *",
    humanSchedule: "Daily, 10:30 UTC (~5:30–6:30 AM ET)",
    path: "/api/cron/war-room-discovery",
    emailTypes: [],
    successSignal: "At most one evidence-cited, decision-ready proposal reaches the founder; empty days are expected and allowed.",
    relatedAdminPath: "/admin/war-room",
  },
  {
    id: "support-email-sync",
    name: "Support Gmail sync + triage",
    description:
      "Keeps the support inbox current from Gmail history, imports the next full-history page until the entire mailbox is present, renews Gmail push watches, and generates safe support-copilot recommendations for new inbound threads.",
    recipientCohort: "(No recipients -- synchronizes support@olera.care into the admin support queue.)",
    audience: "Data & maintenance",
    fn: "refresh",
    schedule: "*/5 * * * *",
    humanSchedule: "Every 5 minutes; Gmail Pub/Sub supplies the low-latency change signal",
    path: "/api/cron/support-email-sync",
    emailTypes: [],
    relatedAdminPath: "/admin/support-email",
  },
  {
    id: "aggregate-provider-views",
    name: "Provider view stats rollup",
    description: "Nightly: rolls up the prior UTC day's page_view events from provider_activity into provider_page_view_stats (per-provider/day) and city_category_view_benchmarks (peer cohort aggregates). Feeds the provider analytics surfaces and the weekly digest's demand line.",
    recipientCohort: "(No recipients — a data rollup job.)",
    audience: "Data & maintenance",
    fn: "refresh",
    schedule: "0 8 * * *",
    humanSchedule: "Daily, 08:00 UTC (~3 AM ET)",
    path: "/api/cron/aggregate-provider-views",
    emailTypes: [],
    relatedAdminPath: "/admin/analytics",
  },
  {
    id: "growth-metrics-weekly",
    name: "Weekly growth metrics",
    description: "Collects the most recent complete Sunday-Saturday week from GA4 and Search Console, joins the same window to Olera marketplace outcomes, and stores one immutable growth snapshot for Organic Growth and /metrics.",
    recipientCohort: "(No recipients -- a read-only Google and Supabase data collection job.)",
    audience: "Data & maintenance",
    fn: "refresh",
    schedule: "0 14 * * 2",
    humanSchedule: "Tuesdays, 14:00 UTC (~9 AM CT), after Search Console's normal reporting lag",
    path: "/api/cron/growth-metrics",
    emailTypes: [],
    relatedAdminPath: "/admin/organic-growth",
  },
  {
    id: "google-reviews",
    name: "Google reviews refresh",
    description: "Monthly tiered refresh of Google review data: Tier 1 claimed/verified (>30d stale), Tier 2 recently-viewed (>30d stale), Tier 3 long tail (>90d stale or never synced).",
    recipientCohort: "(No recipients — a data refresh job.)",
    audience: "Data & maintenance",
    fn: "refresh",
    schedule: "0 3 1 * *",
    humanSchedule: "Monthly, the 1st at 03:00 UTC",
    path: "/api/cron/google-reviews",
    emailTypes: [],
    relatedAdminPath: "/admin/directory",
  },
  {
    id: "cms-refresh",
    name: "CMS quality data refresh",
    description: "Quarterly: pulls the latest Medicare quality data and re-matches it against all providers (runs after the CMS quarterly releases).",
    recipientCohort: "(No recipients — a data refresh job.)",
    audience: "Data & maintenance",
    fn: "refresh",
    schedule: "0 6 15 1,4,7,10 *",
    humanSchedule: "Quarterly — the 15th of Jan/Apr/Jul/Oct at 06:00 UTC",
    path: "/api/cron/cms-refresh",
    emailTypes: [],
    relatedAdminPath: "/admin/directory",
  },
  {
    id: "cleanup",
    name: "Housekeeping cleanup",
    description: "Daily: deletes expired verification codes (>1h old). Note: stale connection deletion was removed to preserve leads for re-engagement.",
    recipientCohort: "(No recipients — a cleanup job.)",
    audience: "Data & maintenance",
    fn: "maintenance",
    schedule: "0 4 * * *",
    humanSchedule: "Daily, 04:00 UTC",
    path: "/api/cron/cleanup",
    emailTypes: [],
  },
  {
    id: "email-preverify",
    name: "Email pre-verification",
    description:
      "Proactively verifies cold-lane recipient addresses (question_received + the weekly digest's unclaimed slice) ahead of send, throttled to dodge ZeroBounce's burst rate limit. Pre-populates the email_verifications cache so the send path reliably suppresses known-bad addresses instead of failing open during the weekly burst. Caps NEW verifications per run; the backlog drains across runs then steady-states.",
    recipientCohort: "(No recipients — a verification/data job. Verifies the question_received + unclaimed-digest address pools.)",
    audience: "Data & maintenance",
    fn: "maintenance",
    schedule: "0 */6 * * *",
    humanSchedule: "Every 6 hours (00/06/12/18 UTC) — the 12:00 run pre-warms the 13:00 weekday digest",
    path: "/api/cron/email-preverify",
    emailTypes: [],
    relatedAdminPath: "/admin/automations",
  },
];

export function getCronJob(id: string): CronJob | undefined {
  return CRON_REGISTRY.find((j) => j.id === id);
}

const AUDIENCE_ORDER: CronAudience[] = ["Providers", "Care seekers", "MedJobs", "Students", "Internal", "Data & maintenance"];

/** Audiences present in the registry, in canonical display order. */
export function cronAudiences(): CronAudience[] {
  const present = new Set(CRON_REGISTRY.map((j) => j.audience));
  return AUDIENCE_ORDER.filter((a) => present.has(a));
}

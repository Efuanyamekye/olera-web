export interface AutomationSystem {
  key: string;
  label: string;
  description: string;
  jobIds: string[];
  operational?: boolean;
}

/**
 * Product-level map for the Automations control center. The registry answers
 * what runs; this map answers how the jobs fit together for an operator.
 */
export const AUTOMATION_SYSTEMS: AutomationSystem[] = [
  {
    key: "provider-lifecycle",
    label: "Provider lifecycle",
    description: "Activate, guide, and re-engage providers after they join Olera.",
    jobIds: [
      "weekly-provider-digest",
      "verification-reminders",
      "provider-welcome",
      "profile-preview-nudge",
      "provider-dormant",
      "provider-anniversary",
    ],
  },
  {
    key: "ad-boost",
    label: "Ad Boost",
    description: "Move campaigns from request through launch, delivery, and outcome follow-up.",
    jobIds: [
      "ad-boost-profile-reminders",
      "ad-boost-launch-scheduler",
      "ad-boost-end-scheduler",
      "ad-boost-emails",
    ],
  },
  {
    key: "lead-response",
    label: "Lead response",
    description: "Keep provider and family conversations moving when a new lead arrives or goes quiet.",
    jobIds: [
      "provider-lead-alert-texts",
      "lead-followup-sequence",
      "conversation-stale",
      "matches-nudge",
      "family-reply-alert-texts",
      "matches-unread",
      "unread-reminders",
      "provider-still-silent",
    ],
  },
  {
    key: "provider-outreach",
    label: "Provider outreach",
    description: "Advance provider and staffing outreach sequences into the right human follow-up queue.",
    jobIds: [
      "staffing-send-email2",
      "staffing-sequence-check",
      "provider-outreach-send",
      "provider-outreach-sequence-check",
      "provider-outreach-channel-lifecycle",
    ],
  },
  {
    key: "family-guidance",
    label: "Family guidance",
    description: "Deliver benefits results, navigator steps, and lifecycle help without overlapping asks.",
    jobIds: [
      "family-nudges",
      "sms-queue-flush",
      "benefits-results-texts",
      "family-comms-coordinator",
      "benefits-navigator-scheduler",
    ],
  },
  {
    key: "medjobs",
    label: "MedJobs & campus",
    description: "Activate student candidates and advance campus-partner outreach.",
    jobIds: ["medjobs-nudge", "student-outreach-send"],
  },
  {
    key: "platform-operations",
    label: "Platform operations",
    description: "Internal reporting, compliance plumbing, data refreshes, and maintenance.",
    jobIds: [
      "daily-digest",
      "transactional-texts",
      "aggregate-provider-views",
      "google-reviews",
      "cms-refresh",
      "cleanup",
      "email-preverify",
      "deliverability-watch",
    ],
    operational: true,
  },
];

export const DEFAULT_AUTOMATION_SYSTEM_ORDER = AUTOMATION_SYSTEMS.map((system) => system.key);

/**
 * Keep saved preferences forward-compatible: ignore retired/unknown keys and
 * append newly introduced systems in their curated default position.
 */
export function normalizeAutomationSystemOrder(value: unknown): string[] {
  const saved = Array.isArray(value)
    ? value.filter((key): key is string => typeof key === "string" && DEFAULT_AUTOMATION_SYSTEM_ORDER.includes(key))
    : [];
  const unique = [...new Set(saved)];
  for (const [index, key] of DEFAULT_AUTOMATION_SYSTEM_ORDER.entries()) {
    if (!unique.includes(key)) unique.splice(Math.min(index, unique.length), 0, key);
  }
  return unique;
}

const SYSTEM_BY_JOB = new Map(
  AUTOMATION_SYSTEMS.flatMap((system) => system.jobIds.map((jobId) => [jobId, system.key] as const)),
);

export function automationSystemKey(jobId: string): string | null {
  return SYSTEM_BY_JOB.get(jobId) ?? null;
}

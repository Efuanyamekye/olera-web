/**
 * Olera's four priorities, in the founder's words.
 *
 * TJ, 2026-09-27, on Telegram: "Olera is a startup in the senior care space
 * with multiple priorities and if everything is about securing another
 * provider, then it loses this perspective." Then, 2026-09-28, on the brief:
 * "I just don't want to be reading updates and data without thinking about the
 * most important things with Olera."
 *
 * They live in code, not in war_room_company_models, so Cortex can read them
 * and never rewrite them. A change is a pull request he approves. Every brief
 * opens with one line per priority, every measurement is filed under one or
 * cut, and the scan is told to work on these and nothing else.
 */

export type PriorityKey = "crp" | "benefits" | "providers" | "operations";

export type Priority = {
  key: PriorityKey;
  /** The brief's label for it, short. */
  label: string;
  /** What it means, close to his words. Read by the scan and the conversation. */
  meaning: string;
};

export const OLERA_PRIORITIES: Priority[] = [
  {
    key: "crp",
    label: "CRP (Jan)",
    meaning: "Submit a competitive NIH SBIR CRP application by the first week of January 2027. Twelve providers who have actually paid, by 2027-01-05, is what lets it stand on commercial readiness.",
  },
  {
    key: "benefits",
    label: "Benefits Finder",
    meaning: "Make the Benefits Finder much better, so Olera is in a position to run the Phase 2b study, stay on track for the NIH milestones, and request a one-year extension.",
  },
  {
    key: "providers",
    label: "Providers subscribing",
    meaning: "Get providers subscribing: Managed Ads, which TJ runs, and MedJobs, which Logan runs.",
  },
  {
    key: "operations",
    label: "Operations",
    meaning: "General operations and product viability: making Olera the best it can be, so families who reach it actually get helped (the support inbox, texts, connections, follow-through).",
  },
];

export const PAYING_PROVIDER_TARGET = 12;
export const CRP_TARGET_DATE = "2027-01-05";

/** The scan's standing probes, filed by hand. Organic traffic serves none of the four and is cut. */
const PROBE_PRIORITY: Record<string, PriorityKey | null> = {
  "Question to claim": "providers",
  "Question inventory": "providers",
  "Provider reachability": "providers",
  "Revenue": "providers",
  "Support backlog": "operations",
  "Benefits Finder": "benefits",
  "Organic traffic": null,
};

/**
 * Which priority a measurement belongs to, from its label and headline, or
 * null when it serves none of them. A null reading is cut from the brief (it
 * stays on the Cortex page): "tie every number to a priority, or cut it".
 * Ordered: a paying-provider count is CRP evidence before it is a provider one.
 */
export function priorityFor(text: string): PriorityKey | null {
  const known = Object.keys(PROBE_PRIORITY).find((label) => text.startsWith(label));
  if (known) return PROBE_PRIORITY[known];
  const t = text.toLowerCase();
  if (/\b(crp|grant|nih|sbir|paying providers?|paid providers?)\b/.test(t)) return "crp";
  if (/\b(benefit|navigator|eligib|finder|waiver|letter|screening|phase 2b)/.test(t)) return "benefits";
  if (/\b(support|backlog|inbox|voicemail|sms|text(s|ing)?\b|famil|connection|inquir|question to claim|unanswered)/.test(t)) {
    // Questions families asked providers, and whether a provider can be reached
    // to answer them, are the provider relationship, not the support desk.
    if (/\bprovider (reachability|pages?)\b|question to claim|question inventory/.test(t)) return "providers";
    return "operations";
  }
  if (/\b(provider|campaign|ad boost|managed ads|subscri|renew|revenue|medjobs|stripe)/.test(t)) return "providers";
  return null;
}

/** For prompts: the four, numbered, with what each means. */
export function prioritiesPromptText(): string {
  return OLERA_PRIORITIES.map((priority, i) => `${i + 1}. ${priority.label}: ${priority.meaning}`).join("\n");
}

/** Whole weeks from `now` to the CRP target, never negative. */
export function weeksToCrp(now = new Date()): number {
  return Math.max(0, Math.floor((Date.parse(`${CRP_TARGET_DATE}T00:00:00Z`) - now.getTime()) / (7 * 86_400_000)));
}

const FIRST_NUMBER = /\d[\d,]*(?:\.\d+)?%?/;

/**
 * "Support backlog 1,747 → 1,222." The full sentences, with what they were,
 * stay below the line; the opening only needs the direction.
 */
export function compactMove(reading: { label: string; headline: string; previousHeadline?: string | null }): string {
  const now = reading.headline.match(FIRST_NUMBER)?.[0];
  const was = reading.previousHeadline?.match(FIRST_NUMBER)?.[0];
  if (now && was && now !== was) return `${reading.label} ${was} → ${now}.`;
  return `${reading.label}: ${reading.headline.replace(/\.$/, "")}.`;
}

/**
 * The brief's opening: one line per priority, every day, built from live data
 * only (no model), so a line can never claim what nothing measured. A quiet
 * priority says so rather than disappearing: he still sees all four.
 */
export function buildPriorityLines(input: {
  payingProviders: number | null;
  openCampaigns: number | null;
  /** Readings that moved, already filtered to the ones worth saying. */
  movers: Array<{ label: string; headline: string; previousHeadline?: string | null }>;
  /** e.g. "Hoop Cares renews Oct 15 ($75), in 17 days." */
  renewal: string | null;
  providerEmailsWaiting: number;
  inboxItemsWaiting: number;
  /** "Sep 26": the last brief, for "no change since". */
  since: string | null;
  /** One line per priority on what merged since the last brief (shipped.server.ts), or null. */
  shipped?: Partial<Record<PriorityKey, string | null>>;
  now?: Date;
}): string[] {
  // A reading named after its priority ("Benefits Finder") says its headline
  // whole: "*Benefits Finder:* Benefits Finder 90 → 79." reads twice.
  const moved = (key: PriorityKey) => input.movers
    .filter((reading) => priorityFor(reading.label) === key)
    .slice(0, 1)
    .map((reading) => reading.label === OLERA_PRIORITIES.find((priority) => priority.key === key)!.label
      ? reading.headline.trim()
      : compactMove(reading));
  // "No measured number moved", not "no change": only readings are measured.
  // Until the standing Benefits probe (probes.server.ts), no reading covered
  // the Benefits Finder, so a week of shipped Benefits work read as "No change
  // since Oct 3" (TJ, 2026-10-05: "This is wrong"). A priority with nothing
  // measured says what shipped, when anything did.
  const quiet = input.since ? `No measured number moved since ${input.since}.` : "Nothing new measured.";
  const line = (key: PriorityKey, parts: Array<string | null | false>) => {
    const label = OLERA_PRIORITIES.find((priority) => priority.key === key)!.label;
    const said = parts.filter((part): part is string => Boolean(part));
    const shipped = input.shipped?.[key] ?? null;
    if (said.length) return `*${label}:* ${said.join(" ")}${shipped ? ` ${shipped}` : ""}`;
    return `*${label}:* ${shipped ?? quiet}`;
  };
  const weeks = weeksToCrp(input.now);
  return [
    line("crp", [
      input.payingProviders !== null
        ? `${input.payingProviders} of ${PAYING_PROVIDER_TARGET} paying providers, ${weeks} week${weeks === 1 ? "" : "s"} to the Jan 5 target.`
        : null,
      ...moved("crp"),
    ]),
    line("benefits", moved("benefits")),
    line("providers", [
      input.renewal,
      input.openCampaigns !== null && input.payingProviders !== null
        ? `${input.openCampaigns} campaign${input.openCampaigns === 1 ? "" : "s"} open, ${input.payingProviders} paying.`
        : null,
      input.providerEmailsWaiting > 0 && `${input.providerEmailsWaiting} provider email${input.providerEmailsWaiting === 1 ? "" : "s"} waiting on you.`,
      ...moved("providers"),
    ]),
    line("operations", [
      ...moved("operations"),
      input.inboxItemsWaiting > 0 && `${input.inboxItemsWaiting} inbox item${input.inboxItemsWaiting === 1 ? "" : "s"} waiting on your approval.`,
    ]),
  ];
}

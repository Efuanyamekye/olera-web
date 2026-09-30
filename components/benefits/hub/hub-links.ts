import { trackGrowthEvent } from "@/lib/analytics/growth-attribution";

export type HubWho = "me" | "parent" | "spouse" | "other";

export const WHO_OPTIONS: { value: HubWho; label: string }[] = [
  { value: "me", label: "Myself" },
  { value: "parent", label: "My parent" },
  { value: "spouse", label: "My spouse or partner" },
  { value: "other", label: "Someone else" },
];

/** A state as the hub's client pieces need it: no program data shipped. */
export interface HubState {
  id: string;
  name: string;
  abbreviation: string;
  count: number;
}

const COHORT_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/i;

/**
 * The finder link, carrying a study link's ?cohort= from the hub URL so a study
 * family is still tagged after the hop. `who` answers the finder's first
 * question, which then opens on the second.
 */
export function finderHref(who?: HubWho): string {
  const params = new URLSearchParams();
  if (who) params.set("who", who);
  if (typeof window !== "undefined") {
    const cohort = new URLSearchParams(window.location.search).get("cohort");
    if (cohort && COHORT_RE.test(cohort)) params.set("cohort", cohort);
  }
  const q = params.toString();
  return `/benefits/finder${q ? `?${q}` : ""}`;
}

export function matchStates(states: HubState[], query: string): HubState[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return states.filter(
    (s) => s.name.toLowerCase().startsWith(q) || s.abbreviation.toLowerCase() === q,
  );
}

/**
 * Click tracking for the hub's entry points. The detail rides in the cta id
 * ("hub_state:texas", "hub_plan:hero") because the track route keeps cta_id
 * but drops metadata keys outside its allowlist.
 */
export function trackHubClick(ctaId: string) {
  trackGrowthEvent({ eventType: "cta_engaged", ctaId, ctaSurface: "benefits_hub", pagePath: "/senior-benefits" });
}

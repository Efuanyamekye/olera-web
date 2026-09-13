import { CITY_LANDING_ASSIGNED, type CityLandingArm } from "./landing-variant";

/**
 * Landings, engagement and submissions per landing-page arm.
 *
 * THE ONE NUMBER THAT DECIDES IS `submissions`. Landings are the denominator
 * and engagement diagnoses where an arm loses people; neither picks a winner.
 *
 * WHAT IS DELIBERATELY ABSENT: `lead_started`. It is not comparable between
 * these arms and never can be. On one_screen the contact fields are on the
 * landing screen, so it fires in the same instant as the first input; on the
 * other two it fires three screens later. Putting it in this table would invite
 * exactly the comparison it cannot support, so it is excluded here and kept as a
 * per-arm diagnostic in the raw events.
 *
 * ONE VISIT COUNTS ONCE. A visitor who reloads writes a second page_landed, and
 * counting rows rather than visits would inflate whichever arm happened to
 * attract the reloaders. Keyed on anonymous_id + visit_id.
 */

export interface ArmEvent {
  event_type: string;
  anonymous_id: string | null;
  visit_id: string | null;
  occurred_at: string;
  metadata: unknown;
}

export interface ArmLead {
  landing_arm: string | null;
  is_test: boolean | null;
  created_at: string;
}

export interface ArmRow {
  arm: CityLandingArm;
  /** Distinct visits that saw this arm. */
  landings: number;
  /** Of those, how many did anything at all. */
  engaged: number;
  /** Server-accepted, non-test requests. The outcome. */
  submissions: number;
  /** submissions / landings, or null when nobody has landed yet. */
  submissionRate: number | null;
  /** engaged / landings, or null when nobody has landed yet. */
  engagementRate: number | null;
}

function armOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const a = (metadata as Record<string, unknown>).arm;
  return typeof a === "string" ? a : null;
}

/**
 * `since` is the clean window: the moment the arms went live. Anything earlier
 * saw a different page and must not be scored against them — the same rule the
 * 10 Sep provider-cards fix established, and the reason that fix has a
 * timestamp recorded rather than a date.
 */
export function buildArmRollup(
  events: ArmEvent[],
  leads: ArmLead[],
  since: string | null,
): ArmRow[] {
  const after = (iso: string) => !since || iso >= since;

  const landed = new Map<CityLandingArm, Set<string>>();
  const engaged = new Map<CityLandingArm, Set<string>>();
  for (const a of CITY_LANDING_ASSIGNED) {
    landed.set(a, new Set());
    engaged.set(a, new Set());
  }

  for (const e of events) {
    if (!after(e.occurred_at)) continue;
    const arm = armOf(e.metadata);
    if (!arm || !landed.has(arm as CityLandingArm)) continue;
    // A visit without both keys cannot be deduplicated, so it is dropped rather
    // than counted under a shared empty key — which would collapse every such
    // visitor into one.
    if (!e.anonymous_id || !e.visit_id) continue;
    const key = `${e.anonymous_id}:${e.visit_id}`;
    if (e.event_type === "page_landed") landed.get(arm as CityLandingArm)!.add(key);
    // Any first input counts: pressing the button, touching a field, answering a
    // question, opening a provider card. Same meaning on all three arms, which
    // is the only reason it can sit in one column.
    else if (e.event_type === "cta_engaged" || e.event_type === "provider_expanded") {
      engaged.get(arm as CityLandingArm)!.add(key);
    }
  }

  const subs = new Map<string, number>();
  for (const l of leads) {
    if (l.is_test) continue;
    if (!l.landing_arm) continue; // predates the experiment; never read as control
    if (!after(l.created_at)) continue;
    subs.set(l.landing_arm, (subs.get(l.landing_arm) ?? 0) + 1);
  }

  return CITY_LANDING_ASSIGNED.map((arm) => {
    const landings = landed.get(arm)!.size;
    // Engagement is only counted for visits that also recorded a landing, so the
    // rate can never exceed 1 because of an orphaned event.
    const eng = [...engaged.get(arm)!].filter((k) => landed.get(arm)!.has(k)).length;
    const submissions = subs.get(arm) ?? 0;
    return {
      arm,
      landings,
      engaged: eng,
      submissions,
      submissionRate: landings > 0 ? submissions / landings : null,
      engagementRate: landings > 0 ? eng / landings : null,
    };
  });
}

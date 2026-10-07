/**
 * The benefits product's version log, for the CARE-NAV study (8 Oct 2026).
 *
 * The study follows one product that keeps improving, rather than freezing a
 * version per cohort (Logan's iterative model, #care-nav-study-team, 3 Oct).
 * Every family gets the current product. What makes that measurable is this
 * log: each meaningful change is a dated version, every finder, interview and
 * apply event is stamped with the version that served it, and a family's
 * letters and texts are placed by their send date with versionAt().
 *
 * Add an entry in the same PR as any change a family would notice in one of
 * the three experiences the study evaluates. Date it when it reaches
 * production (the promotion's merge time), not when it merges to staging:
 * a staging-only version stamps nothing real.
 *
 * Program-fact fixes that change who is told "likely" count as
 * recommendations. Copy edits, styling and fixes nobody would notice do not
 * need a version.
 */

export type StudyExperience = "questions" | "recommendations" | "apply_follow_up";

export const EXPERIENCE_LABEL: Record<StudyExperience, string> = {
  questions: "Questions",
  recommendations: "Recommendations",
  apply_follow_up: "Applying and follow-up",
};

export interface StudyVersion {
  /** "1.0", "1.1"… Versions below 1.0 came before the study. */
  id: string;
  /** When it reached production (ISO, UTC). */
  releasedAt: string;
  changed: StudyExperience[];
  /** What a family would notice, in a sentence or two. */
  summary: string;
  /** The production promotion PR, then the feature PRs. */
  prs: number[];
}

/** Oldest first. The last entry is the version being served. */
export const STUDY_VERSIONS: StudyVersion[] = [
  {
    id: "0.1",
    releasedAt: "2026-09-30T03:25:41Z",
    changed: ["questions", "recommendations", "apply_follow_up"],
    summary: "The redesigned finder: nine questions, then a plan with one first call, what to say and what to have ready, sent as a letter from Olera.",
    prs: [2288],
  },
  {
    id: "0.2",
    releasedAt: "2026-10-05T06:00:02Z",
    changed: ["recommendations"],
    summary: "Care waivers shown to families who don't have Medicaid yet. No repeated programs and no \"likely\" without the facts to back it. Program data cleaned of duplicates.",
    prs: [2364, 2307, 2324],
  },
  {
    id: "0.3",
    releasedAt: "2026-10-06T04:31:46Z",
    changed: ["recommendations"],
    summary: "Federal programs (Extra Help, SSI, the VA pension) in every state, and a local agency to call when no program fits.",
    prs: [2382],
  },
  {
    id: "0.4",
    releasedAt: "2026-10-07T02:29:13Z",
    changed: ["questions", "recommendations"],
    summary: "Half of new families get the guided interview (one question at a time) instead of the nine-question form. 142 more programs, and couples judged on their combined income.",
    prs: [2423, 2385],
  },
  {
    id: "0.5",
    releasedAt: "2026-10-07T06:14:49Z",
    changed: ["questions"],
    summary: "One follow-up question when a money range hides a program's limit (\"$2,455 or less?\").",
    prs: [2427, 2425],
  },
  {
    id: "0.6",
    releasedAt: "2026-10-07T07:03:05Z",
    changed: ["questions", "recommendations"],
    summary: "The first call is Medicare Savings when nothing that pays for care fits, and the interview asks the questions that settle it.",
    prs: [2431, 2429],
  },
  {
    id: "1.0",
    releasedAt: "2026-10-07T13:30:20Z",
    changed: ["apply_follow_up"],
    summary: "Apply for Medicare Savings through Social Security's Extra Help form with Olera's answer sheet beside you. Check-ins at one and five weeks, and a person steps in if the answer is no or something is stuck.",
    prs: [2448, 2436],
  },
];

export const CURRENT_STUDY_VERSION = STUDY_VERSIONS[STUDY_VERSIONS.length - 1].id;

/** The version that was live at a moment, or null before the first one. */
export function versionAt(at: string | Date): string | null {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return null;
  let found: string | null = null;
  for (const v of STUDY_VERSIONS) {
    if (new Date(v.releasedAt).getTime() <= t) found = v.id;
    else break;
  }
  return found;
}

/** Versions released after a moment: "what changed since they joined". */
export function versionsSince(at: string | Date): StudyVersion[] {
  const t = new Date(at).getTime();
  return STUDY_VERSIONS.filter((v) => new Date(v.releasedAt).getTime() > t);
}

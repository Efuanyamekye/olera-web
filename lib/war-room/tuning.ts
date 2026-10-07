/**
 * Cortex tuning, the pure part: what a tuning row means and how rows fold
 * into the settings a run reads. The database side is tuning.server.ts;
 * scripts/check-cortex-tuning.ts checks this file.
 *
 * TJ, 7 Oct 2026: tuning covers "how it communicates, how it asks for
 * feedback, what is autonomous versus what needs approval, how often". Three
 * knobs carry that: cadence (how often an initiative speaks), fences (which
 * action it does alone and which it asks about first), and lessons (standing
 * corrections scoped to the initiative). Grades are the fourth: a reaction on
 * a post, counted so the POLICY.md rule "ten unedited yeses" has a number.
 */

export type Cadence = "daily" | "weekly" | "off";
export type Fence = "alone" | "ask";
export type TuningKind = "cadence" | "fence" | "lesson" | "grade";

export type TuningRow = {
  initiative: string;
  kind: TuningKind;
  value: string;
  quote?: string | null;
  created_at: string;
};

export type Tuning = {
  cadence: Cadence;
  /** setting name → fence, newest row wins. */
  fences: Record<string, Fence>;
  /** Newest last. */
  lessons: string[];
  grades: { up: number; down: number };
};

/** The initiatives that have a standing thread, and the fence settings each one understands. */
export const INITIATIVE_SETTINGS: Record<string, { label: string; cadence: Cadence; fences: Record<string, { label: string; default: Fence }> }> = {
  directory: {
    label: "Directory health",
    cadence: "daily",
    fences: {
      renames: { label: "cosmetic renames (case, punctuation, suffix)", default: "alone" },
      archive: { label: "archiving a provider Google marks permanently closed", default: "alone" },
    },
  },
  meetings: { label: "Meeting summaries", cadence: "daily", fences: {} },
  product: { label: "Product pull requests", cadence: "daily", fences: {} },
  agents: { label: "Agent readiness", cadence: "weekly", fences: {} },
};

export const DEFAULT_TUNING: Tuning = { cadence: "daily", fences: {}, lessons: [], grades: { up: 0, down: 0 } };

const CADENCES: ReadonlyArray<Cadence> = ["daily", "weekly", "off"];
const FENCES: ReadonlyArray<Fence> = ["alone", "ask"];

export function isCadence(value: unknown): value is Cadence {
  return typeof value === "string" && (CADENCES as readonly string[]).includes(value);
}
export function isFence(value: unknown): value is Fence {
  return typeof value === "string" && (FENCES as readonly string[]).includes(value);
}

/** Fold rows (any order) into settings. Newest wins for cadence and each fence; lessons keep their order. */
export function foldTuning(initiative: string, rows: TuningRow[]): Tuning {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const spec = INITIATIVE_SETTINGS[initiative];
  const out: Tuning = {
    cadence: spec?.cadence ?? "daily",
    fences: Object.fromEntries(Object.entries(spec?.fences ?? {}).map(([k, v]) => [k, v.default])),
    lessons: [],
    grades: { up: 0, down: 0 },
  };
  for (const row of sorted) {
    if (row.kind === "cadence" && isCadence(row.value)) out.cadence = row.value;
    else if (row.kind === "fence") {
      const [setting, fence] = row.value.split("=");
      if (setting && isFence(fence)) out.fences[setting] = fence;
    } else if (row.kind === "lesson" && row.value.trim()) out.lessons.push(row.value.trim());
    else if (row.kind === "grade") {
      if (row.value === "up") out.grades.up += 1;
      else if (row.value === "down") out.grades.down += 1;
    }
  }
  return out;
}

/** Does a daily post go out today under this cadence? Weekly means Monday. */
export function shouldSpeakDaily(cadence: Cadence, now: Date): boolean {
  if (cadence === "daily") return true;
  if (cadence === "weekly") return now.getUTCDay() === 1;
  return false;
}

/** Does the Monday state post go out? Only "off" silences it. */
export function shouldSpeakWeekly(cadence: Cadence): boolean {
  return cadence !== "off";
}

/**
 * Which initiative a cortex_posts key belongs to. "thread:directory" and
 * "directory:2026-10-07" are the directory; "meeting:<id>" is meetings;
 * "handoffs:<day>" is product. Null for anything else.
 */
export function initiativeFromPostKey(key: string): string | null {
  const m = key.match(/^thread:([a-z]+)$/);
  if (m) return INITIATIVE_SETTINGS[m[1]] ? m[1] : null;
  if (/^directory(-week)?:/.test(key)) return "directory";
  if (/^meeting:/.test(key)) return "meetings";
  if (/^handoffs:/.test(key)) return "product";
  if (/^agents(-week)?:/.test(key)) return "agents";
  return null;
}

/** A reaction name → grade, or null for anything that is not a verdict. */
export function gradeFromReaction(reaction: string): "up" | "down" | null {
  const r = reaction.replace(/::skin-tone-\d$/, "");
  if (["+1", "thumbsup", "white_check_mark", "heavy_check_mark", "ok_hand", "raised_hands", "tada"].includes(r)) return "up";
  if (["-1", "thumbsdown", "x", "no_entry_sign", "no_entry"].includes(r)) return "down";
  return null;
}

export type ParsedTuning = {
  cadence?: Cadence;
  fence?: { setting: string; value: Fence };
  lesson?: string;
};

/**
 * Read the model's JSON answer. Anything malformed, empty, or NONE is null.
 * A fence setting the initiative does not have is dropped, so the model
 * cannot invent knobs.
 */
export function parseTuningReply(initiative: string, raw: string): ParsedTuning | null {
  const text = raw.trim();
  if (!text || /^NONE\b/i.test(text)) return null;
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(json) as Record<string, unknown>; } catch { return null; }
  const out: ParsedTuning = {};
  if (isCadence(obj.cadence)) out.cadence = obj.cadence;
  const fence = obj.fence as { setting?: unknown; value?: unknown } | undefined;
  if (fence && typeof fence.setting === "string" && isFence(fence.value) && INITIATIVE_SETTINGS[initiative]?.fences[fence.setting]) {
    out.fence = { setting: fence.setting, value: fence.value };
  }
  if (typeof obj.lesson === "string" && obj.lesson.trim().length >= 8 && obj.lesson.length <= 300) out.lesson = obj.lesson.trim();
  return out.cadence || out.fence || out.lesson ? out : null;
}

/** What Cortex says back when a setting changes. One line per change, with the way back. */
export function tuningAck(initiative: string, parsed: ParsedTuning): string {
  const label = INITIATIVE_SETTINGS[initiative]?.label ?? initiative;
  const lines: string[] = [];
  if (parsed.cadence === "weekly") lines.push(`${label}: I will post on Mondays only. Say "daily" here to change it back.`);
  if (parsed.cadence === "daily") lines.push(`${label}: back to a daily post when something happened.`);
  if (parsed.cadence === "off") lines.push(`${label}: I will stop posting about this. Say "daily" or "weekly" here to resume.`);
  if (parsed.fence) {
    const what = INITIATIVE_SETTINGS[initiative]?.fences[parsed.fence.setting]?.label ?? parsed.fence.setting;
    lines.push(parsed.fence.value === "ask"
      ? `${label}: ${what} now waits for a person; I will flag instead of doing it. Say "${parsed.fence.setting} alone" to let me do it again.`
      : `${label}: ${what} is mine again; I will do it and report after.`);
  }
  if (parsed.lesson) lines.push(`Noted for ${label.toLowerCase()}: ${parsed.lesson}`);
  return lines.join("\n");
}

/** Lines for a prompt: this initiative's standing lessons and settings. */
export function tuningLines(initiative: string, tuning: Tuning): string[] {
  const label = INITIATIVE_SETTINGS[initiative]?.label ?? initiative;
  const fences = Object.entries(tuning.fences).map(([k, v]) => `${k}=${v}`).join(", ");
  return [
    `${label}: cadence ${tuning.cadence}${fences ? `; fences ${fences}` : ""}; grades ${tuning.grades.up} up / ${tuning.grades.down} down`,
    ...tuning.lessons.map((l) => `${label}: ${l}`),
  ];
}

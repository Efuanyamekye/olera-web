// Reader/writer for the benefits text companion's row in experiment_weights.
// Same table as the page experiments, stored as
//   weights = { control: 100 - pct, companion: pct, practice: 0 | 1 }
// so the row reads like the others in the admin. A missing or unreadable row
// is "off": this experiment texts people, so every failure is dark.

import { getServiceClient } from "@/lib/admin";
import {
  BENEFITS_COMPANION_DEFAULT_SETTINGS,
  BENEFITS_COMPANION_LIVE_READY,
  BENEFITS_COMPANION_MODES,
  type BenefitsCompanionMode,
  type BenefitsCompanionSettings,
} from "./benefits-companion-variant";

export const BENEFITS_COMPANION_EXPERIMENT_ID = "benefits_companion";

function fromRow(weights: unknown, version: unknown): BenefitsCompanionSettings {
  const w = (weights && typeof weights === "object" ? weights : {}) as Record<string, unknown>;
  const pct = typeof w.companion === "number" && Number.isFinite(w.companion) ? Math.round(w.companion) : 0;
  const practice = w.practice === 1;
  const companionPct = Math.max(0, Math.min(100, pct));
  let mode: BenefitsCompanionMode = companionPct > 0 ? "live" : practice ? "practice" : "off";
  if (mode === "live" && !BENEFITS_COMPANION_LIVE_READY) mode = practice ? "practice" : "off";
  return { mode, companionPct: mode === "live" ? companionPct : 0, version: typeof version === "number" ? version : 0 };
}

export async function getBenefitsCompanionSettings(): Promise<BenefitsCompanionSettings> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from("experiment_weights")
      .select("weights, version")
      .eq("experiment_id", BENEFITS_COMPANION_EXPERIMENT_ID)
      .maybeSingle();
    if (error || !data) return { ...BENEFITS_COMPANION_DEFAULT_SETTINGS };
    return fromRow(data.weights, data.version);
  } catch (err) {
    console.error("[benefits-companion-settings] read threw:", err);
    return { ...BENEFITS_COMPANION_DEFAULT_SETTINGS };
  }
}

export type SaveCompanionResult =
  | { ok: true; settings: BenefitsCompanionSettings }
  | { ok: false; error: string };

export async function saveBenefitsCompanionSettings(
  input: { mode: unknown; companionPct: unknown },
  updatedBy: string | null,
): Promise<SaveCompanionResult> {
  if (typeof input.mode !== "string" || !(BENEFITS_COMPANION_MODES as readonly string[]).includes(input.mode)) {
    return { ok: false, error: "Mode must be off, practice or live" };
  }
  const mode = input.mode as BenefitsCompanionMode;
  let pct = 0;
  if (mode === "live") {
    if (!BENEFITS_COMPANION_LIVE_READY) {
      return { ok: false, error: "Live isn't available yet. It turns on when the fast replies and follow-ups ship." };
    }
    if (typeof input.companionPct !== "number" || !Number.isInteger(input.companionPct) || input.companionPct < 1 || input.companionPct > 50) {
      return { ok: false, error: "Live share must be a whole number from 1 to 50" };
    }
    pct = input.companionPct;
  }
  try {
    const db = getServiceClient();
    const existing = await db
      .from("experiment_weights")
      .select("version")
      .eq("experiment_id", BENEFITS_COMPANION_EXPERIMENT_ID)
      .maybeSingle();
    const nextVersion = (existing.data?.version ?? 0) + 1;
    const weights = { control: 100 - pct, companion: pct, practice: mode === "practice" ? 1 : 0 };
    const { error } = await db.from("experiment_weights").upsert({
      experiment_id: BENEFITS_COMPANION_EXPERIMENT_ID,
      weights,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    });
    if (error) {
      console.error("[benefits-companion-settings] write failed:", error);
      return { ok: false, error: "Database write failed" };
    }
    return { ok: true, settings: { mode, companionPct: pct, version: nextVersion } };
  } catch (err) {
    console.error("[benefits-companion-settings] write threw:", err);
    return { ok: false, error: "Database write failed" };
  }
}

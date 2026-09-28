// Assignment for the benefits text companion test.
//
// Families who give a phone number in the program-page card are split into:
//   control   — today's flow: the results text, the day-2 letter and its
//               companion text, the check-in.
//   companion — a two-way text conversation that starts at minute one and
//               asks whether the need is urgent (lib/family-comms/benefits-companion.server.ts).
//
// Unlike the page experiments this one texts people, so it ships dark and
// rolls out in steps TJ controls from /admin/analytics:
//   off      — nothing happens.
//   practice — nobody is assigned; the companion writes what it WOULD have
//              sent onto the profile so a person can read it. Nothing sends.
//   live     — `companionPct` percent of new phone-givers get the companion.
//
// Sticky per profile: the hash is over the profile id, the experiment name and
// the settings version, and the arm is stored on the profile at assignment,
// so a later dial change never moves a family already in the test.

export const BENEFITS_COMPANION_ARMS = ["control", "companion"] as const;
export type BenefitsCompanionArm = (typeof BENEFITS_COMPANION_ARMS)[number];

export const BENEFITS_COMPANION_MODES = ["off", "practice", "live"] as const;
export type BenefitsCompanionMode = (typeof BENEFITS_COMPANION_MODES)[number];

export interface BenefitsCompanionSettings {
  mode: BenefitsCompanionMode;
  /** Share of new phone-givers who get the companion while live, 0-100. */
  companionPct: number;
  version: number;
}

export const BENEFITS_COMPANION_DEFAULT_SETTINGS: BenefitsCompanionSettings = {
  mode: "off",
  companionPct: 0,
  version: 0,
};

/**
 * Live mode can only be switched on once the whole companion ships: the fast
 * replies (part 2) and the follow-ups plus the day-14 question (part 3).
 * Without them a companion family would lose the day-2 letter's text and the
 * check-in text with nothing replacing them. All three parts are in, so live
 * is allowed; the switch still starts on Off.
 */
export const BENEFITS_COMPANION_LIVE_READY = true;

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/** Arm for a profile. Anything but live mode with a positive share is control. */
export function assignBenefitsCompanionArm(
  profileId: string,
  settings: BenefitsCompanionSettings,
): BenefitsCompanionArm {
  if (settings.mode !== "live" || settings.companionPct <= 0) return "control";
  const r = djb2(`${profileId}:benefits_companion:v${settings.version}`) / 0x1_0000_0000;
  return r * 100 < settings.companionPct ? "companion" : "control";
}

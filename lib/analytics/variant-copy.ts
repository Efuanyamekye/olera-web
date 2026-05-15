// Variant copy strings for the Family Intake A/B test.
//
// Consumers:
//   1. components/providers/BenefitsDiscoveryModule — the live module on
//      provider pages. Imports VARIANT_COPY for the 3 benefits arms.
//   2. components/providers/AgentOutreachModule — uses OUTREACH_VARIANT_COPY.
//   3. /admin/analytics — variantSurfaceLabel + variantSubLabel for the
//      traffic-allocation dial cards. Live arm previews open in a new tab
//      via ?preview_arm=<variant> on the test provider page (no static
//      preview rendering on this surface anymore).
//
// Single source of truth so changing copy in one place updates every
// surface. Strings also live in the SBF Copy Variants Notion DB; that
// remains the durable record of what each arm earned (commentary,
// rationale, dates), but the actual rendered string is here.
//
//   https://app.notion.com/p/ec27110d1c6a4cc1a76bdf991344f63d

import type { BenefitsVariant, IntakeVariant } from "./variant";
import type { QuestionIntent } from "@/lib/benefits/infer-care-need-from-question";

// Legacy 3-step flow copy. availability + loss are paused (weight=0 in
// experiment_weights) but kept here as iterable bench assets — flip the
// weight to re-enable. empathic falls through to the new empathic_single
// component (see EMPATHIC_INTENT_H2 below) so its 3-step entry is unused
// at runtime; preserved for shape-compat with existing consumers.
export const BENEFITS_VARIANT_COPY: Record<
  BenefitsVariant,
  { h2: (state: string) => string; sub: (state: string) => string }
> = {
  availability: {
    h2: (state) => `${state} care benefits for families like yours.`,
    sub: () => "Tell us what's needed — we'll find what fits.",
  },
  loss: {
    h2: (state) => `Most ${state} families miss the care benefits they qualify for.`,
    sub: () => "$400–$900/month often goes unclaimed. Tell us what's needed.",
  },
  empathic: {
    h2: (state) => `Care is expensive in ${state}.`,
    sub: () => "Tell us what's needed — we'll find programs that may help.",
  },
};

// Intent-mapped H2s for the empathic_single arm (Arm D). The user's question
// content routes through inferCareNeedAndIntent → QuestionIntent → one of
// these strings. Each frame is retained from the paused arms it absorbs:
//   - cost      → loss frame ($400-900/mo data point)
//   - care-type → availability frame (warm "families like yours")
//   - fit       → "more options than they realize" — positive recompose
//   - default   → empathic frame (warm anchor for generic / late-funnel)
export const EMPATHIC_INTENT_H2: Record<QuestionIntent, (state: string) => string> = {
  cost: (state) =>
    `In ${state}, families like yours typically qualify for $400–900/mo in benefits that lower this.`,
  "care-type": (state) => `${state} care benefits for families like yours.`,
  fit: (state) => `${state} families have more options than they realize.`,
  default: (state) => `Care is expensive in ${state}.`,
};

// Outreach is structurally a different module (AgentOutreachModule), not a
// copy swap on the benefits form. The h2 + sub here drive the static admin
// preview only — the live module composes its own headline from these
// pieces plus city-specific phrasing the admin preview can stub with a
// placeholder city name.
export const OUTREACH_VARIANT_COPY = {
  h2: () => "Don't know which one to trust?",
  sub: (city: string) =>
    `Our care team will get pricing, availability, and how to start from the top providers in ${city} — in one email.`,
};

// Care-need card labels — identical across the 3 benefits arms. Kept in
// sync with CARE_NEED_OPTIONS in BenefitsDiscoveryModule. The admin preview
// renders a non-interactive version of these as visual context.
export const CARE_NEED_LABELS: Array<{ label: string; description: string }> = [
  { label: "Paying for care", description: "Medicare savings, cash benefits, food help" },
  { label: "In-home care", description: "Personal care, daily tasks, mobility" },
  { label: "Memory & medical care", description: "Dementia care, doctor visits, prescriptions" },
  { label: "Caregiver & social support", description: "Respite breaks, social programs" },
];

// Code-value → user-facing label, used by the admin drill-in to show
// "In-home care" instead of the camelCase enum value stored in
// metadata.care_need_selected. Falls back to the raw value for any
// unknown code so legacy data still renders.
export function careNeedLabel(value: string | null): string | null {
  if (!value) return null;
  switch (value) {
    case "payingForCare": return "Paying for care";
    case "stayingAtHome": return "In-home care";
    case "memoryHealth":  return "Memory & medical care";
    case "companionship": return "Caregiver & social support";
    default: return value;
  }
}

// Surface label for the admin UI. Maps the technical variant name to
// something a non-engineer reading the dashboard can scan.
export function variantSurfaceLabel(variant: IntakeVariant): string {
  switch (variant) {
    case "availability":
      return "Availability framing";
    case "loss":
      return "Loss framing";
    case "empathic":
      return "Empathic — single-step (D)";
    case "outreach":
      return "Care-team outreach";
    case "qa_email_capture":
      return "Q&A email capture (no SBF)";
    case "multi_provider":
      return "Multi-provider comparison";
    case "multi_provider_v2":
      return "Multi-provider V2 (email-first)";
  }
}

// One-line description of what each arm puts in front of a visitor.
// Used as the small sublabel under the variant name in the traffic-
// allocation dial. Adding a new arm requires extending the switch;
// TypeScript will flag a missing case because the input is typed as
// IntakeVariant (the union derived from INTAKE_VARIANTS).
export function variantSubLabel(variant: IntakeVariant): string {
  switch (variant) {
    case "availability":
      return "Benefits — positive framing";
    case "loss":
      return "Benefits — loss framing";
    case "empathic":
      return "Single-step capture w/ value preview";
    case "outreach":
      return "Care team gets pricing & availability";
    case "qa_email_capture":
      return "Q&A enrichment, no SBF";
    case "multi_provider":
      return "Send question to multiple providers";
    case "multi_provider_v2":
      return "Email capture first, optional card stack";
  }
}

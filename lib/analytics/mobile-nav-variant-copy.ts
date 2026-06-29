// Variant copy strings and labels for the Mobile Nav A/B test.
//
// Consumers:
//   1. /admin/analytics — mobileNavVariantLabel + mobileNavVariantSubLabel for the
//      traffic-allocation dial cards.
//
// Single source of truth so changing copy in one place updates every
// surface.

import type { MobileNavVariant } from "./mobile-nav-variant";

// Surface label for the admin UI. Maps the technical variant name to
// something a non-engineer reading the dashboard can scan.
export function mobileNavVariantLabel(variant: MobileNavVariant): string {
  switch (variant) {
    case "current":
      return "Current";
    case "bottom_tabs":
      return "Bottom Tabs";
    default: {
      // Exhaustive check — TypeScript will error if a variant is missing above
      const _exhaustive: never = variant;
      throw new Error(`Unknown mobile nav variant: ${_exhaustive}`);
    }
  }
}

// One-line description of what each arm puts in front of a visitor.
// Used as the small sublabel under the variant name in the traffic-
// allocation dial. Adding a new arm requires extending the switch;
// TypeScript will error on the exhaustive check if a case is missing.
export function mobileNavVariantSubLabel(variant: MobileNavVariant): string {
  switch (variant) {
    case "current":
      return "Hamburger menu only";
    case "bottom_tabs":
      return "Fixed bottom tab bar + hamburger";
    default: {
      // Exhaustive check — TypeScript will error if a variant is missing above
      const _exhaustive: never = variant;
      throw new Error(`Unknown mobile nav variant: ${_exhaustive}`);
    }
  }
}

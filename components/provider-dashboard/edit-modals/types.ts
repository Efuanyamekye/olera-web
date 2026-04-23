import type { Profile } from "@/lib/types";
import type { ExtendedMetadata } from "@/lib/profile-completeness";

export type SectionId =
  | "overview"
  | "gallery"
  | "services"
  | "screening"
  | "about"
  | "pricing"
  | "payment"
  | "owner";

export interface BaseEditModalProps {
  profile: Profile;
  metadata: ExtendedMetadata;
  onClose: () => void;
  onSaved: () => void;
  /** When true, show progress footer instead of Cancel/Save */
  guidedMode?: boolean;
  guidedStep?: number;
  guidedTotal?: number;
  onGuidedBack?: () => void;
  /** Verification gating - if false, show "Verify to save" button */
  isVerified?: boolean;
  onVerifyClick?: () => void;
}

/** Section order used for guided onboarding flow */
export const GUIDED_SECTION_ORDER: SectionId[] = [
  "overview",
  "pricing",
  "screening",
  "services",
  "gallery",
  "about",
  "payment",
];

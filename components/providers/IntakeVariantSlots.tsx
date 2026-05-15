"use client";

/**
 * Variant routing for the 6-way SBF intake A/B test on provider pages.
 *
 *   N% availability       ┐
 *   N% loss               ├─  see BenefitsDiscoveryModule (3-arm copy A/B inside)
 *   N% empathic           ┘
 *   N% outreach           →   see AgentOutreachModule on the Q&A surface
 *   N% qa_email_capture   →   NO SBF / NO outreach. Q&A enrichment ON
 *                             (handled inside QASectionV2 via useIntakeVariant).
 *   N% multi_provider     →   NO SBF / NO outreach. Multi-provider card stack
 *                             (handled inside QASectionV2 via useIntakeVariant).
 *
 * Allocation is no longer hardcoded — weights are read from
 * /api/variant-weights/intake (backed by the experiment_weights row),
 * which the admin can re-tune live from /admin/analytics. Both this
 * file and QASectionV2 read the same hook (useIntakeVariant) so the
 * dial controls every surface consistently.
 *
 * SSR behavior: BenefitsArmGate renders children eagerly (matching
 * today's pre-mount paint), then hides them after mount when the
 * resolved variant is "outreach", "qa_email_capture", or "multi_provider"
 * — all three suppress the SBF entirely. Sessions in those arms see a brief
 * flash of the benefits module disappearing. Trade chosen to preserve
 * first-paint UX for the benefits-arm majority.
 */

import { type ReactNode } from "react";
import { useIntakeVariant } from "@/hooks/use-intake-variant";
import AgentOutreachModule from "@/components/providers/AgentOutreachModule";
import type { ProviderCardData } from "@/lib/types/provider";

/**
 * Wraps the BenefitsDiscoveryModule section. Renders children unless the
 * session is in the outreach, qa_email_capture, or multi_provider arm —
 * all of those arms suppress the SBF entirely.
 */
export function BenefitsArmGate({ children }: { children: ReactNode }) {
  const variant = useIntakeVariant();
  if (variant === "outreach" || variant === "qa_email_capture" || variant === "multi_provider" || variant === "multi_provider_v2") return null;
  return <>{children}</>;
}

/**
 * Renders AgentOutreachModule only for the outreach arm. Mounted on the Q&A
 * surface; renders null for the other arms.
 */
export function AgentOutreachSlot(props: {
  sourceProviderId: string;
  sourceProviderName: string;
  city: string;
  state: string;
  category: string;
  topProviders: ProviderCardData[];
  recentQuestion?: { id: string; text: string } | null;
}) {
  const variant = useIntakeVariant();
  if (variant !== "outreach") return null;
  if (props.topProviders.length === 0) return null; // graceful fallback (no candidates)
  return <AgentOutreachModule {...props} />;
}

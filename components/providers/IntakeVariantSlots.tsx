"use client";

/**
 * Variant routing for the 4-way SBF intake A/B test on provider pages.
 *
 *   25% availability  ┐
 *   25% loss          ├─  see BenefitsDiscoveryModule (3-arm copy A/B inside)
 *   25% empathic      ┘
 *   25% outreach      →   see AgentOutreachModule on the Q&A surface
 *
 * Math note: BenefitsDiscoveryModule does its own mod-3 copy assignment
 * internally. Combining mod-3 (which 3-arm) with this mod-4 (outreach vs not)
 * on the same sessionId yields a uniform 1/4 distribution across all 4 arms
 * — gcd(3,4) = 1, so the two mods are uncorrelated.
 *
 * SSR behavior: BenefitsArmGate renders children eagerly (matching today's
 * pre-mount paint), then hides them after mount if the assigned variant is
 * "outreach". 25% of visitors see a brief flash of BenefitsDiscoveryModule
 * disappearing before AgentOutreachModule appears in the Q&A section. The
 * other 75% see no change. Trade chosen to preserve first-paint UX for the
 * majority arm.
 */

import { useEffect, useState, type ReactNode } from "react";
import { getOrCreateSessionId } from "@/lib/analytics/session";
import { assignIntakeVariant } from "@/lib/analytics/variant";
import AgentOutreachModule from "@/components/providers/AgentOutreachModule";
import type { ProviderCardData } from "@/lib/types/provider";

/**
 * Wraps the BenefitsDiscoveryModule section. Renders children unless the
 * session is in the outreach arm.
 */
export function BenefitsArmGate({ children }: { children: ReactNode }) {
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (assignIntakeVariant(getOrCreateSessionId()) === "outreach") setHide(true);
  }, []);
  if (hide) return null;
  return <>{children}</>;
}

/**
 * Renders AgentOutreachModule only for the outreach arm. Mounted on the Q&A
 * surface; renders null for the other 75%.
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
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (assignIntakeVariant(getOrCreateSessionId()) === "outreach") setShow(true);
  }, []);
  if (!show) return null;
  if (props.topProviders.length === 0) return null; // graceful fallback (no candidates)
  return <AgentOutreachModule {...props} />;
}

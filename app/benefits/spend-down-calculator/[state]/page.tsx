import type { Metadata } from "next";
import { Suspense } from "react";
import SpendDownCalculatorPage, {
  STATE_LIMITS,
  stateSlugToCode,
  stateCodeToSlug,
} from "../page";

// ── Static generation for all 51 state/DC pages ─────────────────────────────

export async function generateStaticParams() {
  return Object.keys(STATE_LIMITS).map((code) => ({
    state: stateCodeToSlug(code),
  }));
}

// ── Dynamic metadata per state ──────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state: slug } = await params;
  const code = stateSlugToCode(slug);
  const stateName = code ? STATE_LIMITS[code]?.label : null;

  if (!stateName) {
    return {
      title: "Medicaid Spend-Down Calculator 2026 | Olera",
      description:
        "Free Medicaid spend-down calculator. See how much you need to spend down to qualify for Medicaid in 2026.",
    };
  }

  return {
    title: `${stateName} Medicaid Spend-Down Calculator 2026 — See If You Qualify | Olera`,
    description: `Free Medicaid spend-down calculator for ${stateName} residents. See how much you need to spend down to qualify for Medicaid in 2026. Takes 2 minutes, no signup required.`,
    alternates: {
      canonical: `/benefits/spend-down-calculator/${slug}`,
    },
    openGraph: {
      title: `${stateName} Medicaid Spend-Down Calculator 2026 | Olera`,
      description: `Free Medicaid spend-down calculator for ${stateName} residents. See how much you need to spend down to qualify for Medicaid in 2026.`,
      url: `/benefits/spend-down-calculator/${slug}`,
      siteName: "Olera",
      type: "website",
    },
  };
}

// ── Page component ──────────────────────────────────────────────────────────

export default async function StateSpendDownPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state: slug } = await params;
  const code = stateSlugToCode(slug) || "";

  return (
    <Suspense>
      <SpendDownCalculatorPage initialStateCode={code} />
    </Suspense>
  );
}

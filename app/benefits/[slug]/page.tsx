import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStateById, allStates, type StateData, type WaiverProgram } from "@/data/waiver-library";
import { pipelineDrafts, type PipelineStateOverview, type PipelineDraft } from "@/data/pipeline-drafts";
import { StatePageV3 } from "@/components/waiver-library/StatePageV3";
import { createClient } from "@/lib/supabase/server";
import { shouldDiscoverBenefitsProgram } from "@/lib/benefits/program-content-quality";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Convert a pipeline draft into a WaiverProgram shape for state-list rendering.
 * This is the coercion layer that lets StatePageV3 render pipeline-sourced
 * program metadata without depending on waiver-library entries.
 */
function draftToWaiverProgram(draft: PipelineDraft): WaiverProgram {
  return {
    id: draft.id,
    name: draft.name,
    shortName: draft.shortName,
    tagline: draft.tagline,
    description: draft.intro?.split(".")[0] || draft.tagline || "",
    savingsRange: draft.savingsRange || "",
    savingsSource: draft.savingsSource || "",
    savingsVerified: draft.savingsVerified || false,
    eligibilityHighlights: draft.structuredEligibility?.summary || [],
    applicationSteps: (draft.applicationGuide?.steps || []).map((s) => ({
      step: s.step,
      title: s.title,
      description: s.description,
    })),
    forms: [],
    programType: draft.programType as WaiverProgram["programType"],
    complexity: draft.complexity as WaiverProgram["complexity"],
    geographicScope: draft.geographicScope as WaiverProgram["geographicScope"],
    intro: draft.intro,
    structuredEligibility: draft.structuredEligibility as WaiverProgram["structuredEligibility"],
    applicationGuide: draft.applicationGuide as WaiverProgram["applicationGuide"],
    contentSections: draft.contentSections as WaiverProgram["contentSections"],
    faqs: draft.faqs,
    phone: draft.phone || undefined,
    sourceUrl: draft.sourceUrl || undefined,
    contentStatus: draft.contentStatus as WaiverProgram["contentStatus"],
    draftedAt: draft.draftedAt,
    documentsNeeded: draft.documentsNeeded,
    contacts: draft.contacts,
    applicationNotes: draft.applicationNotes,
    relatedPrograms: draft.relatedPrograms,
    regionalApplications: draft.regionalApplications,
    layoutIntent: draft.layoutIntent as WaiverProgram["layoutIntent"],
    icon: draft.icon,
  };
}

/**
 * Resolve a slug to state data sourced entirely from pipeline drafts.
 * Waiver-library is consulted only for state metadata (name, abbreviation).
 * Programs are read directly from pipeline-drafts.ts.
 */
function resolveSlug(slug: string): {
  type: "state";
  state: StateData;
  overview: PipelineStateOverview;
  draftedAt: string;
} | {
  type: "region";
  regionName: string;
  parentState: string | null;
  overview: PipelineStateOverview;
  state: StateData;
  draftedAt: string;
} | null {
  // State match — use waiver-library for name/abbreviation metadata only
  const stateMetadata = getStateById(slug);
  if (stateMetadata) {
    const drafts = pipelineDrafts[stateMetadata.abbreviation];
    if (drafts?.stateOverview) {
      const discoverablePrograms = (drafts.programs || []).filter(shouldDiscoverBenefitsProgram);
      // Build a state object where programs come from pipeline, metadata from waiver-library
      const state: StateData = {
        ...stateMetadata,
        programs: discoverablePrograms.map(draftToWaiverProgram),
      };
      return {
        type: "state",
        state,
        overview: drafts.stateOverview,
        draftedAt: drafts.draftedAt,
      };
    }
  }

  // Region match (counties, metros, non-state entities in pipeline-drafts)
  for (const [, drafts] of Object.entries(pipelineDrafts)) {
    if (drafts.isRegion && drafts.slug === slug && drafts.stateOverview) {
      const discoverablePrograms = (drafts.programs || []).filter(shouldDiscoverBenefitsProgram);
      // Build a synthetic StateData for the region using pipeline program data
      const state: StateData = {
        id: drafts.slug,
        name: drafts.regionName || slug,
        abbreviation: drafts.parentState || slug.toUpperCase().slice(0, 2),
        description: "",
        programs: discoverablePrograms.map(draftToWaiverProgram),
      };
      return {
        type: "region",
        regionName: drafts.regionName || slug,
        parentState: drafts.parentState || null,
        overview: drafts.stateOverview,
        state,
        draftedAt: drafts.draftedAt,
      };
    }
  }

  return null;
}

export async function generateStaticParams() {
  const slugs: { slug: string }[] = [];

  for (const state of allStates) {
    const drafts = pipelineDrafts[state.abbreviation];
    if (drafts?.stateOverview) slugs.push({ slug: state.id });
  }

  for (const [, drafts] of Object.entries(pipelineDrafts)) {
    if (drafts.isRegion && drafts.slug && drafts.stateOverview) {
      slugs.push({ slug: drafts.slug });
    }
  }

  return slugs;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveSlug(slug);
  if (!resolved) return {};

  const name = resolved.type === "state" ? resolved.state.name : resolved.regionName;
  const programCount = resolved.state.programs.length;
  const intro = resolved.overview.intro?.split(/[.!?]\s/)[0];
  const description = intro ? `${intro}.` : `${programCount} senior benefit programs in ${name}. Find help paying for care, staying at home, food assistance, and more.`;

  const title = `Senior Benefits in ${name} — ${programCount} Programs | Olera`;
  return {
    title,
    description,
    alternates: { canonical: `/benefits/${slug}` },
    openGraph: { title, description, url: `/benefits/${slug}`, siteName: "Olera", type: "website" },
  };
}

export default async function BenefitsSlugPage({ params }: Props) {
  const { slug } = await params;
  const resolved = resolveSlug(slug);
  if (!resolved) notFound();

  const state = resolved.state;
  const overview = resolved.overview;
  const draftedAt = resolved.draftedAt;

  // Lightweight pipeline program refs for linking
  const pipelinePrograms = state.programs.map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
  }));

  // Social proof: recent answered family questions
  let familyQuestions: {
    question: string;
    answer: string;
    providerName: string;
    answeredAt: string;
    providerSlug?: string;
  }[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("provider_questions")
      .select("question, answer, answered_at, answered_by, provider_id")
      .eq("status", "answered")
      .eq("is_public", true)
      .eq("answer_status", "published")  // Only show published answers
      .not("answer", "is", null)
      .order("answered_at", { ascending: false })
      .limit(6);

    if (data) {
      const providerIds = data.map((q) => q.provider_id).filter(Boolean);
      const slugMap: Record<string, string> = {};
      if (providerIds.length > 0) {
        const { data: providers } = await supabase
          .from("olera-providers")
          .select("provider_id, slug")
          .in("provider_id", providerIds);
        if (providers) {
          for (const p of providers) if (p.slug) slugMap[p.provider_id] = p.slug;
        }
      }
      familyQuestions = data
        .filter((q) => q.question && q.answer)
        .slice(0, 3)
        .map((q) => ({
          question: q.question!,
          answer: q.answer!,
          providerName: q.answered_by || "Care provider",
          answeredAt: q.answered_at || "",
          providerSlug: q.provider_id ? slugMap[q.provider_id] : undefined,
        }));
    }
  } catch {
    // Silent — social proof is nice-to-have
  }

  // Structured data
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Benefits Hub", item: "https://olera.care/senior-benefits" },
      { "@type": "ListItem", position: 2, name: state.name, item: `https://olera.care/benefits/${slug}` },
    ],
  };

  const faqJsonLd = overview.quickFacts?.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: overview.quickFacts.map((fact) => ({
      "@type": "Question",
      name: fact.split("—")[0]?.trim() || fact.slice(0, 80),
      acceptedAnswer: { "@type": "Answer", text: fact },
    })),
  } : null;

  // Article schema — gives AI agents a quotable handle on the editorial
  // content of the page (overview.intro + program count). Author/publisher
  // assert Olera's voice; mainEntityOfPage anchors the URL.
  const stateName = resolved.type === "state" ? resolved.state.name : resolved.regionName;
  const articleDescription =
    overview.intro?.split(/[.!?]\s/)[0] || `${state.programs.length} senior benefit programs in ${stateName}.`;
  const articleJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Senior Benefits in ${stateName}`,
    description: articleDescription,
    author: {
      "@type": "Organization",
      name: "Olera",
      url: "https://olera.care",
    },
    publisher: {
      "@type": "Organization",
      name: "Olera",
      url: "https://olera.care",
      logo: {
        "@type": "ImageObject",
        url: "https://olera.care/images/olera-logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://olera.care/benefits/${slug}`,
    },
    ...(draftedAt && {
      datePublished: draftedAt,
      dateModified: draftedAt,
    }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
      <StatePageV3
        state={state}
        overview={overview}
        pipelinePrograms={pipelinePrograms}
        familyQuestions={familyQuestions}
        draftedAt={draftedAt}
      />
    </>
  );
}

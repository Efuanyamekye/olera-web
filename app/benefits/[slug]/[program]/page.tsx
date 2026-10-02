import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getStateById, allStates, type WaiverProgram, type StateData } from "@/data/waiver-library";
import { pipelineDrafts, type PipelineDraft } from "@/data/pipeline-drafts";
import { ProgramPageV3 } from "@/components/waiver-library/ProgramPageV3";
import { ContentViewTracker } from "@/components/analytics/ContentViewTracker";
import { getRelatedArticles } from "@/lib/content";
import { getDisplayName } from "@/lib/program-name";
import { getEnrichedProgram, findCanonicalDraftFor } from "@/lib/program-data";
import { duplicateTarget } from "@/lib/benefits/program-duplicates";
import {
  benefitsNoindexRobots,
  shouldDiscoverBenefitsProgram,
  shouldIndexBenefitsProgram,
} from "@/lib/benefits/program-content-quality";

interface Props {
  params: Promise<{ slug: string; program: string }>;
}

/**
 * Convert a pipeline draft into a WaiverProgram shape for rendering.
 * Direct 1:1 mapping — no merge layer, pipeline is canonical.
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
 * Resolve a (slug, program) pair to a program + state. Reads only from
 * pipeline-drafts. Waiver-library is consulted for state name/abbreviation
 * metadata. No merge layer.
 */
function resolveProgram(slug: string, programId: string): {
  state: StateData;
  program: WaiverProgram;
} | null {
  // Try state slug first
  const stateMetadata = getStateById(slug);
  if (stateMetadata) {
    const drafts = pipelineDrafts[stateMetadata.abbreviation];

    // Direct pipeline-draft ID match (existing path)
    if (drafts?.programs) {
      const draft = drafts.programs.find((d) => d.id === programId);
      if (draft) {
        const state: StateData = {
          ...stateMetadata,
          programs: (drafts.programs || []).map(draftToWaiverProgram),
        };
        return { state, program: draftToWaiverProgram(draft) };
      }
    }

    // Fallback: waiver-library ID match. The V3 SBF embeds matched-program
    // links via `getEnrichedProgram`, which returns the waiver-library ID
    // for any program that exists there (even if a draft also matches it
    // via fuzzy lookup). Without this fallback, every link to a base-only
    // or merged program 404s. Using getEnrichedProgram here gets us the
    // merged data (waiver-library + draft fill-ins) for richer rendering.
    const baseProgram = stateMetadata.programs?.find((p) => p.id === programId);
    if (baseProgram) {
      const enriched = getEnrichedProgram(slug, programId) ?? baseProgram;
      const allPrograms: WaiverProgram[] = [
        ...stateMetadata.programs,
        ...(drafts?.programs || []).map(draftToWaiverProgram),
      ];
      const state: StateData = {
        ...stateMetadata,
        programs: allPrograms,
      };
      return { state, program: enriched };
    }
  }

  // Try region slug
  for (const [, drafts] of Object.entries(pipelineDrafts)) {
    if (drafts.isRegion && drafts.slug === slug && drafts.programs) {
      const draft = drafts.programs.find((d) => d.id === programId);
      if (draft) {
        const state: StateData = {
          id: drafts.slug,
          name: drafts.regionName || slug,
          abbreviation: drafts.parentState || slug.toUpperCase().slice(0, 2),
          description: "",
          programs: (drafts.programs || []).map(draftToWaiverProgram),
        };
        return { state, program: draftToWaiverProgram(draft) };
      }
    }
  }

  return null;
}

export async function generateStaticParams() {
  const params: { slug: string; program: string }[] = [];

  for (const state of allStates) {
    const drafts = pipelineDrafts[state.abbreviation];
    if (!drafts?.programs) continue;
    for (const d of drafts.programs) {
      params.push({ slug: state.id, program: d.id });
    }
  }

  // Regions
  for (const [, drafts] of Object.entries(pipelineDrafts)) {
    if (drafts.isRegion && drafts.slug && drafts.programs) {
      for (const d of drafts.programs) {
        params.push({ slug: drafts.slug, program: d.id });
      }
    }
  }

  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, program: programId } = await params;
  const resolved = resolveProgram(slug, programId);
  if (!resolved) return {};

  const { state, program } = resolved;
  const displayName = getDisplayName(program, state);
  const title = `${displayName} | Benefits Hub | Olera`;
  const description = `${program.tagline} Learn about eligibility, home care benefits, and how to apply for ${program.shortName} in ${state.name}.`;
  const isIndexable = shouldIndexBenefitsProgram(program);

  return {
    title,
    description,
    alternates: { canonical: `/benefits/${slug}/${programId}` },
    ...(!isIndexable && { robots: benefitsNoindexRobots() }),
    openGraph: {
      title,
      description,
      url: `/benefits/${slug}/${programId}`,
      siteName: "Olera",
      type: "website",
    },
  };
}

/**
 * A legacy waiver-library program page whose program now has a CURRENT page
 * on the state list (e.g. /benefits/texas/texas-snap-food-benefits, which
 * carried older, conflicting numbers, vs /benefits/texas/snap-food-benefits).
 * Only clean one-to-one mappings redirect (see findCanonicalDraftFor); every
 * other legacy page keeps rendering as before.
 */
function canonicalRedirectFor(slug: string, programId: string): string | null {
  const stateMetadata = getStateById(slug);
  if (!stateMetadata) return null;
  const drafts = pipelineDrafts[stateMetadata.abbreviation];
  if (!drafts?.stateOverview || !drafts.programs) return null;
  if (drafts.programs.some((d) => d.id === programId)) return null;
  const draft = findCanonicalDraftFor(slug, programId);
  if (!draft || !shouldDiscoverBenefitsProgram(draft)) return null;
  return `/benefits/${slug}/${draft.id}`;
}

export default async function BenefitsProgramPage({ params }: Props) {
  const { slug, program: programId } = await params;
  // A program held twice in the data: send its second page to the kept one.
  const abbrev = getStateById(slug)?.abbreviation;
  const kept = abbrev ? duplicateTarget(abbrev, programId) : null;
  if (kept) permanentRedirect(`/benefits/${slug}/${kept}`);
  const canonical = canonicalRedirectFor(slug, programId);
  if (canonical) permanentRedirect(canonical);
  const resolved = resolveProgram(slug, programId);
  if (!resolved) notFound();

  const { state, program } = resolved;

  // Related articles (best-effort, non-blocking)
  const careTypes = ["senior-care", "home-care", "medicaid"];
  const articles = await getRelatedArticles("", careTypes, 2, slug === "texas" ? "texas" : undefined)
    .then((a) => a.map((art) => ({
      slug: art.slug,
      title: art.title,
      cover_image_url: art.cover_image_url,
      reading_time_minutes: art.reading_time ? parseInt(art.reading_time) || null : null,
      section: art.section,
    })))
    .catch(() => []);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Benefits Hub", item: "https://olera.care/senior-benefits" },
      { "@type": "ListItem", position: 2, name: state.name, item: `https://olera.care/benefits/${slug}` },
      { "@type": "ListItem", position: 3, name: getDisplayName(program, state), item: `https://olera.care/benefits/${slug}/${programId}` },
    ],
  };

  // Article schema with a GovernmentService `about` linkage. This is the
  // strongest signal we can give an AI agent: "This page is editorial
  // content explaining a specific Medicaid waiver / HCBS program in
  // <state>." The agent can then cite the article and follow `about`
  // for canonical service identity (name, area served, source URL).
  const programDisplayName = getDisplayName(program, state);
  const articleJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: programDisplayName,
    description: program.tagline || program.description || `${program.name} — eligibility, application steps, and how to apply in ${state.name}.`,
    about: {
      "@type": "GovernmentService",
      name: program.name,
      serviceType: "Medicaid waiver / Home and Community-Based Services",
      areaServed: {
        "@type": "AdministrativeArea",
        name: state.name,
      },
      ...(program.sourceUrl && { url: program.sourceUrl }),
    },
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
      "@id": `https://olera.care/benefits/${slug}/${programId}`,
    },
    ...(program.draftedAt && {
      datePublished: program.draftedAt,
      dateModified: program.draftedAt,
    }),
  };

  // FAQPage schema when the program has structured FAQ entries. Pulls
  // straight from program.faqs (pipeline-drafts source). Agents quote
  // verbatim from these on benefit-eligibility questions.
  const faqJsonLd = program.faqs && program.faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: program.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  } : null;

  return (
    <>
      <ContentViewTracker page={`/benefits/${slug}/${programId}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
      <ProgramPageV3 program={program} state={state} relatedArticles={articles} />
    </>
  );
}

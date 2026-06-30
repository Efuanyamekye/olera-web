import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStateById, activeStateIds, type WaiverProgram } from "@/data/waiver-library";
import { ProgramList } from "@/components/waiver-library/ProgramList";
import { StateOutline } from "@/components/waiver-library/StateOutline";
import { FaqAccordion } from "@/components/waiver-library/FaqAccordion";
import { pipelineDrafts } from "@/data/pipeline-drafts";
import { StatePageV3 } from "@/components/waiver-library/StatePageV3";
import { createClient } from "@/lib/supabase/server";
import { getEnrichedProgram } from "@/lib/program-data";
import { shouldDiscoverBenefitsProgram } from "@/lib/benefits/program-content-quality";

const STATE_FAQS: Record<string, { question: string; answer: string }[]> = {
  texas: [
    {
      question: "How do I pay for senior care in Texas?",
      answer: "Texas seniors can pay for care through Medicaid waivers like STAR+PLUS, which covers home care, personal assistance, and assisted living for those who qualify. Other options include Medicare (limited coverage), out-of-pocket, and spend-down strategies for those over the income limit. Most families qualify for more than they realize — a [free benefits check](/benefits/finder) takes 2 minutes.",
    },
    {
      question: "What free services are available for senior citizens in Texas?",
      answer: "Texas offers free or low-cost services including in-home personal care through STAR+PLUS, meal delivery, transportation, adult day care, caregiver respite, legal aid for seniors 60+, and energy bill assistance through LIHEAP. Eligibility depends on income, age, and care needs.",
    },
    {
      question: "What is the income limit for Medicaid in Texas for seniors?",
      answer: "For 2026, the income limit for Texas Medicaid home care waivers is $2,982/month for a single applicant. If your income is higher, you may still qualify using a Miller Trust. The asset limit is $2,000, but your home does not count.",
    },
    {
      question: "How do I apply for a Medicaid waiver in Texas?",
      answer: "Call 211 to get on the STAR+PLUS interest list, then apply for Medicaid at YourTexasBenefits.com if not already enrolled. A needs assessment follows and processing takes 1–2 months. Getting on the waitlist early is critical as spots are limited.",
    },
    {
      question: "Can I get paid to be a caregiver for a family member in Texas?",
      answer: "Yes. Through STAR+PLUS Consumer Directed Services, Medicaid recipients can hire and manage their own caregivers — including friends and certain family members. The family member is paid directly through a financial management agency.",
    },
    {
      question: "How much does Medicaid pay caregivers in Texas?",
      answer: "Texas Medicaid pays caregivers through the STAR+PLUS program at rates set by the managed care organization. Rates typically range from $10–$17/hour for personal assistance services depending on the region and MCO.",
    },
    {
      question: "What are Texas grants for senior citizens?",
      answer: "Texas does not offer direct cash grants to seniors but has programs that function similarly — LIHEAP pays heating and cooling bills directly to utility companies, the Weatherization Assistance Program covers home improvements up to $2,000, and Medicare Savings Programs pay Medicare premiums worth up to $8,000/year.",
    },
    {
      question: "Does Medicaid pay for nursing home care in Texas?",
      answer: "Yes, Medicaid does pay for nursing home care in Texas for people who meet financial and medical eligibility requirements. You must have income below $2,901 per month and require a nursing facility level of care, meaning you need significant help with daily activities or full-time medical supervision. Texas also offers the STAR+PLUS program as an alternative, which covers similar services at home so you can avoid a nursing facility altogether.",
    },
  ],
};

interface Props {
  params: Promise<{ state: string }>;
}

export async function generateStaticParams() {
  return activeStateIds.map((id) => ({ state: id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateId } = await params;
  const state = getStateById(stateId);
  if (!state || state.programs.length === 0) return {};

  // Use pipeline intro (richer, keyword-dense) over scaffold description
  const stateDrafts = pipelineDrafts[state.abbreviation];
  const pipelineIntro = stateDrafts?.stateOverview?.intro;
  const description = pipelineIntro
    ? pipelineIntro.split(/[.!?]\s/)[0] + "." // First sentence
    : state.description;

  const programCount = stateDrafts?.stateOverview
    ? state.programs
        .map((program): WaiverProgram => getEnrichedProgram(stateId, program.id) ?? program)
        .filter(shouldDiscoverBenefitsProgram).length
    : state.programs.length;

  const title = `Senior Benefits in ${state.name} — ${programCount} Programs | Olera`;
  return {
    title,
    description,
    alternates: { canonical: `/senior-benefits/${stateId}` },
    openGraph: {
      title,
      description,
      url: `/senior-benefits/${stateId}`,
      siteName: "Olera",
      type: "website",
    },
  };
}

export default async function StatePage({ params }: Props) {
  const { state: stateId } = await params;
  const state = getStateById(stateId);

  if (!state || state.programs.length === 0) {
    notFound();
  }

  // V3 state page if pipeline has generated a state overview
  const stateDrafts = pipelineDrafts[state.abbreviation];
  if (stateDrafts?.stateOverview) {
    const discoverablePrograms = state.programs
      .map((program): WaiverProgram => getEnrichedProgram(stateId, program.id) ?? program)
      .filter(shouldDiscoverBenefitsProgram);
    const displayState = {
      ...state,
      programs: discoverablePrograms,
    };

    // Pass lightweight pipeline program refs for linking (avoids bundling full draft data)
    const pipelinePrograms = (stateDrafts.programs || []).filter(shouldDiscoverBenefitsProgram).map((p) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
    }));

    // Fetch recent answered questions (social proof)
    // Uses a simple query — no cross-table join to avoid Supabase typed client issues with hyphenated table names
    let familyQuestions: { question: string; answer: string; providerName: string; answeredAt: string; providerSlug?: string }[] = [];
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
        // Look up provider slugs for linking
        const providerIds = data.map((q) => q.provider_id).filter(Boolean);
        let slugMap: Record<string, string> = {};
        if (providerIds.length > 0) {
          const { data: providers } = await supabase
            .from("olera-providers")
            .select("provider_id, slug")
            .in("provider_id", providerIds);
          if (providers) {
            for (const p of providers) {
              if (p.slug) slugMap[p.provider_id] = p.slug;
            }
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
      // Silent — social proof is nice-to-have, not critical
    }

    // Structured data for SEO
    const breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Benefits Hub", item: "https://olera.care/senior-benefits" },
        { "@type": "ListItem", position: 2, name: state.name, item: `https://olera.care/senior-benefits/${stateId}` },
      ],
    };

    const faqJsonLd = stateDrafts.stateOverview.quickFacts?.length ? {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: stateDrafts.stateOverview.quickFacts.map((fact) => ({
        "@type": "Question",
        name: fact.split("—")[0]?.trim() || fact.slice(0, 80),
        acceptedAnswer: { "@type": "Answer", text: fact },
      })),
    } : null;

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
        {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
        <StatePageV3 state={displayState} overview={stateDrafts.stateOverview} pipelinePrograms={pipelinePrograms} familyQuestions={familyQuestions} draftedAt={stateDrafts.draftedAt} />
      </>
    );
  }

  const faqs = STATE_FAQS[stateId] ?? [];

  return (
    <div className="bg-vanilla-100 min-h-screen">
      {/* Header */}
      <section className="relative bg-primary-800 text-white overflow-hidden">
        <StateOutline stateId={state.id} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-5">
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            {state.name} Benefits
          </h1>
          <p className="mt-1.5 text-xl md:text-2xl font-semibold text-white">
            Saving families up to {(() => {
              const maxSavings = Math.max(
                ...state.programs.map((p) => {
                  const match = p.savingsRange.match(/\$[\d,]+/g);
                  if (!match) return 0;
                  const last = match[match.length - 1];
                  return parseInt(last.replace(/[$,]/g, ""), 10);
                })
              );
              return `$${maxSavings.toLocaleString("en-US")}`;
            })()} a year
          </p>
          <div className="mt-4">
            <Link
              href="/benefits/finder"
              className="inline-flex items-center justify-center px-5 py-2 bg-white text-primary-600 font-semibold text-sm rounded-xl shadow-lg shadow-black/20 hover:shadow-xl hover:bg-white/90 transition-all"
            >
              <svg
                className="mr-1.5 w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Find My Savings
            </Link>
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="py-6 md:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProgramList programs={state.programs} stateId={state.id} />
        </div>
      </section>

      {/* FAQ Section */}
      {faqs.length > 0 && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.question,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: f.answer,
                  },
                })),
              }),
            }}
          />
          <section className="pb-6 md:pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-5">
                Frequently Asked Questions
              </h2>
              <FaqAccordion faqs={faqs.slice(0, 3)} columns={1} />
            </div>
          </section>
        </>
      )}

      {/* Bottom CTA banner */}
      <section className="pb-16 md:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-white px-6 py-8 md:py-10 text-center shadow-[0_6px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-gray-200/60">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 font-serif">
              See How Much You Could Save on Care
            </h2>
            <p className="mt-2 text-gray-500 text-base md:text-lg">
              Free, no signup required. Just a few quick questions.
            </p>
            <div className="mt-5">
              <Link
                href="/benefits/finder"
                className="inline-flex items-center justify-center px-6 py-3 text-base text-white font-semibold rounded-xl bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-600/25 transition-all duration-200"
              >
                Find My Savings
                <svg
                  className="ml-2 w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

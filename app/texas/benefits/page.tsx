import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStateById } from "@/data/waiver-library";
import { ProgramList } from "@/components/waiver-library/ProgramList";
import { StateOutline } from "@/components/waiver-library/StateOutline";
import { FaqAccordion } from "@/components/waiver-library/FaqAccordion";
import { TX_OLD_TO_NEW } from "@/lib/texas-slug-map";

const TEXAS_FAQS: { question: string; answer: string }[] = [
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
];

export const metadata: Metadata = {
  title: "Texas Benefits | Benefits Hub | Olera",
  description: "Texas offers Medicaid waiver programs through the Health and Human Services Commission (HHSC) to help seniors and adults with disabilities receive long-term care services at home or in the community.",
  alternates: { canonical: "/texas/benefits" },
  openGraph: {
    title: "Texas Benefits | Benefits Hub | Olera",
    description: "Texas offers Medicaid waiver programs through the Health and Human Services Commission (HHSC) to help seniors and adults with disabilities receive long-term care services at home or in the community.",
    url: "/texas/benefits",
    siteName: "Olera",
    type: "website",
  },
};

export default function TexasBenefitsPage() {
  const state = getStateById("texas");

  if (!state || state.programs.length === 0) {
    notFound();
  }

  return (
    <div className="bg-vanilla-100 min-h-screen">
      {/* Header */}
      <section className="relative bg-primary-800 text-white overflow-hidden">
        <StateOutline stateId="texas" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-5">
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            Texas Benefits
          </h1>
          <p className="mt-1.5 text-base md:text-lg text-white/80 max-w-xl">
            A complete guide to Medicaid, senior assistance programs, and financial help available to Texas families in 2026.
          </p>
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
          <ProgramList
            programs={state.programs}
            stateId="texas"
            slugMap={TX_OLD_TO_NEW}
            basePath="/texas/benefits"
          />
        </div>
      </section>

      {/* FAQ Section */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: TEXAS_FAQS.map((f) => ({
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
          <FaqAccordion faqs={TEXAS_FAQS} columns={1} />
        </div>
      </section>

      {/* Bottom CTA banner */}
      <section className="pb-8 md:pb-10">
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

      {/* Related Articles */}
      <section className="pb-16 md:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
            Related Articles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" style={{ maxWidth: "680px" }}>
            <Link href="/texas/how-to-pay-for-senior-care-in-texas" className="group block">
              <div className="rounded-lg overflow-hidden mb-2">
                <img
                  src="https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/covers/how-to-pay-for-senior-care-in-texas-1774519457693.png"
                  alt="How to Pay for Senior Care in Texas in 2026"
                  className="w-full aspect-[3/2] object-cover group-hover:opacity-90 transition-opacity"
                />
              </div>
              <h3 className="text-base font-bold text-gray-900 group-hover:text-primary-600 transition-colors mb-0.5">
                How to Pay for Senior Care in Texas in 2026
              </h3>
              <p className="text-xs text-gray-400">10 min read</p>
            </Link>
            <Link href="/texas/how-to-get-paid-as-a-caregiver-in-texas" className="group block">
              <div className="rounded-lg overflow-hidden mb-2">
                <img
                  src="https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/covers/how-to-get-paid-as-a-caregiver-in-texas-1774448475527.png"
                  alt="How to Get Paid as a Caregiver in Texas in 2026"
                  className="w-full aspect-[3/2] object-cover group-hover:opacity-90 transition-opacity"
                />
              </div>
              <h3 className="text-base font-bold text-gray-900 group-hover:text-primary-600 transition-colors mb-0.5">
                How to Get Paid as a Caregiver in Texas in 2026
              </h3>
              <p className="text-xs text-gray-400">8 min read</p>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

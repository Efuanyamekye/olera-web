import Link from "next/link";
import type { Metadata } from "next";
import type { ArticleHeading } from "@/lib/article-html";
import { type CareTypeId, CARE_TYPE_CONFIG } from "@/types/forum";
import { createClient } from "@/lib/supabase/server";
import {
  DesktopTableOfContents,
  MobileTableOfContents,
} from "@/components/article/TableOfContents";
import ShareButton from "@/components/article/ShareButton";

// ============================================================
// SEO Metadata
// ============================================================

const TITLE =
  "VA Caregiver Approval Letter 2026: Eligibility, Stipend Amounts, and How to Get Approved";
const DESCRIPTION =
  "What to expect after you apply, including timelines, stipend amounts, and how to handle a denial.";
const CANONICAL =
  "https://olera.care/caregiver-support/va-caregiver-approval-letter";

export const metadata: Metadata = {
  title: `${TITLE} | Olera`,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CANONICAL,
    siteName: "Olera",
    type: "article",
    images: ["/images/va-caregiver-approval-letter-cover.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/images/va-caregiver-approval-letter-cover.png"],
  },
};

// ============================================================
// Reusable micro-components
// ============================================================

const CheckIcon = () => (
  <svg
    className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
      clipRule="evenodd"
    />
  </svg>
);

function CheckList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-3 text-base text-gray-700 leading-relaxed"
        >
          <CheckIcon />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary-100 text-primary-700 mb-4">
      {children}
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 my-6 flex items-start gap-3">
      <svg
        className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      <div className="text-base text-amber-900 leading-relaxed">{children}</div>
    </div>
  );
}

// ============================================================
// Headings for TOC
// ============================================================

const HEADINGS: ArticleHeading[] = [
  { id: "what-is-a-va-caregiver-approval-letter", text: "What Is a VA Caregiver Approval Letter?", level: 2 },
  { id: "who-qualifies", text: "Who Qualifies for the VA Caregiver Program (PCAFC)?", level: 2 },
  { id: "approval-rate", text: "What Is the VA Caregiver Approval Rate?", level: 2 },
  { id: "common-denial-reasons", text: "Common Reasons Applications Are Denied", level: 2 },
  { id: "how-to-apply", text: "How to Apply: VA Form 10-10CG Step-by-Step", level: 2 },
  { id: "how-long-does-it-take", text: "How Long Does the Approval Process Take?", level: 2 },
  { id: "check-application-status", text: "How to Check Your Application Status", level: 2 },
  { id: "whats-included", text: "What\u2019s Included in the Approval Letter", level: 2 },
  { id: "stipend-pay-chart", text: "VA Caregiver Stipend Pay Chart 2026", level: 2 },
  { id: "back-pay", text: "VA Caregiver Back Pay: What to Expect", level: 2 },
  { id: "denied-what-to-do", text: "What to Do If You\u2019re Denied", level: 2 },
{ id: "faq", text: "Frequently Asked Questions", level: 2 },
];

const READING_TIME = "14 min read";

// ============================================================
// JSON-LD
// ============================================================

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  datePublished: "2026-04-28",
  dateModified: "2026-04-28",
  author: { "@type": "Organization", name: "Olera" },
  reviewedBy: {
    "@type": "Person",
    name: "Dr. Logan DuBose",
    jobTitle: "Co-founder & MD",
  },
  publisher: {
    "@type": "Organization",
    name: "Olera",
    url: "https://olera.care",
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://olera.care",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Caregiver Support",
      item: "https://olera.care/caregiver-support",
    },
    { "@type": "ListItem", position: 3, name: TITLE, item: CANONICAL },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I check my VA caregiver application status?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Call the Caregiver Support Line at (855) 260-3274, log in to your VA.gov account, or contact your local CSP team using the CSP Team Locator on VA.gov. Follow up every 2 to 3 weeks until you receive a decision.",
      },
    },
    {
      "@type": "Question",
      name: "How long does it take for the VA to approve a caregiver?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most decisions are made within 90 days of a complete application. The full timeline, including back-end processing and the mailing of the approval letter, typically runs 3 to 5 months from submission to first payment.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get approved for a VA caregiver?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Both the veteran and the caregiver must complete and submit VA Form 10-10CG. The veteran must have a service-connected disability rating of 70% or higher and need at least 6 months of personal care. After the application is submitted, the VA conducts a clinical assessment and makes a decision within 90 days.",
      },
    },
    {
      "@type": "Question",
      name: "What is the approval rate for the VA caregiver program?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Historical approval rates have ranged from about 40% to 60%. The strongest predictor of approval is documentation: applications with detailed clinical evidence of care needs are significantly more likely to be approved.",
      },
    },
    {
      "@type": "Question",
      name: "Is there back pay for the VA caregiver stipend?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Stipend payments are typically issued from the application\u2019s effective date, not the approval date. Families approved after a long processing time often receive a lump-sum payment covering the months between application and approval.",
      },
    },
    {
      "@type": "Question",
      name: "Can I appeal a VA caregiver denial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Families have one year from the decision letter date to file a Supplemental Claim using VA Form 20-0995. If denied again, the next options are a Higher-Level Review or a Board Appeal.",
      },
    },
    {
      "@type": "Question",
      name: "Who qualifies as a VA caregiver?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The caregiver must be at least 18 years old, be a family member or someone the veteran considers family, live with the veteran full-time, and complete required caregiver training.",
      },
    },
  ],
};

// ============================================================
// Page Component
// ============================================================

export default async function VACaregiverApprovalLetterPage() {
  const supabase = await createClient();
  // During build without Supabase configured, related will be null
  const { data: related } = supabase
    ? await supabase
        .from("content_articles")
        .select("id, slug, title, cover_image_url, care_types, reading_time")
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(3)
    : { data: null };
  return (
    <main className="min-h-screen bg-white">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="max-w-[1100px] mx-auto px-5 lg:flex lg:gap-16">
        {/* Left column: header + body */}
        <div className="flex-1 max-w-[680px]">
          {/* ── Header ──────────────────────────────────────── */}
          <header className="pt-8 md:pt-12">
            <Link
              href="/caregiver-support"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-6"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Caregiver Support
            </Link>

            <h1 className="font-display text-display-sm md:text-display-md text-gray-900 tracking-[-0.02em] mb-3">
              {TITLE}
            </h1>

            <p className="text-lg text-gray-500 mb-4">{DESCRIPTION}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 mb-10">
              <span><span className="text-gray-400">Published by </span><span className="font-medium text-gray-700">Olera team</span></span>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2">
                <img src="/images/for-providers/team/logan.jpg" alt="Dr. Logan DuBose" className="w-7 h-7 rounded-full object-cover" />
                <span><span className="text-gray-400">Verified by </span><Link href="/author/dr-logan-dubose" className="font-medium text-gray-700 hover:text-primary-600 transition-colors">Dr. Logan DuBose</Link></span>
              </div>
              <span className="text-gray-300">|</span>
              <span className="text-gray-400">{READING_TIME}</span>
              <span className="text-gray-300">|</span>
              <ShareButton />
            </div>
          </header>

          {/* ── Hero Image ─────────────────────────────────── */}
          <figure className="mb-10">
            <img
              src="/images/va-caregiver-approval-letter-cover.png"
              alt="Young man helping an elderly veteran stand up from the couch"
              className="w-full aspect-[16/9] object-cover object-top rounded-2xl"
            />
          </figure>

          {/* ── Article body ─────────────────────────────────── */}
          <article>
            <MobileTableOfContents headings={HEADINGS} />

            {/* ── Quick Summary ──────────────────────────────── */}
            <div className="rounded-xl bg-primary-50 border border-primary-100 px-6 py-6 mb-10">
              <h2 className="font-display text-2xl text-gray-900 tracking-[-0.01em] mb-4">
                Quick Summary
              </h2>
              <CheckList
                items={[
                  "The approval letter is the official document confirming acceptance into the VA\u2019s Program of Comprehensive Assistance for Family Caregivers (PCAFC)",
                  "Approval is based on a 90-day review of VA Form 10-10CG plus a clinical assessment",
                  "Primary caregivers can receive a monthly stipend ranging from roughly $1,800 to $3,500 in 2026, depending on tier and location",
                ]}
              />
            </div>

            <div className="prose-editorial">
              <p>
                The VA Caregiver Approval Letter is more than a piece of paper. It is the document that unlocks monthly stipends, training, healthcare benefits through CHAMPVA, and official recognition that a family member is providing critical care to a veteran.
              </p>
              <p>
                The path to that letter has a lot of moving parts. From the application itself to the clinical assessment, the timeline, the stipend amount, and what to do if something goes sideways, this guide walks you through each step so you know what to expect.
              </p>

              {/* ── What Is a VA Caregiver Approval Letter? ───── */}
              <h2 id="what-is-a-va-caregiver-approval-letter">
                What Is a VA Caregiver Approval Letter?
              </h2>
              <p>
                The VA caregiver approval letter (sometimes called a &ldquo;decision letter&rdquo;) is the official document the Department of Veterans Affairs sends to confirm that a caregiver has been accepted into the Program of Comprehensive Assistance for Family Caregivers, also known as PCAFC.
              </p>
              <p>The letter does three things:</p>
            </div>

            <div className="rounded-xl bg-blue-50/50 border border-blue-100 px-6 py-5 my-6">
              <div className="space-y-4">
                {[
                  "Confirms the veteran\u2019s eligibility for the program",
                  "Identifies who is officially approved as the primary caregiver (and any secondary caregivers)",
                  "Outlines the approved tier of support and the monthly stipend amount",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 text-base text-gray-700 leading-relaxed">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="pt-1">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="prose-editorial">
              <p>
                The letter typically arrives 10 to 14 business days after a final decision is made. It is mailed to both the veteran and the approved caregiver. A Caregiver Support Program (CSP) team member usually calls first to share the decision before the letter is sent.
              </p>
            </div>

            <Callout>

              Once you receive the approval letter, keep it somewhere safe. It serves as your official documentation for the program and you may need it when scheduling training, accessing CHAMPVA, or coordinating care with VA providers. You can also <a href="https://www.va.gov/records/download-va-letters/" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 underline font-medium">download your letter here</a> &mdash; but first you must create a VA.gov account.
            </Callout>

            <div className="prose-editorial">
              {/* ── Who Qualifies ────────────────────────────── */}
              <h2 id="who-qualifies">
                Who Qualifies for the VA Caregiver Program (PCAFC)?
              </h2>
              <p>
                To qualify for PCAFC, both the veteran and the caregiver must meet specific criteria.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-8">
              <div className="rounded-xl border border-gray-200 px-5 py-5">
                <p className="font-semibold text-gray-900 mb-4">The veteran must:</p>
                <ul className="space-y-3">
                  {[
                    "Have a service-connected disability rating of 70% or higher",
                    "Need at least 6 months of continuous personal care services",
                    "Live with the caregiver (or move in once approved)",
                    "Be enrolled in VA health care",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-base text-gray-700 leading-relaxed">
                      <CheckIcon />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-gray-200 px-5 py-5">
                <p className="font-semibold text-gray-900 mb-4">The caregiver must:</p>
                <ul className="space-y-3">
                  {[
                    "Be at least 18 years old",
                    "Be a family member, or someone the veteran considers family who lives with them full-time",
                    "Pass the required caregiver training",
                    "Be willing and able to provide the level of care needed",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-base text-gray-700 leading-relaxed">
                      <CheckIcon />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="prose-editorial">
              <p>
                Both must complete VA Form 10-10CG together and submit it through VA.gov, by mail, or in person at a local VA facility. You can <a href="https://www.va.gov/vaforms/medical/pdf/10-10CG.pdf" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 underline font-medium">download the 10-10CG form here</a>.
              </p>

              {/* ── Approval Rate ────────────────────────────── */}
              <h2 id="approval-rate">
                What Is the VA Caregiver Approval Rate?
              </h2>
              <p>
                It&rsquo;s natural to wonder about your odds before going through a long application. Here&rsquo;s an honest look at how the process tends to go.
              </p>
              <p>
                Approval rates for PCAFC have historically ranged from around 40% to 60%, depending on the year and tier applied for. The Tier 1 (general caregiver) approval rate tends to be higher than the Tier 2 (primary caregiver) rate, because Tier 2 requires a more significant level of personal care need.
              </p>
              <p>
                The single biggest factor in getting approved is documentation. Applications backed by detailed clinical evidence of the veteran&rsquo;s care needs do significantly better than ones that rely on general statements. The good news: this is something families can control. Strong paperwork, clear physician notes, and a complete application can make a real difference in the outcome.
              </p>
            </div>

            <Callout>
              Don&rsquo;t let approval rate statistics scare you off applying. The application is free, the program is significant, and even denied applications can be appealed.
            </Callout>

            <div className="prose-editorial">
              {/* ── Common Denial Reasons ─────────────────────── */}
              <h2 id="common-denial-reasons">
                Common Reasons VA Caregiver Applications Are Denied
              </h2>
              <p>Most denials fall into one of four categories:</p>
            </div>

            <div className="space-y-4 my-6">
              {[
                { title: "The veteran\u2019s disability rating is below 70%.", desc: "This is a hard requirement. If the rating has changed recently, attach the current rating decision letter." },
                { title: "The clinical assessment doesn\u2019t support a 6-month care need.", desc: "Make sure the veteran\u2019s primary VA provider has documented the specific tasks the veteran needs help with." },
                { title: "The caregiver doesn\u2019t live with the veteran full-time.", desc: "PCAFC requires shared living, not just regular visits." },
                { title: "Application paperwork is incomplete.", desc: "Missing signatures, missing dates, or missing supporting documents all trigger automatic denials." },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-base text-gray-700 leading-relaxed">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  <span><strong>{item.title}</strong> {item.desc}</span>
                </div>
              ))}
            </div>

            <div className="prose-editorial">
              <p>
                To give your application the best chance, include a physician&rsquo;s statement describing daily care needs, complete every section of VA Form 10-10CG, and attach the veteran&rsquo;s most current disability rating.
              </p>

              {/* ── How to Apply ──────────────────────────────── */}
              <h2 id="how-to-apply">
                How to Apply: VA Form 10-10CG Step-by-Step
              </h2>
              <p>
                The official application is VA Form 10-10CG. Both the veteran and the prospective caregiver must complete and sign it together.
              </p>
            </div>

            {/* Step-by-step cards */}
            <div className="space-y-4 my-8">
              {[
                {
                  step: 1,
                  title: "Confirm eligibility",
                  desc: "Verify the veteran\u2019s disability rating is 70% or higher and that they are enrolled in VA health care.",
                },
                {
                  step: 2,
                  title: "Download VA Form 10-10CG",
                  desc: "Available at VA.gov or by calling the Caregiver Support Line at (855) 260-3274.",
                },
                {
                  step: 3,
                  title: "Complete the form together",
                  desc: "The form covers the veteran\u2019s information, the caregiver\u2019s information, the relationship between you, and signed consent for the VA to coordinate care.",
                },
                {
                  step: 4,
                  title: "Submit the application",
                  desc: "Three options: submit online at VA.gov, mail to your local VA facility, or hand-deliver in person.",
                },
                {
                  step: 5,
                  title: "Schedule the clinical assessment",
                  desc: "A VA team member will reach out to schedule both a phone evaluation and an in-home assessment to verify care needs.",
                },
                {
                  step: 6,
                  title: "Complete caregiver training",
                  desc: "Approved caregivers must complete a mandatory training course. The training is free and can usually be completed online.",
                },
                {
                  step: 7,
                  title: "Wait for the decision letter",
                  desc: "Most decisions are issued within 90 days of a complete application.",
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="flex gap-4 items-start rounded-xl border border-gray-200 px-5 py-4"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">
                    {s.step}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900 mb-0.5">
                      {s.title}
                    </p>
                    <p className="text-base text-gray-600 leading-relaxed">
                      {s.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="prose-editorial">
              {/* ── How Long Does It Take ─────────────────────── */}
              <h2 id="how-long-does-it-take">
                How Long Does the VA Caregiver Approval Process Take?
              </h2>
              <p>
                The standard timeline is 90 days from a complete application to a final decision. In practice, the full timeline can vary.
              </p>
            </div>

            {/* Horizontal Timeline */}
            <div className="my-8 overflow-x-auto">
              <div className="flex items-start min-w-[900px]">
                {[
                  { stage: "Application submitted", time: "Day 1" },
                  { stage: "Initial VA contact", time: "1\u20132 weeks" },
                  { stage: "Assessment scheduled", time: "2\u20134 weeks" },
                  { stage: "Assessment completed", time: "4\u20138 weeks" },
                  { stage: "Decision made", time: "Within 90 days" },
                  { stage: "Letter mailed", time: "10\u201314 biz days" },
                  { stage: "First stipend", time: "Month after" },
                ].map((item, i, arr) => (
                  <div key={i} className="flex-1 flex flex-col items-center text-center">
                    {/* Dot + line */}
                    <div className="flex items-center w-full mb-3">
                      {i > 0 && <div className="flex-1 h-px bg-primary-200" />}
                      <div className="w-3 h-3 rounded-full bg-primary-500 flex-shrink-0" />
                      {i < arr.length - 1 && <div className="flex-1 h-px bg-primary-200" />}
                    </div>
                    <p className="text-xs font-semibold text-gray-900 leading-tight px-1">{item.stage}</p>
                    <p className="text-xs text-gray-500 mt-1 px-1">{item.time}</p>
                  </div>
                ))}
              </div>
            </div>

            <Callout>
              If your application takes longer than 90 days, contact the Caregiver Support Line at (855)&nbsp;260-3274 for a status update.
            </Callout>

            <div className="prose-editorial">
              {/* ── Check Status ──────────────────────────────── */}
              <h2 id="check-application-status">
                How to Check Your VA Caregiver Application Status
              </h2>
              <p>
                Once you&rsquo;ve applied, there are three ways to check where your application stands.
              </p>

            </div>

            <div className="rounded-xl bg-blue-50/50 border border-blue-100 px-6 py-5 my-6">
              <div className="space-y-4">
                {[
                  { title: "Phone:", desc: "Call the Caregiver Support Line at (855)\u00A0260-3274, Monday through Friday, 8\u00A0a.m. to 8\u00A0p.m.\u00A0ET." },
                  { title: "Online:", desc: "Log in to your account at VA.gov and navigate to your applications dashboard." },
                  { title: "Local CSP team:", desc: "Use the CSP Team Locator on VA.gov to find your assigned coordinator. They can give you the most direct status update." },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 text-base text-gray-700 leading-relaxed">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="pt-1"><strong>{item.title}</strong> {item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="prose-editorial">
              <p>
                A reasonable rhythm is to check in every 2 to 3 weeks. The VA processes thousands of applications, and following up keeps your case visible without overwhelming the system.
              </p>

              {/* ── What's Included ──────────────────────────── */}
              <h2 id="whats-included">
                What&rsquo;s Included in the VA Caregiver Approval Letter
              </h2>
              <p>When the approval letter arrives, it will include:</p>
            </div>

            <div className="rounded-xl bg-blue-50/50 border border-blue-100 px-6 py-5 my-6">
              <CheckList
                items={[
                  "Confirmation of acceptance into PCAFC",
                  "The approved tier (general caregiver or primary caregiver)",
                  "The monthly stipend amount",
                  "The effective date of approval",
                  "Information about CHAMPVA enrollment (if applicable)",
                  "Contact information for your assigned CSP team",
                ]}
              />
            </div>

            <div className="prose-editorial">
              <p>
                Read the letter carefully. The effective date matters because it determines when stipend payments begin and whether back pay is owed.
              </p>

              {/* ── Stipend Pay Chart ────────────────────────── */}
              <h2 id="stipend-pay-chart">
                VA Caregiver Stipend Pay Chart 2026
              </h2>
              <p>
                Before you start the application, it helps to understand how the veteran&rsquo;s disability rating fits into all this. The rating shapes both the monthly compensation a veteran receives and whether they qualify for the Caregiver Program at all. To be eligible for PCAFC, the veteran must have a service-connected disability rating of 70% or higher.
              </p>
              <p>
                Here&rsquo;s what monthly compensation looks like for single veterans without dependents in 2026:
              </p>
            </div>

            <div className="overflow-x-auto my-8 rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-gray-900">Disability Rating</th>
                    <th className="px-4 py-3 font-semibold text-gray-900">2026 Monthly</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ["10%", "$180.42", false],
                    ["20%", "$356.66", false],
                    ["30%", "$552.47", false],
                    ["40%", "$795.84", false],
                    ["50%", "$1,132.90", false],
                    ["60%", "$1,435.02", false],
                    ["70% (Caregiver Program eligibility threshold)", "$1,808.45", true],
                    ["80%", "$2,102.15", false],
                    ["90%", "$2,362.30", false],
                    ["100%", "$3,938.58", false],
                  ].map(([rating, amount, highlight]) => (
                    <tr key={rating as string} className={highlight ? "bg-primary-50" : ""}>
                      <td className={`px-4 py-3 ${highlight ? "text-primary-700 font-semibold" : "text-gray-900 font-medium"}`}>{rating as string}</td>
                      <td className={`px-4 py-3 ${highlight ? "text-primary-700 font-semibold" : "text-gray-900 font-medium"}`}>{amount as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="prose-editorial">
              <p>
                These numbers reflect what a single veteran with no dependents receives. Veterans with a spouse, children, or dependent parents receive more, and you can find the full chart on VA.gov.
              </p>

              {/* ── Back Pay ──────────────────────────────────── */}
              <h2 id="back-pay">
                VA Caregiver Back Pay: What to Expect After Approval
              </h2>
              <p>
                The waiting is hard, but here&rsquo;s some good news. When the VA approves a PCAFC application, your stipend usually starts from the date you applied, not the date you were approved. So if your application took 5 months to process, you may receive a lump sum covering those 5 months once everything is finalized.
              </p>
              <p>
                The effective date is typically the day the VA received your complete application with all supporting documents. If you sent in additional paperwork later to complete a missing piece, your effective date might be when the application became complete rather than the very first day you applied.
              </p>
              <p>
                Back pay arrives as a single deposit, usually within 30 to 60 days of your approval letter. After that, your regular monthly stipend takes over.
              </p>

              {/* ── Denied ────────────────────────────────────── */}
              <h2 id="denied-what-to-do">
                What to Do If You&rsquo;re Denied
              </h2>
              <p>
                A denial is hard news, but it isn&rsquo;t the end of the road. Families have a full year from the date of the decision letter to appeal, and many applications that were initially denied are approved on the second try.
              </p>
              <p>
                The first step is filing a Supplemental Claim using VA Form 20-0995. This lets you submit new evidence the VA didn&rsquo;t have the first time around, like updated medical records, a written statement from the veteran&rsquo;s physician, or documentation showing changes in the veteran&rsquo;s condition. Often a stronger paper trail is what makes the difference.
              </p>
              <p>
                If the Supplemental Claim is denied, you have two more options:
              </p>

            </div>

            <div className="rounded-xl bg-blue-50/50 border border-blue-100 px-6 py-5 my-6">
              <div className="space-y-4">
                {[
                  { title: "Higher-Level Review (VA Form 20-0996):", desc: "A senior VA reviewer takes a fresh look at the original decision. No new evidence is needed." },
                  { title: "Board Appeal:", desc: "Your case goes to a Veterans Law Judge for the most thorough review. This takes the longest but is also the most comprehensive option." },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 text-base text-gray-700 leading-relaxed">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="pt-1"><strong>{item.title}</strong> {item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="prose-editorial">
              <p>
                You don&rsquo;t have to navigate any of this alone. The VA Caregiver Support Line at (855)&nbsp;260-3274 can walk you through your options, and a Veterans Service Organization (VSO) can represent you for free if you&rsquo;d rather have someone advocate on your behalf. Whether you&rsquo;re filling out the application for the first time or waiting on a decision, take it one step at a time, and reach out for help when you need it.
              </p>

            </div>

            {/* FAQ card-style */}
            <div className="rounded-2xl bg-[#f0faf8] border border-[#d5efea] px-6 py-6 my-8 not-prose">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-full border-2 border-primary-300 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 id="faq" className="font-display text-2xl text-gray-900 tracking-[-0.01em]">
                  Frequently Asked Questions
                </h2>
              </div>
              <div className="space-y-3">
                {[
                  {
                    q: "How do I check my VA caregiver application status?",
                    a: "Call the Caregiver Support Line at (855) 260-3274, log in to your VA.gov account, or contact your local CSP team using the CSP Team Locator on VA.gov. Follow up every 2 to 3 weeks until you receive a decision.",
                  },
                  {
                    q: "How long does it take for the VA to approve a caregiver?",
                    a: "Most decisions are made within 90 days of a complete application. The full timeline, including back-end processing and the mailing of the approval letter, typically runs 3 to 5 months from submission to first payment.",
                  },
                  {
                    q: "How do I get approved for a VA caregiver?",
                    a: "Both the veteran and the caregiver must complete and submit VA Form 10-10CG. The veteran must have a service-connected disability rating of 70% or higher and need at least 6 months of personal care. After the application is submitted, the VA conducts a clinical assessment and makes a decision within 90 days.",
                  },
                  {
                    q: "What is the approval rate for the VA caregiver program?",
                    a: "Historical approval rates have ranged from about 40% to 60%. The strongest predictor of approval is documentation: applications with detailed clinical evidence of care needs are significantly more likely to be approved.",
                  },
                  {
                    q: "Is there back pay for the VA caregiver stipend?",
                    a: "Yes. Stipend payments are typically issued from the application\u2019s effective date, not the approval date. Families approved after a long processing time often receive a lump-sum payment covering the months between application and approval.",
                  },
                  {
                    q: "Can I appeal a VA caregiver denial?",
                    a: "Yes. Families have one year from the decision letter date to file a Supplemental Claim using VA Form 20-0995. If denied again, the next options are a Higher-Level Review or a Board Appeal.",
                  },
                  {
                    q: "Who qualifies as a VA caregiver?",
                    a: "The caregiver must be at least 18 years old, be a family member or someone the veteran considers family, live with the veteran full-time, and complete required caregiver training.",
                  },
                ].map((faq) => (
                  <details key={faq.q} className="group rounded-xl bg-white border border-gray-200">
                    <summary className="flex items-center justify-between cursor-pointer px-5 py-4 text-base font-medium text-gray-900 hover:text-primary-700 transition-colors">
                      {faq.q}
                      <svg
                        className="w-5 h-5 text-primary-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </summary>
                    <p className="px-5 pb-4 text-base text-gray-600 leading-relaxed">
                      {faq.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>


            {/* ── References ────────────────────────────────── */}
            <div className="mt-12 not-prose">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">References</h3>
              <div className="divide-y divide-primary-200">
                {[
                  { label: "VA Caregiver Support Program", href: "https://www.caregiver.va.gov" },
                  { label: "Department of Veterans Affairs", href: "https://www.va.gov" },
                  { label: "VA Form 10-10CG", href: "https://www.va.gov/vaforms/medical/pdf/10-10CG.pdf" },
                  { label: "VA Letters & Records", href: "https://www.va.gov/records/download-va-letters/" },
                  { label: "CSP Team Locator", href: "https://www.va.gov/find-locations" },
                ].map((ref) => (
                  <a
                    key={ref.label}
                    href={ref.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-primary-700 font-medium underline underline-offset-2 hover:text-primary-900 transition-colors py-3"
                  >
                    {ref.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Author card + Tags */}
            <div className="mt-12 pt-8 border-t border-gray-200 not-prose">
              <div className="flex items-start gap-4 mb-6">
                <img src="/images/for-providers/team/logan.jpg" alt="Dr. Logan DuBose" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                <div>
                  <Link href="/author/dr-logan-dubose" className="text-base font-semibold text-gray-900 hover:text-primary-600 transition-colors">Dr. Logan DuBose</Link>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">Dr. Logan DuBose is a MD and co-founder of Olera.care. He writes about dementia, Alzheimer&apos;s, and other age-related conditions. He is a Texas A&amp;M MD/MBA alum. Olera specializes in merging clinical practice with innovative solutions for the aging population.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <span className="text-sm text-gray-500">Home Care</span>
              </div>
            </div>
          </article>

          {/* Recommended */}
          {related && related.length > 0 && (
            <section className="mt-14 mb-16 not-prose">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Recommended</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {related.map((r) => {
                  const careType = (r.care_types as CareTypeId[])?.[0];
                  const label = careType ? CARE_TYPE_CONFIG[careType]?.label : null;
                  return (
                    <Link key={r.id} href={`/caregiver-support/${r.slug}`} className="group block">
                      {r.cover_image_url && (
                        <img src={r.cover_image_url} alt={r.title} className="w-full aspect-[3/2] object-cover rounded-xl mb-3 group-hover:opacity-90 transition-opacity" />
                      )}
                      {label && (
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 mb-1">{label}</p>
                      )}
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2 mb-1">{r.title}</h3>
                      {r.reading_time && (
                        <p className="text-xs text-gray-400">{r.reading_time}</p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Desktop TOC sidebar */}
        <aside className="hidden lg:block w-[220px] flex-shrink-0">
          <div className="sticky top-[96px] pt-4">
            <DesktopTableOfContents headings={HEADINGS} />
          </div>
        </aside>
      </div>
    </main>
  );
}

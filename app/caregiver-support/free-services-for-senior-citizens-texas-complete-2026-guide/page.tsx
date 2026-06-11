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

const TITLE = "Free Services for Senior Citizens in Texas: Complete 2026 Guide";
const DESCRIPTION =
  "Finding help for an aging parent shouldn\u2019t feel like a full-time job. We found free services in Texas for you.";
const CANONICAL = "https://olera.care/caregiver-support/free-services-for-senior-citizens-texas-complete-2026-guide";

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
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// ============================================================
// Reusable micro-components
// ============================================================

const CheckIcon = () => (
  <svg className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
  </svg>
);

function CheckList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-base text-gray-700 leading-relaxed">
          <CheckIcon />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ContactCard({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-gray-100 px-5 py-3.5 my-6 text-base">
      {rows.map((row, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="font-medium text-gray-500">{row.label}:</span>
          <span className="font-semibold text-gray-900">{row.value}</span>
        </span>
      ))}
    </div>
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
      <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <div className="text-base text-amber-900 leading-relaxed">{children}</div>
    </div>
  );
}

function SnapshotBox({ phone, phoneLabel, cost, qualifier }: { phone: string; phoneLabel: string; cost: string; qualifier?: string }) {
  return (
    <div className="not-prose my-5">
      <a href={`tel:${phone.replace(/[^0-9]/g, "")}`} className="flex items-center gap-2.5 rounded-xl bg-primary-100 text-gray-900 px-5 py-3 hover:bg-primary-200 transition-colors">
        <svg className="w-5 h-5 flex-shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
        <span className="text-base font-bold text-gray-900">Call {phoneLabel}</span>
        <span className="text-gray-400 text-base mx-1">&middot;</span>
        <svg className="w-4 h-4 flex-shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span className="text-base font-medium text-gray-900">{cost}</span>
        {qualifier && <>
          <span className="text-gray-400 text-base mx-1">&middot;</span>
          <svg className="w-4 h-4 flex-shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
          <span className="text-base font-medium text-gray-900">{qualifier}</span>
        </>}
      </a>
    </div>
  );
}

// ============================================================
// Headings for TOC (manually defined since we use JSX, not HTML)
// ============================================================

const HEADINGS: ArticleHeading[] = [
  { id: "where-to-start-2-1-1-texas", text: "Where to Start: 2-1-1 Texas", level: 2 },
  { id: "texas-long-term-care-ombudsman", text: "Texas Long-Term Care Ombudsman", level: 2 },
  { id: "texas-legal-services-for-seniors", text: "Texas Legal Services for Seniors", level: 2 },
  { id: "texas-ship-medicare-counseling", text: "Texas SHIP Medicare Counseling", level: 2 },
  { id: "senior-companion-program", text: "Senior Companion Program", level: 2 },
  { id: "meals-on-wheels-texas", text: "Meals on Wheels Texas", level: 2 },
  { id: "financial-help", text: "What If I Need Financial Help?", level: 2 },
  { id: "faq", text: "Frequently Asked Questions", level: 2 },
];

const READING_TIME = "12 min read";

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
  reviewedBy: { "@type": "Person", name: "Dr. Logan DuBose", jobTitle: "Co-founder & MD" },
  publisher: { "@type": "Organization", name: "Olera", url: "https://olera.care" },
  mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://olera.care" },
    { "@type": "ListItem", position: 2, name: "Caregiver Support", item: "https://olera.care/caregiver-support" },
    { "@type": "ListItem", position: 3, name: TITLE, item: CANONICAL },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "What free services are available for senior citizens in Texas?", acceptedAnswer: { "@type": "Answer", text: "Texas offers free legal advice (Texas Legal Hotline), Medicare counseling (SHIP), nursing home advocacy (Long-Term Care Ombudsman), companionship visits (Senior Companion Program), meal delivery (Meals on Wheels), and paid job training for seniors 55+ (SCSEP). Most have no income requirements. Start by calling 2-1-1 for a personalized referral." } },
    { "@type": "Question", name: "Is there really a $3,000 senior assistance program in Texas?", acceptedAnswer: { "@type": "Answer", text: "There is no single $3,000 program in Texas, despite what online searches suggest. The phrase usually refers to combined annual benefits from multiple programs \u2014 like SNAP food benefits, energy assistance, and Medicare savings programs. Total benefits across multiple programs can exceed $3,000 per year for qualifying seniors." } },
    { "@type": "Question", name: "What can senior citizens over 60 get for free in Texas?", acceptedAnswer: { "@type": "Answer", text: "Seniors 60+ can get free legal advice, Medicare counseling, nursing facility advocacy, companionship visits, and (with mobility-related need) meal delivery. With low income, they may also qualify for free utility help, food benefits, and medical coverage through Texas Medicaid." } },
    { "@type": "Question", name: "How do I apply for free services for seniors in Texas?", acceptedAnswer: { "@type": "Answer", text: "The fastest path is to call 2-1-1 Texas. The operator will ask a few questions about your situation and connect you to the specific local agencies that can help. Each program has its own application \u2014 there is no single \"senior services\" application in Texas." } },
    { "@type": "Question", name: "Are there free services for seniors who do not qualify for Medicaid?", acceptedAnswer: { "@type": "Answer", text: "Yes. The Long-Term Care Ombudsman, Texas Legal Hotline, SHIP Medicare counseling, and Senior Companion Program have no income requirements. Meals on Wheels and SCSEP have light or income-based eligibility but are not Medicaid-dependent." } },
    { "@type": "Question", name: "What does 2-1-1 Texas do?", acceptedAnswer: { "@type": "Answer", text: "2-1-1 Texas is a free 24/7 helpline that connects callers to local senior services, food assistance, utility help, transportation, legal aid, and government benefits in their county. One call replaces hours of searching online." } },
  ],
};

// ============================================================
// FAQ accordion data
// ============================================================

const FAQS = [
  { q: "What free services are available for senior citizens in Texas?", a: "Texas offers free legal advice (Texas Legal Hotline), Medicare counseling (SHIP), nursing home advocacy (Long-Term Care Ombudsman), companionship visits (Senior Companion Program), meal delivery (Meals on Wheels), and paid job training for seniors 55+ (SCSEP). Most have no income requirements. Start by calling 2-1-1 for a personalized referral." },
  { q: "Is there really a $3,000 senior assistance program in Texas?", a: "There is no single $3,000 program in Texas, despite what online searches suggest. The phrase usually refers to combined annual benefits from multiple programs \u2014 like SNAP food benefits, energy assistance, and Medicare savings programs. Total benefits across multiple programs can exceed $3,000 per year for qualifying seniors." },
  { q: "What can senior citizens over 60 get for free in Texas?", a: "Seniors 60+ can get free legal advice, Medicare counseling, nursing facility advocacy, companionship visits, and (with mobility-related need) meal delivery. With low income, they may also qualify for free utility help, food benefits, and medical coverage through Texas Medicaid." },
  { q: "How do I apply for free services for seniors in Texas?", a: "The fastest path is to call 2-1-1 Texas. The operator will ask a few questions about your situation and connect you to the specific local agencies that can help. Each program has its own application \u2014 there is no single \u201Csenior services\u201D application in Texas." },
  { q: "Are there free services for seniors who do not qualify for Medicaid?", a: "Yes. The Long-Term Care Ombudsman, Texas Legal Hotline, SHIP Medicare counseling, and Senior Companion Program have no income requirements. Meals on Wheels and SCSEP have light or income-based eligibility but are not Medicaid-dependent." },
  { q: "What does 2-1-1 Texas do?", a: "2-1-1 Texas is a free 24/7 helpline that connects callers to local senior services, food assistance, utility help, transportation, legal aid, and government benefits in their county. One call replaces hours of searching online." },
];

// ============================================================
// Page
// ============================================================

export default async function FreeServicesForSeniorsPage() {
  const supabase = await createClient();
  // During build without Supabase configured, related will be null
  const { data: related } = supabase
    ? await supabase
        .from("content_articles")
        .select("id, slug, title, cover_image_url, care_types, reading_time")
        .eq("status", "published")
        .not("published_at", "is", null)
        .containedBy("care_types", ["home-care"])
        .order("published_at", { ascending: false })
        .limit(3)
    : { data: null };

  return (
    <main className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="max-w-[1100px] mx-auto px-5 lg:flex lg:gap-16">
        <div className="flex-1 max-w-[680px]">

          {/* ─── Header ─── */}
          <header className="pt-8 md:pt-12">
            <Link href="/caregiver-support" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-6">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
              Caregiver Support
            </Link>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 mb-3">Senior Care</p>
            <h1 className="font-display text-display-sm md:text-display-md text-gray-900 tracking-[-0.02em] mb-3">{TITLE}</h1>
            <p className="text-lg text-gray-500 mb-6">{DESCRIPTION}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 mb-6">
              <span><span className="text-gray-400">Published by </span><span className="font-medium text-gray-700">Olera team</span></span>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2">
                <img src="/images/for-providers/team/logan.jpg" alt="Dr. Logan DuBose" className="w-7 h-7 rounded-full object-cover" />
                <span><span className="text-gray-400">Verified by </span><Link href="/author/logan-dubose" className="font-medium text-gray-700 hover:text-primary-600 transition-colors">Dr. Logan DuBose</Link></span>
              </div>
              <span className="text-gray-300">|</span>
              <span className="text-gray-400">{READING_TIME}</span>
              <span className="text-gray-300">|</span>
              <ShareButton />
            </div>

            {/* Cover image */}
            <figure className="mb-10">
              <img
                src="/images/free-services-seniors-texas-cover.jpg"
                alt="Senior couple reviewing paperwork together at home"
                className="w-full aspect-[2/1] object-cover rounded-2xl"
              />
            </figure>
          </header>

          {/* ─── Article ─── */}
          <article className="prose-editorial">
            <MobileTableOfContents headings={HEADINGS} />

            {/* ── Quick Summary ── */}
            <div className="rounded-xl bg-[#f0faf8] border border-[#d5efea] px-5 pt-3 pb-3 mb-8 not-prose">
              <h2 className="font-display text-lg font-semibold text-gray-900 tracking-tight mb-2">Quick Summary</h2>
              <ul className="space-y-1.5">
                {[
                  <>Six free statewide services for seniors, most with no income requirements</>,
                  <>Includes legal advice, Medicare counseling, meal delivery, companionship, and job training</>,
                  <>Start with 2-1-1 Texas if you are not sure where to begin</>,
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3.5 text-base text-gray-600 leading-relaxed">
                    <svg className="w-5 h-5 text-[#5bb5a2] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p>Most Texas seniors qualify for more help than they realize. The state offers free services that don&apos;t require Medicaid, don&apos;t require low income, and don&apos;t require a long application &mdash; just a phone call.</p>

            <p>This guide covers the six core free services available to Texas seniors in 2026, who qualifies, and exactly how to access each one.</p>

            {/* ═══════════════════════════════════════════════════ */}
            {/* 1. 2-1-1 Texas                                     */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="not-prose flex items-center gap-3 mt-10 mb-0">
              <SectionIcon>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
              </SectionIcon>
              <h2 id="where-to-start-2-1-1-texas" className="scroll-mt-24 !mt-0 !mb-0">Where to Start: 2-1-1 Texas</h2>
            </div>
            <p>Before anything else, save this number: <strong>2-1-1</strong>.</p>
            <p>2-1-1 Texas is a free, confidential helpline that connects you to every senior service in your area. One call gets you routed to the right local agency for legal help, food delivery, transportation, energy assistance, or anything else.</p>
            <div className="not-prose rounded-xl bg-primary-50/50 border border-primary-100 px-5 py-3 my-4">
              <p className="text-base font-semibold text-gray-900 mb-2">How to use it</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  <><strong>Dial 2-1-1</strong> from any phone in Texas</>,
                  "Available 24/7",
                  "Free and confidential",
                  "Operators speak English and Spanish",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-base text-gray-700 leading-relaxed">
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p>If you read nothing else in this guide, write down <strong>2-1-1</strong> and keep it somewhere visible. It is the single best starting point for navigating Texas senior services.</p>

            {/* ═══════════════════════════════════════════════════ */}
            {/* 2. Long-Term Care Ombudsman (white bg)             */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="not-prose pt-10 pb-2 border-t border-gray-200 mt-10">
            <div className="flex items-center gap-3 mb-0">
              <SectionIcon>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              </SectionIcon>
              <h2 id="texas-long-term-care-ombudsman" className="scroll-mt-24 !mt-0 !mb-0">Texas Long-Term Care Ombudsman</h2>
            </div>
            </div>
            <SnapshotBox phone="(800) 252-2412" phoneLabel="(800) 252-2412" cost="Free" qualifier="No income requirement" />
            <p>If your loved one is in a nursing facility or assisted living community and something doesn&apos;t feel right, you don&apos;t have to handle it alone. The Long-Term Care Ombudsman is a free advocate whose only job is to look out for residents.</p>
            <h3>How they help</h3>
            <p>Ombudsmen listen to your concerns, explain residents&apos; rights, and help resolve issues with quality of care. They investigate complaints, connect families to long-term care information, and work to protect residents&apos; health, safety, and well-being.</p>
            <h3>Who qualifies</h3>
            <p>Anyone can call on a resident&apos;s behalf. There is no cost, no income requirement, and no paperwork. Family members, friends, or residents themselves can reach out.</p>
            <p>Ombudsmen are independent, which means they don&apos;t work for the facility. Anything you share with them stays confidential. <Link href="/benefits/texas/ltc-ombudsman" className="text-primary-700 underline underline-offset-2 hover:text-primary-900 font-medium">Learn more about this program &rarr;</Link></p>

            {/* ═══════════════════════════════════════════════════ */}
            {/* 3. Legal Services (gray bg)                        */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="not-prose pt-10 pb-2 border-t border-gray-200 mt-10">
            <div className="flex items-center gap-3 mb-0">
              <SectionIcon>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" /></svg>
              </SectionIcon>
              <h2 id="texas-legal-services-for-seniors" className="scroll-mt-24 !mt-0 !mb-0">Texas Legal Services for Seniors</h2>
            </div>
            </div>
            <SnapshotBox phone="(800) 622-2520" phoneLabel="(800) 622-2520, ext. 3" cost="Free" qualifier="No income requirement" />
            <p>Legal questions don&apos;t always wait for business hours, and hiring an attorney isn&apos;t always an option. The Legal Hotline at the Texas Legal Services Center connects you with a real attorney who can answer your questions over the phone, at no cost.</p>
            <h3>What they help with</h3>
            <p>Attorneys on the hotline can walk you through questions about Medicaid and Medicare, powers of attorney and advance directives, long-term care planning, homeownership and property issues, and debt collection or consumer concerns.</p>
            <h3>Who qualifies</h3>
            <p>Texans 60 and older can call about any covered topic. Anyone on Medicare, regardless of age, can get help with Medicaid, Medicare, and long-term care questions.</p>
            <p>Think of it like a free first consultation with an elder law attorney. They won&apos;t represent you in court, but they will help you understand whether you have a real legal issue and what to do next. <Link href="/benefits/texas/legal-aid-seniors-aaa" className="text-primary-700 underline underline-offset-2 hover:text-primary-900 font-medium">Learn more about this program &rarr;</Link></p>

            {/* ═══════════════════════════════════════════════════ */}
            {/* 4. SHIP Medicare Counseling (white bg)              */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="not-prose pt-10 pb-2 border-t border-gray-200 mt-10">
            <div className="flex items-center gap-3 mb-0">
              <SectionIcon>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
              </SectionIcon>
              <h2 id="texas-ship-medicare-counseling" className="scroll-mt-24 !mt-0 !mb-0">Texas SHIP Medicare Counseling</h2>
            </div>
            </div>
            <SnapshotBox phone="(800) 252-9240" phoneLabel="(800) 252-9240" cost="Free" qualifier="No income requirement" />
            <p>Medicare can feel like a maze, especially when every commercial and mailer is trying to sell you something different. Texas SHIP (State Health Insurance Assistance Program) is a free, one-on-one counseling service that helps you make sense of it all, with no sales pitch attached.</p>
            <h3>What SHIP counselors help with</h3>
            <p>SHIP counselors walk you through Original Medicare eligibility, enrollment, and benefits. They compare Medicare Advantage (Part C) and Prescription Drug (Part D) plans, explain Medigap policies, help you file complaints and appeals, find Medicare savings programs, and answer questions about long-term care insurance.</p>
            <h3>Who qualifies</h3>
            <p>Any Medicare beneficiary or their representative, regardless of age. This includes people 65 and older and anyone on Medicare due to a disability.</p>
            <p>Insurance brokers earn commissions on the plans they sell. SHIP counselors don&apos;t. If you want a recommendation that&apos;s actually based on what&apos;s best for you and your family, <strong>call SHIP first</strong>. <Link href="/benefits/texas/ship-medicare-counseling" className="text-primary-700 underline underline-offset-2 hover:text-primary-900 font-medium">Learn more about SHIP Medicare Counseling &rarr;</Link></p>

            {/* ═══════════════════════════════════════════════════ */}
            {/* 5. Senior Companion Program (gray bg)               */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="not-prose pt-10 pb-2 border-t border-gray-200 mt-10">
            <div className="flex items-center gap-3 mb-0">
              <SectionIcon>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
              </SectionIcon>
              <h2 id="senior-companion-program" className="scroll-mt-24 !mt-0 !mb-0">Senior Companion Program</h2>
            </div>
            </div>
            <SnapshotBox phone="211" phoneLabel="2-1-1 Texas" cost="Free" qualifier="No income requirement" />
            <p>Sometimes what an aging parent needs most isn&apos;t medical care or financial help. It&apos;s company. The Senior Companion Program matches volunteers 55 and older with seniors who could use a little extra support at home, free of charge. The goal is simple: help older adults stay independent, feel less alone, and remain in the homes they love.</p>
            <h3>What companions help with</h3>
            <p>Companions bring regular visits, conversation, and real friendship. They lend a hand with light meal prep, help with shopping, and provide rides to medical appointments and errands. Just as importantly, they give family caregivers a much-needed break.</p>
            <h3>Who qualifies</h3>
            <p>Texas residents 60 and older who are homebound, socially isolated, or need a little support to keep living at home.</p>
            <p><strong>How long it takes:</strong> Two to four weeks to be matched with a volunteer.</p>

            {/* ═══════════════════════════════════════════════════ */}
            {/* 6. Meals on Wheels (white bg)                       */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="not-prose pt-10 pb-2 border-t border-gray-200 mt-10">
            <div className="flex items-center gap-3 mb-0">
              <SectionIcon>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265z" /></svg>
              </SectionIcon>
              <h2 id="meals-on-wheels-texas" className="scroll-mt-24 !mt-0 !mb-0">Meals on Wheels Texas</h2>
            </div>
            </div>
            <SnapshotBox phone="211" phoneLabel="your local provider" cost="Free or low-cost" />
            <p>For many seniors, the person delivering their meal is also the only person they see all day. Meals on Wheels Texas brings free or low-cost meals to older adults and people with disabilities across the state, but the program is about more than food. Each delivery comes with a friendly check-in, a familiar face, and in some areas, help with pet food, rides to appointments, and small home repairs.</p>
            <h3>What&apos;s included</h3>
            <p>Participants receive hot, nutritious meals that are often dietitian-designed, along with a daily safety check during each visit. Drivers stay for a moment of conversation, and in some areas the program extends to pet food, medical transportation, and light home repairs.</p>
            <h3>Who qualifies</h3>
            <p>Adults 60 and older with mobility challenges that make it hard to shop, prepare meals, or stay connected with others. Specific eligibility varies by local provider.</p>
            <p><strong>A note on waitlists:</strong> Demand is high, and most areas have a wait.</p>
            <div className="not-prose my-6 rounded-xl bg-amber-50 border border-amber-200 overflow-hidden">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-amber-300">
                    <th className="text-left px-5 py-3 font-semibold text-amber-900 text-xs uppercase tracking-wide">County</th>
                    <th className="text-left px-5 py-3 font-semibold text-amber-900 text-xs uppercase tracking-wide">Wait Time</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["San Antonio", "Up to 8 months"],
                    ["Waco", "About 400 people waiting"],
                    ["Rural Capital Area", "Up to 4 months"],
                    ["Statewide average", "4 months to 2+ years"],
                  ].map(([city, wait], i) => (
                    <tr key={i} className="border-b border-amber-200 last:border-b-0">
                      <td className="px-5 py-3 font-semibold text-amber-950">{city}</td>
                      <td className="px-5 py-3 text-amber-900">{wait}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>If your loved one needs meals right away, call <strong>2-1-1</strong>. They can connect you to local food banks and emergency meal programs while you wait for Meals on Wheels.</p>
            <p><strong>What you&apos;ll need to apply:</strong> name, address, phone number, date of birth, Social Security number, doctor&apos;s contact info, and an emergency contact. <Link href="/benefits/texas/meals-on-wheels" className="text-primary-700 underline underline-offset-2 hover:text-primary-900 font-medium">Learn more about Meals on Wheels &rarr;</Link></p>

            {/* Closing line */}
            <div className="not-prose pt-10 pb-2 border-t border-gray-200 mt-10" />
            <p>Caring for an aging loved one is hard enough without spending hours searching for help that may or may not exist. The six free services in this guide are available to Texas families right now, with no Medicaid card, no lengthy application, and no cost. The hardest part is usually just knowing they exist. The next part is picking up the phone.</p>

            {/* ═══════════════════════════════════════════════════ */}
            {/* 8. Financial Help                                  */}
            {/* ═══════════════════════════════════════════════════ */}
            <h2 id="financial-help" className="scroll-mt-24">What If I Need Financial Help, Not Just Free Services?</h2>
            <p>This guide covers free services Texas seniors can access without complicated eligibility. If you&apos;re also looking for help paying for medical care, food, utilities, or long-term care, Texas has separate financial assistance programs:</p>
            <div className="not-prose my-6 space-y-2">
              {[
                { title: "Texas Medicaid for Elderly & Disabled (MEPD)", desc: "Health coverage and long-term care for low-income seniors.", href: "/texas/texas-medicaid-eligibility-seniors-2026" },
                { title: "STAR+PLUS Waiver", desc: "Medicaid waiver for home and community-based care.", href: "/texas/star-plus-waiver-texas-complete-guide" },
                { title: "SNAP Food Benefits", desc: "Monthly grocery support. Seniors can apply through the simplified TSAP program.", href: "/benefits/texas/snap" },
                { title: "Energy Assistance (CEAP & Weatherization)", desc: "Help with electric, gas, and home insulation costs.", href: "/benefits" },
                { title: "Medicare Savings Programs", desc: "Help paying Medicare premiums and deductibles.", href: "/benefits" },
              ].map((prog) => (
                <Link key={prog.title} href={prog.href} className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 hover:border-primary-300 hover:bg-primary-50/30 transition-all group">
                  <svg className="w-4 h-4 text-primary-500 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                  <div>
                    <span className="text-base font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{prog.title}</span>
                    <p className="text-base text-gray-500">{prog.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
            <p>For a personalized list of every program your loved one may qualify for, try the <Link href="/benefits" className="text-primary-700 underline underline-offset-2 hover:text-primary-900 font-medium">Olera Benefits Finder</Link>.</p>


            {/* ═══════════════════════════════════════════════════ */}
            {/* 10. FAQ                                            */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="not-prose my-10 rounded-2xl bg-[#f0faf8] border border-[#d5efea] px-8 py-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary-300 text-primary-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
                </div>
                <h2 id="faq" className="scroll-mt-24 !mt-0 !mb-0 text-lg font-semibold text-gray-900">Frequently Asked Questions</h2>
              </div>
              <div className="space-y-3">
                {FAQS.map((faq, i) => (
                  <details key={i} className="group rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer select-none text-base font-medium text-gray-900 hover:bg-gray-50/50 transition-colors">
                      {faq.q}
                      <svg className="w-5 h-5 text-primary-500 flex-shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="px-5 pb-4 text-base text-gray-600 leading-relaxed">{faq.a}</div>
                  </details>
                ))}
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════ */}
            {/* CTA + Footer                                       */}
            {/* ═══════════════════════════════════════════════════ */}

            <h3>References</h3>
            <div className="not-prose space-y-4 my-4">
              <a href="https://hhs.texas.gov" target="_blank" rel="noopener noreferrer" className="block text-primary-700 font-medium underline underline-offset-2 hover:text-primary-900 transition-colors">Texas Health and Human Services</a>
              <a href="https://ltco.texas.gov" target="_blank" rel="noopener noreferrer" className="block text-primary-700 font-medium underline underline-offset-2 hover:text-primary-900 transition-colors">Texas Long-Term Care Ombudsman</a>
              <a href="https://tlsc.org/seniors" target="_blank" rel="noopener noreferrer" className="block text-primary-700 font-medium underline underline-offset-2 hover:text-primary-900 transition-colors">Texas Legal Services Center</a>
              <a href="https://twc.texas.gov" target="_blank" rel="noopener noreferrer" className="block text-primary-700 font-medium underline underline-offset-2 hover:text-primary-900 transition-colors">Texas Workforce Commission</a>
              <p className="text-primary-700 font-medium">AmeriCorps Seniors</p>
              <a href="https://mealsonwheelstexas.org" target="_blank" rel="noopener noreferrer" className="block text-primary-700 font-medium underline underline-offset-2 hover:text-primary-900 transition-colors">Meals on Wheels Texas</a>
            </div>

            {/* Author card + Tags */}
            <div className="mt-12 pt-8 border-t border-gray-200 not-prose">
              <div className="flex items-start gap-4 mb-6">
                <img src="/images/for-providers/team/logan.jpg" alt="Dr. Logan DuBose" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                <div>
                  <Link href="/author/logan-dubose" className="text-base font-semibold text-gray-900 hover:text-primary-600 transition-colors">Dr. Logan DuBose</Link>
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

      <div className="pb-16" />
    </main>
  );
}

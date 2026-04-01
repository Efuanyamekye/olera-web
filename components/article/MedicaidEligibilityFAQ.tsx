"use client";

import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "What is the income limit for Medicaid in Texas for seniors in 2026?",
    answer:
      "The income limit for most senior Medicaid programs in Texas is <strong>$2,829 per month</strong> for a single applicant in 2026. This includes Social Security, pension income, and other regular payments. Married couples have different limits depending on which program and whether one or both spouses are applying.",
  },
  {
    question: "Can I have a house and still qualify for Medicaid in Texas?",
    answer:
      "<strong>Yes.</strong> Your primary home is not counted as an asset as long as you or your spouse lives in it. Owning a home does not disqualify you from Medicaid in Texas.",
  },
  {
    question: "What counts as an asset for Medicaid in Texas?",
    answer:
      "Medicaid counts bank accounts, savings, investments, and most property you own beyond your primary home and one vehicle. Cash value of life insurance over $1,500 also counts. Personal belongings, household furniture, and prepaid funeral plans <strong>do not</strong> count.",
  },
  {
    question: "How do I apply for Medicaid in Texas if I am over the income limit?",
    answer:
      "You have two options. If you are slightly over the limit, a <strong>spend-down</strong> lets you deduct medical expenses until your countable income falls below the threshold. If you are significantly over the limit, a <strong>Miller Trust</strong> (Qualified Income Trust) can redirect excess income so Medicaid ignores it. An elder law attorney can help you set one up.",
  },
  {
    question: "How long does it take to get approved for Medicaid in Texas?",
    answer:
      "Most applications take <strong>45 to 90 days</strong>. Having all your documents ready when you apply is the single biggest thing you can do to speed up the process. You can check your application status at <a href='https://www.yourtexasbenefits.com' target='_blank' rel='noopener noreferrer' class='text-primary-600 underline'>YourTexasBenefits.com</a> or by calling <strong>211</strong>.",
  },
];

export default function MedicaidEligibilityFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index);
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer.replace(/<[^>]*>/g, ""),
      },
    })),
  };

  return (
    <div className="my-12 not-prose rounded-2xl bg-primary-25 border border-primary-100 p-6 sm:p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="flex items-center gap-3 mb-6">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 flex-shrink-0">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary-600"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <h2 className="text-xl font-bold text-gray-900">
          Frequently Asked Questions
        </h2>
      </div>

      <div className="space-y-3">
        {FAQS.map((faq, i) => (
          <div key={i} className="rounded-xl bg-white border border-primary-100 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
            >
              <span className="text-base font-semibold text-gray-900">
                {faq.question}
              </span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-primary-500 flex-shrink-0 transition-transform duration-200 ${
                  openIndex === i ? "rotate-180" : ""
                }`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div
              className={`grid transition-all duration-200 ease-in-out ${
                openIndex === i
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div
                  className="px-6 pb-5 text-sm text-gray-600 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: faq.answer }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

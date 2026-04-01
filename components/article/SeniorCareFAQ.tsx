"use client";

import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "What happens to my house if I go on Medicaid in Texas?",
    answer:
      "Your house is protected while you are alive. Medicaid will not force you to sell it. However, after you pass away, Texas can make a claim against your estate to recover what Medicaid paid for your care. This is called estate recovery. There are legal ways to protect your home from this process, and an elder law attorney can help you plan ahead.",
  },
  {
    question: "Can I pay for nursing home care with just Social Security in Texas?",
    answer:
      "Social Security alone typically does not cover nursing home costs in Texas. The average nursing home runs <strong>$8,500 a month</strong>, while the average Social Security benefit is around <strong>$1,900</strong>. Most families use Social Security as a contribution toward care costs and rely on Medicaid to cover the rest once they qualify.",
  },
  {
    question: "How much does Medicaid pay for assisted living in Texas?",
    answer:
      "Texas Medicaid does not cover traditional assisted living facilities. It covers nursing home care and home and community based services through programs like <strong>STAR+PLUS</strong>. If your loved one needs assisted living, there are limited waiver programs that may help, but availability depends on where you live and waitlist times can be long.",
  },
  {
    question: "Is there a senior assistance program that covers $3,000 a month in Texas?",
    answer:
      "Yes. <strong>STAR+PLUS</strong> is Texas Medicaid's managed care program for seniors and people with disabilities. Depending on your level of need, it can cover home care, personal assistance, adult day care, and other services that can easily exceed $3,000 in monthly value. Eligibility is based on income, assets, and medical need.",
  },
  {
    question: "Can a family member get paid to care for me in Texas?",
    answer:
      "Yes, in some cases. Through the <strong>Consumer Directed Services</strong> option under STAR+PLUS, you can choose a family member as your paid caregiver. There are some restrictions: a spouse cannot be paid, and the family member must meet basic requirements. It is one of the most underused benefits available to Texas families.",
  },
  {
    question: "How long is the waitlist for STAR+PLUS in Texas?",
    answer:
      "STAR+PLUS itself does not have a waitlist for nursing home coverage. However, the home and community based services portion can have waiting periods depending on your area and the specific services needed. This is why applying as early as possible matters, even if your loved one does not need care right away.",
  },
];

export default function SeniorCareFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index);
  }

  return (
    <div className="my-8 not-prose">
      <div className="flex items-center gap-2 mb-4">
        <svg
          width="20"
          height="20"
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
        <h2 className="text-lg font-semibold text-gray-900">
          Frequently Asked Questions
        </h2>
      </div>

      <div className="space-y-2">
        {FAQS.map((faq, i) => (
          <div key={i} className="rounded-xl bg-primary-25 border border-primary-100 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
            >
              <span className="text-sm font-semibold text-gray-900">
                {faq.question}
              </span>
              <svg
                width="18"
                height="18"
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
                  className="px-5 pb-4 text-sm text-gray-600 leading-relaxed"
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

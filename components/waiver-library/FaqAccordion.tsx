"use client";

import { useState } from "react";
import Link from "next/link";

interface FaqItem {
  question: string;
  answer: string;
}

function renderAnswer(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <Link key={i} href={match[2]} className="text-primary-600 font-semibold underline hover:text-primary-700">
          {match[1]}
        </Link>
      );
    }
    return part;
  });
}

export function FaqAccordion({ faqs, columns = 2, multiOpen }: { faqs: FaqItem[]; columns?: 1 | 2; multiOpen?: boolean }) {
  // Default: multiOpen is true for 2-column layout to avoid blank space issues
  const isMultiOpen = multiOpen ?? columns === 2;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    if (isMultiOpen) {
      setOpenSet((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
    } else {
      setOpenIndex(openIndex === i ? null : i);
    }
  }

  return (
    <div className={columns === 2 ? "md:columns-2 gap-2 space-y-2" : "grid gap-2 grid-cols-1"}>
      {faqs.map((faq, i) => {
        const isOpen = isMultiOpen ? openSet.has(i) : openIndex === i;
        return (
          <div key={i} className="bg-primary-50 rounded-xl border border-primary-100 shadow-[0_2px_8px_rgba(77,155,150,0.1),0_1px_3px_rgba(77,155,150,0.08)] overflow-hidden break-inside-avoid">
            <button
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-primary-100/40 transition-colors"
            >
              <span className="font-semibold text-gray-900 pr-4">{faq.question}</span>
              <svg
                className={`w-5 h-5 text-primary-500 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{ maxHeight: isOpen ? "500px" : "0px" }}
            >
              <p className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{renderAnswer(faq.answer)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

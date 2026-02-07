"use client";

import { useState } from "react";

interface QAEntry {
  question: string;
  answer: string;
}

interface QASectionProps {
  providerName: string;
  questions: QAEntry[];
  suggestedQuestions?: string[];
}

// Mock community members who asked the questions
const MOCK_ASKERS = [
  { name: "Margaret T.", initials: "MT", timeAgo: "2 weeks ago" },
  { name: "Robert K.", initials: "RK", timeAgo: "1 month ago" },
  { name: "Linda W.", initials: "LW", timeAgo: "3 weeks ago" },
  { name: "James P.", initials: "JP", timeAgo: "1 month ago" },
  { name: "Susan M.", initials: "SM", timeAgo: "5 days ago" },
];

/**
 * QASection V2 - Premium, minimal refinements
 *
 * Changes from V1:
 * - Cards: bg-gray-50 → bg-white with subtle border and shadow
 * - Typography: arbitrary values → standard Tailwind scale
 * - Button: added shadow-sm, rounded-lg
 * - Chips: bg-white → bg-gray-50 with hover state
 */
export default function QASectionV2({
  providerName,
  questions,
  suggestedQuestions = [
    "When can a caregiver be available?",
    "Do you have shift minimums?",
    "What are the per-hour costs?",
  ],
}: QASectionProps) {
  const [inputValue, setInputValue] = useState("");
  const [showAll, setShowAll] = useState(false);

  const visibleQuestions = showAll ? questions : questions.slice(0, 2);
  const hasMore = questions.length > 2;

  return (
    <div>
      {/* ── Section Header ── */}
      <div className="flex items-center gap-2.5 mb-1">
        <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
        <h2 className="text-xl font-semibold text-gray-900">
          Questions & Answers
        </h2>
      </div>
      <p className="text-base text-gray-500 mb-6">
        {questions.length} {questions.length === 1 ? "question" : "questions"} answered about {providerName}
      </p>

      {/* ── Ask a Question Prompt (top) ── V2: elevated card */}
      <div className="bg-white rounded-xl p-5 mb-6 border border-gray-100 shadow-xs">
        <p className="text-base font-medium text-gray-900 mb-3">
          Have a question about {providerName}?
        </p>

        {/* Input row with avatar placeholder */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a question..."
              className="w-full pl-4 pr-20 py-3 text-base text-gray-900 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 focus:bg-white transition-all"
            />
            {/* V2: rounded-lg, shadow-sm */}
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 text-sm font-semibold text-white bg-primary-600 rounded-lg shadow-sm hover:bg-primary-700 transition-colors">
              Ask
            </button>
          </div>
        </div>

        {/* Suggested questions - V2: bg-gray-50 with hover */}
        {suggestedQuestions.length > 0 && (
          <div className="mt-3 ml-11">
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.slice(0, 3).map((q) => (
                <button
                  key={q}
                  onClick={() => setInputValue(q)}
                  className="text-sm text-gray-600 hover:text-primary-700 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 hover:border-gray-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Conversation Threads (2-column grid) ── V2: elevated cards */}
      {visibleQuestions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleQuestions.map((qa, index) => {
            const asker = MOCK_ASKERS[index % MOCK_ASKERS.length];
            return (
              // V2: bg-white with border and shadow
              <div key={index} className="bg-white rounded-xl p-5 flex flex-col border border-gray-100 shadow-xs">
                {/* Questioner */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-semibold text-primary-700">
                      {asker.initials}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {asker.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {asker.timeAgo}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed mt-1">
                      {qa.question}
                    </p>
                  </div>
                </div>

                {/* Provider Reply */}
                {qa.answer && (
                  <div className="flex items-start gap-3 mt-4 ml-11">
                    <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary-700">
                          {providerName}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-700">
                          Provider
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed mt-1">
                        {qa.answer.length > 150
                          ? qa.answer.slice(0, 150).trimEnd() + "..."
                          : qa.answer}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Show More ── */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 text-sm font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1.5 transition-colors"
        >
          {showAll ? "Show fewer questions" : `View all ${questions.length} questions`}
          <svg
            className={`w-4 h-4 transition-transform ${showAll ? "rotate-180" : ""}`}
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
        </button>
      )}
    </div>
  );
}

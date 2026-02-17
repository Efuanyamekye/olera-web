"use client";

import { useState } from "react";

interface QAEntry {
  question: string;
  answer: string;
}

interface QASectionProps {
  providerName: string;
  providerImage?: string;
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
  providerImage,
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
      <h2 className="text-2xl font-bold text-gray-900 mb-1">
        Questions & Answers
      </h2>
      <p className="text-base text-gray-500 mb-6">
        {questions.length} {questions.length === 1 ? "question" : "questions"} answered about {providerName}
      </p>

      {/* ── Ask a Question Prompt (top) ── Compact, unified design */}
      <div className="bg-white rounded-xl p-5 mb-6 border border-gray-100 shadow-xs">
        <p className="text-base font-medium text-gray-900 mb-4">
          Have a question about {providerName}?
        </p>

        {/* Unified input container - avatar, input, and button in one cohesive row */}
        {/* Active state when focused OR when there's text */}
        <div className={`flex items-center gap-3 p-1.5 border rounded-xl transition-all focus-within:ring-2 focus-within:ring-primary-100 focus-within:border-primary-300 focus-within:bg-white ${
          inputValue.trim()
            ? "bg-white border-primary-300 ring-2 ring-primary-100"
            : "bg-gray-50 border-gray-200"
        }`}>
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 ml-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>

          {/* Input */}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 py-2 text-base text-gray-900 placeholder-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0"
          />

          {/* Ask button - height matches container */}
          <button className="px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors flex-shrink-0">
            Ask
          </button>
        </div>

        {/* Suggested questions */}
        {suggestedQuestions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
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

                {/* Provider Reply - clean separation without awkward indent */}
                {qa.answer && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-start gap-3">
                      {/* Provider avatar/image */}
                      {providerImage ? (
                        <img
                          src={providerImage}
                          alt={providerName}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-700">
                            {providerName.charAt(0)}
                          </span>
                        </div>
                      )}
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

"use client";

import { useState, useEffect, useCallback } from "react";

interface QAEntry {
  id?: string;
  question: string;
  answer?: string | null;
  asker_name?: string;
  status?: "pending" | "approved" | "answered";
  created_at?: string;
  answered_at?: string;
}

interface QASectionProps {
  providerId: string;
  providerName: string;
  providerImage?: string;
  questions?: QAEntry[];
  suggestedQuestions?: string[];
}

// Format relative time
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export default function QASectionV2({
  providerId,
  providerName,
  providerImage,
  questions: initialQuestions = [],
  suggestedQuestions = [
    "When can a caregiver be available?",
    "Do you have shift minimums?",
    "What are the per-hour costs?",
    "Do caregivers give meds?",
  ],
}: QASectionProps) {
  const [inputValue, setInputValue] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [questions, setQuestions] = useState<QAEntry[]>(initialQuestions);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error" | "auth_required">("idle");

  // Fetch public questions on mount
  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/questions?provider_id=${encodeURIComponent(providerId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.questions?.length > 0) {
          setQuestions(data.questions);
        }
      }
    } catch {
      // Silently fail — questions are non-critical
    }
  }, [providerId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleSubmit = async () => {
    if (!inputValue.trim() || submitting) return;

    setSubmitting(true);
    setSubmitStatus("idle");

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, question: inputValue.trim() }),
      });

      if (res.status === 401) {
        setSubmitStatus("auth_required");
        return;
      }

      if (!res.ok) {
        setSubmitStatus("error");
        return;
      }

      const data = await res.json();
      // Add the new question to the top of the list
      if (data.question) {
        setQuestions((prev) => [data.question, ...prev]);
      }

      setInputValue("");
      setSubmitStatus("success");
      setTimeout(() => setSubmitStatus("idle"), 4000);
    } catch {
      setSubmitStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleQuestions = showAll ? questions : questions.slice(0, 3);
  const hasMore = questions.length > 3;
  const hasQuestions = questions.length > 0;
  const answeredCount = questions.filter((q) => q.status === "answered" || q.answer).length;
  const pendingCount = questions.filter((q) => q.status === "pending" && !q.answer).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-display font-bold text-gray-900 tracking-tight">
            Questions & Answers
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {hasQuestions
              ? `${answeredCount} answered${pendingCount > 0 ? ` · ${pendingCount} awaiting response` : ""}`
              : `Ask ${providerName} a question`}
          </p>
        </div>
      </div>

      {/* Ask a question form */}
      <div className="bg-vanilla-50/50 rounded-2xl border border-warm-100/60 p-5 mb-6">
        {/* Suggested pills */}
        {suggestedQuestions.length > 0 && !inputValue && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5">Suggested</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => setInputValue(q)}
                  className="text-[13px] text-gray-600 px-3.5 py-2 bg-white border border-gray-200 rounded-full hover:border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Textarea */}
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your question..."
          rows={3}
          maxLength={1000}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300 transition-all"
        />

        {/* Submit row */}
        <div className="flex items-center justify-between mt-3 gap-4">
          <div className="text-sm flex-1 min-w-0">
            {submitStatus === "success" && (
              <span className="text-primary-600 font-medium">Question posted! It will appear below.</span>
            )}
            {submitStatus === "error" && (
              <span className="text-red-600">Failed to submit. Please try again.</span>
            )}
            {submitStatus === "auth_required" && (
              <span className="text-amber-600">Please sign in to ask a question.</span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim() || submitting}
            className="shrink-0 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-b from-primary-500 to-primary-600 rounded-full shadow-sm hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {submitting ? "Posting..." : "Post Question"}
          </button>
        </div>
      </div>

      {/* Questions list */}
      {hasQuestions ? (
        <div className="space-y-0">
          {visibleQuestions.map((qa, index) => {
            const isAnswered = qa.status === "answered" || !!qa.answer;
            const isPending = !isAnswered;

            return (
              <div
                key={qa.id || index}
                className={`py-5 ${index > 0 ? "border-t border-gray-100" : ""}`}
              >
                {/* Question */}
                <div className="flex items-start gap-3">
                  {/* Asker avatar */}
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-gray-400">
                      {qa.asker_name ? qa.asker_name.charAt(0).toUpperCase() : "?"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Question text */}
                    <p className="text-[15px] lg:text-base font-semibold text-gray-900 leading-snug">
                      {qa.question}
                    </p>

                    {/* Meta: asker + time */}
                    <p className="text-[13px] text-gray-400 mt-1">
                      {qa.asker_name || "Anonymous"}
                      {qa.created_at && ` · ${timeAgo(qa.created_at)}`}
                    </p>

                    {/* Provider response OR awaiting response */}
                    {isAnswered && qa.answer ? (
                      <div className="mt-4">
                        <div className="flex items-start gap-3">
                          {/* Provider avatar */}
                          {providerImage ? (
                            <img
                              src={providerImage}
                              alt={providerName}
                              className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-white"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shrink-0 ring-2 ring-white">
                              <span className="text-xs font-bold text-primary-700">
                                {providerName.charAt(0)}
                              </span>
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            {/* Provider name + badge */}
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{providerName}</span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-primary-700 bg-primary-50 uppercase tracking-wide">
                                Provider
                              </span>
                            </div>

                            {/* Answer text */}
                            <div className="mt-2 bg-gray-50 rounded-xl px-4 py-3 border-l-2 border-primary-200">
                              <p className="text-[15px] text-gray-600 leading-relaxed">
                                {qa.answer}
                              </p>
                            </div>

                            {/* Answered time */}
                            {qa.answered_at && (
                              <p className="text-xs text-gray-400 mt-2">
                                Answered {timeAgo(qa.answered_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : isPending ? (
                      <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>Awaiting response from {providerName}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Show more/less */}
          {hasMore && (
            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-sm font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1.5 transition-colors"
              >
                {showAll ? "Show fewer" : `View all ${questions.length} questions`}
                <svg
                  className={`w-4 h-4 transition-transform ${showAll ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Empty state */
        <div className="bg-gray-50/80 rounded-2xl py-10 px-6 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-11.25 5.25v-1.875a3.375 3.375 0 013.375-3.375h6.75a3.375 3.375 0 013.375 3.375v1.875m-16.5 0h16.5" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-700">No questions yet</p>
          <p className="text-sm text-gray-500 mt-1">Be the first to ask {providerName} a question.</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

interface QAEntry {
  id?: string;
  question: string;
  answer?: string | null;
  asker_name?: string;
  asker_user_id?: string;
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

// More menu icon component
function MoreIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
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
  const { user } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [questions, setQuestions] = useState<QAEntry[]>(initialQuestions);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error" | "auth_required">("idle");

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<QAEntry | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

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

  const handleEditSubmit = async () => {
    if (!editingQuestion?.id || !editValue.trim() || editSubmitting) return;

    setEditSubmitting(true);
    try {
      const res = await fetch("/api/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingQuestion.id, question: editValue.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update question");
        return;
      }

      const data = await res.json();
      // Update question in local state
      setQuestions((prev) =>
        prev.map((q) => (q.id === editingQuestion.id ? { ...q, ...data.question } : q))
      );
      setEditingQuestion(null);
      setEditValue("");
    } catch {
      alert("Failed to update question");
    } finally {
      setEditSubmitting(false);
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
          <h2 className="text-2xl font-bold text-gray-900 font-display tracking-tight">
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
                  type="button"
                  onClick={() => setInputValue(q)}
                  className="text-[13px] text-gray-600 px-3.5 py-2 bg-white border border-gray-200 rounded-full hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300 transition-colors"
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
            type="button"
            onClick={handleSubmit}
            disabled={!inputValue.trim() || submitting}
            className="shrink-0 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-b from-primary-500 to-primary-600 rounded-full shadow-sm hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
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
            const isOwner = user?.id && qa.asker_user_id === user.id;
            const canEdit = isOwner && isPending;

            return (
              <div
                key={qa.id || index}
                className={`group/question py-5 ${index > 0 ? "border-t border-gray-100" : ""}`}
              >
                {/* Question */}
                <div className="flex items-start gap-3">
                  {/* Asker avatar */}
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-gray-600">
                      {qa.asker_name ? qa.asker_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Asker name + time + more menu */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {qa.asker_name || "Anonymous"}
                        </p>
                        {qa.created_at && (
                          <span className="text-xs text-gray-400">· {timeAgo(qa.created_at)}</span>
                        )}
                      </div>
                      {/* More menu - only for question owner on pending questions */}
                      {canEdit && qa.id && (
                        <div className="relative" ref={openMenuId === qa.id ? menuRef : null}>
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === qa.id ? null : qa.id!)}
                            className="w-8 h-8 -mr-2 flex items-center justify-center rounded-full text-gray-400 opacity-0 group-hover/question:opacity-100 hover:!opacity-100 hover:text-gray-600 hover:bg-gray-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-200 transition-all"
                            aria-label="More options"
                          >
                            <MoreIcon className="w-5 h-5" />
                          </button>
                          {/* Dropdown menu */}
                          {openMenuId === qa.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-10 min-w-[120px] animate-slide-down">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuestion(qa);
                                  setEditValue(qa.question);
                                  setOpenMenuId(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                              >
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                </svg>
                                Edit question
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Question text */}
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {qa.question}
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
                            <div className="mt-2 bg-gray-50 rounded-xl px-4 py-3 border-l-2 border-primary-300">
                              <p className="text-sm text-gray-600 leading-relaxed">
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
                    ) : isPending && isOwner ? (
                      <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>Awaiting response</span>
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
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 focus:outline-none focus:underline flex items-center gap-1 transition-colors"
              >
                {showAll ? "Show less" : `Show more`}
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
        /* Empty state - matches ReviewsSection pattern */
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
          <p className="text-gray-500 font-medium">No questions yet</p>
          <p className="text-sm text-gray-400 mt-1">Be the first to ask {providerName} a question.</p>
        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={() => setEditingQuestion(null)}
            aria-hidden="true"
          />
          {/* Modal */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-question-title"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl max-w-lg mx-auto p-6"
          >
            <h3 id="edit-question-title" className="text-lg font-display font-bold text-gray-900 mb-4">
              Edit your question
            </h3>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300 focus:bg-white transition-all"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setEditingQuestion(null);
                  setEditValue("");
                }}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={!editValue.trim() || editValue.trim() === editingQuestion.question || editSubmitting}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-b from-primary-500 to-primary-600 rounded-xl shadow-sm hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSubmitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import PulseHeader from "@/components/admin/PulseHeader";
import { resolveRange, type DateRangeValue } from "@/components/admin/DateRangePopover";

interface Question {
  id: string;
  provider_id: string;
  provider_name: string | null;
  provider_editor_id: string | null;
  provider_email: string | null;
  asker_name: string;
  asker_email: string | null;
  question: string;
  answer: string | null;
  status: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
  is_account_claimed?: boolean;
  verification_state?: string | null;
}

type TabValue = "unanswered" | "needs_email" | "answered" | "removed" | "archived" | "";

const TABS: { label: string; value: TabValue; showCount?: boolean }[] = [
  { label: "Needs Email", value: "needs_email", showCount: true },
  { label: "Unanswered", value: "unanswered", showCount: true },
  { label: "Answered", value: "answered" },
  { label: "Removed", value: "removed" },
  { label: "Archived", value: "archived", showCount: true },
  { label: "All", value: "" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Live",
  approved: "Live",
  answered: "Answered",
  rejected: "Removed",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-50 text-gray-500",
  approved: "bg-gray-50 text-gray-500",
  answered: "bg-gray-50 text-gray-500",
  rejected: "bg-gray-50 text-gray-400",
};

function ProviderStatusBadge({ question }: { question: Question }) {
  const providerName = question.provider_name || question.provider_id;
  const verificationLink = `/admin/verification?search=${encodeURIComponent(providerName)}`;

  // Verified or not_required claimed providers: show checkmark linking to verification page
  if (question.is_account_claimed && (question.verification_state === "verified" || question.verification_state === "not_required")) {
    return (
      <Link
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="text-emerald-600 hover:text-emerald-700 transition-colors"
        title="Verified & Claimed — click to view"
      >
        <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </Link>
    );
  }

  // Claimed but pending verification
  if (question.is_account_claimed && question.verification_state === "pending") {
    return (
      <Link
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors"
        title="Click to review verification"
      >
        Pending
      </Link>
    );
  }

  // Claimed but rejected verification
  if (question.is_account_claimed && question.verification_state === "rejected") {
    return (
      <Link
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
        title="Verification was rejected"
      >
        Rejected
      </Link>
    );
  }

  // Not claimed
  if (!question.is_account_claimed) {
    return (
      <span
        className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded"
        title="Provider has not claimed their account"
      >
        Unclaimed
      </span>
    );
  }

  // Claimed but unverified (catch-all for any claimed provider not matching above states)
  return (
    <span
      className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded"
      title="Account claimed but not yet verified"
    >
      Claimed
    </span>
  );
}

function InlineEmailInput({
  providerSlug,
  existingEmail,
  emailIsDead,
  onEmailAdded,
}: {
  providerSlug: string;
  existingEmail?: string | null;
  emailIsDead?: boolean;
  onEmailAdded: () => void;
}) {
  // Don't pre-fill a dead address — the operator needs to replace it.
  const [email, setEmail] = useState(emailIsDead ? "" : existingEmail || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Which verdict (if any) is offering a force-through escape: a hard-bounce
  // 'undeliverable', or a catch-all 'risky'. null = no override affordance.
  const [forceKind, setForceKind] = useState<"undeliverable" | "risky" | null>(null);
  const hasExistingEmail = !!existingEmail && !emailIsDead;

  async function submit(force: boolean) {
    if (!email.trim() || !providerSlug) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/questions/add-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerSlug, email: email.trim(), force }),
      });

      if (res.ok) {
        setSuccess(true);
        setForceKind(null);
        setTimeout(() => onEmailAdded(), 1400);
      } else {
        const data = await res.json();
        setError(data.message || data.error || "Couldn't save that — try again.");
        // 422 + undeliverable/risky: address was rejected — let the operator grab
        // a better one, or override if they're sure.
        setForceKind(
          res.status === 422 && (data.error === "undeliverable" || data.error === "risky")
            ? data.error
            : null,
        );
      }
    } catch {
      setError("Network hiccup — try again.");
      setForceKind(null);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(false);
  }

  if (success) {
    return (
      <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        {hasExistingEmail ? "Question forwarded" : "Saved — question forwarded"}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="email"
          placeholder="provider@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-64 px-3.5 py-2 text-sm bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 placeholder:text-gray-300 transition"
          disabled={saving}
          required
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={saving || !email.trim()}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98] transition disabled:opacity-40 disabled:active:scale-100"
        >
          {saving ? (
            "Checking…"
          ) : (
            <>
              {hasExistingEmail ? "Send" : "Add & send"}
              <span aria-hidden className="text-white/50">→</span>
            </>
          )}
        </button>
        {hasExistingEmail && !error && !saving && email === existingEmail && (
          <span className="text-xs text-gray-400">on file</span>
        )}
      </div>
      {error && (
        <p className="text-xs text-gray-500">
          {error}
          {forceKind && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={saving}
                className="text-gray-400 underline underline-offset-2 hover:text-gray-700 transition disabled:opacity-40"
              >
                {forceKind === "risky" ? "add it anyway" : "send to it anyway"}
              </button>
            </>
          )}
        </p>
      )}
    </form>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PAGE_SIZE = 50;

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("needs_email");
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [range, setRange] = useState<DateRangeValue>({ preset: "30d", customFrom: "", customTo: "" });
  const [tabCounts, setTabCounts] = useState<{ pending: number; needs_email: number; archived: number }>({ pending: 0, needs_email: 0, archived: 0 });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveProviderTarget, setArchiveProviderTarget] = useState<{ providerId: string; providerName: string } | null>(null);
  const [archiveProviderReason, setArchiveProviderReason] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ message, type });
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      // Map tab value for export
      if (activeTab === "needs_email") params.set("tab", "needs_email");
      else if (activeTab === "unanswered") params.set("tab", "unanswered");
      else if (activeTab === "answered") params.set("tab", "answered");
      else if (activeTab === "removed") params.set("tab", "removed");
      else if (activeTab === "archived") params.set("tab", "archived");
      else params.set("tab", "all");

      const { from, to } = resolveRange(range);
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/admin/questions/export?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Export failed", "error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "olera-questions.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${count.toLocaleString()} questions`);
    } catch {
      showToast("Export failed. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  }

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (activeTab === "needs_email") {
        params.set("needs_email", "true");
      } else if (activeTab === "unanswered") {
        params.set("status", "pending");
      } else if (activeTab === "removed") {
        params.set("status", "rejected");
      } else if (activeTab === "archived") {
        params.set("status", "archived");
      } else if (activeTab) {
        params.set("status", activeTab);
      }
      const { from, to } = resolveRange(range);
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/admin/questions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setQuestions(data.questions);
      setCount(data.count);
      if (data.tabCounts) setTabCounts(data.tabCounts);
    } catch {
      setError("Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, range, debouncedSearch]);

  // Reset page when tab, date, or search changes
  useEffect(() => {
    setPage(0);
  }, [activeTab, range, debouncedSearch]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleRemove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "rejected", is_public: false }),
      });
      if (!res.ok) throw new Error("Failed to update");
      await fetchQuestions();
    } catch {
      setError("Failed to remove question");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestore = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "pending", is_public: true }),
      });
      if (!res.ok) throw new Error("Failed to update");
      await fetchQuestions();
    } catch {
      setError("Failed to restore question");
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async (id: string, reason: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "archived", archive_reason: reason }),
      });
      if (!res.ok) throw new Error("Failed to archive");
      setArchiveTarget(null);
      setArchiveReason("");
      await fetchQuestions();
    } catch {
      setError("Failed to archive question");
    } finally {
      setActionLoading(null);
    }
  };

  // Archive the whole PROVIDER: clears their existing questions from the queue
  // and auto-archives any future ones (ends the QA treadmill). Q&A-scoped — does
  // not touch the provider's other emails / lead routing.
  const handleArchiveProvider = async (providerId: string, reason: string) => {
    setActionLoading(`provider:${providerId}`);
    try {
      const res = await fetch("/api/admin/questions/archive-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, reason: reason || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      setArchiveProviderTarget(null);
      setArchiveProviderReason("");
      showToast(data.message || "Provider archived");
      await fetchQuestions();
    } catch {
      showToast("Failed to archive provider", "error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <PulseHeader
        title="Questions"
        kpiSuffix="needing email"
        statsPath="/api/admin/questions/stats"
        range={range}
        onRangeChange={setRange}
      />

      {/* Search bar + Export button */}
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by provider name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setDebouncedSearch(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          className="px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-50 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-gray-100">
        {TABS.map((tab) => {
          const tabCount = tab.value === "unanswered" ? tabCounts.pending
            : tab.value === "needs_email" ? tabCounts.needs_email
            : tab.value === "archived" ? tabCounts.archived
            : null;

          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
              {tab.showCount && tabCount !== null && tabCount > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">
                  {tabCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-24">
          {activeTab === "needs_email" ? (
            <div className="space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-gray-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">All questions have provider emails</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              No {activeTab === "unanswered" ? "unanswered" : activeTab === "removed" ? "removed" : activeTab || ""} questions
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {questions.map((q) => {
            const needsEmail = q.metadata?.needs_provider_email === true;
            const emailIsDead = q.metadata?.email_dead === true;
            const providerLabel = q.provider_name || q.provider_id;
            const isRemoved = q.status === "rejected";
            const isArchived = q.status === "archived";
            const isLive = q.status === "pending" || q.status === "approved";
            const showEmailInput = needsEmail && !isRemoved && !isArchived;

            return (
              <div
                key={q.id}
                className={`group px-5 py-4 transition-colors ${
                  isRemoved || isArchived ? "opacity-40" : "hover:bg-gray-50/60"
                }`}
              >
                {/* Main row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/provider/${q.provider_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-[15px] font-medium leading-snug transition-colors ${
                        isRemoved
                          ? "text-gray-400 line-through"
                          : "text-gray-900 hover:text-primary-600"
                      }`}
                    >
                      {q.question}
                    </a>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span>{q.asker_name}</span>
                      {q.provider_editor_id ? (
                        <Link
                          href={`/admin/directory/${q.provider_editor_id}`}
                          className="hover:text-primary-600 transition-colors"
                        >
                          {providerLabel}
                        </Link>
                      ) : (
                        <a
                          href={`/provider/${q.provider_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary-600 transition-colors"
                        >
                          {providerLabel}
                        </a>
                      )}
                      <ProviderStatusBadge question={q} />
                      {needsEmail && !isRemoved && (
                        <span className="inline-flex items-center gap-1.5 font-medium text-gray-600">
                          <span className={`w-1.5 h-1.5 rounded-full ${emailIsDead ? "bg-amber-500" : "bg-gray-300"}`} />
                          {emailIsDead ? "Email bounced" : "Needs email"}
                        </span>
                      )}
                      <span>{formatDate(q.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isLive && (
                      <>
                        <button
                          onClick={() => { setArchiveTarget(q.id); setArchiveReason(""); }}
                          disabled={actionLoading === q.id}
                          className="opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 text-xs text-gray-400 hover:text-amber-600 transition-all duration-200 disabled:opacity-40"
                        >
                          Archive
                        </button>
                        <button
                          onClick={() => { setArchiveProviderTarget({ providerId: q.provider_id, providerName: providerLabel }); setArchiveProviderReason(""); }}
                          disabled={actionLoading === `provider:${q.provider_id}`}
                          className="opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 text-xs text-gray-400 hover:text-amber-700 transition-all duration-200 disabled:opacity-40"
                        >
                          Archive provider
                        </button>
                        <button
                          onClick={() => handleRemove(q.id)}
                          disabled={actionLoading === q.id}
                          className="opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 text-xs text-gray-400 hover:text-red-500 transition-all duration-200 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {isArchived && (
                      <button
                        onClick={() => handleRestore(q.id)}
                        disabled={actionLoading === q.id}
                        className="text-xs text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-40"
                      >
                        Unarchive
                      </button>
                    )}
                    {isRemoved && (
                      <button
                        onClick={() => handleRestore(q.id)}
                        disabled={actionLoading === q.id}
                        className="text-xs text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-40"
                      >
                        Restore
                      </button>
                    )}
                    {!isLive && !isRemoved && !isArchived && (
                      <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${STATUS_COLORS[q.status] || "bg-gray-50 text-gray-400"}`}>
                        {STATUS_LABELS[q.status] || q.status}
                      </span>
                    )}
                  </div>
                </div>

                {q.answer && (
                  <div className="mt-2.5 pl-4 border-l-2 border-gray-100">
                    <p className="text-sm text-gray-500">{q.answer}</p>
                  </div>
                )}

                {showEmailInput && (
                  <div className="mt-3.5">
                    <p className="mb-2 text-[13px] text-gray-500 leading-relaxed">
                      {emailIsDead ? (
                        <>
                          The address on file can&apos;t receive mail
                          {q.provider_email ? <span className="text-gray-400"> ({q.provider_email})</span> : null}
                          {" — add a working one to forward this question."}
                        </>
                      ) : (
                        <>No email on file — add one to forward this question.</>
                      )}
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(`${providerLabel} contact email`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 whitespace-nowrap text-gray-400 underline underline-offset-2 hover:text-gray-700 transition-colors"
                      >
                        find one →
                      </a>
                    </p>
                    <InlineEmailInput
                      providerSlug={q.provider_id}
                      existingEmail={q.provider_email}
                      emailIsDead={emailIsDead}
                      onEmailAdded={fetchQuestions}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && questions.length > 0 && (
        <div className="flex items-center justify-between mt-6 px-2">
          <p className="text-sm text-gray-500">
            {count <= PAGE_SIZE
              ? `${count} ${activeTab === "needs_email" ? "needing email" : activeTab === "unanswered" ? "unanswered" : activeTab === "removed" ? "removed" : activeTab === "archived" ? "archived" : "total"}`
              : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, count)} of ${count}`
            }
          </p>
          {count > PAGE_SIZE && (
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= count}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Archive dialog */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Archive question</h3>
            <p className="mt-2 text-sm text-gray-600">
              Archived questions are hidden from the public page but can be restored later.
            </p>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Reason (e.g. provider unreachable after 2 attempts)..."
              className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => { setArchiveTarget(null); setArchiveReason(""); }}
                disabled={actionLoading === archiveTarget}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchive(archiveTarget, archiveReason.trim())}
                disabled={actionLoading === archiveTarget || !archiveReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === archiveTarget ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive provider dialog */}
      {archiveProviderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Archive provider
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Archive <span className="font-medium text-gray-900">{archiveProviderTarget.providerName}</span> from
              the Questions queue. This clears their current questions and
              auto-archives any future ones — so they stop showing up here. Their
              other emails and lead routing are unaffected. Reversible.
            </p>
            <textarea
              value={archiveProviderReason}
              onChange={(e) => setArchiveProviderReason(e.target.value)}
              placeholder="Reason (optional, e.g. out of business / unreachable)..."
              className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => { setArchiveProviderTarget(null); setArchiveProviderReason(""); }}
                disabled={actionLoading === `provider:${archiveProviderTarget.providerId}`}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchiveProvider(archiveProviderTarget.providerId, archiveProviderReason.trim())}
                disabled={actionLoading === `provider:${archiveProviderTarget.providerId}`}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === `provider:${archiveProviderTarget.providerId}` ? "Archiving..." : "Archive provider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

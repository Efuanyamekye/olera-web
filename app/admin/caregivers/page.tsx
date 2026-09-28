"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { StudentMetadata } from "@/lib/types";
import DateRangePopover, { type DateRangeValue, resolveRange } from "@/components/admin/DateRangePopover";

type FilterTab = "all" | "pendingReview" | "approved" | "rejected" | "hasInterviews" | "complete" | "incomplete";

interface StudentRow {
  id: string;
  slug: string;
  type: "student";
  display_name: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
  metadata: StudentMetadata;
  account_id: string | null;
  claim_state: string;
  verification_state: string;
  source: string;
  is_active: boolean;
  application_completed: boolean;
  review_requested_at: string | null;
  created_at: string;
  profile_completeness: number;
  university: string | null;
  pending_interview_count: number;
}

interface TabCounts {
  total: number;
  live: number;
  active: number;
  paused: number;
  notLive: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  hasInterviews: number;
  complete: number;
  incomplete: number;
  thisWeek: number;
  students: number;
}

// Format date as "Feb 02, 2026"
function formatJoinedDate(isoDate: string): string {
  const date = new Date(isoDate);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

const PAGE_SIZE = 25;

export default function AdminStudentsPage() {
  const router = useRouter();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState<TabCounts | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    preset: "all",
    customFrom: "",
    customTo: "",
  });

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [pendingDelete, setPendingDelete] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Email health state - shows bounce/complaint indicators on student cards
  const [emailHealth, setEmailHealth] = useState<Record<string, { status: "healthy" | "bounced" | "complained"; bounced: number; complained: number }>>({});

  // For approve/reject/revoke actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<StudentRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRevokeModal, setShowRevokeModal] = useState<StudentRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [showIncompleteApproveModal, setShowIncompleteApproveModal] = useState<StudentRow | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    clearTimeout(toastRef.current);
    setToast({ message, type });
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, dateRange]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(PAGE_SIZE));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filter === "pendingReview") params.set("pending_review_only", "true");
      if (filter === "approved") params.set("approved_only", "true");
      if (filter === "rejected") params.set("rejected_only", "true");
      if (filter === "hasInterviews") params.set("has_interviews_only", "true");
      if (filter === "complete") params.set("complete_only", "true");
      if (filter === "incomplete") params.set("incomplete_only", "true");

      // Date range filter
      const resolved = resolveRange(dateRange);
      if (resolved.from) params.set("from_date", resolved.from);
      if (resolved.to) params.set("to_date", resolved.to);

      const res = await fetch(`/api/admin/caregivers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch students:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, page, dateRange]);

  const fetchTabCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const resolved = resolveRange(dateRange);
      if (resolved.from) params.set("from_date", resolved.from);
      if (resolved.to) params.set("to_date", resolved.to);

      const statsRes = await fetch(`/api/admin/caregivers/stats?${params}`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setTabCounts({
          total: statsData.total ?? 0,
          live: statsData.live ?? 0,
          active: statsData.active ?? 0,
          paused: statsData.paused ?? 0,
          notLive: statsData.notLive ?? 0,
          pendingReview: statsData.pendingReview ?? 0,
          approved: statsData.approved ?? 0,
          rejected: statsData.rejected ?? 0,
          hasInterviews: statsData.hasInterviews ?? 0,
          complete: statsData.complete ?? 0,
          incomplete: statsData.incomplete ?? 0,
          thisWeek: statsData.thisWeek ?? 0,
          students: statsData.students ?? 0,
        });
      }
    } catch { /* ignore */ }
  }, [dateRange]);

  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Fetch email health for displayed students
  useEffect(() => {
    const emails = students
      .map((s) => s.email)
      .filter((e): e is string => !!e);
    if (emails.length === 0) return;

    const controller = new AbortController();
    fetch("/api/admin/students/email-health/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails }),
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.health) {
          setEmailHealth(data.health);
        }
      })
      .catch(() => { /* ignore abort errors */ });

    return () => controller.abort();
  }, [students]);

  async function confirmDelete() {
    if (!pendingDelete) return;

    setDeleting(true);
    setDeleteError(null);

    const student = pendingDelete;
    setStudents((prev) => prev.filter((s) => s.id !== student.id));
    setTotal((prev) => prev - 1);

    try {
      const res = await fetch(`/api/admin/caregivers/${student.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast(`Deleted ${student.display_name}`);
        fetchTabCounts();
        setPendingDelete(null);
      } else {
        setStudents((prev) => [...prev, student].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
        setTotal((prev) => prev + 1);
        setDeleteError("Failed to delete student");
      }
    } catch {
      setStudents((prev) => [...prev, student].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      setTotal((prev) => prev + 1);
      setDeleteError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleApprove(student: StudentRow) {
    if (!confirm(`Approve "${student.display_name}"? Their profile will become visible to providers.`)) return;
    setActionLoading(student.id);
    try {
      const res = await fetch(`/api/admin/caregivers/${student.id}/approve`, { method: "POST" });
      if (res.ok) {
        showToast(`Approved ${student.display_name}`);
        // Remove from list since they're no longer pending
        setStudents((prev) => prev.filter((s) => s.id !== student.id));
        setTotal((prev) => prev - 1);
        fetchTabCounts();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Failed to approve", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(student: StudentRow, reason: string) {
    setActionLoading(student.id);
    try {
      const res = await fetch(`/api/admin/caregivers/${student.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (res.ok) {
        showToast(`Rejected ${student.display_name}`);
        setStudents((prev) => prev.filter((s) => s.id !== student.id));
        setTotal((prev) => prev - 1);
        fetchTabCounts();
        setShowRejectModal(null);
        setRejectReason("");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Failed to reject", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevoke(student: StudentRow, reason: string) {
    setActionLoading(student.id);
    try {
      const res = await fetch(`/api/admin/caregivers/${student.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (res.ok) {
        showToast(`Revoked approval for ${student.display_name}`);
        // Remove from list (consistent with approve/reject behavior)
        setStudents((prev) => prev.filter((s) => s.id !== student.id));
        setTotal((prev) => prev - 1);
        fetchTabCounts();
        setShowRevokeModal(null);
        setRevokeReason("");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Failed to revoke", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setActionLoading(null);
    }
  }

  const tabs: { label: string; value: FilterTab; count: number | null }[] = [
    { label: "All", value: "all", count: tabCounts?.total ?? null },
    { label: "Pending Review", value: "pendingReview", count: tabCounts?.pendingReview ?? null },
    { label: "Approved", value: "approved", count: tabCounts?.approved ?? null },
    { label: "Rejected", value: "rejected", count: tabCounts?.rejected ?? null },
    { label: "Has Interviews", value: "hasInterviews", count: tabCounts?.hasInterviews ?? null },
    { label: "Complete", value: "complete", count: tabCounts?.complete ?? null },
    { label: "Incomplete", value: "incomplete", count: tabCounts?.incomplete ?? null },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-sm text-gray-500 mt-1">
            MedJobs student applicants
          </p>
        </div>
        <DateRangePopover value={dateRange} onChange={setDateRange} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Total Students</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{tabCounts?.total ?? "—"}</p>
          <p className="text-xs text-gray-400 mt-1">+{tabCounts?.thisWeek ?? 0} this week</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Live</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{tabCounts?.live ?? "—"}</p>
          <p className="text-xs text-gray-400 mt-1">Approved & active</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Pending Review</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{tabCounts?.pendingReview ?? "—"}</p>
          <p className="text-xs text-gray-400 mt-1">Awaiting approval</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Has Interviews</p>
          <p className="text-2xl font-bold text-primary-600 mt-1">{tabCounts?.hasInterviews ?? "—"}</p>
          <p className="text-xs text-gray-400 mt-1">Pending provider requests</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              filter === tab.value
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
            <span className={`text-xs ${filter === tab.value ? "text-white/70" : "text-gray-400"}`}>
              ({tab.count ?? "—"})
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email, phone, or school..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="grid gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide grid-cols-[2fr_1.5fr_80px_80px_100px_140px]">
          <div>Student</div>
          <div>School & Location</div>
          <div className="text-center">Status</div>
          <div className="text-center">Interviews</div>
          <div className="text-right">{filter === "pendingReview" ? "Requested" : "Joined"}</div>
          <div className="text-right">Actions</div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No students found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {students.map((student) => {
              const location = [student.city, student.state].filter(Boolean).join(", ");
              const completeness = student.profile_completeness;

              // Determine what actions are available for this student
              const isApproved = !!student.application_completed;
              const isApprovable = !isApproved; // Can approve any unapproved student
              const isIncomplete = completeness < 100;
              const showApproveReject = isApprovable;
              const showRevoke = isApproved;
              const hasActions = showApproveReject || showRevoke;

              return (
                <div
                  key={student.id}
                  className="group grid gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer items-center grid-cols-[2fr_1.5fr_80px_80px_100px_140px]"
                  onClick={() => router.push(`/admin/caregivers/${student.id}`)}
                >
                  {/* Student Info */}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {student.display_name}
                    </p>
                    <p className="text-sm text-gray-500 truncate flex items-center gap-1.5">
                      <span>{student.email || "No email"}</span>
                      {student.email && emailHealth[student.email.toLowerCase()]?.status === "complained" && (
                        <span
                          title="Email marked as spam"
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 cursor-help"
                        >
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                      {student.email && emailHealth[student.email.toLowerCase()]?.status === "bounced" && (
                        <span
                          title="Email bounced"
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-600 cursor-help"
                        >
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </p>
                    {student.phone && (
                      <a
                        href={`tel:${student.phone.replace(/[^+\d]/g, "")}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block text-sm text-blue-600 hover:text-blue-800 hover:underline truncate"
                      >
                        {student.phone}
                      </a>
                    )}
                    <p className="text-sm mt-0.5">
                      <span className={completeness >= 80 ? "text-emerald-600" : "text-gray-400"}>
                        {completeness}% complete
                      </span>
                    </p>
                  </div>

                  {/* School & Location (stacked) */}
                  <div className="min-w-0">
                    {student.university ? (
                      <p className="text-sm text-gray-900 truncate" title={student.university}>
                        {student.university}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No school</p>
                    )}
                    {location ? (
                      <p className="text-sm text-gray-500 truncate">{location}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No location</p>
                    )}
                  </div>

                  {/* Status - must check application_completed first (approval flag) */}
                  <div className="text-center">
                    {student.application_completed && student.is_active ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Live
                      </span>
                    ) : student.application_completed && !student.is_active ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        Paused
                      </span>
                    ) : student.review_requested_at || completeness >= 100 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        Pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Not Live
                      </span>
                    )}
                  </div>

                  {/* Interviews */}
                  <div className="text-center">
                    {student.pending_interview_count > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                        {student.pending_interview_count}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>

                  {/* Date */}
                  <div className="text-right">
                    <p className="text-sm text-gray-400">
                      {filter === "pendingReview" && student.review_requested_at
                        ? formatJoinedDate(student.review_requested_at)
                        : formatJoinedDate(student.created_at)}
                    </p>
                  </div>

                  {/* Actions - show based on student state */}
                  <div className="flex items-center justify-end gap-2">
                    {showApproveReject && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isIncomplete) {
                              // Show warning modal for incomplete profiles
                              setShowIncompleteApproveModal(student);
                            } else {
                              // Direct approve for 100% complete profiles
                              handleApprove(student);
                            }
                          }}
                          disabled={actionLoading === student.id}
                          className={`px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors ${
                            isIncomplete
                              ? "bg-amber-500 hover:bg-amber-600"
                              : "bg-primary-600 hover:bg-primary-700"
                          }`}
                          title={isIncomplete ? `Profile is ${completeness}% complete` : undefined}
                        >
                          {actionLoading === student.id ? "..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowRejectModal(student);
                          }}
                          disabled={actionLoading === student.id}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {showRevoke && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowRevokeModal(student);
                        }}
                        disabled={actionLoading === student.id}
                        className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === student.id ? "..." : "Revoke"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError(null);
                        setPendingDelete(student);
                      }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1"
                      aria-label="Delete this student"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && students.length > 0 && (
        <div className="flex items-center justify-between mt-6 px-2">
          <p className="text-sm text-gray-500">
            {total <= PAGE_SIZE
              ? `${total} total`
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
            }
          </p>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-student-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 id="delete-student-title" className="text-base font-semibold text-gray-900 mb-3">
              Delete this student?
            </h3>
            <dl className="text-sm text-gray-700 space-y-1.5 mb-4">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Name</dt>
                <dd className="text-gray-900">{pendingDelete.display_name}</dd>
              </div>
              {pendingDelete.email && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-gray-400">Email</dt>
                  <dd className="text-gray-900">{pendingDelete.email}</dd>
                </div>
              )}
              {pendingDelete.university && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-gray-400">School</dt>
                  <dd className="text-gray-900">{pendingDelete.university}</dd>
                </div>
              )}
            </dl>
            <p className="text-[12px] text-gray-500 leading-relaxed mb-5">
              This will permanently delete this student and all their applications. This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-[12px] text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject confirmation modal */}
      {showRejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-student-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 id="reject-student-title" className="text-base font-semibold text-gray-900 mb-1">
              Reject this profile?
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {showRejectModal.display_name} will be notified and can make improvements to request review again.
            </p>
            <div className="mb-4">
              <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., Please add a profile photo and complete your availability section."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason("");
                }}
                disabled={actionLoading === showRejectModal.id}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReject(showRejectModal, rejectReason)}
                disabled={actionLoading === showRejectModal.id}
                className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                {actionLoading === showRejectModal.id ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirmation modal */}
      {showRevokeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-student-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 id="revoke-student-title" className="text-base font-semibold text-gray-900 mb-1">
              Revoke approval?
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {showRevokeModal.display_name}&apos;s profile will no longer be visible to providers.
              They can request review again to get re-approved.
            </p>
            <div className="mb-4">
              <label htmlFor="revoke-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                id="revoke-reason"
                rows={3}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g., Profile information appears outdated or inaccurate."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRevokeModal(null);
                  setRevokeReason("");
                }}
                disabled={actionLoading === showRevokeModal.id}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRevoke(showRevokeModal, revokeReason)}
                disabled={actionLoading === showRevokeModal.id}
                className="text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                {actionLoading === showRevokeModal.id ? "Revoking..." : "Revoke Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incomplete profile approval warning modal */}
      {showIncompleteApproveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incomplete-approve-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 id="incomplete-approve-title" className="text-base font-semibold text-gray-900 mb-1">
              Approve incomplete profile?
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {showIncompleteApproveModal.display_name}&apos;s profile is only{" "}
              <span className="font-semibold text-amber-600">
                {showIncompleteApproveModal.profile_completeness}% complete
              </span>.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>Warning:</strong> Incomplete profiles may be missing important information
                like video introductions, availability, or documents. Providers expect complete
                profiles when reviewing candidates.
              </p>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to approve this profile and make it visible to providers?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowIncompleteApproveModal(null)}
                disabled={actionLoading === showIncompleteApproveModal.id}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleApprove(showIncompleteApproveModal);
                  setShowIncompleteApproveModal(null);
                }}
                disabled={actionLoading === showIncompleteApproveModal.id}
                className="text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                {actionLoading === showIncompleteApproveModal.id ? "Approving..." : "Approve Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

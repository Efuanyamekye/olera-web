"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { StudentMetadata } from "@/lib/types";

type FilterTab = "all" | "pendingReview" | "complete" | "incomplete" | "nonEdu";

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
}

interface TabCounts {
  total: number;
  active: number;
  paused: number;
  notLive: number;
  pendingReview: number;
  complete: number;
  incomplete: number;
  thisWeek: number;
  students: number;
  nonEdu: number;
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

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [pendingDelete, setPendingDelete] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // For approve/reject actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<StudentRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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
  }, [filter]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(PAGE_SIZE));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filter === "pendingReview") params.set("pending_review_only", "true");
      if (filter === "complete") params.set("complete_only", "true");
      if (filter === "incomplete") params.set("incomplete_only", "true");

      // Email filtering: nonEdu tab shows non-.edu emails, all others show only .edu
      if (filter === "nonEdu") {
        params.set("non_edu_only", "true");
      } else {
        params.set("edu_only", "true");
      }

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
  }, [debouncedSearch, filter, page]);

  const fetchTabCounts = useCallback(async () => {
    try {
      const statsRes = await fetch("/api/admin/caregivers/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setTabCounts({
          total: statsData.total ?? 0,
          active: statsData.active ?? 0,
          paused: statsData.paused ?? 0,
          notLive: statsData.notLive ?? 0,
          pendingReview: statsData.pendingReview ?? 0,
          complete: statsData.complete ?? 0,
          incomplete: statsData.incomplete ?? 0,
          thisWeek: statsData.thisWeek ?? 0,
          students: statsData.students ?? 0,
          nonEdu: statsData.nonEdu ?? 0,
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

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

  const tabs: { label: string; value: FilterTab; count: number | null }[] = [
    { label: "All", value: "all", count: tabCounts?.total ?? null },
    { label: "Pending Review", value: "pendingReview", count: tabCounts?.pendingReview ?? null },
    { label: "Complete", value: "complete", count: tabCounts?.complete ?? null },
    { label: "Incomplete", value: "incomplete", count: tabCounts?.incomplete ?? null },
    { label: "Non-.edu", value: "nonEdu", count: tabCounts?.nonEdu ?? null },
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <p className="text-sm text-gray-500 mt-1">
          {filter === "nonEdu"
            ? "Students who signed up with non-.edu emails"
            : "Verified MedJobs student applicants (.edu emails)"}
        </p>
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
        <div className={`grid gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide ${
          filter === "pendingReview"
            ? "grid-cols-[2fr_1.5fr_100px_120px_140px]"
            : "grid-cols-[2fr_1.5fr_100px_120px_32px]"
        }`}>
          <div>Student</div>
          <div>School & Location</div>
          <div className="text-center">Status</div>
          <div className="text-right">{filter === "pendingReview" ? "Requested" : "Joined"}</div>
          <div className={filter === "pendingReview" ? "text-right" : ""}>{filter === "pendingReview" ? "Actions" : ""}</div>
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
              const isPendingMode = filter === "pendingReview";

              return (
                <div
                  key={student.id}
                  className={`group grid gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer items-center ${
                    isPendingMode
                      ? "grid-cols-[2fr_1.5fr_100px_120px_140px]"
                      : "grid-cols-[2fr_1.5fr_100px_120px_32px]"
                  }`}
                  onClick={() => router.push(`/admin/caregivers/${student.id}`)}
                >
                  {/* Student Info */}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {student.display_name}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {student.email || "No email"}
                    </p>
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

                  {/* Status */}
                  <div className="text-center">
                    {student.is_active ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Active
                      </span>
                    ) : student.application_completed ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        Paused
                      </span>
                    ) : student.review_requested_at ? (
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

                  {/* Date - shows review_requested_at for pending, created_at otherwise */}
                  <div className="text-right">
                    <p className="text-sm text-gray-400">
                      {isPendingMode && student.review_requested_at
                        ? formatJoinedDate(student.review_requested_at)
                        : formatJoinedDate(student.created_at)}
                    </p>
                  </div>

                  {/* Actions or Delete */}
                  {isPendingMode ? (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprove(student);
                        }}
                        disabled={actionLoading === student.id}
                        className="px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
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
                    </div>
                  ) : (
                    <div>
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
                  )}
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
    </div>
  );
}

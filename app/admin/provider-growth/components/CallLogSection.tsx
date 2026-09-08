"use client";

/**
 * CallLogSection - Call logging UI for provider growth tracking
 *
 * Redesigned to match the Provider Outreach call log UX:
 * - Status dropdown + Log Call button on same row
 * - Notes input below
 * - Text-based Edit/Delete buttons (visible on hover)
 * - Clean call history display
 */

import { useState, useEffect, useCallback } from "react";
import {
  CALL_STATUSES,
  CALL_STATUS_LABELS,
  CALL_STATUS_COLORS,
  type CallStatus,
} from "@/lib/provider-growth/stages";

interface CallLogEntry {
  id: string;
  tracking_id: string;
  status: CallStatus;
  notes: string | null;
  admin_id: string;
  admin_name: string | null;
  created_at: string;
}

interface CallLogSectionProps {
  trackingId: string;
  businessProfileId: string;
  onCallLogged?: () => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
      {children}
    </div>
  );
}

export function CallLogSection({ trackingId, businessProfileId, onCallLogged }: CallLogSectionProps) {
  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedStatus, setSelectedStatus] = useState<CallStatus>("voicemail");
  const [callNotes, setCallNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<CallStatus>("voicemail");
  const [editNotes, setEditNotes] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reset state when tracking changes
  useEffect(() => {
    setLogs([]);
    setCallNotes("");
    setError(null);
    setEditingId(null);
    setDeleteConfirmId(null);
  }, [trackingId]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/provider-growth/call-logs?tracking_id=${trackingId}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setCurrentAdminId(data.current_admin_id);
      }
    } catch (e) {
      console.error("Failed to fetch call logs:", e);
    } finally {
      setLoading(false);
    }
  }, [trackingId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/provider-growth/call-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_id: trackingId,
          business_profile_id: businessProfileId,
          status: selectedStatus,
          notes: callNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to log call");
      }

      const data = await res.json();

      // Add the new log to the top of the list
      setLogs((prev) => [data.log, ...prev]);
      setCallNotes("");
      setSelectedStatus("voicemail");

      // Notify parent to refresh
      onCallLogged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log call");
    } finally {
      setSubmitting(false);
    }
  }, [trackingId, businessProfileId, selectedStatus, callNotes, submitting, onCallLogged]);

  const startEdit = useCallback((log: CallLogEntry) => {
    setEditingId(log.id);
    setEditStatus(log.status);
    setEditNotes(log.notes || "");
    setEditError(null);
    setDeleteConfirmId(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditStatus("voicemail");
    setEditNotes("");
    setEditError(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || editSubmitting) return;
    setEditSubmitting(true);
    setEditError(null);

    try {
      const res = await fetch("/api/admin/provider-growth/call-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touchpoint_id: editingId,
          status: editStatus,
          notes: editNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update call log");
      }

      const data = await res.json();

      // Update the log in the list
      setLogs((prev) => prev.map((l) => (l.id === editingId ? data.log : l)));
      cancelEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setEditSubmitting(false);
    }
  }, [editingId, editStatus, editNotes, editSubmitting, cancelEdit]);

  const handleDelete = useCallback(async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);

    try {
      const res = await fetch("/api/admin/provider-growth/call-logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ touchpoint_id: id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete call log");
      }

      // Remove from list
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setDeleteConfirmId(null);

      // Notify parent to refresh
      onCallLogged?.();
    } catch (e) {
      console.error("Failed to delete:", e);
    } finally {
      setDeletingId(null);
    }
  }, [deletingId, onCallLogged]);

  return (
    <div>
      <SectionHeader>Call Log</SectionHeader>

      {/* Log call form */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as CallStatus)}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            disabled={submitting}
          >
            {CALL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CALL_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "..." : "Log Call"}
          </button>
        </div>
        <input
          type="text"
          value={callNotes}
          onChange={(e) => setCallNotes(e.target.value)}
          placeholder="Optional notes..."
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={submitting}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setCallNotes("");
            }
          }}
        />
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>

      {/* Call history */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <span className="w-4 h-4 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No calls logged yet</p>
      ) : (
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {logs.map((log) => {
            const isEditing = editingId === log.id;
            const canEdit = currentAdminId === log.admin_id;

            if (isEditing) {
              return (
                <div key={log.id} className="text-sm p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as CallStatus)}
                      className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      disabled={editSubmitting}
                    >
                      {CALL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {CALL_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editSubmitting}
                      className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {editSubmitting ? "..." : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={editSubmitting}
                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes..."
                    className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={editSubmitting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveEdit();
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        cancelEdit();
                      }
                    }}
                  />
                  {editError && <p className="mt-1 text-xs text-red-500">{editError}</p>}
                </div>
              );
            }

            return (
              <div key={log.id} className="text-sm group">
                {/* Row 1: Time, status, admin, edit/delete */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-400">
                    {formatTimestamp(log.created_at)}
                  </span>
                  <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${CALL_STATUS_COLORS[log.status]}`}>
                    {CALL_STATUS_LABELS[log.status]}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {log.admin_name || "Unknown"}
                  </span>
                  {canEdit && (
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(log)}
                        className="text-xs text-gray-400 hover:text-blue-600"
                        title="Edit"
                      >
                        Edit
                      </button>
                      {deleteConfirmId === log.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(log.id)}
                            disabled={deletingId === log.id}
                            className="text-xs text-red-600 hover:text-red-700 font-medium"
                          >
                            {deletingId === log.id ? "..." : "Confirm"}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(log.id)}
                          className="text-xs text-gray-400 hover:text-red-500"
                          title="Delete"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* Row 2: Notes */}
                {log.notes ? (
                  <p className="text-gray-600 whitespace-pre-wrap">{log.notes}</p>
                ) : (
                  <p className="text-gray-400 italic">No notes</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

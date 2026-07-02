"use client";

import { useEffect, useState, useCallback } from "react";
import Badge from "@/components/ui/Badge";

interface DncEntry {
  id: string;
  email: string | null;
  phone: string | null;
  reason: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

const REASON_OPTIONS = [
  { value: "provider_request", label: "Provider request" },
  { value: "angry_optout", label: "Angry opt-out" },
  { value: "legal", label: "Legal" },
  { value: "spam_complaint", label: "Spam complaint" },
  { value: "other", label: "Other" },
] as const;

function reasonLabel(reason: string): string {
  return REASON_OPTIONS.find((o) => o.value === reason)?.label ?? reason.replace("_", " ");
}

function reasonBadgeVariant(reason: string): "rejected" | "pending" | "default" {
  switch (reason) {
    case "legal":
    case "spam_complaint":
      return "rejected";
    case "provider_request":
    case "angry_optout":
      return "pending";
    default:
      return "default";
  }
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return phone;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function AdminDoNotContactPage() {
  const [entries, setEntries] = useState<DncEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DncEntry | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchEntries = useCallback(async (q?: string) => {
    setLoading(true);
    setError("");
    try {
      const url = q?.trim()
        ? `/api/admin/do-not-contact?q=${encodeURIComponent(q.trim())}`
        : "/api/admin/do-not-contact";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setError("Failed to load do-not-contact list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Debounced search
  useEffect(() => {
    const handle = setTimeout(() => fetchEntries(search), 300);
    return () => clearTimeout(handle);
  }, [search, fetchEntries]);

  const handleDelete = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/do-not-contact?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
      setConfirmDelete(null);
      await fetchEntries(search);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Do Not Contact</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            The kill switch. Any email or phone here is suppressed across{" "}
            <strong>all</strong> Olera email and text — every sender funnels through
            one central check. Use it when a provider replies asking to be removed
            from communications. Auth / login codes the recipient actively requests
            still go through. This does not delete their listing — use{" "}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">Directory</code>{" "}
            or <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">Removals</code> for that.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium whitespace-nowrap"
        >
          + Add entry
        </button>
      </div>

      {/* Search box */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or phone…"
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Note</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Added</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  Couldn’t load the list — see the error above.
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">
                  {search.trim() ? "No matches." : "Do-not-contact list is empty."}
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {e.email || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {e.phone ? formatPhone(e.phone) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={reasonBadgeVariant(e.reason)}>{reasonLabel(e.reason)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-md">
                    {e.note || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    <div>{new Date(e.created_at).toLocaleDateString()}</div>
                    {e.created_by && (
                      <div className="text-xs text-gray-400">{e.created_by}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmDelete(e)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!error && (
        <p className="text-xs text-gray-500 mt-4">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
          {search.trim() && ` matching "${search}"`}
        </p>
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddEntryModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            fetchEntries(search);
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Re-enable contact?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{confirmDelete.email || (confirmDelete.phone && formatPhone(confirmDelete.phone))}</strong>{" "}
              will be able to receive Olera email/SMS again. Only do this if the
              entry was added in error.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.id)}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add modal ──

function AddEntryModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState<string>("provider_request");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = (email.trim() || phone.trim()) && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) {
      setError("Enter an email or phone number.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/do-not-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || null,
          phone: phone.trim() || null,
          reason,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add entry");
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 max-w-lg w-full my-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Add to do-not-contact</h3>
        <p className="text-sm text-gray-600 mb-4">
          Suppresses all future email/SMS to this address or number. Provide at
          least one.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="provider@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(512) 555-1234"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Provider name, ticket #, what they asked for, date…"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 rounded text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add to list"}
          </button>
        </div>
      </form>
    </div>
  );
}

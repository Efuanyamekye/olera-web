"use client";

import { useEffect, useState, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import type { OrganizationMetadata } from "@/lib/types";

interface VerificationSubmission {
  name: string;
  email?: string | null;
  role: string;
  phone?: string | null;
  notes?: string | null;
  // Legacy field for backwards compatibility
  affiliation?: string | null;
  submitted_at?: string;
  // New verification fields
  linkedin_url?: string | null;
  business_website_url?: string | null;
  manual_review_requested?: boolean;
}

interface Provider {
  id: string;
  display_name: string;
  type: string;
  category: string | null;
  city: string | null;
  state: string | null;
  verification_state: string;
  metadata: (OrganizationMetadata & { verification_submission?: VerificationSubmission }) | null;
  created_at: string;
  updated_at: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  slug: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  administrator: "Administrator",
  executive_director: "Executive Director",
  office_manager: "Office Manager",
  marketing: "Marketing / Communications",
  staff: "Staff Member",
  other: "Other",
};

type StatusFilter = "pending" | "approved" | "rejected";

export default function AdminVerificationPage() {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [search, setSearch] = useState("");

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verification?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        let results = data.providers ?? [];
        // For pending tab, only show providers with actual submissions
        if (filter === "pending") {
          results = results.filter(
            (p: Provider) => p.metadata?.verification_submission
          );
        }
        setProviders(results);
      } else {
        setError("Failed to load verification requests. Please try again.");
      }
    } catch (err) {
      console.error("Failed to fetch providers:", err);
      setError("Failed to load verification requests. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const filters: { label: string; value: StatusFilter }[] = [
    { label: "Pending", value: "pending" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
  ];

  // Filter providers based on search term
  const filteredProviders = providers.filter((provider) => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    const providerName = provider.display_name?.toLowerCase() || "";
    const submitterName = provider.metadata?.verification_submission?.name?.toLowerCase() || "";
    return providerName.includes(searchLower) || submitterName.includes(searchLower);
  });

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/verification/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setProviders((prev) => prev.filter((p) => p.id !== id));
        setSelectedProvider(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || `Failed to ${action} badge. Please try again.`);
      }
    } catch (err) {
      console.error("Action failed:", err);
      setActionError(`Failed to ${action} badge. Please check your connection.`);
    } finally {
      setActionLoading(null);
    }
  }

  // Get verification submission from metadata
  function getVerificationSubmission(provider: Provider): VerificationSubmission | null {
    return provider.metadata?.verification_submission || null;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Badge Requests</h1>
        <p className="text-lg text-gray-600 mt-1">
          Review and approve provider badge requests. Approved providers get a &quot;Verified&quot; badge on their profile.
        </p>
      </div>

      {/* Search input */}
      <div className="mb-4">
        <div className="relative">
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
            placeholder="Search by provider or submitter name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-lg text-gray-500">Loading...</div>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
            {search ? (
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <p className="text-lg font-semibold text-gray-900">
            {search
              ? "No results found"
              : filter === "pending"
                ? "All caught up!"
                : `No ${filter} badge requests`}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {search
              ? `No providers matching "${search}"`
              : filter === "pending"
                ? "No badge requests waiting for review."
                : `No providers with ${filter} badges.`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Provider</th>
                  {filter === "pending" && (
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Submitter</th>
                  )}
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Location</th>
                  {filter !== "pending" && (
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                  )}
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    {filter === "pending" ? "Submitted" : "Updated"}
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProviders.map((provider) => {
                  const submission = getVerificationSubmission(provider);
                  return (
                    <tr key={provider.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {provider.image_url ? (
                            <img
                              src={provider.image_url}
                              alt={provider.display_name}
                              className="w-10 h-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-sm font-medium">
                                {provider.display_name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-gray-900">{provider.display_name}</p>
                            <p className="text-xs text-gray-400">
                              {provider.type === "organization" ? "Organization" : "Caregiver"}
                              {provider.category && ` · ${provider.category.replace(/_/g, " ")}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      {filter === "pending" && submission && (
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setSelectedProvider(provider)}
                            className="text-left group"
                          >
                            <p className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                              {submission.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {ROLE_LABELS[submission.role] || submission.role}
                            </p>
                          </button>
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {[provider.city, provider.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      {filter !== "pending" && (
                        <td className="px-6 py-4">
                          <Badge
                            variant={
                              filter === "approved"
                                ? "verified"
                                : "rejected"
                            }
                          >
                            {filter === "approved" ? "Badge Approved" : "Badge Rejected"}
                          </Badge>
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {filter === "pending" && submission?.submitted_at
                          ? new Date(submission.submitted_at).toLocaleDateString()
                          : new Date(provider.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {filter === "pending" && (
                            <>
                              <button
                                onClick={() => setSelectedProvider(provider)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Review
                              </button>
                              <button
                                onClick={() => handleAction(provider.id, "approve")}
                                disabled={actionLoading === provider.id}
                                className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                              >
                                {actionLoading === provider.id ? "..." : "Approve"}
                              </button>
                              <button
                                onClick={() => handleAction(provider.id, "reject")}
                                disabled={actionLoading === provider.id}
                                className="px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                              >
                                {actionLoading === provider.id ? "..." : "Reject"}
                              </button>
                            </>
                          )}
                          {filter === "approved" && (
                            <button
                              onClick={() => handleAction(provider.id, "reject")}
                              disabled={actionLoading === provider.id}
                              className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === provider.id ? "..." : "Revoke Badge"}
                            </button>
                          )}
                          {filter === "rejected" && (
                            <button
                              onClick={() => handleAction(provider.id, "approve")}
                              disabled={actionLoading === provider.id}
                              className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === provider.id ? "..." : "Approve Badge"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Verification Review Modal */}
      {selectedProvider && (
        <VerificationReviewModal
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
          onApprove={() => handleAction(selectedProvider.id, "approve")}
          onReject={() => handleAction(selectedProvider.id, "reject")}
          isLoading={actionLoading === selectedProvider.id}
        />
      )}
    </div>
  );
}

// ── Verification Review Modal ──

interface VerificationReviewModalProps {
  provider: Provider;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
}

function VerificationReviewModal({
  provider,
  onClose,
  onApprove,
  onReject,
  isLoading,
}: VerificationReviewModalProps) {
  const submission = provider.metadata?.verification_submission;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Review Badge Request"
      size="xl"
      footer={
        <div className="flex gap-3">
          <button
            onClick={onReject}
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Processing..." : "Approve Badge"}
          </button>
        </div>
      }
    >
      {/* Provider Info */}
      <div className="mb-6 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-4">
          {provider.image_url ? (
            <img
              src={provider.image_url}
              alt={provider.display_name}
              className="w-14 h-14 rounded-xl object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center">
              <span className="text-gray-400 text-lg font-semibold">
                {provider.display_name.charAt(0)}
              </span>
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{provider.display_name}</h3>
            <p className="text-sm text-gray-500">
              {provider.type === "organization" ? "Organization" : "Caregiver"}
              {provider.category && ` · ${provider.category.replace(/_/g, " ")}`}
            </p>
            <p className="text-sm text-gray-500">
              {[provider.city, provider.state].filter(Boolean).join(", ") || "No location"}
            </p>
          </div>
        </div>
      </div>

      {/* Submission Details */}
      {submission ? (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Badge Request Details
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Submitted by</p>
                  <p className="text-sm font-medium text-gray-900">{submission.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Role</p>
                  <p className="text-sm font-medium text-gray-900">
                    {ROLE_LABELS[submission.role] || submission.role}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {submission.email && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                    <p className="text-sm text-gray-700">{submission.email}</p>
                  </div>
                )}
                {submission.phone && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                    <p className="text-sm text-gray-700">{submission.phone}</p>
                  </div>
                )}
              </div>

              {submission.submitted_at && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Submitted</p>
                  <p className="text-sm text-gray-700">{formatDate(submission.submitted_at)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Verification Evidence */}
          {(submission.linkedin_url || submission.business_website_url || submission.manual_review_requested) && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Verification Evidence
              </p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                {submission.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <a
                      href={submission.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#0A66C2] hover:underline"
                    >
                      {submission.linkedin_url}
                    </a>
                  </div>
                )}
                {submission.business_website_url && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                    <a
                      href={submission.business_website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:underline"
                    >
                      {submission.business_website_url}
                    </a>
                  </div>
                )}
                {submission.manual_review_requested && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <span className="text-sm text-amber-700 font-medium">
                      Manual review requested — no LinkedIn or website provided
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Show notes (new field) or affiliation (legacy field) */}
          {(submission.notes || submission.affiliation) && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Additional Notes
              </p>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {submission.notes || submission.affiliation}
                </p>
              </div>
            </div>
          )}

          {/* Provider Contact Info */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Provider Contact
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              {provider.email && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <span className="text-gray-700">{provider.email}</span>
                </div>
              )}
              {provider.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  <span className="text-gray-700">{provider.phone}</span>
                </div>
              )}
              {provider.slug && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <a
                    href={`/provider/${provider.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700"
                  >
                    View public profile →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No badge request details found.</p>
          <p className="text-gray-400 text-xs mt-1">This record may be from an older submission format.</p>
        </div>
      )}
    </Modal>
  );
}

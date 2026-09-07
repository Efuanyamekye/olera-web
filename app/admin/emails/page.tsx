"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/ui/Badge";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ONBOARDING_MESSAGES } from "@/lib/provider-comms/reporting";

type StatusFilter = "all" | "sent" | "failed";

const EMAIL_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  ...ONBOARDING_MESSAGES.map(message => ({ value: message.type, label: `Provider · ${message.label}` })),
  { value: "connection_request", label: "Connection Request" },
  { value: "connection_sent", label: "Connection Sent" },
  { value: "connection_response", label: "Connection Response" },
  { value: "guest_connection", label: "Guest Connection" },
  { value: "new_message", label: "New Message" },
  { value: "question_received", label: "Question Received" },
  { value: "question_answered", label: "Question Answered" },
  { value: "question_confirmation", label: "Question Confirmation" },
  { value: "new_review", label: "New Review" },
  { value: "welcome", label: "Welcome" },
  { value: "verify_email", label: "Verify Email" },
  { value: "verification_code", label: "Verification Code" },
  { value: "verification_decision", label: "Verification Decision" },
  { value: "claim_notification", label: "Claim Notification" },
  { value: "claim_decision", label: "Claim Decision" },
  { value: "matches_live", label: "Matches Live" },
  { value: "matches_nudge", label: "Matches Nudge" },
  { value: "matches_encouragement", label: "Matches Encouragement" },
  { value: "weekly_analytics_digest", label: "Weekly Provider Digest" },
  { value: "provider_reach_out", label: "Provider Reach Out" },
  { value: "reach_out_accepted", label: "Reach Out Accepted" },
  { value: "checklist", label: "Benefits Checklist" },
  { value: "go_live_reminder", label: "Go Live Reminder" },
  { value: "family_profile_incomplete", label: "Family Profile Incomplete" },
  { value: "provider_incomplete_profile", label: "Provider Profile Incomplete" },
  { value: "provider_recommendation", label: "Provider Recommendation" },
  { value: "post_connection_followup", label: "Post-Connection Follow-up" },
  { value: "dormant_reengagement", label: "Dormant Re-engagement" },
  { value: "unread_reminder", label: "Unread Reminder" },
  { value: "daily_digest", label: "Daily Digest" },
  { value: "student_welcome", label: "Student Welcome" },
  { value: "student_returning", label: "Student Returning" },
  { value: "application_received", label: "Application Received" },
  { value: "application_sent", label: "Application Sent" },
  { value: "profile_incomplete_nudge", label: "Profile Incomplete Nudge" },
  { value: "new_candidate_alert", label: "New Candidate Alert" },
  { value: "add_email_notification", label: "Add Email Notification" },
];

const RECIPIENT_TYPE_OPTIONS = [
  { value: "", label: "All recipients" },
  { value: "provider", label: "Provider" },
  { value: "family", label: "Family" },
  { value: "student", label: "Student" },
  { value: "admin", label: "Admin" },
];

interface EmailLog {
  id: string;
  resend_id: string | null;
  recipient: string;
  sender: string;
  subject: string;
  email_type: string;
  recipient_type: string | null;
  provider_id: string | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  html_body?: string;
  // Lifecycle columns populated by the Resend webhook (lib/resend-events.ts).
  // Null until the corresponding event arrives. last_event_type is the most
  // recent transition; the per-event "first" timestamps are write-once.
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
}

const PAGE_SIZE = 25;

function formatEmailType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type LifecycleBadge = {
  label: string;
  variant: "verified" | "rejected" | "pending" | "default";
};

/**
 * Pick the most informative lifecycle status for the row badge.
 * If a webhook event has arrived (last_event_type set), prefer it over the
 * send-time status — "opened" beats "sent" for the at-a-glance read.
 */
function lifecycleBadge(email: EmailLog): LifecycleBadge {
  if (email.last_event_type) {
    switch (email.last_event_type) {
      case "opened":
      case "clicked":
        return { label: email.last_event_type, variant: "verified" };
      case "bounced":
      case "complained":
      case "failed":
        return { label: email.last_event_type, variant: "rejected" };
      case "delivery_delayed":
        return { label: "delayed", variant: "pending" };
      case "delivered":
      case "sent":
        return { label: email.last_event_type, variant: "default" };
    }
  }
  return {
    label: email.status,
    variant: email.status === "sent" ? "verified" : "rejected",
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminEmailsPage() {
  const searchParams = useSearchParams();
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [emailType, setEmailType] = useState(() => searchParams.get("email_type") ?? "");

  // Provider Comms deep links carry both message type and recipient search.
  // Seed the initial request as well as subsequent navigation on this page.
  useEffect(() => {
    setEmailType(searchParams.get("email_type") ?? "");
    const query = searchParams.get("search") ?? "";
    setSearch(query); setDebouncedSearch(query); setPage(0);
  }, [searchParams]);
  const [recipientType, setRecipientType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Search
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Preview
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (emailType) params.set("email_type", emailType);
      if (recipientType) params.set("recipient_type", recipientType);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);

      const res = await fetch(`/api/admin/emails?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails ?? []);
        setTotal(data.total ?? 0);
      } else {
        setError("Failed to load emails. Please try again.");
      }
    } catch {
      setError("Failed to load emails. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, emailType, recipientType, fromDate, toDate, page, debouncedSearch]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
  };

  useEffect(() => {
    setPage(0);
  }, [statusFilter, emailType, recipientType, fromDate, toDate, debouncedSearch]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handlePreview = async (emailId: string) => {
    if (previewId === emailId) {
      setPreviewId(null);
      setPreviewHtml(null);
      return;
    }

    setPreviewId(emailId);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: emailId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.email?.html_body ?? null);
      }
    } catch {
      setPreviewHtml(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (emailType) params.set("email_type", emailType);
    if (recipientType) params.set("recipient_type", recipientType);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    window.open(`/api/admin/emails/export?${params}`, "_blank");
  };

  const tabs: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Sent", value: "sent" },
    { label: "Failed", value: "failed" },
  ];

  return (
    <div>
      <AdminPageHeader
        title="Emails"
        description="Complete log of every email sent through the platform."
        actions={
          <>
            <span className="text-sm text-gray-500">{total} total</span>
            <Link
              href="/admin/emails/gallery"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Email Gallery →
            </Link>
            <button
              onClick={handleExport}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Export CSV
            </button>
          </>
        }
      />

      {/* Search bar */}
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
            placeholder="Search by recipient email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setPage(0);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Status tabs */}
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={[
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                statusFilter === tab.value
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Email type dropdown */}
        <select
          value={emailType}
          onChange={(e) => setEmailType(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
        >
          {EMAIL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Recipient type dropdown */}
        <select
          value={recipientType}
          onChange={(e) => setRecipientType(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
        >
          {RECIPIENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="h-6 w-px bg-gray-200" />

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="From"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="To"
          />
        </div>

        {/* Clear filters */}
        {(emailType || recipientType || fromDate || toDate || statusFilter !== "all") && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setEmailType("");
              setRecipientType("");
              setFromDate("");
              setToDate("");
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-lg text-gray-500">Loading...</div>
        </div>
      ) : emails.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No emails found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Date
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Recipient
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Subject
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Type
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    To
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {emails.map((email) => (
                  <>
                    <tr
                      key={email.id}
                      onClick={() => handlePreview(email.id)}
                      className={[
                        "hover:bg-gray-50 cursor-pointer transition-colors",
                        previewId === email.id ? "bg-primary-50" : "",
                        email.status === "failed" ? "bg-red-50/50" : "",
                      ].join(" ")}
                    >
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(email.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {email.recipient}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-700 truncate max-w-[280px]">
                          {email.subject}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="default">
                          {formatEmailType(email.email_type)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {email.recipient_type && (
                          <span className="text-xs text-gray-500 capitalize">
                            {email.recipient_type}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const lc = lifecycleBadge(email);
                          return <Badge variant={lc.variant}>{lc.label}</Badge>;
                        })()}
                      </td>
                    </tr>
                    {previewId === email.id && (
                      <tr key={`${email.id}-preview`}>
                        <td colSpan={6} className="px-6 py-4 bg-gray-50">
                          {previewLoading ? (
                            <div className="text-sm text-gray-500 py-4 text-center">
                              Loading preview...
                            </div>
                          ) : previewHtml ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>
                                  <strong>From:</strong> {email.sender}
                                </span>
                                <span>
                                  <strong>To:</strong> {email.recipient}
                                </span>
                                {email.resend_id && (
                                  <span>
                                    <strong>Resend ID:</strong>{" "}
                                    {email.resend_id}
                                  </span>
                                )}
                                {email.error_message && (
                                  <span className="text-red-600">
                                    <strong>Error:</strong>{" "}
                                    {email.error_message}
                                  </span>
                                )}
                                {email.delivered_at && (
                                  <span>
                                    <strong>Delivered:</strong>{" "}
                                    {formatDate(email.delivered_at)}
                                  </span>
                                )}
                                {email.first_opened_at && (
                                  <span>
                                    <strong>First opened:</strong>{" "}
                                    {formatDate(email.first_opened_at)}
                                  </span>
                                )}
                                {email.first_clicked_at && (
                                  <span>
                                    <strong>First clicked:</strong>{" "}
                                    {formatDate(email.first_clicked_at)}
                                  </span>
                                )}
                                {email.bounced_at && (
                                  <span className="text-red-600">
                                    <strong>Bounced:</strong>{" "}
                                    {formatDate(email.bounced_at)}
                                  </span>
                                )}
                                {email.complained_at && (
                                  <span className="text-red-600">
                                    <strong>Complained:</strong>{" "}
                                    {formatDate(email.complained_at)}
                                  </span>
                                )}
                              </div>
                              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                                <iframe
                                  srcDoc={previewHtml}
                                  className="w-full border-0"
                                  style={{ minHeight: "400px" }}
                                  title="Email preview"
                                  sandbox=""
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 py-4 text-center">
                              No preview available for this email.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 px-2">
          <p className="text-sm text-gray-500">
            Showing {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
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
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

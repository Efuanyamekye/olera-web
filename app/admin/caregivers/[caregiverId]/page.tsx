"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import StudentCommsTimeline from "@/components/admin/StudentCommsTimeline";
import type { StudentMetadata } from "@/lib/types";

// Helper to check if a string looks like a storage path vs external URL
function isStoragePath(value: string): boolean {
  // Storage paths look like "uuid/filename" or similar, not full URLs
  return !value.startsWith("http://") && !value.startsWith("https://");
}

interface ConnectionRow {
  id: string;
  type: string;
  status: string;
  message: string | null;
  created_at: string;
  to_profile: {
    id: string;
    display_name: string;
    type: string;
    slug: string;
  } | null;
}

interface InvitationRow {
  id: string;
  type: string;
  status: string;
  message: string | null;
  created_at: string;
  from_profile: {
    id: string;
    display_name: string;
    type: string;
    slug: string;
  } | null;
}

interface InterviewRow {
  id: string;
  status: string;
  type: string;
  proposed_time: string;
  confirmed_time: string | null;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  created_at: string;
  provider_profile: {
    id: string;
    display_name: string;
    slug: string;
  } | null;
}

const REJECTION_REASONS = [
  { id: "incomplete_profile", label: "Incomplete profile", description: "Missing required fields or information" },
  { id: "video_required", label: "Video verification needed", description: "Intro video is missing or unclear" },
  { id: "documents_missing", label: "Documents missing or expired", description: "Driver's license or car insurance issues" },
  { id: "profile_quality", label: "Profile quality needs improvement", description: "Bio, experience, or responses need more detail" },
  { id: "availability_incomplete", label: "Availability information incomplete", description: "Schedule or commitment details missing" },
  { id: "verification_failed", label: "Could not verify identity", description: "Information doesn't match records" },
];

function getStatusVariant(status: string): "pending" | "verified" | "rejected" | "default" {
  switch (status) {
    case "pending": return "pending";
    case "accepted":
    case "confirmed":
    case "completed":
      return "verified";
    case "declined":
    case "cancelled":
    case "no_show":
      return "rejected";
    default: return "default";
  }
}

export default function AdminStudentDetailPage() {
  const { caregiverId: studentId } = useParams<{ caregiverId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedRejectReasons, setSelectedRejectReasons] = useState<string[]>([]);
  const [customRejectReason, setCustomRejectReason] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [student, setStudent] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({});
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [connectionCount, setConnectionCount] = useState(0);
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // View a document from private storage by fetching a signed URL
  async function viewDocument(path: string, docType: string) {
    if (!path) return;
    setViewingDoc(docType);

    // Open window synchronously to avoid popup blocker
    const newWindow = window.open("about:blank", "_blank");

    try {
      const res = await fetch("/api/admin/medjobs/view-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (data.url && newWindow) {
        newWindow.location.href = data.url;
      } else if (newWindow) {
        newWindow.close();
        alert(data.error || "Failed to load document");
      } else {
        alert(data.error || "Popup blocked - please allow popups for this site");
      }
    } catch {
      if (newWindow) newWindow.close();
      alert("Failed to load document");
    } finally {
      setViewingDoc(null);
    }
  }

  const fetchStudent = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}`);
      if (!res.ok) {
        router.push("/admin/caregivers");
        return;
      }
      const data = await res.json();
      setStudent(data.student);
      setConnections(data.connections ?? []);
      setInvitations(data.invitations ?? []);
      setInterviews(data.interviews ?? []);
      setConnectionCount(data.connectionCount ?? 0);

      // Initialize form data from student
      const meta = (data.student?.metadata || {}) as StudentMetadata;
      const initial: Record<string, unknown> = {
        display_name: data.student?.display_name || "",
        email: data.student?.email || "",
        phone: data.student?.phone || "",
        city: data.student?.city || "",
        state: data.student?.state || "",
        is_active: data.student?.is_active ?? true,
        university: meta.university || "",
        major: meta.major || "",
        certifications: meta.certifications || [],
        skills: meta.skills || [],
        why_caregiving: meta.why_caregiving || "",
        commitment_statement: meta.commitment_statement || "",
        resume_url: meta.resume_url || "",
        video_intro_url: meta.video_intro_url || "",
      };
      setFormData(initial);
      setOriginalData(initial);
    } catch (err) {
      console.error("Failed to fetch student:", err);
    } finally {
      setLoading(false);
    }
  }, [studentId, router]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    for (const key of Object.keys(formData)) {
      const current = formData[key];
      const original = originalData[key];
      // Handle array comparison
      if (Array.isArray(current) && Array.isArray(original)) {
        if (JSON.stringify(current) !== JSON.stringify(original)) return true;
      } else if (current !== original) {
        return true;
      }
    }
    return false;
  }, [formData, originalData]);

  // Warn on navigation when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function updateField(field: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Email this student a one-click sign-in link.
   *
   * For the call where somebody cannot get into their own application. The
   * link comes from the app's own sender rather than Supabase's, and lasts
   * fifteen days rather than an hour.
   *
   * Says what happened either way. A button that reports success on mail that
   * never left is worse than no button, because somebody is on the phone
   * telling a student to go and check their inbox.
   */
  async function handleSendMagicLink() {
    setSendingLink(true);
    setLinkMessage(null);
    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}/send-magic-link`, {
        method: "POST",
      });
      const json = (await res.json()) as { ok?: boolean; sentTo?: string; error?: string };
      if (!res.ok || !json.ok) {
        setLinkMessage({ type: "error", text: json.error || "Could not send the link." });
        return;
      }
      setLinkMessage({ type: "success", text: `Sign-in link sent to ${json.sentTo}` });
    } catch {
      setLinkMessage({ type: "error", text: "Could not reach the server." });
    } finally {
      setSendingLink(false);
    }
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      const url = `/api/admin/caregivers/${studentId}/export-pdf`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || `Export failed: ${response.status}`);
        return;
      }

      // Get the PDF blob and create a download link
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Extract filename from Content-Disposition header if available
      const disposition = response.headers.get("Content-Disposition");
      let filename = "student-profile.pdf";
      if (disposition) {
        const match = disposition.match(/filename="?([^";\n]+)"?/);
        if (match) filename = match[1];
      }

      // Create a temporary link and click it to trigger download/open
      const link = document.createElement("a");
      link.href = blobUrl;
      link.target = "_blank";
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error("Export PDF error:", err);
      alert("Failed to export PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);

    // Compute delta
    const delta: Record<string, unknown> = {};
    for (const key of Object.keys(formData)) {
      const current = formData[key];
      const original = originalData[key];
      if (Array.isArray(current) && Array.isArray(original)) {
        if (JSON.stringify(current) !== JSON.stringify(original)) {
          delta[key] = current;
        }
      } else if (current !== original) {
        delta[key] = current;
      }
    }

    if (Object.keys(delta).length === 0) {
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(delta),
      });

      if (res.ok) {
        setOriginalData({ ...formData });
        // Also update the student object for display
        setStudent((prev: typeof student) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(delta).filter(([k]) => ["display_name", "email", "phone", "city", "state", "is_active"].includes(k))
          ),
        }));
        setSaveMessage({ type: "success", text: "Changes saved successfully." });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const err = await res.json();
        setSaveMessage({ type: "error", text: err.error || "Failed to save." });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const name = (formData.display_name as string) || student?.display_name || "this student";
    if (isDirty) {
      if (!confirm("You have unsaved changes that will be lost. Continue with delete?")) return;
    }
    if (!confirm(`Permanently delete "${name}"? This will also delete all their applications. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/caregivers");
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  function openApproveModal() {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Approving will discard them. Continue?")) return;
    }
    setShowApproveModal(true);
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}/approve`, { method: "POST" });
      if (res.ok) {
        setShowApproveModal(false);
        await fetchStudent(); // Refresh data
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to approve");
      }
    } catch {
      alert("Failed to approve");
    } finally {
      setApproving(false);
    }
  }

  function openRejectModal() {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Rejecting will discard them. Continue?")) return;
    }
    setShowRejectModal(true);
  }

  async function handleReject() {
    // Build reason from selected reasons + custom text
    const selectedLabels = selectedRejectReasons
      .map(id => REJECTION_REASONS.find(r => r.id === id)?.label)
      .filter(Boolean);
    const parts = [...selectedLabels];
    if (customRejectReason.trim()) {
      parts.push(customRejectReason.trim());
    }
    const reason = parts.join(". ") || undefined;

    setRejecting(true);
    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setShowRejectModal(false);
        setSelectedRejectReasons([]);
        setCustomRejectReason("");
        setRejectReason("");
        await fetchStudent(); // Refresh data
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to reject");
      }
    } catch {
      alert("Failed to reject");
    } finally {
      setRejecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!student) return null;

  const meta = (student.metadata || {}) as StudentMetadata & {
    review_requested_at?: string;
    application_completed?: boolean;
    rejected_at?: string;
    rejected_by?: string;
    rejection_reason?: string;
    approved_at?: string;
    approved_by?: string;
  };
  const isGuest = !student.account_id;
  const isPendingReview = !!meta.review_requested_at && !meta.application_completed;
  const isApproved = !!meta.application_completed;
  // Only show rejection history if not approved and not currently pending (i.e., they can re-request)
  const wasRejected = !!meta.rejected_at && !meta.review_requested_at && !isApproved;

  return (
    <div className="max-w-4xl">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/admin/caregivers"
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </Link>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span className={`text-sm ${saveMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {saveMessage.text}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          {/* For the call where a student cannot get into their own
              application. Sends from the app's sender, not Supabase's. */}
          <div className="flex items-center gap-3">
            {linkMessage && (
              <span className={`text-sm ${linkMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {linkMessage.text}
              </span>
            )}
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              title="Export student profile as PDF"
              className="px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exporting ? "Exporting..." : "Export PDF"}
            </button>
            <button
              onClick={handleSendMagicLink}
              disabled={sendingLink || !student.email}
              title={
                student.email
                  ? `Email a one-click sign-in link to ${student.email}`
                  : "This student has no email address on file"
              }
              className="px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sendingLink ? "Sending..." : "Send Sign-In Link"}
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        {/* Profile Photo */}
        {student.image_url ? (
          <img
            src={student.image_url}
            alt={student.display_name}
            className="w-20 h-20 rounded-xl object-cover border border-gray-200"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{student.display_name}</h1>
            <a
              href={`/admin/caregivers/${studentId}/portal-preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title="Preview student portal view"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Portal Preview
            </a>
          </div>
          <div className="flex items-center gap-3 mt-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Student
          </span>
          {isGuest ? (
            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
              Guest
            </span>
          ) : (
            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
              Member
            </span>
          )}
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            isApproved && student.is_active
              ? "bg-green-100 text-green-700"
              : isApproved && !student.is_active
              ? "bg-amber-100 text-amber-700"
              : isPendingReview
              ? "bg-orange-100 text-orange-700"
              : "bg-gray-100 text-gray-600"
          }`}>
            {isApproved && student.is_active
              ? "Live"
              : isApproved && !student.is_active
              ? "Paused"
              : isPendingReview
              ? "Pending Review"
              : "Not Live"}
          </span>
          <span className="text-sm text-gray-500">
            {connectionCount} application{connectionCount !== 1 ? "s" : ""}
          </span>
        </div>
        </div>
      </div>

      {/* Review Status Banner */}
      {isPendingReview && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-900">Review Requested</h2>
                <p className="text-sm text-amber-700 mt-1">
                  This student requested profile review on {new Date(meta.review_requested_at!).toLocaleDateString()}.
                  Approve to make their profile visible to providers.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:shrink-0">
              <button
                onClick={openRejectModal}
                disabled={rejecting}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
              <button
                onClick={openApproveModal}
                disabled={approving}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection History */}
      {wasRejected && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">
                Previously rejected on {new Date(meta.rejected_at!).toLocaleDateString()}
                {meta.rejected_by && <span className="font-normal text-red-600"> by {meta.rejected_by}</span>}
              </p>
              {meta.rejection_reason && (
                <p className="text-sm text-red-700 mt-1">Reason: {meta.rejection_reason}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approval Status */}
      {isApproved && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-800">
                Profile approved
                {meta.approved_at && <span className="font-normal text-green-600"> on {new Date(meta.approved_at).toLocaleDateString()}</span>}
                {meta.approved_by && <span className="font-normal text-green-600"> by {meta.approved_by}</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Identity */}
        <Section title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="Name" value={formData.display_name as string} onChange={(v) => updateField("display_name", v)} />
            <FieldInput label="Email" value={formData.email as string} onChange={(v) => updateField("email", v)} />
            <FieldInput label="Phone" value={formData.phone as string} onChange={(v) => updateField("phone", v)} />
            <FieldInput label="City" value={formData.city as string} onChange={(v) => updateField("city", v)} />
            <FieldInput label="State" value={formData.state as string} onChange={(v) => updateField("state", v)} />
            <ReadOnlyField label="Source" value={student.source} />
            <ReadOnlyField
              label="Profile Completeness"
              value={meta.profile_completeness ? `${meta.profile_completeness}%` : null}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Visibility</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active as boolean}
                  onChange={(e) => updateField("is_active", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              <p className="text-xs text-gray-400">
                {isApproved
                  ? "Uncheck to pause visibility to providers"
                  : "Profile must be approved before it becomes visible"}
              </p>
            </div>
          </div>
        </Section>

        {/* Education */}
        <Section title="Education">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldInput label="University" value={formData.university as string} onChange={(v) => updateField("university", v)} />
              <FieldInput label="Major" value={formData.major as string} onChange={(v) => updateField("major", v)} />
            </div>
          </Section>

        {/* Experience */}
        <Section title="Experience">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Certifications"
              value={(formData.certifications as string[])?.join(", ") || ""}
              onChange={(v) => updateField("certifications", v ? v.split(",").map(s => s.trim()).filter(Boolean) : [])}
              placeholder="CNA, CPR, BLS (comma-separated)"
            />
            <FieldInput
              label="Skills"
              value={(formData.skills as string[])?.join(", ") || ""}
              onChange={(v) => updateField("skills", v ? v.split(",").map(s => s.trim()).filter(Boolean) : [])}
              placeholder="Patient care, Medication (comma-separated)"
            />
          </div>
          {meta.experience_entries && meta.experience_entries.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 transition-colors">
                Experience entries ({meta.experience_entries.length})
              </summary>
              <div className="mt-3 space-y-3">
                {meta.experience_entries.map((entry) => (
                  <div key={entry.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                      <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                        {entry.tag}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{entry.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {entry.start_date} – {entry.end_date || "Present"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Section>

        {/* Why Caregiving */}
        <Section title="Why I Want to Be a Caregiver">
          <textarea
            value={(formData.why_caregiving as string) || ""}
            onChange={(e) => updateField("why_caregiving", e.target.value)}
            rows={4}
            placeholder="Student's motivation for caregiving..."
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </Section>

        {/* Screening Questions (Scenario Responses) */}
        <Section title="Screening Questions">
          {meta.scenario_responses && meta.scenario_responses.length > 0 ? (
            <div className="space-y-4">
              {meta.scenario_responses.map((response, index) => (
                <div key={index} className="border-l-2 border-primary-200 pl-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">{response.question}</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {response.answer || <span className="text-gray-400 italic">No answer provided</span>}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No screening questions answered</p>
          )}
        </Section>

        {/* Availability */}
        <Section title="Availability">
          <div className="mt-0">
            <ReadOnlyField label="Availability Notes" value={meta.availability_notes} />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Commitment Statement</label>
            <textarea
              value={(formData.commitment_statement as string) || ""}
              onChange={(e) => updateField("commitment_statement", e.target.value)}
              rows={3}
              placeholder="Student's commitment to caregiving..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 50 characters required for profile completeness</p>
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-500 mb-3">Seasonal Availability</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["spring", "summer", "fall", "winter"] as const).map((season) => {
                const data = meta.year_round_availability?.[season];
                const statusColors = {
                  available: "bg-green-100 text-green-700 border-green-200",
                  limited: "bg-amber-100 text-amber-700 border-amber-200",
                  unavailable: "bg-gray-100 text-gray-500 border-gray-200",
                };
                return (
                  <div
                    key={season}
                    className={`p-3 rounded-lg border ${data ? (statusColors[data.status as keyof typeof statusColors] || statusColors.unavailable) : "bg-gray-50 border-gray-200"}`}
                  >
                    <p className="text-sm font-medium capitalize">{season}</p>
                    <p className={`text-xs capitalize ${data ? "" : "text-gray-400 italic"}`}>
                      {data?.status || "Not set"}
                    </p>
                    {data?.notes && <p className="text-xs mt-1 opacity-75">{data.notes}</p>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-500 mb-3">Weekly Schedule</p>
            {meta.availability_schedule && Object.keys(meta.availability_schedule).length > 0 ? (
              <div className="divide-y divide-gray-100">
                {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((day) => {
                  const slots = meta.availability_schedule?.[day] || [];
                  if (slots.length === 0) return null;
                  const fullDay = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[day];
                  return (
                    <div key={day} className="py-2 first:pt-0 last:pb-0 flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-gray-700">{fullDay}</span>
                      <span className="text-sm text-gray-500">
                        {slots.map((slot, i) => {
                          const fmt = (t: string) => {
                            const [hStr, mStr] = t.split(":");
                            const h = parseInt(hStr, 10);
                            const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
                            const ampm = h >= 12 ? "pm" : "am";
                            return mStr === "00" ? `${hour}${ampm}` : `${hour}:${mStr}${ampm}`;
                          };
                          return typeof slot === "string" ? slot : `${fmt(slot.start)}–${fmt(slot.end)}`;
                        }).join(", ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Not provided</p>
            )}
          </div>
        </Section>

        {/* Documents & Media */}
        <Section title="Documents & Media">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Resume URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={(formData.resume_url as string) || ""}
                  onChange={(e) => updateField("resume_url", e.target.value)}
                  placeholder="https://... or storage path"
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
                {typeof formData.resume_url === "string" && formData.resume_url && (
                  isStoragePath(formData.resume_url) ? (
                    <button
                      type="button"
                      onClick={() => viewDocument(formData.resume_url as string, "resume")}
                      disabled={viewingDoc === "resume"}
                      className="px-3 py-2.5 text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
                    >
                      {viewingDoc === "resume" ? "..." : "View →"}
                    </button>
                  ) : (
                    <a
                      href={formData.resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View →
                    </a>
                  )
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Video Intro URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={(formData.video_intro_url as string) || ""}
                  onChange={(e) => updateField("video_intro_url", e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
                {typeof formData.video_intro_url === "string" && formData.video_intro_url && (
                  <a
                    href={formData.video_intro_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    View →
                  </a>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Driver&apos;s License</label>
              {meta.drivers_license_url ? (
                <div className="flex items-center justify-between gap-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary-800">Uploaded</p>
                      {meta.drivers_license_uploaded_at && (
                        <p className="text-xs text-primary-600 truncate">
                          {new Date(meta.drivers_license_uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {meta.drivers_license_expiration && ` · Expires ${meta.drivers_license_expiration}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => viewDocument(meta.drivers_license_url!, "license")}
                    disabled={viewingDoc === "license"}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-100 transition-colors disabled:opacity-50"
                  >
                    {viewingDoc === "license" ? "..." : "View"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-amber-700">Not uploaded</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Car Insurance</label>
              {meta.car_insurance_url ? (
                <div className="flex items-center justify-between gap-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary-800">Uploaded</p>
                      {meta.car_insurance_uploaded_at && (
                        <p className="text-xs text-primary-600 truncate">
                          {new Date(meta.car_insurance_uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {meta.car_insurance_expiration && ` · Expires ${meta.car_insurance_expiration}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => viewDocument(meta.car_insurance_url!, "insurance")}
                    disabled={viewingDoc === "insurance"}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-100 transition-colors disabled:opacity-50"
                  >
                    {viewingDoc === "insurance" ? "..." : "View"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-amber-700">Not uploaded</p>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Commitments & Pledges */}
        <Section title="Commitments & Pledges">
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1.5 rounded-full text-sm ${meta.advance_notice_pledge ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
              {meta.advance_notice_pledge ? "✓" : "○"} Advance Notice Pledge
            </span>
            <span className={`px-3 py-1.5 rounded-full text-sm ${meta.prn_willing ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
              {meta.prn_willing ? "✓" : "○"} PRN Available
            </span>
          </div>
        </Section>

        {/* Interview History */}
        {interviews.length > 0 && (
          <Section title="Interview History">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Provider</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {interviews.map((interview) => (
                    <tr key={interview.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {interview.provider_profile?.slug ? (
                          <Link
                            href={`/provider/${interview.provider_profile.slug}`}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {interview.provider_profile.display_name}
                          </Link>
                        ) : (
                          <span className="text-gray-900">{interview.provider_profile?.display_name ?? "Unknown"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="default">{interview.type}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={getStatusVariant(interview.status)}>{interview.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {interview.confirmed_time
                          ? new Date(interview.confirmed_time).toLocaleString()
                          : new Date(interview.proposed_time).toLocaleString() + " (proposed)"
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Applications (connections made by student) */}
        <Section title="Applications">
          {connections.length === 0 ? (
            <p className="text-sm text-gray-400">No applications found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Provider</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {connections.map((conn) => (
                    <tr key={conn.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {conn.to_profile?.slug ? (
                          <Link
                            href={`/provider/${conn.to_profile.slug}`}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {conn.to_profile.display_name}
                          </Link>
                        ) : (
                          <span className="text-gray-900">{conn.to_profile?.display_name ?? "Unknown"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="default">{conn.type}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={getStatusVariant(conn.status)}>{conn.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(conn.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Invitations (from providers) */}
        {invitations.length > 0 && (
          <Section title="Invitations Received">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Provider</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {inv.from_profile?.slug ? (
                          <Link
                            href={`/provider/${inv.from_profile.slug}`}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {inv.from_profile.display_name}
                          </Link>
                        ) : (
                          <span className="text-gray-900">{inv.from_profile?.display_name ?? "Unknown"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={getStatusVariant(inv.status)}>{inv.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Email History */}
        <Section title="Email History">
          <StudentCommsTimeline
            studentId={studentId}
            viewAllEmailsHref={student.email ? `/admin/emails?recipient=${encodeURIComponent(student.email)}` : undefined}
          />
        </Section>

        {/* Danger Zone */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-red-800">Danger Zone</h2>
              <p className="text-sm text-red-600 mt-1">
                Permanently delete this student and all their applications. This cannot be undone.
              </p>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting..." : "Delete Student"}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom save bar */}
      {isDirty && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 py-4 mt-6 -mx-4 px-4 sm:-mx-6 sm:px-6 flex items-center justify-end gap-3">
          <span className="text-sm text-amber-600">You have unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Approve Profile</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Are you sure you want to approve <strong>{student?.display_name}</strong>?
                </p>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-800">
                <strong>What happens next:</strong>
              </p>
              <ul className="text-sm text-green-700 mt-2 space-y-1">
                <li>• Profile becomes visible to providers</li>
                <li>• Student can receive interview requests</li>
                <li>• Approval email is sent to the student</li>
              </ul>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={approving}
                className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {approving ? "Approving..." : "Yes, Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Reject Profile Review</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Select the reason(s) for rejecting <strong>{student?.display_name}</strong>&apos;s profile.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select reason(s)
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {REJECTION_REASONS.map((reason) => (
                  <label
                    key={reason.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedRejectReasons.includes(reason.id)
                        ? "border-red-300 bg-red-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRejectReasons.includes(reason.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRejectReasons([...selectedRejectReasons, reason.id]);
                        } else {
                          setSelectedRejectReasons(selectedRejectReasons.filter(r => r !== reason.id));
                        }
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{reason.label}</p>
                      <p className="text-xs text-gray-500">{reason.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional notes (optional)
              </label>
              <textarea
                value={customRejectReason}
                onChange={(e) => setCustomRejectReason(e.target.value)}
                placeholder="Add specific feedback for the student..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={2}
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-800">
                The student will receive an email with your feedback and a link to book a call with Dr. DuBose if they need help.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRejectReasons([]);
                  setCustomRejectReason("");
                  setRejectReason("");
                }}
                disabled={rejecting}
                className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || (selectedRejectReasons.length === 0 && !customRejectReason.trim())}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {rejecting ? "Rejecting..." : "Reject Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value || <span className="text-gray-400">Not provided</span>}</p>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
      />
    </div>
  );
}

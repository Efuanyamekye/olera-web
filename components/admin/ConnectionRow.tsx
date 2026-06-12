"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  formatAge,
  type ConnectionTemperature,
  type NextStep,
} from "@/lib/connection-temperature";
import EmailStatusPill from "@/components/admin/EmailStatusPill";
import EmailPreviewModal from "@/components/admin/EmailPreviewModal";
import ProviderFactSheetModal from "@/components/admin/ProviderFactSheetModal";
import EmailVerificationBadge, { type VerificationStatus } from "@/components/admin/EmailVerificationBadge";

interface ProfileCompleteness {
  percentage: number;
  missingFields: string[];
}

export type WorkflowState = "needs_attention" | "awaiting_provider" | "awaiting_family" | "connected" | "stuck";
export type EngagementLevel = "new" | "viewed" | "connected" | "needs_follow_up";
export type FamilyEngagementLevel = "new" | "awaiting" | "connected" | "needs_follow_up";
export type Perspective = "provider" | "family";

export interface ConnectionRowData {
  id: string;
  created_at?: string;
  family: {
    id?: string | null;
    display_name: string | null;
    email?: string | null;
    phone?: string | null;
    image_url?: string | null;
    completeness?: ProfileCompleteness;
    careType?: string | null;
    timeline?: string | null;
  };
  provider: {
    id?: string | null;
    display_name: string | null;
    slug?: string | null;
    source_provider_id?: string | null;
    email?: string | null;
    phone?: string | null;
    image_url?: string | null;
    is_active?: boolean;
    completeness?: ProfileCompleteness;
  };
  messagePreview?: string;
  responded?: boolean;
  familyRepliedAfterProvider?: boolean;
  providerNudgeCount?: number;
  familyNudgeCount?: number;
  providerNudgedAt?: string | null;
  familyNudgedAt?: string | null;
  workflowState?: WorkflowState | null;
  waitingOn?: "provider" | "family" | null;
  lastMessageAt?: string | null;
  engagementLevel?: EngagementLevel;
  familyEngagementLevel?: FamilyEngagementLevel;
  temperature: ConnectionTemperature;
  /** Provider explicitly marked as replied in their drawer */
  markedReplied?: boolean;
  /** Provider archived with "already_connected" reason */
  alreadyConnected?: boolean;
  /** Admin manually marked this connection (verified off-platform activity) */
  adminOverride?: {
    status: "viewed" | "connected";
    marked_at: string;
    marked_by_email?: string;
    reason: string;
    notes?: string;
  } | null;
  /** Provider archived this lead in their portal */
  archived?: boolean;
  archiveReason?: "not_a_fit" | "not_accepting_clients" | "unable_to_reach" | "other" | null;
  archivedAt?: string;
  /** Email issue type for "Needs Email" tab */
  emailIssueType?: "no_email" | "failed" | "invalid" | null;
  /** Admin archived this provider - no emails sent to them */
  isProviderArchived?: boolean;
}

// Per-provider engagement data from list API (does NOT include "messaged")
interface Engagement {
  email_clicked: boolean;
  lead_opened: boolean;
  contact_revealed: boolean;
  phone_copied: boolean;
  email_copied: boolean;
  phone_clicked: boolean;
  email_link_clicked: boolean;
  continue_in_inbox?: boolean;
  // Note: "messaged" is passed separately since it's per-connection, not per-provider
}

// Detail API includes messaged since it's for a single connection
interface DetailEngagement extends Engagement {
  messaged: boolean;
}

interface ThreadEntry {
  text: string;
  created_at: string | null;
  is_auto_reply: boolean;
  role: "provider" | "family" | "system";
}

interface EmailTrailEntry {
  id: string;
  email_type: string | null;
  recipient: string | null;
  recipient_type: string | null;
  status: string | null;
  created_at: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Detail {
  id: string;
  family: {
    id: string | null;
    display_name: string | null;
    email: string | null;
    phone: string | null;
    nudgeCount: number;
    lastNudgedAt: string | null;
    careType: string | null;
    timeline: string | null;
  };
  provider: {
    display_name: string | null;
    email: string | null;
    phone: string | null;
    hasEmail: boolean;
    nudgeCount: number;
    lastNudgedAt: string | null;
    slug: string | null;
  };
  thread: ThreadEntry[];
  emails: EmailTrailEntry[];
  engagement: DetailEngagement;
  temperature: ConnectionTemperature;
  nextStep: NextStep;
  // Archive information (when provider declined the lead)
  archived: boolean;
  archiveReason: string | null;
  archiveMessage: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  provider_nudge: "Nudge",
  add_email_notification: "Lead notification",
  connection_request: "Lead notification",
  guest_connection: "Lead notification",
  question_received: "Question",
  new_message: "Message",
  post_connection_followup: "Follow-up",
};

function emailLabel(type: string | null): string {
  if (!type) return "Email";
  return EMAIL_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// Map archive reason codes to display labels
function getArchiveReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Archived";
  switch (reason) {
    case "already_connected":
      return "Already connected";
    case "not_a_fit":
      return "Not a good fit";
    case "not_accepting_clients":
      return "Not accepting new clients";
    case "unable_to_reach":
      return "Unable to reach";
    case "other":
      return "Other";
    default:
      return "Archived";
  }
}

// Calculate days since archived
function daysAgo(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  // Guard against invalid date strings
  if (isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// Engagement badges component
// Note: `messaged`, `markedReplied`, `alreadyConnected` are passed separately
// because they're per-connection, not per-provider like the other engagement fields.
function EngagementBadges({
  engagement,
  messaged = false,
  markedReplied = false,
  alreadyConnected = false,
  adminOverride = null,
  compact = false
}: {
  engagement?: Engagement | DetailEngagement;
  messaged?: boolean;
  markedReplied?: boolean;
  alreadyConnected?: boolean;
  adminOverride?: {
    status: "viewed" | "connected";
    reason: string;
  } | null;
  compact?: boolean;
}) {
  if (!engagement && !markedReplied && !alreadyConnected && !adminOverride) return null;

  // Check if messaged is in the engagement object (DetailEngagement) or passed separately
  const isMessaged = messaged || (engagement && 'messaged' in engagement && engagement.messaged);

  // Build badges with specific labels for what the provider did
  const adminVerifiedLabel = adminOverride
    ? `Admin verified: ${adminOverride.status === "viewed" ? "Viewed" : "Connected"}`
    : "";

  const badges: { icon: string; label: string; active: boolean; highlight?: boolean }[] = [
    { icon: "👁", label: "Viewed", active: engagement?.lead_opened ?? false },
    { icon: "📋", label: "Copied Phone", active: engagement?.phone_copied ?? false },
    { icon: "📋", label: "Copied Email", active: engagement?.email_copied ?? false },
    { icon: "📞", label: "Called", active: engagement?.phone_clicked ?? false },
    { icon: "📧", label: "Emailed", active: engagement?.email_link_clicked ?? false },
    { icon: "📨", label: "Continued in Inbox", active: engagement?.continue_in_inbox ?? false },
    { icon: "💬", label: "Messaged", active: isMessaged ?? false },
    { icon: "✓", label: "Marked Replied", active: markedReplied },
    { icon: "🤝", label: "Already Connected", active: alreadyConnected },
    { icon: "✓", label: adminVerifiedLabel, active: !!adminOverride, highlight: true },
  ];

  const activeBadges = badges.filter(b => b.active);
  if (activeBadges.length === 0) return null;

  if (compact) {
    return (
      <span className="flex items-center gap-0.5 text-sm" title={activeBadges.map(b => b.label).join(", ")}>
        {activeBadges.map(b => <span key={b.label}>{b.icon}</span>)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {activeBadges.map(b => (
        <span
          key={b.label}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
            b.highlight
              ? "bg-blue-100 text-blue-700 font-medium"
              : "bg-gray-100 text-gray-600"
          }`}
          title={b.highlight && adminOverride ? adminOverride.reason : undefined}
        >
          {b.icon} {b.label}
        </span>
      ))}
    </div>
  );
}

export default function ConnectionRow({
  c,
  perspective = "provider",
  engagement,
  onArchiveConnection,
  onNudgeSuccess,
}: {
  c: ConnectionRowData;
  perspective?: Perspective;
  engagement?: Engagement;
  /** Called when user clicks archive/unarchive icon on connection row */
  onArchiveConnection?: (connectionId: string, familyName: string | null, providerName: string | null, isArchived: boolean) => void;
  onNudgeSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Nudge action state
  const [nudging, setNudging] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Email preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{
    from: string;
    to: string;
    subject: string;
    html: string;
    endpoint: string;
    successText: string;
    warning?: string | null;
  } | null>(null);

  // Add email state
  const [addingEmail, setAddingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Edit email state
  const [editingEmail, setEditingEmail] = useState(false);
  const [editEmailInput, setEditEmailInput] = useState("");
  const [editEmailError, setEditEmailError] = useState<string | null>(null);
  const [editEmailSuccess, setEditEmailSuccess] = useState(false);
  const [editingEmailLoading, setEditingEmailLoading] = useState(false);
  const [pendingEmailEdit, setPendingEmailEdit] = useState<{ oldEmail: string; newEmail: string } | null>(null);
  const editEmailTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mark as Connected modal state
  const [showMarkStatusModal, setShowMarkStatusModal] = useState(false);
  const [markStatusReason, setMarkStatusReason] = useState("");
  const [markStatusNotes, setMarkStatusNotes] = useState("");
  const [markingStatus, setMarkingStatus] = useState(false);
  const [markStatusError, setMarkStatusError] = useState<string | null>(null);
  const [markStatusSuccess, setMarkStatusSuccess] = useState(false);

  // Find email state
  const [findingEmail, setFindingEmail] = useState(false);
  const [foundEmails, setFoundEmails] = useState<string[]>([]);
  // Map of email -> source URL for all candidates
  const [emailToUrlMap, setEmailToUrlMap] = useState<Map<string, string>>(new Map());
  const [findEmailError, setFindEmailError] = useState<string | null>(null);
  const [emailSource, setEmailSource] = useState<"scrape" | "perplexity" | null>(null);
  const [foundUrl, setFoundUrl] = useState<string | null>(null);
  const [isCachedResult, setIsCachedResult] = useState(false);
  const [autoSuggestAttempted, setAutoSuggestAttempted] = useState(false);

  // Email verification state
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("idle");
  const [candidateStatuses, setCandidateStatuses] = useState<Map<string, VerificationStatus>>(new Map());
  const [forceSubmit, setForceSubmit] = useState(false);
  const verifyDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (editEmailTimeoutRef.current) {
        clearTimeout(editEmailTimeoutRef.current);
      }
      if (verifyDebounceRef.current) {
        clearTimeout(verifyDebounceRef.current);
      }
    };
  }, []);

  // Verify a single email address
  const verifyEmail = useCallback(async (email: string): Promise<VerificationStatus> => {
    if (!email || !email.includes("@")) return "idle";

    try {
      const res = await fetch("/api/admin/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) return "unknown";

      const data = await res.json();
      const result = data.results?.[0];
      if (!result) return "unknown";

      return result.status as VerificationStatus;
    } catch {
      return "unknown";
    }
  }, []);

  // Batch verify multiple email addresses
  const batchVerifyEmails = useCallback(async (emails: string[]): Promise<Map<string, VerificationStatus>> => {
    const results = new Map<string, VerificationStatus>();
    if (emails.length === 0) return results;

    // Initialize all as verifying
    emails.forEach(e => results.set(e, "verifying"));

    try {
      const res = await fetch("/api/admin/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });

      if (!res.ok) {
        emails.forEach(e => results.set(e, "unknown"));
        return results;
      }

      const data = await res.json();
      for (const r of data.results || []) {
        results.set(r.email, r.status as VerificationStatus);
      }

      // Fill in any missing with unknown
      emails.forEach(e => {
        if (!results.has(e)) results.set(e, "unknown");
      });

      return results;
    } catch {
      emails.forEach(e => results.set(e, "unknown"));
      return results;
    }
  }, []);

  // Handle email input blur - trigger verification after debounce
  const handleEmailBlur = useCallback((email: string, mode: "edit" | "add") => {
    // Clear any pending verification
    if (verifyDebounceRef.current) {
      clearTimeout(verifyDebounceRef.current);
    }

    // Skip verification if email is empty or invalid format
    if (!email || !email.includes("@")) {
      setVerificationStatus("idle");
      return;
    }

    // Debounce verification
    verifyDebounceRef.current = setTimeout(async () => {
      setVerificationStatus("verifying");
      const status = await verifyEmail(email);
      setVerificationStatus(status);
    }, 300);
  }, [verifyEmail]);

  // Auto-suggest email when drawer opens and provider has no email
  useEffect(() => {
    if (open && detail && !detail.provider.email && !autoSuggestAttempted && c.provider.id) {
      setAutoSuggestAttempted(true);

      // Automatically find email
      (async () => {
        setFindingEmail(true);
        setFindEmailError(null);
        setEmailSource(null);
        setFoundUrl(null);
        setFoundEmails([]);
        setEmailToUrlMap(new Map());
        setIsCachedResult(false);
        setCandidateStatuses(new Map());

        try {
          const res = await fetch("/api/admin/connections/find-provider-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: c.provider.id }),
          });

          const data = await res.json();

          if (res.ok && data.email) {
            setEmailInput(data.email);
            setEmailSource(data.source);
            setFoundUrl(data.foundUrl || null);
            setIsCachedResult(data.cached || false);

            const candidates: string[] = data.candidates?.length > 0 ? data.candidates : [data.email];
            setFoundEmails(candidates);

            // Build email -> URL map from candidatesWithUrls
            if (data.candidatesWithUrls && Array.isArray(data.candidatesWithUrls)) {
              const urlMap = new Map<string, string>();
              for (const c of data.candidatesWithUrls) {
                if (c.email && c.foundUrl) {
                  urlMap.set(c.email, c.foundUrl);
                }
              }
              setEmailToUrlMap(urlMap);
            }

            // Batch verify all candidates
            if (candidates.length > 0) {
              // Set all to verifying initially (use lowercase for consistency with API response)
              setCandidateStatuses(new Map(candidates.map(e => [e.toLowerCase(), "verifying" as VerificationStatus])));

              const verifiedStatuses = await batchVerifyEmails(candidates);
              setCandidateStatuses(verifiedStatuses);

              // Also set the main input verification status (normalize to lowercase for lookup)
              const mainStatus = verifiedStatuses.get(data.email.toLowerCase());
              if (mainStatus) {
                setVerificationStatus(mainStatus);
              }
            }
          } else if (res.ok && !data.email) {
            // No email found or insufficient data
            const errorMsg = data.error || ("No email found" + (data.cached ? " (cached)" : ""));
            setFindEmailError(errorMsg);
            setIsCachedResult(data.cached || false);
          } else {
            // API error
            setFindEmailError(data.error || "Failed to find email");
          }
        } catch {
          // Network error
          setFindEmailError("Network error");
        } finally {
          setFindingEmail(false);
        }
      })();
    }

    // Reset auto-suggest flag when drawer closes
    if (!open) {
      setAutoSuggestAttempted(false);
      setFindEmailError(null);
      setEmailSource(null);
      setFoundUrl(null);
      setIsCachedResult(false);
      setFoundEmails([]);
      setEmailToUrlMap(new Map());
      setVerificationStatus("idle");
      setCandidateStatuses(new Map());
      setForceSubmit(false);
    }
  }, [open, detail, autoSuggestAttempted, c.provider.id, batchVerifyEmails]);

  // Fact sheet modal state
  const [showFactSheet, setShowFactSheet] = useState(false);

  // Email trail state (collapsed by default)
  const [showEmails, setShowEmails] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [emailHtmlCache, setEmailHtmlCache] = useState<Record<string, string | null>>({});
  const [emailHtmlLoading, setEmailHtmlLoading] = useState<string | null>(null);

  // Fetch email HTML when expanding
  async function toggleEmailPreview(emailId: string) {
    if (expandedEmailId === emailId) {
      setExpandedEmailId(null);
      return;
    }
    setExpandedEmailId(emailId);
    if (emailHtmlCache[emailId] !== undefined) return;
    setEmailHtmlLoading(emailId);
    try {
      const res = await fetch(`/api/admin/emails/${emailId}/html`);
      if (res.ok) {
        const data = await res.json();
        setEmailHtmlCache((prev) => ({ ...prev, [emailId]: data.html_body }));
      } else {
        setEmailHtmlCache((prev) => ({ ...prev, [emailId]: null }));
      }
    } catch {
      setEmailHtmlCache((prev) => ({ ...prev, [emailId]: null }));
    } finally {
      setEmailHtmlLoading((prev) => (prev === emailId ? null : prev));
    }
  }

  const family = c.family.display_name || "A family";
  const provider = c.provider.display_name || "Provider";
  const age = formatAge(c.temperature.stalenessMs);

  // Get care type and timeline for collapsed row
  const careType = c.family.careType;
  const timeline = c.family.timeline;

  // Get engagement status for collapsed row display
  const getEngagementStatus = (): { status: string; color: string; nudgeInfo: string | null } => {
    const providerNudges = c.providerNudgeCount || 0;
    const familyNudges = c.familyNudgeCount || 0;

    if (perspective === "family") {
      // Family perspective - show family engagement level
      const famLevel = c.familyEngagementLevel || "new";

      switch (famLevel) {
        case "connected":
          return { status: "Connected", color: "text-emerald-600", nudgeInfo: null };
        case "awaiting":
          return { status: "Awaiting Reply", color: "text-amber-600", nudgeInfo: familyNudges > 0 ? `Nudged ${familyNudges}x` : null };
        case "needs_follow_up":
          return { status: "Needs Follow-up", color: "text-red-600", nudgeInfo: familyNudges > 0 ? `Family nudged ${familyNudges}x` : null };
        case "new":
        default:
          return { status: "New", color: "text-blue-600", nudgeInfo: null };
      }
    } else {
      // Provider perspective - show provider engagement level (existing logic)
      const engLevel = c.engagementLevel || "new";

      // For non-connected states, show who we're waiting on
      const waitingOnText = c.waitingOn === "family" ? " (awaiting family)" : "";
      const nudgeCount = c.waitingOn === "family" ? familyNudges : providerNudges;

      switch (engLevel) {
        case "connected":
          return { status: "Connected", color: "text-emerald-600", nudgeInfo: null };
        case "viewed":
          return { status: `Viewed${waitingOnText}`, color: "text-amber-600", nudgeInfo: nudgeCount > 0 ? `Nudged ${nudgeCount}x` : null };
        case "needs_follow_up":
          return { status: "Needs Follow-up", color: "text-red-600", nudgeInfo: c.waitingOn === "family" ? `Family nudged ${familyNudges}x` : `Provider nudged ${providerNudges}x` };
        case "new":
        default:
          return { status: "New", color: "text-blue-600", nudgeInfo: providerNudges > 0 ? `Nudged ${providerNudges}x` : null };
      }
    }
  };

  const engagementStatus = getEngagementStatus();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(`/api/admin/connections/${c.id}`);
        if (!res.ok) throw new Error("failed");
        setDetail(await res.json());
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
  }

  // Fetch email preview and show modal
  async function showNudgePreview(endpoint: string, successText: string) {
    setLoadingPreview(true);
    setNudgeMsg(null);
    try {
      const body: { connection_id: string; family_profile_id?: string } = {
        connection_id: c.id,
      };

      // Validate family_profile_id for family nudge endpoint
      if (endpoint.includes("nudge-family")) {
        if (!c.family.id) {
          setNudgeMsg({ ok: false, text: "Family profile ID missing - cannot send nudge" });
          setLoadingPreview(false);
          return;
        }
        body.family_profile_id = c.family.id;
      }

      const res = await fetch(`${endpoint}?preview=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.preview) {
        setEmailPreview({
          from: data.from,
          to: data.to,
          subject: data.subject,
          html: data.html,
          endpoint,
          successText,
          warning: data.warning || null,
        });
        setShowPreviewModal(true);
      } else {
        setNudgeMsg({ ok: false, text: data.error || "Failed to load preview" });
      }
    } catch {
      setNudgeMsg({ ok: false, text: "Network error" });
    } finally {
      setLoadingPreview(false);
    }
  }

  // Actually send the nudge (called from modal confirm)
  async function confirmSendNudge() {
    if (!emailPreview) return;

    setNudging(true);
    setNudgeMsg(null);
    try {
      const body: { connection_id: string; family_profile_id?: string } = {
        connection_id: c.id,
      };
      // If nudging family, include family_profile_id
      if (emailPreview.endpoint.includes("nudge-family") && c.family.id) {
        body.family_profile_id = c.family.id;
      }

      const res = await fetch(emailPreview.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNudgeMsg({ ok: true, text: emailPreview.successText });
        setShowPreviewModal(false);
        setEmailPreview(null);
        // Notify parent to refresh list - connection should move to "Awaiting" tab
        onNudgeSuccess?.();
      } else {
        setNudgeMsg({ ok: false, text: data.error || "Couldn't send." });
        setShowPreviewModal(false);
      }
    } catch {
      setNudgeMsg({ ok: false, text: "Network error — not sent." });
      setShowPreviewModal(false);
    } finally {
      setNudging(false);
    }
  }

  // Mark connection as connected (admin verification of off-platform activity)
  async function handleMarkStatus() {
    if (!markStatusReason.trim()) {
      setMarkStatusError("Please select a reason");
      return;
    }

    setMarkingStatus(true);
    setMarkStatusError(null);

    try {
      const res = await fetch(`/api/admin/connections/${c.id}/mark-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "connected",
          reason: markStatusReason,
          notes: markStatusNotes.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMarkStatusSuccess(true);
        setMarkStatusError(null);

        // Close modal and reset after brief success feedback
        setTimeout(() => {
          setShowMarkStatusModal(false);
          setMarkStatusReason("");
          setMarkStatusNotes("");
          setMarkStatusSuccess(false);
        }, 2000);

        // Notify parent to refresh list - connection should move tabs
        onNudgeSuccess?.();
      } else {
        setMarkStatusError(data.error || "Failed to mark status");
      }
    } catch {
      setMarkStatusError("Network error");
    } finally {
      setMarkingStatus(false);
    }
  }

  async function handleAddEmail(e: React.FormEvent, profileId: string) {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setAddingEmail(true);
    setEmailError(null);
    setEmailSuccess(false);

    try {
      const res = await fetch("/api/admin/leads/add-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          email: emailInput.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setEmailSuccess(true);
        setEmailInput("");

        // Clear find email state
        setEmailSource(null);
        setFoundUrl(null);
        setIsCachedResult(false);
        setFoundEmails([]);
        setEmailToUrlMap(new Map());
        setFindEmailError(null);

        // Update local detail state to show new email
        if (detail) {
          setDetail({
            ...detail,
            provider: {
              ...detail.provider,
              email: emailInput.trim(),
              hasEmail: true,
            },
          });
        }
        // Notify parent to refresh list
        onNudgeSuccess?.();
      } else {
        setEmailError(data.error || "Failed to add email");
      }
    } catch {
      setEmailError("Network error");
    } finally {
      setAddingEmail(false);
    }
  }

  function handleEditEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmailInput.trim()) return;

    const oldEmail = detail?.provider.email || "(none)";
    const newEmail = editEmailInput.trim();

    if (oldEmail === newEmail) {
      setEditEmailError("New email is the same as current email");
      return;
    }

    // Show confirmation modal
    setEditEmailError(null); // Clear any previous errors
    setPendingEmailEdit({ oldEmail, newEmail });
  }

  async function confirmEditEmail() {
    if (!pendingEmailEdit) return;

    setEditingEmailLoading(true);
    setEditEmailError(null);
    setEditEmailSuccess(false);
    setPendingEmailEdit(null); // Close modal

    try {
      const res = await fetch(`/api/admin/connections/${c.id}/edit-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: pendingEmailEdit.newEmail,
          force: forceSubmit, // Pass force flag to bypass verification check
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setEditEmailSuccess(true);
        setEditEmailInput("");

        // Show warning if metadata update failed or account is claimed
        let warning = data.warning || null;
        if (data.accountClaimed && data.skippedOleraProvidersSync) {
          warning = "Note: Provider has claimed their account. Email updated in Olera but not synced to the iOS provider database.";
        }
        if (warning) {
          setEditEmailError(warning);
        }

        // Update local detail state to show new email
        if (detail) {
          setDetail({
            ...detail,
            provider: { ...detail.provider, email: data.newEmail || pendingEmailEdit.newEmail, hasEmail: true },
          });
        }

        // Notify parent to refresh list
        onNudgeSuccess?.();

        // Close form after showing success message (longer timeout if warning)
        editEmailTimeoutRef.current = setTimeout(() => {
          setEditingEmail(false);
          setEditEmailSuccess(false);
          setEditEmailError(null);
          editEmailTimeoutRef.current = null;
        }, warning ? 5000 : 3000);
      } else {
        // Use descriptive message if available (e.g., for 422 undeliverable errors)
        setEditEmailError(data.message || data.error || "Failed to update email");
      }
    } catch {
      setEditEmailError("Network error");
    } finally {
      setEditingEmailLoading(false);
    }
  }

  async function handleFindEmail(mode: "edit" | "add" = "edit", forceRefresh = false) {
    if (!c.provider.id) return;

    // Clear any pending onBlur verification to prevent race condition
    if (verifyDebounceRef.current) {
      clearTimeout(verifyDebounceRef.current);
      verifyDebounceRef.current = null;
    }

    setFindingEmail(true);
    setFindEmailError(null);
    setFoundEmails([]);
    setEmailToUrlMap(new Map());
    setEmailSource(null);
    setFoundUrl(null);
    setIsCachedResult(false);
    setCandidateStatuses(new Map());
    setVerificationStatus("idle");

    try {
      const res = await fetch("/api/admin/connections/find-provider-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: c.provider.id,
          forceRefresh,
        }),
      });

      const data = await res.json();

      if (res.ok && data.email) {
        // Set the best match as the input value
        if (mode === "edit") {
          setEditEmailInput(data.email);
          setEditEmailError(null);
        } else {
          setEmailInput(data.email);
          setEmailError(null);
        }

        setEmailSource(data.source);
        setFoundUrl(data.foundUrl || null);
        setIsCachedResult(data.cached || false);

        const candidates: string[] = data.candidates?.length > 0 ? data.candidates : [data.email];
        setFoundEmails(candidates);

        // Build email -> URL map from candidatesWithUrls
        if (data.candidatesWithUrls && Array.isArray(data.candidatesWithUrls)) {
          const urlMap = new Map<string, string>();
          for (const c of data.candidatesWithUrls) {
            if (c.email && c.foundUrl) {
              urlMap.set(c.email, c.foundUrl);
            }
          }
          setEmailToUrlMap(urlMap);
        }

        // Batch verify all candidates
        if (candidates.length > 0) {
          // Set all to verifying initially (use lowercase for consistency with API response)
          setCandidateStatuses(new Map(candidates.map(e => [e.toLowerCase(), "verifying" as VerificationStatus])));

          const verifiedStatuses = await batchVerifyEmails(candidates);
          setCandidateStatuses(verifiedStatuses);

          // Also set the main input verification status (normalize to lowercase for lookup)
          const mainStatus = verifiedStatuses.get(data.email.toLowerCase());
          if (mainStatus) {
            setVerificationStatus(mainStatus);
          }
        }
      } else if (res.ok && !data.email) {
        // No email found or insufficient data
        const errorMsg = data.error || ("No email found for this provider" + (data.cached ? " (cached)" : ""));
        setFindEmailError(errorMsg);
        setIsCachedResult(data.cached || false);
      } else {
        // API error
        const errorMsg = data.error || "Failed to find email";
        setFindEmailError(errorMsg);
      }
    } catch {
      // Network error
      setFindEmailError("Network error. Please check your connection and try again.");
    } finally {
      setFindingEmail(false);
    }
  }

  // Provider archived this lead - show as declined with reduced opacity
  const isDeclined = c.archived && c.archiveReason;
  // Admin archived (either provider-level OR connection-level without reason)
  const isAdminArchived = c.isProviderArchived || (c.archived && !c.archiveReason);

  return (
    <div className="group">
      {/* Collapsed row - enhanced with more context */}
      <div className={`flex w-full items-center gap-3 px-4 py-4 transition-colors ${
        isAdminArchived
          ? "bg-amber-50/40 hover:bg-amber-50/60 opacity-70"
          : isDeclined
            ? "bg-gray-50/80 hover:bg-gray-100/80 opacity-75"
            : "hover:bg-stone-50/60"
      }`}>
        <button
          onClick={toggle}
          className="flex-1 min-w-0 text-left"
          aria-expanded={open}
        >
          {/* Primary line: names + engagement badges */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{family}</span>
            <span className="text-gray-400">→</span>
            <span className={`font-medium truncate ${isAdminArchived ? "text-gray-500" : "text-gray-900"}`}>{provider}</span>
            {isAdminArchived && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                Archived
              </span>
            )}
            <EngagementBadges engagement={engagement} messaged={c.responded} markedReplied={c.markedReplied} alreadyConnected={c.alreadyConnected} adminOverride={c.adminOverride} compact />
          </div>
          {/* Secondary line: care type + timeline | waiting status | nudge info | archive badge | no email badge */}
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            {(careType || timeline) && (
              <>
                <span className="truncate">
                  {careType}{careType && timeline ? " · " : ""}{timeline}
                </span>
                <span className="text-gray-300">|</span>
              </>
            )}
            <span className={`font-medium ${engagementStatus.color}`}>
              {engagementStatus.status}
            </span>
            {engagementStatus.nudgeInfo && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-400">
                  {engagementStatus.nudgeInfo}
                </span>
              </>
            )}
            {/* Archive badge - show when provider archived/declined the lead */}
            {c.archived && c.archiveReason && (
              <>
                <span className="text-gray-300">|</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600" title={c.archivedAt ? `Archived ${daysAgo(c.archivedAt)}` : "Archived"}>
                  🚫 {getArchiveReasonLabel(c.archiveReason)}
                </span>
              </>
            )}
            {/* Show email issue badge when provider needs email attention */}
            {/* Hide badge immediately when email is successfully added (optimistic UI) */}
            {c.emailIssueType && !emailSuccess && (
              <>
                <span className="text-gray-300">|</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                  c.emailIssueType === "no_email" ? "bg-gray-100 text-gray-500" :
                  c.emailIssueType === "failed" ? "bg-red-50 text-red-600" :
                  "bg-amber-50 text-amber-600"
                }`}>
                  {addingEmail ? "Adding email..." :
                   c.emailIssueType === "no_email" ? "No email" :
                   c.emailIssueType === "failed" ? "Failed" :
                   "Invalid"}
                </span>
              </>
            )}
          </div>
        </button>

        {/* Timestamp - vertically centered with other controls */}
        <span className="text-sm text-gray-400 shrink-0">
          {(() => {
            if (isDeclined && c.archivedAt) {
              const archiveAge = daysAgo(c.archivedAt);
              return archiveAge ? `Archived ${archiveAge}` : "Archived";
            }
            return `${age} ago`;
          })()}
        </span>

        {/* Archive connection button - hover reveal */}
        {/* Don't show for provider-declined connections (they already made their decision) */}
        {onArchiveConnection && !isDeclined && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Connection is admin-archived if c.archived is true without a provider decline reason
              const isConnectionArchived = c.archived && !c.archiveReason;
              onArchiveConnection(c.id, c.family.display_name, c.provider.display_name, isConnectionArchived);
            }}
            className={`opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 transition-all ${
              c.archived && !c.archiveReason
                ? "text-gray-400 hover:text-blue-500"
                : "text-gray-300 hover:text-amber-600"
            }`}
            title={c.archived && !c.archiveReason ? "Unarchive connection" : "Archive connection"}
          >
            {c.archived && !c.archiveReason ? (
              // Unarchive icon (arrow-up-tray from Heroicons)
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            ) : (
              // Archive icon (archive-box from Heroicons)
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            )}
          </button>
        )}

        {/* Expand chevron */}
        <button
          onClick={toggle}
          className="p-1"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <svg
            className={`h-5 w-5 text-gray-300 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Expanded detail - simplified layout */}
      {open && (
        <div className="border-t border-gray-100 bg-stone-50/40 px-4 py-4">
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : loadError ? (
            <p className="text-sm text-rose-600">Could not load this connection. Try again.</p>
          ) : detail ? (
            <div className="space-y-4">
              {/* Section 1: Action bar */}
              {/* Stuck/Needs Call banner - only show if we can actually call someone */}
              {/* Family perspective: only show if family has phone */}
              {/* Provider perspective: only show if provider has phone */}
              {((perspective === "family" && c.familyEngagementLevel === "needs_follow_up" && detail.family.phone) ||
                (perspective === "provider" && c.engagementLevel === "needs_follow_up" && detail.provider.phone)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                  <p className="text-sm font-medium text-amber-800 mb-2">
                    {perspective === "family"
                      ? "Family needs follow-up. No activity for 10+ days."
                      : "Provider needs follow-up. No activity for 10+ days."}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {perspective === "family" ? (
                      // Family perspective: only show Call Family
                      <a
                        href={`tel:${detail.family.phone}`}
                        className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                      >
                        Call Family
                      </a>
                    ) : (
                      // Provider perspective: Call Provider + Nudge Provider + Fact Sheet + Mark Connected
                      <>
                        <a
                          href={`tel:${detail.provider.phone}`}
                          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                        >
                          Call Provider
                        </a>
                        {detail.provider.hasEmail && (
                          <button
                            onClick={() => showNudgePreview("/api/admin/send-manual-nudge", "Manual nudge sent to provider.")}
                            disabled={nudging || loadingPreview}
                            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          >
                            {loadingPreview ? "Loading..." : nudging ? "Sending..." : "Nudge Provider"}
                          </button>
                        )}
                        <button
                          onClick={() => setShowFactSheet(true)}
                          className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-100"
                        >
                          Fact Sheet
                        </button>
                        <button
                          onClick={() => setShowMarkStatusModal(true)}
                          className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50"
                        >
                          ✓ Mark Connected
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Regular action bar - nudge buttons + engagement badges */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Nudge buttons - behavior differs based on perspective */}
                {perspective === "family" ? (
                  // Family perspective: primary action is nudging family
                  <>
                    {c.familyEngagementLevel !== "connected" && c.familyEngagementLevel !== "new" && c.familyEngagementLevel !== "needs_follow_up" && (
                      <>
                        {/* Family nudge - primary action in family perspective */}
                        {detail.family.email && (
                          <button
                            onClick={() => showNudgePreview("/api/admin/nudge-family", "Follow-up sent to family.")}
                            disabled={nudging || loadingPreview}
                            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          >
                            {loadingPreview ? "Loading Preview..." : nudging ? "Sending..." : "Nudge Family"}
                          </button>
                        )}
                        {!detail.family.email && detail.family.phone && (
                          <a
                            href={`tel:${detail.family.phone}`}
                            className="px-4 py-2 rounded-lg bg-teal-100 text-teal-800 text-sm font-medium hover:bg-teal-200"
                          >
                            Call Family (no email)
                          </a>
                        )}
                      </>
                    )}
                    {c.familyEngagementLevel === "new" && (
                      <span className="text-sm text-gray-500">Waiting for provider to respond</span>
                    )}
                    {c.familyEngagementLevel === "connected" && (
                      <span className="text-sm text-emerald-600 font-medium">Family connected</span>
                    )}
                  </>
                ) : (
                  // Provider perspective: existing logic
                  <>
                    {c.engagementLevel !== "needs_follow_up" && c.engagementLevel !== "connected" && (
                      <>
                        {/* Provider nudge - when waiting on provider */}
                        {c.waitingOn === "provider" && detail.provider.hasEmail && (
                          <button
                            onClick={() => showNudgePreview("/api/admin/send-nudge", "Nudge sent to provider.")}
                            disabled={nudging || loadingPreview}
                            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          >
                            {loadingPreview ? "Loading Preview..." : nudging ? "Sending..." : "Nudge Provider"}
                          </button>
                        )}
                        {c.waitingOn === "provider" && !detail.provider.hasEmail && detail.provider.phone && (
                          <a
                            href={`tel:${detail.provider.phone}`}
                            className="px-4 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200"
                          >
                            Call Provider (no email)
                          </a>
                        )}
                        {/* Family nudge - when provider responded but family hasn't */}
                        {c.waitingOn === "family" && detail.family.email && (
                          <button
                            onClick={() => showNudgePreview("/api/admin/nudge-family", "Follow-up sent to family.")}
                            disabled={nudging || loadingPreview}
                            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          >
                            {loadingPreview ? "Loading Preview..." : nudging ? "Sending..." : "Nudge Family"}
                          </button>
                        )}
                        {c.waitingOn === "family" && !detail.family.email && detail.family.phone && (
                          <a
                            href={`tel:${detail.family.phone}`}
                            className="px-4 py-2 rounded-lg bg-teal-100 text-teal-800 text-sm font-medium hover:bg-teal-200"
                          >
                            Call Family (no email)
                          </a>
                        )}
                      </>
                    )}
                    {c.engagementLevel === "connected" && (
                      <span className="text-sm text-emerald-600 font-medium">Provider reached out to family</span>
                    )}
                    {/* Fallback for needs_follow_up when no phone (banner won't show) */}
                    {/* Note: needs_follow_up always has email (otherwise would be in "Needs Email" tab) */}
                    {c.engagementLevel === "needs_follow_up" && !detail.provider.phone && (
                      <button
                        onClick={() => showNudgePreview("/api/admin/send-manual-nudge", "Manual nudge sent to provider.")}
                        disabled={nudging || loadingPreview}
                        className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                      >
                        {loadingPreview ? "Loading..." : nudging ? "Sending..." : "Nudge Provider"}
                      </button>
                    )}
                  </>
                )}

                {/* Engagement badges */}
                <EngagementBadges engagement={detail.engagement} markedReplied={c.markedReplied} alreadyConnected={c.alreadyConnected} adminOverride={c.adminOverride} />

                {/* Nudge feedback */}
                {nudgeMsg && (
                  <span className={`text-sm ${nudgeMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>
                    {nudgeMsg.text}
                  </span>
                )}
              </div>

              {/* Section 2: Contact cards - horizontal layout */}
              <div className="flex gap-4 flex-wrap">
                {/* Family contact */}
                <div className="flex-1 min-w-[200px] bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Family</span>
                    {detail.family.id && (
                      <a href={`/admin/care-seekers/${detail.family.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        View
                      </a>
                    )}
                  </div>
                  <p className="font-medium text-gray-900 text-sm truncate">{detail.family.display_name || "Unknown"}</p>
                  <div className="mt-1 space-y-0.5 text-sm">
                    {detail.family.email && (
                      <a href={`mailto:${detail.family.email}`} className="block text-blue-600 hover:underline truncate">{detail.family.email}</a>
                    )}
                    {detail.family.phone && (
                      <a href={`tel:${detail.family.phone}`} className="block text-blue-600 hover:underline">{detail.family.phone}</a>
                    )}
                  </div>
                  {(detail.family.careType || detail.family.timeline) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {detail.family.careType && (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">{detail.family.careType}</span>
                      )}
                      {detail.family.timeline && (
                        <span className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700">{detail.family.timeline}</span>
                      )}
                    </div>
                  )}
                  {detail.family.nudgeCount > 0 && (
                    <p className="mt-2 text-xs text-gray-400">
                      Nudged {detail.family.nudgeCount}× {detail.family.lastNudgedAt && `· Last: ${fmtDate(detail.family.lastNudgedAt)}`}
                    </p>
                  )}
                </div>

                {/* Provider contact */}
                <div className="flex-1 min-w-[200px] bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Provider</span>
                    {detail.provider.slug && (
                      <a href={`/admin/directory/${detail.provider.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        View
                      </a>
                    )}
                  </div>
                  <p className="font-medium text-gray-900 text-sm truncate">{detail.provider.display_name || "Unknown"}</p>
                  <div className="mt-1 space-y-1 text-sm">
                    {detail.provider.email ? (
                      <div className="space-y-1">
                        {!editingEmail ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <a href={`mailto:${detail.provider.email}`} className="block text-blue-600 hover:underline truncate flex-1">{detail.provider.email}</a>
                              <button
                                onClick={() => {
                                  if (editEmailTimeoutRef.current) {
                                    clearTimeout(editEmailTimeoutRef.current);
                                    editEmailTimeoutRef.current = null;
                                  }
                                  setEditingEmail(true);
                                  setEditEmailInput(detail.provider.email || "");
                                  setEditEmailError(null);
                                  setEditEmailSuccess(false);
                                  // Clear previous find email state
                                  setFindEmailError(null);
                                  setEmailSource(null);
                                  setFoundUrl(null);
                                  setIsCachedResult(false);
                                  setFoundEmails([]);
                                  setEmailToUrlMap(new Map());
                                  // Clear verification state
                                  setVerificationStatus("idle");
                                  setCandidateStatuses(new Map());
                                  setForceSubmit(false);
                                }}
                                className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
                              >
                                Edit
                              </button>
                            </div>
                            {(c.emailIssueType === "failed" || c.emailIssueType === "invalid") && (
                              <p className="text-xs text-amber-600 mt-1">
                                ⚠️ {c.emailIssueType === "failed" ? "Delivery failed" : "Invalid email"} — needs replacement
                              </p>
                            )}
                          </>
                        ) : (
                          <form onSubmit={handleEditEmail} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 flex items-center gap-1">
                                <input
                                  type="email"
                                  value={editEmailInput}
                                  onChange={(e) => {
                                    setEditEmailInput(e.target.value);
                                    // Reset verification when typing
                                    setVerificationStatus("idle");
                                    setForceSubmit(false);
                                    // Clear source indicator if user manually edits away from found emails
                                    if (emailSource && foundEmails.length > 0 && !foundEmails.includes(e.target.value)) {
                                      setEmailSource(null);
                                      setFoundUrl(null);
                                      setIsCachedResult(false);
                                    }
                                  }}
                                  onBlur={() => handleEmailBlur(editEmailInput, "edit")}
                                  placeholder="New provider email..."
                                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                  disabled={editingEmailLoading || findingEmail}
                                  autoFocus
                                />
                                {!isCachedResult ? (
                                  <button
                                    type="button"
                                    onClick={() => handleFindEmail("edit")}
                                    disabled={editingEmailLoading || findingEmail}
                                    className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                    title="Find provider email using web scraping + AI"
                                  >
                                    {findingEmail ? "Searching..." : "✦ Find"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleFindEmail("edit", true)}
                                    disabled={editingEmailLoading || findingEmail}
                                    className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                    title="Force refresh - bypass cache and search again"
                                  >
                                    {findingEmail ? "Searching..." : "↻ Refresh"}
                                  </button>
                                )}
                              </div>
                              <button
                                type="submit"
                                disabled={editingEmailLoading || findingEmail || !editEmailInput.trim() || editEmailInput === detail.provider.email || (verificationStatus === "invalid" && !forceSubmit)}
                                className="px-3 py-1 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {editingEmailLoading ? "Saving..." : "Save"}
                              </button>
                              {verificationStatus === "invalid" && !forceSubmit && (
                                <button
                                  type="button"
                                  onClick={() => setForceSubmit(true)}
                                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                                >
                                  Save anyway
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (editEmailTimeoutRef.current) {
                                    clearTimeout(editEmailTimeoutRef.current);
                                    editEmailTimeoutRef.current = null;
                                  }
                                  setEditingEmail(false);
                                  setEditEmailInput("");
                                  setEditEmailError(null);
                                  setEditEmailSuccess(false);
                                  setFindEmailError(null);
                                  setFoundEmails([]);
                                  setEmailToUrlMap(new Map());
                                  setEmailSource(null);
                                  setFoundUrl(null);
                                  setIsCachedResult(false);
                                  setVerificationStatus("idle");
                                  setCandidateStatuses(new Map());
                                  setForceSubmit(false);
                                }}
                                disabled={editingEmailLoading || findingEmail}
                                className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                            {/* Verification badge */}
                            <EmailVerificationBadge status={verificationStatus} />
                            {findEmailError && <p className="text-xs text-amber-600">{findEmailError}</p>}
                            {emailSource && (
                              <p className="text-xs text-gray-500">
                                Found via {emailSource === "scrape" ? "web scraping" : "AI analysis"}
                                {isCachedResult && " (cached)"}
                                {foundEmails.length > 1 && ` · ${foundEmails.length} candidates`}
                                {foundUrl && (
                                  <>
                                    {" · "}
                                    <a
                                      href={foundUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline"
                                      title={`Source: ${foundUrl}`}
                                    >
                                      View source
                                    </a>
                                  </>
                                )}
                              </p>
                            )}
                            {foundEmails.length > 1 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {/* Sort candidates: valid/risky/unknown first, invalid last */}
                                {[...new Set(foundEmails)]
                                  .sort((a, b) => {
                                    // Normalize to lowercase for Map lookup (API returns lowercase keys)
                                    const statusA = candidateStatuses.get(a.toLowerCase()) || "unknown";
                                    const statusB = candidateStatuses.get(b.toLowerCase()) || "unknown";
                                    const isInvalidA = statusA === "invalid" ? 1 : 0;
                                    const isInvalidB = statusB === "invalid" ? 1 : 0;
                                    return isInvalidA - isInvalidB;
                                  })
                                  .map((email) => {
                                    // Normalize to lowercase for Map lookup (API returns lowercase keys)
                                    const status = candidateStatuses.get(email.toLowerCase());
                                    const isInvalid = status === "invalid";
                                    const isVerifying = status === "verifying";
                                    const statusIcon = status === "valid" ? "✓" : status === "risky" ? "⚠️" : status === "invalid" ? "✗" : isVerifying ? "..." : "";

                                    return (
                                      <button
                                        key={email}
                                        type="button"
                                        onClick={() => {
                                          setEditEmailInput(email);
                                          // Update source URL to match selected candidate
                                          setFoundUrl(emailToUrlMap.get(email) || null);
                                          // Update verification status to match selected candidate
                                          if (status && status !== "verifying") {
                                            setVerificationStatus(status);
                                          }
                                        }}
                                        className={`px-2 py-0.5 text-xs rounded border transition-colors inline-flex items-center gap-1 ${
                                          editEmailInput === email
                                            ? "bg-amber-100 border-amber-300 text-amber-800"
                                            : isInvalid
                                              ? "bg-gray-50 border-gray-200 text-gray-400 opacity-60"
                                              : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                                        }`}
                                        disabled={editingEmailLoading || findingEmail}
                                      >
                                        <span className={isInvalid ? "line-through" : ""}>{email}</span>
                                        {statusIcon && (
                                          <span className={
                                            status === "valid" ? "text-emerald-600" :
                                            status === "risky" ? "text-amber-600" :
                                            status === "invalid" ? "text-red-500" :
                                            "text-gray-400"
                                          }>
                                            {statusIcon}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                              </div>
                            )}
                            {editEmailError && <p className="text-xs text-red-600">{editEmailError}</p>}
                            {editEmailSuccess && (
                              <p className="text-xs text-emerald-600">
                                Email updated! Day 0 notification sent. Sequence restarted.
                              </p>
                            )}
                          </form>
                        )}
                      </div>
                    ) : c.provider.id ? (
                      <form onSubmit={(e) => handleAddEmail(e, c.provider.id!)} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex items-center gap-1">
                            <input
                              type="email"
                              value={emailInput}
                              onChange={(e) => {
                                setEmailInput(e.target.value);
                                // Reset verification when typing
                                setVerificationStatus("idle");
                                setForceSubmit(false);
                                // Clear source indicator if user manually edits away from found emails
                                if (emailSource && foundEmails.length > 0 && !foundEmails.includes(e.target.value)) {
                                  setEmailSource(null);
                                  setFoundUrl(null);
                                  setIsCachedResult(false);
                                }
                              }}
                              onBlur={() => handleEmailBlur(emailInput, "add")}
                              placeholder={findingEmail ? "Searching..." : "Add provider email..."}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              disabled={addingEmail || findingEmail}
                            />
                            {!isCachedResult ? (
                              <button
                                type="button"
                                onClick={() => handleFindEmail("add")}
                                disabled={addingEmail || findingEmail}
                                className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                title="Find provider email using web scraping + AI"
                              >
                                {findingEmail ? "Searching..." : "✦ Find"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleFindEmail("add", true)}
                                disabled={addingEmail || findingEmail}
                                className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                title="Force refresh - bypass cache and search again"
                              >
                                {findingEmail ? "Searching..." : "↻ Refresh"}
                              </button>
                            )}
                          </div>
                          <button
                            type="submit"
                            disabled={addingEmail || findingEmail || !emailInput.trim() || (verificationStatus === "invalid" && !forceSubmit)}
                            className="px-3 py-1 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {addingEmail ? "Adding..." : "Add"}
                          </button>
                          {verificationStatus === "invalid" && !forceSubmit && (
                            <button
                              type="button"
                              onClick={() => setForceSubmit(true)}
                              className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                              Add anyway
                            </button>
                          )}
                        </div>
                        {/* Verification badge */}
                        <EmailVerificationBadge status={verificationStatus} />
                        {findEmailError && <p className="text-xs text-amber-600">{findEmailError}</p>}
                        {emailSource && (
                          <p className="text-xs text-gray-500">
                            Found via {emailSource === "scrape" ? "web scraping" : "AI analysis"}
                            {isCachedResult && " (cached)"}
                            {foundEmails.length > 1 && ` · ${foundEmails.length} candidates`}
                            {foundUrl && (
                              <>
                                {" · "}
                                <a
                                  href={foundUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                  title={`Source: ${foundUrl}`}
                                >
                                  View source
                                </a>
                              </>
                            )}
                          </p>
                        )}
                        {foundEmails.length > 1 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {/* Sort candidates: valid/risky/unknown first, invalid last */}
                            {[...new Set(foundEmails)]
                              .sort((a, b) => {
                                // Normalize to lowercase for Map lookup (API returns lowercase keys)
                                const statusA = candidateStatuses.get(a.toLowerCase()) || "unknown";
                                const statusB = candidateStatuses.get(b.toLowerCase()) || "unknown";
                                const isInvalidA = statusA === "invalid" ? 1 : 0;
                                const isInvalidB = statusB === "invalid" ? 1 : 0;
                                return isInvalidA - isInvalidB;
                              })
                              .map((email) => {
                                // Normalize to lowercase for Map lookup (API returns lowercase keys)
                                const status = candidateStatuses.get(email.toLowerCase());
                                const isInvalid = status === "invalid";
                                const isVerifying = status === "verifying";
                                const statusIcon = status === "valid" ? "✓" : status === "risky" ? "⚠️" : status === "invalid" ? "✗" : isVerifying ? "..." : "";

                                return (
                                  <button
                                    key={email}
                                    type="button"
                                    onClick={() => {
                                      setEmailInput(email);
                                      // Update source URL to match selected candidate
                                      setFoundUrl(emailToUrlMap.get(email) || null);
                                      // Update verification status to match selected candidate
                                      if (status && status !== "verifying") {
                                        setVerificationStatus(status);
                                      }
                                    }}
                                    className={`px-2 py-0.5 text-xs rounded border transition-colors inline-flex items-center gap-1 ${
                                      emailInput === email
                                        ? "bg-amber-100 border-amber-300 text-amber-800"
                                        : isInvalid
                                          ? "bg-gray-50 border-gray-200 text-gray-400 opacity-60"
                                          : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                                    }`}
                                    disabled={addingEmail || findingEmail}
                                  >
                                    <span className={isInvalid ? "line-through" : ""}>{email}</span>
                                    {statusIcon && (
                                      <span className={
                                        status === "valid" ? "text-emerald-600" :
                                        status === "risky" ? "text-amber-600" :
                                        status === "invalid" ? "text-red-500" :
                                        "text-gray-400"
                                      }>
                                        {statusIcon}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                          </div>
                        )}
                        {emailError && (
                          <p className="text-xs text-red-600">{emailError}</p>
                        )}
                        {emailSuccess && (
                          <p className="text-xs text-emerald-600">Email added! First notification sent to provider.</p>
                        )}
                      </form>
                    ) : (
                      <span className="text-amber-600">No email</span>
                    )}
                    {detail.provider.phone && (
                      <a href={`tel:${detail.provider.phone}`} className="block text-blue-600 hover:underline">{detail.provider.phone}</a>
                    )}
                  </div>
                  {detail.provider.nudgeCount > 0 && (
                    <p className="mt-2 text-xs text-gray-400">
                      Nudged {detail.provider.nudgeCount}× {detail.provider.lastNudgedAt && `· Last: ${fmtDate(detail.provider.lastNudgedAt)}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Archive information - show when provider declined the lead */}
              {detail.archived && detail.archiveReason && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🚫</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">
                        Provider Declined Lead
                      </h3>
                      <p className="text-sm text-gray-700 mb-2">
                        <span className="font-medium">Reason:</span> {getArchiveReasonLabel(detail.archiveReason)}
                      </p>
                      {detail.archiveMessage && (
                        <div className="mt-2 p-3 bg-white border border-gray-200 rounded">
                          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Message for Family</p>
                          <p className="text-sm text-gray-700">{detail.archiveMessage}</p>
                        </div>
                      )}
                      {detail.archivedAt && (
                        <p className="text-xs text-gray-400 mt-2">
                          Declined {daysAgo(detail.archivedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Conversation thread (collapsible, default open) */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Conversation
                </h3>
                {detail.thread.length === 0 ? (
                  <p className="text-sm text-gray-400">No messages yet.</p>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {detail.thread.map((m, i) => (
                      <div key={i} className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {m.role === "family" ? "Family" : m.role === "provider" ? "Provider" : "System"}
                          </span>
                          {m.is_auto_reply && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">auto</span>
                          )}
                          {m.created_at && (
                            <span className="text-xs text-gray-400">{fmtDate(m.created_at)}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{m.text || <span className="text-gray-300">-</span>}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 4: Email trail (collapsed by default) */}
              {detail.emails.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowEmails(!showEmails)}
                    className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showEmails ? "rotate-90" : ""}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M6.5 3.5l7 6.5-7 6.5V3.5z" />
                    </svg>
                    Show {detail.emails.length} email{detail.emails.length !== 1 ? "s" : ""} sent
                  </button>

                  {showEmails && (
                    <div className="mt-2 bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                      {detail.emails.map((e) => (
                        <div key={e.id}>
                          <button
                            type="button"
                            onClick={() => toggleEmailPreview(e.id)}
                            className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expandedEmailId === e.id ? "rotate-90" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="text-sm text-gray-700">{emailLabel(e.email_type)}</span>
                              <span className="text-gray-300">·</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                e.recipient_type === "family"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-purple-50 text-purple-600"
                              }`}>
                                {e.recipient_type === "family" ? "To Family" : "To Provider"}
                                {(() => {
                                  if (e.recipient_type === "family") return "";
                                  const version = (e.metadata as Record<string, unknown> | null)?.email_version;
                                  return version && typeof version === "number" && version > 1 ? ` (V${version})` : "";
                                })()}
                              </span>
                              <span className="text-gray-300">·</span>
                              <span className="text-sm text-gray-500">{fmtDateTime(e.created_at)}</span>
                            </div>
                            <EmailStatusPill
                              status={e.status}
                              sentAt={e.created_at}
                              delivered_at={e.delivered_at}
                              first_opened_at={e.first_opened_at}
                              first_clicked_at={e.first_clicked_at}
                              bounced_at={e.bounced_at}
                              complained_at={e.complained_at}
                              className="shrink-0"
                            />
                          </button>
                          {expandedEmailId === e.id && (
                            <div className="border-t border-gray-100 p-3 bg-gray-50">
                              {emailHtmlLoading === e.id ? (
                                <p className="text-sm text-gray-400 text-center py-4">Loading preview...</p>
                              ) : emailHtmlCache[e.id] ? (
                                <div className="rounded border border-gray-200 bg-white overflow-hidden">
                                  <iframe
                                    srcDoc={emailHtmlCache[e.id]!}
                                    className="w-full border-0"
                                    style={{ minHeight: "300px" }}
                                    title="Email preview"
                                    sandbox=""
                                  />
                                </div>
                              ) : (
                                <p className="text-sm text-gray-400 text-center py-4">No preview available.</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Email Preview Modal */}
      {emailPreview && (
        <EmailPreviewModal
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setEmailPreview(null);
          }}
          onConfirm={confirmSendNudge}
          from={emailPreview.from}
          to={emailPreview.to}
          subject={emailPreview.subject}
          html={emailPreview.html}
          sending={nudging}
          warning={emailPreview.warning}
        />
      )}

      {/* Provider Fact Sheet Modal */}
      {showFactSheet && (
        <ProviderFactSheetModal
          isOpen={showFactSheet}
          onClose={() => setShowFactSheet(false)}
          providerId={c.provider.slug || c.provider.source_provider_id || c.provider.id || ""}
          providerName={c.provider.display_name || "Provider"}
        />
      )}

      {/* Mark as Connected Modal */}
      {showMarkStatusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowMarkStatusModal(false);
              setMarkStatusReason("");
              setMarkStatusNotes("");
              setMarkStatusError(null);
              setMarkStatusSuccess(false);
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Mark as Connected</h3>
                <p className="text-sm text-gray-500">Verify this provider contacted the family</p>
              </div>
            </div>

            {/* Reason Selection - Polished radio buttons */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                How did you verify?
              </label>
              <div className="space-y-2">
                {[
                  { value: "Called provider — confirmed they contacted family", icon: "📞" },
                  { value: "Provider replied to admin outreach", icon: "📧" },
                  { value: "Verified in platform messages", icon: "💬" },
                  { value: "Other", icon: "📝" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMarkStatusReason(option.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                      markStatusReason === option.value
                        ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-lg">{option.icon}</span>
                    <span className={`text-sm ${markStatusReason === option.value ? "text-emerald-900 font-medium" : "text-gray-700"}`}>
                      {option.value}
                    </span>
                    {markStatusReason === option.value && (
                      <svg className="w-5 h-5 text-emerald-600 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes - only show when "Other" is selected or always available */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Notes {markStatusReason === "Other" ? "(required)" : "(optional)"}
              </label>
              <textarea
                value={markStatusNotes}
                onChange={(e) => setMarkStatusNotes(e.target.value)}
                placeholder={markStatusReason === "Other" ? "Describe how you verified..." : "Additional context..."}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400"
              />
            </div>

            {/* Impact Message */}
            <div className="mb-5 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600">
                <span className="font-medium text-gray-900">What happens:</span> Connection moves to Connected tab, email sequence stops, and this verification is logged.
              </p>
            </div>

            {/* Success */}
            {markStatusSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm text-emerald-800 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Marked as connected! Moving to Connected tab.
                </p>
              </div>
            )}

            {/* Error */}
            {markStatusError && (
              <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">{markStatusError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowMarkStatusModal(false);
                  setMarkStatusReason("");
                  setMarkStatusNotes("");
                  setMarkStatusError(null);
                  setMarkStatusSuccess(false);
                }}
                disabled={markingStatus || markStatusSuccess}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkStatus}
                disabled={markingStatus || markStatusSuccess || !markStatusReason || (markStatusReason === "Other" && !markStatusNotes.trim())}
                className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {markingStatus ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Marking...
                  </span>
                ) : (
                  "Mark as Connected"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email edit confirmation modal */}
      {pendingEmailEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-email-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 id="edit-email-title" className="text-base font-semibold text-gray-900 mb-3">
              Update provider email?
            </h3>
            <dl className="text-sm text-gray-700 space-y-1.5 mb-4">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">Provider</dt>
                <dd className="text-gray-900">{c.provider.display_name || "Unknown"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">Current email</dt>
                <dd className="text-gray-900">{pendingEmailEdit.oldEmail}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">New email</dt>
                <dd className="font-medium text-teal-700">{pendingEmailEdit.newEmail}</dd>
              </div>
            </dl>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-[12px] text-amber-900 leading-relaxed space-y-1">
                <span className="block font-medium">⚠️ This will:</span>
                <span className="block">• Update this provider&apos;s email globally (directory, all connections)</span>
                <span className="block">• Send a new Day 0 email immediately to the new address</span>
                <span className="block">• Restart the email sequence from Day 0</span>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingEmailEdit(null);
                  setEditEmailError(null);
                }}
                disabled={editingEmailLoading}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEditEmail}
                disabled={editingEmailLoading}
                className="text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {editingEmailLoading ? "Updating..." : "Confirm Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

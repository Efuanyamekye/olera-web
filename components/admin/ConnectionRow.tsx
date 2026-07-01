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
import TrustScoreBadge, { type TrustScoreStatus } from "@/components/admin/TrustScoreBadge";

interface ProfileCompleteness {
  percentage: number;
  missingFields: string[];
}

export type WorkflowState = "needs_attention" | "awaiting_provider" | "awaiting_family" | "connected" | "stuck";
export type EngagementLevel = "awaiting" | "viewed" | "connected" | "needs_follow_up";
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
    /** Provider has claimed their account (linked to an auth user) */
    isAccountClaimed?: boolean;
    /** Verification state: verified, pending, unverified, not_required, rejected */
    verificationState?: string | null;
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
    status: "viewed" | "connected" | "not_interested";
    marked_at: string;
    marked_by_email?: string;
    reason: string;
    notes?: string;
  } | null;
  /** Provider archived this lead in their portal */
  archived?: boolean;
  archiveReason?: "not_a_fit" | "not_accepting_clients" | "unable_to_reach" | "other" | null;
  /** Raw archive reason (free-text from leads page, for display in Archived tab) */
  rawArchiveReason?: string | null;
  archivedAt?: string;
  /** Email issue type for "Needs Email" tab */
  emailIssueType?: "no_email" | "failed" | "invalid" | null;
  emailTrusted?: boolean;
  /** Admin archived this provider - no emails sent to them */
  isProviderArchived?: boolean;
  /** Provider is inactive (deleted account, removed, etc.) */
  isProviderInactive?: boolean;
  /** Inactive provider info - shows who deleted them */
  inactiveProviderInfo?: {
    /** Who deleted: "self" (account deletion), "provider_request" (asked admin), "admin", or "unknown" */
    deletionSource: "self" | "provider_request" | "admin" | "unknown";
    /** Raw deletion reason from olera-providers table */
    deletionReason: "data_sweep" | "provider_request" | "duplicate" | "out_of_scope" | "other" | null;
    /** When the provider was deleted */
    deletedAt: string | null;
  } | null;
  /** Archive info when provider is admin-archived */
  providerArchiveInfo?: {
    reason: string | null;
    archivedBy: string | null;
    archivedAt: string | null;
    notes: string | null;
  } | null;
  /** Email sequence progress (0-3, where 3 = sequence complete) */
  followupStage?: number | null;
  /** Why the sequence stopped */
  followupStoppedReason?: string | null;
  /** Tagged as "no contact found" in Needs Email tab - sinks to bottom of list */
  noContactFound?: boolean;
  /** When the "no contact found" tag was added */
  noContactFoundAt?: string | null;
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
  family_confirmed?: boolean;
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

// Map archive reason codes to display labels (provider-side, when they decline a lead)
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

// Map admin archive reason codes to display labels (admin-side, when admin archives a provider)
function getAdminArchiveReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Archived";
  switch (reason) {
    case "provider_requested_no_emails":
      return "Requested no emails";
    case "inactive":
      return "Inactive";
    case "duplicate":
      return "Duplicate";
    case "out_of_business":
      return "Out of business";
    case "invalid_provider":
      return "Invalid provider";
    case "wrong_contact_info":
      return "Wrong contact info";
    case "relocated":
      return "Relocated";
    case "compliance_issue":
      return "Compliance issue";
    case "merged":
      return "Merged";
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
  engagementLevel,
  messaged = false,
  markedReplied = false,
  alreadyConnected = false,
  adminOverride = null,
  compact = false
}: {
  engagement?: Engagement | DetailEngagement;
  engagementLevel?: EngagementLevel;
  messaged?: boolean;
  markedReplied?: boolean;
  alreadyConnected?: boolean;
  adminOverride?: {
    status: "viewed" | "connected" | "not_interested";
    reason: string;
  } | null;
  compact?: boolean;
}) {
  if (!engagement && !markedReplied && !alreadyConnected && !adminOverride) return null;

  // Check if messaged is in the engagement object (DetailEngagement) or passed separately
  const isMessaged = messaged || (engagement && 'messaged' in engagement && engagement.messaged);

  // Build badges with specific labels for what the provider did
  const adminVerifiedLabel = adminOverride
    ? adminOverride.status === "not_interested"
      ? `Not interested: ${adminOverride.reason || "admin"}`
      : `Admin verified: ${adminOverride.status === "viewed" ? "Viewed" : "Connected"}`
    : "";

  // Only show "Viewed" badge if engagement level confirms they viewed
  // This ensures badge matches tab placement - no "Viewed" badge in "Needs Follow-up" tab
  const showViewedBadge = engagementLevel === "viewed" || engagementLevel === "connected";

  const badges: { icon: string; label: string; active: boolean; highlight?: boolean }[] = [
    { icon: "👁", label: "Viewed", active: showViewedBadge },
    { icon: "📋", label: "Copied Phone", active: engagement?.phone_copied ?? false },
    { icon: "📋", label: "Copied Email", active: engagement?.email_copied ?? false },
    { icon: "📞", label: "Called", active: engagement?.phone_clicked ?? false },
    { icon: "📧", label: "Emailed", active: engagement?.email_link_clicked ?? false },
    { icon: "📨", label: "Continued in Inbox", active: engagement?.continue_in_inbox ?? false },
    { icon: "💬", label: "Messaged", active: isMessaged ?? false },
    { icon: "✓", label: "Family confirmed", active: engagement?.family_confirmed ?? false },
    { icon: "✓", label: "Marked Replied", active: markedReplied },
    { icon: "🤝", label: "Already Connected", active: alreadyConnected },
    { icon: "✓", label: adminVerifiedLabel, active: !!adminOverride, highlight: true },
  ];

  const activeBadges = badges.filter(b => b.active);
  if (activeBadges.length === 0) return null;

  // Hide engagement badges entirely in compact mode
  if (compact) {
    return null;
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
          {b.label}
        </span>
      ))}
    </div>
  );
}

export default function ConnectionRow({
  c,
  perspective = "provider",
  engagement,
  onConnectionAction,
  onNudgeSuccess,
}: {
  c: ConnectionRowData;
  perspective?: Perspective;
  engagement?: Engagement;
  /** Called when user clicks action icon on connection row - opens multi-action dialog */
  onConnectionAction?: (
    connectionId: string,
    providerId: string | null,
    familyName: string | null,
    providerName: string | null,
    isArchived: boolean,
    isProviderArchived: boolean,
    providerArchiveInfo?: { reason: string | null; archivedBy: string | null; archivedAt: string | null; notes: string | null } | null,
    rawArchiveReason?: string | null
  ) => void;
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
  const [editEmailSuccessMsg, setEditEmailSuccessMsg] = useState<string | null>(null);
  const [editingEmailLoading, setEditingEmailLoading] = useState(false);
  const [pendingEmailEdit, setPendingEmailEdit] = useState<{ oldEmail: string; newEmail: string } | null>(null);
  const editEmailTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  // Which verdict (if any) is offering a force-through escape: 'undeliverable' (hard bounce)
  // or 'risky' (catch-all). null = no override affordance needed.
  const [forceKind, setForceKind] = useState<"undeliverable" | "risky" | null>(null);
  const verifyDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Trust score state
  const [trustScoreStatus, setTrustScoreStatus] = useState<TrustScoreStatus>("idle");
  const [trustScoreReason, setTrustScoreReason] = useState<string>("");
  const [candidateTrustScores, setCandidateTrustScores] = useState<Map<string, { level: TrustScoreStatus; reason: string }>>(new Map());

  // Request counter to prevent race conditions (stale responses overwriting fresh ones)
  const blurRequestIdRef = useRef(0);

  // Trust email state (for claimed providers with delivery issues)
  const [trustingEmail, setTrustingEmail] = useState(false);
  const [trustEmailSuccess, setTrustEmailSuccess] = useState(false);
  const [trustEmailError, setTrustEmailError] = useState<string | null>(null);

  // "No contact found" tag state (for Needs Email tab)
  const [noContactTagged, setNoContactTagged] = useState(c.noContactFound ?? false);
  const [togglingNoContactTag, setTogglingNoContactTag] = useState(false);

  // Sync noContactTagged with prop when it changes (e.g., parent refresh, other admin action)
  useEffect(() => {
    setNoContactTagged(c.noContactFound ?? false);
  }, [c.noContactFound]);

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

  // Fetch trust score for an email
  const fetchTrustScore = useCallback(async (email: string): Promise<{ level: TrustScoreStatus; reason: string }> => {
    if (!email || !email.includes("@") || !c.provider.id) {
      return { level: "idle", reason: "" };
    }

    try {
      const res = await fetch("/api/admin/connections/preview-trust-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, providerId: c.provider.id }),
      });

      if (!res.ok) return { level: "idle", reason: "" };

      const data = await res.json();
      return { level: data.level as TrustScoreStatus, reason: data.reason || "" };
    } catch {
      return { level: "idle", reason: "" };
    }
  }, [c.provider.id]);

  // Batch fetch trust scores for multiple emails
  const batchFetchTrustScores = useCallback(async (emails: string[]): Promise<Map<string, { level: TrustScoreStatus; reason: string }>> => {
    const results = new Map<string, { level: TrustScoreStatus; reason: string }>();
    if (emails.length === 0 || !c.provider.id) return results;

    // Fetch trust scores in parallel (limit to 5 concurrent requests)
    const batchSize = 5;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const promises = batch.map(async (email) => {
        const result = await fetchTrustScore(email);
        return { email: email.toLowerCase(), result };
      });
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ email, result }) => {
        results.set(email, result);
      });
    }

    return results;
  }, [c.provider.id, fetchTrustScore]);

  // Handle email input blur - trigger verification and trust scoring after debounce
  const handleEmailBlur = useCallback((email: string, mode: "edit" | "add") => {
    // Clear any pending verification
    if (verifyDebounceRef.current) {
      clearTimeout(verifyDebounceRef.current);
    }

    // Skip verification if email is empty or invalid format
    if (!email || !email.includes("@")) {
      setVerificationStatus("idle");
      setTrustScoreStatus("idle");
      setTrustScoreReason("");
      return;
    }

    // Increment request ID to track this specific request
    const requestId = ++blurRequestIdRef.current;

    // Debounce verification and trust scoring
    verifyDebounceRef.current = setTimeout(async () => {
      // Run verification and trust scoring in parallel
      setVerificationStatus("verifying");
      setTrustScoreStatus("scoring");

      const [verifyStatus, trustResult] = await Promise.all([
        verifyEmail(email),
        fetchTrustScore(email),
      ]);

      // Only update state if this is still the latest request (prevents race conditions)
      if (blurRequestIdRef.current === requestId) {
        setVerificationStatus(verifyStatus);
        setTrustScoreStatus(trustResult.level);
        setTrustScoreReason(trustResult.reason);
      }
    }, 300);
  }, [verifyEmail, fetchTrustScore]);

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

            // Batch verify all candidates and fetch trust scores
            if (candidates.length > 0) {
              // Set all to verifying initially (use lowercase for consistency with API response)
              setCandidateStatuses(new Map(candidates.map(e => [e.toLowerCase(), "verifying" as VerificationStatus])));
              setTrustScoreStatus("scoring");

              // Run verification and trust scoring in parallel
              const [verifiedStatuses, trustScores] = await Promise.all([
                batchVerifyEmails(candidates),
                batchFetchTrustScores(candidates),
              ]);

              setCandidateStatuses(verifiedStatuses);
              setCandidateTrustScores(trustScores);

              // Also set the main input verification and trust status (normalize to lowercase for lookup)
              const mainStatus = verifiedStatuses.get(data.email.toLowerCase());
              if (mainStatus) {
                setVerificationStatus(mainStatus);
              }
              const mainTrust = trustScores.get(data.email.toLowerCase());
              if (mainTrust) {
                setTrustScoreStatus(mainTrust.level);
                setTrustScoreReason(mainTrust.reason);
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
      setForceKind(null);
      setTrustScoreStatus("idle");
      setTrustScoreReason("");
      setCandidateTrustScores(new Map());
    }
  }, [open, detail, autoSuggestAttempted, c.provider.id, batchVerifyEmails, batchFetchTrustScores]);

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

  // Helper: Get sequence progress label
  const getSequenceProgress = (): string | null => {
    const stage = c.followupStage;
    if (stage == null) return null;
    // Stage 0-3 maps to Email 1/4 through 4/4
    return `Email ${stage + 1}/4`;
  };

  // Get engagement status for collapsed row display
  const getEngagementStatus = (): { status: string; color: string; nudgeInfo: string | null } => {
    const providerNudges = c.providerNudgeCount || 0;
    const familyNudges = c.familyNudgeCount || 0;
    const sequenceProgress = getSequenceProgress();

    if (perspective === "family") {
      // Family perspective - show family engagement level
      // Use gray for all - tabs already indicate state
      const famLevel = c.familyEngagementLevel || "new";

      switch (famLevel) {
        case "connected":
          return { status: "Connected", color: "text-gray-500", nudgeInfo: null };
        case "awaiting":
          return { status: "Awaiting Reply", color: "text-gray-500", nudgeInfo: familyNudges > 0 ? `Nudged ${familyNudges}x` : null };
        case "needs_follow_up":
          return { status: "Needs Follow-up", color: "text-gray-500", nudgeInfo: familyNudges > 0 ? `Family nudged ${familyNudges}x` : null };
        case "new":
        default:
          return { status: "New", color: "text-gray-500", nudgeInfo: null };
      }
    } else {
      // Provider perspective - show provider engagement level
      const engLevel = c.engagementLevel || "awaiting";

      // For non-connected states, show who we're waiting on
      const waitingOnText = c.waitingOn === "family" ? " (awaiting family)" : "";

      // Helper to combine sequence progress with manual nudge count
      const buildProgressInfo = (base: string | null, nudges: number): string | null => {
        if (base && nudges > 0) return `${base} · Nudged ${nudges}x`;
        if (base) return base;
        if (nudges > 0) return `Nudged ${nudges}x`;
        return null;
      };

      // Use gray for all engagement statuses - tabs already indicate state
      // This reduces visual noise and lets verification badges stand out
      switch (engLevel) {
        case "connected":
          return { status: "Connected", color: "text-gray-500", nudgeInfo: null };
        case "viewed":
          // If waiting on family: provider already engaged, show family nudges (sequence irrelevant)
          // If waiting on provider: show sequence progress + provider nudges
          if (c.waitingOn === "family") {
            return { status: `Viewed${waitingOnText}`, color: "text-gray-500", nudgeInfo: familyNudges > 0 ? `Nudged ${familyNudges}x` : null };
          }
          return { status: `Viewed${waitingOnText}`, color: "text-gray-500", nudgeInfo: buildProgressInfo(sequenceProgress, providerNudges) };
        case "needs_follow_up":
          // Use actual sequence progress if available, fallback to "Email 4/4"
          return { status: "Needs Follow-up", color: "text-gray-500", nudgeInfo: buildProgressInfo(sequenceProgress || "Email 4/4", providerNudges) };
        case "awaiting":
        default:
          // Show sequence progress (or "Pending") + manual nudges if any
          return { status: "Awaiting", color: "text-gray-500", nudgeInfo: buildProgressInfo(sequenceProgress || "Pending", providerNudges) };
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
          // Force when overriding a failed auto-check — prior 422 (forceKind) or
          // the inline verdict is invalid/risky. Lets the single "Add anyway"
          // button work in one click.
          force: forceKind !== null || verificationStatus === "invalid" || verificationStatus === "risky",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setEmailSuccess(true);
        setEmailInput("");
        setForceKind(null);

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

        // Clear "no contact found" tag if it was set (email is now found)
        if (noContactTagged) {
          setNoContactTagged(false);
          // Clear on server side before refresh to avoid race condition
          await fetch(`/api/admin/connections/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noContactFound: false }),
          }).catch(() => {/* silent fail */});
        }

        // Notify parent to refresh list
        onNudgeSuccess?.();
      } else {
        // Use descriptive message if available (e.g., for 422 undeliverable/risky errors)
        setEmailError(data.message || data.error || "Failed to add email");
        // 422 + undeliverable/risky: address was rejected — let the operator grab
        // a better one, or override if they're sure.
        setForceKind(
          res.status === 422 && (data.error === "undeliverable" || data.error === "risky")
            ? data.error
            : null
        );
      }
    } catch {
      setEmailError("Network error");
      setForceKind(null);
    } finally {
      setAddingEmail(false);
    }
  }

  function handleEditEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmailInput.trim()) return;

    const oldEmail = detail?.provider.email || "(none)";
    const newEmail = editEmailInput.trim();

    // Block "same email" UNLESS we're overriding a delivery issue or verification failure.
    // For Delivery Issues: admin confirmed the email works (called provider), wants to trust it.
    const isOverridingIssue = c.emailIssueType === "failed" || c.emailIssueType === "invalid" ||
                               verificationStatus === "invalid" || verificationStatus === "risky";
    if (oldEmail === newEmail && !isOverridingIssue) {
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
          // Force when the operator is overriding a failed auto-check — either from
          // a prior 422 (forceKind), the inline verdict is invalid/risky, or the
          // provider is in Delivery Issues (already known to have email issues).
          force: forceKind !== null || verificationStatus === "invalid" || verificationStatus === "risky" || c.emailIssueType === "failed" || c.emailIssueType === "invalid",
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setEditEmailSuccess(true);
        // Show appropriate success message based on operation type
        setEditEmailSuccessMsg(
          data.trusted && data.resent
            ? "Email trusted! Day 0 resent. Sequence restarted."
            : data.trusted && data.resendFailed
              ? "Email trusted but resend failed. Check email logs."
              : data.trusted
                ? "Email trusted!"
                : "Email updated! Day 0 notification sent. Sequence restarted."
        );
        setEditEmailInput("");
        setForceKind(null);

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

        // Clear "no contact found" tag if it was set (email is now found/fixed)
        if (noContactTagged) {
          setNoContactTagged(false);
          // Clear on server side before refresh to avoid race condition
          await fetch(`/api/admin/connections/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noContactFound: false }),
          }).catch(() => {/* silent fail */});
        }

        // Notify parent to refresh list
        onNudgeSuccess?.();

        // Close form after showing success message (longer timeout if warning)
        editEmailTimeoutRef.current = setTimeout(() => {
          setEditingEmail(false);
          setEditEmailSuccess(false);
          setEditEmailSuccessMsg(null);
          setEditEmailError(null);
          editEmailTimeoutRef.current = null;
        }, warning ? 5000 : 3000);
      } else {
        // Use descriptive message if available (e.g., for 422 undeliverable/risky errors)
        setEditEmailError(data.message || data.error || "Failed to update email");
        // 422 + undeliverable/risky: address was rejected — let the operator grab
        // a better one, or override if they're sure.
        setForceKind(
          res.status === 422 && (data.error === "undeliverable" || data.error === "risky")
            ? data.error
            : null
        );
      }
    } catch {
      setEditEmailError("Network error");
      setForceKind(null);
    } finally {
      setEditingEmailLoading(false);
    }
  }

  // Trust email for claimed providers with delivery issues
  // This adds the email to email_overrides, allowing emails to be sent
  async function handleTrustEmail() {
    if (!c.provider.slug && !c.provider.id) {
      setTrustEmailError("Provider ID missing - cannot trust email");
      return;
    }

    setTrustingEmail(true);
    setTrustEmailError(null);
    setTrustEmailSuccess(false);

    try {
      const res = await fetch("/api/admin/email-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerSlug: c.provider.slug || c.provider.id,
          reason: "claimed_account",
          note: "Trusted via Delivery Issues tab - claimed provider with failing email",
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTrustEmailSuccess(true);
        // Notify parent to refresh list (this will move the connection out of Delivery Issues)
        onNudgeSuccess?.();
      } else {
        setTrustEmailError(data.message || data.error || "Failed to trust email");
      }
    } catch {
      setTrustEmailError("Network error");
    } finally {
      setTrustingEmail(false);
    }
  }

  // Toggle "no contact found" tag for Needs Email tab
  async function handleToggleNoContactTag() {
    setTogglingNoContactTag(true);

    try {
      const res = await fetch(`/api/admin/connections/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noContactFound: !noContactTagged,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setNoContactTagged(data.noContactFound);
        // Notify parent to refresh list (this will reorder the connection)
        onNudgeSuccess?.();
      }
    } catch {
      // Silent fail - button state will remain as is
    } finally {
      setTogglingNoContactTag(false);
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
    setTrustScoreStatus("idle");
    setTrustScoreReason("");
    setCandidateTrustScores(new Map());

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

        // Batch verify all candidates and fetch trust scores
        if (candidates.length > 0) {
          // Set all to verifying initially (use lowercase for consistency with API response)
          setCandidateStatuses(new Map(candidates.map(e => [e.toLowerCase(), "verifying" as VerificationStatus])));
          setTrustScoreStatus("scoring");

          // Run verification and trust scoring in parallel
          const [verifiedStatuses, trustScores] = await Promise.all([
            batchVerifyEmails(candidates),
            batchFetchTrustScores(candidates),
          ]);

          setCandidateStatuses(verifiedStatuses);
          setCandidateTrustScores(trustScores);

          // Also set the main input verification and trust status (normalize to lowercase for lookup)
          const mainStatus = verifiedStatuses.get(data.email.toLowerCase());
          if (mainStatus) {
            setVerificationStatus(mainStatus);
          }
          const mainTrust = trustScores.get(data.email.toLowerCase());
          if (mainTrust) {
            setTrustScoreStatus(mainTrust.level);
            setTrustScoreReason(mainTrust.reason);
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
  // Provider is inactive (deleted account, removed, etc.)
  const isProviderInactive = c.isProviderInactive === true;

  return (
    <div className="group">
      {/* Collapsed row - enhanced with more context */}
      <div className={`flex w-full items-center gap-3 px-4 py-4 transition-colors ${
        isProviderInactive
          ? "bg-red-50/40 hover:bg-red-50/60 opacity-70"
          : isAdminArchived
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
            <span className={`font-medium truncate ${isAdminArchived || isProviderInactive ? "text-gray-500" : "text-gray-900"}`}>{provider}</span>
            {isProviderInactive && (
              <span
                className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded"
                title={
                  c.inactiveProviderInfo?.deletionSource === "self"
                    ? "Provider deleted their own account"
                    : c.inactiveProviderInfo?.deletionSource === "provider_request"
                    ? "Provider requested deletion (via admin)"
                    : c.inactiveProviderInfo?.deletionSource === "admin"
                    ? "Admin removed provider from directory"
                    : "Account deactivated (reason unknown)"
                }
              >
                Provider Inactive
              </span>
            )}
            {isAdminArchived && !isProviderInactive && (
              <span
                className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded"
                title={
                  c.isProviderArchived
                    ? c.providerArchiveInfo?.notes || c.providerArchiveInfo?.reason || "Archived"
                    : c.rawArchiveReason?.trim() || "Archived"
                }
              >
                {c.isProviderArchived
                  ? getAdminArchiveReasonLabel(c.providerArchiveInfo?.reason)
                  : "Archived"}
              </span>
            )}
            {/* Verified checkmark - only shown for verified providers (clean, minimal) */}
            {c.provider.isAccountClaimed && (c.provider.verificationState === "verified" || c.provider.verificationState === "not_required") && (
              <span className="text-primary-600 shrink-0" title="Verified">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
              </span>
            )}
            <EngagementBadges engagement={engagement} engagementLevel={c.engagementLevel} messaged={c.responded} markedReplied={c.markedReplied} alreadyConnected={c.alreadyConnected} adminOverride={c.adminOverride} compact />
          </div>
          {/* Secondary line: care type (+ timeline for family perspective) | waiting status | nudge info | badges */}
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            {/* Show category always, timeline only for family perspective */}
            {(careType || (perspective === "family" && timeline)) && (
              <>
                <span className="truncate">
                  {careType}{careType && perspective === "family" && timeline ? " · " : ""}{perspective === "family" ? timeline : ""}
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
            {/* Skip if admin marked "not_interested" - that badge is shown via EngagementBadges */}
            {c.archived && c.archiveReason && c.adminOverride?.status !== "not_interested" && (
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
            {/* "No contact found" tag indicator - shown in Needs Email tab */}
            {noContactTagged && !emailSuccess && (
              <>
                <span className="text-gray-300">|</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-600" title={c.noContactFoundAt ? `Tagged ${daysAgo(c.noContactFoundAt)}` : "No contact found"}>
                  No contact
                </span>
              </>
            )}
            {/* Claim/Verification status badges */}
            {!c.provider.isAccountClaimed ? (
              // Unclaimed provider - show gray badge
              <>
                <span className="text-gray-300">|</span>
                <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded">
                  Unclaimed
                </span>
              </>
            ) : c.provider.verificationState === "pending" ? (
              <>
                <span className="text-gray-300">|</span>
                <a
                  href={`/admin/verification?search=${encodeURIComponent(c.provider.display_name || "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors"
                  title="Click to review verification"
                >
                  Pending Verification
                </a>
              </>
            ) : c.provider.verificationState === "unverified" ? (
              <>
                <span className="text-gray-300">|</span>
                <a
                  href={`/admin/verification?search=${encodeURIComponent(c.provider.display_name || "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                  title="Click to verify this provider"
                >
                  Unverified
                </a>
              </>
            ) : c.provider.verificationState === "rejected" ? (
              <>
                <span className="text-gray-300">|</span>
                <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                  Rejected
                </span>
              </>
            ) : null}
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

        {/* Actions button - hover reveal */}
        {/* Don't show for provider-declined connections (they already made their decision) */}
        {onConnectionAction && !isDeclined && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const isConnectionArchived = c.archived === true && !c.archiveReason;
              const isProviderArchived = c.isProviderArchived === true;
              onConnectionAction(
                c.id,
                c.provider.id ?? null,
                c.family.display_name,
                c.provider.display_name,
                isConnectionArchived,
                isProviderArchived,
                c.providerArchiveInfo,
                c.rawArchiveReason
              );
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 transition-all text-gray-300 hover:text-gray-600"
            title="Actions"
          >
            {/* Ellipsis vertical icon (more options) */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
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
                <EngagementBadges engagement={detail.engagement} engagementLevel={c.engagementLevel} markedReplied={c.markedReplied} alreadyConnected={c.alreadyConnected} adminOverride={c.adminOverride} />

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
                              {c.provider.isAccountClaimed ? (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-gray-400" title="Provider has claimed this account and manages their own email">
                                    Claimed
                                  </span>
                                  {/* Trust button for claimed providers with delivery issues */}
                                  {(c.emailIssueType === "failed" || c.emailIssueType === "invalid") && !c.emailTrusted && !trustEmailSuccess && (
                                    <button
                                      type="button"
                                      onClick={handleTrustEmail}
                                      disabled={trustingEmail}
                                      className="text-xs text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50"
                                      title="Trust this email address - will bypass delivery checks"
                                    >
                                      {trustingEmail ? "Trusting..." : "Trust Email"}
                                    </button>
                                  )}
                                  {trustEmailSuccess && (
                                    <span className="text-xs text-emerald-600">✓ Trusted</span>
                                  )}
                                  {trustEmailError && (
                                    <span className="text-xs text-red-600">{trustEmailError}</span>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (editEmailTimeoutRef.current) {
                                      clearTimeout(editEmailTimeoutRef.current);
                                      editEmailTimeoutRef.current = null;
                                    }
                                    setEditingEmail(true);
                                    const existingEmail = detail.provider.email || "";
                                    setEditEmailInput(existingEmail);
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
                                    setForceKind(null);
                                    // Clear trust score state
                                    setTrustScoreStatus("idle");
                                    setTrustScoreReason("");
                                    setCandidateTrustScores(new Map());

                                    // Auto-verify for providers with email issues (Delivery Issues tab)
                                    // This shows the verification status immediately without requiring blur
                                    if ((c.emailIssueType === "failed" || c.emailIssueType === "invalid") && existingEmail) {
                                      handleEmailBlur(existingEmail, "edit");
                                    }
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                            {(c.emailIssueType === "failed" || c.emailIssueType === "invalid") && !c.emailTrusted && !trustEmailSuccess && (
                              <p className="text-xs text-amber-600 mt-1">
                                ⚠️ {c.emailIssueType === "failed" ? "Delivery failed" : "Invalid email"} — {c.provider.isAccountClaimed ? "use Trust Email if confirmed working" : "needs replacement"}
                              </p>
                            )}
                            {c.emailTrusted && (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5" title="Admin-confirmed — we'll stop flagging this address">
                                Trusted ✓
                              </span>
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
                                    // Reset verification and trust score when typing
                                    setVerificationStatus("idle");
                                    setTrustScoreStatus("idle");
                                    setTrustScoreReason("");
                                    setForceKind(null);
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
                                    className="px-2 py-1 text-xs font-medium text-teal-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
                              {/* One primary action. When the address failed the
                                  auto-check, the operator overriding it is the
                                  expected path — so the button itself becomes
                                  "Save anyway" instead of a disabled Save + a
                                  buried link. The confirm modal is the safety net. */}
                              <button
                                type="submit"
                                disabled={
                                  editingEmailLoading ||
                                  findingEmail ||
                                  !editEmailInput.trim() ||
                                  // Allow override of existing email when it's known to have issues
                                  // (either from fresh verification or from existing emailIssueType)
                                  (editEmailInput === detail.provider.email &&
                                    verificationStatus !== "invalid" &&
                                    verificationStatus !== "risky" &&
                                    forceKind === null &&
                                    c.emailIssueType !== "failed" &&
                                    c.emailIssueType !== "invalid")
                                }
                                className="px-3 py-1 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {editingEmailLoading
                                  ? "Saving..."
                                  : verificationStatus === "invalid" || verificationStatus === "risky" || forceKind !== null || c.emailIssueType === "failed" || c.emailIssueType === "invalid"
                                    ? "Save anyway"
                                    : "Save"}
                              </button>
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
                                  setForceKind(null);
                                  // Reset trust score state
                                  setTrustScoreStatus("idle");
                                  setTrustScoreReason("");
                                  setCandidateTrustScores(new Map());
                                }}
                                disabled={editingEmailLoading || findingEmail}
                                className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                            {/* Verification and trust score badges */}
                            <div className="flex items-center gap-3">
                              <EmailVerificationBadge status={verificationStatus} showHelperText />
                              <TrustScoreBadge status={trustScoreStatus} reason={trustScoreReason} />
                            </div>
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
                                          // Update trust score to match selected candidate
                                          const trustScore = candidateTrustScores.get(email.toLowerCase());
                                          if (trustScore) {
                                            setTrustScoreStatus(trustScore.level);
                                            setTrustScoreReason(trustScore.reason);
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
                            {editEmailSuccess && editEmailSuccessMsg && (
                              <p className="text-xs text-emerald-600">
                                {editEmailSuccessMsg}
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
                                // Reset verification and trust score when typing
                                setVerificationStatus("idle");
                                setTrustScoreStatus("idle");
                                setTrustScoreReason("");
                                setForceKind(null);
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
                                className="px-2 py-1 text-xs font-medium text-teal-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
                            disabled={addingEmail || findingEmail || !emailInput.trim()}
                            className="px-3 py-1 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {addingEmail
                              ? "Adding..."
                              : verificationStatus === "invalid" || verificationStatus === "risky" || forceKind !== null
                                ? "Add anyway"
                                : "Add"}
                          </button>
                        </div>
                        {/* Verification and trust score badges */}
                        <div className="flex items-center gap-3">
                          <EmailVerificationBadge status={verificationStatus} showHelperText />
                          <TrustScoreBadge status={trustScoreStatus} reason={trustScoreReason} />
                        </div>
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
                                      // Update trust score to match selected candidate
                                      const trustScore = candidateTrustScores.get(email.toLowerCase());
                                      if (trustScore) {
                                        setTrustScoreStatus(trustScore.level);
                                        setTrustScoreReason(trustScore.reason);
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
                        {/* "No contact found" tag button - for Needs Email tab */}
                        {c.emailIssueType === "no_email" && !emailSuccess && (
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={handleToggleNoContactTag}
                              disabled={togglingNoContactTag}
                              className={`px-2 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                                noContactTagged
                                  ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              {togglingNoContactTag
                                ? "Updating..."
                                : noContactTagged
                                  ? "Tagged"
                                  : "Tag as no contact"}
                            </button>
                            {noContactTagged && (
                              <span className="text-xs text-gray-400">
                                (will sink to bottom of list)
                              </span>
                            )}
                          </div>
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

              {/* Admin archive information - show for provider-level or connection-level admin archives */}
              {(c.isProviderArchived || (c.archived && !c.archiveReason)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">📁</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-amber-900 mb-1">
                        {c.isProviderArchived ? "Provider Archived" : "Lead Archived"}
                      </h3>
                      <p className="text-sm text-amber-800">
                        <span className="font-medium">Reason:</span>{" "}
                        {c.isProviderArchived
                          ? getAdminArchiveReasonLabel(c.providerArchiveInfo?.reason)
                          : (c.rawArchiveReason?.trim() || "Not specified")}
                      </p>
                      {c.isProviderArchived && c.providerArchiveInfo?.notes && (
                        <p className="text-sm text-amber-800 mt-1">
                          <span className="font-medium">Notes:</span> {c.providerArchiveInfo.notes}
                        </p>
                      )}
                      {c.isProviderArchived && c.providerArchiveInfo?.archivedBy && (
                        <p className="text-xs text-amber-600 mt-2">
                          Archived by {c.providerArchiveInfo.archivedBy}
                          {c.providerArchiveInfo.archivedAt && (
                            <> · {daysAgo(c.providerArchiveInfo.archivedAt)}</>
                          )}
                        </p>
                      )}
                      {!c.isProviderArchived && c.archivedAt && (
                        <p className="text-xs text-amber-600 mt-2">
                          Archived {daysAgo(c.archivedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Admin marked not interested - show reason and notes */}
              {c.adminOverride?.status === "not_interested" && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">✋</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-orange-900 mb-1">
                        Marked Not Interested
                      </h3>
                      <p className="text-sm text-orange-800">
                        <span className="font-medium">Reason:</span> {c.adminOverride.reason}
                      </p>
                      {c.adminOverride.notes && (
                        <p className="text-sm text-orange-800 mt-1">
                          <span className="font-medium">Notes:</span> {c.adminOverride.notes}
                        </p>
                      )}
                      {c.adminOverride.marked_by_email && (
                        <p className="text-xs text-orange-600 mt-2">
                          Marked by {c.adminOverride.marked_by_email}
                          {c.adminOverride.marked_at && (
                            <> · {daysAgo(c.adminOverride.marked_at)}</>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Provider inactive information - shows WHO deleted the provider */}
              {c.isProviderInactive && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🚫</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-900 mb-1">
                        Provider Inactive
                      </h3>
                      <p className="text-sm text-red-800">
                        <span className="font-medium">Deleted by:</span>{" "}
                        {c.inactiveProviderInfo?.deletionSource === "self" ? (
                          "Provider (self-deleted their account)"
                        ) : c.inactiveProviderInfo?.deletionSource === "provider_request" ? (
                          "Provider request (admin processed)"
                        ) : c.inactiveProviderInfo?.deletionSource === "admin" ? (
                          "Admin (removed from directory)"
                        ) : (
                          "Unknown"
                        )}
                      </p>
                      {/* Show deletion reason for admin deletions */}
                      {c.inactiveProviderInfo?.deletionSource === "admin" && c.inactiveProviderInfo.deletionReason && (
                        <p className="text-sm text-red-800 mt-1">
                          <span className="font-medium">Reason:</span>{" "}
                          {c.inactiveProviderInfo.deletionReason === "data_sweep" ? "Data cleanup" :
                           c.inactiveProviderInfo.deletionReason === "duplicate" ? "Duplicate entry" :
                           c.inactiveProviderInfo.deletionReason === "out_of_scope" ? "Out of scope" :
                           c.inactiveProviderInfo.deletionReason === "other" ? "Other" :
                           c.inactiveProviderInfo.deletionReason}
                        </p>
                      )}
                      {c.inactiveProviderInfo?.deletedAt && (
                        <p className="text-xs text-red-600 mt-2">
                          Deleted {daysAgo(c.inactiveProviderInfo.deletedAt)}
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
              {/* Filter emails by perspective: provider view = provider emails, family view = family emails */}
              {(() => {
                const filteredEmails = detail.emails.filter(e =>
                  perspective === "family"
                    ? e.recipient_type === "family"
                    : e.recipient_type !== "family"
                );
                if (filteredEmails.length === 0) return null;
                return (
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
                    Show {filteredEmails.length} email{filteredEmails.length !== 1 ? "s" : ""} sent
                  </button>

                  {showEmails && (
                    <div className="mt-2 bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                      {filteredEmails.map((e) => (
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
                );
              })()}
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

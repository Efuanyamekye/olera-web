"use client";

/**
 * ProviderDrawer - Airbnb-inspired detail drawer for provider outreach
 *
 * Slides from right, shows all provider details in a clean layout.
 * Reduces visual clutter in the main provider row by moving secondary
 * information here (Apollo contacts, notes, activity, full actions).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { DrawerShell } from "@/components/admin/medjobs/DrawerShell";
import { EmailHistoryPopover } from "@/components/admin/provider-outreach/EmailHistoryPopover";
import EmailVerificationBadge, { type VerificationStatus } from "@/components/admin/EmailVerificationBadge";
import TrustScoreBadge, { type TrustScoreStatus } from "@/components/admin/TrustScoreBadge";

// ─────────────────────────────────────────────────────────────────────────────
// Types (copied from page.tsx for standalone use)
// ─────────────────────────────────────────────────────────────────────────────

type OutreachStage =
  | "not_contacted"
  | "in_sequence"
  | "needs_call"
  | "re_engage"
  | "call_exhausted"
  | "not_interested"
  | "claimed"
  | "archived";

interface ApolloContact {
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  found_at: string;
}

interface OutreachProvider {
  provider_id: string;
  provider_name: string;
  provider_category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  zipcode: number | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  slug: string | null;
  stage: OutreachStage;
  notes: string | null;
  questions_count?: number;
  leads_count?: number;
  apollo_contact?: ApolloContact | null;
  email_source?: "organization" | "decision_maker" | null;
  assigned_to: string | null;
  emails_sent?: number;
  sequence_status?: {
    last_email_at?: string;
    failed_step?: number;
    failed_reason?: string;
  };
  // Follow Up queue fields
  due_date?: string | null;
  resend_count?: number;
  needs_call_reason?: string | null;
  engagement?: {
    emails_sent: number;
    opens: number;
    clicks: number;
    resends: number;
  };
  // Alternative Channels (re_engage) fields
  re_engage_channel?: string | null;
  re_engage_entered_at?: string | null;
  fax_number?: string | null;
  fax_confidence?: string | null;
  fax_status?: string | null;
  mail_address?: string | null;
  contact_form_url?: string | null;
  contact_form_send_count?: number;
  // Call tab (call_exhausted) fields
  stage_changed_at?: string | null;
}

interface Note {
  id: string;
  provider_id: string;
  admin_user_id: string;
  note: string;
  created_at: string;
  admin_name: string | null;
}

interface ProviderDrawerProps {
  provider: OutreachProvider;
  onClose: () => void;
  // Inline editing callbacks
  onEmailUpdate?: (providerId: string, email: string, emailSource?: "decision_maker") => void;
  onPhoneUpdate?: (providerId: string, phone: string | null) => void;
  // Action callbacks (use providerId to avoid type mismatches with page's full OutreachProvider)
  onLaunchSequence?: (providerId: string) => void;
  onMarkNotInterested?: (providerId: string, reason?: string) => void;
  onArchive?: (providerId: string) => void;
  onRemove?: (providerId: string, providerName: string) => void;
  onMoveToReady?: (providerId: string) => void;
  // Reset to Ready with Apollo email (for in_sequence providers)
  onResetToReadyWithApollo?: (providerId: string) => Promise<boolean>;
  // Apollo callbacks
  onContactFound?: (providerId: string, contact: ApolloContact) => void;
  // Outcome callback (for Follow Up and Alt Channels actions)
  onOutcomeRecorded?: (providerId: string, stageChanged: boolean) => void;
  // Claim link sent callback (updates resend_count in local state)
  onClaimLinkSent?: (providerId: string, newResendCount: number) => void;
  // Contact form sent callback (updates contact_form_send_count in local state)
  onContactFormSent?: (providerId: string, newSendCount: number) => void;
  // Current UI context
  activeTab?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Follow Up Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_CALL_REASON_LABELS: Record<string, string> = {
  sequence_exhausted: "Sequence done",
  sequence_completed: "Sequence done",
  clicked_not_claimed: "Clicked",
  replied: "Replied",
  email_bounced: "Bounced",
  manual: "Manual",
};

function getTodayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// Days until a future date (positive = future, negative = overdue)
function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0;
  const today = new Date(getTodayISO());
  const targetDate = new Date(dateStr);
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatDueDateBadge(dateStr: string | null): { text: string; className: string } {
  if (!dateStr) {
    return { text: "Due today", className: "bg-amber-100 text-amber-700" };
  }

  const daysDiff = daysUntil(dateStr);

  if (daysDiff < 0) {
    const daysOverdue = Math.abs(daysDiff);
    return {
      text: daysOverdue === 1 ? "1 day overdue" : `${daysOverdue} days overdue`,
      className: "bg-red-100 text-red-700",
    };
  } else if (daysDiff === 0) {
    return { text: "Due today", className: "bg-amber-100 text-amber-700" };
  } else if (daysDiff === 1) {
    return { text: "Tomorrow", className: "bg-blue-100 text-blue-700" };
  } else {
    return { text: `In ${daysDiff} days`, className: "bg-gray-100 text-gray-600" };
  }
}

function getNeedsCallReasonChip(reason: string | null): { label: string; className: string } | null {
  if (!reason) return null;
  const label = NEEDS_CALL_REASON_LABELS[reason] || reason;
  switch (reason) {
    case "sequence_exhausted":
    case "sequence_completed":
      return { label, className: "bg-blue-50 text-blue-700" };
    case "clicked_not_claimed":
      return { label, className: "bg-emerald-50 text-emerald-700" };
    case "replied":
      return { label, className: "bg-purple-50 text-purple-700" };
    case "email_bounced":
      return { label, className: "bg-red-50 text-red-700" };
    case "manual":
    default:
      return { label, className: "bg-gray-100 text-gray-600" };
  }
}

function getFollowUpReasonExplanation(provider: OutreachProvider): string {
  const reason = provider.needs_call_reason;
  const engagement = provider.engagement || { emails_sent: 0, opens: 0, clicks: 0, resends: 0 };

  switch (reason) {
    case "replied":
      return "Provider replied to an email — this is a hot lead.";
    case "clicked_not_claimed":
      return `Provider clicked ${engagement.clicks} time${engagement.clicks !== 1 ? "s" : ""} but didn't claim.`;
    case "sequence_exhausted":
    case "sequence_completed":
      if (engagement.opens > 0) {
        return `Provider opened ${engagement.opens} email${engagement.opens !== 1 ? "s" : ""} but didn't click.`;
      } else {
        return "No email engagement detected.";
      }
    case "email_bounced":
      return "Email bounced — contact info needs to be updated.";
    case "manual":
      return "Manually added to follow-up queue.";
    default:
      return "Ready for follow-up.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Components
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
      {children}
    </h3>
  );
}

function SectionDivider() {
  return <div className="border-t border-gray-200 my-8" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Script Section (personalized for the provider)
// ─────────────────────────────────────────────────────────────────────────────

function CallScriptSection({ provider }: { provider: OutreachProvider }) {
  const providerName = provider.provider_name || "the provider";
  const city = provider.city || "your area";
  const careType = provider.provider_category || "senior care";
  const email = provider.email || "[email on file]";

  return (
    <details className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
      <summary className="px-3 py-2 text-sm font-medium text-amber-800 cursor-pointer hover:bg-amber-100 select-none flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        </svg>
        Call Script
      </summary>
      <div className="px-3 py-2.5 border-t border-amber-200 text-sm text-amber-900 space-y-2">
        <p>
          &quot;Hi, this is <span className="font-semibold">[Your Name]</span> from Olera, calling on behalf of Dr. Logan DuBose&apos;s office.&quot;
        </p>
        <p>
          &quot;I&apos;m following up on the emails we sent about your listing on Olera. We run a free family referral service for <span className="font-semibold">{careType}</span> in <span className="font-semibold">{city}</span>.&quot;
        </p>
        <p>
          &quot;I wanted to check if you had any questions or if there&apos;s anything stopping you from activating your page. It takes about 30 seconds.&quot;
        </p>
        <p>
          &quot;I can resend the link right now if that helps—is <span className="font-semibold">{email}</span> still the best address?&quot;
        </p>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact Section (Email + Phone with inline edit)
// ─────────────────────────────────────────────────────────────────────────────

function ContactSection({
  provider,
  onEmailUpdate,
  onPhoneUpdate,
}: {
  provider: OutreachProvider;
  onEmailUpdate?: (email: string) => void;
  onPhoneUpdate?: (phone: string | null) => void;
}) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [emailValue, setEmailValue] = useState(provider.email || "");
  const [phoneValue, setPhoneValue] = useState(provider.phone || "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Auto email finding state
  const [findingEmail, setFindingEmail] = useState(false);
  const [foundEmail, setFoundEmail] = useState<{ email: string; source: string | null; foundUrl: string | null } | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const findAttemptedRef = useRef(false);

  // Email verification and trust score state
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("idle");
  const [trustScoreStatus, setTrustScoreStatus] = useState<TrustScoreStatus>("idle");
  const [trustScoreReason, setTrustScoreReason] = useState("");
  const verifyRequestIdRef = useRef(0);

  // Verify email address
  const verifyEmail = useCallback(async (emailToVerify: string): Promise<VerificationStatus> => {
    if (!emailToVerify || !emailToVerify.includes("@")) return "idle";

    try {
      const res = await fetch("/api/admin/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToVerify }),
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

  // Fetch trust score for email
  // Note: Trust score API requires provider slug (business_profiles.id), not provider_id
  const fetchTrustScore = useCallback(async (emailToCheck: string): Promise<{ level: TrustScoreStatus; reason: string }> => {
    if (!emailToCheck || !emailToCheck.includes("@") || !provider.slug) {
      return { level: "idle", reason: "" };
    }

    try {
      const res = await fetch("/api/admin/connections/preview-trust-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToCheck, providerId: provider.slug }),
      });

      if (!res.ok) return { level: "idle", reason: "" };

      const data = await res.json();
      return { level: data.level as TrustScoreStatus, reason: data.reason || "" };
    } catch {
      return { level: "idle", reason: "" };
    }
  }, [provider.slug]);

  // Run verification and trust scoring in parallel
  const verifyAndScore = useCallback(async (emailToCheck: string) => {
    if (!emailToCheck || !emailToCheck.includes("@")) {
      setVerificationStatus("idle");
      setTrustScoreStatus("idle");
      setTrustScoreReason("");
      return;
    }

    const requestId = ++verifyRequestIdRef.current;

    setVerificationStatus("verifying");
    setTrustScoreStatus("scoring");

    const [verifyStatus, trustResult] = await Promise.all([
      verifyEmail(emailToCheck),
      fetchTrustScore(emailToCheck),
    ]);

    // Only update if this is still the latest request
    if (verifyRequestIdRef.current === requestId) {
      setVerificationStatus(verifyStatus);
      setTrustScoreStatus(trustResult.level);
      setTrustScoreReason(trustResult.reason);
    }
  }, [verifyEmail, fetchTrustScore]);

  // Reset state when provider changes
  const lastProviderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastProviderIdRef.current !== provider.provider_id) {
      lastProviderIdRef.current = provider.provider_id;
      findAttemptedRef.current = false;
      setFoundEmail(null);
      setFindError(null);
      setFindingEmail(false);
      // Reset verification state
      setVerificationStatus("idle");
      setTrustScoreStatus("idle");
      setTrustScoreReason("");
      // Reset editing state to prevent stale data if switching providers while editing
      setEditingEmail(false);
      setEditingPhone(false);
      setEmailValue(provider.email || "");
      setPhoneValue(provider.phone || "");
      setEmailError(null);
      setPhoneError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Only reset on provider_id change; email/phone values are read at that moment
  }, [provider.provider_id]);

  // Trigger verification when found email changes
  useEffect(() => {
    if (foundEmail?.email) {
      verifyAndScore(foundEmail.email);
    } else {
      setVerificationStatus("idle");
      setTrustScoreStatus("idle");
      setTrustScoreReason("");
    }
  }, [foundEmail?.email, verifyAndScore]);

  // Auto-find email when drawer opens for provider without email
  useEffect(() => {
    // Reset state when provider changes
    if (provider.email) {
      // Provider has email, nothing to find
      setFoundEmail(null);
      setFindError(null);
      return;
    }

    // Already attempted for this provider
    if (findAttemptedRef.current) return;
    findAttemptedRef.current = true;

    // Track which provider this fetch is for (race condition guard)
    const fetchForProviderId = provider.provider_id;
    let cancelled = false;

    // Start finding email
    setFindingEmail(true);
    setFindError(null);
    setFoundEmail(null);

    fetch("/api/admin/provider-outreach/find-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_id: provider.provider_id }),
    })
      .then(async (res) => {
        if (cancelled) return;
        const data = await res.json();
        // Double-check we're still on the same provider
        if (lastProviderIdRef.current !== fetchForProviderId) return;

        if (data.email && data.source !== "existing") {
          setFoundEmail({
            email: data.email,
            source: data.source || null,
            foundUrl: data.foundUrl || null,
          });
        } else if (data.source === "existing") {
          // Email was found in DB (sync issue) - update parent
          onEmailUpdate?.(data.email);
        } else if (!data.email) {
          setFindError(data.error || "No email found");
        }
      })
      .catch(() => {
        if (cancelled || lastProviderIdRef.current !== fetchForProviderId) return;
        setFindError("Lookup failed");
      })
      .finally(() => {
        if (cancelled || lastProviderIdRef.current !== fetchForProviderId) return;
        setFindingEmail(false);
      });

    // Cleanup: mark as cancelled if provider changes before fetch completes
    return () => {
      cancelled = true;
    };
  }, [provider.provider_id, provider.email, onEmailUpdate]);

  // Save the found email
  async function handleSaveFoundEmail() {
    if (!foundEmail) return;
    setSavingEmail(true);
    setEmailError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id, email: foundEmail.email }),
      });
      if (res.ok) {
        onEmailUpdate?.(foundEmail.email);
        setFoundEmail(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setEmailError(data.error || "Failed to save");
      }
    } catch {
      setEmailError("Network error");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSaveEmail() {
    if (!emailValue.trim()) return;
    setSavingEmail(true);
    setEmailError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id, email: emailValue.trim() }),
      });
      if (res.ok) {
        onEmailUpdate?.(emailValue.trim());
        setEditingEmail(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setEmailError(data.error || "Failed to save");
      }
    } catch {
      setEmailError("Network error");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSavePhone() {
    setSavingPhone(true);
    setPhoneError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-phone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id, phone: phoneValue.trim() }),
      });
      if (res.ok) {
        onPhoneUpdate?.(phoneValue.trim() || null);
        setEditingPhone(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setPhoneError(data.error || "Failed to save");
      }
    } catch {
      setPhoneError("Network error");
    } finally {
      setSavingPhone(false);
    }
  }

  return (
    <div>
      <SectionHeader>Contact</SectionHeader>

      <div className="space-y-4">
        {/* Email */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 w-16">Email</span>
        {editingEmail ? (
          <div className="flex items-center gap-2 flex-1 ml-3">
            <input
              type="email"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEmail();
                if (e.key === "Escape") {
                  e.stopPropagation(); // Prevent drawer from closing
                  setEditingEmail(false);
                  setEmailValue(provider.email || "");
                }
              }}
              autoFocus
            />
            <button
              onClick={handleSaveEmail}
              disabled={savingEmail || !emailValue.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {savingEmail ? "..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditingEmail(false);
                setEmailValue(provider.email || "");
                setEmailError(null);
              }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
            {emailError && <span className="text-xs text-red-500">{emailError}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-1 ml-3">
            {provider.email ? (
              <>
                <a
                  href={`mailto:${provider.email}`}
                  className="text-sm text-primary-600 hover:underline"
                >
                  {provider.email}
                </a>
                <EmailHistoryPopover providerId={provider.provider_id} currentEmail={provider.email} />
              </>
            ) : findingEmail ? (
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <span className="w-3 h-3 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin" />
                Finding email...
              </span>
            ) : foundEmail ? (
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    verificationStatus === "invalid" ? "text-red-600" :
                    verificationStatus === "risky" ? "text-amber-600" :
                    "text-emerald-600"
                  }`}>{foundEmail.email}</span>
                  {/* Save button - changes style based on verification status */}
                  {verificationStatus === "invalid" || verificationStatus === "risky" ? (
                    <button
                      onClick={handleSaveFoundEmail}
                      disabled={savingEmail}
                      className="px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50"
                    >
                      {savingEmail ? "..." : "Save anyway"}
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveFoundEmail}
                      disabled={savingEmail || verificationStatus === "verifying"}
                      className="px-2 py-0.5 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {savingEmail ? "..." : "Save"}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Found via {foundEmail.source === "scrape" ? "web scraping" : foundEmail.source === "perplexity" ? "AI analysis" : "search"}
                  {foundEmail.foundUrl && (
                    <>
                      {" · "}
                      <a
                        href={foundEmail.foundUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        View source
                      </a>
                    </>
                  )}
                </p>
                {/* Verification and trust score badges */}
                {(verificationStatus !== "idle" || trustScoreStatus !== "idle") && (
                  <div className="flex items-center gap-3 mt-2">
                    <EmailVerificationBadge status={verificationStatus} showHelperText />
                    <TrustScoreBadge status={trustScoreStatus} reason={trustScoreReason} />
                  </div>
                )}
                {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
              </div>
            ) : (
              <span className="text-sm text-gray-400 italic">
                {findError || "No email"}
              </span>
            )}
            <button
              onClick={() => {
                setEditingEmail(true);
                setEmailValue(provider.email || foundEmail?.email || "");
              }}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Phone */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 w-16">Phone</span>
        {editingPhone ? (
          <div className="flex items-center gap-2 flex-1 ml-3">
            <input
              type="tel"
              value={phoneValue}
              onChange={(e) => setPhoneValue(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="(555) 123-4567"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePhone();
                if (e.key === "Escape") {
                  e.stopPropagation(); // Prevent drawer from closing
                  setEditingPhone(false);
                  setPhoneValue(provider.phone || "");
                }
              }}
              autoFocus
            />
            <button
              onClick={handleSavePhone}
              disabled={savingPhone}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {savingPhone ? "..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditingPhone(false);
                setPhoneValue(provider.phone || "");
                setPhoneError(null);
              }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
            {phoneError && <span className="text-xs text-red-500">{phoneError}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-1 ml-3">
            {provider.phone ? (
              <a
                href={`tel:${provider.phone.replace(/\D/g, "")}`}
                className="text-sm text-primary-600 hover:underline"
              >
                {formatPhone(provider.phone)}
              </a>
            ) : (
              <span className="text-sm text-gray-400 italic">No phone</span>
            )}
            <button
              onClick={() => {
                setEditingPhone(true);
                setPhoneValue(provider.phone || "");
              }}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
            >
              Edit
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision Maker Section (Apollo data - clean, no colored boxes)
// ─────────────────────────────────────────────────────────────────────────────

function DecisionMakerSection({
  provider,
  onUseEmail,
  onContactFound,
  onResetToReadyWithApollo,
}: {
  provider: OutreachProvider;
  onUseEmail?: (email: string) => void;
  onContactFound?: (contact: ApolloContact) => void;
  onResetToReadyWithApollo?: () => Promise<boolean>;
}) {
  const [finding, setFinding] = useState(false);
  const [using, setUsing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localContact, setLocalContact] = useState<ApolloContact | null>(
    provider.apollo_contact || null
  );

  const contact = localContact;
  const isActive = provider.email_source === "decision_maker";
  const emailsMatch = contact?.email?.toLowerCase() === provider.email?.toLowerCase();
  const isInSequence = provider.stage === "in_sequence";

  async function handleFind() {
    setFinding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/find-decision-maker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.contact?.email) {
        const foundContact: ApolloContact = {
          email: data.contact.email,
          first_name: data.contact.first_name,
          last_name: data.contact.last_name,
          title: data.contact.title,
          linkedin_url: data.contact.linkedin_url,
          found_at: new Date().toISOString(),
        };
        setLocalContact(foundContact);
        // Notify parent to sync state
        onContactFound?.(foundContact);
      } else {
        setError("No decision-maker found");
      }
    } catch {
      setError("Lookup failed");
    } finally {
      setFinding(false);
    }
  }

  async function handleUseEmail() {
    if (!contact?.email || using) return;
    setUsing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.provider_id,
          email: contact.email,
          confirm_apollo: true,
        }),
      });
      if (res.ok) {
        onUseEmail?.(contact.email);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update");
      }
    } catch {
      setError("Failed to update");
    } finally {
      setUsing(false);
    }
  }

  async function handleResetToReady() {
    if (!onResetToReadyWithApollo || resetting) return;
    setResetting(true);
    setError(null);
    try {
      const success = await onResetToReadyWithApollo();
      if (!success) {
        setError("Failed to reset");
      }
    } catch {
      setError("Failed to reset");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div>
      <SectionHeader>Decision Maker (Apollo)</SectionHeader>

      {!contact ? (
        <div className="flex items-center gap-3">
          <button
            onClick={handleFind}
            disabled={finding}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50"
          >
            {finding ? (
              <>
                <span className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                Finding...
              </>
            ) : (
              "Find Decision Maker"
            )}
          </button>
          {error && <span className="text-sm text-amber-600">{error}</span>}
        </div>
      ) : (
        <div className="space-y-1">
          {/* Name - bold */}
          <p className="font-medium text-gray-900">
            {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown"}
          </p>

          {/* Title · Email · LinkedIn - all inline */}
          {(contact.title || contact.email || contact.linkedin_url) && (
            <p className="text-sm text-gray-500">
              {contact.title}
              {contact.title && contact.email && <span className="mx-1.5">·</span>}
              {contact.email}
              {(contact.title || contact.email) && contact.linkedin_url && <span className="mx-1.5">·</span>}
              {contact.linkedin_url && (
                <a
                  href={contact.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  LinkedIn
                </a>
              )}
            </p>
          )}

          {/* Action buttons - only show when needed */}
          {(!isActive && !emailsMatch && contact.email) || (isInSequence && contact?.email && !emailsMatch && onResetToReadyWithApollo) ? (
            <div className="pt-2 flex flex-wrap items-center gap-2">
              {!isActive && !emailsMatch && contact.email && (
                <button
                  onClick={handleUseEmail}
                  disabled={using}
                  className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition disabled:opacity-50"
                >
                  {using ? "Updating..." : "Use This Email"}
                </button>
              )}
              {isInSequence && contact?.email && !emailsMatch && onResetToReadyWithApollo && (
                <button
                  onClick={handleResetToReady}
                  disabled={resetting}
                  className="px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition disabled:opacity-50"
                >
                  {resetting ? "Resetting..." : "Reset to Ready with This Email"}
                </button>
              )}
              {error && <span className="text-sm text-amber-600">{error}</span>}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notes Section
// ─────────────────────────────────────────────────────────────────────────────

function NotesSection({ provider }: { provider: OutreachProvider }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function fetchNotes() {
      try {
        const res = await fetch(
          `/api/admin/provider-outreach/notes?provider_id=${encodeURIComponent(provider.provider_id)}`
        );
        if (res.ok) {
          const data = await res.json();
          setNotes(data.notes || []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchNotes();
  }, [provider.provider_id]);

  const handleSubmit = useCallback(async () => {
    if (!newNote.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.provider_id,
          note: newNote.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => [data.note, ...prev]);
        setNewNote("");
      } else {
        setSubmitError("Failed to add note");
      }
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }, [newNote, provider.provider_id, submitting]);

  return (
    <div>
      <SectionHeader>Notes</SectionHeader>

      {/* Add note input */}
      <div className="mb-5">
        <textarea
          ref={textareaRef}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          rows={2}
          disabled={submitting}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
            // Prevent ESC from bubbling to drawer and closing it while editing
            if (e.key === "Escape") {
              e.stopPropagation();
              // Clear the note and blur the textarea
              setNewNote("");
              textareaRef.current?.blur();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Ctrl+Enter to submit</span>
            {submitError && <span className="text-xs text-red-500">{submitError}</span>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!newNote.trim() || submitting}
            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add Note"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No notes yet</p>
      ) : (
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {notes.map((note) => (
            <div key={note.id} className="text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-700">{note.admin_name || "Unknown"}</span>
                <span className="text-xs text-gray-400">{formatDate(note.created_at)}</span>
              </div>
              <p className="text-gray-600 whitespace-pre-wrap">{note.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Section (Questions & Leads)
// ─────────────────────────────────────────────────────────────────────────────

function ActivitySection({ provider }: { provider: OutreachProvider }) {
  const questionsCount = provider.questions_count ?? 0;
  const leadsCount = provider.leads_count ?? 0;
  const emailsSent = provider.resend_count ?? 0;

  return (
    <div>
      <SectionHeader>Activity</SectionHeader>
      <div className="flex items-center gap-6">
        <div>
          <span className="text-2xl font-semibold text-gray-900">{emailsSent}</span>
          <span className="ml-1.5 text-sm text-gray-500">Emails Sent</span>
        </div>
        <div>
          <span className="text-2xl font-semibold text-gray-900">{questionsCount}</span>
          <span className="ml-1.5 text-sm text-gray-500">Questions</span>
        </div>
        <div>
          <span className="text-2xl font-semibold text-gray-900">{leadsCount}</span>
          <span className="ml-1.5 text-sm text-gray-500">Leads</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Follow Up Section (for needs_call stage)
// ─────────────────────────────────────────────────────────────────────────────

function FollowUpSection({
  provider,
}: {
  provider: OutreachProvider;
}) {
  const dueBadge = formatDueDateBadge(provider.due_date || null);
  const reasonChip = getNeedsCallReasonChip(provider.needs_call_reason || null);
  const explanation = getFollowUpReasonExplanation(provider);
  const engagement = provider.engagement || { emails_sent: 0, opens: 0, clicks: 0, resends: 0 };
  const resendCount = provider.resend_count ?? 0;
  const contactFormSendCount = provider.contact_form_send_count ?? 0;

  return (
    <div>
      <SectionHeader>Follow Up Status</SectionHeader>

      {/* Due date and reason badges */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${dueBadge.className}`}>
          {dueBadge.text}
        </span>
        {reasonChip && (
          <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${reasonChip.className}`}>
            {reasonChip.label}
          </span>
        )}
      </div>

      {/* Explanation */}
      <p className="text-sm text-gray-700 mb-4">{explanation}</p>

      {/* Engagement stats */}
      <div className="flex items-center gap-4 text-sm mb-6">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Emails:</span>
          <span className="font-medium text-gray-900">{engagement.emails_sent}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Opens:</span>
          <span className="font-medium text-gray-900">{engagement.opens}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Clicks:</span>
          <span className="font-medium text-gray-900">{engagement.clicks}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Emails Sent:</span>
          <span className="font-medium text-gray-900">{resendCount}</span>
        </div>
        {contactFormSendCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Forms Sent:</span>
            <span className="font-medium text-gray-900">{contactFormSendCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alternative Channels Section (for re_engage stage)
// ─────────────────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, { label: string; className: string }> = {
  fax: { label: "Fax", className: "bg-purple-50 text-purple-700" },
  direct_mail: { label: "Direct Mail", className: "bg-teal-50 text-teal-700" },
  contact_form: { label: "Contact Form", className: "bg-orange-50 text-orange-700" },
  linkedin: { label: "LinkedIn", className: "bg-blue-50 text-blue-700" },
  re_engage: { label: "Email Resend", className: "bg-gray-100 text-gray-700" },
};

function daysSince(dateString: string | null): number {
  if (!dateString) return 0;
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function ReEngageSection({
  provider,
}: {
  provider: OutreachProvider;
}) {
  const channel = provider.re_engage_channel;
  const channelInfo = channel ? CHANNEL_LABELS[channel] || { label: channel, className: "bg-gray-100 text-gray-600" } : null;
  const waitDays = daysSince(provider.re_engage_entered_at || null);

  return (
    <div>
      <SectionHeader>Alternative Channel Status</SectionHeader>

      {/* Channel and wait time */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {channelInfo && (
          <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${channelInfo.className}`}>
            {channelInfo.label}
          </span>
        )}
        <span className="text-sm text-gray-600">
          {waitDays === 0 ? "Added today" : waitDays === 1 ? "1 day in stage" : `${waitDays} days in stage`}
        </span>
      </div>

      {/* Channel-specific details */}
      {channel === "fax" && provider.fax_number && (
        <div className="mb-4 p-3 bg-purple-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Fax sent to:</span>
            <span className="font-medium text-gray-900">{provider.fax_number}</span>
          </div>
        </div>
      )}

      {channel === "direct_mail" && provider.mail_address && (
        <div className="mb-4 p-3 bg-teal-50 rounded-lg">
          <div className="text-sm">
            <span className="text-gray-500">Postcard sent to:</span>
            <p className="font-medium text-gray-900 mt-1 whitespace-pre-line">{provider.mail_address}</p>
          </div>
        </div>
      )}

      {channel === "contact_form" && provider.contact_form_url && (
        <div className="mb-4 p-3 bg-orange-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Form submitted:</span>
            <a
              href={provider.contact_form_url.startsWith("http") ? provider.contact_form_url : `https://${provider.contact_form_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:underline truncate max-w-[200px]"
            >
              {provider.contact_form_url}
            </a>
          </div>
        </div>
      )}

      {/* Warning if waiting too long */}
      {waitDays >= 30 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            No response after {waitDays} days.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Exhausted Section (for call_exhausted stage - final call state)
// ─────────────────────────────────────────────────────────────────────────────

function CallExhaustedSection({
  provider,
}: {
  provider: OutreachProvider;
}) {
  const emailsSent = provider.resend_count ?? 0;
  const contactFormSendCount = provider.contact_form_send_count ?? 0;
  const daysSinceStageChange = provider.stage_changed_at
    ? Math.floor((Date.now() - new Date(provider.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div>
      <SectionHeader>Call Status</SectionHeader>

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
          Requires Call
        </span>
        <span className="text-sm text-gray-500">
          {daysSinceStageChange === 0 ? "Added today" : `${daysSinceStageChange} day${daysSinceStageChange === 1 ? "" : "s"} in stage`}
        </span>
      </div>

      {/* Instructions */}
      <div className="p-3 bg-orange-50 rounded-lg mb-4">
        <p className="text-sm text-orange-800">
          This provider needs a phone call to verify email and send claim link.
          Call them, confirm contact info, then send the claim link while on the phone.
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Emails Sent:</span>
          <span className="font-medium text-gray-900">{emailsSent}</span>
        </div>
        {contactFormSendCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Forms Sent:</span>
            <span className="font-medium text-gray-900">{contactFormSendCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions Section
// ─────────────────────────────────────────────────────────────────────────────

function ActionsSection({
  provider,
  onLaunchSequence,
  onMarkNotInterested,
  onArchive,
  onRemove,
  onMoveToReady,
  onOutcomeRecorded,
  onClaimLinkSent,
  onContactFormSent,
  onClose,
  activeTab,
}: {
  provider: OutreachProvider;
  onLaunchSequence?: (providerId: string) => void;
  onMarkNotInterested?: (providerId: string) => void;
  onArchive?: (providerId: string) => void;
  onRemove?: (providerId: string, providerName: string) => void;
  onMoveToReady?: (providerId: string) => void;
  onOutcomeRecorded?: (providerId: string, stageChanged: boolean) => void;
  onClaimLinkSent?: (providerId: string, newResendCount: number) => void;
  onContactFormSent?: (providerId: string, newSendCount: number) => void;
  onClose?: () => void;
  activeTab?: string;
}) {
  // Confirmation states for each action
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ outcome: string; emailSent?: boolean; emailError?: string } | null>(null);

  // Resend requires call confirmation checkbox
  const [confirmedCall, setConfirmedCall] = useState(false);

  // Contact form workflow state
  // Pre-fill with saved contact_form_url, or fall back to provider website
  const [contactFormUrl, setContactFormUrl] = useState<string>(
    provider.contact_form_url || provider.website || ""
  );
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [claimUrlLoading, setClaimUrlLoading] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [contactFormOpened, setContactFormOpened] = useState(false);
  const [findingContactForm, setFindingContactForm] = useState(false);

  // Fax workflow state
  const [faxNumber, setFaxNumber] = useState<string>(provider.fax_number || "");
  const [findingFax, setFindingFax] = useState(false);
  const [faxConfidence, setFaxConfidence] = useState<string | null>(provider.fax_confidence || null);
  const [sendingFax, setSendingFax] = useState(false);
  const [faxSent, setFaxSent] = useState(false);

  // Direct Mail workflow state
  const formatProviderAddress = () => {
    const parts = [provider.address, provider.city, provider.state].filter(Boolean);
    if (parts.length === 0) return "";
    const zipStr = provider.zipcode ? ` ${String(provider.zipcode).padStart(5, '0')}` : "";
    // Format: "123 Main St, City, ST 12345"
    if (provider.address && provider.city && provider.state) {
      return `${provider.address}, ${provider.city}, ${provider.state}${zipStr}`;
    }
    return parts.join(", ") + zipStr;
  };
  const [mailAddress, setMailAddress] = useState<string>(provider.mail_address || formatProviderAddress());
  const [sendingMail, setSendingMail] = useState(false);
  const [mailSent, setMailSent] = useState(false);

  // Reset contact form state when provider changes
  useEffect(() => {
    setContactFormUrl(provider.contact_form_url || provider.website || "");
    setClaimUrl(null);
    setMessageCopied(false);
    setContactFormOpened(false);
    setFindingContactForm(false);
  }, [provider.provider_id, provider.contact_form_url, provider.website]);

  // Reset fax state when provider changes
  useEffect(() => {
    setFaxNumber(provider.fax_number || "");
    setFaxConfidence(provider.fax_confidence || null);
    setFindingFax(false);
    setSendingFax(false);
    setFaxSent(false);
  }, [provider.provider_id, provider.fax_number, provider.fax_confidence]);

  // Reset mail state when provider changes
  useEffect(() => {
    setMailAddress(provider.mail_address || formatProviderAddress());
    setSendingMail(false);
    setMailSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.provider_id, provider.mail_address, provider.address, provider.city, provider.state, provider.zipcode]);

  // Auto-generate claim URL when entering contact form workflow
  useEffect(() => {
    if (confirmAction === "contact_form" && !claimUrl && !claimUrlLoading && provider.email && provider.slug) {
      handleGenerateClaimUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmAction]);

  // Auto-find contact form URL when entering workflow (if provider has website but no saved URL)
  useEffect(() => {
    if (
      confirmAction === "contact_form" &&
      provider.website &&
      !provider.contact_form_url &&
      !findingContactForm
    ) {
      setFindingContactForm(true);
      const initialUrl = provider.website;
      fetch("/api/admin/provider-outreach/find-contact-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id, website: provider.website }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.found && data.url) {
            // Only update if user hasn't edited the URL (still matches initial website)
            setContactFormUrl((current) =>
              current === initialUrl ? data.url : current
            );
          }
        })
        .catch(() => {
          // Non-fatal - keep website as fallback
        })
        .finally(() => {
          setFindingContactForm(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmAction]);

  // Auto-find fax number when entering fax workflow (if provider has website but no saved fax)
  useEffect(() => {
    if (
      confirmAction === "fax" &&
      provider.website &&
      !provider.fax_number &&
      !findingFax
    ) {
      setFindingFax(true);
      const initialFaxNumber = faxNumber; // Capture initial value
      fetch("/api/admin/provider-outreach/find-fax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.fax) {
            // Only update if user hasn't edited the fax number
            setFaxNumber((current) =>
              current === initialFaxNumber ? data.fax : current
            );
            setFaxConfidence((currentConf) =>
              currentConf === null ? data.confidence : currentConf
            );
          }
        })
        .catch(() => {
          // Non-fatal - user can enter manually
        })
        .finally(() => {
          setFindingFax(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmAction]);

  const isTerminal = ["claimed", "archived"].includes(provider.stage);
  const canLaunch = provider.stage === "not_contacted" && provider.email;
  const isFollowUp = provider.stage === "needs_call";
  const isCallExhausted = provider.stage === "call_exhausted";

  // Generic outcome handler for Follow Up actions
  async function handleRecordOutcome(outcome: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/record-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id, outcome }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Include email status for resend_link outcome
        setActionSuccess({
          outcome,
          emailSent: data.email_sent,
          emailError: data.email_error,
        });
        setConfirmAction(null);
        setConfirmedCall(false);
        onOutcomeRecorded?.(provider.provider_id, true);
        setTimeout(() => onClose?.(), 1500);
      } else {
        setActionError(data.error || "Failed");
      }
    } catch {
      setActionError("Network error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendClaimLink() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/send-claim-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionSuccess({ outcome: "claim_link" });
        setConfirmAction(null);
        // Update local state with new resend_count
        if (typeof data.resend_count === "number") {
          onClaimLinkSent?.(provider.provider_id, data.resend_count);
        }
        setTimeout(() => onClose?.(), 1200);
      } else {
        setActionError(data.error || "Failed to send");
      }
    } catch {
      setActionError("Network error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMoveToReady() {
    if (!onMoveToReady) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await onMoveToReady(provider.provider_id);
      // Parent handles success feedback and closes drawer
      setConfirmAction(null);
    } catch {
      // Parent threw - show error in modal, don't close
      setActionError("Failed to move");
    } finally {
      setActionLoading(false);
    }
  }

  function cancelConfirm() {
    setConfirmAction(null);
    setConfirmedCall(false);
    setActionError(null);
    // Reset contact form workflow state
    setContactFormUrl(provider.contact_form_url || "");
    setClaimUrl(null);
    setMessageCopied(false);
    setContactFormOpened(false);
  }

  async function handleGenerateClaimUrl() {
    setClaimUrlLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/generate-claim-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: provider.provider_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate claim URL");
      setClaimUrl(data.claim_url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to generate claim URL");
    } finally {
      setClaimUrlLoading(false);
    }
  }

  function getContactFormMessage(): string {
    if (!claimUrl) return "";
    const city = provider.city || provider.state || "your area";
    const category = provider.provider_category || "care services";
    const name = provider.provider_name;
    return `Hi, I'm Logan from Olera.

Families in ${city} searching for ${category} can already see the page we built for ${name}. But if one reached out today, no one would see the message.

Activate your page (2 min, free) to fully manage it:
${claimUrl}

Questions? support@olera.care or (979) 243-9801`;
  }

  async function handleConfirmContactFormSubmission() {
    if (!contactFormUrl) return;
    setActionLoading(true);
    setActionError(null);
    try {
      // In Follow Up (needs_call), move to Alt Channels via record-outcome
      // In other tabs, just record the send without stage change via send-contact-form
      if (isFollowUp) {
        const res = await fetch("/api/admin/provider-outreach/record-outcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider_id: provider.provider_id,
            outcome: "try_contact_form",
            notes: `Contact form submitted: ${contactFormUrl}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to record submission");
        setActionSuccess({ outcome: "try_contact_form" });
        setConfirmAction(null);
        onOutcomeRecorded?.(provider.provider_id, true);
        setTimeout(() => onClose?.(), 1500);
      } else {
        // Non-Follow-Up: Use new endpoint that doesn't change stage
        const res = await fetch("/api/admin/provider-outreach/send-contact-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider_id: provider.provider_id,
            contact_form_url: contactFormUrl.trim(),
            notes: `Contact form submitted: ${contactFormUrl}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to record submission");
        // Update local state with new send count
        onContactFormSent?.(provider.provider_id, data.send_count);
        setActionSuccess({ outcome: "contact_form_sent" });
        setConfirmAction(null);
        // Don't close drawer - provider stays in current tab
        // Auto-clear success message after 3 seconds
        setTimeout(() => setActionSuccess(null), 3000);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to record submission");
    } finally {
      setActionLoading(false);
    }
  }

  // Compact button styles
  const primaryBtn = "px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed";
  const outlineBtn = "px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed";
  const plainBtn = "px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition";

  // Show success message
  if (actionSuccess) {
    // Build message based on outcome and email status
    let message: string;
    let isWarning = false;

    if (actionSuccess.outcome === "resend_link") {
      if (actionSuccess.emailSent) {
        message = "Email resent, moved to Alt Channels";
      } else {
        message = `Moved to Alt Channels (email not sent: ${actionSuccess.emailError || "unknown error"})`;
        isWarning = true;
      }
    } else {
      const messages: Record<string, string> = {
        claim_link: "Claim link sent",
        try_fax: "Moved to Alt Channels (Fax)",
        try_contact_form: "Moved to Alt Channels (Contact Form)",
        try_direct_mail: "Moved to Alt Channels (Direct Mail)",
        direct_mail: "Postcard sent",
        contact_form_sent: "Contact form submitted",
      };
      message = messages[actionSuccess.outcome] || "Done";
    }

    return (
      <div>
        <SectionHeader>Actions</SectionHeader>
        <div className={`flex items-center gap-2 text-sm ${isWarning ? "text-amber-600" : "text-emerald-600"}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isWarning ? "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" : "M5 13l4 4L19 7"} />
          </svg>
          {message}
        </div>
      </div>
    );
  }

  // Show Contact Form workflow (special case with multi-step UI)
  if (confirmAction === "contact_form") {
    // Check preconditions
    const canGenerateClaimUrl = provider.email && provider.slug;
    const hasMessage = claimUrl && !claimUrlLoading;

    return (
      <div>
        <SectionHeader>Contact Form</SectionHeader>
        <div className="space-y-3">
          {/* 1. Contact form URL input (first - entry point) */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Contact form URL</label>
              {findingContactForm && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Finding...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={contactFormUrl}
                onChange={(e) => setContactFormUrl(e.target.value)}
                placeholder="https://example.com/contact"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
              {provider.website && (
                <a
                  href={provider.website.startsWith("http") ? provider.website : `https://${provider.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  Visit site
                </a>
              )}
            </div>
            {!provider.website && (
              <p className="text-xs text-gray-400">No website on file</p>
            )}
          </div>

          {/* 2. Message preview (below URL, clearly visible) */}
          {claimUrlLoading ? (
            <div className="p-2 bg-gray-50 rounded text-sm text-gray-500 text-center">
              Generating message...
            </div>
          ) : !canGenerateClaimUrl ? (
            <div className="p-2 bg-amber-50 rounded text-sm text-amber-700">
              {!provider.email ? "Provider needs an email address" : "Provider needs a public page"} to generate claim link.
            </div>
          ) : hasMessage ? (
            <div className="p-2 bg-gray-50 rounded text-xs text-gray-700 max-h-32 overflow-y-auto whitespace-pre-line">
              {getContactFormMessage()}
            </div>
          ) : null}

          {/* 3. Form field hints */}
          {hasMessage && (
            <div className="p-2 bg-amber-50 rounded text-xs text-amber-700">
              <strong>Fill form as:</strong> Logan DuBose · support@olera.care · (979) 243-9801
            </div>
          )}

          {/* 4. Action buttons */}
          {!contactFormOpened ? (
            <button
              onClick={async () => {
                if (!contactFormUrl.trim()) {
                  setActionError("Please enter a contact form URL");
                  return;
                }
                // Save URL to DB
                try {
                  await fetch("/api/admin/provider-outreach/save-contact-form-url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider_id: provider.provider_id, url: contactFormUrl.trim() }),
                  });
                } catch { /* non-fatal */ }
                // Copy message
                const message = getContactFormMessage();
                if (message) {
                  try {
                    await navigator.clipboard.writeText(message);
                    setMessageCopied(true);
                    setTimeout(() => setMessageCopied(false), 2000);
                  } catch { /* non-fatal */ }
                }
                // Open form
                const url = contactFormUrl.trim().startsWith("http") ? contactFormUrl.trim() : `https://${contactFormUrl.trim()}`;
                window.open(url, "_blank");
                setContactFormOpened(true);
              }}
              disabled={!hasMessage || !contactFormUrl.trim()}
              className={`${primaryBtn} w-full`}
            >
              {messageCopied ? "Copied! Opening..." : "Copy & Open Form"}
            </button>
          ) : (
            <button
              onClick={handleConfirmContactFormSubmission}
              disabled={actionLoading}
              className={`${primaryBtn} w-full bg-green-600 hover:bg-green-700`}
            >
              {actionLoading ? "Confirming..." : "Confirm Form Submitted"}
            </button>
          )}

          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <button onClick={cancelConfirm} className={`${plainBtn} w-full text-center`}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Show Fax workflow (find fax number, send fax)
  if (confirmAction === "fax") {
    return (
      <div>
        <SectionHeader>Send Fax</SectionHeader>
        <div className="space-y-3">
          {/* Fax number input */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Fax number</label>
              {findingFax && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Finding...
                </span>
              )}
              {faxConfidence && !findingFax && (
                <span className={`text-xs ${faxConfidence === "high" ? "text-green-600" : "text-amber-600"}`}>
                  {faxConfidence === "high" ? "Found" : "Possible match"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={faxNumber}
                onChange={(e) => {
                  setFaxNumber(e.target.value);
                  setFaxConfidence(null); // Clear confidence when manually editing
                }}
                placeholder="(555) 123-4567"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
              {provider.website && !findingFax && (
                <button
                  type="button"
                  onClick={async () => {
                    setFindingFax(true);
                    setActionError(null);
                    try {
                      const res = await fetch("/api/admin/provider-outreach/find-fax", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ provider_id: provider.provider_id }),
                      });
                      const data = await res.json();
                      if (data.fax) {
                        setFaxNumber(data.fax);
                        setFaxConfidence(data.confidence);
                      } else {
                        setActionError(data.error_detail || "No fax number found");
                      }
                    } catch {
                      setActionError("Failed to search for fax");
                    } finally {
                      setFindingFax(false);
                    }
                  }}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  Find Fax
                </button>
              )}
            </div>
            {!provider.website && (
              <p className="text-xs text-gray-400">No website on file - enter fax manually</p>
            )}
          </div>

          {/* Fax sent success message */}
          {faxSent && (
            <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Fax sent! Provider moved to Alternative Channels.
            </div>
          )}

          {/* Send Fax button */}
          {!faxSent && (
            <button
              onClick={async () => {
                if (!faxNumber.trim()) {
                  setActionError("Please enter a fax number");
                  return;
                }
                setSendingFax(true);
                setActionError(null);
                try {
                  // First save the fax number if entered manually
                  if (!faxConfidence) {
                    await fetch("/api/admin/provider-outreach/find-fax", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ provider_id: provider.provider_id, manual_fax: faxNumber.trim() }),
                    });
                  }
                  // Send the fax
                  const res = await fetch("/api/admin/provider-outreach/send-fax", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider_id: provider.provider_id, fax_number: faxNumber.trim() }),
                  });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    // Record the outcome to move to re_engage
                    const outcomeRes = await fetch("/api/admin/provider-outreach/record-outcome", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ provider_id: provider.provider_id, outcome: "try_fax" }),
                    });
                    if (!outcomeRes.ok) {
                      // Fax sent but tracking update failed
                      setActionError("Fax sent, but failed to update stage. Refresh and check provider status.");
                      onOutcomeRecorded?.(provider.provider_id, false);
                      return;
                    }
                    setFaxSent(true);
                    onOutcomeRecorded?.(provider.provider_id, true);
                    setTimeout(() => onClose?.(), 1500);
                  } else {
                    if (data.missing_config) {
                      setActionError("Fax service not configured. Contact admin.");
                    } else {
                      setActionError(data.error || "Failed to send fax");
                    }
                  }
                } catch {
                  setActionError("Network error");
                } finally {
                  setSendingFax(false);
                }
              }}
              disabled={sendingFax || !faxNumber.trim()}
              className={`${primaryBtn} w-full`}
            >
              {sendingFax ? "Sending..." : "Send Fax"}
            </button>
          )}

          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <button onClick={cancelConfirm} className={`${plainBtn} w-full text-center`}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Show Direct Mail workflow (enter address, send postcard)
  if (confirmAction === "direct_mail") {
    return (
      <div>
        <SectionHeader>Send Postcard</SectionHeader>
        <div className="space-y-3">
          {/* Address input */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Mailing address</label>
            <textarea
              value={mailAddress}
              onChange={(e) => setMailAddress(e.target.value)}
              placeholder="123 Main St, City, ST 12345"
              rows={3}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
            {!mailAddress && !provider.mail_address && !provider.address && (
              <p className="text-xs text-gray-400">No address on file - enter address manually</p>
            )}
            {provider.mail_address && (
              <p className="text-xs text-gray-400">Using saved mailing address</p>
            )}
            {!provider.mail_address && provider.address && (
              <p className="text-xs text-gray-400">Pre-filled from provider data</p>
            )}
          </div>

          {/* Mail sent success message */}
          {mailSent && (
            <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Postcard sent! Provider moved to Alternative Channels.
            </div>
          )}

          {/* Send Postcard button */}
          {!mailSent && (
            <button
              onClick={async () => {
                if (!mailAddress.trim()) {
                  setActionError("Please enter a mailing address");
                  return;
                }
                setSendingMail(true);
                setActionError(null);
                try {
                  // Send the postcard
                  const res = await fetch("/api/admin/provider-outreach/send-mailer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider_id: provider.provider_id,
                      provider_name: provider.provider_name,
                      address: mailAddress.trim(),
                    }),
                  });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    // Record the outcome to move to re_engage
                    const outcomeRes = await fetch("/api/admin/provider-outreach/record-outcome", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ provider_id: provider.provider_id, outcome: "try_direct_mail" }),
                    });
                    if (!outcomeRes.ok) {
                      setActionError("Postcard sent, but failed to update stage. Refresh and check provider status.");
                      onOutcomeRecorded?.(provider.provider_id, false);
                      return;
                    }
                    setMailSent(true);
                    onOutcomeRecorded?.(provider.provider_id, true);
                    setTimeout(() => onClose?.(), 1500);
                  } else {
                    if (data.missing_config) {
                      setActionError("PostGrid not configured. Contact admin.");
                    } else {
                      setActionError(data.error || "Failed to send postcard");
                    }
                  }
                } catch {
                  setActionError("Network error");
                } finally {
                  setSendingMail(false);
                }
              }}
              disabled={sendingMail || !mailAddress.trim()}
              className={`${primaryBtn} w-full`}
            >
              {sendingMail ? "Sending..." : "Send Postcard"}
            </button>
          )}

          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <button onClick={cancelConfirm} className={`${plainBtn} w-full text-center`}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Show confirmation dialog
  if (confirmAction) {
    const configs: Record<string, { title: string; requiresCall?: boolean; confirmText: string }> = {
      launch: { title: "Launch email sequence for this provider?", confirmText: "Launch" },
      claim_link: { title: "Send claim link email?", confirmText: "Send" },
      send_claim_link: { title: "Send claim link email?", requiresCall: true, confirmText: "Send" },
      resend_link: { title: "Resend claim link and move to Alt Channels?", requiresCall: true, confirmText: "Resend" },
      try_fax: { title: "Move to Alternative Channels (Fax)?", requiresCall: true, confirmText: "Move to Fax" },
      try_direct_mail: { title: "Move to Alternative Channels (Direct Mail)?", requiresCall: true, confirmText: "Move to Direct Mail" },
      move_to_ready: { title: "Move back to Call & Confirm?", confirmText: "Move" },
      remove: { title: `Remove ${provider.provider_name} from outreach?`, confirmText: "Remove" },
    };
    const config = configs[confirmAction];
    if (!config) return null;

    return (
      <div>
        <SectionHeader>Actions</SectionHeader>
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-3">
          <p className="text-sm text-gray-700">{config.title}</p>
          {config.requiresCall && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedCall}
                onChange={(e) => setConfirmedCall(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">I called and confirmed this action</span>
            </label>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirmAction === "launch") {
                  onLaunchSequence?.(provider.provider_id);
                  onClose?.();
                } else if (confirmAction === "claim_link" || confirmAction === "send_claim_link") {
                  handleSendClaimLink();
                } else if (confirmAction === "move_to_ready") {
                  handleMoveToReady();
                } else if (confirmAction === "remove") {
                  onRemove?.(provider.provider_id, provider.provider_name);
                  onClose?.();
                } else {
                  handleRecordOutcome(confirmAction);
                }
              }}
              disabled={actionLoading || (config.requiresCall && !confirmedCall)}
              className={confirmAction === "remove" ? `${outlineBtn} text-red-600 border-red-300 hover:bg-red-50` : primaryBtn}
            >
              {actionLoading ? "..." : config.confirmText}
            </button>
            <button onClick={cancelConfirm} className={plainBtn}>Cancel</button>
            {actionError && <span className="text-xs text-red-500">{actionError}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader>Actions</SectionHeader>
      <div className="flex flex-wrap items-center gap-2">
        {/* Launch Sequence - primary, only for not_contacted with email */}
        {canLaunch && onLaunchSequence && (
          <button onClick={() => setConfirmAction("launch")} className={primaryBtn}>
            Launch Sequence
          </button>
        )}

        {/* Send Claim Link - for non-follow-up active stages */}
        {!isTerminal && !isFollowUp && provider.email && (
          <button onClick={() => setConfirmAction("claim_link")} className={canLaunch ? outlineBtn : primaryBtn}>
            Send Claim Link
          </button>
        )}

        {/* Contact Form - for non-follow-up, non-terminal stages (supplementary channel, no stage change) */}
        {!isTerminal && !isFollowUp && (
          <button onClick={() => setConfirmAction("contact_form")} className={outlineBtn}>
            Contact Form
          </button>
        )}

        {/* Follow Up specific actions - move to alternative channels */}
        {isFollowUp && (
          <>
            {provider.email && (
              <button onClick={() => setConfirmAction("resend_link")} className={outlineBtn}>
                Resend Link
              </button>
            )}
            <button onClick={() => setConfirmAction("fax")} className={outlineBtn}>
              Fax
            </button>
            <button onClick={() => setConfirmAction("contact_form")} className={outlineBtn}>
              Contact Form
            </button>
            <button onClick={() => setConfirmAction("direct_mail")} className={outlineBtn}>
              Direct Mail
            </button>
          </>
        )}

        {/* Call Exhausted: Resend Claim Link (no stage change) */}
        {isCallExhausted && provider.email && (
          <button onClick={() => setConfirmAction("send_claim_link")} className={primaryBtn}>
            Send Claim Link
          </button>
        )}

        {/* Move to Ready - for needs_call, re_engage, call_exhausted, or not_interested */}
        {["needs_call", "re_engage", "call_exhausted", "not_interested"].includes(provider.stage) && provider.email && onMoveToReady && (
          <button onClick={() => setConfirmAction("move_to_ready")} className={outlineBtn}>
            Move to Ready
          </button>
        )}

        {/* Mark Not Interested - opens ActionModal which has its own confirmation */}
        {!isTerminal && provider.stage !== "not_interested" && onMarkNotInterested && (
          <button onClick={() => { onMarkNotInterested(provider.provider_id); onClose?.(); }} className={outlineBtn}>
            Not Interested
          </button>
        )}

        {/* Archive - opens ActionModal which has its own confirmation */}
        {provider.stage !== "archived" && onArchive && (
          <button onClick={() => { onArchive(provider.provider_id); onClose?.(); }} className={outlineBtn}>
            Archive
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Remove */}
        {activeTab !== "hidden" && onRemove && (
          <button onClick={() => setConfirmAction("remove")} className={`${plainBtn} text-red-500 hover:text-red-600`}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ProviderDrawer Component
// ─────────────────────────────────────────────────────────────────────────────

export function ProviderDrawer({
  provider,
  onClose,
  onEmailUpdate,
  onPhoneUpdate,
  onLaunchSequence,
  onMarkNotInterested,
  onArchive,
  onRemove,
  onMoveToReady,
  onResetToReadyWithApollo,
  onContactFound,
  onOutcomeRecorded,
  onClaimLinkSent,
  onContactFormSent,
  activeTab,
}: ProviderDrawerProps) {
  // Determine if we should show Follow Up section
  const showFollowUpSection = provider.stage === "needs_call" || activeTab === "follow_up";
  // Determine if we should show Alternative Channels section
  const showReEngageSection = provider.stage === "re_engage" || activeTab === "re_engage";
  // Determine if we should show Call Exhausted section
  const showCallExhaustedSection = provider.stage === "call_exhausted" || activeTab === "call_exhausted";
  // Header content with link to provider admin page
  const header = (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">{provider.provider_name}</h2>
        {provider.slug && (
          <Link
            href={`/admin/directory/${provider.slug}`}
            className="text-gray-400 hover:text-primary-600 transition-colors"
            title="Open provider page"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Link>
        )}
      </div>
      <p className="text-sm text-gray-500">
        {[provider.provider_category, [provider.city, provider.state].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );

  // Actions footer for sticky bottom
  const actionsFooter = (
    <ActionsSection
      provider={provider}
      onLaunchSequence={onLaunchSequence}
      onMarkNotInterested={onMarkNotInterested}
      onArchive={onArchive}
      onRemove={onRemove}
      onMoveToReady={onMoveToReady}
      onOutcomeRecorded={onOutcomeRecorded}
      onClaimLinkSent={onClaimLinkSent}
      onContactFormSent={onContactFormSent}
      onClose={onClose}
      activeTab={activeTab}
    />
  );

  // Show call script for tabs where calling is the primary action
  const showCallScript =
    activeTab === "call_confirm" ||
    activeTab === "follow_up" ||
    activeTab === "call_exhausted" ||
    provider.stage === "needs_call" ||
    provider.stage === "call_exhausted";

  return (
    <DrawerShell onClose={onClose} header={header} footer={actionsFooter}>
      <div className="py-2">
        {/* Call Script - show for Call & Confirm, Follow Up, and Call tabs */}
        {showCallScript && <CallScriptSection provider={provider} />}

        {/* Contact Section */}
        <ContactSection
          provider={provider}
          onEmailUpdate={(email) => onEmailUpdate?.(provider.provider_id, email)}
          onPhoneUpdate={(phone) => onPhoneUpdate?.(provider.provider_id, phone)}
        />

        <SectionDivider />

        {/* Decision Maker Section */}
        <DecisionMakerSection
          provider={provider}
          onUseEmail={(email) => onEmailUpdate?.(provider.provider_id, email, "decision_maker")}
          onContactFound={(contact) => onContactFound?.(provider.provider_id, contact)}
          onResetToReadyWithApollo={
            onResetToReadyWithApollo
              ? () => onResetToReadyWithApollo(provider.provider_id)
              : undefined
          }
        />

        <SectionDivider />

        {/* Follow Up Section - only for needs_call stage */}
        {showFollowUpSection && (
          <>
            <FollowUpSection provider={provider} />
            <SectionDivider />
          </>
        )}

        {/* Alternative Channels Section - only for re_engage stage */}
        {showReEngageSection && (
          <>
            <ReEngageSection provider={provider} />
            <SectionDivider />
          </>
        )}

        {/* Call Exhausted Section - only for call_exhausted stage */}
        {showCallExhaustedSection && (
          <>
            <CallExhaustedSection provider={provider} />
            <SectionDivider />
          </>
        )}

        {/* Notes Section */}
        <NotesSection provider={provider} />

        <SectionDivider />

        {/* Activity Section */}
        <ActivitySection provider={provider} />
      </div>
    </DrawerShell>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { US_STATES } from "@/lib/us-states";
import EmailVerificationBadge, { type VerificationStatus } from "@/components/admin/EmailVerificationBadge";
import TrustScoreBadge, { type TrustScoreStatus } from "@/components/admin/TrustScoreBadge";
import { AdminChip } from "@/components/admin/provider-outreach/AdminChip";
import { AdminFilterChips, type AdminCounts } from "@/components/admin/provider-outreach/AdminFilterChips";
import { AdminAutocomplete } from "@/components/admin/provider-outreach/AdminAutocomplete";
import { NotesModal } from "@/components/admin/provider-outreach/NotesModal";
import { EmailHistoryPopover } from "@/components/admin/provider-outreach/EmailHistoryPopover";
import { ProviderDrawer } from "@/components/admin/provider-outreach/ProviderDrawer";
import { NOT_INTERESTED_REASONS } from "@/lib/provider-outreach/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Database stages
const OUTREACH_STAGES = [
  "not_contacted",
  "in_sequence",
  "needs_call",
  "re_engage",
  "call_exhausted",  // Final call state: providers here need manual resolution
  "not_interested",  // Soft terminal: no outreach, but questions/connections flow
  "claimed",
  "archived",  // Hard terminal: system-wide block
] as const;

type OutreachStage = (typeof OUTREACH_STAGES)[number];

// UI tabs - "call_confirm" is the combined view of "not_contacted" (both needs email and has email)
// "done" is the combined view of terminal states (claimed, not_interested, archived) with sub-tabs
type UITab = "call_confirm" | "in_sequence" | "needs_call" | "re_engage" | "call_exhausted" | "done";

// Sub-tabs within the "Done" tab (includes hidden for recovery)
type DoneSubTab = "claimed" | "not_interested" | "archived" | "hidden";

const DONE_SUB_TABS: DoneSubTab[] = ["claimed", "not_interested", "archived", "hidden"];

const DONE_SUB_TAB_LABELS: Record<DoneSubTab, string> = {
  claimed: "Claimed",
  not_interested: "Not Interested",
  archived: "Archived",
  hidden: "Hidden",
};

const UI_TABS: UITab[] = [
  "call_confirm",
  "in_sequence",
  "needs_call",  // Displayed as "Follow Up"
  "re_engage",
  "call_exhausted",  // Final call state
  "done",  // Terminal states + hidden, with sub-tabs
];

const UI_TAB_LABELS: Record<UITab, string> = {
  call_confirm: "Call & Confirm",
  in_sequence: "In Sequence",
  needs_call: "Follow Up",
  re_engage: "Alternative Channels",
  call_exhausted: "Call",
  done: "Done",
};

// Database stage labels (for search results showing provider's actual stage)
const STAGE_LABELS: Record<OutreachStage, string> = {
  not_contacted: "Not Contacted",
  in_sequence: "In Sequence",
  needs_call: "Follow Up",
  re_engage: "Alternative Channels",
  call_exhausted: "Call",
  not_interested: "Not Interested",
  claimed: "Claimed",
  archived: "Archived",
};

// Terminal stages - no more outreach
// not_interested = soft (questions/connections still flow)
// archived = hard (system-wide block)
const TERMINAL_STAGES: OutreachStage[] = ["claimed", "not_interested", "archived"];

// ─────────────────────────────────────────────────────────────────────────────
// Provider Tier System
// ─────────────────────────────────────────────────────────────────────────────

type ProviderTier = "enterprise" | "regional" | "local";

const TIER_CONFIG: Record<ProviderTier, { label: string; className: string }> = {
  enterprise: {
    label: "Enterprise",
    className: "text-blue-700 bg-blue-50 border-blue-200",
  },
  regional: {
    label: "Regional",
    className: "text-teal-700 bg-teal-50 border-teal-200",
  },
  local: {
    label: "Local",
    className: "text-gray-600 bg-gray-50 border-gray-200",
  },
};


function TierSelector({
  tier,
  onTierChange,
}: {
  tier?: ProviderTier;
  onTierChange: (tier: ProviderTier) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!tier) {
    // No tier set — show subtle "Set tier" button
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded transition"
        >
          + Tier
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-28">
            {(["enterprise", "regional", "local"] as ProviderTier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTierChange(t);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TIER_CONFIG[t].className}`}>
                  {TIER_CONFIG[t].label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Tier is set — show badge, click to change
  const config = TIER_CONFIG[tier];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border cursor-pointer hover:opacity-80 transition ${config.className}`}
      >
        {config.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-28">
          {(["enterprise", "regional", "local"] as ProviderTier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTierChange(t);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 transition-colors ${t === tier ? "bg-gray-50" : ""}`}
            >
              <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TIER_CONFIG[t].className}`}>
                {TIER_CONFIG[t].label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface CityStats {
  city: string;
  total: number;
  has_email: number;
  needs_email: number;
}

// Funnel stat component for metrics display
function FunnelStat({
  label,
  value,
  format,
  highlight,
  subtitle,
}: {
  label: string;
  value: number;
  format?: "number" | "percent";
  highlight?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        highlight ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className={`text-xl font-semibold tabular-nums ${highlight ? "text-emerald-600" : "text-gray-900"}`}>
        {format === "percent" ? `${value}%` : value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
      {subtitle && (
        <div className="mt-0.5 text-[10px] text-gray-400">{subtitle}</div>
      )}
    </div>
  );
}

// Helper to compute city stats from providers (for non-not_contacted stages)
function computeCityStatsFromProviders(providers: OutreachProvider[]): CityStats[] {
  const cityMap = new Map<string, { total: number; has_email: number; needs_email: number }>();

  for (const p of providers) {
    const cityName = p.city || "(No City)";
    const existing = cityMap.get(cityName) || { total: 0, has_email: 0, needs_email: 0 };
    existing.total++;
    if (p.email && p.email.trim()) {
      existing.has_email++;
    } else {
      existing.needs_email++;
    }
    cityMap.set(cityName, existing);
  }

  return Array.from(cityMap.entries())
    .map(([city, stats]) => ({ city, ...stats }))
    .sort((a, b) => b.total - a.total); // Sort by total descending
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
  tracking_id: string | null;
  stage: OutreachStage;
  stage_changed_at: string | null;
  notes: string | null;
  // Confirmation state (Ready tab)
  confirmed_at: string | null;
  confirmed_by: string | null;
  // Follow-up queue fields
  due_date: string | null;
  resend_count: number;
  no_answer_count: number;
  needs_call_reason: string | null;
  // Re-engage fields
  re_engage_entered_at: string | null;
  re_engage_channel: string | null;
  // Enrichment fields for alternative channels
  fax_number: string | null;
  fax_confidence: string | null;
  fax_source_url: string | null;
  linkedin_url: string | null;
  mail_address: string | null;
  contact_form_url: string | null;
  contact_form_status: "found" | "not_found" | null;
  contact_form_send_count?: number;
  // Assignment
  assigned_to: string | null;
  // Sequence progress (for in_sequence stage)
  emails_sent?: number;
  sequence_status?: {
    last_email_at?: string;
    failed_step?: number;
    failed_reason?: string;
  };
  // Engagement data (for needs_call stage) - powers intelligence recommendations
  engagement?: {
    emails_sent: number;
    opens: number;
    clicks: number;
    resends: number;
  };
  // For claimed providers
  verification_state?: "verified" | "pending" | "unverified" | "not_required" | "rejected" | null;
  profile_completeness?: number;
  // Email verification status from email_verifications table
  email_verification_status?: "valid" | "invalid" | "risky" | "unknown" | null;
  // Whether email has been manually overridden/trusted
  is_email_overridden?: boolean;
  // Generic email warning state (persisted for page refresh)
  generic_email_called_at?: string | null;
  generic_email_skipped_at?: string | null;
  // Questions and leads context
  questions_count?: number;
  leads_count?: number;
  // Apollo.io decision-maker enrichment
  apollo_contact?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    linkedin_url: string | null;
    found_at: string;
  } | null;
  // Email source: 'organization' (scraped/manual) or 'decision_maker' (Apollo)
  email_source?: "organization" | "decision_maker" | null;
}

interface ActiveState {
  id: string;
  state_code: string;
  state_name: string;
  status: "active" | "paused" | "completed";
  added_at: string;
  total_providers: number;
  not_contacted: number;
  in_sequence: number;
  needs_call: number;
  re_engage: number;
  claimed: number;
  archived: number;
  stats_refreshed_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Map UI tab to API parameters (stage + optional email_filter)
function getApiParamsForTab(tab: UITab, doneSubTab?: DoneSubTab): { stage: OutreachStage | "hidden"; emailFilter?: "needs_email" | "has_email" } {
  if (tab === "call_confirm") {
    // Fetch all not_contacted providers (both with and without email)
    return { stage: "not_contacted" };
  }
  if (tab === "done") {
    // Use the sub-tab to determine which stage to fetch (includes hidden)
    return { stage: doneSubTab || "claimed" };
  }
  return { stage: tab as OutreachStage };
}

// Check if a UI tab represents the "not_contacted" stage
function isNotContactedTab(tab: UITab): boolean {
  return tab === "call_confirm";
}

function timeAgo(isoDate: string | undefined | null): string {
  if (!isoDate) return "—";
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Get sequence status sublabel for in_sequence providers (like care seekers pattern)
function getSequenceSublabel(provider: OutreachProvider): { text: string; isFailed: boolean } {
  const status = provider.sequence_status;

  // If there's a failed task, show that prominently
  if (status?.failed_step !== undefined) {
    const dayLabel = status.failed_step === 0 ? "Intro" :
                     status.failed_step === 3 ? "Day 3" :
                     status.failed_step === 7 ? "Day 7" :
                     status.failed_step === 14 ? "Day 14" :
                     `Day ${status.failed_step}`;
    return { text: `Failed · ${dayLabel}`, isFailed: true };
  }

  // If emails have been sent, show recency
  if (status?.last_email_at) {
    return { text: timeAgo(status.last_email_at), isFailed: false };
  }

  // No emails sent yet
  if (provider.emails_sent === 0) {
    return { text: "Pending", isFailed: false };
  }

  return { text: "—", isFailed: false };
}

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

// Generic email prefixes that suggest the email goes to a shared inbox
const GENERIC_EMAIL_PREFIXES = [
  "info",
  "admin",
  "contact",
  "hello",
  "support",
  "office",
  "help",
  "sales",
  "enquiries",
  "inquiries",
  "general",
  "reception",
  "mail",
  "team",
];

// Check if an email is a generic inbox (info@, admin@, etc.)
function isGenericEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const localPart = email.toLowerCase().split("@")[0];
  return GENERIC_EMAIL_PREFIXES.some((prefix) => localPart === prefix || localPart.startsWith(prefix + "."));
}

// Labels for why a provider is in the Follow Up queue
const NEEDS_CALL_REASON_LABELS: Record<string, string> = {
  sequence_exhausted: "Sequence done",  // Set by cron after Day 7 with no engagement
  sequence_completed: "Sequence done",  // Legacy/alternate code
  clicked_not_claimed: "Clicked",       // Provider clicked a link but didn't claim (hot lead)
  replied: "Replied",                   // Provider replied to an email (requires inbound setup)
  email_bounced: "Bounced",             // Email bounced (SmartLead webhook)
  manual: "Manual",                     // Admin manually moved to Follow Up
};

function getNeedsCallReasonChip(reason: string | null): { label: string; className: string } | null {
  if (!reason) return null;
  const label = NEEDS_CALL_REASON_LABELS[reason] || reason;
  // Different colors for different reasons
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

// Editable Provider Contact - with Edit mode for existing emails
function ProviderContactEditor({
  providerId,
  providerSlug,
  email: initialEmail,
  suggestedEmail,
  emailSource,
  emailFoundUrl,
  phone,
  onEmailUpdate,
  onPhoneUpdate,
  emailVerificationStatus,
  isEmailOverridden,
  onCallRecorded,
  isCallRecorded,
  onWarningSkipped,
  isWarningSkipped,
  stage,
}: {
  providerId: string;
  providerSlug?: string | null;
  email: string | null;
  suggestedEmail?: string | null;
  emailSource?: string | null;
  emailFoundUrl?: string | null;
  phone: string | null;
  onEmailUpdate?: (newEmail: string) => void;
  onPhoneUpdate?: (newPhone: string | null) => void;
  /** Pre-fetched email verification status from database */
  emailVerificationStatus?: "valid" | "invalid" | "risky" | "unknown" | null;
  /** Whether email has been manually overridden/trusted */
  isEmailOverridden?: boolean;
  /** Callback when "I called" is recorded */
  onCallRecorded?: () => void;
  /** Whether call has been recorded for this provider */
  isCallRecorded?: boolean;
  /** Callback when warning is skipped/dismissed */
  onWarningSkipped?: () => void;
  /** Whether warning was skipped for this provider */
  isWarningSkipped?: boolean;
  /** Provider's current stage - warning not shown for claimed providers */
  stage?: OutreachStage;
}) {
  const [email, setEmail] = useState(initialEmail || suggestedEmail || "");
  const [isEditing, setIsEditing] = useState(!initialEmail); // Start in edit mode if no email
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone editing state
  const [phoneValue, setPhoneValue] = useState(phone || "");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Source info from find (local state for manual find, props for auto-find)
  const [localSource, setLocalSource] = useState<string | null>(null);
  const [localFoundUrl, setLocalFoundUrl] = useState<string | null>(null);

  // Use props if available, otherwise local state
  const displaySource = emailSource || localSource;
  const displayFoundUrl = emailFoundUrl || localFoundUrl;

  // Email verification state
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("idle");
  const verifyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trust score state
  const [trustScoreStatus, setTrustScoreStatus] = useState<TrustScoreStatus>("idle");
  const [trustScoreReason, setTrustScoreReason] = useState("");

  // Email override state (for one-click trust action)
  const [isOverriding, setIsOverriding] = useState(false);
  const [locallyOverridden, setLocallyOverridden] = useState(false);
  // Combine database state (prop) with local action state
  const isOverridden = isEmailOverridden || locallyOverridden;

  // Call recording state
  const [isRecordingCall, setIsRecordingCall] = useState(false);
  const [callRecordError, setCallRecordError] = useState(false);

  // Skip warning state
  const [isSkippingWarning, setIsSkippingWarning] = useState(false);
  const [skipError, setSkipError] = useState(false);

  // Check if this is a generic email (show warning unless called, skipped, or claimed)
  // Don't show for claimed providers - they've already verified themselves
  const showGenericWarning = !isEditing && email && isGenericEmail(email) && !isCallRecorded && !isWarningSkipped && stage !== "claimed";

  // Record "I called" touchpoint
  const handleRecordCall = async () => {
    setIsRecordingCall(true);
    setCallRecordError(false);
    try {
      const res = await fetch("/api/admin/provider-outreach/record-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      });
      if (res.ok) {
        onCallRecorded?.();
      } else {
        setCallRecordError(true);
      }
    } catch (err) {
      console.error("Failed to record call:", err);
      setCallRecordError(true);
    } finally {
      setIsRecordingCall(false);
    }
  };

  // Record "Skip" (persist to database)
  const handleSkipWarning = async () => {
    setIsSkippingWarning(true);
    setSkipError(false);
    try {
      const res = await fetch("/api/admin/provider-outreach/skip-warning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      });
      if (res.ok) {
        onWarningSkipped?.();
      } else {
        setSkipError(true);
      }
    } catch (err) {
      console.error("Failed to skip warning:", err);
      setSkipError(true);
    } finally {
      setIsSkippingWarning(false);
    }
  };

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (verifyDebounceRef.current) {
        clearTimeout(verifyDebounceRef.current);
      }
    };
  }, []);

  // Sync internal state when prop changes (e.g., from external refresh or suggested email)
  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
      setIsEditing(false);
    } else if (suggestedEmail) {
      setEmail(suggestedEmail);
      setIsEditing(true); // Keep in edit mode so admin can review and save
    } else {
      setEmail("");
      setIsEditing(true);
    }
    setVerificationStatus("idle");
    setTrustScoreStatus("idle");
    setTrustScoreReason("");
    setLocalSource(null);
    setLocalFoundUrl(null);
  }, [initialEmail, suggestedEmail]);

  // Sync phone state when prop changes
  useEffect(() => {
    setPhoneValue(phone || "");
    setIsEditingPhone(false);
    setPhoneError(null);
  }, [phone]);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

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
  const fetchTrustScore = useCallback(async (emailToCheck: string): Promise<{ level: TrustScoreStatus; reason: string }> => {
    if (!emailToCheck || !providerSlug) return { level: "idle", reason: "" };

    try {
      const res = await fetch("/api/admin/connections/preview-trust-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerSlug, email: emailToCheck }),
      });

      if (!res.ok) return { level: "idle", reason: "" };
      const data = await res.json();
      return { level: data.level || "idle", reason: data.reason || "" };
    } catch {
      return { level: "idle", reason: "" };
    }
  }, [providerSlug]);

  // Run verification and trust scoring in parallel
  const verifyAndScore = useCallback(async (emailToCheck: string) => {
    setVerificationStatus("verifying");
    setTrustScoreStatus("scoring");

    const [verifyStatus, trustResult] = await Promise.all([
      verifyEmail(emailToCheck),
      fetchTrustScore(emailToCheck),
    ]);

    setVerificationStatus(verifyStatus);
    setTrustScoreStatus(trustResult.level);
    setTrustScoreReason(trustResult.reason);

    return verifyStatus;
  }, [verifyEmail, fetchTrustScore]);

  // Auto-verify when suggested email is received from auto-lookup
  useEffect(() => {
    if (suggestedEmail && !initialEmail) {
      // Suggested email received - trigger verification
      verifyAndScore(suggestedEmail);
    }
  }, [suggestedEmail, initialEmail, verifyAndScore]);

  // Debounced verification on blur
  const handleBlur = useCallback(() => {
    if (!isValidEmail) {
      setVerificationStatus("idle");
      setTrustScoreStatus("idle");
      return;
    }

    if (verifyDebounceRef.current) {
      clearTimeout(verifyDebounceRef.current);
    }

    verifyDebounceRef.current = setTimeout(async () => {
      await verifyAndScore(email.trim());
    }, 300);
  }, [email, isValidEmail, verifyAndScore]);

  async function handleSave() {
    if (!email.trim() || !isValidEmail) return;

    // Clear any pending blur verification to prevent race condition
    if (verifyDebounceRef.current) {
      clearTimeout(verifyDebounceRef.current);
      verifyDebounceRef.current = null;
    }

    setSaving(true);
    setError(null);

    // Verify before save if not already verified
    if (verificationStatus === "idle" || verificationStatus === "verifying") {
      const status = await verifyAndScore(email.trim());

      // Warn on risky/invalid
      if (status === "invalid") {
        setError("This email appears invalid. Click Save again to override.");
        setSaving(false);
        return;
      }
      if (status === "risky") {
        setError("This email may bounce (catch-all). Click Save again to override.");
        setSaving(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/admin/provider-outreach/update-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, email: email.trim() }),
      });

      if (res.ok) {
        setSaved(true);
        setIsEditing(false);
        setError(null);
        onEmailUpdate?.(email.trim());
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEmail(initialEmail || "");
    setIsEditing(false);
    setError(null);
    setVerificationStatus("idle");
  }

  async function handleFind() {
    setFinding(true);
    setError(null);
    setLocalSource(null);
    setLocalFoundUrl(null);

    try {
      const res = await fetch("/api/admin/provider-outreach/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      });

      const data = await res.json();

      if (data.email) {
        setEmail(data.email);
        setLocalSource(data.source || null);
        setLocalFoundUrl(data.foundUrl || null);
        // Trigger verification and trust score for the found email
        await verifyAndScore(data.email);
      } else if (data.error) {
        setError(data.error);
      } else {
        setError("No email found");
      }
    } catch {
      setError("Lookup failed");
    } finally {
      setFinding(false);
    }
  }

  // One-click override for risky/invalid emails
  async function handleOverride() {
    if (!email || isOverriding) return;

    setIsOverriding(true);
    try {
      const res = await fetch("/api/admin/email-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          providerSlug: providerSlug || providerId,
          reason: "admin",
        }),
      });

      if (res.ok) {
        setLocallyOverridden(true);
      }
    } catch {
      // Silent fail - button will remain visible for retry
    } finally {
      setIsOverriding(false);
    }
  }

  // Phone save handler
  async function handleSavePhone() {
    setSavingPhone(true);
    setPhoneError(null);

    try {
      const res = await fetch("/api/admin/provider-outreach/update-phone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, phone: phoneValue.trim() }),
      });

      if (res.ok) {
        setPhoneSaved(true);
        setIsEditingPhone(false);
        setPhoneError(null);
        onPhoneUpdate?.(phoneValue.trim() || null);
        setTimeout(() => setPhoneSaved(false), 2000);
      } else {
        const data = await res.json();
        setPhoneError(data.error || "Failed to save");
      }
    } catch {
      setPhoneError("Network error");
    } finally {
      setSavingPhone(false);
    }
  }

  function handleCancelPhone() {
    setPhoneValue(phone || "");
    setIsEditingPhone(false);
    setPhoneError(null);
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Row 1: Email + Edit + Phone */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5">
        {isEditing ? (
          // Edit mode: input + Find + Save + Cancel
          <>
            <input
              type="email"
              placeholder="email@provider.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
                setSaved(false);
                setVerificationStatus("idle");
                setTrustScoreStatus("idle");
                setLocalSource(null);
                setLocalFoundUrl(null);
              }}
              onBlur={handleBlur}
              onClick={(e) => e.stopPropagation()}
              className="w-52 px-2.5 py-1 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-900/10 placeholder:text-gray-300 transition"
              disabled={saving}
              autoFocus={!!initialEmail}
            />
            {/* Verification and trust score badges */}
            {(verificationStatus !== "idle" || trustScoreStatus !== "idle") && (
              <div className="flex items-center gap-2">
                <EmailVerificationBadge status={verificationStatus} showHelperText />
                <TrustScoreBadge status={trustScoreStatus} reason={trustScoreReason} />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleFind();
              }}
              disabled={finding || saving}
              className="shrink-0 px-2 py-1 text-xs font-medium text-teal-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {finding ? "..." : "✦ Find"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              disabled={saving || !isValidEmail}
              className={`shrink-0 px-3 py-1 text-xs font-medium rounded-md transition ${
                isValidEmail
                  ? "text-white bg-teal-600 hover:bg-teal-700"
                  : "text-gray-400 bg-gray-100 cursor-not-allowed"
              } disabled:opacity-50`}
            >
              {saving ? "..." : "Save"}
            </button>
            {initialEmail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                disabled={saving}
                className="shrink-0 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
            )}
            {error && <span className="text-xs text-amber-600 shrink-0">{error}</span>}
            {/* Source info */}
            {displaySource && (
              <span className="text-xs text-gray-500">
                Found via {displaySource === "scrape" ? "web scraping" : "AI analysis"}
                {displayFoundUrl && (
                  <>
                    {" · "}
                    <a
                      href={displayFoundUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View source
                    </a>
                  </>
                )}
              </span>
            )}
          </>
        ) : (
          // Display mode: show email + verification badge + Edit button
          <>
            <span className="text-sm text-gray-700">{email}</span>
            {/* Email history popover */}
            <EmailHistoryPopover providerId={providerId} currentEmail={email} />
            {/* Email verification status and override */}
            {isOverridden ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                Trusted
              </span>
            ) : emailVerificationStatus && emailVerificationStatus !== "valid" ? (
              <>
                <EmailVerificationBadge status={emailVerificationStatus} />
                {/* One-click trust button for risky/invalid emails */}
                {(emailVerificationStatus === "risky" || emailVerificationStatus === "invalid") && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOverride();
                    }}
                    disabled={isOverriding}
                    className="shrink-0 px-2 py-0.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition disabled:opacity-50"
                    title="Mark this email as trusted"
                  >
                    {isOverriding ? "..." : "Trust"}
                  </button>
                )}
              </>
            ) : null}
            {/* Show "Called" checkmark if call was recorded */}
            {isCallRecorded && isGenericEmail(email) && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600" title="Call verified">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                Called
              </span>
            )}
            {saved && (
              <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="shrink-0 px-2 py-0.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition"
            >
              Edit
            </button>
          </>
        )}
      </div>

      {/* Phone - inline with main row, with edit capability */}
      <div className="flex items-center gap-1.5">
        {isEditingPhone ? (
          // Phone edit mode
          <>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={phoneValue}
              onChange={(e) => {
                setPhoneValue(e.target.value);
                setPhoneError(null);
                setPhoneSaved(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-36 px-2.5 py-1 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-900/10 placeholder:text-gray-300 transition"
              disabled={savingPhone}
              autoFocus
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSavePhone();
              }}
              disabled={savingPhone}
              className="shrink-0 px-3 py-1 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition disabled:opacity-50"
            >
              {savingPhone ? "..." : "Save"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelPhone();
              }}
              disabled={savingPhone}
              className="shrink-0 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            {phoneError && <span className="text-xs text-amber-600 shrink-0">{phoneError}</span>}
          </>
        ) : (
          // Phone display mode - use phoneValue (local state) to avoid flash of old value after save
          <>
            {phoneValue ? (
              <a
                href={`tel:${phoneValue.replace(/\D/g, "")}`}
                className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {formatPhone(phoneValue)}
              </a>
            ) : (
              <span className="text-sm text-gray-400">No phone</span>
            )}
            {phoneSaved && (
              <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingPhone(true);
              }}
              className="shrink-0 px-2 py-0.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition"
            >
              Edit
            </button>
          </>
        )}
      </div>
      </div>

      {/* Row 2: Generic email warning (separate line for cleaner layout) */}
      {showGenericWarning && (
        <div className="flex items-center gap-2 pl-0.5">
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Generic email — have you called?
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRecordCall();
            }}
            disabled={isRecordingCall}
            className={`shrink-0 px-2 py-0.5 text-xs font-medium rounded transition disabled:opacity-50 ${
              callRecordError
                ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                : "text-primary-600 hover:text-primary-700 hover:bg-primary-50"
            }`}
            title={callRecordError ? "Failed - click to retry" : "Record that you called this provider"}
          >
            {isRecordingCall ? "..." : callRecordError ? "Retry" : "I called"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSkipWarning();
            }}
            disabled={isSkippingWarning}
            className={`shrink-0 px-2 py-0.5 text-xs font-medium rounded transition disabled:opacity-50 ${
              skipError
                ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
            title={skipError ? "Failed - click to retry" : "Dismiss warning - proceed without calling"}
          >
            {isSkippingWarning ? "..." : skipError ? "Retry" : "Skip"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Apollo Decision-Maker Contact Display
// ─────────────────────────────────────────────────────────────────────────────

function ApolloContactRow({
  provider,
  onUseEmail,
  onContactFound,
  onEmailSourceChanged,
  onResetToReady,
  stage,
}: {
  provider: OutreachProvider;
  onUseEmail: (email: string, emailSource?: "decision_maker") => void;
  onContactFound: (contact: OutreachProvider["apollo_contact"]) => void;
  onEmailSourceChanged?: (emailSource: "organization" | "decision_maker") => void;
  onResetToReady?: (providerId: string) => Promise<boolean>;
  stage?: string;
}) {
  const [finding, setFinding] = useState(false);
  const [using, setUsing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apolloContact = provider.apollo_contact;
  const isInSequence = stage === "in_sequence";

  // Check if Apollo email matches provider's current email
  const emailsMatch = apolloContact?.email?.toLowerCase() === provider.email?.toLowerCase();

  // Check if already confirmed (email_source is decision_maker)
  const isConfirmed = provider.email_source === "decision_maker";

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
        // Pass the found contact data up to update state
        // If auto_confirmed (provider had no email), also set email_source
        onContactFound({
          email: data.contact.email,
          first_name: data.contact.first_name,
          last_name: data.contact.last_name,
          title: data.contact.title,
          linkedin_url: data.contact.linkedin_url,
          found_at: new Date().toISOString(),
        });
        // If auto-confirmed by backend (provider had no email), update email_source in parent
        if (data.auto_confirmed) {
          onUseEmail(data.contact.email, "decision_maker");
        }
      } else {
        setError("No decision-maker found");
      }
    } catch (err) {
      setError("Lookup failed");
    } finally {
      setFinding(false);
    }
  }

  // "Confirm" or "Use This" - set email_source to decision_maker (and update email if different)
  // For In Sequence: show confirmation first, then reset to ready
  async function handleConfirm() {
    if (!apolloContact?.email || using) return;

    // For In Sequence, show confirmation dialog first
    if (isInSequence && !showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }

    setUsing(true);
    setError(null);
    setShowResetConfirm(false);

    try {
      if (isInSequence && onResetToReady) {
        // In Sequence: call reset-to-ready which cancels sequence and moves to Ready
        const success = await onResetToReady(provider.provider_id);
        if (!success) {
          setError("Failed to reset");
        }
      } else {
        // Normal flow: just update email
        const res = await fetch("/api/admin/provider-outreach/update-email", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider_id: provider.provider_id,
            email: apolloContact.email,
            confirm_apollo: true, // This sets email_source = 'decision_maker'
          }),
        });
        if (res.ok) {
          // Update local state with email and email_source
          onUseEmail(apolloContact.email, "decision_maker");
        } else {
          const data = await res.json();
          setError(data.error || "Failed to confirm");
        }
      }
    } catch (err) {
      setError("Failed to confirm");
    } finally {
      setUsing(false);
    }
  }

  // Switch from Decision Maker back to Organization
  async function handleSwitchToOrganization() {
    if (switching) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-email-source", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.provider_id,
          email_source: "organization",
        }),
      });
      if (res.ok) {
        onEmailSourceChanged?.("organization");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to switch");
      }
    } catch (err) {
      setError("Failed to switch");
    } finally {
      setSwitching(false);
    }
  }

  // If no Apollo contact yet, show the Find button
  if (!apolloContact) {
    return (
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleFind();
          }}
          disabled={finding}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition disabled:opacity-50"
        >
          {finding ? "Finding..." : "🎯 Find Decision Maker"}
        </button>
        {error && <span className="text-xs text-amber-600">{error}</span>}
      </div>
    );
  }

  // Show the Apollo contact below the email
  const fullName = [apolloContact.first_name, apolloContact.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex items-center gap-2 mt-1 pl-4 border-l-2 border-purple-200">
      <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
        Apollo
      </span>
      {fullName && (
        <span className="text-sm font-medium text-gray-900">{fullName}</span>
      )}
      {apolloContact.title && (
        <span className="text-xs text-gray-500">{apolloContact.title}</span>
      )}
      {/* Only show email if it differs from provider's email */}
      {!emailsMatch && (
        <span className="text-sm text-purple-600">{apolloContact.email}</span>
      )}
      {apolloContact.linkedin_url && (
        <a
          href={apolloContact.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          LinkedIn
        </a>
      )}
      {/* Show appropriate action based on state */}
      {isConfirmed ? (
        <>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Active
          </span>
          {onEmailSourceChanged && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSwitchToOrganization();
              }}
              disabled={switching}
              className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition disabled:opacity-50"
              title="Switch to use organization email instead"
            >
              {switching ? "..." : "Use Org Email"}
            </button>
          )}
        </>
      ) : showResetConfirm ? (
        // Confirmation dialog for In Sequence reset
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-600">Cancel sequence & move to Ready?</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleConfirm();
            }}
            disabled={using}
            className="px-2 py-0.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded transition disabled:opacity-50"
          >
            {using ? "..." : "Yes, Reset"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowResetConfirm(false);
            }}
            className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 rounded transition"
          >
            Cancel
          </button>
        </div>
      ) : isInSequence && emailsMatch ? (
        // In sequence + emails already match: no action needed, just show passive indicator
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-purple-700 bg-purple-50 rounded">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Using
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleConfirm();
          }}
          disabled={using}
          className={`px-2 py-0.5 text-xs font-medium rounded transition disabled:opacity-50 ${
            isInSequence
              ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              : "text-purple-600 hover:text-purple-700 hover:bg-purple-50"
          }`}
        >
          {using ? "..." : isInSequence ? "Reset & Use" : emailsMatch ? "Confirm" : "Use This"}
        </button>
      )}
      {error && <span className="text-xs text-amber-600">{error}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// City Row Component (collapsed/expanded)
// ─────────────────────────────────────────────────────────────────────────────

interface CityRowProps {
  city: CityStats;
  activeTab: UITab;
  activeDoneSubTab: DoneSubTab;
  isExpanded: boolean;
  onToggle: () => void;
  providers: OutreachProvider[];
  loadingProviders: boolean;
  selectedProviders: Set<string>;
  onToggleProvider: (providerId: string) => void;
  onSelectAllInCity: (providerIds: string[]) => void;
  onEmailSaved: (providerId: string, newEmail: string, emailSource?: "decision_maker") => void;
  onPhoneSaved: (providerId: string, newPhone: string | null) => void;
  onApolloContactFound: (providerId: string, apolloContact: OutreachProvider["apollo_contact"]) => void;
  onEmailSourceChanged: (providerId: string, emailSource: "organization" | "decision_maker") => void;
  onOpenActionModal: (provider: OutreachProvider) => void;
  onRemoveProvider: (provider: OutreachProvider) => void;
  onOpenDrawer: (provider: OutreachProvider) => void;
  // Move to Ready (for Not Interested tab)
  onMoveToReady?: (providerId: string) => void;
  // Reset to Ready with Apollo email (for In Sequence tab)
  onResetToReadyWithApollo?: (providerId: string) => Promise<boolean>;
  // City assignment
  cityOwnerId: string | null;
  cityOwnerName: string | null;
  isEditingAssignment: boolean;
  onStartEditAssignment: () => void;
  onAssignCity: (ownerId: string | null, ownerName: string | null) => void;
  onCancelEditAssignment: () => void;
  // Admin name lookup for provider assignment chips
  adminNameLookup: Map<string, string>;
}

function CityRow({
  city,
  activeTab,
  activeDoneSubTab,
  isExpanded,
  onToggle,
  providers,
  loadingProviders,
  selectedProviders,
  onToggleProvider,
  onSelectAllInCity,
  onEmailSaved,
  onPhoneSaved,
  onApolloContactFound,
  onEmailSourceChanged,
  onOpenActionModal,
  onRemoveProvider,
  onOpenDrawer,
  onMoveToReady,
  onResetToReadyWithApollo,
  cityOwnerId,
  cityOwnerName,
  isEditingAssignment,
  onStartEditAssignment,
  onAssignCity,
  onCancelEditAssignment,
  adminNameLookup,
}: CityRowProps) {
  // Auto email lookup state
  const [lookingUpEmails, setLookingUpEmails] = useState<Set<string>>(new Set());
  const [foundEmails, setFoundEmails] = useState<Map<string, { email: string; source: string | null; foundUrl: string | null }>>(new Map());
  const [lookupErrors, setLookupErrors] = useState<Map<string, string>>(new Map());
  const lookupAttemptedRef = useRef<Set<string>>(new Set());
  const lookupCancelledRef = useRef(false);

  // Track providers where admin has recorded a call (for generic email warning)
  const [calledProviders, setCalledProviders] = useState<Set<string>>(new Set());
  // Track providers where admin skipped the generic email warning
  const [skippedWarnings, setSkippedWarnings] = useState<Set<string>>(new Set());
  // Track providers that admin has confirmed (Ready tab)
  const [confirmedProviders, setConfirmedProviders] = useState<Set<string>>(new Set());
  const [confirmingProvider, setConfirmingProvider] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Track providers being unconfirmed
  const [unconfirmingProvider, setUnconfirmingProvider] = useState<string | null>(null);
  // Track providers that admin has unconfirmed this session (to override confirmed_at from DB)
  const [unconfirmedProviders, setUnconfirmedProviders] = useState<Set<string>>(new Set());
  // Move to Ready state (for Not Interested tab)
  const [showMoveToReadyConfirmId, setShowMoveToReadyConfirmId] = useState<string | null>(null);
  const [movingToReadyId, setMovingToReadyId] = useState<string | null>(null);

  // Memoize cityProviders to avoid unnecessary useEffect re-runs
  const cityProviders = useMemo(
    () => providers.filter((p) => (p.city || "(No City)") === city.city),
    [providers, city.city]
  );


  // Auto email lookup when city is expanded
  useEffect(() => {
    if (!isExpanded || loadingProviders) {
      // City collapsed or still loading - mark as cancelled to ignore pending results
      lookupCancelledRef.current = true;
      return;
    }

    // City expanded and providers loaded - allow lookups
    lookupCancelledRef.current = false;

    // Find providers without email that we haven't tried looking up yet
    const providersToLookup = cityProviders.filter(
      (p) => !p.email && !lookupAttemptedRef.current.has(p.provider_id) && !lookingUpEmails.has(p.provider_id)
    );

    if (providersToLookup.length === 0) return;

    // Mark these as attempted so we don't retry on re-render
    providersToLookup.forEach((p) => lookupAttemptedRef.current.add(p.provider_id));

    // Start lookups for each provider (limit concurrent to avoid overwhelming)
    const lookupEmail = async (provider: OutreachProvider) => {
      if (lookupCancelledRef.current) return;

      setLookingUpEmails((prev) => new Set(prev).add(provider.provider_id));

      try {
        const res = await fetch("/api/admin/provider-outreach/find-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider_id: provider.provider_id }),
        });

        // Check if cancelled before processing result
        if (lookupCancelledRef.current) return;

        const data = await res.json();

        if (data.email) {
          if (data.source === "existing") {
            // Provider already has email in DB - sync to local state
            if (!lookupCancelledRef.current) {
              onEmailSaved(provider.provider_id, data.email);
            }
          } else {
            // Found a NEW email - store it locally for admin to review and save
            // Do NOT auto-save to database
            if (!lookupCancelledRef.current) {
              setFoundEmails((prev) => new Map(prev).set(provider.provider_id, {
                email: data.email,
                source: data.source || null,
                foundUrl: data.foundUrl || null,
              }));
            }
          }
        } else if (!lookupCancelledRef.current) {
          // No email found - store the error or a default message
          const errorMsg = data.error || "No email found";
          setLookupErrors((prev) => new Map(prev).set(provider.provider_id, errorMsg));
        }
      } catch {
        if (!lookupCancelledRef.current) {
          setLookupErrors((prev) => new Map(prev).set(provider.provider_id, "Lookup failed"));
        }
      } finally {
        if (!lookupCancelledRef.current) {
          setLookingUpEmails((prev) => {
            const next = new Set(prev);
            next.delete(provider.provider_id);
            return next;
          });
        }
      }
    };

    // Stagger lookups to avoid rate limits (max 3 concurrent)
    const queue = [...providersToLookup];
    const runNext = () => {
      if (lookupCancelledRef.current) return;
      const provider = queue.shift();
      if (provider) {
        lookupEmail(provider).finally(() => {
          if (queue.length > 0 && !lookupCancelledRef.current) runNext();
        });
      }
    };

    // Start up to 3 concurrent lookups
    // Capture count before loop since queue.shift() mutates the array
    const concurrentCount = Math.min(3, queue.length);
    for (let i = 0; i < concurrentCount; i++) {
      runNext();
    }

    // Cleanup when city is collapsed or component unmounts
    return () => {
      lookupCancelledRef.current = true;
    };
    // Note: lookingUpEmails is intentionally not in deps - we read it in the filter
    // but don't want to re-trigger when it changes (that would cause loops)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, loadingProviders, cityProviders]);

  const allSelected = cityProviders.length > 0 && cityProviders.every((p) => selectedProviders.has(p.provider_id));
  const someSelected = cityProviders.some((p) => selectedProviders.has(p.provider_id)) && !allSelected;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* City Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Expand Icon */}
        <div className="w-5 shrink-0">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6.5 3.5l7 6.5-7 6.5V3.5z" />
          </svg>
        </div>

        {/* City Name + Owner */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="font-medium text-gray-900">{city.city}</span>
          {/* City Owner Assignment */}
          {isEditingAssignment ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <AdminAutocomplete
                selectedAdminId={cityOwnerId}
                selectedAdminName={cityOwnerName}
                onSelect={(id, name) => onAssignCity(id, name)}
                onClose={onCancelEditAssignment}
                placeholder="Assign to..."
                autoFocus
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartEditAssignment();
              }}
              className="flex items-center gap-1 text-sm hover:underline"
              title={cityOwnerId ? "Change assignment" : "Assign city"}
            >
              <AdminChip
                adminId={cityOwnerId}
                adminName={cityOwnerName}
                size="sm"
              />
            </button>
          )}
        </div>

        {/* Stats - show count relevant to the active tab */}
        <div className="flex items-center gap-6 text-sm">
          {activeTab === "call_confirm" ? (
            // Call & Confirm tab: show total with breakdown
            <div className="text-center flex items-center gap-2">
              <span className="font-semibold text-gray-900 tabular-nums">{city.total}</span>
              <span className="text-gray-400">{city.total === 1 ? "provider" : "providers"}</span>
              {city.needs_email > 0 && (
                <span className="text-xs text-amber-600">({city.needs_email} need email)</span>
              )}
            </div>
          ) : (
            // Other stages: show total count
            <div className="text-center">
              <span className="font-semibold text-gray-900 tabular-nums">{city.total}</span>
              <span className="text-gray-400 ml-1">{city.total === 1 ? "provider" : "providers"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: Provider List */}
      {isExpanded && (
        <div className="bg-gray-50/50 border-t border-gray-100">
          {loadingProviders ? (
            <div className="p-6 text-center">
              <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : cityProviders.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400 italic">No providers in this city</p>
          ) : (
            <>
              {/* Filter & Select Bar */}
              <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-6">
                {/* Select all */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={() => {
                      if (allSelected) {
                        cityProviders.forEach((p) => {
                          if (selectedProviders.has(p.provider_id)) {
                            onToggleProvider(p.provider_id);
                          }
                        });
                      } else {
                        onSelectAllInCity(cityProviders.map((p) => p.provider_id));
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-500">
                    Select all {cityProviders.length}
                  </span>
                </label>
              </div>

              {/* Provider Cards - Two-line layout matching Follow Up / Alt Channels */}
              <div className="divide-y divide-gray-100">
                {cityProviders.map((provider) => (
                  <div
                    key={provider.provider_id}
                    className="group px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => onOpenDrawer(provider)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox - stops propagation */}
                      <input
                        type="checkbox"
                        checked={selectedProviders.has(provider.provider_id)}
                        onChange={() => onToggleProvider(provider.provider_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                      />

                      {/* Main content - two lines */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Provider name + badges */}
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-gray-900 text-sm truncate">
                            {provider.provider_name}
                          </span>

                          {/* Confirm button - show in Call & Confirm tab */}
                          {activeTab === "call_confirm" && (
                            ((provider.confirmed_at || confirmedProviders.has(provider.provider_id)) && !unconfirmedProviders.has(provider.provider_id)) ? (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setUnconfirmingProvider(provider.provider_id);
                                  try {
                                    const res = await fetch("/api/admin/provider-outreach/confirm", {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ provider_id: provider.provider_id }),
                                    });
                                    if (res.ok) {
                                      setConfirmedProviders(prev => {
                                        const next = new Set(prev);
                                        next.delete(provider.provider_id);
                                        return next;
                                      });
                                      setUnconfirmedProviders(prev => new Set([...prev, provider.provider_id]));
                                    }
                                  } catch {
                                    // Silent fail
                                  } finally {
                                    setUnconfirmingProvider(null);
                                  }
                                }}
                                disabled={unconfirmingProvider === provider.provider_id}
                                className="text-blue-500 hover:text-blue-400 shrink-0"
                                title="Click to unconfirm"
                              >
                                {unconfirmingProvider === provider.provider_id ? (
                                  <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin inline-block" />
                                ) : (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setConfirmingProvider(provider.provider_id);
                                  setConfirmError(null);
                                  try {
                                    const res = await fetch("/api/admin/provider-outreach/confirm", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ provider_id: provider.provider_id }),
                                    });
                                    if (res.ok) {
                                      setConfirmedProviders(prev => new Set([...prev, provider.provider_id]));
                                      setUnconfirmedProviders(prev => {
                                        const next = new Set(prev);
                                        next.delete(provider.provider_id);
                                        return next;
                                      });
                                    } else {
                                      setConfirmError(provider.provider_id);
                                    }
                                  } catch {
                                    setConfirmError(provider.provider_id);
                                  } finally {
                                    setConfirmingProvider(null);
                                  }
                                }}
                                disabled={confirmingProvider === provider.provider_id}
                                className={`shrink-0 ${
                                  confirmError === provider.provider_id
                                    ? "text-red-500 hover:text-red-600"
                                    : "text-gray-400 hover:text-blue-500"
                                }`}
                                title={confirmError === provider.provider_id ? "Failed - click to retry" : "Click to confirm"}
                              >
                                {confirmingProvider === provider.provider_id ? (
                                  <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin inline-block" />
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
                                    <circle cx="10" cy="10" r="7.5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 10l2 2 4-4" />
                                  </svg>
                                )}
                              </button>
                            )
                          )}

                          {/* Sequence progress badge - only show in In Sequence tab */}
                          {activeTab === "in_sequence" && typeof provider.emails_sent === "number" && (
                            <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${
                              provider.sequence_status?.failed_step !== undefined
                                ? "bg-red-100 text-red-700"
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {provider.emails_sent}/4
                            </span>
                          )}

                          {/* Contact form indicator */}
                          {(provider.contact_form_url || (provider.contact_form_send_count ?? 0) > 0) ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600" title={(provider.contact_form_send_count ?? 0) > 0 ? `${provider.contact_form_send_count} form(s) sent` : "Contact form URL found"}>
                              Form{(provider.contact_form_send_count ?? 0) > 0 ? ` (${provider.contact_form_send_count})` : ""}
                            </span>
                          ) : provider.website ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600" title="Has website - contact form can be found">
                              Web
                            </span>
                          ) : null}
                        </div>

                        {/* Row 2: Category · City, State · Phone · Email */}
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          {provider.provider_category && (
                            <span className="truncate max-w-[200px]">{provider.provider_category}</span>
                          )}
                          {provider.provider_category && provider.city && <span>·</span>}
                          {provider.city && (
                            <span>{provider.city}{provider.state ? `, ${provider.state}` : ""}</span>
                          )}
                          {(provider.provider_category || provider.city) && <span>·</span>}
                          {provider.phone ? (
                            <a
                              href={`tel:${provider.phone.replace(/\D/g, "")}`}
                              className="text-primary-600 hover:text-primary-700 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {formatPhone(provider.phone)}
                            </a>
                          ) : (
                            <span className="text-gray-400 italic">No phone</span>
                          )}
                          <span>·</span>
                          {provider.email ? (
                            <a
                              href={`mailto:${provider.email}`}
                              className="text-primary-600 hover:text-primary-700 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {provider.email}
                            </a>
                          ) : (
                            <span className="text-gray-400 italic">No email</span>
                          )}
                        </div>
                      </div>

                      {/* Chevron to indicate clickable */}
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Follow Up Queue Component (Due Date Grouped)
// ─────────────────────────────────────────────────────────────────────────────

// Helper: get today's date as ISO string (YYYY-MM-DD) in UTC
// Uses UTC to match server/database which also use UTC, ensuring consistent comparisons
function getTodayISO(): string {
  // Use Central Time (business timezone) for consistency with backend
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// Helper: calculate days difference from today
function getDaysDiff(dateStr: string | null): number {
  if (!dateStr) return 0;
  const today = new Date(getTodayISO());
  const dueDate = new Date(dateStr);
  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Helper: format due date badge
function formatDueDateBadge(dateStr: string | null): { text: string; className: string } {
  if (!dateStr) {
    // Legacy record without due_date - show as due today since it needs attention
    return { text: "Due today", className: "bg-amber-100 text-amber-700" };
  }

  const daysDiff = getDaysDiff(dateStr);

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

// Get human-readable explanation for why provider is in Follow Up
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

// Simplified provider row for Follow Up queue - click to open drawer
function FollowUpProviderRow({
  provider,
  onOpenDrawer,
}: {
  provider: OutreachProvider;
  onOpenDrawer: () => void;
}) {
  const dueBadge = formatDueDateBadge(provider.due_date);
  const reasonChip = getNeedsCallReasonChip(provider.needs_call_reason);
  const formSendCount = provider.contact_form_send_count ?? 0;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        className="group px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        onClick={onOpenDrawer}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDrawer();
          }
        }}
      >
        <div className="flex items-center gap-3">
          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Provider name + badges */}
            <div className="flex items-center justify-between gap-4 mb-0.5">
              <Link
                href={provider.slug ? `/admin/directory/${provider.slug}` : "#"}
                className="font-medium text-gray-900 hover:text-primary-600 transition-colors text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {provider.provider_name}
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                {(provider.contact_form_url || formSendCount > 0) ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600" title={formSendCount > 0 ? `${formSendCount} form(s) sent` : "Contact form URL found"}>
                    Form{formSendCount > 0 ? ` (${formSendCount})` : ""}
                  </span>
                ) : provider.website ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600" title="Has website - contact form can be found">
                    Web
                  </span>
                ) : null}
                {reasonChip && (
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${reasonChip.className}`}>
                    {reasonChip.label}
                  </span>
                )}
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${dueBadge.className}`}>
                  {dueBadge.text}
                </span>
              </div>
            </div>

            {/* Row 2: Category, location, phone, email */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {provider.provider_category && (
                <span className="truncate max-w-[200px]">{provider.provider_category}</span>
              )}
              {provider.provider_category && provider.city && <span>·</span>}
              {provider.city && (
                <span>{provider.city}{provider.state ? `, ${provider.state}` : ""}</span>
              )}
              {(provider.provider_category || provider.city) && <span>·</span>}
              {provider.phone ? (
                <a
                  href={`tel:${provider.phone.replace(/\D/g, "")}`}
                  className="text-primary-600 hover:text-primary-700 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {formatPhone(provider.phone)}
                </a>
              ) : (
                <span className="text-gray-400 italic">No phone</span>
              )}
              <span>·</span>
              {provider.email ? (
                <a
                  href={`mailto:${provider.email}`}
                  className="text-primary-600 hover:text-primary-700 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {provider.email}
                </a>
              ) : (
                <span className="text-gray-400 italic">No email</span>
              )}
            </div>
          </div>

          {/* Chevron indicator for drawer */}
          <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}


function FollowUpQueue({ providers, loading, onOpenDrawer }: {
  providers: OutreachProvider[];
  loading: boolean;
  onOpenDrawer: (provider: OutreachProvider) => void;
}) {
  // Filter to only show providers actually in needs_call stage
  // This prevents ghost data from appearing during tab switches (React state sync issue)
  const followUpProviders = providers.filter(p => p.stage === "needs_call");

  // Group providers by due date sections
  const today = getTodayISO();

  // Note: Providers with null due_date are legacy records that entered needs_call
  // before the migration. Treat them as "Due Today" since they need attention.
  const overdue = followUpProviders.filter((p) => p.due_date && p.due_date < today);
  const dueToday = followUpProviders.filter((p) => !p.due_date || p.due_date === today);
  const upcoming = followUpProviders.filter((p) => p.due_date && p.due_date > today);

  // Engagement priority: clicked/replied providers are "hot leads" - show them first
  const getEngagementPriority = (reason: string | null): number => {
    switch (reason) {
      case "replied":            return 0; // Hottest - they replied
      case "clicked_not_claimed": return 1; // Hot - clicked but didn't finish
      case "manual":              return 2; // Admin flagged - probably important
      case "sequence_exhausted":
      case "sequence_completed":  return 3; // Cold - no engagement
      default:                    return 4;
    }
  };

  // Sort: engagement priority first, then due_date ASC within same priority
  const sortByEngagementThenDate = (a: OutreachProvider, b: OutreachProvider) => {
    const priorityA = getEngagementPriority(a.needs_call_reason);
    const priorityB = getEngagementPriority(b.needs_call_reason);
    if (priorityA !== priorityB) return priorityA - priorityB;
    // Same priority - sort by due_date ASC
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  };

  overdue.sort(sortByEngagementThenDate);
  dueToday.sort(sortByEngagementThenDate);
  upcoming.sort(sortByEngagementThenDate);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (followUpProviders.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-500">No providers in Follow Up queue</p>
      </div>
    );
  }

  const renderSection = (
    title: string,
    items: OutreachProvider[],
    headerClassName: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-2 last:mb-0">
        <div className={`px-5 py-2 text-xs font-semibold uppercase tracking-wide ${headerClassName}`}>
          {title} ({items.length})
        </div>
        {items.map((provider) => (
          <FollowUpProviderRow
            key={provider.provider_id}
            provider={provider}
            onOpenDrawer={() => onOpenDrawer(provider)}
          />
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Page-level Call Script - collapsible, applies to all providers */}
      <details className="mx-5 mt-4 mb-2 bg-white border border-gray-200 rounded-lg">
        <summary className="px-4 py-2.5 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 select-none flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
          Call Script
        </summary>
        <div className="px-4 py-3 border-t border-gray-100 text-sm text-gray-600 space-y-3">
          <p>
            &quot;Hi, this is <span className="font-medium text-gray-800">[Your Name]</span> from Olera, calling on behalf of Dr. Logan DuBose&apos;s office.&quot;
          </p>
          <p>
            &quot;I&apos;m following up on the emails we sent about your listing on Olera. We run a free family referral service for <span className="font-medium text-gray-800">[care type]</span> in <span className="font-medium text-gray-800">[city]</span>.&quot;
          </p>
          <p>
            &quot;I wanted to check if you had any questions or if there&apos;s anything stopping you from activating your page. It takes about 30 seconds.&quot;
          </p>
          <p>
            &quot;I can resend the link right now if that helps—is <span className="font-medium text-gray-800">[email on file]</span> still the best address?&quot;
          </p>
        </div>
      </details>

      {renderSection("Overdue", overdue, "bg-red-50 text-red-700 border-b border-red-100")}
      {renderSection("Due Today", dueToday, "bg-amber-50 text-amber-700 border-b border-amber-100")}
      {renderSection("Upcoming", upcoming, "bg-gray-50 text-gray-600 border-b border-gray-100")}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alternative Channels Queue Component (Tracking Only)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Tracking Constants and Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DIRECT_MAIL_EXPIRY_DAYS = 30; // Days in alternative channels before prompting action

// Helper: calculate days since a date
function daysSince(dateString: string | null): number {
  if (!dateString) return 0;
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Channel label helper
function getChannelLabel(channel: string | null): { label: string; className: string } | null {
  if (!channel || channel === "re_engage") return null;
  switch (channel) {
    case "fax":
      return { label: "Fax", className: "bg-purple-50 text-purple-700" };
    case "contact_form":
      return { label: "Contact Form", className: "bg-orange-50 text-orange-700" };
    case "direct_mail":
      return { label: "Direct Mail", className: "bg-teal-50 text-teal-700" };
    default:
      return { label: channel, className: "bg-gray-50 text-gray-600" };
  }
}

// Simplified provider row for Alternative Channels - click to open drawer
function ReEngageProviderRow({
  provider,
  onOpenDrawer,
  isSelected,
  onToggle,
}: {
  provider: OutreachProvider;
  onOpenDrawer: () => void;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const waitDays = daysSince(provider.re_engage_entered_at);
  const channelInfo = getChannelLabel(provider.re_engage_channel || null);
  const isExpired = waitDays >= DIRECT_MAIL_EXPIRY_DAYS;
  const formSendCount = provider.contact_form_send_count ?? 0;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* Expiry warning */}
      {isExpired && (
        <div className="mx-5 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-xs text-amber-800 font-medium">
            No response after {waitDays} days — click to review
          </span>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        className="group px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        onClick={onOpenDrawer}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDrawer();
          }
        }}
      >
        <div className="flex items-center gap-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
          />
          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Provider name + wait time + channel */}
            <div className="flex items-center justify-between gap-4 mb-0.5">
              <Link
                href={provider.slug ? `/admin/directory/${provider.slug}` : "#"}
                className="font-medium text-gray-900 hover:text-primary-600 transition-colors text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {provider.provider_name}
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                {(provider.contact_form_url || formSendCount > 0) ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600" title={formSendCount > 0 ? `${formSendCount} form(s) sent` : "Contact form URL found"}>
                    Form{formSendCount > 0 ? ` (${formSendCount})` : ""}
                  </span>
                ) : provider.website ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600" title="Has website - contact form can be found">
                    Web
                  </span>
                ) : null}
                {channelInfo && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${channelInfo.className}`}>
                    {channelInfo.label}
                  </span>
                )}
                <span className="text-xs text-gray-500">{waitDays}d</span>
              </div>
            </div>

            {/* Row 2: Category, location, phone, email */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {provider.provider_category && (
                <span className="truncate max-w-[200px]">{provider.provider_category}</span>
              )}
              {provider.provider_category && provider.city && <span>·</span>}
              {provider.city && (
                <span>{provider.city}{provider.state ? `, ${provider.state}` : ""}</span>
              )}
              {(provider.provider_category || provider.city) && <span>·</span>}
              {provider.phone ? (
                <a
                  href={`tel:${provider.phone.replace(/\D/g, "")}`}
                  className="text-primary-600 hover:text-primary-700 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {formatPhone(provider.phone)}
                </a>
              ) : (
                <span className="text-gray-400 italic">No phone</span>
              )}
              <span>·</span>
              {provider.email ? (
                <a
                  href={`mailto:${provider.email}`}
                  className="text-primary-600 hover:text-primary-700 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {provider.email}
                </a>
              ) : (
                <span className="text-gray-400 italic">No email</span>
              )}
            </div>
          </div>

          {/* Chevron indicator for drawer */}
          <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function ReEngageQueue({
  providers,
  loading,
  onOpenDrawer,
  selectedProviders,
  onToggleProvider,
  onSelectAll,
}: {
  providers: OutreachProvider[];
  loading: boolean;
  onOpenDrawer: (provider: OutreachProvider) => void;
  selectedProviders: Set<string>;
  onToggleProvider: (providerId: string) => void;
  onSelectAll: (providerIds: string[]) => void;
}) {
  // Filter to only show providers actually in re_engage stage
  const reEngageProviders = providers.filter((p) => p.stage === "re_engage");

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (reEngageProviders.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-500">No providers in Alternative Channels</p>
      </div>
    );
  }

  // Sort by re_engage_entered_at (oldest first - most urgent)
  const sorted = [...reEngageProviders].sort((a, b) => {
    if (!a.re_engage_entered_at && !b.re_engage_entered_at) return 0;
    if (!a.re_engage_entered_at) return 1;
    if (!b.re_engage_entered_at) return -1;
    return a.re_engage_entered_at.localeCompare(b.re_engage_entered_at);
  });

  // Selection state
  const allSelected = reEngageProviders.length > 0 && reEngageProviders.every((p) => selectedProviders.has(p.provider_id));
  const someSelected = reEngageProviders.some((p) => selectedProviders.has(p.provider_id)) && !allSelected;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={() => {
            if (allSelected) {
              // Deselect all
              onSelectAll([]);
            } else {
              // Select all
              onSelectAll(reEngageProviders.map((p) => p.provider_id));
            }
          }}
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
        />
        <div className="flex-1">Provider</div>
        <div className="w-20 text-center">Channel</div>
        <div className="w-20 text-right">Waiting</div>
      </div>

      {/* Provider rows - click opens drawer */}
      {sorted.map((provider) => (
        <ReEngageProviderRow
          key={provider.provider_id}
          provider={provider}
          onOpenDrawer={() => onOpenDrawer(provider)}
          isSelected={selectedProviders.has(provider.provider_id)}
          onToggle={() => onToggleProvider(provider.provider_id)}
        />
      ))}

      {/* Summary footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
        {reEngageProviders.length} provider{reEngageProviders.length !== 1 ? "s" : ""} in Alternative Channels
      </div>
    </div>
  );
}

// Simplified provider row for Call tab - click to open drawer
function CallProviderRow({
  provider,
  onOpenDrawer,
}: {
  provider: OutreachProvider;
  onOpenDrawer: () => void;
}) {
  const daysSinceEntry = provider.stage_changed_at
    ? daysSince(provider.stage_changed_at)
    : 0;
  const emailsSent = provider.resend_count ?? 0;
  const formSendCount = provider.contact_form_send_count ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group px-5 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      onClick={onOpenDrawer}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDrawer();
        }
      }}
    >
      <div className="flex items-center gap-3">
        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Provider name + badges */}
          <div className="flex items-center justify-between gap-4 mb-0.5">
            <Link
              href={provider.slug ? `/admin/directory/${provider.slug}` : "#"}
              className="font-medium text-gray-900 hover:text-primary-600 transition-colors text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              {provider.provider_name}
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              {(provider.contact_form_url || formSendCount > 0) ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600" title={formSendCount > 0 ? `${formSendCount} form(s) sent` : "Contact form URL found"}>
                  Form{formSendCount > 0 ? ` (${formSendCount})` : ""}
                </span>
              ) : provider.website ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600" title="Has website - contact form can be found">
                  Web
                </span>
              ) : null}
              {emailsSent > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                  {emailsSent} sent
                </span>
              )}
              <span className="text-xs text-gray-500">{daysSinceEntry}d</span>
            </div>
          </div>

          {/* Row 2: Category, location, phone, email */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {provider.provider_category && (
              <span className="truncate max-w-[200px]">{provider.provider_category}</span>
            )}
            {provider.provider_category && provider.city && <span>·</span>}
            {provider.city && (
              <span>{provider.city}{provider.state ? `, ${provider.state}` : ""}</span>
            )}
            {(provider.provider_category || provider.city) && <span>·</span>}
            {provider.phone ? (
              <a
                href={`tel:${provider.phone.replace(/\D/g, "")}`}
                className="text-primary-600 hover:text-primary-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {formatPhone(provider.phone)}
              </a>
            ) : (
              <span className="text-gray-400 italic">No phone</span>
            )}
            <span>·</span>
            {provider.email ? (
              <a
                href={`mailto:${provider.email}`}
                className="text-primary-600 hover:text-primary-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {provider.email}
              </a>
            ) : (
              <span className="text-gray-400 italic">No email</span>
            )}
          </div>
        </div>

        {/* Chevron indicator for drawer */}
        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </div>
  );
}

function CallQueue({
  providers,
  loading,
  onOpenDrawer,
}: {
  providers: OutreachProvider[];
  loading: boolean;
  onOpenDrawer: (provider: OutreachProvider) => void;
}) {
  // Filter to only show providers in call_exhausted stage
  const callProviders = providers.filter((p) => p.stage === "call_exhausted");

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (callProviders.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-500">No providers need calling</p>
      </div>
    );
  }

  // Sort by stage_changed_at (oldest first - most urgent)
  const sorted = [...callProviders].sort((a, b) => {
    if (!a.stage_changed_at && !b.stage_changed_at) return 0;
    if (!a.stage_changed_at) return 1;
    if (!b.stage_changed_at) return -1;
    return a.stage_changed_at.localeCompare(b.stage_changed_at);
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
        <div className="flex-1">Provider</div>
        <div className="w-20 text-center">Emails</div>
        <div className="w-20 text-right">Days</div>
      </div>

      {/* Provider rows - click opens drawer */}
      {sorted.map((provider) => (
        <CallProviderRow
          key={provider.provider_id}
          provider={provider}
          onOpenDrawer={() => onOpenDrawer(provider)}
        />
      ))}

      {/* Summary footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
        {callProviders.length} provider{callProviders.length !== 1 ? "s" : ""} need calling
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProviderOutreachPage() {
  // URL state for sub-tab persistence
  const searchParams = useSearchParams();
  const router = useRouter();

  // Active states (new "Add State" workflow)
  const [activeStates, setActiveStates] = useState<ActiveState[]>([]);
  const [loadingActiveStates, setLoadingActiveStates] = useState(true);
  const totalUsStates = US_STATES.length; // Constant, not state

  // Selected state (from active states or fallback)
  const [selectedState, setSelectedState] = useState<string>("");

  // Active UI tab (call_confirm represents the not_contacted stage)
  const [activeTab, setActiveTab] = useState<UITab>("call_confirm");

  // Active sub-tab within the "Done" tab - initialize from URL if present
  const initialDoneSubTab = (searchParams.get("doneTab") as DoneSubTab) || "claimed";
  const [activeDoneSubTab, setActiveDoneSubTab] = useState<DoneSubTab>(
    DONE_SUB_TABS.includes(initialDoneSubTab) ? initialDoneSubTab : "claimed"
  );

  // Search
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSearchResult, setIsSearchResult] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Admin filter state (replaces My Assignments checkbox)
  const [adminCounts, setAdminCounts] = useState<AdminCounts>({});
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string | null>(null);
  // Store call_confirm admin counts separately so tab label stays accurate across tab switches
  const [callConfirmAssignedCount, setCallConfirmAssignedCount] = useState<number | null>(null);

  // Channel filter state (for Alternative Channels tab)
  type ChannelFilter = "all" | "email" | "fax" | "contact_form" | "direct_mail";
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<ChannelFilter>("all");

  // All admins for name lookup (fetched once)
  interface AdminUser {
    id: string;
    email: string;
    display_name: string | null;
  }
  const [allAdmins, setAllAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);

  // Legacy: kept for backwards compatibility with assigned_to=me URL param
  const myAssignmentsOnly = false; // No longer used, but kept for query param handling

  // Cities data (for call_confirm tab)
  const [cities, setCities] = useState<CityStats[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [totalUnclaimed, setTotalUnclaimed] = useState(0);

  // City owners for assignment
  interface CityOwner {
    city: string;
    owner_id: string | null;
    owner_name: string | null;
  }
  const [cityOwners, setCityOwners] = useState<Map<string, CityOwner>>(new Map());
  const [editingCityAssignment, setEditingCityAssignment] = useState<string | null>(null);

  // Providers data
  const [providers, setProviders] = useState<OutreachProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Track recently-moved provider IDs to filter from stale API responses
  // This prevents providers from reappearing due to database replication lag
  const recentlyMovedRef = useRef<Set<string>>(new Set());
  const recentlyMovedTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Helper to mark a provider as recently moved (auto-clears after 30 seconds)
  // Extended from 5s to 30s to account for database replication lag
  const markAsRecentlyMoved = useCallback((providerId: string) => {
    recentlyMovedRef.current.add(providerId);
    console.log("[recentlyMoved] Added:", providerId, "Set size:", recentlyMovedRef.current.size);
    // Clear any existing timer for this provider
    const existingTimer = recentlyMovedTimersRef.current.get(providerId);
    if (existingTimer) clearTimeout(existingTimer);
    // Set new timer to remove after 30 seconds (extended for DB replication)
    const timer = setTimeout(() => {
      recentlyMovedRef.current.delete(providerId);
      recentlyMovedTimersRef.current.delete(providerId);
      console.log("[recentlyMoved] Expired:", providerId, "Set size:", recentlyMovedRef.current.size);
    }, 30000);
    recentlyMovedTimersRef.current.set(providerId, timer);
  }, []);

  // Stage counts (includes call_confirm and done for UI tabs)
  interface TabCounts extends Record<OutreachStage, number> {
    call_confirm: number;  // Combined needs_email + ready
    done: number;  // Combined claimed + not_interested + archived + hidden
    hidden: number;  // Hidden count (for Done sub-tab)
  }
  const [stageCounts, setStageCounts] = useState<TabCounts>({
    not_contacted: 0,
    in_sequence: 0,
    needs_call: 0,
    re_engage: 0,
    call_exhausted: 0,
    not_interested: 0,
    claimed: 0,
    archived: 0,
    call_confirm: 0,
    done: 0,
    hidden: 0,
  });

  // Follow-ups due today with admin breakdown

  // Admin name lookup from allAdmins + admin_counts (fallback)
  const adminNameLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    // First, add all admins
    for (const admin of allAdmins) {
      const name = admin.display_name || admin.email.split("@")[0];
      lookup.set(admin.id, name);
    }
    // Then, add/update from admin_counts (in case they have more recent names)
    for (const [adminId, data] of Object.entries(adminCounts)) {
      if (adminId !== "unassigned" && data.display_name) {
        lookup.set(adminId, data.display_name);
      }
    }
    return lookup;
  }, [allAdmins, adminCounts]);

  // Expanded cities (for not_contacted tab)
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());

  // Selected providers
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  // Stats section expanded state
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Email performance / claims dashboard section
  const [emailStatsExpanded, setEmailStatsExpanded] = useState(false);
  const [claimsDashboard, setClaimsDashboard] = useState<{
    totals: {
      sequenced: number;
      claimed: number;
      conversion_rate: number;
      avg_time_to_claim_days: number | null;
    };
    sequence_day_breakdown: Array<{
      label: string;
      day_min: number;
      day_max: number | null;
      count: number;
      percentage: number;
    }>;
    engagement: {
      contacted: number;
      opened: number;
      open_rate: number;
      clicked: number;
      click_rate: number;
    } | null;
  } | null>(null);
  const [claimsDashboardLoading, setClaimsDashboardLoading] = useState(false);
  const [claimsDashboardError, setClaimsDashboardError] = useState(false);

  // Sequence conversion stats section
  const [conversionExpanded, setConversionExpanded] = useState(false);
  const [conversionStats, setConversionStats] = useState<{
    cities: Array<{
      city: string;
      in_sequence: number;
      claimed: number;
      rate: number;
    }>;
    totals: {
      in_sequence: number;
      claimed: number;
      rate: number;
    };
    by_email_source?: {
      organization: { in_sequence: number; claimed: number; rate: number };
      decision_maker: { in_sequence: number; claimed: number; rate: number };
    };
  } | null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState(false);

  // Email source comparison (org vs Apollo decision-maker)
  const [emailSourceExpanded, setEmailSourceExpanded] = useState(false);

  // Email template preview
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Global claimed count (fetched separately, not derived from active states)
  const [globalClaimedCount, setGlobalClaimedCount] = useState<number | null>(null);

  // Global follow-ups due today (across all states)
  const [globalFollowUpsToday, setGlobalFollowUpsToday] = useState<{
    total: number;
    by_admin: Array<{ admin_id: string | null; display_name: string; count: number }>;
  }>({ total: 0, by_admin: [] });

  // Global sequence conversion stats (all time)
  const [sequenceConversion, setSequenceConversion] = useState<{
    sequenced: number;
    claimed: number;
    rate: number;
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Export CSV state
  const [exporting, setExporting] = useState(false);

  // Add State modal state
  const [showAddStateModal, setShowAddStateModal] = useState(false);
  const [addStateSearch, setAddStateSearch] = useState("");
  const [addingState, setAddingState] = useState<string | null>(null);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [loadingStateCounts, setLoadingStateCounts] = useState(false);
  const [stateCountsError, setStateCountsError] = useState(false);

  // Assign Cities modal state
  const [showAssignCitiesModal, setShowAssignCitiesModal] = useState(false);
  const [assignCitiesSearch, setAssignCitiesSearch] = useState("");
  const [assignCitiesForState, setAssignCitiesForState] = useState<string | null>(null);
  const [allCitiesForAssignment, setAllCitiesForAssignment] = useState<CityStats[]>([]);
  const [loadingAllCities, setLoadingAllCities] = useState(false);

  // State actions menu (for refresh, status change, delete)
  const [stateActionsMenu, setStateActionsMenu] = useState<string | null>(null);
  const [stateActionLoading, setStateActionLoading] = useState<string | null>(null);

  // Delete state confirmation modal
  const [stateToDelete, setStateToDelete] = useState<{ code: string; name: string } | null>(null);
  const [deletingState, setDeletingState] = useState(false);

  // State selector dropdown in header
  const [showStateSelector, setShowStateSelector] = useState(false);

  // Action modal state
  const [actionModalProvider, setActionModalProvider] = useState<OutreachProvider | null>(null);
  const [selectedAction, setSelectedAction] = useState<"archived" | "unhide" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  // Unarchive preview state
  const [unarchivePreview, setUnarchivePreview] = useState<{
    archived_questions_count: number;
    connections_affected_count: number;
    loading: boolean;
  } | null>(null);
  const [unarchivePreviewConfirmed, setUnarchivePreviewConfirmed] = useState(false);
  // Pending stage move confirmation (for Move to Stage buttons)
  const [pendingStageMove, setPendingStageMove] = useState<OutreachStage | null>(null);
  // Not interested reason for action modal stage move
  const [actionNotInterestedReason, setActionNotInterestedReason] = useState("");

  // Send Claim Link state (for action modal)
  const [sendingClaimLink, setSendingClaimLink] = useState(false);
  const [claimLinkSent, setClaimLinkSent] = useState(false);
  const [pendingClaimLink, setPendingClaimLink] = useState(false); // Confirmation modal

  // Remove from outreach confirmation state
  const [pendingRemoval, setPendingRemoval] = useState<{
    providerId: string;
    providerName: string;
    stage: string;
  } | null>(null);
  const [removingProvider, setRemovingProvider] = useState(false);

  // Unhide from outreach confirmation state
  const [pendingUnhide, setPendingUnhide] = useState<{
    providerId: string;
    providerName: string;
  } | null>(null);
  const [unhidingProvider, setUnhidingProvider] = useState(false);

  // Sequence confirmation modal state
  const [showSequenceConfirm, setShowSequenceConfirm] = useState(false);
  const [sequenceConfirmProviders, setSequenceConfirmProviders] = useState<OutreachProvider[]>([]);
  const [sequenceAssigneeId, setSequenceAssigneeId] = useState<string | null>(null);
  const [sequenceAssigneeName, setSequenceAssigneeName] = useState<string | null>(null);
  const [showAssigneeAutocomplete, setShowAssigneeAutocomplete] = useState(false);
  const [showSequencePreview, setShowSequencePreview] = useState(false);
  // Apollo email preference: when true, use decision-maker email for providers that have one
  const [useApolloEmail, setUseApolloEmail] = useState(true);
  const [sequencePreviewData, setSequencePreviewData] = useState<{
    providers: Array<{
      provider_id: string;
      provider_name: string;
      email: string | null;
      valid: boolean;
      errors: string[];
      emails: Array<{
        day: number;
        templateKey: string;
        subject: string;
        bodyPreview: string;
        html: string;
      }>;
      // SmartLead-specific preview (shows exact HTML that SmartLead will send)
      smartlead_preview?: {
        campaign_name: string;
        steps: Array<{
          seq_number: number;
          cadence_day: number;
          subject_template: string;
          subject_preview: string;
          body_html_template: string;
          body_html_preview: string;
        }>;
      };
    }>;
    cadence: Array<{
      day: number;
      templateKey: string;
      description: string;
    }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
    };
    sender?: {
      engine: "smartlead" | "resend";
      from: string;
      senders: string[];
    };
  } | null>(null);
  const [sequencePreviewLoading, setSequencePreviewLoading] = useState(false);
  const [sequencePreviewError, setSequencePreviewError] = useState<string | null>(null);
  // For batch preview: which provider to show and which email day
  const [previewProviderId, setPreviewProviderId] = useState<string | null>(null);
  const [previewDay, setPreviewDay] = useState<number>(0);
  // Toggle between Resend and SmartLead preview modes
  const [previewEngine, setPreviewEngine] = useState<"resend" | "smartlead">("smartlead");

  // Notes modal state
  const [notesModalProvider, setNotesModalProvider] = useState<{ id: string; name: string } | null>(null);

  // Provider drawer state (for detail view)
  const [drawerProvider, setDrawerProvider] = useState<OutreachProvider | null>(null);

  // Sync drawer provider with list when providers update (prevents stale data)
  useEffect(() => {
    if (drawerProvider) {
      const updated = providers.find((p) => p.provider_id === drawerProvider.provider_id);
      if (updated) {
        // Provider still exists - sync all fields
        setDrawerProvider(updated);
      } else {
        // Provider was removed from list - close drawer
        setDrawerProvider(null);
      }
    }
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps -- only sync when providers change

  // Standardized archive reasons (same codes as Questions/Connections)
  // Archive = Stop all outreach. Provider is invalid, out of business, or explicitly declined.
  const ARCHIVE_REASONS = [
    { value: "uninterested_provider", label: "Provider declined / Not interested" },
    { value: "provider_requested_no_emails", label: "Provider requested no contact" },
    { value: "out_of_business", label: "Out of business / Permanently closed" },
    { value: "invalid_provider", label: "Invalid listing (fake/spam)" },
    { value: "duplicate", label: "Duplicate of another listing" },
    { value: "wrong_contact_info", label: "Unable to verify provider exists" },
    { value: "inactive", label: "Inactive / No response" },
    { value: "inactive_multiple_attempts", label: "Inactive after multiple attempts" },
    { value: "fax_only", label: "Fax only / No email" },
    { value: "relocated", label: "Relocated" },
    { value: "compliance_issue", label: "Compliance issue" },
    { value: "merged", label: "Merged with another provider" },
    { value: "other", label: "Other" },
  ];

  // Standardized unarchive reasons - direct positive inverses of each archive reason
  const UNARCHIVE_REASONS = [
    { value: "archived_in_error", label: "Mistakenly archived" },
    { value: "provider_now_interested", label: "Provider now interested" },
    { value: "provider_now_wants_contact", label: "Provider now wants contact" },
    { value: "business_confirmed_operating", label: "Business confirmed operating" },
    { value: "provider_verified_valid", label: "Provider verified as valid" },
    { value: "not_a_duplicate", label: "Confirmed not a duplicate" },
    { value: "provider_existence_verified", label: "Provider existence verified" },
    { value: "provider_now_responsive", label: "Provider now responsive" },
    { value: "email_obtained", label: "Email address obtained" },
    { value: "new_contact_info_obtained", label: "New contact info obtained" },
    { value: "compliance_resolved", label: "Compliance issue resolved" },
    { value: "not_merged", label: "Confirmed separate provider" },
    { value: "other", label: "Other" },
  ];


  // Global stats computed from activeStates
  const globalStats = useMemo(() => {
    const codes = activeStates.map(s => s.state_code);
    // Truncate state list after 5 to avoid overflow
    const statesList = codes.length <= 5
      ? codes.join(" · ")
      : `${codes.slice(0, 5).join(" · ")} +${codes.length - 5} more`;

    const stats = {
      totalStates: activeStates.length,
      statesList,
      totalProviders: 0,
      inSequence: 0,
      needsCall: 0,
    };
    for (const state of activeStates) {
      stats.totalProviders += state.total_providers;
      stats.inSequence += state.in_sequence;
      stats.needsCall += state.needs_call;
    }
    return stats;
  }, [activeStates]);

  // Close action modal and reset state
  const closeActionModal = () => {
    setActionModalProvider(null);
    setSelectedAction(null);
    setActionReason("");
    setActionNotes("");
    setUnarchivePreview(null);
    setUnarchivePreviewConfirmed(false);
    setPendingStageMove(null);
    setClaimLinkSent(false);
    setPendingClaimLink(false);
    setActionNotInterestedReason("");
  };

  // Remove provider from outreach (delete tracking row, not the provider itself)
  const handleRemoveFromOutreach = async () => {
    if (!pendingRemoval) return;

    setRemovingProvider(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: pendingRemoval.providerId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove provider");
      }

      // Remove from local state
      setProviders((prev) => prev.filter((p) => p.provider_id !== pendingRemoval.providerId));

      // Update stage counts
      const oldStage = pendingRemoval.stage as OutreachStage;
      if (oldStage === "not_contacted") {
        // Could be in call_confirm - refresh cities
        fetchCities();
      } else {
        setStageCounts((prev) => ({
          ...prev,
          [oldStage]: Math.max(0, (prev[oldStage] || 0) - 1),
        }));
      }

      showToast(`Removed ${pendingRemoval.providerName} from outreach`, "success");
      setPendingRemoval(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove provider";
      showToast(message, "error");
    } finally {
      setRemovingProvider(false);
    }
  };

  // Unhide provider (restore from admin_hidden state to Ready)
  const handleUnhideProvider = async () => {
    if (!pendingUnhide) return;

    setUnhidingProvider(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/unhide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: pendingUnhide.providerId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to unhide provider");
      }

      // Remove from local state (they'll appear in Ready tab now)
      setProviders((prev) => prev.filter((p) => p.provider_id !== pendingUnhide.providerId));

      // Update hidden count, refresh cities for accurate Ready/Needs Email counts
      setStageCounts((prev) => ({
        ...prev,
        hidden: Math.max(0, (prev.hidden || 0) - 1),
      }));
      fetchCities();

      showToast(`Restored ${pendingUnhide.providerName} to Ready`, "success");
      setPendingUnhide(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unhide provider";
      showToast(message, "error");
    } finally {
      setUnhidingProvider(false);
    }
  };

  // Fetch sequence preview from launch-sequence API
  // Preview is limited to first 100 providers (API limit) - launch handles full batching
  const fetchSequencePreview = useCallback(async (providerIds: string[]) => {
    if (providerIds.length === 0) return;

    // Limit preview to first 100 providers to avoid API limit
    // The launch function handles batching for the full list
    const previewIds = providerIds.slice(0, 100);

    setSequencePreviewLoading(true);
    setSequencePreviewError(null);
    try {
      const res = await fetch("/api/admin/provider-outreach/launch-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_ids: previewIds, dry_run: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setSequencePreviewData(data);
        setSequencePreviewError(null);
        // Set initial preview provider to first valid one
        const firstValid = data.providers?.find((p: { valid: boolean }) => p.valid);
        if (firstValid) {
          setPreviewProviderId(firstValid.provider_id);
        }
        setPreviewDay(0); // Start with Day 0 (intro email)
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || `API error: ${res.status}`;
        console.error("Failed to fetch sequence preview:", errorMsg);
        setSequencePreviewError(errorMsg);
        setSequencePreviewData(null);
      }
    } catch (error) {
      console.error("Error fetching sequence preview:", error);
      setSequencePreviewError(error instanceof Error ? error.message : "Network error");
      setSequencePreviewData(null);
    } finally {
      setSequencePreviewLoading(false);
    }
  }, []);

  // Fetch active states
  const fetchActiveStates = useCallback(async () => {
    setLoadingActiveStates(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/states");
      if (res.ok) {
        const data = await res.json();
        setActiveStates(data.states || []);
        // Auto-select first state if none selected (prefer active, then any)
        if (!selectedState && data.states?.length > 0) {
          const firstActive = data.states.find((s: ActiveState) => s.status === "active");
          const firstState = firstActive || data.states[0];
          if (firstState) {
            setSelectedState(firstState.state_code);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch active states:", err);
    } finally {
      setLoadingActiveStates(false);
    }
  }, [selectedState]);

  // Fetch all admins (for name lookup)
  const fetchAllAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/admins");
      if (res.ok) {
        const data = await res.json();
        setAllAdmins(data.admins || []);
      }
    } catch (err) {
      console.error("Failed to fetch admins:", err);
    } finally {
      setLoadingAdmins(false);
    }
  }, []);

  // Fetch cities for not_contacted stage
  const fetchCities = useCallback(async () => {
    if (!selectedState) return;
    setLoadingCities(true);

    try {
      const res = await fetch(`/api/admin/provider-outreach/cities?state=${selectedState}`);
      if (res.ok) {
        const data = await res.json();
        setCities(data.cities || []);
        setTotalUnclaimed(data.total_unclaimed || 0);
      }
    } catch (err) {
      console.error("Failed to fetch cities:", err);
    } finally {
      setLoadingCities(false);
    }
  }, [selectedState]);

  // Fetch city owners for the selected state
  const fetchCityOwners = useCallback(async () => {
    if (!selectedState) return;

    try {
      const res = await fetch(`/api/admin/provider-outreach/assign-city?state=${selectedState}`);
      if (res.ok) {
        const data = await res.json();
        const ownerMap = new Map<string, CityOwner>();
        for (const owner of data.city_owners || []) {
          ownerMap.set(owner.city, owner);
        }
        setCityOwners(ownerMap);
      } else {
        // Non-critical: just log, don't show toast
        console.error("Failed to fetch city owners: API returned", res.status);
      }
    } catch (err) {
      console.error("Failed to fetch city owners:", err);
    }
  }, [selectedState]);

  // Fetch all cities for Assign Cities modal (includes all cities, not just filtered ones)
  const fetchAllCitiesForAssignment = useCallback(async (stateCode: string) => {
    setLoadingAllCities(true);
    try {
      // Fetch cities
      const citiesRes = await fetch(`/api/admin/provider-outreach/cities?state=${stateCode}`);
      if (citiesRes.ok) {
        const citiesData = await citiesRes.json();
        setAllCitiesForAssignment(citiesData.cities || []);
      }
      // Also fetch city owners if not already loaded for this state
      const ownersRes = await fetch(`/api/admin/provider-outreach/assign-city?state=${stateCode}`);
      if (ownersRes.ok) {
        const ownersData = await ownersRes.json();
        const ownerMap = new Map<string, CityOwner>();
        for (const owner of ownersData.city_owners || []) {
          ownerMap.set(owner.city, owner);
        }
        setCityOwners(ownerMap);
      }
    } catch (err) {
      console.error("Failed to fetch cities for assignment:", err);
    } finally {
      setLoadingAllCities(false);
    }
  }, []);

  // Assign city to an admin
  // stateCode is optional - defaults to selectedState for inline edits, but can be passed for modal usage
  const assignCity = async (city: string, ownerId: string | null, ownerName: string | null, stateCode?: string) => {
    const targetState = stateCode || selectedState;
    if (!targetState) return;

    try {
      const res = await fetch("/api/admin/provider-outreach/assign-city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: targetState,
          city,
          owner_id: ownerId,
          owner_name: ownerName,
        }),
      });

      if (res.ok) {
        // Update local state
        setCityOwners((prev) => {
          const next = new Map(prev);
          next.set(city, { city, owner_id: ownerId, owner_name: ownerName });
          return next;
        });
        setEditingCityAssignment(null);
        showToast(ownerId ? `Assigned ${city} to ${ownerName}` : `Unassigned ${city}`, "success");
        // Refresh providers to update assigned_to on individual rows and filter chip counts
        // Only if we're modifying the currently selected state
        if (targetState === selectedState) {
          fetchProviders();
        }
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to assign city", "error");
      }
    } catch (err) {
      console.error("Failed to assign city:", err);
      showToast("Failed to assign city", "error");
    }
  };

  // Fetch providers for current tab/state (or search)
  const fetchProviders = useCallback(async (city?: string, searchTerm?: string) => {
    if (!selectedState) return;

    // Some tabs may not need provider fetching
    const apiParams = getApiParamsForTab(activeTab, activeDoneSubTab);
    if (!apiParams) {
      setLoadingProviders(false);
      return;
    }

    setLoadingProviders(true);

    try {
      // Map UI tab to API parameters
      const { stage, emailFilter } = apiParams;
      const params = new URLSearchParams({
        state: selectedState,
        stage,
      });
      if (emailFilter) params.set("email_filter", emailFilter);
      if (city) params.set("city", city);
      if (searchTerm) params.set("search", searchTerm);
      // Handle admin filter - "unassigned" filters for null assigned_to
      if (selectedAdminFilter && selectedAdminFilter !== "unassigned") {
        params.set("assigned_to", selectedAdminFilter);
      }

      const res = await fetch(`/api/admin/provider-outreach?${params}`);
      if (res.ok) {
        const data = await res.json();
        let filteredProviders = data.providers || [];
        // Client-side filter by assigned_to
        // API doesn't filter not_contacted stage by assigned_to, so we filter here
        if (selectedAdminFilter === "unassigned") {
          filteredProviders = filteredProviders.filter((p: OutreachProvider) => !p.assigned_to);
        } else if (selectedAdminFilter) {
          filteredProviders = filteredProviders.filter((p: OutreachProvider) => p.assigned_to === selectedAdminFilter);
        }
        // Filter out recently-moved providers to prevent stale data from reappearing
        // This guards against database replication lag returning old state
        const recentlyMovedIds = Array.from(recentlyMovedRef.current);
        if (recentlyMovedIds.length > 0) {
          const beforeCount = filteredProviders.length;
          filteredProviders = filteredProviders.filter(
            (p: OutreachProvider) => !recentlyMovedRef.current.has(p.provider_id)
          );
          const afterCount = filteredProviders.length;
          if (beforeCount !== afterCount) {
            console.log("[recentlyMoved] Filtered out", beforeCount - afterCount, "providers. IDs in Set:", recentlyMovedIds);
          }
        }
        setProviders(filteredProviders);
        setIsSearchResult(!!data.is_search);
        if (data.stage_counts) {
          // Transform API counts: combine into UI tab counts
          const apiCounts = data.stage_counts;
          setStageCounts({
            ...apiCounts,
            call_confirm: (apiCounts.needs_email ?? 0) + (apiCounts.ready ?? 0),
            done: (apiCounts.claimed ?? 0) + (apiCounts.not_interested ?? 0) + (apiCounts.archived ?? 0) + (apiCounts.hidden ?? 0),
          });
        }
        // Use API admin_counts if provided, otherwise compute from provider list
        const counts = data.admin_counts && Object.keys(data.admin_counts).length > 0
          ? data.admin_counts
          : (() => {
              // Compute admin counts from provider list (fallback for stages without API counts)
              const computed: AdminCounts = {};
              for (const p of data.providers || []) {
                const key = p.assigned_to || "unassigned";
                if (!computed[key]) {
                  computed[key] = { count: 0 };
                }
                computed[key].count++;
              }
              return computed;
            })();
        setAdminCounts(counts);

        // Store call_confirm assigned count for stable tab label
        if (activeTab === "call_confirm") {
          const assignedSum = Object.entries(counts)
            .filter(([key]) => key !== "unassigned")
            .reduce((sum, [, countData]) => sum + (countData as { count: number }).count, 0);
          setCallConfirmAssignedCount(assignedSum > 0 ? assignedSum : null);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to fetch providers", "error");
      }
    } catch (err) {
      console.error("Failed to fetch providers:", err);
      showToast("Failed to fetch providers", "error");
    } finally {
      setLoadingProviders(false);
    }
  }, [selectedState, activeTab, activeDoneSubTab, selectedAdminFilter]);

  // Debounce search input by 300ms
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  // Effect: fetch active states on mount
  useEffect(() => {
    fetchActiveStates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect: fetch global claimed count on mount (truly global, not filtered by active states)
  useEffect(() => {
    const fetchGlobalClaimed = async () => {
      try {
        const res = await fetch("/api/admin/provider-outreach/stats?metric=claimed");
        if (res.ok) {
          const data = await res.json();
          setGlobalClaimedCount(data.total ?? 0);
        }
      } catch (err) {
        console.error("Failed to fetch global claimed count:", err);
      }
    };
    fetchGlobalClaimed();
  }, []);

  // Effect: fetch global follow-ups due today on mount
  useEffect(() => {
    const fetchGlobalFollowUps = async () => {
      try {
        const res = await fetch("/api/admin/provider-outreach/stats?metric=follow_ups_today");
        if (res.ok) {
          const data = await res.json();
          setGlobalFollowUpsToday(data);
        }
      } catch (err) {
        console.error("Failed to fetch global follow-ups today:", err);
      }
    };
    fetchGlobalFollowUps();
    // Refresh every 5 minutes
    const interval = setInterval(fetchGlobalFollowUps, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Effect: fetch sequence conversion stats on mount
  useEffect(() => {
    const fetchSequenceConversion = async () => {
      try {
        const res = await fetch("/api/admin/provider-outreach/stats?metric=sequence_conversion");
        if (res.ok) {
          const data = await res.json();
          setSequenceConversion(data);
        }
      } catch (err) {
        console.error("Failed to fetch sequence conversion stats:", err);
      }
    };
    fetchSequenceConversion();
  }, []);

  // Effect: fetch claims dashboard when section is expanded
  useEffect(() => {
    if (!emailStatsExpanded || claimsDashboard) return; // Only fetch once when first expanded

    const fetchClaimsDashboard = async () => {
      setClaimsDashboardLoading(true);
      setClaimsDashboardError(false);
      try {
        const res = await fetch("/api/admin/provider-outreach/claims-dashboard");
        if (res.ok) {
          const data = await res.json();
          setClaimsDashboard(data);
        } else {
          setClaimsDashboardError(true);
        }
      } catch (err) {
        console.error("Failed to fetch claims dashboard:", err);
        setClaimsDashboardError(true);
      } finally {
        setClaimsDashboardLoading(false);
      }
    };
    fetchClaimsDashboard();
  }, [emailStatsExpanded, claimsDashboard]);

  // Effect: fetch sequence conversion stats when any analytics section is expanded
  // (Outreach Funnel, Sequence Conv., and Email Source all use the same API data)
  useEffect(() => {
    const needsData = statsExpanded || conversionExpanded || emailSourceExpanded;
    if (!needsData || conversionStats || !selectedState) return;

    const fetchConversionStats = async () => {
      setConversionLoading(true);
      setConversionError(false);
      try {
        const res = await fetch(`/api/admin/provider-outreach/conversion-stats?state=${selectedState}`);
        if (res.ok) {
          const data = await res.json();
          setConversionStats(data);
        } else {
          setConversionError(true);
        }
      } catch (err) {
        console.error("Failed to fetch conversion stats:", err);
        setConversionError(true);
      } finally {
        setConversionLoading(false);
      }
    };
    fetchConversionStats();
  }, [statsExpanded, conversionExpanded, emailSourceExpanded, conversionStats, selectedState]);

  // Reset conversion stats when state changes
  useEffect(() => {
    setConversionStats(null);
  }, [selectedState]);

  // Effect: fetch email template preview when a template is selected
  useEffect(() => {
    if (!previewTemplate) {
      setPreviewHtml(null);
      return;
    }

    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewHtml(null); // Clear old preview while loading new one
      try {
        // Use correct engine: nudge is sent via Resend, sequence emails via SmartLead
        const engine = previewTemplate === "nudge" ? "resend" : "smartlead";
        const res = await fetch(`/api/admin/provider-outreach/template-preview?template=${previewTemplate}&engine=${engine}`);
        if (res.ok) {
          const data = await res.json();
          setPreviewHtml(data.html);
        }
      } catch (err) {
        console.error("Failed to fetch template preview:", err);
      } finally {
        setPreviewLoading(false);
      }
    };
    fetchPreview();
  }, [previewTemplate]);

  // Effect: fetch provider counts when Add State modal opens
  useEffect(() => {
    if (!showAddStateModal) return;

    const fetchStateCounts = async () => {
      setLoadingStateCounts(true);
      setStateCountsError(false);
      try {
        const res = await fetch("/api/admin/provider-outreach/states/counts");
        if (res.ok) {
          const data = await res.json();
          const countsMap: Record<string, number> = {};
          for (const item of data.counts || []) {
            countsMap[item.state_code] = item.provider_count;
          }
          setStateCounts(countsMap);
        } else {
          setStateCountsError(true);
        }
      } catch (err) {
        console.error("Failed to fetch state counts:", err);
        setStateCountsError(true);
      } finally {
        setLoadingStateCounts(false);
      }
    };

    fetchStateCounts();
  }, [showAddStateModal]);

  // Effect: fetch cities when Assign Cities modal opens
  useEffect(() => {
    if (!showAssignCitiesModal || !assignCitiesForState) return;
    fetchAllCitiesForAssignment(assignCitiesForState);
  }, [showAssignCitiesModal, assignCitiesForState, fetchAllCitiesForAssignment]);

  // Effect: fetch all admins on mount (for name lookup)
  useEffect(() => {
    fetchAllAdmins();
  }, [fetchAllAdmins]);

  // Effect: close dropdowns when clicking outside
  useEffect(() => {
    if (!stateActionsMenu && !showStateSelector) return;
    const handleClickOutside = () => {
      setStateActionsMenu(null);
      setShowStateSelector(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [stateActionsMenu, showStateSelector]);

  // Effect: fetch cities when state changes (for call_confirm tab, when not searching)
  useEffect(() => {
    if (isNotContactedTab(activeTab) && !debouncedSearch) {
      fetchCities();
    }
  }, [selectedState, activeTab, debouncedSearch, fetchCities]);

  // Effect: fetch city owners when state changes
  useEffect(() => {
    if (selectedState) {
      fetchCityOwners();
    }
  }, [selectedState, fetchCityOwners]);

  // Effect: fetch providers and stage counts when state/tab/search changes
  useEffect(() => {
    if (selectedState) {
      fetchProviders(undefined, debouncedSearch || undefined);
    }
  }, [selectedState, activeTab, debouncedSearch, fetchProviders]);

  // Effect: fetch providers when a city is expanded (only when not searching)
  useEffect(() => {
    if (isNotContactedTab(activeTab) && expandedCities.size > 0 && !debouncedSearch) {
      fetchProviders();
    }
  }, [expandedCities, activeTab, debouncedSearch, fetchProviders]);

  // Clear selection, providers, and stage counts when tab/state/search changes
  useEffect(() => {
    setSelectedProviders(new Set());
    setExpandedCities(new Set());
    setProviders([]);
    // Clear stage counts when STATE changes (not tab) to avoid showing stale data
    // Stage counts are state-level, so changing tab within same state keeps counts
  }, [activeTab, selectedState, debouncedSearch]);

  // Update URL when Done sub-tab changes (for refresh persistence)
  useEffect(() => {
    if (activeTab === "done") {
      const params = new URLSearchParams(searchParams.toString());
      if (activeDoneSubTab !== "claimed") {
        params.set("doneTab", activeDoneSubTab);
      } else {
        params.delete("doneTab"); // Don't clutter URL with default value
      }
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    } else {
      // Clear doneTab from URL when not on Done tab
      const params = new URLSearchParams(searchParams.toString());
      if (params.has("doneTab")) {
        params.delete("doneTab");
        const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
        router.replace(newUrl, { scroll: false });
      }
    }
  }, [activeTab, activeDoneSubTab, searchParams, router]);

  // Separate effect to clear stage counts only when state changes
  const prevStateRef = useRef(selectedState);
  useEffect(() => {
    if (prevStateRef.current !== selectedState) {
      setStageCounts({
        not_contacted: 0,
        in_sequence: 0,
        needs_call: 0,
        re_engage: 0,
        call_exhausted: 0,
        not_interested: 0,
        claimed: 0,
        archived: 0,
        call_confirm: 0,
        done: 0,
        hidden: 0,
      });
      // Also reset the stored call_confirm assigned count
      setCallConfirmAssignedCount(null);
      prevStateRef.current = selectedState;
    }
  }, [selectedState]);

  // Show toast helper
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Export CSV handler
  async function handleExport(type: "providers" | "city_assignments" = "providers") {
    if (!selectedState) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("state", selectedState);
      // For "done" tab, send the actual sub-tab stage to export
      params.set("tab", activeTab === "done" ? activeDoneSubTab : activeTab);
      params.set("type", type);
      // Handle "unassigned" specially - pass as a flag, not as assigned_to value
      if (selectedAdminFilter === "unassigned") {
        params.set("unassigned", "true");
      } else if (selectedAdminFilter) {
        params.set("assigned_to", selectedAdminFilter);
      }
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await fetch(`/api/admin/provider-outreach/export?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Export failed", "error");
        return;
      }

      const exportCount = res.headers.get("X-Export-Count");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "olera-provider-outreach.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const count = exportCount ? parseInt(exportCount, 10) : 0;
      showToast(`Exported ${count.toLocaleString()} ${type === "city_assignments" ? "cities" : "providers"}`, "success");
    } catch {
      showToast("Export failed. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  }

  // Handle adding a state
  const handleAddState = async (stateCode: string) => {
    setAddingState(stateCode);
    try {
      const res = await fetch("/api/admin/provider-outreach/states", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state_code: stateCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add state");
      }
      // Refresh active states list
      await fetchActiveStates();
      // Select the newly added state
      setSelectedState(stateCode);
      // Close modal and reset
      setShowAddStateModal(false);
      setAddStateSearch("");
      showToast(`${data.state?.state_name || stateCode} added to active states`, "success");
    } catch (err) {
      console.error("Failed to add state:", err);
      showToast(err instanceof Error ? err.message : "Failed to add state", "error");
    } finally {
      setAddingState(null);
    }
  };

  // Handle refreshing stats for a state
  const handleRefreshStateStats = async (stateCode: string) => {
    setStateActionLoading(stateCode);
    setStateActionsMenu(null);
    try {
      const res = await fetch(`/api/admin/provider-outreach/states/${stateCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_stats" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to refresh stats");
      }
      // Update the state in our local list
      setActiveStates((prev) =>
        prev.map((s) => (s.state_code === stateCode ? { ...s, ...data.state } : s))
      );
      showToast(`Stats refreshed for ${data.state?.state_name || stateCode}`, "success");
    } catch (err) {
      console.error("Failed to refresh stats:", err);
      showToast(err instanceof Error ? err.message : "Failed to refresh stats", "error");
    } finally {
      setStateActionLoading(null);
    }
  };

  // Handle updating state status (active/paused/completed)
  const handleUpdateStateStatus = async (stateCode: string, newStatus: "active" | "paused" | "completed") => {
    setStateActionLoading(stateCode);
    setStateActionsMenu(null);
    try {
      const res = await fetch(`/api/admin/provider-outreach/states/${stateCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }
      // Update the state in our local list
      setActiveStates((prev) =>
        prev.map((s) => (s.state_code === stateCode ? { ...s, ...data.state } : s))
      );
      const statusLabels = { active: "Active", paused: "Paused", completed: "Completed" };
      showToast(`${data.state?.state_name || stateCode} marked as ${statusLabels[newStatus]}`, "success");
    } catch (err) {
      console.error("Failed to update status:", err);
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
    } finally {
      setStateActionLoading(null);
    }
  };

  // Handle deleting a state - shows confirmation modal
  const handleDeleteState = (stateCode: string, stateName: string) => {
    setStateActionsMenu(null); // Close menu before showing modal
    setStateToDelete({ code: stateCode, name: stateName });
  };

  // Actually perform the deletion after confirmation
  const confirmDeleteState = async () => {
    if (!stateToDelete) return;
    const { code: stateCode, name: stateName } = stateToDelete;
    setDeletingState(true);
    try {
      const res = await fetch(`/api/admin/provider-outreach/states/${stateCode}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove state");
      }
      // Remove from local list
      setActiveStates((prev) => prev.filter((s) => s.state_code !== stateCode));
      // If this was the selected state, clear selection
      if (selectedState === stateCode) {
        setSelectedState("");
      }
      showToast(data.message || `${stateName} removed`, "success");
      setStateToDelete(null);
    } catch (err) {
      console.error("Failed to delete state:", err);
      showToast(err instanceof Error ? err.message : "Failed to remove state", "error");
    } finally {
      setDeletingState(false);
    }
  };

  // Toggle city expansion
  const toggleCity = (cityName: string) => {
    setExpandedCities((prev) => {
      const next = new Set(prev);
      if (next.has(cityName)) {
        next.delete(cityName);
      } else {
        next.add(cityName);
      }
      return next;
    });
  };

  // Toggle provider selection
  const toggleProvider = (providerId: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  // Select all providers in a city
  const selectAllInCity = (providerIds: string[]) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      providerIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // Update stage for selected providers
  // Optionally pass specific providerIds (for filtered actions like "only with email")
  const updateStage = async (newStage: OutreachStage, providerIds?: string[]) => {
    const idsToUpdate = providerIds || Array.from(selectedProviders);
    if (idsToUpdate.length === 0) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_ids: idsToUpdate,
          stage: newStage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Use UI_TAB_LABELS first, then STAGE_LABELS as fallback for readable names
        const stageLabel = UI_TAB_LABELS[newStage as UITab] || STAGE_LABELS[newStage] || newStage;
        showToast(`Moved ${data.updated + data.created} provider(s) to ${stageLabel}`, "success");
        // Mark as recently moved to filter from stale API responses
        idsToUpdate.forEach((id) => markAsRecentlyMoved(id));
        // Optimistically remove moved providers from current tab to prevent duplicate appearance
        const idsSet = new Set(idsToUpdate);
        setProviders((prev) => prev.filter((p) => !idsSet.has(p.provider_id)));
        setSelectedProviders(new Set());

        // Refresh data
        if (isNotContactedTab(activeTab)) {
          fetchCities();
          fetchProviders();
        } else {
          fetchProviders();
        }
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to update stage", "error");
      }
    } catch (err) {
      console.error("Failed to update stage:", err);
      showToast("Failed to update stage", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Quick action for single provider (from modal)
  // If requiresReasonValidation is true, reason is required (archive/unarchive actions)
  const handleQuickAction = async (
    providerId: string,
    action: "not_contacted" | "archived" | "not_interested",
    reason?: string | null,
    notes?: string | null,
    requiresReasonValidation?: boolean,
    notInterestedReason?: string
  ) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_ids: [providerId],
          stage: action,
          reason: requiresReasonValidation ? reason : undefined,
          notes: notes || undefined,
          // not_interested_reason is required when moving to not_interested
          not_interested_reason: action === "not_interested" ? (notInterestedReason || "no_response_exhausted") : undefined,
        }),
      });

      if (res.ok) {
        const actionLabel = action === "not_contacted" ? "Restored" : action === "not_interested" ? "Not Interested" : "Archived";
        showToast(`Marked as ${actionLabel}`, "success");
        // Mark as recently moved to filter from stale API responses
        markAsRecentlyMoved(providerId);
        // Optimistically remove from current tab to prevent duplicate appearance
        setProviders((prev) => prev.filter((p) => p.provider_id !== providerId));

        // Refresh data
        if (isNotContactedTab(activeTab)) {
          fetchCities();
          fetchProviders();
        } else {
          fetchProviders();
        }
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to update", "error");
      }
    } catch (err) {
      console.error("Failed to quick action:", err);
      showToast("Failed to update", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Get selected providers with email (for "Move to In Sequence" eligibility)
  const selectedProvidersWithEmail = providers.filter(
    (p) => selectedProviders.has(p.provider_id) && p.email && p.email.trim()
  );
  const selectedWithEmailCount = selectedProvidersWithEmail.length;

  // Available actions based on current tab
  // Note: "Mark Claimed" is NOT included because Claimed auto-syncs from business_profiles
  // Note: Archive removed from bulk actions - use individual provider modal instead
  const getAvailableActions = (): { stage: OutreachStage; label: string; color: string; requiresEmail?: boolean }[] => {
    switch (activeTab) {
      case "call_confirm":
        // Providers with email can move to sequence (requiresEmail filters out those without)
        return [
          { stage: "in_sequence", label: "Launch Sequence", color: "bg-primary-600 hover:bg-primary-700", requiresEmail: true },
        ];
      case "in_sequence":
        return [
          { stage: "needs_call", label: "Move to Follow Up", color: "bg-amber-600 hover:bg-amber-700" },
          { stage: "not_contacted", label: "Reset to Not Contacted", color: "bg-gray-500 hover:bg-gray-600" },
        ];
      case "needs_call":  // Follow Up - no bulk actions, use individual outcome buttons instead
        return [];
      case "re_engage":
        // No "Move to In Sequence" - automation handles Cycle 2 start after 30 days
        return [
          { stage: "needs_call", label: "Move to Follow Up", color: "bg-amber-600 hover:bg-amber-700" },
          { stage: "not_contacted", label: "Reset to Not Contacted", color: "bg-gray-500 hover:bg-gray-600" },
        ];
      case "done":
        // Done tab - hidden sub-tab has no bulk actions (use individual unhide)
        if (activeDoneSubTab === "hidden") {
          return [];
        }
        // Other terminal stages - allow moving back to not_contacted
        return [
          { stage: "not_contacted", label: "Reset to Call & Confirm", color: "bg-gray-600 hover:bg-gray-700" },
        ];
      default:
        return [];
    }
  };

  // Build tabs from UI_TABS with correct counts
  // For call_confirm: use stored assigned count (from when we last viewed that tab),
  // otherwise use the global stage count. This ensures the tab count matches what's displayed.
  const tabs = UI_TABS.map((tab) => ({
    value: tab,
    label: UI_TAB_LABELS[tab],
    count: tab === "call_confirm" && callConfirmAssignedCount !== null
      ? callConfirmAssignedCount
      : (stageCounts[tab] ?? 0),
    isTerminal: tab === "done",  // "done" tab contains all terminal stages
  }));

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Provider Cold Outreach</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage provider outreach sequence and follow-up channels.{" "}
              <Link
                href="/admin/automations/provider-outreach-send"
                className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary-700 transition-colors hover:text-primary-800"
                title="Open the Provider Outreach messaging journey in Automations"
              >
                View messaging journey
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search input - only enabled when a state is selected */}
            {selectedState && (
              <div className="relative w-48">
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search providers..."
                  className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                {search && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setDebouncedSearch("");
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Export CSV button with optional city assignments button */}
            {selectedState && (
              <div className="flex items-center">
                <button
                  onClick={() => handleExport("providers")}
                  disabled={exporting || loadingProviders}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeTab === "call_confirm"
                      ? "rounded-l-lg border-r-0"
                      : "rounded-lg"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="whitespace-nowrap">{exporting ? "Exporting..." : "Export CSV"}</span>
                </button>
                {/* City assignments export - only show on Call & Confirm tab */}
                {activeTab === "call_confirm" && (
                  <button
                    onClick={() => handleExport("city_assignments")}
                    disabled={exporting || loadingCities}
                    className="px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-r-lg hover:border-gray-300 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Export city assignments"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* State selector dropdown */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStateActionsMenu(null);
                  setShowStateSelector(!showStateSelector);
                }}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  selectedState
                    ? "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    : "bg-primary-600 border-primary-600 text-white hover:bg-primary-700"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                {selectedState ? (
                  <>
                    {(() => {
                      const currentState = activeStates.find(s => s.state_code === selectedState);
                      if (!currentState) return null;
                      if (currentState.status === "completed") {
                        return (
                          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        );
                      }
                      return (
                        <span className={`w-2 h-2 rounded-full ${currentState.status === "paused" ? "bg-amber-500" : "bg-green-500"}`} />
                      );
                    })()}
                    {US_STATES.find((s) => s.value === selectedState)?.label || selectedState}
                  </>
                ) : (
                  "Select State"
                )}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showStateSelector && (
                <div
                  className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-96 overflow-hidden flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  {activeStates.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                        Your States ({activeStates.length})
                      </div>
                      <div className="overflow-y-auto max-h-64">
                        {activeStates.map((state) => {
                          const isSelected = selectedState === state.state_code;
                          return (
                            <div key={state.state_code}>
                              <button
                                onClick={() => {
                                  setSelectedState(state.state_code);
                                  setShowStateSelector(false);
                                }}
                                className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${isSelected ? "bg-primary-50" : ""}`}
                              >
                                <div className="flex items-center gap-2">
                                  {isSelected && (
                                    <svg className="w-4 h-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                  {state.status === "completed" ? (
                                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    <span className={`w-2 h-2 rounded-full ${state.status === "paused" ? "bg-amber-500" : "bg-green-500"}`} />
                                  )}
                                  <span className={`text-sm font-medium ${isSelected ? "text-primary-700" : "text-gray-900"}`}>{state.state_name}</span>
                                  <span className="text-xs text-gray-400">({state.state_code})</span>
                                </div>
                                <span className="text-xs text-gray-400">{state.total_providers.toLocaleString()}</span>
                              </button>
                              {/* Assign Cities sub-button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignCitiesForState(state.state_code);
                                  setShowAssignCitiesModal(true);
                                  setShowStateSelector(false);
                                }}
                                className="w-full pl-9 pr-3 py-1.5 text-left text-xs text-gray-500 hover:text-primary-600 hover:bg-gray-50 flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Assign Cities
                                <svg className="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-gray-100" />
                    </>
                  )}
                  {loadingActiveStates && (
                    <div className="px-3 py-4 text-center text-gray-400">
                      <svg className="animate-spin h-5 w-5 mx-auto mb-1" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-xs">Loading...</span>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setShowStateSelector(false);
                      setShowAddStateModal(true);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm font-medium text-primary-600 hover:bg-primary-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add State
                  </button>
                </div>
              )}
            </div>

            {selectedState && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStateSelector(false);
                    setStateActionsMenu(stateActionsMenu === selectedState ? null : selectedState);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="State actions"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {stateActionsMenu === selectedState && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleRefreshStateStats(selectedState)} disabled={stateActionLoading === selectedState} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                      {stateActionLoading === selectedState ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      )}
                      Refresh Stats
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    {(() => {
                      const currentState = activeStates.find(s => s.state_code === selectedState);
                      if (!currentState) return null;
                      return (
                        <>
                          {currentState.status !== "active" && <button onClick={() => handleUpdateStateStatus(selectedState, "active")} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Mark Active</button>}
                          {currentState.status !== "paused" && <button onClick={() => handleUpdateStateStatus(selectedState, "paused")} className="w-full px-3 py-2 text-left text-sm text-amber-600 hover:bg-gray-50">Mark Paused</button>}
                          {currentState.status !== "completed" && <button onClick={() => handleUpdateStateStatus(selectedState, "completed")} className="w-full px-3 py-2 text-left text-sm text-emerald-600 hover:bg-gray-50">Mark Completed</button>}
                        </>
                      );
                    })()}
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={() => { const stateName = activeStates.find(s => s.state_code === selectedState)?.state_name || selectedState; handleDeleteState(selectedState, stateName); }} className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Remove State</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stat Boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3" title="Number of states you've added for outreach work">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active States</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{globalStats.totalStates}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">{globalStats.statesList || "No states added"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3" title="Total providers across all active states">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Providers</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{globalStats.totalProviders.toLocaleString()}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">across active states</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3" title="Providers who have claimed their profile (all states)">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Claimed</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{globalClaimedCount !== null ? globalClaimedCount.toLocaleString() : "—"}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">all states, all time</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3" title="Providers needing follow-up across all states">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Follow-Ups</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{globalFollowUpsToday.total}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {globalFollowUpsToday.by_admin.length > 0
                ? globalFollowUpsToday.by_admin.map(a => `${a.display_name}: ${a.count}`).join(" · ")
                : "none pending"}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3" title="Conversion rate: providers who claimed after going through the email sequence">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sequence Conv.</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {sequenceConversion
                ? `${sequenceConversion.claimed} / ${sequenceConversion.sequenced}`
                : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {sequenceConversion
                ? `${sequenceConversion.rate}% claimed from sequence`
                : "loading..."}
            </p>
          </div>
        </div>
      </div>

      {/* Stage Tabs - only show when a state is selected */}
      {selectedState && (
        <div className="flex items-center justify-between mb-6 border-b border-gray-100">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setActiveTab(tab.value);
                  // Reset channel filter when leaving Alternative Channels tab
                  if (tab.value !== "re_engage") {
                    setSelectedChannelFilter("all");
                  }
                }}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.value
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1.5 text-xs text-gray-400 tabular-nums">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Done Tab Sub-tabs - show when Done tab is active */}
      {selectedState && activeTab === "done" && (
        <div className="flex items-center gap-2 px-1 mb-4">
          {DONE_SUB_TABS.map((subTab) => {
            const count = stageCounts[subTab] ?? 0;
            const isActive = activeDoneSubTab === subTab;
            return (
              <button
                key={subTab}
                onClick={() => setActiveDoneSubTab(subTab)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                }`}
              >
                {DONE_SUB_TAB_LABELS[subTab]}
                {count > 0 && (
                  <span className={`ml-1.5 text-xs tabular-nums ${isActive ? "text-white/70" : "text-gray-400"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Admin Filter Chips - show on tabs where assignment applies */}
      {selectedState && ["call_confirm", "in_sequence", "needs_call", "re_engage"].includes(activeTab) && (
        <AdminFilterChips
          adminCounts={adminCounts}
          totalCount={
            activeTab === "call_confirm" ? stageCounts.call_confirm :
            activeTab === "in_sequence" ? stageCounts.in_sequence :
            activeTab === "needs_call" ? stageCounts.needs_call :
            activeTab === "re_engage" ? stageCounts.re_engage :
            activeTab === "call_exhausted" ? stageCounts.call_exhausted :
            0
          }
          selectedAdminId={selectedAdminFilter}
          onSelect={(adminId) => setSelectedAdminFilter(adminId)}
          tabKey={activeTab}
        />
      )}

      {/* Analytics Sections - Horizontal Row of Toggles */}
      {selectedState && (
        <div className="mb-6">
          {/* Horizontal row of toggle buttons */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Outreach Funnel toggle */}
            <button
              type="button"
              onClick={() => setStatsExpanded(!statsExpanded)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                statsExpanded ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 transform transition-transform ${statsExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Outreach Funnel</span>
            </button>

            <span className="text-gray-300">|</span>

            {/* Email Performance toggle */}
            <button
              type="button"
              onClick={() => setEmailStatsExpanded(!emailStatsExpanded)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                emailStatsExpanded ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 transform transition-transform ${emailStatsExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Email Performance</span>
              {claimsDashboard && (
                <span className="text-xs text-gray-400">
                  ({claimsDashboard.totals.claimed} claims)
                </span>
              )}
            </button>

            <span className="text-gray-300">|</span>

            {/* Sequence Conversion toggle */}
            <button
              type="button"
              onClick={() => setConversionExpanded(!conversionExpanded)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                conversionExpanded ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 transform transition-transform ${conversionExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Sequence Conv.</span>
              {conversionStats && conversionStats.totals.in_sequence > 0 && (
                <span className="text-xs text-gray-400">
                  ({conversionStats.totals.rate}%)
                </span>
              )}
            </button>

            <span className="text-gray-300">|</span>

            {/* Email Source toggle (Apollo vs Org) */}
            <button
              type="button"
              onClick={() => setEmailSourceExpanded(!emailSourceExpanded)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                emailSourceExpanded ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 transform transition-transform ${emailSourceExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Email Source</span>
              {conversionStats?.by_email_source && (
                <span className="text-xs text-gray-400">
                  (Apollo {conversionStats.by_email_source.decision_maker.rate}%)
                </span>
              )}
            </button>
          </div>

          {/* Outreach Funnel expanded content */}
          {statsExpanded && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FunnelStat
                  label="In Sequence"
                  value={stageCounts.in_sequence}
                  subtitle="actively receiving emails"
                />
                <FunnelStat
                  label="Follow Up"
                  value={stageCounts.needs_call}
                  subtitle="sequence complete"
                />
                <FunnelStat
                  label="Claimed"
                  value={conversionStats?.totals.claimed ?? 0}
                  highlight
                  subtitle="from sequence"
                />
                <FunnelStat
                  label="Claim Rate"
                  value={conversionStats?.totals.rate ?? 0}
                  format="percent"
                  subtitle="of providers who entered sequence"
                />
              </div>
            </div>
          )}

          {/* Email Performance expanded content */}
          {emailStatsExpanded && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-6">
            {/* Claims Dashboard */}
            {claimsDashboardLoading ? (
              <div className="text-sm text-gray-500">Loading claims data...</div>
            ) : claimsDashboardError ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-red-600">Failed to load claims data</span>
                <button
                  type="button"
                  onClick={() => {
                    setClaimsDashboard(null);
                    setClaimsDashboardError(false);
                  }}
                  className="text-teal-700 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : claimsDashboard ? (
              <div className="space-y-6">
                {/* Email engagement line (aggregate from SmartLead) */}
                {claimsDashboard.engagement && (
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Email Engagement:</span>{" "}
                    <span>{claimsDashboard.engagement.opened.toLocaleString()} of {claimsDashboard.engagement.contacted.toLocaleString()} opened</span>
                    <span className="text-gray-400"> ({claimsDashboard.engagement.open_rate}%)</span>
                    <span className="mx-2 text-gray-300">·</span>
                    <span>{claimsDashboard.engagement.clicked.toLocaleString()} clicked</span>
                    <span className="text-gray-400"> ({claimsDashboard.engagement.click_rate}%)</span>
                  </div>
                )}

                {/* 4-stat grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-semibold text-gray-900">
                      {claimsDashboard.totals.sequenced.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Sequenced</div>
                    <div className="text-xs text-gray-400">entered seq</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-semibold text-emerald-600">
                      {claimsDashboard.totals.claimed.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Claimed</div>
                    <div className="text-xs text-gray-400">from sequence</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-semibold text-gray-900">
                      {claimsDashboard.totals.conversion_rate}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Conversion</div>
                    <div className="text-xs text-gray-400">seq→claimed</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-semibold text-gray-900">
                      {claimsDashboard.totals.avg_time_to_claim_days !== null
                        ? `${claimsDashboard.totals.avg_time_to_claim_days} days`
                        : "—"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Avg Time to Claim</div>
                    <div className="text-xs text-gray-400">first email</div>
                  </div>
                </div>

                {/* When Providers Claim breakdown */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">When Providers Claim</div>
                  <div className="grid grid-cols-5 gap-2">
                    {claimsDashboard.sequence_day_breakdown.map((bucket) => (
                      <div key={bucket.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">{bucket.label}</div>
                        <div className="text-lg font-semibold text-gray-900">{bucket.count}</div>
                        <div className="text-xs text-gray-400">{bucket.percentage}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No claims data available</div>
            )}

            {/* Template Preview */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-gray-700">Preview template:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "intro", label: "Day 0" },
                    { key: "followup", label: "Day 3" },
                    { key: "demand_loss", label: "Day 5" },
                    { key: "final", label: "Day 7" },
                    { key: "nudge", label: "Nudge" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setPreviewTemplate(previewTemplate === t.key ? null : t.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        previewTemplate === t.key
                          ? "bg-gray-900 text-white"
                          : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {previewTemplate && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  {previewLoading ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Loading preview...</div>
                  ) : previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      title="Email preview"
                      className="w-full h-[480px] bg-white"
                      sandbox=""
                    />
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Could not load preview</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

          {/* Sequence Conversion expanded content */}
          {conversionExpanded && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              {conversionLoading ? (
                <div className="text-sm text-gray-500">Loading conversion stats...</div>
              ) : conversionError ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-red-600">Failed to load conversion stats</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConversionStats(null);
                      setConversionError(false);
                    }}
                    className="text-teal-700 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : conversionStats && conversionStats.cities.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 pr-4 font-medium text-gray-600">City</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">Sequenced</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">Claimed</th>
                        <th className="text-right py-2 pl-3 font-medium text-gray-600">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversionStats.cities.map((c) => (
                        <tr key={c.city} className="border-b border-gray-100">
                          <td className="py-2 pr-4 text-gray-900">{c.city}</td>
                          <td className="py-2 px-3 text-right text-gray-700 tabular-nums">{c.in_sequence}</td>
                          <td className="py-2 px-3 text-right text-emerald-600 font-medium tabular-nums">{c.claimed}</td>
                          <td className="py-2 pl-3 text-right text-gray-700 tabular-nums">{c.rate}%</td>
                        </tr>
                      ))}
                      <tr className="font-medium bg-gray-50">
                        <td className="py-2 pr-4 text-gray-900">Total</td>
                        <td className="py-2 px-3 text-right text-gray-900 tabular-nums">{conversionStats.totals.in_sequence}</td>
                        <td className="py-2 px-3 text-right text-emerald-700 tabular-nums">{conversionStats.totals.claimed}</td>
                        <td className="py-2 pl-3 text-right text-gray-900 tabular-nums">{conversionStats.totals.rate}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No sequence data yet. Start a sequence to see conversion stats.</div>
              )}
            </div>
          )}

          {/* Email Source expanded content (Apollo vs Org comparison) */}
          {emailSourceExpanded && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              {conversionLoading ? (
                <div className="text-sm text-gray-500">Loading email source data...</div>
              ) : conversionError ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-red-600">Failed to load data</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConversionStats(null);
                      setConversionError(false);
                    }}
                    className="text-teal-700 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : conversionStats?.by_email_source ? (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-gray-700">Which email type converts better?</div>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Organization Email Stats */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Organization Emails</div>
                          <div className="text-xs text-gray-500">info@, contact@, etc.</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Sequenced</span>
                          <span className="font-medium text-gray-900 tabular-nums">{conversionStats.by_email_source.organization.in_sequence}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Claimed</span>
                          <span className="font-medium text-emerald-600 tabular-nums">{conversionStats.by_email_source.organization.claimed}</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-gray-100 pt-2 mt-2">
                          <span className="text-gray-700 font-medium">Conversion</span>
                          <span className="font-semibold text-gray-900 tabular-nums text-lg">{conversionStats.by_email_source.organization.rate}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Decision-Maker (Apollo) Email Stats */}
                    <div className="bg-white border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Apollo Decision-Makers</div>
                          <div className="text-xs text-gray-500">Personal emails, addressed by name</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Sequenced</span>
                          <span className="font-medium text-gray-900 tabular-nums">{conversionStats.by_email_source.decision_maker.in_sequence}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Claimed</span>
                          <span className="font-medium text-emerald-600 tabular-nums">{conversionStats.by_email_source.decision_maker.claimed}</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-gray-100 pt-2 mt-2">
                          <span className="text-gray-700 font-medium">Conversion</span>
                          <span className="font-semibold text-purple-700 tabular-nums text-lg">{conversionStats.by_email_source.decision_maker.rate}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insight line */}
                  {conversionStats.by_email_source.organization.in_sequence > 0 && conversionStats.by_email_source.decision_maker.in_sequence > 0 && (
                    <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg p-3">
                      {conversionStats.by_email_source.decision_maker.rate > conversionStats.by_email_source.organization.rate ? (
                        <span>
                          <span className="font-medium text-purple-700">Apollo decision-makers convert {conversionStats.by_email_source.decision_maker.rate - conversionStats.by_email_source.organization.rate}% better</span>
                          {" "}than organization emails. Personalized outreach pays off.
                        </span>
                      ) : conversionStats.by_email_source.organization.rate > conversionStats.by_email_source.decision_maker.rate ? (
                        <span>
                          <span className="font-medium text-blue-700">Organization emails convert {conversionStats.by_email_source.organization.rate - conversionStats.by_email_source.decision_maker.rate}% better</span>
                          {" "}than Apollo decision-makers.
                        </span>
                      ) : (
                        <span>Both email types have the same conversion rate.</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No email source data yet. Start sequences to compare org vs Apollo performance.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Bar (when items selected) - hidden during search since providers may be from different stages */}
      {selectedProviders.size > 0 && !isSearchResult && (
        <div className="mb-4 p-3 bg-primary-50 rounded-lg border border-primary-200 flex items-center justify-between">
          <span className="text-sm font-medium text-primary-900">
            {selectedProviders.size} provider{selectedProviders.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            {getAvailableActions().map((action) => {
              // For actions requiring email, only count/enable for providers with email
              const eligibleCount = action.requiresEmail ? selectedWithEmailCount : selectedProviders.size;
              const isDisabled = actionLoading || eligibleCount === 0;

              // Build label with count for email-required actions
              let label = action.label;
              if (action.requiresEmail && selectedWithEmailCount !== selectedProviders.size) {
                // Show count when not all selected have email
                label = selectedWithEmailCount > 0
                  ? `Move ${selectedWithEmailCount} to In Sequence`
                  : "Move to In Sequence";
              }

              return (
                <button
                  key={action.stage}
                  onClick={() => {
                    if (action.requiresEmail) {
                      // Show confirmation modal for starting sequence
                      setSequenceConfirmProviders(selectedProvidersWithEmail);
                      setShowSequenceConfirm(true);
                      setShowSequencePreview(true); // Auto-expand preview accordion
                      // Pre-populate assignee from city owner
                      const firstProvider = selectedProvidersWithEmail[0];
                      if (firstProvider?.city) {
                        const cityOwner = cityOwners.get(firstProvider.city);
                        if (cityOwner?.owner_id) {
                          setSequenceAssigneeId(cityOwner.owner_id);
                          setSequenceAssigneeName(cityOwner.owner_name);
                        }
                      }
                      // Fetch preview data for the modal
                      fetchSequencePreview(selectedProvidersWithEmail.map(p => p.provider_id));
                    } else {
                      updateStage(action.stage);
                    }
                  }}
                  disabled={isDisabled}
                  title={action.requiresEmail && eligibleCount === 0 ? "No selected providers have email" : undefined}
                  className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.color}`}
                >
                  {label}
                </button>
              );
            })}
            <button
              onClick={() => setSelectedProviders(new Set())}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Search mode info - show when providers selected during search */}
      {selectedProviders.size > 0 && isSearchResult && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {selectedProviders.size} provider{selectedProviders.size === 1 ? "" : "s"} selected
            </span>
            <span className="text-xs text-gray-400">— Use the action menu (•••) on each row to move providers</span>
          </div>
          <button
            onClick={() => setSelectedProviders(new Set())}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Content - Search results (flat list) or City-grouped view */}
      <div className="bg-white rounded-xl border border-gray-200">
        {!selectedState ? (
          // No state selected - prompt user to select a state from the header
          <div className="p-12 text-center">
            <div className="text-gray-400 mb-3">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a state to begin</h3>
            <p className="text-sm text-gray-500">
              Use the state selector above to choose which state to work on
            </p>
          </div>
        ) : isSearchResult ? (
          // Search results: flat list with stage badges
          <>
            {loadingProviders ? (
              <div className="p-8 text-center">
                <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              </div>
            ) : providers.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-500">No providers found matching &quot;{debouncedSearch}&quot;</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {providers.map((provider) => (
                  <div key={provider.provider_id} className="group px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedProviders.has(provider.provider_id)}
                        onChange={() => toggleProvider(provider.provider_id)}
                        className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                      />

                      {/* Main content area */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Provider name (full width) + Stage badge + hover actions */}
                        <div className="flex items-center justify-between gap-4 mb-0.5">
                          <Link
                            href={provider.slug ? `/admin/directory/${provider.slug}` : "#"}
                            className="font-medium text-gray-900 hover:text-primary-600 transition-colors text-sm"
                          >
                            {provider.provider_name}
                          </Link>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Stage badge with sequence status */}
                            <div className="flex flex-col items-end">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                                provider.stage === "claimed" ? "bg-emerald-100 text-emerald-700" :
                                provider.stage === "in_sequence" ? (
                                  provider.sequence_status?.failed_step !== undefined
                                    ? "bg-red-100 text-red-700"
                                    : "bg-blue-100 text-blue-700"
                                ) :
                                provider.stage === "needs_call" ? "bg-amber-100 text-amber-700" :
                                provider.stage === "re_engage" ? "bg-blue-100 text-blue-700" :
                                provider.stage === "archived" ? "bg-gray-100 text-gray-600" :
                                "bg-gray-100 text-gray-600"
                              }`}>
                                {STAGE_LABELS[provider.stage]}
                                {provider.stage === "in_sequence" && typeof provider.emails_sent === "number" && (
                                  <span className={`ml-1 ${provider.sequence_status?.failed_step !== undefined ? "text-red-600" : "text-blue-500"}`}>
                                    ({provider.emails_sent}/4)
                                  </span>
                                )}
                              </span>
                              {/* Sequence sublabel (recency or failure) */}
                              {provider.stage === "in_sequence" && (() => {
                                const sublabel = getSequenceSublabel(provider);
                                return (
                                  <span className={`text-[10px] mt-0.5 ${sublabel.isFailed ? "text-red-500 font-medium" : "text-gray-400"}`}>
                                    {sublabel.text}
                                  </span>
                                );
                              })()}
                            </div>
                            {/* Hover actions */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Notes button - filled when provider has notes */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNotesModalProvider({
                                    id: provider.provider_id,
                                    name: provider.provider_name,
                                  });
                                }}
                                className={`p-1 ${provider.notes ? "text-gray-700" : "text-gray-300 hover:text-amber-500"}`}
                                title="Notes"
                              >
                                <svg className="w-4 h-4" fill={provider.notes ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              {!["claimed"].includes(provider.stage) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActionModalProvider(provider);
                                  }}
                                  className="p-1 text-gray-300 hover:text-gray-600"
                                  title="Actions"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                                  </svg>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingRemoval({
                                    providerId: provider.provider_id,
                                    providerName: provider.provider_name,
                                    stage: provider.stage,
                                  });
                                }}
                                className="p-1 text-gray-300 hover:text-red-500"
                                title="Remove from outreach"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Row 2: Category, location, email */}
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5">
                          {provider.provider_category && (
                            <span className="truncate max-w-[200px]">{provider.provider_category}</span>
                          )}
                          {provider.provider_category && provider.city && <span>·</span>}
                          {provider.city && <span>{provider.city}{provider.state ? `, ${provider.state}` : ""}</span>}
                          {(provider.provider_category || provider.city) && provider.email && <span>·</span>}
                          {provider.email && (
                            <>
                              <span>{provider.email}</span>
                              <EmailHistoryPopover providerId={provider.provider_id} currentEmail={provider.email} />
                            </>
                          )}
                          {/* Questions and leads context pills */}
                          {(provider.provider_category || provider.city || provider.email) && <span>·</span>}
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                            {provider.questions_count ?? 0} Q
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                            {provider.leads_count ?? 0} Leads
                          </span>
                        </div>

                        {/* Row 3: Assignment */}
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>Assigned:</span>
                          <AdminChip
                            adminId={provider.assigned_to}
                            adminName={provider.assigned_to ? adminNameLookup.get(provider.assigned_to) || null : null}
                            size="sm"
                            showUnassigned={true}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Search results summary */}
            {!loadingProviders && providers.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
                Found {providers.length} provider{providers.length === 1 ? "" : "s"} matching &quot;{debouncedSearch}&quot;
              </div>
            )}
          </>
        ) : activeTab === "needs_call" ? (
          // Follow Up tab: due-date grouped queue view
          <FollowUpQueue
            providers={providers}
            loading={loadingProviders}
            onOpenDrawer={setDrawerProvider}
          />
        ) : activeTab === "re_engage" ? (
          // Alternative Channels tab: cycle-aware queue view with channel filter
          <>
            {/* Channel filter chips */}
            <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
              <span className="text-xs text-gray-500 mr-1">Channel:</span>
              {(["all", "email", "fax", "contact_form", "direct_mail"] as const).map((channel) => {
                const count = channel === "all"
                  ? providers.length
                  : providers.filter((p) =>
                      channel === "email"
                        ? !p.re_engage_channel || p.re_engage_channel === "re_engage"
                        : p.re_engage_channel === channel
                    ).length;
                const label = channel === "all" ? "All" :
                  channel === "email" ? "Email" :
                  channel === "fax" ? "Fax" :
                  channel === "contact_form" ? "Contact Form" : "Direct Mail";
                const isSelected = selectedChannelFilter === channel;
                return (
                  <button
                    key={channel}
                    onClick={() => setSelectedChannelFilter(channel)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      isSelected
                        ? "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
            <ReEngageQueue
              providers={
                selectedChannelFilter === "all"
                  ? providers
                  : selectedChannelFilter === "email"
                    ? providers.filter((p) => !p.re_engage_channel || p.re_engage_channel === "re_engage")
                    : providers.filter((p) => p.re_engage_channel === selectedChannelFilter)
              }
              loading={loadingProviders}
              onOpenDrawer={setDrawerProvider}
              selectedProviders={selectedProviders}
              onToggleProvider={(providerId) => {
                setSelectedProviders((prev) => {
                  const next = new Set(prev);
                  if (next.has(providerId)) {
                    next.delete(providerId);
                  } else {
                    next.add(providerId);
                  }
                  return next;
                });
              }}
              onSelectAll={(providerIds) => {
                setSelectedProviders((prev) => {
                  const next = new Set(prev);
                  // If providerIds is empty, deselect all re_engage providers
                  if (providerIds.length === 0) {
                    providers.filter((p) => p.stage === "re_engage").forEach((p) => next.delete(p.provider_id));
                  } else {
                    providerIds.forEach((id) => next.add(id));
                  }
                  return next;
                });
              }}
            />
          </>
        ) : activeTab === "call_exhausted" ? (
          // Call tab: providers needing manual resolution
          <>
            {/* Call Script */}
            <details className="mx-5 mt-2 mb-4" open>
              <summary className="py-2 text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none">
                Call Script
              </summary>
              <div className="pl-4 pt-2 pb-3 text-sm text-gray-600 space-y-3 border-l-2 border-orange-200 ml-1 bg-orange-50 rounded-r-lg">
                <p className="font-medium text-orange-800">
                  These providers have been through all outreach channels without claiming. Call them directly:
                </p>
                <p>
                  &quot;Hi, this is <span className="font-medium text-gray-800">[Your Name]</span> from Olera, following up on the referral service listing we sent over.&quot;
                </p>
                <p>
                  &quot;I wanted to make sure you received our emails. Can I verify your email address and resend the activation link while we&apos;re on the phone?&quot;
                </p>
              </div>
            </details>
            <CallQueue
              providers={providers}
              loading={loadingProviders}
              onOpenDrawer={setDrawerProvider}
            />
          </>
        ) : (
          // Normal city-grouped view
          <>
            {/* Call Script - show on Call & Confirm tab */}
            {activeTab === "call_confirm" && (
              <details className="mx-5 mt-2 mb-4">
                <summary className="py-2 text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none">
                  Call Script
                </summary>
                <div className="pl-4 pt-2 pb-3 text-sm text-gray-600 space-y-3 border-l-2 border-gray-200 ml-1">
                  <p>
                    &quot;Hi, this is <span className="font-medium text-gray-800">[Your Name]</span> from Olera, calling on behalf of Dr. Logan DuBose&apos;s office.&quot;
                  </p>
                  <p>
                    &quot;I hope I reached the right person. Olera runs a free family referral service for <span className="font-medium text-gray-800">[care type]</span> here in <span className="font-medium text-gray-800">[city]</span>.&quot;
                  </p>
                  <p>
                    &quot;I&apos;m getting ready to send over your activation link so you can manage your listing and receive direct referrals. I have <span className="font-medium text-gray-800">[email on file]</span> listed for you—is that still the best address?&quot;
                  </p>
                </div>
              </details>
            )}

            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div className="w-5" />
              <div className="flex-1">City</div>
              <div className="w-48 text-right">Providers</div>
            </div>

            {(() => {
              // Always compute city stats from the provider list.
              // The cities API counts ALL unclaimed providers (includes hidden, ignores assignment),
              // but we need counts that match what's actually displayed (filtered by assignment, excludes hidden).
              const filteredProviders = providers;
              const allCities = computeCityStatsFromProviders(filteredProviders);

              // Filter to only show cities with an owner assigned - BUT only for the Call & Confirm tab
              // Other tabs (in_sequence, needs_call, re_engage, done) should show all cities with providers
              // regardless of assignment status, since those providers are already being worked on
              const displayCities = isNotContactedTab(activeTab)
                ? allCities.filter(city => cityOwners.has(city.city) && cityOwners.get(city.city)?.owner_id)
                : allCities;

              const isLoading = loadingProviders;

              if (isLoading) {
                return (
                  <div className="p-8 text-center">
                    <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                  </div>
                );
              }

              if (displayCities.length === 0) {
                // Show empty state - with "Assign Cities" prompt only on Call & Confirm tab
                const hasUnassignedCities = allCities.length > 0 && isNotContactedTab(activeTab);
                return (
                  <div className="p-12 text-center">
                    {hasUnassignedCities ? (
                      <>
                        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <p className="text-gray-600 font-medium mb-1">No cities assigned yet</p>
                        <p className="text-gray-400 text-sm mb-4">
                          Assign cities to team members to start working on providers
                        </p>
                        <button
                          onClick={() => {
                            setAssignCitiesForState(selectedState);
                            setShowAssignCitiesModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Assign Cities
                        </button>
                      </>
                    ) : (
                      <p className="text-gray-500">
                        {isNotContactedTab(activeTab)
                          ? `No providers to call in ${selectedState}`
                          : `No providers in ${UI_TAB_LABELS[activeTab]}`}
                      </p>
                    )}
                  </div>
                );
              }

              return (
                <div>
                  {displayCities.map((city) => (
                    <CityRow
                      key={city.city}
                      city={city}
                      activeTab={activeTab}
                      activeDoneSubTab={activeDoneSubTab}
                      isExpanded={expandedCities.has(city.city)}
                      onToggle={() => toggleCity(city.city)}
                      providers={filteredProviders}
                      loadingProviders={loadingProviders}
                      selectedProviders={selectedProviders}
                      onToggleProvider={toggleProvider}
                      onSelectAllInCity={selectAllInCity}
                      onEmailSaved={(providerId, newEmail, emailSource) => {
                        // Update local providers state with new email
                        // Reset confirmed_at since contact info changed (API also resets it)
                        // Also update email_source if provided (for Apollo confirmation)
                        setProviders((prev) =>
                          prev.map((p) =>
                            p.provider_id === providerId
                              ? {
                                  ...p,
                                  email: newEmail,
                                  confirmed_at: null,
                                  confirmed_by: null,
                                  ...(emailSource && { email_source: emailSource }),
                                }
                              : p
                          )
                        );
                        // Refresh cities to update counts
                        if (isNotContactedTab(activeTab)) {
                          fetchCities();
                        }
                      }}
                      onPhoneSaved={(providerId, newPhone) => {
                        // Update local providers state with new phone
                        // Also reset confirmed_at since contact info changed (API also resets it)
                        setProviders((prev) =>
                          prev.map((p) =>
                            p.provider_id === providerId ? { ...p, phone: newPhone, confirmed_at: null, confirmed_by: null } : p
                          )
                        );
                      }}
                      onApolloContactFound={(providerId, apolloContact) => {
                        // Save apollo_contact for review
                        // Backend auto-confirms (sets email_source, updates email) when provider has no email
                        // Otherwise user must click "Confirm" to use the decision-maker email
                        setProviders((prev) =>
                          prev.map((p) =>
                            p.provider_id === providerId
                              ? {
                                  ...p,
                                  apollo_contact: apolloContact,
                                }
                              : p
                          )
                        );
                        // Refresh cities to update counts
                        if (isNotContactedTab(activeTab)) {
                          fetchCities();
                        }
                      }}
                      onEmailSourceChanged={(providerId, emailSource) => {
                        // Update email_source in local state (provider moves between Organization/Decision Maker sub-tabs)
                        setProviders((prev) =>
                          prev.map((p) =>
                            p.provider_id === providerId
                              ? { ...p, email_source: emailSource }
                              : p
                          )
                        );
                      }}
                      onOpenActionModal={setActionModalProvider}
                      onOpenDrawer={setDrawerProvider}
                      onRemoveProvider={(provider) => {
                        setPendingRemoval({
                          providerId: provider.provider_id,
                          providerName: provider.provider_name,
                          stage: provider.stage,
                        });
                      }}
                      onMoveToReady={(activeTab === "done" && activeDoneSubTab === "not_interested") ? async (providerId) => {
                        try {
                          const res = await fetch("/api/admin/provider-outreach/update-stage", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              provider_ids: [providerId],
                              stage: "not_contacted",
                            }),
                          });
                          if (res.ok) {
                            // Mark as recently moved to filter from stale API responses
                            markAsRecentlyMoved(providerId);
                            // Remove from current list and update counts
                            setProviders((prev) => prev.filter((p) => p.provider_id !== providerId));
                            setStageCounts((prev) => ({
                              ...prev,
                              not_interested: Math.max(0, prev.not_interested - 1),
                              done: Math.max(0, prev.done - 1),
                              call_confirm: prev.call_confirm + 1,
                            }));
                            showToast("Moved to Call & Confirm", "success");
                          } else {
                            const err = await res.json();
                            showToast(err.error || "Failed to move provider", "error");
                          }
                        } catch {
                          showToast("Network error", "error");
                        }
                      } : undefined}
                      onResetToReadyWithApollo={activeTab === "in_sequence" ? async (providerId) => {
                        // Find provider to get Apollo contact
                        const provider = providers.find(p => p.provider_id === providerId);
                        const apolloContact = provider?.apollo_contact;
                        if (!apolloContact?.email) {
                          showToast("No Apollo email found", "error");
                          return false;
                        }
                        try {
                          const res = await fetch("/api/admin/provider-outreach/reset-to-ready", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              provider_id: providerId,
                              email_source: "decision_maker",
                              use_apollo_email: true,
                            }),
                          });
                          if (res.ok) {
                            // Mark as recently moved to filter from stale API responses
                            markAsRecentlyMoved(providerId);
                            // Remove from In Sequence list
                            setProviders((prev) => prev.filter((p) => p.provider_id !== providerId));
                            // Update stage counts
                            setStageCounts((prev) => ({
                              ...prev,
                              in_sequence: Math.max(0, prev.in_sequence - 1),
                              call_confirm: prev.call_confirm + 1,
                            }));
                            showToast("Reset to Call & Confirm with Apollo email", "success");
                            return true;
                          } else {
                            const err = await res.json();
                            showToast(err.error || "Failed to reset provider", "error");
                            return false;
                          }
                        } catch {
                          showToast("Network error", "error");
                          return false;
                        }
                      } : undefined}
                      cityOwnerId={cityOwners.get(city.city)?.owner_id || null}
                      cityOwnerName={cityOwners.get(city.city)?.owner_name || null}
                      isEditingAssignment={editingCityAssignment === city.city}
                      onStartEditAssignment={() => setEditingCityAssignment(city.city)}
                      onAssignCity={(ownerId, ownerName) => assignCity(city.city, ownerId, ownerName)}
                      onCancelEditAssignment={() => setEditingCityAssignment(null)}
                      adminNameLookup={adminNameLookup}
                    />
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Summary */}
      {isNotContactedTab(activeTab) && !loadingProviders && !isSearchResult && (() => {
        // Use admin counts sum for "All Assigned" view to match tab and filter chip counts
        const totalAssigned = Object.entries(adminCounts)
          .filter(([key]) => key !== "unassigned")
          .reduce((sum, [, countData]) => sum + (countData as { count: number }).count, 0);
        const assignedCityCount = computeCityStatsFromProviders(
          providers.filter(p => p.assigned_to && p.assigned_to !== "unassigned")
        ).length;

        // Don't render empty div when no content
        if (!selectedAdminFilter && totalAssigned === 0) return null;

        return (
          <div className="mt-4 text-sm text-gray-500">
            {selectedAdminFilter ? (
              <>
                {providers.length.toLocaleString()} providers assigned to {
                  selectedAdminFilter === "unassigned"
                    ? "no one"
                    : (adminNameLookup.get(selectedAdminFilter) || selectedAdminFilter)
                } across {computeCityStatsFromProviders(providers).length} cities
              </>
            ) : (
              <>
                {totalAssigned.toLocaleString()} providers assigned across {assignedCityCount} cities
              </>
            )}
          </div>
        );
      })()}

      {/* Provider Action Modal */}
      {actionModalProvider && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={closeActionModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Provider Actions</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {actionModalProvider.provider_name}
              </p>
            </div>

            {/* Step 1: Select Action */}
            {!selectedAction && !pendingStageMove && (
              <div className="p-4 space-y-2">
                {/* Unarchive - only show if provider is currently archived */}
                {actionModalProvider.stage === "archived" && (
                  <button
                    onClick={async () => {
                      setSelectedAction("unhide");
                      // Fetch unarchive preview
                      setUnarchivePreview({ archived_questions_count: 0, connections_affected_count: 0, loading: true });
                      try {
                        const res = await fetch(`/api/admin/provider-outreach/unarchive-preview?provider_id=${actionModalProvider.provider_id}`);
                        if (res.ok) {
                          const data = await res.json();
                          setUnarchivePreview({
                            archived_questions_count: data.archived_questions_count || 0,
                            connections_affected_count: data.connections_affected_count || 0,
                            loading: false,
                          });
                        } else {
                          setUnarchivePreview(null);
                        }
                      } catch {
                        setUnarchivePreview(null);
                      }
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-emerald-500 mt-0.5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">Unarchive</p>
                        <p className="text-xs text-gray-500">Restore to Not Contacted for outreach</p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Retry sequence - only show for in_sequence providers with failed tasks */}
                {actionModalProvider.stage === "in_sequence" && actionModalProvider.sequence_status?.failed_step !== undefined && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/admin/provider-outreach/retry-sequence", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ provider_id: actionModalProvider.provider_id }),
                        });
                        if (res.ok) {
                          closeActionModal();
                          fetchProviders();
                        } else {
                          const data = await res.json();
                          alert(data.error || "Failed to retry sequence");
                        }
                      } catch {
                        alert("Failed to retry sequence");
                      }
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-blue-500 mt-0.5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">Retry sequence</p>
                        <p className="text-xs text-gray-500">Reset failed tasks and continue sending</p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Archive - only show if NOT already archived and not viewing hidden sub-tab */}
                {actionModalProvider.stage !== "archived" && !(activeTab === "done" && activeDoneSubTab === "hidden") && (
                  <button
                    onClick={() => setSelectedAction("archived")}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-amber-500 mt-0.5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">Archive</p>
                        <p className="text-xs text-gray-500">Stop all outreach to this provider</p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Unhide - only show when viewing Hidden sub-tab */}
                {activeTab === "done" && activeDoneSubTab === "hidden" && (
                  <button
                    onClick={() => {
                      setPendingUnhide({
                        providerId: actionModalProvider.provider_id,
                        providerName: actionModalProvider.provider_name,
                      });
                      closeActionModal();
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-emerald-500 mt-0.5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">Unhide</p>
                        <p className="text-xs text-gray-500">Restore to Ready for re-launch</p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Remove Assignment - only show if provider is assigned */}
                {actionModalProvider.assigned_to && (
                  <button
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        const res = await fetch("/api/admin/provider-outreach/update-assignment", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            provider_id: actionModalProvider.provider_id,
                            assigned_to: null,
                          }),
                        });
                        if (res.ok) {
                          closeActionModal();
                          fetchProviders();
                        }
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    disabled={actionLoading}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-gray-500 mt-0.5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">Remove Assignment</p>
                        <p className="text-xs text-gray-500">Unassign this provider so anyone can pick it up</p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Send Claim Link - available for all active stages with email */}
                {/* Sends instant Nudge email via Resend (not SmartLead sequence) */}
                {/* Only blocked for claimed/archived (API enforces this too) */}
                {!["claimed", "archived"].includes(actionModalProvider.stage) && actionModalProvider.email && (
                  <button
                    onClick={() => setPendingClaimLink(true)}
                    disabled={sendingClaimLink || claimLinkSent}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors disabled:opacity-50 ${
                      claimLinkSent
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-gray-200 hover:border-primary-300 hover:bg-primary-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={claimLinkSent ? "text-emerald-500 mt-0.5" : "text-primary-500 mt-0.5"}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">
                          {sendingClaimLink ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              Sending...
                            </span>
                          ) : claimLinkSent ? (
                            "Claim Link Sent"
                          ) : (
                            "Send Claim Link"
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {claimLinkSent
                            ? `Email sent to ${actionModalProvider.email}`
                            : `Send claim link email to ${actionModalProvider.email}`
                          }
                        </p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Send Claim Link Confirmation Modal */}
                {pendingClaimLink && (
                  <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Send Claim Link</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        This will send an activation email to <span className="font-medium">{actionModalProvider.email}</span> with their claim link.
                      </p>
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <p className="text-xs text-gray-500 mb-1">Provider</p>
                        <p className="text-sm font-medium text-gray-900">{actionModalProvider.provider_name}</p>
                        <p className="text-xs text-gray-500 mt-2 mb-1">Current Stage</p>
                        <p className="text-sm text-gray-700">
                          {actionModalProvider.stage === "not_contacted" ? "Not Contacted" :
                           actionModalProvider.stage === "in_sequence" ? "In Sequence" :
                           actionModalProvider.stage === "needs_call" ? "Follow Up" :
                           actionModalProvider.stage === "re_engage" ? "Alternative Channels" :
                           actionModalProvider.stage === "not_interested" ? "Not Interested" :
                           actionModalProvider.stage}
                        </p>
                        <p className="text-xs text-amber-600 mt-2">
                          Note: This will not change the provider&apos;s stage.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setPendingClaimLink(false)}
                          disabled={sendingClaimLink}
                          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            setSendingClaimLink(true);
                            try {
                              const res = await fetch("/api/admin/provider-outreach/send-claim-link", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ provider_id: actionModalProvider.provider_id }),
                              });
                              if (res.ok) {
                                setClaimLinkSent(true);
                                setPendingClaimLink(false);
                              } else {
                                const err = await res.json();
                                alert(err.error || "Failed to send claim link");
                              }
                            } catch {
                              alert("Failed to send claim link");
                            } finally {
                              setSendingClaimLink(false);
                            }
                          }}
                          disabled={sendingClaimLink}
                          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                          {sendingClaimLink ? (
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Sending...
                            </span>
                          ) : (
                            "Send Email"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Move to Stage Section - hide for claimed, archived, and when viewing hidden sub-tab */}
                {!["claimed", "archived"].includes(actionModalProvider.stage) && !(activeTab === "done" && activeDoneSubTab === "hidden") && (
                  <>
                    <div className="border-t border-gray-100 my-3" />
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1 mb-2">Move to Stage</p>
                    <div className="grid grid-cols-2 gap-2">
                      {actionModalProvider.stage !== "not_contacted" && (
                        <button
                          onClick={() => setPendingStageMove("not_contacted")}
                          disabled={actionLoading}
                          className="px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {actionModalProvider.stage === "in_sequence" ? "Reset to Ready" : "Ready"}
                        </button>
                      )}
                      {actionModalProvider.stage !== "needs_call" && (
                        <button
                          onClick={() => setPendingStageMove("needs_call")}
                          disabled={actionLoading}
                          className="px-3 py-2 text-sm text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                        >
                          Follow Up
                        </button>
                      )}
                      {actionModalProvider.stage !== "not_interested" && (
                        <button
                          onClick={() => setPendingStageMove("not_interested")}
                          disabled={actionLoading}
                          className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          Not Interested
                        </button>
                      )}
                    </div>
                  </>
                )}

              </div>
            )}

            {/* Stage Move Confirmation Modal */}
            {pendingStageMove && actionModalProvider && (
              <div className="p-4 space-y-4">
                {/* Back button */}
                <button
                  onClick={() => {
                    setPendingStageMove(null);
                    setActionNotInterestedReason("");
                  }}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                {/* Confirmation content */}
                <div className={`p-3 rounded-lg border ${
                  pendingStageMove === "not_contacted" ? "bg-gray-50 border-gray-200" :
                  pendingStageMove === "needs_call" ? "bg-amber-50 border-amber-200" :
                  "bg-gray-50 border-gray-300"
                }`}>
                  <p className="text-sm font-medium text-gray-900">
                    {pendingStageMove === "not_contacted" && actionModalProvider.stage === "in_sequence"
                      ? "Reset to Ready"
                      : `Move to ${
                          pendingStageMove === "not_contacted" ? "Ready" :
                          pendingStageMove === "needs_call" ? "Follow Up" :
                          "Not Interested"
                        }`
                    }
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {actionModalProvider.provider_name}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">What will happen:</p>
                  <ul className="space-y-1.5">
                    {pendingStageMove === "not_contacted" && (
                      <>
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          Provider will be moved back to the Ready queue
                        </li>
                        {actionModalProvider.stage === "in_sequence" && (
                          <li className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-gray-400 mt-0.5">•</span>
                            Email sequence will be stopped in SmartLead
                          </li>
                        )}
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          Any scheduled outreach tasks will be cleared
                        </li>
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          You can start a fresh outreach sequence later
                        </li>
                      </>
                    )}
                    {pendingStageMove === "needs_call" && (
                      <>
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          Provider will appear in the Follow Up queue
                        </li>
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          Use outcome buttons to send emails or update status
                        </li>
                      </>
                    )}
                    {pendingStageMove === "not_interested" && (
                      <>
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          Provider will stop receiving outreach emails
                        </li>
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          Questions and connections can still flow to them
                        </li>
                        <li className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          Use Archive instead for a full system-wide block
                        </li>
                      </>
                    )}
                  </ul>
                </div>

                {/* Reason dropdown for not_interested */}
                {pendingStageMove === "not_interested" && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={actionNotInterestedReason}
                      onChange={(e) => setActionNotInterestedReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                    >
                      <option value="">Select a reason...</option>
                      {NOT_INTERESTED_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Notes field */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                    Notes {pendingStageMove === "not_interested" && actionNotInterestedReason === "other" ? <span className="text-red-500">*</span> : "(optional)"}
                  </label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder={pendingStageMove === "not_interested" && actionNotInterestedReason === "other" ? "Please explain..." : "Add context or reason..."}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Confirm/Cancel buttons */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setPendingStageMove(null);
                      setActionNotes("");
                      setActionNotInterestedReason("");
                    }}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        const res = await fetch("/api/admin/provider-outreach/update-stage", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            provider_ids: [actionModalProvider.provider_id],
                            stage: pendingStageMove,
                            notes: actionNotes.trim() || undefined,
                            // Include reason for not_interested
                            ...(pendingStageMove === "not_interested" && actionNotInterestedReason && {
                              not_interested_reason: actionNotInterestedReason,
                            }),
                          }),
                        });
                        if (res.ok) {
                          const stageLabel = pendingStageMove === "not_contacted" ? "Ready" :
                            pendingStageMove === "in_sequence" ? "In Sequence" :
                            pendingStageMove === "needs_call" ? "Follow Up" :
                            pendingStageMove === "not_interested" ? "Not Interested" :
                            "Alternative Channels";
                          showToast(`Moved to ${stageLabel}`, "success");
                          // Mark as recently moved to filter from stale API responses
                          markAsRecentlyMoved(actionModalProvider.provider_id);
                          // Optimistically remove from current tab to prevent duplicate appearance
                          setProviders((prev) => prev.filter((p) => p.provider_id !== actionModalProvider.provider_id));
                          // Optimistically update stage counts
                          const oldStage = actionModalProvider.stage;
                          setStageCounts((prev) => {
                            const updates: Partial<typeof prev> = {};
                            // Decrement old stage count
                            if (oldStage === "not_contacted") {
                              // not_contacted is the call_confirm tab
                              updates.call_confirm = Math.max(0, prev.call_confirm - 1);
                            } else if (oldStage && oldStage in prev) {
                              updates[oldStage as keyof typeof prev] = Math.max(0, (prev[oldStage as keyof typeof prev] || 0) - 1);
                            }
                            // Increment new stage count
                            if (pendingStageMove === "not_contacted") {
                              // Moving to not_contacted increments call_confirm
                              updates.call_confirm = (updates.call_confirm ?? prev.call_confirm) + 1;
                            } else if (pendingStageMove && pendingStageMove in prev) {
                              updates[pendingStageMove as keyof typeof prev] = (prev[pendingStageMove as keyof typeof prev] || 0) + 1;
                            }
                            return { ...prev, ...updates };
                          });
                          closeActionModal();
                          fetchProviders();
                          if (isNotContactedTab(activeTab)) fetchCities();
                        } else {
                          const err = await res.json().catch(() => ({}));
                          showToast(err.error || "Failed to move provider", "error");
                        }
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    disabled={
                      actionLoading ||
                      (pendingStageMove === "not_interested" && !actionNotInterestedReason) ||
                      (pendingStageMove === "not_interested" && actionNotInterestedReason === "other" && !actionNotes.trim())
                    }
                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      pendingStageMove === "not_contacted" ? "bg-gray-600 hover:bg-gray-700" :
                      pendingStageMove === "in_sequence" ? "bg-blue-600 hover:bg-blue-700" :
                      pendingStageMove === "needs_call" ? "bg-amber-600 hover:bg-amber-700" :
                      pendingStageMove === "not_interested" ? "bg-gray-800 hover:bg-gray-900" :
                      "bg-purple-600 hover:bg-purple-700"
                    }`}
                  >
                    {actionLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Moving...
                      </span>
                    ) : (
                      `Yes, move to ${
                        pendingStageMove === "not_contacted" ? "Ready" :
                        pendingStageMove === "in_sequence" ? "In Sequence" :
                        pendingStageMove === "needs_call" ? "Follow Up" :
                        pendingStageMove === "not_interested" ? "Not Interested" :
                        "Alternative Channels"
                      }`
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Confirm with Reason */}
            {selectedAction && (
              <div className="p-4 space-y-4">
                {/* Back button */}
                <button
                  onClick={() => {
                    // If we're in the preview step (unarchive not yet confirmed), go back to action selection
                    // If we're in the reason step (preview confirmed), go back to preview step
                    if (selectedAction === "unhide" && unarchivePreviewConfirmed) {
                      setUnarchivePreviewConfirmed(false);
                      setActionReason("");
                      setActionNotes("");
                    } else {
                      setSelectedAction(null);
                      setActionReason("");
                      setActionNotes("");
                      setUnarchivePreview(null);
                      setUnarchivePreviewConfirmed(false);
                    }
                  }}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  {selectedAction === "unhide" && unarchivePreviewConfirmed ? "Back to Preview" : "Back"}
                </button>

                {/* Unarchive Preview Step - show impact before reason selection */}
                {selectedAction === "unhide" && !unarchivePreviewConfirmed && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-sm font-medium text-gray-900">Unarchive Provider</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        This will restore the provider to active outreach across all systems.
                      </p>
                    </div>

                    {/* Loading state */}
                    {unarchivePreview?.loading && (
                      <div className="flex items-center justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                        <span className="ml-2 text-sm text-gray-500">Loading impact preview...</span>
                      </div>
                    )}

                    {/* Fallback when API fetch failed */}
                    {!unarchivePreview && (
                      <div className="space-y-3">
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm text-yellow-800">
                            Unable to load impact preview. You can still proceed with unarchiving.
                          </p>
                        </div>
                        <button
                          onClick={() => setUnarchivePreviewConfirmed(true)}
                          className="w-full px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          Continue to Reason Selection
                        </button>
                      </div>
                    )}

                    {/* Impact preview */}
                    {unarchivePreview && !unarchivePreview.loading && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-700">Cross-system impact:</p>

                        {/* Questions impact */}
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <span className="text-blue-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                            </svg>
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              Questions eligibility restored
                            </p>
                            <p className="text-xs text-gray-500">
                              Provider will be eligible to receive new questions
                            </p>
                          </div>
                        </div>

                        {/* Connections impact */}
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <span className="text-purple-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                            </svg>
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {unarchivePreview.connections_affected_count > 0
                                ? `${unarchivePreview.connections_affected_count} connection${unarchivePreview.connections_affected_count === 1 ? "" : "s"} will resume followups`
                                : "No connections with paused followups"}
                            </p>
                            <p className="text-xs text-gray-500">
                              {unarchivePreview.connections_affected_count > 0
                                ? "Followup email sequences will be re-enabled"
                                : "No followup sequences to resume"}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setUnarchivePreviewConfirmed(true)}
                          className="w-full mt-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          Continue to Reason Selection
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Standard confirmation flow - show for non-unarchive actions OR after unarchive preview is confirmed */}
                {(selectedAction !== "unhide" || unarchivePreviewConfirmed) && (
                  <>
                    {/* Action description */}
                    <div className={`p-3 rounded-lg ${
                      selectedAction === "archived" ? "bg-amber-50 border border-amber-200" :
                      selectedAction === "unhide" ? "bg-emerald-50 border border-emerald-200" :
                      "bg-gray-50 border border-gray-200"
                    }`}>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedAction === "archived" ? "Archive Provider" :
                         selectedAction === "unhide" ? "Unarchive Provider" :
                         "Unknown Action"}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {selectedAction === "archived" ? "Provider will be archived and removed from active outreach. This also stops emails from Questions and Connections." :
                         selectedAction === "unhide" ? "Provider will be restored to Not Contacted and will receive outreach again. This also restores Questions and Connections emails." :
                         ""}
                      </p>
                    </div>

                    {/* Reason dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Reason
                      </label>
                      <select
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      >
                        <option value="">Select a reason...</option>
                        {(selectedAction === "archived" ? ARCHIVE_REASONS : UNARCHIVE_REASONS).map((reason) => (
                          <option key={reason.value} value={reason.value}>{reason.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Notes textarea */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Notes <span className="text-gray-400 font-normal">{actionReason === "other" ? "(required)" : "(optional)"}</span>
                      </label>
                      <textarea
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="Add any additional context..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={closeActionModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              {/* Show Confirm button only when not in unarchive preview step */}
              {selectedAction && !(selectedAction === "unhide" && !unarchivePreviewConfirmed) && (
                <button
                  onClick={async () => {
                    if (!actionReason) return;
                    if (actionReason === "other" && !actionNotes.trim()) return;
                    // Map "unhide" to "not_contacted" stage
                    const stageToSet = selectedAction === "unhide" ? "not_contacted" : selectedAction;
                    // Detect if this is an unarchive scenario (moving from archived to not_contacted)
                    const isUnarchiving = selectedAction === "unhide";
                    await handleQuickAction(
                      actionModalProvider.provider_id,
                      stageToSet,
                      actionReason,
                      actionNotes.trim() || null,
                      isUnarchiving || selectedAction === "archived"
                    );
                    closeActionModal();
                  }}
                  disabled={
                    actionLoading ||
                    !actionReason ||
                    (actionReason === "other" && !actionNotes.trim())
                  }
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedAction === "archived" ? "bg-amber-600 hover:bg-amber-700" :
                    selectedAction === "unhide" ? "bg-emerald-600 hover:bg-emerald-700" :
                    "bg-gray-600 hover:bg-gray-700"
                  }`}
                >
                  {actionLoading ? "..." : "Confirm"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sequence Confirmation Modal */}
      {showSequenceConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={actionLoading ? undefined : () => {
            setShowSequenceConfirm(false);
            setSequencePreviewData(null);
            setPreviewProviderId(null);
            setPreviewDay(0);
            setSequenceAssigneeId(null);
            setSequenceAssigneeName(null);
            setShowAssigneeAutocomplete(false);
            setUseApolloEmail(true); // Reset to default
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Start Email Sequence</h3>
              <p className="text-sm text-gray-500 mt-1">
                {sequenceConfirmProviders.length} provider{sequenceConfirmProviders.length === 1 ? "" : "s"} will receive the outreach sequence
              </p>
            </div>

            {/* Content */}
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {/* Summary */}
              {sequencePreviewData && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-900">{sequencePreviewData.summary.valid}</span> ready to send
                    </span>
                    {sequencePreviewData.summary.invalid > 0 && (
                      <span className="text-amber-600">
                        <span className="font-medium">{sequencePreviewData.summary.invalid}</span> missing email
                      </span>
                    )}
                    {sequencePreviewData.sender && (
                      <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                        sequencePreviewData.sender.engine === "smartlead"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        via {sequencePreviewData.sender.engine === "smartlead" ? "SmartLead" : "Resend"}
                      </span>
                    )}
                  </div>
                  {sequenceConfirmProviders.length > 100 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Preview shows first 100 of {sequenceConfirmProviders.length} providers. All will be processed in batches when launched.
                    </p>
                  )}
                </div>
              )}

              {/* Assigned To */}
              <div className="mb-5">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Assigned To
                </h4>
                <div className="flex items-center gap-2">
                  {showAssigneeAutocomplete ? (
                    <div className="flex-1">
                      <AdminAutocomplete
                        selectedAdminId={sequenceAssigneeId}
                        selectedAdminName={sequenceAssigneeName}
                        onSelect={(id, name) => {
                          setSequenceAssigneeId(id);
                          setSequenceAssigneeName(name);
                          setShowAssigneeAutocomplete(false);
                        }}
                        onClose={() => setShowAssigneeAutocomplete(false)}
                        placeholder="Search admins..."
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAssigneeAutocomplete(true)}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <AdminChip
                        adminId={sequenceAssigneeId}
                        adminName={sequenceAssigneeName}
                        size="sm"
                      />
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Apollo Email Preference - only show if any providers have Apollo contacts */}
              {sequenceConfirmProviders.some((p) => p.apollo_contact?.email) && (
                <div className="mb-5">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Email Preference
                  </h4>
                  <label className="flex items-center gap-3 px-3 py-2.5 bg-purple-50 border border-purple-100 rounded-lg cursor-pointer hover:bg-purple-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={useApolloEmail}
                      onChange={(e) => setUseApolloEmail(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-purple-900">
                        Use decision-maker emails
                      </span>
                      <p className="text-xs text-purple-600 mt-0.5">
                        {sequenceConfirmProviders.filter((p) => p.apollo_contact?.email).length} provider(s) have Apollo contacts
                      </p>
                    </div>
                    <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      Apollo
                    </span>
                  </label>
                </div>
              )}

              {/* Provider list */}
              <div className="mb-5">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Providers
                </h4>
                <div className="bg-gray-50 rounded-lg border border-gray-100 divide-y divide-gray-100 max-h-32 overflow-y-auto">
                  {sequencePreviewLoading ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">Loading preview...</div>
                  ) : sequencePreviewData ? (
                    sequencePreviewData.providers.map((p) => (
                      <div key={p.provider_id} className="px-3 py-2 flex items-center justify-between">
                        <span className={`text-sm truncate ${p.valid ? "text-gray-900" : "text-gray-400"}`}>
                          {p.provider_name}
                        </span>
                        <div className="flex items-center gap-2 ml-2">
                          {p.valid ? (
                            <span className="text-xs text-gray-500 truncate">{p.email}</span>
                          ) : (
                            <span className="text-xs text-amber-600">{p.errors[0]}</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    sequenceConfirmProviders.map((p) => (
                      <div key={p.provider_id} className="px-3 py-2 flex items-center justify-between">
                        <span className="text-sm text-gray-900 truncate">{p.provider_name}</span>
                        <span className="text-xs text-gray-500 truncate ml-2">{p.email}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Email Preview Accordion */}
              <div>
                <button
                  onClick={() => setShowSequencePreview((s) => !s)}
                  className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100 border border-gray-100"
                >
                  <span className="text-sm font-medium text-gray-700">Preview Email Sequence</span>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${showSequencePreview ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showSequencePreview && (
                  <div className="mt-3 space-y-4">
                    {sequencePreviewLoading ? (
                      <div className="rounded-lg bg-gray-50 p-4 border border-gray-100 text-center text-sm text-gray-500">
                        Loading email previews...
                      </div>
                    ) : sequencePreviewError ? (
                      <div className="rounded-lg bg-red-50 p-4 border border-red-200 text-center text-sm text-red-600">
                        <p className="font-medium">Failed to load email preview</p>
                        <p className="mt-1 text-xs text-red-500">{sequencePreviewError}</p>
                      </div>
                    ) : sequencePreviewData?.cadence ? (
                      <>
                        {/* Provider selector for batch preview */}
                        {sequencePreviewData.providers.filter(p => p.valid).length > 1 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Preview for:</span>
                            <select
                              value={previewProviderId || ""}
                              onChange={(e) => setPreviewProviderId(e.target.value)}
                              className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
                            >
                              {sequencePreviewData.providers.filter(p => p.valid).map((p) => (
                                <option key={p.provider_id} value={p.provider_id}>
                                  {p.provider_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Day selector tabs */}
                        <div className="flex gap-2 border-b border-gray-200">
                          {sequencePreviewData.cadence.map((step) => (
                            <button
                              key={step.day}
                              onClick={() => setPreviewDay(step.day)}
                              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                                previewDay === step.day
                                  ? "border-primary-600 text-primary-600"
                                  : "border-transparent text-gray-500 hover:text-gray-700"
                              }`}
                            >
                              Day {step.day}
                            </button>
                          ))}
                        </div>

                        {/* Email preview */}
                        {(() => {
                          const selectedProvider = sequencePreviewData.providers.find(
                            p => p.provider_id === previewProviderId && p.valid
                          ) || sequencePreviewData.providers.find(p => p.valid);
                          const selectedEmail = selectedProvider?.emails.find(e => e.day === previewDay);
                          const stepInfo = sequencePreviewData.cadence.find(c => c.day === previewDay);

                          // Get SmartLead preview HTML if available
                          const smartleadStepIndex = sequencePreviewData.cadence.findIndex(c => c.day === previewDay);
                          const smartleadStep = selectedProvider?.smartlead_preview?.steps[smartleadStepIndex];
                          const hasSmartleadPreview = !!smartleadStep?.body_html_preview;

                          // Determine which HTML to show
                          const showSmartleadHtml = previewEngine === "smartlead" && hasSmartleadPreview;
                          const previewHtmlToShow = showSmartleadHtml
                            ? smartleadStep?.body_html_preview
                            : selectedEmail?.html;

                          if (!selectedEmail) return (
                            <div className="rounded-lg bg-gray-50 p-4 border border-gray-100 text-center text-sm text-gray-500">
                              No email preview available
                            </div>
                          );

                          return (
                            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                              {/* Email header */}
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                                    {stepInfo?.description || `Day ${previewDay}`}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {previewDay === 0 ? "Sent immediately" : `Sent ${previewDay} days after start`}
                                  </span>
                                  {/* Preview engine toggle - only show when SmartLead preview is available */}
                                  {hasSmartleadPreview && (
                                    <div className="ml-auto flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5">
                                      <button
                                        onClick={() => setPreviewEngine("smartlead")}
                                        className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                                          previewEngine === "smartlead"
                                            ? "bg-blue-100 text-blue-700"
                                            : "text-gray-500 hover:text-gray-700"
                                        }`}
                                      >
                                        SmartLead
                                      </button>
                                      <button
                                        onClick={() => setPreviewEngine("resend")}
                                        className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                                          previewEngine === "resend"
                                            ? "bg-gray-200 text-gray-700"
                                            : "text-gray-500 hover:text-gray-700"
                                        }`}
                                      >
                                        Resend
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 space-y-0.5">
                                  <p><span className="font-medium text-gray-600">To:</span> {selectedProvider?.email}</p>
                                  <p><span className="font-medium text-gray-600">From:</span> {sequencePreviewData?.sender?.from ?? "Dr. Logan DuBose · Olera <noreply@oleracare.com>"}</p>
                                  <p>
                                    <span className="font-medium text-gray-600">Subject:</span>{" "}
                                    {showSmartleadHtml ? smartleadStep?.subject_preview : selectedEmail.subject}
                                  </p>
                                </div>
                              </div>
                              {/* Email body - rendered HTML in iframe to isolate from Tailwind CSS */}
                              <iframe
                                srcDoc={previewHtmlToShow}
                                title="Email preview"
                                className="w-full h-[300px] bg-white border-0"
                                sandbox=""
                              />
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      // Fallback for when preview data is not available
                      <>
                        <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded">Day 0</span>
                            <span className="text-xs text-gray-400">Immediate</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800">Introduction Email</p>
                          <p className="text-xs text-gray-500 mt-1">Explains value of claiming profile on Olera</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded">Day 3</span>
                            <span className="text-xs text-gray-400">+3 days</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800">Follow-up Email</p>
                          <p className="text-xs text-gray-500 mt-1">Profile gaps and value proposition</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded">Day 5</span>
                            <span className="text-xs text-gray-400">+5 days</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800">Why It&apos;s Free Email</p>
                          <p className="text-xs text-gray-500 mt-1">No fees, direct family connections</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 border border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded">Day 7</span>
                            <span className="text-xs text-gray-400">+7 days</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800">Get Verified Email</p>
                          <p className="text-xs text-gray-500 mt-1">Trust badge for families</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-gray-50">
              <button
                onClick={() => {
                  setShowSequenceConfirm(false);
                  setShowSequencePreview(false);
                  setSequencePreviewData(null);
                  setSequencePreviewError(null);
                  setPreviewProviderId(null);
                  setPreviewDay(0);
                  setSequenceAssigneeId(null);
                  setSequenceAssigneeName(null);
                  setShowAssigneeAutocomplete(false);
                  setUseApolloEmail(true); // Reset to default
                }}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Only include providers that have email (valid for sequence)
                  // Use ALL selected providers, not just the preview subset (which is limited to 100)
                  const validProviderIds = sequenceConfirmProviders
                    .filter(p => p.email)
                    .map(p => p.provider_id);

                  if (validProviderIds.length === 0) return;

                  setActionLoading(true);

                  // Split into batches of 100 to avoid API limit
                  const BATCH_SIZE = 100;
                  const batches: string[][] = [];
                  for (let i = 0; i < validProviderIds.length; i += BATCH_SIZE) {
                    batches.push(validProviderIds.slice(i, i + BATCH_SIZE));
                  }

                  let totalLaunched = 0;
                  let totalFailed = 0;

                  try {
                    for (let i = 0; i < batches.length; i++) {
                      const batch = batches[i];

                      // Show progress for multiple batches
                      if (batches.length > 1) {
                        showToast(`Processing batch ${i + 1} of ${batches.length}...`, "success");
                      }

                      const res = await fetch("/api/admin/provider-outreach/launch-sequence", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          provider_ids: batch,
                          dry_run: false,
                          assigned_to: sequenceAssigneeId,
                          use_apollo_email: useApolloEmail,
                        }),
                      });

                      if (res.ok) {
                        const data = await res.json();
                        totalLaunched += data.launched || 0;
                        totalFailed += data.failed || 0;
                      } else {
                        // Try to parse error, but handle non-JSON responses gracefully
                        try {
                          const err = await res.json();
                          console.error(`Batch ${i + 1} failed:`, err);
                        } catch {
                          console.error(`Batch ${i + 1} failed with status ${res.status}`);
                        }
                        totalFailed += batch.length;
                      }
                    }

                    // Show final result
                    if (totalFailed === 0) {
                      showToast(`Started sequence for ${totalLaunched} provider(s)`, "success");
                    } else {
                      showToast(`Started ${totalLaunched}, failed ${totalFailed}`, totalLaunched > 0 ? "success" : "error");
                    }

                    setSelectedProviders(new Set());
                    // Refresh data
                    if (isNotContactedTab(activeTab)) {
                      fetchCities();
                      fetchProviders();
                    } else {
                      fetchProviders();
                    }
                  } catch (err) {
                    console.error("Failed to start sequence:", err);
                    // Show partial success if any batches completed before the error
                    if (totalLaunched > 0) {
                      showToast(`Started ${totalLaunched} before error, ${totalFailed} failed`, "error");
                    } else {
                      showToast("Failed to start sequence", "error");
                    }
                  } finally {
                    setActionLoading(false);
                  }

                  setShowSequenceConfirm(false);
                  setShowSequencePreview(false);
                  setSequencePreviewData(null);
                  setSequencePreviewError(null);
                  setPreviewProviderId(null);
                  setPreviewDay(0);
                  setSequenceAssigneeId(null);
                  setSequenceAssigneeName(null);
                  setShowAssigneeAutocomplete(false);
                  setUseApolloEmail(true); // Reset to default
                }}
                disabled={actionLoading || sequencePreviewLoading || (sequencePreviewData?.summary.valid === 0)}
                className="px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Starting..." : sequencePreviewLoading ? "Loading..." : "Start Sequence"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add State Modal */}
      {showAddStateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => {
            setShowAddStateModal(false);
            setAddStateSearch("");
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Add State</h3>
              <p className="text-sm text-gray-500 mt-1">
                Select a state to start outreach work
              </p>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-gray-100 shrink-0">
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
                  value={addStateSearch}
                  onChange={(e) => setAddStateSearch(e.target.value)}
                  placeholder="Search states..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  autoFocus
                />
              </div>
            </div>

            {/* State List */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loadingStateCounts ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : (() => {
                const addedCodes = new Set(activeStates.map((s) => s.state_code));
                const availableStates = US_STATES.filter(
                  (s) =>
                    !addedCodes.has(s.value) &&
                    (s.label.toLowerCase().includes(addStateSearch.toLowerCase()) ||
                      s.value.toLowerCase().includes(addStateSearch.toLowerCase()))
                )
                  // Sort by provider count descending if we have counts, otherwise alphabetically
                  .sort((a, b) =>
                    stateCountsError
                      ? a.label.localeCompare(b.label)
                      : (stateCounts[b.value] || 0) - (stateCounts[a.value] || 0)
                  );

                if (availableStates.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      {addedCodes.size === US_STATES.length
                        ? "All states have been added"
                        : "No matching states found"}
                    </div>
                  );
                }

                return availableStates.map((usState) => {
                  const count = stateCounts[usState.value];
                  const hasCount = !stateCountsError && count !== undefined;
                  return (
                    <button
                      key={usState.value}
                      onClick={() => handleAddState(usState.value)}
                      disabled={addingState !== null}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-900">
                          {usState.label}
                        </span>
                        {hasCount && (
                          <span className="text-xs text-gray-400">
                            {count.toLocaleString()} provider{count !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {addingState === usState.value ? (
                        <svg className="animate-spin h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                    </button>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50">
              <button
                onClick={() => {
                  setShowAddStateModal(false);
                  setAddStateSearch("");
                }}
                className="w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Cities Modal */}
      {showAssignCitiesModal && assignCitiesForState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => {
            setShowAssignCitiesModal(false);
            setAssignCitiesSearch("");
            setAssignCitiesForState(null);
            setEditingCityAssignment(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                Assign Cities - {US_STATES.find(s => s.value === assignCitiesForState)?.label || assignCitiesForState}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Assign team members to manage provider outreach in each city
              </p>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-gray-100 shrink-0">
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
                  value={assignCitiesSearch}
                  onChange={(e) => setAssignCitiesSearch(e.target.value)}
                  placeholder="Search cities..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  autoFocus
                />
              </div>
            </div>

            {/* City List */}
            <div className="flex-1 overflow-y-auto">
              {loadingAllCities ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : (() => {
                const filteredCities = allCitiesForAssignment.filter(city =>
                  city.city.toLowerCase().includes(assignCitiesSearch.toLowerCase())
                );

                if (filteredCities.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      {assignCitiesSearch ? "No matching cities found" : "No cities available"}
                    </div>
                  );
                }

                return (
                  <div className="divide-y divide-gray-100">
                    {filteredCities.map((city) => {
                      const cityOwner = cityOwners.get(city.city);
                      const isEditing = editingCityAssignment === `modal-${city.city}`;
                      return (
                        <div key={city.city} className="px-6 py-3 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900">{city.city}</span>
                              <span className="ml-2 text-xs text-gray-400">
                                {city.total.toLocaleString()} provider{city.total !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-xs text-gray-500">Owner:</span>
                            {isEditing ? (
                              <div className="flex-1 max-w-xs" onClick={(e) => e.stopPropagation()}>
                                <AdminAutocomplete
                                  selectedAdminId={cityOwner?.owner_id || null}
                                  selectedAdminName={cityOwner?.owner_name || null}
                                  onSelect={(id, name) => {
                                    assignCity(city.city, id, name, assignCitiesForState);
                                    setEditingCityAssignment(null);
                                  }}
                                  onClose={() => setEditingCityAssignment(null)}
                                  placeholder="Select admin..."
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingCityAssignment(`modal-${city.city}`)}
                                className={`text-xs px-2 py-1 rounded ${
                                  cityOwner?.owner_id
                                    ? "text-gray-700 bg-gray-100 hover:bg-gray-200"
                                    : "text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500"
                                }`}
                              >
                                {cityOwner?.owner_name || "Unassigned"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50">
              <button
                onClick={() => {
                  setShowAssignCitiesModal(false);
                  setAssignCitiesSearch("");
                  setAssignCitiesForState(null);
                  setEditingCityAssignment(null);
                  // Refresh main view if we modified the currently selected state
                  if (assignCitiesForState === selectedState) {
                    fetchCities();
                    fetchProviders();
                  }
                }}
                className="w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete State Confirmation Modal */}
      {stateToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => !deletingState && setStateToDelete(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Remove {stateToDelete.name}?</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    This will remove the state from your active list. Provider data will not be deleted.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setStateToDelete(null)}
                disabled={deletingState}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteState}
                disabled={deletingState}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deletingState && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                Remove State
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove from outreach confirmation dialog */}
      {pendingRemoval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Remove from outreach</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to remove this provider from the outreach system?
            </p>
            <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> This only removes them from outreach tracking. Their provider profile and directory listing will remain unchanged.
              </p>
            </div>
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">{pendingRemoval.providerName}</p>
              <p className="mt-1 text-xs text-gray-500">
                Current stage: {STAGE_LABELS[pendingRemoval.stage as OutreachStage] || pendingRemoval.stage}
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setPendingRemoval(null)}
                disabled={removingProvider}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveFromOutreach}
                disabled={removingProvider}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {removingProvider ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unhide provider confirmation dialog */}
      {pendingUnhide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Unhide provider</h3>
            <p className="mt-2 text-sm text-gray-600">
              This provider will be restored to the Ready tab so they can be re-launched into a sequence.
            </p>
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">{pendingUnhide.providerName}</p>
              <p className="mt-1 text-xs text-gray-500">Will restore to: Ready</p>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setPendingUnhide(null)}
                disabled={unhidingProvider}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUnhideProvider}
                disabled={unhidingProvider}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {unhidingProvider ? "Restoring..." : "Unhide"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {notesModalProvider && (
        <NotesModal
          providerId={notesModalProvider.id}
          providerName={notesModalProvider.name}
          onClose={() => setNotesModalProvider(null)}
        />
      )}

      {/* Provider Detail Drawer */}
      {drawerProvider && (
        <ProviderDrawer
          provider={drawerProvider}
          onClose={() => setDrawerProvider(null)}
          activeTab={activeTab}
          onOutcomeRecorded={(providerId, stageChanged) => {
            if (stageChanged) {
              // Provider moved to a different stage - remove from current list
              markAsRecentlyMoved(providerId);
              const movedProvider = providers.find((p) => p.provider_id === providerId);
              setProviders((prev) => prev.filter((p) => p.provider_id !== providerId));
              // Update stage counts based on where the provider was
              if (movedProvider?.stage === "needs_call") {
                // Was in Follow Up - could move to re_engage (resend) or not_contacted (reset)
                // Only decrement source; don't increment destination as we can't distinguish
                // which action was taken. Counts self-correct on next data fetch.
                setStageCounts((prev) => ({
                  ...prev,
                  needs_call: Math.max(0, prev.needs_call - 1),
                }));
              } else if (movedProvider?.stage === "re_engage") {
                // Was in Alt Channels, moved to not_contacted (Ready)
                setStageCounts((prev) => ({
                  ...prev,
                  re_engage: Math.max(0, prev.re_engage - 1),
                  call_confirm: prev.call_confirm + 1,
                }));
              } else if (movedProvider?.stage === "call_exhausted") {
                // Was in Call tab, moved to not_contacted (Ready)
                setStageCounts((prev) => ({
                  ...prev,
                  call_exhausted: Math.max(0, prev.call_exhausted - 1),
                  call_confirm: prev.call_confirm + 1,
                }));
              }
            }
          }}
          onClaimLinkSent={(providerId, newResendCount) => {
            // Update resend_count in local state after claim link is sent
            setProviders((prev) =>
              prev.map((p) =>
                p.provider_id === providerId
                  ? { ...p, resend_count: newResendCount }
                  : p
              )
            );
            // Update drawer provider too
            setDrawerProvider((prev) =>
              prev && prev.provider_id === providerId
                ? { ...prev, resend_count: newResendCount }
                : prev
            );
          }}
          onContactFormSent={(providerId, newSendCount) => {
            // Update contact_form_send_count in local state after form is sent
            setProviders((prev) =>
              prev.map((p) =>
                p.provider_id === providerId
                  ? { ...p, contact_form_send_count: newSendCount }
                  : p
              )
            );
            // Update drawer provider too
            setDrawerProvider((prev) =>
              prev && prev.provider_id === providerId
                ? { ...prev, contact_form_send_count: newSendCount }
                : prev
            );
          }}
          onEmailUpdate={(providerId, email, emailSource) => {
            setProviders((prev) =>
              prev.map((p) =>
                p.provider_id === providerId
                  ? {
                      ...p,
                      email,
                      confirmed_at: null,
                      confirmed_by: null,
                      ...(emailSource && { email_source: emailSource }),
                    }
                  : p
              )
            );
            // Update drawer provider too
            setDrawerProvider((prev) =>
              prev && prev.provider_id === providerId
                ? { ...prev, email, ...(emailSource && { email_source: emailSource }) }
                : prev
            );
            if (isNotContactedTab(activeTab)) {
              fetchCities();
            }
          }}
          onPhoneUpdate={(providerId, phone) => {
            setProviders((prev) =>
              prev.map((p) =>
                p.provider_id === providerId
                  ? { ...p, phone, confirmed_at: null, confirmed_by: null }
                  : p
              )
            );
            // Update drawer provider too
            setDrawerProvider((prev) =>
              prev && prev.provider_id === providerId ? { ...prev, phone } : prev
            );
          }}
          onLaunchSequence={(providerId) => {
            // Look up provider from state and open sequence confirmation modal
            const provider = providers.find((p) => p.provider_id === providerId);
            if (provider) {
              setSequenceConfirmProviders([provider]);
              setShowSequenceConfirm(true);
              setDrawerProvider(null);
            }
          }}
          onMarkNotInterested={(providerId) => {
            const provider = providers.find((p) => p.provider_id === providerId);
            if (provider) {
              setActionModalProvider(provider);
              setPendingStageMove("not_interested"); // Skip to reason selection
              setDrawerProvider(null);
            }
          }}
          onArchive={(providerId) => {
            const provider = providers.find((p) => p.provider_id === providerId);
            if (provider) {
              setActionModalProvider(provider);
              setSelectedAction("archived"); // Skip to archive confirmation
              setDrawerProvider(null);
            }
          }}
          onRemove={(providerId, providerName) => {
            const provider = providers.find((p) => p.provider_id === providerId);
            setPendingRemoval({
              providerId,
              providerName,
              stage: provider?.stage || "not_contacted",
            });
            setDrawerProvider(null);
          }}
          onMoveToReady={async (providerId) => {
            const provider = providers.find((p) => p.provider_id === providerId);
            const fromStage = provider?.stage;
            try {
              const res = await fetch("/api/admin/provider-outreach/update-stage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider_ids: [providerId],
                  stage: "not_contacted",
                }),
              });
              if (res.ok) {
                markAsRecentlyMoved(providerId);
                setProviders((prev) => prev.filter((p) => p.provider_id !== providerId));
                // Update stage counts based on where provider came from
                setStageCounts((prev) => {
                  const updated = { ...prev, call_confirm: prev.call_confirm + 1 };
                  if (fromStage === "not_interested") {
                    updated.not_interested = Math.max(0, prev.not_interested - 1);
                    updated.done = Math.max(0, prev.done - 1);
                  } else if (fromStage === "needs_call") {
                    updated.needs_call = Math.max(0, prev.needs_call - 1);
                  } else if (fromStage === "re_engage") {
                    updated.re_engage = Math.max(0, prev.re_engage - 1);
                  } else if (fromStage === "call_exhausted") {
                    updated.call_exhausted = Math.max(0, prev.call_exhausted - 1);
                  }
                  return updated;
                });
                showToast("Moved to Call & Confirm", "success");
                setDrawerProvider(null);
              } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || "Failed to move", "error");
                throw new Error("API error"); // Signal failure to child
              }
            } catch (err) {
              if (!(err instanceof Error && err.message === "API error")) {
                showToast("Network error", "error");
              }
              throw err; // Re-throw so child knows it failed
            }
          }}
          onResetToReadyWithApollo={async (providerId) => {
            const provider = providers.find((p) => p.provider_id === providerId);
            const apolloContact = provider?.apollo_contact;
            if (!apolloContact?.email) {
              showToast("No Apollo email found", "error");
              return false;
            }
            try {
              const res = await fetch("/api/admin/provider-outreach/reset-to-ready", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider_id: providerId,
                  email_source: "decision_maker",
                  use_apollo_email: true,
                }),
              });
              if (res.ok) {
                markAsRecentlyMoved(providerId);
                setProviders((prev) => prev.filter((p) => p.provider_id !== providerId));
                setStageCounts((prev) => ({
                  ...prev,
                  in_sequence: Math.max(0, prev.in_sequence - 1),
                  call_confirm: prev.call_confirm + 1,
                }));
                showToast("Reset to Call & Confirm with Apollo email", "success");
                setDrawerProvider(null);
                return true;
              } else {
                const err = await res.json();
                showToast(err.error || "Failed to reset provider", "error");
                return false;
              }
            } catch {
              showToast("Network error", "error");
              return false;
            }
          }}
          onContactFound={(providerId, apolloContact) => {
            setProviders((prev) =>
              prev.map((p) =>
                p.provider_id === providerId
                  ? { ...p, apollo_contact: apolloContact }
                  : p
              )
            );
            // Update drawer provider too
            setDrawerProvider((prev) =>
              prev && prev.provider_id === providerId
                ? { ...prev, apollo_contact: apolloContact }
                : prev
            );
            if (isNotContactedTab(activeTab)) {
              fetchCities();
            }
          }}
        />
      )}
    </div>
  );
}

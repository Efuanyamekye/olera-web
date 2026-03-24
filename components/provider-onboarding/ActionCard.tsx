"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import type { Provider } from "@/lib/types/provider";
import Link from "next/link";

// ============================================================
// Types
// ============================================================

export type NotificationType = "lead" | "question" | "review";

interface FromProfile {
  display_name: string;
  city?: string | null;
  state?: string | null;
  image_url?: string | null;
}

export interface NotificationData {
  type: NotificationType;
  id: string;
  created_at: string;
  // Lead-specific
  message?: string | null;
  metadata?: {
    care_type?: string;
    auto_intro?: string;
  } | null;
  from_profile?: FromProfile | null;
  // Question-specific
  question?: string;
  asker_name?: string | null;
  // Review-specific
  rating?: number;
  comment?: string;
  reviewer_name?: string;
}

export type ActionCardState =
  | "verify-form"
  | "verify-code"
  | "pre-verified"
  | "no-access"
  | "no-access-success"
  | "already-claimed"
  | "dispute-submitted"
  // Notification states (from email links)
  | "notification-lead"
  | "notification-question"
  | "notification-review";

interface ActionCardProps {
  provider: Provider;
  claimSession: string;
  initialState?: ActionCardState;
  onVerificationComplete: () => void;
  /** Pre-verified email hint from token validation */
  preVerifiedEmail?: string;
  /** Whether to highlight the card (attention state) */
  highlighted?: boolean;
  /** Notification data when coming from email */
  notificationData?: NotificationData | null;
  /** Whether the user is currently signed in */
  isSignedIn?: boolean;
}

// ============================================================
// Constants
// ============================================================

const ROLE_OPTIONS = [
  { value: "Owner", label: "Owner" },
  { value: "Administrator", label: "Administrator" },
  { value: "Executive Director", label: "Executive Director" },
  { value: "Office Manager", label: "Office Manager" },
  { value: "Marketing / Communications", label: "Marketing / Communications" },
  { value: "Staff Member", label: "Staff Member" },
  { value: "Other", label: "Other" },
];

// Tooltip content for each state
const TOOLTIP_CONTENT: Record<ActionCardState, { text: string; showTos?: boolean }> = {
  "verify-form": {
    text: "We'll send a verification code to confirm you have access to this business email.",
    showTos: true,
  },
  "verify-code": {
    text: "Check your inbox (and spam folder) for the 6-digit code. Codes expire after 10 minutes.",
  },
  "pre-verified": {
    text: "Your email has been verified. Sign in to complete the claim process.",
    showTos: true,
  },
  "no-access": {
    text: "We'll review your information and reach out within 2–3 business days to verify your connection.",
    showTos: true,
  },
  "no-access-success": {
    text: "Our team will review your request and contact you at the email provided.",
  },
  "already-claimed": {
    text: "This listing is managed by someone else. Submit a dispute and we'll review within 2–3 business days.",
    showTos: true,
  },
  "dispute-submitted": {
    text: "Our team will review your dispute and contact you at the email provided.",
  },
  "notification-lead": {
    text: "A family is interested in your services. Verify your email to respond.",
    showTos: true,
  },
  "notification-question": {
    text: "Someone asked a question about your listing. Verify your email to answer.",
    showTos: true,
  },
  "notification-review": {
    text: "Someone left a review for your listing. Verify your email to respond.",
    showTos: true,
  },
};

// Care type labels
const CARE_TYPE_LABELS: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  independent_living: "Independent Living",
};

// Helper functions for notification display
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #5fa3a3, #7ab8b8)",
    "linear-gradient(135deg, #417272, #5fa3a3)",
    "linear-gradient(135deg, #4d8a8a, #7ab8b8)",
    "linear-gradient(135deg, #385e5e, #5fa3a3)",
    "linear-gradient(135deg, #5fa3a3, #96c8c8)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ============================================================
// Info Tooltip Component
// ============================================================

function InfoTooltip({
  content,
  showTos = false
}: {
  content: string;
  showTos?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <div className="relative inline-flex" ref={tooltipRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 -m-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        aria-label="More information"
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 sm:left-0 sm:right-auto top-full mt-2 z-[200] w-[calc(100vw-3rem)] max-w-72 p-3.5 bg-gray-900 text-white text-sm rounded-xl shadow-xl animate-fade-in"
          role="tooltip"
        >
          {/* Arrow */}
          <div className="absolute -top-1.5 right-3 sm:right-auto sm:left-4 w-3 h-3 bg-gray-900 rotate-45" />

          <p className="relative text-[13px] leading-relaxed text-gray-100">
            {content}
          </p>

          {showTos && (
            <p className="relative mt-2.5 pt-2.5 border-t border-gray-700 text-[11px] text-gray-400 leading-relaxed">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="text-primary-300 hover:text-primary-200 underline">Provider TOS</Link>
              {" & "}
              <Link href="/privacy" className="text-primary-300 hover:text-primary-200 underline">Privacy Notice</Link>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Role Dropdown Component (Custom Select)
// ============================================================

function RoleDropdown({
  value,
  onChange,
  placeholder = "Select your role...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const selectedOption = ROLE_OPTIONS.find((opt) => opt.value === value);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 pr-10 rounded-xl border bg-gray-50/50 text-[15px] text-left focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all min-h-[48px] cursor-pointer ${
          isOpen ? "border-primary-300 ring-2 ring-primary-300 bg-white" : "border-gray-200"
        } ${!value ? "text-gray-400" : "text-gray-900"}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedOption?.label || placeholder}
      </button>

      {/* Chevron icon */}
      <svg
        className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none transition-transform ${
          isOpen ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-[200] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden animate-fade-in max-h-[280px] overflow-y-auto"
          role="listbox"
        >
          {ROLE_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3.5 text-left text-[15px] transition-colors focus:outline-none focus-visible:bg-gray-100 ${
                value === option.value
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              } ${index === 0 ? "rounded-t-xl" : ""} ${index === ROLE_OPTIONS.length - 1 ? "rounded-b-xl" : ""}`}
              role="option"
              aria-selected={value === option.value}
            >
              <span className="flex items-center gap-2.5">
                {value === option.value ? (
                  <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span>{option.label}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared input classes matching dashboard design system
const inputClasses =
  "w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent focus:bg-white transition-all min-h-[48px]";
const labelClasses = "block text-[13px] font-semibold text-gray-700 mb-1.5";

// ============================================================
// Helper Functions
// ============================================================

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.com";
  const maskedLocal =
    local.length <= 2
      ? "*".repeat(local.length)
      : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

// ============================================================
// Main Component
// ============================================================

export default function ActionCard({
  provider,
  claimSession,
  initialState = "verify-form",
  onVerificationComplete,
  preVerifiedEmail,
  highlighted = false,
  notificationData,
  isSignedIn = false,
}: ActionCardProps) {
  // Current state
  const [state, setState] = useState<ActionCardState>(initialState);

  // Form state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Code verification state
  const [code, setCode] = useState("");
  const [emailHint, setEmailHint] = useState(preVerifiedEmail || "");
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // No-access form state
  const [noAccessName, setNoAccessName] = useState("");
  const [noAccessEmail, setNoAccessEmail] = useState("");
  const [noAccessPhone, setNoAccessPhone] = useState("");
  const [noAccessRole, setNoAccessRole] = useState("");
  const [noAccessNotes, setNoAccessNotes] = useState("");
  const [noAccessSubmitting, setNoAccessSubmitting] = useState(false);

  // Dispute form state
  const [disputeName, setDisputeName] = useState("");
  const [disputeEmail, setDisputeEmail] = useState("");
  const [disputePhone, setDisputePhone] = useState("");
  const [disputeRole, setDisputeRole] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  // Track if user clicked to show identity form (when no email on file)
  const [showIdentityForm, setShowIdentityForm] = useState(false);
  // Track if user clicked to show dispute form (when already claimed)
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  // Refs for auto-submit
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autoSubmitRef = useRef(false);

  // Sync initial state
  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((c) => Math.max(0, c - 1)),
      1000
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  // ────────────────────────────────────────────────────────────
  // Verify Form Handlers
  // ────────────────────────────────────────────────────────────

  const handleSubmitVerifyForm = async () => {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/claim/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.provider_id,
          claimSession,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 422) {
          // No email on file - go to manual request form
          setState("no-access");
        } else {
          setError(result.error || "Failed to send verification code.");
        }
        return;
      }

      setEmailHint(result.emailHint);
      setResendCooldown(60);
      setState("verify-code");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Code Verification Handlers
  // ────────────────────────────────────────────────────────────

  const handleVerifyCode = useCallback(async () => {
    if (code.length !== 6) return;

    setVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/claim/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.provider_id,
          code,
          claimSession,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.verified) {
        setError(result.error || "Incorrect code. Please try again.");
        setCode("");
        codeInputRefs.current[0]?.focus();
        return;
      }

      // Code verified!
      onVerificationComplete();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, [code, provider.provider_id, claimSession, onVerificationComplete]);

  // Auto-submit code when 6 digits entered
  useEffect(() => {
    if (code.length === 6 && !verifying && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      handleVerifyCode();
    }
    if (code.length < 6) {
      autoSubmitRef.current = false;
    }
  }, [code, verifying, handleVerifyCode]);

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setError("");
    setCode("");

    try {
      const res = await fetch("/api/claim/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.provider_id,
          claimSession,
        }),
      });

      if (res.ok) {
        setResendCooldown(60);
      } else {
        const result = await res.json();
        setError(result.error || "Failed to resend code.");
      }
    } catch {
      setError("Failed to resend code.");
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = code.split("");
    newCode[index] = value.slice(-1);
    const joined = newCode.join("").slice(0, 6);
    setCode(joined);

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    setCode(pasted);
    if (pasted.length === 6) {
      codeInputRefs.current[5]?.focus();
    } else {
      codeInputRefs.current[pasted.length]?.focus();
    }
  };

  // ────────────────────────────────────────────────────────────
  // No-Access Form Handlers
  // ────────────────────────────────────────────────────────────

  const handleNoAccessSubmit = async () => {
    if (!noAccessName.trim() || !noAccessRole || !noAccessEmail.trim() || !noAccessPhone.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setNoAccessSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/claim/no-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.provider_id,
          providerName: provider.provider_name,
          contactName: noAccessName,
          contactPhone: noAccessPhone,
          reason: noAccessNotes
            ? `${noAccessRole} — ${noAccessNotes}`
            : noAccessRole,
          alternativeEmail: noAccessEmail,
        }),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setError(result.error || "Failed to submit request.");
        return;
      }

      setState("no-access-success");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setNoAccessSubmitting(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Dispute Form Handlers
  // ────────────────────────────────────────────────────────────

  const handleDisputeSubmit = async () => {
    if (!disputeName.trim() || !disputeEmail.trim() || !disputePhone.trim() || !disputeRole || !disputeReason.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setDisputeSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.provider_id,
          provider_name: provider.provider_name,
          claimant_name: disputeName.trim(),
          claimant_email: disputeEmail.trim(),
          claimant_phone: disputePhone.trim(),
          claimant_role: disputeRole,
          reason: disputeReason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to submit dispute.");
        return;
      }

      setState("dispute-submitted");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Card Styling
  // ────────────────────────────────────────────────────────────

  const baseCardClass =
    "relative z-10 bg-white rounded-2xl border-2 shadow-sm p-6 md:p-8 transition-all duration-300";
  // Default: blue border to draw attention. Highlighted: orange/coral ring for urgent attention
  const cardClass = highlighted
    ? `${baseCardClass} border-orange-400 ring-4 ring-orange-200 shadow-lg shadow-orange-100/50 animate-pulse-subtle`
    : `${baseCardClass} border-primary-300 shadow-md shadow-primary-50`;

  // ════════════════════════════════════════════════════════════
  // RENDER: Notification States (Lead, Question, Review)
  // ════════════════════════════════════════════════════════════

  if (state === "notification-lead" && notificationData) {
    const personName = notificationData.from_profile?.display_name || "A family";
    const personImage = notificationData.from_profile?.image_url || null;
    const location = [notificationData.from_profile?.city, notificationData.from_profile?.state].filter(Boolean).join(", ");
    const careType = notificationData.metadata?.care_type;
    const message = notificationData.metadata?.auto_intro;
    const timeAgo = formatTimeAgo(notificationData.created_at);

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1">
            New lead
          </h3>
          <p className="text-sm text-gray-400 mb-4">{timeAgo}</p>

          {/* Person info */}
          <div className="flex items-center justify-center gap-3 mb-4">
            {personImage ? (
              <Image src={personImage} alt={personName} width={48} height={48} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: avatarGradient(personName) }}>
                {getInitials(personName)}
              </div>
            )}
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">{personName}</p>
              {location && <p className="text-sm text-gray-500">{location}</p>}
            </div>
          </div>

          {/* Care type badge */}
          {careType && (
            <div className="flex justify-center mb-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-50 text-primary-700">
                {CARE_TYPE_LABELS[careType] || careType}
              </span>
            </div>
          )}

          {/* Message preview */}
          {message && (
            <p className="text-[15px] text-gray-600 leading-relaxed mb-4 max-w-sm mx-auto">
              &ldquo;{message.length > 120 ? message.slice(0, 120) + "..." : message}&rdquo;
            </p>
          )}

          <div className="border-t border-gray-100 my-5" />

          {/* CTA based on auth state */}
          {isSignedIn ? (
            <Link
              href={`/provider/inbox?id=${notificationData.id}`}
              className="block w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] text-center"
            >
              View and respond
            </Link>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">Verify your email to respond to this lead</p>
              <button
                onClick={() => setState("verify-form")}
                className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px]"
              >
                Verify email to respond
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (state === "notification-question" && notificationData) {
    const personName = notificationData.asker_name || "Someone";
    const question = notificationData.question || "";
    const timeAgo = formatTimeAgo(notificationData.created_at);

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-amber-500/10 border border-amber-200/60">
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1">
            New question
          </h3>
          <p className="text-sm text-gray-400 mb-4">{timeAgo}</p>

          {/* Person info */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: avatarGradient(personName) }}>
              {getInitials(personName)}
            </div>
            <p className="text-base font-semibold text-gray-900">{personName}</p>
          </div>

          {/* Question preview */}
          <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 mb-4 max-w-sm mx-auto">
            <p className="text-[15px] text-gray-700 leading-relaxed">
              &ldquo;{question.length > 150 ? question.slice(0, 150) + "..." : question}&rdquo;
            </p>
          </div>

          <div className="border-t border-gray-100 my-5" />

          {/* CTA based on auth state */}
          {isSignedIn ? (
            <Link
              href={`/provider/qna?id=${notificationData.id}`}
              className="block w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 active:scale-[0.99] transition-all min-h-[48px] text-center"
            >
              Answer question
            </Link>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">Verify your email to answer this question</p>
              <button
                onClick={() => setState("verify-form")}
                className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 active:scale-[0.99] transition-all min-h-[48px]"
              >
                Verify email to respond
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (state === "notification-review" && notificationData) {
    const personName = notificationData.reviewer_name || "Someone";
    const rating = notificationData.rating || 5;
    const comment = notificationData.comment || "";
    const timeAgo = formatTimeAgo(notificationData.created_at);

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-violet-500/10 border border-violet-200/60">
            <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1">
            New review
          </h3>
          <p className="text-sm text-gray-400 mb-4">{timeAgo}</p>

          {/* Person info */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: avatarGradient(personName) }}>
              {getInitials(personName)}
            </div>
            <p className="text-base font-semibold text-gray-900">{personName}</p>
          </div>

          {/* Rating stars */}
          <div className="flex items-center justify-center gap-0.5 mb-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={`w-5 h-5 ${star <= rating ? "text-amber-400" : "text-gray-200"}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>

          {/* Comment preview */}
          {comment && (
            <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-4 mb-4 max-w-sm mx-auto">
              <p className="text-[15px] text-gray-700 leading-relaxed italic">
                &ldquo;{comment.length > 150 ? comment.slice(0, 150) + "..." : comment}&rdquo;
              </p>
            </div>
          )}

          <div className="border-t border-gray-100 my-5" />

          {/* CTA based on auth state */}
          {isSignedIn ? (
            <Link
              href={`/provider/reviews?id=${notificationData.id}`}
              className="block w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 active:scale-[0.99] transition-all min-h-[48px] text-center"
            >
              See review
            </Link>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">Verify your email to manage your reviews</p>
              <button
                onClick={() => setState("verify-form")}
                className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 active:scale-[0.99] transition-all min-h-[48px]"
              >
                Verify email to respond
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Pre-verified State (from email campaign token)
  // ════════════════════════════════════════════════════════════

  if (state === "pre-verified") {
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Email verified
            <InfoTooltip content={TOOLTIP_CONTENT["pre-verified"].text} showTos={TOOLTIP_CONTENT["pre-verified"].showTos} />
          </h3>
          <p className="text-[15px] text-gray-500">
            <span className="font-semibold text-gray-700">{emailHint || preVerifiedEmail}</span> is verified. Sign in to continue.
          </p>
        </div>

        <button
          onClick={onVerificationComplete}
          className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
        >
          Continue to sign in
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: No-Access Success State
  // ════════════════════════════════════════════════════════════

  if (state === "no-access-success") {
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Request submitted
            <InfoTooltip content={TOOLTIP_CONTENT["no-access-success"].text} />
          </h3>
          <p className="text-[15px] text-gray-500">
            We&apos;ll review and respond within 2–3 business days.
          </p>
        </div>

        <Link
          href={`/provider/${provider.slug || provider.provider_id}`}
          className="block w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 active:scale-[0.99] transition-all min-h-[48px] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
        >
          Return to listing
        </Link>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Dispute Submitted State
  // ════════════════════════════════════════════════════════════

  if (state === "dispute-submitted") {
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Dispute submitted
            <InfoTooltip content={TOOLTIP_CONTENT["dispute-submitted"].text} />
          </h3>
          <p className="text-[15px] text-gray-500">
            We&apos;ll review and respond within 2–3 business days.
          </p>
        </div>

        <Link
          href={`/provider/${provider.slug || provider.provider_id}`}
          className="block w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 active:scale-[0.99] transition-all min-h-[48px] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
        >
          Return to listing
        </Link>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: No-Access / No-Email States
  // ════════════════════════════════════════════════════════════

  // Check email availability
  const businessEmail = provider.email;
  const hasEmailOnFile = !!businessEmail;

  // Determine what to show:
  // 1. "no-access" state (user clicked "I don't have access") -> show identity form
  // 2. "verify-form" state with no email on file AND user clicked button -> show identity form
  // 3. "verify-form" state with no email on file but hasn't clicked -> show prompt card
  const showNoAccessForm = state === "no-access" || (state === "verify-form" && !hasEmailOnFile && showIdentityForm);
  const showNoEmailPrompt = state === "verify-form" && !hasEmailOnFile && !showIdentityForm;

  // ════════════════════════════════════════════════════════════
  // RENDER: No Email Prompt Card (intermediate step)
  // ════════════════════════════════════════════════════════════

  if (showNoEmailPrompt) {
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            We don&apos;t have your email
            <InfoTooltip content="We don't have an email on file for this listing. You'll need to verify your identity manually so we can confirm your connection." showTos />
          </h3>
          <p className="text-[15px] text-gray-500">
            Send us your business email so we can verify your connection to this listing.
          </p>
        </div>

        <button
          onClick={() => setShowIdentityForm(true)}
          className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 block"
        >
          Verify your identity
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: No-Access Form State (full identity form)
  // ════════════════════════════════════════════════════════════

  if (showNoAccessForm) {
    // Determine if we came from "no email" prompt or "I don't have access" link
    const cameFromNoEmailPrompt = !hasEmailOnFile && showIdentityForm;

    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Verify your identity
            <InfoTooltip content={TOOLTIP_CONTENT["no-access"].text} showTos={TOOLTIP_CONTENT["no-access"].showTos} />
          </h3>
          <p className="text-[15px] text-gray-500">
            Tell us about yourself and your role at this organization.
          </p>
        </div>

        <div className="space-y-4">
          {/* Full name - full width */}
          <div className="space-y-1.5">
            <label htmlFor="no-access-name" className={labelClasses}>
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="no-access-name"
              type="text"
              value={noAccessName}
              onChange={(e) => setNoAccessName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              className={inputClasses}
            />
          </div>

          {/* Email and Phone - 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label htmlFor="no-access-email" className={labelClasses}>
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="no-access-email"
                type="email"
                value={noAccessEmail}
                onChange={(e) => setNoAccessEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="no-access-phone" className={labelClasses}>
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                id="no-access-phone"
                type="tel"
                value={noAccessPhone}
                onChange={(e) => setNoAccessPhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="tel"
                className={inputClasses}
              />
            </div>
          </div>

          {/* Your role dropdown */}
          <div className="space-y-1.5">
            <label id="no-access-role-label" className={labelClasses}>
              Your role <span className="text-red-500">*</span>
            </label>
            <RoleDropdown
              value={noAccessRole}
              onChange={setNoAccessRole}
            />
          </div>

          {/* Additional notes - optional */}
          <div className="space-y-1.5">
            <label htmlFor="no-access-notes" className={labelClasses}>
              Additional notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="no-access-notes"
              value={noAccessNotes}
              onChange={(e) => setNoAccessNotes(e.target.value)}
              placeholder="Anything else we should know?"
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-red-700" role="alert">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-3">
            <button
              type="button"
              onClick={() => {
                if (cameFromNoEmailPrompt) {
                  // Go back to the prompt card
                  setShowIdentityForm(false);
                } else {
                  // Go back to verify-form (has email)
                  setState("verify-form");
                }
                setError("");
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <button
              onClick={handleNoAccessSubmit}
              disabled={!noAccessName.trim() || !noAccessRole || !noAccessEmail.trim() || !noAccessPhone.trim() || noAccessSubmitting}
              className="px-6 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
            >
              {noAccessSubmitting ? "Submitting..." : "Submit request"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Already Claimed State (Compact + Dispute Form)
  // ════════════════════════════════════════════════════════════

  if (state === "already-claimed") {
    // Compact view - just show info and "Dispute listing" button
    if (!showDisputeForm) {
      return (
        <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-amber-500/10 border border-amber-200/60">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
              This listing is claimed
              <InfoTooltip content={TOOLTIP_CONTENT["already-claimed"].text} showTos={TOOLTIP_CONTENT["already-claimed"].showTos} />
            </h3>
            <p className="text-[15px] text-gray-500">
              Someone else is managing this listing. If you believe this is an error, you can submit a dispute.
            </p>
          </div>

          <button
            onClick={() => setShowDisputeForm(true)}
            className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 active:scale-[0.99] transition-all min-h-[48px] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 block"
          >
            Dispute listing
          </button>
        </div>
      );
    }

    // Full dispute form
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-amber-500/10 border border-amber-200/60">
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Dispute this listing
            <InfoTooltip content={TOOLTIP_CONTENT["already-claimed"].text} showTos={TOOLTIP_CONTENT["already-claimed"].showTos} />
          </h3>
          <p className="text-[15px] text-gray-500">
            Tell us about yourself and why you should manage this listing.
          </p>
        </div>

        <div className="space-y-4">
          {/* Full name - full width */}
          <div className="space-y-1.5">
            <label htmlFor="dispute-name" className={labelClasses}>
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="dispute-name"
              type="text"
              value={disputeName}
              onChange={(e) => setDisputeName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              className={inputClasses}
            />
          </div>

          {/* Email and Phone - 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label htmlFor="dispute-email" className={labelClasses}>
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="dispute-email"
                type="email"
                value={disputeEmail}
                onChange={(e) => setDisputeEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dispute-phone" className={labelClasses}>
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                id="dispute-phone"
                type="tel"
                value={disputePhone}
                onChange={(e) => setDisputePhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="tel"
                className={inputClasses}
              />
            </div>
          </div>

          {/* Your role dropdown */}
          <div className="space-y-1.5">
            <label id="dispute-role-label" className={labelClasses}>
              Your role <span className="text-red-500">*</span>
            </label>
            <RoleDropdown
              value={disputeRole}
              onChange={setDisputeRole}
            />
          </div>

          {/* Why should you manage this listing - required reason */}
          <div className="space-y-1.5">
            <label htmlFor="dispute-reason" className={labelClasses}>
              Why should you manage this listing? <span className="text-red-500">*</span>
            </label>
            <textarea
              id="dispute-reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Explain your connection to this organization..."
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-red-700" role="alert">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-3">
            <button
              type="button"
              onClick={() => { setShowDisputeForm(false); setError(""); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <button
              onClick={handleDisputeSubmit}
              disabled={!disputeName.trim() || !disputeEmail.trim() || !disputePhone.trim() || !disputeRole || !disputeReason.trim() || disputeSubmitting}
              className="px-6 py-3 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
            >
              {disputeSubmitting ? "Submitting..." : "Submit dispute"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Verify Code State
  // ════════════════════════════════════════════════════════════

  if (state === "verify-code") {
    return (
      <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
        {/* Header - centered style */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
            Enter verification code
            <InfoTooltip content={TOOLTIP_CONTENT["verify-code"].text} />
          </h3>
          <p className="text-[15px] text-gray-500">
            We sent a 6-digit code to <span className="font-semibold text-gray-700">{emailHint}</span>
          </p>
        </div>

        {/* Code input */}
        <div className="flex justify-center gap-2 sm:gap-3 mb-6" onPaste={handleCodePaste}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <input
              key={i}
              ref={(el) => { codeInputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={1}
              value={code[i] || ""}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleCodeKeyDown(i, e)}
              disabled={verifying}
              aria-label={`Digit ${i + 1} of 6`}
              className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold border-2 border-gray-200 bg-gray-50/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 focus:bg-white disabled:opacity-50 transition-all"
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg mb-4">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-red-700" role="alert">{error}</p>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-sm font-semibold text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors min-h-[44px] focus:outline-none focus-visible:underline"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <button
            onClick={() => setState("no-access")}
            className="w-full text-sm font-medium text-gray-500 hover:text-gray-700 text-center transition-colors min-h-[44px] focus:outline-none focus-visible:text-gray-900 focus-visible:underline"
          >
            I don&apos;t have access to this email
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: Verify Form State (Default) - Only shown when email exists
  // ════════════════════════════════════════════════════════════

  // Note: If no email on file, showNoAccessForm above will be true and we won't reach here
  const verifyEmail = provider.email!;

  return (
    <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
      {/* Centered header with email */}
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm shadow-primary-500/10 border border-primary-100/60">
          <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24">
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
          Verify your email
          <InfoTooltip content={TOOLTIP_CONTENT["verify-form"].text} showTos={TOOLTIP_CONTENT["verify-form"].showTos} />
        </h3>
        <p className="text-[15px] text-gray-500">
          We&apos;ll send a code to <span className="font-semibold text-gray-700">{maskEmail(verifyEmail)}</span>
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg mb-4">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <p className="text-sm text-red-700" role="alert">{error}</p>
        </div>
      )}

      {/* Primary action */}
      <button
        onClick={handleSubmitVerifyForm}
        disabled={submitting}
        className="w-full sm:max-w-[280px] sm:mx-auto py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 block"
      >
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Sending...
          </span>
        ) : (
          "Send verification code"
        )}
      </button>

      {/* No access link */}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setState("no-access")}
          className="w-full text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors min-h-[44px] focus:outline-none focus-visible:text-gray-900 focus-visible:underline"
        >
          I don&apos;t have access to the business email
        </button>
      </div>
    </div>
  );
}

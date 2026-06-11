"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Profile, BusinessProfile, Connection } from "@/lib/types";
import type { ConnectionWithProfile } from "./ConversationList";
import { formatRedactedName } from "@/lib/utils/pii-redaction";
import { useProfileCompleteness } from "@/components/portal/profile/completeness";
import ProfileCompletionNudge from "@/components/portal/profile/ProfileCompletionNudge";
import GoLiveNudge from "@/components/portal/profile/GoLiveNudge";
import QuickProfileWizard from "@/components/portal/profile/QuickProfileWizard";

interface ConversationPanelProps {
  connection: ConnectionWithProfile | null;
  activeProfile: Profile | null;
  onMessageSent: (connectionId: string, thread: ThreadMessage[]) => void;
  onSendMessage?: (connectionId: string, text: string) => Promise<ThreadMessage[]>;
  onBack?: () => void;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  className?: string;
  /** Claim token for guest users (used when activeProfile is null) */
  claimToken?: string | null;
  /** Guest profile ID (used when user is not authenticated) */
  guestProfileId?: string | null;
  /** Whether the provider is verified (for PII redaction) */
  isVerified?: boolean;
  /** Callback to open verification modal */
  onVerifyClick?: () => void;
  /** Viewing context: "provider" for provider inbox, "family" for family inbox */
  variant?: "provider" | "family";
  /** Family profile for profile completion checking (family view only) */
  familyProfile?: Profile | null;
  /** User email for profile completeness calculation */
  userEmail?: string;
  /** Whether the family's care profile is published/live */
  isProfileLive?: boolean;
  /** Called when profile is published via the GoLiveNudge */
  onProfilePublished?: () => void;
}

interface ThreadMessage {
  from_profile_id: string;
  text: string;
  created_at: string;
  type?: string;
  next_step?: string;
  is_auto_reply?: boolean;
}

// ── Helpers ──

function parseInitialNotes(message: string | null): string | null {
  if (!message) return null;
  try {
    const p = JSON.parse(message);
    return p.additional_notes || null;
  } catch {
    return null;
  }
}

function getAutoIntro(metadata: Record<string, unknown> | undefined): string | null {
  return (metadata?.auto_intro as string) || null;
}

interface CareRequestData {
  // Core seeker identity (always available)
  seekerName: string | null;
  seekerFirstName: string | null;
  seekerEmail: string | null;
  seekerPhone: string | null;
  // Location context
  lookingInCity: string | null;
  lookingInState: string | null;
  // Custom message
  message: string | null;
  // Care details (may be null for new flow)
  careType: string | null;
  careRecipient: string | null;
  urgency: string | null;
  // Legacy field
  additionalNotes: string | null;
}

const CARE_TYPE_LABELS: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health Care",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
};

const RECIPIENT_LABELS: Record<string, string> = {
  self: "For myself",
  parent: "For my parent",
  spouse: "For my spouse",
  other: "For my loved one",
};

const URGENCY_LABELS: Record<string, string> = {
  asap: "As soon as possible",
  within_month: "Within a month",
  few_months: "Within a few months",
  researching: "Researching options",
};

function parseCareRequest(message: string | null): CareRequestData | null {
  if (!message) return null;
  try {
    const p = JSON.parse(message);
    // Accept if we have any meaningful data (name, email, care details, or message)
    const hasData = p.seeker_name || p.seeker_email || p.care_type || p.care_recipient || p.message || p.additional_notes;
    if (!hasData) return null;
    return {
      // Core identity
      seekerName: p.seeker_name || [p.seeker_first_name, p.seeker_last_name].filter(Boolean).join(" ") || null,
      seekerFirstName: p.seeker_first_name || null,
      seekerEmail: p.seeker_email || null,
      seekerPhone: p.seeker_phone || null,
      // Location
      lookingInCity: p.looking_in_city || null,
      lookingInState: p.looking_in_state || null,
      // Message
      message: p.message || null,
      // Care details
      careType: p.care_type || null,
      careRecipient: p.care_recipient || null,
      urgency: p.urgency || null,
      // Legacy
      additionalNotes: p.additional_notes || null,
    };
  } catch {
    return null;
  }
}

/** Check if message is plain text (not JSON) and return it, or null if empty/JSON */
function getPlainTextMessage(message: string | null): string | null {
  if (!message || !message.trim()) return null;
  try {
    JSON.parse(message);
    // If it parses as JSON, it's not plain text
    return null;
  } catch {
    // Not JSON, it's plain text
    return message.trim();
  }
}

function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #0ea5e9, #6366f1)",
    "linear-gradient(135deg, #14b8a6, #0ea5e9)",
    "linear-gradient(135deg, #8b5cf6, #ec4899)",
    "linear-gradient(135deg, #f59e0b, #ef4444)",
    "linear-gradient(135deg, #10b981, #14b8a6)",
    "linear-gradient(135deg, #6366f1, #a855f7)",
    "linear-gradient(135deg, #ec4899, #f43f5e)",
    "linear-gradient(135deg, #0891b2, #2dd4bf)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

// ── SVG Icons ──

const PhoneIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const ClipboardIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const HomeIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

// ── Provider Passed Card ──

function ProviderPassedCard({
  providerName,
  familyName,
  archiveReason,
  archiveMessage,
  time,
  dateStr,
  connection,
  isProviderView = false,
}: {
  providerName: string;
  familyName: string;
  archiveReason: string;
  archiveMessage?: string | null;
  time: string;
  dateStr: string;
  connection: ConnectionWithProfile;
  isProviderView?: boolean;
}) {
  // Map reason codes to user-friendly labels (keep already_connected for old messages)
  const reasonLabels: Record<string, string> = {
    already_connected: "Already connected off-platform",
    not_a_fit: "Not a good fit",
    not_accepting_clients: "Not accepting new clients",
    unable_to_reach: "Unable to reach",
    other: "Other",
  };

  const reasonLabel = reasonLabels[archiveReason] || archiveReason;

  // Build contextual browse URL from connection
  const familyProfile = connection.fromProfile;
  const city = familyProfile?.city;
  const state = familyProfile?.state;
  const careTypes = familyProfile?.care_types as string[] | undefined;
  const primaryCareType = careTypes?.[0] || "senior-care";

  let browseUrl = "/browse";
  if (city && state) {
    const params = new URLSearchParams({
      care_type: primaryCareType,
      city,
      state,
    });
    browseUrl = `/browse?${params.toString()}`;
  }

  // Provider name (providers always have names, no need for complex fallback)
  const displayProviderName = providerName || "Provider";
  const displayFamilyName = familyName || "Care Seeker";

  // Perspective-aware header and body text
  const headerText = isProviderView
    ? `Update to ${displayFamilyName}`
    : `Update from ${displayProviderName}`;

  const bodyText = isProviderView
    ? `You passed on this inquiry and won't be able to help at this time.`
    : `They've reviewed your inquiry and won't be able to help at this time.`;

  return (
    <div className={`flex ${isProviderView ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[420px] w-full">
        <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200">
          {/* Subtle gray header - minimal color */}
          <div className="bg-gradient-to-r from-gray-600 to-gray-500 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-bold text-white">{headerText}</span>
            </div>
          </div>

          {/* Body */}
          <div className="bg-white px-5 pt-4 pb-4">
            <p className="text-[15px] text-gray-700 leading-relaxed">
              {bodyText}
            </p>

            {/* Reason chip */}
            <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
              <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {reasonLabel}
              </span>
            </div>

            {/* Provider's message (if provided) */}
            {archiveMessage && (
              <div className="mt-3">
                <p className="text-[14px] text-gray-600 leading-relaxed italic border-l-2 border-gray-200 pl-3">
                  &ldquo;{archiveMessage}&rdquo;
                </p>
              </div>
            )}

            {/* CTA to browse other providers - only show for family view */}
            {!isProviderView && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <a
                  href={browseUrl}
                  className="inline-flex items-center gap-2 text-[14px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Browse other providers
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-5 py-2.5 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {dateStr}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 text-center">{time}</p>
      </div>
    </div>
  );
}

// ── Care Request Card ──

function CareRequestCard({ careRequest, time, dateStr, isInbound, otherName, otherInitial, imageUrl, autoIntro, hideContactInfo }: {
  careRequest: CareRequestData;
  time: string;
  dateStr: string;
  isInbound: boolean;
  otherName: string;
  otherInitial: string;
  imageUrl?: string | null;
  autoIntro?: string | null;
  hideContactInfo?: boolean;
}) {
  // Redact seeker name when hiding contact info (unverified provider)
  const rawSenderName = careRequest.seekerName;
  const senderName = hideContactInfo && rawSenderName ? formatRedactedName(rawSenderName) : rawSenderName;
  const locationStr = [careRequest.lookingInCity, careRequest.lookingInState].filter(Boolean).join(", ");
  const displayMessage = careRequest.message || careRequest.additionalNotes || autoIntro || (locationStr ? `Interested in care services in ${locationStr}.` : null);
  const hasEnhancedDetails = careRequest.careType || careRequest.careRecipient || careRequest.urgency;

  return (
    <div className={isInbound ? "flex items-end gap-2.5" : "flex justify-end"}>
      {isInbound && (
        imageUrl ? (
          <Image src={imageUrl} alt={otherName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
            style={{ background: avatarGradient(otherName) }}
          >
            {otherInitial}
          </div>
        )
      )}
      <div className="max-w-[420px]">
        <div className={`rounded-2xl ${isInbound ? "rounded-bl-md" : "rounded-br-md"} overflow-hidden shadow-sm border border-gray-200`}>
          {/* Teal gradient header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-500 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-bold text-white">Care Request</span>
            </div>
          </div>

          {/* Body — rich summary */}
          <div className="bg-white px-5 pt-4 pb-4">
            {/* Seeker name — hero heading */}
            {senderName && (
              <h3 className="text-lg font-display font-bold text-gray-900 leading-tight">
                {senderName}
              </h3>
            )}

            {/* Location subtitle */}
            {locationStr && (
              <p className="text-[14px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Looking for care in {locationStr}
              </p>
            )}

            {/* Contact info - hidden for unverified providers */}
            {(careRequest.seekerEmail || careRequest.seekerPhone) && !hideContactInfo && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[13px] text-gray-600">
                {careRequest.seekerEmail && (
                  <a href={`mailto:${careRequest.seekerEmail}`} className="flex items-center gap-1.5 hover:text-primary-600 transition-colors">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {careRequest.seekerEmail}
                  </a>
                )}
                {careRequest.seekerPhone && (
                  <a href={`tel:${careRequest.seekerPhone}`} className="flex items-center gap-1.5 hover:text-primary-600 transition-colors">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {careRequest.seekerPhone}
                  </a>
                )}
              </div>
            )}
            {/* Verification prompt when contact info is hidden */}
            {(careRequest.seekerEmail || careRequest.seekerPhone) && hideContactInfo && (
              <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Contact info available after verification</span>
              </div>
            )}

            {/* Care details chips (when available) */}
            {hasEnhancedDetails && (
              <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-dashed border-gray-200">
                {careRequest.careType && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full font-medium">
                    {CARE_TYPE_LABELS[careRequest.careType] || careRequest.careType}
                  </span>
                )}
                {careRequest.careRecipient && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {RECIPIENT_LABELS[careRequest.careRecipient] || careRequest.careRecipient}
                  </span>
                )}
                {careRequest.urgency && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {URGENCY_LABELS[careRequest.urgency] || careRequest.urgency}
                  </span>
                )}
              </div>
            )}

            {/* Custom message */}
            {displayMessage && (
              <div className={`${hasEnhancedDetails ? "mt-3" : "mt-3.5 pt-3.5 border-t border-dashed border-gray-200"}`}>
                <p className="text-[14px] text-gray-600 leading-relaxed">
                  &ldquo;{displayMessage}&rdquo;
                </p>
              </div>
            )}

            {/* Auto-intro (if different from message) */}
            {autoIntro && autoIntro !== displayMessage && (
              <div className="mt-2">
                <p className="text-[14px] text-gray-500 leading-relaxed italic">
                  {autoIntro}
                </p>
              </div>
            )}
          </div>

          {/* Footer — date only (name is now in header) */}
          <div className="bg-gray-50 px-5 py-2.5 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {dateStr}
            </p>
          </div>
        </div>
        <p className={`text-xs text-gray-400 mt-1.5 ${isInbound ? "ml-1" : "text-right mr-1"}`}>{time}</p>
      </div>
    </div>
  );
}

// ── Component ──

export default function ConversationPanel({
  connection,
  activeProfile,
  onMessageSent,
  onSendMessage,
  onBack,
  detailOpen,
  onToggleDetail,
  className = "",
  claimToken,
  guestProfileId,
  isVerified = true,
  onVerifyClick,
  variant = "family",
  familyProfile,
  userEmail,
  isProfileLive = false,
  onProfilePublished,
}: ConversationPanelProps) {
  // Use guest profile ID when activeProfile is not available
  const currentProfileId = activeProfile?.id || guestProfileId;
  const conversationRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Profile completion nudge state
  const [showWizard, setShowWizard] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [goLiveNudgeDismissed, setGoLiveNudgeDismissed] = useState(false);

  // Profile completeness check (family view only)
  const { percentage: completeness } = useProfileCompleteness(
    familyProfile as BusinessProfile | null,
    userEmail
  );

  // Check localStorage for nudge dismissals on mount and when connection changes
  useEffect(() => {
    if (!connection?.id) return;
    try {
      const dismissed = localStorage.getItem(`nudge_dismissed_${connection.id}`);
      setNudgeDismissed(dismissed === "true");
      const goLiveDismissed = localStorage.getItem(`go_live_nudge_dismissed_${connection.id}`);
      setGoLiveNudgeDismissed(goLiveDismissed === "true");
    } catch {
      // localStorage unavailable
    }
  }, [connection?.id]);

  // Provider verification gating: only applies when viewing as provider
  // Family users viewing their inbox should never see redacted names
  const isProviderView = variant === "provider";

  // Auto-dismiss send error after 4 seconds
  useEffect(() => {
    if (!sendError) return;
    const timer = setTimeout(() => setSendError(null), 4000);
    return () => clearTimeout(timer);
  }, [sendError]);

  // Reset message text when switching conversations
  useEffect(() => {
    setMessageText("");
  }, [connection?.id]);

  // Track thread length to detect new messages
  const prevThreadLengthRef = useRef<number>(0);
  const thread = (connection?.metadata as Record<string, unknown>)?.thread as ThreadMessage[] | undefined;
  const currentThreadLength = thread?.length ?? 0;

  // Auto-scroll to bottom only when a new message is added or conversation changes
  useEffect(() => {
    const prevLength = prevThreadLengthRef.current;
    prevThreadLengthRef.current = currentThreadLength;

    // Only scroll if thread grew (new message) or this is a new conversation
    if (currentThreadLength > prevLength || prevLength === 0) {
      if (conversationRef.current) {
        requestAnimationFrame(() => {
          conversationRef.current?.scrollTo({
            top: conversationRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      }
    }
  }, [connection?.id, currentThreadLength]);

  const handleSendMessage = useCallback(async () => {
    // Allow sending if user has activeProfile OR a valid claimToken (guest)
    if (!connection || !messageText.trim() || (!activeProfile && !claimToken)) return;
    setSending(true);
    try {
      let thread: ThreadMessage[];
      if (onSendMessage) {
        // Mock-aware send — bypasses API
        thread = await onSendMessage(connection.id, messageText.trim());
      } else {
        // Build request body, include claimToken for guests
        const requestBody: Record<string, string> = {
          connectionId: connection.id,
          text: messageText.trim(),
        };
        if (claimToken) {
          requestBody.claimToken = claimToken;
        }

        const res = await fetch("/api/connections/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        if (!res.ok) throw new Error("Failed to send");
        const data = await res.json();
        thread = data.thread;
      }
      setMessageText("");
      if (messageInputRef.current) messageInputRef.current.style.height = 'auto';
      onMessageSent(connection.id, thread);
      requestAnimationFrame(() => {
        conversationRef.current?.scrollTo({
          top: conversationRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    } catch {
      setSendError("Couldn't send message. Please try again.");
    } finally {
      setSending(false);
    }
  }, [connection, messageText, activeProfile, claimToken, onMessageSent, onSendMessage]);

  // ── Empty state ──
  if (!connection) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={1.5} />
              <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" strokeWidth={1.5} />
            </svg>
          </div>
          <p className="text-lg font-display font-medium text-gray-900 mb-1">Select a conversation</p>
          <p className="text-[15px] text-gray-500">Choose from your existing conversations to start messaging</p>
        </div>
      </div>
    );
  }

  // ── Derived values ──
  const isInbound = connection.to_profile_id === currentProfileId;
  const otherProfile = isInbound ? connection.fromProfile : connection.toProfile;
  // Redact name for unverified providers viewing family contacts
  // Only applies when variant="provider", not when family users view their inbox
  const rawName = otherProfile?.display_name || "Unknown";
  const otherName = (isProviderView && !isVerified) ? formatRedactedName(rawName) : rawName;
  const otherInitial = otherName.charAt(0).toUpperCase();
  const imageUrl = otherProfile?.image_url;
  const connMetadata = connection.metadata as Record<string, unknown> | undefined;
  const autoIntro = getAutoIntro(connMetadata);
  const additionalNotes = parseInitialNotes(connection.message);
  const careRequest = parseCareRequest(connection.message);
  const plainTextMessage = getPlainTextMessage(connection.message);
  // Show initial notes from: auto_intro, additional_notes (from JSON), or plain text message
  const initialNotes = autoIntro || additionalNotes || plainTextMessage;
  const thread = (connMetadata?.thread as ThreadMessage[]) || [];

  // Names in conversation header are not clickable - use "View full profile" in details panel instead

  const showMessageInput =
    (connection.status === "pending" || connection.status === "accepted");

  const messagePlaceholder =
    connection.status === "accepted"
      ? "Write a message..."
      : "Write a message...";

  // Date helpers
  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const getDateKey = (dateStr: string) => new Date(dateStr).toDateString();
  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className={`flex flex-col bg-white ${className}`}>
      {/* ── Header ── */}
      <div className={`shrink-0 pl-4 sm:pl-6 ${detailOpen ? "pr-4 sm:pr-6" : "pr-4 sm:pr-[44px]"} h-[68px] border-b border-gray-200 flex items-center gap-3`}>
        {/* Back button (mobile) */}
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden -ml-2 mr-1 w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Back to conversations"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Avatar */}
        <div className="shrink-0">
          {imageUrl ? (
            <Image src={imageUrl} alt={otherName} width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ background: avatarGradient(otherName) }}
            >
              {otherInitial}
            </div>
          )}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <span className="text-lg font-display font-semibold text-gray-900 truncate block">
            {otherName}
          </span>
          {otherProfile?.city || otherProfile?.state ? (
            <p className="text-sm text-gray-500 truncate">
              {[otherProfile.city, otherProfile.state].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>

        {/* Show Details toggle — visible on all screen sizes, hidden when panel is already open on desktop */}
        {onToggleDetail && (
          <button
            onClick={onToggleDetail}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors ${detailOpen ? "lg:hidden" : ""}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <span className="hidden sm:inline">Details</span>
          </button>
        )}
      </div>

      {/* Profile completion nudge - family view only, above scrollable thread */}
      {variant === "family" && familyProfile && completeness < 60 && !nudgeDismissed && connection && (
        <div className="border-b border-gray-100">
          <ProfileCompletionNudge
            providerName={otherName}
            onComplete={() => setShowWizard(true)}
            onDismiss={() => {
              setNudgeDismissed(true);
              try {
                localStorage.setItem(`nudge_dismissed_${connection.id}`, "true");
              } catch {
                // localStorage unavailable
              }
            }}
            connectionId={connection.id}
            completionPercentage={completeness}
          />
        </div>
      )}

      {/* Go Live nudge - for complete profiles (>=60%) that aren't published yet */}
      {variant === "family" && familyProfile && completeness >= 60 && !isProfileLive && !goLiveNudgeDismissed && connection && (
        <div className="border-b border-gray-100">
          <GoLiveNudge
            onDismiss={() => {
              setGoLiveNudgeDismissed(true);
              try {
                localStorage.setItem(`go_live_nudge_dismissed_${connection.id}`, "true");
              } catch {
                // localStorage unavailable
              }
            }}
            onPublished={onProfilePublished}
            connectionId={connection.id}
            profile={familyProfile}
          />
        </div>
      )}

      {/* ── Conversation thread ── */}
      <div
        ref={conversationRef}
        className={`flex-1 min-h-0 overflow-y-auto px-4 sm:pl-6 ${detailOpen ? "sm:pr-6" : "sm:pr-[44px]"} py-6 bg-white`}
      >
        <div className="space-y-4">
          {/* Care request card — structured summary of the initial inquiry */}
          {(careRequest || initialNotes) && (
            <>
              <div className="flex justify-center py-3">
                <span className="text-sm font-medium text-gray-400">
                  {formatDateSeparator(connection.created_at)}
                </span>
              </div>

              {careRequest ? (
                <CareRequestCard
                  careRequest={careRequest}
                  time={formatTime(connection.created_at)}
                  dateStr={formatDateSeparator(connection.created_at)}
                  isInbound={isInbound}
                  otherName={otherName}
                  otherInitial={otherInitial}
                  imageUrl={imageUrl}
                  autoIntro={autoIntro}
                  hideContactInfo={isProviderView && !isVerified}
                />
              ) : initialNotes ? (
                /* Fallback to simple bubble when no structured data */
                isInbound ? (
                  <div className="flex items-end gap-2.5 max-w-[70%]">
                    {imageUrl ? (
                      <Image src={imageUrl} alt={otherName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
                        style={{ background: avatarGradient(otherName) }}
                      >
                        {otherInitial}
                      </div>
                    )}
                    <div>
                      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                        <p className="text-base leading-relaxed text-gray-800">{initialNotes}</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5 ml-1">{otherName} &middot; {formatTime(connection.created_at)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="max-w-[70%]">
                      <div className="bg-primary-600 rounded-2xl rounded-br-md px-4 py-3 shadow-sm">
                        <p className="text-base leading-relaxed text-white">{initialNotes}</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5 text-right mr-1">{formatTime(connection.created_at)}</p>
                    </div>
                  </div>
                )
              ) : null}
            </>
          )}

          {/* Connected milestone */}
          {connection.status === "accepted" && (
            <div className="flex justify-center py-4">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-full shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Connected
              </span>
            </div>
          )}

          {/* Thread messages */}
          {thread.map((msg, i) => {
            const requestDate = connection.created_at ? getDateKey(connection.created_at) : "";
            const prevDate = i > 0 ? getDateKey(thread[i - 1].created_at) : requestDate;
            const thisDate = getDateKey(msg.created_at);
            const showSeparator = thisDate !== prevDate;

            // Grouping: check if same sender as previous non-system message
            const prevMsg = i > 0 ? thread[i - 1] : null;
            const isGrouped = prevMsg
              && prevMsg.type !== "system"
              && prevMsg.from_profile_id === msg.from_profile_id
              && !showSeparator;
            // Check if this is the last in a group (next message is from different sender or is system)
            const nextMsg = i < thread.length - 1 ? thread[i + 1] : null;
            const isLastInGroup = !nextMsg
              || nextMsg.type === "system"
              || nextMsg.from_profile_id !== msg.from_profile_id
              || getDateKey(nextMsg.created_at) !== thisDate;

            // System messages
            if (msg.type === "system") {
              // Check if this is a "provider passed" message
              const isProviderPassed = msg.text?.includes("passed on this inquiry");

              if (isProviderPassed) {
                // Parse reason and message from text
                // Format: "This provider has passed on this inquiry. Reason: not_a_fit\n\"message\""
                const reasonMatch = msg.text.match(/Reason:\s*(\w+)/);
                const messageMatch = msg.text.match(/\n"([\s\S]+)"/);
                const archiveReason = reasonMatch?.[1] || "other";
                // Unescape quotes that were escaped in backend
                const rawMessage = messageMatch?.[1] || null;
                const archiveMessage = rawMessage ? rawMessage.replace(/\\"/g, '"') : null;

                return (
                  <div key={i}>
                    {showSeparator && (
                      <div className="flex justify-center py-3">
                        <span className="text-sm font-medium text-gray-400">
                          {formatDateSeparator(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <ProviderPassedCard
                      providerName={connection.toProfile?.display_name || "Provider"}
                      familyName={connection.fromProfile?.display_name || "Care Seeker"}
                      archiveReason={archiveReason}
                      archiveMessage={archiveMessage}
                      time={formatTime(msg.created_at)}
                      dateStr={formatDateSeparator(msg.created_at)}
                      connection={connection}
                      isProviderView={isProviderView}
                    />
                  </div>
                );
              }

              // Default system message (simple italic text)
              return (
                <div key={i}>
                  {showSeparator && (
                    <div className="flex justify-center py-3">
                      <span className="text-sm font-medium text-gray-400">
                        {formatDateSeparator(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <span className="text-[13px] text-gray-400 italic">
                      {msg.text}
                    </span>
                  </div>
                </div>
              );
            }

            const isOwn = msg.from_profile_id === currentProfileId;
            const msgTime = formatTime(msg.created_at);

            // Next step request cards
            if (msg.type === "next_step_request") {
              const stepLabel =
                msg.next_step === "call" ? "Call requested" :
                msg.next_step === "consultation" ? "Consultation requested" :
                msg.next_step === "visit" ? "Home visit requested" : "Request";
              const StepIcon = msg.next_step === "call" ? PhoneIcon :
                msg.next_step === "consultation" ? ClipboardIcon : HomeIcon;

              return (
                <div key={i}>
                  {showSeparator && (
                    <div className="flex justify-center py-3">
                      <span className="text-sm font-medium text-gray-400">
                        {formatDateSeparator(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${isOwn ? "justify-end" : "items-end gap-2.5"}`}>
                    {/* Avatar for incoming */}
                    {!isOwn && (
                      isLastInGroup ? (
                        imageUrl ? (
                          <Image src={imageUrl} alt={otherName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                        ) : (
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
                            style={{ background: avatarGradient(otherName) }}
                          >
                            {otherInitial}
                          </div>
                        )
                      ) : <div className="w-7 shrink-0" />
                    )}
                    <div className="max-w-[70%]">
                      <div className={`rounded-2xl overflow-hidden ${
                        isOwn
                          ? "bg-primary-600 border border-primary-500 shadow-sm rounded-br-md"
                          : `bg-gray-100 ${isLastInGroup ? "rounded-bl-md" : ""}`
                      }`}>
                        <div className={`flex items-center gap-2 px-4 py-2 border-b ${
                          isOwn ? "border-primary-500/50" : "border-gray-200"
                        }`}>
                          <StepIcon className={`w-3.5 h-3.5 ${isOwn ? "text-primary-200" : "text-gray-500"}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                            isOwn ? "text-primary-200" : "text-gray-500"
                          }`}>
                            {stepLabel}
                          </span>
                        </div>
                        <div className="px-4 py-3">
                          <p className={`text-base leading-relaxed ${
                            isOwn ? "text-white" : "text-gray-800"
                          }`}>{msg.text}</p>
                        </div>
                      </div>
                      <p className={`text-xs mt-1.5 ${isOwn ? "text-right mr-1" : "ml-1"} text-gray-400`}>
                        {msgTime}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            // Regular messages
            return (
              <div key={i} className={isGrouped ? "mt-0.5" : ""} style={isGrouped ? { marginTop: '2px' } : undefined}>
                {showSeparator && (
                  <div className="flex justify-center py-3">
                    <span className="text-sm font-medium text-gray-400">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                  </div>
                )}
                {isOwn ? (
                  /* Own message — right aligned */
                  <div className="flex justify-end">
                    <div className="max-w-[70%]">
                      <div className={`bg-primary-600 px-4 py-3 shadow-sm ${
                        isLastInGroup
                          ? "rounded-2xl rounded-br-md"
                          : "rounded-2xl"
                      }`}>
                        <p className="text-base leading-relaxed text-white">{msg.text}</p>
                      </div>
                      {isLastInGroup && (
                        <p className="text-xs text-gray-400 mt-1.5 text-right mr-1">{msgTime}</p>
                      )}
                      {msg.is_auto_reply && (
                        <p className="text-[11px] text-gray-400 mt-1 mr-1 italic flex items-center justify-end gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                          </svg>
                          Sent automatically by Olera
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Other's message — left aligned with avatar */
                  <div className="flex items-end gap-2.5 max-w-[70%]">
                    {/* Avatar — only show on last message in group */}
                    {isLastInGroup ? (
                      imageUrl ? (
                        <Image src={imageUrl} alt={otherName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
                          style={{ background: avatarGradient(otherName) }}
                        >
                          {otherInitial}
                        </div>
                      )
                    ) : (
                      <div className="w-7 shrink-0" />
                    )}
                    <div>
                      {!isGrouped && (
                        <p className="text-xs text-gray-400 mb-1.5 ml-1">{otherName}</p>
                      )}
                      <div className={`bg-gray-100 px-4 py-3 ${
                        isLastInGroup
                          ? "rounded-2xl rounded-bl-md"
                          : "rounded-2xl"
                      }`}>
                        <p className="text-base leading-relaxed text-gray-800">{msg.text}</p>
                      </div>
                      {isLastInGroup && (
                        <p className="text-xs text-gray-400 mt-1.5 ml-1">{msgTime}</p>
                      )}
                      {msg.is_auto_reply && (
                        <p className="text-[11px] text-gray-400 mt-1 ml-1 italic flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                          </svg>
                          Automatically sent by Olera
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty thread placeholder */}
          {thread.length === 0 && !initialNotes && (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-gray-100">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-[15px] text-gray-500">No messages yet</p>
              <p className="text-sm text-gray-400 mt-1">Send the first message to start the conversation</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Response time hint + Message input ── */}
      {showMessageInput && (
        <div className="shrink-0 border-t border-gray-200 bg-white">
          {/* Send error */}
              {sendError && (
                <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-lg bg-rose-50/80 border border-rose-100/60">
                  <p className="text-[13px] text-rose-600 font-medium text-center">{sendError}</p>
                </div>
              )}

              {/* Verification hint - minimal, Apple-like */}
              {isProviderView && !isVerified && (
                <div className={`mx-4 sm:ml-6 ${detailOpen ? "sm:mr-6" : "sm:mr-[44px]"} mt-4`}>
                  <button
                    type="button"
                    onClick={onVerifyClick}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400 group-hover:text-gray-500 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                      />
                    </svg>
                    <span className="flex-1 text-[13px] text-gray-500 group-hover:text-gray-600 text-left">
                      Verify to message families directly
                    </span>
                    <span className="text-[13px] font-medium text-primary-600 group-hover:text-primary-700">
                      Verify →
                    </span>
                  </button>
                </div>
              )}

              {/* Input area */}
              <div className={`px-4 sm:pl-6 ${detailOpen ? "sm:pr-6" : "sm:pr-[44px]"} py-4`}>
                <div className="border border-gray-300 rounded-2xl focus-within:border-gray-400 focus-within:shadow-sm transition-all overflow-hidden">
                  <textarea
                    ref={messageInputRef}
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && messageText.trim()) {
                        e.preventDefault();
                        // Block sending for unverified providers (only in provider view)
                        if (isProviderView && !isVerified) {
                          onVerifyClick?.();
                        } else {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder={messagePlaceholder}
                    disabled={sending}
                    rows={1}
                    className="w-full px-4 pt-3.5 pb-3 text-base text-gray-900 placeholder:text-gray-400 outline-none resize-none disabled:opacity-50 leading-relaxed bg-transparent"
                  />
                  <div className="flex items-center justify-end px-3 pb-3">
                    <button
                      type="button"
                      onClick={() => {
                        // Unverified providers: open verification modal instead of sending
                        if (isProviderView && !isVerified && messageText.trim()) {
                          onVerifyClick?.();
                        } else {
                          handleSendMessage();
                        }
                      }}
                      disabled={sending || !messageText.trim()}
                      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                        messageText.trim()
                          ? "bg-primary-600 text-white hover:bg-primary-700"
                          : "bg-gray-200 text-gray-400"
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
        </div>
      )}

      {/* Quick Profile Wizard — tappable, mobile-optimized */}
      {showWizard && familyProfile && connection && (
        <QuickProfileWizard
          profile={familyProfile as BusinessProfile}
          onClose={() => setShowWizard(false)}
          onSaved={() => {
            setShowWizard(false);
            // Auto-dismiss nudge after completing wizard (even if < 60%)
            // They made an effort, don't nag them immediately
            setNudgeDismissed(true);
            try {
              localStorage.setItem(`nudge_dismissed_${connection.id}`, "true");
            } catch {
              // localStorage unavailable
            }
          }}
          providerCity={otherProfile?.city || undefined}
          providerState={otherProfile?.state || undefined}
        />
      )}
    </div>
  );
}

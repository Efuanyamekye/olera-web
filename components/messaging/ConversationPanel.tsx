"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import type { Profile } from "@/lib/types";
import type { ConnectionWithProfile } from "./ConversationList";
import EditCareRequestModal from "./EditCareRequestModal";

interface ConversationPanelProps {
  connection: ConnectionWithProfile | null;
  activeProfile: Profile | null;
  onMessageSent: (connectionId: string, thread: ThreadMessage[]) => void;
  onSendMessage?: (connectionId: string, text: string) => Promise<ThreadMessage[]>;
  onCareRequestUpdated?: (connectionId: string, message: string, metadata: Record<string, unknown>) => void;
  onBack?: () => void;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  className?: string;
  /** Claim token for guest users (used when activeProfile is null) */
  claimToken?: string | null;
  /** Guest profile ID (used when user is not authenticated) */
  guestProfileId?: string | null;
}

interface ThreadMessage {
  from_profile_id: string;
  text: string;
  created_at: string;
  type?: string;
  next_step?: string;
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
  careType: string | null;
  careRecipient: string | null;
  urgency: string | null;
  additionalNotes: string | null;
  seekerName: string | null;
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
    if (!p.care_type && !p.care_recipient && !p.urgency) return null;
    return {
      careType: p.care_type || null,
      careRecipient: p.care_recipient || null,
      urgency: p.urgency || null,
      additionalNotes: p.additional_notes || null,
      seekerName: [p.seeker_first_name, p.seeker_last_name].filter(Boolean).join(" ") || null,
    };
  } catch {
    return null;
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

// ── Care Request Card ──

function CareRequestCard({ careRequest, time, dateStr, isInbound, otherName, otherInitial, imageUrl, editable, connectionId, autoIntro, onUpdated }: {
  careRequest: CareRequestData;
  time: string;
  dateStr: string;
  isInbound: boolean;
  otherName: string;
  otherInitial: string;
  imageUrl?: string | null;
  editable: boolean;
  connectionId: string;
  autoIntro?: string | null;
  onUpdated?: (message: string, metadata: Record<string, unknown>) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const senderName = careRequest.seekerName;

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
              {editable && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="ml-auto flex items-center gap-1.5 min-h-[44px] px-3 -mr-2 rounded-lg hover:bg-white/15 transition-colors"
                  aria-label="Edit care request"
                >
                  <svg className="w-3.5 h-3.5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span className="text-xs font-medium text-white/80">Edit</span>
                </button>
              )}
            </div>
          </div>

          {/* Body — compact summary */}
          <div className="bg-white px-5 pt-4 pb-4">
            {/* Care type — hero heading */}
            {careRequest.careType && (
              <h3 className="text-lg font-display font-bold text-gray-900 leading-tight">
                {CARE_TYPE_LABELS[careRequest.careType] || careRequest.careType}
              </h3>
            )}

            {/* Recipient + Timeline — inline chips */}
            {(careRequest.careRecipient || careRequest.urgency) && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                {careRequest.careRecipient && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {RECIPIENT_LABELS[careRequest.careRecipient] || careRequest.careRecipient}
                  </span>
                )}
                {careRequest.careRecipient && careRequest.urgency && (
                  <span className="text-gray-300">&middot;</span>
                )}
                {careRequest.urgency && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {URGENCY_LABELS[careRequest.urgency] || careRequest.urgency}
                  </span>
                )}
              </div>
            )}

            {/* Auto-intro quote */}
            {autoIntro && (
              <div className="mt-3.5 pt-3.5 border-t border-dashed border-gray-200">
                <p className="text-[14px] text-gray-500 leading-relaxed italic">
                  &ldquo;{autoIntro}&rdquo;
                </p>
              </div>
            )}

            {/* Additional notes (if different from auto-intro) */}
            {careRequest.additionalNotes && careRequest.additionalNotes !== autoIntro && (
              <div className={`${autoIntro ? "mt-2" : "mt-3.5 pt-3.5 border-t border-dashed border-gray-200"}`}>
                <p className="text-[14px] text-gray-500 leading-relaxed italic">
                  &ldquo;{careRequest.additionalNotes}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* Footer — sender name + date */}
          <div className="bg-gray-50 px-5 py-2.5 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {isInbound
                ? `From ${senderName || otherName}`
                : senderName || "You"
              }
              {" "}&middot; {dateStr}
            </p>
          </div>
        </div>
        <p className={`text-xs text-gray-400 mt-1.5 ${isInbound ? "ml-1" : "text-right mr-1"}`}>{time}</p>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditCareRequestModal
          careRequest={careRequest}
          connectionId={connectionId}
          onClose={() => setEditOpen(false)}
          onSaved={(message, metadata) => {
            setEditOpen(false);
            onUpdated?.(message, metadata);
          }}
        />
      )}
    </div>
  );
}

// ── Component ──

export default function ConversationPanel({
  connection,
  activeProfile,
  onMessageSent,
  onSendMessage,
  onCareRequestUpdated,
  onBack,
  detailOpen,
  onToggleDetail,
  className = "",
  claimToken,
  guestProfileId,
}: ConversationPanelProps) {
  // Use guest profile ID when activeProfile is not available
  const currentProfileId = activeProfile?.id || guestProfileId;
  const conversationRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

  // Auto-scroll to bottom when thread updates
  useEffect(() => {
    if (conversationRef.current) {
      requestAnimationFrame(() => {
        conversationRef.current?.scrollTo({
          top: conversationRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [connection?.metadata]);

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
  const otherName = otherProfile?.display_name || "Unknown";
  const otherInitial = otherName.charAt(0).toUpperCase();
  const imageUrl = otherProfile?.image_url;
  const connMetadata = connection.metadata as Record<string, unknown> | undefined;
  const autoIntro = getAutoIntro(connMetadata);
  const additionalNotes = parseInitialNotes(connection.message);
  const careRequest = parseCareRequest(connection.message);
  const initialNotes = autoIntro || additionalNotes;
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

        {/* Show Details toggle — hidden when panel is already open (close button on panel handles that) */}
        {onToggleDetail && !detailOpen && (
          <button
            onClick={onToggleDetail}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Show Details
          </button>
        )}
      </div>

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
                  editable={!isInbound && (connection.status === "pending" || connection.status === "accepted")}
                  connectionId={connection.id}
                  autoIntro={autoIntro}
                  onUpdated={(message, metadata) => {
                    onCareRequestUpdated?.(connection.id, message, metadata);
                  }}
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
                    handleSendMessage();
                  }
                }}
                placeholder={messagePlaceholder}
                disabled={sending}
                rows={1}
                className="w-full px-4 pt-3.5 pb-1 text-base text-gray-900 placeholder:text-gray-400 outline-none resize-none disabled:opacity-50 leading-relaxed bg-transparent"
              />
              <div className="flex items-center justify-end px-3 pb-3">
                <button
                  type="button"
                  onClick={handleSendMessage}
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
    </div>
  );
}

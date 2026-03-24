"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Select from "@/components/ui/Select";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Connection, Profile } from "@/lib/types";

// ── Lead types (previously from mock file) ──

interface ActivityEvent {
  label: string;
  date: string;
}

interface LeadDetail {
  id: string;
  name: string;
  initials: string;
  subtitle: string;
  location: string;
  urgency: Urgency;
  status: LeadStatus;
  date: string;
  isNew: boolean;
  email?: string;
  phone?: string;
  contactPreference?: ContactMethod;
  careRecipient?: string;
  careRecipientName?: string;
  careType?: string[];
  careNeeds?: string[];
  livingSituation?: string;
  schedulePreference?: string;
  careLocation?: string;
  languagePreference?: string;
  insuranceType?: string;
  benefits?: string[];
  additionalNotes?: string;
  activity?: ActivityEvent[];
  archivedDate?: string;
  archiveReason?: string;
  messagedAt?: string;
  connectionId?: string; // Link to actual connection
}

// ── Types ──

type TimelineFilter = "all" | "immediate" | "within_1_month" | "exploring" | "archived";
type SortOption = "best_match" | "most_recent" | "most_urgent";
type LeadStatus = "new" | "replied" | "no_reply" | "archived";
type Urgency = "immediate" | "within_1_month" | "exploring";
type ContactMethod = "phone" | "email" | "either";

// ── Config ──

const FILTER_TABS: { id: TimelineFilter; label: string }[] = [
  { id: "all", label: "All leads" },
  { id: "immediate", label: "Immediate" },
  { id: "within_1_month", label: "Within 1 month" },
  { id: "exploring", label: "Exploring" },
  { id: "archived", label: "Archived" },
];

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "best_match", label: "Best match" },
  { id: "most_recent", label: "Most recent" },
  { id: "most_urgent", label: "Most urgent" },
];

const URGENCY_LABELS: Record<Urgency, string> = {
  immediate: "Immediate",
  within_1_month: "Within 1 month",
  exploring: "Exploring",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  replied: "Replied",
  no_reply: "No reply",
  archived: "Archived",
};

const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  phone: "Prefers phone",
  email: "Prefers email",
  either: "Phone or email",
};

// ── Avatar gradients (deterministic by name) ──

const AVATAR_GRADIENTS = [
  "from-rose-100 to-pink-50",
  "from-sky-100 to-blue-50",
  "from-amber-100 to-yellow-50",
  "from-emerald-100 to-green-50",
  "from-violet-100 to-purple-50",
  "from-orange-100 to-amber-50",
  "from-teal-100 to-cyan-50",
  "from-fuchsia-100 to-pink-50",
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

// ── Collapsible section ──

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 lg:px-6 py-4 text-left hover:bg-gray-50/50 transition-colors duration-150 min-h-[48px]"
      >
        <span className="text-[15px] font-semibold text-gray-900">{title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={`px-4 lg:px-6 pb-5 transition-[opacity,transform] ${
              isOpen
                ? "duration-300 delay-100 opacity-100 translate-y-0"
                : "duration-200 opacity-0 translate-y-1"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lead detail drawer ──

function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onArchive,
  onRestore,
  onDelete,
  onMessage,
}: {
  lead: LeadDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onArchive: (leadId: string, reason: string) => void;
  onRestore: (leadId: string) => void;
  onDelete: (leadId: string) => void;
  onMessage: (leadId: string) => void;
}) {
  const router = useRouter();
  const [showComposer, setShowComposer] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveReason, setArchiveReason] = useState<string | null>(null);
  const [archiveOtherText, setArchiveOtherText] = useState("");
  const [archived, setArchived] = useState(false);
  const [restored, setRestored] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Generate pre-filled template from lead data
  const firstName = lead?.name.split(" ")[0] ?? "";
  const recipientName = lead?.careRecipientName ?? "";
  const defaultTemplate = `Hi ${firstName},\n\nThank you for reaching out about care for ${recipientName}. I'd love to learn more about her needs and discuss how we can help.\n\nWould you be available for a brief call this week to talk through the details?\n\nWarm regards`;
  const [messageText, setMessageText] = useState(defaultTemplate);

  // Reset composer state when drawer closes or lead changes
  useEffect(() => {
    if (!isOpen) {
      setShowComposer(false);
      setMessageSent(false);
      setShowArchive(false);
      setArchiveReason(null);
      setArchiveOtherText("");
      setArchived(false);
      setRestored(false);
      setShowDeleteConfirm(false);
      setSendingMessage(false);
      setSendError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (lead) {
      const fn = lead.name.split(" ")[0];
      const rn = lead.careRecipientName;
      setMessageText(`Hi ${fn},\n\nThank you for reaching out about care for ${rn}. I'd love to learn more about her needs and discuss how we can help.\n\nWould you be available for a brief call this week to talk through the details?\n\nWarm regards`);
      setShowComposer(false);
      setMessageSent(false);
      setShowArchive(false);
      setArchiveReason(null);
      setArchiveOtherText("");
      setArchived(false);
      setRestored(false);
      setShowDeleteConfirm(false);
      setSendingMessage(false);
      setSendError(null);
    }
  }, [lead]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showComposer) {
          setShowComposer(false);
        } else if (showArchive) {
          setShowArchive(false);
          setArchiveReason(null);
          setArchiveOtherText("");
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, showComposer, showArchive, showDeleteConfirm]);

  const handleSendMessage = async () => {
    if (!lead || !lead.connectionId || !messageText.trim()) return;

    setSendingMessage(true);
    setSendError(null);

    try {
      const res = await fetch("/api/connections/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: lead.connectionId,
          text: messageText.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send message");
      }

      setMessageSent(true);
      onMessage(lead.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      setSendError(msg);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleArchive = () => {
    if (!lead || !archiveReason) return;
    setArchived(true);
    onArchive(lead.id, archiveReason);
    setTimeout(() => {
      setArchived(false);
      setShowArchive(false);
      setArchiveReason(null);
      setArchiveOtherText("");
      onClose();
    }, 1500);
  };

  const handleRestore = () => {
    if (!lead) return;
    setRestored(true);
    onRestore(lead.id);
    setTimeout(() => {
      setRestored(false);
      setShowDeleteConfirm(false);
      onClose();
    }, 1500);
  };

  const handleDelete = () => {
    if (!lead) return;
    onDelete(lead.id);
    onClose();
  };

  const ARCHIVE_REASONS = [
    { value: "already_connected", label: "Already connected", description: "We\u2019ve been in touch outside Olera" },
    { value: "not_a_fit", label: "Not a good fit", description: "Care needs, location, or budget don\u2019t match" },
    { value: "not_accepting", label: "Not accepting new clients", description: "We\u2019re at capacity right now" },
    { value: "unable_to_reach", label: "Unable to reach", description: "Tried contacting but no response" },
    { value: "other", label: "Other" },
  ];

  if (!lead) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Bottom sheet on mobile, side drawer on desktop */}
      <div
        className={`fixed z-40 bg-white shadow-2xl flex flex-col will-change-transform transition-transform duration-300 ease-out
          /* Mobile: bottom sheet - use dvh for proper mobile Safari support */
          inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]
          /* Desktop: side drawer */
          lg:inset-y-0 lg:top-16 lg:right-0 lg:left-auto lg:bottom-auto lg:w-[640px] lg:max-w-[calc(100vw-24px)] lg:h-[calc(100dvh-64px)] lg:max-h-none lg:rounded-none lg:pb-0
          ${isOpen
            ? "translate-y-0 lg:translate-x-0"
            : "translate-y-full lg:translate-y-0 lg:translate-x-full"
          }`}
      >
        {/* Mobile drag handle */}
        <div className="lg:hidden pt-3 pb-2 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* ── Fixed header ── */}
        <div className="shrink-0 border-b border-gray-100">
          {/* Lead identity + close button */}
          <div className="px-4 lg:px-6 pt-2 lg:pt-6 pb-4">
            <div className="flex items-start gap-3 lg:gap-4">
              {/* Close button — desktop only, top right */}
              <button
                type="button"
                onClick={onClose}
                className="hidden lg:flex absolute right-6 top-6 w-8 h-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors duration-150"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm`}>
                <span className="text-sm font-bold text-gray-600">{lead.initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg lg:text-xl font-display font-bold text-gray-900 tracking-tight truncate">
                    {lead.name}
                  </h2>
                  {lead.isNew && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-primary-50 text-primary-600 border border-primary-100/50 shrink-0">
                      New
                    </span>
                  )}
                </div>
                <p className="text-sm lg:text-[15px] text-gray-500 mt-0.5">{lead.subtitle}</p>
              </div>
              {/* Mobile close button - top right */}
              <button
                type="button"
                onClick={onClose}
                className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Context pills - horizontal scroll on mobile */}
            <div className="flex items-center gap-2 mt-3 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap scrollbar-hide">
              {/* Urgency or Archived badge */}
              {lead.status === "archived" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                  Archived
                </span>
              ) : (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                lead.urgency === "immediate"
                  ? "bg-red-50 text-red-700 border border-red-100"
                  : lead.urgency === "within_1_month"
                  ? "bg-amber-50 text-amber-700 border border-amber-100"
                  : "bg-blue-50 text-blue-700 border border-blue-100"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  lead.urgency === "immediate" ? "bg-red-400" : lead.urgency === "within_1_month" ? "bg-amber-400" : "bg-blue-400"
                }`} />
                {URGENCY_LABELS[lead.urgency]}
              </span>
              )}
              {/* Location */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 whitespace-nowrap shrink-0">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                {lead.location}
              </span>
              {/* Date */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 whitespace-nowrap shrink-0">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {lead.date}
              </span>
              {/* Contact preference */}
              {lead.contactPreference && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 whitespace-nowrap shrink-0">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    {lead.contactPreference === "phone" ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    )}
                  </svg>
                  {CONTACT_METHOD_LABELS[lead.contactPreference]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable middle ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">

          {/* ── Inline message composer / persistent sent state ── */}
          {(showComposer || lead.messagedAt) && (
            <div className="px-4 lg:px-6 pt-5 pb-2">
              <div className={`rounded-2xl overflow-hidden ${(messageSent || lead.messagedAt) ? "border border-primary-100/60 bg-primary-50/30" : "border border-gray-200 bg-white shadow-sm"}`}>
                {(messageSent || lead.messagedAt) ? (
                  /* ── Persistent confirmation state with actions ── */
                  <div className="px-6 py-8 flex flex-col items-center justify-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-primary-600 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    <p className="text-[15px] font-semibold text-gray-900">Message sent</p>
                    <p className="text-[13px] text-gray-500">{firstName} will receive your message shortly</p>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 w-full mt-2">
                      <button
                        type="button"
                        onClick={() => { onClose(); router.push(`/provider/inbox?id=${lead.connectionId || lead.id}`); }}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-primary-200 bg-white text-[14px] font-semibold text-primary-600 hover:bg-primary-50 hover:border-primary-300 transition-all duration-150 active:scale-[0.98]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                        </svg>
                        Continue in Inbox
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowComposer(false); setMessageSent(false); setShowArchive(true); }}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white text-[14px] font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 active:scale-[0.98]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                        </svg>
                        Archive
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Composer form ── */
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between px-5 pt-4 pb-3">
                      <div>
                        <h3 className="text-[15px] font-semibold text-gray-900">Message {firstName}</h3>
                        <p className="text-[13px] text-gray-400 mt-0.5">
                          {lead.contactPreference ? `${CONTACT_METHOD_LABELS[lead.contactPreference]} \u00b7 ` : ""}Pre-filled template
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowComposer(false)}
                        className="text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors duration-150 pt-0.5"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Textarea */}
                    <div className="px-5 pb-4">
                      <textarea
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        rows={8}
                        disabled={sendingMessage}
                        className="w-full rounded-xl border border-primary-200 bg-primary-50/20 px-4 py-3.5 text-base text-gray-800 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Error message */}
                    {sendError && (
                      <div className="px-5 pb-3">
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                          </svg>
                          <span>{sendError}</span>
                        </div>
                      </div>
                    )}

                    {/* Send button */}
                    <div className="px-5 pb-5">
                      <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={sendingMessage || !messageText.trim() || !lead.connectionId}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary-600 text-[15px] font-semibold text-white shadow-sm hover:bg-primary-700 transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                      >
                        {sendingMessage ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Sending...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                            </svg>
                            Send Message
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Archived banner ── */}
          {lead.status === "archived" && lead.archivedDate && (
            <div className="px-4 lg:px-6 pt-5 pb-2">
              <div className="flex items-start gap-3.5 rounded-2xl bg-gray-50 border border-gray-100 px-5 py-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-800">Archived on {lead.archivedDate}</p>
                  {lead.archiveReason && (
                    <p className="text-[13px] text-gray-400 mt-0.5">Reason: {lead.archiveReason}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 1. Contact Information — 2-column with copy buttons */}
          {(lead.email || lead.phone) ? (
            <CollapsibleSection title="Contact Information">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                {/* Email */}
                <div>
                  <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Email</p>
                  {lead.email ? (
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] text-gray-800 truncate">{lead.email}</p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(lead.email!)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors duration-150 shrink-0"
                        title="Copy email"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[15px] text-gray-400 italic">Not provided</p>
                  )}
                </div>
                {/* Phone */}
                <div>
                  <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Phone</p>
                  {lead.phone ? (
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] text-gray-800 truncate">{lead.phone}</p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(lead.phone!)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors duration-150 shrink-0"
                        title="Copy phone"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[15px] text-gray-400 italic">Not provided</p>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          ) : (
            <CollapsibleSection title="Contact Information">
              <p className="text-[15px] text-gray-400 italic">No contact information provided yet</p>
            </CollapsibleSection>
          )}

          {/* 2. Care Preferences — who needs care, type tags, needs tags */}
          <CollapsibleSection title="Care Preferences">
            {(lead.careRecipient || (lead.careType && lead.careType.length > 0) || (lead.careNeeds && lead.careNeeds.length > 0)) ? (
              <div className="space-y-5">
                {lead.careRecipient && (
                  <div>
                    <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Who needs care</p>
                    <p className="text-[15px] text-gray-800">{lead.careRecipient}</p>
                  </div>
                )}
                {lead.careType && lead.careType.length > 0 && (
                  <div>
                    <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2.5">Type of care</p>
                    <div className="flex flex-wrap gap-2">
                      {lead.careType.map((type) => (
                        <span key={type} className="inline-flex px-3.5 py-1.5 rounded-full bg-primary-50/60 border border-primary-100/40 text-[13px] font-medium text-primary-700">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {lead.careNeeds && lead.careNeeds.length > 0 && (
                  <div>
                    <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2.5">Care needs</p>
                    <div className="flex flex-wrap gap-2">
                      {lead.careNeeds.map((need) => (
                        <span key={need} className="inline-flex px-3.5 py-1.5 rounded-full bg-gray-50 border border-gray-100 text-[13px] font-medium text-gray-600">
                          {need}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[15px] text-gray-400 italic">No care preferences specified yet</p>
            )}
          </CollapsibleSection>

          {/* 3. Living Situation — 2-column grid */}
          <CollapsibleSection title="Living Situation">
            {(lead.livingSituation || lead.schedulePreference || lead.careLocation || lead.languagePreference) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                <div>
                  <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Living situation</p>
                  <p className="text-[15px] text-gray-800">{lead.livingSituation || <span className="text-gray-400 italic">Not provided</span>}</p>
                </div>
                <div>
                  <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Schedule preference</p>
                  <p className="text-[15px] text-gray-800">{lead.schedulePreference || <span className="text-gray-400 italic">Not provided</span>}</p>
                </div>
                <div>
                  <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Care location</p>
                  <p className="text-[15px] text-gray-800">{lead.careLocation || <span className="text-gray-400 italic">Not provided</span>}</p>
                </div>
                <div>
                  <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Language preference</p>
                  <p className="text-[15px] text-gray-800">{lead.languagePreference || <span className="text-gray-400 italic">Not provided</span>}</p>
                </div>
              </div>
            ) : (
              <p className="text-[15px] text-gray-400 italic">No living situation details provided yet</p>
            )}
          </CollapsibleSection>

          {/* 4. Payment & Benefits — insurance type + benefit cards */}
          <CollapsibleSection title="Payment & Benefits">
            {(lead.insuranceType || (lead.benefits && lead.benefits.length > 0)) ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Insurance</p>
                  <p className="text-[15px] text-gray-800">{lead.insuranceType || <span className="text-gray-400 italic">Not provided</span>}</p>
                </div>
                {lead.benefits && lead.benefits.length > 0 && (
                  <div>
                    <p className="text-[12px] text-gray-400 font-semibold uppercase tracking-wider mb-2.5">Saved benefits</p>
                    <div className="space-y-2">
                      {lead.benefits.map((benefit) => (
                        <div key={benefit} className="px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-100">
                          <span className="text-[15px] text-gray-700">{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[15px] text-gray-400 italic">No payment or benefits information yet</p>
            )}
          </CollapsibleSection>

          {/* 5. Additional Notes — blockquote style */}
          <CollapsibleSection title="Additional Notes">
            {lead.additionalNotes ? (
              <div className="border-l-[3px] border-primary-300 bg-primary-50/40 rounded-r-xl rounded-l-sm px-5 py-4">
                <p className="text-[15px] text-gray-700 leading-relaxed">
                  {lead.additionalNotes}
                </p>
              </div>
            ) : (
              <p className="text-[15px] text-gray-400 italic">No additional notes</p>
            )}
          </CollapsibleSection>

          {/* 6. Activity — vertical timeline, collapsed by default */}
          <CollapsibleSection title="Activity" defaultOpen={false}>
            {lead.activity && lead.activity.length > 0 ? (
              <div className="relative pl-5">
                {/* Timeline line */}
                <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-gray-200" />

                <div className="space-y-5">
                  {lead.activity.map((event, idx) => (
                    <div key={idx} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-5 top-1.5 w-[9px] h-[9px] rounded-full bg-gray-300" />
                      <div>
                        <p className="text-[15px] font-medium text-gray-800">{event.label}</p>
                        <p className="text-[13px] text-gray-400 mt-0.5">{event.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[15px] text-gray-400 italic">No activity yet</p>
            )}
          </CollapsibleSection>
        </div>

        {/* ── Fixed footer ── */}
        {lead.status === "archived" ? (
          /* Archived lead footer — Delete + Restore */
          <div className="shrink-0 border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
            {restored ? (
              <div className="px-4 lg:px-6 py-6 lg:py-8 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">Lead restored</p>
                <p className="text-[13px] text-gray-500">Moved back to active leads</p>
              </div>
            ) : showDeleteConfirm ? (
              <div className="px-4 lg:px-6 py-4 lg:py-5">
                <div className="rounded-2xl border border-red-200 bg-red-50/50 px-5 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900">Delete permanently?</p>
                      <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">This will permanently remove this lead and any message history. This action can&apos;t be undone.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl border border-gray-200 bg-white text-[14px] font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 active:scale-[0.98]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl bg-red-600 text-[14px] font-semibold text-white shadow-sm hover:bg-red-700 transition-all duration-150 active:scale-[0.98]"
                    >
                      Yes, Delete Forever
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 lg:px-6 py-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 lg:px-5 py-3 rounded-xl border border-gray-200 text-sm lg:text-[15px] font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 active:scale-[0.98] min-h-[48px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  Delete
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 lg:px-5 py-3 rounded-xl bg-primary-600 text-sm lg:text-[15px] font-semibold text-white shadow-sm hover:bg-primary-700 transition-all duration-150 active:scale-[0.98] min-h-[48px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                  </svg>
                  Restore
                </button>
              </div>
            )}
          </div>
        ) : (showComposer || (lead.messagedAt && !showArchive)) ? null : showArchive ? (
          /* Archive reason selector */
          <div className="shrink-0 border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
            {archived ? (
              <div className="px-4 lg:px-6 py-6 lg:py-8 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-[15px] font-semibold text-gray-900">Lead archived</p>
              </div>
            ) : (
              <div className="px-4 lg:px-6 py-4 lg:py-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold text-gray-900">Why are you archiving?</h3>
                  <button
                    type="button"
                    onClick={() => { setShowArchive(false); setArchiveReason(null); setArchiveOtherText(""); }}
                    className="text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors duration-150"
                  >
                    Cancel
                  </button>
                </div>
                <div className="space-y-2.5">
                  {ARCHIVE_REASONS.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      onClick={() => setArchiveReason(reason.value)}
                      className={`w-full flex items-start gap-3.5 px-4 py-3.5 rounded-xl border text-left transition-all duration-150 ${
                        archiveReason === reason.value
                          ? "border-primary-200 bg-primary-50/30"
                          : "border-gray-100 bg-gray-50/50 hover:border-gray-200"
                      }`}
                    >
                      <div className={`mt-0.5 w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors duration-150 ${
                        archiveReason === reason.value ? "border-primary-500" : "border-gray-300"
                      }`}>
                        {archiveReason === reason.value && (
                          <div className="w-2 h-2 rounded-full bg-primary-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-gray-800">{reason.label}</p>
                        {reason.description && (
                          <p className="text-[13px] text-gray-400 mt-0.5">{reason.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {archiveReason === "other" && (
                  <textarea
                    value={archiveOtherText}
                    onChange={(e) => setArchiveOtherText(e.target.value)}
                    placeholder="Tell us more (optional)"
                    rows={2}
                    className="w-full mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all duration-150"
                  />
                )}
                {archiveReason && (
                  <button
                    type="button"
                    onClick={handleArchive}
                    className="w-full mt-4 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-900 text-[15px] font-semibold text-white shadow-sm hover:bg-gray-800 transition-all duration-150 active:scale-[0.98]"
                  >
                    Archive Lead
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Default footer buttons — active leads */
          <div className="shrink-0 border-t border-gray-100 px-4 lg:px-6 py-4 flex items-center gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setShowArchive(true)}
              className="inline-flex items-center justify-center gap-2 px-4 lg:px-5 py-3 rounded-xl border border-gray-200 text-sm lg:text-[15px] font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 active:scale-[0.98] min-h-[48px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
              Archive
            </button>
            <button
              type="button"
              onClick={() => { setShowComposer(true); scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 lg:px-5 py-3 rounded-xl bg-primary-600 text-sm lg:text-[15px] font-semibold text-white shadow-sm hover:bg-primary-700 transition-all duration-150 active:scale-[0.98] min-h-[48px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
              Message
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Helpers for mapping connections to leads ──

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Migrate old unscoped leads key to new profile-scoped key (one-time) */
function migrateLeadsViewedData(providerProfileId: string): void {
  const OLD_KEY = "olera_leads_viewed";
  const newKey = `olera_leads_viewed_${providerProfileId}`;
  const migrationFlag = `olera_leads_migrated_${providerProfileId}`;

  try {
    if (localStorage.getItem(migrationFlag)) return;

    const oldData = localStorage.getItem(OLD_KEY);
    if (oldData) {
      const existingNew = localStorage.getItem(newKey);
      if (!existingNew) {
        localStorage.setItem(newKey, oldData);
      } else {
        const oldIds: string[] = JSON.parse(oldData);
        const newIds: string[] = JSON.parse(existingNew);
        const merged = [...new Set([...oldIds, ...newIds])];
        localStorage.setItem(newKey, JSON.stringify(merged));
      }
    }
    localStorage.setItem(migrationFlag, "1");
  } catch {
    // localStorage unavailable
  }
}

interface ConnectionWithProfile extends Connection {
  fromProfile?: Profile | null;
  toProfile?: Profile | null;
  /** For provider-initiated requests, family is in toProfile */
  _familyProfile?: Profile | null;
}

function mapConnectionToLead(conn: ConnectionWithProfile, providerProfileId: string): LeadDetail {
  const meta = conn.metadata as Record<string, unknown> | undefined;
  const thread = (meta?.thread as Array<{ from_profile_id: string; text: string; created_at: string }>) || [];
  const isArchived = meta?.archived === true;
  // For provider-initiated requests (type="request"), family is in toProfile
  // For family-initiated inquiries (type="inquiry"), family is in fromProfile
  const familyProfile = conn._familyProfile || conn.fromProfile;

  // Parse the message JSON for care details
  let careDetails: Record<string, unknown> = {};
  try {
    careDetails = conn.message ? JSON.parse(conn.message) : {};
  } catch {
    careDetails = {};
  }

  // For provider-initiated requests, also check family profile metadata for care info
  // IMPORTANT: Prefer fresh profile data over stale message JSON for up-to-date info
  const familyMeta = (familyProfile?.metadata || {}) as Record<string, unknown>;
  const isProviderInitiated = conn.type === "request" && meta?.provider_initiated;

  // Name: prefer fresh profile display_name, fall back to message JSON for backward compat
  const profileDisplayName = familyProfile?.display_name || "";
  const messageFirstName = careDetails.seeker_first_name as string;
  const messageLastName = careDetails.seeker_last_name as string;

  let fullName: string;
  if (profileDisplayName && profileDisplayName !== messageFirstName?.split("@")[0]) {
    // Profile has a real name (not just email prefix)
    fullName = profileDisplayName;
  } else if (messageFirstName) {
    // Fall back to message JSON
    fullName = `${messageFirstName} ${messageLastName || ""}`.trim();
  } else {
    fullName = profileDisplayName || "Unknown";
  }

  // Determine urgency: prefer fresh profile metadata, fall back to connection message
  const urgencyMap: Record<string, Urgency> = {
    asap: "immediate",
    within_month: "within_1_month",
    within_1_month: "within_1_month",
    few_months: "exploring", // Map "within 3 months" to exploring (less urgent)
    within_3_months: "exploring",
    researching: "exploring",
    exploring: "exploring",
    immediate: "immediate",
  };
  // Prefer fresh profile metadata over stale message JSON
  const rawUrgency = (familyMeta.timeline as string) || (careDetails.urgency as string);
  const urgency = urgencyMap[rawUrgency] || "exploring";

  // Pull care needs from fresh profile (with message fallback)
  const profileCareTypes = familyProfile?.care_types || [];
  const profileCareNeeds = (familyMeta.care_needs as string[]) || [];
  const messageCareType = careDetails.care_type as string;

  // Additional profile metadata fields (fresh data)
  const livingSituation = familyMeta.living_situation as string | undefined;
  const schedulePreference = familyMeta.schedule_preference as string | undefined;
  const careLocation = familyMeta.care_location as string | undefined;
  const languagePreference = familyMeta.language_preference as string | undefined;

  // Map contact preference to ContactMethod type
  const contactPrefMap: Record<string, ContactMethod> = {
    call: "phone",
    phone: "phone",
    text: "phone", // Text usually means phone
    email: "email",
    either: "either",
  };
  const rawContactPref = familyMeta.contact_preference as string | undefined;
  const contactPreference = rawContactPref ? contactPrefMap[rawContactPref] : undefined;

  // Determine status
  const hasProviderReply = thread.some((msg) => msg.from_profile_id === providerProfileId);
  let status: LeadStatus = "new";
  if (isArchived) {
    status = "archived";
  } else if (hasProviderReply) {
    status = "replied";
  } else if (conn.status === "pending" && thread.length === 0) {
    status = "new";
  } else {
    status = "no_reply";
  }

  // Build activity timeline
  const activity: ActivityEvent[] = [
    {
      label: isProviderInitiated ? "Connection accepted" : "Lead received",
      date: `${timeAgo(conn.created_at)} · Via Olera`,
    },
  ];
  for (const msg of thread) {
    if (msg.from_profile_id === providerProfileId) {
      activity.push({ label: "You sent a message", date: timeAgo(msg.created_at) });
    } else {
      activity.push({ label: "Family responded", date: timeAgo(msg.created_at) });
    }
  }

  // Care recipient: prefer fresh profile metadata, fall back to message JSON
  const careRecipientMap: Record<string, string> = {
    parent: "Parent",
    "My parent": "Parent",
    spouse: "Spouse",
    "My spouse": "Spouse",
    self: "Self",
    "Myself": "Self",
    other: "Family member",
    "Someone else": "Family member",
  };
  const rawCareRecipient = (familyMeta.relationship_to_recipient as string) || (careDetails.care_recipient as string);
  const careRecipient = careRecipientMap[rawCareRecipient] || "Family member";

  // Check if this is a "new" lead (not viewed yet) - scoped by provider profile
  let isNew = false;
  try {
    // Migrate old data on first access
    migrateLeadsViewedData(providerProfileId);
    const leadsKey = `olera_leads_viewed_${providerProfileId}`;
    const viewedIds = JSON.parse(localStorage.getItem(leadsKey) || "[]");
    isNew = !viewedIds.includes(conn.id) && status !== "archived" && status !== "replied";
  } catch {
    isNew = status === "new";
  }

  // Location: prefer looking_in from message (provider's location), fall back to family profile
  const lookingInCity = careDetails.looking_in_city as string | undefined;
  const lookingInState = careDetails.looking_in_state as string | undefined;
  let location: string;
  if (lookingInCity && lookingInState) {
    location = `${lookingInCity}, ${lookingInState}`;
  } else if (lookingInCity || lookingInState) {
    location = lookingInCity || lookingInState || "";
  } else if (familyProfile?.city && familyProfile?.state) {
    location = `${familyProfile.city}, ${familyProfile.state}`;
  } else {
    location = "—";
  }

  // Email: prefer fresh profile, fall back to message
  const email = familyProfile?.email || (careDetails.seeker_email as string) || undefined;
  // Phone: prefer fresh profile, fall back to message
  const phone = familyProfile?.phone || (careDetails.seeker_phone as string) || undefined;

  return {
    id: conn.id,
    connectionId: conn.id,
    name: fullName,
    initials: getInitials(fullName),
    subtitle: `For ${careRecipient.toLowerCase()}`,
    location,
    urgency,
    status,
    date: timeAgo(conn.created_at),
    isNew,
    email,
    phone,
    careRecipient,
    // Fresh profile data for enriched lead details
    careType: profileCareTypes.length > 0 ? profileCareTypes : (messageCareType ? [messageCareType] : undefined),
    careNeeds: profileCareNeeds.length > 0 ? profileCareNeeds : undefined,
    livingSituation,
    schedulePreference,
    careLocation,
    languagePreference,
    contactPreference,
    additionalNotes: (careDetails.additional_notes as string) || (meta?.auto_intro as string) || undefined,
    activity,
  };
}

// ── Page ──

export default function ProviderLeadsPage() {
  const providerProfile = useProviderProfile();
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("best_match");
  const [leads, setLeads] = useState<LeadDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const fetchedRef = useRef(false);

  // Fetch leads (connections) from Supabase
  const fetchLeads = useCallback(async (isInitialLoad = false) => {
    if (!providerProfile) return;
    if (!isSupabaseConfigured()) {
      if (isInitialLoad) setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const profileId = providerProfile.id;

      // Fetch TWO types of connections that should appear as leads:
      // 1. Family-initiated inquiries (type="inquiry") where provider is recipient
      // 2. Provider-initiated requests (type="request") that were accepted by family
      const [inquiriesResult, acceptedRequestsResult] = await Promise.all([
        // Query 1: Family-initiated inquiries (existing behavior)
        supabase
          .from("connections")
          .select("*, fromProfile:from_profile_id(id, display_name, email, phone, city, state, type, care_types, metadata)")
          .eq("to_profile_id", profileId)
          .eq("type", "inquiry")
          .in("status", ["pending", "accepted"])
          .order("created_at", { ascending: false }),

        // Query 2: Accepted provider-initiated requests (NEW - these should also be leads)
        supabase
          .from("connections")
          .select("*, toProfile:to_profile_id(id, display_name, email, phone, city, state, type, care_types, metadata)")
          .eq("from_profile_id", profileId)
          .eq("type", "request")
          .eq("status", "accepted")
          .order("created_at", { ascending: false }),
      ]);

      if (inquiriesResult.error) {
        console.error("Failed to fetch inquiry leads:", inquiriesResult.error);
        if (isInitialLoad) setIsLoading(false);
        return;
      }

      if (acceptedRequestsResult.error) {
        console.error("Failed to fetch accepted request leads:", acceptedRequestsResult.error);
        // Continue with just inquiries if this fails
      }

      // Combine and deduplicate connections
      const inquiries = (inquiriesResult.data || []) as ConnectionWithProfile[];
      const acceptedRequests = ((acceptedRequestsResult.data || []) as ConnectionWithProfile[]).map((conn) => ({
        ...conn,
        _familyProfile: conn.toProfile, // Mark family profile for mapping
      }));

      const allConnections = [...inquiries, ...acceptedRequests];
      const uniqueConnections = allConnections.filter(
        (conn, index, self) => self.findIndex((c) => c.id === conn.id) === index
      );

      // Map connections to leads, filtering out hidden ones
      const mappedLeads = uniqueConnections
        .filter((conn) => {
          const meta = conn.metadata as Record<string, unknown> | undefined;
          return !meta?.hidden;
        })
        .map((conn) => mapConnectionToLead(conn, profileId));

      // Sort by created_at descending
      mappedLeads.sort((a, b) => {
        const connA = uniqueConnections.find((c) => c.id === a.id);
        const connB = uniqueConnections.find((c) => c.id === b.id);
        return new Date(connB?.created_at || 0).getTime() - new Date(connA?.created_at || 0).getTime();
      });

      setLeads(mappedLeads);
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      if (isInitialLoad) setIsLoading(false);
    }
  }, [providerProfile]);

  // Initial fetch
  useEffect(() => {
    if (!providerProfile || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchLeads(true);
  }, [providerProfile, fetchLeads]);

  // Poll for updates every 45 seconds (family profile changes, new leads)
  useEffect(() => {
    if (!providerProfile) return;

    const interval = setInterval(() => {
      fetchLeads(false);
    }, 45000);

    return () => clearInterval(interval);
  }, [providerProfile, fetchLeads]);

  // Broadcast new-leads count to Navbar badge and persist to localStorage (profile-scoped)
  const newLeadsCount = useMemo(() => leads.filter((l) => l.isNew).length, [leads]);
  useEffect(() => {
    if (!providerProfile) return;
    const countKey = `olera_leads_new_count_${providerProfile.id}`;
    try { localStorage.setItem(countKey, String(newLeadsCount)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent("olera:leads-count", { detail: { count: newLeadsCount, profileId: providerProfile.id } }));
  }, [newLeadsCount, providerProfile]);

  // Derive selectedLead from current leads so it stays in sync after archive/restore
  const selectedLead = useMemo(
    () => (selectedLeadId ? leads.find((l) => l.id === selectedLeadId) ?? null : null),
    [selectedLeadId, leads]
  );

  const openDrawer = useCallback((lead: LeadDetail) => {
    setSelectedLeadId(lead.id);
    setIsDrawerOpen(true);
    // Clear "New" badge once viewed and persist to localStorage
    if (lead.isNew && providerProfile) {
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, isNew: false } : l))
      );
      // Persist viewed status to localStorage (scoped by provider profile)
      try {
        const leadsKey = `olera_leads_viewed_${providerProfile.id}`;
        const viewedIds: string[] = JSON.parse(localStorage.getItem(leadsKey) || "[]");
        if (!viewedIds.includes(lead.id)) {
          viewedIds.push(lead.id);
          localStorage.setItem(leadsKey, JSON.stringify(viewedIds));
        }
      } catch {
        // localStorage unavailable
      }
    }
  }, [providerProfile]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const handleArchiveLead = useCallback((leadId: string, reason: string) => {
    const reasonLabel = {
      already_connected: "Already connected",
      not_a_fit: "Not a good fit",
      not_accepting: "Not accepting new clients",
      unable_to_reach: "Unable to reach",
      other: "Other",
    }[reason] || reason;

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, status: "archived" as LeadStatus, archivedDate: "Feb 26, 2026", archiveReason: reasonLabel }
          : l
      )
    );
  }, []);

  const handleRestoreLead = useCallback((leadId: string) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, status: "new" as LeadStatus, archivedDate: undefined, archiveReason: undefined }
          : l
      )
    );
  }, []);

  const handleDeleteLead = useCallback((leadId: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setSelectedLeadId(null);
  }, []);

  const handleMessageLead = useCallback((leadId: string) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, messagedAt: "Just now", status: "replied" as LeadStatus }
          : l
      )
    );
  }, []);

  const filteredLeads = useMemo(() => {
    if (activeFilter === "archived") {
      return leads.filter((l) => l.status === "archived");
    } else if (activeFilter !== "all") {
      return leads.filter((l) => l.urgency === activeFilter && l.status !== "archived");
    } else {
      return leads.filter((l) => l.status !== "archived");
    }
  }, [activeFilter, leads]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-32 bg-warm-100 rounded-lg mb-2" />
            <div className="h-4 w-72 bg-warm-50 rounded mb-8" />
            <div className="h-12 w-full max-w-md bg-vanilla-50 border border-warm-100/60 rounded-xl mb-5" />
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-warm-100/60 p-5">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-warm-100 shrink-0" />
                    <div className="flex-1">
                      <div className="h-5 w-32 bg-warm-100 rounded mb-2" />
                      <div className="h-3 w-48 bg-warm-50 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ── Page header ── */}
      <div className="mb-5 lg:mb-8">
        <h1 className="text-2xl lg:text-[28px] font-display font-bold text-gray-900 tracking-tight">
          Leads
        </h1>
        <p className="text-sm lg:text-[15px] text-gray-500 mt-1 lg:mt-1.5 leading-relaxed">
          Families who found you and connected.
        </p>
      </div>

      {/* ── Filter tabs + Sort ── */}
      <div className="flex items-center justify-between gap-3 mb-4 lg:mb-5">
        {/* Filter tabs - horizontal scroll on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 flex-1 scrollbar-hide">
          <div className="flex gap-0.5 bg-vanilla-50 border border-warm-100/60 p-0.5 rounded-xl w-max">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={[
                  "px-3.5 lg:px-5 py-2 lg:py-2.5 rounded-[10px] text-[13px] lg:text-sm font-semibold whitespace-nowrap transition-all duration-150 min-h-[40px] lg:min-h-[44px] flex items-center",
                  activeFilter === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop sort dropdown */}
        <div className="hidden lg:flex items-center shrink-0">
          <span className="text-sm text-gray-400 mr-2">Sort by:</span>
          <Select
            options={SORT_OPTIONS.map(opt => ({ value: opt.id, label: opt.label }))}
            value={sortBy}
            onChange={(val) => setSortBy(val as SortOption)}
            size="sm"
            className="w-40"
          />
        </div>
      </div>

      {/* ── Leads list ── */}
      {filteredLeads.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
          {/* Table header - desktop only */}
          <div className="hidden lg:grid grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr_0.8fr] gap-6 px-8 py-3.5 border-b border-gray-200/80 bg-gray-50/40">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Name</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Email</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Phone</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Location</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</span>
          </div>

          {/* Lead rows */}
          {filteredLeads.map((lead, idx) => (
            <div
              key={lead.id}
              onClick={() => openDrawer(lead)}
              className={[
                "group transition-colors duration-150 cursor-pointer",
                "lg:hover:bg-vanilla-50/80",
                idx < filteredLeads.length - 1 ? "border-b border-gray-100 lg:border-gray-200/60" : "",
              ].join(" ")}
            >
              {/* Mobile card layout - redesigned for clarity */}
              <div className="lg:hidden px-4 py-4 active:bg-vanilla-50/60">
                <div className="flex items-start gap-3.5">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center ring-2 ring-white shadow-sm shrink-0`}>
                    <span className="text-sm font-bold text-gray-600">{lead.initials}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Name row */}
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[15px] font-semibold text-gray-900 truncate">{lead.name}</h3>
                      {lead.isNew && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-primary-50 text-primary-600 border border-primary-100/50 shrink-0">
                          New
                        </span>
                      )}
                    </div>

                    {/* Contact info */}
                    <div className="space-y-0.5 mb-2">
                      <p className="text-sm text-gray-600 truncate">{lead.email || "—"}</p>
                      <p className="text-sm text-gray-500 truncate">{lead.phone || "—"}</p>
                    </div>

                    {/* Meta row - location + date */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs font-medium text-gray-600">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                        </svg>
                        {lead.location}
                      </span>
                      <span className="text-xs text-gray-400">{lead.date}</span>
                    </div>
                  </div>

                  {/* Chevron */}
                  <svg className="w-5 h-5 text-gray-300 shrink-0 mt-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>

              {/* Desktop table layout */}
              <div className="hidden lg:grid grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr_0.8fr] gap-6 items-center px-8 py-5">
                {/* Name */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm`}>
                    <span className="text-sm font-bold text-gray-600">{lead.initials}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <p className="text-[15px] font-semibold text-gray-900 truncate">{lead.name}</p>
                      {lead.isNew && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-primary-50 text-primary-600 border border-primary-100/50 shrink-0">
                          New
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Email */}
                <span className="text-[14px] text-gray-600 truncate">{lead.email || "—"}</span>

                {/* Phone */}
                <span className="text-[14px] text-gray-600 truncate">{lead.phone || "—"}</span>

                {/* Location */}
                <span className="text-[14px] text-gray-500 truncate">{lead.location}</span>

                {/* Status */}
                <span className="text-[14px] text-gray-600">{STATUS_LABELS[lead.status]}</span>

                {/* Date */}
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-gray-400">{lead.date}</span>
                  {/* Chevron - appears on hover */}
                  <svg className="w-5 h-5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-150 -mr-1" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Empty state ── */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="flex flex-col items-center text-center py-24 px-8">
            <div className="relative mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-warm-50 to-vanilla-100 border border-warm-100/60 flex items-center justify-center shadow-sm">
                <svg className="w-10 h-10 text-warm-300" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              </div>
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary-100 border-2 border-white flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
              </div>
            </div>

            <h3 className="text-xl font-display font-bold text-gray-900 tracking-tight">
              {activeFilter === "archived" ? "No archived leads" : "No leads yet"}
            </h3>
            <p className="text-[15px] text-gray-500 mt-2.5 leading-relaxed max-w-md">
              {activeFilter === "archived"
                ? "Leads you archive will appear here."
                : "When families find your profile and reach out, they\u2019ll appear here. Start connecting to get the conversation going."}
            </p>

            {activeFilter !== "archived" && (
              <Link
                href="/provider/matches"
                className="mt-8 inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold shadow-sm hover:bg-gray-800 transition-all duration-200 hover:shadow-md"
              >
                Reach out to families looking for care
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>

      {/* ── Lead detail drawer ── */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onArchive={handleArchiveLead}
        onRestore={handleRestoreLead}
        onDelete={handleDeleteLead}
        onMessage={handleMessageLead}
      />
    </div>
  );
}

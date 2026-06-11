"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useAuth } from "@/components/auth/AuthProvider";
import { markLeadAsRead } from "@/hooks/useUnreadLeadsCount";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Connection, Profile } from "@/lib/types";
import { useProviderVerification } from "@/lib/hooks/useProviderVerification";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import { formatRedactedName } from "@/lib/utils/pii-redaction";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import VerifyToUnlockPrompt from "@/components/provider/VerifyToUnlockPrompt";
import Pagination from "@/components/ui/Pagination";
import ArchiveLeadModal from "@/components/provider/ArchiveLeadModal";

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
  // Contact info (Step 1)
  email?: string;
  phone?: string;
  contactPreference?: ContactMethod;
  // Care recipient (Step 2)
  careRecipient?: string;
  careRecipientAge?: number;
  aboutSituation?: string;
  // Care needs (Step 3)
  careType?: string[];
  careNeeds?: string[];
  timeline?: string;
  schedulePreference?: string;
  // Payment (Step 4)
  paymentMethods?: string[];
  // System fields
  activity?: ActivityEvent[];
  archivedDate?: string;
  archiveReason?: string;
  messagedAt?: string;
  connectionId?: string;
  // Profile metadata
  profileCompleteness?: number;
  memberSince?: string;
}

// ── Types ──

type StatusFilter = "active" | "archived";
type LeadStatus = "new" | "replied" | "archived";
type Urgency = "immediate" | "within_1_month" | "exploring";
type ContactMethod = "phone" | "email" | "either";

// ── Config ──

const FILTER_TABS: { id: StatusFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
];

const PAGE_SIZE = 15;

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

// ── Lead detail inline view (desktop) ──

function LeadDetailInlineView({
  lead,
  isVerified,
  onClose,
  onPhoneClick,
  onEmailClick,
  onContinueInInbox,
  onArchiveClick,
  onVerifyClick,
  onRestore,
  onDelete,
}: {
  lead: LeadDetail;
  isVerified: boolean;
  onClose: () => void;
  onPhoneClick?: (leadId: string) => void;
  onEmailClick?: (leadId: string) => void;
  onContinueInInbox?: (leadId: string) => void;
  onArchiveClick?: () => void;
  onVerifyClick?: () => void;
  onRestore?: (leadId: string) => void;
  onDelete?: (leadId: string) => void;
}) {
  const [copiedField, setCopiedField] = useState<"phone" | "email" | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [restored, setRestored] = useState(false);
  const [showFullDetails, setShowFullDetails] = useState(false);

  // Reset collapsed state when lead changes
  useEffect(() => {
    setShowFullDetails(false);
  }, [lead.id]);

  const displayName = isVerified ? lead.name : formatRedactedName(lead.name);

  // Smart text truncation that respects word boundaries
  const getTruncatedText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  };

  const copyToClipboard = async (text: string, field: "phone" | "email") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      if (field === "phone") onPhoneClick?.(lead.id);
      if (field === "email") onEmailClick?.(lead.id);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      // Still set the field to show feedback, but copy failed
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1000);
    }
  };

  const handleRestore = () => {
    if (!lead) return;
    setRestored(true);
    onRestore?.(lead.id);
    setTimeout(() => {
      setRestored(false);
      setShowDeleteConfirm(false);
      onClose();
    }, 1500);
  };

  const handleDelete = () => {
    if (!lead) return;
    onDelete?.(lead.id);
    onClose();
  };

  // Status tag
  const statusTag = lead.status === "archived" ? (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200 shrink-0">
      Archived
    </span>
  ) : lead.isNew ? (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
      New
    </span>
  ) : lead.status === "replied" ? (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-amber-50 text-amber-700 border border-amber-100 shrink-0">
      Replied
    </span>
  ) : (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200 shrink-0">
      Viewed
    </span>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 sticky top-6 h-[calc(100vh-10rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 h-20 px-4 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center text-base font-semibold text-white shrink-0`}>
            {lead.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{displayName}</h2>
              {statusTag}
            </div>
            <p className="text-[14px] text-gray-600 mt-0.5">Reached out {lead.date}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0 -mt-1"
            aria-label="Close lead details"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-5 space-y-6">
        {/* Archived banner */}
        {lead.status === "archived" && lead.archivedDate && (
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
        )}

        {/* Summary Card */}
        <div className="rounded-2xl bg-stone-50 px-4 py-4 flex gap-4">
          {/* Large icon */}
          <div className="shrink-0 w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[15px] font-semibold text-gray-900 leading-snug">
              Looking for {lead.careType?.[0] || "care"} in {lead.location || "their area"}
            </p>
            {lead.timeline && (
              <p className="text-[15px] text-gray-700 leading-snug">
                Hoping to start {
                  lead.timeline === "asap" || lead.timeline === "immediate" ? "immediately" :
                  lead.timeline === "within_month" || lead.timeline === "within_1_month" ? "within about a month" :
                  lead.timeline === "few_months" || lead.timeline === "within_3_months" ? "within a few months" :
                  lead.timeline === "exploring" || lead.timeline === "researching" ? "(currently exploring options)" :
                  lead.timeline
                }
              </p>
            )}
            {lead.paymentMethods && lead.paymentMethods.length > 0 && (
              <p className="text-[15px] text-gray-700 leading-snug">
                Payment: {
                  lead.paymentMethods.length <= 2
                    ? lead.paymentMethods.join(", ")
                    : `${lead.paymentMethods.slice(0, 2).join(", ")}, +${lead.paymentMethods.length - 2} more`
                }
              </p>
            )}
          </div>
        </div>

        {/* Contact */}
        {isVerified ? (
          (lead.email || lead.phone) && (
            <div>
              <h4 className="text-base font-display font-bold text-gray-900 mb-1.5">Contact</h4>
              <div className="space-y-1.5">
                {lead.phone && (
                  <div className="group flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-700 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                    <p className="text-[15px] text-gray-900 truncate">{lead.phone}</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(lead.phone!, "phone")}
                      className={`p-1.5 rounded-md transition-all shrink-0 ${
                        copiedField === "phone"
                          ? "bg-primary-100 text-primary-700"
                          : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      }`}
                    >
                      {copiedField === "phone" ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
                {lead.email && (
                  <div className="group flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-700 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    </svg>
                    <p className="text-[15px] text-gray-900 truncate">{lead.email}</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(lead.email!, "email")}
                      className={`p-1.5 rounded-md transition-all shrink-0 ${
                        copiedField === "email"
                          ? "bg-primary-100 text-primary-700"
                          : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      }`}
                    >
                      {copiedField === "email" ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="px-3.5 py-3 border border-gray-200 rounded-lg bg-gray-50">
            <VerifyToUnlockPrompt
              action="see contact info"
              onVerifyClick={onVerifyClick || (() => {})}
              variant="block"
            />
          </div>
        )}

        {/* Details (collapsible) */}
        {lead.aboutSituation && (
          <div className="space-y-1.5">
            <h4 className="text-base font-display font-bold text-gray-900">Details</h4>

            {!showFullDetails ? (
              <>
                <p className="text-[15px] text-gray-900 leading-relaxed">
                  {getTruncatedText(lead.aboutSituation, 80)}
                </p>
                {lead.aboutSituation.length > 80 && (
                  <button
                    onClick={() => setShowFullDetails(true)}
                    className="flex items-center gap-1.5 text-[15px] font-medium text-teal-700 hover:text-teal-800 transition-colors"
                    aria-expanded="false"
                    aria-label="Read full details"
                  >
                    Read more
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-[15px] text-gray-900 leading-relaxed">
                  {lead.aboutSituation}
                </p>
                <button
                  onClick={() => setShowFullDetails(false)}
                  className="flex items-center gap-1.5 text-[15px] font-semibold text-teal-700 hover:text-teal-800 transition-colors"
                  aria-expanded="true"
                  aria-label="Show less details"
                >
                  Show less
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                  </svg>
                </button>

                <div className="pt-4 border-t border-gray-200 space-y-3">
                  {lead.careRecipient && (
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] text-gray-600">Who needs care</span>
                      <span className="text-[15px] font-medium text-gray-900">
                        {lead.careRecipient}{lead.careRecipientAge ? `, ${lead.careRecipientAge}` : ""}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const parts: string[] = [];
                    if (lead.contactPreference) {
                      const contactMap: Record<string, string> = {
                        phone: "Phone calls",
                        email: "Email",
                        either: "Call or email",
                      };
                      parts.push(contactMap[lead.contactPreference] || lead.contactPreference);
                    }
                    if (lead.schedulePreference) {
                      const scheduleMap: Record<string, string> = {
                        mornings: "mornings",
                        afternoons: "afternoons",
                        evenings: "evenings",
                        overnight: "overnight",
                        full_time: "full-time",
                        flexible: "flexible",
                      };
                      parts.push(scheduleMap[lead.schedulePreference] || lead.schedulePreference);
                    }
                    const preferencesDisplay = parts.length > 0 ? parts.join(", ") : null;
                    return preferencesDisplay ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] text-gray-600">Preferences</span>
                        <span className="text-[15px] font-medium text-gray-900 text-right">{preferencesDisplay}</span>
                      </div>
                    ) : null;
                  })()}
                  {lead.careNeeds && lead.careNeeds.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] text-gray-600">Help with</span>
                      <span className="text-[15px] font-medium text-gray-900 text-right">{lead.careNeeds.join(", ")}</span>
                    </div>
                  )}
                  {lead.memberSince && (
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] text-gray-600">Member since</span>
                      <span className="text-[15px] font-medium text-gray-900">
                        {lead.memberSince}{lead.profileCompleteness !== undefined ? ` · profile ${lead.profileCompleteness}%` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="shrink-0 border-t border-gray-100 px-6 pt-4 pb-4 bg-white z-10">
        {lead.status === "archived" ? (
          // Archived footer - Restore/Delete
          restored ? (
            <div className="flex flex-col items-center justify-center gap-3 py-2">
              <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-gray-900">Lead restored</p>
              <p className="text-[13px] text-gray-500">Moved back to active leads</p>
            </div>
          ) : showDeleteConfirm ? (
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
                  className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl border border-gray-200 bg-white text-[14px] font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl bg-red-600 text-[14px] font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  Yes, Delete Forever
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                Delete
              </button>
              <button
                type="button"
                onClick={handleRestore}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Restore
              </button>
            </div>
          )
        ) : isVerified ? (
          // Active footer - horizontal layout with helper text
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onArchiveClick}
                className="flex-1 px-4 py-3.5 border border-gray-300 bg-white text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center justify-center gap-2"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => onContinueInInbox?.(lead.id)}
                className="flex-[2] px-4 py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                {(() => {
                  if (!lead.name) return 'Message Care Seeker';
                  const firstName = lead.name.split(' ')[0];
                  if (firstName.length > 1 && firstName.toLowerCase() !== 'care') {
                    return `Message ${firstName}`;
                  }
                  return 'Message Care Seeker';
                })()}
              </button>
            </div>
            <p className="text-center text-[13px] text-gray-500 flex items-center justify-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Free to message — you won&apos;t be charged
            </p>
          </div>
        ) : (
          // Not verified footer
          <button
            type="button"
            onClick={onVerifyClick}
            className="w-full px-4 py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            Verify to continue
          </button>
        )}
      </div>
    </div>
  );
}

// ── Lead detail drawer ──

function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onRestore,
  onDelete,
  onPhoneClick,
  onEmailClick,
  onContinueInInbox,
  onMarkAsReplied,
  onArchiveClick,
  isVerified = true,
  onVerifyClick,
}: {
  lead: LeadDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (leadId: string) => void;
  onDelete: (leadId: string) => void;
  onPhoneClick?: (leadId: string) => void;
  onEmailClick?: (leadId: string) => void;
  onContinueInInbox?: (leadId: string) => void;
  onMarkAsReplied?: (leadId: string) => void;
  onArchiveClick?: (leadId: string) => void;
  isVerified?: boolean;
  onVerifyClick?: () => void;
}) {
  const router = useRouter();
  const [restored, setRestored] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copiedField, setCopiedField] = useState<"phone" | "email" | null>(null);
  const [showFullDetails, setShowFullDetails] = useState(false);

  // Display name: full name if verified, redacted if not
  const displayName = lead ? (isVerified ? lead.name : formatRedactedName(lead.name)) : "";

  // Helper to truncate text at word boundary
  const getTruncatedText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  };

  // Copy to clipboard with feedback
  const copyToClipboard = (text: string, field: "phone" | "email") => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);

    // Track copy action (marks as connected)
    if (field === "phone") {
      onPhoneClick?.(lead?.id || "");
    } else {
      onEmailClick?.(lead?.id || "");
    }

    setTimeout(() => setCopiedField(null), 2000);
  };

  // Reset state when drawer closes or lead changes
  useEffect(() => {
    if (!isOpen) {
      setRestored(false);
      setShowDeleteConfirm(false);
      setCopiedField(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (lead) {
      setRestored(false);
      setShowDeleteConfirm(false);
      setCopiedField(null);
      setShowFullDetails(false);
    }
  }, [lead?.id]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteConfirm) {
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
  }, [isOpen, onClose, showDeleteConfirm]);

  // Navigate to inbox to continue conversation
  const handleContinueInInbox = () => {
    if (!lead) return;
    onContinueInInbox?.(lead.id);
    router.push(`/provider/inbox?id=${lead.connectionId || lead.id}`);
    onClose();
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

  if (!lead) return null;

  // ── Sticky Header Content ──
  // Status tag matches list view styling
  const statusTag = lead.status === "archived" ? (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200 shrink-0">
      Archived
    </span>
  ) : lead.isNew ? (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
      New
    </span>
  ) : lead.status === "replied" ? (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-amber-50 text-amber-700 border border-amber-100 shrink-0">
      Replied
    </span>
  ) : (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200 shrink-0">
      Viewed
    </span>
  );

  const StickyHeader = (
    <div className="flex items-start gap-3">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center text-base font-semibold text-white shrink-0`}>
        {lead.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{displayName}</h2>
          {statusTag}
        </div>
        <p className="text-[14px] text-gray-600 mt-0.5">Reached out {lead.date}</p>
      </div>
    </div>
  );

  // ── Contact Information Section ──
  // Apple-minimal design: section header + clean rows, no borders
  const ContactInfoSection = isVerified ? (
    (lead.email || lead.phone) ? (
      <div>
        <p className="text-lg font-semibold text-gray-900 mb-2.5">Contact information</p>
        <div className="space-y-1.5">
          {lead.phone && (
            <div className="group flex items-center gap-1.5">
              {/* Phone icon */}
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
              </svg>
              <div className="min-w-0">
                <p className="text-base font-medium text-gray-900 truncate">{lead.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(lead.phone!, "phone")}
                className={`p-2 md:p-1.5 rounded-md transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${
                  copiedField === "phone"
                    ? "bg-primary-100 text-primary-700"
                    : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                }`}
                aria-label={copiedField === "phone" ? "Copied!" : "Copy phone"}
              >
                {copiedField === "phone" ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                  </svg>
                )}
              </button>
            </div>
          )}
          {lead.email && (
            <div className="group flex items-center gap-1.5">
              {/* Email icon */}
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              <div className="min-w-0">
                <p className="text-base font-medium text-gray-900 truncate">{lead.email}</p>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(lead.email!, "email")}
                className={`p-2 md:p-1.5 rounded-md transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${
                  copiedField === "email"
                    ? "bg-primary-100 text-primary-700"
                    : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                }`}
                aria-label={copiedField === "email" ? "Copied!" : "Copy email"}
              >
                {copiedField === "email" ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    ) : (
      <div className="px-3.5 py-3 border border-gray-200 rounded-lg bg-gray-50">
        <p className="text-sm text-gray-500">No contact information provided yet</p>
      </div>
    )
  ) : (
    <div className="px-3.5 py-3 border border-gray-200 rounded-lg bg-gray-50">
      <VerifyToUnlockPrompt
        action="see contact info"
        onVerifyClick={onVerifyClick || (() => {})}
        variant="block"
      />
    </div>
  );

  // ── About Situation Section ──
  const AboutSituationSection = lead.aboutSituation ? (
    <div>
      <p className="text-lg font-semibold text-gray-900 mb-2.5">About their situation</p>
      <p className="text-base font-medium text-gray-900 leading-relaxed">
        {lead.aboutSituation}
      </p>
    </div>
  ) : null;

  // ── Care Details Section ──
  // Format who needs care with age (like ReachOutDrawer)
  const whoNeedsCareDisplay = lead.careRecipient
    ? lead.careRecipientAge
      ? `${lead.careRecipient}, ${lead.careRecipientAge} years old`
      : lead.careRecipient
    : null;

  // Format preferences (contact + schedule combined like ReachOutDrawer)
  const getPreferencesDisplay = () => {
    const parts: string[] = [];

    // Contact preference
    if (lead.contactPreference) {
      const contactMap: Record<string, string> = {
        phone: "Prefers calls",
        email: "Prefers email",
        either: "Call or email",
      };
      parts.push(contactMap[lead.contactPreference] || lead.contactPreference);
    }

    // Schedule preference
    if (lead.schedulePreference) {
      const scheduleMap: Record<string, string> = {
        mornings: "Mornings",
        afternoons: "Afternoons",
        evenings: "Evenings",
        overnight: "Overnight",
        full_time: "Full-time / Live-in",
        flexible: "Flexible",
      };
      parts.push(scheduleMap[lead.schedulePreference] || lead.schedulePreference);
    }

    return parts.length > 0 ? parts.join(" · ") : null;
  };

  const preferencesDisplay = getPreferencesDisplay();

  const CareDetailsSection = (
    <div>
      <p className="text-lg font-semibold text-gray-900 mb-2.5">Care details</p>
      <div className="space-y-3">
        {(lead.timeline || (lead.careType && lead.careType.length > 0)) && (
          <p className="text-base text-gray-700">
            <span className="text-gray-500">Needs:</span>{" "}
            <span className="font-medium text-gray-900">
              {lead.careType?.[0] || "Care"}{lead.timeline ? ` in ${
                lead.timeline === "asap" || lead.timeline === "immediate" ? "immediately" :
                lead.timeline === "within_month" || lead.timeline === "within_1_month" ? "~1 month" :
                lead.timeline === "few_months" || lead.timeline === "within_3_months" ? "~3 months" :
                lead.timeline === "exploring" || lead.timeline === "researching" ? "(exploring)" :
                lead.timeline
              }` : ""}
            </span>
          </p>
        )}
        {lead.careNeeds && lead.careNeeds.length > 0 && (
          <p className="text-base text-gray-700">
            <span className="text-gray-500">Help with:</span>{" "}
            <span className="font-medium text-gray-900">{lead.careNeeds.join(", ")}</span>
          </p>
        )}
        {whoNeedsCareDisplay && (
          <p className="text-base text-gray-700">
            <span className="text-gray-500">Who needs care:</span>{" "}
            <span className="font-medium text-gray-900">{whoNeedsCareDisplay}</span>
          </p>
        )}
        {preferencesDisplay && (
          <p className="text-base text-gray-700">
            <span className="text-gray-500">Preferences:</span>{" "}
            <span className="font-medium text-gray-900">{preferencesDisplay}</span>
          </p>
        )}
        {lead.paymentMethods && lead.paymentMethods.length > 0 && (
          <p className="text-base text-gray-700">
            <span className="text-gray-500">Can pay via:</span>{" "}
            <span className="font-medium text-gray-900">{lead.paymentMethods.join(", ")}</span>
          </p>
        )}
        {lead.profileCompleteness !== undefined && (
          <p className="text-base text-gray-700">
            <span className="text-gray-500">Profile:</span>{" "}
            <span className="font-medium text-gray-900">{lead.profileCompleteness}% complete</span>
          </p>
        )}
        {lead.memberSince && (
          <p className="text-base text-gray-700">
            <span className="text-gray-500">Member since:</span>{" "}
            <span className="font-medium text-gray-900">{lead.memberSince}</span>
          </p>
        )}
      </div>
    </div>
  );

  // ── Archived Banner ──
  const ArchivedBanner = lead.status === "archived" && lead.archivedDate ? (
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
  ) : null;

  // ── Scrollable Content ──
  const ScrollableContent = (
    <div className="space-y-6">
      {/* Archived banner */}
      {ArchivedBanner}

      {/* Summary Card */}
      <div className="rounded-2xl bg-stone-50 px-4 py-4 flex gap-4">
        {/* Large icon */}
        <div className="shrink-0 w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <svg className="w-7 h-7 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-[15px] font-semibold text-gray-900 leading-snug">
            Looking for {lead.careType?.[0] || "care"} in {lead.location || "their area"}
          </p>
          {lead.timeline && (
            <p className="text-[15px] text-gray-700 leading-snug">
              Hoping to start {
                lead.timeline === "asap" || lead.timeline === "immediate" ? "immediately" :
                lead.timeline === "within_month" || lead.timeline === "within_1_month" ? "within about a month" :
                lead.timeline === "few_months" || lead.timeline === "within_3_months" ? "within a few months" :
                lead.timeline === "exploring" || lead.timeline === "researching" ? "(currently exploring options)" :
                lead.timeline
              }
            </p>
          )}
          {lead.paymentMethods && lead.paymentMethods.length > 0 && (
            <p className="text-[15px] text-gray-700 leading-snug">
              Payment: {
                lead.paymentMethods.length <= 2
                  ? lead.paymentMethods.join(", ")
                  : `${lead.paymentMethods.slice(0, 2).join(", ")}, +${lead.paymentMethods.length - 2} more`
              }
            </p>
          )}
        </div>
      </div>

      {/* Contact */}
      {isVerified ? (
        (lead.email || lead.phone) && (
          <div>
            <h4 className="text-base font-display font-bold text-gray-900 mb-1.5">Contact</h4>
            <div className="space-y-1.5">
              {lead.phone && (
                <div className="group flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-700 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                  </svg>
                  <p className="text-[15px] text-gray-900 truncate">{lead.phone}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lead.phone!, "phone")}
                    className={`p-1.5 rounded-md transition-all shrink-0 ${
                      copiedField === "phone"
                        ? "bg-primary-100 text-primary-700"
                        : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    }`}
                  >
                    {copiedField === "phone" ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
              {lead.email && (
                <div className="group flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-700 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                  <p className="text-[15px] text-gray-900 truncate">{lead.email}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lead.email!, "email")}
                    className={`p-1.5 rounded-md transition-all shrink-0 ${
                      copiedField === "email"
                        ? "bg-primary-100 text-primary-700"
                        : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    }`}
                  >
                    {copiedField === "email" ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="px-3.5 py-3 border border-gray-200 rounded-lg bg-gray-50">
          <VerifyToUnlockPrompt
            action="see contact info"
            onVerifyClick={onVerifyClick || (() => {})}
            variant="block"
          />
        </div>
      )}

      {/* Details (collapsible) */}
      {lead.aboutSituation && (
        <div className="space-y-1.5">
          <h4 className="text-base font-display font-bold text-gray-900">Details</h4>

          {!showFullDetails ? (
            <>
              <p className="text-[15px] text-gray-900 leading-relaxed">
                {getTruncatedText(lead.aboutSituation, 80)}
              </p>
              {lead.aboutSituation.length > 80 && (
                <button
                  onClick={() => setShowFullDetails(true)}
                  className="flex items-center gap-1.5 text-[15px] font-medium text-teal-700 hover:text-teal-800 transition-colors"
                  aria-expanded="false"
                  aria-label="Read full details"
                >
                  Read more
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-[15px] text-gray-900 leading-relaxed">
                {lead.aboutSituation}
              </p>
              <button
                onClick={() => setShowFullDetails(false)}
                className="flex items-center gap-1.5 text-[15px] font-semibold text-teal-700 hover:text-teal-800 transition-colors"
                aria-expanded="true"
                aria-label="Show less details"
              >
                Show less
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                </svg>
              </button>

              <div className="pt-4 border-t border-gray-200 space-y-3">
                {lead.careRecipient && (
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-gray-600">Who needs care</span>
                    <span className="text-[15px] font-medium text-gray-900">
                      {lead.careRecipient}{lead.careRecipientAge ? `, ${lead.careRecipientAge}` : ""}
                    </span>
                  </div>
                )}
                {preferencesDisplay && (
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-gray-600">Preferences</span>
                    <span className="text-[15px] font-medium text-gray-900 text-right">{preferencesDisplay}</span>
                  </div>
                )}
                {lead.careNeeds && lead.careNeeds.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-gray-600">Help with</span>
                    <span className="text-[15px] font-medium text-gray-900 text-right">{lead.careNeeds.join(", ")}</span>
                  </div>
                )}
                {lead.memberSince && (
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-gray-600">Member since</span>
                    <span className="text-[15px] font-medium text-gray-900">
                      {lead.memberSince}{lead.profileCompleteness !== undefined ? ` · profile ${lead.profileCompleteness}%` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Active Footer (horizontal layout with helper text) ──
  const ActiveFooter = isVerified ? (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Secondary action - Decline lead */}
        <button
          type="button"
          onClick={() => onArchiveClick?.(lead.id)}
          className="flex-1 px-4 py-3.5 border border-gray-300 bg-white text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center justify-center gap-2"
        >
          Decline
        </button>

        {/* Primary action - Message */}
        <button
          type="button"
          onClick={handleContinueInInbox}
          className="flex-[2] px-4 py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:bg-primary-800 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          {(() => {
            if (!lead.name) return 'Message Care Seeker';
            const firstName = lead.name.split(' ')[0];
            // Use first name if it looks real (more than 1 char, not a placeholder)
            if (firstName.length > 1 && firstName.toLowerCase() !== 'care') {
              return `Message ${firstName}`;
            }
            return 'Message Care Seeker';
          })()}
        </button>
      </div>
      <p className="text-center text-[13px] text-gray-500 flex items-center justify-center gap-1.5">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        Free to message — you won&apos;t be charged
      </p>
    </div>
  ) : (
    <button
      type="button"
      onClick={onVerifyClick}
      className="w-full px-4 py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:bg-primary-800 transition-all flex items-center justify-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
      Verify to continue
    </button>
  );

  // ── Archived Footer (Delete + Restore) ──
  const ArchivedFooter = restored ? (
    <div className="flex flex-col items-center justify-center gap-3 py-2">
      <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <p className="text-[15px] font-semibold text-gray-900">Lead restored</p>
      <p className="text-[13px] text-gray-500">Moved back to active leads</p>
    </div>
  ) : showDeleteConfirm ? (
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
          className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl bg-red-600 text-[14px] font-semibold text-white hover:bg-red-700 transition-colors"
        >
          Yes, Delete Forever
        </button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setShowDeleteConfirm(true)}
        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 active:scale-[0.98]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
        Delete
      </button>
      <button
        type="button"
        onClick={handleRestore}
        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
        </svg>
        Restore
      </button>
    </div>
  );


  // Determine which footer to show
  const StickyFooter = lead.status === "archived"
    ? ArchivedFooter
    : ActiveFooter;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed z-[70] bg-white shadow-2xl flex flex-col will-change-transform transition-transform duration-300 ease-out
          inset-x-0 bottom-0 h-[95dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]
          lg:inset-y-0 lg:top-0 lg:right-0 lg:left-auto lg:bottom-0 lg:w-[640px] lg:max-w-[calc(100vw-24px)] lg:h-screen lg:rounded-none lg:pb-0
          ${isOpen ? "translate-y-0 lg:translate-x-0" : "translate-y-full lg:translate-y-0 lg:translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* MOBILE LAYOUT */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="lg:hidden flex flex-col h-full">
          {/* Mobile drag handle */}
          <div className="pt-3 pb-2 flex justify-center shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Mobile sticky header */}
          <div className="shrink-0 px-4 py-4 border-b border-gray-100 bg-white">
            {StickyHeader}
          </div>

          {/* Mobile scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-5">
            {ScrollableContent}
          </div>

          {/* Mobile sticky footer */}
          <div className="shrink-0 border-t border-gray-100 px-5 pt-4 pb-4 bg-white z-10">
            {StickyFooter}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* DESKTOP LAYOUT */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="hidden lg:flex lg:flex-col lg:h-full">
          {/* Desktop sticky header */}
          <div className="shrink-0 px-4 py-4 border-b border-gray-100 bg-white">
            {StickyHeader}
          </div>

          {/* Desktop scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-5">
            {ScrollableContent}
          </div>

          {/* Desktop sticky footer */}
          <div className="shrink-0 border-t border-gray-100 px-6 pt-4 pb-5 bg-white z-10">
            {StickyFooter}
          </div>
        </div>
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
}

function mapConnectionToLead(conn: ConnectionWithProfile, providerProfileId: string): LeadDetail {
  const meta = conn.metadata as Record<string, unknown> | undefined;
  const thread = (meta?.thread as Array<{ from_profile_id: string; text: string; created_at: string; is_auto_reply?: boolean }>) || [];
  // Check both lead_archived (new) and archived (old) for backward compatibility
  // Only treat archived as lead archive if it has a valid archive_reason (indicating it's a passed lead, not inbox archive)
  const hasValidArchiveReason = typeof meta?.archive_reason === 'string' && (meta.archive_reason as string).trim().length > 0;
  const isArchived = meta?.lead_archived === true || (meta?.archived === true && hasValidArchiveReason);
  const familyProfile = conn.fromProfile;

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

  // Additional profile metadata fields (fresh data) - matches family profile wizard
  const schedulePreference = familyMeta.schedule_preference as string | undefined;
  const timeline = familyMeta.timeline as string | undefined;
  const careRecipientAge = familyMeta.age as number | undefined;
  const paymentMethods = familyMeta.payment_methods as string[] | undefined;
  const aboutSituation = (familyMeta.about_situation as string) || familyProfile?.description || undefined;

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

  // Determine status - exclude automated replies, only count manual provider responses
  // Also check for manually marked as replied via drawer action
  const hasProviderReply = thread.some(
    (msg) => msg.from_profile_id === providerProfileId && !msg.is_auto_reply
  );
  const markedReplied = meta?.marked_replied === true;
  let status: LeadStatus = "new";
  if (isArchived) {
    status = "archived";
  } else if (hasProviderReply || markedReplied) {
    status = "replied";
  }
  // If no manual provider reply and not manually marked, status stays "new"

  // Build activity timeline
  const activity: ActivityEvent[] = [
    {
      label: "Lead received",
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
  // Primary: check database metadata.read_by
  // Fallback: check localStorage for backwards compatibility
  let isNew = false;
  if (status !== "archived" && status !== "replied") {
    const readBy = (meta?.read_by as Record<string, string>) || {};
    const isReadInDb = !!readBy[providerProfileId];

    if (!isReadInDb) {
      // Check localStorage as fallback
      try {
        migrateLeadsViewedData(providerProfileId);
        const leadsKey = `olera_leads_viewed_${providerProfileId}`;
        const viewedIds = JSON.parse(localStorage.getItem(leadsKey) || "[]");
        isNew = !viewedIds.includes(conn.id);
      } catch {
        isNew = true;
      }
    }
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

  // Archive metadata from database
  const archivedAt = meta?.archived_at as string | undefined;
  const archiveReason = meta?.archive_reason as string | undefined;

  // Format archive date if present
  let archivedDate: string | undefined;
  if (isArchived && archivedAt) {
    archivedDate = new Date(archivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // Map archive reason code to display label
  const archiveReasonLabel = archiveReason ? ({
    already_connected: "Already connected",
    not_a_fit: "Not a good fit",
    not_accepting_clients: "Not accepting new clients",
    unable_to_reach: "Unable to reach",
    other: "Other",
  }[archiveReason] || archiveReason) : undefined;

  // Compute what the status would be if not archived (for restore)
  // This is based on reply state, not stored status
  let preArchiveStatus: LeadStatus = "new";
  if (hasProviderReply || markedReplied) {
    preArchiveStatus = "replied";
  }

  // Calculate profile completeness (same weights as components/portal/profile/completeness.ts)
  let profileCompleteness = 0;
  const hasRealName = fullName && fullName.toLowerCase() !== "care seeker";
  if (familyProfile?.image_url) profileCompleteness += 2;
  if (fullName) profileCompleteness += 5;
  if (hasRealName) profileCompleteness += 5;
  if (familyProfile?.city) profileCompleteness += 8;
  if (email) profileCompleteness += 10;
  if (phone) profileCompleteness += 12;
  if (familyMeta.contact_preference) profileCompleteness += 2;
  if (familyMeta.relationship_to_recipient || familyMeta.who_needs_care) profileCompleteness += 10;
  if (careRecipientAge) profileCompleteness += 2;
  if (aboutSituation || familyProfile?.description) profileCompleteness += 4;
  if (profileCareTypes.length > 0) profileCompleteness += 8;
  if (profileCareNeeds.length > 0) profileCompleteness += 6;
  if (timeline) profileCompleteness += 12;
  if (schedulePreference) profileCompleteness += 2;
  if (paymentMethods && paymentMethods.length > 0) profileCompleteness += 12;
  profileCompleteness = Math.min(profileCompleteness, 100);

  // Format member since date
  const memberSince = familyProfile?.created_at
    ? new Date(familyProfile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : undefined;

  return {
    id: conn.id,
    connectionId: conn.id,
    name: fullName,
    initials: getInitials(fullName),
    subtitle: careRecipientAge
      ? `For ${careRecipient.toLowerCase()}, ${careRecipientAge} years old`
      : `For ${careRecipient.toLowerCase()}`,
    location,
    urgency,
    status,
    date: timeAgo(conn.created_at),
    isNew,
    // Contact info
    email,
    phone,
    contactPreference,
    // Care recipient
    careRecipient,
    careRecipientAge,
    aboutSituation: aboutSituation || (careDetails.additional_notes as string) || (meta?.auto_intro as string) || undefined,
    // Care needs
    careType: profileCareTypes.length > 0 ? profileCareTypes : (messageCareType ? [messageCareType] : undefined),
    careNeeds: profileCareNeeds.length > 0 ? profileCareNeeds : undefined,
    timeline,
    schedulePreference,
    // Payment
    paymentMethods,
    // System
    activity,
    // Archive info (from database metadata)
    archivedDate,
    archiveReason: archiveReasonLabel,
    // Profile metadata
    profileCompleteness,
    memberSince,
    // Store computed pre-archive status for restore (used by handleRestoreLead)
    _previousStatus: isArchived ? preArchiveStatus : undefined,
  } as LeadDetail & { _previousStatus?: LeadStatus };
}

// ── Page ──

export default function ProviderLeadsPage() {
  const router = useRouter();
  const providerProfile = useProviderProfile();
  const { isLoading: authLoading, refreshAccountData } = useAuth();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("active");
  const [leads, setLeads] = useState<LeadDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Track which lead's drawer should reopen after verification
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  // Track which lead to archive (for modal)
  const [leadIdToArchive, setLeadIdToArchive] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const [whatsappBannerDismissed, setWhatsappBannerDismissed] = useState(false);
  const [whatsappOptingIn, setWhatsappOptingIn] = useState(false);
  const [freeLeadBannerDismissed, setFreeLeadBannerDismissed] = useState(false);

  // Verification state
  const { isVerified } = useProviderVerification();
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModalRaw,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: providerProfile?.id || "",
    onVerified: async () => {
      // Refresh profile state to update isVerified, then refetch leads
      await refreshAccountData();
      fetchLeads();
      // Reopen drawer with saved lead after verification
      if (pendingLeadId) {
        setSelectedLeadId(pendingLeadId);
        setIsDrawerOpen(true);
        setPendingLeadId(null);
      }
    },
    onDismissed: () => {
      setPendingLeadId(null);
    },
  });

  // Handle verification click from drawer - close drawer first to avoid stacking
  const handleVerifyFromDrawer = useCallback(() => {
    if (!providerProfile?.id) return;
    if (selectedLeadId) {
      setPendingLeadId(selectedLeadId);
      setIsDrawerOpen(false); // Close drawer first
    }
    // Small delay to prevent visual stacking
    setTimeout(() => {
      openVerificationModalRaw();
    }, 100);
  }, [providerProfile?.id, selectedLeadId, openVerificationModalRaw]);

  // Check if free lead banner was dismissed this session (sessionStorage)
  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem("olera_free_lead_banner_dismissed");
      setFreeLeadBannerDismissed(dismissed === "true");
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  // Dismiss free lead banner for this session only (reappears on next login)
  const dismissFreeLeadBanner = () => {
    setFreeLeadBannerDismissed(true);
    try {
      sessionStorage.setItem("olera_free_lead_banner_dismissed", "true");
    } catch {
      // sessionStorage unavailable
    }
  };

  // Clear selected lead when pagination or filter changes to avoid showing details for non-visible leads
  useEffect(() => {
    setSelectedLeadId(null);
    setIsDrawerOpen(false);
  }, [currentPage, activeFilter]);

  // Sync drawer state when window resizes across lg breakpoint (1024px)
  // If on mobile and lead is selected but drawer not open, open it
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 1024;
      if (isMobile && selectedLeadId && !isDrawerOpen) {
        setIsDrawerOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedLeadId, isDrawerOpen]);

  // If auth is done loading and there's no provider profile, stop showing skeletons.
  // This prevents eternal loading when the signed-in user doesn't own a provider listing.
  useEffect(() => {
    if (!authLoading && !providerProfile && isLoading) {
      setIsLoading(false);
    }
  }, [authLoading, providerProfile, isLoading]);

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

      // Fetch family-initiated inquiries only
      // Provider-initiated outreach is handled separately on the Outreach page
      const inquiriesResult = await supabase
        .from("connections")
        .select("*, fromProfile:from_profile_id(id, display_name, email, phone, city, state, type, care_types, metadata, image_url, created_at)")
        .eq("to_profile_id", profileId)
        .eq("type", "inquiry")
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false });

      if (inquiriesResult.error) {
        console.error("Failed to fetch leads:", inquiriesResult.error);
        if (isInitialLoad) setIsLoading(false);
        return;
      }

      const uniqueConnections = (inquiriesResult.data || []) as ConnectionWithProfile[];

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
    window.dispatchEvent(new CustomEvent("olera:leads-sync", { detail: { count: newLeadsCount, profileId: providerProfile.id } }));
  }, [newLeadsCount, providerProfile]);

  // Derive selectedLead from current leads so it stays in sync after archive/restore
  const selectedLead = useMemo(
    () => (selectedLeadId ? leads.find((l) => l.id === selectedLeadId) ?? null : null),
    [selectedLeadId, leads]
  );

  const openDrawer = useCallback((lead: LeadDetail) => {
    setSelectedLeadId(lead.id);
    setIsDrawerOpen(true);
    // Clear "New" badge once viewed and persist to database
    if (lead.isNew && providerProfile) {
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, isNew: false } : l))
      );
      // Persist to database via API (also updates localStorage for fallback)
      markLeadAsRead(lead.id, providerProfile.id);
    }
    // Track lead_opened event for engagement funnel
    // Use consistent provider key: slug || source_provider_id || id
    // This must match how the funnel query looks up providers
    const providerKey = providerProfile?.slug || providerProfile?.source_provider_id || providerProfile?.id;
    if (providerKey) {
      fetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerKey,
          event_type: "lead_opened",
          metadata: { lead_id: lead.id, connection_id: lead.connectionId },
        }),
      }).catch(() => {});
    }
  }, [providerProfile]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedLeadId(null);
  }, []);

  const handleMarkAsReplied = useCallback(async (leadId: string) => {
    // Update local state immediately
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, status: "replied" as LeadStatus } : l
      )
    );

    // Persist to backend (update connection metadata)
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        // Find the connection ID for this lead
        const lead = leads.find((l) => l.id === leadId);
        const connectionId = lead?.connectionId || leadId;

        // Get current connection to preserve metadata
        const { data: conn } = await supabase
          .from("connections")
          .select("metadata")
          .eq("id", connectionId)
          .single();

        if (conn) {
          const existingMeta = (conn.metadata || {}) as Record<string, unknown>;
          await supabase
            .from("connections")
            .update({
              metadata: {
                ...existingMeta,
                marked_replied: true,
                marked_replied_at: new Date().toISOString(),
              },
            })
            .eq("id", connectionId);
        }
      } catch (err) {
        console.error("[markAsReplied] Failed:", err);
      }
    }
  }, [leads]);
  const handleArchiveLead = useCallback(async (leadId: string, reason: string, message?: string) => {
    const reasonLabel = {
      already_connected: "Already connected",
      not_a_fit: "Not a good fit",
      not_accepting_clients: "Not accepting new clients",
      unable_to_reach: "Unable to reach",
      other: "Other",
    }[reason] || reason;

    // Find the lead to get connectionId and preserve previous status
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) {
      console.error(`[archive] Lead ${leadId} not found in state`);
      return;
    }
    const connectionId = lead.connectionId || leadId;
    const previousStatus = lead.status || "new";

    // If "already_connected", auto-mark as replied before archiving
    // (they've communicated outside Olera, so it's effectively replied)
    if (reason === "already_connected" && lead?.status === "new") {
      await handleMarkAsReplied(leadId);
    }

    // Optimistic UI update
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              status: "archived" as LeadStatus,
              archivedDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              archiveReason: reasonLabel,
              // Store previous status for restore
              _previousStatus: previousStatus,
            }
          : l
      )
    );

    // Persist to database via API
    try {
      const response = await fetch("/api/connections/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          action: "archive",
          archiveReason: reason,
          archiveMessage: message || undefined,
        }),
      });

      if (!response.ok) {
        console.error("[archive] API failed:", await response.text());
        // Revert optimistic update on failure
        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? { ...l, status: previousStatus as LeadStatus, archivedDate: undefined, archiveReason: undefined }
              : l
          )
        );
      }
    } catch (err) {
      console.error("[archive] Failed:", err);
      // Revert optimistic update on failure
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, status: previousStatus as LeadStatus, archivedDate: undefined, archiveReason: undefined }
            : l
        )
      );
    }
  }, [leads, handleMarkAsReplied]);

  const handleArchiveFromModal = useCallback(async (reason: string, message: string) => {
    if (!leadIdToArchive) return;

    // Capture the lead ID at submission time to detect interruption
    const submittingLeadId = leadIdToArchive;

    // Verify lead exists before archiving
    const lead = leads.find((l) => l.id === submittingLeadId);
    if (!lead) {
      console.error(`[archive] Lead ${submittingLeadId} not found in state`);
      throw new Error("Lead not found");
    }

    await handleArchiveLead(submittingLeadId, reason, message);

    // Close drawer if archiving the currently selected lead
    if (selectedLeadId === submittingLeadId) {
      setIsDrawerOpen(false);
    }

    // Only close modal if leadIdToArchive hasn't changed (no interruption)
    // This prevents closing a different modal that was opened during submission
    setLeadIdToArchive((current) => current === submittingLeadId ? null : current);
  }, [leadIdToArchive, handleArchiveLead, selectedLeadId, leads]);

  const handleRestoreLead = useCallback(async (leadId: string) => {
    // Find the lead to get connectionId and previous status
    const lead = leads.find((l) => l.id === leadId);
    const connectionId = lead?.connectionId || leadId;
    // Use stored previous status, or fall back to "new"
    const previousStatus = (lead as LeadDetail & { _previousStatus?: LeadStatus })?._previousStatus || "new";

    // Optimistic UI update - restore to previous status
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, status: previousStatus as LeadStatus, archivedDate: undefined, archiveReason: undefined }
          : l
      )
    );

    // Persist to database via API
    try {
      const response = await fetch("/api/connections/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          action: "unarchive",
          source: "connections",
        }),
      });

      if (!response.ok) {
        console.error("[restore] API failed:", await response.text());
        // Revert optimistic update on failure
        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? { ...l, status: "archived" as LeadStatus }
              : l
          )
        );
      }
    } catch (err) {
      console.error("[restore] Failed:", err);
      // Revert optimistic update on failure
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, status: "archived" as LeadStatus }
            : l
        )
      );
    }
  }, [leads]);

  const handleDeleteLead = useCallback(async (leadId: string) => {
    // Find the lead to get connectionId
    const lead = leads.find((l) => l.id === leadId);
    const connectionId = lead?.connectionId || leadId;

    // Optimistic UI update - remove from list
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setSelectedLeadId(null);

    // Persist to database via API
    try {
      const response = await fetch("/api/connections/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          action: "delete",
        }),
      });

      if (!response.ok) {
        console.error("[delete] API failed:", await response.text());
        // On failure, refetch to restore the lead
        fetchLeads(false);
      }
    } catch (err) {
      console.error("[delete] Failed:", err);
      // On failure, refetch to restore the lead
      fetchLeads(false);
    }
  }, [leads, fetchLeads]);


  // WhatsApp opt-in: show banner if provider has phone, hasn't opted in, and hasn't dismissed
  const providerMeta = (providerProfile?.metadata || {}) as Record<string, unknown>;
  const showWhatsAppBanner =
    !whatsappBannerDismissed &&
    !whatsappOptingIn &&
    providerProfile?.phone &&
    !providerMeta.whatsapp_opted_in &&
    !providerMeta.whatsapp_banner_dismissed;

  const handleWhatsAppOptIn = useCallback(async () => {
    if (!providerProfile || !isSupabaseConfigured()) return;
    setWhatsappOptingIn(true);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      await supabase
        .from("business_profiles")
        .update({
          metadata: {
            ...providerMeta,
            whatsapp_opted_in: true,
            whatsapp_opted_in_at: now,
          },
        })
        .eq("id", providerProfile.id);
      setWhatsappBannerDismissed(true);
    } catch (err) {
      console.error("[whatsapp] Opt-in failed:", err);
    } finally {
      setWhatsappOptingIn(false);
    }
  }, [providerProfile, providerMeta]);

  const dismissWhatsAppBanner = useCallback(async () => {
    setWhatsappBannerDismissed(true);
    if (!providerProfile || !isSupabaseConfigured()) return;
    try {
      const supabase = createClient();
      await supabase
        .from("business_profiles")
        .update({
          metadata: {
            ...providerMeta,
            whatsapp_banner_dismissed: true,
          },
        })
        .eq("id", providerProfile.id);
    } catch {
      // Non-blocking
    }
  }, [providerProfile, providerMeta]);

  const filteredLeads = useMemo(() => {
    if (activeFilter === "archived") {
      return leads.filter((l) => l.status === "archived");
    }
    // "active" - show everything except archived
    return leads.filter((l) => l.status !== "archived");
  }, [activeFilter, leads]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  // Paginate filtered leads - reduce page size when detail view is open
  const activePageSize = selectedLead ? 10 : PAGE_SIZE;
  const totalPages = Math.ceil(filteredLeads.length / activePageSize);

  // Reset to last valid page if current page exceeds total (e.g., after data refresh)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // When a lead is selected and page size changes, ensure the selected lead is on current page
  useEffect(() => {
    if (selectedLead && filteredLeads.length > 0) {
      const leadIndex = filteredLeads.findIndex(l => l.id === selectedLead.id);
      if (leadIndex !== -1) {
        const correctPage = Math.floor(leadIndex / activePageSize) + 1;
        if (correctPage !== currentPage && correctPage <= totalPages) {
          setCurrentPage(correctPage);
        }
      }
    }
  }, [selectedLead, activePageSize, filteredLeads, currentPage, totalPages]);

  const paginatedLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * activePageSize;
    return filteredLeads.slice(startIndex, startIndex + activePageSize);
  }, [filteredLeads, currentPage, activePageSize]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        {/* Header skeleton */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-6 sm:py-8 animate-pulse">
              <div className="h-4 w-24 bg-gray-100 rounded mb-4" />
              <div className="h-8 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-4 w-56 bg-gray-100 rounded" />
            </div>
            <div className="flex gap-6 pb-3">
              <div className="h-5 w-16 bg-gray-100 rounded" />
              <div className="h-5 w-20 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
        {/* Content skeleton */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-200 shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                    <div className="h-3 w-48 bg-gray-100 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Calculate counts for tabs
  const activeCount = leads.filter((l) => l.status !== "archived").length;
  const archivedCount = leads.filter((l) => l.status === "archived").length;
  const tabCounts: Record<StatusFilter, number> = {
    active: activeCount,
    archived: archivedCount,
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6 sm:py-8">
            {/* Back button - navigates to previous page */}
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>

            <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
              My Leads
            </h1>
            <p className="text-[15px] text-gray-500 mt-1">
              Families who reached out to you
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 -mb-px">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`relative pb-3 text-[15px] font-medium transition-colors ${
                  activeFilter === tab.id
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {tabCounts[tab.id] > 0 && (
                  <span className={`ml-1.5 text-[13px] ${
                    activeFilter === tab.id ? "text-gray-900" : "text-gray-400"
                  }`}>
                    ({tabCounts[tab.id]})
                  </span>
                )}
                {activeFilter === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content - Two-pane layout on desktop */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── WhatsApp opt-in banner ── */}
        {showWhatsAppBanner && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl shrink-0" aria-hidden="true">💬</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-900">Get lead alerts on WhatsApp</p>
                <p className="text-xs text-emerald-700 mt-0.5">Instant notifications when families reach out — no more missed leads.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={dismissWhatsAppBanner}
                className="text-xs text-emerald-600 hover:text-emerald-800 px-2 py-1.5"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleWhatsAppOptIn}
                disabled={whatsappOptingIn}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {whatsappOptingIn ? "Enabling..." : "Enable"}
              </button>
            </div>
          </div>
        )}

        {/* ── Two-pane layout (desktop) / Single column (mobile) ── */}
        <div className="lg:flex lg:gap-6">
          {/* Left pane: Leads list (collapses when lead selected on desktop) */}
          <div className={`transition-all duration-300 ${
            selectedLead ? 'lg:w-[280px]' : 'lg:flex-1 lg:max-w-5xl lg:mx-auto'
          }`}>
      {/* ── Leads list ── */}
      {filteredLeads.length > 0 ? (
        <>
          {/* Lead cards */}
          <div className="space-y-3">
          {paginatedLeads.map((lead) => {
            const isSelected = selectedLeadId === lead.id;
            const isCondensedView = !!selectedLead; // Show condensed cards when any lead is selected

            return (
            <div
              key={lead.id}
              onClick={() => {
                if (isSelected) {
                  closeDrawer();
                } else {
                  openDrawer(lead);
                }
              }}
              className={`group relative bg-white rounded-xl border transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-primary-500 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Condensed view for desktop when a lead is selected */}
              {isCondensedView && (
                <div className="hidden lg:flex items-center gap-3 px-4 py-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center shrink-0`}>
                    <span className="text-sm font-semibold text-white">{lead.initials}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {isVerified ? lead.name : formatRedactedName(lead.name)}
                  </p>
                </div>
              )}

              {/* Full card view (mobile always, desktop when nothing selected) */}
              <div className={isCondensedView ? 'lg:hidden' : ''}>
              {/* Mobile card layout */}
              <div className="lg:hidden px-4 py-4 active:bg-vanilla-50/60">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center shrink-0`}>
                    <span className="text-sm font-semibold text-white">{lead.initials}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Name + Status badge */}
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {isVerified ? lead.name : formatRedactedName(lead.name)}
                      </h3>
                      {/* Status badge - New (green), Replied (amber), Archived/Viewed (gray) */}
                      {lead.isNew ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                          New
                        </span>
                      ) : lead.status === "replied" ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-amber-50 text-amber-700 border border-amber-100 shrink-0">
                          Replied
                        </span>
                      ) : lead.status === "archived" ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200 shrink-0">
                          Archived
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200 shrink-0">
                          Viewed
                        </span>
                      )}
                    </div>

                    {/* Email - truncated */}
                    <p className="text-sm text-gray-600 truncate mb-1">
                      {isVerified ? (lead.email || "—") : "Verify to see contact info"}
                    </p>

                    {/* Care type - own line, truncated */}
                    {lead.careType?.[0] && (
                      <p className="text-[13px] font-medium text-gray-600 truncate mb-0.5">
                        {lead.careType[0]}
                      </p>
                    )}

                    {/* Location · Date */}
                    <p className="text-[13px] text-gray-500 truncate">
                      {lead.location}
                      <span className="text-gray-300 mx-1.5">·</span>
                      <span className="text-gray-400">{lead.date}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Desktop table layout */}
              <div className="hidden lg:grid grid-cols-[1.8fr_1.5fr_1fr_1fr_0.8fr_0.8fr] gap-5 items-center px-6 py-4">
                {/* Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient(lead.name)} flex items-center justify-center shrink-0`}>
                    <span className="text-sm font-semibold text-white">{lead.initials}</span>
                  </div>
                  <p className="text-[15px] font-semibold text-gray-900 truncate">
                    {isVerified ? lead.name : formatRedactedName(lead.name)}
                  </p>
                </div>

                {/* Contact - email only (phone shown in drawer) */}
                <p className="text-[14px] font-medium text-gray-700 truncate min-w-0">
                  {isVerified ? (lead.email || "—") : "••••••••"}
                </p>

                {/* Care Type */}
                <span className="text-[14px] font-medium text-gray-700 truncate">
                  {lead.careType?.[0] || "—"}
                </span>

                {/* Location */}
                <span className="text-[14px] font-medium text-gray-700 truncate">{lead.location}</span>

                {/* Received */}
                <span className="text-[14px] text-gray-400">{lead.date}</span>

                {/* Status badge - New (green), Replied (amber), Archived/Viewed (gray) */}
                {lead.isNew ? (
                  <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[12px] font-medium leading-none bg-emerald-50 text-emerald-700 border border-emerald-100">
                    New
                  </span>
                ) : lead.status === "replied" ? (
                  <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[12px] font-medium leading-none bg-amber-50 text-amber-700 border border-amber-100">
                    Replied
                  </span>
                ) : lead.status === "archived" ? (
                  <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[12px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200">
                    Archived
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[12px] font-medium leading-none bg-gray-50 text-gray-500 border border-gray-200">
                    Viewed
                  </span>
                )}
              </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Pagination */}
        {filteredLeads.length > activePageSize && (
          <div className="mt-6">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredLeads.length}
              itemsPerPage={activePageSize}
              onPageChange={setCurrentPage}
              itemLabel="leads"
            />
          </div>
        )}
        </>
      ) : (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
          <Image
            src={activeFilter === "archived" ? "/Declined.png" : "/Pending.png"}
            alt={activeFilter === "archived" ? "No archived leads" : "No leads yet"}
            width={180}
            height={180}
            className="mb-6"
          />
          <h3 className="text-[17px] font-display font-bold text-gray-900 mb-2">
            {activeFilter === "archived" ? "No archived leads" : "No leads yet"}
          </h3>
          <p className="text-[15px] text-gray-500 max-w-sm leading-relaxed">
            {activeFilter === "archived"
              ? "Leads you archive will appear here."
              : "When families find your profile and reach out, they'll appear here."}
          </p>
          {activeFilter !== "archived" && (
            <Link
              href="/provider/matches"
              className="mt-6 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Find Families
            </Link>
          )}
        </div>
      )}
          </div>
          {/* End left pane */}

          {/* Right pane: Lead details (desktop only, hidden on mobile) */}
          {selectedLead && (
            <div className="hidden lg:block lg:flex-1 lg:self-start transition-all duration-300">
              <LeadDetailInlineView
                lead={selectedLead}
                isVerified={isVerified}
                onClose={closeDrawer}
                onPhoneClick={(leadId) => {
                  if (!providerProfile) return;
                  const providerKey = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
                  fetch("/api/activity/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider_id: providerKey,
                      event_type: "phone_clicked",
                      metadata: { lead_id: leadId },
                    }),
                  }).catch(() => {});
                }}
                onEmailClick={(leadId) => {
                  if (!providerProfile) return;
                  const providerKey = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
                  fetch("/api/activity/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider_id: providerKey,
                      event_type: "email_link_clicked",
                      metadata: { lead_id: leadId },
                    }),
                  }).catch(() => {});
                }}
                onContinueInInbox={(leadId) => {
                  if (!providerProfile) return;
                  const providerKey = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
                  fetch("/api/activity/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider_id: providerKey,
                      event_type: "continue_in_inbox",
                      metadata: { lead_id: leadId },
                    }),
                  }).catch(() => {});
                  router.push(`/provider/inbox?id=${selectedLead.connectionId || selectedLead.id}`);
                  closeDrawer();
                }}
                onArchiveClick={() => setLeadIdToArchive(selectedLead.id)}
                onVerifyClick={handleVerifyFromDrawer}
                onRestore={handleRestoreLead}
                onDelete={handleDeleteLead}
              />
            </div>
          )}
          {/* End right pane */}
        </div>
        {/* End two-pane layout */}
    </div>

      {/* ── Lead detail drawer (mobile only) ── */}
      <div className="lg:hidden">
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onRestore={handleRestoreLead}
        onDelete={handleDeleteLead}
        onMarkAsReplied={handleMarkAsReplied}
        onArchiveClick={setLeadIdToArchive}
        onPhoneClick={(leadId) => {
          if (!providerProfile) return;
          const providerKey = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
          fetch("/api/activity/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider_id: providerKey,
              event_type: "phone_clicked",
              metadata: { lead_id: leadId },
            }),
          }).catch(() => {});
        }}
        onEmailClick={(leadId) => {
          if (!providerProfile) return;
          const providerKey = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
          fetch("/api/activity/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider_id: providerKey,
              event_type: "email_link_clicked",
              metadata: { lead_id: leadId },
            }),
          }).catch(() => {});
        }}
        onContinueInInbox={(leadId) => {
          if (!providerProfile) return;
          const providerKey = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
          fetch("/api/activity/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider_id: providerKey,
              event_type: "continue_in_inbox",
              metadata: { lead_id: leadId },
            }),
          }).catch(() => {});
        }}
        isVerified={isVerified}
        onVerifyClick={handleVerifyFromDrawer}
      />
      </div>

      {/* ── Verification Modal ── */}
      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={providerProfile?.display_name || "your business"}
        profileId={providerProfile?.id}
      />

      {/* ── Archive Lead Modal ── */}
      {leadIdToArchive && (
        <ArchiveLeadModal
          leadName={leads.find((l) => l.id === leadIdToArchive)?.name || "this lead"}
          onClose={() => setLeadIdToArchive(null)}
          onSubmit={handleArchiveFromModal}
        />
      )}
    </div>
  );
}

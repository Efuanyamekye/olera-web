"use client";

import { useState } from "react";
import {
  formatAge,
  type ConnectionTemperature,
  type NextStep,
} from "@/lib/connection-temperature";
import EmailStatusPill from "@/components/admin/EmailStatusPill";

interface ProfileCompleteness {
  percentage: number;
  missingFields: string[];
}

export type WorkflowState = "needs_attention" | "awaiting_provider" | "awaiting_family" | "connected" | "stuck";
export type EngagementLevel = "new" | "viewed" | "engaged" | "connected" | "stuck";

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
  temperature: ConnectionTemperature;
  /** Provider explicitly marked as replied in their drawer */
  markedReplied?: boolean;
  /** Provider archived with "already_connected" reason */
  alreadyConnected?: boolean;
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

// Engagement badges component
// Note: `messaged`, `markedReplied`, `alreadyConnected` are passed separately
// because they're per-connection, not per-provider like the other engagement fields.
function EngagementBadges({
  engagement,
  messaged = false,
  markedReplied = false,
  alreadyConnected = false,
  compact = false
}: {
  engagement?: Engagement | DetailEngagement;
  messaged?: boolean;
  markedReplied?: boolean;
  alreadyConnected?: boolean;
  compact?: boolean;
}) {
  if (!engagement && !markedReplied && !alreadyConnected) return null;

  // Check if messaged is in the engagement object (DetailEngagement) or passed separately
  const isMessaged = messaged || (engagement && 'messaged' in engagement && engagement.messaged);

  // Build badges with specific labels for what the provider did
  const badges: { icon: string; label: string; active: boolean }[] = [
    { icon: "👁", label: "Viewed", active: engagement?.lead_opened ?? false },
    { icon: "📋", label: "Copied Phone", active: engagement?.phone_copied ?? false },
    { icon: "📋", label: "Copied Email", active: engagement?.email_copied ?? false },
    { icon: "📞", label: "Called", active: engagement?.phone_clicked ?? false },
    { icon: "📧", label: "Emailed", active: engagement?.email_link_clicked ?? false },
    { icon: "📨", label: "Continued in Inbox", active: engagement?.continue_in_inbox ?? false },
    { icon: "💬", label: "Messaged", active: isMessaged ?? false },
    { icon: "✓", label: "Marked Replied", active: markedReplied },
    { icon: "🤝", label: "Already Connected", active: alreadyConnected },
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
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600"
        >
          {b.icon} {b.label}
        </span>
      ))}
    </div>
  );
}

export default function ConnectionRow({
  c,
  engagement,
  onDelete,
  onNudgeSuccess,
}: {
  c: ConnectionRowData;
  engagement?: Engagement;
  onDelete?: (id: string) => void;
  onNudgeSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Nudge action state
  const [nudging, setNudging] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    const engLevel = c.engagementLevel || "new";

    // For non-connected states, show who we're waiting on
    const waitingOnText = c.waitingOn === "family" ? " (awaiting family)" : "";
    const nudgeCount = c.waitingOn === "family" ? familyNudges : providerNudges;

    switch (engLevel) {
      case "connected":
        return { status: "Connected", color: "text-emerald-600", nudgeInfo: null };
      case "engaged":
        return { status: `Engaged${waitingOnText}`, color: "text-orange-600", nudgeInfo: nudgeCount > 0 ? `Nudged ${nudgeCount}x` : null };
      case "viewed":
        return { status: `Viewed${waitingOnText}`, color: "text-amber-600", nudgeInfo: nudgeCount > 0 ? `Nudged ${nudgeCount}x` : null };
      case "stuck":
        return { status: "Stuck", color: "text-gray-500", nudgeInfo: c.waitingOn === "family" ? `Family nudged ${familyNudges}x` : `Provider nudged ${providerNudges}x` };
      case "new":
      default:
        return { status: "New", color: "text-blue-600", nudgeInfo: providerNudges > 0 ? `Nudged ${providerNudges}x` : null };
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

  async function sendNudge(endpoint: string, successText: string) {
    setNudging(true);
    setNudgeMsg(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNudgeMsg({ ok: true, text: successText });
        // Notify parent to refresh list - connection should move to "Awaiting" tab
        onNudgeSuccess?.();
      } else {
        setNudgeMsg({ ok: false, text: data.error || "Couldn't send." });
      }
    } catch {
      setNudgeMsg({ ok: false, text: "Network error — not sent." });
    } finally {
      setNudging(false);
    }
  }

  return (
    <div className="group">
      {/* Collapsed row - enhanced with more context */}
      <div className="flex w-full items-center gap-3 px-4 py-4 hover:bg-stone-50/60 transition-colors">
        <button
          onClick={toggle}
          className="flex-1 min-w-0 text-left"
          aria-expanded={open}
        >
          {/* Primary line: names + engagement badges */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{family}</span>
            <span className="text-gray-400">→</span>
            <span className="font-medium text-gray-900 truncate">{provider}</span>
            <EngagementBadges engagement={engagement} messaged={c.responded} markedReplied={c.markedReplied} alreadyConnected={c.alreadyConnected} compact />
          </div>
          {/* Secondary line: care type + timeline | waiting status | nudge info */}
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
          </div>
        </button>

        {/* Timestamp - vertically centered with other controls */}
        <span className="text-sm text-gray-400 shrink-0">{age} ago</span>

        {/* Delete button - hover reveal */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(c.id);
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all"
            title="Delete connection"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
              {/* Stuck connection alert - show call options prominently */}
              {c.engagementLevel === "stuck" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                  <p className="text-sm font-medium text-amber-800 mb-2">
                    This connection needs manual follow-up. No activity for 14+ days.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Primary call button based on who we're waiting on */}
                    {c.waitingOn === "provider" && detail.provider.phone && (
                      <a
                        href={`tel:${detail.provider.phone}`}
                        className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                      >
                        Call Provider
                      </a>
                    )}
                    {c.waitingOn === "family" && detail.family.phone && (
                      <a
                        href={`tel:${detail.family.phone}`}
                        className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                      >
                        Call Family
                      </a>
                    )}
                    {/* Secondary call option */}
                    {c.waitingOn === "provider" && detail.family.phone && (
                      <a
                        href={`tel:${detail.family.phone}`}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-100"
                      >
                        Call Family
                      </a>
                    )}
                    {c.waitingOn === "family" && detail.provider.phone && (
                      <a
                        href={`tel:${detail.provider.phone}`}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-100"
                      >
                        Call Provider
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Regular action bar - nudge buttons + engagement badges */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Nudge buttons - show based on who we're waiting on */}
                {c.engagementLevel !== "stuck" && c.engagementLevel !== "connected" && (
                  <>
                    {/* Provider nudge - when waiting on provider */}
                    {c.waitingOn === "provider" && detail.provider.hasEmail && (
                      <button
                        onClick={() => sendNudge("/api/admin/send-nudge", "Nudge sent to provider.")}
                        disabled={nudging}
                        className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                      >
                        {nudging ? "Sending..." : "Nudge Provider"}
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
                        onClick={() => sendNudge("/api/admin/nudge-family", "Follow-up sent to family.")}
                        disabled={nudging}
                        className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                      >
                        {nudging ? "Sending..." : "Nudge Family"}
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

                {/* Connected state - success message */}
                {c.engagementLevel === "connected" && (
                  <span className="text-sm text-emerald-600 font-medium">Provider reached out to family</span>
                )}

                {/* Engagement badges */}
                <EngagementBadges engagement={detail.engagement} markedReplied={c.markedReplied} alreadyConnected={c.alreadyConnected} />

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
                  <div className="mt-1 space-y-0.5 text-sm">
                    {detail.provider.email ? (
                      <a href={`mailto:${detail.provider.email}`} className="block text-blue-600 hover:underline truncate">{detail.provider.email}</a>
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
    </div>
  );
}

"use client";

/**
 * Staffing Outreach drawer.
 *
 * Sections (matching the workflow):
 *   1. ProviderSummary  — header with status badge, contact info, engagement signals
 *   2. NewSection       — initial email form (queued status)
 *   3. NurturingSection — follow-up email form (pre-consent nurturing statuses)
 *   4. CallSection      — disposition buttons; "Connected" expands into capture form
 *   5. Terminal States  — EnrolledSection, ActivatedSection, ClosedSection
 *   6. HistorySection   — chronological touchpoint timeline with icons
 *
 * After any action, the parent page refetches the queue and auto-advances
 * to the next provider in the same tab.
 */

import { useCallback, useEffect, useState } from "react";
import Select from "@/components/ui/Select";
import type {
  DrawerContext,
  StaffingTouchpoint,
  TouchpointType,
  StaffingStatus,
} from "@/lib/staffing-outreach/types";

interface DrawerProps {
  outreachId: string;
  onClose: () => void;
  onAction: (refreshed: DrawerContext | null) => void;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StaffingStatus, { label: string; color: string; bg: string }> = {
  queued: { label: "Pending", color: "text-gray-700", bg: "bg-gray-100" },
  pre_call_outreach: { label: "Email Sent", color: "text-blue-700", bg: "bg-blue-100" },
  calling: { label: "Calling", color: "text-amber-700", bg: "bg-amber-100" },
  connected_no_consent: { label: "Connected", color: "text-purple-700", bg: "bg-purple-100" },
  consented: { label: "Consented", color: "text-emerald-700", bg: "bg-emerald-100" },
  nurturing: { label: "Nurturing", color: "text-indigo-700", bg: "bg-indigo-100" },
  activated: { label: "Activated", color: "text-cyan-700", bg: "bg-cyan-100" },
  enrolled: { label: "Enrolled", color: "text-green-700", bg: "bg-green-100" },
  do_not_contact: { label: "DNC", color: "text-red-700", bg: "bg-red-100" },
  wrong_number: { label: "Wrong #", color: "text-orange-700", bg: "bg-orange-100" },
};

function StatusBadge({ status }: { status: StaffingStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: "text-gray-700", bg: "bg-gray-100" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.bg} ${config.color}`}>
      {config.label}
    </span>
  );
}

// ── Engagement Signal Icons ───────────────────────────────────────────────

function EngagementSignals({ touchpoints }: { touchpoints: StaffingTouchpoint[] }) {
  const hasOpened = touchpoints.some((t) => t.type === "email_opened");
  const hasClicked = touchpoints.some((t) => t.type === "email_clicked");
  const hasReplied = touchpoints.some((t) => t.type === "reply_received");

  if (!hasOpened && !hasClicked && !hasReplied) return null;

  return (
    <div className="flex items-center gap-1.5">
      {hasOpened && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700" title="Email opened">
          <span>👁</span> Opened
        </span>
      )}
      {hasClicked && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700" title="Link clicked">
          <span>🔗</span> Clicked
        </span>
      )}
      {hasReplied && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700" title="Reply received">
          <span>💬</span> Replied
        </span>
      )}
    </div>
  );
}

// ── Confirmation Dialog ───────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Handle Escape key to close dialog (and stop propagation to prevent drawer close)
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    // Use capture phase to intercept before drawer's listener
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              confirmVariant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gray-900 hover:bg-gray-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast Error ───────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-3 rounded-lg bg-red-600 px-4 py-3 text-white shadow-lg">
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="text-white/80 hover:text-white">
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main Drawer ───────────────────────────────────────────────────────────

export function Drawer({ outreachId, onClose, onAction }: DrawerProps) {
  const [ctx, setCtx] = useState<DrawerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load drawer context (and claim the row for 60 min)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Claim first (best-effort)
        await fetch(`/api/admin/staffing-outreach/${outreachId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim" }),
        });
        const res = await fetch(`/api/admin/staffing-outreach/${outreachId}`);
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
        const data = await res.json();
        if (!cancelled) setCtx(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [outreachId]);

  const handleAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/admin/staffing-outreach/${outreachId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Action failed");
      }
      return data as DrawerContext;
    },
    [outreachId],
  );

  const handleAdvance = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      try {
        const refreshed = await handleAction(action, payload);
        // Release claim before advancing
        await fetch(`/api/admin/staffing-outreach/${outreachId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "release" }),
        });
        onAction(refreshed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    },
    [handleAction, onAction, outreachId],
  );

  // For actions that should refresh the drawer but NOT advance to next provider
  const handleRefresh = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      try {
        const refreshed = await handleAction(action, payload);
        setCtx(refreshed); // Update local state, stay on same provider
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    },
    [handleAction],
  );

  const clearError = useCallback(() => setError(null), []);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close drawer"
      />
      {/* Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          {ctx ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="truncate text-lg font-semibold text-gray-900">
                  {ctx.provider.provider_name}
                </h2>
                <StatusBadge status={ctx.outreach.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-gray-500">
                {ctx.provider.provider_category}
                {ctx.provider.city && ` · ${ctx.provider.city}, ${ctx.provider.state}`}
              </p>
              {ctx.touchpoints.length > 0 && (
                <div className="mt-2">
                  <EngagementSignals touchpoints={ctx.touchpoints} />
                </div>
              )}
            </div>
          ) : (
            <h2 className="text-lg font-semibold text-gray-400">Loading...</h2>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : error && !ctx ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">Failed to load</p>
              <p className="mt-1 text-sm text-gray-500">{error}</p>
            </div>
          ) : ctx ? (
            <div className="space-y-6">
              <ProviderSummary ctx={ctx} />
              <NewSection ctx={ctx} onAction={handleAction} onAdvance={handleAdvance} setError={setError} />
              <NurturingSection ctx={ctx} onAction={handleAction} onAdvance={handleAdvance} setError={setError} />
              <CallSection ctx={ctx} onAdvance={handleAdvance} setError={setError} />
              <EnrolledSection ctx={ctx} />
              <ActivatedSection ctx={ctx} onRefresh={handleRefresh} setError={setError} />
              <ClosedSection ctx={ctx} onRefresh={handleRefresh} setError={setError} />
              <HistorySection touchpoints={ctx.touchpoints} />
            </div>
          ) : null}
        </div>
      </aside>

      {/* Toast error display */}
      {error && <Toast message={error} onClose={clearError} />}
    </>
  );
}

// ── Provider summary (top of drawer) ─────────────────────────────────────

function ProviderSummary({ ctx }: { ctx: DrawerContext }) {
  const [phoneCopied, setPhoneCopied] = useState(false);

  const copyPhone = async () => {
    if (!ctx.provider.phone) return;
    try {
      await navigator.clipboard.writeText(ctx.provider.phone);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 2000);
    } catch {
      // Silently fail
    }
  };

  const verifiedContact = ctx.contacts.find((c) => c.is_primary) || ctx.contacts[0];

  return (
    <section className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
      {/* Contact actions - all on one line */}
      <div className="flex flex-wrap items-center gap-2">
        {ctx.provider.phone && (
          <div className="inline-flex items-center rounded-lg bg-gray-900 shadow-sm">
            <a
              href={`tel:${ctx.provider.phone}`}
              className="inline-flex items-center gap-2 rounded-l-lg px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              <PhoneIcon className="h-4 w-4" />
              {ctx.provider.phone}
            </a>
            <button
              onClick={copyPhone}
              className="inline-flex items-center rounded-r-lg border-l border-gray-700 px-2 py-2 text-white transition-colors hover:bg-gray-800"
              title="Copy phone number"
            >
              {phoneCopied ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
        {ctx.provider.website && (
          <a
            href={ctx.provider.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ExternalLinkIcon className="h-4 w-4" />
            Website
          </a>
        )}
        {ctx.provider.slug && (
          <a
            href={`https://olera.care/providers/${ctx.provider.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ExternalLinkIcon className="h-4 w-4" />
            Olera Profile
          </a>
        )}
      </div>

      {/* Metadata row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
        <span className="font-medium text-gray-700">{ctx.batch.university_name}</span>
        <span className="text-gray-300">·</span>
        <span>Attempts: {ctx.outreach.attempts_count}</span>
        {ctx.outreach.last_engagement_at && (
          <>
            <span className="text-gray-300">·</span>
            <span>
              Last activity: {new Date(ctx.outreach.last_engagement_at).toLocaleDateString()}
            </span>
          </>
        )}
      </div>

      {/* Verified contact */}
      {verifiedContact && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-emerald-700">Verified contact:</span>
            <span className="text-emerald-900">{verifiedContact.name}</span>
            {verifiedContact.role && (
              <span className="text-emerald-700">({verifiedContact.role})</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-emerald-700">
            <span>{verifiedContact.email}</span>
            {verifiedContact.phone && <span>{verifiedContact.phone}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Section 1: Research & pre-call ───────────────────────────────────────

/**
 * Map university slugs to their service areas.
 * Must stay in sync with lib/staffing-outreach/partner-universities.ts
 */
const SERVICE_AREA_BY_SLUG: Record<string, string> = {
  "ut-austin": "Austin area",
  "texas-am": "Bryan-College Station area",
  "u-houston": "Houston area",
  "u-florida": "Gainesville area",
  "florida-state": "Tallahassee area",
  "u-georgia": "Athens area",
  "emory": "Atlanta area",
  "unc-chapel-hill": "Chapel Hill area",
  "duke": "Durham area",
  "uva": "Charlottesville area",
  "virginia-tech": "Blacksburg area",
  "vanderbilt": "Nashville area",
  "u-tennessee-knoxville": "Knoxville area",
  "u-kentucky": "Lexington area",
  "ohio-state": "Columbus area",
  "u-michigan": "Ann Arbor area",
  "michigan-state": "East Lansing area",
  "penn-state": "State College area",
  "uw-madison": "Madison area",
  "u-minnesota": "Minneapolis area",
  "uiuc": "Champaign area",
  "indiana-bloomington": "Bloomington area",
  "cu-boulder": "Boulder area",
  "arizona-state": "Phoenix area",
  "u-utah": "Salt Lake City area",
};

function getServiceArea(universitySlug: string): string {
  return SERVICE_AREA_BY_SLUG[universitySlug] || "the area";
}

/**
 * Generate initial outreach email plain text.
 */
function generateInitialEmailText(universityName: string, serviceArea: string) {
  return {
    subject: `${universityName} Student Caregiver Program`,
    body: `Hello

I am hoping to reach the person who handles hiring to share more information on a pilot ${universityName} Student Caregiver Program.

My name is Dr. Logan DuBose. I am a physician-researcher working with the National Institute of Aging, a small business owner, and affiliate faculty at ${universityName}. I am currently working on a pilot program to match pre-nursing and pre-medical students with care agency jobs so they can help improve community care worker turnover and shortages, while gaining critical experience for their future careers as doctors and nurses.

Would you be interested in hearing more about this program? In pilot testing in the ${serviceArea}, I have seen potential for it to be an evergreen pipeline delivering vetted pre-health ${universityName} students seeking employment in caregiver roles.

Some materials to consider:
• Pilot website here (demo profiles): https://olera.care/medjobs/providers
• Demo video I made here: https://www.youtube.com/watch?v=ParY1tGaiew (~7 minutes long)
• Recent system improvements since the last pilot include a more robust candidate vetting and scheduling system, and the price point potentially being lowered to $50/month (however, for earlier adopters, I am not charging anything for a period of time, and instead would appreciate feedback and reviews of the system)
• Goal to send 5 new candidates a week with 1-3 solid hires per month in perpetuity

Please let me know if you have any questions, would like to meet, or if there is any interest in restarting the program. If I can get your team's buy-in, then I will begin recruitment for you at ${universityName} pre-nursing and pre-medical organizations this month (and could be sending vetted candidates for summer caregiving roles ASAP)!

Take care!

Best,
Logan`,
  };
}

/**
 * Generate follow-up email plain text.
 */
function generateFollowUpEmailText(universityName: string) {
  return {
    subject: `Quick follow-up – ${universityName} Student Program`,
    body: `Hi,

Just wanted to follow up in case this got buried.

We're starting to connect agencies with pre-nursing students from ${universityName} who are actively looking for caregiving roles.

Would it make sense to share a quick overview or schedule a brief call?

Best,
Logan`,
  };
}

/**
 * Build Gmail compose URL with pre-filled fields.
 */
function buildGmailComposeUrl(opts: { to: string; subject: string; body: string }): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: opts.to,
    su: opts.subject,
    body: opts.body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * NewSection - shown for providers in "New" tab (status: queued)
 * Actions: Research, send initial email → moves to Nurturing
 */
function NewSection({
  ctx,
  onAction,
  onAdvance,
  setError,
}: {
  ctx: DrawerContext;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<DrawerContext>;
  onAdvance: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  setError: (err: string | null) => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState(
    ctx.provider.email || ctx.outreach.research_data.general_email || "",
  );
  const [contactFormUrl, setContactFormUrl] = useState(
    ctx.outreach.research_data.contact_form_url ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate email content
  const universityName = ctx.batch.university_name;
  const serviceArea = getServiceArea(ctx.batch.university_slug);
  const initialEmail = generateInitialEmailText(universityName, serviceArea);
  const [emailBody, setEmailBody] = useState(initialEmail.body);

  // Only show for queued status (New tab)
  if (ctx.outreach.status !== "queued") {
    return null;
  }

  const saveResearch = async () => {
    setSaving(true);
    try {
      await onAction("update_research", {
        research: { general_email: recipientEmail, contact_form_url: contactFormUrl },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openGmail = () => {
    if (!recipientEmail.trim()) {
      setError("Enter a recipient email first.");
      return;
    }
    const url = buildGmailComposeUrl({
      to: recipientEmail.trim(),
      subject: initialEmail.subject,
      body: emailBody,
    });
    window.open(url, "_blank");
  };

  const copyToClipboard = async () => {
    const fullText = `Subject: ${initialEmail.subject}\n\n${emailBody}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const markInitialSent = async () => {
    if (!recipientEmail.trim()) {
      setError("Enter a recipient email first.");
      return;
    }
    setSaving(true);
    try {
      // Save email to research_data first
      await onAction("update_research", {
        research: { general_email: recipientEmail.trim(), contact_form_url: contactFormUrl },
      });
      // Log the touchpoint and move to Nurturing tab
      await onAdvance("log_email_sent", {
        emailType: "initial",
        recipientEmail: recipientEmail.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log email");
      setSaving(false);
    }
  };

  return (
    <section>
      <SectionHeader title="Send Initial Email" />
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {/* Recipient email field */}
        <Field
          label="To"
          placeholder="info@agency.com"
          value={recipientEmail}
          onChange={setRecipientEmail}
          onBlur={saveResearch}
          type="email"
        />

        {/* Subject */}
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-1 text-xs font-medium text-gray-600">Subject</p>
          <p className="text-sm text-gray-800">{initialEmail.subject}</p>
        </div>

        {/* Email body */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Email Body</label>
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            rows={12}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openGmail}
            disabled={!recipientEmail.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open in Gmail
          </button>
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4 text-emerald-600" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4" />
                Copy
              </>
            )}
          </button>
        </div>

        {/* Mark as sent (moves to Nurturing) */}
        <button
          onClick={markInitialSent}
          disabled={saving || !recipientEmail.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <CheckIcon className="h-4 w-4" />
          )}
          {saving ? "Sending..." : "Mark Initial Email as Sent"}
        </button>

        {/* Contact form (optional) */}
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <Field
            label="Contact form URL (optional)"
            placeholder="https://agency.com/contact"
            value={contactFormUrl}
            onChange={setContactFormUrl}
            onBlur={saveResearch}
          />
          {contactFormUrl.trim() && (
            <a
              href={contactFormUrl.trim()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Open form
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * NurturingSection - shown for providers in "Nurturing" tab (pre-consent stages)
 * Actions: Follow-up emails for providers we haven't connected with yet
 *
 * NOT shown for:
 * - queued (should use NewSection)
 * - consented/activated (they've engaged, follow-up doesn't make sense)
 * - enrolled/closed (terminal states)
 */
function NurturingSection({
  ctx,
  onAction,
  onAdvance,
  setError,
}: {
  ctx: DrawerContext;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<DrawerContext>;
  onAdvance: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  setError: (err: string | null) => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState(
    ctx.provider.email || ctx.outreach.research_data.general_email || "",
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reverting, setReverting] = useState(false);

  // Track touchpoints + local state for immediate feedback
  const initialEmailTouchpoint = ctx.touchpoints.find((t) => t.type === "pre_call_email_sent");
  const followUpTouchpoint = ctx.touchpoints.find((t) => t.type === "follow_up_email_sent");
  const [sentFollowUp, setSentFollowUp] = useState(Boolean(followUpTouchpoint));
  const [followUpSentAt, setFollowUpSentAt] = useState<string | null>(
    followUpTouchpoint?.created_at ?? null,
  );

  // Generate follow-up email
  const universityName = ctx.batch.university_name;
  const followUpEmail = generateFollowUpEmailText(universityName);
  const [emailBody, setEmailBody] = useState(followUpEmail.body);

  // Only show for pre-consent nurturing statuses
  // Don't show for consented/activated (they've engaged) or queued (use NewSection)
  const showForStatuses = new Set([
    "pre_call_outreach",
    "calling",
    "connected_no_consent",
  ]);
  if (!showForStatuses.has(ctx.outreach.status)) {
    return null;
  }

  const handleMoveBackToInitialContact = async () => {
    setReverting(true);
    try {
      await onAdvance("revert_to_queued");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move back");
    } finally {
      setReverting(false);
    }
  };

  const saveResearch = async () => {
    try {
      await onAction("update_research", {
        research: { general_email: recipientEmail },
      });
    } catch {
      // Silently fail on blur save
    }
  };

  const openGmail = () => {
    if (!recipientEmail.trim()) {
      setError("Enter a recipient email first.");
      return;
    }
    const url = buildGmailComposeUrl({
      to: recipientEmail.trim(),
      subject: followUpEmail.subject,
      body: emailBody,
    });
    window.open(url, "_blank");
  };

  const copyToClipboard = async () => {
    const fullText = `Subject: ${followUpEmail.subject}\n\n${emailBody}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const markFollowUpSent = async () => {
    if (!recipientEmail.trim()) {
      setError("Enter a recipient email first.");
      return;
    }
    setSaving(true);
    try {
      await onAction("log_email_sent", {
        emailType: "follow_up",
        recipientEmail: recipientEmail.trim(),
      });
      setSentFollowUp(true);
      setFollowUpSentAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log email");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <SectionHeader title="Follow-up" />
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {/* Initial email status */}
        {initialEmailTouchpoint && (
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <CheckIcon className="h-4 w-4 text-emerald-600" />
            <span>
              Initial email sent{" "}
              <span className="text-gray-500">
                ({new Date(initialEmailTouchpoint.created_at).toLocaleDateString()})
              </span>
            </span>
          </div>
        )}

        {/* Follow-up email section */}
        {!sentFollowUp ? (
          <>
            <Field
              label="To"
              placeholder="info@agency.com"
              value={recipientEmail}
              onChange={setRecipientEmail}
              onBlur={saveResearch}
              type="email"
            />

            <div>
              <p className="mb-1 text-xs font-medium text-gray-600">Subject</p>
              <p className="text-sm text-gray-800">{followUpEmail.subject}</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Email Body</label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                rows={8}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={openGmail}
                disabled={!recipientEmail.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open in Gmail
              </button>
              <button
                onClick={copyToClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-4 w-4 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <button
              onClick={markFollowUpSent}
              disabled={saving || !recipientEmail.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-primary-500 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/30 border-t-gray-600" />
              ) : (
                <CheckIcon className="h-4 w-4" />
              )}
              {saving ? "Saving..." : "Mark Follow-up as Sent"}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckIcon className="h-4 w-4" />
            <span>
              Follow-up sent{" "}
              {followUpSentAt && (
                <span className="text-emerald-600">
                  ({new Date(followUpSentAt).toLocaleDateString()})
                </span>
              )}
            </span>
          </div>
        )}

        {/* Move back link - only for pre_call_outreach status (just sent initial email) */}
        {ctx.outreach.status === "pre_call_outreach" && (
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={handleMoveBackToInitialContact}
              disabled={reverting}
              className="flex items-center gap-1.5 text-xs text-gray-400 underline transition-colors hover:text-gray-600 disabled:opacity-50"
            >
              {reverting && (
                <div className="h-3 w-3 animate-spin rounded-full border border-gray-400/30 border-t-gray-500" />
              )}
              {reverting ? "Moving back..." : "Sent by mistake? Move back to Initial Contact"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Section 2: Call ──────────────────────────────────────────────────────

function CallSection({
  ctx,
  onAdvance,
  setError,
}: {
  ctx: DrawerContext;
  onAdvance: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  setError: (err: string | null) => void;
}) {
  const [showConnected, setShowConnected] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  // Track which specific action is in progress (null = none, "connected" = submitting contact form)
  const [activeAction, setActiveAction] = useState<TouchpointType | "connected" | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ type: TouchpointType; title: string; message: string } | null>(null);

  const isBusy = activeAction !== null;

  // Show only once pre-call is done (or further along)
  const callableStatuses = new Set([
    "pre_call_outreach",
    "calling",
    "connected_no_consent",
    "consented",
    "nurturing",
  ]);
  if (!callableStatuses.has(ctx.outreach.status)) return null;

  const disposition = async (type: TouchpointType) => {
    setActiveAction(type);
    try {
      await onAdvance("disposition", { type });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disposition failed");
    } finally {
      setActiveAction(null);
    }
  };

  const handleDispositionWithConfirm = (type: TouchpointType) => {
    // Destructive actions require confirmation
    if (type === "manual_dnc") {
      setConfirmDialog({
        type,
        title: "Mark as Do Not Contact?",
        message: "This will close the provider and prevent any future outreach. This action can be undone later if needed.",
      });
    } else if (type === "call_wrong_number") {
      setConfirmDialog({
        type,
        title: "Mark as Wrong Number?",
        message: "This will close the provider with a wrong number status. Make sure the phone number is actually incorrect.",
      });
    } else {
      disposition(type);
    }
  };

  const submitConnected = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setActiveAction("connected");
    try {
      await onAdvance("add_contact_and_send", { name, role, email, phone, notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <section>
      <SectionHeader title="Call" />
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        {/* Call Script */}
        <div className="rounded-lg bg-blue-50 p-3">
          <button
            onClick={() => setShowScript((s) => !s)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Call Script
            </span>
            <span className="text-xs text-blue-600">{showScript ? "Hide" : "Show"}</span>
          </button>
          {showScript && (
            <p className="mt-2 text-sm leading-relaxed text-blue-900">
              &ldquo;Hi, I&apos;m calling on behalf of Dr. Logan DuBose. He oversees a program
              for pre-nursing students at <strong>{ctx.batch.university_name}</strong> that
              connects students with open caregiving roles at local agencies.&rdquo;
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DispositionButton onClick={() => disposition("call_no_answer")} disabled={isBusy}>
            {activeAction === "call_no_answer" ? <Spinner size="sm" /> : null}
            No Answer
          </DispositionButton>
          <DispositionButton onClick={() => disposition("call_voicemail")} disabled={isBusy}>
            {activeAction === "call_voicemail" ? <Spinner size="sm" /> : null}
            Voicemail
          </DispositionButton>
          <DispositionButton onClick={() => handleDispositionWithConfirm("call_wrong_number")} disabled={isBusy}>
            {activeAction === "call_wrong_number" ? <Spinner size="sm" /> : null}
            Wrong Number
          </DispositionButton>
          <DispositionButton
            onClick={() => setShowConnected((s) => !s)}
            disabled={isBusy}
            variant="primary"
          >
            {showConnected ? "Hide form" : "Connected →"}
          </DispositionButton>
          <DispositionButton onClick={() => disposition("call_not_interested")} disabled={isBusy}>
            {activeAction === "call_not_interested" ? <Spinner size="sm" /> : null}
            Not Interested
          </DispositionButton>
          <DispositionButton
            onClick={() => handleDispositionWithConfirm("manual_dnc")}
            disabled={isBusy}
            variant="danger"
          >
            {activeAction === "manual_dnc" ? <Spinner size="sm" /> : null}
            Stop / DNC
          </DispositionButton>
        </div>

        {showConnected && (
          <div className="space-y-3 rounded-lg bg-emerald-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Capture Contact &amp; Send Enrollment Email
            </p>
            <Field label="Name *" value={name} onChange={setName} placeholder="Jane Doe" />
            <Select
              label="Role"
              value={role}
              onChange={setRole}
              placeholder="Select role..."
              size="sm"
              options={[
                { value: "Owner", label: "Owner" },
                { value: "Administrator", label: "Administrator" },
                { value: "HR Manager", label: "HR Manager" },
                { value: "Hiring Manager", label: "Hiring Manager" },
                { value: "Recruiter", label: "Recruiter" },
                { value: "Office Manager", label: "Office Manager" },
                { value: "Director of Nursing", label: "Director of Nursing" },
                { value: "Care Coordinator", label: "Care Coordinator" },
                { value: "Other", label: "Other" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Email *"
                value={email}
                onChange={setEmail}
                placeholder="jane@agency.com"
                type="email"
              />
              <Field label="Phone" value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
            </div>
            <TextareaField
              label="Notes"
              value={notes}
              onChange={setNotes}
              placeholder="e.g., Spoke with Jane, she confirmed interest and wants to receive student candidates"
              rows={3}
            />
            <button
              onClick={submitConnected}
              disabled={isBusy || !name.trim() || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeAction === "connected" && <Spinner />}
              Save Contact &amp; Send Enrollment Email
            </button>
            <p className="text-center text-xs text-emerald-600">
              This sends Logan&apos;s Step 1 email with the T&amp;C acceptance link
            </p>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        confirmLabel="Confirm"
        confirmVariant="danger"
        onConfirm={() => {
          if (confirmDialog) {
            disposition(confirmDialog.type);
          }
          setConfirmDialog(null);
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </section>
  );
}

// ── Terminal State Sections ───────────────────────────────────────────────

/**
 * EnrolledSection - shown for enrolled providers
 * Shows success state with enrollment details
 */
function EnrolledSection({ ctx }: { ctx: DrawerContext }) {
  if (ctx.outreach.status !== "enrolled") return null;

  const enrollmentTouchpoint = ctx.touchpoints.find((t) => t.type === "system_enrolled");
  const enrollmentDate = enrollmentTouchpoint?.created_at;
  const verifiedContact = ctx.contacts.find((c) => c.is_primary) || ctx.contacts[0];

  return (
    <section>
      <div className="rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-6">
        {/* Success icon */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <h3 className="mb-2 text-center text-lg font-semibold text-green-800">
          Successfully Enrolled!
        </h3>
        <p className="mb-4 text-center text-sm text-green-700">
          This provider has accepted the Terms & Conditions and joined the pilot program.
        </p>

        {/* Enrollment details */}
        <div className="space-y-3 rounded-lg bg-white/60 p-4">
          {enrollmentDate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Enrolled on</span>
              <span className="font-medium text-gray-900">
                {new Date(enrollmentDate).toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}

          {verifiedContact && (
            <>
              <div className="border-t border-green-100" />
              <div className="text-sm">
                <p className="mb-1 font-medium text-gray-900">{verifiedContact.name}</p>
                {verifiedContact.role && (
                  <p className="text-gray-600">{verifiedContact.role}</p>
                )}
                <p className="text-gray-600">{verifiedContact.email}</p>
                {verifiedContact.phone && (
                  <p className="text-gray-600">{verifiedContact.phone}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* What happens next */}
        <div className="mt-4 rounded-lg bg-green-100/50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-green-700">What happens next</p>
          <ul className="mt-2 space-y-1 text-sm text-green-800">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">•</span>
              Provider will receive vetted student candidates
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">•</span>
              Goal: 5 new candidates/week, 1-3 hires/month
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">•</span>
              Free during pilot, feedback appreciated
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * ActivatedSection - shown for activated providers (clicked magic link but haven't enrolled)
 * Shows they're one step away from enrollment
 */
function ActivatedSection({
  ctx,
  onRefresh,
  setError,
}: {
  ctx: DrawerContext;
  onRefresh: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  setError: (err: string | null) => void;
}) {
  const [resending, setResending] = useState(false);

  if (ctx.outreach.status !== "activated") return null;

  const activationTouchpoint = ctx.touchpoints.find((t) => t.type === "system_activated");
  const activationDate = activationTouchpoint?.created_at;
  const verifiedContact = ctx.contacts.find((c) => c.is_primary) || ctx.contacts[0];

  const resendEnrollmentEmail = async () => {
    if (!verifiedContact) {
      setError("No contact to send to");
      return;
    }
    setResending(true);
    try {
      await onRefresh("resend_enrollment_email", {
        contactId: verifiedContact.id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resend email");
    } finally {
      setResending(false);
    }
  };

  return (
    <section>
      <div className="rounded-xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 p-6">
        {/* Progress icon */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-100">
            <svg className="h-8 w-8 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </div>
        </div>

        <h3 className="mb-2 text-center text-lg font-semibold text-cyan-800">
          Link Clicked — Awaiting Enrollment
        </h3>
        <p className="mb-4 text-center text-sm text-cyan-700">
          This provider clicked the magic link but hasn&apos;t completed the T&C acceptance yet.
        </p>

        {/* Activation details */}
        <div className="space-y-3 rounded-lg bg-white/60 p-4">
          {activationDate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Link clicked</span>
              <span className="font-medium text-gray-900">
                {new Date(activationDate).toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}

          {verifiedContact && (
            <>
              <div className="border-t border-cyan-100" />
              <div className="text-sm">
                <p className="mb-1 font-medium text-gray-900">{verifiedContact.name}</p>
                <p className="text-gray-600">{verifiedContact.email}</p>
              </div>
            </>
          )}
        </div>

        {/* Resend option */}
        {verifiedContact && (
          <button
            onClick={resendEnrollmentEmail}
            disabled={resending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-cyan-300 bg-white py-3 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-50 disabled:opacity-50"
          >
            {resending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-600" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            {resending ? "Sending..." : "Resend Enrollment Email"}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * ClosedSection - shown for do_not_contact and wrong_number statuses
 * Shows reason for closure and option to reopen
 */
function ClosedSection({
  ctx,
  onRefresh,
  setError,
}: {
  ctx: DrawerContext;
  onRefresh: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  setError: (err: string | null) => void;
}) {
  const [reopening, setReopening] = useState(false);

  const status = ctx.outreach.status;
  if (status !== "do_not_contact" && status !== "wrong_number") return null;

  const isDNC = status === "do_not_contact";
  const closureTouchpoint = ctx.touchpoints.find(
    (t) => t.type === (isDNC ? "manual_dnc" : "call_wrong_number")
  );
  const autoClosureTouchpoint = ctx.touchpoints.find((t) => t.type === "system_auto_dnc");
  const relevantTouchpoint = closureTouchpoint || autoClosureTouchpoint;
  const closureDate = relevantTouchpoint?.created_at;
  const closureNotes = relevantTouchpoint?.notes;
  const isAutoClosed = !!autoClosureTouchpoint && !closureTouchpoint;

  const handleReopen = async () => {
    setReopening(true);
    try {
      await onRefresh("reopen", {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reopen");
    } finally {
      setReopening(false);
    }
  };

  return (
    <section>
      <div className={`rounded-xl border-2 p-6 ${
        isDNC
          ? "border-red-200 bg-gradient-to-br from-red-50 to-rose-50"
          : "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50"
      }`}>
        {/* Warning icon */}
        <div className="mb-4 flex justify-center">
          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${
            isDNC ? "bg-red-100" : "bg-orange-100"
          }`}>
            <svg className={`h-8 w-8 ${isDNC ? "text-red-600" : "text-orange-600"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              {isDNC ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              )}
            </svg>
          </div>
        </div>

        <h3 className={`mb-2 text-center text-lg font-semibold ${isDNC ? "text-red-800" : "text-orange-800"}`}>
          {isDNC ? "Do Not Contact" : "Wrong Number"}
        </h3>
        <p className={`mb-4 text-center text-sm ${isDNC ? "text-red-700" : "text-orange-700"}`}>
          {isDNC
            ? isAutoClosed
              ? "This provider was automatically closed after maximum outreach attempts."
              : "This provider has been marked as do not contact."
            : "The phone number on file appears to be incorrect."}
        </p>

        {/* Closure details */}
        <div className={`space-y-3 rounded-lg p-4 ${isDNC ? "bg-white/60" : "bg-white/60"}`}>
          {closureDate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Closed on</span>
              <span className="font-medium text-gray-900">
                {new Date(closureDate).toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}

          {isAutoClosed && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Auto</span>
              <span>Closed automatically by system</span>
            </div>
          )}

          {closureNotes && (
            <>
              <div className={`border-t ${isDNC ? "border-red-100" : "border-orange-100"}`} />
              <div className="text-sm">
                <p className="mb-1 font-medium text-gray-700">Notes</p>
                <p className="text-gray-600">{closureNotes}</p>
              </div>
            </>
          )}
        </div>

        {/* Reopen option */}
        <button
          onClick={handleReopen}
          disabled={reopening}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 bg-white py-3 text-sm font-medium transition-colors disabled:opacity-50 ${
            isDNC
              ? "border-red-300 text-red-700 hover:bg-red-50"
              : "border-orange-300 text-orange-700 hover:bg-orange-50"
          }`}
        >
          {reopening ? (
            <div className={`h-4 w-4 animate-spin rounded-full border-2 border-t-current ${
              isDNC ? "border-red-400/30" : "border-orange-400/30"
            }`} />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          )}
          {reopening ? "Reopening..." : "Reopen for Outreach"}
        </button>
      </div>
    </section>
  );
}

// ── Section 3: History ───────────────────────────────────────────────────

// Touchpoint type to icon mapping
const TOUCHPOINT_ICONS: Record<string, { icon: string; color: string }> = {
  // Emails
  pre_call_email_sent: { icon: "📧", color: "text-blue-600 bg-blue-50" },
  follow_up_email_sent: { icon: "📧", color: "text-blue-600 bg-blue-50" },
  email_pre_consent_a_sent: { icon: "📧", color: "text-blue-600 bg-blue-50" },
  email_pre_consent_b_sent: { icon: "📧", color: "text-blue-600 bg-blue-50" },
  email_post_consent_step1_sent: { icon: "📧", color: "text-emerald-600 bg-emerald-50" },
  email_post_consent_step2_sent: { icon: "📧", color: "text-emerald-600 bg-emerald-50" },
  email_post_consent_step3_sent: { icon: "📧", color: "text-emerald-600 bg-emerald-50" },
  email_post_consent_step4_sent: { icon: "📧", color: "text-emerald-600 bg-emerald-50" },
  email_post_consent_step5_sent: { icon: "📧", color: "text-emerald-600 bg-emerald-50" },
  email_welcome_sent: { icon: "📧", color: "text-green-600 bg-green-50" },
  email_new_student_trigger_sent: { icon: "📧", color: "text-purple-600 bg-purple-50" },
  // Email events
  email_opened: { icon: "👁", color: "text-sky-600 bg-sky-50" },
  email_clicked: { icon: "🔗", color: "text-purple-600 bg-purple-50" },
  email_bounced: { icon: "⚠️", color: "text-amber-600 bg-amber-50" },
  reply_received: { icon: "💬", color: "text-green-600 bg-green-50" },
  // Calls
  call_no_answer: { icon: "📞", color: "text-gray-600 bg-gray-100" },
  call_voicemail: { icon: "📞", color: "text-gray-600 bg-gray-100" },
  call_wrong_number: { icon: "📞", color: "text-orange-600 bg-orange-50" },
  call_connected_no_consent: { icon: "📞", color: "text-amber-600 bg-amber-50" },
  call_connected_consent: { icon: "📞", color: "text-emerald-600 bg-emerald-50" },
  call_not_interested: { icon: "📞", color: "text-red-600 bg-red-50" },
  // Status changes
  manual_dnc: { icon: "🚫", color: "text-red-600 bg-red-50" },
  system_auto_dnc: { icon: "🚫", color: "text-red-600 bg-red-50" },
  system_activated: { icon: "✨", color: "text-cyan-600 bg-cyan-50" },
  system_enrolled: { icon: "🎉", color: "text-green-600 bg-green-50" },
  status_reverted: { icon: "↩️", color: "text-gray-600 bg-gray-100" },
  // Other
  research_completed: { icon: "🔍", color: "text-gray-600 bg-gray-100" },
  contact_form_submitted: { icon: "📝", color: "text-blue-600 bg-blue-50" },
  fax_sent: { icon: "📠", color: "text-gray-600 bg-gray-100" },
  mail_sent: { icon: "✉️", color: "text-gray-600 bg-gray-100" },
};

function HistorySection({ touchpoints }: { touchpoints: StaffingTouchpoint[] }) {
  // Group touchpoints by date
  const groupedByDate = touchpoints.reduce((acc, tp) => {
    const date = new Date(tp.created_at).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(tp);
    return acc;
  }, {} as Record<string, StaffingTouchpoint[]>);

  const isSystemEvent = (type: string) =>
    type.startsWith("system_") || type.startsWith("email_opened") || type.startsWith("email_clicked") || type.startsWith("email_bounced");

  return (
    <section>
      <SectionHeader title="History" />
      {touchpoints.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
          <p className="text-sm text-gray-400">No activity yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate).map(([date, tps]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {date}
              </p>
              <ul className="space-y-2">
                {tps.map((t) => {
                  const iconConfig = TOUCHPOINT_ICONS[t.type] || { icon: "•", color: "text-gray-600 bg-gray-100" };
                  const isSystem = isSystemEvent(t.type);
                  const payload = t.payload as Record<string, unknown> | undefined;

                  return (
                    <li
                      key={t.id}
                      className={`rounded-lg border px-3 py-2.5 ${
                        isSystem
                          ? "border-gray-100 bg-gray-50/50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs ${iconConfig.color}`}>
                          {iconConfig.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-medium ${isSystem ? "text-gray-600" : "text-gray-800"}`}>
                              {humanType(t.type)}
                            </span>
                            <span className="flex-shrink-0 text-xs text-gray-400">
                              {new Date(t.created_at).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {/* Show payload details */}
                          {typeof payload?.recipientEmail === "string" && (
                            <p className="mt-0.5 text-xs text-gray-500">
                              To: {payload.recipientEmail}
                            </p>
                          )}
                          {t.notes && (
                            <p className="mt-1 text-sm text-gray-600">{t.notes}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Small UI primitives ──────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
      {title}
    </h3>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
    </label>
  );
}

function DispositionButton({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}) {
  const base = "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-primary-600 text-white hover:bg-primary-700 shadow-sm"
      : variant === "danger"
      ? "border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function Spinner({ size = "default" }: { size?: "sm" | "default" }) {
  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <div className={`${sizeClass} animate-spin rounded-full border-2 border-current/30 border-t-current`} />
  );
}

function humanType(t: string): string {
  const map: Record<string, string> = {
    research_completed: "Research updated",
    pre_call_email_sent: "Pre-call email sent",
    follow_up_email_sent: "Follow-up email sent",
    contact_form_submitted: "Contact form submitted",
    fax_sent: "Fax sent",
    mail_sent: "Mail sent",
    call_no_answer: "Call: no answer",
    call_voicemail: "Call: voicemail",
    call_wrong_number: "Call: wrong number",
    call_connected_no_consent: "Call: connected, no consent",
    call_connected_consent: "Call: connected, consent given",
    call_not_interested: "Not interested",
    manual_dnc: "Marked: do not contact",
    email_pre_consent_a_sent: "Email: pre-consent A",
    email_pre_consent_b_sent: "Email: pre-consent B",
    email_post_consent_step1_sent: "Email: Step 1 (enrollment)",
    email_post_consent_step2_sent: "Email: Step 2",
    email_post_consent_step3_sent: "Email: Step 3",
    email_post_consent_step4_sent: "Email: Step 4",
    email_post_consent_step5_sent: "Email: Step 5",
    email_welcome_sent: "Welcome email sent",
    email_new_student_trigger_sent: "New student email sent",
    email_opened: "Email opened",
    email_clicked: "Link clicked",
    email_bounced: "Email bounced",
    reply_received: "Reply received",
    system_activated: "Activated (link clicked)",
    system_enrolled: "Enrolled (T&C accepted)",
    system_auto_dnc: "Auto-closed (max attempts)",
    status_reverted: "Status reverted",
  };
  return map[t] ?? t;
}

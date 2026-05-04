"use client";

/**
 * Staffing Outreach drawer.
 *
 * Three sections, top to bottom (matching the workflow):
 *   1. Research & pre-call  — research the website, send pre-call email,
 *                              log contact-form submit, mark complete
 *   2. Call                  — disposition buttons; "Connected" expands
 *                              into the Add & Send capture form
 *   3. History               — chronological touchpoint timeline + notes
 *
 * After any action, the parent page refetches the queue and auto-advances
 * to the next provider in the same tab.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  DrawerContext,
  StaffingTouchpoint,
  TouchpointType,
} from "@/lib/staffing-outreach/types";

interface DrawerProps {
  outreachId: string;
  onClose: () => void;
  onAction: (refreshed: DrawerContext | null) => void;
}

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
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-label="Close drawer"
      />
      {/* Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          {ctx ? (
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-gray-900">
                {ctx.provider.provider_name}
              </h2>
              <p className="truncate text-sm text-gray-500">
                {[ctx.provider.address, ctx.provider.city, ctx.provider.state]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          ) : (
            <h2 className="text-lg font-semibold text-gray-400">Loading…</h2>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <span aria-hidden>×</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : ctx ? (
            <div className="space-y-6">
              <ProviderSummary ctx={ctx} />
              <ResearchSection ctx={ctx} onAction={handleAction} onAdvance={handleAdvance} setError={setError} />
              <CallSection ctx={ctx} onAdvance={handleAdvance} setError={setError} />
              <HistorySection touchpoints={ctx.touchpoints} />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

// ── Provider summary (top of drawer) ─────────────────────────────────────

function ProviderSummary({ ctx }: { ctx: DrawerContext }) {
  return (
    <section className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {ctx.provider.phone && (
          <a
            href={`tel:${ctx.provider.phone}`}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Call {ctx.provider.phone}
          </a>
        )}
        {ctx.provider.website && (
          <a
            href={ctx.provider.website}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Open website ↗
          </a>
        )}
        <span className="text-xs text-gray-500">
          {ctx.batch.university_name}
        </span>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Status: <span className="font-medium text-gray-700">{ctx.outreach.status}</span>
        {" · "}
        Attempts: {ctx.outreach.attempts_count}
        {ctx.contacts.length > 0 && ` · Verified contact: ${ctx.contacts[0].name}`}
      </p>
    </section>
  );
}

// ── Section 1: Research & pre-call ───────────────────────────────────────

function ResearchSection({
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
  const [generalEmail, setGeneralEmail] = useState(ctx.outreach.research_data.general_email ?? "");
  const [fax, setFax] = useState(ctx.outreach.research_data.fax ?? "");
  const [contactFormUrl, setContactFormUrl] = useState(
    ctx.outreach.research_data.contact_form_url ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [sentPreCall, setSentPreCall] = useState(
    ctx.touchpoints.some((t) => t.type === "pre_call_email_sent"),
  );
  const [sentFollowUp, setSentFollowUp] = useState(
    ctx.touchpoints.some((t) => t.type === "follow_up_email_sent"),
  );
  const [submittedForm, setSubmittedForm] = useState(
    ctx.touchpoints.some((t) => t.type === "contact_form_submitted"),
  );

  // Hide once status has moved past pre-call
  if (
    ctx.outreach.status !== "queued" &&
    ctx.outreach.status !== "pre_call_outreach"
  ) {
    return null;
  }

  const saveResearch = async () => {
    setSaving(true);
    try {
      await onAction("update_research", {
        research: { general_email: generalEmail, fax, contact_form_url: contactFormUrl },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const sendPreCall = async () => {
    if (!generalEmail.trim()) {
      setError("Enter a general email first.");
      return;
    }
    setSaving(true);
    try {
      await onAction("update_research", {
        research: { general_email: generalEmail, fax, contact_form_url: contactFormUrl },
      });
      await onAction("send_pre_call", { recipientEmail: generalEmail.trim() });
      setSentPreCall(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSaving(false);
    }
  };

  const sendFollowUp = async () => {
    if (!generalEmail.trim()) {
      setError("Enter a general email first.");
      return;
    }
    setSaving(true);
    try {
      await onAction("send_follow_up", { recipientEmail: generalEmail.trim() });
      setSentFollowUp(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSaving(false);
    }
  };

  const logContactForm = async () => {
    if (!contactFormUrl.trim()) {
      setError("Enter the contact form URL first.");
      return;
    }
    setSaving(true);
    try {
      await onAction("log_contact_form", { url: contactFormUrl.trim() });
      setSubmittedForm(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Log failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        1. Research &amp; pre-call
      </h3>
      <div className="space-y-3 rounded-lg border border-gray-100 bg-white p-4">
        <Field
          label="General email"
          placeholder="info@agency.com"
          value={generalEmail}
          onChange={setGeneralEmail}
          onBlur={saveResearch}
        />
        <Field
          label="Fax"
          placeholder="(555) 123-4567"
          value={fax}
          onChange={setFax}
          onBlur={saveResearch}
        />
        <Field
          label="Contact form URL"
          placeholder="https://agency.com/contact"
          value={contactFormUrl}
          onChange={setContactFormUrl}
          onBlur={saveResearch}
        />

        <div className="flex flex-wrap gap-2 pt-2">
          <ActionButton
            onClick={sendPreCall}
            disabled={saving || sentPreCall || !generalEmail.trim()}
          >
            {sentPreCall ? "✓ Pre-call email sent" : "Send pre-call email"}
          </ActionButton>
          {sentPreCall && (
            <ActionButton
              onClick={sendFollowUp}
              disabled={saving || sentFollowUp || !generalEmail.trim()}
            >
              {sentFollowUp ? "✓ Follow-up sent" : "Send follow-up"}
            </ActionButton>
          )}
          {contactFormUrl.trim() && (
            <a
              href={contactFormUrl.trim()}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Open form ↗
            </a>
          )}
          <ActionButton
            onClick={logContactForm}
            disabled={saving || submittedForm || !contactFormUrl.trim()}
            variant="secondary"
          >
            {submittedForm ? "✓ Form submitted" : "Mark as submitted"}
          </ActionButton>
          <ActionButton onClick={() => {}} disabled variant="secondary" title="Coming later">
            Send fax
          </ActionButton>
          <ActionButton onClick={() => {}} disabled variant="secondary" title="Coming later">
            Send mail
          </ActionButton>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <ActionButton
            onClick={() => onAdvance("mark_pre_call_complete")}
            disabled={saving}
            variant="primary"
            full
          >
            Pre-call complete → start calling
          </ActionButton>
        </div>
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
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      await onAdvance("disposition", { type });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disposition failed");
    } finally {
      setSaving(false);
    }
  };

  const submitConnected = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      await onAdvance("add_contact_and_send", { name, role, email, phone, notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        2. Call
      </h3>
      <div className="space-y-3 rounded-lg border border-gray-100 bg-white p-4">
        {/* Call Script */}
        <div className="rounded-md bg-blue-50 p-3">
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
          <DispositionButton onClick={() => disposition("call_no_answer")} disabled={saving}>
            No Answer
          </DispositionButton>
          <DispositionButton onClick={() => disposition("call_voicemail")} disabled={saving}>
            Voicemail
          </DispositionButton>
          <DispositionButton onClick={() => disposition("call_wrong_number")} disabled={saving}>
            Wrong Number
          </DispositionButton>
          <DispositionButton
            onClick={() => setShowConnected((s) => !s)}
            disabled={saving}
            variant="primary"
          >
            {showConnected ? "Hide form" : "Connected →"}
          </DispositionButton>
          <DispositionButton onClick={() => disposition("call_not_interested")} disabled={saving}>
            Not Interested
          </DispositionButton>
          <DispositionButton
            onClick={() => disposition("manual_dnc")}
            disabled={saving}
            variant="danger"
          >
            Stop / DNC
          </DispositionButton>
        </div>

        {showConnected && (
          <div className="space-y-3 rounded-md bg-emerald-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Capture verified contact &amp; send Step 1
            </p>
            <Field label="Name *" value={name} onChange={setName} placeholder="Jane Doe" />
            <Field label="Role" value={role} onChange={setRole} placeholder="HR Manager" />
            <Field
              label="Email *"
              value={email}
              onChange={setEmail}
              placeholder="jane@agency.com"
              type="email"
            />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
            <Field
              label="Notes (consent confirmation)"
              value={notes}
              onChange={setNotes}
              placeholder='"Said yes on the call to receiving info"'
            />
            <ActionButton
              onClick={submitConnected}
              disabled={saving || !name.trim() || !email.trim()}
              variant="primary"
              full
            >
              Add &amp; Send (fires Logan&apos;s Step 1 email)
            </ActionButton>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Section 3: History ───────────────────────────────────────────────────

function HistorySection({ touchpoints }: { touchpoints: StaffingTouchpoint[] }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        3. History
      </h3>
      {touchpoints.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
          No touchpoints yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {touchpoints.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-gray-100 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-700">
                  {humanType(t.type)}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(t.created_at).toLocaleString()}
                </span>
              </div>
              {t.notes && (
                <p className="mt-1 text-sm text-gray-600">{t.notes}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Small UI primitives ──────────────────────────────────────────────────

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
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
      />
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "secondary",
  full,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  full?: boolean;
  title?: string;
}) {
  const base = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-gray-700"
      : "border border-gray-200 text-gray-700 hover:bg-gray-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
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
  const base = "rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : variant === "danger"
      ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
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
    call_not_interested: "Marked: not interested",
    manual_dnc: "Marked: do not contact",
    email_pre_consent_a_sent: "Email: pre-consent A",
    email_pre_consent_b_sent: "Email: pre-consent B",
    email_post_consent_step1_sent: "Email: Step 1 (Logan, with PDF)",
    email_post_consent_step2_sent: "Email: Step 2",
    email_post_consent_step3_sent: "Email: Step 3",
    email_post_consent_step4_sent: "Email: Step 4",
    email_post_consent_step5_sent: "Email: Step 5",
    email_welcome_sent: "Email: welcome (post-activation)",
    email_new_student_trigger_sent: "Email: new student near city",
    email_opened: "Email opened",
    email_clicked: "Email link clicked",
    email_bounced: "Email bounced",
    reply_received: "Reply received",
    system_activated: "Activated (magic link clicked)",
    system_enrolled: "Enrolled (T&C accepted)",
    system_auto_dnc: "Auto-DNC after max attempts",
  };
  return map[t] ?? t;
}

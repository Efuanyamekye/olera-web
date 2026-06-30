"use client";

/**
 * Student Outreach Drawer — v2.
 *
 * Core principle: at every moment the admin should know exactly what
 * to do next. The "Next Step" panel at the top is the single source of
 * truth — primary CTA + cadence checklist + the always-visible
 * "Mark as Partner" graduation button (from `engaged` onward).
 *
 * Sections are also stakeholder-type-aware: orgs see multi-officer +
 * IG/contact-form actions, advisors see a single contact and no
 * approvals, dept heads see approvals + the bulk-import nudge,
 * professors get the minimal flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityStepBoard } from "@/components/admin/medjobs/EntityStepBoard";
import { DrawerShell } from "@/components/admin/medjobs/DrawerShell";
import { ProviderProspectDrawerBody } from "@/components/admin/medjobs/ProviderProspectDrawerBody";
import { NextStepCard } from "@/components/admin/medjobs/NextStepCard";
import { PreFlightCallModal } from "@/components/admin/medjobs/PreFlightCallModal";
import { ProviderPreFlightModal } from "@/components/admin/medjobs/ProviderPreFlightModal";
import { linkageFromResearchData } from "@/lib/medjobs/smartlead-inbox";
import { SpecificContactsSection } from "@/components/admin/medjobs/SpecificContactsSection";
import { getVerificationState } from "@/lib/student-outreach/verification-state";
import { OutreachTimeline } from "@/components/admin/medjobs/OutreachTimeline";
import StyledSelect from "@/components/ui/Select";
import {
  KIND_LABELS,
  STATUS_LABELS,
  CLOSED_STATUSES,
  type Contact,
  type DrawerContext,
  type ResearchData,
  type StakeholderType,
  type Status,
} from "@/lib/student-outreach/types";
import { OUTREACH_DAYS_BY_TYPE } from "@/lib/student-outreach/cadence";
import type { TabKey } from "@/lib/student-outreach/tab-config";
import { cleanOrgName } from "@/lib/student-outreach/formatters";
import {
  DEPARTMENTS,
  OTHER,
  PROGRAMS,
  ROLES_BY_TYPE,
  singleProgram,
  supportsMultipleContacts,
} from "@/lib/student-outreach/presets";

interface DrawerProps {
  /** v9.0 Phase 2: stakeholder mode — pass outreachId to load a
   *  student_outreach row and render the existing workflow drawer. */
  outreachId?: string;
  /** v9.0 Phase 2: provider mode — pass providerId to load a
   *  business_profiles row and render the Manage panel for a Client. */
  providerId?: string;
  /** v9.0 Phase 7 Commit B: candidate mode — pass candidateId (a
   *  student business_profile id) to render the Candidate reference +
   *  Step Board panel. */
  candidateId?: string;
  onClose: () => void;
  /** Optional in non-stakeholder modes. */
  onAction?: (refreshed: DrawerContext | null) => void;
  /** Instant-render seed: the row's display name, shown as the drawer headline
   *  immediately while the detail hydrates (stakeholder / provider modes) so
   *  the drawer never opens to a blank "Loading…" title. */
  seedName?: string;
  /** Candidate mode: the already-loaded list row. CandidateDrawerData is a
   *  subset of the list row, so passing it renders the drawer instantly with
   *  no fetch (avoids the fetch-all-then-find). */
  candidateSeed?: CandidateDrawerData;
  /** Which In Basket tab the drawer was opened from — threaded to NextStepCard
   *  so the awaiting-reply call affordance adapts (Emails → link, else button). */
  activeTab?: TabKey;
}

type ActionFn = (
  action: string,
  payload?: Record<string, unknown>,
  opts?: { silent?: boolean },
) => Promise<DrawerContext>;

// v8.10.37: terminal closed statuses — Step Board hides for these so the
// drawer doesn't invite adding workflow steps to a closed/DNC stakeholder.
// Mirrors DangerZone's terminal-suppression rule.
const TERMINAL_STATUSES: Status[] = [
  "not_interested",
  "do_not_contact",
  "wrong_contact",
  "redirected",
  "archived",
  "no_response_closed",
];

// Office-shaped prospects: a parent organization with named child contacts,
// researched + launched through the same card. Advising offices have
// "Advisors"; student organizations have "Leaders". Both reuse the
// general-contact + SpecificContactsSection + confirm-call + launch flow.
function isOfficeType(type: StakeholderType): boolean {
  return type === "advisor" || type === "student_org";
}

// Student-organization Leader role presets (Faculty Advisor first — it's the
// highest-value, turnover-proof contact). "Other" is appended by the picker.
const LEADER_ROLES = [
  "Faculty Advisor",
  "President",
  "Vice President",
  "Treasurer",
  "Secretary",
  "Recruitment Chair",
];

// v8.10.11: TabContext + TabContextBanner removed. The drawer's section
// h3s + per-state guidance already convey orientation; the banner was
// repeating it one row above. tabContext prop on DrawerProps was only
// used to drive that banner, so it's gone too.
//
// v9.0 Phase 2: Drawer is now polymorphic — `outreachId` mounts the
// existing stakeholder workflow drawer; `providerId` mounts the
// provider Manage drawer (Clients tab). One drawer file, internal
// fork on which prop is set. The two share the outer chrome (backdrop,
// aside, ESC handler, close button) via DrawerShell.
export function Drawer(props: DrawerProps) {
  if (props.providerId) {
    return <ProviderDrawer providerId={props.providerId} onClose={props.onClose} seedName={props.seedName} />;
  }
  if (props.candidateId) {
    return <CandidateDrawer candidateId={props.candidateId} onClose={props.onClose} seed={props.candidateSeed} />;
  }
  if (!props.outreachId) {
    return null;
  }
  return (
    <StakeholderDrawer
      seedName={props.seedName}
      outreachId={props.outreachId}
      onClose={props.onClose}
      onAction={props.onAction ?? (() => {})}
      activeTab={props.activeTab}
    />
  );
}

/**
 * v9.0 Phase 4: tiny drawer-header overflow menu carrying admin
 * actions that aren't tied to any specific row card slot. Currently
 * just Mark as unread; future drawer-level actions land here.
 */
function DrawerHeaderOverflow({
  onMarkUnread,
  onStopOutreach,
  onArchive,
  onReopen,
}: {
  onMarkUnread: () => Promise<void>;
  /** When provided, a "Stop all outreach" item appears under Mark as unread —
   *  a hard stop that cancels every queued email and call for the row. */
  onStopOutreach?: () => Promise<void>;
  /** Whole-prospect Archive — halts the cadence and parks the row. Shown for
   *  any non-archived row, separate from Stop all outreach. */
  onArchive?: () => Promise<void>;
  /** Reopen a closed/archived row back into active workflow. */
  onReopen?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        title="More actions"
        aria-label="More actions"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              void onMarkUnread();
            }}
            className="block w-full px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Mark as unread
          </button>
          {onReopen && (
            <button
              onClick={() => {
                setOpen(false);
                void onReopen();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Reopen
            </button>
          )}
          {onArchive && (
            <button
              onClick={() => {
                setOpen(false);
                void onArchive();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Archive
            </button>
          )}
          {onStopOutreach && (
            <button
              onClick={() => {
                setOpen(false);
                void onStopOutreach();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Stop all outreach
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Drawer body skeleton — shown while detail hydrates, so a drawer opened with
// a seed name reads as "open + loading content" rather than a blank spinner.
function DrawerBodySkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
      <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
      <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}

function StakeholderDrawer({
  outreachId,
  onClose,
  onAction,
  seedName,
  activeTab,
}: {
  outreachId: string;
  onClose: () => void;
  onAction: (refreshed: DrawerContext | null) => void;
  seedName?: string;
  activeTab?: TabKey;
}) {
  const [ctx, setCtx] = useState<DrawerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/student-outreach/${outreachId}`);
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
        const data = await res.json();
        if (!cancelled) setCtx(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [outreachId]);

  // Mark the row read on drawer mount — persist only, fire-and-forget.
  // The server is idempotent (updates only if viewed_at IS NULL), so this
  // is safe on every mount.
  //
  // Deliberately does NOT call refreshMedJobs(). That global refresh
  // refetched the entire In Basket (6 endpoints, incl. a 75K-row catchment
  // scan) and re-sorted the list every time you merely opened a card —
  // the cause of both the slow drawer and the silent reorder. The opening
  // surface (MedJobsTabPage) now applies read state optimistically in
  // place; the hero/sidebar reconcile on the next genuine refresh.
  useEffect(() => {
    void (async () => {
      try {
        await fetch(`/api/admin/student-outreach/${outreachId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read" }),
        });
      } catch {
        /* non-critical */
      }
    })();
  }, [outreachId]);

  const action: ActionFn = useCallback(
    async (action, payload = {}, opts) => {
      const res = await fetch(`/api/admin/student-outreach/${outreachId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setCtx(data);
      // `silent` writes update only the drawer's own view, never the parent
      // list. Drawer-internal hydration (the provider auto-fill on open) uses
      // this so it doesn't reach handleDrawerAction -> silentRefresh, which
      // re-fetches the whole In Basket and races the fire-and-forget mark_read
      // — resurrecting the row's unread/bold state right after open (and
      // re-running the expensive 6-endpoint list fetch on every drawer open).
      if (!opts?.silent) onAction(data);
      return data as DrawerContext;
    },
    [outreachId, onAction],
  );

  return (
    <DrawerShell
      onClose={onClose}
      header={
        ctx ? (() => {
          // v8.9: contact name leads everywhere. The displayed name is
          // built from title + first + last when present, falling back
          // to the legacy `name` column. Org/campus/type drop to the
          // subline; if no contact exists yet, the org name takes the
          // headline so the card isn't blank.
          const primary = ctx.contacts.find((c) => c.status === "active") ?? ctx.contacts[0] ?? null;
          const contactDisplay = primary
            ? [primary.title, primary.first_name, primary.last_name]
                .filter(Boolean)
                .join(" ")
                .trim() || primary.name || null
            : null;
          const orgDisplay = cleanOrgName(ctx.outreach.organization_name);
          const headline = contactDisplay || orgDisplay;
          const showOrgInSubline =
            !!contactDisplay && contactDisplay !== orgDisplay;
          // v8.10.37: surface a small "★ Partner since {date}" indicator
          // for active partners. NextStepPanel is suppressed for partners,
          // so without this header cue the drawer wouldn't show their
          // status anywhere prominent. Date comes from the most recent
          // distribution_confirmed touchpoint (when they were graduated).
          const isPartner = ctx.outreach.status === "active_partner";
          const partnerSince = isPartner
            ? ctx.touchpoints.find((t) => t.touchpoint_type === "distribution_confirmed")
                ?.created_at ?? null
            : null;
          // Dept-head partners: surface the professor-outreach decision (the
          // terminal documented step) right in the header.
          const deptHeadPartnership =
            isPartner && ctx.outreach.stakeholder_type === "dept_head"
              ? ((ctx.outreach.research_data as { dept_head_partnership?: { professor_permission?: string } } | null)
                  ?.dept_head_partnership ?? null)
              : null;
          const PERMISSION_LABEL: Record<string, string> = {
            yes: "✅ professors: approved",
            no: "🚫 professors: not allowed",
            not_yet: "⏳ professors: not yet",
            unclear: "❓ professors: unclear",
          };
          return (
            <>
              <h2 className="truncate text-lg font-semibold text-gray-900">{headline}</h2>
              <p className="truncate text-sm text-gray-500">
                {showOrgInSubline && (
                  <>
                    {orgDisplay}
                    {ctx.outreach.department &&
                      ctx.outreach.department !== ctx.outreach.organization_name &&
                      ` · ${ctx.outreach.department}`}
                    {" · "}
                  </>
                )}
                {ctx.campus.name} · {KIND_LABELS[ctx.outreach.kind ?? ctx.outreach.stakeholder_type]}
                {primary?.role && ` · ${primary.role}`}
              </p>
              {isPartner && (
                <p className="mt-1 text-xs font-medium text-emerald-700">
                  ★ Partner
                  {partnerSince
                    ? ` since ${new Date(partnerSince).toLocaleDateString()}`
                    : ""}
                  {deptHeadPartnership?.professor_permission &&
                    ` · ${PERMISSION_LABEL[deptHeadPartnership.professor_permission] ?? "professors: documented"}`}
                </p>
              )}
            </>
          );
        })() : seedName ? (
          <h2 className="truncate text-lg font-semibold text-gray-900">{seedName}</h2>
        ) : (
          <h2 className="text-lg font-semibold text-gray-400">Loading…</h2>
        )
      }
      headerExtras={
        // v9.0 Phase 4: drawer-level Mark as unread. Same semantic as
        // the row card overflow item — resets attention so the row
        // appears bold again in the tab.
        <DrawerHeaderOverflow
          onMarkUnread={async () => {
            try {
              await action("mark_unread");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to mark unread");
            }
          }}
          // Hard stop — only offered while outreach is actually live. Cancels
          // every queued email and call (cold + activation) for the row.
          onStopOutreach={
            ctx &&
            ["outreach_sent", "engaged", "meeting_scheduled"].includes(
              ctx.outreach.status,
            )
              ? async () => {
                  if (
                    !window.confirm(
                      "Stop all outreach for this row? This cancels every queued email and call.",
                    )
                  )
                    return;
                  try {
                    await action("stop_all_outreach");
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Failed to stop outreach",
                    );
                  }
                }
              : undefined
          }
          // Archive — whole-prospect park (halts cadence). Offered on any
          // non-archived row, in any tab; reopen revives it.
          onArchive={
            ctx && ctx.outreach.status !== "archived"
              ? async () => {
                  if (
                    !window.confirm(
                      "Archive this prospect? This halts outreach and parks it. You can reopen it later.",
                    )
                  )
                    return;
                  try {
                    await action("archive");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to archive");
                  }
                }
              : undefined
          }
          // Reopen — only on closed/archived rows.
          onReopen={
            ctx && CLOSED_STATUSES.includes(ctx.outreach.status)
              ? async () => {
                  try {
                    await action("reopen");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to reopen");
                  }
                }
              : undefined
          }
        />
      }
    >
      {loading ? (
        <DrawerBodySkeleton />
      ) : error ? (
        <p className="py-8 text-center text-sm text-red-600">{error}</p>
      ) : ctx ? (
        ctx.outreach.kind === "provider" ? (
          <ProviderProspectDrawerBody
            ctx={ctx}
            action={action}
            setError={setError}
            activeTab={activeTab}
          />
        ) : (
          <DrawerBody ctx={ctx} action={action} setError={setError} activeTab={activeTab} />
        )
      ) : null}
    </DrawerShell>
  );
}

/**
 * v9.0 Phase 2: Provider variant of the unified drawer. Mirrors the
 * stakeholder drawer's chrome (backdrop, aside, ESC-to-close, scrollable
 * body) but the body is the Manage panel — read-only summary of trial
 * status, T&C acceptance, and Stripe linkage. Acknowledgement records
 * + admin actions (extend trial, mark churned) land in subsequent v9.x.
 */
interface ProviderInterview {
  id: string;
  status: string;
  type: string;
  proposed_time: string;
  confirmed_time: string | null;
  created_at: string;
  student: { id: string; display_name: string | null } | null;
}

interface ProviderDrawerData {
  id: string;
  display_name: string;
  slug: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_active: boolean;
  interview_terms_accepted_at: string | null;
  credits_used: number;
  status: "in_pilot" | "pilot_expired" | "subscribed";
  pilot_started_at: string | null;
  pilot_ends_at: string | null;
  days_remaining_in_pilot: number | null;
  // v9.0 Phase 2 Tier 3.7: interview history.
  first_interview: ProviderInterview | null;
  recent_interviews: ProviderInterview[];
  total_interviews: number;
}

function ProviderDrawer({
  providerId,
  onClose,
  seedName,
}: {
  providerId: string;
  onClose: () => void;
  seedName?: string;
}) {
  const [data, setData] = useState<ProviderDrawerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/medjobs/clients/${providerId}`);
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [providerId]);

  // v9.0 Phase 7 Commit O: mark the client read on drawer mount —
  // mirrors the StakeholderDrawer's mark_read effect. Fire the
  // global refresh so In Basket + sidebar fractions update live.
  useEffect(() => {
    void (async () => {
      try {
        await fetch("/api/admin/medjobs/mark-entity-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "client", id: providerId, action: "read" }),
        });
        // No refreshMedJobs: the opening surface applies read optimistically
        // in place (setEntityRead). This effect only persists.
      } catch {
        /* non-critical */
      }
    })();
  }, [providerId]);

  return (
    <DrawerShell
      onClose={onClose}
      header={
        data ? (
          <>
            <h2 className="truncate text-lg font-semibold text-gray-900">{data.display_name}</h2>
            <p className="truncate text-sm text-gray-500">
              {[data.city, data.state].filter(Boolean).join(", ") || "Provider"}
              {data.email && ` · ${data.email}`}
            </p>
            <ProviderStatusLabel data={data} />
          </>
        ) : seedName ? (
          <h2 className="truncate text-lg font-semibold text-gray-900">{seedName}</h2>
        ) : (
          <h2 className="text-lg font-semibold text-gray-400">Loading…</h2>
        )
      }
    >
      {loading ? (
        <DrawerBodySkeleton />
      ) : error ? (
        <p className="py-8 text-center text-sm text-red-600">{error}</p>
      ) : data ? (
        <ProviderManagePanel data={data} />
      ) : null}
    </DrawerShell>
  );
}

function ProviderStatusLabel({ data }: { data: ProviderDrawerData }) {
  if (data.status === "subscribed") {
    return (
      <p className="mt-1 text-xs font-medium text-emerald-700">$ Subscribed via Stripe</p>
    );
  }
  if (data.status === "pilot_expired") {
    return <p className="mt-1 text-xs font-medium text-gray-500">Pilot ended</p>;
  }
  const days = data.days_remaining_in_pilot ?? 0;
  const isUrgent = days <= 14;
  return (
    <p
      className={`mt-1 text-xs font-medium ${
        isUrgent ? "text-red-700" : "text-amber-700"
      }`}
    >
      In 90-day pilot · {days === 1 ? "1 day" : `${days} days`} remaining
    </p>
  );
}

function ProviderManagePanel({ data }: { data: ProviderDrawerData }) {
  const stripeUrl = data.stripe_customer_id
    ? `https://dashboard.stripe.com/customers/${data.stripe_customer_id}`
    : null;

  return (
    <div className="space-y-6">
      {/* v9.0 Phase 7 Commit B: Step Board leads the panel — the
          operational surface for client-side follow-ups (trial
          check-ins, billing nudges, account expansion). Reference
          sections (pilot status, subscription, interviews) follow. */}
      <EntityStepBoard
        kind="client"
        entityId={data.id}
        entityName={data.display_name}
      />

      {/* Pilot / Trial */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Pilot status
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <Row label="Pilot started" value={formatTimestamp(data.pilot_started_at)} />
          <Row label="Pilot ends" value={formatTimestamp(data.pilot_ends_at)} />
          <Row
            label="Days remaining"
            value={
              data.days_remaining_in_pilot === null
                ? "—"
                : data.days_remaining_in_pilot > 0
                  ? `${data.days_remaining_in_pilot}`
                  : "Expired"
            }
          />
          <Row label="Interviews scheduled" value={`${data.total_interviews}`} />
        </dl>
      </section>

      {/* v9.0 Phase 2 Tier 3.7: Acknowledgement record. The pilot starts
          when a provider accepts T&C at first interview scheduling —
          this section surfaces the proof. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Acknowledgement
        </h3>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          {data.interview_terms_accepted_at ? (
            <>
              <p className="font-medium text-gray-900">Terms &amp; conditions accepted</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatTimestamp(data.interview_terms_accepted_at)} · captured at first interview scheduling
              </p>
              {data.first_interview && (
                <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  Linked to interview with{" "}
                  <span className="font-medium">
                    {data.first_interview.student?.display_name ?? "(student profile)"}
                  </span>
                  {" — "}
                  proposed for {formatTimestamp(data.first_interview.proposed_time)} ({data.first_interview.type}).
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-500">
              No acknowledgement on file. T&amp;C is captured the first time the provider schedules
              an interview through the public scheduler.
            </p>
          )}
        </div>
      </section>

      {/* Subscription */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Subscription
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <Row label="Status" value={data.subscription_active ? "Active" : "Not subscribed"} />
          <Row label="Customer ID" value={data.stripe_customer_id ?? "—"} mono />
          <Row label="Subscription ID" value={data.subscription_id ?? "—"} mono />
        </dl>
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            View in Stripe Dashboard ↗
          </a>
        )}
      </section>

      {/* v9.0 Phase 2 Tier 3.7: recent interviews. Gives admin
          pilot-utilization context — are they actively scheduling? */}
      {data.recent_interviews.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Recent interviews ({data.total_interviews} total)
          </h3>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
            {data.recent_interviews.map((iv) => (
              <li key={iv.id} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-gray-900">
                    {iv.student?.display_name ?? "(student profile)"}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatTimestamp(iv.proposed_time)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <InterviewStatusPill status={iv.status} />
                  <span>{iv.type}</span>
                  {iv.confirmed_time && (
                    <span className="text-emerald-700">
                      Confirmed {formatTimestamp(iv.confirmed_time)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Profile */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Provider profile
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <Row label="Active" value={data.is_active ? "Yes" : "No"} />
          <Row label="Phone" value={data.phone ?? "—"} />
          <Row label="Created" value={formatTimestamp(data.created_at)} />
          <Row label="Slug" value={data.slug ?? "—"} mono />
        </dl>
        {data.slug && (
          <a
            href={`/${data.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            View public profile ↗
          </a>
        )}
      </section>
    </div>
  );
}

// ── Candidate drawer (v9.0 Phase 7 Commit B) ──────────────────────────
//
// v9 final: Site drawer removed. Sites are organizational anchors,
// not operational work objects — clicking a Site card now navigates
// directly to the campus management page (/admin/student-outreach/
// campus/[slug]) where the stakeholder list lives. The earlier Site
// drawer wrapped the same data in a Step Board + operational rollup
// that double-counted the In Basket work surface.

interface CandidateDrawerData {
  id: string;
  display_name: string;
  university: string | null;
  city: string | null;
  state: string | null;
  program_track: string | null;
  signed_up_at: string | null;
}

function CandidateDrawer({
  candidateId,
  onClose,
  seed,
}: {
  candidateId: string;
  onClose: () => void;
  seed?: CandidateDrawerData;
}) {
  const [data, setData] = useState<CandidateDrawerData | null>(seed ?? null);
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Seeded from the list row — CandidateDrawerData is a subset of the row,
    // so render instantly with no fetch (avoids fetching the whole candidate
    // list just to find one).
    if (seed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Fallback (no seed): reuse the candidates list endpoint and pick the
        // matching row.
        const res = await fetch(`/api/admin/student-outreach/candidates`);
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
        const body = await res.json();
        const all = (body.rows ?? []) as Array<{
          id: string;
          display_name: string;
          university: string | null;
          city: string | null;
          state: string | null;
          program_track: string | null;
          signed_up_at: string | null;
        }>;
        const found = all.find((r) => r.id === candidateId);
        if (!cancelled) {
          if (!found) setError("Candidate not found");
          else setData(found);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [candidateId, seed]);

  // v9.0 Phase 7 Commit O: mark candidate read on mount.
  useEffect(() => {
    void (async () => {
      try {
        await fetch("/api/admin/medjobs/mark-entity-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "candidate", id: candidateId, action: "read" }),
        });
        // No refreshMedJobs: the opening surface applies read optimistically
        // in place (setEntityRead). This effect only persists.
      } catch {
        /* non-critical */
      }
    })();
  }, [candidateId]);

  return (
    <DrawerShell
      onClose={onClose}
      header={
        data ? (
          <>
            <h2 className="truncate text-lg font-semibold text-gray-900">{data.display_name}</h2>
            <p className="truncate text-sm text-gray-500">
              {[data.university, [data.city, data.state].filter(Boolean).join(", "), data.program_track]
                .filter(Boolean)
                .join(" · ") || "Candidate"}
            </p>
          </>
        ) : (
          <h2 className="text-lg font-semibold text-gray-400">Loading…</h2>
        )
      }
    >
      {loading ? (
        <DrawerBodySkeleton />
      ) : error ? (
        <p className="py-8 text-center text-sm text-red-600">{error}</p>
      ) : data ? (
        <div className="space-y-6">
          <EntityStepBoard
            kind="candidate"
            entityId={data.id}
            entityName={data.display_name}
          />
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Open in
            </h3>
            <a
              href={`/admin/medjobs/${data.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Candidate profile editor ↗
            </a>
          </section>
        </div>
      ) : null}
    </DrawerShell>
  );
}

function InterviewStatusPill({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-emerald-100 text-emerald-900"
      : status === "confirmed"
        ? "bg-blue-100 text-blue-900"
        : status === "proposed"
          ? "bg-amber-100 text-amber-900"
          : status === "cancelled" || status === "no_show"
            ? "bg-red-100 text-red-900"
            : "bg-gray-100 text-gray-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd
        className={`text-sm text-gray-900 ${
          mono ? "break-all font-mono text-xs" : "truncate"
        }`}
      >
        {value}
      </dd>
    </>
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * v8 two-zone layout: action card (Next Step) + Close Out (Danger Zone)
 * are always visible. Research / Contacts / Approvals / History tuck
 * under a "More details" toggle so the action surface stays clean.
 */
function DrawerBody({
  ctx,
  action,
  setError,
  activeTab,
}: {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (e: string | null) => void;
  activeTab?: TabKey;
}) {
  // v8.10.4: research stages are a different mode entirely. The research
  // form IS the next step, so it leads the drawer (no NextStepPanel),
  // and More details collapses by default to History (+ Permissions for
  // dept_head, since the email-professors approval gates research).
  const isResearch =
    ctx.outreach.status === "prospect" || ctx.outreach.status === "researched";
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="space-y-6">
      <RelationshipBanner ctx={ctx} />
      {/* v8.10.11: TabContextBanner removed. The ResearchSection h3 +
          card orientation already convey "you're doing research" for
          research stages, and NextStepPanel's h3 + guidance already
          convey state for active-partner / closed states. The banner
          was repeating those signals one row above them. */}
      {isResearch ? (
        // The Research Card is the source of truth — website, notes, and the
        // sources collapsible live inside it. (The separate Partner Pre-Flight
        // card was redundant and was removed.)
        <ResearchModePanel ctx={ctx} action={action} setError={setError} />
      ) : (
        // v9: unified NextStepCard replaces the Partner-specific
        // NextStepPanel. Same modal launchers, stage-driven content,
        // and shared with the Provider drawer. The pre-launch /
        // research surface stays in ResearchModePanel for stakeholders
        // (its readiness-checklist UX is stakeholder-specific) until
        // the SnapshotCard component lands and unifies that surface
        // too.
        //
        // Cadence step list (formerly inside NextStepPanel's body)
        // moves to OutreachTimeline (next commit, zone 4 of the
        // shared skeleton). Temporarily, the cadence visualization
        // is absent from the Partner drawer between this commit and
        // the timeline; pending email/call tasks remain visible via
        // History in More Details.
        <NextStepCard ctx={ctx} action={action} setError={setError} activeTab={activeTab} />
      )}

      {/* Zone 4 · OutreachTimeline — the chronological surface. Past
          touchpoints (with email engagement chips) + future pending
          tasks (queued emails, calls, custom events) in one stream.
          Replaces the v8.10.36 TaskBoardSection (custom tasks now fold
          inline) and the History section (now lives here, not in More
          Details). Empty-state OK pre-launch.
          v9.0 Phase 7 Commit (this): hidden for terminal closed states
          — no future tasks, no operational surface needed; History
          (in the timeline footer for closed rows) carries the record. */}
      {!TERMINAL_STATUSES.includes(ctx.outreach.status) && (
        <OutreachTimeline ctx={ctx} action={action} setError={setError} />
      )}

      <div>
        <button
          onClick={() => setShowMore((s) => !s)}
          className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <span>{showMore ? "Hide details" : "More details"}</span>
          <span className="text-gray-400" aria-hidden>{showMore ? "▴" : "▾"}</span>
        </button>
        {showMore && (
          <div className="mt-4 space-y-6">
            {/* More Details: stakeholder-shape data that doesn't fit the
                always-on timeline (research details, multi-officer
                contacts, approval workflow) + the escape hatch. History
                is absorbed by OutreachTimeline above; no duplicate here.
                Research stages render ResearchSection at the top via
                ResearchModePanel; don't duplicate it inside More Details. */}
            {!isResearch && (
              <ResearchSection ctx={ctx} action={action} setError={setError} />
            )}
            {/* Multi-officer ContactsSection only for non-office multi-contact
                types. Office-shaped types (advisor / student_org) manage named
                contacts via SpecificContactsSection (Advisors / Leaders) in the
                research card, so they skip this redundant section. */}
            {supportsMultipleContacts(ctx.outreach.stakeholder_type) &&
              !isOfficeType(ctx.outreach.stakeholder_type) && (
                <ContactsSection ctx={ctx} action={action} setError={setError} />
              )}
            {/* MVP: Permissions cards + the Close out / Danger Zone section
                were removed from the drawer — not used for partners or
                providers in this MVP (less is more). */}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Relationship banner ─────────────────────────────────────────────────

function RelationshipBanner({ ctx }: { ctx: DrawerContext }) {
  // v8.10.25: dropped the "Permission via <Dept> (Outreach Sent)" line.
  // It was verbose and not operationally useful — admins never need
  // to know the parent dept's status while researching the professor.
  // Referred-from / redirected-to / snoozed-until still surface here
  // since those affect the row's working context.
  const items: string[] = [];
  if (ctx.referred_from) items.push(`Referred from ${ctx.referred_from.organization_name}`);
  if (ctx.redirected_to) items.push(`Redirected to ${ctx.redirected_to.organization_name}`);
  if (ctx.outreach.snoozed_until && new Date(ctx.outreach.snoozed_until) > new Date()) {
    items.push(`Snoozed until ${new Date(ctx.outreach.snoozed_until).toLocaleDateString()}`);
  }
  if (items.length === 0) return null;
  return (
    <div className="rounded-md bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
      {items.join(" · ")}
    </div>
  );
}

// ── Research mode panel (v8.10.4) ───────────────────────────────────────
//
// Replaces NextStepPanel for prospect / researched stages. Renders the
// ResearchSection input form WITH orientation paragraph + checklist +
// CTA inside a single card — admin sees one cohesive workflow instead
// of an orientation card plus a separately-collapsed input form. CTA
// changes by status: prospect → "Research complete", researched →
// opens PreFlightReviewModal.

function ResearchModePanel({
  ctx,
  action,
  setError,
}: {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (e: string | null) => void;
}) {
  const status = ctx.outreach.status;
  const type = ctx.outreach.stakeholder_type;
  const isOffice = isOfficeType(type);
  const [showPreFlight, setShowPreFlight] = useState(false);
  // Pre-flight confirm call (offices + dept heads with a main phone). Blocking
  // when a main phone is on file; the modal carries an always-on Override &
  // launch button as the escape hatch when the contact can't be reached.
  const [showCallConfirm, setShowCallConfirm] = useState(false);

  // Readiness gating per stage.
  const haveContact = ctx.contacts.some((c) => c.status === "active");
  const primaryContact = ctx.contacts.find((c) => c.status === "active") ?? ctx.contacts[0] ?? null;
  const deptHeadPhone = type === "dept_head" ? (primaryContact?.phone ?? null) : null;
  const eligibleEmail = ctx.contacts.filter(
    (c) => c.status === "active" && c.email,
  ).length;

  // Office readiness (R: ready = at least one email — office OR a member;
  // phone/name optional). Offices have no "programs" requirement.
  const rd = (ctx.outreach.research_data ?? {}) as Record<string, unknown>;
  const officeEmail = ((rd.general_contact ?? {}) as { email?: string }).email;
  const members = (Array.isArray(rd.office_members) ? rd.office_members : []) as { email?: string }[];
  const hasOfficeEmail = Boolean(officeEmail) || members.some((m) => m?.email) || eligibleEmail > 0;

  const isProspect = status === "prospect";
  // c1: non-office partner prospects (dept_head, student_org) launch on a
  // contact alone — programs/department are no longer a gate (they don't
  // personalize the partner emails), so the drawer skips straight to the
  // email-sequence review like advising offices do.
  const ready = isOffice
    ? hasOfficeEmail
    : isProspect
      ? haveContact
      : eligibleEmail > 0;

  // v8.10.11: orientation copy trimmed — the section h3 ("RESEARCH")
  // already says what the section is for, so the prefix sentence
  // ("Research this stakeholder." / "Ready to email.") was redundant.
  // What's left is the actionable bit only.
  // Office prospects mirror provider Pre-Flight EXACTLY: outreach is gated on a
  // logged confirmation call. The launcher stays disabled until a "Confirmed"
  // call outcome is logged (or Pre-Flight is overridden) — same verification
  // state, same modal (PreFlightCallModal) as providers.
  const overridden = (rd as { pre_flight_overridden?: boolean }).pre_flight_overridden === true;
  const verificationState = getVerificationState(ctx.touchpoints, overridden);
  const officePhone = ((rd.general_contact ?? {}) as { phone?: string }).phone ?? null;

  // Office launch: materialize advisors-with-email as named contacts (so they
  // become recipients alongside the general office), then open the per-recipient
  // review modal — the same one providers use.
  const officeMembersFull = (Array.isArray(rd.office_members) ? rd.office_members : []) as Array<{
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
  }>;
  const launchOffice = async () => {
    try {
      // Offices skip the explicit "Research complete" click — transition here,
      // transparently, on the way to launch (prospect → researched is required
      // before outreach_sent).
      if (ctx.outreach.status === "prospect") await action("mark_research_complete");
      const existing = new Set(ctx.contacts.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[]);
      const gcLc = officeEmail?.toLowerCase();
      for (const m of officeMembersFull) {
        const em = m.email?.trim().toLowerCase();
        if (!em || em === gcLc || existing.has(em)) continue;
        existing.add(em);
        await action("add_contact", { name: m.name, title: m.title ?? null, email: m.email, phone: m.phone });
      }
      setShowPreFlight(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare recipients");
    }
  };

  // Offices skip the redundant "Research complete" pre-state — they're
  // generated WITH contact info, so they land straight on Pre-Flight (confirm
  // by call, then launch). Only non-office stakeholders keep the prospect step.
  // Phone-conditional pre-flight: a confirm-call is only required (and only
  // possible) when a phone number exists. Phoneless orgs (common for student
  // organizations) launch on a verified email alone.
  const requiresCall = isOffice && Boolean(officePhone);
  const officeCanLaunch = hasOfficeEmail && (requiresCall ? verificationState.can_launch : true);

  // Non-office pre-flight call (P1, "all types"): dept heads confirm on the
  // dept-head MAIN number when one is on file; with no number there's nothing
  // to call, so they launch directly. Professors have no main number here, so
  // they always launch directly. The launch flow records research-complete
  // (non-office rows keep the prospect step) then opens the recipient review.
  const launchNonOffice = async () => {
    if (ctx.outreach.status === "prospect") await action("mark_research_complete");
    setShowPreFlight(true);
  };
  const nonOfficeMainPhone = type === "dept_head" ? deptHeadPhone : null;
  const nonOfficeRequiresCall = Boolean(nonOfficeMainPhone);
  const nonOfficeCanLaunch =
    ready && (nonOfficeRequiresCall ? verificationState.can_launch : true);

  // One confirm-call modal serves both shapes — the phone it dials and the
  // launch flow it runs (and its always-on Override & launch button) switch
  // on whether the row is office-shaped.
  const confirmPhone = isOffice ? officePhone : nonOfficeMainPhone;
  const confirmLaunch = isOffice ? launchOffice : launchNonOffice;

  // Unified orientation across all stakeholder types (no per-type drift). Only
  // the no-main-phone case drops the "call to confirm" clause.
  const callRequiredHere = isOffice ? requiresCall : nonOfficeRequiresCall;
  const orientation = !callRequiredHere ? (
    <>Check the info, then launch outreach.</>
  ) : (
    <>Check the info, call to confirm, then launch outreach.</>
  );

  // Less is more: no readiness checklist on any stakeholder pre-flight. The
  // disabled-until-ready CTA (and its tooltip) already communicate what's needed.
  const checklist: Array<{ done: boolean; label: string }> = [];

  // CTA: offices show Pre-Flight (Verification + Call to Confirm + Launch) at
  // any research status; non-office prospects keep the Research-complete step.
  let cta: React.ReactNode;
  if (!isOffice && isProspect) {
    // Same row layout + labels as the office path: an optional Call to Confirm
    // (recommended, non-blocking for dept heads) + a primary "Launch outreach"
    // that records research-complete and opens the per-recipient review. No
    // visual drift from the office flow.
    cta = (
      <div className="flex flex-wrap items-center gap-2">
        {nonOfficeRequiresCall && (
          <button
            onClick={() => setShowCallConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            📞 Call to Confirm
          </button>
        )}
        <button
          onClick={() => {
            if (nonOfficeCanLaunch) void launchNonOffice();
            else if (!ready) setError("Add a contact first.");
            else setError("Confirm the dept head on a Pre-Flight call, or override Pre-Flight.");
          }}
          disabled={!nonOfficeCanLaunch}
          title={
            nonOfficeCanLaunch
              ? "Review recipients and launch outreach."
              : !ready
                ? "Add a contact first."
                : "Confirm on a call first, or override Pre-Flight."
          }
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {nonOfficeRequiresCall && verificationState.status === "overridden"
            ? "Launch outreach (override) →"
            : "Launch outreach →"}
        </button>
      </div>
    );
  } else if (isOffice) {
    // Call to Confirm (only when a phone exists), then Launch. With a phone,
    // launch unlocks once the call is confirmed; without a phone, a verified
    // email is enough (student orgs usually have no phone).
    cta = (
      <div className="flex flex-wrap items-center gap-2">
        {officePhone && (
          <button
            onClick={() => setShowCallConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            📞 Call to Confirm
          </button>
        )}
        <button
          onClick={() => {
            if (officeCanLaunch) void launchOffice();
            else if (!hasOfficeEmail) setError("Add an email to reach this organization before launching.");
            else setError("Confirm the office on a Pre-Flight call, or override Pre-Flight.");
          }}
          disabled={!officeCanLaunch}
          title={
            officeCanLaunch
              ? "Review recipients and launch outreach."
              : !hasOfficeEmail
                ? "Add an email first."
                : "Confirm the office on a call first."
          }
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {requiresCall && verificationState.status === "overridden"
            ? "Launch outreach (override) →"
            : "Launch outreach →"}
        </button>
      </div>
    );
  } else {
    cta = (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowPreFlight(true)}
          disabled={!ready}
          title={ready ? "Review recipients and launch outreach." : "Add a contact with email first."}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Launch outreach →
        </button>
      </div>
    );
  }

  return (
    <>
      <ResearchSection
        ctx={ctx}
        action={action}
        setError={setError}
        research={{ orientation, checklist, cta }}
      />
      {showCallConfirm && (
        <PreFlightCallModal
          organizationName={ctx.outreach.organization_name}
          campusName={ctx.campus.name}
          phone={confirmPhone}
          action={action}
          onCancel={() => setShowCallConfirm(false)}
          onDone={() => setShowCallConfirm(false)}
          setError={setError}
          // Always-available escape hatch: override the confirm-call gate and
          // go straight to the per-recipient launch review.
          onOverrideLaunch={confirmLaunch}
        />
      )}
      {showPreFlight && isOffice && (
        <ProviderPreFlightModal
          organizationName={ctx.outreach.organization_name}
          campusName={ctx.campus.name}
          campusSlug={ctx.campus.slug}
          campusProgramPdfUrl={ctx.campus.program_pdf_url ?? null}
          contacts={ctx.contacts}
          generalContact={{ email: officeEmail ?? null, phone: officePhone }}
          smartleadPreview={ctx.smartlead_preview}
          cadenceKey={type}
          pdfAudience="student"
          smartleadLinkage={linkageFromResearchData(ctx.outreach.research_data)}
          onCancel={() => setShowPreFlight(false)}
          onSubmit={async (payload) => {
            try {
              await action("schedule_sequence", payload);
              setShowPreFlight(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Schedule failed");
              throw e;
            }
          }}
        />
      )}
      {showPreFlight && !isOffice && (
        // Non-office stakeholders (dept head, professor) now use the SAME
        // per-recipient pre-flight as offices, so the launch payload carries
        // recipients + call_scripts and the cadence's phone-day CALL tasks
        // actually queue (previously this path sent email snapshots only — the
        // root cause of dept heads getting no call card). Recipients come from
        // the named contact(s); no synthetic general recipient.
        <ProviderPreFlightModal
          organizationName={ctx.outreach.organization_name}
          campusName={ctx.campus.name}
          campusSlug={ctx.campus.slug}
          campusProgramPdfUrl={ctx.campus.program_pdf_url ?? null}
          contacts={ctx.contacts}
          generalContact={{ email: null, phone: null }}
          smartleadPreview={ctx.smartlead_preview}
          cadenceKey={type}
          pdfAudience="student"
          smartleadLinkage={linkageFromResearchData(ctx.outreach.research_data)}
          onCancel={() => setShowPreFlight(false)}
          onSubmit={async (payload) => {
            try {
              await action("schedule_sequence", payload);
              setShowPreFlight(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Schedule failed");
              throw e;
            }
          }}
        />
      )}
    </>
  );
}

// ── Next Step panel ──────────────────────────────────────────────────────
//
// v8.3: drives guidance from the SAME state the row-card pill shows
// (replies_state / meeting_state from the server). Gives the admin one
// short paragraph: what's happening + what to do next. The row cards
// own the actual buttons; the drawer just describes and offers a few
// always-visible CTAs (Mark Partner, Log meeting outcome).

function ResearchSection({
  ctx,
  action,
  setError,
  /** v8.10.4: when in research stages we hoist this section to the top
   *  of the drawer and render orientation + checklist + CTA inside the
   *  same card. Outside research stages this stays a plain input form
   *  inside More details. */
  research,
}: {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (e: string | null) => void;
  research?: {
    orientation: React.ReactNode;
    checklist: Array<{ done: boolean; label: string }>;
    cta: React.ReactNode;
  };
}) {
  const r = ctx.outreach.research_data;
  const type = ctx.outreach.stakeholder_type;
  const [notes, setNotes] = useState(r.notes ?? "");
  const [orgName, setOrgName] = useState(ctx.outreach.organization_name);

  const [department, setDepartment] = useState(
    ctx.outreach.department && DEPARTMENTS.includes(ctx.outreach.department)
      ? ctx.outreach.department
      : ctx.outreach.department ? OTHER : "",
  );
  const [departmentOther, setDepartmentOther] = useState(
    ctx.outreach.department && !DEPARTMENTS.includes(ctx.outreach.department)
      ? ctx.outreach.department
      : "",
  );

  // Programs are no longer edited in the pre-flight (UI removed — less is more);
  // the saved value is preserved on the row and still sent on save.
  const [programs] = useState<string[]>(ctx.outreach.programs);

  // v8.7: for single-contact types (dept_head / professor) we render the
  // primary contact inline here instead of a separate Contacts section.
  // Office-shaped types (advisor / student_org) render named contacts via
  // SpecificContactsSection instead, so they skip the inline person fields.
  const showTitleField = type === "dept_head" || type === "professor";
  const primary = ctx.contacts.find((c) => c.status === "active") ?? ctx.contacts[0] ?? null;
  const [title, setTitle] = useState(primary?.title ?? (showTitleField ? "Dr." : ""));
  const [firstName, setFirstName] = useState(primary?.first_name ?? "");
  const [lastName, setLastName] = useState(primary?.last_name ?? "");
  const [email, setEmail] = useState(primary?.email ?? "");
  const [phone, setPhone] = useState(primary?.phone ?? "");

  // Office-shaped advisor rows: an advising OFFICE has org-level contact info
  // (general email/phone/website in research_data.general_contact) + a people
  // roster (office_members) — not a single person. No person form, no programs.
  const isOffice = isOfficeType(type);
  const gc0 = ((ctx.outreach.research_data as Record<string, unknown>).general_contact ?? {}) as {
    email?: string | null;
    phone?: string | null;
    website?: string | null;
  };
  const [officeEmail, setOfficeEmail] = useState(gc0.email ?? "");
  const [officePhone, setOfficePhone] = useState(gc0.phone ?? "");
  const [officeWebsite, setOfficeWebsite] = useState(gc0.website ?? "");
  const saveOfficeContact = async () => {
    try {
      await action("update_research", {
        research: {
          general_contact: {
            ...gc0,
            email: officeEmail.trim() || null,
            phone: officePhone.trim() || null,
            website: officeWebsite.trim() || null,
          },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const saveResearch = async () => {
    try {
      await action("update_research", {
        research: {
          notes,
        } satisfies ResearchData,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
  };

  // Accepts explicit overrides so dropdown onChange handlers persist the NEW
  // value instead of the stale render-closure state (the prior setTimeout
  // pattern saved the previous selection — e.g. the first program pick saved
  // an empty list, leaving "Programs selected" stuck unchecked).
  const saveOutreach = async (overrides?: { programs?: string[]; department?: string | null }) => {
    try {
      const departmentValue =
        overrides?.department !== undefined
          ? overrides.department
          : department === OTHER
            ? departmentOther.trim() || null
            : department || null;
      const programsValue = overrides?.programs ?? programs;
      await action("update_outreach", {
        organization_name: orgName,
        department: departmentValue,
        programs: programsValue,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
  };

  const savePrimaryContact = async () => {
    if (!primary) {
      // No contact exists yet; create one. Partners often have only a shared
      // general email (e.g. hpo@…) with no named person — so an email alone is
      // enough; we don't require a name.
      if (!firstName.trim() && !email.trim()) return;
      try {
        await action("add_contact", {
          title: title.trim() || null,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          is_primary: true,
        });
      } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
      return;
    }
    try {
      await action("update_contact", {
        contact_id: primary.id,
        title: title.trim() || null,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
  };

  const showDepartment = type === "dept_head" || type === "professor";
  const showOrgName = type === "student_org" || isOffice; // offices need a name

  // Source link by the name = the website / first research source where we
  // found them (replaces the website field + the old sources dropdown).
  const researchLinks = (((r as Record<string, unknown>).research_links ?? []) as Array<{ title?: string; url?: string }>).filter((s) => s?.url);
  const sourceUrl = (gc0.website?.trim() || researchLinks[0]?.url || "") || null;

  const notesField = <Field label="Research notes" value={notes} onChange={setNotes} onBlur={saveResearch} multiline />;

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Research
      </h3>
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        {research?.orientation && (
          <Guidance>{research.orientation}</Guidance>
        )}
        {showOrgName && (
          <NameWithSource
            label={type === "advisor" ? "Office name" : "Organization name"}
            value={orgName}
            onChange={setOrgName}
            onBlur={saveOutreach}
            sourceUrl={sourceUrl}
          />
        )}

        {/* Office-level contact (the outreach target). Website lives in the
            source link by the name; people go in the named-contacts section. */}
        {isOffice && (
          <div className="grid grid-cols-2 gap-2">
            <Field type="email" label="General email" value={officeEmail} onChange={setOfficeEmail} onBlur={saveOfficeContact} placeholder="org@uni.edu" />
            <Field label="General phone" value={officePhone} onChange={setOfficePhone} onBlur={saveOfficeContact} />
          </div>
        )}

        {showDepartment && (
          <>
            <Select
              label="Department"
              value={department}
              onChange={(v) => { setDepartment(v); saveOutreach({ department: v === OTHER ? null : v || null }); }}
              options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
            />
            {department === OTHER && (
              <Field
                label="Other department"
                value={departmentOther}
                onChange={setDepartmentOther}
                onBlur={saveOutreach}
              />
            )}
          </>
        )}

        {/* v8.7: primary contact embedded for single-contact types (not offices —
            offices use the general-contact fields above + the people roster). */}
        {!isOffice && (
          <>
            {showTitleField && (
              <Field
                label="Title"
                value={title}
                onChange={setTitle}
                onBlur={savePrimaryContact}
                placeholder="Dr."
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="First name" value={firstName} onChange={setFirstName} onBlur={savePrimaryContact} />
              <Field label="Last name" value={lastName} onChange={setLastName} onBlur={savePrimaryContact} />
              <Field type="email" label="Email" value={email} onChange={setEmail} onBlur={savePrimaryContact} placeholder="name@uni.edu" />
              <Field label="Phone" value={phone} onChange={setPhone} onBlur={savePrimaryContact} />
            </div>
          </>
        )}


        {/* Named contacts — the SAME shared component the Provider drawer uses
            for Decision makers. Advising offices have "Advisors"; student
            organizations have "Leaders" (with role presets). Stored in
            research_data.office_members; materialized into recipients at launch
            (launchOffice). */}
        {type === "advisor" && (
          <SpecificContactsSection
            ctx={ctx}
            action={action}
            setError={setError}
            researchKey="office_members"
            title="Advisors"
            primaryRoleLabel="Advisor"
            addLabel="Add an advisor"
            helpText="Advisors at this office. Anyone with an email becomes a selectable recipient at launch, alongside the general office contact."
          />
        )}
        {type === "student_org" && (
          <SpecificContactsSection
            ctx={ctx}
            action={action}
            setError={setError}
            researchKey="office_members"
            title="Leaders"
            primaryRoleLabel="President"
            rolePresets={LEADER_ROLES}
            addLabel="Add Leader"
            helpText="Officers and the faculty advisor for this organization. Anyone with an email becomes a selectable recipient at launch, alongside the general org contact. The faculty advisor is the most valuable long-term contact (year-to-year continuity)."
          />
        )}

        {research && (
          <>
            {research.checklist.length > 0 && <ChecklistInline items={research.checklist} />}
            <div className="pt-1">{research.cta}</div>
          </>
        )}

        {/* Research notes sit BELOW the workflow (call to confirm + launch) so
            they don't interrupt the main path. */}
        {notesField}
      </div>
    </section>
  );
}

// ── Contacts section (type-aware) ──────────────────────────────────────

function ContactsSection({
  ctx,
  action,
  setError,
}: {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (e: string | null) => void;
}) {
  const type = ctx.outreach.stakeholder_type;
  const multi = supportsMultipleContacts(type);
  const [showAdd, setShowAdd] = useState(false);
  const active = ctx.contacts.filter((c) => c.status === "active");

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {multi ? `Contacts (${active.length} active)` : "Contact"}
        </h3>
        {(multi || active.length === 0) && (
          <SmallButton onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Cancel" : multi ? "+ Add officer" : "+ Add contact"}
          </SmallButton>
        )}
      </div>
      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
        {multi && (
          <div className="rounded-md border border-blue-100 bg-blue-50/60 p-2.5 text-xs text-blue-900">
            💡 Don&apos;t rely on one inbox — President, VP, and the outreach officer at minimum.
            Email each officer so info reaches whoever&apos;s online first.
          </div>
        )}
        {ctx.contacts.length === 0 && !showAdd && (
          <p className="text-sm text-gray-400">No contacts yet.</p>
        )}
        {ctx.contacts.map((c) => (
          <ContactRow key={c.id} contact={c} action={action} setError={setError} />
        ))}
        {showAdd && (
          <AddContactInline
            type={type}
            action={action}
            setError={setError}
            onSaved={() => setShowAdd(false)}
          />
        )}
      </div>
    </section>
  );
}

function ContactRow({
  contact,
  action,
  setError,
}: {
  contact: Contact;
  action: ActionFn;
  setError: (e: string | null) => void;
}) {
  const stale = contact.status !== "active";
  return (
    <div className={`rounded-md border border-gray-100 px-3 py-2 ${stale ? "bg-gray-50 opacity-70" : "bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {contact.is_primary && "★ "}
            {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.name}
            {contact.role && <span className="ml-2 text-gray-500">{contact.role}</span>}
            {stale && <span className="ml-2 text-xs text-gray-400">[{contact.status}]</span>}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {[contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {!stale && (
          <SmallButton onClick={() => action("mark_contact_stale", { contact_id: contact.id }).catch((e) => setError(e.message))}>
            Mark stale
          </SmallButton>
        )}
      </div>
    </div>
  );
}

function AddContactInline({
  type,
  action,
  setError,
  onSaved,
}: {
  type: StakeholderType;
  action: ActionFn;
  setError: (e: string | null) => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [roleOther, setRoleOther] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-dashed border-gray-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name" value={lastName} onChange={setLastName} />
      </div>
      <Select
        label="Role"
        value={role}
        onChange={setRole}
        options={ROLES_BY_TYPE[type].map((r) => ({ value: r, label: r }))}
      />
      {role === OTHER && (
        <Field label="Other role" value={roleOther} onChange={setRoleOther} />
      )}
      <Field label="Email" value={email} onChange={setEmail} type="email" />
      <Field label="Phone" value={phone} onChange={setPhone} />
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
        Primary contact
      </label>
      <PrimaryButton onClick={async () => {
        // A name OR an email is enough — partners may share one general inbox.
        if (!firstName.trim() && !email.trim()) { setError("Add a name or an email"); return; }
        try {
          await action("add_contact", {
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            role: role === OTHER ? roleOther : role,
            email,
            phone,
            is_primary: isPrimary,
          });
          onSaved();
        } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
      }}>Add contact</PrimaryButton>
    </div>
  );
}







// v8.10.30: FollowupNotesModal removed. The "needs follow-up" path is
// now part of LogMeetingModal's done_followup outcome — admin uses the
// unified Log meeting CTA both on the row card and inside the drawer.

// ── UI primitives ──────────────────────────────────────────────────────




// ── Research-mode helpers (still used by ResearchSection) ──────────────

function Guidance({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-700 leading-relaxed">{children}</p>;
}

function ChecklistInline({ items }: { items: Array<{ done: boolean; label: string }> }) {
  return (
    <ul className="space-y-0.5">
      {items.map((i, idx) => (
        <li key={idx} className={`flex items-center gap-2 text-xs ${i.done ? "text-emerald-700" : "text-gray-500"}`}>
          <span aria-hidden>{i.done ? "✓" : "○"}</span>
          <span>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => unknown; disabled?: boolean }) {
  return (
    <button
      onClick={() => void onClick()}
      disabled={disabled}
      className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}


function DangerButton({ children, onClick }: { children: React.ReactNode; onClick: () => unknown }) {
  return (
    <button
      onClick={() => void onClick()}
      className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
    >
      {children}
    </button>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => unknown }) {
  return (
    <button
      onClick={() => void onClick()}
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {children}
    </button>
  );
}

/** Name field with a green "source" link on the right of the label — opens the
 *  website / research source where we found the record. Shared visual pattern
 *  with the Provider Research Card. */
function NameWithSource({
  label, value, onChange, onBlur, sourceUrl,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  sourceUrl: string | null;
}) {
  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {sourceUrl && (
          <a
            href={sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary-600 hover:underline"
            title="Open the website / research source"
          >
            🌐 source ↗
          </a>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
      />
    </div>
  );
}

function Field({
  label, value, onChange, onBlur, placeholder, type = "text", multiline,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder?: string; type?: string; multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
        />
      )}
    </label>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <StyledSelect
      label={label}
      value={value}
      onChange={onChange}
      placeholder="— select —"
      size="sm"
      options={[
        { value: "", label: "— select —" },
        ...options,
      ]}
    />
  );
}

function MultiToggle({
  label, values, options, onToggle,
}: {
  label: string;
  values: string[];
  options: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = values.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

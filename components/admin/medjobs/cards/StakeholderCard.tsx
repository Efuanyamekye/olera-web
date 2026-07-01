"use client";

/**
 * MedJobs row card primitives — the visual chassis used across every
 * In Basket tab and dedicated MedJobs page.
 *
 * Exports:
 *   RowCard               — pulls slots from buildRowSlots(tab, row, cb) and
 *                           renders them in StakeholderCard.
 *   StakeholderCard       — generic row shell (white bg, gray-200 border,
 *                           rounded-lg) with three regions: descriptive
 *                           content (left), overflow menu (top-right),
 *                           primary CTA (bottom-right).
 *   Pill, ExpandableNote, PrimaryAction, OverflowMenu, MenuItem, FilterPill
 *
 * Slot builders (researchSlots, callsSlots, ...) live here because they
 * consume the same primitives. Per-tab slot dispatch via buildRowSlots.
 *
 * Extracted from app/admin/student-outreach/page.tsx as part of the
 * v9.0 MedJobs reorg (Phase 0). Behavior is unchanged from v8.10.X.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  KIND_LABELS,
  type RepliesState,
  type TabRow,
} from "@/lib/student-outreach/types";
import {
  cleanOrgName,
  formatLongDate,
  formatRelative,
  formatShortRelative,
} from "@/lib/student-outreach/formatters";
import type {
  OverflowItem,
  RowCardCallbacks,
  RowSlots,
  StopOutreachReason,
  TabKey,
} from "@/lib/student-outreach/tab-config";
import { STAGE_DISPLAY, type Stage } from "@/lib/medjobs/stage";
import { smartleadInboxUrl } from "@/lib/medjobs/smartlead-inbox";

// ── RowCard ──────────────────────────────────────────────────────────────

interface RowCardExtras {
  /** v9.0 Phase 7 Commit K: when true, the per-tab primary CTA is
   *  suppressed (e.g. closed/done rows on dedicated entity pages —
   *  they're history, not action surfaces). The ellipsis still
   *  renders, with onReopen prepended when provided. */
  ctaSuppressed?: boolean;
  /** v9.0 Phase 7 Commit K: optional Reopen handler. When present,
   *  surfaces as a "Reopen" item at the top of the row overflow. */
  onReopen?: () => Promise<void> | void;
}

export function RowCard({
  tab,
  row,
  ctaSuppressed,
  onReopen,
  recentlyMoved,
  ...cb
}: { tab: TabKey; row: TabRow; recentlyMoved?: boolean } & RowCardCallbacks & RowCardExtras) {
  const slots = buildRowSlots(tab, row, cb);
  // v9.0 Phase 7 Commit K: Reopen prepended to the overflow menu on
  // closed rows. The slot builders' overflow already includes Mark
  // as unread / Stop outreach / etc.; we wrap it to add Reopen at
  // the top without rebuilding the menu shape.
  const overflow =
    onReopen != null ? (
      <ReopenWrappedOverflow inner={slots.overflowMenu} onReopen={onReopen} />
    ) : (
      slots.overflowMenu
    );
  return (
    <StakeholderCard
      row={row}
      pill={slots.pill}
      footnote={slots.footnote}
      headlineAccessory={slots.headlineAccessory}
      cta={ctaSuppressed ? undefined : slots.cta}
      overflowMenu={overflow}
      onOpenDrawer={cb.onOpenDrawer}
      unread={row.viewed_at == null}
      recentlyMoved={recentlyMoved}
    />
  );
}

/**
 * v9.0 Phase 7 Commit K: thin wrapper that renders a Reopen button
 * inline next to the per-tab overflow menu. Keeping it as a separate
 * inline button (rather than injecting into the OverflowMenu items
 * list) avoids reaching into the OverflowMenu's internal item shape
 * and keeps the affordance unambiguous on closed rows.
 */
function ReopenWrappedOverflow({
  inner,
  onReopen,
}: {
  inner: ReactNode;
  onReopen: () => Promise<void> | void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => {
          e.stopPropagation();
          void onReopen();
        }}
        title="Reopen this row — moves it back into active workflow."
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
      >
        Reopen
      </button>
      {inner}
    </div>
  );
}

/**
 * Unified row shell — v8.10.12 layout.
 *
 *   [Contact name + headlineAccessory]                     [⋯ overflow]
 *   [org · campus · type · role]
 *   [footnote — last activity, overdue, etc.]
 *   [status pill]
 *   [notes (optional)]
 *                                                         [Primary CTA]
 *
 * Three regions: descriptive content (left column, top-down), overflow
 * menu (top-right), primary CTA (bottom-right). Each per-tab slots
 * function returns whichever pieces apply; missing pieces don't render.
 */
export function StakeholderCard({
  row,
  pill,
  footnote,
  headlineAccessory,
  cta,
  overflowMenu,
  onOpenDrawer,
  unread,
  recentlyMoved,
}: {
  row: TabRow;
  pill?: ReactNode;
  footnote?: ReactNode;
  headlineAccessory?: ReactNode;
  cta?: ReactNode;
  overflowMenu?: ReactNode;
  onOpenDrawer: () => void;
  /** v9.0 Phase 4: title bolds when unread. */
  unread?: boolean;
  /** E2: row was just moved here from another tab — flash highlight. */
  recentlyMoved?: boolean;
}) {
  // v9.0 Phase 7 Commit I: unified card chrome across all kinds. The
  // earlier amber lane for provider rows is gone — provider vs.
  // stakeholder is clear from the `kindLabel` in the subtitle, and a
  // separate visual lane created two card languages (one for
  // providers, one for everyone else) that fought each other in the
  // Prospects list. Unread state uses the same bold-black border as
  // MedjobsCard so the design language is one.
  const borderClass = unread ? "border-gray-900" : "border-gray-200";
  // E2: when a row was just moved by a Log action, briefly tint the
  // card emerald so admin SEES where the work landed. Transitions
  // fade as the recentlyMoved flag clears.
  const movedBg = recentlyMoved ? "bg-primary-50" : "bg-white";
  // Transition ONLY the background (the recently-moved emerald flash fades
  // gently). The unread border must flip instantly — animating it over
  // 500ms is what made un-bolding a read card visibly "drag".
  const cardClass = `cursor-pointer rounded-lg border ${borderClass} ${movedBg} px-4 py-3 transition-[background-color] duration-500 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`;
  // Subtitle label: kind label (Provider / Advisor / etc.) — fallback
  // to the legacy stakeholder_type lookup if kind is missing on older
  // rows that haven't been hydrated yet.
  const kindLabel = KIND_LABELS[row.kind ?? row.stakeholder_type ?? "student_org"];

  // v9 final: per-recipient card copy hierarchy (Calls + Replies
  // fan-out only). Three card "shapes" share this shell:
  //   General Contact   → title = org name; subtitle =
  //                       "Provider · General Contact · Near {campus}"
  //   Specific Contact  → title = "{contact} · {org}" (org bolded);
  //                       subtitle =
  //                       "Provider · Specific Contact · {role} ·
  //                        Near {campus}"
  //   Non-fan-out row   → legacy title + subtitle (outreach as a
  //                       whole — Prospects / All / Archive). The
  //                       recipient_kind discriminator is null in
  //                       this case.
  const isGeneralCard = row.recipient_kind === "general";
  const isSpecificCard = row.recipient_kind === "specific";
  // Display-only cleanup of AI name artifacts (e.g. "(not a named person)").
  const orgDisplay = cleanOrgName(row.organization_name);
  const titleText = isGeneralCard
    ? orgDisplay
    : row.primary_contact_name || orgDisplay;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDrawer}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDrawer();
        }
      }}
      title="Open the drawer for full context and history."
      className={cardClass}
    >
      <div className="flex items-stretch justify-between gap-3">
        {/* LEFT: descriptive content stacked top-down */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isSpecificCard ? (
              <p className="truncate text-sm text-gray-900">
                <span className={unread ? "font-semibold" : "font-medium"}>
                  {row.primary_contact_name || orgDisplay}
                </span>
                {row.primary_contact_name &&
                  row.primary_contact_name !== orgDisplay && (
                    <>
                      <span className="font-normal text-gray-500"> · </span>
                      <span
                        className={
                          unread ? "font-semibold" : "font-semibold text-gray-900"
                        }
                      >
                        {orgDisplay}
                      </span>
                    </>
                  )}
              </p>
            ) : (
              <p
                className={`truncate text-sm ${
                  unread ? "font-semibold" : "font-medium"
                } text-gray-900`}
              >
                {titleText}
              </p>
            )}
            {headlineAccessory}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {isGeneralCard || isSpecificCard ? (
              <>
                {kindLabel}
                {" · "}
                {isGeneralCard ? "General Contact" : "Specific Contact"}
                {isSpecificCard &&
                  row.primary_contact_role &&
                  ` · ${row.primary_contact_role}`}
                {row.campus_name && ` · Near ${row.campus_name}`}
              </>
            ) : (
              <>
                {row.primary_contact_name &&
                  row.primary_contact_name !== orgDisplay && (
                    <>
                      {orgDisplay}
                      {row.department &&
                        row.department !== row.organization_name &&
                        ` · ${row.department}`}
                      {" · "}
                    </>
                  )}
                {row.campus_name} · {kindLabel}
                {row.primary_contact_role && ` · ${row.primary_contact_role}`}
              </>
            )}
          </p>
          {footnote}
          {pill && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {pill}
            </div>
          )}
        </div>

        {/* RIGHT: ellipsis at top, CTA at bottom. */}
        {(cta || overflowMenu) && (
          <div className="flex shrink-0 flex-col items-end justify-between gap-2">
            <div className="flex items-center">{overflowMenu}</div>
            <div className="flex items-center">{cta}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pills (single tone — soft slate, easy on the eyes) ──────────────────

export function Pill({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className="shrink-0 rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700"
    >
      {children}
    </span>
  );
}

/**
 * Canonical stage pill — single source of operational state across every
 * card in every tab. Driven by deriveStageForTabRow(); tone comes from
 * STAGE_DISPLAY in lib/medjobs/stage.ts. Replaces the per-tab status pills
 * that previously drifted (Replies showed "Replied", Meetings showed
 * "Booked · Fri 3pm", Archive showed "Stale 8d cold" — each its own
 * vocabulary). Stage is the state; the footnote/context line carries
 * the operational detail. One pill across surfaces; tone changes carry
 * meaning (emerald active, amber wants attention, red broken, gray
 * terminal).
 */
export function StagePill({
  stage,
  title,
}: {
  stage: Stage;
  title?: string;
}) {
  const display = STAGE_DISPLAY[stage];
  const toneClass = STAGE_TONE_CLASSES[display.tone];
  return (
    <span
      title={title}
      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${toneClass}`}
    >
      {display.label}
    </span>
  );
}

const STAGE_TONE_CLASSES: Record<
  (typeof STAGE_DISPLAY)[Stage]["tone"],
  string
> = {
  green: "bg-primary-100 text-primary-800",
  emerald: "bg-primary-100 text-primary-800",
  amber: "bg-amber-100 text-amber-800",
  purple: "bg-purple-100 text-purple-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-gray-100 text-gray-700",
};

/**
 * v8.10.23: long notes on cards truncate to a character limit and
 * expose a "See more" toggle — clicking inline-expands the full text
 * without opening the drawer. Keeps card heights consistent and
 * scannable while preserving access to the full quote.
 */
export function ExpandableNote({ text, limit = 100 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > limit;
  const display = expanded || !needsTruncation ? text : text.slice(0, limit).trimEnd();
  return (
    <p className="mt-0.5 text-[11px] italic text-gray-700">
      &quot;{display}
      {!expanded && needsTruncation && "…"}&quot;
      {needsTruncation && (
        <>
          {" "}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((s) => !s);
            }}
            className="not-italic text-primary-700 underline hover:no-underline"
          >
            {expanded ? "See less" : "See more"}
          </button>
        </>
      )}
    </p>
  );
}

// ── Buttons (single tone — emerald primary) ──────────────────────────────

export function PrimaryAction({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
    >
      {children}
    </button>
  );
}

// ── Overflow ⋯ menu (with two-step Stop outreach picker) ─────────────────

export function OverflowMenu({
  items,
  onStopOutreach,
  onArchive,
}: {
  items: OverflowItem[];
  onStopOutreach: (reason: StopOutreachReason) => Promise<void>;
  /** Whole-prospect Archive — rendered as its own item, separate from the
   *  Stop-outreach picker. Omitted for already-archived rows. */
  onArchive?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowReasons(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setShowReasons(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const close = () => { setOpen(false); setShowReasons(false); };
  const stop = (reason: StopOutreachReason) => {
    void onStopOutreach(reason);
    close();
  };

  return (
    <div ref={ref} className="relative self-end">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); setShowReasons(false); }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        title="More actions"
        aria-label="More actions"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {showReasons ? (
            <>
              <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Stop outreach — why?
              </p>
              <MenuItem onClick={() => stop("no_response_closed")}>No response</MenuItem>
              <MenuItem onClick={() => stop("not_interested")}>Not interested</MenuItem>
              <MenuItem onClick={() => stop("wrong_contact")}>Wrong contact</MenuItem>
              <MenuItem onClick={() => stop("do_not_contact")} danger>Do not contact</MenuItem>
              <div className="my-1 border-t border-gray-100" />
              <MenuItem onClick={() => setShowReasons(false)}>← Back</MenuItem>
            </>
          ) : (
            <>
              {items.map((item, i) => (
                <MenuItem
                  key={i}
                  onClick={() => { item.onClick(); close(); }}
                  celebration={item.tone === "celebration"}
                >
                  {item.label}
                </MenuItem>
              ))}
              {items.length > 0 && <div className="my-1 border-t border-gray-100" />}
              {onArchive && (
                <MenuItem onClick={() => { void onArchive(); close(); }}>
                  Archive
                </MenuItem>
              )}
              <MenuItem onClick={() => setShowReasons(true)} danger>
                Stop outreach…
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  celebration,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  celebration?: boolean;
}) {
  const colorClass = danger
    ? "text-red-700 hover:bg-red-50"
    : celebration
    ? "text-primary-700 hover:bg-primary-50"
    : "text-gray-700 hover:bg-gray-50";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`block w-full px-3 py-1.5 text-left text-xs font-medium ${colorClass}`}
    >
      {children}
    </button>
  );
}

/**
 * v8.10.34: FilterPill — segmented-control chip used by the Prospects
 * tab filter row. Same border-radius (rounded-md) as buttons elsewhere,
 * no chunky bordered chrome when inactive (just hover bg) so the pill
 * row sits quietly above the cards instead of competing with them.
 */
export function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-xs tabular-nums ${
          active ? "text-white/70" : "text-gray-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ── Per-tab slot builders ────────────────────────────────────────────────

/**
 * Row overflow menu — the simplified workflow keeps the cards to status +
 * click-to-open. The ⋯ menu carries only utilities (mark unread, jump to the
 * directory / log history) plus the Stop-outreach picker. All outcome actions
 * (interested / not interested / log call / log meeting / make client) live in
 * the drawer now, reached by clicking the card.
 */
export function buildUniversalOverflow(cb: RowCardCallbacks): ReactNode {
  const items: OverflowItem[] = [];
  items.push({ label: "Mark as unread", onClick: () => void cb.onMarkUnread() });
  if (cb.onOpenDirectory) {
    items.push({ label: "Open in directory ↗", onClick: cb.onOpenDirectory });
  }
  if (cb.onSeeLogHistory) {
    items.push({ label: "See log history", onClick: cb.onSeeLogHistory });
  }
  return (
    <OverflowMenu
      items={items}
      onStopOutreach={cb.onStopOutreach}
      onArchive={cb.onArchive}
    />
  );
}

export function buildRowSlots(tab: TabKey, row: TabRow, cb: RowCardCallbacks): RowSlots {
  // Per-tab slot logic builds footnote + CTA + overflow.
  let slots: RowSlots;
  if (tab === "prospects") slots = researchSlots(row, cb);
  else if (tab === "calls") slots = callsSlots(row, cb);
  else if (tab === "replies") slots = repliesSlots(row, cb);
  else if (tab === "meetings") slots = meetingsSlots(row, cb);
  else if (tab === "partners") slots = partnersSlots(row, cb);
  else if (tab === "archive") slots = archiveSlots(row, cb);
  else slots = allSlots(row, cb);

  // v9 final: pill removed from row cards. The pill restated entity-
  // type / tab default (every Prospects row showed "Prospect", every
  // Replies row showed "In Outreach") without telling the admin what
  // to do next. The footnote already carries action-oriented copy
  // ("Ready to launch outreach", "Reply 2d ago", "Call due Tue 3pm")
  // which is the better operational signal. StagePill export stays
  // for use inside the drawer's NextStepCard / status headers, but
  // row cards run without it.
  return slots;
}

function researchSlots(row: TabRow, cb: RowCardCallbacks): RowSlots {
  // Footnote answers "what does the admin need to do?". The card opens the
  // drawer on click — that's where research + launch happen. Office prospects
  // are generated WITH a general email, so "needs contact info" was wrong; the
  // real next step is the confirmation call.
  const rd = (row.research_data ?? {}) as Record<string, unknown>;
  const gc = (rd.general_contact ?? {}) as { email?: string };
  const members = (Array.isArray(rd.office_members) ? rd.office_members : []) as Array<{ email?: string }>;
  const hasEmail = Boolean(gc.email) || members.some((m) => Boolean(m?.email));
  // Precise verified state lives on touchpoints (shown in the drawer); the card
  // just points to the next action by stage.
  const subStateText =
    row.status === "researched"
      ? "Confirm by call, then launch outreach"
      : hasEmail
        ? "Has contact — confirm and launch outreach"
        : "Needs contact info before outreach";
  return {
    footnote: (
      <p className="mt-0.5 text-[11px] text-gray-500">{subStateText}</p>
    ),
    overflowMenu: buildUniversalOverflow(cb),
  };
}

function callsSlots(row: TabRow, cb: RowCardCallbacks): RowSlots {
  // The Calls tab emits one TabRow per pending call task. The card is kept
  // deliberately minimal — org name, contact/site line, and the phone link.
  // The due date lives in the section header (one section per calendar date),
  // so no per-card cadence-day label or "in Nd" countdown is needed. The call
  // script + Interested / Not interested / Couldn't reach live in the drawer.
  return {
    footnote: null,
    headlineAccessory: row.primary_contact_phone ? (
      <a
        href={`tel:${row.primary_contact_phone}`}
        onClick={(e) => e.stopPropagation()}
        title="Tap to dial (mobile) — opens the default phone app."
        className="shrink-0 text-xs text-primary-700 underline hover:no-underline"
      >
        📞 {row.primary_contact_phone}
      </a>
    ) : undefined,
    overflowMenu: buildUniversalOverflow(cb),
  };
}

function repliesSlots(row: TabRow, cb: RowCardCallbacks): RowSlots {
  // v9 canonical pill in buildRowSlots replaces the per-state pill that
  // lived here. The state-specific operational signal moves into the
  // footnote / context line so the admin still sees what's happening
  // (replied / wants to meet / needs follow-up / awaiting callback /
  // stale). Stage pill answers "this row is in Outreach"; context line
  // answers "and here's why you should act on it now".
  const lastActivityRelative = row.last_activity_at
    ? formatRelative(row.last_activity_at)
    : null;
  const state: RepliesState = row.replies_state ?? "mid_cadence";
  const buildFootnote = (prefix: string | null): ReactNode => {
    const line = [prefix, lastActivityRelative ? `last activity ${lastActivityRelative}` : null]
      .filter(Boolean)
      .join(" · ");
    return line ? (
      <p className="mt-0.5 text-[11px] text-gray-500">{line}</p>
    ) : null;
  };
  // v10 Bullet 9 (2026-06-04): Smartlead inbox deep-link as headline
  // accessory. Opens the master inbox at this row's thread context so
  // admin doesn't have to find the thread manually. Only shown when
  // the row has Smartlead linkage (post-bridge enrollment). Reused
  // across replies states (engaged / needs_followup / wants_meeting)
  // where admin would want to read the actual thread before logging.
  const inboxLink = renderSmartleadInboxLink(row.smartlead_linkage);
  switch (state) {
    case "mid_cadence":
      return {
        footnote: buildFootnote(null),
        overflowMenu: buildUniversalOverflow(cb),
      };
    case "engaged":
      return {
        footnote: buildFootnote("Reply received — open to review"),
        headlineAccessory: inboxLink,
        overflowMenu: buildUniversalOverflow(cb),
      };
    case "wants_meeting":
      return {
        footnote: buildFootnote("Wants to meet"),
        headlineAccessory: inboxLink,
        overflowMenu: buildUniversalOverflow(cb),
      };
    case "booked":
      return {
        footnote: row.meeting_at ? (
          <p className="mt-0.5 text-[11px] text-gray-500">
            Booked · {formatLongDate(row.meeting_at)}
          </p>
        ) : buildFootnote("Booked"),
        overflowMenu: buildUniversalOverflow(cb),
      };
    case "needs_followup":
      return {
        footnote: row.followup_notes ? (
          <ExpandableNote text={row.followup_notes} />
        ) : buildFootnote("Meeting completed — follow-up needed"),
        headlineAccessory: inboxLink,
        overflowMenu: buildUniversalOverflow(cb),
      };
    case "awaiting_callback": {
      const kindLabel =
        row.awaiting_callback_kind === "promised" ? "Promised callback" : "Voicemail";
      const callbackWhen = row.awaiting_callback_at
        ? formatShortRelative(row.awaiting_callback_at)
        : null;
      const prefix = callbackWhen ? `${kindLabel} · ${callbackWhen}` : kindLabel;
      return {
        footnote: buildFootnote(prefix),
        overflowMenu: buildUniversalOverflow(cb),
      };
    }
    case "stale":
      return {
        footnote: (
          <p className="mt-0.5 text-[11px] text-gray-500">
            Stale{row.stale_days != null ? ` · ${row.stale_days}d cold` : ""}
          </p>
        ),
        overflowMenu: buildUniversalOverflow(cb),
      };
  }
}

function meetingsSlots(row: TabRow, cb: RowCardCallbacks): RowSlots {
  // Meeting time is the operational signal. Canonical stage pill shows
  // "Meeting"; footnote answers "when". Last-activity is secondary
  // (the meeting time is more relevant on a Meetings card).
  const footnoteText =
    row.meeting_state === "scheduled" && row.meeting_at
      ? `Booked · ${formatLongDate(row.meeting_at)}`
      : "On the calendar";
  return {
    footnote: (
      <p className="mt-0.5 text-[11px] text-gray-500">{footnoteText}</p>
    ),
    overflowMenu: buildUniversalOverflow(cb),
  };
}

function partnersSlots(row: TabRow, cb: RowCardCallbacks): RowSlots {
  return {
    footnote: row.last_activity_at ? (
      <p className="mt-0.5 text-[11px] text-gray-400">
        Last activity {formatRelative(row.last_activity_at)}
      </p>
    ) : null,
    overflowMenu: buildUniversalOverflow(cb),
  };
}

function archiveSlots(row: TabRow, cb: RowCardCallbacks): RowSlots {
  // Stale / closed rows. Footnote carries the cold-days detail; a reply
  // (ingested by the Smartlead webhook) re-routes them to Replies on its own.
  const isClosed = row.status === "no_response_closed";
  const reasonText = isClosed ? "No response" : "Stale";
  const coldSuffix = row.stale_days != null ? ` · ${row.stale_days}d cold` : "";
  return {
    footnote: (
      <p
        className="mt-0.5 text-[11px] text-gray-500"
        title="Cadence ran without engagement. A reply re-routes them to Replies."
      >
        {reasonText}
        {coldSuffix}
      </p>
    ),
    overflowMenu: buildUniversalOverflow(cb),
  };
}

function allSlots(row: TabRow, cb: RowCardCallbacks): RowSlots {
  // Dedicated entity pages' All view. Footnote keeps the last-activity
  // timestamp for chronological scanning; click the card to act.
  return {
    footnote: row.last_activity_at ? (
      <p className="mt-0.5 text-[11px] text-gray-400">
        Last activity {formatRelative(row.last_activity_at)}
      </p>
    ) : null,
    overflowMenu: buildUniversalOverflow(cb),
  };
}

// ── v10 Bullet 9 (2026-06-04): Smartlead inbox deep-link ──────────────────

/**
 * "Reply via Smartlead inbox →" deep-link button. Reads the row's
 * smartlead_linkage (written by the queue endpoint from research_data.
 * smartlead.{lead_id, campaign_id}) and constructs an `app.smartlead.ai`
 * master-inbox URL scoped to the thread.
 *
 * Fallback: when lead_id is missing (legacy row pre-bridge), the link
 * points at the master inbox root and the admin finds the thread
 * manually. Better than no affordance at all.
 *
 * Verify the URL convention live during Bullet 9 build (logged in
 * plans/medjobs-known-issues.md).
 */
function renderSmartleadInboxLink(
  linkage: TabRow["smartlead_linkage"],
): ReactNode {
  const url = smartleadInboxUrl(linkage);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open this thread in the Smartlead master inbox to read or reply."
      className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
    >
      ↗ Smartlead inbox
    </a>
  );
}

// Inbox URL construction lives in lib/medjobs/smartlead-inbox.ts so the
// awaiting-reply Next Step and both pre-launch modals share one builder.

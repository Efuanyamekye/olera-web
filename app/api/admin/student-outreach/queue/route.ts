/**
 * GET /api/admin/student-outreach/queue
 *
 * v7: tab-driven query. Returns rows for the requested tab plus counts
 * for ALL tabs (so the UI can show accurate badges in one round-trip).
 *
 * Tabs (workflow order):
 *   research   — status IN (prospect, researched)
 *   calls      — pending outreach_followup_call task with due_at <= now
 *   replies    — outreach_sent + engaged (excludes active_partner); enriched
 *                with stale flag, meeting flag, post-meeting follow-up notes
 *   meetings   — most-recent meeting touchpoint is in_flight or scheduled
 *   partners   — status = active_partner
 *   all        — everything (with show_closed toggle)
 *
 * Active Partners are excluded from research / calls / replies / meetings.
 * Closed rows only appear in `all` (and only when show_closed=true).
 *
 * Per-row indicators (across tabs where applicable):
 *   has_custom_task      — pending manual_followup with payload.reason='custom'
 *   stale_days           — only for replies; days since last email_sent (if >4)
 *   meeting_state        — none | in_flight | scheduled
 *   meeting_at           — when meeting_state=scheduled
 *   followup_notes       — when row has recent post_meeting_followup
 *   followup_author_id   — admin user_id who logged the followup
 *   followup_at          — when the followup was logged
 *   primary_contact_*    — name + phone (calls tab needs phone prominent)
 *   last_activity_at     — most recent touchpoint (replaces 4-hour timer)
 *   custom_task_summary  — first description of pending custom tasks
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  computeStaleDays,
  deriveRepliesState,
  deriveStateFromTouchpoints,
  type DerivedState,
  type TouchpointRow,
} from "@/lib/student-outreach/state-derivation";
import { countProspectGeneration } from "@/lib/medjobs/prospect-counts";
import { resolvePartnerProspectUnlocks } from "@/lib/medjobs/partner-prospect-gate";
import { displayContactName, displayContactRole } from "@/lib/student-outreach/formatters";
import type {
  AwaitingCallbackKind,
  Campus,
  OutreachRow,
  RepliesState,
  StakeholderType,
  Status,
} from "@/lib/student-outreach/types";

const PAGE_SIZE_DEFAULT = 50;

const RESEARCH_STATUSES: Status[] = ["prospect", "researched"];
const REPLIES_STATUSES: Status[] = ["outreach_sent", "engaged"];
// v8.10.6: Archive contains stakeholders where outreach completed without
// engagement, plus active outreach_sent rows that have gone "stale" by
// derivation (cadence still running but no reply for STALE_DAYS+ days).
// Terminal states (not_interested, do_not_contact, wrong_contact,
// redirected) are NOT archived — they stay in All only as historical
// records.
// Manually "archived" rows (whole-prospect Archive action) join no_response_closed
// in the Archive tab — both are "parked, reopenable" rather than terminal.
const ARCHIVE_STATUSES: Status[] = ["no_response_closed", "archived"];
const PARTNER_STATUSES: Status[] = ["active_partner"];
const CLOSED_STATUSES: Status[] = [
  "not_interested",
  "no_response_closed",
  "do_not_contact",
  "wrong_contact",
  "redirected",
  "archived",
];
// Legacy active-partner values (pre-migration 065); still surface in Partners.
const PARTNER_ALL: string[] = [...PARTNER_STATUSES, "agreed", "distributed"];


type DB = ReturnType<typeof getServiceClient>;

export interface TabCounts {
  candidates: number;
  prospects: number;
  calls: number;
  replies: number;
  meetings: number;
  partners: number;
  archive: number;
  all: number;
  // v9.0 Phase 2: optional so the legacy fields are decoupled. The
  // public type in lib/student-outreach/types.ts mirrors this.
  clients?: number;
  campuses?: number;
  // v9.0 Phase 7: 'sites' is the new UI alias for the campus
  // territorial primitive. Mirrored here so the queue route can return
  // both keys; In Basket reads `sites`, legacy callers read `campuses`.
  sites?: number;
  // Audience-composite counts for the In Basket primary bar (providers /
  // partner_book). Mirrored in lib/student-outreach/types.ts.
  providers?: number;
  partner_book?: number;
}

export interface TabRow extends OutreachRow {
  /** v9 final: stable React key for list rendering. Defaults to
   *  outreach `id`, but the Calls tab fans out one row per pending
   *  call task and emits unique `${outreach_id}-${task_id}` keys. */
  row_key?: string;
  campus_name: string;
  campus_slug: string;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_role: string | null;
  has_custom_task: boolean;
  custom_task_summary: string | null;
  stale_days: number | null;
  meeting_state: "none" | "in_flight" | "scheduled";
  meeting_at: string | null;
  followup_notes: string | null;
  followup_author: string | null;
  followup_at: string | null;
  last_activity_at: string | null;
  /** Calls tab only: the due call task. */
  due_call_task: { id: string; due_at: string; cadence_day: number | null } | null;
  /** v10 Bullet 7: engagement sub-state (read by Calls tab priority). */
  engagement_substate?:
    | "no_engagement"
    | "opened_not_clicked"
    | "clicked_not_activated"
    | null;
  /** v10 Bullet 9: Smartlead linkage for the "Reply via Smartlead inbox"
   *  deep-link button on the Emails tab. */
  smartlead_linkage?: {
    lead_id: string | null;
    campaign_id: string | null;
  } | null;
  /**
   * v9 Phase 9: list of recipient names from pending call tasks
   * (per-recipient mode). Populated on Calls tab. Legacy rows
   * (single call task per outreach) produce an empty array; the
   * card renders the row's primary contact phone instead.
   */
  due_call_recipients: string[];
  /** v8 Replies tab only: which state card to render. */
  replies_state: RepliesState | null;
  awaiting_callback_at: string | null;
  awaiting_callback_kind: AwaitingCallbackKind | null;
  /** v8 humanized next-scheduled-action label (Partners tab today). */
  next_step_label: string | null;
  /** v8.7: pending Post-to-job-board task on this stakeholder. */
  has_pending_job_board_task: boolean;
  /** v9 final: business_profiles.slug for kind='provider' rows.
   *  Powers the row-card "Open in directory" shortcut. */
  provider_slug?: string | null;
  /** v9 final: per-recipient card identifier. 'general' / 'specific'
   *  on Calls + Replies fan-out rows; null elsewhere. */
  recipient_kind?: "general" | "specific" | null;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getServiceClient();
  const url = new URL(req.url);
  // v8.10.33: tab=prospects is the new label for what was previously
  // tab=research (prospect/researched stakeholders being qualified).
  // The server filter still keys on the same status set; the rename is
  // purely operational language.
  // (tab=candidates is a separate upcoming view — student applicants —
  // currently returns no rows; UI shows a "Coming soon" placeholder.)
  const tab = url.searchParams.get("tab") ?? "prospects";
  const campusSlug = url.searchParams.get("campus");
  const typeFilter = url.searchParams.get("type") as StakeholderType | null;
  const search = (url.searchParams.get("search") ?? "").trim();
  const showClosed = url.searchParams.get("show_closed") === "true";
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT), 10)),
  );

  // Active campuses (dropdown).
  const { data: campuses } = await db
    .from("student_outreach_campuses")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const campusList = (campuses ?? []) as Campus[];
  const campusMap = new Map(campusList.map((c) => [c.id, c]));
  const selectedCampus = campusSlug
    ? campusList.find((c) => c.slug === campusSlug) ?? null
    : null;

  // Counts for all tabs (one efficient pass + a few small queries).
  // v9.0 Phase 4: also returns per-tab unread counts mirroring the
  // shape, so the UI can render `Label unread/total`.
  const { counts: tabCounts, unread: tabUnreadCounts, callsTotal } = await computeTabCounts(db, {
    campusId: selectedCampus?.id ?? null,
    type: typeFilter,
  });

  // Per-tab base row IDs.
  const rowIds = await fetchRowIdsForTab(db, {
    tab,
    campusId: selectedCampus?.id ?? null,
    type: typeFilter,
    search,
    showClosed,
    page,
    pageSize,
  });

  // v8.4: Research tab gets an additional `research_campuses` array — one
  // card per campus where research_complete=false, surfaced above the
  // stakeholder rows as an entry-point/acceleration tool. Per-stakeholder
  // rows are unchanged.
  let researchCampuses: Awaited<ReturnType<typeof fetchResearchCampuses>> | null = null;
  if (tab === "prospects") {
    try {
      researchCampuses = await fetchResearchCampuses(db, selectedCampus?.id ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load campuses-in-research";
      console.error("[student-outreach/queue]", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (rowIds.length === 0) {
    return NextResponse.json({
      campuses: campusList,
      rows: [],
      total: 0,
      tab_counts: tabCounts,
      tab_unread_counts: tabUnreadCounts,
      calls_total: callsTotal,
      research_campuses: researchCampuses,
    });
  }

  // Hydrate the row objects + indicator data.
  let rows = await hydrateRows(db, rowIds, tab, campusMap);

  // v8.2: booked rows live only in Meetings tab. Filter out of Replies.
  // v8.10.6: stale rows live in Archive tab. Filter out of Replies too.
  if (tab === "replies") {
    rows = rows.filter(
      (r) => r.replies_state !== "booked" && r.replies_state !== "stale",
    );
  }

  return NextResponse.json({
    campuses: campusList,
    rows,
    total: rows.length,
    tab_counts: tabCounts,
    tab_unread_counts: tabUnreadCounts,
    calls_total: callsTotal,
    research_campuses: researchCampuses,
  });
}

/**
 * v8.4: campuses with research_complete=false. Returns id, slug, name,
 * city, state, count of stakeholders still in research stage, and the
 * most recent stakeholder created_at across all statuses (for the
 * "Last added Xh ago" copy on the card).
 */
async function fetchResearchCampuses(
  db: DB,
  filterCampusId: string | null,
): Promise<Array<{
  id: string;
  slug: string;
  name: string;
  state: string | null;
  city: string | null;
  research_stakeholder_count: number;
  last_added_at: string | null;
  // v9.0 Phase 2: catchment-derived state + client count.
  stage: "provider_prospecting" | "stakeholder_prospecting" | "active";
  client_count: number;
  partner_audit?: { advisor: boolean; student_org: boolean; dept_head: boolean };
}>> {
  let q = db
    .from("student_outreach_campuses")
    .select("id, slug, name, state, city, partner_prospect_unlocked_at, partner_research")
    .eq("is_active", true)
    .eq("research_complete", false);
  if (filterCampusId) q = q.eq("id", filterCampusId);
  const { data: rows, error } = await q;
  if (error) {
    // Most likely cause: migration 069 (research_complete column) or
    // 077 (partner_prospect_unlocked_at column) has not been applied
    // to this database yet. Throw so the GET handler can surface the
    // message to the UI.
    throw new Error(
      `Failed to load campuses-in-research: ${error.message}. ` +
        `If this references "research_complete", run migration 069. ` +
        `If this references "partner_prospect_unlocked_at", run migration 077.`,
    );
  }
  const campusRows = (rows ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    state: string | null;
    city: string | null;
    partner_prospect_unlocked_at: string | null;
    partner_research: { audit?: Record<string, { complete_at?: string }> } | null;
  }>;
  if (campusRows.length === 0) return [];

  const campusIds = campusRows.map((c) => c.id);

  // Single sweep: pull (campus_id, status, created_at) for all stakeholders
  // in scope, then aggregate per campus in JS.
  const { data: stakeholders } = await db
    .from("student_outreach")
    .select("campus_id, status, created_at")
    .in("campus_id", campusIds);

  const RESEARCH_STAGE = new Set<string>(["prospect", "researched"]);
  const counts = new Map<string, number>();
  const lastAddedAt = new Map<string, string>();
  for (const s of (stakeholders ?? []) as Array<{
    campus_id: string;
    status: string;
    created_at: string;
  }>) {
    if (RESEARCH_STAGE.has(s.status)) {
      counts.set(s.campus_id, (counts.get(s.campus_id) ?? 0) + 1);
    }
    const cur = lastAddedAt.get(s.campus_id);
    if (!cur || s.created_at > cur) lastAddedAt.set(s.campus_id, s.created_at);
  }

  // Pull all organization/caregiver providers once with their
  // metadata. Used by the partner-prospect gate (catchment-client
  // resolution) and reused for the stage derivation below.
  const { data: providers } = await db
    .from("business_profiles")
    .select("city, state, metadata")
    .in("type", ["organization", "caregiver"]);
  const providerList = (providers ?? []) as Array<{
    city: string | null;
    state: string | null;
    metadata: Record<string, unknown> | null;
  }>;

  // v9.0 Phase 8: gate research-card visibility on catchment-client
  // presence. Sites without a client in their catchment don't surface
  // a research card; once a client appears, the campus's
  // partner_prospect_unlocked_at is set sticky. Drop campuses that
  // remain locked from the response — the UI is supposed to render
  // Provider Prospects only in that state.
  const { unlockedCampusIds, clientCountByCampusId } =
    await resolvePartnerProspectUnlocks(db, campusRows, providerList);

  return campusRows
    .filter((c) => unlockedCampusIds.has(c.id))
    .map((c) => {
      const clientCount = clientCountByCampusId.get(c.id) ?? 0;
      const stakeholderCount = counts.get(c.id) ?? 0;
      // research_complete=false (filter above) + unlock satisfied. We
      // expose stakeholder_prospecting when a catchment client exists
      // today; provider_prospecting only surfaces here for the sticky
      // case where the last catchment client churned but research is
      // already underway. UI uses this only for sort priority.
      const stage: "provider_prospecting" | "stakeholder_prospecting" =
        clientCount > 0 ? "stakeholder_prospecting" : "provider_prospecting";

      // Per-category prospecting status — the research card persists until ALL
      // three partner categories are audited-complete, so the card shows which
      // are done (Advising ✓ · Orgs ◻ · Dept heads ◻).
      const audit = (c.partner_research?.audit ?? {}) as Record<string, { complete_at?: string }>;
      const partnerAudit = {
        advisor: Boolean(audit.advisor?.complete_at),
        student_org: Boolean(audit.student_org?.complete_at),
        dept_head: Boolean(audit.dept_head?.complete_at),
      };

      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        state: c.state,
        city: c.city,
        research_stakeholder_count: stakeholderCount,
        last_added_at: lastAddedAt.get(c.id) ?? null,
        stage,
        client_count: clientCount,
        partner_audit: partnerAudit,
      };
    })
    .sort((a, b) => {
      // stakeholder_prospecting (active catchment client) cards bubble
      // to the top — they're the prompt admin needs to act on.
      const aPriority = a.stage === "stakeholder_prospecting" && a.research_stakeholder_count === 0 ? 0 : 1;
      const bPriority = b.stage === "stakeholder_prospecting" && b.research_stakeholder_count === 0 ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aTime = a.last_added_at ? new Date(a.last_added_at).getTime() : 0;
      const bTime = b.last_added_at ? new Date(b.last_added_at).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.name.localeCompare(b.name);
    });
}

// ── Counts ──────────────────────────────────────────────────────────────

async function computeTabCounts(
  db: DB,
  filters: { campusId: string | null; type: StakeholderType | null },
): Promise<{ counts: TabCounts; unread: TabCounts; callsTotal: number }> {
  const counts: TabCounts = { candidates: 0, prospects: 0, calls: 0, replies: 0, meetings: 0, partners: 0, archive: 0, all: 0, clients: 0, campuses: 0 };
  const unread: TabCounts = { candidates: 0, prospects: 0, calls: 0, replies: 0, meetings: 0, partners: 0, archive: 0, all: 0, clients: 0, campuses: 0 };
  // Total pending calls across ALL days (Calls-tab denominator); counts.calls
  // stays "due today" (the numerator).
  let callsTotal = 0;

  // Single status scan in scope. v9.0 Phase 4: also pull viewed_at so
  // we can split totals into unread/total per tab in one pass. kind lets
  // us split research-status rows by audience (provider vs partner) for the
  // audience-composite counts below.
  let q = db.from("student_outreach").select("id, status, viewed_at, kind");
  if (filters.campusId) q = q.eq("campus_id", filters.campusId);
  if (filters.type) q = q.eq("stakeholder_type", filters.type);
  const { data: scan } = await q;

  const research = new Set<string>(RESEARCH_STATUSES);
  const replies = new Set<string>(REPLIES_STATUSES);
  const partner = new Set<string>(PARTNER_ALL);

  let inProgressIds: string[] = [];
  const unreadIds = new Set<string>();
  // Research-status rows split by audience so the providers / partner_book
  // composite counts match exactly what each tab renders (providers shows
  // kind=provider research rows; partner_book shows kind!=provider).
  let providerResearch = 0;
  let providerResearchUnread = 0;
  let partnerResearch = 0;
  let partnerResearchUnread = 0;
  for (const row of (scan ?? []) as Array<{ id: string; status: string; viewed_at: string | null; kind: string | null }>) {
    const isUnread = row.viewed_at == null;
    if (isUnread) unreadIds.add(row.id);
    counts.all++;
    if (isUnread) unread.all++;
    if (research.has(row.status)) {
      counts.prospects++;
      if (isUnread) unread.prospects++;
      if (row.kind === "provider") {
        providerResearch++;
        if (isUnread) providerResearchUnread++;
      } else {
        partnerResearch++;
        if (isUnread) partnerResearchUnread++;
      }
    } else if (partner.has(row.status)) {
      counts.partners++;
      if (isUnread) unread.partners++;
    } else if (replies.has(row.status)) {
      // v9 final: replies count is replaced below with per-recipient
      // fan-out. We still collect inProgressIds for the fan-out query.
      inProgressIds.push(row.id);
    }
    if (row.status === "no_response_closed") {
      counts.archive++;
      if (isUnread) unread.archive++;
    }
  }

  // v9 final: Replies tab fans out one card per email-sent recipient
  // (General Contact + each Specific Contact each get their own
  // operational card). Count distinct (outreach, recipient) pairs
  // from email_sent touchpoints so the tab fraction matches the
  // rendered cards. Outreach rows with no email_sent touchpoints
  // yet (just transitioned to outreach_sent but Day 0 hasn't fired
  // OR legacy rows) fall back to 1 card per outreach.
  const repliesRecipientCountByOutreach = new Map<string, number>();
  if (inProgressIds.length > 0) {
    const { data: emailSentRows } = await db
      .from("student_outreach_touchpoints")
      .select("outreach_id, contact_id, payload")
      .eq("touchpoint_type", "email_sent")
      .in("outreach_id", inProgressIds);
    const recipientsByOutreach = new Map<string, Set<string>>();
    for (const tp of (emailSentRows ?? []) as Array<{
      outreach_id: string;
      contact_id: string | null;
      payload: Record<string, unknown> | null;
    }>) {
      const key = tp.contact_id ?? "__general__";
      let set = recipientsByOutreach.get(tp.outreach_id);
      if (!set) {
        set = new Set();
        recipientsByOutreach.set(tp.outreach_id, set);
      }
      set.add(key);
    }
    for (const id of inProgressIds) {
      const n = recipientsByOutreach.get(id)?.size ?? 1;
      repliesRecipientCountByOutreach.set(id, n);
      counts.replies += n;
      if (unreadIds.has(id)) unread.replies += n;
    }
  }

  // Calls counts: one query for ALL pending call tasks, then split into
  // "due today" (numerator, counts.calls) and "total queued" (denominator,
  // callsTotal). Both count TASKS — one card per task — scoped to the current
  // filters, partner statuses excluded at the SQL level.
  let callQ = db
    .from("student_outreach_tasks")
    .select("outreach_id, due_at, student_outreach!inner(campus_id, stakeholder_type)")
    .eq("status", "pending")
    .eq("task_type", "outreach_followup_call")
    .not("student_outreach.status", "in", `(${PARTNER_ALL.map((s) => `"${s}"`).join(",")})`);
  if (filters.campusId) callQ = callQ.eq("student_outreach.campus_id", filters.campusId);
  if (filters.type) callQ = callQ.eq("student_outreach.stakeholder_type", filters.type);
  const { data: callTasks } = await callQ;
  const nowIsoForCalls = new Date().toISOString();
  const allCallTasks = (callTasks ?? []) as Array<{ outreach_id: string; due_at: string }>;
  const dueTodayCallTasks = allCallTasks.filter((t) => t.due_at <= nowIsoForCalls);
  counts.calls = dueTodayCallTasks.length; // numerator: due today / overdue
  callsTotal = allCallTasks.length; // denominator: all queued, every day
  // Unread = due-today tasks whose outreach row is unread. viewed_at lives on
  // student_outreach, so all per-recipient cards on a row share that state.
  for (const t of dueTodayCallTasks) if (unreadIds.has(t.outreach_id)) unread.calls++;

  // v9.0 Phase 6.5: Partners count for the In Basket tab is task-driven
  // (smart-hide when no partners have open tasks). Override the
  // status-based partner count from the initial pass with this
  // task-filtered count. The Stakeholders → Partners reference page
  // uses a separate endpoint (/api/admin/medjobs/partners) that
  // returns ALL active_partner non-provider rows regardless of tasks.
  let partnerTaskQ = db
    .from("student_outreach_tasks")
    .select("outreach_id, student_outreach!inner(campus_id, stakeholder_type, status, kind)")
    .eq("status", "pending")
    .eq("student_outreach.status", "active_partner")
    .neq("student_outreach.kind", "provider");
  if (filters.campusId) partnerTaskQ = partnerTaskQ.eq("student_outreach.campus_id", filters.campusId);
  if (filters.type) partnerTaskQ = partnerTaskQ.eq("student_outreach.stakeholder_type", filters.type);
  const { data: partnerTasks } = await partnerTaskQ;
  const partnerWithTaskSet = new Set<string>();
  for (const t of (partnerTasks ?? []) as Array<{ outreach_id: string }>) {
    partnerWithTaskSet.add(t.outreach_id);
  }
  counts.partners = partnerWithTaskSet.size;
  unread.partners = 0;
  for (const id of partnerWithTaskSet) if (unreadIds.has(id)) unread.partners++;

  // Meetings count: among in-progress rows, those whose most-recent
  // meeting-related touchpoint is in_flight or scheduled. Also: rows
  // with state=scheduled are dropped from the Replies tab in v8.2, so
  // we subtract them from the replies count here.
  // v8.10.6: stale-derived rows are dropped from Replies and added to
  // Archive — same rebalancing pattern as scheduled meetings.
  // v9 final: Replies now fans per-recipient, so each scheduled /
  // stale outreach removes N replies cards (not 1) — use the
  // per-outreach recipient count from the fan-out pass above.
  if (inProgressIds.length > 0) {
    const { meetings, scheduled, stale, meetingIds, scheduledIds, staleIds } =
      await countMeetingsAmongRows(db, inProgressIds);
    counts.meetings = meetings;
    counts.archive += stale;
    const replyCardsFor = (id: string) =>
      repliesRecipientCountByOutreach.get(id) ?? 1;
    for (const id of meetingIds) if (unreadIds.has(id)) unread.meetings++;
    for (const id of scheduledIds) {
      const n = replyCardsFor(id);
      counts.replies = Math.max(0, counts.replies - n);
      if (unreadIds.has(id)) {
        unread.replies = Math.max(0, unread.replies - n);
      }
    }
    for (const id of staleIds) {
      const n = replyCardsFor(id);
      counts.replies = Math.max(0, counts.replies - n);
      if (unreadIds.has(id)) {
        unread.replies = Math.max(0, unread.replies - n);
        unread.archive++;
      }
    }
  }

  // v9.0 Phase 7 Commit O: In Basket Clients/Candidates/Sites tab
  // counts. Total = distinct entities with ≥1 pending task. Unread =
  // subset whose latest pending task was created after the entity's
  // last viewed_at (or never viewed). Same predicate as
  // sidebar-counts so the two surfaces stay aligned.
  //
  // Prospect generation: the Prospects tab content is the union of
  // research cards (campuses with research_complete=false) and virtual
  // provider prospects (catchment providers minus clients minus
  // already-materialized). Both buckets contribute to counts.prospects
  // so the badge matches what renders inside the tab. countProspectGeneration
  // is the shared implementation also used by /api/admin/medjobs/sidebar-counts.
  const [
    { data: clientTaskRows },
    { data: candidateTaskRows },
    { data: siteTaskRows },
    prospectGen,
  ] = await Promise.all([
    db
      .from("business_profile_tasks")
      .select("business_profile_id, created_at")
      .eq("status", "pending")
      .eq("kind", "client"),
    db
      .from("business_profile_tasks")
      .select("business_profile_id, created_at")
      .eq("status", "pending")
      .eq("kind", "candidate"),
    db
      .from("site_tasks")
      .select("campus_id, created_at")
      .eq("status", "pending"),
    countProspectGeneration(db, { campusId: filters.campusId }),
  ]);

  counts.prospects += prospectGen.total;
  unread.prospects += prospectGen.unread;

  const latestClientTaskByProfile = new Map<string, string>();
  for (const r of (clientTaskRows ?? []) as Array<{
    business_profile_id: string;
    created_at: string;
  }>) {
    const cur = latestClientTaskByProfile.get(r.business_profile_id);
    if (!cur || r.created_at > cur)
      latestClientTaskByProfile.set(r.business_profile_id, r.created_at);
  }

  const latestCandidateTaskByProfile = new Map<string, string>();
  for (const r of (candidateTaskRows ?? []) as Array<{
    business_profile_id: string;
    created_at: string;
  }>) {
    const cur = latestCandidateTaskByProfile.get(r.business_profile_id);
    if (!cur || r.created_at > cur)
      latestCandidateTaskByProfile.set(r.business_profile_id, r.created_at);
  }

  const latestSiteTaskByCampus = new Map<string, string>();
  for (const r of (siteTaskRows ?? []) as Array<{
    campus_id: string;
    created_at: string;
  }>) {
    const cur = latestSiteTaskByCampus.get(r.campus_id);
    if (!cur || r.created_at > cur)
      latestSiteTaskByCampus.set(r.campus_id, r.created_at);
  }

  // Fetch entity viewed_at for the entities-with-tasks subset to
  // compute unread.
  const clientIds = Array.from(latestClientTaskByProfile.keys());
  const candidateIds = Array.from(latestCandidateTaskByProfile.keys());
  const siteIds = Array.from(latestSiteTaskByCampus.keys());

  // v9.0 Phase 7 Commit Q: filter each entity-task set to entities that
  // actually pass the dedicated page's validity check. Without this,
  // an orphan task on an inactive/deleted entity inflates the queue
  // count above what the sidebar + dedicated page render — exactly
  // the "Sites 1/1 in tab but 0 cards on the page" mismatch.
  //
  //   Sites      → student_outreach_campuses with is_active=true
  //   Clients    → business_profiles in (organization|caregiver) with
  //                T&C accepted OR active subscription
  //   Candidates → business_profiles type=student, is_active=true,
  //                metadata.application_completed=true
  const [
    { data: clientProfiles },
    { data: candidateProfiles },
    { data: campusViews },
  ] = await Promise.all([
    clientIds.length > 0
      ? db
          .from("business_profiles")
          .select("id, metadata")
          .in("id", clientIds)
          .in("type", ["organization", "caregiver"])
      : Promise.resolve({ data: [] as Array<{ id: string; metadata: Record<string, unknown> | null }> }),
    candidateIds.length > 0
      ? db
          .from("business_profiles")
          .select("id, metadata")
          .in("id", candidateIds)
          .eq("type", "student")
          .eq("is_active", true)
          .contains("metadata", { application_completed: true })
      : Promise.resolve({ data: [] as Array<{ id: string; metadata: Record<string, unknown> | null }> }),
    siteIds.length > 0
      ? db
          .from("student_outreach_campuses")
          .select("id, viewed_at")
          .in("id", siteIds)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as Array<{ id: string; viewed_at: string | null }> }),
  ]);

  // Client validity check: T&C accepted in last 90 days OR active
  // subscription. Mirrors getClientStatus() in lib/medjobs/clients.ts
  // — duplicating the predicate here avoids a transitive import for a
  // 5-line check.
  const PILOT_MS = 90 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const isValidClient = (meta: Record<string, unknown> | null): boolean => {
    if (!meta) return false;
    if (meta.medjobs_subscription_active === true) return true;
    const accepted = meta.interview_terms_accepted_at;
    if (typeof accepted !== "string") return false;
    const t = new Date(accepted).getTime();
    return !isNaN(t) && nowMs - t < PILOT_MS;
  };

  const validClientIds = new Set<string>();
  const clientViewedAt = new Map<string, string | null>();
  for (const p of (clientProfiles ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>) {
    if (!isValidClient(p.metadata)) continue;
    validClientIds.add(p.id);
    const v = p.metadata?.admin_viewed_at;
    clientViewedAt.set(p.id, typeof v === "string" ? v : null);
  }

  const validCandidateIds = new Set<string>();
  const candidateViewedAt = new Map<string, string | null>();
  for (const p of (candidateProfiles ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>) {
    validCandidateIds.add(p.id);
    const v = p.metadata?.admin_viewed_at;
    candidateViewedAt.set(p.id, typeof v === "string" ? v : null);
  }

  const validSiteIds = new Set<string>();
  const siteViewedAt = new Map<string, string | null>();
  for (const c of (campusViews ?? []) as Array<{ id: string; viewed_at: string | null }>) {
    validSiteIds.add(c.id);
    siteViewedAt.set(c.id, c.viewed_at);
  }

  // entityUnread predicate: latest pending task created after viewed_at,
  // or viewed_at is null. Mirrors sidebar-counts.isEntityUnread.
  const entityUnread = (
    viewed: string | null | undefined,
    latestTask: string | null,
  ): boolean => {
    if (!latestTask) return false;
    if (!viewed) return true;
    return latestTask > viewed;
  };

  let clientTotal = 0;
  let clientUnread = 0;
  for (const [id, latest] of latestClientTaskByProfile.entries()) {
    if (!validClientIds.has(id)) continue;
    clientTotal += 1;
    if (entityUnread(clientViewedAt.get(id) ?? null, latest)) clientUnread += 1;
  }

  let candidateTotal = 0;
  let candidateUnread = 0;
  for (const [id, latest] of latestCandidateTaskByProfile.entries()) {
    if (!validCandidateIds.has(id)) continue;
    candidateTotal += 1;
    if (entityUnread(candidateViewedAt.get(id) ?? null, latest)) candidateUnread += 1;
  }

  let siteTotal = 0;
  let siteUnread = 0;
  for (const [id, latest] of latestSiteTaskByCampus.entries()) {
    if (!validSiteIds.has(id)) continue;
    siteTotal += 1;
    if (entityUnread(siteViewedAt.get(id) ?? null, latest)) siteUnread += 1;
  }

  counts.clients = clientTotal;
  unread.clients = clientUnread;

  counts.candidates = candidateTotal;
  unread.candidates = candidateUnread;

  counts.sites = siteTotal;
  unread.sites = siteUnread;
  // Legacy 'campuses' alias retained for queue-endpoint defenders.
  counts.campuses = counts.sites;
  unread.campuses = siteUnread;

  // Audience-composite counts for the In Basket primary bar. Each audience
  // tab folds its prospecting + active-entity work into one number, matching
  // exactly what the tab renders:
  //   providers    = virtual provider prospects + materialized provider
  //                  research rows + clients-with-task
  //   partner_book = partner research rows + research cards +
  //                  active-partners-with-task
  counts.providers =
    prospectGen.providerProspects.total + providerResearch + (counts.clients ?? 0);
  unread.providers =
    prospectGen.providerProspects.unread + providerResearchUnread + (unread.clients ?? 0);
  counts.partner_book =
    partnerResearch + prospectGen.researchCards.total + counts.partners;
  unread.partner_book =
    partnerResearchUnread + prospectGen.researchCards.unread + unread.partners;

  return { counts, unread, callsTotal };
}

/**
 * For each row, derive meeting + replies state and return:
 *   - meetings: in_flight + scheduled (Meetings-tab membership count)
 *   - scheduled: scheduled-only (subtracted from Replies count, since
 *                booked rows live only in Meetings now)
 *   - stale: rows whose derived replies-state is "stale" (subtracted
 *            from Replies count, added to Archive count in v8.10.6)
 */
async function countMeetingsAmongRows(
  db: DB,
  ids: string[],
): Promise<{
  meetings: number;
  scheduled: number;
  stale: number;
  meetingIds: string[];
  scheduledIds: string[];
  staleIds: string[];
}> {
  const tpsByRow = await fetchTouchpointsByRow(db, ids);
  const { data: pendingEmailRows } = await db
    .from("student_outreach_tasks")
    .select("outreach_id")
    .eq("status", "pending")
    .eq("task_type", "outreach_email_send")
    .in("outreach_id", ids);
  const hasPendingEmail = new Set<string>(
    ((pendingEmailRows ?? []) as Array<{ outreach_id: string }>).map((r) => r.outreach_id),
  );
  let meetings = 0;
  let scheduled = 0;
  let stale = 0;
  const meetingIds: string[] = [];
  const scheduledIds: string[] = [];
  const staleIds: string[] = [];
  for (const id of ids) {
    const state = deriveStateFromTouchpoints(tpsByRow.get(id) ?? []);
    if (state.meeting_state === "scheduled") {
      meetings++;
      meetingIds.push(id);
      scheduled++;
      scheduledIds.push(id);
    } else if (state.meeting_state === "in_flight") {
      meetings++;
      meetingIds.push(id);
    }
    if (deriveRepliesState(state, hasPendingEmail.has(id)) === "stale") {
      stale++;
      staleIds.push(id);
    }
  }
  return { meetings, scheduled, stale, meetingIds, scheduledIds, staleIds };
}

// ── Per-tab row ID fetchers ─────────────────────────────────────────────

async function fetchRowIdsForTab(
  db: DB,
  opts: {
    tab: string;
    campusId: string | null;
    type: StakeholderType | null;
    search: string;
    showClosed: boolean;
    page: number;
    pageSize: number;
  },
): Promise<string[]> {
  const { tab, campusId, type, search, showClosed, page, pageSize } = opts;

  // v9.0 Phase 7 Commit K: when showClosed is true, dedicated entity
  // pages get the active rows for this tab plus closed-status history
  // so admins can see completed/archived items inline. Active rows
  // come back first via the per-tab fetcher; closed rows are appended
  // as a second query so they sort below active in the rendered list.
  switch (tab) {
    case "prospects": {
      // v9 final: prospects sort by created_at desc so newly-added
      // rows stay at the top. Drawer opens / inline edits don't
      // bump the row's position — admins can rely on the order to
      // be stable during research.
      const active = await idsByStatus(db, RESEARCH_STATUSES, { campusId, type, search, page, pageSize }, "created_at");
      if (!showClosed) return active;
      const closed = await idsByStatus(db, CLOSED_STATUSES, { campusId, type, search, page, pageSize }, "created_at");
      return [...active, ...closed];
    }
    case "candidates":
    case "outbound":
    case "emails_sent":
    case "signups":
      // v8.10.33 / v8.10.37: placeholder slots — UI shows "Coming soon"
      // so the server returns no rows for these views. Real datasets ship
      // later, each with its own query strategy.
      return [];
    case "partners": {
      // v9.0 Phase 6.5: In Basket Partners tab surfaces only active
      // partners (kind != 'provider') with a pending task. The
      // dedicated Partners entity page shows full inventory including
      // closed partners — handled separately via /api/admin/medjobs/
      // partners. The queue endpoint stays task-driven.
      return await idsByPartnersWithTasks(db, { campusId, type, search, page, pageSize });
    }
    case "all": {
      const inc = showClosed
        ? [...RESEARCH_STATUSES, ...REPLIES_STATUSES, ...PARTNER_ALL, ...CLOSED_STATUSES]
        : [...RESEARCH_STATUSES, ...REPLIES_STATUSES, ...PARTNER_ALL];
      // v9 final: stable sort — created_at desc keeps card position
      // fixed regardless of incidental drawer activity. Matches the
      // Prospects tab.
      return await idsByStatus(db, inc as Status[], { campusId, type, search, page, pageSize }, "created_at");
    }
    case "replies": {
      // v9 final: stable sort — created_at desc so opening a drawer
      // or saving an inline edit doesn't shuffle the list. Earlier
      // last_edited_at desc moved cards on every action which
      // destabilized the admin's mental map of "what was where".
      const active = await idsByStatus(db, REPLIES_STATUSES, { campusId, type, search, page, pageSize }, "created_at");
      if (!showClosed) return active;
      const closed = await idsByStatus(db, CLOSED_STATUSES, { campusId, type, search, page, pageSize }, "created_at");
      return [...active, ...closed];
    }
    case "calls": {
      // Calls is task-driven (rows with a pending phone task). The
      // dedicated entity page also includes recently-logged-call
      // touchpoints — but the queue endpoint stays focused on the
      // due-task view. Closed history on Calls means rows whose
      // outreach already closed; we append them when showClosed.
      const active = await idsByCallsDue(db, { campusId, type, search, page, pageSize });
      if (!showClosed) return active;
      const closed = await idsByStatus(db, CLOSED_STATUSES, { campusId, type, search, page, pageSize });
      return [...active, ...closed];
    }
    case "meetings": {
      const active = await idsByMeetings(db, { campusId, type, search, page, pageSize });
      if (!showClosed) return active;
      const closed = await idsByStatus(db, CLOSED_STATUSES, { campusId, type, search, page, pageSize });
      return [...active, ...closed];
    }
    case "archive":
      return await idsByArchive(db, { campusId, type, search, page, pageSize });
    default:
      return [];
  }
}

/**
 * Archive: stakeholders where outreach completed without engagement.
 * Two sources:
 *   1. Rows already at status `no_response_closed` — cron's
 *      end-of-cadence sweep flipped them.
 *   2. Active `outreach_sent` rows whose derived replies-state is
 *      "stale" (cadence still running but past STALE_DAYS with no
 *      reply) — these belong in Archive UX-side until the cron
 *      sweep formally closes them.
 *
 * Terminal states (not_interested / DNC / wrong_contact / redirected)
 * are deliberately NOT included — they live in All only as historical
 * records.
 */
async function idsByArchive(db: DB, opts: QueryOpts): Promise<string[]> {
  // First: status-closed rows.
  let closedQ = db
    .from("student_outreach")
    .select("id")
    .in("status", ARCHIVE_STATUSES)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (opts.campusId) closedQ = closedQ.eq("campus_id", opts.campusId);
  if (opts.type) closedQ = closedQ.eq("stakeholder_type", opts.type);
  if (opts.search) closedQ = closedQ.ilike("organization_name", `%${opts.search}%`);
  const { data: closedData } = await closedQ;
  const closedIds = ((closedData ?? []) as Array<{ id: string }>).map((r) => r.id);

  // Then: outreach_sent rows that derive to stale.
  let activeQ = db
    .from("student_outreach")
    .select("id")
    .eq("status", "outreach_sent")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (opts.campusId) activeQ = activeQ.eq("campus_id", opts.campusId);
  if (opts.type) activeQ = activeQ.eq("stakeholder_type", opts.type);
  if (opts.search) activeQ = activeQ.ilike("organization_name", `%${opts.search}%`);
  const { data: activeData } = await activeQ;
  const activeIds = ((activeData ?? []) as Array<{ id: string }>).map((r) => r.id);

  // Filter active to stale-derived only. Reuse countMeetingsAmongRows'
  // touchpoint fetch + replies-state derivation, but inline a smaller
  // version to skip the meetings counting work.
  const tpsByRow = await fetchTouchpointsByRow(db, activeIds);
  const { data: pendingEmailRows } = await db
    .from("student_outreach_tasks")
    .select("outreach_id")
    .eq("status", "pending")
    .eq("task_type", "outreach_email_send")
    .in("outreach_id", activeIds);
  const hasPendingEmail = new Set<string>(
    ((pendingEmailRows ?? []) as Array<{ outreach_id: string }>).map((r) => r.outreach_id),
  );
  const staleIds = activeIds.filter((id) => {
    const state = deriveStateFromTouchpoints(tpsByRow.get(id) ?? []);
    return deriveRepliesState(state, hasPendingEmail.has(id)) === "stale";
  });

  // Merge and paginate.
  const all = [...closedIds, ...staleIds];
  const start = opts.page * opts.pageSize;
  return all.slice(start, start + opts.pageSize);
}

interface QueryOpts {
  campusId: string | null;
  type: StakeholderType | null;
  search: string;
  page: number;
  pageSize: number;
}

async function idsByStatus(
  db: DB,
  statuses: Status[],
  opts: QueryOpts,
  /** v9 final: ordering column. Defaults to last_edited_at desc
   *  (most-recently-worked first — useful for Replies/Calls). The
   *  Prospects tab passes "created_at" so newly-added rows stay at
   *  the top and existing rows don't move when admin opens the
   *  drawer or saves a research edit. */
  orderColumn: "last_edited_at" | "created_at" = "last_edited_at",
): Promise<string[]> {
  let q = db
    .from("student_outreach")
    .select("id")
    .in("status", statuses)
    .order(orderColumn, { ascending: false })
    // v9 final: deterministic tiebreaker — without a secondary sort
    // Postgres returns ties in arbitrary order, so refetching can
    // shuffle rows that share the primary key value (or even
    // ones whose timestamps differ by microseconds the JS layer
    // can't distinguish). id is stable across refetches and
    // independent of read/unread state.
    .order("id", { ascending: true })
    .range(opts.page * opts.pageSize, opts.page * opts.pageSize + opts.pageSize - 1);
  if (opts.campusId) q = q.eq("campus_id", opts.campusId);
  if (opts.type) q = q.eq("stakeholder_type", opts.type);
  if (opts.search) q = q.ilike("organization_name", `%${opts.search}%`);
  const { data } = await q;
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}


/**
 * v9.0 Phase 6.5: active_partner stakeholders that have at least one
 * pending task. Powers the In Basket Partners tab — smart-hidden when
 * no partners have open tasks.
 *
 * The Stakeholders → Partners page (separate endpoint) returns ALL
 * active_partner kind!='provider' rows, with or without tasks.
 *
 * Same join shape as idsByCallsDue: pull pending tasks where the
 * stakeholder is active_partner + non-provider, dedupe on outreach_id,
 * return up to pageSize unique stakeholder ids.
 */
async function idsByPartnersWithTasks(db: DB, opts: QueryOpts): Promise<string[]> {
  let q = db
    .from("student_outreach_tasks")
    .select("outreach_id, due_at, student_outreach!inner(campus_id, stakeholder_type, organization_name, status, kind)")
    .eq("status", "pending")
    .eq("student_outreach.status", "active_partner")
    .neq("student_outreach.kind", "provider")
    .order("due_at", { ascending: true })
    .order("id", { ascending: true });
  if (opts.campusId) q = q.eq("student_outreach.campus_id", opts.campusId);
  if (opts.type) q = q.eq("student_outreach.stakeholder_type", opts.type);
  if (opts.search) q = q.ilike("student_outreach.organization_name", `%${opts.search}%`);
  const { data } = await q;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const t of (data ?? []) as Array<{ outreach_id: string }>) {
    if (seen.has(t.outreach_id)) continue;
    seen.add(t.outreach_id);
    ids.push(t.outreach_id);
    if (ids.length >= opts.pageSize) break;
  }
  return ids;
}

async function idsByCallsDue(db: DB, opts: QueryOpts): Promise<string[]> {
  // Calls tab surfaces ALL queued calls, however far out (no date window) —
  // the client groups them into per-day sections (Today, Tomorrow, …). Past-due
  // rows are included (overdue calls fall into Today). The pageSize cap below
  // is the only bound (a safety valve, ordered soonest-first).
  let q = db
    .from("student_outreach_tasks")
    .select("outreach_id, due_at, student_outreach!inner(campus_id, stakeholder_type, organization_name)")
    .eq("status", "pending")
    .eq("task_type", "outreach_followup_call")
    .not("student_outreach.status", "in", `(${PARTNER_ALL.map((s) => `"${s}"`).join(",")})`)
    .order("due_at", { ascending: true })
    .order("id", { ascending: true });
  if (opts.campusId) q = q.eq("student_outreach.campus_id", opts.campusId);
  if (opts.type) q = q.eq("student_outreach.stakeholder_type", opts.type);
  if (opts.search) q = q.ilike("student_outreach.organization_name", `%${opts.search}%`);
  const { data } = await q;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const t of (data ?? []) as Array<{ outreach_id: string }>) {
    if (seen.has(t.outreach_id)) continue;
    seen.add(t.outreach_id);
    ids.push(t.outreach_id);
    if (ids.length >= opts.pageSize) break;
  }
  return ids;
}

async function idsByMeetings(db: DB, opts: QueryOpts): Promise<string[]> {
  // First, get candidate in-progress rows in scope.
  let baseQ = db
    .from("student_outreach")
    .select("id")
    .in("status", REPLIES_STATUSES);
  if (opts.campusId) baseQ = baseQ.eq("campus_id", opts.campusId);
  if (opts.type) baseQ = baseQ.eq("stakeholder_type", opts.type);
  if (opts.search) baseQ = baseQ.ilike("organization_name", `%${opts.search}%`);
  const { data: candidates } = await baseQ;
  const candidateIds = ((candidates ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (candidateIds.length === 0) return [];

  // Determine meeting state per row using the shared v8 derivation.
  const tpsByRow = await fetchTouchpointsByRow(db, candidateIds);
  const filtered: string[] = [];
  for (const id of candidateIds) {
    const state = deriveStateFromTouchpoints(tpsByRow.get(id) ?? []);
    if (state.meeting_state === "in_flight" || state.meeting_state === "scheduled") filtered.push(id);
    if (filtered.length >= opts.pageSize) break;
  }
  return filtered;
}

async function fetchTouchpointsByRow(db: DB, ids: string[]): Promise<Map<string, TouchpointRow[]>> {
  const { data } = await db
    .from("student_outreach_touchpoints")
    .select("outreach_id, touchpoint_type, payload, notes, created_at, created_by")
    .in("outreach_id", ids)
    .order("created_at", { ascending: false });
  const out = new Map<string, TouchpointRow[]>();
  for (const tp of (data ?? []) as TouchpointRow[]) {
    let list = out.get(tp.outreach_id);
    if (!list) {
      list = [];
      out.set(tp.outreach_id, list);
    }
    list.push(tp);
  }
  return out;
}

// ── Hydrate rows with all indicators ────────────────────────────────────

async function hydrateRows(
  db: DB,
  ids: string[],
  tab: string,
  campusMap: Map<string, Campus>,
): Promise<TabRow[]> {
  // Fetch outreach rows.
  const { data: rowsRaw } = await db
    .from("student_outreach")
    .select("*")
    .in("id", ids);
  const rowMap = new Map<string, OutreachRow>();
  for (const r of (rowsRaw ?? []) as Array<OutreachRow & { stakeholder_type: StakeholderType | null; kind?: string }>) {
    // v9.0 Phase 2 Tier 3.5: kind='provider' rows have stakeholder_type
    // NULL in the DB. Coerce to 'student_org' here so the type stays
    // non-null for the drawer's hundreds of call sites; kind-aware
    // surfaces (StakeholderCard) read `kind` before stakeholder_type.
    if (r.stakeholder_type == null) {
      (r as OutreachRow).stakeholder_type = "student_org";
    }
    rowMap.set(r.id, r as OutreachRow);
  }
  // Preserve order from ids.
  const orderedRows = ids.map((id) => rowMap.get(id)).filter((r): r is OutreachRow => Boolean(r));

  // v9 final: fetch business_profiles.slug for kind='provider' rows so
  // the row card overflow can deep-link to the public directory page
  // without a per-card extra fetch. One batch query keyed by the
  // collected provider_business_profile_id values.
  const providerSlugByOutreach = new Map<string, string>();
  const bpIds = orderedRows
    .filter((r) => r.kind === "provider" && r.provider_business_profile_id)
    .map((r) => r.provider_business_profile_id!);
  if (bpIds.length > 0) {
    const { data: bpSlugs } = await db
      .from("business_profiles")
      .select("id, slug")
      .in("id", bpIds);
    const slugById = new Map<string, string>();
    for (const b of (bpSlugs ?? []) as Array<{ id: string; slug: string | null }>) {
      if (b.slug) slugById.set(b.id, b.slug);
    }
    for (const r of orderedRows) {
      if (r.kind === "provider" && r.provider_business_profile_id) {
        const slug = slugById.get(r.provider_business_profile_id);
        if (slug) providerSlugByOutreach.set(r.id, slug);
      }
    }
  }

  if (orderedRows.length === 0) return [];

  // Parallel hydration: contacts + tasks + touchpoints.
  const [contactsRes, tasksRes, touchpointsRes] = await Promise.all([
    db
      .from("student_outreach_contacts")
      .select("outreach_id, name, title, first_name, last_name, role, phone, is_primary, status, created_at")
      .in("outreach_id", ids)
      .eq("status", "active")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    db
      .from("student_outreach_tasks")
      .select("id, outreach_id, task_type, due_at, payload, status")
      .in("outreach_id", ids)
      .eq("status", "pending"),
    db
      .from("student_outreach_touchpoints")
      .select("outreach_id, contact_id, touchpoint_type, payload, notes, created_at, created_by")
      .in("outreach_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  // Primary contact per row. v8.9: derive a display name that honors the
  // optional title — "Dr. Linda Park" instead of just "Linda Park" — so
  // cards and tab rows match the drawer header. v8.10: also surfaces role
  // for the card subline (President / Department Chair / etc.).
  const primaryByOutreach = new Map<
    string,
    { name: string; phone: string | null; role: string | null }
  >();
  for (const c of (contactsRes.data ?? []) as Array<{
    outreach_id: string;
    name: string;
    title: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    phone: string | null;
  }>) {
    if (primaryByOutreach.has(c.outreach_id)) continue;
    // Shared display logic: `title` doubles as the role in the add-contact UI,
    // so displayContactName only prepends it when it's a real honorific — the
    // person's name leads, the role goes to `role`. Keeps card titles in sync
    // with the drawer header.
    primaryByOutreach.set(c.outreach_id, {
      name: displayContactName(c) ?? c.name,
      phone: c.phone,
      role: displayContactRole(c),
    });
  }

  // Custom-task indicator + due-call task + pending-email-task indicator (for stale derivation)
  // + earliest pending task per row (for the Partners-tab "Next step" pill).
  const customTaskByOutreach = new Map<string, string>();
  const dueCallTaskByOutreach = new Map<
    string,
    { id: string; due_at: string; cadence_day: number | null }
  >();
  // v9 Phase 9: per-recipient call tasks expand the Calls tab card —
  // a single outreach row can have N pending call tasks (one per
  // callable recipient). v9 final: the Calls tab now emits one TabRow
  // PER due task (General Contact + each Specific Contact get their
  // own ops card) instead of consolidating into one row with a
  // recipients subline. dueCallRecipientsByOutreach stays populated
  // for legacy callers but the Calls renderer uses the per-task list.
  const dueCallRecipientsByOutreach = new Map<string, string[]>();
  /** v9 final: every due call task. Calls tab fans the rows out across
   *  this list; non-Calls tabs ignore it.
   *  v10 Bullet 7 (2026-06-04): now also includes upcoming call tasks
   *  (any pending outreach_followup_call regardless of due_at) so the
   *  Calls tab can render both Today's Calls + Upcoming sections.
   *  `cadence_day` from payload.day powers the per-row purpose hint. */
  interface DueCallTaskExpanded {
    task_id: string;
    outreach_id: string;
    due_at: string;
    cadence_day: number | null;
    recipient_name: string | null;
    recipient_phone: string | null;
    recipient_role: string | null;
    recipient_kind: "general" | "specific" | null;
  }
  const dueCallTasks: DueCallTaskExpanded[] = [];
  const hasPendingEmail = new Set<string>();
  const hasPendingJobBoard = new Set<string>();
  const earliestTaskByOutreach = new Map<string, { task_type: string; due_at: string; payload: Record<string, unknown> | null }>();
  const nowIso = new Date().toISOString();
  for (const t of (tasksRes.data ?? []) as Array<{
    id: string;
    outreach_id: string;
    task_type: string;
    due_at: string;
    payload: Record<string, unknown> | null;
  }>) {
    if (
      t.task_type === "manual_followup" &&
      t.payload?.reason === "custom" &&
      !customTaskByOutreach.has(t.outreach_id)
    ) {
      customTaskByOutreach.set(t.outreach_id, String(t.payload.notes ?? t.payload.description ?? "Custom task"));
    }
    if (t.task_type === "outreach_followup_call") {
      const name =
        typeof t.payload?.recipient_name === "string"
          ? (t.payload.recipient_name as string)
          : null;
      const phone =
        typeof t.payload?.recipient_phone === "string"
          ? (t.payload.recipient_phone as string)
          : null;
      const role =
        typeof t.payload?.recipient_role === "string"
          ? (t.payload.recipient_role as string)
          : null;
      const kindRaw =
        typeof t.payload?.recipient_kind === "string"
          ? (t.payload.recipient_kind as string)
          : null;
      const kind: "general" | "specific" | null =
        kindRaw === "general" || kindRaw === "specific" ? kindRaw : null;
      const cadenceDay =
        typeof t.payload?.day === "number"
          ? (t.payload.day as number)
          : null;
      // v10 Bullet 7: include both past-due AND upcoming so the Calls
      // tab can render Today's Calls + Upcoming sections client-side.
      dueCallTasks.push({
        task_id: t.id,
        outreach_id: t.outreach_id,
        due_at: t.due_at,
        cadence_day: cadenceDay,
        recipient_name: name,
        recipient_phone: phone,
        recipient_role: role,
        recipient_kind: kind,
      });
      // Legacy by-outreach maps still populated so non-Calls tabs that
      // peek at due_call_task continue to work. Only the SOONEST (or
      // soonest past-due) wins — preserves the legacy "one task per row"
      // surface for non-Calls reads.
      const existing = dueCallTaskByOutreach.get(t.outreach_id);
      if (!existing || t.due_at < existing.due_at) {
        dueCallTaskByOutreach.set(t.outreach_id, {
          id: t.id,
          due_at: t.due_at,
          cadence_day: cadenceDay,
        });
      }
      if (t.due_at <= nowIso) {
        const list = dueCallRecipientsByOutreach.get(t.outreach_id) ?? [];
        if (name && !list.includes(name)) {
          list.push(name);
        }
        dueCallRecipientsByOutreach.set(t.outreach_id, list);
      }
    }
    if (t.task_type === "outreach_email_send") {
      hasPendingEmail.add(t.outreach_id);
    }
    if (t.task_type === "partner_share_update" && t.payload?.reason === "job_board_post") {
      hasPendingJobBoard.add(t.outreach_id);
    }
    const cur = earliestTaskByOutreach.get(t.outreach_id);
    if (!cur || t.due_at < cur.due_at) {
      earliestTaskByOutreach.set(t.outreach_id, {
        task_type: t.task_type,
        due_at: t.due_at,
        payload: t.payload,
      });
    }
  }

  // Group touchpoints per outreach (already DESC from query).
  const tpsByOutreach = new Map<string, TouchpointRow[]>();
  for (const tp of (touchpointsRes.data ?? []) as TouchpointRow[]) {
    let list = tpsByOutreach.get(tp.outreach_id);
    if (!list) {
      list = [];
      tpsByOutreach.set(tp.outreach_id, list);
    }
    list.push(tp);
  }

  // Derive state per row.
  const stateByOutreach = new Map<string, DerivedState>();
  for (const id of ids) {
    stateByOutreach.set(id, deriveStateFromTouchpoints(tpsByOutreach.get(id) ?? []));
  }

  // Build TabRow output.
  // v9 final: Calls tab fans out — one TabRow per pending call task
  // (General Contact + each Specific Contact each get their own ops
  // card). Replies tab fans out the same way — one card per
  // email-sent recipient. Other tabs keep one-row-per-outreach.
  const tasksByOutreach = new Map<string, DueCallTaskExpanded[]>();
  if (tab === "calls") {
    for (const t of dueCallTasks) {
      const list = tasksByOutreach.get(t.outreach_id) ?? [];
      list.push(t);
      tasksByOutreach.set(t.outreach_id, list);
    }
  }

  // v9 final: Replies recipient fan-out from email_sent touchpoints.
  // For each outreach in the replies tab, collect distinct
  // recipients (specific contact_id OR synthetic 'general') with
  // their denormalized display info. Each unique recipient becomes
  // one Replies card scoped to that outreach.
  interface ReplyRecipient {
    contact_id: string | null;
    recipient_kind: "specific" | "general";
    name: string | null;
    email: string | null;
  }
  const replyRecipientsByOutreach = new Map<string, ReplyRecipient[]>();
  if (tab === "replies") {
    for (const id of ids) {
      const tps = tpsByOutreach.get(id) ?? [];
      const seen = new Map<string, ReplyRecipient>();
      for (const tp of tps) {
        // Include repliers/bouncers, not just who we emailed: a provider with
        // no general email is emailed only through a decision maker, whose reply
        // must surface as that person's card — even if the email_sent event was
        // never received (only the reply was).
        if (
          tp.touchpoint_type !== "email_sent" &&
          tp.touchpoint_type !== "email_replied" &&
          tp.touchpoint_type !== "email_bounced"
        )
          continue;
        const tpAny = tp as unknown as {
          contact_id: string | null;
          payload: Record<string, unknown> | null;
        };
        const payload = tpAny.payload ?? {};
        const recipientKind =
          tpAny.contact_id == null ? "general" : "specific";
        const key = tpAny.contact_id ?? "__general__";
        if (seen.has(key)) continue;
        seen.set(key, {
          contact_id: tpAny.contact_id,
          recipient_kind: recipientKind,
          name:
            typeof payload.recipient_name === "string"
              ? (payload.recipient_name as string)
              : null,
          email:
            typeof payload.recipient_email === "string"
              ? (payload.recipient_email as string)
              : null,
        });
      }
      if (seen.size > 0) {
        // v9 final: deterministic recipient order — general first
        // (always anchored to the top of the row's stack), then
        // specific contacts sorted by contact_id. Without this the
        // recipient order tracked "most recent email_sent" which
        // shifted whenever a new Day-N send completed, looking like
        // reordering to admin even though the underlying state was
        // identical.
        const sorted = Array.from(seen.values()).sort((a, b) => {
          if (a.recipient_kind === b.recipient_kind) {
            return (a.contact_id ?? "").localeCompare(b.contact_id ?? "");
          }
          return a.recipient_kind === "general" ? -1 : 1;
        });
        replyRecipientsByOutreach.set(id, sorted);
      }
    }
  }

  const tabRows: TabRow[] = [];
  for (const row of orderedRows) {
    const primary = primaryByOutreach.get(row.id) ?? null;
    const state = stateByOutreach.get(row.id)!;
    const camp = campusMap.get(row.campus_id);
    // v9 final: provider rows on non-fan-out tabs (Prospects /
    // Partners / Archive / All) must title to the organization,
    // never to a Specific Contact. The Provider IS the prospect;
    // Specific Contacts are supporting data inside the drawer.
    // Stakeholder rows keep the existing primary-contact-as-title
    // behavior because their contact often is the addressee.
    const isProvider = row.kind === "provider";
    const orgPrimaryName = isProvider ? null : primary?.name ?? null;
    const orgPrimaryPhone = isProvider ? null : primary?.phone ?? null;
    const orgPrimaryRole = isProvider ? null : primary?.role ?? null;
    // v8.10.6: archive tab also gets a derived replies-state so card
    // can render "Stale · Xd cold" for outreach_sent rows that landed
    // here via stale derivation.
    const repliesState =
      tab === "replies" || tab === "archive"
        ? deriveRepliesState(state, hasPendingEmail.has(row.id))
        : null;
    const earliestTask = earliestTaskByOutreach.get(row.id) ?? null;

    // v10 Bullet 7 (2026-06-04): engagement sub-state derived from the
    // touchpoints we already loaded. Read by the Calls tab for priority
    // sort + per-row "clicked" pill, and by the Emails tab.
    const engagementSubState = computeEngagementSubState(
      row.status,
      tpsByOutreach.get(row.id) ?? [],
    );

    // v10 Bullet 9: surface Smartlead linkage so the Emails tab can
    // deep-link replies into Smartlead's master inbox at the right
    // thread context.
    const smartleadLinkage = computeSmartleadLinkage(
      (row.research_data as Record<string, unknown> | null) ?? null,
    );

    const baseRow = {
      ...row,
      campus_name: camp?.name ?? "(unknown campus)",
      campus_slug: camp?.slug ?? "",
      provider_slug: providerSlugByOutreach.get(row.id) ?? null,
      has_custom_task: customTaskByOutreach.has(row.id),
      custom_task_summary: customTaskByOutreach.get(row.id) ?? null,
      stale_days:
        tab === "replies" || tab === "archive"
          ? computeStaleDays(state.last_email_sent_at, state.last_reply_at)
          : null,
      meeting_state: state.meeting_state,
      meeting_at: state.meeting_at,
      followup_notes: state.followup_notes,
      followup_author: state.followup_author,
      followup_at: state.followup_at,
      last_activity_at: state.last_activity_at,
      replies_state: repliesState,
      awaiting_callback_at: state.awaiting_callback_at,
      awaiting_callback_kind: state.awaiting_callback_kind,
      next_step_label: deriveNextStepLabel(row.status, earliestTask),
      has_pending_job_board_task: hasPendingJobBoard.has(row.id),
      engagement_substate: engagementSubState,
      smartlead_linkage: smartleadLinkage,
    };

    if (tab === "calls") {
      const tasks = tasksByOutreach.get(row.id) ?? [];
      if (tasks.length === 0) {
        // Outreach made it onto the Calls tab list but has no due
        // task (e.g. coming from a derived state). Render a single
        // card with the legacy primary-contact fallback so the row
        // isn't lost. Provider rows still suppress the contact-as-
        // title (Provider IS the prospect; Specific Contacts live
        // inside).
        tabRows.push({
          ...baseRow,
          row_key: row.id,
          primary_contact_name: orgPrimaryName,
          primary_contact_phone: orgPrimaryPhone,
          primary_contact_role: orgPrimaryRole,
          due_call_task: null,
          due_call_recipients: [],
        });
        continue;
      }
      // Sort tasks oldest-due first so the most overdue call surfaces
      // at the top of the row's group. v9 final: secondary sort by
      // task_id keeps order stable when due_at ties (e.g. all Day-0
      // tasks share a due_at near the launch moment).
      tasks.sort((a, b) => {
        const cmp = a.due_at.localeCompare(b.due_at);
        return cmp !== 0 ? cmp : a.task_id.localeCompare(b.task_id);
      });
      for (const t of tasks) {
        tabRows.push({
          ...baseRow,
          // Per-task synthetic key — React needs a unique value
          // because multiple rows share outreach_id.
          row_key: `${row.id}-${t.task_id}`,
          primary_contact_name: t.recipient_name ?? primary?.name ?? null,
          primary_contact_phone: t.recipient_phone ?? primary?.phone ?? null,
          primary_contact_role:
            t.recipient_kind === "general"
              ? "General Contact"
              : t.recipient_role ?? primary?.role ?? null,
          due_call_task: {
            id: t.task_id,
            due_at: t.due_at,
            cadence_day: t.cadence_day,
          },
          // One recipient per emitted row — list is redundant but
          // populated for compatibility with any caller that still
          // peeks at it.
          due_call_recipients: t.recipient_name ? [t.recipient_name] : [],
          recipient_kind: t.recipient_kind,
        });
      }
    } else if (tab === "replies") {
      const recipients = replyRecipientsByOutreach.get(row.id) ?? [];
      if (recipients.length === 0) {
        // Outreach is in REPLIES_STATUSES but no email_sent
        // touchpoints yet (just transitioned; Day 0 hasn't fired
        // OR legacy row pre-per-recipient cadence). Render one
        // card titled by the organization for provider rows; the
        // Specific Contact, if any, isn't yet the addressee.
        tabRows.push({
          ...baseRow,
          row_key: row.id,
          primary_contact_name: orgPrimaryName,
          primary_contact_phone: orgPrimaryPhone,
          primary_contact_role: orgPrimaryRole,
          due_call_task: null,
          due_call_recipients: [],
        });
        continue;
      }
      for (const r of recipients) {
        const recipientKey = r.contact_id ?? "general";
        tabRows.push({
          ...baseRow,
          row_key: `${row.id}-${recipientKey}`,
          primary_contact_name: r.name ?? primary?.name ?? null,
          primary_contact_phone: primary?.phone ?? null,
          primary_contact_role:
            r.recipient_kind === "general"
              ? "General Contact"
              : primary?.role ?? null,
          due_call_task: null,
          due_call_recipients: [],
          recipient_kind: r.recipient_kind,
        });
      }
    } else {
      // Prospects / All / Partners / Archive — non-fan-out tabs.
      // Provider rows render with the organization as the title;
      // stakeholder rows keep the contact-as-title pattern.
      tabRows.push({
        ...baseRow,
        row_key: row.id,
        primary_contact_name: orgPrimaryName,
        primary_contact_phone: orgPrimaryPhone,
        primary_contact_role: orgPrimaryRole,
        due_call_task: null,
        due_call_recipients: [],
      });
    }
  }

  // v9.0 Phase 7 Commit K: cards sort by most-recently-queued (the
  // existing per-tab order — last_edited_at desc, due_at asc, etc.).
  // Unread state is purely visual (bold label + fraction); it does
  // not change queue position. The Commit J unread-first sort was
  // reverted because it pulled cards out of recency order, which
  // hurt operational predictability.
  return tabRows;
}

/**
 * Humanize the earliest pending task into a "Next: …" label. Used by the
 * Partners-tab pill but tab-agnostic — any caller can render it.
 * Returns null when there's no useful next step (e.g. mid-cadence rows
 * already surface their state via the cadence step list).
 */
function deriveNextStepLabel(
  status: string,
  task: { task_type: string; due_at: string; payload: Record<string, unknown> | null } | null,
): string | null {
  if (!task) {
    return status === "active_partner" ? "No upcoming tasks" : null;
  }
  const when = formatRelativeFuture(task.due_at);
  switch (task.task_type) {
    case "outreach_email_send": {
      const season = task.payload?.season as string | undefined;
      if (status === "active_partner" && season) {
        return `Next: ${formatSeason(season)} email · ${when}`;
      }
      const day = task.payload?.day as number | undefined;
      return typeof day === "number" && day >= 0
        ? `Next: Day ${day} email · ${when}`
        : `Next: email · ${when}`;
    }
    case "outreach_followup_call":
      return `Next: follow-up call · ${when}`;
    case "outreach_followup_email":
      return `Next: follow-up email · ${when}`;
    case "yearly_leadership_recheck":
      return `Next: leadership recheck · ${when}`;
    case "partner_seasonal_checkin":
      return `Next: seasonal check-in · ${when}`;
    case "partner_share_update":
      return `Next: share update · ${when}`;
    case "approval_request_followup":
      return `Next: approval check-in · ${when}`;
    case "manual_followup":
      // Custom tasks already surface as the ⭐ pill — don't double up.
      if (task.payload?.reason === "custom") return null;
      return `Next: manual follow-up · ${when}`;
    default:
      return `Next: ${task.task_type.replace(/_/g, " ")} · ${when}`;
  }
}

function formatSeason(season: string): string {
  // "fall_kickoff" → "fall kickoff"
  return season.replace(/_/g, " ");
}

function formatRelativeFuture(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) {
    const days = Math.round(-ms / 86_400_000);
    return days >= 1 ? `${days}d overdue` : "due now";
  }
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr}h`;
  const d = Math.round(hr / 24);
  if (d < 60) return `in ${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── v10 Bullet 7 + 9 helpers ───────────────────────────────────────────

/**
 * Engagement sub-state from the most recent email_sent touchpoint's
 * payload. Mirrors `lib/student-outreach/engagement-state.ts` but inlined
 * here because the queue endpoint computes for many rows from a different
 * touchpoint row shape (TouchpointRow vs Touchpoint).
 */
function computeEngagementSubState(
  status: string,
  touchpoints: TouchpointRow[],
):
  | "no_engagement"
  | "opened_not_clicked"
  | "clicked_not_activated"
  | null {
  if (status === "active_partner") return null;
  if (status !== "outreach_sent" && status !== "engaged") return null;

  // touchpoints arrive DESC, so the first email_sent we find is the latest.
  const latestEmailSent = touchpoints.find(
    (t) => t.touchpoint_type === "email_sent",
  );
  if (!latestEmailSent) return "no_engagement";

  const payload = (latestEmailSent.payload ?? {}) as Record<string, unknown>;
  const clickCount = Number(payload.click_count ?? 0);
  const openCount = Number(payload.open_count ?? 0);

  if (clickCount > 0) return "clicked_not_activated";
  if (openCount > 0) return "opened_not_clicked";
  return "no_engagement";
}

/**
 * Pull the Smartlead lead_id + campaign_id from research_data.smartlead.
 * Used by the Emails tab to render "Reply via Smartlead inbox →" deep-links
 * to the master inbox at the right thread context.
 */
function computeSmartleadLinkage(
  researchData: Record<string, unknown> | null,
): { lead_id: string | null; campaign_id: string | null } {
  const smartlead = (researchData?.smartlead ?? {}) as Record<string, unknown>;
  const leadId =
    smartlead.lead_id != null && typeof smartlead.lead_id !== "object"
      ? String(smartlead.lead_id)
      : null;
  const campaignId =
    smartlead.campaign_id != null && typeof smartlead.campaign_id !== "object"
      ? String(smartlead.campaign_id)
      : null;
  return { lead_id: leadId, campaign_id: campaignId };
}


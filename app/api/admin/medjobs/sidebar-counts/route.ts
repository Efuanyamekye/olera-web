import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { countProspectGeneration } from "@/lib/medjobs/prospect-counts";

/**
 * v9.0 Phase 7 Commit P: sidebar fraction counts.
 *
 * Returns per-entity { unread, total } powering the MedJobs sidebar
 * fractions. One endpoint, one round-trip, fired on sidebar mount +
 * every refreshMedJobs() invalidation.
 *
 * Reconciled with the In Basket horizontal tab counts so the two
 * surfaces show identical numbers per entity. The old sidebar model
 * used inventory denominators (all clients / all candidates / all
 * campuses) which couldn't match the In Basket's task-driven
 * denominators. Now both surfaces use the same "active operational
 * signal" rule.
 *
 * Counting model — one universal rule:
 *   numerator   (unread)  = active operational rows where there's a
 *                            pending signal created after viewed_at
 *                            (or never viewed)
 *   denominator (total)   = active operational rows for this entity
 *
 * Per-entity definitions of "active operational rows":
 *   in_basket   active student_outreach (not closed) + pending entity
 *               tasks
 *   sites       campuses with operational signal: research-needed
 *               (Stage 2 unlocked, 0 stakeholders) OR pending site_task
 *   prospects   student_outreach in RESEARCH_STATUSES
 *   clients     business_profiles with ≥1 pending business_profile_task
 *               (kind=client)
 *   partners    student_outreach in active_partner status (kind!=provider)
 *               with ≥1 pending task
 *   candidates  business_profiles with ≥1 pending business_profile_task
 *               (kind=candidate)
 *   replies     student_outreach in REPLIES_STATUSES
 *   meetings    student_outreach with active meeting state
 *   calls       student_outreach with pending phone task due now
 *
 * Quiet entities (active relationships with no pending task) live in
 * Logs; brand-new entities surface when the system queues their
 * first task on creation.
 */

const CLOSED_STATUSES = [
  "no_response_closed",
  "not_interested",
  "do_not_contact",
  "wrong_contact",
  "archived",
];

const REPLIES_STATUSES = ["outreach_sent", "engaged"];
const RESEARCH_STATUSES = ["prospect", "researched"];
const PARTNER_STATUSES = ["active_partner"];

interface CountEntry {
  unread: number;
  total: number;
}

/**
 * v9.0 Phase 7 Commit O: shared unread predicate for entity-task
 * entities. An entity is unread when it has any pending task created
 * after its viewed_at — OR was never viewed and has a pending task.
 */
function isEntityUnread(
  viewedAt: string | null,
  latestTaskCreatedAt: string | null,
): boolean {
  if (!latestTaskCreatedAt) return false;
  if (!viewedAt) return true;
  return latestTaskCreatedAt > viewedAt;
}

export async function GET(_req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getServiceClient();

  const [
    { data: outreachRows },
    { data: callTasks },
    { data: meetingTouchpoints },
    { data: pendingBpTasks },
    { data: pendingSiteTasks },
    { data: pendingPartnerTasks },
    { data: campusRows },
    { data: clientProfiles },
    { data: candidateProfiles },
    prospectGen,
  ] = await Promise.all([
    db.from("student_outreach").select("id, status, viewed_at, kind"),
    db
      .from("student_outreach_tasks")
      .select("outreach_id")
      .eq("status", "pending")
      .eq("task_type", "outreach_followup_call")
      .lte("due_at", new Date().toISOString()),
    db
      .from("student_outreach_touchpoints")
      .select("outreach_id, touchpoint_type, created_at")
      .in("touchpoint_type", ["meeting_scheduled", "meeting_held"])
      .gte("created_at", new Date(Date.now() - 90 * 86400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(5000),
    db
      .from("business_profile_tasks")
      .select("business_profile_id, kind, created_at")
      .eq("status", "pending"),
    db
      .from("site_tasks")
      .select("campus_id, created_at")
      .eq("status", "pending"),
    // v9.0 Phase 7 Commit P: pending stakeholder tasks. The Partners
    // bucket counts active_partner rows that have ≥1 pending task —
    // matching the In Basket Partners tab so the two surfaces show
    // the same number.
    db
      .from("student_outreach_tasks")
      .select("outreach_id")
      .eq("status", "pending"),
    db
      .from("student_outreach_campuses")
      .select("id, viewed_at, is_active")
      .eq("is_active", true),
    db
      .from("business_profiles")
      .select("id, metadata")
      .in("type", ["organization", "caregiver"])
      .not("metadata->>interview_terms_accepted_at", "is", null),
    db
      .from("business_profiles")
      .select("id, metadata")
      .eq("type", "student")
      .eq("is_active", true)
      .contains("metadata", { application_completed: true }),
    countProspectGeneration(db),
  ]);

  const rows = (outreachRows ?? []) as Array<{
    id: string;
    status: string;
    viewed_at: string | null;
    kind: string | null;
  }>;
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const isUnread = (r: { viewed_at: string | null }) => r.viewed_at == null;
  const isClosed = (s: string) => CLOSED_STATUSES.includes(s);

  // ── Stakeholder-side derived sets (Meetings / Calls) ──
  const latestMeetingTouchpoint = new Map<string, string>();
  for (const t of (meetingTouchpoints ?? []) as Array<{
    outreach_id: string;
    touchpoint_type: string;
  }>) {
    if (!latestMeetingTouchpoint.has(t.outreach_id)) {
      latestMeetingTouchpoint.set(t.outreach_id, t.touchpoint_type);
    }
  }
  const meetingActiveIds = new Set<string>();
  for (const [id, type] of latestMeetingTouchpoint.entries()) {
    if (type === "meeting_scheduled") meetingActiveIds.add(id);
  }
  const callActiveIds = new Set<string>();
  for (const t of (callTasks ?? []) as Array<{ outreach_id: string }>) {
    callActiveIds.add(t.outreach_id);
  }

  // ── Entity-task unread maps (per-entity latest pending task) ──
  const latestClientTaskByProfile = new Map<string, string>();
  const latestCandidateTaskByProfile = new Map<string, string>();
  for (const t of (pendingBpTasks ?? []) as Array<{
    business_profile_id: string;
    kind: string;
    created_at: string;
  }>) {
    const map =
      t.kind === "client" ? latestClientTaskByProfile : latestCandidateTaskByProfile;
    const cur = map.get(t.business_profile_id);
    if (!cur || t.created_at > cur) map.set(t.business_profile_id, t.created_at);
  }

  const latestSiteTaskByCampus = new Map<string, string>();
  for (const t of (pendingSiteTasks ?? []) as Array<{
    campus_id: string;
    created_at: string;
  }>) {
    const cur = latestSiteTaskByCampus.get(t.campus_id);
    if (!cur || t.created_at > cur) latestSiteTaskByCampus.set(t.campus_id, t.created_at);
  }

  const counts: Record<string, CountEntry> = {
    in_basket: { unread: 0, total: 0 },
    sites: { unread: 0, total: 0 },
    prospects: { unread: 0, total: 0 },
    clients: { unread: 0, total: 0 },
    partners: { unread: 0, total: 0 },
    candidates: { unread: 0, total: 0 },
    replies: { unread: 0, total: 0 },
    meetings: { unread: 0, total: 0 },
    calls: { unread: 0, total: 0 },
  };

  // ── Stakeholder buckets ──
  // Prospects + Replies stay state-driven. Partners is task-driven now
  // (active_partner WITH pending task) so the sidebar matches the In
  // Basket Partners tab. Active partners with no pending task are
  // "quiet relationships" — they live in Logs, not the operational
  // queue.
  const partnerOutreachWithPendingTask = new Set<string>();
  for (const t of (pendingPartnerTasks ?? []) as Array<{ outreach_id: string }>) {
    partnerOutreachWithPendingTask.add(t.outreach_id);
  }

  for (const r of rows) {
    if (isClosed(r.status)) continue;
    counts.in_basket.total += 1;
    if (isUnread(r)) counts.in_basket.unread += 1;

    if (RESEARCH_STATUSES.includes(r.status)) {
      counts.prospects.total += 1;
      if (isUnread(r)) counts.prospects.unread += 1;
    } else if (
      PARTNER_STATUSES.includes(r.status) &&
      r.kind !== "provider" &&
      partnerOutreachWithPendingTask.has(r.id)
    ) {
      counts.partners.total += 1;
      if (isUnread(r)) counts.partners.unread += 1;
    } else if (REPLIES_STATUSES.includes(r.status)) {
      counts.replies.total += 1;
      if (isUnread(r)) counts.replies.unread += 1;
    }
  }

  for (const id of meetingActiveIds) {
    const r = rowMap.get(id);
    if (!r || isClosed(r.status)) continue;
    counts.meetings.total += 1;
    if (isUnread(r)) counts.meetings.unread += 1;
  }
  for (const id of callActiveIds) {
    const r = rowMap.get(id);
    if (!r || isClosed(r.status)) continue;
    counts.calls.total += 1;
    if (isUnread(r)) counts.calls.unread += 1;
  }

  // ── Sites ──
  // Sites is an organizational anchor (activated university territories
  // that generate operational work), not itself a queue. Counter is a
  // flat total of active campuses — the sidebar renders this without
  // unread bolding or a fraction. The triage work generated by each
  // site lives in In Basket / Prospects / Replies / etc.
  const campusViewedAtMap = new Map<string, string | null>();
  for (const c of (campusRows ?? []) as Array<{
    id: string;
    viewed_at: string | null;
    is_active: boolean;
  }>) {
    campusViewedAtMap.set(c.id, c.viewed_at);
  }
  counts.sites.total = campusViewedAtMap.size;
  counts.sites.unread = 0;

  // ── Prospects: research cards + virtual provider prospects ──
  // Same generator the In Basket tab uses, so the sidebar Prospects
  // fraction matches the badge atop the tab and the rendered cards
  // inside the dropdown. Research cards contribute one each;
  // unmaterialized catchment providers contribute one each (always
  // unread — virtual rows have no viewed_at).
  counts.prospects.total += prospectGen.total;
  counts.prospects.unread += prospectGen.unread;

  // ── Clients (task-driven: business_profiles with pending client task) ──
  const clientMetadataMap = new Map<string, Record<string, unknown> | null>();
  for (const p of (clientProfiles ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>) {
    clientMetadataMap.set(p.id, p.metadata);
  }
  for (const [id, latestTaskCreated] of latestClientTaskByProfile.entries()) {
    counts.clients.total += 1;
    const meta = clientMetadataMap.get(id) ?? null;
    const adminViewedAt =
      typeof meta?.admin_viewed_at === "string"
        ? (meta.admin_viewed_at as string)
        : null;
    if (isEntityUnread(adminViewedAt, latestTaskCreated)) {
      counts.clients.unread += 1;
    }
  }

  // ── Candidates (task-driven: business_profiles with pending candidate task) ──
  const candidateMetadataMap = new Map<string, Record<string, unknown> | null>();
  for (const p of (candidateProfiles ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>) {
    candidateMetadataMap.set(p.id, p.metadata);
  }
  for (const [id, latestTaskCreated] of latestCandidateTaskByProfile.entries()) {
    counts.candidates.total += 1;
    const meta = candidateMetadataMap.get(id) ?? null;
    const adminViewedAt =
      typeof meta?.admin_viewed_at === "string"
        ? (meta.admin_viewed_at as string)
        : null;
    if (isEntityUnread(adminViewedAt, latestTaskCreated)) {
      counts.candidates.unread += 1;
    }
  }

  // In Basket includes pending entity tasks AND the prospect generation
  // total (research cards + virtual provider prospects). Matches the
  // hero's "Queued" semantics — every queued operational signal counts,
  // not just concrete task rows.
  counts.in_basket.total +=
    (pendingBpTasks?.length ?? 0) +
    (pendingSiteTasks?.length ?? 0) +
    prospectGen.total;
  counts.in_basket.unread += prospectGen.unread;

  return NextResponse.json({ counts });
}

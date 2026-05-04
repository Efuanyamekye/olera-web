/**
 * GET /api/admin/staffing-outreach/queue
 *
 * Returns the active batches (for the dropdown) and a paginated list of
 * outreach rows joined with provider display info.
 *
 * Query params:
 *   batch       batch id (required for the row list; if omitted only batches return)
 *   stage       action_needed|initial_contact|nurturing|enrolled|closed
 *   search      substring match on provider_name (optional)
 *   page        0-indexed page, default 0
 *   pageSize    default 50
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import type { QueueRow } from "@/lib/staffing-outreach/types";

const PAGE_SIZE_DEFAULT = 50;

// 5-tab stage-based filtering
// - action_needed: Cross-stage to-do list (nurturing statuses where due <= now)
// - initial_contact: Not yet contacted (queued)
// - nurturing: In progress (all nurturing statuses, no time filter)
// - enrolled: Success
// - closed: Dead ends
const STAGE_STATUSES: Record<string, string[]> = {
  action_needed: ["pre_call_outreach", "calling", "connected_no_consent", "consented", "nurturing", "activated"],
  initial_contact: ["queued"],
  nurturing: ["pre_call_outreach", "calling", "connected_no_consent", "consented", "nurturing", "activated"],
  enrolled: ["enrolled"],
  closed: ["do_not_contact", "wrong_number"],
};

// Backwards compatibility: map old tab names to new stages
const STAGE_ALIASES: Record<string, string> = {
  new: "initial_contact",
  to_call: "initial_contact",
  contacted: "nurturing",
  in_progress: "nurturing",
  stopped: "closed",
  queued: "initial_contact",
  pre_call: "nurturing",
  calling: "nurturing",
  post_consent: "nurturing",
  activated: "nurturing",
  all: "initial_contact",
  today: "action_needed",
  due_today: "action_needed",
};

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getServiceClient();
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batch");

  // 5-tab navigation (no urgency toggle)
  const rawStage = url.searchParams.get("stage") ?? url.searchParams.get("tab") ?? "action_needed";
  const resolvedStage = STAGE_ALIASES[rawStage] ?? rawStage;
  // Validate stage - fallback to "action_needed" if invalid
  const stage = STAGE_STATUSES[resolvedStage] ? resolvedStage : "action_needed";

  const search = (url.searchParams.get("search") ?? "").trim();
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT), 10)),
  );

  // ── Active batches (for the dropdown) ──────────────────────────────────
  const { data: batches, error: batchesErr } = await db
    .from("staffing_batches")
    .select("*")
    .neq("status", "completed")
    .order("university_name", { ascending: true });

  if (batchesErr) {
    return NextResponse.json({ error: batchesErr.message }, { status: 500 });
  }

  if (!batchId) {
    return NextResponse.json({ batches, rows: [], total: 0, tabCounts: {} });
  }

  // ── Tab counts for the chosen batch ─────────────────────────────────────
  const stageCounts = await computeStageCounts(db, batchId);

  // ── If searching, find matching provider IDs first (DB-level search) ───
  let searchProviderIds: string[] | null = null;
  if (search) {
    const { data: matchingProviders, error: searchErr } = await db
      .from("olera-providers")
      .select("provider_id")
      .ilike("provider_name", `%${search}%`);

    if (searchErr) {
      return NextResponse.json({ error: searchErr.message }, { status: 500 });
    }

    searchProviderIds = (matchingProviders ?? []).map((p) => p.provider_id);

    // If search matches nothing, return empty results immediately
    if (searchProviderIds.length === 0) {
      return NextResponse.json({ batches, rows: [], total: 0, tabCounts: stageCounts });
    }
  }

  // ── Filtered + paginated rows ──────────────────────────────────────────
  let query = db
    .from("staffing_outreach")
    .select("*", { count: "exact" })
    .eq("batch_id", batchId);

  // Apply search filter at DB level (before pagination)
  if (searchProviderIds) {
    query = query.in("provider_id", searchProviderIds);
  }

  // Apply stage filter (funnel stage)
  const statuses = STAGE_STATUSES[stage];
  if (statuses) {
    query = query.in("status", statuses);
  }

  // Action Needed tab: only show items that are due (next_action_due_at <= now)
  if (stage === "action_needed") {
    query = query.lte("next_action_due_at", new Date().toISOString());
  }

  query = query
    .order("next_action_due_at", { ascending: true, nullsFirst: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  const { data: outreachRows, error: rowsErr, count } = await query;
  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const rows = outreachRows ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ batches, rows: [], total: count ?? 0, tabCounts: stageCounts });
  }

  // ── Hydrate with provider display info ─────────────────────────────────
  interface ProviderRow {
    provider_id: string;
    provider_name: string;
    phone: string | null;
    city: string | null;
    state: string | null;
    website: string | null;
    slug: string | null;
  }

  const providerIds = rows.map((r) => r.provider_id);
  const { data: providersRaw, error: provErr } = await db
    .from("olera-providers")
    .select("provider_id, provider_name, phone, city, state, website, slug")
    .in("provider_id", providerIds);

  if (provErr) {
    return NextResponse.json({ error: provErr.message }, { status: 500 });
  }

  const providers = (providersRaw ?? []) as ProviderRow[];
  const providerMap = new Map<string, ProviderRow>(
    providers.map((p) => [p.provider_id, p]),
  );

  const queueRows: QueueRow[] = rows.map((r) => {
    const p = providerMap.get(r.provider_id);
    return {
      ...r,
      provider_name: p?.provider_name ?? "(unknown provider)",
      provider_phone: p?.phone ?? null,
      provider_city: p?.city ?? null,
      provider_state: p?.state ?? null,
      provider_website: p?.website ?? null,
      provider_slug: p?.slug ?? null,
    } as QueueRow;
  });

  return NextResponse.json({
    batches,
    rows: queueRows,
    total: count ?? queueRows.length,
    tabCounts: stageCounts,
  });
}

async function computeStageCounts(
  db: ReturnType<typeof getServiceClient>,
  batchId: string,
): Promise<Record<string, number>> {
  const stageCounts: Record<string, number> = {
    action_needed: 0,
    initial_contact: 0,
    nurturing: 0,
    enrolled: 0,
    closed: 0,
  };

  const { data, error } = await db
    .from("staffing_outreach")
    .select("status, next_action_due_at")
    .eq("batch_id", batchId);

  if (error || !data) return stageCounts;

  const nowIso = new Date().toISOString();
  const NURTURING_STATUSES = new Set([
    "pre_call_outreach",
    "calling",
    "connected_no_consent",
    "consented",
    "nurturing",
    "activated",
  ]);

  for (const row of data) {
    const status = row.status as string;
    const isDue = row.next_action_due_at && row.next_action_due_at <= nowIso;

    // Action Needed: nurturing statuses where due <= now
    // Key rule: does NOT include queued providers
    if (NURTURING_STATUSES.has(status) && isDue) {
      stageCounts.action_needed++;
    }

    // Initial Contact: queued only
    if (status === "queued") {
      stageCounts.initial_contact++;
    }
    // Nurturing: all nurturing statuses (no time filter)
    else if (NURTURING_STATUSES.has(status)) {
      stageCounts.nurturing++;
    }
    // Enrolled
    else if (status === "enrolled") {
      stageCounts.enrolled++;
    }
    // Closed: do_not_contact, wrong_number
    else if (status === "do_not_contact" || status === "wrong_number") {
      stageCounts.closed++;
    }
  }

  return stageCounts;
}

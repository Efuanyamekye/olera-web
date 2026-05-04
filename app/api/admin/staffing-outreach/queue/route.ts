/**
 * GET /api/admin/staffing-outreach/queue
 *
 * Returns the active batches (for the dropdown) and a paginated list of
 * outreach rows joined with provider display info.
 *
 * Query params:
 *   batch       batch id (required for the row list; if omitted only batches return)
 *   tab         today|to_call|in_progress|enrolled|stopped
 *   search      substring match on provider_name (optional)
 *   page        0-indexed page, default 0
 *   pageSize    default 50
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import type { QueueRow } from "@/lib/staffing-outreach/types";

const PAGE_SIZE_DEFAULT = 50;

const TAB_FILTERS: Record<string, string[] | null> = {
  today: null, // handled separately (date filter)
  to_call: ["queued", "pre_call_outreach"],
  in_progress: ["calling", "connected_no_consent", "consented", "nurturing", "activated"],
  enrolled: ["enrolled"],
  stopped: ["do_not_contact", "wrong_number"],
};

// Backwards compatibility: map old granular tab names to new simplified tabs
const TAB_ALIASES: Record<string, string> = {
  queued: "to_call",
  pre_call: "to_call",
  calling: "in_progress",
  post_consent: "in_progress",
  activated: "in_progress",
  all: "to_call", // default to actionable items
};

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getServiceClient();
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batch");
  const rawTab = url.searchParams.get("tab") ?? "today";
  // Normalize tab name (backwards compatibility for old URLs)
  const tab = TAB_ALIASES[rawTab] ?? rawTab;
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
    .order("created_at", { ascending: false });

  if (batchesErr) {
    return NextResponse.json({ error: batchesErr.message }, { status: 500 });
  }

  if (!batchId) {
    return NextResponse.json({ batches, rows: [], total: 0, tabCounts: {} });
  }

  // ── Tab counts for the chosen batch ────────────────────────────────────
  const tabCounts = await computeTabCounts(db, batchId);

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
      return NextResponse.json({ batches, rows: [], total: 0, tabCounts });
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

  if (tab === "today") {
    query = query
      .lte("next_action_due_at", new Date().toISOString())
      .not("status", "in", "(do_not_contact,enrolled,wrong_number)");
  } else {
    const statuses = TAB_FILTERS[tab];
    if (statuses) {
      query = query.in("status", statuses);
    }
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
    return NextResponse.json({ batches, rows: [], total: count ?? 0, tabCounts });
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
    tabCounts,
  });
}

async function computeTabCounts(
  db: ReturnType<typeof getServiceClient>,
  batchId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    today: 0,
    to_call: 0,
    in_progress: 0,
    enrolled: 0,
    stopped: 0,
  };

  const { data, error } = await db
    .from("staffing_outreach")
    .select("status, next_action_due_at")
    .eq("batch_id", batchId);

  if (error || !data) return counts;

  const nowIso = new Date().toISOString();
  const STOPPED_STATUSES = new Set(["do_not_contact", "enrolled", "wrong_number"]);

  for (const row of data) {
    const status = row.status as string;

    // Today: any status with next_action_due_at <= now (except enrolled/stopped)
    if (
      row.next_action_due_at &&
      row.next_action_due_at <= nowIso &&
      !STOPPED_STATUSES.has(status)
    ) {
      counts.today++;
    }

    // To Call: queued, pre_call_outreach
    if (status === "queued" || status === "pre_call_outreach") {
      counts.to_call++;
    }
    // In Progress: calling, connected_no_consent, consented, nurturing, activated
    else if (
      status === "calling" ||
      status === "connected_no_consent" ||
      status === "consented" ||
      status === "nurturing" ||
      status === "activated"
    ) {
      counts.in_progress++;
    }
    // Enrolled
    else if (status === "enrolled") {
      counts.enrolled++;
    }
    // Stopped: do_not_contact, wrong_number
    else if (status === "do_not_contact" || status === "wrong_number") {
      counts.stopped++;
    }
  }

  return counts;
}

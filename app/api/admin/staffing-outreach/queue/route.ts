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
import type { QueueRow, EngagementSignals } from "@/lib/staffing-outreach/types";

const PAGE_SIZE_DEFAULT = 50;

// V2: 5-tab stage-based filtering
// - to_queue: Providers waiting to start sequence (queued status)
// - sequencing: Emails in progress (Email 1 sent, waiting for Email 2 or response)
// - needs_call: Sequence complete, no enrollment (needs manual call)
// - enrolled: Success (activated, enrolled)
// - closed: Dead ends (closed, bounced, do_not_contact, wrong_number)
const STAGE_STATUSES: Record<string, string[]> = {
  to_queue: ["queued"],
  sequencing: ["sequencing"],
  needs_call: ["needs_call", "consented"],
  enrolled: ["activated", "enrolled"],
  closed: ["closed", "bounced", "do_not_contact", "wrong_number"],
  // Legacy mappings for backwards compatibility
  action_needed: ["needs_call", "consented", "sequencing"],
  initial_contact: ["queued"],
  nurturing: ["sequencing", "needs_call", "consented"],
};

// Backwards compatibility: map old tab names to new stages
const STAGE_ALIASES: Record<string, string> = {
  // V2 tab aliases
  initial_contact: "to_queue",
  new: "to_queue",
  queued: "to_queue",
  // Legacy mappings
  to_call: "to_queue",
  contacted: "sequencing",
  in_progress: "sequencing",
  stopped: "closed",
  pre_call: "sequencing",
  calling: "needs_call",
  post_consent: "needs_call",
  activated: "enrolled",
  all: "to_queue",
  today: "needs_call",
  due_today: "needs_call",
  action_needed: "needs_call",
  nurturing: "sequencing",
};

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getServiceClient();
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batch");

  // V2: 5-tab navigation
  const rawStage = url.searchParams.get("stage") ?? url.searchParams.get("tab") ?? "to_queue";
  const resolvedStage = STAGE_ALIASES[rawStage] ?? rawStage;
  // Validate stage - fallback to "to_queue" if invalid
  const stage = STAGE_STATUSES[resolvedStage] ? resolvedStage : "to_queue";

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

  // Get all active batch IDs for cross-university queries
  const activeBatchIds = (batches ?? []).map((b) => b.id);
  const batchMap = new Map((batches ?? []).map((b) => [b.id, b.university_name]));

  // ── Tab counts ──────────────────────────────────────────────────────────
  // Action Needed count is ALWAYS across all universities
  // Other tab counts are per-selected-batch (or 0 if no batch selected)
  const stageCounts = await computeStageCounts(db, batchId, activeBatchIds);

  // V2: Support "All Universities" filter (no batch selected)
  // When no batch is selected, query across all active batches
  // This is needed for the "Queue All" batch operation
  if (activeBatchIds.length === 0) {
    return NextResponse.json({ batches, rows: [], total: 0, tabCounts: stageCounts });
  }

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
    .select("*", { count: "exact" });

  // V2: Support "All Universities" filter
  // If batchId is null, query across all active batches
  // Otherwise filter by selected batch
  if (batchId) {
    query = query.eq("batch_id", batchId);
  } else {
    query = query.in("batch_id", activeBatchIds);
  }

  // Apply search filter at DB level (before pagination)
  if (searchProviderIds) {
    query = query.in("provider_id", searchProviderIds);
  }

  // Apply stage filter (funnel stage)
  const statuses = STAGE_STATUSES[stage];
  if (statuses) {
    query = query.in("status", statuses);
  }

  // Needs Call tab: only show items that are due (next_action_due_at <= now)
  // This replaces the old "Action Needed" cross-university to-do list
  if (stage === "needs_call") {
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

  // ── Look up claimer initials ──────────────────────────────────────────────
  const claimerIds = [...new Set(rows.map((r) => r.claimed_by).filter(Boolean))] as string[];
  const claimerInitialsMap = new Map<string, string>();

  if (claimerIds.length > 0) {
    const { data: admins } = await db
      .from("admin_users")
      .select("user_id, email")
      .in("user_id", claimerIds);

    for (const admin of admins ?? []) {
      const initials = getInitialsFromEmail(admin.email);
      claimerInitialsMap.set(admin.user_id, initials);
    }
  }

  // ── Look up engagement signals from touchpoints ───────────────────────────
  const outreachIds = rows.map((r) => r.id);
  const engagementMap = new Map<string, EngagementSignals>();

  if (outreachIds.length > 0) {
    // Query touchpoints for engagement types
    const { data: touchpoints } = await db
      .from("staffing_touchpoints")
      .select("outreach_id, type")
      .in("outreach_id", outreachIds)
      .in("type", ["email_opened", "email_clicked", "reply_received"]);

    // Also check for contacts (consent given)
    const { data: contacts } = await db
      .from("staffing_contacts")
      .select("outreach_id")
      .in("outreach_id", outreachIds);

    const contactOutreachIds = new Set((contacts ?? []).map((c) => c.outreach_id));

    // Aggregate signals per outreach
    for (const tp of touchpoints ?? []) {
      const existing = engagementMap.get(tp.outreach_id) ?? {};
      if (tp.type === "email_opened") existing.emailOpened = true;
      if (tp.type === "email_clicked") existing.emailClicked = true;
      if (tp.type === "reply_received") existing.replied = true;
      engagementMap.set(tp.outreach_id, existing);
    }

    // Add hasContact flag
    for (const outreachId of contactOutreachIds) {
      const existing = engagementMap.get(outreachId) ?? {};
      existing.hasContact = true;
      engagementMap.set(outreachId, existing);
    }
  }

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
      // Include university name for Action Needed tab (cross-university view)
      university_name: batchMap.get(r.batch_id) ?? undefined,
      // Include claimer initials for avatar display
      claimed_by_initials: r.claimed_by ? claimerInitialsMap.get(r.claimed_by) : undefined,
      // Include engagement signals
      engagement: engagementMap.get(r.id),
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
  batchId: string | null,
  activeBatchIds: string[],
): Promise<Record<string, number>> {
  // V2 tab counts
  const stageCounts: Record<string, number> = {
    to_queue: 0,
    sequencing: 0,
    needs_call: 0,
    enrolled: 0,
    closed: 0,
  };

  if (activeBatchIds.length === 0) {
    return stageCounts;
  }

  // Query based on filter: specific batch or all batches
  const queryBatchIds = batchId ? [batchId] : activeBatchIds;

  const { data, error } = await db
    .from("staffing_outreach")
    .select("status")
    .in("batch_id", queryBatchIds);

  if (error || !data) {
    return stageCounts;
  }

  for (const row of data) {
    const status = row.status as string;

    // V2 status mapping
    if (status === "queued") {
      stageCounts.to_queue++;
    } else if (status === "sequencing") {
      stageCounts.sequencing++;
    } else if (status === "needs_call" || status === "consented") {
      stageCounts.needs_call++;
    } else if (status === "activated" || status === "enrolled") {
      stageCounts.enrolled++;
    } else if (
      status === "closed" ||
      status === "bounced" ||
      status === "do_not_contact" ||
      status === "wrong_number"
    ) {
      stageCounts.closed++;
    }
    // Legacy statuses map to V2 equivalents
    else if (status === "pre_call_outreach" || status === "nurturing") {
      stageCounts.sequencing++;
    } else if (status === "calling" || status === "connected_no_consent") {
      stageCounts.needs_call++;
    }
  }

  return stageCounts;
}

/**
 * Extract initials from an email address.
 * "tj@olera.care" → "TJ"
 * "john.doe@example.com" → "JD"
 * "admin@company.com" → "A"
 */
function getInitialsFromEmail(email: string): string {
  const local = email.split("@")[0];

  // Handle dot-separated names (john.doe → JD)
  if (local.includes(".")) {
    const parts = local.split(".");
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }

  // Single name: take first 1-2 chars
  return local.slice(0, 2).toUpperCase();
}

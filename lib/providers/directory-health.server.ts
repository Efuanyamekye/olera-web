import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideHealthActions,
  type GoogleBusinessStatus,
  type ProviderForHealth,
  type StatusCandidate,
  type StatusObservation,
} from "./directory-health";

/**
 * Directory health, the database side: apply one Google observation to a
 * provider and write what happened to provider_health_actions (migration 272).
 * The decision itself is in ./directory-health (pure, checked by
 * scripts/check-directory-health.ts).
 *
 * Every write here is reversible from the ledger row: an archive stores how to
 * un-delete, a rename stores the old name. undoHealthAction reads that back.
 */

const STATUSES: ReadonlyArray<GoogleBusinessStatus> = ["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"];

function asStatus(value: string | null | undefined): GoogleBusinessStatus | null {
  return value && (STATUSES as readonly string[]).includes(value) ? (value as GoogleBusinessStatus) : null;
}

export type HealthSource = "google_status" | "review_refresh" | "manual_refresh";

export type AppliedHealth = { providerId: string; actions: string[] };

/**
 * Record what Google said about a provider: stamp the observation on the row,
 * apply what is reversible, flag the rest. Idempotent for a repeat
 * observation (still open, same name): the stamp updates, no ledger row.
 */
export async function applyStatusObservation(
  db: SupabaseClient,
  providerId: string,
  observed: { business_status: string | null; google_name: string | null },
  source: HealthSource,
  now: Date = new Date(),
): Promise<AppliedHealth> {
  const { data, error } = await db
    .from("olera-providers")
    .select("provider_id, provider_name, deleted, google_status")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { providerId, actions: [] };
  const provider = data as ProviderForHealth;
  const observation: StatusObservation = { status: asStatus(observed.business_status), googleName: observed.google_name };
  const decisions = decideHealthActions(provider, observation);
  const nowIso = now.toISOString();

  const update: Record<string, unknown> = {
    google_status: observed.business_status,
    google_status_checked_at: nowIso,
    google_name: observed.google_name,
  };
  const rows: Array<Record<string, unknown>> = [];
  for (const decision of decisions) {
    if (decision.kind === "closed_archived") {
      update.deleted = true;
      update.deleted_at = nowIso;
      update.deletion_reason = "google:CLOSED_PERMANENTLY";
      rows.push({
        provider_id: providerId, kind: decision.kind, source, applied_at: nowIso,
        evidence: { status: observed.business_status, google_name: observed.google_name, provider_name: provider.provider_name },
        undo: decision.undo,
      });
    } else if (decision.kind === "rename_applied") {
      update.provider_name = decision.newName;
      rows.push({
        provider_id: providerId, kind: decision.kind, source, applied_at: nowIso,
        evidence: { from: provider.provider_name, to: decision.newName },
        undo: decision.undo,
      });
    } else if (decision.kind === "closed_temporarily") {
      rows.push({ provider_id: providerId, kind: decision.kind, source, evidence: { status: observed.business_status, google_name: observed.google_name } });
    } else if (decision.kind === "rename_flagged") {
      rows.push({ provider_id: providerId, kind: decision.kind, source, evidence: { stored: provider.provider_name, google: observed.google_name } });
    }
  }

  const { error: updateError } = await db.from("olera-providers").update(update).eq("provider_id", providerId);
  if (updateError) throw updateError;
  if (rows.length) {
    const { error: ledgerError } = await db.from("provider_health_actions").insert(rows);
    if (ledgerError) throw ledgerError;
  }
  return { providerId, actions: decisions.map((d) => d.kind) };
}

/** Put a provider back the way it was before an applied action, and say who did it. */
export async function undoHealthAction(db: SupabaseClient, actionId: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db.from("provider_health_actions").select("id, provider_id, kind, undo, applied_at, undone_at").eq("id", actionId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No such action" };
  if (data.undone_at) return { ok: false, error: "Already undone" };
  const nowIso = new Date().toISOString();
  if (data.applied_at && data.undo && typeof data.undo === "object") {
    const { error: restoreError } = await db.from("olera-providers").update(data.undo as Record<string, unknown>).eq("provider_id", data.provider_id as string);
    if (restoreError) return { ok: false, error: restoreError.message };
  }
  const { error: markError } = await db.from("provider_health_actions")
    .update({ undone_at: nowIso, undone_by: actor, resolved_at: nowIso, resolved_by: actor })
    .eq("id", actionId);
  if (markError) return { ok: false, error: markError.message };
  return { ok: true };
}

/** Close a flag without changing the provider: a human looked and it is fine. */
export async function resolveHealthAction(db: SupabaseClient, actionId: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.from("provider_health_actions")
    .update({ resolved_at: new Date().toISOString(), resolved_by: actor })
    .eq("id", actionId)
    .is("resolved_at", null);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type HealthActionRow = {
  id: string;
  provider_id: string;
  kind: string;
  source: string;
  evidence: Record<string, unknown>;
  applied_at: string | null;
  resolved_at: string | null;
  undone_at: string | null;
  created_at: string;
  provider_name: string | null;
  slug: string | null;
};

/** The queue for /admin/directory/health: newest first, open ones by default. */
export async function listHealthActions(db: SupabaseClient, opts: { open?: boolean; limit?: number } = {}): Promise<HealthActionRow[]> {
  let query = db.from("provider_health_actions")
    .select("id, provider_id, kind, source, evidence, applied_at, resolved_at, undone_at, created_at")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.open !== false) query = query.is("resolved_at", null).is("undone_at", null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<Omit<HealthActionRow, "provider_name" | "slug">>;
  const ids = [...new Set(rows.map((r) => r.provider_id))];
  const names = new Map<string, { provider_name: string | null; slug: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: providers } = await db.from("olera-providers").select("provider_id, provider_name, slug").in("provider_id", ids.slice(i, i + 200));
    for (const p of providers ?? []) names.set(p.provider_id as string, { provider_name: (p.provider_name as string | null) ?? null, slug: (p.slug as string | null) ?? null });
  }
  return rows.map((r) => ({ ...r, provider_name: names.get(r.provider_id)?.provider_name ?? null, slug: names.get(r.provider_id)?.slug ?? null }));
}

export type DirectoryHealthSummary = {
  /** Ledger rows in the window, by kind. */
  byKind: Record<string, number>;
  /** Flags nobody has looked at. */
  openFlags: number;
  /** Providers with a Google status read, ever. */
  checked: number;
  /** Active providers with a Place ID still never checked. */
  unchecked: number;
  /** Most recent ledger row, or null if the system has never acted. */
  lastActionAt: string | null;
};

/** What the Cortex probe and the admin page both read. */
export async function directoryHealthSummary(db: SupabaseClient, days = 7): Promise<DirectoryHealthSummary> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: recent }, { count: openFlags }, { count: checked }, { count: unchecked }, { data: last }] = await Promise.all([
    db.from("provider_health_actions").select("kind").gte("created_at", since).limit(10_000),
    db.from("provider_health_actions").select("id", { count: "exact", head: true }).is("applied_at", null).is("resolved_at", null).is("undone_at", null),
    db.from("olera-providers").select("provider_id", { count: "exact", head: true }).eq("deleted", false).not("google_status_checked_at", "is", null),
    db.from("olera-providers").select("provider_id", { count: "exact", head: true }).eq("deleted", false).not("place_id", "is", null).is("google_status_checked_at", null),
    db.from("provider_health_actions").select("created_at").order("created_at", { ascending: false }).limit(1),
  ]);
  const byKind: Record<string, number> = {};
  for (const r of recent ?? []) byKind[(r as { kind: string }).kind] = (byKind[(r as { kind: string }).kind] ?? 0) + 1;
  return {
    byKind,
    openFlags: openFlags ?? 0,
    checked: checked ?? 0,
    unchecked: unchecked ?? 0,
    lastActionAt: (last?.[0] as { created_at: string } | undefined)?.created_at ?? null,
  };
}

/**
 * Candidates for the monthly status pass: active, with a Place ID, never
 * checked, or checked more than `recheckDays` ago. Paged like the review
 * refresh so the whole directory is considered, not the first page.
 */
export async function getProvidersForStatusPass(db: SupabaseClient, recheckDays = 180): Promise<StatusCandidate[]> {
  const PAGE = 1000;
  const CONCURRENCY = 8;
  const staleBefore = new Date(Date.now() - recheckDays * 86_400_000).toISOString();
  const base = () => db
    .from("olera-providers")
    .select("provider_id, place_id, slug, last_viewed_at, google_status_checked_at")
    .eq("deleted", false)
    .not("place_id", "is", null)
    .or(`google_status_checked_at.is.null,google_status_checked_at.lt.${staleBefore}`)
    .order("provider_id");
  const { count, error: countError } = await db
    .from("olera-providers")
    .select("provider_id", { count: "exact", head: true })
    .eq("deleted", false)
    .not("place_id", "is", null)
    .or(`google_status_checked_at.is.null,google_status_checked_at.lt.${staleBefore}`);
  if (countError) throw countError;
  const pages = Math.ceil((count ?? 0) / PAGE);
  const out: StatusCandidate[] = [];
  for (let first = 0; first < pages; first += CONCURRENCY) {
    const results = await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pages - first) }, (_, i) => base().range((first + i) * PAGE, (first + i + 1) * PAGE - 1)),
    );
    for (const { data, error } of results) {
      if (error) throw error;
      out.push(...((data ?? []) as unknown as StatusCandidate[]));
    }
  }
  return out;
}

/** Provider slugs with any Search Console clicks in the last `days`, from growth_page_metrics. */
export async function getClickedProviderSlugs(db: SupabaseClient, days = 90): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const slugs = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("growth_page_metrics")
      .select("page_path")
      .eq("page_category", "provider")
      .gt("search_clicks", 0)
      .gte("week_start", since)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const slug = String((row as { page_path: string }).page_path).replace(/^\/provider\//, "").split("?")[0];
      if (slug) slugs.add(slug);
    }
    if (!data || data.length < PAGE) break;
  }
  return slugs;
}

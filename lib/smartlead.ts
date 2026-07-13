/**
 * Smartlead outbound engine — the cold-outreach counterpart to the Resend
 * (transactional) path in lib/email.ts.
 *
 * Architecture (three-tier email plan, tier 2):
 *   - Tier 1 transactional/crown-jewel mail stays on olera.care via Resend
 *     (lib/email.ts). Zero cold ever.
 *   - Tier 2 cold MedJobs outreach runs through Smartlead on dedicated cousin
 *     domains (e.g. findmedjobs.co), built-in rotation + continuous warmup.
 *
 * This module is the API client that the MedJobs sequencer drives to create
 * campaigns, attach the warmed mailbox pool, push leads, save sequences, and
 * start/pause sends — mirroring how the app drives Resend today. It performs
 * NO CRM mutations: reply/bounce ingestion back into the student-outreach CRM
 * is a separate, deferred step (D2) gated on Logan's sign-off, and must route
 * through the existing route.ts action handlers per the G4 single-writer rule —
 * never through this module.
 *
 * Everything is env-gated and fails closed-but-explicit: with no
 * SMARTLEAD_API_KEY, every call returns { ok: false, error } rather than
 * throwing, so a missing key can never crash a request path. The feature is a
 * no-op until SMARTLEAD_API_KEY is set.
 *
 * NOTE: endpoint paths and payload shapes follow Smartlead's documented v1 REST
 * API. Verify them against the current Smartlead API docs before going live —
 * this module is dormant until the key is set, so shape drift is harmless until
 * then.
 */

const SMARTLEAD_BASE_URL =
  process.env.SMARTLEAD_BASE_URL || "https://server.smartlead.ai/api/v1";

/** Smartlead campaign lifecycle states. */
export type SmartleadCampaignStatus = "START" | "PAUSED" | "STOPPED";

export interface SmartleadResult<T> {
  ok: boolean;
  data?: T;
  /** Present when ok is false. Human-readable; safe to log. */
  error?: string;
  /** HTTP status when a request was actually made. */
  status?: number;
}

export interface SmartleadCampaign {
  id: number;
  name: string;
  status?: string;
}

export interface SmartleadEmailAccount {
  id: number;
  from_email: string;
  from_name?: string;
  /** Smartlead's warmup health score, when present. */
  warmup_details?: { warmup_reputation?: string; status?: string };
}

/** One step in a Smartlead drip sequence. */
export interface SmartleadSequenceStep {
  /** 1-based position in the sequence. */
  seq_number: number;
  /** Days to wait after the previous step before sending this one. */
  seq_delay_details: { delay_in_days: number };
  subject: string;
  /** HTML body. Supports Smartlead merge tags like {{first_name}}. */
  email_body: string;
}

/** A lead to push into a campaign. Smartlead dedupes on email. */
export interface SmartleadLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  /** Arbitrary merge fields available to sequence templates. */
  custom_fields?: Record<string, string>;
}

function getApiKey(): string | null {
  return process.env.SMARTLEAD_API_KEY || null;
}

/** True once SMARTLEAD_API_KEY is set. Cheap gate for callers. */
export function isSmartleadConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Low-level request helper. Appends the api_key query param (Smartlead's auth
 * scheme), parses JSON, and normalizes every outcome into a SmartleadResult.
 * Never throws.
 */
async function smartleadRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<SmartleadResult<T>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: "SMARTLEAD_API_KEY not configured" };
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `${SMARTLEAD_BASE_URL}${path}${separator}api_key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON body (rare) — surface the raw text as the error/data below.
        parsed = text;
      }
    }

    if (!res.ok) {
      // Surface as much of Smartlead's error body as we can — different
      // endpoints return {message}, {error}, {errors:[...]}, or a bare string.
      // Falling back to the raw JSON keeps the real reason visible instead of
      // a useless "HTTP 400".
      let message: string;
      if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        message =
          (typeof o.message === "string" && o.message) ||
          (typeof o.error === "string" && o.error) ||
          (Array.isArray(o.errors) ? o.errors.map(String).join("; ") : "") ||
          JSON.stringify(o);
      } else if (typeof parsed === "string" && parsed.trim()) {
        message = parsed;
      } else {
        message = `HTTP ${res.status}`;
      }
      message = `HTTP ${res.status}: ${message}`;
      console.error(`[smartlead] ${method} ${path} → ${message}`);
      return { ok: false, error: message, status: res.status };
    }

    return { ok: true, data: parsed as T, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[smartlead] ${method} ${path} failed:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Create a campaign. Returns the new campaign id, which every other call needs.
 */
export async function createCampaign(
  name: string,
  clientId?: number
): Promise<SmartleadResult<SmartleadCampaign>> {
  return smartleadRequest<SmartleadCampaign>("POST", "/campaigns/create", {
    name,
    ...(clientId !== undefined ? { client_id: clientId } : {}),
  });
}

/**
 * Save (replace) the drip sequence for a campaign. Steps are sent in order;
 * each step's delay is relative to the previous one.
 */
export async function saveSequence(
  campaignId: number,
  steps: SmartleadSequenceStep[]
): Promise<SmartleadResult<{ ok?: boolean }>> {
  return smartleadRequest("POST", `/campaigns/${campaignId}/sequences`, {
    sequences: steps,
  });
}

/**
 * Attach warmed mailboxes (by Smartlead email-account id) to a campaign.
 * Smartlead rotates sends across all attached accounts automatically.
 */
export async function attachEmailAccounts(
  campaignId: number,
  emailAccountIds: number[]
): Promise<SmartleadResult<{ ok?: boolean }>> {
  return smartleadRequest("POST", `/campaigns/${campaignId}/email-accounts`, {
    email_account_ids: emailAccountIds,
  });
}

/**
 * The Smartlead lifecycle events the MedJobs edge function ingests. Single
 * source of truth shared by the auto-registration path (campaign creation)
 * and the admin reconcile endpoint so the two can never drift.
 *
 * NOTE: `EMAIL_BOUNCE` is intentionally absent — Smartlead's API rejects it as
 * an invalid webhook event type (confirmed live). Bounces therefore do NOT flow
 * through this webhook today; the edge function still handles a bounce payload
 * defensively if one ever arrives, but none is registered. Do not add it back
 * without re-verifying against Smartlead's accepted event-type list.
 */
export const SMARTLEAD_WEBHOOK_EVENT_TYPES = [
  "EMAIL_SENT",
  "EMAIL_OPEN",
  "EMAIL_LINK_CLICK",
  "EMAIL_REPLY",
  "LEAD_UNSUBSCRIBED",
] as const;

/** Display name used for the MedJobs webhook in Smartlead's campaign settings. */
export const SMARTLEAD_WEBHOOK_NAME = "MedJobs CRM";

/** URL path of our Supabase edge function (the bit that identifies OUR webhook
 *  regardless of the `?secret=` query, which can rotate). */
const SMARTLEAD_WEBHOOK_PATH = "/functions/v1/smartlead-webhook";

/**
 * Build the MedJobs webhook URL from the Supabase project URL + a secret.
 * Returns null when either input is unavailable (server env not configured) so
 * callers can degrade gracefully instead of registering a broken URL.
 */
export function buildSmartleadWebhookUrl(secret: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !secret) return null;
  return `${base.replace(/\/+$/, "")}${SMARTLEAD_WEBHOOK_PATH}?secret=${encodeURIComponent(secret)}`;
}

/** True when a Smartlead webhook URL points at OUR edge function. Matches on the
 *  URL PATH only, so a rotated `?secret=` still matches (we update it in place
 *  rather than creating a duplicate). */
export function isMedjobsWebhook(webhookUrl: string | undefined | null): boolean {
  if (!webhookUrl) return false;
  try {
    return new URL(webhookUrl).pathname.endsWith(SMARTLEAD_WEBHOOK_PATH);
  } catch {
    return webhookUrl.includes(SMARTLEAD_WEBHOOK_PATH);
  }
}

/** Case-insensitive set equality between a webhook's event_types and the desired
 *  set. Used to decide whether an existing MedJobs webhook needs updating. */
export function sameEventTypeSet(a: string[] | undefined, b: readonly string[]): boolean {
  if (!a) return false;
  const sa = new Set(a.map((s) => s.toUpperCase()));
  if (sa.size !== b.length) return false;
  return b.every((t) => sa.has(t.toUpperCase()));
}

/** Whether an existing webhook URL already carries the desired secret. Lets us
 *  skip a redundant update when both the path and the secret already match. */
function webhookSecretMatches(webhookUrl: string | undefined, desiredSecret: string): boolean {
  if (!webhookUrl) return false;
  try {
    return (new URL(webhookUrl).searchParams.get("secret") ?? "") === desiredSecret;
  } catch {
    return false;
  }
}

export interface SmartleadWebhook {
  id: number;
  name?: string;
  webhook_url?: string;
  event_types?: string[];
}

/**
 * List the webhooks registered on a campaign. Read-only — the diagnostic that
 * lets us SEE whether our webhook is wired (the codebase previously had no way
 * to check, only to create). Response shape is normalized defensively:
 * Smartlead has returned a bare array, `{ data: [...] }`, or `{ webhooks: [...] }`
 * across versions.
 */
export async function listCampaignWebhooks(
  campaignId: number,
): Promise<SmartleadResult<SmartleadWebhook[]>> {
  const raw = await smartleadRequest<unknown>("GET", `/campaigns/${campaignId}/webhooks`);
  if (!raw.ok) return { ok: false, error: raw.error, status: raw.status };

  const d = raw.data;
  let arr: unknown[] = [];
  if (Array.isArray(d)) arr = d;
  else if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (Array.isArray(o.data)) arr = o.data;
    else if (Array.isArray(o.webhooks)) arr = o.webhooks;
  }

  const webhooks: SmartleadWebhook[] = arr.map((w) => {
    const o = (w ?? {}) as Record<string, unknown>;
    return {
      id: typeof o.id === "number" ? o.id : Number(o.id) || 0,
      name: typeof o.name === "string" ? o.name : undefined,
      webhook_url:
        typeof o.webhook_url === "string"
          ? o.webhook_url
          : typeof o.url === "string"
            ? o.url
            : undefined,
      event_types: Array.isArray(o.event_types)
        ? (o.event_types as unknown[]).map(String)
        : undefined,
    };
  });
  return { ok: true, data: webhooks, status: raw.status };
}

/**
 * Register or UPDATE a webhook on a campaign. Passing `id` updates that webhook
 * in place (Smartlead's upsert-by-id); omitting it (id=null) creates a new one.
 * Endpoint/shape follows Smartlead's documented create-webhook API.
 *
 * Prefer `ensureCampaignWebhook` over calling this directly — it lists first and
 * only creates when ours is genuinely absent, so repeated runs never stack
 * duplicate webhooks (which would double-deliver every event).
 */
export async function createCampaignWebhook(
  campaignId: number,
  webhook: { name: string; webhookUrl: string; eventTypes: readonly string[]; id?: number | null },
): Promise<SmartleadResult<{ id?: number }>> {
  return smartleadRequest("POST", `/campaigns/${campaignId}/webhooks`, {
    id: webhook.id ?? null,
    name: webhook.name,
    webhook_url: webhook.webhookUrl,
    event_types: [...webhook.eventTypes],
  });
}

export interface EnsureWebhookResult {
  ok: boolean;
  /** "skipped" only from `ensureMedjobsCampaignWebhook` when env is unconfigured. */
  status: "created" | "updated" | "exists" | "error" | "skipped";
  error?: string;
}

/**
 * Idempotently ensure the MedJobs webhook is registered on a campaign with the
 * right URL (incl. secret) and event types. Lists existing webhooks, matches
 * ours by URL path, and creates OR updates as needed — safe to run repeatedly,
 * never creating duplicates.
 */
export async function ensureCampaignWebhook(
  campaignId: number,
  webhookUrl: string,
  eventTypes: readonly string[] = SMARTLEAD_WEBHOOK_EVENT_TYPES,
): Promise<EnsureWebhookResult> {
  const list = await listCampaignWebhooks(campaignId);
  if (!list.ok) {
    return { ok: false, status: "error", error: list.error ?? "listCampaignWebhooks failed" };
  }

  let desiredSecret = "";
  try {
    desiredSecret = new URL(webhookUrl).searchParams.get("secret") ?? "";
  } catch {
    desiredSecret = "";
  }

  const existing = (list.data ?? []).find((w) => isMedjobsWebhook(w.webhook_url));

  if (existing) {
    const upToDate =
      sameEventTypeSet(existing.event_types, eventTypes) &&
      webhookSecretMatches(existing.webhook_url, desiredSecret);
    if (upToDate) return { ok: true, status: "exists" };
    const upd = await createCampaignWebhook(campaignId, {
      id: existing.id,
      name: SMARTLEAD_WEBHOOK_NAME,
      webhookUrl,
      eventTypes,
    });
    return upd.ok
      ? { ok: true, status: "updated" }
      : { ok: false, status: "error", error: upd.error };
  }

  const created = await createCampaignWebhook(campaignId, {
    name: SMARTLEAD_WEBHOOK_NAME,
    webhookUrl,
    eventTypes,
  });
  return created.ok
    ? { ok: true, status: "created" }
    : { ok: false, status: "error", error: created.error };
}

/**
 * Best-effort webhook registration using the SERVER env secret — the path the
 * campaign-provisioning code calls so every new campus campaign is wired at
 * birth. Returns `status: "skipped"` (never throws, never errors the caller)
 * when `SMARTLEAD_WEBHOOK_SECRET` / `NEXT_PUBLIC_SUPABASE_URL` are unset, so a
 * missing env var degrades to "no webhook yet" rather than failing enrollment.
 * The reconcile endpoint wires anything this skips.
 */
export async function ensureMedjobsCampaignWebhook(
  campaignId: number,
): Promise<EnsureWebhookResult> {
  const secret = (process.env.SMARTLEAD_WEBHOOK_SECRET ?? "").trim();
  const url = buildSmartleadWebhookUrl(secret);
  if (!url) {
    return {
      ok: false,
      status: "skipped",
      error: "SMARTLEAD_WEBHOOK_SECRET or NEXT_PUBLIC_SUPABASE_URL unset",
    };
  }
  try {
    return await ensureCampaignWebhook(campaignId, url);
  } catch (e) {
    return { ok: false, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Push leads into a campaign. Smartlead caps the batch size per request
 * (currently ~100); callers with larger lists should chunk before calling.
 * `ignoreGlobalBlockList`/dedupe behavior is left at Smartlead defaults.
 */
export async function addLeads(
  campaignId: number,
  leads: SmartleadLead[]
): Promise<SmartleadResult<{ upload_count?: number; already_added_to_campaign?: number }>> {
  return smartleadRequest("POST", `/campaigns/${campaignId}/leads`, {
    lead_list: leads,
  });
}

/**
 * Set the sending schedule (timezone, days, window, throttle) for a campaign.
 * Shape is passed through verbatim to Smartlead — see their schedule docs.
 */
export async function setCampaignSchedule(
  campaignId: number,
  schedule: Record<string, unknown>
): Promise<SmartleadResult<{ ok?: boolean }>> {
  return smartleadRequest("POST", `/campaigns/${campaignId}/schedule`, schedule);
}

/**
 * Start, pause, or stop a campaign. Starting before the mailbox pool is warm
 * is the #1 way to torch domain reputation — gate this behind warmup checks at
 * the call site, not here.
 */
export async function setCampaignStatus(
  campaignId: number,
  status: SmartleadCampaignStatus
): Promise<SmartleadResult<{ ok?: boolean }>> {
  return smartleadRequest("POST", `/campaigns/${campaignId}/status`, { status });
}

/** List all connected email accounts (the mailbox pool) with warmup health. */
export async function listEmailAccounts(): Promise<SmartleadResult<SmartleadEmailAccount[]>> {
  return smartleadRequest<SmartleadEmailAccount[]>("GET", "/email-accounts");
}

/** Fetch a single campaign's current state. */
export async function getCampaign(
  campaignId: number
): Promise<SmartleadResult<SmartleadCampaign>> {
  return smartleadRequest<SmartleadCampaign>("GET", `/campaigns/${campaignId}`);
}

/**
 * Delete a campaign (and its leads/sequence). Used to tear down test
 * campaigns cleanly; irreversible on Smartlead's side, so gate call sites.
 */
export async function deleteCampaign(
  campaignId: number
): Promise<SmartleadResult<{ ok?: boolean }>> {
  return smartleadRequest("DELETE", `/campaigns/${campaignId}`);
}

/**
 * v10 Phase 2+3 Bullet 6 follow-up (2026-06-04): list all leads currently
 * enrolled in a Smartlead campaign. Used by the
 * /admin/medjobs/smartlead-refresh-leads page to walk every existing lead
 * and backfill `custom_fields.welcome_url` after the magic-link rollout.
 *
 * Smartlead paginates this endpoint; we fetch one page at a time. The
 * caller drives the offset/limit loop.
 */
export interface SmartleadCampaignLead {
  /** Smartlead-internal lead id (used by updateLead). */
  lead_id?: number;
  id?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  custom_fields?: Record<string, unknown> | null;
}

export async function listCampaignLeads(
  campaignId: number,
  options: { limit?: number; offset?: number } = {}
): Promise<SmartleadResult<{ data?: SmartleadCampaignLead[]; total_leads?: number }>> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const raw = await smartleadRequest<{ data?: unknown[]; total_leads?: number }>(
    "GET",
    `/campaigns/${campaignId}/leads?limit=${limit}&offset=${offset}`,
  );
  if (!raw.ok) {
    return { ok: false, error: raw.error, status: raw.status };
  }
  // Smartlead's list-leads response wraps each lead under a `lead` key (the
  // outer object is the campaign-lead map), and may return custom_fields as
  // an array of { key, value }. Normalize to the flat SmartleadCampaignLead
  // the callers expect — without this, email/custom_fields read as missing.
  const items = (raw.data?.data ?? []) as Array<Record<string, unknown>>;
  const data: SmartleadCampaignLead[] = items.map((item) => {
    const l = ((item.lead ?? item) as Record<string, unknown>) ?? {};
    const id = typeof l.id === "number" ? l.id : undefined;
    return {
      lead_id: id,
      id,
      email: typeof l.email === "string" ? l.email : undefined,
      first_name: typeof l.first_name === "string" ? l.first_name : undefined,
      last_name: typeof l.last_name === "string" ? l.last_name : undefined,
      company_name: typeof l.company_name === "string" ? l.company_name : undefined,
      custom_fields: normalizeCustomFields(l.custom_fields),
    };
  });
  return { ok: true, data: { data, total_leads: raw.data?.total_leads }, status: raw.status };
}

/** Smartlead may return lead custom_fields as a flat object OR an array of
 *  { key, value } entries. Normalize to a flat object (or null). */
function normalizeCustomFields(cf: unknown): Record<string, unknown> | null {
  if (!cf) return null;
  if (Array.isArray(cf)) {
    const obj: Record<string, unknown> = {};
    for (const entry of cf) {
      if (entry && typeof entry === "object" && "key" in entry) {
        const k = (entry as { key?: unknown }).key;
        if (typeof k === "string") obj[k] = (entry as { value?: unknown }).value;
      }
    }
    return obj;
  }
  if (typeof cf === "object") return cf as Record<string, unknown>;
  return null;
}

/**
 * v10 Phase 2+3 Bullet 6 follow-up (2026-06-04): update a single lead's
 * fields inside a campaign. Used to backfill `custom_fields.welcome_url`
 * on existing leads after the magic-link rollout — new leads get it
 * automatically via `rowToLeads`; existing ones predate the field.
 *
 * Smartlead's update-lead-in-campaign endpoint accepts a partial lead
 * shape; only the fields you pass are updated. Smartlead-internal IDs
 * + email stay as-is.
 */
export async function updateLeadInCampaign(
  campaignId: number,
  leadId: number,
  patch: { email?: string; custom_fields?: Record<string, unknown>; first_name?: string; last_name?: string }
): Promise<SmartleadResult<{ ok?: boolean }>> {
  return smartleadRequest(
    "POST",
    `/campaigns/${campaignId}/leads/${leadId}`,
    patch
  );
}

/**
 * One entry in a lead's email thread. `type` is Smartlead's direction marker
 * ("SENT" for our outbound sequence steps, "REPLY" for the prospect's inbound
 * reply). Field names vary across Smartlead versions, so the reader normalizes
 * defensively — verify the live shape via the backfill dry-run before applying.
 */
export interface SmartleadMessage {
  type: string;
  email_body?: string;
  subject?: string;
  time?: string;
  /** Best available stable id for dedupe (message id, else stats id). */
  message_id?: string;
  /** The address the message came from (the prospect, on a REPLY). */
  from_email?: string;
}

/**
 * Fetch a lead's full message history within a campaign (SENT steps + REPLYs).
 * Read-only. Used by the reply BACKFILL to import replies that predate webhook
 * registration. Response shape is normalized defensively: Smartlead has returned
 * a bare array, `{ history: [...] }`, or `{ data: [...] }` across versions.
 */
export async function getLeadMessageHistory(
  campaignId: number,
  leadId: number,
): Promise<SmartleadResult<SmartleadMessage[]>> {
  const raw = await smartleadRequest<unknown>(
    "GET",
    `/campaigns/${campaignId}/leads/${leadId}/message-history`,
  );
  if (!raw.ok) return { ok: false, error: raw.error, status: raw.status };

  const d = raw.data;
  let arr: unknown[] = [];
  if (Array.isArray(d)) arr = d;
  else if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (Array.isArray(o.history)) arr = o.history;
    else if (Array.isArray(o.data)) arr = o.data;
    else if (Array.isArray(o.message_history)) arr = o.message_history;
  }

  const messages: SmartleadMessage[] = arr.map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined;
    return {
      type: String(o.type ?? o.email_type ?? o.stats_type ?? "").toUpperCase(),
      email_body: str(o.email_body ?? o.body ?? o.email_message ?? o.message),
      subject: str(o.subject ?? o.email_subject),
      time: str(o.time ?? o.event_timestamp ?? o.sent_time ?? o.created_at),
      message_id: str(o.message_id ?? o.stats_id ?? o.id ?? o.email_message_id),
      from_email: str(o.from_email ?? o.from),
    };
  });
  return { ok: true, data: messages, status: raw.status };
}

/**
 * Look up a Smartlead lead's internal id by email address. Smartlead's
 * fetch-lead-by-email endpoint returns the lead object (across all campaigns);
 * we only need its `id` to drive per-campaign actions like pause. Returns null
 * (ok:true, data:null) when no lead matches. Shape is defensive — Smartlead has
 * returned the lead bare, under a `lead` key, or inside `data` in the wild.
 *
 * Endpoint follows Smartlead's documented "fetch lead by email" API — verify
 * against current docs before go-live (dormant until SMARTLEAD_API_KEY is set).
 */
export async function getLeadByEmail(
  email: string
): Promise<SmartleadResult<{ id: number } | null>> {
  const raw = await smartleadRequest<unknown>(
    "GET",
    `/leads/?email=${encodeURIComponent(email)}`
  );
  if (!raw.ok) return { ok: false, error: raw.error, status: raw.status };

  const pickId = (o: unknown): number | null => {
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    const inner = (rec.lead ?? rec) as Record<string, unknown>;
    return typeof inner.id === "number" ? inner.id : null;
  };

  let id: number | null = null;
  const d = raw.data;
  if (Array.isArray(d)) {
    id = d.length > 0 ? pickId(d[0]) : null;
  } else if (d && typeof d === "object" && Array.isArray((d as Record<string, unknown>).data)) {
    const arr = (d as { data: unknown[] }).data;
    id = arr.length > 0 ? pickId(arr[0]) : null;
  } else {
    id = pickId(d);
  }

  return { ok: true, data: id != null ? { id } : null, status: raw.status };
}

/**
 * Pause a single lead's drip within a campaign (Smartlead stops scheduling that
 * lead's remaining sequence steps). Used on conversion so a Client/Partner stops
 * receiving cold + activation emails even when they converted via a call rather
 * than an email reply (Smartlead only auto-pauses on a detected reply).
 *
 * Endpoint follows Smartlead's documented "pause lead by campaign id" API —
 * verify against current docs before go-live (dormant until the key is set).
 */
export async function pauseLeadInCampaign(
  campaignId: number,
  leadId: number
): Promise<SmartleadResult<{ ok?: boolean }>> {
  return smartleadRequest(
    "POST",
    `/campaigns/${campaignId}/leads/${leadId}/pause`
  );
}

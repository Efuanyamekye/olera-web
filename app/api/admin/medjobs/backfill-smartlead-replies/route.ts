/**
 * GET/POST /api/admin/medjobs/backfill-smartlead-replies
 *
 * One-off (re-runnable) backfill that imports replies which landed in Smartlead
 * BEFORE the reply webhook was registered. Walks each medjobs campaign's leads,
 * pulls each lead's message history, and imports every REPLY as an
 * `email_replied` touchpoint — the exact touchpoint the webhook writes, so it
 * surfaces identically in the Emails tab / reply modal / timeline.
 *
 * SAFETY:
 *  - GET  = dry-run. Reads only; writes NOTHING. Reports what it WOULD import
 *           (per campaign / row) plus a small sample of parsed replies so the
 *           live Smartlead `message-history` shape can be verified before apply.
 *  - POST = apply. Inserts touchpoints with dedupe.
 *  - Deterministic resolution: API lead objects carry `custom_fields.outreach_id`,
 *    so each reply maps to its row exactly (no fragile email matching).
 *  - Idempotent dedupe: skips a reply when an `email_replied` touchpoint already
 *    exists for the row with the same Smartlead message id, OR the same
 *    from_email within ~5 min of an existing reply (so it can't double-count a
 *    reply the live webhook already ingested).
 *
 * Bounded: processes at most `maxLeads` leads per run (default 300; override via
 * ?maxLeads=). Scope to one campaign with ?campaign=<id>. Re-run to continue —
 * dedupe makes repeated runs safe.
 *
 * Auth: admin-only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin";
import {
  getLeadMessageHistory,
  isSmartleadConfigured,
  listCampaignLeads,
  type SmartleadMessage,
} from "@/lib/smartlead";

export const maxDuration = 300;

// Statuses a reply promotes to `engaged` — mirrors the edge function + handleLogReply.
const PROMOTE_ON_REPLY = new Set([
  "outreach_sent",
  "researched",
  "prospect",
  "no_response_closed",
]);

const LEAD_PAGE = 100;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

// Derive the service-client type from an actual invocation so it carries the
// permissive schema generics (a bare `ReturnType<typeof createServiceClient>`
// resolves to the default `never` schema, which types `.insert()`/`.update()`
// payloads as `never`).
function makeServiceClient(url: string, key: string) {
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type ServiceClient = ReturnType<typeof makeServiceClient>;

interface ParsedReply {
  outreach_id: string;
  smartlead_event_id: string;
  reply_body: string | null;
  preview_text: string | null;
  reply_subject: string | null;
  from_email: string | null;
  occurred_at: string;
  recipient_email: string | null;
}

/** Collect every distinct medjobs campaign id (cold + activation + welcome). */
async function collectCampaignIds(supabase: ServiceClient, only?: number): Promise<number[]> {
  if (only != null) return [only];
  const { data: rows } = await supabase
    .from("student_outreach")
    .select("research_data");
  const ids = new Set<number>();
  for (const r of ((rows ?? []) as unknown) as Array<{ research_data: Record<string, unknown> | null }>) {
    const rd = r.research_data ?? {};
    for (const key of ["smartlead", "smartlead_activation", "smartlead_welcome"]) {
      const cid = (rd[key] as { campaign_id?: number } | undefined)?.campaign_id;
      if (typeof cid === "number" && Number.isFinite(cid)) ids.add(cid);
    }
  }
  return [...ids];
}

function isReply(m: SmartleadMessage): boolean {
  const t = (m.type ?? "").toUpperCase();
  return t.includes("REPLY") || t.includes("REPLIED");
}

/** Build a parsed reply from a message-history entry, or null when it isn't a
 *  usable reply (not a REPLY row, or no outreach_id on the lead). */
function toParsedReply(
  m: SmartleadMessage,
  outreachId: string | null,
  leadEmail: string | null,
  campaignId: number,
  leadId: number,
  index: number,
): ParsedReply | null {
  if (!isReply(m)) return null;
  if (!outreachId) return null;
  const occurred_at = m.time && !Number.isNaN(Date.parse(m.time)) ? new Date(m.time).toISOString() : null;
  // Stable dedupe id: prefer Smartlead's message id; else synthesize from the
  // campaign/lead/time so re-runs still dedupe against themselves.
  const smartlead_event_id =
    m.message_id ?? `sl-backfill-${campaignId}-${leadId}-${occurred_at ?? index}`;
  const body = m.email_body ?? null;
  return {
    outreach_id: outreachId,
    smartlead_event_id,
    reply_body: body,
    preview_text: body ? body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : null,
    reply_subject: m.subject ?? null,
    from_email: (m.from_email ?? leadEmail ?? null)?.toLowerCase() ?? null,
    occurred_at: occurred_at ?? new Date().toISOString(),
    recipient_email: leadEmail?.toLowerCase() ?? null,
  };
}

/** Has this reply already been recorded (by the webhook or a prior backfill)? */
async function alreadyRecorded(supabase: ServiceClient, reply: ParsedReply): Promise<boolean> {
  // 1. Exact Smartlead id match.
  const byId = await supabase
    .from("student_outreach_touchpoints")
    .select("id")
    .eq("outreach_id", reply.outreach_id)
    .eq("touchpoint_type", "email_replied")
    .filter("payload->>smartlead_event_id", "eq", reply.smartlead_event_id)
    .limit(1);
  if ((byId.data ?? []).length > 0) return true;

  // 2. Same sender within a tight time window (guards against a reply the live
  //    webhook already ingested under a different id field).
  if (reply.from_email) {
    const lo = new Date(new Date(reply.occurred_at).getTime() - DEDUPE_WINDOW_MS).toISOString();
    const hi = new Date(new Date(reply.occurred_at).getTime() + DEDUPE_WINDOW_MS).toISOString();
    const byWindow = await supabase
      .from("student_outreach_touchpoints")
      .select("id, payload")
      .eq("outreach_id", reply.outreach_id)
      .eq("touchpoint_type", "email_replied")
      .gte("created_at", lo)
      .lte("created_at", hi)
      .limit(20);
    for (const tp of (byWindow.data ?? []) as Array<{ payload: Record<string, unknown> | null }>) {
      const from = String((tp.payload ?? {}).from_email ?? "").toLowerCase();
      if (from && from === reply.from_email) return true;
    }
  }
  return false;
}

/**
 * Insert the historical reply as an `email_replied` touchpoint. DELIBERATELY
 * conservative vs. the live webhook (`handleReply`): it does NOT reset viewed_at
 * and does NOT supersede pending tasks. Those are real-time reactions to a reply
 * arriving NOW — replaying them for weeks-old replies would flood the inbox with
 * stale unread rows and, worse, cancel calls the admin has legitimately queued
 * since. Backfill's job is to make the reply DATA correct and visible (timeline,
 * reply modal, and — via the touchpoint driving last_reply_at — the Emails tab),
 * not to re-run the live workflow.
 *
 * Status promotion IS applied for genuinely pre-engagement rows (prospect /
 * researched / outreach_sent / no_response_closed) since a reply means they
 * engaged; rows that already advanced past those states are left untouched.
 */
async function importReply(supabase: ServiceClient, reply: ParsedReply): Promise<void> {
  const { data: rowData } = await supabase
    .from("student_outreach")
    .select("id, status")
    .eq("id", reply.outreach_id)
    .maybeSingle();
  const row = rowData as { id: string; status: string } | null;
  if (!row) return; // orphaned outreach_id — skip

  await supabase.from("student_outreach_touchpoints").insert({
    outreach_id: reply.outreach_id,
    contact_id: null,
    touchpoint_type: "email_replied",
    channel: "email",
    outcome: null,
    notes: null,
    payload: {
      source: "smartlead_backfill",
      smartlead_event_id: reply.smartlead_event_id,
      recipient_email: reply.recipient_email,
      reply_body: reply.reply_body,
      preview_text: reply.preview_text,
      reply_subject: reply.reply_subject,
      from_email: reply.from_email,
      occurred_at: reply.occurred_at,
    },
    created_by: null,
  });

  if (PROMOTE_ON_REPLY.has(row.status)) {
    const patch: Record<string, unknown> = { status: "engaged" };
    if (row.status === "no_response_closed") patch.reopen_at = null;
    await supabase.from("student_outreach").update(patch).eq("id", reply.outreach_id);
  }
}

async function run(request: Request, apply: boolean): Promise<Response> {
  const supaUser = await createClient();
  const { data: { user } } = await supaUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error (Supabase env)" }, { status: 500 });
  }
  if (!isSmartleadConfigured()) {
    return NextResponse.json({ error: "SMARTLEAD_API_KEY is not set in this environment." }, { status: 500 });
  }

  const url = new URL(request.url);
  const onlyCampaign = url.searchParams.get("campaign");
  const only = onlyCampaign && !Number.isNaN(Number(onlyCampaign)) ? Number(onlyCampaign) : undefined;
  const maxLeads = Number(url.searchParams.get("maxLeads") ?? "300") || 300;

  const supabase = makeServiceClient(supabaseUrl, serviceKey);

  const campaignIds = await collectCampaignIds(supabase, only);

  let leadsScanned = 0;
  let repliesFound = 0;
  let imported = 0;
  let skippedDuplicate = 0;
  let unresolved = 0; // reply with no outreach_id on the lead
  let capped = false;
  const errors: string[] = [];
  const sample: Array<Record<string, unknown>> = [];

  outer: for (const campaignId of campaignIds) {
    let offset = 0;
    // Paginate the campaign's leads.
    for (;;) {
      if (leadsScanned >= maxLeads) { capped = true; break outer; }
      const leadsRes = await listCampaignLeads(campaignId, { limit: LEAD_PAGE, offset });
      if (!leadsRes.ok) {
        errors.push(`campaign ${campaignId} listLeads: ${leadsRes.error}`);
        break;
      }
      const leads = leadsRes.data?.data ?? [];
      if (leads.length === 0) break;

      for (const lead of leads) {
        if (leadsScanned >= maxLeads) { capped = true; break outer; }
        leadsScanned += 1;
        const leadId = lead.lead_id ?? lead.id;
        if (typeof leadId !== "number") continue;
        const outreachId = lead.custom_fields?.outreach_id != null
          ? String(lead.custom_fields.outreach_id)
          : null;

        const histRes = await getLeadMessageHistory(campaignId, leadId);
        if (!histRes.ok) {
          errors.push(`campaign ${campaignId} lead ${leadId} history: ${histRes.error}`);
          continue;
        }
        const messages = histRes.data ?? [];
        messages.forEach((m, i) => {
          if (!isReply(m)) return;
          repliesFound += 1;
          const parsed = toParsedReply(m, outreachId, lead.email ?? null, campaignId, leadId, i);
          if (!parsed) { unresolved += 1; return; }
          if (sample.length < 8) {
            sample.push({
              campaign_id: campaignId,
              outreach_id: parsed.outreach_id,
              from_email: parsed.from_email,
              subject: parsed.reply_subject,
              occurred_at: parsed.occurred_at,
              preview: parsed.preview_text?.slice(0, 120) ?? null,
            });
          }
        });

        if (!apply) continue;

        // Apply: import each resolvable reply with dedupe.
        for (let i = 0; i < messages.length; i++) {
          const m = messages[i];
          const parsed = toParsedReply(m, outreachId, lead.email ?? null, campaignId, leadId, i);
          if (!parsed) continue;
          try {
            if (await alreadyRecorded(supabase, parsed)) { skippedDuplicate += 1; continue; }
            await importReply(supabase, parsed);
            imported += 1;
          } catch (e) {
            errors.push(`import ${parsed.outreach_id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      if (leads.length < LEAD_PAGE) break;
      offset += LEAD_PAGE;
    }
  }

  return NextResponse.json({
    dry_run: !apply,
    campaigns: campaignIds.length,
    leads_scanned: leadsScanned,
    replies_found: repliesFound,
    replies_unresolved: unresolved, // reply present but lead had no outreach_id
    imported: apply ? imported : 0,
    skipped_duplicate: apply ? skippedDuplicate : 0,
    capped, // hit maxLeads — re-run to continue
    max_leads: maxLeads,
    sample,
    errors: errors.slice(0, 40),
  });
}

export async function GET(request: Request) {
  return run(request, false);
}

export async function POST(request: Request) {
  return run(request, true);
}

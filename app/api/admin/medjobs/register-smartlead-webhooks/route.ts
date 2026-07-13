/**
 * POST /api/admin/medjobs/register-smartlead-webhooks
 *
 * One-click "Connect Smartlead replies" — reconciles our reply webhook across
 * every campus Smartlead campaign (cold + activation + partner-welcome) so
 * replies/opens/clicks/bounces flow into the Emails tab. Idempotent: it lists
 * each campaign's existing webhooks first and only creates/updates ours, so
 * re-running never stacks duplicate webhooks (which would double-deliver every
 * event). New campaigns are wired automatically at creation (the bridge's
 * provisionCampaign); this endpoint clears the backlog of campaigns created
 * before that, and heals any drift.
 *
 * Secret: taken from the request body when pasted, else from the server env
 * (SMARTLEAD_WEBHOOK_SECRET). It MUST equal the value set on the Supabase edge
 * function, since it's baked into the `?secret=` the function validates.
 *
 * Auth: admin-only. GET = dry-run — lists the campaigns that would be wired AND
 * reports, per campaign, whether OUR webhook is already registered (read-only
 * diagnostic; no writes).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin";
import {
  buildSmartleadWebhookUrl,
  ensureCampaignWebhook,
  isMedjobsWebhook,
  isSmartleadConfigured,
  listCampaignWebhooks,
} from "@/lib/smartlead";

export const maxDuration = 120;

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

/** Collect every distinct Smartlead campaign id across the three medjobs
 *  cadences (cold `smartlead`, `smartlead_activation`, partner `smartlead_welcome`),
 *  mapped to a campus slug for display. */
async function collectCampaigns(
  supabase: ServiceClient,
): Promise<{ campaigns: Map<number, string | null>; error?: string }> {
  const { data: rows, error } = await supabase
    .from("student_outreach")
    .select("research_data, campuses:campus_id (slug)");
  if (error) return { campaigns: new Map(), error: error.message };

  const campaigns = new Map<number, string | null>();
  for (const r of ((rows ?? []) as unknown) as Array<{
    research_data: Record<string, unknown> | null;
    campuses: { slug: string | null } | null;
  }>) {
    const rd = r.research_data ?? {};
    const cold = (rd.smartlead as { campaign_id?: number } | undefined)?.campaign_id;
    const act = (rd.smartlead_activation as { campaign_id?: number } | undefined)?.campaign_id;
    const welcome = (rd.smartlead_welcome as { campaign_id?: number } | undefined)?.campaign_id;
    for (const cid of [cold, act, welcome]) {
      if (typeof cid === "number" && Number.isFinite(cid) && !campaigns.has(cid)) {
        campaigns.set(cid, r.campuses?.slug ?? null);
      }
    }
  }
  return { campaigns };
}

async function run(request: Request, apply: boolean): Promise<Response> {
  const supaUser = await createClient();
  const { data: { user } } = await supaUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error (Supabase env)" }, { status: 500 });
  }
  if (!isSmartleadConfigured()) {
    return NextResponse.json({ error: "SMARTLEAD_API_KEY is not set in this environment." }, { status: 500 });
  }

  const supabase = makeServiceClient(supabaseUrl, serviceKey);

  const { campaigns, error: collectError } = await collectCampaigns(supabase);
  if (collectError) {
    return NextResponse.json({ error: `Supabase query failed: ${collectError}` }, { status: 500 });
  }

  // ── Dry-run: report campaigns + whether OUR webhook is already registered ──
  if (!apply) {
    const rows = await Promise.all(
      [...campaigns.entries()].map(async ([id, slug]) => {
        const list = await listCampaignWebhooks(id);
        const registered = list.ok
          ? (list.data ?? []).some((w) => isMedjobsWebhook(w.webhook_url))
          : null; // null = couldn't check (API error)
        return { campaign_id: id, campus_slug: slug, registered };
      }),
    );
    return NextResponse.json({
      dry_run: true,
      campaigns: rows,
      total: campaigns.size,
      registered: rows.filter((r) => r.registered === true).length,
    });
  }

  // ── Apply: secret from body (pasted) else server env ──
  let secret = "";
  try {
    const body = (await request.json()) as { secret?: string };
    secret = (body.secret ?? "").trim();
  } catch {
    // no body — fall through to env
  }
  if (!secret) secret = (process.env.SMARTLEAD_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Paste your webhook secret (the same value set in Supabase), or set SMARTLEAD_WEBHOOK_SECRET on this environment." },
      { status: 400 },
    );
  }

  const webhookUrl = buildSmartleadWebhookUrl(secret);
  if (!webhookUrl) {
    return NextResponse.json({ error: "Could not build webhook URL (Supabase URL unset)." }, { status: 500 });
  }

  const created: number[] = [];
  const updated: number[] = [];
  const exists: number[] = [];
  const failed: { campaign_id: number; error?: string }[] = [];
  for (const [cid] of campaigns) {
    const res = await ensureCampaignWebhook(cid, webhookUrl);
    if (!res.ok) failed.push({ campaign_id: cid, error: res.error });
    else if (res.status === "created") created.push(cid);
    else if (res.status === "updated") updated.push(cid);
    else exists.push(cid);
  }

  return NextResponse.json({
    ok: failed.length === 0,
    total: campaigns.size,
    created,
    updated,
    exists,
    failed,
    // Total wired = anything that ended up registered (new or already there).
    wired: created.length + updated.length + exists.length,
  });
}

export async function GET(request: Request) {
  return run(request, false);
}

export async function POST(request: Request) {
  return run(request, true);
}

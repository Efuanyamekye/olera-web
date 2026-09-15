import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { parseNativeForms } from "@/lib/city-ads/meta-native";

async function allowed() {
  const user = await getAuthUser();
  return user && await getAdminUser(user.id);
}
export async function GET() {
  if (!await allowed()) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  let forms;
  try { forms = parseNativeForms(process.env.META_LEADS_FORMS_JSON); }
  catch { return NextResponse.json({ error: "Meta form configuration is invalid" }, { status: 503 }); }
  const configured = forms.length > 0 && !!process.env.META_LEADS_APP_SECRET &&
    !!process.env.META_LEADS_VERIFY_TOKEN && !!process.env.META_LEADS_PAGE_ACCESS_TOKEN &&
    /^v\d+\.0$/.test(process.env.META_LEADS_GRAPH_VERSION || "");
  const db = getServiceClient();
  const { data, error } = await db.from("meta_lead_receipts")
    .select("leadgen_id,form_id,status,received_at,last_attempt_at,last_error,attempts,lead_id")
    .order("received_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Meta inbox unavailable. Check database migration." }, { status: 503 });
  // Counts use the same lead outcomes as the city queue. No website visits or
  // assumed spend are used as a denominator for native submissions.
  const counts: Record<string, number> = {};
  for (const [key, status] of [["leads", null], ["introduced", "introduced"], ["accepted", "accepted"], ["reached", "contacted"], ["clients", "client"]] as const) {
    let q = db.from("city_leads").select("id", { count: "exact", head: true })
      .eq("capture_method", "meta_instant_form").eq("is_test", false);
    if (status === "introduced") q = q.gt("offer_count", 0);
    if (status === "accepted") q = q.not("accepted_offer_id", "is", null);
    if (status === "contacted") q = q.not("reached_at", "is", null);
    if (status === "client") q = q.or("status.eq.client,outcome.eq.client");
    const { count, error: e } = await q;
    if (e) return NextResponse.json({ error: "Meta outcomes unavailable" }, { status: 503 });
    counts[key] = count ?? 0;
  }
  const health: Record<string, number> = {};
  for (const status of ["pending", "processing", "failed", "duplicate", "blocked"] as const) {
    const { count, error: e } = await db.from("meta_lead_receipts").select("leadgen_id", { count: "exact", head: true }).eq("status",status);
    if (e) return NextResponse.json({ error: "Meta delivery health unavailable" }, { status: 503 });
    health[status] = count ?? 0;
  }
  const [clock, oldest, alertResult, alertCount, lastReceived, failedReceipts] = await Promise.all([
    db.from("cron_runs").select("started_at,status,summary").eq("job_id","city-lead-offers").order("started_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("meta_lead_receipts").select("received_at").in("status",["pending","processing","failed"]).order("received_at").limit(1).maybeSingle(),
    db.from("meta_lead_alerts").select("id,kind,status,created_at,last_error").in("status",["pending","sending","failed"]).order("created_at").limit(50),
    db.from("meta_lead_alerts").select("id",{count:"exact",head:true}).eq("status","failed"),
    db.from("meta_lead_receipts").select("received_at").order("received_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("meta_lead_receipts").select("leadgen_id,form_id,status,received_at,last_attempt_at,last_error,attempts,lead_id").eq("status","failed").order("received_at").limit(50),
  ]);
  if ([clock,oldest,alertResult,alertCount,lastReceived,failedReceipts].some(r=>r.error)) {
    return NextResponse.json({ error: "Meta health unavailable. Check migrations and cron logging." }, { status: 503 });
  }
  return NextResponse.json({ configured, forms, receipts: [...new Map([...(failedReceipts.data ?? []),...(data ?? [])].map(r=>[r.leadgen_id,r])).values()], counts, health,
    clock: clock.data, oldestPendingAt: oldest.data?.received_at ?? null,
    lastReceivedAt: lastReceived.data?.received_at ?? null, slackConfigured: !!process.env.SLACK_WEBHOOK_URL,
    alerts: alertResult.data, failedAlerts: alertCount.count ?? 0,
    clientRate: counts.leads > 0 ? counts.clients / counts.leads : null }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: NextRequest) {
  if (!await allowed()) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!/^\d{1,40}$/.test(body?.leadgenId ?? "")) return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  const { data, error } = await getServiceClient().from("meta_lead_receipts")
    .update({ status: "pending", attempts: 0, last_error: null })
    .eq("leadgen_id", body.leadgenId).eq("status", "failed").select("leadgen_id").maybeSingle();
  if (error) return NextResponse.json({ error: "Retry could not be queued" }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Only failed receipts can be retried" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

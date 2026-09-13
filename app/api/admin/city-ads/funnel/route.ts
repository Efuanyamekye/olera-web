import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { buildQuizFunnel, QUIZ_CLEAN_START, type QuizEvent, type QuizLead } from "@/lib/city-ads/quiz-funnel";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!await getAdminUser(user.id)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const now = new Date();
  const from = req.nextUrl.searchParams.get("from") ?? QUIZ_CLEAN_START;
  const to = req.nextUrl.searchParams.get("to") ?? now.toISOString();
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= Math.min(end, now.getTime()) || end > now.getTime() + 86400000) {
    return NextResponse.json({ error: "Choose a valid start and end date." }, { status: 400 });
  }
  const cutoff = new Date(Math.min(end, now.getTime())).toISOString();
  const db = getServiceClient();
  try {
    // Supabase caps each response; never render a silently truncated funnel.
    const events: QuizEvent[] = [];
    const leads: QuizLead[] = [];
    for (const table of ["growth_attribution_events", "city_leads"] as const) {
      let complete = false;
      for (let offset = 0; offset < 100000; offset += 1000) {
        let q = db.from(table).select(table === "growth_attribution_events"
          ? "anonymous_id,visit_id,page_path,occurred_at,event_type,metadata"
          : "slug,utm_source,utm_medium,gclid,fbclid,is_test");
        if (table === "growth_attribution_events") q = q.eq("page_category", "city_landing").in("event_type", ["page_landed", "cta_engaged", "lead_started"]);
        else q = q.eq("is_test", false);
        const time = table === "growth_attribution_events" ? "occurred_at" : "created_at";
        const { data, error } = await q.gte(time, new Date(start).toISOString()).lt(time, cutoff)
          .order(time).order("id").range(offset, offset + 999);
        if (error) throw error;
        if (table === "growth_attribution_events") events.push(...data as unknown as QuizEvent[]);
        else leads.push(...data as unknown as QuizLead[]);
        if (data.length < 1000) { complete = true; break; }
      }
      if (!complete) throw new Error("Reporting window too large; choose a shorter range.");
    }
    const { data: campaigns, error } = await db.from("city_campaigns").select("slug,channel");
    if (error) throw error;
    return NextResponse.json({ ...buildQuizFunnel(events, leads, campaigns ?? []), from: new Date(start).toISOString(), to: cutoff },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[city-ads/funnel]", error);
    return NextResponse.json({ error: "Quiz data could not be loaded. Retry or choose a shorter date range." }, { status: 503 });
  }
}

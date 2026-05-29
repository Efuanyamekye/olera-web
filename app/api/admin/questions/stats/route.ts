import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { buildSeries, resolveBucket, type Bucket } from "@/lib/admin-stats";

/**
 * GET /api/admin/questions/stats
 *
 * Returns stats for the PulseHeader. Two metrics from one query:
 *  - `total` / `delta`: needs-email backlog in the range (KPI)
 *  - `series`: ALL question creations per bucket (platform pulse chart)
 *
 * The KPI and the chart are intentionally different metrics. Needs-email is
 * the operator action queue; the pulse chart shows overall platform activity
 * so you can spot volume spikes that may precede the backlog growing.
 *
 * Query params:
 *  - `date_from` (ISO, inclusive). Omit for all-time.
 *  - `date_to`   (ISO, exclusive).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    const db = getServiceClient();

    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : now;
    const priorFrom = from ? new Date(from.getTime() - (to.getTime() - from.getTime())) : null;
    const queryStart = priorFrom ?? from ?? null;

    // Pre-fetch provider slugs with no email (live check, not stale flag)
    // Include all provider types: provider, organization, caregiver (exclude family)
    const [{ data: bpNoEmail }, { data: iosNoEmail }] = await Promise.all([
      db.from("business_profiles").select("slug").in("type", ["provider", "organization", "caregiver"]).is("email", null),
      db.from("olera-providers").select("slug").is("email", null).not("deleted", "is", true),
    ]);
    const noEmailSlugs = new Set<string>();
    for (const p of bpNoEmail ?? []) if (p.slug) noEmailSlugs.add(p.slug);
    for (const p of iosNoEmail ?? []) if (p.slug) noEmailSlugs.add(p.slug);

    // One query — pull everything in range+prior with provider_id so we can
    // compute both the needs-email KPI and the total-volume series from
    // the same result set.
    let q = db
      .from("provider_questions")
      .select("created_at, status, provider_id")
      .order("created_at", { ascending: true })
      .limit(50000);
    if (queryStart) q = q.gte("created_at", queryStart.toISOString());
    if (dateTo) q = q.lt("created_at", dateTo);

    const { data: rows, error } = await q;
    if (error) {
      console.error("Admin questions stats error:", error);
      return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
    }

    const allRows = rows ?? [];

    // Check if provider actually has no email (live data, not stale metadata flag)
    const isNeedsEmail = (r: (typeof allRows)[number]) => {
      return r.status !== "archived" && r.status !== "rejected" && noEmailSlugs.has(r.provider_id);
    };

    const inRange = (t: Date) => (from ? t >= from : true) && (dateTo ? t < to : true);
    const inPrior = (t: Date) => !!priorFrom && !!from && t >= priorFrom && t < from;

    // KPI: needs-email count in the current range + prior window for delta
    let kpiCurrent = 0;
    let kpiPrior = 0;
    for (const r of allRows) {
      if (!isNeedsEmail(r)) continue;
      const t = new Date(r.created_at);
      if (inRange(t)) kpiCurrent++;
      else if (inPrior(t)) kpiPrior++;
    }

    let delta: number | null = null;
    if (from) {
      if (kpiPrior === 0) delta = kpiCurrent > 0 ? 100 : 0;
      else delta = Math.round(((kpiCurrent - kpiPrior) / kpiPrior) * 100);
    }

    // Series: ALL questions per bucket in the current range
    const seriesTimestamps = allRows.map((r) => new Date(r.created_at)).filter(inRange);
    const bucket: Bucket = from
      ? resolveBucket(from, to)
      : resolveBucket(seriesTimestamps[0] ?? now, now);
    const seriesStart = from ?? seriesTimestamps[0] ?? now;
    const series = buildSeries(seriesTimestamps, seriesStart, to, bucket);

    return NextResponse.json({ total: kpiCurrent, delta, series, bucket });
  } catch (err) {
    console.error("Admin questions stats fatal:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

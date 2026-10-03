import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { fetchGoogleReviews } from "@/lib/google-places";
import { withCronRun } from "@/lib/crons/run";
import { getClaimedProviderIds, getProvidersForReviewRefresh, updateProviderGoogleReviews } from "@/lib/providers";
import { DEFAULT_REFRESH_CAP, planReviewRefresh } from "@/lib/providers/review-refresh-plan";

/**
 * GET /api/cron/google-reviews
 *
 * Monthly refresh of cached Google ratings and review counts, claimed
 * providers first. The plan (lib/providers/review-refresh-plan.ts) orders
 * every stale provider: claimed, then viewed in the last 30 days, then the
 * long tail, and cuts at a budget. Before 2 Oct 2026 the cron read only the
 * first 5,000 of 70,390 providers and matched "claimed" on a slug that differs
 * for one in ten claimed accounts, so claimed providers stayed stale for
 * months (two wrote in). Runs the 1st of each month at 3 AM UTC.
 *
 * Budget: GOOGLE_REVIEWS_REFRESH_CAP fetches per run (default 5,000, about
 * $125 at the Places reviews SKU). Claimed providers with a Place ID numbered
 * 828 on 2 Oct, so they always fit.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("google-reviews", async () => {
    const db = getServiceClient();
    const cap = Number(process.env.GOOGLE_REVIEWS_REFRESH_CAP) > 0 ? Number(process.env.GOOGLE_REVIEWS_REFRESH_CAP) : DEFAULT_REFRESH_CAP;

    let plan;
    try {
      const [claimedIds, providers] = await Promise.all([getClaimedProviderIds(db), getProvidersForReviewRefresh(db)]);
      plan = planReviewRefresh(providers, claimedIds, new Date(), cap);
    } catch (err) {
      console.error("[google-reviews-cron] Could not plan the refresh:", err);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const stats = { ...plan.counts, updated: 0, empty: 0, errors: 0 };
    if (!plan.items.length) return NextResponse.json({ message: "No providers to refresh", stats });

    // 50 at a time with a short pause: the same pace the cron has always run at.
    const BATCH_SIZE = 50;
    const DELAY_MS = 200;
    for (let i = 0; i < plan.items.length; i += BATCH_SIZE) {
      const batch = plan.items.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const data = await fetchGoogleReviews(p.place_id);
          if (!data) return null;
          await updateProviderGoogleReviews(p.provider_id, data, db);
          return p.provider_id;
        }),
      );
      for (const r of results) {
        if (r.status === "rejected") stats.errors++;
        else if (r.value) stats.updated++;
        else stats.empty++;
      }
      if (i + BATCH_SIZE < plan.items.length) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }

    // The `reviews` field is the Places Enterprise+Atmosphere SKU, about $25/1K.
    const costEstimate = (plan.items.length / 1000) * 25;
    console.log(`[google-reviews-cron] Done. T1:${stats.tier1} T2:${stats.tier2} T3:${stats.tier3} updated:${stats.updated} empty:${stats.empty} errors:${stats.errors} skipped:${stats.skipped} over_budget:${stats.overBudget} est_cost:$${costEstimate.toFixed(2)}`);
    return NextResponse.json({ message: "Google reviews refresh complete", stats, estimated_cost: `$${costEstimate.toFixed(2)}` });
  });
}

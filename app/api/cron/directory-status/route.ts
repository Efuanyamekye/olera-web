import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { fetchGooglePlaceStatus } from "@/lib/google-places";
import { withCronRun } from "@/lib/crons/run";
import { getClaimedProviderIds } from "@/lib/providers";
import { planStatusPass, STATUS_FREE_MONTHLY_REQUESTS } from "@/lib/providers/directory-health";
import { applyStatusObservation, getClickedProviderSlugs, getProvidersForStatusPass } from "@/lib/providers/directory-health.server";

/**
 * GET /api/cron/directory-status
 *
 * The free half of directory health. Google's Place Details Pro tier carries
 * businessStatus and displayName and allows 5,000 requests a month at $0, so
 * once a month this reads status and name for 5,000 providers the review
 * refresh (the 1st, Enterprise tier, carries the same fields) has not reached:
 * claimed first, then pages families actually click on from search, then by
 * last view, never-checked first. ~10,000 a month between the two; the whole
 * directory in about seven months with no new spend (TJ, 6 Oct 2026: "we're
 * definitely not spending $1,000").
 *
 * What it does with an answer is in lib/providers/directory-health.ts:
 * archive CLOSED_PERMANENTLY (reversible soft delete), apply cosmetic renames,
 * flag the rest. Every action lands in provider_health_actions with an undo.
 * Runs the 15th at 03:00 UTC. Cap: DIRECTORY_STATUS_CAP (default 5,000).
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("directory-status", async () => {
    const db = getServiceClient();
    const cap = Number(process.env.DIRECTORY_STATUS_CAP) > 0 ? Number(process.env.DIRECTORY_STATUS_CAP) : STATUS_FREE_MONTHLY_REQUESTS;

    let plan;
    let candidates = 0;
    try {
      const [claimedIds, clicked, providers] = await Promise.all([
        getClaimedProviderIds(db),
        getClickedProviderSlugs(db).catch((err) => { console.error("[directory-status] clicks unavailable:", err); return new Set<string>(); }),
        getProvidersForStatusPass(db),
      ]);
      candidates = providers.length;
      plan = planStatusPass(providers, claimedIds, clicked, cap);
    } catch (err) {
      console.error("[directory-status] Could not plan the pass:", err);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const stats = { candidates, planned: plan.length, checked: 0, empty: 0, errors: 0, actions: {} as Record<string, number> };
    if (!plan.length) return NextResponse.json({ message: "Nothing to check", stats });

    const BATCH_SIZE = 50;
    const DELAY_MS = 200;
    for (let i = 0; i < plan.length; i += BATCH_SIZE) {
      const batch = plan.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const observed = await fetchGooglePlaceStatus(p.place_id);
          if (!observed) return null;
          const applied = await applyStatusObservation(db, p.provider_id, observed, "google_status");
          return applied.actions;
        }),
      );
      for (const r of results) {
        if (r.status === "rejected") stats.errors++;
        else if (!r.value) stats.empty++;
        else {
          stats.checked++;
          for (const kind of r.value) stats.actions[kind] = (stats.actions[kind] ?? 0) + 1;
        }
      }
      if (i + BATCH_SIZE < plan.length) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }

    console.log(`[directory-status] Done. candidates:${stats.candidates} planned:${stats.planned} checked:${stats.checked} empty:${stats.empty} errors:${stats.errors} actions:${JSON.stringify(stats.actions)}`);
    return NextResponse.json({ message: "Directory status pass complete", stats, estimated_cost: "$0.00 (free Pro tier)" });
  });
}

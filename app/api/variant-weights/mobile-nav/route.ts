import { NextResponse } from "next/server";
import { getMobileNavVariantWeights } from "@/lib/analytics/mobile-nav-variant-weights";

// Public read endpoint for the live Mobile Nav variant weights. No auth —
// the data is non-sensitive (per-variant percentages + a version int)
// and the client-side variant assignment in useMobileNavVariant needs it
// on first paint of every provider page hit.
//
// Cache-Control tuning: s-maxage=30 + stale-while-revalidate=300. Means
// at most ~30s of staleness for a fresh viewer after TJ saves new
// weights — fine for a manual dial — and the SWR window keeps the
// origin from getting hammered if a cache shard expires under load.
// No-store on the response body would defeat the whole point.
export async function GET() {
  const record = await getMobileNavVariantWeights();
  return NextResponse.json(record, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { getTrends } from "@/lib/operating-map/trends.server";

/**
 * GET /api/admin/operating-map/trends?city=
 *
 * Which way each node is moving. Deliberately its own endpoint rather than
 * part of /metrics: it recounts every node over four windows, so folding it
 * into the numbers would make the whole map wait on the slowest of five
 * passes. The map paints its values first and the colours arrive after.
 *
 * There is no date range here on purpose — see trends.server.ts. The windows
 * are fixed at the last 7 and 30 days so the colour means the same thing
 * whatever period is on screen.
 */

/** Authorized response — never handed to Next's shared cache. See cities/. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const city = new URL(request.url).searchParams.get("city");
    const trends = await getTrends(getServiceClient(), city);
    return NextResponse.json({ trends });
  } catch (error) {
    console.error("[operating-map/trends] Failed:", error);
    return NextResponse.json({ error: "Failed to load trends" }, { status: 500 });
  }
}

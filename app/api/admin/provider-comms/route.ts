import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { loadProviderCommsReport } from "@/lib/provider-comms/load-report";

export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await getAdminUser(user.id)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const to = params.get("date_to") ?? new Date().toISOString();
  const from =
    params.get("date_from") ??
    new Date(Date.now() - 7 * 86400000).toISOString();
  const a = Date.parse(from),
    b = Date.parse(to);
  // One extra hour accommodates a 90-calendar-day window crossing fall DST.
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a >= b ||
    b - a > 90 * 86400000 + 3600000
  ) {
    return NextResponse.json(
      { error: "Choose a valid date range of up to 90 days." },
      { status: 400 },
    );
  }
  try {
    const report = await loadProviderCommsReport(
      getServiceClient(),
      new Date(a).toISOString(),
      new Date(b).toISOString(),
      params.get("include_internal") === "true",
    );
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not load a complete report. Retry or choose a shorter date range.",
      },
      { status: 500 },
    );
  }
}

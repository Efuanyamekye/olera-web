import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import {
  getBenefitsCompanionSettings,
  saveBenefitsCompanionSettings,
} from "@/lib/analytics/benefits-companion-settings";
import { BENEFITS_COMPANION_LIVE_READY } from "@/lib/analytics/benefits-companion-variant";

/** GET /api/admin/analytics/benefits-companion: the current mode and share. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ ...(await getBenefitsCompanionSettings()), liveReady: BENEFITS_COMPANION_LIVE_READY });
}

/**
 * POST /api/admin/analytics/benefits-companion
 * Body: { mode: "off" | "practice" | "live", companionPct?: 1-50 }.
 * Live is refused until the whole companion ships (BENEFITS_COMPANION_LIVE_READY).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  let body: { mode?: unknown; companionPct?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await saveBenefitsCompanionSettings(
    { mode: body?.mode, companionPct: body?.companionPct },
    user.id,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result.settings, liveReady: BENEFITS_COMPANION_LIVE_READY });
}

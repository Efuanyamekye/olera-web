import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { runNoiseSweep } from "@/lib/support-email/noise-sweep.server";

export const maxDuration = 300;

/**
 * Archive the categories that are noise by definition. The sweep and its rules
 * (never care_seeker, provider, legal, billing or voicemail; opt-outs held;
 * dry run until `confirm` matches the cohort) live in
 * lib/support-email/noise-sweep.server.ts.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  // The sweep itself lives in lib/support-email/noise-sweep.server.ts, where
  // Cortex runs the same code after the founder approves it.
  const result = await runNoiseSweep(getServiceClient(), {
    actor: admin.email,
    adminUserId: admin.id,
    confirm: request.nextUrl.searchParams.get("confirm"),
  });
  return NextResponse.json(result.json, { status: result.status });
}

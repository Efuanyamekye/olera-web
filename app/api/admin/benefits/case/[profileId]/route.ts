import { NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { loadBenefitsCaseView } from "@/lib/benefits/case-view.server";

/**
 * GET /api/admin/benefits/case/[profileId]
 * The benefits side of a family's case, for the program card on the case
 * workspace. See lib/benefits/case-view.server.ts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const { profileId } = await params;
  const view = await loadBenefitsCaseView(getServiceClient(), profileId);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view);
}

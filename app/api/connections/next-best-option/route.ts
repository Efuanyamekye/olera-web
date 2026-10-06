import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { findNextBestOption } from "@/lib/connections/next-best-option.server";

/**
 * GET /api/connections/next-best-option?connectionId=…
 *
 * The one provider to offer a family who just sent `connectionId`. Read-only:
 * nothing is sent from here. The family's tap goes through
 * /api/connections/request with entry_point "next_best_option".
 *
 * Only the family who sent the inquiry may ask. A guest whose email matched an
 * existing account holds no session yet (anti-takeover, see the request route),
 * so they get a 401 and the card simply shows nothing.
 */
export async function GET(request: Request) {
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = getServiceClient();
  const { data: account } = await db.from("accounts").select("id").eq("user_id", user.id).maybeSingle();
  if (!account) return NextResponse.json({ option: null });

  const { data: connection } = await db
    .from("connections")
    .select("id, from_profile_id, to_profile_id, type")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection || connection.type !== "inquiry") return NextResponse.json({ option: null });

  const { data: family } = await db
    .from("business_profiles")
    .select("id")
    .eq("id", connection.from_profile_id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!family) return NextResponse.json({ error: "Not your inquiry" }, { status: 403 });

  try {
    const option = await findNextBestOption(db, {
      anchorProfileId: connection.to_profile_id,
      familyProfileId: connection.from_profile_id,
    });
    return NextResponse.json({ option });
  } catch (err) {
    console.error("[next-best-option] lookup failed", err);
    return NextResponse.json({ option: null });
  }
}

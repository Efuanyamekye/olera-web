import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/benefits/companion-review
 * Everything the benefits text companion said, or would have said in practice
 * mode, newest first: openers and replies to free text, with the label and
 * the reason for each decision. Backs /admin/benefits/companion.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getServiceClient();
  const { data, error } = await db
    .from("business_profiles")
    .select("id, display_name, state, metadata")
    .eq("type", "family")
    .or("metadata->benefits_companion_practice.not.is.null,metadata->benefits_companion.not.is.null")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Item = {
    profileId: string;
    who: string;
    state: string | null;
    at: string;
    mode: "practice" | "live";
    kind: "opener" | "reply";
    theySaid: string | null;
    wouldSay: string | null;
    decision: string | null;
    reason: string | null;
  };
  const items: Item[] = [];
  for (const row of data ?? []) {
    const meta = (row.metadata as Record<string, unknown>) || {};
    const who = row.display_name && row.display_name !== "Care Seeker" ? row.display_name : "A family";
    const practice = meta.benefits_companion_practice as
      | { at?: string; opener?: string | null; note?: string | null; replies?: Record<string, unknown>[] }
      | undefined;
    if (practice?.at) {
      items.push({
        profileId: row.id, who, state: row.state, at: practice.at, mode: "practice", kind: "opener",
        theySaid: null, wouldSay: practice.opener ?? practice.note ?? null, decision: practice.opener ? "opener" : "none", reason: null,
      });
    }
    for (const r of practice?.replies ?? []) {
      items.push({
        profileId: row.id, who, state: row.state, at: String(r.at), mode: "practice", kind: "reply",
        theySaid: (r.body as string) ?? null, wouldSay: (r.reply as string) ?? null,
        decision: (r.decision as string) ?? null, reason: (r.reason as string) ?? (r.intent as string) ?? null,
      });
    }
    const live = meta.benefits_companion as { arm?: string; last_reply?: Record<string, unknown> } | undefined;
    if (live?.last_reply) {
      const r = live.last_reply;
      items.push({
        profileId: row.id, who, state: row.state, at: String(r.at), mode: "live", kind: "reply",
        theySaid: (r.body as string) ?? null, wouldSay: (r.reply as string) ?? null,
        decision: (r.decision as string) ?? null, reason: (r.reason as string) ?? (r.intent as string) ?? null,
      });
    }
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return NextResponse.json({ items: items.slice(0, 200) });
}

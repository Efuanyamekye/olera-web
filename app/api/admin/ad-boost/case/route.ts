import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * Case history for a single Ad Boost campaign.
 *
 * A campaign is a case with a history, not a row with a status. This reads and
 * writes that history — setup, hypothesis, tweaks, observations, check-ins,
 * provider comms, outcomes — from `ad_campaign_log`.
 *
 * GET  — the full case, newest first.
 *
 *   /api/admin/ad-boost/case?request=<uuid>          one Olera request row
 *   /api/admin/ad-boost/case?campaign=<google id>    one Google campaign
 *   /api/admin/ad-boost/case?tag=<campaign_tag>      by UTM tag
 *   /api/admin/ad-boost/case?provider=<provider_id>  every flight for a provider
 *   /api/admin/ad-boost/case?overdue=1               tweaks past review, all campaigns
 *
 *   Add &format=md to get the case as markdown instead of JSON. That exists so the
 *   whole history can be read in one request — pasted into a browser, or pulled at
 *   the start of a session — rather than reconstructed from the Google Ads UI.
 *
 * POST — append one entry. See ENTRY_TYPES for the vocabulary.
 *
 *   A `tweak` is rejected without `expected_signal` and `review_after`. That is
 *   deliberate: a change with no stated expectation cannot be evaluated later, and
 *   unevaluated changes are how a working campaign got rebuilt into a dead one.
 *
 * PATCH — close out a review: sets `reviewed_at` and `review_outcome` on one entry.
 *
 * Auth: admin only. GET is supported for every read so the record can be opened in a
 * browser without tooling.
 */

const ENTRY_TYPES = [
  "setup",
  "hypothesis",
  "tweak",
  "observation",
  "check_in",
  "alert",
  "provider_comms",
  "outcome",
] as const;

const ROW_SELECT =
  "id, request_id, google_campaign_id, campaign_tag, entry_type, summary, detail, before_state, after_state, expected_signal, review_after, reviewed_at, review_outcome, metrics_snapshot, occurred_at, author, created_at";

type LogRow = {
  id: string;
  request_id: string | null;
  google_campaign_id: string | null;
  campaign_tag: string | null;
  entry_type: string;
  summary: string;
  detail: string | null;
  before_state: unknown;
  after_state: unknown;
  expected_signal: string | null;
  review_after: string | null;
  reviewed_at: string | null;
  review_outcome: string | null;
  metrics_snapshot: unknown;
  occurred_at: string;
  author: string;
  created_at: string;
};

/** Render the case as markdown — the one-request read of a whole campaign history. */
function toMarkdown(rows: LogRow[]): string {
  if (rows.length === 0) return "# Case\n\nNo entries recorded.\n";
  const tag = rows.find((r) => r.campaign_tag)?.campaign_tag ?? "(untagged)";
  const lines: string[] = [`# Case: ${tag}`, ""];

  // Oldest first reads as a story; the JSON path stays newest-first for the UI.
  for (const r of [...rows].reverse()) {
    const when = r.occurred_at.slice(0, 10);
    lines.push(`## ${when} · \`${r.entry_type}\` · ${r.author}`);
    lines.push("");
    lines.push(`**${r.summary}**`);
    if (r.detail) lines.push("", r.detail);
    if (r.before_state || r.after_state) {
      lines.push("", "```json");
      lines.push(JSON.stringify({ before: r.before_state, after: r.after_state }, null, 2));
      lines.push("```");
    }
    if (r.expected_signal) lines.push("", `**Expected:** ${r.expected_signal}`);
    if (r.review_after) {
      const due = r.review_after.slice(0, 10);
      lines.push(
        r.reviewed_at
          ? `**Reviewed ${r.reviewed_at.slice(0, 10)}:** ${r.review_outcome ?? "(no outcome recorded)"}`
          : `**Review due ${due} — NOT YET REVIEWED**`,
      );
    }
    if (r.google_campaign_id) lines.push("", `_Google campaign ${r.google_campaign_id}_`);
    lines.push("", "---", "");
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const db = getServiceClient();

  // Every tweak past its review date that nobody has come back to, across all
  // campaigns. This is what makes a forgotten change visible.
  if (params.get("overdue") === "1") {
    const { data, error } = await db
      .from("ad_campaign_log")
      .select(params.get("counts_only") === "1" ? "request_id" : ROW_SELECT)
      .eq("entry_type", "tweak")
      .is("reviewed_at", null)
      .not("review_after", "is", null)
      .lte("review_after", new Date().toISOString())
      .order("review_after", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[admin/ad-boost/case] overdue query failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ overdue: data ?? [] });
  }

  let query = db.from("ad_campaign_log").select(ROW_SELECT);

  const requestId = params.get("request");
  const campaignId = params.get("campaign");
  const tag = params.get("tag");
  const providerId = params.get("provider");

  if (requestId) {
    query = query.eq("request_id", requestId);
  } else if (campaignId) {
    query = query.eq("google_campaign_id", campaignId);
  } else if (tag) {
    query = query.eq("campaign_tag", tag);
  } else if (providerId) {
    // A provider's whole story, across every flight and every rebuild.
    const { data: reqs, error: reqErr } = await db
      .from("ad_campaign_requests")
      .select("id")
      .eq("provider_id", providerId);
    if (reqErr) {
      console.error("[admin/ad-boost/case] provider lookup failed:", reqErr);
      return NextResponse.json({ error: reqErr.message }, { status: 500 });
    }
    const ids = (reqs ?? []).map((r) => r.id);
    if (ids.length === 0) return NextResponse.json({ entries: [] });
    query = query.in("request_id", ids);
  } else {
    return NextResponse.json(
      { error: "Provide one of: request, campaign, tag, provider, or overdue=1" },
      { status: 400 },
    );
  }

  const { data, error } = await query.order("occurred_at", { ascending: false }).limit(500);
  if (error) {
    console.error("[admin/ad-boost/case] fetch failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as LogRow[];

  if (params.get("format") === "md") {
    return new NextResponse(toMarkdown(rows), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  return NextResponse.json({ entries: rows });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    request_id,
    google_campaign_id,
    campaign_tag,
    entry_type,
    summary,
    detail,
    before_state,
    after_state,
    expected_signal,
    review_after,
    metrics_snapshot,
    occurred_at,
  } = body as Record<string, unknown>;

  if (typeof entry_type !== "string" || !ENTRY_TYPES.includes(entry_type as never)) {
    return NextResponse.json(
      { error: `entry_type must be one of: ${ENTRY_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof summary !== "string" || !summary.trim()) {
    return NextResponse.json({ error: "summary is required" }, { status: 400 });
  }
  if (!request_id && !google_campaign_id) {
    return NextResponse.json(
      { error: "An entry needs a request_id or a google_campaign_id" },
      { status: 400 },
    );
  }

  // The rule that makes this a lab notebook rather than a diary. Mirrored by a CHECK
  // constraint in migration 202 so it holds even for writes that bypass this route.
  if (entry_type === "tweak") {
    if (typeof expected_signal !== "string" || !expected_signal.trim()) {
      return NextResponse.json(
        { error: "A tweak needs expected_signal: what you expect this change to do." },
        { status: 400 },
      );
    }
    if (typeof review_after !== "string" || Number.isNaN(Date.parse(review_after))) {
      return NextResponse.json(
        { error: "A tweak needs review_after: when to come back and check it worked." },
        { status: 400 },
      );
    }
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("ad_campaign_log")
    .insert({
      request_id: request_id ?? null,
      google_campaign_id: google_campaign_id ?? null,
      campaign_tag: campaign_tag ?? null,
      entry_type,
      summary: summary.trim(),
      detail: typeof detail === "string" && detail.trim() ? detail.trim() : null,
      before_state: before_state ?? null,
      after_state: after_state ?? null,
      expected_signal:
        typeof expected_signal === "string" && expected_signal.trim()
          ? expected_signal.trim()
          : null,
      review_after: typeof review_after === "string" ? review_after : null,
      metrics_snapshot: metrics_snapshot ?? null,
      occurred_at: typeof occurred_at === "string" ? occurred_at : new Date().toISOString(),
      author: adminUser.display_name || adminUser.email,
    })
    .select(ROW_SELECT)
    .single();

  if (error) {
    console.error("[admin/ad-boost/case] insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const id = body && typeof body === "object" ? (body as Record<string, unknown>).id : null;
  const outcome =
    body && typeof body === "object" ? (body as Record<string, unknown>).review_outcome : null;

  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (typeof outcome !== "string" || !outcome.trim()) {
    return NextResponse.json(
      { error: "review_outcome is required: what did you find when you checked?" },
      { status: 400 },
    );
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("ad_campaign_log")
    .update({ reviewed_at: new Date().toISOString(), review_outcome: outcome.trim() })
    .eq("id", id)
    .select(ROW_SELECT)
    .single();

  if (error) {
    console.error("[admin/ad-boost/case] review update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

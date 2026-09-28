import { NextRequest, NextResponse } from "next/server";
import { offerStillHolds } from "@/lib/city-ads/offer-holds";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { getRoutingPlan } from "@/lib/city-ads/plan.server";
import { resolvePrimaryCampaign } from "@/lib/city-ads/primary.server";
import { cityLeadBlocked } from "@/lib/city-ads/messages.server";
import { extractHeard, saveHeard, summariseManual } from "@/lib/seeker-touches/extract.server";
import { careSummary, type Heard } from "@/lib/seeker-touches/types";
import { HEARD_FIELDS, FAMILY_TOUCH_CHANNELS, TOUCH_DIRECTIONS, TOUCH_SOURCES, type FamilyTouchInput, type HeardField } from "@/lib/seeker-touches/types";
import {
  loadSeekerRelationships,
  loadSeekerTimeline,
  seekerRelationshipsToMarkdown,
  seekerTimelineToMarkdown,
  DEFAULT_WINDOW_DAYS,
} from "@/lib/seeker-touches/timeline.server";

/**
 * Care-seeker relationships — read only.
 *
 * The family counterpart to /api/admin/touches. Every row it returns is derived
 * from tables that already exist and already carry the family's profile id, so
 * this route writes nothing and stores nothing.
 *
 * GET — supported in the browser so a record can be opened without tooling.
 *
 *   /api/admin/seeker-touches                the Relationships list
 *   /api/admin/seeker-touches?seeker=<uuid>  one family's full timeline
 *   ...&days=90                              widen the live-episode window
 *   ...&format=md                            read as markdown in a tab
 *
 * POST — append one touch: a call, a meeting, a text from a personal phone.
 *        Only what the app cannot see for itself; system sends stay in
 *        email_log and are merged at read time.
 *
 *        `reached` is the field that matters. TRUE means we spoke to them and
 *        clears an owed call; FALSE means we tried and did not, and keeps the
 *        row red. Declaring a next action closes the family's earlier open ones.
 *
 * PATCH — { id, done: true } marks a next action done.
 *
 * Auth: admin only.
 */

/**
 * POST now makes one model call before it answers, so the default ceiling is
 * too close to the worst case. A function killed mid-flight would return a
 * failure for a touch that has ALREADY been inserted, and the obvious response
 * to "Could not save that" is to press Log again, which writes it twice.
 */
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = await getAdminUser(user.id);
  if (!admin) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { admin };
}

function md(body: string): NextResponse {
  return new NextResponse(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

/**
 * What the family page needs to route a city lead itself.
 *
 * Calls are logged on the family page, but until now the lead could only be
 * routed from /admin/city-ads, so a caller finished a good call, left for
 * another page, found the family again and typed what they heard a second
 * time. This returns the lead's routing state, the city's providers for "Offer
 * to…", and the care details already recorded for the family, which is what
 * the "what they need" box starts from. The actions themselves stay on
 * /api/admin/city-ads, so there is still exactly one routing code path.
 */
async function loadRouting(seekerId: string, leadId: string) {
  const db = getServiceClient();
  const { data: lead } = await db
    .from("city_leads")
    .select("id, slug, status, archived_at, accepted_offer_id, qualification_reply, qualification_reply_at, qualification_verdict, admin_note, handed_at, meta_campaign_id, phone, email, first_name, capture_method")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  const [{ data: poolRows }, { data: offerRows }, { data: profile }] = await Promise.all([
    // Test providers are left out: a real family offered to the test listing
    // reaches nobody.
    db
      .from("city_pool")
      .select("provider_id, position, enabled")
      .eq("slug", lead.slug)
      .eq("is_test", false)
      .order("position", { ascending: true }),
    db
      .from("city_lead_offers")
      .select("id, provider_id, position, offered_at, expires_at, accepted_at, declined_at, expired_at, outcome")
      .eq("lead_id", leadId)
      .order("position", { ascending: true }),
    db.from("business_profiles").select("metadata").eq("id", seekerId).maybeSingle(),
  ]);

  const pool = (poolRows ?? []) as { provider_id: string; position: number; enabled: boolean }[];
  const offers = (offerRows ?? []) as {
    id: string;
    provider_id: string;
    position: number;
    offered_at: string;
    expires_at: string;
    accepted_at: string | null;
    declined_at: string | null;
    expired_at: string | null;
    outcome: string | null;
  }[];
  // Who has the family now. A taken offer that was since released (the
  // follow-up ladder, or Move on the case page) no longer counts; see
  // lib/city-ads/offer-holds.ts. Rudy is the case: taken, released to
  // Cambridge, and still unroutable here while any take counted.
  const holding = offers.find((o) => offerStillHolds(o, lead as { accepted_offer_id: string | null }));
  const ids = Array.from(new Set([...pool.map((p) => p.provider_id), ...offers.map((o) => o.provider_id)]));
  const { data: names } = ids.length
    ? await db.from("business_profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameOf = new Map((names ?? []).map((n) => [n.id as string, (n.display_name as string | null) ?? "a provider"]));
  const offered = new Set(offers.map((o) => o.provider_id));
  const [primary, { data: pending }] = await Promise.all([
    resolvePrimaryCampaign(db, lead as { id: string; slug: string; meta_campaign_id: string | null }).catch(() => null),
    db
      .from("city_lead_messages")
      .select("id, channel, subject, body, send_after")
      .eq("lead_id", leadId)
      .eq("status", "pending")
      .order("send_after", { ascending: true }),
  ]);

  // The same check every city-ads action runs first (archived, test, stopped,
  // or on do_not_contact). Without it an opted-out family showed the buttons,
  // and pressing one came back as a vague "nothing was sent".
  const blocked = await cityLeadBlocked(db, leadId);
  const closed =
    blocked || ["client", "no_fit", "stopped", "redirected", "unreachable"].includes(lead.status);

  return {
    lead_id: lead.id as string,
    status: lead.status as string,
    // Nothing to route once a provider has it or the lead is finished; the
    // page hides the controls rather than offering a button that 409s.
    // An accepted OFFER counts, not just the lead's pointer to it. Rudy's
    // offer was accepted while his lead row kept status "offered" and no
    // accepted_offer_id, so a pointer-only check showed "Offer to next" on a
    // family a provider already had.
    can_route: !closed && !lead.accepted_offer_id && !holding,
    // Move to another agency: someone holds the family and it isn't finished.
    // A family from the provider's own ad is not moved from here.
    can_move: !closed && Boolean(holding) && !lead.handed_at,
    holder_id: holding?.provider_id ?? null,
    qualification_reply: (lead.qualification_reply as string | null) ?? null,
    qualification_verdict: (lead.qualification_verdict as string | null) ?? null,
    pool: pool.map((p) => ({
      provider_id: p.provider_id,
      name: nameOf.get(p.provider_id) ?? "a provider",
      position: p.position,
      enabled: p.enabled,
      already_offered: offered.has(p.provider_id),
    })),
    care_summary: careSummary((profile?.metadata as { care_details?: Heard | null } | null)?.care_details ?? null),
    // Everything the City campaigns lead card used to be the only home for,
    // so the family page can be the one place a family is worked.
    closed,
    offers: offers.map((o) => ({
      id: o.id,
      provider_name: nameOf.get(o.provider_id) ?? "a provider",
      offered_at: o.offered_at,
      state: o.accepted_at ? (holding?.id === o.id ? "accepted" : "moved") : o.declined_at ? "declined" : o.expired_at || new Date(o.expires_at) < new Date() ? "expired" : "open",
    })),
    has_provider: Boolean(holding) || Boolean(lead.handed_at),
    handed_at: (lead.handed_at as string | null) ?? null,
    campaign_owner: primary?.providerName ?? null,
    can_hand: !closed && !lead.handed_at && !lead.accepted_offer_id && Boolean(primary),
    admin_note: (lead.admin_note as string | null) ?? null,
    has_phone: Boolean(lead.phone),
    has_email: Boolean(lead.email),
    pending_messages: ((pending ?? []) as { id: string; channel: string; subject: string | null; body: string; send_after: string }[]),
  };
}


export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const params = new URL(request.url).searchParams;
  const seeker = params.get("seeker");
  const asMarkdown = params.get("format") === "md";

  const rawDays = Number(params.get("days"));
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : DEFAULT_WINDOW_DAYS;

  try {
    if (seeker) {
      if (!UUID_RE.test(seeker)) {
        return NextResponse.json({ error: "seeker must be a uuid" }, { status: 400 });
      }
      const timeline = await loadSeekerTimeline(seeker);
      if (!timeline) return NextResponse.json({ error: "Care seeker not found" }, { status: 404 });
      // Where this lead goes next, derived from the same pool the relay reads.
      // Best effort: a failure here must not take the whole timeline down with
      // it, since the timeline is the part that is always worth showing.
      let plan = null;
      let routing = null;
      if (timeline.city_lead_id) {
        try {
          plan = await getRoutingPlan(getServiceClient(), timeline.city_lead_id);
        } catch (err) {
          console.error("[seeker-touches] routing plan failed:", err);
        }
        try {
          routing = await loadRouting(seeker, timeline.city_lead_id);
        } catch (err) {
          console.error("[seeker-touches] routing controls failed:", err);
        }
      }
      return asMarkdown ? md(seekerTimelineToMarkdown(timeline)) : NextResponse.json({ ...timeline, plan, routing });
    }

    const rows = await loadSeekerRelationships({ days });
    return asMarkdown
      ? md(seekerRelationshipsToMarkdown(rows))
      : NextResponse.json({ rows, window_days: days });
  } catch (error) {
    console.error("[seeker-touches] failed:", error);
    return NextResponse.json({ error: "Failed to load care seeker relationships" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  let body: Partial<FamilyTouchInput>;
  try {
    body = (await request.json()) as Partial<FamilyTouchInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const seeker_id = clean(body.seeker_id);
  const channel = clean(body.channel);
  const direction = clean(body.direction) ?? "out";
  let summary = clean(body.summary);

  // Details somebody typed into the fields rather than into the note. Only
  // known keys survive, and only as strings, so an unexpected body cannot write
  // arbitrary structure onto the profile.
  const rawDetails = (body as { care_details?: unknown }).care_details;
  const manual: Partial<Record<HeardField, string>> = {};
  if (rawDetails && typeof rawDetails === "object") {
    for (const key of HEARD_FIELDS) {
      const v = (rawDetails as Record<string, unknown>)[key];
      if (typeof v === "string") manual[key] = v.slice(0, 120);
    }
  }
  const hasManual = Object.keys(manual).length > 0;

  // A fields-only log is a real log. Rather than reject it for having no note,
  // build the one line the timeline needs out of what was typed, so the row
  // still reads as something three weeks later instead of as a blank.
  if (!summary && hasManual) summary = summariseManual(manual) || null;
  const source = clean(body.source) ?? "manual";
  const occurred_at = clean(body.occurred_at);
  const next_action = clean(body.next_action);
  const next_action_due = clean(body.next_action_due);
  const next_action_owner = clean(body.next_action_owner);

  if (!seeker_id || !UUID_RE.test(seeker_id)) {
    return NextResponse.json({ error: "seeker_id must be a business_profiles UUID" }, { status: 400 });
  }
  if (!channel || !(FAMILY_TOUCH_CHANNELS as readonly string[]).includes(channel)) {
    return NextResponse.json({ error: `channel must be one of ${FAMILY_TOUCH_CHANNELS.join(", ")}` }, { status: 400 });
  }
  if (!(TOUCH_DIRECTIONS as readonly string[]).includes(direction)) {
    return NextResponse.json({ error: "direction must be out or in" }, { status: 400 });
  }
  if (!(TOUCH_SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json({ error: `source must be one of ${TOUCH_SOURCES.join(", ")}` }, { status: 400 });
  }
  if (!summary) return NextResponse.json({ error: "Say what happened, or fill in some details" }, { status: 400 });
  if (summary.length > 240) {
    return NextResponse.json({ error: "That is one line's worth; put the rest in detail" }, { status: 400 });
  }
  if (occurred_at && Number.isNaN(Date.parse(occurred_at))) {
    return NextResponse.json({ error: "occurred_at must be an ISO timestamp" }, { status: 400 });
  }
  if (next_action_due && !DATE_RE.test(next_action_due)) {
    return NextResponse.json({ error: "next_action_due must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!next_action && (next_action_due || next_action_owner)) {
    return NextResponse.json({ error: "a due date or owner needs a next action" }, { status: 400 });
  }

  const db = getServiceClient();

  // Confirm the family exists and really is one, before the FK does it for us.
  const { data: profile } = await db
    .from("business_profiles")
    .select("id")
    .eq("id", seeker_id)
    .eq("type", "family")
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Care seeker not found" }, { status: 404 });

  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("family_touches")
    .insert({
      seeker_id,
      channel,
      direction,
      occurred_at: occurred_at ?? nowIso,
      reached: typeof body.reached === "boolean" ? body.reached : null,
      summary,
      detail: clean(body.detail),
      contact_name: clean(body.contact_name),
      contact_handle: clean(body.contact_handle),
      source,
      source_ref: clean(body.source_ref),
      next_action,
      next_action_due,
      next_action_owner,
      author: admin.display_name || admin.email || "admin",
      admin_user_id: admin.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[seeker-touches] insert failed:", error);
    return NextResponse.json({ error: "Failed to log this touch" }, { status: 500 });
  }

  // A new next action supersedes the open ones, AND so does actually reaching
  // them. The open action existed because we had not got hold of them; getting
  // hold of them is what it was for. Without this, logging "spoke to him" leaves
  // the row screaming Overdue until someone separately clicks Mark done — the
  // double bookkeeping that makes a tool like this decay in a week. A genuinely
  // new follow-up is declared on the same log, which closes the old one anyway.
  //
  // Done, not deleted: what we meant to do next is part of the record. Closed
  // AFTER the insert, so a failed write never erases the action already on the
  // list.
  if (next_action || body.reached === true) {
    const { error: closeErr } = await db
      .from("family_touches")
      .update({ next_action_done_at: nowIso })
      .eq("seeker_id", seeker_id)
      .neq("id", (data as { id: string }).id)
      .not("next_action", "is", null)
      .is("next_action_done_at", null);
    if (closeErr) console.error("[seeker-touches] failed to close prior actions:", closeErr);
  }

  // A benefits family reached by a person: clear their help clock and lift
  // the reply hold, the same as "I contacted them" on /admin/benefits, so the
  // two pages agree about this family. A call only counts when it connected;
  // a text or email logged as sent always does.
  const reachedThem =
    direction === "out" &&
    (body.reached === true || channel === "text" || channel === "email" || channel === "meeting");
  if (reachedThem) {
    try {
      const { noteBenefitsContact } = await import("@/lib/family-comms/benefits-replies.server");
      await noteBenefitsContact(db, seeker_id, occurred_at ?? nowIso, admin.display_name || admin.email || "admin");
    } catch (err) {
      console.error("[seeker-touches] benefits contact stamp failed:", err);
    }
  }

  // Read the note for the care details a provider would ask for.
  //
  // AFTER the insert and deliberately not awaited into the success of it: the
  // touch is already saved and the log has already succeeded, so a slow or
  // failing model must not turn a written record into an error on screen. It
  // is awaited here only because Vercel kills pending promises once a response
  // is returned, and `extractHeard` swallows everything and returns null.
  let heard = null;
  // `detail` already CONTAINS `summary` — the client stores the first 240
  // characters as the summary and the whole thing as the detail once it is
  // longer than that. Concatenating them fed the model the opening twice and
  // put a duplicated passage in the verbatim haystack.
  const noteForExtract = clean(body.detail) ?? summary;
  const fresh = await extractHeard(noteForExtract, {
    channel,
    reached: typeof body.reached === "boolean" ? body.reached : null,
  });
  if (fresh || hasManual) heard = await saveHeard(db, seeker_id, fresh, hasManual ? manual : undefined);

  return NextResponse.json({ touch: data, heard }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  let body: { id?: string; done?: boolean };
  try {
    body = (await request.json()) as { id?: string; done?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = clean(body.id);
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  if (body.done !== true) return NextResponse.json({ error: "only { id, done: true } is supported" }, { status: 400 });

  const db = getServiceClient();
  const { data, error } = await db
    .from("family_touches")
    .update({ next_action_done_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[seeker-touches] patch failed:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Touch not found" }, { status: 404 });
  return NextResponse.json({ touch: data });
}

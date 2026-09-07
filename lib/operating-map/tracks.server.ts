import type { SupabaseClient } from "@supabase/supabase-js";
import { getEngagementLevel } from "@/lib/connection-engagement";

/**
 * TA, TB and TC — the three tracks, where a match turns into something real.
 *
 * Three of the six nodes have a source. The rest are dashed on purpose and
 * the gaps are worth naming, because they are the same gap: we record that
 * we introduced two people and stop recording once they take it offline.
 *
 *   TA1      applied              seeker_activity benefits_outcome_reported
 *                                 with value "moving"
 *   TA2      aid established      nothing. Whether the aid was granted is
 *                                 decided by an agency that never tells us.
 *
 * TA1 is a self-report, and the only one on this map. Applying happens on a
 * government site, so the closest thing to evidence is the family answering
 * the benefits check-in with "moving forward". Everyone who applied and
 * never answered the email is missing, which makes it a floor rather than a
 * count — the tooltip says so.
 *   TB1      connection confirmed connections the admin Connections page
 *                                 counts as Connected
 *   TB2      care established     nothing. Care starts in a conversation we
 *                                 are not part of.
 *   TC1      interviews           scheduled and completed
 *   TC2      hire confirmed       medjobs_placements accepted or confirmed
 *
 * `inquiriesRaised` and `interviewsProposed` are not nodes on the map — the
 * matched steps were removed. They are still read, because they are what the
 * confirmed counts are a subset of, and a consistency check with nothing to
 * compare against is no check at all.
 *
 * TB1 does NOT read a status column. There is no "responded" status — the
 * column only holds pending / accepted / declined / expired / archived /
 * pending_verification — and a connection becomes Connected through any of
 * six different signals, none of which is the status. So it calls
 * getEngagementLevel, the same function the admin Connections page calls,
 * rather than describing the rule a second time and drifting from it.
 *
 * Every count here carries a timing caveat. Only the creation of a row is
 * timestamped, not the status change, so they count rows CREATED in the
 * window that have since reached that state. An inquiry raised last month
 * and answered today lands in last month.
 */

type Range = { from: string | null; to: string | null };

export interface Tracks {
  /** TA1 — families who reported moving forward with a benefit. */
  benefitsApplied: number;
  /** Not a node — the set TB1 is drawn from, kept for the consistency check. */
  inquiriesRaised: number;
  /** TB1 — inquiries a provider answered. */
  inquiriesResponded: number;
  /** Not a node — the set TC1 is drawn from, kept for the consistency check. */
  interviewsProposed: number;
  /** TC1 — interviews with a time agreed. Includes the ones since held. */
  interviewsScheduled: number;
  /** Of those, the ones recorded as held. */
  interviewsCompleted: number;
  /** TC2 — placements the care worker accepted. */
  hires: number;
}

/** Apply the map's window to any table that timestamps its rows. */
function inRange<T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(
  query: T,
  range: Range,
): T {
  let q = query;
  if (range.from) q = q.gte("created_at", range.from);
  if (range.to) q = q.lt("created_at", range.to);
  return q;
}

const HEAD = { count: "exact", head: true } as const;

const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;

/** Provider-level engagement, the two signals that can make a connection connected. */
const CLICK_EVENTS = ["phone_clicked", "email_link_clicked"] as const;

type ThreadMsg = {
  from_profile_id?: string;
  text?: string;
  is_auto_reply?: boolean;
  type?: string;
};

/**
 * TB1 — connections the admin Connections page counts as Connected.
 *
 * Six signals make a connection connected, and the status column is none of
 * them. Four live on the connection itself: a real provider message in the
 * thread, the family confirming the provider got back to them, the provider
 * confirming it, or an admin marking it so. Two are provider-level clicks
 * recorded in provider_activity.
 *
 * The rule is not restated here. getEngagementLevel decides, exactly as it
 * does for the Connections page, so the two surfaces cannot drift apart.
 */
async function countConnectionsConnected(
  db: SupabaseClient,
  range: Range,
): Promise<number> {
  type Row = {
    id: string;
    to_profile_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };

  const rows: Row[] = [];
  let scanned = 0;
  for (;;) {
    if (scanned >= MAX_ROWS) break;
    const { data, error } = await inRange(
      db
        .from("connections")
        .select("id, to_profile_id, metadata, created_at")
        .eq("type", "inquiry"),
      range,
    ).range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    if (page.length === 0) break;
    rows.push(...page);
    scanned += page.length;
    if (page.length < PAGE_SIZE) break;
  }
  if (rows.length === 0) return 0;

  // The two click signals are recorded against the provider, not the
  // connection, so they are fetched once for everyone involved.
  const providerIds = [...new Set(rows.map((r) => r.to_profile_id).filter(Boolean))] as string[];
  const clicked = new Set<string>();
  for (let i = 0; i < providerIds.length; i += 100) {
    const { data, error } = await db
      .from("provider_activity")
      .select("provider_id, event_type")
      .in("provider_id", providerIds.slice(i, i + 100))
      .in("event_type", CLICK_EVENTS as unknown as string[]);
    if (error) throw error;
    for (const e of (data ?? []) as { provider_id: string | null }[]) {
      if (e.provider_id) clicked.add(e.provider_id);
    }
  }

  let connected = 0;
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const thread = (meta.thread as ThreadMsg[]) ?? [];
    // A real reply: from the provider, not an auto-reply, not a system note,
    // and with something actually written in it.
    const providerMessaged = thread.some(
      (m) =>
        m.from_profile_id === r.to_profile_id &&
        m.is_auto_reply !== true &&
        m.type !== "system" &&
        Boolean(m.text?.trim()),
    );
    const override = meta.admin_override as { status?: string } | undefined;
    const providerClicked = Boolean(r.to_profile_id && clicked.has(r.to_profile_id));

    const level = getEngagementLevel(
      {
        emailClicked: false,
        // Only ever produces "viewed", which is not what is being counted,
        // and resolving it faithfully would mean checking whether each
        // provider has claimed their account.
        leadOpened: false,
        contactRevealed: false,
        phoneClicked: providerClicked,
        emailLinkClicked: providerClicked,
        continueInInbox: false,
        providerMessaged,
        familyConfirmed: meta.family_confirmed === true,
        providerConfirmed: meta.provider_confirmed === true,
        adminMarkedViewed: override?.status === "viewed",
        adminMarkedConnected: override?.status === "connected",
        lastActivityAt: null,
      },
      r.created_at,
    ).level;

    if (level === "connected") connected += 1;
  }

  return connected;
}

export async function getTracks(
  db: SupabaseClient,
  range: Range,
): Promise<Tracks> {
  const [
    benefitsApplied,
    inquiriesRaised,
    interviewsProposed,
    interviewsScheduled,
    interviewsCompleted,
    hires,
  ] = await Promise.all([
      inRange(
        db
          .from("seeker_activity")
          .select("id", HEAD)
          .eq("event_type", "benefits_outcome_reported")
          .filter("metadata->>value", "eq", "moving"),
        range,
      ),
      inRange(
        db.from("connections").select("id", HEAD).eq("type", "inquiry"),
        range,
      ),
      inRange(db.from("interviews").select("id", HEAD), range),
      inRange(
        // Completed implies scheduled — an interview cannot be held without
        // a time — so both statuses count toward scheduled.
        db.from("interviews").select("id", HEAD).in("status", ["confirmed", "completed"]),
        range,
      ),
      inRange(
        db.from("interviews").select("id", HEAD).eq("status", "completed"),
        range,
      ),
      inRange(
        db
          .from("medjobs_placements")
          .select("id", HEAD)
          .in("status", ["accepted", "confirmed"]),
        range,
      ),
    ]);

  for (const result of [
    benefitsApplied,
    inquiriesRaised,
    interviewsProposed,
    interviewsScheduled,
    interviewsCompleted,
    hires,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    benefitsApplied: benefitsApplied.count ?? 0,
    inquiriesRaised: inquiriesRaised.count ?? 0,
    inquiriesResponded: await countConnectionsConnected(db, range),
    interviewsProposed: interviewsProposed.count ?? 0,
    interviewsScheduled: interviewsScheduled.count ?? 0,
    interviewsCompleted: interviewsCompleted.count ?? 0,
    hires: hires.count ?? 0,
  };
}

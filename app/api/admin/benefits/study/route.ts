import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { STUDY_VERSIONS, versionAt, versionsSince } from "@/lib/benefits/study-versions";

/**
 * GET /api/admin/benefits/study
 *
 * The CARE-NAV study's read layer (8 Oct 2026). Backs /admin/benefits/study.
 *
 * Under the iterative model every participant gets the current product, so
 * which versions a participant was exposed to, and for how long, follows from
 * when they joined and the release dates in lib/benefits/study-versions.ts.
 * What they actually did on each version comes from the record:
 *   - finder, interview and apply events (provider_activity, stamped with
 *     metadata.product_version since 8 Oct; older rows placed by date),
 *   - letters, emails and texts we sent them (email_log, placed by date).
 *
 * A participant is a family record carrying metadata.study_cohort, written
 * when a tagged browser saves a plan. Tagged browsers that haven't saved one
 * are counted separately: they have no record to attach to yet.
 */

type Meta = Record<string, unknown>;

interface Exposure {
  version: string;
  from: string;
  to: string | null;
  days: number;
  events: number;
  sends: number;
}

const DAY = 86_400_000;

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getServiceClient();
  const { data: profiles, error } = await db
    .from("business_profiles")
    .select("id, account_id, display_name, email, state, created_at, metadata")
    .eq("type", "family")
    .not("metadata->study_cohort", "is", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = profiles ?? [];
  const accountIds = rows.map((r) => r.account_id).filter(Boolean) as string[];
  const { data: accounts } = accountIds.length
    ? await db.from("accounts").select("id, session_id").in("id", accountIds)
    : { data: [] as { id: string; session_id: string | null }[] };
  const sessionOf = new Map((accounts ?? []).map((a) => [a.id, a.session_id as string | null]));

  // Every tagged event, plus every benefits event from a participant's own
  // browser (some came before the tag existed).
  const participantSessions = [...new Set([...sessionOf.values()].filter(Boolean))] as string[];
  type Ev = { created_at: string; metadata: Meta | null };
  const events: Ev[] = [];
  {
    const { data } = await db
      .from("provider_activity")
      .select("created_at, metadata")
      .eq("provider_id", "benefits-finder")
      .not("metadata->>study_cohort", "is", null)
      .order("created_at", { ascending: true })
      .limit(5000);
    events.push(...((data ?? []) as Ev[]));
  }
  for (let i = 0; i < participantSessions.length; i += 100) {
    const { data } = await db
      .from("provider_activity")
      .select("created_at, metadata")
      .eq("provider_id", "benefits-finder")
      .in("metadata->>session_id", participantSessions.slice(i, i + 100))
      .is("metadata->>study_cohort", null)
      .limit(5000);
    events.push(...((data ?? []) as Ev[]));
  }
  const eventsBySession = new Map<string, Ev[]>();
  for (const e of events) {
    const s = e.metadata?.session_id;
    if (typeof s !== "string") continue;
    const list = eventsBySession.get(s) ?? [];
    list.push(e);
    eventsBySession.set(s, list);
  }

  const now = Date.now();
  const participants = await Promise.all(
    rows.map(async (r) => {
      const meta = (r.metadata as Meta) || {};
      const tag = (meta.study_cohort as { id?: string; at?: string } | undefined) ?? {};
      const results = (meta.benefits_results as Meta | undefined) ?? {};
      const cascade = (meta.benefits_cascade as Meta | undefined) ?? {};
      const applied = (cascade.applied as { at?: string; decision?: string; decision_at?: string } | undefined) ?? null;
      const session = r.account_id ? sessionOf.get(r.account_id) ?? null : null;
      const myEvents = session ? eventsBySession.get(session) ?? [] : [];

      const sendsQuery = [
        db.from("email_log").select("created_at").eq("channel", "sms").eq("provider_id", r.id).eq("status", "sent"),
      ];
      if (r.email) sendsQuery.push(db.from("email_log").select("created_at").eq("recipient", r.email).neq("channel", "sms"));
      const sendRows = (await Promise.all(sendsQuery)).flatMap((q) => (q.data ?? []) as { created_at: string }[]);

      const firstEvent = myEvents[0]?.created_at ?? null;
      const joinedAt = [tag.at, firstEvent].filter(Boolean).sort()[0] ?? r.created_at;

      // Exposure: the current product from the day they joined, version by version.
      const exposure: Exposure[] = [];
      const joined = new Date(joinedAt).getTime();
      for (let i = 0; i < STUDY_VERSIONS.length; i++) {
        const v = STUDY_VERSIONS[i];
        const next = STUDY_VERSIONS[i + 1];
        const start = Math.max(joined, new Date(v.releasedAt).getTime());
        const end = next ? new Date(next.releasedAt).getTime() : now;
        if (end <= start) continue;
        const versionOf = (e: Ev) => (typeof e.metadata?.product_version === "string" ? e.metadata.product_version : versionAt(e.created_at));
        exposure.push({
          version: v.id,
          from: new Date(start).toISOString(),
          to: next ? next.releasedAt : null,
          days: Math.round(((end - start) / DAY) * 10) / 10,
          events: myEvents.filter((e) => versionOf(e) === v.id).length,
          sends: sendRows.filter((s) => versionAt(s.created_at) === v.id).length,
        });
      }

      return {
        profileId: r.id,
        name: r.display_name as string | null,
        state: r.state as string | null,
        cohort: tag.id ?? null,
        joinedAt,
        planVersion: (results.product_version as string | undefined) ?? (typeof results.completed_at === "string" ? versionAt(results.completed_at) : null),
        firstStep: ((results.finder_first_step as { program_id?: string } | undefined)?.program_id) ?? null,
        applied: applied?.at ? { at: applied.at, decision: applied.decision ?? null, decisionAt: applied.decision_at ?? null } : null,
        exposure,
        changedSinceJoined: versionsSince(joinedAt).map((v) => v.id),
      };
    }),
  );

  // Tagged browsers with no saved plan yet.
  const linked = new Set(participantSessions);
  const unsaved = new Map<string, { cohort: string; first: string; last: string; events: number }>();
  for (const e of events) {
    const s = e.metadata?.session_id;
    const c = e.metadata?.study_cohort;
    if (typeof s !== "string" || typeof c !== "string" || linked.has(s)) continue;
    const u = unsaved.get(s) ?? { cohort: c, first: e.created_at, last: e.created_at, events: 0 };
    u.last = e.created_at;
    u.events++;
    unsaved.set(s, u);
  }

  return NextResponse.json({
    versions: STUDY_VERSIONS,
    participants,
    unsaved: [...unsaved.values()],
  });
}

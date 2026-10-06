import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { LADDERS, SECTION_ORDER, type SectionKey } from "@/lib/medjobs/ladders";
import { getPartnerUniversity } from "@/lib/medjobs/catchment";
import { resolveCampusUniversity } from "@/lib/medjobs/campus-university-bridge";
import {
  INTERVIEW_BOOKED,
  PLACEMENT_HIRED,
  applicationState,
  studentFacts,
} from "@/lib/medjobs/student-profile";
import {
  channelFromRecords,
  resolveChannel,
  SWEEPS,
  type SweepKind,
  sweepId,
  derivedStep,
  forwardStep,
  formatPhone,
  type BoardRecord,
  type BoardTask,
  type BoardUniversity,
  type ChannelStatus,
  type ExtraContact,
  NO_UNIVERSITY,
  type WaitingGroup,
  type WaitingStudent,
} from "@/lib/medjobs/task-board";
import {
  byName,
  firstName,
  isAssignableSection,
  onRoster,
  type Assignments,
  type Person as TeamMember,
} from "@/lib/medjobs/assignments";

/**
 * The Tasks tab, as one read.
 *
 * Every university, the state of its five channels, the records inside it
 * and the tasks on those records. Assembled here rather than in the client
 * so the tab is one request, and so the shape the screen renders is the
 * shape the engine in lib/medjobs/task-board.ts already understands.
 *
 * Records come from two tables and always have. `student_outreach` holds
 * everything we contact in rounds — providers, advising offices, student
 * orgs, professors. `campus_channel_records` holds the activation ledger
 * for the list channels. They are read side by side rather than merged:
 * merging rows we cannot verify would lose history, and nothing here is
 * worth that.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAKEHOLDER_SECTION: Record<string, SectionKey> = {
  advisor: "advisors",
  student_org: "orgs",
  professor: "professors",
  dept_head: "professors",
  // An event is a record now, not a row in the activation ledger. It has a
  // ladder of its own — inquire, assign a leader, prepare, attend — and that
  // is what a student_outreach row is for.
  event: "events",
};

const CHANNEL_SECTION: Record<string, SectionKey> = {
  st3: "jobboard",
  st4: "advisors",
  st5: "orgs",
  st6: "events",
  st7: "professors",
};

const RECORD_KIND_SECTION: Record<string, SectionKey> = {
  organization: "orgs",
  event: "events",
  professor: "professors",
};

/** A record that has reached its goal, or stopped, stops climbing. */
/**
 * A record with nothing left to climb. Most of these are dead ends, but
 * `ready_for_students` is the opposite — it is the providers goal, and it
 * belongs here because a provider who has reached it is finished with the
 * ladder, not because anything went wrong. Underscores become spaces, so it
 * reads back as the goal string itself.
 */
const CLOSED_STATUSES = new Set([
  "active_partner",
  "ready_for_students",
  "not_interested",
  "no_response_closed",
  "do_not_contact",
  "wrong_contact",
  "archived",
]);

function emptyRecords(): Record<SectionKey, BoardRecord[]> {
  const out = {} as Record<SectionKey, BoardRecord[]>;
  for (const s of SECTION_ORDER) out[s] = [];
  return out;
}

/**
 * The order a record's history reads in.
 *
 * Finished work sorts by when it was finished, not by which rung it was.
 * Rung numbers are positions in a ladder that gets reordered — put the
 * application before the meeting and every student worked under the old
 * order starts showing the application above a meeting that happened first.
 * What was done when does not change when the ladder does.
 *
 * Work still waiting sorts by rung, because that is the order it will be
 * done in, and it sorts after everything finished.
 */
function byWorkedOrder(
  a: { done: boolean; loggedOn: string | null; step: number; round: number },
  b: { done: boolean; loggedOn: string | null; step: number; round: number },
): number {
  if (a.done !== b.done) return a.done ? -1 : 1;
  if (a.done && b.done) {
    const at = a.loggedOn ?? "";
    const bt = b.loggedOn ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
  }
  return a.step - b.step || a.round - b.round;
}

/**
 * The search each sweep opens, built from the campus name.
 *
 * One place, because the keywords are the working knowledge — an operator
 * who has to remember "OR \"career center\"" will search for the wrong thing
 * on the campus where it matters.
 */
const SWEEP_SEARCH: Record<SweepKind, (campus: string) => Record<string, string>> = {
  map: (campus) => ({
    maps_url:
      "https://www.google.com/maps/search/" + encodeURIComponent(`home care near ${campus}`),
  }),
  advisor: (campus) => ({
    advisor_search_url:
      "https://www.google.com/search?q=" +
      encodeURIComponent(
        `${campus} pre-health advising OR "career center" OR "health professions" advisor`,
      ),
  }),
  org: (campus) => ({
    org_search_url:
      "https://www.google.com/search?q=" +
      encodeURIComponent(
        `${campus} student organizations pre-med OR pre-nursing OR "pre-health" OR "health professions" club president`,
      ),
  }),
  event: (campus) => ({
    event_search_url:
      "https://www.google.com/search?q=" +
      encodeURIComponent(
        `${campus} career fair OR "health professions fair" OR "internship fair" OR "student involvement fair" schedule`,
      ),
  }),
  professor: (campus) => ({
    professor_search_url:
      "https://www.google.com/search?q=" +
      encodeURIComponent(
        `${campus} faculty directory biology OR nursing OR "health sciences" OR "public health" professor email`,
      ),
  }),
  // Who to ask, rather than who to write to. Chairs and industry-relations
  // offices are listed in different places from faculty, and finding them is
  // the part of this task that takes the time.
  permission: (campus) => ({
    permission_search_url:
      "https://www.google.com/search?q=" +
      encodeURIComponent(
        `${campus} department chair OR "industry relations" OR "corporate relations" OR "employer relations" contact`,
      ),
  }),
};

const day = (iso: string | null): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceClient();

  const [
    campusesRes,
    channelsRes,
    channelRecordsRes,
    outreachRes,
    contactsRes,
    outreachTasksRes,
    siteTasksRes,
    assignmentsRes,
    adminsRes,
  ] =
    await Promise.all([
      db
        .from("student_outreach_campuses")
        .select("id, slug, name, is_demo, hidden_at")
        .order("name"),
      db.from("campus_channels").select("id, campus_id, channel, status, criteria, detail"),
      db
        .from("campus_channel_records")
        .select("id, channel_id, kind, name, status, contacts")
        .order("name", { ascending: true }),
      db
        .from("student_outreach")
        .select(
          "id, campus_id, kind, stakeholder_type, organization_name, status, cadence_day, notes, research_data, provider_business_profile_id",
        )
        // Alphabetical, and load-bearing. Without an ORDER BY the rows come
        // back in whatever order the scan finds them, and Postgres rewrites
        // a row when it is updated — so saving a record moved it somewhere
        // else in the list and the person reviewing lost their place.
        // Ordered by id as well, because two agencies can share a name.
        .order("organization_name", { ascending: true })
        .order("id", { ascending: true }),
      db
        .from("student_outreach_contacts")
        .select("id, outreach_id, name, first_name, last_name, role, email, phone, is_primary, created_at")
        // Ordered, because "the contact" has to be a decision rather than
        // whichever row the database happened to return first. Primary
        // wins; otherwise the oldest, which is the one somebody found first.
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
      db
        .from("student_outreach_tasks")
        .select("id, outreach_id, task_type, due_at, status, payload, notes, completed_at")
        .in("status", ["pending", "completed"])
        // Oldest first, so history reads in the order it happened.
        .order("due_at", { ascending: true })
        .order("id", { ascending: true }),
      db
        .from("site_tasks")
        .select(
          "id, campus_id, record_id, channel, task_type, due_at, status, payload, notes, completed_at",
        )
        .in("status", ["pending", "completed"])
        .order("due_at", { ascending: true })
        .order("id", { ascending: true }),
      db.from("medjobs_assignments").select("campus_id, admin_user_id, section"),
      // Everyone, then narrowed to the MedJobs team below. admin_users holds
      // engineers and old accounts too, and a dropdown of fifteen names is a
      // dropdown nobody reads.
      db.from("admin_users").select("id, email"),
    ]);

  const firstError =
    campusesRes.error ??
    channelsRes.error ??
    channelRecordsRes.error ??
    outreachRes.error ??
    contactsRes.error ??
    outreachTasksRes.error ??
    siteTasksRes.error ??
    assignmentsRes.error ??
    adminsRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  // ── websites ────────────────────────────────────────────────────────
  // Providers get theirs from the directory; an admin correction lives on
  // the record and wins. Only the ids actually on a board are fetched, so
  // this stays one small query rather than a scan of the directory.
  const providerIds = Array.from(
    new Set(
      (outreachRes.data ?? [])
        .map((r) => (r.research_data as { olera_provider_id?: string } | null)?.olera_provider_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const dirSite = new Map<string, string>();
  const dirAddr = new Map<string, string>();
  for (let i = 0; i < providerIds.length; i += 500) {
    const { data } = await db
      .from("olera-providers")
      .select("provider_id, website, address, city, state, zipcode")
      .in("provider_id", providerIds.slice(i, i + 500));
    for (const row of data ?? []) {
      if (row.website) dirSite.set(row.provider_id, row.website);
      // One line, the way somebody would read it aloud. Empty parts are
      // dropped rather than leaving stray commas behind.
      const town = [row.city, row.state].filter(Boolean).join(", ");
      const line = [row.address, town, row.zipcode ? String(row.zipcode) : ""]
        .map((x) => (x ?? "").toString().trim())
        .filter(Boolean)
        .join(" · ");
      if (line) dirAddr.set(row.provider_id, line);
    }
  }

  // ── directory slugs ─────────────────────────────────────────────────
  // Providers link to the admin directory via their business_profile. Only
  // those that have one can be clicked through.
  const bpIds = Array.from(
    new Set(
      (outreachRes.data ?? [])
        .map((r) => r.provider_business_profile_id as string | null)
        .filter((id): id is string => id != null),
    ),
  );
  const directorySlugOf = new Map<string, string>();
  for (let i = 0; i < bpIds.length; i += 500) {
    const { data } = await db
      .from("business_profiles")
      .select("id, slug")
      .in("id", bpIds.slice(i, i + 500));
    for (const row of data ?? []) {
      if (row.slug) directorySlugOf.set(row.id, row.slug);
    }
  }

  // ── students ────────────────────────────────────────────────────────
  // Which university each campus is, in the registry students store. The two
  // registries' slugs drift — Texas A&M is `texas-am` in one and `texas-a-m`
  // in the other — so the bridge matches on name. Both keys are kept: an
  // application that recorded only the name still finds its campus.
  const campusOfUniversity = new Map<string, string>();
  const campusOfName = new Map<string, string>();
  await Promise.all(
    (campusesRes.data ?? []).map(async (c) => {
      const { university_id, university_name } = await resolveCampusUniversity(db, c.slug);
      if (university_id) campusOfUniversity.set(university_id, c.id);
      if (university_name) campusOfName.set(university_name.trim().toLowerCase(), c.id);
    }),
  );

  const { data: studentRows } = await db
    .from("business_profiles")
    .select("id, slug, display_name, email, phone, city, state, metadata, created_at")
    .eq("type", "student")
    // Ordered for the same reason the outreach rows are: an unordered scan
    // moves a record the moment it is written, and the person reading loses
    // their place.
    .order("display_name", { ascending: true })
    .order("id", { ascending: true });

  // Only students at one of the campuses on this board get a place on it:
  // the board is a list of campuses, and a student from somewhere else has
  // no column to sit in.
  //
  // They used to be dropped here and that was the end of it. Nobody saw
  // them, nobody replied to them, and we never learned how many there were.
  // Somebody who applies to a caregiving programme unprompted, from a
  // university we have not opened, is the clearest signal we get about
  // where to open next, and it was going in the bin.
  //
  // So they come back, in `elsewhere`, grouped by the university they typed.
  // Not on the ladder: this is a waiting list, not a queue of work. It says
  // who is waiting and where they are piling up.
  type Student = NonNullable<typeof studentRows>[number] & { campusId: string };
  const students: Student[] = [];
  const waiting: WaitingStudent[] = [];
  for (const row of studentRows ?? []) {
    const meta = (row.metadata ?? {}) as {
      university_id?: string;
      university?: string;
      board_hidden_at?: string;
    };
    const campusId =
      (meta.university_id ? campusOfUniversity.get(meta.university_id) : undefined) ??
      (meta.university ? campusOfName.get(meta.university.trim().toLowerCase()) : undefined);
    if (campusId) {
      students.push({ ...row, campusId });
      continue;
    }
    waiting.push({
      id: row.id,
      name: row.display_name ?? "Unnamed applicant",
      // What they typed, not what we matched: the point of the list is to
      // read the names people actually give us.
      //
      // Blank is its own group and a different problem. The short form on
      // the apply page takes a name and an email and nothing else, so
      // everybody who starts there has no university until they come back
      // and finish. They are not out of area; they are unplaceable until
      // somebody asks them where they are. Same list, sorted last, labelled
      // separately on screen.
      university: (meta.university ?? "").trim() || NO_UNIVERSITY,
      appliedAt: row.created_at,
      hidden: typeof meta.board_hidden_at === "string",
    });
  }

  // Newest first inside a university, most applicants first between them.
  // Both answer the question the list is for: where is this piling up.
  const elsewhere: WaitingGroup[] = [
    ...waiting
      .reduce((acc, st) => {
        const g = acc.get(st.university) ?? { university: st.university, students: [] };
        g.students.push(st);
        acc.set(st.university, g);
        return acc;
      }, new Map<string, WaitingGroup>())
      .values(),
  ]
    .map((g) => ({
      ...g,
      students: g.students.sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1)),
    }))
    .sort((a, b) => {
      // The unplaceable group goes last however big it is. It is the one
      // group that says nothing about where to open a campus next, which is
      // what the ordering above is for.
      const an = a.university === NO_UNIVERSITY ? 1 : 0;
      const bn = b.university === NO_UNIVERSITY ? 1 : 0;
      if (an !== bn) return an - bn;
      return b.students.length - a.students.length || a.university.localeCompare(b.university);
    });

  // The facts the ladder reads: an interview on the calendar, a placement
  // accepted. Both live in their own tables, and both are read rather than
  // copied, because a copy of a fact is a fact that can go stale.
  const booked = new Map<string, string>();
  const placed = new Map<string, string>();
  const studentTasks = new Map<string, BoardTask[]>();
  const studentIds = students.map((s) => s.id);
  if (studentIds.length > 0) {
    const [interviewsRes, placementsRes, studentTasksRes] = await Promise.all([
      db
        .from("interviews")
        .select("student_profile_id, status, created_at")
        .in("student_profile_id", studentIds)
        // Anything but abandoned. A no-show still means somebody put them in
        // front of a provider, which is what the rung asks.
        .in("status", INTERVIEW_BOOKED)
        .order("created_at", { ascending: true }),
      db
        .from("medjobs_placements")
        .select("student_profile_id, status, created_at")
        .in("student_profile_id", studentIds)
        .in("status", PLACEMENT_HIRED)
        .order("created_at", { ascending: true }),
      db
        .from("business_profile_tasks")
        .select("id, business_profile_id, status, payload, notes, due_at, completed_at")
        .eq("kind", "candidate")
        .in("business_profile_id", studentIds)
        .in("status", ["pending", "completed"])
        .order("due_at", { ascending: true })
        .order("id", { ascending: true }),
    ]);
    for (const r of interviewsRes.data ?? []) {
      if (!booked.has(r.student_profile_id)) booked.set(r.student_profile_id, day(r.created_at));
    }
    for (const r of placementsRes.data ?? []) {
      if (!placed.has(r.student_profile_id)) placed.set(r.student_profile_id, day(r.created_at));
    }
    for (const t of studentTasksRes.data ?? []) {
      const payload = (t.payload ?? {}) as { step?: number; round?: number };
      const list = studentTasks.get(t.business_profile_id) ?? [];
      list.push({
        id: t.id,
        section: "students",
        step: typeof payload.step === "number" ? payload.step : 0,
        round: typeof payload.round === "number" ? payload.round : 0,
        dueAt: day(t.due_at),
        done: t.status === "completed",
        outcome: t.status === "completed" ? "Logged" : null,
        note: t.notes ?? "",
        loggedOn: t.completed_at ? day(t.completed_at) : null,
        spawned: [],
        spawnedRecords: [],
      });
      studentTasks.set(t.business_profile_id, list);
    }
  }

  // ── contacts, one per record: the first with anything usable on it ──
  type Person = { contact: string; role: string; email: string; phone: string };
  const contactOf = new Map<string, Person>();
  // Everyone beyond the primary. An advising office lists four people as
  // often as one, and this used to keep exactly the second and drop the rest.
  const othersOf = new Map<string, ExtraContact[]>();
  for (const c of contactsRes.data ?? []) {
    const name = c.name || [c.first_name, c.last_name].filter(Boolean).join(" ");
    // Role counts. A sweep often finds "Director of Health Professions
    // Advising" before it finds who holds the post, and dropping the row for
    // want of a name meant the role was typed in, saved, and never seen
    // again — which reads as the research not persisting.
    if (!name && !c.email && !c.phone && !c.role) continue;
    const person: Person = {
      contact: name ?? "",
      role: c.role ?? "",
      email: c.email ?? "",
      // Punctuated on the way out, so a number stored before this existed
      // still reads the same as one saved today.
      phone: formatPhone(c.phone ?? ""),
    };
    if (!contactOf.has(c.outreach_id)) contactOf.set(c.outreach_id, person);
    else othersOf.set(c.outreach_id, [...(othersOf.get(c.outreach_id) ?? []), { id: c.id, ...person }]);
  }

  // ── tasks, grouped by what they hang off ──────────────────────────
  const tasksByOutreach = new Map<string, BoardTask[]>();
  for (const t of outreachTasksRes.data ?? []) {
    const payload = (t.payload ?? {}) as {
      step?: number;
      round?: number;
      section?: string;
      outcome?: unknown;
      fields?: unknown;
    };
    const list = tasksByOutreach.get(t.outreach_id) ?? [];
    list.push({
      id: t.id,
      // Section is filled in once we know which record the task is on.
      section: "providers",
      step: typeof payload.step === "number" ? payload.step : 0,
      round: typeof payload.round === "number" ? payload.round : 0,
      dueAt: day(t.due_at),
      done: t.status === "completed",
      // What was actually pressed, where it was recorded. Older rows carry
      // nothing, and say so rather than claiming an outcome.
      outcome:
        t.status === "completed"
          ? (typeof payload.outcome === "string" ? payload.outcome : "Logged")
          : null,
      note: t.notes ?? "",
      // What the outcome asked for — a booked time, a portal link, how we
      // heard. Read back so a reload does not lose it and the history can
      // show it.
      fields:
        payload.fields && typeof payload.fields === "object"
          ? (payload.fields as Record<string, string>)
          : undefined,
      loggedOn: t.completed_at ? day(t.completed_at) : null,
      spawned: [],
      spawnedRecords: [],
    });
    tasksByOutreach.set(t.outreach_id, list);
  }

  const siteTask = (
    t: NonNullable<typeof siteTasksRes.data>[number],
    section: SectionKey,
  ): BoardTask => {
    const payload = (t.payload ?? {}) as { step?: number; round?: number };
    return {
      id: t.id,
      section,
      step: typeof payload.step === "number" ? payload.step : 0,
      round: typeof payload.round === "number" ? payload.round : 0,
      dueAt: day(t.due_at),
      done: t.status === "completed",
      outcome: t.status === "completed" ? "Logged" : null,
      note: t.notes ?? "",
      loggedOn: t.completed_at ? day(t.completed_at) : null,
      spawned: [],
      spawnedRecords: [],
    };
  };

  const siteTasksByCampus = new Map<string, typeof siteTasksRes.data>();
  for (const t of siteTasksRes.data ?? []) {
    const list = siteTasksByCampus.get(t.campus_id) ?? [];
    list.push(t);
    siteTasksByCampus.set(t.campus_id, list);
  }

  // ── build one university at a time ────────────────────────────────
  // ── who owns what ───────────────────────────────────────────────────
  // The team, and the pairs they hold. Anybody in admin_users who is not on
  // the roster is left out of both, so an assignment written before somebody
  // left simply stops resolving and the section reads as unassigned rather
  // than naming a person who is gone.
  const people = new Map<string, TeamMember>();
  for (const row of adminsRes.data ?? []) {
    const email = typeof row.email === "string" ? row.email.trim() : "";
    if (!onRoster(email)) continue;
    people.set(row.id as string, {
      id: row.id as string,
      email: email.toLowerCase(),
      name: firstName(email),
    });
  }

  const assignedAt = new Map<string, Assignments>();
  for (const row of assignmentsRes.data ?? []) {
    const person = people.get(row.admin_user_id as string);
    const section = String(row.section ?? "");
    if (!person || !isAssignableSection(section)) continue;
    const campus = row.campus_id as string;
    const current = assignedAt.get(campus) ?? {};
    current[section] = person;
    assignedAt.set(campus, current);
  }

  const universities: BoardUniversity[] = (campusesRes.data ?? []).map((campus) => {
    const channels: BoardUniversity["channels"] = {};
    for (const ch of channelsRes.data ?? []) {
      if (ch.campus_id !== campus.id) continue;
      channels[ch.channel as keyof BoardUniversity["channels"]] = ch.status as ChannelStatus;
    }

    const records = emptyRecords();

    for (const row of outreachRes.data ?? []) {
      if (row.campus_id !== campus.id) continue;
      const section =
        row.kind === "provider"
          ? "providers"
          : STAKEHOLDER_SECTION[row.stakeholder_type ?? ""] ?? null;
      if (!section) continue;

      // Archiving is the promise that a record leaves the board. It still
      // exists, which is what stops the catchment populate recreating it,
      // but it does not belong in a queue of work.
      if (row.status === "archived") continue;

      const c = contactOf.get(row.id);
      const tasks = (tasksByOutreach.get(row.id) ?? []).map((t) => ({ ...t, section }));
      const pending = tasks.filter((t) => !t.done);
      const closed = CLOSED_STATUSES.has(row.status);

      const research = (row.research_data ?? {}) as {
        olera_provider_id?: string;
        olera_provider_slug?: string;
        website?: string;
        address?: string;
        date?: string;
        flagged_on?: string;
      };
      const edited = (research.website ?? "").trim();
      const fromDirectory = dirSite.get(research.olera_provider_id ?? "") ?? "";
      const editedAddr = (research.address ?? "").trim();
      const addrFromDirectory = dirAddr.get(research.olera_provider_id ?? "") ?? "";

      // Rungs that open as a block are all open from the start. A rung in
      // the block with no row against it is drawn as waiting, because it is:
      // one sitting's work, done in order, and nothing is served by hiding
      // the second until the first is logged. Completing one writes its row.
      const block = LADDERS[section].openTogether ?? 0;
      if (!closed) {
        for (let k = 0; k < block; k += 1) {
          if (tasks.some((t) => t.step === k)) continue;
          tasks.push({
            id: `auto:${row.id}:${k}`,
            section,
            step: k,
            round: 0,
            dueAt: day(null),
            done: false,
            outcome: null,
            note: "",
            loggedOn: null,
            spawned: [],
            spawnedRecords: [],
          });
        }
        tasks.sort(byWorkedOrder);
      }

      records[section].push({
        id: row.id,
        section,
        name: row.organization_name ?? "Unnamed",
        contact: c?.contact ?? "",
        role: c?.role ?? "",
        phone: c?.phone ?? "",
        email: c?.email ?? "",
        website: edited || fromDirectory,
        websiteEdited: Boolean(edited),
        // Raised when somebody hit something they could not settle alone.
        flaggedOn: research.flagged_on ?? null,
        address: editedAddr || addrFromDirectory,
        addressEdited: Boolean(editedAddr),
        // Campus events only. Empty everywhere else, and the form that would
        // have asked for it is not shown there.
        date: (research.date ?? "").trim(),
        others: othersOf.get(row.id) ?? [],
        // Position is derived from the work in flight, not stored twice. The
        // lowest open rung leads, so a block reads top down.
        step: closed ? null : tasks.filter((t) => !t.done)[0]?.step ?? 0,
        round: tasks.filter((t) => !t.done)[0]?.round ?? 0,
        state: closed ? row.status.replace(/_/g, " ") : null,
        tasks,
        // Providers only: the slug for linking to the admin directory.
        // Try provider_business_profile_id first (linked to business_profiles),
        // then fall back to olera_provider_slug OR olera_provider_id from research_data.
        // The directory accepts both slug and provider_id as valid identifiers.
        directorySlug:
          row.kind === "provider"
            ? (row.provider_business_profile_id
                ? directorySlugOf.get(row.provider_business_profile_id as string)
                : null) ?? research.olera_provider_slug ?? research.olera_provider_id ?? null
            : null,
      });
    }

    // ── the students at this campus ──────────────────────────────────
    for (const st of students) {
      if (st.campusId !== campus.id) continue;

      // Complete is what the student said and the server agreed, not a
      // score. A thorough application nobody submitted is not complete.
      const app = applicationState(st);
      const facts = studentFacts({
        applicationComplete: app.complete,
        interviewOn: booked.get(st.id),
        placedOn: placed.get(st.id),
      });

      const tasks = (studentTasks.get(st.id) ?? []).map((t) => ({ ...t, section: "students" as const }));
      const pending = tasks.filter((t) => !t.done);
      // Three ways to know where a student stands, in order of authority.
      // Something waiting is the answer. Otherwise the rung after the last
      // one somebody finished, because history outranks derivation: a
      // recorded meeting must not be asked for again. Only a student with no
      // history at all is placed from the facts alone.
      const lastDone = tasks.filter((t) => t.done).reduce((m, t) => Math.max(m, t.step), -1);
      const step =
        pending.length > 0
          ? pending[0].step
          : lastDone >= 0
            ? forwardStep("students", lastDone + 1, facts)
            : derivedStep("students", facts);
      const round = pending[0]?.round ?? 0;

      // The rungs that open together: the meeting and the application. Both
      // are the next thing when an application lands, and neither waits on
      // the other. A rung the system has already answered is skipped, and so
      // is everything behind a fact that supersedes it — nobody needs
      // meeting a student who has already been interviewed.
      const block = LADDERS.students.openTogether ?? 0;
      const from = derivedStep("students", facts) ?? block;
      for (let k = Math.max(0, from); k < block; k += 1) {
        if (tasks.some((t) => t.step === k)) continue;
        const key = LADDERS.students.steps[k]?.satisfiedBy;
        if (key && facts[key]) continue;
        tasks.push({
          id: `auto:${st.id}:${k}`,
          section: "students",
          step: k,
          round: 0,
          dueAt: day(null),
          done: false,
          outcome: null,
          note: "",
          loggedOn: null,
          spawned: [],
          spawnedRecords: [],
        });
      }

      // Nobody has queued anything for this student, which is the normal
      // case: they arrived from an application, not from somebody pressing
      // start. Give them the rung they are actually on, so the record has
      // something to do rather than only a list of what is coming.
      if (tasks.every((t) => t.done) && step !== null) {
        // A recurring rung is not due the day it is reached. The monthly
        // hours check on somebody hired last week is due a month after the
        // placement, not this afternoon.
        const recurring = LADDERS.students.steps[step]?.monthly;
        const from = typeof facts.hired === "string" ? new Date(facts.hired) : new Date();
        const due = recurring
          ? new Date(from.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
          : day(null);
        tasks.push({
          id: `auto:${st.id}:${step}`,
          section: "students",
          step,
          round,
          dueAt: due,
          done: false,
          outcome: null,
          note: "",
          loggedOn: null,
          spawned: [],
          spawnedRecords: [],
        });
      }

      tasks.sort(byWorkedOrder);

      const meta = (st.metadata ?? {}) as {
        intended_professional_school?: string;
        major?: string;
        admin_viewed_at?: string;
      };

      records.students.push({
        id: st.id,
        section: "students",
        name: st.display_name ?? "Unnamed",
        // A student is the person, so the contact fields describe them.
        contact: "",
        role: "",
        phone: formatPhone(st.phone ?? ""),
        email: st.email ?? "",
        website: "",
        address: "",
        // Editing a student belongs on their own screen, not on an outreach
        // board. The board shows what it needs and links to the rest — and
        // to what a provider sees, which is the other thing worth a look
        // before anybody is introduced.
        profileUrl: `/admin/medjobs/${st.id}`,
        publicUrl: st.slug ? `/medjobs/candidates/${st.slug}` : undefined,
        // When they applied is when their account began, and it is the first
        // thing worth knowing about a name you do not recognise: somebody
        // who arrived yesterday and somebody nobody has called since March
        // are different problems.
        appliedOn: st.created_at ? day(st.created_at) : undefined,
        // Nobody has opened them. An application arrives on its own and
        // somebody has to notice; until this, noticing meant remembering to
        // go and look, and two were missed in a week because nobody did.
        isNew: !meta.admin_viewed_at,
        program: meta.intended_professional_school ?? meta.major ?? "",
        completeness: app.percent,
        missing: app.missing,
        facts,
        step: tasks.filter((t) => !t.done)[0]?.step ?? step,
        round: tasks.filter((t) => !t.done)[0]?.round ?? round,
        state: facts.hired ? LADDERS.students.goal : null,
        tasks,
      });
    }

    // The map sweep: one per university, at the bottom of the Providers
    // section, gone once it is done.
    //
    // Pushed last so it sits under the last provider, which is where it
    // belongs — it is a job about the list rather than a member of it.
    //
    // Derived rather than seeded. A campus with no completed sweep row has
    // one to do, which means a campus created tomorrow gets the task with no
    // backfill and nothing to remember in the campus-creation path. The only
    // row this ever reads is the completed one.
    for (const kind of ["map", "advisor", "org", "event", "professor", "permission"] as const) {
      const sweep = SWEEPS[kind];
      const row = (siteTasksByCampus.get(campus.id) ?? []).find(
        (t) => t.task_type === sweep.taskType,
      );
      if (row?.status === "completed") continue;
      // What has been typed into the sweep so far. It is saved as it is
      // entered, onto a pending row, so a board reload does not empty it and
      // somebody can add a few and come back.
      const found = ((row?.payload as { found?: unknown })?.found ?? []) as unknown[];
      const step = LADDERS[sweep.section].steps.findIndex((r) => r.branch === sweep.branch);
      if (step < 0) continue;
      const id = sweepId(kind, campus.id);
      records[sweep.section].push({
        id,
        section: sweep.section,
        name: LADDERS[sweep.section].steps[step].title,
        contact: "",
        role: "",
        phone: "",
        email: "",
        website: "",
        address: "",
        step,
        round: 0,
        state: null,
        tasks: [
          {
            id: `${id}:task`,
            section: sweep.section,
            step,
            round: 0,
            // Always due. Neither sweep is ever urgent and neither blocks
            // anything, and they stay on the board until somebody does them.
            dueAt: day(new Date().toISOString()),
            done: false,
            outcome: null,
            note: (row?.notes as string) ?? "",
            loggedOn: null,
            spawned: [],
            spawnedRecords: [],
            found: found as BoardTask["found"],
            // The rung renders this as its link. Building it here means the
            // operator does not retype the campus into a search box, and the
            // same search runs at every university.
            // The search the operator would have typed, typed for them. It
            // is the whole reason the rung is quick: the keywords are the
            // part that takes a minute to get right and is got wrong once
            // and then copied for a year.
            fields: SWEEP_SEARCH[kind](campus.name),
          },
        ],
      });
    }

    // The job board has no person to chase, so the channel itself is the
    // record. Its tasks are the campus-level site tasks — the ones not bound
    // to a channel record.
    for (const ch of channelsRes.data ?? []) {
      if (ch.campus_id !== campus.id) continue;
      if (CHANNEL_SECTION[ch.channel] !== "jobboard") continue;
      // Scoped to this channel, not merely to the campus. Every campus-level
      // site task used to land here — a listserv reminder, an events sweep —
      // and each was drawn as whichever job board rung its payload implied,
      // which for a task carrying no rung at all is Research. A task with no
      // channel is not a job board rung either, so it stays out.
      const tasks = (siteTasksByCampus.get(campus.id) ?? [])
        .filter((t) => !t.record_id && t.channel === ch.channel)
        .map((t) => siteTask(t, "jobboard"));
      const pending = tasks.filter((t) => !t.done);
      // campus_channels.detail was made for exactly this — its comment in
      // migration 219 already names ST3 posting_url. The board reads it
      // rather than inventing a second home for the same two links.
      const detail = (ch.detail ?? {}) as {
        board_url?: string;
        posting_url?: string;
        contact_name?: string;
        contact_email?: string;
        services_email?: string;
      };
      records.jobboard.push({
        id: ch.id,
        section: "jobboard",
        name: "University job board",
        contact: detail.contact_name ?? "",
        role: "",
        phone: "",
        email: detail.contact_email ?? "",
        website: "",
        address: "",
        boardUrl: detail.board_url ?? "",
        postingUrl: detail.posting_url ?? "",
        servicesEmail: detail.services_email ?? "",
        step: ch.status === "live" ? null : pending[0]?.step ?? 0,
        round: 0,
        state: ch.status === "live" ? LADDERS.jobboard.goal : null,
        tasks,
      });
    }

    // Orgs, events and professors also exist as channel records — the
    // activation ledger. An event in particular lives only here, because an
    // event is not someone you run follow-up rounds at.
    for (const rec of channelRecordsRes.data ?? []) {
      const channel = (channelsRes.data ?? []).find((c) => c.id === rec.channel_id);
      if (!channel || channel.campus_id !== campus.id) continue;
      const section = RECORD_KIND_SECTION[rec.kind];
      if (!section) continue;
      // An org or professor already carried as an outreach row is the same
      // thing twice; the outreach row wins, because it holds the cadence.
      if (records[section].some((r) => r.name === rec.name)) continue;

      const tasks = (siteTasksByCampus.get(campus.id) ?? [])
        .filter((t) => t.record_id === rec.id)
        .map((t) => siteTask(t, section));
      const pending = tasks.filter((t) => !t.done);
      const contact = ((rec.contacts ?? []) as Array<{ name?: string; role?: string; email?: string; phone?: string }>)[0];
      const done = rec.status === "live" || rec.status === "declined";

      records[section].push({
        id: rec.id,
        section,
        name: rec.name,
        contact: contact?.name ?? "",
        role: (contact as { role?: string } | undefined)?.role ?? "",
        phone: formatPhone(contact?.phone ?? ""),
        email: contact?.email ?? "",
        website: "",
        address: "",
        step: done ? null : pending[0]?.step ?? 0,
        round: pending[0]?.round ?? 0,
        state: done ? (rec.status === "live" ? LADDERS[section].goal : "declined") : null,
        tasks,
      });
    }

    // Every section a university needs starts itself. A campus with no
    // student orgs yet does not need someone to press Start — it needs the
    // first rung of the orgs ladder, which is "go and find them". Providers
    // and students are excluded: those arrive from the catchment and from
    // applications, so an empty section there is a fact, not a to-do.
    for (const section of SECTION_ORDER) {
      const ladder = LADDERS[section];
      if (ladder.auto) continue;
      if (records[section].length > 0) continue;
      records[section].push({
        id: `new:${campus.id}:${section}`,
        section,
        name: ladder.label,
        contact: "",
        role: "",
        phone: "",
        email: "",
        website: "",
        address: "",
        step: 0,
        round: ladder.steps[0]?.rounds ? 1 : 0,
        state: null,
        tasks: [
          {
            id: `new:${campus.id}:${section}:0`,
            section,
            step: 0,
            round: ladder.steps[0]?.rounds ? 1 : 0,
            dueAt: day(null),
            done: false,
            outcome: null,
            note: "",
            loggedOn: null,
            spawned: [],
            spawnedRecords: [],
          },
        ],
      });
    }

    // Where campus is, for the drive-time link on a record's address. The
    // coordinates are the ones the catchment is measured from, so the link
    // and the radius are answering questions about the same point.
    const uni = getPartnerUniversity(campus.slug);
    const mapsDestination =
      uni?.lat != null && uni?.lon != null
        ? `${uni.lat},${uni.lon}`
        : uni
          ? `${uni.name}, ${uni.city}, ${uni.state}`
          : null;

    // Who approved our contacting faculty here, if anybody has. Read off the
    // completed permission task rather than stored on the campus: the task
    // is the record of the asking, and a second copy would be a second thing
    // to keep in step.
    const permissionRow = (siteTasksByCampus.get(campus.id) ?? []).find(
      (t) => t.task_type === "faculty_permission" && t.status === "completed",
    );
    const permissionPayload = (permissionRow?.payload ?? {}) as {
      fields?: Record<string, string>;
      action?: number;
    };
    const approver = (permissionPayload.fields?.approver ?? "").trim();
    // Action 0 is "Approved — we may name them". Every other outcome either
    // withheld the name or did not grant anything, and naming somebody who
    // asked not to be named is the one mistake this whole task exists to
    // avoid.
    const facultyPermission =
      approver && permissionPayload.action === 0
        ? {
            approver,
            title: (permissionPayload.fields?.approver_title ?? "").trim(),
            named: true,
          }
        : null;

    // Dots read off the records rather than off a campus_channels row that
    // nothing on this board writes to. A campus whose offices had all been
    // emailed still showed grey, because logging a rung here never touched
    // that row.
    //
    // One send is enough for in progress; every record confirming is what
    // makes it live. Both sections tick the same two marks, so the same
    // function answers for each.
    for (const section of ["advisors", "orgs"] as const) {
      const channel = LADDERS[section].channel;
      if (!channel) continue;
      const derived = channelFromRecords(section, records[section] ?? []);
      if (derived) {
        channels[channel] = resolveChannel(channels[channel], derived);
      }
    }

    return {
      id: campus.id,
      slug: campus.slug,
      name: campus.name,
      // Badged on the board. A teaching campus that looks like a real one is
      // a trap for whoever opens the board next and starts working it.
      isDemo: campus.is_demo === true,
      // Sent as a boolean: the board only ever asks whether to draw the row.
      // When it was hidden and by whom stay in the column for whoever asks.
      hidden: campus.hidden_at != null,
      facultyPermission,
      mapsDestination,
      channels,
      records,
      assignments: assignedAt.get(campus.id) ?? {},
    };
  });

  // A university with nothing on it at all is noise on the board.
  const withSomething = universities.filter((u) =>
    SECTION_ORDER.some((s) => (u.records[s] ?? []).length > 0),
  );

  // The roster goes with the board so the dropdowns and the My work filter
  // have names without a second round trip. Alphabetical, so the menu reads
  // the same way every time.
  return NextResponse.json({
    universities: withSomething,
    // Applicants from universities the board has not opened. Sits under the
    // table beside the hidden campuses, because it is the same kind of
    // thing: a short list you look at occasionally, not part of the work.
    elsewhere,
    people: [...people.values()].sort(byName),
    // Who is reading. Lets the board pin "My work" at the top of the filter
    // without a second call, and is null for an admin who is not on the
    // MedJobs team — they get Everyone and the named people, no "mine".
    me: people.get(admin.id) ?? null,
  });
}

/** Kinds we know how to place, exported so the tab can say what it skipped. */
export const PLACEABLE = { STAKEHOLDER_SECTION, CHANNEL_SECTION, RECORD_KIND_SECTION };

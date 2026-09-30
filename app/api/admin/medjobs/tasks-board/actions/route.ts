import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { LADDERS, type ContactField, type SectionKey } from "@/lib/medjobs/ladders";
import {
  SKIPPED,
  SWEEPS,
  actionAt,
  parseSweepId,
  carryFrom,
  dueFor,
  dueIn,
  forwardStep,
  formatPhone,
  resolveNext,
  isSweptSection,
  type SweptSection,
} from "@/lib/medjobs/task-board";
import { firstName, isAssignableSection, onRoster } from "@/lib/medjobs/assignments";
import { handleChannelOp, type ChannelOp, type ChannelRow } from "./channel";
import { handleStudentOp, type StudentOp, type StudentRow } from "./student";

/**
 * The Tasks board, writing.
 *
 * The board itself is one GET next door. This is the other half: the small
 * set of changes an admin makes while reviewing records. It is deliberately
 * narrow — archive, delete, and edit the contact details — because those are
 * what a review pass needs. Completing and deferring tasks come later.
 *
 * Archive and delete are different promises, not two words for the same
 * thing:
 *
 *   archive  the record leaves the board and keeps everything. Reversible,
 *            and self-protecting: the catchment populate skips a provider
 *            that already has a record, archived or not.
 *   delete   the record is destroyed. The foreign keys cascade, so its
 *            tasks, contacts, touchpoints and approvals go with it. Because
 *            nothing is left to skip, the populate would recreate it on the
 *            next run — so a row goes into medjobs_excluded_records first,
 *            carrying a snapshot of what was destroyed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | ChannelOp
  | StudentOp
  | { op: "archive_record"; recordId: string; reason?: string }
  | { op: "complete_check"; recordId: string; step: number; round: number }
  | { op: "reopen_check"; recordId: string; step: number; round: number }
  | {
      op: "complete_record_task";
      recordId: string;
      step: number;
      round: number;
      actionIndex: number;
      note?: string;
      /** Typed values the outcome asked for — a link, a date, a choice. */
      fields?: Record<string, string>;
      /** What a sweep found. Each becomes its own record. */
      found?: Array<Record<string, unknown>>;
    }
  | { op: "defer_record_task"; recordId: string; step: number; round: number; days: number }
  | {
      op: "create_record";
      campusId: string;
      section: SectionKey;
      name: string;
      contact?: string;
      role?: string;
      phone?: string;
      email?: string;
      website?: string;
      address?: string;
    }
  | {
      /**
       * A sweep's found list, saved as it is typed.
       *
       * The sweep has no task row of its own — it is derived from the
       * absence of a completed one — so what was typed into it lived on an
       * object in the page and nowhere else. Five of the writes on that
       * screen reload the board, which replaces that object, so a list built
       * over a sitting could vanish without anybody touching it. It is
       * written to a pending site_tasks row now, which is also what lets
       * somebody add a few and come back.
       */
      op: "save_sweep_found";
      recordId: string;
      found?: Array<Record<string, unknown>>;
      note?: string;
    }
  | { op: "unarchive_record"; recordId: string }
  | { op: "clear_flag"; recordId: string }
  | { op: "delete_record"; recordId: string; reason?: string }
  | {
      op: "save_fields";
      recordId: string;
      fields: Partial<Record<ContactField, string>>;
      /** An admin correction. Absent means keep using the directory. */
      website?: string;
      /** The organisation's real name, when the one on file turns out wrong. */
      name?: string;
      /** An admin correction. Absent means keep using the directory. */
      address?: string;
      /**
       * Everyone beyond the primary, as the page believes the list should
       * be. Absent means contacts are not being edited; an empty array means
       * they have all been removed.
       */
      others?: Array<{ id?: string; contact?: string; role?: string; phone?: string; email?: string }>;
    }
  | {
      /**
       * Give one task type at one campus to one person, or take it back.
       *
       * A null adminUserId unassigns. There is no "add a second owner": the
       * unique index in migration 253 refuses it, and this writes over
       * whatever was there so reassigning is one call rather than a delete
       * and an insert somebody could half-finish.
       */
      op: "assign_section";
      campusId: string;
      section: string;
      adminUserId: string | null;
    }
  | {
      /**
       * Put a campus out of sight on the board, or bring it back.
       *
       * Shared, so the whole team looks at the same short list. It draws a
       * row or does not draw it: the campus keeps its records, its tasks and
       * its assignments, and appears in every rollup either way.
       */
      op: "set_campus_hidden";
      campusId: string;
      hidden: boolean;
    }
  | {
      op: "set_student_hidden";
      /** business_profiles.id of a student on the waiting list. */
      studentId: string;
      hidden: boolean;
    };

const ARCHIVED_STATUS = "archived";
/** A provider who has said they are ready to receive a student. The goal. */
const READY_STATUS = "ready_for_students";

/**
 * The work type a rung is queued under.
 *
 * `research_initial` exists in the schema already and means exactly this:
 * establishing what is true about a record before anybody contacts it.
 * Everything else on the provider ladder is a round of contact.
 */
const taskTypeFor = (section: SectionKey, step: number): string =>
  LADDERS[section].steps[step]?.check ? "research_initial" : "outreach_contact";

/** Which ladder a record climbs — the same mapping the board reads with. */
const STAKEHOLDER_SECTION: Record<string, SectionKey> = {
  advisor: "advisors",
  student_org: "orgs",
  professor: "professors",
  dept_head: "professors",
  // Must match the board's copy. It did not: the board learned about events
  // and this did not, so an event record rendered fine and answered "that
  // record has no ladder" the moment anybody logged anything on it.
  event: "events",
};

const sectionOf = (row: { kind: string; stakeholder_type?: string | null }): SectionKey | null =>
  row.kind === "provider" ? "providers" : STAKEHOLDER_SECTION[row.stakeholder_type ?? ""] ?? null;

/**
 * student_outreach carries last_edited_by and last_edited_at, and nothing
 * maintains them — there is no trigger, so they are the application's job.
 * Left unset they keep saying the row was last touched when it was created,
 * which is worse than having no audit column at all.
 */
const stamp = (userId: string) => ({
  last_edited_by: userId,
  last_edited_at: new Date().toISOString(),
});

/**
 * A record created by a sweep, provider or advisor.
 *
 * One function for both, because the two sweeps are meant to be the same
 * operation on different things — the moment there are two of these they
 * start drifting, which is the drift the sweeps were converged to remove.
 *
 * Starts at rung 1, not rung 0: rung 0 is the research that found it, and
 * handing somebody a research task for a record they have just researched is
 * asking them to do it twice.
 */
/** What a sweep found, cleaned, however it arrived. */
type Found = {
  /** The record this entry became. Absent until it has been created. */
  id?: string;
  name: string;
  contact: string;
  role: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  /** Campus events only. Free text, because "Thursday week 3" is a real
   *  answer and a date picker would refuse it. */
  date: string;
  others: Array<{ id?: string; contact: string; role: string; phone: string; email: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanFound(raw: unknown): Found[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  // Only a real uuid counts as an id. The page used to hand back synthetic
  // ones from an optimistic render, and a write keyed on those came back
  // "invalid input syntax for type uuid" — better to treat an unrecognised
  // id as no id and create the record than to fail the whole save.
  const uid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : undefined);
  return raw
    .slice(0, 100)
    .map((f) => {
      const r = (f ?? {}) as Record<string, unknown>;
      return {
        id: uid(r.id),
        name: str(r.name, 200),
        contact: str(r.contact, 200),
        role: str(r.role, 200),
        phone: str(r.phone, 50),
        email: str(r.email, 200),
        website: str(r.website, 500),
        address: str(r.address, 500),
        date: str(r.date, 100),
        others: (Array.isArray(r.others) ? r.others : []).slice(0, 20).map((o) => {
          const x = (o ?? {}) as Record<string, unknown>;
          return {
            id: uid(x.id),
            contact: str(x.contact, 200),
            role: str(x.role, 200),
            phone: str(x.phone, 50),
            email: str(x.email, 200),
          };
        }),
      };
    })
    .filter((f) => f.name !== "");
}

async function createFound(
  db: ReturnType<typeof getServiceClient>,
  section: SweptSection,
  campusId: string,
  found: {
    name: string;
    contact?: string;
    role?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    date?: string;
    others?: Array<{ contact?: string; role?: string; phone?: string; email?: string }>;
  },
  userId: string,
): Promise<{ id?: string; error?: string }> {
  const provider = section === "providers";

  // One creator for all three swept sections, because all three are
  // student_outreach rows. What differs is two columns and a label.
  //
  // The kind values are the ones migration 072 constrains the column to —
  // 'student_org', 'advisor', 'professor', 'dept_head', 'provider'. Anything
  // else is refused outright, so this is not a place to invent a word.
  const KIND: Record<SweptSection, { kind: string; stakeholder: string | null; foundBy: string }> = {
    providers: { kind: "provider", stakeholder: null, foundBy: "provider_map_sweep" },
    advisors: { kind: "advisor", stakeholder: "advisor", foundBy: "advisor_sweep" },
    orgs: { kind: "student_org", stakeholder: "student_org", foundBy: "org_sweep" },
    events: { kind: "event", stakeholder: "event", foundBy: "event_sweep" },
    professors: { kind: "professor", stakeholder: "professor", foundBy: "professor_sweep" },
  };
  const of = KIND[section];

  const research: Record<string, unknown> = {
    found_by: of.foundBy,
    added_by: userId,
    added_at: new Date().toISOString(),
  };
  // Migration 074 requires a provider row to say where it came from, and a
  // swept one has no directory behind it. 235 accepts manual_entry for
  // exactly this.
  if (provider) research.manual_entry = true;
  if (found.website?.trim()) research.website = found.website.trim();
  if (found.address?.trim()) research.address = found.address.trim();
  if (found.date?.trim()) research.date = found.date.trim();

  const { data, error } = await db
    .from("student_outreach")
    .insert({
      campus_id: campusId,
      kind: of.kind,
      stakeholder_type: of.stakeholder,
      organization_name: found.name.slice(0, 200),
      status: "researched",
      cadence_day: 0,
      research_data: research,
      ...stamp(userId),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the record" };

  // The person, when the sweep found one. A row of empty strings would show
  // on the record as a contact nobody can reach, so it is only written when
  // something was actually typed.
  const person: Record<string, string> = {};
  if (found.contact?.trim()) person.name = found.contact.trim();
  if (found.role?.trim()) person.role = found.role.trim();
  if (found.email?.trim()) person.email = found.email.trim();
  if (found.phone?.trim()) person.phone = formatPhone(found.phone);
  if (Object.keys(person).length > 0) {
    const { error: contactError } = await db
      .from("student_outreach_contacts")
      .insert({ outreach_id: data.id, is_primary: true, name: "", ...person });
    if (contactError) return { error: contactError.message };
  }

  // Everyone else the page listed. An advising office names four people as
  // often as one, and dropping them here would mean going back to the same
  // web page to find them again.
  const rest = (found.others ?? [])
    .map((o) => ({
      outreach_id: data.id,
      is_primary: false,
      name: (o.contact ?? "").trim(),
      role: (o.role ?? "").trim() || null,
      email: (o.email ?? "").trim() || null,
      phone: o.phone?.trim() ? formatPhone(o.phone) : null,
    }))
    .filter((o) => o.name || o.role || o.email || o.phone);
  if (rest.length > 0) {
    const { error: restError } = await db.from("student_outreach_contacts").insert(rest);
    if (restError) return { error: restError.message };
  }

  // Where a new record starts: the first rung of its ladder that is not a
  // branch. Asked of the ladder rather than written down, because it was
  // written down — 0 for providers, 1 for advisors, because rung 0 on the
  // advisor ladder used to be the research the sweep had just done. That
  // rung is gone and the hardcoded 1 would now start every swept office on
  // its first follow-up, having never sent it anything.
  const start = Math.max(0, LADDERS[section].steps.findIndex((r) => !r.branch));
  const block = Math.max(1, LADDERS[section].openTogether ?? 1);
  const today = new Date().toISOString().slice(0, 10);
  const { error: taskError } = await db.from("student_outreach_tasks").insert(
    Array.from({ length: block }, (_, k) => ({
      outreach_id: data.id,
      task_type: taskTypeFor(section, start + k),
      status: "pending",
      due_at: today,
      payload: {
        step: start + k,
        round: LADDERS[section].steps[start + k]?.rounds ? 1 : 0,
      },
    })),
  );
  if (taskError) return { error: taskError.message };

  return { id: data.id };
}

/**
 * Bring an already-created record back in line with its row in the sweep.
 *
 * Pressing Edit on a swept office has to reach the record, not just the
 * list: the list is a receipt, and a phone number corrected on the receipt
 * and nowhere else is a phone number nobody will ever dial.
 */
async function applyFound(
  db: ReturnType<typeof getServiceClient>,
  id: string,
  f: Found,
  userId: string,
): Promise<{ error?: string }> {
  const { data: row } = await db
    .from("student_outreach")
    .select("id, organization_name, research_data")
    .eq("id", id)
    .maybeSingle();
  // Archived out from under us, or deleted. Nothing to line up with.
  if (!row) return {};

  const research = { ...((row.research_data ?? {}) as Record<string, unknown>) };
  for (const [key, value] of [
    ["website", f.website],
    ["address", f.address],
    ["date", f.date],
  ] as const) {
    if (value) research[key] = value;
    else delete research[key];
  }
  const columns: Record<string, unknown> = { research_data: research, ...stamp(userId) };
  if (f.name && f.name !== row.organization_name) {
    if (!research.original_name) research.original_name = row.organization_name;
    columns.organization_name = f.name;
  }
  const { error } = await db.from("student_outreach").update(columns).eq("id", id);
  if (error) return { error: error.message };

  // Contacts are sent whole, the same way the record screen sends them: a
  // row with an id is updated, one without is new, and anything no longer
  // in the list was taken off on screen and goes.
  const { data: rows } = await db
    .from("student_outreach_contacts")
    .select("id, is_primary, created_at")
    .eq("outreach_id", id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  // The same split the board reads with: first row is the contact, the rest
  // are the others. It has to be the same split, because the ids in `others`
  // are the ones the board handed the page.
  const primary = (rows ?? [])[0];
  const person: Record<string, string> = {
    name: f.contact,
    role: f.role,
    email: f.email,
    phone: f.phone ? formatPhone(f.phone) : "",
  };
  const hasPerson = Object.values(person).some(Boolean);
  if (hasPerson) {
    const { error: pErr } = primary
      ? await db.from("student_outreach_contacts").update(person).eq("id", primary.id)
      : await db
          .from("student_outreach_contacts")
          .insert({ outreach_id: id, is_primary: true, ...person });
    if (pErr) return { error: pErr.message };
  }
  // Cleared on screen: it falls out of `keep` below and is deleted with
  // everything else that went, rather than in a second statement that would
  // try to delete the same row twice.

  const sent = f.others
    .map((o) => ({
      id: o.id,
      name: o.contact,
      role: o.role,
      email: o.email,
      phone: o.phone ? formatPhone(o.phone) : "",
    }))
    .filter((o) => o.name || o.role || o.email || o.phone);
  const keep = new Set(sent.map((o) => o.id).filter(Boolean));
  const keptPrimary = hasPerson && primary ? primary.id : null;
  const gone = (rows ?? [])
    .map((r) => r.id as string)
    .filter((rid) => rid !== keptPrimary && !keep.has(rid));
  if (gone.length > 0) {
    const { error: dErr } = await db.from("student_outreach_contacts").delete().in("id", gone);
    if (dErr) return { error: dErr.message };
  }
  for (const o of sent) {
    const { id: cid, ...values } = o;
    const { error: cErr } = cid
      ? await db.from("student_outreach_contacts").update(values).eq("id", cid)
      : await db
          .from("student_outreach_contacts")
          .insert({ outreach_id: id, is_primary: false, ...values });
    if (cErr) return { error: cErr.message };
  }
  return {};
}

/**
 * Make the records match the list, and hand the list back with their ids.
 *
 * A sweep used to hold everything it found in a JSON blob and turn the blob
 * into records only when the whole sweep was finished. That is a trap: the
 * research was safe but invisible, so a campus swept over three sittings
 * showed nothing on the board until the last one, and anybody who added a
 * few offices and came back the next day reasonably concluded their work
 * had been lost. A record is now created the moment it is added, and the
 * list becomes a receipt of what this sweep produced.
 *
 * Reconciled rather than diffed, because the page already knows what the
 * list should be: no id means create, an id means update, and an id that
 * has dropped out of the list means the row was taken off on screen.
 */
/** The student_outreach.kind each swept section is stored under. */
const SWEPT_KIND: Record<SweptSection, string> = {
  providers: "provider",
  advisors: "advisor",
  orgs: "student_org",
  events: "event",
  professors: "professor",
};

async function syncFound(
  db: ReturnType<typeof getServiceClient>,
  section: SweptSection,
  campusId: string,
  list: Found[],
  before: Found[],
  userId: string,
): Promise<{ found?: Found[]; error?: string }> {
  // Taken off the list on screen. Archived, not deleted: the board's promise
  // is that archiving removes a record from the queues while leaving the row
  // there, which is also what stops a later sweep recreating it.
  const kept = new Set(list.map((f) => f.id).filter(Boolean));
  const dropped = before.map((f) => f.id).filter((id): id is string => Boolean(id) && !kept.has(id));
  if (dropped.length > 0) {
    const { error } = await db
      .from("student_outreach")
      .update({ status: ARCHIVED_STATUS, ...stamp(userId) })
      .in("id", dropped);
    if (error) return { error: error.message };
    // Nobody should be given work on a record that has left the board. The
    // archive op does the same thing, and skipping it here would leave the
    // campus's task count counting offices nobody can open.
    await db
      .from("student_outreach_tasks")
      .update({ status: "cancelled" })
      .in("outreach_id", dropped)
      .eq("status", "pending");
  }

  // Two operators on the same campus, or one adding a name twice. Matched on
  // name because that is the only field a sweep is guaranteed to have.
  const { data: existing } = await db
    .from("student_outreach")
    .select("id, organization_name, status")
    .eq("campus_id", campusId)
    // The same kind the creator writes, so the dedupe actually matches.
    .eq("kind", SWEPT_KIND[section]);
  const byName = new Map(
    (existing ?? [])
      // Archived ones are off the board on purpose — usually because this
      // very list removed them. Adopting one would write the research into a
      // row nobody can see, so a name that comes back gets a fresh record.
      .filter((r) => r.status !== ARCHIVED_STATUS)
      .map((r) => [(r.organization_name ?? "").trim().toLowerCase(), r.id as string]),
  );

  const out: Found[] = [];
  for (const f of list) {
    let id = f.id;
    if (!id) {
      const match = byName.get(f.name.toLowerCase());
      if (match) id = match;
    }
    if (id) {
      const { error } = await applyFound(db, id, f, userId);
      if (error) return { error };
    } else {
      const created = await createFound(db, section, campusId, f, userId);
      if (created.error) return { error: created.error };
      id = created.id;
      if (id) byName.set(f.name.toLowerCase(), id);
    }
    out.push({ ...f, id });
  }
  return { found: out };
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("op" in body)) {
    return NextResponse.json({ error: "Missing op" }, { status: 400 });
  }

  const db = getServiceClient();

  // ── hiding a campus ───────────────────────────────────────────────────
  // Campus-level, so it goes before the record lookup below.
  if (body.op === "set_campus_hidden") {
    const campusId = (body.campusId ?? "").trim();
    if (!campusId) return NextResponse.json({ error: "Missing campus" }, { status: 400 });
    if (typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "Missing hidden" }, { status: 400 });
    }

    // Unhiding clears who hid it as well as when. Leaving a stale name on a
    // visible campus would have it answer a question nobody asked.
    const { error } = await db
      .from("student_outreach_campuses")
      .update(
        body.hidden
          ? { hidden_at: new Date().toISOString(), hidden_by: admin.id }
          : { hidden_at: null, hidden_by: null },
      )
      .eq("id", campusId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, hidden: body.hidden });
  }

  // ── putting a waiting applicant away ──────────────────────────────────
  //
  // A student from a university the board has not opened sits on a waiting
  // list under the table. Some of them are never going anywhere: the wrong
  // side of the country, a course we do not place from, somebody who filled
  // the form in twice. Hiding drops them off that list and nothing else.
  //
  // Stored on the profile's metadata rather than in a column of its own,
  // because that is where the rest of the board's view of a student already
  // lives: university, university_id and admin_viewed_at are all there, and
  // a migration for a flag on a list this size would be the wrong trade.
  // Read-modify-write, because Postgres has no partial jsonb update and the
  // alternative would drop every other key on the object.
  if (body.op === "set_student_hidden") {
    const studentId = (body.studentId ?? "").trim();
    if (!studentId) return NextResponse.json({ error: "Missing student" }, { status: 400 });
    if (typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "Missing hidden" }, { status: 400 });
    }

    const { data: profile } = await db
      .from("business_profiles")
      .select("id, metadata, type")
      .eq("id", studentId)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: "No such student" }, { status: 404 });
    // The op names a student, so refuse anything else rather than writing a
    // student-shaped flag onto a provider's profile.
    if (profile.type !== "student") {
      return NextResponse.json({ error: "That profile is not a student" }, { status: 400 });
    }

    const meta = { ...((profile.metadata ?? {}) as Record<string, unknown>) };
    if (body.hidden) {
      meta.board_hidden_at = new Date().toISOString();
      meta.board_hidden_by = admin.id;
    } else {
      // Cleared rather than set false, so "is this hidden" stays one check
      // and an unhidden student's metadata looks the way it did before.
      delete meta.board_hidden_at;
      delete meta.board_hidden_by;
    }

    const { error } = await db
      .from("business_profiles")
      .update({ metadata: meta })
      .eq("id", studentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, hidden: body.hidden });
  }

  // ── who owns a task type ──────────────────────────────────────────────
  // Campus-level, like create_record, so it is handled before the lookup
  // below that expects a record id.
  if (body.op === "assign_section") {
    const campusId = (body.campusId ?? "").trim();
    const section = (body.section ?? "").trim();
    if (!campusId) return NextResponse.json({ error: "Missing campus" }, { status: 400 });
    if (!isAssignableSection(section)) {
      return NextResponse.json({ error: `Not a task type: ${section}` }, { status: 400 });
    }

    if (body.adminUserId === null) {
      const { error } = await db
        .from("medjobs_assignments")
        .delete()
        .eq("campus_id", campusId)
        .eq("section", section);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, assignee: null });
    }

    const adminUserId = (body.adminUserId ?? "").trim();
    if (!adminUserId) return NextResponse.json({ error: "Missing person" }, { status: 400 });

    // Checked against the roster here as well as in the dropdown. A stale tab
    // holding a menu from before somebody left must not be able to assign
    // them, and this is the only place that can actually stop it.
    const { data: target, error: lookupError } = await db
      .from("admin_users")
      .select("id, email")
      .eq("id", adminUserId)
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!target || !onRoster(target.email as string)) {
      return NextResponse.json({ error: "Not on the MedJobs team" }, { status: 400 });
    }

    // Upsert on the pair, so handing a section to somebody else is one write.
    // Targeted at the unique constraint by name: a bare ON CONFLICT (column)
    // would not match it.
    const { error } = await db.from("medjobs_assignments").upsert(
      {
        campus_id: campusId,
        section,
        admin_user_id: adminUserId,
        assigned_by: admin.id,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "campus_id,section" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      assignee: {
        id: adminUserId,
        email: String(target.email).toLowerCase(),
        name: firstName(String(target.email)),
      },
    });
  }

  // ── a record typed in by hand ─────────────────────────────────────────
  // Handled before the lookup below, because this is the one op whose
  // record does not exist yet.
  if (body.op === "create_record") {
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "A record needs a name" }, { status: 400 });
    // Every section a sweep fills, which is every section whose records are
    // student_outreach rows. This was providers and advising offices alone
    // until 30 September, on the reasoning that an org, an event or a
    // professor arrives from its own rung. In practice that left a section
    // with no way to gain a record once its sweep was closed, and somebody
    // stuck for two weeks with nothing on screen to say why.
    //
    // Students and the job board are still refused, and for a reason that
    // does hold: a student is a business_profile that exists because
    // somebody applied, and the job board is the campus's own channel row.
    // Neither is a thing createFound can make.
    if (!isSweptSection(body.section)) {
      return NextResponse.json(
        { error: `A ${body.section} record cannot be added by hand` },
        { status: 400 },
      );
    }

    // The same creator the sweeps use. Two functions that both make a record
    // is how the add form and the sweep drift apart, which is the thing this
    // pass exists to stop.
    const created = await createFound(
      db,
      body.section,
      body.campusId,
      {
        name,
        contact: body.contact,
        role: body.role,
        phone: body.phone,
        email: body.email,
        website: body.website,
        address: body.address,
      },
      user.id,
    );
    if (created.error) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: created.id, name });
  }

  if (!body.recordId) {
    return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
  }

  const { data: outreach } = await db
    .from("student_outreach")
    .select("id, campus_id, kind, stakeholder_type, organization_name, status, research_data")
    .eq("id", body.recordId)
    .maybeSingle();

  // Four kinds of thing carry an id on this board and only one of them is a
  // student_outreach row. A job board is the channel row itself; a student is
  // their own profile; the map sweep has no row at all until it is done. So a
  // miss here is a question rather than an answer.
  //
  // The sweep goes first because its id is synthetic — there is nothing to
  // look up, and every other lookup would miss it and cost a round trip.
  const sweep = parseSweepId(body.recordId);
  if (sweep) {
    const { taskType, section } = SWEEPS[sweep.kind];

    // Adding one. Each addition becomes a record straight away, and the row
    // below keeps the receipt so a sweep spread over several sittings shows
    // what it has produced so far.
    if (body.op === "save_sweep_found") {
      const list = cleanFound(body.found);
      const { data: open } = await db
        .from("site_tasks")
        .select("id, status, payload")
        .eq("campus_id", sweep.campusId)
        .eq("task_type", taskType)
        .maybeSingle();

      // A finished sweep is finished. Reopening it would let the same
      // offices be created twice.
      if (open?.status === "completed") {
        return NextResponse.json({ error: "That sweep is already done" }, { status: 409 });
      }

      const before = cleanFound((open?.payload as { found?: unknown })?.found);
      const synced = await syncFound(db, section, sweep.campusId, list, before, user.id);
      if (synced.error) {
        return NextResponse.json({ error: synced.error }, { status: 500 });
      }
      const saved = synced.found ?? [];

      const row = {
        campus_id: sweep.campusId,
        task_type: taskType,
        channel: null,
        due_at: new Date().toISOString(),
        status: "pending",
        payload: { found: saved },
        notes: (body.note ?? "").trim() || null,
        created_by: user.id,
      };
      const { error } = open
        ? await db.from("site_tasks").update(row).eq("id", open.id)
        : await db.from("site_tasks").insert(row);
      // A unique violation means somebody else created the row between the
      // read and the write, which is the row being there — not a failure.
      if (error && error.code !== "23505") {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, saved: saved.length, found: saved });
    }

    if (body.op !== "complete_record_task") {
      return NextResponse.json(
        { error: "A sweep can only be logged, not deferred or reopened." },
        { status: 400 },
      );
    }
    // Everything on the list is already a record — each was created when it
    // was added. Finishing runs the same reconcile once more rather than
    // creating in bulk: it is what catches a row edited and the button
    // pressed before the edit's own save came back, and it is what creates
    // the entries of a sweep that was started before records were made on
    // add.
    const sent = cleanFound(body.found);
    // What the page sent wins, but what was saved along the way is the
    // fallback: a board reloaded between the last save and the button press
    // hands back a task with an empty list, and finishing then would drop a
    // morning's work off the receipt.
    const { data: existingRow } = await db
      .from("site_tasks")
      .select("id, status, payload")
      .eq("campus_id", sweep.campusId)
      .eq("task_type", taskType)
      .maybeSingle();
    const saved = cleanFound((existingRow?.payload as { found?: unknown })?.found);
    const list = sent.length > 0 ? sent : saved;
    // Only what the page sent can have dropped a row. Falling back to the
    // saved list means the page sent nothing, and nothing is not a removal.
    const before = sent.length > 0 ? saved : [];

    const synced = await syncFound(db, section, sweep.campusId, list, before, user.id);
    if (synced.error) {
      return NextResponse.json({ error: synced.error }, { status: 500 });
    }
    const found = synced.found ?? [];
    const made = found.length;

    // Update the row saving-as-you-type left behind, or insert one if the
    // whole sweep was done without a save landing. Not an upsert: the unique
    // index behind each sweep is partial, and a partial index cannot satisfy
    // ON CONFLICT (campus_id) — Postgres answers "no unique or exclusion
    // constraint matching the ON CONFLICT specification", which is a 500 to
    // whoever pressed the button.
    const done = {
      campus_id: sweep.campusId,
      task_type: taskType,
      channel: null,
      due_at: new Date().toISOString(),
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      created_by: user.id,
      // The fields the rung asked for, kept with the task that asked. The
      // permission task's whole output is two of them — who approved it and
      // their title — and without this the completion threw them away and
      // every professor email after it went out cold.
      payload: {
        found,
        added: made,
        fields: (body.fields ?? {}) as Record<string, string>,
        action: Number(body.actionIndex),
      },
      notes: (body.note ?? "").trim() || null,
    };
    const { error } = existingRow
      ? await db.from("site_tasks").update(done).eq("id", existingRow.id)
      : await db.from("site_tasks").insert(done);
    // A unique violation is the row already being there, which for a double
    // click is what should happen — not a failure.
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, swept: sweep.campusId, section, added: made });
  }

  if (!outreach) {
    const { data: student } = await db
      .from("business_profiles")
      .select("id, display_name, city, state, metadata")
      .eq("id", body.recordId)
      .eq("type", "student")
      .maybeSingle();
    if (student) {
      const result = await handleStudentOp(db, body as StudentOp, student as StudentRow, user.id);
      return result.ok
        ? NextResponse.json({ ok: true, ...(result.body ?? {}) })
        : NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { data: channel } = await db
      .from("campus_channels")
      .select("id, campus_id, channel, status, criteria, detail, first_activated_at")
      .eq("id", body.recordId)
      .maybeSingle();
    if (channel) {
      const result = await handleChannelOp(db, body as ChannelOp, channel as ChannelRow, user.id);
      return result.ok
        ? NextResponse.json({ ok: true, ...(result.body ?? {}) })
        : NextResponse.json({ error: result.error }, { status: result.status });
    }
  }

  if (!outreach) {
    // A synthetic starter row ("new:campus:section") has no database record
    // behind it, so there is nothing to archive, delete or edit.
    return NextResponse.json(
      { error: "That record does not exist yet. Start it before editing it." },
      { status: 404 },
    );
  }

  switch (body.op) {
    // ── archive ───────────────────────────────────────────────────────────
    case "archive_record": {
      const { error } = await db
        .from("student_outreach")
        .update({
          ...stamp(user.id),
          status: ARCHIVED_STATUS,
          research_data: {
            ...((outreach.research_data ?? {}) as Record<string, unknown>),
            archived_reason: body.reason ?? null,
            archived_by: user.id,
            archived_at: new Date().toISOString(),
          },
        })
        .eq("id", outreach.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Nobody should be given work on a record that has left the board.
      await db
        .from("student_outreach_tasks")
        .update({ status: "cancelled" })
        .eq("outreach_id", outreach.id)
        .eq("status", "pending");

      return NextResponse.json({ ok: true, archived: outreach.organization_name });
    }

    // ── put it back ───────────────────────────────────────────────────────
    case "clear_flag": {
      const research = { ...((outreach.research_data ?? {}) as Record<string, unknown>) };
      delete research.flagged_on;
      const { error } = await db
        .from("student_outreach")
        .update({ ...stamp(user.id), research_data: research })
        .eq("id", outreach.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "unarchive_record": {
      const research = { ...((outreach.research_data ?? {}) as Record<string, unknown>) };
      delete research.archived_reason;
      delete research.archived_by;
      delete research.archived_at;

      const { error } = await db
        .from("student_outreach")
        .update({ ...stamp(user.id), status: "researched", research_data: research })
        .eq("id", outreach.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Give it something to do again, but only if nothing is open already.
      // A provider restarts at rung 0, which is now Research: a record that
      // has been off the board wants looking at before it is called. An
      // advisor starts at 1, because rung 0 there is the fan-out that found
      // it in the first place.
      const { count } = await db
        .from("student_outreach_tasks")
        .select("id", { count: "exact", head: true })
        .eq("outreach_id", outreach.id)
        .eq("status", "pending");
      if (!count) {
        await db.from("student_outreach_tasks").insert({
          outreach_id: outreach.id,
          task_type: "outreach_contact",
          status: "pending",
          due_at: new Date().toISOString().slice(0, 10),
          payload: { step: outreach.kind === "provider" ? 0 : 1, round: 0 },
        });
      }
      return NextResponse.json({ ok: true, restored: outreach.organization_name });
    }

    // ── delete ────────────────────────────────────────────────────────────
    case "delete_record": {
      // Everything about to be destroyed, kept so the decision can be
      // explained or undone by hand later.
      const [{ data: tasks }, { data: contacts }] = await Promise.all([
        db
          .from("student_outreach_tasks")
          .select("task_type, status, due_at, completed_at, payload, notes")
          .eq("outreach_id", outreach.id),
        db
          .from("student_outreach_contacts")
          .select("name, role, email, phone")
          .eq("outreach_id", outreach.id),
      ]);

      const research = (outreach.research_data ?? {}) as { olera_provider_id?: string };

      const { error: logError } = await db.from("medjobs_excluded_records").upsert(
        {
          campus_id: outreach.campus_id,
          olera_provider_id: research.olera_provider_id ?? null,
          organization_name: outreach.organization_name,
          kind: outreach.kind,
          reason: body.reason ?? null,
          snapshot: { record: outreach, tasks: tasks ?? [], contacts: contacts ?? [] },
          deleted_by: user.id,
        },
        { onConflict: "campus_id,olera_provider_id" },
      );
      // The exclusion row is what makes a delete stick. Without it the
      // populate brings the record back, so a failure here stops the delete
      // rather than letting it quietly undo itself.
      if (logError) {
        return NextResponse.json(
          { error: `Could not record the exclusion, so nothing was deleted: ${logError.message}` },
          { status: 500 },
        );
      }

      // Files next. The rows cascade with the record but the objects in the
      // bucket do not — storage has no foreign keys — so deleting the record
      // without this leaves collateral nobody can see and nobody can remove.
      // Before the cascade, because after it there is nothing left to read
      // the paths from.
      const { data: files } = await db
        .from("medjobs_attachments")
        .select("path")
        .eq("outreach_id", outreach.id);
      if (files && files.length > 0) {
        const { error: filesError } = await db.storage
          .from("medjobs-collateral")
          .remove(files.map((f) => f.path as string));
        if (filesError) {
          return NextResponse.json(
            { error: `Could not remove the files, so nothing was deleted: ${filesError.message}` },
            { status: 500 },
          );
        }
      }

      // student_outreach_touchpoints is append-only and its guard fires on a
      // cascade delete too, so those rows go first through a function that
      // is allowed to remove them.
      const { error: purgeError } = await db.rpc("medjobs_purge_touchpoints", {
        p_outreach_id: outreach.id,
      });
      if (purgeError && !/does not exist/i.test(purgeError.message)) {
        return NextResponse.json({ error: purgeError.message }, { status: 500 });
      }

      const { error } = await db.from("student_outreach").delete().eq("id", outreach.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ ok: true, deleted: outreach.organization_name });
    }

    // ── a rung worked on the record itself ────────────────────────────────
    // Research is not a call to log. It is read the record, fix what is
    // wrong, and say so — which is why it is a checkbox rather than a
    // screen, and why it is the one rung that reaches the database as it
    // happens rather than at the end of a sitting.
    case "complete_check":
    case "complete_record_task":
    case "defer_record_task":
    case "reopen_check": {
      const section = sectionOf(outreach);
      if (!section) {
        return NextResponse.json({ error: "That record has no ladder" }, { status: 400 });
      }
      const step = Number(body.step);
      const round = Number(body.round);
      if (!Number.isInteger(step) || !Number.isInteger(round)) {
        return NextResponse.json({ error: "Missing step or round" }, { status: 400 });
      }
      const rung = LADDERS[section].steps[step];
      if (!rung) return NextResponse.json({ error: "That rung does not exist" }, { status: 400 });
      // The checkbox ops are for rungs worked on the record; the task ops
      // for every other kind. Crossing them would let a screen record an
      // outcome the rung does not offer.
      if (body.op === "complete_check" && !rung.check) {
        return NextResponse.json(
          { error: "That rung is not worked on the record" },
          { status: 400 },
        );
      }

      const { data: rows, error: readError } = await db
        .from("student_outreach_tasks")
        .select("id, status, payload, notes")
        .eq("outreach_id", outreach.id)
        .in("status", ["pending", "completed"]);
      if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

      const where = (t: { payload: unknown }) =>
        (t.payload ?? {}) as { step?: number; round?: number };
      const atStep = (n: number) => (rows ?? []).filter((t) => (where(t).step ?? 0) === n);

      // Which rung an outcome leads to is the ladder's decision, not this
      // file's — the same call the screen made before it sent this.
      //
      // actionAt, not rung.actions[i]: "They replied" is index -1 and is on
      // no rung's list, so a direct lookup returned undefined and this
      // refused the write. The screen and this file now read an index the
      // same way.
      const action =
        body.op === "complete_record_task"
          ? actionAt(rung, Number(body.actionIndex))
          : rung.actions[0];
      if (body.op === "complete_record_task" && !action) {
        return NextResponse.json(
          { error: "That outcome does not exist on this rung" },
          { status: 400 },
        );
      }
      const fields =
        body.op === "complete_record_task" && body.fields && typeof body.fields === "object"
          ? Object.fromEntries(
              Object.entries(body.fields).map(([k, v]) => [k, String(v ?? "").slice(0, 500)]),
            )
          : {};
      // `fields` is not optional here: it is where a resuming outcome reads
      // its way back to. Without it the server sent every provider to round
      // one of the block they had left, while the screen showed the right
      // one until the next reload.
      const nextRung = action ? resolveNext(section, step, round, action, undefined, fields) : null;
      const next = nextRung?.step ?? null;
      const mine = atStep(step).filter((t) => (where(t).round ?? 0) === round);
      const after = next === null ? [] : atStep(next).filter(
        (t) => (where(t).round ?? 0) === (nextRung?.round ?? 0),
      );

      if (body.op === "defer_record_task") {
        const open = mine.find((t) => t.status === "pending");
        if (!open) return NextResponse.json({ error: "Nothing to put off" }, { status: 400 });
        const { error } = await db
          .from("student_outreach_tasks")
          .update({ due_at: dueIn(Number(body.days) || 1) })
          .eq("id", open.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await db.from("student_outreach").update(stamp(user.id)).eq("id", outreach.id);
        return NextResponse.json({ ok: true });
      }

      if (body.op === "complete_check" || body.op === "complete_record_task") {
        const note = body.op === "complete_record_task" ? (body.note ?? "").trim() : "";
        const open = mine.find((t) => t.status === "pending");
        if (open) {
          const { error } = await db
            .from("student_outreach_tasks")
            .update({
              status: "completed",
              // A record migrated before this rung existed carries the
              // contact type on its opening task. It is the Research rung
              // now, so say so rather than leaving the row mislabelled.
              task_type: taskTypeFor(section, step),
              completed_at: new Date().toISOString(),
              // Who closed it. The column has been here since migration 064
              // and nothing ever filled it, so every provider, advisor, org,
              // event and professor task on the board was anonymous — five
              // of the seven sections. Students and the job board have
              // always recorded it; these three writes are what was missing.
              completed_by: user.id,
              // Which button was pressed. Without it every finished task
              // reads "Logged" and four attempts are indistinguishable.
              payload: {
                ...(open.payload ?? {}),
                step,
                round,
                outcome: action?.label,
                // What the outcome asked for. Unstored until now, which meant
                // a booked meeting kept its time only until the page reloaded.
                ...(Object.keys(fields).length ? { fields } : {}),
              },
              ...(note ? { notes: note } : {}),
            })
            .eq("id", open.id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          // The snapshot still says pending, and for a "repeat" outcome the
          // rung it leads to is this one — so the guard below would see the
          // row we just closed, decide the next task was already waiting,
          // and queue nothing. A voicemail would close the call rung and
          // leave the provider with no task at all.
          open.status = "completed";
        } else if (!mine.some((t) => t.status === "completed")) {
          // No row to close — a record that predates the rung. Write the
          // fact rather than dropping it, so the history is still true.
          const { error } = await db.from("student_outreach_tasks").insert({
            outreach_id: outreach.id,
            task_type: taskTypeFor(section, step),
            status: "completed",
            due_at: new Date().toISOString().slice(0, 10),
            completed_at: new Date().toISOString(),
            completed_by: user.id,
            payload: {
              step,
              round,
              outcome: action?.label,
              ...(Object.keys(fields).length ? { fields } : {}),
            },
            notes: note || null,
          });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Somebody hit something they could not settle alone. The flag is
        // on the record rather than the task, because the point of it is to
        // be visible from the list without opening anything.
        if (fields.flag_review) {
          const research = (outreach.research_data ?? {}) as Record<string, unknown>;
          const { error } = await db
            .from("student_outreach")
            .update({
              ...stamp(user.id),
              research_data: { ...research, flagged_on: new Date().toISOString() },
            })
            .eq("id", outreach.id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Close the rungs a jump went past. The opening block leaves three
        // waiting at once, so a provider who says yes on the confirming call
        // would otherwise still be told to send the programme email.
        if (next !== null && next > step) {
          const passed = (rows ?? []).filter((t) => {
            const at = where(t).step ?? 0;
            return (
              t.status === "pending" && at > step && at < next && !(t.notes ?? "").trim()
            );
          });
          for (const t of passed) {
            const { error } = await db
              .from("student_outreach_tasks")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                // Skipped rather than worked, but somebody's action closed
                // it. Leaving it null would put a hole in any count of who
                // moved a record along.
                completed_by: user.id,
                payload: { ...((t.payload ?? {}) as object), outcome: SKIPPED },
              })
              .eq("id", t.id);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            t.status = "completed";
          }
        }

        // Queue what comes next, unless it is already waiting.
        if (next !== null && nextRung && !after.some((t) => t.status === "pending")) {
          const { error } = await db.from("student_outreach_tasks").insert({
            outreach_id: outreach.id,
            task_type: taskTypeFor(section, next),
            status: "pending",
            due_at: action ? dueFor(action, fields) : dueIn(0),
            payload: {
              step: nextRung.step,
              round: nextRung.round,
              // What the errand is, so the queued rung names itself.
              // Including where the record was, which is what a branch
              // reads to find its way home.
              ...(action && carryFrom(action, fields, { step, round })
                ? { fields: carryFrom(action, fields, { step, round }) }
                : {}),
            },
          });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else {
        // Unticking. Safe only while the rung it queued is untouched: a
        // pending row with nothing written on it is work nobody has started.
        const started = after.find((t) => t.status === "completed" || (t.notes ?? "").trim());
        if (started) {
          return NextResponse.json(
            { error: "Work has already moved on, so this can't be unticked" },
            { status: 409 },
          );
        }
        const ids = after.filter((t) => t.status === "pending").map((t) => t.id);
        if (ids.length) {
          const { error } = await db.from("student_outreach_tasks").delete().in("id", ids);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const closed = mine.find((t) => t.status === "completed");
        if (closed) {
          const { error } = await db
            .from("student_outreach_tasks")
            .update({
              status: "pending",
              completed_at: null,
              due_at: new Date().toISOString().slice(0, 10),
            })
            .eq("id", closed.id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      // An outcome that closes the record closes it here too, or the board
      // shows it again on the next read.
      if (action?.outcome === "archive" || action?.outcome === "closed") {
        const { error } = await db
          .from("student_outreach")
          .update({
            ...stamp(user.id),
            status: ARCHIVED_STATUS,
            research_data: {
              ...((outreach.research_data ?? {}) as Record<string, unknown>),
              archived_reason: action.label,
              archived_by: user.id,
              archived_at: new Date().toISOString(),
            },
          })
          .eq("id", outreach.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await db
          .from("student_outreach_tasks")
          .update({ status: "cancelled" })
          .eq("outreach_id", outreach.id)
          .eq("status", "pending");
        return NextResponse.json({ ok: true, archived: outreach.organization_name });
      }

      // Reaching the providers goal is a fact worth keeping. Nothing else
      // recorded it: the goal queues no task and left the status alone, so a
      // provider who had said they were ready looked exactly like one nobody
      // had started — no open task, no state — and the board could not count
      // them. Only providers: every other ladder either recurs from its goal
      // or means something different by it.
      if (section === "providers" && action?.outcome === "goal") {
        const { error } = await db
          .from("student_outreach")
          .update({ ...stamp(user.id), status: READY_STATUS })
          .eq("id", outreach.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, ready: outreach.organization_name });
      }

      await db.from("student_outreach").update(stamp(user.id)).eq("id", outreach.id);
      return NextResponse.json({ ok: true });
    }

    // ── contact details ───────────────────────────────────────────────────
    case "save_fields": {
      const f = body.fields ?? {};
      const patch: Record<string, string> = {};
      if (typeof f.contact === "string") patch.name = f.contact.trim();
      if (typeof f.role === "string") patch.role = f.role.trim();
      if (typeof f.email === "string") patch.email = f.email.trim();
      // Normalised here as well as in the field, so a value that arrives by
      // any other route is stored the same way.
      if (typeof f.phone === "string") patch.phone = formatPhone(f.phone);

      // ── the primary contact ───────────────────────────────────────────
      if (Object.keys(patch).length > 0) {
        const { data: primary } = await db
          .from("student_outreach_contacts")
          .select("id")
          .eq("outreach_id", outreach.id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        const { error } = primary
          ? await db.from("student_outreach_contacts").update(patch).eq("id", primary.id)
          : await db
              .from("student_outreach_contacts")
              .insert({ outreach_id: outreach.id, is_primary: true, ...patch });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // ── everyone else ─────────────────────────────────────────────────
      // An office lists four people as often as one. This used to hold
      // exactly two, so the third was typed into the second's boxes or not
      // written down at all.
      //
      // Sent whole rather than as a diff: the page knows what the list
      // should be, so a row with an id is updated, one without is new, and
      // anything no longer in the list was removed on screen and goes. An
      // absent `others` means the page is not editing contacts at all —
      // which is not the same as an empty one, and must not delete them.
      if (Array.isArray(body.others)) {
        const { data: rows } = await db
          .from("student_outreach_contacts")
          .select("id")
          .eq("outreach_id", outreach.id)
          .eq("is_primary", false);

        const sent = body.others
          .map((o) => ({
            id: typeof o.id === "string" ? o.id : undefined,
            name: (o.contact ?? "").trim(),
            role: (o.role ?? "").trim(),
            email: (o.email ?? "").trim(),
            phone: formatPhone(o.phone ?? ""),
          }))
          // A blank row is somebody who pressed Add and changed their mind.
          .filter((o) => o.name || o.role || o.email || o.phone);

        const keep = new Set(sent.map((o) => o.id).filter(Boolean));
        const gone = (rows ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
        if (gone.length > 0) {
          const { error } = await db
            .from("student_outreach_contacts")
            .delete()
            .in("id", gone);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }

        for (const o of sent) {
          const { id, ...values } = o;
          const { error } = id
            ? await db.from("student_outreach_contacts").update(values).eq("id", id)
            : await db
                .from("student_outreach_contacts")
                .insert({ outreach_id: outreach.id, is_primary: false, ...values });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      // ── the record itself: name, address, website ─────────────────────
      // Gathered into one update on purpose. Each of these lives in
      // research_data, and they arrive together on every blur; writing them
      // one at a time means the second read of research_data is already
      // stale and quietly drops what the first one wrote.
      const research = { ...((outreach.research_data ?? {}) as Record<string, unknown>) };
      const columns: Record<string, unknown> = {};
      let touched = false;

      // Renaming the record, not the directory. If research shows the agency
      // trades under a different name, MedJobs should show it — but editing
      // olera-providers from here would change what the whole public site
      // calls them on the strength of one phone call.
      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) {
          return NextResponse.json({ error: "A record needs a name" }, { status: 400 });
        }
        if (name !== outreach.organization_name) {
          // Keep what it was called, once. A later rename should not erase
          // the name the spreadsheet and the directory still use.
          if (!research.original_name) research.original_name = outreach.organization_name;
          columns.organization_name = name;
          touched = true;
        }
      }

      for (const [key, value] of [
        ["address", body.address],
        ["website", body.website],
      ] as const) {
        if (typeof value !== "string") continue;
        const v = value.trim();
        if (v) research[key] = v;
        else delete research[key];
        touched = true;
      }

      if (touched) {
        const { error } = await db
          .from("student_outreach")
          .update({ ...columns, ...stamp(user.id), research_data: research })
          .eq("id", outreach.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  }
}

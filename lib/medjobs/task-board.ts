/**
 * The board: every university, its records, and the tasks on them.
 *
 * One model, two readers. The Tasks tab renders it and applies changes
 * optimistically; the API route replays the same functions against the
 * database. Keeping both on this file is what stops the screen and the
 * tables from drifting apart.
 */

import {
  LADDERS,
  SECTION_ORDER,
  rungAt,
  type LadderAction,
  type SectionKey,
} from "./ladders";
import type { Assignments } from "./assignments";

export type ChannelStatus = "not_yet" | "in_progress" | "live" | "not_available";

/** What a rung says when the ladder moved past it before anybody worked it. */
export const SKIPPED = "Not needed — they said yes first";

/**
 * Record id prefix for the per-university map sweep.
 *
 * The sweep has no row of its own until it is done, so its record is
 * synthesised from the campus. The prefix is how the server tells that id
 * apart from an outreach id when the task comes back to be completed.
 */
export const SWEEP_PREFIX = "sweep:";

/**
 * The sweeps: one-off jobs that belong to a campus rather than to any record.
 *
 * Both are derived, not seeded. A campus with no completed row for a sweep
 * has it to do, which means a campus created tomorrow gets both with no
 * backfill and nothing to remember in the campus-creation path.
 */
export type SweepKind =
  | "map"
  | "advisor"
  | "org"
  | "event"
  | "professor"
  // Not a sweep in the sense of finding things — it finds one fact. It rides
  // the same machinery because it is the same shape: one task per campus,
  // derived rather than seeded, gone once it is done, and never attached to
  // a record.
  | "permission";

export const SWEEPS: Record<
  SweepKind,
  { taskType: string; section: SweptSection; branch: string }
> = {
  map: { taskType: "provider_map_sweep", section: "providers", branch: "mapsweep" },
  advisor: { taskType: "advisor_sweep", section: "advisors", branch: "advisorsweep" },
  org: { taskType: "org_sweep", section: "orgs", branch: "orgsweep" },
  event: { taskType: "event_sweep", section: "events", branch: "eventsweep" },
  professor: { taskType: "professor_sweep", section: "professors", branch: "professorsweep" },
  permission: { taskType: "faculty_permission", section: "professors", branch: "permission" },
};

/** The sections a sweep fills. Each one's records are student_outreach rows,
 *  which is what lets one creator serve all five. */
export type SweptSection = "providers" | "advisors" | "orgs" | "events" | "professors";

/** The same five, as a value, so a route can check one without repeating them. */
export const SWEPT_SECTIONS: readonly SweptSection[] = [
  "providers",
  "advisors",
  "orgs",
  "events",
  "professors",
];

/**
 * Whether this section's records are student_outreach rows.
 *
 * The question behind it is always the same: can this thing be created by
 * `createFound`? Students cannot, because a student is a business_profile
 * that exists because somebody applied. The job board cannot, because it is
 * the campus's channel row and there is exactly one.
 */
export const isSweptSection = (s: string): s is SweptSection =>
  (SWEPT_SECTIONS as readonly string[]).includes(s);

export const sweepId = (kind: SweepKind, campusId: string) =>
  `${SWEEP_PREFIX}${kind}:${campusId}`;

/**
 * Reads a synthetic sweep id back apart.
 *
 * Ids written before there were two sweeps carried no kind — `sweep:<uuid>`
 * — and a board rendered by an older tab can still send one. Those are the
 * map sweep, which is what they were.
 */
export function parseSweepId(id: string): { kind: SweepKind; campusId: string } | null {
  if (!id.startsWith(SWEEP_PREFIX)) return null;
  const rest = id.slice(SWEEP_PREFIX.length);
  const cut = rest.indexOf(":");
  if (cut < 0) return { kind: "map", campusId: rest };
  const kind = rest.slice(0, cut);
  // Asked of SWEEPS rather than listed here. It was listed here — "map" and
  // "advisor" — so the three sweeps added after it parsed as a map sweep of
  // a campus whose id was "org:<uuid>", and the server answered "invalid
  // input syntax for type uuid". Every new sweep would have been born broken.
  if (!(kind in SWEEPS)) return { kind: "map", campusId: rest };
  return { kind: kind as SweepKind, campusId: rest.slice(cut + 1) };
}

/**
 * One thing a sweep found, as the operator typed it.
 *
 * The same fields the record itself shows, in the same order, because the
 * form that collects them is the record's own: somebody adding an agency
 * while looking at its website should not be given a smaller set of boxes
 * than the record will have, and then be asked for the rest later.
 */
/**
 * Somebody at a record besides the primary contact.
 *
 * An advising office lists four people as often as one, and the record used
 * to hold two: the primary and a single "second contact". `id` is the row in
 * student_outreach_contacts, absent on one typed and not yet saved.
 */
export interface ExtraContact {
  id?: string;
  contact: string;
  role: string;
  phone: string;
  email: string;
}

export interface FoundRecord {
  /**
   * The record this entry became. Written by the server the moment the entry
   * is added, and the reason a sweep's list is a receipt rather than a
   * holding pen — with an id, Edit reaches the record instead of only the
   * row on screen.
   */
  id?: string;
  name: string;
  contact?: string;
  role?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  /**
   * When it happens. Campus events only — everything else on this form is a
   * standing thing with no date, and an event without one is a row nobody
   * can act on.
   */
  date?: string;
  /** Everyone else listed on the page, beyond the one above. */
  others?: ExtraContact[];
}

/**
 * What the add form asks for, per section.
 *
 * It asked the same six things everywhere, which is right for an agency and
 * wrong for everyone else: a student org has no postal address, a professor
 * has a department rather than one, and an event has a date and a place —
 * neither of which had a field, so the date was going in the name.
 */
export const FOUND_FIELDS: Record<
  SweptSection,
  Array<{ key: keyof FoundRecord; label: string }>
> = {
  providers: [
    { key: "contact", label: "Primary contact" },
    { key: "role", label: "Role" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "website", label: "Website" },
    { key: "address", label: "Address" },
  ],
  advisors: [
    { key: "contact", label: "Primary contact" },
    { key: "role", label: "Role" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "website", label: "Website" },
    { key: "address", label: "Office" },
  ],
  // The officer is the address. An org has no postal one worth holding, and
  // the handle people actually reach them on is more use than a web page.
  orgs: [
    { key: "contact", label: "President or officer" },
    { key: "role", label: "Their role" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "website", label: "Page or socials" },
  ],
  // The date first, because it is the thing that decides whether this event
  // is worth anything to us, and the one nobody can look up later.
  events: [
    { key: "date", label: "Date" },
    { key: "address", label: "Where" },
    { key: "contact", label: "Organiser" },
    { key: "role", label: "Their role" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "website", label: "Event page" },
  ],
  // The professor's name is the record's name, so the contact line is their
  // department and course — which is the whole basis for writing to them
  // rather than to somebody else.
  professors: [
    { key: "role", label: "Department or course" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "website", label: "Faculty page" },
  ],
};

export interface BoardTask {
  id: string;
  section: SectionKey;
  /** Index into the ladder. */
  step: number;
  /** 1-based round inside a follow-up block; 0 outside one. */
  round: number;
  /** ISO date. A task is ready when this is today or earlier. */
  dueAt: string;
  done: boolean;
  outcome: string | null;
  note: string;
  /** ISO date it was logged. Null while pending. */
  loggedOn: string | null;
  /** Tasks this one generated, so finishing it can be unwound. */
  spawned: string[];
  /** Records this one created, for the same reason. */
  spawnedRecords: string[];
  /** A deliberate repeat: records itself and generates nothing. */
  redo?: boolean;
  /** On a research rung: the names the operator actually found. Each one
   *  becomes its own record when the task is finished. */
  found?: FoundRecord[];
  /** Typed values the rung asked for, keyed by LadderInput.key — a meeting
   *  time, a posting link, hours worked. Read back in the record history. */
  fields?: Record<string, string>;
  /** Nth reschedule round after a no-show. */
  resched?: number;
  /** Where the record stood before this task completed. */
  prev?: { step: number | null; round: number; state: string | null };
}

/**
 * A North American number, punctuated so a column of them scans.
 *
 * Deliberately conservative. Ten digits become 352-327-3877 and a leading
 * country code is dropped; anything else — an extension, an international
 * number, a note somebody typed into the field — is returned untouched,
 * because a formatter that mangles the unusual case is worse than no
 * formatter at all.
 */
export function formatPhone(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  // Letters or an extension marker mean this is not a bare number.
  if (/[a-z]/i.test(v)) return v;
  const d = v.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) {
    const t = d.slice(1);
    return `${t.slice(0, 3)}-${t.slice(3, 6)}-${t.slice(6)}`;
  }
  return v;
}

export interface BoardRecord {
  id: string;
  section: SectionKey;
  name: string;
  contact: string;
  /** What the contact is to the organisation — president, chair, director. */
  role: string;
  phone: string;
  email: string;
  /**
   * Where to look them up. For a provider this comes from the directory
   * unless an admin has corrected it; for an advising office there is no
   * directory row, so it is only ever what somebody typed.
   */
  website: string;
  /** True when the website above is an admin correction, not the directory. */
  websiteEdited?: boolean;
  /**
   * Where they actually are. Worth showing next to the campus: a record can
   * sit on a board because the directory geocoded it wrongly, and a street
   * address makes that obvious in a way coordinates never do.
   */
  address: string;
  /** True when the address is an admin correction, not the directory. */
  addressEdited?: boolean;
  /**
   * The second person at this organisation, if there is one. Kept behind a
   * disclosure in the UI: one contact is the normal case and two should not
   * cost the normal case any attention.
   */
  /** Campus events only: when it happens. */
  date?: string;
  others?: ExtraContact[];
  /**
   * Job board only. A channel is not a person, so none of the fields above
   * describe it: what it has is a way in and, once there is one, a listing.
   * Both live on the record and are filled at different rungs — the way in
   * during Research, the listing when it is approved — but neither is
   * locked to its rung, because finding the listing early is not a reason
   * to make somebody wait to write it down.
   */
  boardUrl?: string;
  postingUrl?: string;
  /** Job board only: the inbox career services answer from, if there is one. */
  servicesEmail?: string;
  /**
   * What the system already knows to be true about this record, keyed by the
   * fact name a rung names in `satisfiedBy`. The value is when it became
   * true where we know, and simply true where we do not.
   *
   * Computed on every read rather than stored. These are facts about other
   * tables — an application marked complete, an interview on the calendar, a
   * placement accepted — and a copy of a fact is a fact that can go stale.
   */
  facts?: Record<string, string | true>;
  /**
   * Students only: the two screens that are actually theirs. The admin one
   * is where a student is edited, which is not here; the public one is what
   * a provider sees when we send them a candidate, which is worth being able
   * to check before you send it.
   */
  profileUrl?: string;
  publicUrl?: string;
  /** Students only: the day they applied, which is the day their account began. */
  appliedOn?: string;
  /** Students only: what they are studying toward. */
  program?: string;
  /** Students only: how much of the application is filled in, and what is not. */
  completeness?: number;
  missing?: string[];
  /**
   * Raised when somebody hit something they could not settle alone.
   *
   * The date it was raised, so the record can say how long it has been
   * waiting. Cleared from the record menu once the team has sorted it.
   */
  flaggedOn?: string | null;
  /** Null once the record has stopped climbing — reached its goal or stopped. */
  step: number | null;
  round: number;
  state: string | null;
  /**
   * Nobody has opened this record yet.
   *
   * Students only, for now, because a student is the one record that
   * appears without anybody putting it there: an application lands and the
   * row exists. The rest arrive from a sweep or from somebody typing them
   * in, so there is nothing to notice.
   *
   * Reads metadata.admin_viewed_at, the same field the In Basket and the
   * sidebar counts already use, so opening the record anywhere clears it
   * everywhere.
   */
  isNew?: boolean;
  /** Where it stopped, so it can be started up again. */
  deadAt?: { step: number; round: number };
  reschedules?: number;
  tasks: BoardTask[];
}

/**
 * Somebody who applied from a university the board has not opened.
 *
 * They exist in the database either way. What they did not have until now
 * was a screen: the board lists campuses, and a student from somewhere else
 * matched none of them, so the loop that builds the board dropped the row
 * and nobody ever knew. An unprompted application from a campus we have not
 * opened is the clearest evidence we get about where to open next, and it
 * was being thrown away every time.
 */
export interface WaitingStudent {
  id: string;
  name: string;
  /** What they typed, not what we matched. Nothing matched. */
  university: string;
  appliedAt: string;
  /** Put away by hand. Still counted, not shown. */
  hidden: boolean;
}

/**
 * The group for an applicant who has not told us where they study.
 *
 * A distinct case from being out of area, and the larger one: the short
 * form on the apply page asks for a name and an email and nothing else, so
 * everybody who starts there lands here until they come back and finish.
 * They may well be at a campus already on the board. Somebody has to ask.
 */
export const NO_UNIVERSITY = "No university given";

/** One university's worth of them. The grouping is the useful part. */
export interface WaitingGroup {
  university: string;
  students: WaitingStudent[];
}

export interface BoardUniversity {
  id: string;
  slug: string;
  name: string;
  /**
   * Where campus is, for a directions link: "33.4242,-111.9281" when we hold
   * coordinates, the town otherwise, null when we hold neither. Resolved on
   * the server because the catchment file that knows it is server-side.
   */
  mapsDestination: string | null;
  /** A teaching campus. Badged on the board, and out of every rollup. */
  isDemo?: boolean;
  /**
   * Put out of sight on the board, for the whole team.
   *
   * A campus nobody is working still has records and still takes a row.
   * This drops the row and nothing else: the records, the tasks, the
   * assignments and every rollup carry on untouched, and unhiding puts the
   * board back exactly as it was.
   */
  hidden?: boolean;
  /**
   * Who approved our contacting faculty here, when somebody has.
   *
   * A department chair, industry relations, or a communications office —
   * recorded once for the campus and read by every professor email after
   * it. Absent means nobody has been asked, or nobody said yes, and the
   * email goes out on its own terms.
   */
  facultyPermission?: { approver: string; title: string; named: boolean } | null;
  /** Straight from campus_channels — the dots keep their current meaning. */
  channels: Partial<Record<"st3" | "st4" | "st5" | "st6" | "st7", ChannelStatus>>;
  records: Record<SectionKey, BoardRecord[]>;
  /**
   * Who owns each task type here. A missing key is unassigned.
   *
   * Read-only on the board: the assign route is the only thing that writes
   * one, and the board refetches after it does.
   */
  assignments?: Assignments;
}

/** Why a record was stopped. The one list, so the reasons stay comparable. */
export const STOP_REASONS = [
  "Wrong number or email",
  "The person has left",
  "Not a fit / out of business",
  "They asked us to stop",
] as const;

/** How long "Not yet" puts something off for. */
export const DEFERRALS: Array<{ label: string; days: number }> = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "Next month", days: 30 },
  // A missed career fair is not a next-month problem. Roughly a term out,
  // which is when the same event comes round again.
  { label: "Next season", days: 120 },
];

// ── dates ────────────────────────────────────────────────────────────

const DAY = 86_400_000;

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** N days out, as a plain ISO date. Weekends are skipped for 1–14 day gaps. */
export function dueIn(days: number): string {
  const d = startOfToday();
  if (days <= 0) return iso(d);
  if (days > 14) return iso(new Date(d.getTime() + days * DAY));
  let left = days;
  while (left > 0) {
    d.setTime(d.getTime() + DAY);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return iso(d);
}

export const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The values an outcome hands to the rung it queues — see LadderAction.carry.
 */
export function carryFrom(
  action: LadderAction,
  fields: Record<string, string> | undefined,
  /**
   * Where the record was. Required, not optional: the server forgot to pass
   * it and the origin never reached the database, so a branch found its way
   * home on the screen and back to round one on the next reload. A required
   * argument is the only version of that guard the compiler can enforce.
   */
  from: { step: number; round: number },
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const key of action.carry ?? []) {
    const v = (fields?.[key] ?? "").trim();
    if (v) out[key] = v;
  }
  // Where the record was, so a branch can find its way back.
  if (action.carryOrigin) {
    out.from_step = String(from.step);
    out.from_round = String(from.round);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The rung a branch returns to: one round on from where it left.
 *
 * That round was logged before the branch opened, so going back to it would
 * mean contacting them twice for the same one. Capped at the last round of
 * the block, which repeats rather than ending when the block says so.
 */
export function resumeAt(
  section: SectionKey,
  fields?: Record<string, string>,
): { step: number; round: number } | null {
  const step = Number(fields?.from_step);
  const round = Number(fields?.from_round);
  if (!Number.isInteger(step) || !Number.isInteger(round)) return null;
  const rung = LADDERS[section].steps[step];
  if (!rung) return null;
  if (!rung.rounds) return { step, round };
  return { step, round: Math.min(Math.max(1, round + 1), rung.rounds) };
}

/**
 * When the rung an action queues is due.
 *
 * Normally `delay` business days out. An action that names `delayFrom`
 * takes the date from one of its own fields instead — a meeting booked for
 * next Thursday puts its log rung on next Thursday, not two working days
 * from whenever it was booked. A field left empty or in the past falls back
 * to the delay, because a due date in the past is a task that shouts.
 */
export function dueFor(action: LadderAction, fields?: Record<string, string>): string {
  if (action.delayFrom) {
    const raw = (fields?.[action.delayFrom] ?? "").trim();
    const day = raw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day >= iso(startOfToday())) return day;
  }
  return dueIn(action.delay);
}


export function isReady(t: BoardTask): boolean {
  return !t.done && t.dueAt <= iso(startOfToday());
}

/** "today", "tomorrow", "overdue", or a short date. */
export function dueLabel(dueAt: string): string {
  const today = startOfToday();
  const diff = Math.round((new Date(`${dueAt}T00:00:00`).getTime() - today.getTime()) / DAY);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return new Date(`${dueAt}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A date with its year, for something that may be a term ago. */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function shortDate(dueAt: string): string {
  return new Date(`${dueAt}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── counting ─────────────────────────────────────────────────────────

export const allRecords = (u: BoardUniversity): BoardRecord[] =>
  SECTION_ORDER.flatMap((s) => u.records[s] ?? []);

export const recordReady = (r: BoardRecord): number => r.tasks.filter(isReady).length;

export const sectionReady = (u: BoardUniversity, s: SectionKey): number =>
  (u.records[s] ?? []).reduce((n, r) => n + recordReady(r), 0);

export const readyCount = (u: BoardUniversity): number =>
  allRecords(u).reduce((n, r) => n + recordReady(r), 0);

/**
 * Tasks waiting in just these task types.
 *
 * What the board's Tasks column shows under a My work filter: how much is
 * waiting *for you* here. The seven section columns beside it are deliberately
 * not filtered — they describe the university, which is the same fact whoever
 * is looking.
 */
export const readyCountIn = (
  u: BoardUniversity,
  sections: readonly SectionKey[],
): number =>
  sections.reduce(
    (n, s) => n + (u.records[s] ?? []).reduce((m, r) => m + recordReady(r), 0),
    0,
  );

/**
 * Providers who have said they are ready to receive a student.
 *
 * The one number the provider funnel exists to produce, so it is what the
 * board's Providers column shows. It counts records at the goal rather than
 * tasks waiting: a campus with nine providers ready and nothing to do today
 * is a success, and a task count would have called it empty.
 *
 * The state comes from the record's own status, which the server sets when
 * the goal outcome is logged. Before that it lived only in the browser.
 */
export const readyForStudents = (u: BoardUniversity): number =>
  (u.records.providers ?? []).filter((r) => r.state === LADDERS.providers.goal).length;

/**
 * Student applications at this university — one per student record.
 *
 * Every student on the board arrived by applying, so the record is the
 * application. This column used to count their open tasks, which answered a
 * question nobody was asking of it: how many students are here is the thing
 * you want from a list of universities.
 */
export const applications = (u: BoardUniversity): number => (u.records.students ?? []).length;

export const doneToday = (u: BoardUniversity): number => {
  const today = iso(startOfToday());
  return allRecords(u).reduce(
    (n, r) => n + r.tasks.filter((t) => t.loggedOn === today).length,
    0,
  );
};

/**
 * The next thing to do. The record in hand finishes first, then the next
 * record in ladder order — so the operator never bounces back to a list.
 */
export function nextReady(
  u: BoardUniversity,
  prefer?: BoardRecord | null,
  /**
   * Walk only these task types. Under a My work filter, "Start the next task"
   * must not hand somebody a record in a section that is not theirs — which
   * is also why the record in hand is only preferred when it is in scope.
   */
  only?: readonly SectionKey[],
): { record: BoardRecord; task: BoardTask } | null {
  const scope = only ?? SECTION_ORDER;
  const scan = (r: BoardRecord) => {
    const t = r.tasks.find(isReady);
    return t ? { record: r, task: t } : null;
  };
  if (prefer && scope.includes(prefer.section)) {
    const hit = scan(prefer);
    if (hit) return hit;
  }
  for (const section of scope)
    for (const r of u.records[section] ?? []) {
      if (r === prefer) continue;
      const hit = scan(r);
      if (hit) return hit;
    }
  return null;
}

// ── changing things ──────────────────────────────────────────────────

let seq = 0;
/**
 * The prefix on an id the page invented.
 *
 * A fan-out draws its new records immediately, before the server has given
 * them real ids, so anything keyed on the id has to wait for the next read.
 */
export const LOCAL_PREFIX = "local-";

/** Records on the teaching campus. Never written, never read back. */
export const DEMO_RECORD_PREFIX = "demo:";

/** True when this record exists only in the page, with no row behind it. */
/**
 * The board's stand-in for a section with nothing in it yet — "new:<campus>:
 * <section>". It looks like a record so the first rung has somewhere to
 * render, but there is no row behind it, and treating it as one offered an
 * attachment control that posted a non-uuid and failed in red on the screen.
 */
export const PLACEHOLDER_PREFIX = "new:";

export const isSaved = (id: string): boolean =>
  !id.startsWith(LOCAL_PREFIX) &&
  !id.startsWith(SWEEP_PREFIX) &&
  !id.startsWith(DEMO_RECORD_PREFIX) &&
  !id.startsWith(PLACEHOLDER_PREFIX);

const newId = (): string => `${LOCAL_PREFIX}${Date.now().toString(36)}-${(seq += 1).toString(36)}`;

function makeTask(section: SectionKey, step: number, round: number, dueAt: string): BoardTask {
  return {
    id: newId(),
    section,
    step,
    round,
    dueAt,
    done: false,
    outcome: null,
    note: "",
    loggedOn: null,
    spawned: [],
    spawnedRecords: [],
  };
}

export function makeRecord(
  section: SectionKey,
  name: string,
  step: number | null,
  round = 0,
  dueDays = 0,
): BoardRecord {
  const r: BoardRecord = {
    id: newId(),
    section,
    name,
    contact: "",
    role: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    step,
    round,
    state: null,
    tasks: [],
  };
  if (step !== null) r.tasks.push(makeTask(section, step, round, dueIn(dueDays)));
  return r;
}

/** What finishing a task did, so the caller can persist it. */
export interface Effect {
  /** Criterion keys to tick on the record's channel. */
  ticks: string[];
  /** Where the flow should land next. Null when there is nothing left. */
  landOn: { record: BoardRecord; task: BoardTask } | null;
  /** True when the record had work and now has none. */
  recordCleared: boolean;
  /** True when the university had work and now has none. */
  universityCleared: boolean;
}

/**
 * Finish a task and generate whatever comes next.
 *
 * The record is only moved after the new task exists, never before — the
 * reverse order is what let a failed insert leave a record with its rounds
 * cancelled and nothing queued.
 */
export function complete(
  u: BoardUniversity,
  record: BoardRecord,
  task: BoardTask,
  action: LadderAction,
  reason?: string,
): Effect {
  const hadRecordWork = recordReady(record) > 0;
  const hadUniWork = readyCount(u) > 0;
  const ladder = LADDERS[record.section];
  const rung = rungAt(record.section, task.step, task.round);

  task.done = true;
  task.outcome = reason ? `Can't be done — ${reason.toLowerCase()}` : action.label;
  task.loggedOn = iso(startOfToday());
  task.prev = { step: record.step, round: record.round, state: record.state };
  task.spawned = [];
  task.spawnedRecords = [];

  let landRecord: BoardRecord | null = null;

  /**
   * `delay` is the action's, and is taken from the action rather than passed
   * — dueFor has to see `delayFrom` and the fields as well, and two callers
   * computing a due date is two answers.
   */
  const queue = (step: number, round: number) => {
    // A rung that is already waiting is not queued twice. Rungs opened as a
    // block are all pending from the start, so finishing the first would
    // otherwise add a second copy of the second.
    const open = record.tasks.find((t) => !t.done && t.step === step && t.round === round);
    if (open) {
      if (step > task.step) skipPast(step);
      record.step = step;
      record.round = round;
      landRecord = record;
      return;
    }
    if (step > task.step) skipPast(step);
    const next = makeTask(record.section, step, round, dueFor(action, task.fields));
    // An errand is only a task if it carries what the errand is.
    const carried = carryFrom(action, task.fields, { step: task.step, round: task.round });
    if (carried) next.fields = carried;
    record.tasks.push(next);
    task.spawned.push(next.id);
    record.step = step;
    record.round = round;
    landRecord = record;
  };

  /**
   * Close the rungs a jump went past.
   *
   * The opening block leaves three rungs waiting at once, so a provider who
   * says yes on the confirming call still had "Send the program info" sitting
   * there — the ladder had moved on and the screen had not. They are closed
   * with a reason rather than deleted, because a task that vanishes is a task
   * nobody can explain later.
   *
   * Only rungs between the one just finished and the one being jumped to, and
   * only ones nobody has written anything on.
   */
  const skipPast = (to: number) => {
    for (const t of record.tasks) {
      if (t.done || t.step <= task.step || t.step >= to) continue;
      if ((t.note ?? "").trim() || t.fields) continue;
      t.done = true;
      t.outcome = SKIPPED;
      t.loggedOn = iso(startOfToday());
    }
  };

  const stop = (state: string) => {
    record.deadAt = { step: task.step, round: task.round };
    record.state = state;
    record.step = null;
  };

  /** The next rung that is part of the forward sequence. */
  const forward = (from: number): number | null =>
    forwardStep(record.section, from, record.facts);

  /** The rung of this name, branch or not, if the ladder has one. */
  const branchAt = (name: string): number =>
    ladder.steps.findIndex((s) => (s.branch ?? s.name) === name);

  if (task.redo) {
    // A deliberate repeat. It records itself and nothing else.
  } else if (action.resume && resumeAt(record.section, task.fields)) {
    const back = resumeAt(record.section, task.fields)!;
    queue(back.step, back.round);
  } else if (action.goto && action.outcome !== "goal" && branchAt(action.goto) >= 0) {
    // A branch is skipped when climbing, so an outcome that exists to reach
    // one has to name it. Without this the seasonal "it's gone" fell off the
    // end of the ladder and marked the channel live.
    //
    // Reaching the goal is deliberately not handled here. A goal that names
    // a rung has two jobs — say the ladder is finished, and queue what comes
    // back later — and taking the shortcut here did only the second, so the
    // job board queued its seasonal check and never went live.
    const at = branchAt(action.goto);
    queue(at, ladder.steps[at].rounds ? 1 : 0);
  } else {
    switch (action.outcome) {
      case "next": {
        if (rung?.rounds && task.round < rung.rounds) {
          queue(task.step, task.round + 1);
          break;
        }
        if (rung?.rounds) {
          // Seven cold follow-ups with no reply is the end of the road. Seven
          // nudges at a provider who has already said yes is not.
          if (rung.exhausted === "repeat") {
            queue(task.step, task.round);
            break;
          }
          stop("archived — no reply");
          break;
        }
        const nxt = forward(task.step + 1);
        if (nxt === null) stop(ladder.goal);
        else queue(nxt, LADDERS[record.section].steps[nxt].rounds ? 1 : 0);
        break;
      }
      case "replied": {
        const nxt = forward(task.step + 1);
        if (nxt === null) stop(ladder.goal);
        else queue(nxt, LADDERS[record.section].steps[nxt].rounds ? 1 : 0);
        break;
      }
      case "repeat":
        queue(task.step, task.round);
        break;
      case "goal": {
        // A goal that recurs — monthly hours, or the seasonal check a
        // finished channel earns. `goto` names which rung comes back; with
        // no name it is this one again.
        const back = action.goto ? branchAt(action.goto) : task.step;
        const at =
          back >= 0 && action.goto
            ? { step: back, round: ladder.steps[back].rounds ? 1 : 0 }
            : { step: task.step, round: task.round };
        stop(ladder.goal);
        if (action.delay) {
          queue(at.step, at.round);
          record.state = ladder.goal;
          record.step = null;
        }
        break;
      }
      case "archive":
        stop("archived");
        break;
      case "closed":
        stop("section closed");
        break;
      case "reschedule": {
        record.reschedules = (record.reschedules ?? 0) + 1;
        const next = makeTask(record.section, task.step, task.round, dueFor(action, task.fields));
        next.resched = record.reschedules;
        record.tasks.push(next);
        task.spawned.push(next.id);
        landRecord = record;
        break;
      }
      case "fanout": {
        // Nothing is born here any more. Every entry on a sweep's list became
        // a record the moment it was added, so the records this would invent
        // are already on the board with the ids the server gave them — and
        // inventing them again produced a second copy carrying a placeholder
        // id, which every later write rejected as not a uuid.
        //
        // Finishing a sweep now only closes the sweep and lands on the first
        // thing it produced.
        const made = task.found ?? [];
        const here = u.records[record.section] ?? [];
        const born = made
          .map((f) => here.find((r) => (f.id ? r.id === f.id : r.name === f.name.trim())))
          .filter((r): r is BoardRecord => Boolean(r));
        for (const r of born) task.spawnedRecords.push(r.id);
        record.state = "done";
        record.step = null;
        if (born.length) landRecord = born[0];
        break;
      }
    }
  }

  if (reason) {
    stop(`stopped — ${reason.toLowerCase()}`);
    record.tasks = record.tasks.filter((t) => t.done);
    landRecord = null;
  }

  return {
    ticks: reason ? [] : (action.ticks ?? []),
    landOn: nextReady(u, landRecord ?? record),
    recordCleared: hadRecordWork && recordReady(record) === 0,
    universityCleared: hadUniWork && readyCount(u) === 0,
  };
}

/** Put a task off. Deferring is not an outcome: nothing else changes. */
export function defer(u: BoardUniversity, record: BoardRecord, task: BoardTask, days: number): Effect {
  const hadRecordWork = recordReady(record) > 0;
  const hadUniWork = readyCount(u) > 0;
  task.dueAt = dueIn(days);
  return {
    ticks: [],
    landOn: nextReady(u, record),
    recordCleared: hadRecordWork && recordReady(record) === 0,
    universityCleared: hadUniWork && readyCount(u) === 0,
  };
}

/** Safe to unwind only while nothing it produced has been acted on. */
export function canReopen(record: BoardRecord, task: BoardTask): boolean {
  if (task.spawnedRecords.length) return false;
  return task.spawned.every((id) => {
    const t = record.tasks.find((x) => x.id === id);
    return !t || !t.done;
  });
}

export function reopen(record: BoardRecord, task: BoardTask): void {
  for (const id of task.spawned) {
    const i = record.tasks.findIndex((t) => t.id === id);
    if (i >= 0 && !record.tasks[i].done) record.tasks.splice(i, 1);
  }
  if (task.prev) {
    record.step = task.prev.step;
    record.round = task.prev.round;
    record.state = task.prev.state;
  } else if (record.step === null) {
    record.step = task.step;
    record.round = task.round;
    record.state = null;
  }
  task.done = false;
  task.outcome = null;
  task.loggedOn = null;
  task.dueAt = dueIn(0);
  task.spawned = [];
  task.spawnedRecords = [];
}

/** Run the same task again without disturbing anything downstream. */
export function doAgain(record: BoardRecord, task: BoardTask): BoardTask {
  const copy = makeTask(record.section, task.step, task.round, dueIn(0));
  copy.redo = true;
  copy.resched = task.resched;
  record.tasks.push(copy);
  return copy;
}

/** Bring a stopped record back where it left off. People reply months later. */
export function revive(record: BoardRecord): BoardTask {
  const at = record.deadAt ?? { step: 0, round: 0 };
  record.state = null;
  record.step = at.step;
  record.round = at.round;
  const t = makeTask(record.section, at.step, at.round, dueIn(0));
  record.tasks.push(t);
  return t;
}

/**
 * The rungs ahead that have not been generated yet. No dates — they do not
 * exist. A run of follow-ups collapses to one line; it is the same act.
 */
export function stillToCome(record: BoardRecord): Array<{ title: string; recurring: boolean }> {
  if (record.step === null) return [];
  const ladder = LADDERS[record.section];
  const out: Array<{ title: string; recurring: boolean }> = [];
  const run = (from: number, to: number) =>
    from > to
      ? null
      : { title: from === to ? `Follow up ${from}` : `Follow ups ${from}–${to}`, recurring: false };

  /** A rung already on the record, waiting or done, is not still to come. */
  const held = new Set(record.tasks.map((t) => t.step));

  const current = ladder.steps[record.step];
  if (current?.rounds) {
    const r = run((record.round || 1) + 1, current.rounds);
    if (r) out.push(r);
  }
  for (let i = record.step + 1; i < ladder.steps.length; i += 1) {
    const s = ladder.steps[i];
    if (s.branch) continue;
    // Already true, and shown as done elsewhere. Listing it here as well
    // would promise work that is not coming.
    if (s.satisfiedBy && record.facts?.[s.satisfiedBy]) continue;
    if (held.has(i)) continue;
    if (s.rounds) {
      const r = run(1, s.rounds);
      if (r) out.push(r);
      continue;
    }
    out.push({ title: s.title, recurring: Boolean(s.seasonal || s.monthly) });
  }
  return out;
}

/**
 * Where an action sends a record: a rung, or nothing left.
 *
 * Exported because the screen and the server both have to make this call —
 * the screen to show the next task immediately, the server to write it — and
 * two copies of the rule would be two rules. `scripts/check-job-board.ts`
 * asserts this agrees with `complete()` for every rung on the ladder.
 */
export function resolveNext(
  section: SectionKey,
  step: number,
  round: number,
  action: LadderAction,
  facts?: Record<string, string | true>,
  /** The finishing task's typed values — where a resuming branch reads its way back. */
  fields?: Record<string, string>,
): { step: number; round: number } | null {
  const steps = LADDERS[section].steps;
  const at = (name: string) => steps.findIndex((r) => (r.branch ?? r.name) === name);

  // Coming home from a branch beats the name it would otherwise aim at.
  if (action.resume) {
    const back = resumeAt(section, fields);
    if (back) return back;
  }

  // A named rung wins: it is the only way to reach a branch, and the only
  // way a finished ladder earns its recurring check.
  if (action.goto) {
    const i = at(action.goto);
    if (i >= 0) return { step: i, round: steps[i].rounds ? 1 : 0 };
  }

  const rung = rungAt(section, step, round);
  switch (action.outcome) {
    // A fan-out leads nowhere on its own ladder: what it produces is other
    // records, each starting their own. The sweep that ran it is done.
    case "fanout":
      return null;
    case "repeat":
    // A no-show is the same rung again, from the record's point of view.
    // It was missing here, so the server closed the meeting task and
    // queued nothing: a provider who did not turn up fell off the board.
    case "reschedule":
      return { step, round };
    case "next":
      if (rung?.rounds) {
        if (round < rung.rounds) return { step, round: round + 1 };
        return rung.exhausted === "repeat" ? { step, round } : null;
      }
    // falls through: a rung outside a block moves on the same way a reply does
    case "replied": {
      const nxt = forwardStep(section, step + 1, facts);
      return nxt === null ? null : { step: nxt, round: steps[nxt].rounds ? 1 : 0 };
    }
    default:
      return null;
  }
}

/**
 * The next rung in the forward sequence at or after `from`, or null when the
 * ladder has run out. Branch, seasonal and monthly rungs are reached by name
 * or by the calendar, never by climbing, so they are stepped over.
 *
 * Exported because the server has to make the same decision when it queues
 * whatever a finished rung leads to, and two copies of this loop would be
 * two places for the ladder to drift.
 */
export function forwardStep(
  section: SectionKey,
  from: number,
  facts?: Record<string, string | true>,
): number | null {
  const steps = LADDERS[section].steps;
  for (let i = from; i < steps.length; i += 1) {
    const s = steps[i];
    if (s.branch || s.seasonal || s.monthly) continue;
    // Already true. Handing somebody a rung the database has answered is
    // asking them to copy it back into the database.
    if (s.satisfiedBy && facts?.[s.satisfiedBy]) continue;
    return i;
  }
  return null;
}

/**
 * Unsuccessful attempts logged against a rung.
 *
 * Counted from what was actually pressed, so reaching somebody who would
 * not give an address does not count against the record. Three is what the
 * operating model calls enough, and the screen says so rather than acting
 * on it.
 */
export function strikesAt(record: BoardRecord, step: number, round: number): number {
  const strikes = new Set(
    (LADDERS[record.section].steps[step]?.actions ?? [])
      .filter((a) => a.strike)
      .map((a) => a.label),
  );
  return record.tasks.filter(
    (t) => t.done && t.step === step && t.round === round && t.outcome && strikes.has(t.outcome),
  ).length;
}

/** True when the system already knows this rung is done. */
export function satisfied(record: BoardRecord, step: number): boolean {
  const key = LADDERS[record.section].steps[step]?.satisfiedBy;
  return Boolean(key && record.facts?.[key]);
}

/**
 * Where a record stands before anybody has recorded anything.
 *
 * Two passes, because the two kinds of fact mean different things. A rung
 * marked `supersedes` says everything behind it happened one way or another:
 * a student with an interview booked does not need chasing for a meeting. A
 * plain fact only answers its own rung, so a finished application still
 * leaves the meeting to do.
 *
 * Returns null when the ladder has been climbed out.
 */
export function derivedStep(
  section: SectionKey,
  facts: Record<string, string | true> | undefined,
): number | null {
  const steps = LADDERS[section].steps;
  let from = 0;
  steps.forEach((s, i) => {
    if (s.supersedes && s.satisfiedBy && facts?.[s.satisfiedBy]) from = i + 1;
  });
  for (let i = from; i < steps.length; i += 1) {
    const s = steps[i];
    if (s.branch) continue;
    if (s.satisfiedBy && facts?.[s.satisfiedBy]) continue;
    return i;
  }
  return null;
}

/**
 * True when this task is worked on the record rather than on its own screen.
 *
 * The one place that decides it, so the record, the run-through and the
 * server all agree about which rungs are a checkbox — see LadderRung.check.
 */
export function isCheck(task: BoardTask): boolean {
  return rungAt(task.section, task.step, task.round)?.check === true;
}

/**
 * Where this rung's copy lives in the master scripts document.
 *
 * Read off the raw rung, never the one `rungAt` resolved. A rounds block is
 * one section of the document however many rounds it has, and its resolved
 * title carries the round number — so resolving first would send Follow up 3
 * to an anchor that does not exist.
 *
 * It must agree with the slugs seeded by migration 239. Changing it orphans
 * every link into the document.
 */
export function scriptSlug(section: SectionKey, step: number): string | null {
  const rung = LADDERS[section].steps[step] as
    | { name?: string; branch?: string; title?: string }
    | undefined;
  if (!rung) return null;
  const key =
    rung.name ??
    rung.branch ??
    (rung.title ?? `step-${step}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${section}-${key}`;
}

/**
 * Which kind of record a section's rows are, for attachments.
 *
 * The board shows four kinds of thing on one screen and only two of them are
 * student_outreach rows. A student is a business_profiles row and a job board
 * is a campus_channels row, so a file cannot be filed against an outreach id
 * for either — hence the pair the attachment carries.
 */
export function attachmentKind(section: SectionKey): "outreach" | "student" | "jobboard" {
  if (section === "students") return "student";
  if (section === "jobboard") return "jobboard";
  return "outreach";
}

/** The title shown for a task, follow-up numbering and all. */
export function taskTitle(task: BoardTask): string {
  if (task.resched) return `Reschedule round ${task.resched}`;
  const rung = rungAt(task.section, task.step, task.round);
  // An errand names itself. "Something else" on a queue of them tells an
  // operator nothing, and the whole point of the rung is that we could not
  // have known what it would be.
  //
  // Only on the errand rung, though. The outcome that queues an errand
  // stores what was typed on the task it closes as well, so any finished
  // rung that had produced one took the errand's name: the history showed
  // the typed text struck through with "Something else" in bold under it,
  // the errand twice over, and no sign of the rung it actually came from.
  const todo = (task.fields?.todo ?? "").trim();
  if (todo && rung?.branch === "errand") return todo;
  return rung?.title ?? "Task";
}

/**
 * "They replied" — the outcome every rung has and no rung declares.
 *
 * A reply can arrive against any rung, so it is not in any rung's actions
 * list. It used to be built inline on the screen, which meant the server had
 * no way to name it: the screen sent actionIndex -1, the server looked it up
 * in rung.actions, found nothing, and refused the write. The note the
 * operator had just typed lived in the browser until the next reload.
 *
 * One definition, both readers, so they cannot disagree about what -1 means.
 */
export const REPLIED_INDEX = -1;

export const REPLIED_ACTION: LadderAction = {
  label: "They replied",
  outcome: "replied",
  delay: 0,
};

/** The action an index names, including the reply every rung accepts. */
export function actionAt(
  rung: { actions: LadderAction[] },
  index: number,
): LadderAction | undefined {
  return index === REPLIED_INDEX ? REPLIED_ACTION : rung.actions[index];
}

/**
 * The rung on a ladder whose outcome writes a given activation tick.
 *
 * Looked up rather than written down as a number. "Send the program info" is
 * rung 1 and "Confirm the flyer is circulating" is rung 3 today, and both
 * move the first time somebody inserts a step above them — at which point a
 * hardcoded index does not fail, it quietly starts reading a different rung.
 * The ticks are the ladder's own names for these two moments and they do not
 * move.
 */
export function stepWithTick(section: SectionKey, tick: string): number {
  return LADDERS[section].steps.findIndex((rung) =>
    (rung.actions ?? []).some((a) => (a.ticks ?? []).includes(tick)),
  );
}

/**
 * How far a section's channel has got, read off its records.
 *
 * The advisors dot used to come from campus_channels, which nothing on the
 * Tasks board writes — so a campus whose offices had all been emailed still
 * showed grey. The offices are the truth: one of them sent the program info
 * and the channel is moving; all of them confirmed circulation and it is
 * live.
 *
 * "One is enough" for in-progress is deliberate. Adding a fourth advising
 * office to a campus already in motion must not take the dot backwards.
 */
export function channelFromRecords(
  section: SectionKey,
  records: Array<{ id: string; tasks: Array<{ step: number; done: boolean }> }>,
): "not_yet" | "in_progress" | "live" | null {
  // The sweep is a job about the list, not a member of it.
  const real = records.filter((r) => !r.id.startsWith(SWEEP_PREFIX));
  if (real.length === 0) return null;

  const sent = stepWithTick(section, "flyer_sent");
  const circulating = stepWithTick(section, "confirmed");
  const reached = (r: (typeof real)[number], step: number) =>
    step >= 0 && r.tasks.some((t) => t.step === step && t.done);

  if (circulating >= 0 && real.every((r) => reached(r, circulating))) return "live";
  if (real.some((r) => reached(r, sent))) return "in_progress";
  return "not_yet";
}

/**
 * What the dot should say, given what is stored and what the records show.
 *
 * The records win. Green means every advising office is circulating the
 * flyer, so a campus that gains a new office is no longer green — saying
 * otherwise would be the dot claiming something that has stopped being true.
 * Going backwards is the honest answer there, and it is the only case where
 * it happens: adding an office to a campus that is merely in progress leaves
 * it in progress, because one office is enough for that.
 *
 * The exception is a channel somebody has ruled out. "Not available" and
 * "declined" are decisions about whether this channel applies at all, not
 * measurements of progress through it, and no amount of record activity
 * should overturn one.
 */
const MEASURED = new Set(["not_yet", "in_progress", "live"]);

export function resolveChannel<T extends string>(stored: T | undefined, derived: T): T {
  if (stored && !MEASURED.has(stored)) return stored;
  return derived;
}

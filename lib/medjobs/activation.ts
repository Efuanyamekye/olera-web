/**
 * The Live Win engine for University Activation (ST3-ST7).
 *
 * One pattern serves every activatable object. An object owns an ordered
 * list of criteria; ticking one stamps a timestamp; the status is derived
 * from which are ticked and never chosen by hand. The Consumer Relations
 * Manager records operational facts, and the system decides what they mean.
 *
 * Pure functions only. DB writes happen in the API routes, the same split
 * lib/student-outreach/state-machine.ts uses.
 */

export type Channel = "st3" | "st4" | "st5" | "st6" | "st7";
export type ChannelStatus = "not_yet" | "in_progress" | "live" | "not_available";
export type RecordStatus = "not_yet" | "in_progress" | "live" | "declined";
export type RecordKind = "organization" | "event" | "professor";

/** ALL: every required criterion. ANY: one is enough. */
export type LiveRule = "all" | "any";

export interface Criterion {
  key: string;
  label: string;
  /** Progress criteria move an object out of not_yet without counting
   *  toward Live. Used where contact precedes agreement. */
  progress?: boolean;
  /** On tick, queue this task. The task answers the criterion named in
   *  `answers`, so completing it and ticking the box are one write. */
  hook?: { taskType: TaskType; dueInDays: number; answers: string };
}

export type TaskType =
  | "activation_job_board_check"
  | "activation_listserv_confirm"
  | "activation_listserv_remind"
  | "activation_org_reconnect"
  | "activation_event_review"
  | "activation_event_day"
  | "activation_professor_reengage"
  | "manual_followup";

/** Ticked criteria, keyed by criterion key, valued by ISO timestamp. */
export type CriteriaState = Record<string, string>;

// ── Channel definitions ──────────────────────────────────────────────
// The single home for what each channel is, what makes it Live, and how
// often it is checked afterwards. The UI reads its copy from here, so the
// definition of "activated" cannot drift between screens.

export interface ChannelDef {
  channel: Channel;
  name: string;
  liveWhen: string;
  rule: LiveRule;
  criteria: Criterion[];
  /** List channels hold records; their status rolls up instead. */
  records?: RecordKind;
  /** Months between recurring checks once Live. Null where the cadence
   *  belongs to the records rather than the channel. */
  cadenceMonths: number | null;
  checkTask: TaskType | null;
}

export const CHANNELS: Record<Channel, ChannelDef> = {
  st3: {
    channel: "st3",
    name: "University job board",
    liveWhen: "The posting is submitted, approved, and confirmed visible to students.",
    rule: "all",
    cadenceMonths: 1,
    checkTask: "activation_job_board_check",
    criteria: [
      { key: "submitted", label: "Posting submitted" },
      { key: "approved", label: "Posting approved" },
      { key: "visible", label: "Confirmed visible to students" },
    ],
  },
  st4: {
    channel: "st4",
    name: "Advisor listserv",
    liveWhen: "The advisor has agreed to send the flyer to their listserv.",
    rule: "all",
    cadenceMonths: 1,
    checkTask: "activation_listserv_remind",
    criteria: [
      {
        key: "flyer_sent",
        label: "Advisor sent the current flyer",
        hook: {
          taskType: "activation_listserv_confirm",
          dueInDays: 7,
          answers: "agreed",
        },
      },
      { key: "agreed", label: "Advisor agreed to distribute it" },
      { key: "confirmed", label: "Distribution confirmed" },
    ],
  },
  st5: {
    channel: "st5",
    name: "Student organizations",
    liveWhen: "At least one organization is activated.",
    rule: "any",
    records: "organization",
    cadenceMonths: null,
    checkTask: null,
    criteria: [],
  },
  st6: {
    channel: "st6",
    name: "Campus events",
    liveWhen: "At least one event or webinar is activated.",
    rule: "any",
    records: "event",
    cadenceMonths: 6,
    checkTask: "activation_event_review",
    criteria: [],
  },
  st7: {
    channel: "st7",
    name: "Professors / class outreach",
    liveWhen: "Approval obtained, and at least one professor has agreed.",
    rule: "any",
    records: "professor",
    cadenceMonths: null,
    checkTask: null,
    criteria: [
      { key: "pathway", label: "Approval pathway identified" },
      { key: "approved", label: "Approval obtained" },
    ],
  },
};

/** Order the drawer renders them in. */
export const CHANNEL_ORDER: Channel[] = ["st3", "st4", "st5", "st6", "st7"];

// ── Record definitions ───────────────────────────────────────────────

export interface RecordDef {
  kind: RecordKind;
  liveWhen: string;
  rule: LiveRule;
  criteria: Criterion[];
  cadenceMonths: number | null;
  checkTask: TaskType | null;
}

export const RECORDS: Record<RecordKind, RecordDef> = {
  organization: {
    kind: "organization",
    liveWhen: "Leadership agreed to any one of these.",
    rule: "any",
    cadenceMonths: 1,
    checkTask: "activation_org_reconnect",
    criteria: [
      { key: "group_chat", label: "Share the flyer in a group chat or membership channel" },
      { key: "email_members", label: "Email the opportunity to members" },
      { key: "presentation", label: "Host or arrange an Olera presentation" },
    ],
  },
  event: {
    kind: "event",
    liveWhen: "All five are true.",
    rule: "all",
    cadenceMonths: null,
    checkTask: "activation_event_day",
    criteria: [
      { key: "leader", label: "Event leader identified" },
      { key: "host_approval", label: "Host approval obtained" },
      { key: "scheduled", label: "Date scheduled" },
      { key: "presenter", label: "Presenter assigned" },
      { key: "collateral", label: "Collateral ready" },
    ],
  },
  professor: {
    kind: "professor",
    liveWhen: "The professor agreed to any one of these.",
    rule: "any",
    // Seasonal: four touches a year.
    cadenceMonths: 3,
    checkTask: "activation_professor_reengage",
    criteria: [
      { key: "outreach_sent", label: "Outreach sent", progress: true },
      { key: "distribute", label: "Distribute the opportunity to students" },
      { key: "class_visit", label: "Allow a brief class visit or presentation" },
    ],
  },
};

// ── Status derivation ────────────────────────────────────────────────

/**
 * The whole state machine, in one function. Nothing else decides a status.
 *
 * A manually set `not_available` (channel) or `declined` (record) wins over
 * the criteria: it is the one state a person chooses, and it means "stop
 * asking", which no amount of ticked boxes should override.
 */
export function deriveStatus(
  criteria: CriteriaState,
  def: { rule: LiveRule; criteria: Criterion[] },
  manual?: "not_available" | "declined" | null,
): ChannelStatus | RecordStatus {
  if (manual) return manual;

  const required = def.criteria.filter((c) => !c.progress);
  const ticked = (c: Criterion) => Boolean(criteria[c.key]);
  const anyTicked = def.criteria.some(ticked);

  if (!anyTicked) return "not_yet";

  const live =
    required.length > 0 &&
    (def.rule === "all" ? required.every(ticked) : required.some(ticked));

  return live ? "live" : "in_progress";
}

/**
 * Roll a list channel up from its records.
 *
 * ANY, not ALL: a channel goes Live on its first live record and stays
 * there. Under an ALL rule, adding a sixth organization to a live channel
 * would demote it and revoke a success the manager already saw, which
 * punishes exactly the behaviour we want. Declined records sit out the
 * rollup entirely rather than blocking it forever.
 */
export function rollUp(
  records: Array<{ status: RecordStatus }>,
  manual?: "not_available" | null,
  /** ST7 cannot be live before approval, whatever its records say. */
  gateOpen = true,
): ChannelStatus {
  if (manual) return manual;
  const live = records.filter((r) => r.status === "live");
  const open = records.filter((r) => r.status !== "declined");
  if (open.length === 0) return "not_yet";
  if (live.length > 0 && gateOpen) return "live";
  return "in_progress";
}

// ── Effects ──────────────────────────────────────────────────────────

export interface TaskToCreate {
  task_type: TaskType;
  due_at: Date;
  channel: Channel;
  record_id?: string;
  answers_criterion?: string;
  repeat_months?: number;
}

const DAY_MS = 86_400_000;

/** Fixed calendar anchors for the cadences universities actually run on. */
export function nextSemesterAnchor(from: Date): Date {
  const y = from.getUTCFullYear();
  const anchors = [
    Date.UTC(y, 0, 8),  // early January
    Date.UTC(y, 8, 8),  // early September
    Date.UTC(y + 1, 0, 8),
  ];
  const next = anchors.find((a) => a > from.getTime());
  return new Date(next ?? anchors[anchors.length - 1]);
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** The recurring check an object earns by going Live. */
export function onLiveWin(
  channel: Channel,
  def: { cadenceMonths: number | null; checkTask: TaskType | null },
  now: Date,
  recordId?: string,
): TaskToCreate | null {
  if (!def.checkTask || def.cadenceMonths === null) return null;
  const due =
    def.cadenceMonths === 6 ? nextSemesterAnchor(now) : addMonths(now, def.cadenceMonths);
  return {
    task_type: def.checkTask,
    due_at: due,
    channel,
    record_id: recordId,
    repeat_months: def.cadenceMonths,
  };
}

/** The short-fuse follow-up a hook criterion earns when ticked. */
export function onHookTick(
  criterion: Criterion,
  channel: Channel,
  now: Date,
  recordId?: string,
): TaskToCreate | null {
  if (!criterion.hook) return null;
  return {
    task_type: criterion.hook.taskType,
    due_at: new Date(now.getTime() + criterion.hook.dueInDays * DAY_MS),
    channel,
    record_id: recordId,
    answers_criterion: criterion.hook.answers,
  };
}

/** Completing a recurring check earns the next one. One-shots earn nothing. */
export function onTaskComplete(
  task: { task_type: TaskType; channel: Channel; record_id?: string | null; repeat_months?: number | null },
  now: Date,
): TaskToCreate | null {
  if (!task.repeat_months) return null;
  const due =
    task.repeat_months === 6 ? nextSemesterAnchor(now) : addMonths(now, task.repeat_months);
  return {
    task_type: task.task_type,
    due_at: due,
    channel: task.channel,
    record_id: task.record_id ?? undefined,
    repeat_months: task.repeat_months,
  };
}

/** Due today or earlier. Drives every red dot in the workspace. */
export function isDue(dueAt: string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() <= now.getTime();
}

/**
 * The check a channel earns the first time anyone touches it.
 *
 * Campus events is the case this exists for. Its rhythm is a semester
 * sweep of what is worth attending, which is work that has to happen
 * before anything is scheduled, not after. Waiting for the channel to go
 * live would mean a university nobody had looked at never prompted anyone.
 */
export function onChannelFirstTouch(channel: Channel, now: Date): TaskToCreate | null {
  const def = CHANNELS[channel];
  if (channel !== "st6" || !def.checkTask || def.cadenceMonths === null) return null;
  return {
    task_type: def.checkTask,
    due_at: nextSemesterAnchor(now),
    channel,
    repeat_months: def.cadenceMonths,
  };
}
